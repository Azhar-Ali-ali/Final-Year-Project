const { query } = require('../database/postgresClient');
(async () => {
  try {
    const res = await query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='seller_bank_accounts' ORDER BY ordinal_position");
    console.log(res.rows.map(r => r.column_name).join('\n'));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
