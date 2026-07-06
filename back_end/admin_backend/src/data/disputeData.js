const disputeState = {
  platform: {
    revenue: 145000,
    commissionsCollected: 38000,
    refundsIssued: 12000,
    finesCollected: 2500,
    ledgerBalance: 0,
    totalDisputes: 0,
    resolvedDisputes: 0
  },
  sellers: [
    {
      id: 'S001',
      name: 'ElectroHub Store',
      email: 'contact@electrohub.com',
      availableBalance: 28500,
      pendingBalance: 5200,
      totalEarnings: 125000,
      refundDeductions: 2100,
      finesApplied: 500,
      totalDisputesCount: 8,
      totalDisputesResolved: 6,
      disputeRate: 0.064,
      refundRate: 0.045,
      lateDeliveryPercentage: 8,
      chatViolations: 2,
      status: 'active',
      kycStatus: 'verified',
      riskScore: 45,
      listings: 2400
    },
    {
      id: 'S002',
      name: 'FashionHub',
      email: 'support@fashionhub.com',
      availableBalance: 18900,
      pendingBalance: 3400,
      totalEarnings: 92000,
      refundDeductions: 3500,
      finesApplied: 1200,
      totalDisputesCount: 12,
      totalDisputesResolved: 10,
      disputeRate: 0.098,
      refundRate: 0.072,
      lateDeliveryPercentage: 15,
      chatViolations: 5,
      status: 'active',
      kycStatus: 'verified',
      riskScore: 68,
      listings: 1800
    },
    {
      id: 'S003',
      name: 'HomeDecor Plus',
      email: 'team@homedecorplus.com',
      availableBalance: 12300,
      pendingBalance: 2100,
      totalEarnings: 65000,
      refundDeductions: 950,
      finesApplied: 300,
      totalDisputesCount: 2,
      totalDisputesResolved: 2,
      disputeRate: 0.021,
      refundRate: 0.018,
      lateDeliveryPercentage: 3,
      chatViolations: 0,
      status: 'active',
      kycStatus: 'verified',
      riskScore: 22,
      listings: 950
    },
    {
      id: 'S004',
      name: 'BookWorld',
      email: 'support@bookworld.com',
      availableBalance: -850,
      pendingBalance: 1200,
      totalEarnings: 45000,
      refundDeductions: 4200,
      finesApplied: 2500,
      totalDisputesCount: 18,
      totalDisputesResolved: 14,
      disputeRate: 0.156,
      refundRate: 0.118,
      lateDeliveryPercentage: 22,
      chatViolations: 8,
      status: 'active',
      kycStatus: 'pending',
      riskScore: 92,
      listings: 1200
    },
    {
      id: 'S005',
      name: 'TechWorld',
      email: 'contact@techworld.com',
      availableBalance: 5200,
      pendingBalance: 0,
      totalEarnings: 32000,
      refundDeductions: 5600,
      finesApplied: 3100,
      totalDisputesCount: 22,
      totalDisputesResolved: 18,
      disputeRate: 0.187,
      refundRate: 0.145,
      lateDeliveryPercentage: 28,
      chatViolations: 12,
      status: 'deactivated',
      kycStatus: 'rejected',
      riskScore: 98,
      listings: 0
    }
  ],
  buyers: [
    { id: 'B001', name: 'Rahul Kumar', email: 'rahul@email.com', phone: '9876543210', status: 'active' },
    { id: 'B002', name: 'Priya Singh', email: 'priya@email.com', phone: '9876543211', status: 'active' },
    { id: 'B003', name: 'Amit Patel', email: 'amit@email.com', phone: '9876543212', status: 'active' },
    { id: 'B004', name: 'Neha Gupta', email: 'neha@email.com', phone: '9876543213', status: 'blocked' },
    { id: 'B005', name: 'Vikram Joshi', email: 'vikram@email.com', phone: '9876543214', status: 'active' }
  ],
  orders: [
    {
      id: 'ORD001',
      buyerId: 'B001',
      buyerName: 'Rahul Kumar',
      sellerId: 'S001',
      sellerName: 'ElectroHub Store',
      product: 'Wireless Earbuds',
      amount: 1299,
      escrowAmount: 1299,
      status: 'under-dispute',
      paymentMethod: 'credit-card',
      deliveryDate: '2025-02-15',
      createdDate: '2025-02-01'
    },
    {
      id: 'ORD002',
      buyerId: 'B002',
      buyerName: 'Priya Singh',
      sellerId: 'S002',
      sellerName: 'FashionHub',
      product: 'Summer Dress',
      amount: 599,
      escrowAmount: 599,
      status: 'delivered',
      paymentMethod: 'upi',
      deliveryDate: '2025-02-12',
      createdDate: '2025-02-05'
    },
    {
      id: 'ORD003',
      buyerId: 'B003',
      buyerName: 'Amit Patel',
      sellerId: 'S001',
      sellerName: 'ElectroHub Store',
      product: 'USB-C Cable',
      amount: 349,
      escrowAmount: 349,
      status: 'under-dispute',
      paymentMethod: 'debit-card',
      deliveryDate: '2025-02-18',
      createdDate: '2025-02-08'
    }
  ],
  disputes: [
    {
      id: 'DT001',
      orderId: 'ORD001',
      buyerId: 'B001',
      buyerName: 'Rahul Kumar',
      sellerId: 'S001',
      sellerName: 'ElectroHub Store',
      issueType: 'damaged',
      description: 'Earbuds received with broken right speaker',
      evidenceSubmitted: ['photo-1.jpg', 'video-1.mp4'],
      escrowStatus: 'held',
      payoutStatus: 'blocked',
      priority: 'high',
      status: 'under-review',
      createdDate: '2025-02-16',
      updatedDate: '2025-02-19',
      sellerResponse: 'Ready to send replacement or refund',
      buyerResponse: 'Need refund, do not want replacement',
      adminNotes: '',
      resolution: null
    },
    {
      id: 'DT002',
      orderId: 'ORD003',
      buyerId: 'B003',
      buyerName: 'Amit Patel',
      sellerId: 'S001',
      sellerName: 'ElectroHub Store',
      issueType: 'wrong-item',
      description: 'Received USB-A instead of USB-C cable',
      evidenceSubmitted: ['photo-2.jpg'],
      escrowStatus: 'held',
      payoutStatus: 'blocked',
      priority: 'medium',
      status: 'open',
      createdDate: '2025-02-19',
      updatedDate: '2025-02-19',
      sellerResponse: null,
      buyerResponse: null,
      adminNotes: '',
      resolution: null
    }
  ],
  chats: [
    {
      orderId: 'ORD001',
      buyerId: 'B001',
      buyerName: 'Rahul Kumar',
      sellerId: 'S001',
      sellerName: 'ElectroHub Store',
      status: 'escalated',
      flags: ['rude-language'],
      messages: [
        { role: 'buyer', name: 'Rahul Kumar', text: 'Hi, I received earbuds but right speaker is broken', time: '2025-02-16 10:30' },
        { role: 'seller', name: 'ElectroHub Store', text: 'Sorry to hear that. Can you send us photos?', time: '2025-02-16 11:15' }
      ],
      lastMessageTime: '2025-02-16 14:15',
      adminJoined: false,
      adminMessages: []
    },
    {
      orderId: 'ORD003',
      buyerId: 'B003',
      buyerName: 'Amit Patel',
      sellerId: 'S001',
      sellerName: 'ElectroHub Store',
      status: 'normal',
      flags: [],
      messages: [
        { role: 'buyer', name: 'Amit Patel', text: 'Hi, I ordered USB-C cable but received USB-A', time: '2025-02-19 09:00' }
      ],
      lastMessageTime: '2025-02-19 10:30',
      adminJoined: false,
      adminMessages: []
    }
  ],
  enforcementActions: [
    {
      id: 'EA001',
      subject: 'BookWorld',
      subjectType: 'seller',
      actionType: 'fine',
      amount: 2500,
      reason: 'High dispute rate (18.6%)',
      dateApplied: '2025-02-15',
      status: 'active',
      notes: 'Fine due to excessive disputes and policy violations'
    },
    {
      id: 'EA002',
      subject: 'Neha Gupta',
      subjectType: 'buyer',
      actionType: 'blocking',
      amount: null,
      reason: 'Refund abuse pattern',
      dateApplied: '2025-02-10',
      status: 'active',
      notes: 'Blocked account and IP after 5 false refund claims'
    }
  ],
  auditLog: []
};

function recalculatePlatformMetrics() {
  const totalDisputes = disputeState.disputes.length;
  const resolvedDisputes = disputeState.disputes.filter((d) => d.status === 'resolved').length;

  disputeState.platform.totalDisputes = totalDisputes;
  disputeState.platform.resolvedDisputes = resolvedDisputes;
  disputeState.platform.ledgerBalance =
    disputeState.platform.revenue -
    disputeState.platform.commissionsCollected -
    disputeState.platform.refundsIssued +
    disputeState.platform.finesCollected;
}

function getRiskLevel(riskScore) {
  if (riskScore < 30) return 'low';
  if (riskScore < 60) return 'medium';
  if (riskScore < 85) return 'high';
  return 'frozen';
}

function addAudit(actionType, details = {}) {
  const entry = {
    id: `AL${Date.now()}`,
    adminId: 'ADMIN001',
    adminName: 'System Admin',
    actionType,
    timestamp: new Date().toISOString(),
    ...details
  };
  disputeState.auditLog.unshift(entry);
  return entry;
}

recalculatePlatformMetrics();

module.exports = {
  disputeState,
  recalculatePlatformMetrics,
  getRiskLevel,
  addAudit
};
