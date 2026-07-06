// Seller Dispute Management Data Module

const disputeState = {
  disputes: [
    {
      id: 'DSP-001',
      type: 'Return issue',
      orderId: 'ORD-1287',
      customer: 'Ayesha Khan',
      dateRaised: '2026-03-05',
      dateOrdered: '2026-03-01',
      status: 'Pending',
      amount: 89.99,
      description: 'Customer refuses to accept the returned item. Says the item was damaged on arrival but no evidence provided.',
      evidence: ['https://via.placeholder.com/120?text=Photo+1', 'https://via.placeholder.com/120?text=Photo+2'],
      reviewer: 'Admin - John Smith',
      timeline: [
        { action: 'Raised', date: '2026-03-05T10:30:00Z', by: 'Seller' }
      ],
      adminDecision: null,
      priority: 'Medium'
    },
    {
      id: 'DSP-002',
      type: 'Payment issue',
      orderId: 'ORD-1286',
      customer: 'Hassan Raza',
      dateRaised: '2026-03-04',
      dateOrdered: '2026-02-28',
      status: 'Under Review',
      amount: 45.50,
      description: 'Customer charged twice for the same order. Request for refund of duplicate payment.',
      evidence: ['https://via.placeholder.com/120?text=Receipt'],
      reviewer: 'Admin - Sarah Lee',
      timeline: [
        { action: 'Raised', date: '2026-03-04T14:20:00Z', by: 'Seller' },
        { action: 'Under Review', date: '2026-03-05T09:15:00Z', by: 'Admin - Sarah Lee' }
      ],
      adminDecision: null,
      priority: 'High'
    },
    {
      id: 'DSP-003',
      type: 'Policy issue',
      orderId: 'ORD-1285',
      customer: 'Fatima Ali',
      dateRaised: '2026-03-02',
      dateOrdered: '2026-02-20',
      status: 'Resolved',
      amount: 120.00,
      description: 'Seller violated return policy by refusing to accept return request after 15 days.',
      evidence: [],
      reviewer: 'Admin - Mike Johnson',
      timeline: [
        { action: 'Raised', date: '2026-03-02T11:00:00Z', by: 'Seller' },
        { action: 'Under Review', date: '2026-03-03T10:30:00Z', by: 'Admin - Mike Johnson' },
        { action: 'Resolved', date: '2026-03-04T16:45:00Z', by: 'Admin - Mike Johnson' }
      ],
      adminDecision: {
        decision: 'Approved',
        comments: 'Return period was still valid. Seller must accept return.',
        compensation: 120.00,
        date: '2026-03-04'
      },
      priority: 'Low'
    },
    {
      id: 'DSP-004',
      type: 'Other',
      orderId: 'ORD-1284',
      customer: 'Sara Ahmed',
      dateRaised: '2026-03-01',
      dateOrdered: '2026-02-25',
      status: 'Rejected',
      amount: 34.99,
      description: 'Customer complaint about slow delivery. But tracking shows delivery on time.',
      evidence: [],
      reviewer: 'Admin - Emma Davis',
      timeline: [
        { action: 'Raised', date: '2026-03-01T09:00:00Z', by: 'Seller' },
        { action: 'Under Review', date: '2026-03-02T08:30:00Z', by: 'Admin - Emma Davis' },
        { action: 'Resolved', date: '2026-03-03T14:20:00Z', by: 'Admin - Emma Davis' }
      ],
      adminDecision: {
        decision: 'Rejected',
        comments: 'No valid reason found. Order delivered within promised timeframe.',
        compensation: 0,
        date: '2026-03-03'
      },
      priority: 'Low'
    },
    {
      id: 'DSP-005',
      type: 'Return issue',
      orderId: 'ORD-1283',
      customer: 'Omar Sheikh',
      dateRaised: '2026-02-29',
      dateOrdered: '2026-02-22',
      status: 'Resolved',
      amount: 79.99,
      description: 'Wrong item sent to customer. Item received was not matching the order.',
      evidence: ['https://via.placeholder.com/120?text=Wrong+Item'],
      reviewer: 'Admin - John Smith',
      timeline: [
        { action: 'Raised', date: '2026-02-29T13:45:00Z', by: 'Seller' },
        { action: 'Under Review', date: '2026-03-01T10:00:00Z', by: 'Admin - John Smith' },
        { action: 'Resolved', date: '2026-03-02T15:30:00Z', by: 'Admin - John Smith' }
      ],
      adminDecision: {
        decision: 'Approved',
        comments: 'Clear error on seller side. Full refund approved.',
        compensation: 79.99,
        date: '2026-03-02'
      },
      priority: 'High'
    },
    {
      id: 'DSP-006',
      type: 'Payment issue',
      orderId: 'ORD-1282',
      customer: 'Zainab Malik',
      dateRaised: '2026-02-28',
      dateOrdered: '2026-02-24',
      status: 'Under Review',
      amount: 55.75,
      description: 'Payment gateway error. Money deducted but order not placed. Need to process order.',
      evidence: ['https://via.placeholder.com/120?text=Bank+Slip'],
      reviewer: 'Admin - Sarah Lee',
      timeline: [
        { action: 'Raised', date: '2026-02-28T16:20:00Z', by: 'Seller' },
        { action: 'Under Review', date: '2026-03-01T09:45:00Z', by: 'Admin - Sarah Lee' }
      ],
      adminDecision: null,
      priority: 'High'
    },
    {
      id: 'DSP-007',
      type: 'Return issue',
      orderId: 'ORD-1281',
      customer: 'Ali Rehman',
      dateRaised: '2026-02-27',
      dateOrdered: '2026-02-18',
      status: 'Resolved',
      amount: 12.99,
      description: 'Customer claims product is defective. Seller disputes claim.',
      evidence: ['https://via.placeholder.com/120?text=Defect+Photo'],
      reviewer: 'Admin - Mike Johnson',
      timeline: [
        { action: 'Raised', date: '2026-02-27T11:15:00Z', by: 'Seller' },
        { action: 'Under Review', date: '2026-02-28T10:20:00Z', by: 'Admin - Mike Johnson' },
        { action: 'Resolved', date: '2026-03-01T14:00:00Z', by: 'Admin - Mike Johnson' }
      ],
      adminDecision: {
        decision: 'Approved',
        comments: 'Evidence clearly shows product defect. Refund approved.',
        compensation: 12.99,
        date: '2026-03-01'
      },
      priority: 'Medium'
    },
    {
      id: 'DSP-008',
      type: 'Policy issue',
      orderId: 'ORD-1280',
      customer: 'Noor Fatima',
      dateRaised: '2026-02-26',
      dateOrdered: '2026-02-15',
      status: 'Pending',
      amount: 34.99,
      description: 'Customer violated return policy by returning opened beauty product against policy.',
      evidence: [],
      reviewer: 'Admin - Emma Davis',
      timeline: [
        { action: 'Raised', date: '2026-02-26T15:30:00Z', by: 'Seller' }
      ],
      adminDecision: null,
      priority: 'Low'
    }
  ],

  notifications: [
    { 
      id: 'NTF-001',
      type: 'alert', 
      title: 'Admin Requested Evidence', 
      text: 'Admin has requested additional evidence for dispute DSP-002. Please upload within 48 hours.',
      date: '2026-03-05',
      read: false
    },
    { 
      id: 'NTF-002',
      type: 'success', 
      title: 'Dispute Resolved', 
      text: 'Dispute DSP-003 has been resolved. Full compensation of $120.00 approved.',
      date: '2026-03-04',
      read: false
    },
    { 
      id: 'NTF-003',
      type: 'info', 
      title: 'Dispute Escalated', 
      text: 'Dispute DSP-001 has been escalated to senior admin for final decision.',
      date: '2026-03-03',
      read: false
    },
    { 
      id: 'NTF-004',
      type: 'alert', 
      title: 'Action Required', 
      text: 'Dispute DSP-005 resolved with compensation. Please process refund within 48 hours.',
      date: '2026-03-02',
      read: true
    },
    { 
      id: 'NTF-005',
      type: 'success', 
      title: 'Dispute Created', 
      text: 'Your new dispute DSP-006 has been created and assigned to an admin reviewer.',
      date: '2026-02-28',
      read: true
    },
    { 
      id: 'NTF-006',
      type: 'info', 
      title: 'Status Update', 
      text: 'Dispute DSP-004 status changed to Rejected. You can view the decision in dispute details.',
      date: '2026-03-03',
      read: true
    }
  ]
};

