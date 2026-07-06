const { query } = require('../../database/postgresClient');
(async () => {
  try {
    const email = 'seller100@gmail.com';
    const result = await query(
      "select id, email, phone, role, status, full_name from users where lower(email)=lower($1) or phone=$1 limit 5",
      [email]
    );
    console.log(JSON.stringify(result.rows, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e.stack || e.message);
    process.exit(1);
  }
})();
