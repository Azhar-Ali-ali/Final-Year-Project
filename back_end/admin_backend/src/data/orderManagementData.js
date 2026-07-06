const orderStatuses = [
  'Pending',
  'Confirmed',
  'Packed',
  'Ready for Pickup',
  'Shipped',
  'Delivered',
  'Cancelled',
  'Returned'
];

const shipmentStatuses = [
  'Awaiting Pickup',
  'Picked Up',
  'In Transit',
  'Out for Delivery',
  'Delivered',
  'RTO (Return to Origin)',
  'Failed Delivery'
];

const orders = [
  {
    orderId: 'ORD-11001',
    orderDate: '2026-02-25',
    customerName: 'Adeel Hassan',
    customerCity: 'Karachi',
    customerAddress: 'House 12, PECHS Block 2',
    customerPostal: '75400',
    customerPhone: '+92-300-1002001',
    deliveryInstructions: 'Call before delivery',
    sellerName: 'TechBazaar',
    sellerStoreName: 'TechBazaar Mega Store',
    sellerContact: '+92-311-3004001',
    pickupAddress: 'Plot 9, Shahrah-e-Faisal, Karachi',
    sellerWalletBalance: 2400,
    sellerRiskStatus: 'Low',
    paymentType: 'COD',
    paymentStatus: 'Pending',
    orderTotal: 640,
    status: 'Ready for Pickup',
    courierName: '',
    trackingId: '',
    codAmount: 640,
    settlementStatus: 'Pending',
    shipmentStatus: 'Awaiting Pickup',
    pickupDate: '',
    deliveredDate: '',
    inTransitUpdates: [],
    returnStatus: 'None',
    rtoReason: '',
    shippingCharges: 40,
    platformCommission: 64,
    codFee: 16,
    netSellerEarnings: 520,
    inventoryAdjusted: false,
    codReceived: false,
    sellerSettlementDone: false,
    activities: [
      { at: '2026-02-25 10:20', by: 'System', note: 'Order created' },
      { at: '2026-02-25 11:05', by: 'Seller', note: 'Order marked Ready for Pickup' }
    ],
    products: [
      { image: 'https://via.placeholder.com/42', name: 'Wireless Earbuds', sku: 'EB-102', qty: 2, price: 200, subtotal: 400 },
      { image: 'https://via.placeholder.com/42', name: 'USB-C Cable', sku: 'UC-451', qty: 4, price: 60, subtotal: 240 }
    ]
  },
  {
    orderId: 'ORD-11002',
    orderDate: '2026-02-22',
    customerName: 'Sara Imran',
    customerCity: 'Lahore',
    customerAddress: 'Street 5, DHA Phase 3',
    customerPostal: '54000',
    customerPhone: '+92-300-5006002',
    deliveryInstructions: 'Leave at reception',
    sellerName: 'StyleCart',
    sellerStoreName: 'StyleCart Fashion Hub',
    sellerContact: '+92-312-7771002',
    pickupAddress: 'Main Boulevard Gulberg, Lahore',
    sellerWalletBalance: 1800,
    sellerRiskStatus: 'Medium',
    paymentType: 'Online',
    paymentStatus: 'Paid',
    orderTotal: 890,
    status: 'Shipped',
    courierName: 'TCS Express',
    trackingId: 'TCS-556721',
    codAmount: 0,
    settlementStatus: 'Paid',
    shipmentStatus: 'In Transit',
    pickupDate: '2026-02-23',
    deliveredDate: '',
    inTransitUpdates: ['2026-02-23: Picked up', '2026-02-24: In Transit - Lahore Hub'],
    returnStatus: 'None',
    rtoReason: '',
    shippingCharges: 55,
    platformCommission: 89,
    codFee: 0,
    netSellerEarnings: 746,
    inventoryAdjusted: false,
    codReceived: true,
    sellerSettlementDone: true,
    activities: [
      { at: '2026-02-22 09:12', by: 'System', note: 'Order created' },
      { at: '2026-02-22 09:50', by: 'Admin', note: 'Order confirmed' },
      { at: '2026-02-23 12:10', by: 'Admin', note: 'Shipment created, tracking assigned' }
    ],
    products: [
      { image: 'https://via.placeholder.com/42', name: 'Premium Hoodie', sku: 'HD-884', qty: 1, price: 540, subtotal: 540 },
      { image: 'https://via.placeholder.com/42', name: 'Denim Jeans', sku: 'DJ-339', qty: 1, price: 350, subtotal: 350 }
    ]
  },
  {
    orderId: 'ORD-11003',
    orderDate: '2026-02-19',
    customerName: 'Bilal Rauf',
    customerCity: 'Islamabad',
    customerAddress: 'F-11 Markaz, Islamabad',
    customerPostal: '44000',
    customerPhone: '+92-301-7008003',
    deliveryInstructions: '',
    sellerName: 'HomeNest',
    sellerStoreName: 'HomeNest Furnishings',
    sellerContact: '+92-333-9911003',
    pickupAddress: 'Industrial Area, Rawalpindi',
    sellerWalletBalance: 600,
    sellerRiskStatus: 'Low',
    paymentType: 'COD',
    paymentStatus: 'Pending',
    orderTotal: 1240,
    status: 'Returned',
    courierName: 'Leopard Courier',
    trackingId: 'LPR-109843',
    codAmount: 1240,
    settlementStatus: 'Adjusted',
    shipmentStatus: 'RTO (Return to Origin)',
    pickupDate: '2026-02-20',
    deliveredDate: '',
    inTransitUpdates: ['2026-02-20: Picked up', '2026-02-21: Failed Delivery Attempt', '2026-02-22: RTO initiated'],
    returnStatus: 'RTO',
    rtoReason: 'Customer unreachable',
    shippingCharges: 70,
    platformCommission: 124,
    codFee: 31,
    netSellerEarnings: 1015,
    inventoryAdjusted: true,
    codReceived: false,
    sellerSettlementDone: false,
    activities: [
      { at: '2026-02-19 08:15', by: 'System', note: 'Order created' },
      { at: '2026-02-20 10:00', by: 'Admin', note: 'Courier assigned and shipment created' },
      { at: '2026-02-22 17:20', by: 'Admin', note: 'Marked as Returned (RTO)' }
    ],
    products: [
      { image: 'https://via.placeholder.com/42', name: 'Floor Lamp', sku: 'FL-119', qty: 2, price: 380, subtotal: 760 },
      { image: 'https://via.placeholder.com/42', name: 'Wall Frame Set', sku: 'WF-717', qty: 2, price: 240, subtotal: 480 }
    ]
  },
  {
    orderId: 'ORD-11004',
    orderDate: '2026-02-26',
    customerName: 'Kiran Shah',
    customerCity: 'Karachi',
    customerAddress: 'Clifton Block 8',
    customerPostal: '75600',
    customerPhone: '+92-304-9090004',
    deliveryInstructions: 'Gate code 4412',
    sellerName: 'PhoneWorld',
    sellerStoreName: 'PhoneWorld Downtown',
    sellerContact: '+92-344-2104004',
    pickupAddress: 'Saddar Electronics Market',
    sellerWalletBalance: 3500,
    sellerRiskStatus: 'Low',
    paymentType: 'Online',
    paymentStatus: 'Paid',
    orderTotal: 1520,
    status: 'Pending',
    courierName: '',
    trackingId: '',
    codAmount: 0,
    settlementStatus: 'Pending',
    shipmentStatus: 'Awaiting Pickup',
    pickupDate: '',
    deliveredDate: '',
    inTransitUpdates: [],
    returnStatus: 'None',
    rtoReason: '',
    shippingCharges: 75,
    platformCommission: 152,
    codFee: 0,
    netSellerEarnings: 1293,
    inventoryAdjusted: false,
    codReceived: true,
    sellerSettlementDone: false,
    activities: [{ at: '2026-02-26 12:40', by: 'System', note: 'Order created' }],
    products: [
      { image: 'https://via.placeholder.com/42', name: 'Smartphone', sku: 'SP-989', qty: 1, price: 1320, subtotal: 1320 },
      { image: 'https://via.placeholder.com/42', name: 'Screen Guard', sku: 'SG-121', qty: 2, price: 100, subtotal: 200 }
    ]
  }
];

