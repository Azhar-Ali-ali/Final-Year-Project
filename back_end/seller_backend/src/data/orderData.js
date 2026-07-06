// Seller Order Management Data Module

const orderState = {
  orders: [
    {
      id: 'ORD-001',
      customer: 'Ahmed Hassan',
      phone: '+92 300 1234567',
      email: 'ahmed@email.com',
      address: 'House #42, Street 5, Phase 2, DHA',
      city: 'Karachi',
      postal: '74000',
      paymentType: 'COD',
      paymentStatus: 'Pending',
      status: 'Pending',
      date: '2026-03-06',
      products: [
        { name: 'Wireless Headphones', sku: 'WH-001', qty: 1, price: 2500 }
      ],
      subtotal: 2500,
      commission: 250,
      earnings: 2250,
      courier: null,
      tracking: null,
      deliveryStatus: null,
      notes: ''
    },
    {
      id: 'ORD-002',
      customer: 'Fatima Khan',
      phone: '+92 310 9876543',
      email: 'fatima@email.com',
      address: 'Apartment 5C, Tower A, Gulberg',
      city: 'Lahore',
      postal: '54000',
      paymentType: 'Online',
      paymentStatus: 'Paid',
      status: 'Confirmed',
      date: '2026-03-05',
      products: [
        { name: 'USB-C Cable', sku: 'USB-001', qty: 2, price: 500 },
        { name: 'Phone Case', sku: 'CASE-001', qty: 1, price: 800 }
      ],
      subtotal: 1800,
      commission: 180,
      earnings: 1620,
      courier: null,
      tracking: null,
      deliveryStatus: null,
      notes: 'Customer requested gift wrapping'
    },
    {
      id: 'ORD-003',
      customer: 'Muhammad Ali',
      phone: '+92 321 5551234',
      email: 'ali@email.com',
      address: 'Mall Road, Plot 12, F-10',
      city: 'Islamabad',
      postal: '44000',
      paymentType: 'COD',
      paymentStatus: 'Pending',
      status: 'Packed',
      date: '2026-03-04',
      products: [
        { name: 'Screen Protector', sku: 'SP-001', qty: 5, price: 200 }
      ],
      subtotal: 1000,
      commission: 100,
      earnings: 900,
      courier: null,
      tracking: null,
      deliveryStatus: null,
      notes: ''
    },
    {
      id: 'ORD-004',
      customer: 'Ayesha Malik',
      phone: '+92 345 8889999',
      email: 'ayesha@email.com',
      address: 'Gulshan-e-Iqbal, Block 1',
      city: 'Karachi',
      postal: '75300',
      paymentType: 'Online',
      paymentStatus: 'Paid',
      status: 'Ready for Pickup',
      date: '2026-03-03',
      products: [
        { name: 'Phone Stand', sku: 'PS-001', qty: 2, price: 400 }
      ],
      subtotal: 800,
      commission: 80,
      earnings: 720,
      courier: 'TCS Express',
      tracking: 'TCS123456',
      deliveryStatus: 'Awaiting Courier Pickup',
      notes: ''
    },
    {
      id: 'ORD-005',
      customer: 'Hassan Raza',
      phone: '+92 333 4445555',
      email: 'hassan@email.com',
      address: 'Saddar, Karachi Company',
      city: 'Karachi',
      postal: '74400',
      paymentType: 'COD',
      paymentStatus: 'Pending',
      status: 'Pending',
      date: '2026-03-06',
      products: [
        { name: 'Laptop Stand', sku: 'LS-001', qty: 1, price: 1500 },
        { name: 'Mouse Pad', sku: 'MP-001', qty: 1, price: 300 }
      ],
      subtotal: 1800,
      commission: 180,
      earnings: 1620,
      courier: null,
      tracking: null,
      deliveryStatus: null,
      notes: ''
    },
    {
      id: 'ORD-006',
      customer: 'Sara Ahmed',
      phone: '+92 300 7778888',
      email: 'sara@email.com',
      address: 'Model Town, Phase 1',
      city: 'Lahore',
      postal: '54700',
      paymentType: 'Online',
      paymentStatus: 'Paid',
      status: 'Confirmed',
      date: '2026-03-05',
      products: [
        { name: 'Mechanical Keyboard', sku: 'KB-001', qty: 1, price: 3500 }
      ],
      subtotal: 3500,
      commission: 350,
      earnings: 3150,
      courier: null,
      tracking: null,
      deliveryStatus: null,
      notes: 'Priority shipping requested'
    },
    {
      id: 'ORD-007',
      customer: 'Omar Sheikh',
      phone: '+92 315 1112222',
      email: 'omar@email.com',
      address: 'Blue Area, Jinnah Avenue',
      city: 'Islamabad',
      postal: '44000',
      paymentType: 'COD',
      paymentStatus: 'Pending',
      status: 'Packed',
      date: '2026-03-04',
      products: [
        { name: 'USB Hub', sku: 'HUB-001', qty: 2, price: 800 }
      ],
      subtotal: 1600,
      commission: 160,
      earnings: 1440,
      courier: null,
      tracking: null,
      deliveryStatus: null,
      notes: ''
    },
    {
      id: 'ORD-008',
      customer: 'Zainab Malik',
      phone: '+92 342 9991111',
      email: 'zainab@email.com',
      address: 'Clifton Block 5',
      city: 'Karachi',
      postal: '75600',
      paymentType: 'Online',
      paymentStatus: 'Paid',
      status: 'Ready for Pickup',
      date: '2026-03-03',
      products: [
        { name: 'Bluetooth Speaker', sku: 'SPK-001', qty: 1, price: 2200 }
      ],
      subtotal: 2200,
      commission: 220,
      earnings: 1980,
      courier: 'Leopards Courier',
      tracking: 'LEO789012',
      deliveryStatus: 'Awaiting Courier Pickup',
      notes: ''
    },
    {
      id: 'ORD-009',
      customer: 'Ali Rehman',
      phone: '+92 301 3334444',
      email: 'alirehman@email.com',
      address: 'Johar Town, Phase 2',
      city: 'Lahore',
      postal: '54782',
      paymentType: 'COD',
      paymentStatus: 'Pending',
      status: 'Pending',
      date: '2026-03-06',
      products: [
        { name: 'Webcam HD', sku: 'WC-001', qty: 1, price: 2800 }
      ],
      subtotal: 2800,
      commission: 280,
      earnings: 2520,
      courier: null,
      tracking: null,
      deliveryStatus: null,
      notes: 'Office delivery'
    },
    {
      id: 'ORD-010',
      customer: 'Noor Fatima',
      phone: '+92 320 5556666',
      email: 'noor@email.com',
      address: 'Bahria Town Phase 4',
      city: 'Islamabad',
      postal: '44220',
      paymentType: 'Online',
      paymentStatus: 'Paid',
      status: 'Confirmed',
      date: '2026-03-05',
      products: [
        { name: 'Desk Lamp', sku: 'DL-001', qty: 1, price: 1200 },
        { name: 'Cable Organizer', sku: 'CO-001', qty: 2, price: 250 }
      ],
      subtotal: 1700,
      commission: 170,
      earnings: 1530,
      courier: null,
      tracking: null,
      deliveryStatus: null,
      notes: ''
    }
  ],

  // Status flow for seller workflow
  statusFlow: {
    'Pending': 'Confirmed',
    'Confirmed': 'Packed',
    'Packed': 'Ready for Pickup'
  }
};

