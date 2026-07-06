const express = require('express');
const data = require('../data/paymentPayoutService');

const router = express.Router();

function getAdminId(req) {
  return data.adminId(req);
}

function csvEscape(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

router.get('/overview', async (req, res) => {
  try {
    const result = await data.getOverview(req.db);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load overview', error: error.message });
  }
});

router.get('/online-payments', async (req, res) => {
  try {
    const result = await data.getOnlinePayments(req.db);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load online payments', error: error.message });
  }
});

router.get('/cod-tracking', async (req, res) => {
  try {
    const result = await data.getCodTracking(req.db);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load COD tracking', error: error.message });
  }
});

router.get('/payout-queue', async (req, res) => {
  try {
    const result = await data.getPayoutQueue(req.db);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load payout queue', error: error.message });
  }
});

router.get('/failed-payments', async (req, res) => {
  try {
    const result = await data.getFailedPayments(req.db);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load failed payments', error: error.message });
  }
});

router.get('/audit', async (req, res) => {
  try {
    const result = await data.getAuditLog(req.db);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load audit log', error: error.message });
  }
});

router.get('/report', async (req, res) => {
  try {
    const [overview, onlinePayments, codTracking, payouts, failedPayments] = await Promise.all([
      data.getOverview(req.db),
      data.getOnlinePayments(req.db),
      data.getCodTracking(req.db),
      data.getPayoutQueue(req.db),
      data.getFailedPayments(req.db)
    ]);

    const lines = [
      ['Section', 'Metric', 'Value'],
      ['Overview', 'Total Gross Sales', overview.totalGrossSales],
      ['Overview', 'Total Commission', overview.totalCommission],
      ['Overview', 'Pending Escrow', overview.totalPendingEscrow],
      ['Overview', 'Seller Payable', overview.totalSellerPayable],
      ['Overview', 'Total Paid Out', overview.totalPaidOut],
      ['Overview', 'Total Refunds', overview.totalRefunds],
      ['Overview', 'COD Pending Reconciliation', overview.codPendingReconciliation],
      ['Overview', 'Failed Payments', overview.failedPayments],
      ...onlinePayments.map((item) => ['Online Payment', item.orderId, `${item.customerName} | ${item.sellerName} | ${item.amount} | ${item.paymentStatus}`]),
      ...codTracking.map((item) => ['COD Tracking', item.orderId, `${item.sellerName} | ${item.courierName} | ${item.codAmount} | ${item.courierDepositStatus}`]),
      ...payouts.map((item) => ['Payout Queue', item.name, `${item.availableBalance} | ${item.kycStatus} | ${item.bankStatus} | ${item.riskLevel}`]),
      ...failedPayments.map((item) => ['Failed Payment', item.orderId, `${item.customerName} | ${item.amount} | ${item.failureType}`])
    ];

    const csv = lines.map((row) => row.map(csvEscape).join(',')).join('\n');
    res.type('text/csv');
    res.header('Content-Disposition', `attachment; filename="payment_payout_report_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate report', error: error.message });
  }
});

router.post('/payments/:id/refund', async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    const notes = String(req.body?.notes || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });
    await data.refundPayment(req.db, req.params.id, { reason, notes }, getAdminId(req));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to process refund', error: error.message });
  }
});

router.post('/payments/:id/dispute', async (req, res) => {
  try {
    const disputeType = String(req.body?.disputeType || '').trim();
    const details = String(req.body?.details || '').trim();
    if (!disputeType || !details) return res.status(400).json({ success: false, message: 'disputeType and details are required' });
    await data.markDispute(req.db, req.params.id, { disputeType, details }, getAdminId(req));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to mark dispute', error: error.message });
  }
});

router.post('/failed-payments/:id/retry', async (req, res) => {
  try {
    await data.retryFailedPayment(req.db, req.params.id, getAdminId(req));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retry payment', error: error.message });
  }
});

router.post('/failed-payments/:id/fraud', async (req, res) => {
  try {
    await data.flagFraud(req.db, req.params.id, getAdminId(req));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to flag fraud', error: error.message });
  }
});

router.post('/cod/:orderId/confirm-deposit', async (req, res) => {
  try {
    await data.confirmCodDeposit(req.db, req.params.orderId, getAdminId(req));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to confirm COD deposit', error: error.message });
  }
});

router.post('/cod/:orderId/flag-mismatch', async (req, res) => {
  try {
    await data.flagCodMismatch(req.db, req.params.orderId, getAdminId(req));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to flag COD mismatch', error: error.message });
  }
});

router.post('/sellers/:id/kyc/:action', async (req, res) => {
  try {
    const action = String(req.params.action || '').trim();
    if (!['approve', 'reject', 'request'].includes(action)) return res.status(400).json({ success: false, message: 'Invalid KYC action' });
    await data.updateSellerKyc(req.db, req.params.id, action, String(req.body?.notes || '').trim(), getAdminId(req));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update KYC', error: error.message });
  }
});

router.post('/sellers/:id/bank/:action', async (req, res) => {
  try {
    const action = String(req.params.action || '').trim();
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, message: 'Invalid bank action' });
    await data.updateSellerBank(req.db, req.params.id, action, String(req.body?.notes || '').trim(), getAdminId(req));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update bank verification', error: error.message });
  }
});

router.post('/sellers/:id/payout/:action', async (req, res) => {
  try {
    const action = String(req.params.action || '').trim();
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, message: 'Invalid payout action' });
    if (action === 'approve') {
      const transactionReference = String(req.body?.transactionReference || '').trim();
      if (!transactionReference) {
        return res.status(400).json({ success: false, message: 'Transaction reference is required' });
      }
      await data.approvePayout(req.db, req.params.id, String(req.body?.notes || '').trim(), getAdminId(req), transactionReference);
    } else {
      await data.rejectPayout(req.db, req.params.id, String(req.body?.notes || '').trim(), getAdminId(req));
    }
    return res.json({ success: true });
  } catch (error) {
    if (error.message === 'This payout has already been processed.') {
      return res.status(409).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Failed to process payout action', error: error.message });
  }
});

router.post('/payouts/batch-approve', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    await data.batchApprovePayouts(req.db, ids, getAdminId(req));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to batch approve payouts', error: error.message });
  }
});

module.exports = router;
