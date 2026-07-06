const { query } = require('../../database/postgresClient');
(async () => {
  try {
    // Create test seller
    const sellerRes = await query("INSERT INTO users (full_name, email, password_hash, role, status, created_at, updated_at) VALUES ('Test Seller','test_seller@local', 'pass', 'seller', 'active', NOW(), NOW()) RETURNING id");
    const sellerId = sellerRes.rows[0].id;

    // Create test customer
    const customerRes = await query("INSERT INTO users (full_name, email, password_hash, role, status, created_at, updated_at) VALUES ('Test Customer','test_customer@local', 'pass', 'customer', 'active', NOW(), NOW()) RETURNING id");
    const customerId = customerRes.rows[0].id;

    // Create brand
    const brandRes = await query("INSERT INTO brands (name, slug) VALUES ('test-brand', 'test-brand') RETURNING id");
    const brandId = brandRes.rows[0].id;

    // Create category
    const categoryRes = await query("INSERT INTO categories (name, slug) VALUES ('test-cat', 'test-cat') RETURNING id");
    const categoryId = categoryRes.rows[0].id;

    // Create product
    const prodRes = await query(
      `INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'Test Product 1', 'test-product-1', 'A product for automated tests', 100, 'active', NOW(), NOW())
       RETURNING id, slug`,
      [sellerId, categoryId, brandId]
    );

    console.log(JSON.stringify({ sellerId, customerId, brandId, categoryId, product: prodRes.rows[0] }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e.stack || e.message);
    process.exit(1);
  }
})();
