const { pool } = require('./back_end/database/postgresClient');

(async () => {
  try {
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position");
    console.log('columns', cols.rows.map(r => r.column_name));

    const email = 'oauth-check-' + Date.now() + '@example.com';
    const res = await pool.query(`
      INSERT INTO public.users (role, full_name, email, phone, password_hash, status, google_id, auth_provider, avatar_url)
      VALUES ('customer', $1, $2, NULL, crypt($3, gen_salt('bf')), 'active', $4, $5, $6)
      RETURNING id, email, full_name, role
    `, ['OAuth Check', email, 'temp-password-123', 'google-test-id', 'google', 'https://example.com/avatar.png']);
    console.log('inserted', res.rows[0]);
  } catch (err) {
    console.error(err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
})();
