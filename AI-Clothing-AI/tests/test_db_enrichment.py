import unittest
from sqlalchemy import create_engine, text

from app import db


class DbEnrichmentTests(unittest.TestCase):
    def test_enriches_recommendations_when_products_use_id_column(self):
        engine = create_engine('sqlite:///:memory:')
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, price REAL)'))
            conn.execute(text("INSERT INTO products (id, name, price) VALUES (:id, :name, :price)"), {
                'id': 'c08d6aaa-f6fc-437f-883d-7399c4af9105',
                'name': 'Test Product',
                'price': 1299.0,
            })

        original_engine = db.engine
        db.engine = engine
        try:
            recommendations = db.enrich_recommendations_with_db([
                {'product_id': 'c08d6aaa-f6fc-437f-883d-7399c4af9105', 'title': 'AI Match'}
            ])
        finally:
            db.engine = original_engine

        self.assertEqual(len(recommendations), 1)
        self.assertEqual(recommendations[0]['name'], 'Test Product')
        self.assertEqual(recommendations[0]['price'], 1299.0)


if __name__ == '__main__':
    unittest.main()
