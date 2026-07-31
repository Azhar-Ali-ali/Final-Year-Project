const test = require('node:test');
const assert = require('node:assert/strict');
const { isDeliveredOrderStatus } = require('./reviewEligibility');

test('treats a delivered shipment as eligible for review', () => {
  assert.equal(
    isDeliveredOrderStatus({ orderStatus: 'processing', shipmentStatus: 'delivered' }),
    true
  );
});

test('treats a delivery timestamp as eligible even when the order status is still pending', () => {
  assert.equal(
    isDeliveredOrderStatus({ orderStatus: 'pending', deliveredAt: '2026-07-07T10:00:00Z' }),
    true
  );
});

test('does not treat in-transit shipments as eligible', () => {
  assert.equal(
    isDeliveredOrderStatus({ orderStatus: 'processing', shipmentStatus: 'in_transit' }),
    false
  );
});
