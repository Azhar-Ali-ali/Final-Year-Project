const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOrderStatus, deriveDisplayStatus } = require('./orderStatus');

test('normalizeOrderStatus formats READY_FOR_PICKUP as Ready for Pickup', () => {
  const result = normalizeOrderStatus('READY_FOR_PICKUP');
  assert.equal(result.key, 'ready_for_pickup');
  assert.equal(result.label, 'Ready for Pickup');
});

test('normalizeOrderStatus keeps shipped as Shipped', () => {
  const result = normalizeOrderStatus('shipped');
  assert.equal(result.key, 'shipped');
  assert.equal(result.label, 'Shipped');
});

test('deriveDisplayStatus treats shipped orders without shipment state as ready for pickup', () => {
  const result = deriveDisplayStatus('shipped', '', '');
  assert.equal(result.status, 'ready_for_pickup');
  assert.equal(result.label, 'Ready for Pickup');
});
