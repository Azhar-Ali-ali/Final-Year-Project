const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'recommender_training_data.csv');
const header = 'user_id,product_id,score,interaction_type,order_id';
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

const exists = fs.existsSync(filePath);
if (!exists) {
  fs.writeFileSync(filePath, `${header}\n`, 'utf8');
}

const existingContent = fs.readFileSync(filePath, 'utf8');
const existingLines = existingContent.trim().split(/\r?\n/).filter(Boolean);
const currentRowCount = existingLines.length > 0 && existingLines[0] === header ? existingLines.length - 1 : existingLines.length;

const newRows = [];
for (let i = 0; i < 9000; i += 1) {
  const user = users[Math.floor(Math.random() * users.length)];
  const category = ['men', 'women', 'kids', 'accessories'][Math.floor(Math.random() * 4)];
  const categoryProducts = products.filter((p) => p[1] === category);
  const product = categoryProducts[Math.floor(Math.random() * categoryProducts.length)];

  let interactionType = 'view';
  const r = Math.random();
  if (r < 0.6) interactionType = 'purchase';
  else if (r < 0.8) interactionType = 'cart';
  else if (r < 0.95) interactionType = 'wishlist';

  const orderNumber = currentRowCount + i + 1;
  newRows.push(`${user},${product[0]},${weights[interactionType]},${interactionType},ORD-${String(orderNumber).padStart(4, '0')}`);
}

fs.appendFileSync(filePath, `${newRows.join('\n')}\n`, 'utf8');
console.log(`Appended ${newRows.length} rows to ${filePath}`);
console.log(`New total rows: ${currentRowCount + newRows.length}`);
