// Seller Refunds and Returns Data Module

const refundsState = {
  returns: [
    {
      id: 'RET-001',
      orderId: 'ORD-001',
      customer: 'John Doe',
      email: 'john@example.com',
      phone: '+1 (555) 123-4567',
      product: 'Wireless Headphones',
      price: 89.99,
      dateRequested: '2025-11-22',
      reason: 'The headphones stopped working after 2 days. The left ear is not producing any sound.',
      refund: 89.99,
      status: 'Pending',
      timeline: ['Requested'],
      images: ['https://via.placeholder.com/100?text=Image+1', 'https://via.placeholder.com/100?text=Image+2'],
      statusNotes: []
    },
    {
      id: 'RET-002',
      orderId: 'ORD-002',
      customer: 'Jane Smith',
      email: 'jane@example.com',
      phone: '+1 (555) 234-5678',
      product: 'USB-C Cable',
      price: 15.99,
      dateRequested: '2025-11-21',
      reason: 'Received wrong color. Ordered white but got black.',
      refund: 15.99,
      status: 'Approved',
      timeline: ['Requested', 'Approved'],
      images: ['https://via.placeholder.com/100?text=Cable'],
      statusNotes: []
    },
    {
      id: 'RET-003',
      orderId: 'ORD-003',
      customer: 'Mike Johnson',
      email: 'mike@example.com',
      phone: '+1 (555) 345-6789',
      product: 'Phone Case',
      price: 24.99,
      dateRequested: '2025-11-20',
      reason: 'Case is damaged - has cracks on the corner.',
      refund: 24.99,
      status: 'Completed',
      timeline: ['Requested', 'Approved', 'Completed'],
      images: [],
      statusNotes: []
    },
    {
      id: 'RET-004',
      orderId: 'ORD-004',
      customer: 'Sarah Williams',
      email: 'sarah@example.com',
      phone: '+1 (555) 456-7890',
      product: 'Screen Protector',
      price: 9.99,
      dateRequested: '2025-11-19',
      reason: 'Not compatible with my phone model.',
      refund: 0,
      status: 'Rejected',
      timeline: ['Requested', 'Rejected'],
      images: [],
      statusNotes: []
    },
    {
      id: 'RET-005',
      orderId: 'ORD-005',
      customer: 'Tom Brown',
      email: 'tom@example.com',
      phone: '+1 (555) 567-8901',
      product: 'Laptop Stand',
      price: 45.99,
      dateRequested: '2025-11-18',
      reason: 'Change of mind. Product is too heavy for my desk.',
      refund: 45.99,
      status: 'Pending',
      timeline: ['Requested'],
      images: ['https://via.placeholder.com/100?text=Stand'],
      statusNotes: []
    },
    {
      id: 'RET-006',
      orderId: 'ORD-006',
      customer: 'Lisa Anderson',
      email: 'lisa@example.com',
      phone: '+1 (555) 678-9012',
      product: 'Keyboard',
      price: 79.99,
      dateRequested: '2025-11-17',
      reason: 'Keys are not responding properly.',
      refund: 79.99,
      status: 'Pending',
      timeline: ['Requested'],
      images: [],
      statusNotes: []
    },
    {
      id: 'RET-007',
      orderId: 'ORD-007',
      customer: 'David Lee',
      email: 'david@example.com',
      phone: '+1 (555) 789-0123',
      product: 'Mouse Pad',
      price: 12.99,
      dateRequested: '2025-11-16',
      reason: 'Surface is slippery, mouse does not grip.',
      refund: 12.99,
      status: 'Completed',
      timeline: ['Requested', 'Approved', 'Completed'],
      images: ['https://via.placeholder.com/100?text=Mousepad'],
      statusNotes: []
    },
    {
      id: 'RET-008',
      orderId: 'ORD-008',
      customer: 'Emma Davis',
      email: 'emma@example.com',
      phone: '+1 (555) 890-1234',
      product: 'USB Hub',
      price: 34.99,
      dateRequested: '2025-11-15',
      reason: 'Only 2 out of 4 USB ports are working.',
      refund: 34.99,
      status: 'Approved',
      timeline: ['Requested', 'Approved'],
      images: [],
      statusNotes: []
    }
  ]
};

const VALID_STATUSES = ['Requested', 'Pending', 'Under Review', 'Approved', 'Rejected', 'Completed'];

