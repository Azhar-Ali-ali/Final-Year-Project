const path = require('path');
const { query } = require(path.resolve(__dirname, '..', 'database', 'postgresClient'));

(async () => {
  try {
    const res = await query("SELECT column_name FROM information_schema.columns WHERE table_name='products'");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message || e);
  } finally {
    process.exit();
  }
})();
