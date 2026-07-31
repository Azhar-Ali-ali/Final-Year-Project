const path = require('path');
const { query } = require(path.resolve(__dirname, '..', 'database', 'postgresClient'));

(async () => {
  try {
    const res = await query("SELECT table_name, column_name FROM information_schema.columns WHERE column_name ILIKE '%image%' OR column_name ILIKE '%photo%' OR column_name ILIKE '%media%'");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message || e);
  } finally {
    process.exit();
  }
})();
