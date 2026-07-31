This project uses an AI tagging workflow (Gemini) and stores canonical tags in the database.

Setup
1. Copy `.env.example` to `.env` and set your `GEMINI_API_KEY`.

2. Create the `tags` and `product_tags` tables in your Postgres database by running the provided SQL migration from the `migrations/` folder:

```bash
# from back_end/seller_backend
psql -d your_database -f migrations/001_create_tags_and_product_tags.sql
```

3. Restart the seller backend server. (The code will also attempt to create companion tables automatically at runtime.)

How it works
- When a seller creates/updates a product, the server calls Gemini to generate 10–20 canonical tags.
- Tags are normalized (singularized where appropriate) and deduplicated.
- Canonical tags are upserted into `public.tags`, and product associations are recorded in `public.product_tags`.

Security
- Do NOT commit your real `.env` file with secrets to version control. Use `.env.example` as the template.
