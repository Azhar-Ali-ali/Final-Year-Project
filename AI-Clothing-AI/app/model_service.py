from io import BytesIO
from pathlib import Path
import os

import numpy as np
import torch
from PIL import Image

BASE_DIRECTORY = Path(__file__).resolve().parent.parent
ARTIFACT_DIRECTORY = BASE_DIRECTORY / "artifacts"


def _build_mock_catalog():
    import pandas as pd

    demo_images = list((BASE_DIRECTORY / "product_images").glob("**/*.*")) if (BASE_DIRECTORY / "product_images").exists() else []
    if demo_images:
        rows = []
        for i, p in enumerate(demo_images[:20]):
            rows.append({
                "product_id": f"MOCK-{i}",
                "title": f"Mock Product {i}",
                "product_type": "MockType",
                "color": "N/A",
                "gender": "Unisex",
                "price": 0.0,
                "image_url": str(p.as_posix()),
                "product_url": "#",
            })
        return pd.DataFrame(rows)

    test_path = BASE_DIRECTORY.parent / "AI-Clothing-AI" / "testimage.jpg"
    return pd.DataFrame([
        {
            "product_id": "MOCK-0",
            "title": "Demo Shirt",
            "product_type": "Shirt",
            "color": "Blue",
            "gender": "Men",
            "price": 999.0,
            "image_url": str(test_path.as_posix()) if test_path.exists() else "",
            "product_url": "#",
        }
    ])


def _mock_recommendations(image_bytes: bytes, top_k: int = 8):
    import pandas as pd

    catalog = _build_mock_catalog()
    similarities = np.linspace(0.9, 0.5, num=min(len(catalog), top_k))
    recommendations = []
    for i, sim in enumerate(similarities):
        product = catalog.iloc[i]
        recommendations.append({
            "product_id": str(product["product_id"]),
            "title": str(product.get("title", "")),
            "product_type": str(product.get("product_type", "")),
            "color": str(product.get("color", "")),
            "gender": str(product.get("gender", "")),
            "price": float(product.get("price", 0.0)),
            "image_url": str(product.get("image_url", "")),
            "product_url": str(product.get("product_url", "")),
            "similarity_percentage": round(float(sim) * 100.0, 2),
        })
    return recommendations


REAL_MODEL_AVAILABLE = False
model = None
preprocess = None
index = None
catalog = None
DEVICE = "cpu"
MODEL_NAME = "ViT-B-32"
PRETRAINED = "laion2b_s34b_b79k"


def _initialize_retrieval_backend():
    global REAL_MODEL_AVAILABLE, model, preprocess, index, catalog, DEVICE

    if REAL_MODEL_AVAILABLE:
        return

    try:
        import faiss
        import open_clip
        import pandas as pd
        import torch

        DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

        def _load_model():
            loaded_model, _, loaded_preprocess = open_clip.create_model_and_transforms(
                MODEL_NAME,
                pretrained=PRETRAINED,
                device=DEVICE
            )
            loaded_model.eval()
            return loaded_model, loaded_preprocess

        model, preprocess = _load_model()

        def _load_index_and_catalog():
            index_path = ARTIFACT_DIRECTORY / "fashion_products.faiss"
            catalog_path = ARTIFACT_DIRECTORY / "fashion_catalog.pkl"

            if not index_path.exists() or not catalog_path.exists():
                raise RuntimeError("Artifacts not found. Run the index builder first.")

            loaded_index = faiss.read_index(str(index_path))
            loaded_catalog = pd.read_pickle(catalog_path)
            if isinstance(loaded_catalog, list):
                loaded_catalog = pd.DataFrame(loaded_catalog)
            return loaded_index, loaded_catalog

        index, catalog = _load_index_and_catalog()
        REAL_MODEL_AVAILABLE = True
    except Exception as exc:
        REAL_MODEL_AVAILABLE = False
        print(f"Visual search falling back to mock recommendations: {exc}")


def encode_image(image: Image.Image):
    _initialize_retrieval_backend()
    if not REAL_MODEL_AVAILABLE:
        raise RuntimeError("Real model is not available")

    tensor = preprocess(image.convert("RGB")).unsqueeze(0).to(DEVICE)

    with torch.inference_mode():
        if DEVICE == "cuda":
            with torch.autocast(device_type="cuda"):
                embedding = model.encode_image(tensor)
        else:
            embedding = model.encode_image(tensor)
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)

    return np.ascontiguousarray(
        embedding.float().cpu().numpy(),
        dtype="float32"
    )


def find_similar_products(image_bytes: bytes, top_k: int = 8):
    _initialize_retrieval_backend()
    if not REAL_MODEL_AVAILABLE:
        return _mock_recommendations(image_bytes, top_k)

    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    query_embedding = encode_image(image)

    scores, positions = index.search(query_embedding, top_k)

    recommendations = []

    for score, position in zip(scores[0], positions[0]):
        if position < 0:
            continue

        product = catalog.iloc[int(position)]

        similarity_percentage = float(np.clip(score * 100, 0, 100))

        recommendations.append({
            "product_id": str(product["product_id"]),
            "title": str(product.get("title", "")),
            "product_type": str(product.get("product_type", "")),
            "color": str(product.get("color", "")),
            "gender": str(product.get("gender", "")),
            "price": float(product.get("price", 0.0)),
            "image_url": str(product.get("image_url", "")),
            "product_url": str(product.get("product_url", "")),
            "similarity_percentage": round(similarity_percentage, 2),
        })

    return recommendations
