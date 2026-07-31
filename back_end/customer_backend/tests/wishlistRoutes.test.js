const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const wishlistRoutes = require('../src/routes/wishlistRoutes');


test('POST /api/wishlist/:userId adds an item using the path user id', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/wishlist', wishlistRoutes);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/wishlist/user_123`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: 1 })
    });

    const payload = await response.json();
    assert.equal(response.status, 201);
    assert.equal(payload.success, true);
    assert.ok(payload.item || payload.wishlistCount >= 0);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
