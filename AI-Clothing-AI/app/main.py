import json
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import UnidentifiedImageError

from app.model_service import find_similar_products
from app.db import enrich_recommendations_with_db

app = FastAPI(title="StyleMatch Visual Search API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024


@app.get("/api/health")
def health():
    return {"status": "working"}


@app.post("/api/visual-search")
async def visual_search(image: UploadFile = File(...), top_k: int = 8):
    if image.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPG, PNG and WEBP images are supported.")

    if top_k < 1 or top_k > 20:
        raise HTTPException(status_code=400, detail="top_k must be between 1 and 20.")

    image_bytes = await image.read(MAX_FILE_SIZE + 1)
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Image must be smaller than 5 MB.")

    try:
        recommendations = find_similar_products(image_bytes, top_k)
        # Optionally enrich results from a products database. Set
        # `DATABASE_URL` environment variable (e.g. sqlite:///./products.db)
        # to enable merging of additional product fields from a `products`
        # table that has a `product_id` column.
        recommendations = enrich_recommendations_with_db(recommendations)
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid image.")

    return {
        "uploaded_filename": image.filename,
        "number_of_results": len(recommendations),
        "recommendations": recommendations,
    }


@app.get("/api/model-accuracy")
def model_accuracy():
    metrics_path = Path("artifacts/retrieval_metrics.json")

    if not metrics_path.exists():
        raise HTTPException(status_code=404, detail="Model evaluation is unavailable.")

    with metrics_path.open("r", encoding="utf-8") as file:
        return json.load(file)
