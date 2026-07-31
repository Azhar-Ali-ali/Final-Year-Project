const path = require('path');
const db = require(path.resolve(__dirname, '../back_end/database/postgresClient'));

function computePercent(original, discounted) {
  if (!original || !discounted) return 0;
  if (original <= discounted) return 0;
  return Math.round(((original - discounted) / original) * 100);
}

(async () => {
  try {
    const res = await db.query(`
      SELECT id, name, slug, base_price, compare_price, discount_percent, status, updated_at
      FROM public.products
      WHERE compare_price IS NOT NULL AND compare_price < base_price
      ORDER BY updated_at DESC
      LIMIT 200
    `);

    if (!res.rows.length) {
      console.log('No mis-oriented products found.');
      process.exit(0);
    }

    console.log('Found products to migrate:');
    for (const row of res.rows) {
      const id = row.id;
      const name = row.name;
      const oldBase = Number(row.base_price || 0);
      const oldCompare = Number(row.compare_price || 0);
      const newBase = oldCompare;
      const newCompare = oldBase;
      const newDiscount = computePercent(newCompare, newBase);
      console.log(`\n- Product ${id} (${name})`);
      console.log(`  before: base_price=${oldBase}, compare_price=${oldCompare}, discount_percent=${row.discount_percent}`);

      await db.query(`
        UPDATE public.products
        SET base_price = $1, compare_price = $2, discount_percent = $3, updated_at = NOW()
        WHERE id = $4
      `, [newBase, newCompare, newDiscount, id]);

      console.log(`  after: base_price=${newBase}, compare_price=${newCompare}, discount_percent=${newDiscount}`);
    }

    console.log('\nMigration complete.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message || err);
    process.exit(2);
  }
})();
