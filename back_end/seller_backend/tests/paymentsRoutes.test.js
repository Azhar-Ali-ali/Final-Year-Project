const test = require('node:test');
const assert = require('node:assert/strict');

const paymentsRoutes = require('../src/routes/paymentsRoutes');

test('normalizePayoutStatus maps payout states for seller visibility', () => {
  assert.equal(paymentsRoutes.normalizePayoutStatus('paid'), 'paid');
  assert.equal(paymentsRoutes.normalizePayoutStatus('PENDING'), 'processing');
  assert.equal(paymentsRoutes.normalizePayoutStatus('processing'), 'processing');
  assert.equal(paymentsRoutes.normalizePayoutStatus('rejected'), 'rejected');
  assert.equal(paymentsRoutes.normalizePayoutStatus('failed'), 'rejected');
});

test('shouldSuppressLedgerPayoutEntry hides the old processing entry once a payout row exists', () => {
  const suppressed = paymentsRoutes.shouldSuppressLedgerPayoutEntry(
    { type: 'Adjustment', description: 'Withdrawal request WD-20260705-882023' },
    new Set(['WD-20260705-882023'])
  );
  assert.equal(suppressed, true);
});
