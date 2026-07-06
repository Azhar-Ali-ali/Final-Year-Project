const express = require('express');
const sellerData = require('../data/sellerManagementData');

const router = express.Router();

function getAdminId(req) {
  return String(req.headers['x-admin-id'] || req.body?.admin || req.query?.admin || '').trim() || null;
}

async function resolveSellerId(req) {
  const provided = String(req.params.id || req.query.sellerId || req.body?.sellerId || '').trim();
  if (provided) {
    const profileMatch = await req.db.query(
      `
        SELECT user_id
        FROM public.seller_profiles
        WHERE user_id::text = $1
        LIMIT 1
      `,
      [provided]
    );

    if (profileMatch.rows.length) {
      return profileMatch.rows[0].user_id;
    }

    const userMatch = await req.db.query(
      `
        SELECT id
        FROM public.users
        WHERE id::text = $1 AND role::text = 'seller'
        LIMIT 1
      `,
      [provided]
    );

    if (userMatch.rows.length) {
      return userMatch.rows[0].id;
    }

    return null;
  }

  const fallback = await req.db.query(
    `
      SELECT id
      FROM public.users
      WHERE role::text = 'seller'
      ORDER BY created_at ASC
      LIMIT 1
    `
  );

  return fallback.rows[0]?.id || null;
}

function notFound(res, message = 'Seller not found') {
  return res.status(404).json({ success: false, message });
}

