/**
 * Test: Smart Search (Database-first with Gemini fallback)
 * 
 * Run: $env:GEMINI_API_KEY = "your_key"; node scripts/test_smart_search.js
 */

const { smartSearchProducts } = require('../src/utils/smartSearch');

// Mock database for testing
const mockDb = {
  query: async (sql, values) => {
    console.log('Mock DB Query:', sql.substring(0, 100) + '...');
    console.log('Values:', values);
    
    // Simulate empty results for testing Gemini fallback
    return { rows: [] };
  }
};

async function testSmartSearch() {
  console.log('\n=== Smart Search Tests ===\n');

  // Test 1: Search query that might not find results
  console.log('Test 1: Search for "tee" (short query)');
  console.log('Expected: Database search fails → Gemini extracts keywords (t-shirt, shirt, top) → Search again\n');
  
  const results1 = await smartSearchProducts(mockDb, 'tee');
  console.log('Results:', results1.length, 'products found\n');

  // Test 2: Search with category filter
  console.log('Test 2: Search for "black pants" in Men category');
  const results2 = await smartSearchProducts(mockDb, 'black pants', ['men']);
  console.log('Results:', results2.length, 'products found\n');

  // Test 3: Empty query
  console.log('Test 3: Empty search query');
  const results3 = await smartSearchProducts(mockDb, '');
  console.log('Results:', results3.length, 'products found\n');

  console.log('=== Tests Complete ===\n');
}

testSmartSearch().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
