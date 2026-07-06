(function () {
  const STORAGE_KEY = 'lumina.returnRequests.v1';

  function getTodayIsoDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function daysBetween(fromIso, toIso) {
    const from = new Date(fromIso + 'T00:00:00');
    const to = new Date(toIso + 'T00:00:00');
    const diff = Math.floor((to - from) / (1000 * 60 * 60 * 24));
    return Number.isNaN(diff) ? 9999 : diff;
  }

  function fallbackSeedData() {
    return [
      {
        returnRequestId: 'RR-900241',
        orderId: 'LM-100241',
        requestDate: '2026-03-12',
        status: 'pending',
        productName: 'Premium Makeup Sponge Set',
        productImage: 'https://images.unsplash.com/photo-1631214524020-7e18db9a8f92?auto=format&fit=crop&w=240&q=80',
        sellerName: 'BeautyHub Store',
        quantity: 1,
        productPrice: 2499,
        selectedReason: 'Damaged product',
        customerDescription: 'One sponge was torn and packaging was crushed on arrival.',
        evidence: [
          'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=300&q=80'
        ],
        sellerMessage: '',
        sellerDecision: 'Seller has not reviewed this request yet.',
        courierName: '',
        pickupSchedule: '',
        returnAddress: '',
        refundAmount: 2499,
        refundMethod: 'Original Card',
        originalPaymentMethod: 'Visa Card ending 2145',
        refundDate: '',
        transactionId: '',
        refundStep: 1
      },
      {
        returnRequestId: 'RR-900176',
        orderId: 'LM-100176',
        requestDate: '2026-03-10',
        status: 'approved',
        productName: 'Matte Lipstick Trio Set',
        productImage: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=240&q=80',
        sellerName: 'LuxeTone Studio',
        quantity: 1,
        productPrice: 1299,
        selectedReason: 'Wrong item received',
        customerDescription: 'Received a different shade set than ordered.',
        evidence: [
          'https://images.unsplash.com/photo-1615212814093-0175f4f4726f?auto=format&fit=crop&w=300&q=80'
        ],
        sellerMessage: 'Your return request has been approved. Please send the product back.',
        sellerDecision: 'Approved because item mismatch was confirmed from batch photo.',
        courierName: 'Leopards Courier',
        pickupSchedule: '2026-03-15, 02:00 PM - 06:00 PM',
        returnAddress: 'Warehouse 9, Industrial Area, Lahore, Punjab',
        refundAmount: 1299,
        refundMethod: 'Bank Transfer',
        originalPaymentMethod: 'Debit Card ending 9021',
        refundDate: '',
        transactionId: '',
        refundStep: 3
      },
      {
        returnRequestId: 'RR-900129',
        orderId: 'LM-100129',
        requestDate: '2026-03-07',
        status: 'rejected',
        productName: 'Silk Touch Compact Powder',
        productImage: 'https://images.unsplash.com/photo-1515688594390-b649af70d282?auto=format&fit=crop&w=240&q=80',
        sellerName: 'GlowCraft Cosmetics',
        quantity: 1,
        productPrice: 1450,
        selectedReason: 'Product not as described',
        customerDescription: 'Texture did not match what was expected.',
        evidence: [],
        sellerMessage: 'We reviewed your request with product records.',
        sellerDecision: 'Rejected as listing details match delivered SKU specifications.',
        courierName: '',
        pickupSchedule: '',
        returnAddress: '',
        refundAmount: 0,
        refundMethod: 'Not applicable',
        originalPaymentMethod: 'Wallet',
        refundDate: '',
        transactionId: '',
        refundStep: 2
      },
      {
        returnRequestId: 'RR-900102',
        orderId: 'LM-100102',
        requestDate: '2026-03-05',
        status: 'refunded',
        productName: 'Charcoal Cleansing Face Wash',
        productImage: 'https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=240&q=80',
        sellerName: 'CareNGlow',
        quantity: 1,
        productPrice: 1250,
        selectedReason: 'Changed mind',
        customerDescription: 'Return initiated before opening the package.',
        evidence: [],
        sellerMessage: 'Return was received and quality check passed.',
        sellerDecision: 'Refunded to original payment method.',
        courierName: 'TCS Express',
        pickupSchedule: 'Picked up on 2026-03-07',
        returnAddress: 'CareNGlow Return Desk, Karachi Warehouse',
        refundAmount: 1250,
        refundMethod: 'Original Card',
        originalPaymentMethod: 'Mastercard ending 5512',
        refundDate: '2026-03-09',
        transactionId: 'TXN-RF-998201',
        refundStep: 5
      }
    ];
  }

  function loadRequests() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seed = fallbackSeedData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
        return seed;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        const seed = fallbackSeedData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
        return seed;
      }
      return parsed;
    } catch (error) {
      const seed = fallbackSeedData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
  }

  function saveRequests(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function getRequests() {
    return loadRequests().slice().sort((a, b) => b.requestDate.localeCompare(a.requestDate));
  }

  function getRequestByOrderId(orderId) {
    return loadRequests().find((item) => item.orderId === orderId) || null;
  }

  function getRequestById(returnRequestId) {
    return loadRequests().find((item) => item.returnRequestId === returnRequestId) || null;
  }

  function createReturnRequest(payload) {
    const list = loadRequests();
    if (list.some((entry) => entry.orderId === payload.orderId && entry.status !== 'rejected')) {
      return { ok: false, error: 'A return request for this order already exists.' };
    }

    const request = {
      returnRequestId: `RR-${Date.now()}`,
      orderId: payload.orderId,
      requestDate: getTodayIsoDate(),
      status: 'pending',
      productName: payload.productName,
      productImage: payload.productImage,
      sellerName: payload.sellerName,
      quantity: payload.quantity,
      productPrice: payload.productPrice,
      selectedReason: payload.selectedReason,
      customerDescription: payload.customerDescription || '',
      evidence: payload.evidence || [],
      sellerMessage: '',
      sellerDecision: 'Seller has not reviewed this request yet.',
      courierName: '',
      pickupSchedule: '',
      returnAddress: '',
      refundAmount: payload.productPrice * payload.quantity,
      refundMethod: 'Original Card',
      originalPaymentMethod: payload.originalPaymentMethod || 'Original Payment Method',
      refundDate: '',
      transactionId: '',
      refundStep: 1
    };

    list.unshift(request);
    saveRequests(list);
    return { ok: true, request };
  }

  function cancelRequest(returnRequestId) {
    const list = loadRequests();
    const target = list.find((item) => item.returnRequestId === returnRequestId);
    if (!target) {
      return { ok: false, error: 'Return request not found.' };
    }
    if (target.status !== 'pending') {
      return { ok: false, error: 'Only pending requests can be canceled.' };
    }
    target.status = 'rejected';
    target.sellerDecision = 'Canceled by customer before seller review.';
    target.sellerMessage = 'This return request has been canceled by customer.';
    saveRequests(list);
    return { ok: true };
  }

  function isReturnEligible(order) {
    if (!order || order.status !== 'delivered' || !order.deliveredDate) {
      return { eligible: false, reason: 'Return is available only for delivered orders.' };
    }

    const today = getTodayIsoDate();
    const elapsed = daysBetween(order.deliveredDate, today);
    const policyDays = 7;
    if (elapsed < 0 || elapsed > policyDays) {
      return { eligible: false, reason: `Return window closed. Policy allows ${policyDays} days after delivery.` };
    }

    return { eligible: true, reason: '' };
  }

  window.ReturnsWorkflow = {
    getRequests,
    getRequestByOrderId,
    getRequestById,
    createReturnRequest,
    cancelRequest,
    isReturnEligible,
    statusLabel: {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      refunded: 'Refunded'
    }
  };
})();
