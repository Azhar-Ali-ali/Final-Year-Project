const { randomUUID } = require('crypto');
const { query } = require('../database/postgresClient');

(async () => {
  const userId = '6418192c-4e6a-482b-abeb-a966ee317f3e';

  await query(`
    CREATE TABLE IF NOT EXISTS public.user_browsing_history (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
      viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const productRes = await query(`
    SELECT id
    FROM public.products
    WHERE status = 'active'
    ORDER BY created_at DESC
    LIMIT 6
  `);

  const products = productRes.rows || [];
  if (!products.length) {
    console.log('NO_PRODUCTS');
    process.exit(0);
  }

  for (const product of products) {
    await query(`
      INSERT INTO public.user_browsing_history (id, user_id, product_id, viewed_at)
      VALUES ($1, $2, $3, NOW())
    `, [randomUUID(), userId, product.id]);
  }

  const countRes = await query(`
    SELECT COUNT(*)::int AS count
    FROM public.user_browsing_history
    WHERE user_id = $1
  `, [userId]);

  console.log(JSON.stringify({ insertedForUser: userId, productCount: products.length, totalHistoryRows: countRes.rows[0].count }));
})();
