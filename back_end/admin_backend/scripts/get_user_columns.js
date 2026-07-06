const { query } = require('../../database/postgresClient');
(async () => {
  try {
    const cols = await query("SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position");
    console.log(cols.rows.map(r => r.column_name));
    process.exit(0);
  } catch (e) {
    console.error(e.stack || e.message);
    process.exit(1);
  }
})();
