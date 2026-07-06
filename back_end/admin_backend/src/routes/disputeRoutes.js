const express = require('express');
const {
  disputeState,
  recalculatePlatformMetrics,
  getRiskLevel,
  addAudit
} = require('../data/disputeData');

const router = express.Router();

function withRisk(dispute) {
  const seller = disputeState.sellers.find((item) => item.id === dispute.sellerId);
  return {
    ...dispute,
    sellerRiskScore: seller ? seller.riskScore : 0,
    sellerRiskLevel: seller ? getRiskLevel(seller.riskScore) : 'low'
  };
}

router.get('/overview', (req, res) => {
  recalculatePlatformMetrics();
  const activeDisputes = disputeState.disputes.filter((d) => ['open', 'under-review', 'escalated'].includes(d.status)).length;
  const resolvedDisputes = disputeState.disputes.filter((d) => d.status === 'resolved').length;

  res.json({
    success: true,
    data: {
      activeDisputes,
      resolvedDisputes,
      totalRefundsIssued: disputeState.platform.refundsIssued,
      finesCollected: disputeState.platform.finesCollected,
      platform: disputeState.platform
    }
  });
});

router.get('/disputes', (req, res) => {
  const { search = '', status = '', type = '', priority = '' } = req.query;
  const keyword = String(search).toLowerCase().trim();

  const data = disputeState.disputes
    .filter((item) => {
      const passSearch =
        !keyword ||
        item.id.toLowerCase().includes(keyword) ||
        item.orderId.toLowerCase().includes(keyword) ||
        item.sellerName.toLowerCase().includes(keyword) ||
        item.buyerName.toLowerCase().includes(keyword);
      const passStatus = !status || item.status === String(status).toLowerCase();
      const passType = !type || item.issueType === String(type).toLowerCase();
      const passPriority = !priority || item.priority === String(priority).toLowerCase();
      return passSearch && passStatus && passType && passPriority;
    })
    .map(withRisk);

  res.json({ success: true, total: data.length, data });
});

router.get('/disputes/:id', (req, res) => {
  const dispute = disputeState.disputes.find((item) => item.id === req.params.id);
  if (!dispute) {
    return res.status(404).json({ success: false, message: 'Dispute not found' });
  }

  const order = disputeState.orders.find((item) => item.id === dispute.orderId) || null;
  const buyer = disputeState.buyers.find((item) => item.id === dispute.buyerId) || null;
  const seller = disputeState.sellers.find((item) => item.id === dispute.sellerId) || null;

  res.json({
    success: true,
    data: {
      ...withRisk(dispute),
      order,
      buyer,
      seller
    }
  });
});

router.post('/disputes/:id/resolve', (req, res) => {
  const dispute = disputeState.disputes.find((item) => item.id === req.params.id);
  if (!dispute) {
    return res.status(404).json({ success: false, message: 'Dispute not found' });
  }

  const order = disputeState.orders.find((item) => item.id === dispute.orderId);
  const seller = disputeState.sellers.find((item) => item.id === dispute.sellerId);

  const { resolutionType, reason = '', refundPercentage = 0 } = req.body;

  if (!resolutionType) {
    return res.status(400).json({ success: false, message: 'resolutionType is required' });
  }

  dispute.status = 'resolved';
  dispute.updatedDate = new Date().toISOString();
  dispute.adminNotes = reason;

  if (resolutionType === 'release-seller') {
    dispute.escrowStatus = 'released';
    dispute.resolution = 'Escrow released to seller';
  } else if (resolutionType === 'full-refund') {
    const amount = order ? order.escrowAmount : 0;
    dispute.escrowStatus = 'refunded';
    dispute.resolution = `Full refund issued: ₹${amount}`;
    disputeState.platform.refundsIssued += amount;
    if (seller) {
      seller.availableBalance -= amount;
      seller.refundDeductions += amount;
    }
  } else if (resolutionType === 'partial-refund') {
    const percent = Number(refundPercentage);
    if (Number.isNaN(percent) || percent <= 0 || percent > 100) {
      return res.status(400).json({ success: false, message: 'refundPercentage must be between 1 and 100' });
    }
    const base = order ? order.escrowAmount : 0;
    const amount = Math.round((base * percent) / 100);
    dispute.escrowStatus = 'split';
    dispute.resolution = `Partial refund (${percent}%): ₹${amount}`;
    disputeState.platform.refundsIssued += amount;
    if (seller) {
      seller.availableBalance -= amount;
      seller.refundDeductions += amount;
    }
  } else {
    return res.status(400).json({ success: false, message: 'Invalid resolutionType' });
  }

  addAudit('dispute-resolved', {
    targetId: dispute.id,
    targetType: 'dispute',
    reason,
    metadata: { resolutionType }
  });
  recalculatePlatformMetrics();

  res.json({ success: true, data: withRisk(dispute) });
});

router.get('/chats', (req, res) => {
  const { search = '', status = '', flags = '' } = req.query;
  const keyword = String(search).toLowerCase().trim();

  const data = disputeState.chats.filter((chat) => {
    const passSearch =
      !keyword ||
      chat.orderId.toLowerCase().includes(keyword) ||
      chat.buyerName.toLowerCase().includes(keyword) ||
      chat.sellerName.toLowerCase().includes(keyword);
    const passStatus = !status || chat.status === String(status).toLowerCase();
    const passFlags = !flags || chat.flags.includes(String(flags).toLowerCase());
    return passSearch && passStatus && passFlags;
  });

  res.json({ success: true, total: data.length, data });
});

