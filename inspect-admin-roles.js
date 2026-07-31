const { query, closePool } = require('./back_end/database/postgresClient');
(async () => {
  try {
    const cols = await query("SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns WHERE table_name ILIKE '%admin_roles%' OR column_name ILIKE '%role%' ORDER BY table_name, ordinal_position");
    console.log('role-related columns:', JSON.stringify(cols.rows, null, 2));

    const sampleAdminRoles = await query('SELECT * FROM admin_roles LIMIT 5');
    console.log('admin_roles sample:', JSON.stringify(sampleAdminRoles.rows, null, 2));

    const roleTables = await query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_name ILIKE '%role%' ORDER BY table_schema, table_name");
    console.log('tables containing role:', JSON.stringify(roleTables.rows, null, 2));

    const userSample = await query("SELECT id, email, role, password_hash FROM users WHERE LOWER(role::text) IN ('admin','super_admin','co_admin','co-admin') ORDER BY created_at DESC LIMIT 10");
    console.log('admin user sample:', JSON.stringify(userSample.rows, null, 2));
  } catch (e) {
    console.error('ERROR', e.message || e);
  } finally {
    await closePool();
  }
})();