const path = require('path');
const db = require(path.resolve(__dirname, '../back_end/database/postgresClient'));

(async () => {
  try {
    const res1 = await db.query(`
      SELECT id, name, slug, base_price, compare_price, discount_percent, status, updated_at
      FROM public.products
      WHERE compare_price IS NOT NULL AND compare_price > base_price
      ORDER BY updated_at DESC
      LIMIT 40
    `);

    console.log('Products with compare_price > base_price:');
    if (!res1.rows.length) {
      console.log('  (none)');
    } else {
      res1.rows.forEach((r) => {
        console.log(`- id=${r.id} name=${r.name} slug=${r.slug} status=${r.status} base_price=${r.base_price} compare_price=${r.compare_price} discount_percent=${r.discount_percent} updated_at=${r.updated_at}`);
      });
    }

    const res2 = await db.query(`
      SELECT id, name, slug, base_price, compare_price, discount_percent, status, updated_at
      FROM public.products
      WHERE (discount_percent IS NOT NULL AND discount_percent > 0) OR compare_price IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 80
    `);

    console.log('\nProducts with discount_percent>0 OR compare_price IS NOT NULL:');
    if (!res2.rows.length) {
      console.log('  (none)');
    } else {
      res2.rows.forEach((r) => {
        console.log(`- id=${r.id} name=${r.name} slug=${r.slug} status=${r.status} base_price=${r.base_price} compare_price=${r.compare_price} discount_percent=${r.discount_percent} updated_at=${r.updated_at}`);
      });
    }
    process.exit(0);
  } catch (err) {
    console.error('Query failed:', err.message || err);
    process.exit(2);
  }
})();