function getOverview() {
  const total = disputeState.disputes.length;
  const pending = disputeState.disputes.filter(d => d.status === 'Pending').length;
  const underReview = disputeState.disputes.filter(d => d.status === 'Under Review').length;
  const resolved = disputeState.disputes.filter(d => d.status === 'Resolved').length;
  const rejected = disputeState.disputes.filter(d => d.status === 'Rejected').length;
  
  // Calculate total compensation
  const totalCompensation = disputeState.disputes
    .filter(d => d.adminDecision && d.adminDecision.compensation)
    .reduce((sum, d) => sum + d.adminDecision.compensation, 0);

  return {
    total,
    pending,
    underReview,
    resolved,
    rejected,
    totalCompensation: totalCompensation.toFixed(2)
  };
}

function filterDisputes(query = {}) {
  const { search = '', type = '', status = '', page = 1, pageSize = 10 } = query;
  
  let filtered = [...disputeState.disputes];
  
  // Search filter (by dispute ID or order ID)
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(dispute =>
      dispute.id.toLowerCase().includes(searchLower) ||
      dispute.orderId.toLowerCase().includes(searchLower) ||
      dispute.customer.toLowerCase().includes(searchLower)
    );
  }
  
  // Type filter
  if (type) {
    filtered = filtered.filter(dispute => dispute.type === type);
  }
  
  // Status filter
  if (status) {
    filtered = filtered.filter(dispute => dispute.status === status);
  }
  
  // Sort by date (newest first)
  filtered.sort((a, b) => new Date(b.dateRaised) - new Date(a.dateRaised));
  
  // Pagination
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedDisputes = filtered.slice(startIndex, endIndex);
  
  return {
    disputes: paginatedDisputes,
    pagination: {
      currentPage: parseInt(page),
      pageSize: parseInt(pageSize),
      totalItems,
      totalPages
    }
  };
}

