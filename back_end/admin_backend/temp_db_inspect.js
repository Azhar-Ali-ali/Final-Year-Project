const { pool } = require('./database/postgresClient');

(async () => {
  try {
    const res = await pool.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_name='support_tickets' ORDER BY table_schema");
    console.log('tables:', JSON.stringify(res.rows, null, 2));
    const cols = await pool.query("SELECT table_schema, column_name, data_type FROM information_schema.columns WHERE table_name='support_tickets' ORDER BY ordinal_position");
    console.log('columns:', JSON.stringify(cols.rows, null, 2));
    const schemas = await pool.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('public','lumina') ORDER BY schema_name");
    console.log('schemas:', JSON.stringify(schemas.rows, null, 2));
  } catch (err) {
    console.error('ERR', err.message || err);
  } finally {
    await pool.end();
  }
})();
