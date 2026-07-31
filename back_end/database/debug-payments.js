const { query } = require('./postgresClient');
(async () => {
  const seller = 'b651ebf1-e479-481e-b99f-531a70615a27';
  console.log('search path check');
  const search = await query('SHOW search_path');
  console.log(search.rows[0]);

  const orderColumns = await query('SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position', ['public', 'orders']);
  const itemColumns = await query('SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position', ['public', 'order_items']);
  console.log('orders columns', orderColumns.rows.map((row) => row.column_name));
  console.log('order_items columns', itemColumns.rows.map((row) => row.column_name));

  const rows = await query(`
    SELECT o.id AS order_id, o.status, o.payment_status, o.placed_at, o.created_at, oi.id AS item_id, oi.seller_id, oi.line_total, oi.commission_amount
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE oi.seller_id = $1
    ORDER BY o.created_at DESC
    LIMIT 20
  `, [seller]);

  console.log('matching order rows', rows.rows.length);
  console.dir(rows.rows, { depth: 6 });
})();

