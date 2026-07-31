const fs = require('fs');
const path = require('path');

// Product categories and items from your website
const categories = {
  men: [
    'hoodie', 'shirt', 'jeans', 'jacket', 'sneakers',
    'polo', 'shorts', 'sweater', 'boots', 'wallet',
    'tshirt', 'pants', 'coat', 'blazer', 'loafers'
  ],
  women: [
    'dress', 'blouse', 'jeans', 'coat', 'heels',
    'skirt', 'sweater', 'sneakers', 'bag', 'jewelry',
    'cardigan', 'leggings', 'blazer', 'boots', 'sandals'
  ],
  kids: [
    'tshirt', 'hoodie', 'pants', 'dress', 'shoes',
    'sweater', 'shorts', 'jacket', 'backpack', 'socks',
    'polo', 'jeans', 'sneakers', 'coat', 'swimwear'
  ],
  accessories: [
    'bag', 'watch', 'belt', 'hat', 'jewelry',
    'scarf', 'sunglasses', 'gloves', 'necklace', 'cap',
    'earrings', 'bracelet', 'ring', 'wallet', 'purse'
  ]
};

// Generate products with realistic pricing
function generateProducts() {
  const products = [];
  let productId = 1;
  const categoryNames = Object.keys(categories);

  for (let i = 0; i < 110000; i++) {
    const categoryIdx = i % categoryNames.length;
    const category = categoryNames[categoryIdx];
    const itemIdx = Math.floor(i / categoryNames.length) % categories[category].length;
    const item = categories[category][itemIdx];
    const color = ['black', 'white', 'blue', 'red', 'green', 'gray', 'brown', 'navy', 'beige', 'gold'][Math.floor(Math.random() * 10)];
    const size = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'][Math.floor(Math.random() * 7)];
    const price = Math.round((Math.random() * 150 + 20) * 100) / 100;

    products.push({
      id: productId,
      category,
      item,
      color,
      size,
      price
    });
    productId++;
  }

  return products;
}

// Get related product for bundle purchase
function getRelatedProducts(productId, allProducts, categoryMap) {
  const product = allProducts[productId - 1];
  const relatedCategory = product.category;
  const relatedProducts = categoryMap[relatedCategory] || [];

  if (relatedProducts.length === 0) return [];

  const related = [];
  for (let i = 0; i < Math.floor(Math.random() * 2) + 1; i++) {
    const randomProduct = relatedProducts[Math.floor(Math.random() * relatedProducts.length)];
    if (randomProduct !== productId) {
      related.push(randomProduct);
    }
  }
  return related;
}

// Generate purchase history
function generatePurchaseHistory() {
  console.log('Generating products...');
  const products = generateProducts();

  // Build category map for faster lookups
  const categoryMap = {};
  Object.keys(categories).forEach(cat => {
    categoryMap[cat] = [];
  });

  products.forEach(p => {
    categoryMap[p.category].push(p.id);
  });

  // Make some products more popular (80/20 rule)
  const popularProducts = new Set();
  const numPopular = Math.floor(products.length * 0.2);
  for (let i = 0; i < numPopular; i++) {
    popularProducts.add(Math.floor(Math.random() * products.length) + 1);
  }

  console.log('Generating purchase records...');
  const records = [];
  const users = [];
  for (let i = 1; i <= 10000; i++) {
    users.push(`U${String(i).padStart(5, '0')}`);
  }

  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  let orderId = 1;
  let recordCount = 0;
  const targetRecords = 500000;

  while (recordCount < targetRecords) {
    const userId = users[Math.floor(Math.random() * users.length)];
    const itemsPerOrder = Math.floor(Math.random() * 5) + 2; // 2-6 items
    const orderedProducts = new Set();

    // First item
    let firstProduct;
    if (Math.random() < 0.3) {
      // 30% chance to pick a popular product
      const popularArray = Array.from(popularProducts);
      firstProduct = popularArray[Math.floor(Math.random() * popularArray.length)];
    } else {
      firstProduct = Math.floor(Math.random() * products.length) + 1;
    }
    orderedProducts.add(firstProduct);

    // Related items
    const related = getRelatedProducts(firstProduct, products, categoryMap);
    related.forEach(p => orderedProducts.add(p));

    // Fill remaining slots with random products
    while (orderedProducts.size < itemsPerOrder) {
      if (Math.random() < 0.2) {
        // 20% chance popular product
        const popularArray = Array.from(popularProducts);
        orderedProducts.add(popularArray[Math.floor(Math.random() * popularArray.length)]);
      } else {
        orderedProducts.add(Math.floor(Math.random() * products.length) + 1);
      }
    }

    // Create records for this order
    const randomDate = new Date(oneYearAgo.getTime() + Math.random() * (now.getTime() - oneYearAgo.getTime()));
    const dateStr = randomDate.toISOString().split('T')[0];

    orderedProducts.forEach(productId => {
      const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 quantity
      records.push([orderId, userId, productId, quantity, dateStr]);
      recordCount++;

      if (recordCount >= targetRecords) {
        return;
      }
    });

    orderId++;
  }

  return records;
}

console.log('Starting purchase history generation...');
const purchaseRecords = generatePurchaseHistory();

console.log(`Generated ${purchaseRecords.length} purchase records`);

// Write to CSV
const outputPath = path.join(__dirname, 'purchase_history.csv');
const header = 'order_id,user_id,product_id,quantity,purchase_date\n';
const content = purchaseRecords.map(r => r.join(',')).join('\n') + '\n';

fs.writeFileSync(outputPath, header + content, 'utf8');

console.log(`\n✓ Dataset saved to: ${outputPath}`);
console.log(`\nDataset Summary:`);
console.log(`  Total purchase records: ${purchaseRecords.length}`);
console.log(`  Total orders: ${Math.max(...purchaseRecords.map(r => r[0]))}`);
console.log(`  Total users: 10,000`);
console.log(`  Total products: 110,000`);
console.log(`  Average items per order: ${(purchaseRecords.length / Math.max(...purchaseRecords.map(r => r[0]))).toFixed(2)}`);