function getDisputeById(disputeId) {
  return disputeState.disputes.find(dispute => dispute.id === disputeId);
}

function createDispute(disputeData) {
  const newId = `DSP-${String(disputeState.disputes.length + 1).padStart(3, '0')}`;
  const newDispute = {
    id: newId,
    type: disputeData.type,
    orderId: disputeData.orderId,
    customer: disputeData.customer || 'Unknown Customer',
    dateRaised: new Date().toISOString().split('T')[0],
    dateOrdered: disputeData.dateOrdered || new Date().toISOString().split('T')[0],
    status: 'Pending',
    amount: parseFloat(disputeData.amount) || 0,
    description: disputeData.description,
    evidence: disputeData.evidence || [],
    reviewer: 'Pending Assignment',
    timeline: [
      { action: 'Raised', date: new Date().toISOString(), by: 'Seller' }
    ],
    adminDecision: null,
    priority: disputeData.priority || 'Medium'
  };
  
  disputeState.disputes.unshift(newDispute);
  
  // Add notification
  disputeState.notifications.unshift({
    id: `NTF-${String(disputeState.notifications.length + 1).padStart(3, '0')}`,
    type: 'success',
    title: 'Dispute Created',
    text: `Your new dispute ${newId} has been created and assigned to an admin reviewer.`,
    date: new Date().toISOString().split('T')[0],
    read: false
  });
  
  return newDispute;
}

function getNotifications(unreadOnly = false) {
  let notifs = [...disputeState.notifications];
  
  if (unreadOnly) {
    notifs = notifs.filter(n => !n.read);
  }
  
  return {
    notifications: notifs,
    unreadCount: disputeState.notifications.filter(n => !n.read).length,
    totalCount: disputeState.notifications.length
  };
}

function markNotificationRead(notifId) {
  const notif = disputeState.notifications.find(n => n.id === notifId);
  if (notif) {
    notif.read = true;
    return true;
  }
  return false;
}

module.exports = {
  disputeState,
  getOverview,
  filterDisputes,
  getDisputeById,
  createDispute,
  getNotifications,
  markNotificationRead
};
