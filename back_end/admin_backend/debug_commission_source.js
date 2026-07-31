const { query } = require('../database/postgresClient');
(async () => {
  try {
    const items = await query(`SELECT oi.id, oi.order_id, oi.seller_id, oi.product_id, oi.quantity, oi.line_total, oi.commission_amount, o.order_number, o.payment_status, o.status AS order_status, o.placed_at FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id ORDER BY oi.created_at DESC LIMIT 20`);
    console.log('order_items sample:', JSON.stringify(items.rows, null, 2));
    const ledgers = await query(`SELECT seller_id, entry_type, amount, created_at FROM public.seller_ledger ORDER BY created_at DESC LIMIT 20`);
    console.log('seller_ledger sample:', JSON.stringify(ledgers.rows, null, 2));
    const sellerState = await query(`SELECT seller_id, gross_sales, commission, shipping, taxes, refunds, available_balance, pending_balance, paid_amount, eligible_orders, updated_at FROM public.payment_payout_seller_state LIMIT 10`);
    console.log('seller_state:', JSON.stringify(sellerState.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    try { require('fs').unlinkSync($scriptPath); } catch (e) {}
    process.exit(0);
  }
})();
