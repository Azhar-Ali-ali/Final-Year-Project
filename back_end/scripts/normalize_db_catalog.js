const fs = require('fs');
const path = require('path');

const catalogPath = path.resolve(__dirname, '..', '..', 'AI-Clothing-AI', 'db_catalog_sample.json');
if (!fs.existsSync(catalogPath)) {
  console.error('Catalog not found at', catalogPath);
  process.exit(1);
}

const base = process.env.FRONTEND_BASE || 'http://127.0.0.1:5000';
const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const out = raw.map(item => {
  let url = item.image_url || '';
  url = String(url).trim();
  if (!url) return item;
  // If relative path (starts with /) or missing scheme, prepend base
  if (url.startsWith('/')) url = base + url;
  if (!/^https?:\/\//i.test(url)) {
    // also handle paths without leading slash
    if (url.startsWith('uploads/') || url.startsWith('assets/')) url = base + '/' + url;
  }
  return { ...item, image_url: url };
});

fs.writeFileSync(catalogPath, JSON.stringify(out, null, 2), 'utf8');
console.log('Normalized', out.length, 'rows in', catalogPath);
