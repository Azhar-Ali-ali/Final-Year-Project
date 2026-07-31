const { query } = require('./../database/postgresClient');
(async () => {
  try {
    const dump = async (table) => {
      const cols = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [table]);
      console.log(`\nTABLE: ${table}`);
      console.table(cols.rows);
      const rows = await query(`SELECT * FROM ${table} LIMIT 3`);
      console.log(`ROWS (${table}):`, JSON.stringify(rows.rows, null, 2));
    };
    await dump('admin_roles');
    await dump('users');
    await dump('admins');
    await dump('roles');
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
})();
