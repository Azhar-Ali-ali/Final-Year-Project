const { searchProducts, normalizeSearchTerms, _products } = require('../src/data/productsData');

function addTestProduct(product) {
  _products.unshift(product);
}

function removeTestProducts() {
  // remove any products we added (we add at front)
  while (_products.length && _products[0].__isTest) {
    _products.shift();
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error('Assertion failed:', message);
    process.exit(2);
  }
}

(async function run() {
  try {
    // Test 1: casual pants -> should match product with tags ['casual','pant']
    addTestProduct({
      id: 't1',
      name: "Men's Black Cotton Cargo Pant",
      description: 'Comfortable cargo pant for men',
      brand: 'TestBrand',
      category: 'Men',
      tags: ['men','pant','cargo','black','cotton','casual','regular fit','summer'],
      __isTest: true
    });

    const res1 = searchProducts('casual pants', 10);
    console.log('Search "casual pants" results length =', res1.length);
    assert(res1.length > 0, 'casual pants should return at least one product');

    // Test 2: tops -> should match product with tag 'top'
    addTestProduct({
      id: 't2',
      name: 'Floral Cotton Top for Women',
      description: 'Light summer top',
      brand: 'TestBrand',
      category: 'Women',
      tags: ['women','top','cotton','floral','summer'],
      __isTest: true
    });

    const res2 = searchProducts('tops', 10);
    console.log('Search "tops" results length =', res2.length);
    assert(res2.length > 0, 'tops should return at least one product');

    console.log('All tests passed');
    removeTestProducts();
    process.exit(0);
  } catch (err) {
    console.error('Test run failed:', err && err.stack ? err.stack : err);
    removeTestProducts();
    process.exit(2);
  }
})();
