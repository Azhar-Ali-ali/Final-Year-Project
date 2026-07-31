const path = require('path');
const fs = require('fs');
const { query } = require(path.resolve(__dirname, '..', 'database', 'postgresClient'));

(async () => {
  try {
    const sql = `SELECT p.id as product_id, p.name as title, pi.image_url
                 FROM products p
                 JOIN product_images pi ON p.id = pi.product_id
                 WHERE pi.is_primary = true`;
    const res = await query(sql);
    const rows = res.rows || [];
    const outPath = path.resolve(__dirname, '..', '..', 'AI-Clothing-AI', 'db_catalog.json');
    fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf8');
    console.log('Wrote', rows.length, 'rows to', outPath);
  } catch (e) {
    console.error('ERROR:', e.message || e);
    process.exit(1);
  }
  process.exit(0);
})();
