import os
from typing import List, Dict

from sqlalchemy import create_engine, inspect, text

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL) if DATABASE_URL else None


def _resolve_product_id_column(conn) -> str | None:
    """Return the first matching product-id column from the products table."""
    try:
        inspector = inspect(conn)
        columns = inspector.get_columns("products")
        existing_columns = {str(column["name"]).lower() for column in columns}
    except Exception:
        existing_columns = set()

    for candidate in ("product_id", "id", "productid", "sku", "code", "pid"):
        if candidate in existing_columns:
            return candidate
    return None


def enrich_recommendations_with_db(recommendations: List[Dict]) -> List[Dict]:
    """Merge AI recommendations with rows from the products table without changing
    the website's existing database schema or ID type.
    """
    if engine is None or not recommendations:
        return recommendations

    normalized_ids = []
    for rec in recommendations:
        product_id = rec.get("product_id") or rec.get("id") or rec.get("productId")
        if product_id is None:
            continue
        normalized_ids.append(str(product_id))

    if not normalized_ids:
        return recommendations

    try:
        with engine.connect() as conn:
            id_column = _resolve_product_id_column(conn)
            if not id_column:
                return recommendations

            placeholders = ",".join([f":id{i}" for i in range(len(normalized_ids))])
            sql = text(f"SELECT * FROM products WHERE CAST({id_column} AS TEXT) IN ({placeholders})")
            params = {f"id{i}": normalized_ids[i] for i in range(len(normalized_ids))}
            rows = conn.execute(sql, params).fetchall()
    except Exception:
        return recommendations

    db_map = {}
    for row in rows:
        row_mapping = row._mapping if hasattr(row, "_mapping") else None
        if row_mapping is not None:
            key = str(row_mapping.get(id_column, ""))
            if key:
                db_map[key] = dict(row_mapping)
        else:
            key = str(row[id_column]) if isinstance(row, tuple) is False else ""
            if key:
                db_map[key] = dict(row)

    enriched = []
    for rec in recommendations:
        pid = str(rec.get("product_id") or rec.get("id") or rec.get("productId") or "")
        db_row = db_map.get(pid)
        if db_row:
            merged = {**db_row, **rec}
            enriched.append(merged)
        else:
            enriched.append(rec)

    return enriched
