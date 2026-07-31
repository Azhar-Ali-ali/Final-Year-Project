const { query } = require('./../database/postgresClient');
(async () => {
  try {
    const cols = await query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'admin_roles' ORDER BY ordinal_position");
    console.log(JSON.stringify(cols.rows, null, 2));
    const rows = await query('SELECT * FROM admin_roles LIMIT 10');
    console.log(JSON.stringify(rows.rows, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
})();
