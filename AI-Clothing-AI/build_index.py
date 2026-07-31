from pathlib import Path
import pickle

import faiss
import numpy as np
import pandas as pd
from PIL import Image
import torch
import open_clip

BASE_DIRECTORY = Path(__file__).resolve().parent
ARTIFACT_DIRECTORY = BASE_DIRECTORY / "artifacts"
ARTIFACT_DIRECTORY.mkdir(parents=True, exist_ok=True)

MODEL_NAME = "ViT-B-32"
PRETRAINED = "laion2b_s34b_b79k"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BATCH_SIZE = 64
TOP_K = 8

catalog_path = BASE_DIRECTORY / "db_catalog.json"
if not catalog_path.exists():
    raise FileNotFoundError("db_catalog.json not found. Add your product catalog JSON first.")

catalog = pd.read_json(catalog_path)
if catalog.empty:
    raise ValueError("Catalog is empty")

if "image_path" not in catalog.columns:
    raise ValueError("Catalog must include an image_path column")

model, _, preprocess = open_clip.create_model_and_transforms(MODEL_NAME, pretrained=PRETRAINED, device=DEVICE)
model.eval()

embeddings = []
valid_positions = []
for start in range(0, len(catalog), BATCH_SIZE):
    batch = catalog.iloc[start:start + BATCH_SIZE]
    processed = []
    batch_positions = []
    for position, product in batch.iterrows():
        try:
            image_path = product["image_path"]
            if not image_path:
                continue
            with Image.open(image_path) as image:
                processed.append(preprocess(image.convert("RGB")))
            batch_positions.append(position)
        except Exception as exc:
            print(f"Skipping {product.get('product_id', position)}: {exc}")
    if not processed:
        continue
    tensor = torch.stack(processed).to(DEVICE)
    with torch.inference_mode():
        embedding = model.encode_image(tensor)
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)
    embeddings.append(embedding.float().cpu().numpy())
    valid_positions.extend(batch_positions)

if not embeddings:
    raise RuntimeError("No catalog images could be encoded")

embedding_matrix = np.ascontiguousarray(np.vstack(embeddings), dtype="float32")
catalog = catalog.loc[valid_positions].reset_index(drop=True)

index = faiss.IndexHNSWFlat(embedding_matrix.shape[1], 32, faiss.METRIC_INNER_PRODUCT)
index.hnsw.efConstruction = 200
index.hnsw.efSearch = 96
index.add(embedding_matrix)

faiss.write_index(index, str(ARTIFACT_DIRECTORY / "fashion_products.faiss"))
catalog.to_pickle(str(ARTIFACT_DIRECTORY / "fashion_catalog.pkl"))
np.save(str(ARTIFACT_DIRECTORY / "fashion_embeddings.npy"), embedding_matrix)

metrics = [{"metric": "Index built", "score": 1.0, "percentage": "100.00%"}]
with (ARTIFACT_DIRECTORY / "retrieval_metrics.json").open("w", encoding="utf-8") as handle:
    import json
    json.dump(metrics, handle, indent=2)

print(f"Built index with {len(catalog)} products")