router.post('/chats/:orderId/join', (req, res) => {
  const chat = disputeState.chats.find((item) => item.orderId === req.params.orderId);
  if (!chat) {
    return res.status(404).json({ success: false, message: 'Chat not found' });
  }

  chat.adminJoined = true;
  chat.adminMessages.push({
    role: 'admin',
    name: 'System Admin',
    text: 'Admin has joined the conversation to assist in dispute resolution.',
    time: new Date().toISOString()
  });
  chat.lastMessageTime = new Date().toISOString();

  addAudit('admin-joined-chat', {
    targetId: chat.orderId,
    targetType: 'chat',
    reason: 'Admin intervention for dispute management'
  });

  res.json({ success: true, data: chat });
});

router.get('/analytics', (req, res) => {
  const disputeRateBySeller = disputeState.sellers
    .map((seller) => ({
      sellerId: seller.id,
      sellerName: seller.name,
      totalDisputes: seller.totalDisputesCount,
      disputeRate: Number((seller.disputeRate * 100).toFixed(2)),
      riskScore: seller.riskScore,
      riskLevel: getRiskLevel(seller.riskScore)
    }))
    .sort((a, b) => b.totalDisputes - a.totalDisputes);

  const issueTypeBreakdown = disputeState.disputes.reduce((acc, item) => {
    acc[item.issueType] = (acc[item.issueType] || 0) + 1;
    return acc;
  }, {});

  const riskScores = disputeState.sellers.map((seller) => ({
    sellerId: seller.id,
    sellerName: seller.name,
    totalDisputes: seller.totalDisputesCount,
    disputeRate: Number((seller.disputeRate * 100).toFixed(2)),
    riskScore: seller.riskScore,
    riskLevel: getRiskLevel(seller.riskScore),
    status: seller.status
  }));

  res.json({
    success: true,
    data: {
      disputeRateBySeller,
      issueTypeBreakdown,
      riskScores
    }
  });
});

router.get('/enforcement', (req, res) => {
  const { search = '', type = '', status = '' } = req.query;
  const keyword = String(search).toLowerCase().trim();

  const data = disputeState.enforcementActions.filter((item) => {
    const passSearch = !keyword || item.subject.toLowerCase().includes(keyword) || item.reason.toLowerCase().includes(keyword);
    const passType = !type || item.actionType === String(type).toLowerCase();
    const passStatus = !status || item.status === String(status).toLowerCase();
    return passSearch && passType && passStatus;
  });

  res.json({ success: true, total: data.length, data });
});

router.post('/enforcement/fine', (req, res) => {
  const { sellerId, amount, reason = '', notes = '' } = req.body;
  const seller = disputeState.sellers.find((item) => item.id === sellerId);

  if (!seller) {
    return res.status(404).json({ success: false, message: 'Seller not found' });
  }

  const fineAmount = Number(amount);
  if (Number.isNaN(fineAmount) || fineAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Valid fine amount is required' });
  }

  seller.availableBalance -= fineAmount;
  seller.finesApplied += fineAmount;
  disputeState.platform.finesCollected += fineAmount;

  const action = {
    id: `EA${Date.now()}`,
    subject: seller.name,
    subjectType: 'seller',
    actionType: 'fine',
    amount: fineAmount,
    reason,
    dateApplied: new Date().toISOString().split('T')[0],
    status: 'active',
    notes
  };

  disputeState.enforcementActions.unshift(action);
  addAudit('seller-fined', {
    targetId: sellerId,
    targetType: 'seller',
    reason,
    metadata: { amount: fineAmount }
  });
  recalculatePlatformMetrics();

  res.status(201).json({ success: true, data: action });
});

router.post('/enforcement/deactivate-seller', (req, res) => {
  const { sellerId, reason = '', notes = '' } = req.body;
  const seller = disputeState.sellers.find((item) => item.id === sellerId);

  if (!seller) {
    return res.status(404).json({ success: false, message: 'Seller not found' });
  }

  seller.status = 'deactivated';

  const action = {
    id: `EA${Date.now()}`,
    subject: seller.name,
    subjectType: 'seller',
    actionType: 'deactivation',
    amount: null,
    reason,
    dateApplied: new Date().toISOString().split('T')[0],
    status: 'active',
    notes
  };

  disputeState.enforcementActions.unshift(action);
  addAudit('seller-deactivated', {
    targetId: sellerId,
    targetType: 'seller',
    reason
  });

  res.status(201).json({ success: true, data: action });
});

router.post('/enforcement/block-buyer', (req, res) => {
  const { buyerId, reason = '', notes = '' } = req.body;
  const buyer = disputeState.buyers.find((item) => item.id === buyerId);

  if (!buyer) {
    return res.status(404).json({ success: false, message: 'Buyer not found' });
  }

  buyer.status = 'blocked';

  const action = {
    id: `EA${Date.now()}`,
    subject: buyer.name,
    subjectType: 'buyer',
    actionType: 'blocking',
    amount: null,
    reason,
    dateApplied: new Date().toISOString().split('T')[0],
    status: 'active',
    notes
  };

  disputeState.enforcementActions.unshift(action);
  addAudit('buyer-blocked', {
    targetId: buyerId,
    targetType: 'buyer',
    reason
  });

  res.status(201).json({ success: true, data: action });
});

router.get('/audit-log', (req, res) => {
  const limit = Number(req.query.limit || 50);
  const data = disputeState.auditLog.slice(0, Number.isNaN(limit) ? 50 : limit);
  res.json({ success: true, total: data.length, data });
});

module.exports = router;
