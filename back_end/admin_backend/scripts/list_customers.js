const { query } = require('../../database/postgresClient');
(async () => {
  try {
    const result = await query("SELECT id, email, phone, role, status, full_name FROM users WHERE role='customer' ORDER BY created_at DESC LIMIT 20");
    console.log(JSON.stringify(result.rows, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
})();
