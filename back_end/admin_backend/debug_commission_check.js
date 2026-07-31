const { query } = require('../database/postgresClient');
(async () => {
  try {
    const res = await query('SELECT id, status, role, email FROM users WHERE role=$1 LIMIT 5', ['admin']);
    console.log('admins', JSON.stringify(res.rows, null, 2));
    const comm = await query('SELECT seller_id, gross_sales, commission, updated_at FROM public.payment_payout_seller_state LIMIT 5');
    console.log('seller_state', JSON.stringify(comm.rows, null, 2));
    const orders = await query('SELECT id, order_number, grand_total, placed_at, created_at, payment_status FROM public.orders ORDER BY created_at DESC LIMIT 5');
    console.log('orders', JSON.stringify(orders.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    try { require('fs').unlinkSync($scriptPath); } catch (e) {}
    process.exit(0);
  }
})();
