function normalizePaymentMethod(method) {
  const value = String(method || '').trim().toUpperCase();
  if (!value) return 'ONLINE';
  if (value.includes('COD') || value.includes('CASH')) return 'COD';
  return 'ONLINE';
}

function normalizePaymentStatus(status) {
  const value = String(status || '').trim().toUpperCase();
  if (!value) return 'UNPAID';
  if (['PAID', 'AUTHORIZED', 'COMPLETED', 'SUCCEEDED', 'SETTLED', 'CAPTURED'].includes(value)) return 'PAID';
  return 'UNPAID';
}

function normalizeOrderStatus(status) {
  const value = String(status || '').trim().toUpperCase();
  if (!value) return 'PENDING';
  if (value === 'DELIVERED') return 'DELIVERED';
  if (value === 'CANCELLED' || value === 'CANCELED' || value === 'REFUNDED' || value === 'RETURNED') return 'FINALIZED';
  return 'PENDING';
}

function getEarningsStatus({ paymentMethod, paymentStatus, orderStatus }) {
  const paymentType = normalizePaymentMethod(paymentMethod);
  const paymentState = normalizePaymentStatus(paymentStatus);
  const orderState = normalizeOrderStatus(orderStatus);

  if (paymentType === 'ONLINE') {
    return paymentState === 'PAID' && orderState === 'DELIVERED' ? 'Withdrawable' : 'Pending Delivery';
  }

  if (paymentType === 'COD') {
    return paymentState === 'PAID' && orderState === 'DELIVERED' ? 'Withdrawable' : 'Awaiting COD Settlement';
  }

  return 'Pending Delivery';
}

function isWithdrawableOrder({ paymentMethod, paymentStatus, orderStatus }) {
  return getEarningsStatus({ paymentMethod, paymentStatus, orderStatus }) === 'Withdrawable';
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function ensureSellerEarningsColumns(req) {
  const checks = [
    `ALTER TABLE IF EXISTS public.orders ADD COLUMN IF NOT EXISTS payment_status payment_status DEFAULT 'pending'`,
    `ALTER TABLE IF EXISTS public.order_items ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE IF EXISTS public.order_items ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(6,2) DEFAULT 0`
  ];

  for (const sql of checks) {
    try {
      await req.db.query(sql);
    } catch (_) {
      // ignore schema differences and continue
    }
  }
}

module.exports = {
  normalizePaymentMethod,
  normalizePaymentStatus,
  normalizeOrderStatus,
  getEarningsStatus,
  isWithdrawableOrder,
  toMoney,
  ensureSellerEarningsColumns
};