function getOverview() {
  const pending = orderState.orders.filter(o => o.status === 'Pending').length;
  const confirmed = orderState.orders.filter(o => o.status === 'Confirmed').length;
  const packed = orderState.orders.filter(o => o.status === 'Packed').length;
  const ready = orderState.orders.filter(o => o.status === 'Ready for Pickup').length;
  
  const totalOrders = orderState.orders.length;
  const totalRevenue = orderState.orders.reduce((sum, o) => sum + o.subtotal, 0);
  const totalEarnings = orderState.orders.reduce((sum, o) => sum + o.earnings, 0);
  const totalCommission = orderState.orders.reduce((sum, o) => sum + o.commission, 0);

  return {
    pendingCount: pending,
    confirmedCount: confirmed,
    packedCount: packed,
    readyCount: ready,
    totalOrders,
    totalRevenue: totalRevenue.toFixed(2),
    totalEarnings: totalEarnings.toFixed(2),
    totalCommission: totalCommission.toFixed(2)
  };
}

function filterOrders(query = {}) {
  const { search = '', status = '', payment = '', city = '', page = 1, pageSize = 10 } = query;
  
  let filtered = [...orderState.orders];
  
  // Search filter (by order ID or customer name)
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(order =>
      order.id.toLowerCase().includes(searchLower) ||
      order.customer.toLowerCase().includes(searchLower) ||
      order.email.toLowerCase().includes(searchLower)
    );
  }
  
  // Status filter
  if (status) {
    filtered = filtered.filter(order => order.status === status);
  }
  
  // Payment type filter
  if (payment) {
    filtered = filtered.filter(order => order.paymentType === payment);
  }
  
  // City filter
  if (city) {
    filtered = filtered.filter(order => order.city === city);
  }
  
  // Sort by date (newest first)
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  // Pagination
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedOrders = filtered.slice(startIndex, endIndex);
  
  return {
    orders: paginatedOrders,
    pagination: {
      currentPage: parseInt(page),
      pageSize: parseInt(pageSize),
      totalItems,
      totalPages
    }
  };
}

