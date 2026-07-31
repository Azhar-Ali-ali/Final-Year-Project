const { pool } = require('../../database/postgresClient');
const { generateTags } = require('../src/utils/tagging');
const crypto = require('crypto');
const path = require('path');

async function upsertTagsAndLink(client, productId, tagNames) {
  if (!Array.isArray(tagNames) || !tagNames.length) return [];
  const tagIds = [];
  for (const name of tagNames) {
    const normalized = String(name || '').trim().toLowerCase();
    if (!normalized) continue;
    const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tag';

    const insertResult = await client.query(
      `INSERT INTO public.tags (name, slug) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [normalized, slug]
    );

    if (insertResult.rows && insertResult.rows[0]) {
      tagIds.push(insertResult.rows[0].id);
    }
  }

  if (!tagIds.length) return [];

  await client.query('DELETE FROM public.product_tags WHERE product_id = $1', [productId]);

  for (const tagId of tagIds) {
    await client.query(`INSERT INTO public.product_tags (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [productId, tagId]);
  }
  return tagIds;
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ensure tags and product_tags tables exist for the test
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL UNIQUE,
        slug VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.product_tags (
        product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
        tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
        PRIMARY KEY (product_id, tag_id)
      );
    `);

    // find an existing seller user, or create one
    let sellerId = null;
    const userRes = await client.query("SELECT id FROM public.users WHERE role::text = 'seller' LIMIT 1");
    if (userRes.rows && userRes.rows[0]) {
      sellerId = userRes.rows[0].id;
    } else {
      const createUser = await client.query(
        `INSERT INTO public.users (full_name,email,password_hash,role,status,created_at,updated_at) VALUES ($1,$2,crypt($3, gen_salt('bf')),$4,$5,NOW(),NOW()) RETURNING id`,
        ['Test Seller', `test-seller-${Date.now()}@example.com`, 'password', 'seller', 'active']
      );
      sellerId = createUser.rows[0].id;
    }

    const productId = crypto.randomUUID();
    const name = "Men's Black Cotton Cargo Pant";
    const description = 'Comfortable black cotton cargo pant for men.';
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now();

    console.log('Inserting product', productId);
    await client.query(
      `INSERT INTO public.products (id, seller_id, name, slug, description, base_price, currency, sku, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())`,
      [productId, sellerId, name, slug, description, 1000, 'BDT', 'TEST-SKU-001', 'active']
    );

    // call AI tagger
    console.log('Generating tags via Gemini...');
    const tags = await generateTags(`${name} ${description}`);
    console.log('Generated tags:', tags);

    console.log('Upserting tags and linking to product...');
    const tagIds = await upsertTagsAndLink(client, productId, tags);
    console.log('Linked tag ids:', tagIds);

    // verify
    const res = await client.query(
      `SELECT t.name, t.slug FROM public.tags t JOIN public.product_tags pt ON pt.tag_id = t.id WHERE pt.product_id = $1 ORDER BY t.name ASC`,
      [productId]
    );

    console.log('Product tags in DB:', res.rows.map(r => r.name));

    // cleanup
    console.log('Cleaning up test product and links...');
    await client.query('DELETE FROM public.product_tags WHERE product_id = $1', [productId]);
    await client.query('DELETE FROM public.products WHERE id = $1', [productId]);

    await client.query('COMMIT');
    console.log('Integration test completed successfully');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Integration test failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  } finally {
    client.release();
  }
}

run();
