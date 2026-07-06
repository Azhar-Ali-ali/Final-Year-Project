const { Pool } = require('pg');
const { randomUUID } = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/lumina'
});

async function countRows(tableName) {
  const result = await pool.query(`SELECT COUNT(*)::int AS total FROM ${tableName}`);
  return Number(result.rows[0]?.total || 0);
}

async function main() {
  const counts = await Promise.all([
    countRows('cms_pages'),
    countRows('cms_sections'),
    countRows('cms_navigation'),
    countRows('cms_assets'),
    countRows('cms_announcements')
  ]);

  if (counts.some((count) => count > 0)) {
    console.log('CMS seed skipped: tables already contain data.');
    return;
  }

  const homePageId = randomUUID();
  const blogPageId = randomUUID();
  const faqPageId = randomUUID();

  await pool.query(
    `
      INSERT INTO cms_pages (id, slug, title, meta_title, meta_description, status, published_at)
      VALUES
        ($1, $2, $3, $4, $5, 'published', NOW()),
        ($6, $7, $8, $9, $10, 'published', NOW()),
        ($11, $12, $13, $14, $15, 'published', NOW())
      ON CONFLICT (slug) DO NOTHING
    `,
    [
      homePageId, 'homepage', 'Homepage', 'Homepage | Lumina', 'Main landing page content',
      blogPageId, 'blog-news', 'Blog News', 'Blog News | Lumina', 'News and updates from Lumina',
      faqPageId, 'faq-center', 'FAQ Center', 'FAQ Center | Lumina', 'Frequently asked questions'
    ]
  );

  await pool.query(
    `
      INSERT INTO cms_sections (id, page_id, section_key, section_type, heading, body, content, sort_order, is_visible)
      VALUES
        ($1, $2, $3, 'hero', $4, $5, $6::json, 1, TRUE),
        ($7, $8, $9, 'content', $10, $11, $12::json, 2, TRUE),
        ($13, $14, $15, 'faq', $16, $17, $18::json, 1, TRUE)
      ON CONFLICT (page_id, section_key) DO NOTHING
    `,
    [
      randomUUID(), homePageId, 'hero-banner', 'Welcome to Lumina', 'Discover handcrafted and curated products.', JSON.stringify({ summary: 'Homepage hero block' }),
      randomUUID(), blogPageId, 'latest-posts', 'Latest Posts', 'Fresh editorial content and product stories.', JSON.stringify({ summary: 'Blog content block' }),
      randomUUID(), faqPageId, 'top-questions', 'How does delivery work?', 'Orders are processed locally and dispatched quickly.', JSON.stringify({ answer: 'Delivery information block' })
    ]
  );

  await pool.query(
    `
      INSERT INTO cms_navigation (id, label, href, nav_group, sort_order, is_active)
      VALUES
        ($1, $2, $3, 'header', 1, TRUE),
        ($4, $5, $6, 'header', 2, TRUE),
        ($7, $8, $9, 'footer', 1, TRUE)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      randomUUID(), 'Home', '/homepage.html',
      randomUUID(), 'Blog', '/blog.html',
      randomUUID(), 'FAQ', '/faq.html'
    ]
  );

  await pool.query(
    `
      INSERT INTO cms_assets (id, asset_type, file_name, file_url, mime_type, file_size, created_at)
      VALUES
        ($1, 'image', $2, $3, $4, $5, NOW()),
        ($6, 'image', $7, $8, $9, $10, NOW())
      ON CONFLICT (id) DO NOTHING
    `,
    [
      randomUUID(), 'Homepage Hero', 'https://via.placeholder.com/1200x500?text=Lumina+Homepage', 'image/png', 0,
      randomUUID(), 'Blog Cover', 'https://via.placeholder.com/1200x500?text=Lumina+Blog', 'image/png', 0
    ]
  );

  await pool.query(
    `
      INSERT INTO cms_announcements (id, title, body, audience, is_active, starts_at, ends_at, created_at, updated_at)
      VALUES
        ($1, $2, $3, 'all', TRUE, NOW(), NULL, NOW(), NOW()),
        ($4, $5, $6, 'admins', TRUE, NOW(), NULL, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `,
    [
      randomUUID(), 'Welcome to Lumina CMS', 'CMS content is now available from the local database.',
      randomUUID(), 'Admin Notice', 'Review the CMS content blocks and navigation items.'
    ]
  );

  console.log('CMS seed completed successfully.');
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });