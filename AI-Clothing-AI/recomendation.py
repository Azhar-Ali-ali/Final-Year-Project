"""No-token Google Colab fashion visual-search recommender.

Downloads a public real-color fashion product dataset from Hugging Face,
builds a CLIP + FAISS catalog, asks for one query image, and displays matches
with a percentage score for every recommended product.
No CSV, ZIP upload, Kaggle account, or API token is required.
"""

# =========================== 1. INSTALL =====================================
import subprocess
import sys

subprocess.check_call([
    sys.executable, "-m", "pip", "install", "-q",
    "open-clip-torch", "faiss-cpu", "huggingface-hub",
    "pandas", "pillow", "tqdm", "matplotlib"
])

# ============================ 2. IMPORTS ====================================
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import faiss
import matplotlib.pyplot as plt
import numpy as np
import open_clip
import pandas as pd
import torch
from huggingface_hub import hf_hub_download
from IPython.display import display
from PIL import Image
from tqdm.auto import tqdm

# ========================== 3. SETTINGS =====================================
HF_DATASET = "eileennoonan/paramaggarwal-kaggle-fashion-product-images-small"
MAX_PRODUCTS = 5000       # Try 10,000 after the first successful run.
BATCH_SIZE = 128          # Reduce to 64 if GPU memory is insufficient.
TOP_K = 8
FILTER_SAME_PRODUCT_TYPE = True
RANDOM_SEED = 42
EVALUATION_QUERIES = 500

MODEL_NAME = "ViT-B-32"
PRETRAINED = "laion2b_s34b_b79k"
DATA_DIRECTORY = Path("/content/fashion_catalog")

# ======================== 4. DOWNLOAD DATASET ===============================
DATA_DIRECTORY.mkdir(parents=True, exist_ok=True)

print("Downloading the public fashion dataset from Hugging Face...")
archive_path = hf_hub_download(
    repo_id=HF_DATASET,
    filename="archive.zip",
    repo_type="dataset"
)

extraction_marker = DATA_DIRECTORY / ".extracted"
if not extraction_marker.exists():
    print("Extracting the dataset (this happens once per Colab runtime)...")
    with ZipFile(archive_path) as archive:
        archive.extractall(DATA_DIRECTORY)
    extraction_marker.touch()

csv_candidates = list(DATA_DIRECTORY.rglob("styles.csv"))
if not csv_candidates:
    raise FileNotFoundError("styles.csv was not found after extracting the dataset.")

styles_path = csv_candidates[0]
image_files = list(DATA_DIRECTORY.rglob("*.jpg"))
image_files += list(DATA_DIRECTORY.rglob("*.jpeg"))
image_files += list(DATA_DIRECTORY.rglob("*.png"))

if not image_files:
    raise FileNotFoundError("No product images were found after extraction.")

image_by_id = {path.stem: path for path in image_files}
print(f"Found {len(image_by_id):,} real product images.")

# ========================= 5. CREATE CATALOG ================================
styles = pd.read_csv(styles_path, on_bad_lines="skip").fillna("")
if "id" not in styles.columns:
    raise ValueError("The dataset metadata does not contain an id column.")

styles["product_id"] = (
    styles["id"].astype(str).str.replace(r"\.0$", "", regex=True)
)
styles = styles[styles["product_id"].isin(image_by_id)].copy()
styles["image_path"] = styles["product_id"].map(
    lambda product_id: str(image_by_id[product_id])
)

if len(styles) > MAX_PRODUCTS:
    styles = styles.sample(MAX_PRODUCTS, random_state=RANDOM_SEED)

styles = styles.reset_index(drop=True)

def metadata_value(row, column, fallback="Unknown"):
    value = str(row.get(column, "")).strip()
    return value if value else fallback


catalog_rows = []
for _, row in styles.iterrows():
    catalog_rows.append({
        "product_id": str(row["product_id"]),
        "image_path": row["image_path"],
        "title": metadata_value(row, "productDisplayName", f"Product {row['product_id']}"),
        "product_type": metadata_value(row, "articleType"),
        "category": metadata_value(row, "masterCategory"),
        "subcategory": metadata_value(row, "subCategory"),
        "color": metadata_value(row, "baseColour"),
        "gender": metadata_value(row, "gender"),
    })