function getOrderById(orderId) {
  return orderState.orders.find(order => order.id === orderId);
}

function updateOrderStatus(orderId, newStatus) {
  const order = orderState.orders.find(o => o.id === orderId);
  if (!order) return null;

  // Validate status transition
  const expectedStatus = orderState.statusFlow[order.status];
  
  if (expectedStatus !== newStatus) {
    return {
      success: false,
      message: `Invalid status transition. Expected: ${expectedStatus}, Got: ${newStatus}`,
      currentStatus: order.status,
      allowedNextStatus: expectedStatus
    };
  }

  const oldStatus = order.status;
  order.status = newStatus;

  return {
    success: true,
    message: `Order status updated successfully`,
    order: order,
    oldStatus: oldStatus,
    newStatus: newStatus
  };
}

function getCities() {
  const cities = [...new Set(orderState.orders.map(o => o.city))];
  return cities.sort();
}

function getOrdersByStatus(status) {
  return orderState.orders.filter(o => o.status === status);
}

function getOrderStats() {
  const stats = {
    byStatus: {},
    byCity: {},
    byPaymentType: {},
    revenueByCity: {},
    avgOrderValue: 0
  };

  // By status
  const statuses = ['Pending', 'Confirmed', 'Packed', 'Ready for Pickup'];
  statuses.forEach(status => {
    const orders = orderState.orders.filter(o => o.status === status);
    stats.byStatus[status] = {
      count: orders.length,
      revenue: orders.reduce((sum, o) => sum + o.subtotal, 0).toFixed(2)
    };
  });

  // By city
  const cities = [...new Set(orderState.orders.map(o => o.city))];
  cities.forEach(city => {
    const orders = orderState.orders.filter(o => o.city === city);
    stats.byCity[city] = orders.length;
    stats.revenueByCity[city] = orders.reduce((sum, o) => sum + o.subtotal, 0).toFixed(2);
  });

  // By payment type
  ['COD', 'Online'].forEach(type => {
    const orders = orderState.orders.filter(o => o.paymentType === type);
    stats.byPaymentType[type] = {
      count: orders.length,
      revenue: orders.reduce((sum, o) => sum + o.subtotal, 0).toFixed(2)
    };
  });

  // Average order value
  if (orderState.orders.length > 0) {
    const total = orderState.orders.reduce((sum, o) => sum + o.subtotal, 0);
    stats.avgOrderValue = (total / orderState.orders.length).toFixed(2);
  }

  return stats;
}

module.exports = {
  orderState,
  getOverview,
  filterOrders,
  getOrderById,
  updateOrderStatus,
  getCities,
  getOrdersByStatus,
  getOrderStats
};
