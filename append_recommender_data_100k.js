const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, 'recommender_training_data.csv');
const users = Array.from({ length: 200 }, (_, i) => `U${String(i + 1).padStart(3, '0')}`);
const products = [
  ['P001', 'men', 'hoodie'], ['P002', 'men', 'shirt'], ['P003', 'men', 'jeans'], ['P004', 'men', 'jacket'], ['P005', 'men', 'sneakers'],
  ['P006', 'women', 'dress'], ['P007', 'women', 'blouse'], ['P008', 'women', 'jeans'], ['P009', 'women', 'coat'], ['P010', 'women', 'heels'],
  ['P011', 'kids', 'tshirt'], ['P012', 'kids', 'hoodie'], ['P013', 'kids', 'pants'], ['P014', 'kids', 'dress'], ['P015', 'kids', 'shoes'],
  ['P016', 'accessories', 'bag'], ['P017', 'accessories', 'watch'], ['P018', 'accessories', 'belt'], ['P019', 'accessories', 'hat'], ['P020', 'accessories', 'jewelry'],
  ['P021', 'men', 'polo'], ['P022', 'men', 'shorts'], ['P023', 'men', 'sweater'], ['P024', 'men', 'boots'], ['P025', 'men', 'wallet'],
  ['P026', 'women', 'skirt'], ['P027', 'women', 'sweater'], ['P028', 'women', 'sneakers'], ['P029', 'women', 'bag'], ['P030', 'women', 'jewelry'],
  ['P031', 'kids', 'sweater'], ['P032', 'kids', 'shorts'], ['P033', 'kids', 'jacket'], ['P034', 'kids', 'backpack'], ['P035', 'kids', 'socks'],
  ['P036', 'accessories', 'scarf'], ['P037', 'accessories', 'sunglasses'], ['P038', 'accessories', 'gloves'], ['P039', 'accessories', 'necklace'], ['P040', 'accessories', 'cap']
];

const weights = { view: 1, wishlist: 2, cart: 3, purchase: 5 };
const existingRows = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8').trim().split(/\r?\n/).slice(1) : [];
const startIndex = existingRows.length;

const rows = [];
for (let i = 0; i < 100000; i += 1) {
  const user = users[Math.floor(Math.random() * users.length)];
  const category = ['men', 'women', 'kids', 'accessories'][Math.floor(Math.random() * 4)];
  const categoryProducts = products.filter((p) => p[1] === category);
  const product = categoryProducts[Math.floor(Math.random() * categoryProducts.length)];

  let interactionType = 'view';
  const r = Math.random();
  if (r < 0.5) interactionType = 'purchase';
  else if (r < 0.75) interactionType = 'cart';
  else if (r < 0.9) interactionType = 'wishlist';

  rows.push([user, product[0], weights[interactionType], interactionType, `ORD-${String(startIndex + i + 1).padStart(6, '0')}`]);
}

const content = rows.map((row) => row.join(',')).join('\n') + '\n';
fs.appendFileSync(outputPath, content, 'utf8');

console.log(`Appended ${rows.length} rows to ${outputPath}`);
console.log(`New total rows: ${existingRows.length + rows.length}`);