function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function addActivity(order, note, by = 'Admin') {
  order.activities.unshift({ at: nowStamp(), by, note });
}

function parseDate(text) {
  return new Date(`${text}T00:00:00`);
}

function filterOrders(query = {}) {
  const q = String(query.search || '').trim().toLowerCase();
  const startDate = query.startDate;
  const endDate = query.endDate;
  const seller = query.seller;
  const status = query.status;
  const payment = query.payment;
  const courier = query.courier;
  const city = query.city;
  const highValue = query.highValue;
  const codOnly = query.codOnly;
  const returnedOnly = query.returnedOnly;

  return orders.filter((o) => {
    if (q && !(`${o.orderId} ${o.customerPhone}`.toLowerCase().includes(q))) return false;
    if (startDate && parseDate(o.orderDate) < parseDate(startDate)) return false;
    if (endDate && parseDate(o.orderDate) > parseDate(endDate)) return false;
    if (seller && o.sellerName !== seller) return false;
    if (status && o.status !== status) return false;
    if (payment && o.paymentType !== payment) return false;
    if (courier && o.courierName !== courier) return false;
    if (city && o.customerCity !== city) return false;
    if (highValue === 'high' && o.orderTotal < 500) return false;
    if (codOnly === 'cod' && o.paymentType !== 'COD') return false;
    if (returnedOnly === 'returned' && o.status !== 'Returned') return false;
    return true;
  });
}

function statsSummary() {
  return {
    total: orders.length,
    delivered: orders.filter((o) => o.status === 'Delivered').length,
    shipped: orders.filter((o) => o.status === 'Shipped').length,
    returned: orders.filter((o) => o.status === 'Returned').length,
    cancelled: orders.filter((o) => o.status === 'Cancelled').length,
    codPending: orders.filter((o) => o.paymentType === 'COD' && !o.codReceived).length
  };
}

module.exports = {
  orderStatuses,
  shipmentStatuses,
  orders,
  addActivity,
  filterOrders,
  statsSummary
};
