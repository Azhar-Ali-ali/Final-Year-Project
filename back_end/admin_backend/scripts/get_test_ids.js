const { query } = require('../../database/postgresClient');
(async () => {
  try {
    const cust = await query("select id,email from users where email='customer1@com' limit 1");
    const prod = await query("select id,slug from products where slug='men-essential-tee' limit 1");
    console.log('CUST:', JSON.stringify(cust.rows[0] || null));
    console.log('PROD:', JSON.stringify(prod.rows[0] || null));
    process.exit(0);
  } catch (e) {
    console.error(e.stack || e.message);
    process.exit(1);
  }
})();
