# AI Clothing Visual Search (StyleMatch)

Quick guide to run the visual-search backend and link it with your website and product database.

1) Create a Python environment and install dependencies

```bash
python -m venv .venv
.venv\Scripts\activate    # Windows
pip install -r requirements.txt
```

2) Build the index (admin/maintainer)

```bash
python build_index.py
```

This creates `artifacts/fashion_products.faiss`, `artifacts/fashion_catalog.pkl`, and `artifacts/retrieval_metrics.json`.

3) Start the FastAPI service

```bash
set DATABASE_URL=sqlite:///./products.db    # optional: set your DB URL
uvicorn app.main:app --reload --port 8000
```

4) Connect your website

- Send `POST` multipart-form to `/api/visual-search` with `image` file field.
- Example fetch from frontend (already present in earlier instructions) will work without changing your customer page.
- The API returns `product_id` as a string; those IDs are compatible with integer or UUID DB keys because they are returned as strings. If you store product IDs as integers in your DB, ensure the DB `product_id` column stores string-compatible values as well or adapt the `products` table to store strings.

5) Optional DB enrichment

If you set `DATABASE_URL`, the API will try to enrich recommendation rows by querying a `products` table using the `product_id` column. The enrichment is best-effort and non-fatal if the DB is unavailable.

6) Notes

- Do not change your customer page JS. The service returns the same response shape used previously (`product_id`, `image_url`, `product_url`, `title`, `price`, `similarity_percentage`).
- When rebuilding the index after product changes, run `python build_index.py` and restart the backend.
