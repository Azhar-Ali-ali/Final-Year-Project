const { query } = require('./../database/postgresClient');
(async () => {
  try {
    const inspect = async (table) => {
      const cols = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [table]);
      console.log(`\nTABLE ${table}`);
      console.table(cols.rows);
      const sample = await query(`SELECT id, role, email FROM ${table} LIMIT 5`);
      console.log(JSON.stringify(sample.rows, null, 2));
    };
    await inspect('admin_roles');
    await inspect('users');
    await inspect('admins');
    const coAdmin = await query(`SELECT id, role, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`, ['coadmin@lumina.com']);
    console.log('\nCO-ADMIN USER QUERY', JSON.stringify(coAdmin.rows, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
})();