catalog = pd.DataFrame(catalog_rows)
print(f"Using {len(catalog):,} catalog products.")
display(catalog.head(10))

# ============================ 6. LOAD CLIP ==================================
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print("Running on:", DEVICE)
if DEVICE == "cpu":
    print("For faster indexing select: Runtime > Change runtime type > T4 GPU")

model, _, preprocess = open_clip.create_model_and_transforms(
    MODEL_NAME,
    pretrained=PRETRAINED,
    device=DEVICE
)
model.eval()

# ====================== 7. CREATE CATALOG EMBEDDINGS ========================
all_embeddings = []
valid_catalog_positions = []

for start in tqdm(range(0, len(catalog), BATCH_SIZE), desc="Encoding products"):
    batch = catalog.iloc[start:start + BATCH_SIZE]
    processed_images = []
    batch_positions = []

    for position, product in batch.iterrows():
        try:
            with Image.open(product["image_path"]) as image:
                processed_images.append(preprocess(image.convert("RGB")))
            batch_positions.append(position)
        except Exception as error:
            print(f"Skipping {product['product_id']}: {error}")

    if not processed_images:
        continue

    image_tensor = torch.stack(processed_images).to(DEVICE)
    with torch.inference_mode():
        if DEVICE == "cuda":
            with torch.autocast(device_type="cuda"):
                embeddings = model.encode_image(image_tensor)
        else:
            embeddings = model.encode_image(image_tensor)
        embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)

    all_embeddings.append(embeddings.float().cpu().numpy())
    valid_catalog_positions.extend(batch_positions)

    del image_tensor, embeddings
    if DEVICE == "cuda":
        torch.cuda.empty_cache()

if not all_embeddings:
    raise RuntimeError("No catalog images could be encoded.")

embedding_matrix = np.ascontiguousarray(
    np.vstack(all_embeddings),
    dtype="float32"
)
catalog = catalog.loc[valid_catalog_positions].reset_index(drop=True)

print(f"Successfully encoded {len(catalog):,} real-color products.")

# ========================== 8. CREATE FAISS INDEX ===========================
index = faiss.IndexHNSWFlat(
    embedding_matrix.shape[1],
    32,
    faiss.METRIC_INNER_PRODUCT
)
index.hnsw.efConstruction = 200
index.hnsw.efSearch = 96
index.add(embedding_matrix)

faiss.write_index(index, "/content/fashion_products.faiss")
catalog.to_pickle("/content/fashion_catalog.pkl")
np.save("/content/fashion_embeddings.npy", embedding_matrix)
print(f"FAISS indexed {index.ntotal:,} products.")

# ======================= 9. MEASURE RETRIEVAL ACCURACY ======================
def evaluate_retrieval(k=TOP_K, number_of_queries=EVALUATION_QUERIES):
    """Evaluate unfiltered neighbors using known product-type labels."""
    rng = np.random.default_rng(RANDOM_SEED)
    number_of_queries = min(number_of_queries, len(catalog))
    query_positions = rng.choice(len(catalog), size=number_of_queries, replace=False)

    top1_scores = []
    precision_scores = []
    hit_scores = []

    for source_position in tqdm(query_positions, desc="Measuring accuracy"):
        source_type = catalog.iloc[source_position]["product_type"]
        query_vector = embedding_matrix[source_position].reshape(1, -1)
        _, neighbor_positions = index.search(query_vector, k + 20)
        neighbors = [
            int(position) for position in neighbor_positions[0]
            if position >= 0 and position != source_position
        ][:k]
        relevance = np.array([
            catalog.iloc[position]["product_type"] == source_type
            for position in neighbors
        ], dtype=np.float32)

        top1_scores.append(float(len(relevance) > 0 and relevance[0] == 1))
        precision_scores.append(float(relevance.mean()) if len(relevance) else 0.0)
        hit_scores.append(float(relevance.sum() > 0))

    evaluation = pd.DataFrame({
        "metric": [
            "Top-1 product-type accuracy",
            f"Precision@{k}",
            f"Hit Rate@{k}",
        ],
        "score": [
            np.mean(top1_scores),
            np.mean(precision_scores),
            np.mean(hit_scores),
        ],
    })
    evaluation["percentage"] = evaluation["score"].map(
        lambda score: f"{score * 100:.2f}%"
    )
    return evaluation


