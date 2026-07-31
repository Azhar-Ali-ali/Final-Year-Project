const { query } = require('./back_end/database/postgresClient');
(async () => {
  try {
    const cols = await query("SELECT table_schema, column_name, data_type FROM information_schema.columns WHERE table_name = 'users' ORDER BY table_schema, ordinal_position");
    console.log('COLS', JSON.stringify(cols.rows, null, 2));
    const exists = await query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='password_hash') AS has_password_hash");
    console.log('HAS_PASSWORD_HASH', JSON.stringify(exists.rows[0], null, 2));
    const sample = await query("SELECT id, full_name, email, role, status, password_hash FROM public.users ORDER BY created_at ASC LIMIT 3");
    console.log('SAMPLE', JSON.stringify(sample.rows, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();