router.get('/overview', async (req, res) => {
  try {
    const data = await sellerData.getOverviewStats(req.db);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const sellers = await sellerData.fetchSellers(req.db);
    const data = sellerData.filterSellers(sellers, req.query || {});
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await sellerData.getSellerById(req.db, sellerId);
    if (!data) return notFound(res);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/kyc/approve', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await sellerData.approveKyc(req.db, sellerId, getAdminId(req), req.body?.notes || '');
    res.json({ success: true, data, message: `KYC approved for ${data.businessName}` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/kyc/reject', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Rejection reason required' });
    }
    const data = await sellerData.rejectKyc(req.db, sellerId, reason, getAdminId(req), req.body?.notes || '');
    res.json({ success: true, data, message: `KYC rejected for ${data.businessName}` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/strikes/issue', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Strike reason required' });
    }
    const data = await sellerData.issueStrike(req.db, sellerId, reason, getAdminId(req));
    res.json({ success: true, data, message: `Strike issued. Total strikes: ${data.strikes}/3${data.strikes >= 3 ? ' - Account suspended' : ''}` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/strikes/clear', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await sellerData.clearStrikes(req.db, sellerId, getAdminId(req));
    res.json({ success: true, data, message: `Strikes cleared for ${data.businessName}` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/status', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const status = String(req.body?.status || '').trim();
    if (!['active', 'frozen', 'suspended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Valid status required (active, frozen, suspended)' });
    }
    const data = await sellerData.updateStatus(req.db, sellerId, status, getAdminId(req), req.body?.reason || '');
    res.json({ success: true, data, message: `Status changed to ${status} for ${data.businessName}` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/subscription', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const subscription = String(req.body?.subscription || '').trim();
    if (!['basic', 'premium', 'enterprise'].includes(subscription)) {
      return res.status(400).json({ success: false, message: 'Invalid subscription plan' });
    }
    const data = await sellerData.updateSubscription(req.db, sellerId, subscription, getAdminId(req));
    res.json({ success: true, data, message: `Subscription updated for ${data.businessName}` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/payout/process', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await sellerData.processPayout(req.db, sellerId, req.body?.amount, req.body?.method || 'bank_transfer', getAdminId(req));
    if (!data) return notFound(res);
    res.status(201).json({ success: true, data, message: `Payout of $${Number(data.payout.amount || 0).toFixed(2)} processed for ${data.seller.businessName}` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await sellerData.updateSellerInfo(req.db, sellerId, req.body || {}, getAdminId(req));
    res.json({ success: true, data, message: 'Seller information updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/bank-account/verify', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await sellerData.updateBankAccountVerification(req.db, sellerId, 'verify', req.body || {}, getAdminId(req));
    res.json({ success: true, data, message: 'Bank account verified successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/bank-account/reject', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await sellerData.updateBankAccountVerification(req.db, sellerId, 'reject', req.body || {}, getAdminId(req));
    res.json({ success: true, data, message: 'Bank account rejected successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/bank-account/request-reupload', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await sellerData.updateBankAccountVerification(req.db, sellerId, 'request-reupload', req.body || {}, getAdminId(req));
    res.json({ success: true, data, message: 'Re-upload request sent successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/notes', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    if (req.body?.notes === undefined) {
      return res.status(400).json({ success: false, message: 'Notes field required' });
    }
    const data = await sellerData.updateNotes(req.db, sellerId, req.body.notes, getAdminId(req));
    res.json({ success: true, data, message: 'Notes updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/bulk/approve', async (req, res) => {
  try {
    const sellerIds = Array.isArray(req.body?.sellerIds) ? req.body.sellerIds : [];
    if (!sellerIds.length) {
      return res.status(400).json({ success: false, message: 'Seller IDs array required' });
    }
    const data = await sellerData.bulkApprove(req.db, sellerIds, getAdminId(req));
    res.json({ success: true, data, message: `${data.approved.length} sellers approved, ${data.failed.length} failed` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/bulk/freeze', async (req, res) => {
  try {
    const sellerIds = Array.isArray(req.body?.sellerIds) ? req.body.sellerIds : [];
    if (!sellerIds.length) {
      return res.status(400).json({ success: false, message: 'Seller IDs array required' });
    }
    const data = await sellerData.bulkFreeze(req.db, sellerIds, getAdminId(req), req.body?.reason || 'Bulk freeze operation');
    res.json({ success: true, data, message: `${data.frozen.length} sellers frozen, ${data.failed.length} failed` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/bulk/terminate', async (req, res) => {
  try {
    const sellerIds = Array.isArray(req.body?.sellerIds) ? req.body.sellerIds : [];
    if (!sellerIds.length) {
      return res.status(400).json({ success: false, message: 'Seller IDs array required' });
    }
    const data = await sellerData.bulkTerminate(req.db, sellerIds, getAdminId(req), req.body?.reason || 'Bulk termination');
    res.json({ success: true, data, message: `${data.terminated.length} sellers terminated, ${data.failed.length} failed` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/subscription-plans', (req, res) => {
  res.json({ success: true, data: sellerData.getSubscriptionPlans() });
});

router.get('/payouts', async (req, res) => {
  try {
    const data = await sellerData.getPayoutHistory(req.db, req.query || {});
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/audit-log', async (req, res) => {
  try {
    const data = await sellerData.getAuditLog(req.db, req.query || {});
    res.json({ success: true, data, total: data.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/analytics/top-performers', async (req, res) => {
  try {
    const metric = String(req.query.metric || 'revenue');
    const limit = req.query.limit || 10;
    const data = await sellerData.getTopPerformers(req.db, metric, limit);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/analytics/risk-assessment', async (req, res) => {
  try {
    const data = await sellerData.getRiskAssessment(req.db);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/export/csv', async (req, res) => {
  try {
    const sellers = await sellerData.fetchSellers(req.db);
    const result = sellerData.filterSellers(sellers, {
      search: req.query.search,
      kycStatus: req.query.kycStatus,
      status: req.query.status,
      riskLevel: req.query.riskLevel,
      page: 1,
      pageSize: 10000
    });

    const headers = [
      'id', 'businessName', 'owner', 'email', 'phone', 'registeredDate',
      'kycStatus', 'status', 'products', 'revenue', 'orders', 'rating',
      'subscription', 'payoutStatus', 'pendingPayout', 'riskLevel', 'strikes'
    ];

    const rows = result.sellers.map((seller) => headers.map((h) => {
      const value = seller[h] ?? '';
      return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
    }).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=sellers.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