accuracy_results = evaluate_retrieval()
print("\nCatalog retrieval evaluation before product-type filtering:")
display(accuracy_results)

# ======================== 10. QUERY IMAGE SEARCH ============================
def encode_query_image(query_image):
    tensor = preprocess(query_image.convert("RGB")).unsqueeze(0).to(DEVICE)
    with torch.inference_mode():
        if DEVICE == "cuda":
            with torch.autocast(device_type="cuda"):
                vector = model.encode_image(tensor)
        else:
            vector = model.encode_image(tensor)
        vector = vector / vector.norm(dim=-1, keepdim=True)
    return np.ascontiguousarray(vector.float().cpu().numpy(), dtype="float32")


def recommend(query_image, top_k=TOP_K):
    query_vector = encode_query_image(query_image)
    candidate_count = min(index.ntotal, max(top_k * 40, 400))
    scores, positions = index.search(query_vector, candidate_count)

    candidates = [
        (int(position), float(score))
        for score, position in zip(scores[0], positions[0])
        if position >= 0
    ]

    # The closest result predicts the query product type. Filtering prevents,
    # for example, a black shoe from being returned for a black shirt.
    predicted_type = catalog.iloc[candidates[0][0]]["product_type"]
    if FILTER_SAME_PRODUCT_TYPE:
        candidates = [
            item for item in candidates
            if catalog.iloc[item[0]]["product_type"] == predicted_type
        ]

    selected = candidates[:top_k]
    results = catalog.iloc[[position for position, _ in selected]].copy()
    results["similarity"] = [score for _, score in selected]
    # CLIP returns cosine similarity as a decimal score. Convert it to a
    # user-friendly 0-100 match percentage for display. This is a similarity
    # score for this particular result, not ground-truth model accuracy.
    results["accuracy_percentage"] = np.clip(
        results["similarity"] * 100.0, 0.0, 100.0
    )
    results["accuracy"] = results["accuracy_percentage"].map(
        lambda percentage: f"{percentage:.2f}%"
    )
    return predicted_type, results


# ======================== 11. UPLOAD USER IMAGE =============================
from google.colab import files

print("Upload one fashion-product image: JPG, JPEG, PNG, or WEBP")
uploaded = files.upload()
supported = [
    (name, content) for name, content in uploaded.items()
    if name.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
]
if not supported:
    raise ValueError("No supported image was uploaded.")

query_filename, query_bytes = supported[0]
query_image = Image.open(BytesIO(query_bytes)).convert("RGB")
predicted_type, recommendations = recommend(query_image)

print(f"Uploaded image: {query_filename}")
print(f"Predicted product type: {predicted_type}")
print(
    "Best result accuracy (similarity): "
    f"{recommendations.iloc[0]['accuracy_percentage']:.2f}%"
)
recommendation_table = recommendations[
    [
        "product_id", "title", "product_type", "color", "gender",
        "accuracy"
    ]
].rename(columns={
    "product_id": "Product ID",
    "title": "Title",
    "product_type": "Product Type",
    "color": "Color",
    "gender": "Gender",
    "accuracy": "Accuracy",
})
display(recommendation_table)

print("\nModel accuracy measured on labelled catalogue test queries:")
display(accuracy_results)

# ======================== 12. DISPLAY RESULTS ===============================
total = len(recommendations) + 1
columns = 3
rows = int(np.ceil(total / columns))
figure, axes = plt.subplots(rows, columns, figsize=(12, 5 * rows))
axes = np.array(axes, dtype=object).reshape(-1)

axes[0].imshow(query_image)
axes[0].set_title("UPLOADED QUERY IMAGE")
axes[0].axis("off")

for axis, (_, product) in zip(axes[1:], recommendations.iterrows()):
    with Image.open(product["image_path"]) as image:
        axis.imshow(image.convert("RGB"))
    axis.set_title(
        f"Accuracy: {product['accuracy_percentage']:.2f}%\n"
        f"{product['product_type']} | {product['color']}\n"
        f"{product['title']}"
    )
    axis.axis("off")

for axis in axes[total:]:
    axis.axis("off")

plt.tight_layout()
plt.show()