function getOverview() {
  const pendingCount = refundsState.returns.filter(item => item.status === 'Pending').length;
  const approvedCount = refundsState.returns.filter(item => item.status === 'Approved').length;
  const rejectedCount = refundsState.returns.filter(item => item.status === 'Rejected').length;
  const completedCount = refundsState.returns.filter(item => item.status === 'Completed').length;

  const totalRefunded = refundsState.returns
    .filter(item => item.status === 'Completed')
    .reduce((sum, item) => sum + Number(item.refund || 0), 0);

  return {
    pendingCount,
    approvedCount,
    rejectedCount,
    completedCount,
    totalRequests: refundsState.returns.length,
    totalRefunded: totalRefunded.toFixed(2)
  };
}

function filterReturns(query = {}) {
  const { search = '', status = '', page = 1, pageSize = 10 } = query;

  let filtered = [...refundsState.returns];

  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(item =>
      item.id.toLowerCase().includes(s) ||
      item.orderId.toLowerCase().includes(s) ||
      item.customer.toLowerCase().includes(s) ||
      item.product.toLowerCase().includes(s)
    );
  }

  if (status) {
    filtered = filtered.filter(item => item.status === status);
  }

  filtered.sort((a, b) => new Date(b.dateRequested) - new Date(a.dateRequested));

  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 10);
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const start = (safePage - 1) * safePageSize;

  return {
    returns: filtered.slice(start, start + safePageSize),
    pagination: {
      currentPage: safePage,
      pageSize: safePageSize,
      totalItems,
      totalPages
    }
  };
}

function getReturnById(returnId) {
  return refundsState.returns.find(item => item.id === returnId);
}

function normalizeTimelineForStatus(returnItem, status) {
  const has = key => returnItem.timeline.includes(key);

  if (!has('Requested')) returnItem.timeline.push('Requested');

  if (status === 'Under Review' && !has('Under Review')) {
    returnItem.timeline.push('Under Review');
  }

  if ((status === 'Approved' || status === 'Rejected') && !has(status)) {
    if (!has('Under Review')) returnItem.timeline.push('Under Review');
    returnItem.timeline.push(status);
  }

  if (status === 'Completed') {
    if (!has('Under Review')) returnItem.timeline.push('Under Review');
    if (!has('Approved')) returnItem.timeline.push('Approved');
    if (!has('Completed')) returnItem.timeline.push('Completed');
  }
}

function updateReturnStatus(returnId, status, notes = '') {
  const returnItem = getReturnById(returnId);
  if (!returnItem) return null;

  if (!VALID_STATUSES.includes(status)) {
    return { success: false, message: 'Invalid status value' };
  }

  const oldStatus = returnItem.status;
  returnItem.status = status;
  normalizeTimelineForStatus(returnItem, status);

  if (notes && notes.trim()) {
    returnItem.statusNotes.unshift({
      status,
      note: notes.trim(),
      createdAt: new Date().toISOString()
    });
  }

  return {
    success: true,
    oldStatus,
    newStatus: status,
    data: returnItem
  };
}

function approveReturn(returnId, notes = '') {
  const returnItem = getReturnById(returnId);
  if (!returnItem) return null;

  if (!returnItem.refund || returnItem.refund <= 0) {
    returnItem.refund = Number(returnItem.price || 0);
  }

  return updateReturnStatus(returnId, 'Approved', notes || 'Approved by seller');
}

function rejectReturn(returnId, notes = '') {
  const result = updateReturnStatus(returnId, 'Rejected', notes || 'Rejected by seller');
  if (result && result.success) {
    result.data.refund = 0;
  }
  return result;
}

function completeReturn(returnId, notes = '') {
  return updateReturnStatus(returnId, 'Completed', notes || 'Refund completed');
}

function calculateRefund(payload = {}) {
  const productPrice = Number(payload.price) || 0;
  const shippingFee = Number(payload.shippingFee) || 0;
  const commissionPercent = Number(payload.commissionPercent) || 0;
  const returnFee = Number(payload.returnFee) || 0;

  const commissionAmount = productPrice * (commissionPercent / 100);
  const finalRefund = Math.max(0, productPrice + shippingFee - commissionAmount - returnFee);

  return {
    productPrice: productPrice.toFixed(2),
    shippingFee: shippingFee.toFixed(2),
    commissionPercent: commissionPercent.toFixed(2),
    commissionAmount: commissionAmount.toFixed(2),
    returnFee: returnFee.toFixed(2),
    finalRefund: finalRefund.toFixed(2)
  };
}

function getMeta() {
  return {
    statuses: VALID_STATUSES,
    timelineSteps: ['Requested', 'Under Review', 'Approved', 'Rejected', 'Completed']
  };
}

module.exports = {
  refundsState,
  VALID_STATUSES,
  getOverview,
  filterReturns,
  getReturnById,
  updateReturnStatus,
  approveReturn,
  rejectReturn,
  completeReturn,
  calculateRefund,
  getMeta
};
