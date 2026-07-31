const path = require('path');
const { query } = require(path.resolve(__dirname, '..', 'database', 'postgresClient'));

(async () => {
  try {
    const res = await query('SELECT * FROM product_images LIMIT 10');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message || e);
  } finally {
    process.exit();
  }
})();
