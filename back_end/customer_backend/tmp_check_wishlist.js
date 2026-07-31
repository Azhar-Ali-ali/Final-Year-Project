const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:1234@localhost:5432/lumina' });
(async () => {
  try {
    await client.connect();
    const prod = await client.query('SELECT id,status,slug,sku FROM public.products WHERE id::text=$1 LIMIT 1', ['8dbcaf65-d326-4771-92a4-54abfaba0208']);
    console.log('prod', JSON.stringify(prod.rows, null, 2));
    const wish = await client.query('SELECT * FROM public.wishlists WHERE customer_id::text=$1 AND product_id::text=$2', ['9ca02b09-6bcc-46a0-a281-2d782867b6e5','8dbcaf65-d326-4771-92a4-54abfaba0208']);
    console.log('wish', JSON.stringify(wish.rows, null, 2));
  } catch (err) {
    console.error('ERR', err.message);
  } finally {
    await client.end();
  }
})();
