// Seller Dashboard Data Module

const dashboardState = {
  seller: {
    id: 'S-1001',
    name: 'Beauty Essentials Store',
    email: 'seller@lumina.com',
    joinedDate: '2025-06-15',
    rating: 4.8,
    totalProducts: 45,
    activeProducts: 42,
    totalOrders: 1287,
    completedOrders: 1156,
    revenue: 45680.50,
    lastMonthRevenue: 38450.25,
    balance: 12345.75,
    pendingBalance: 2890.50
  },
  
  orders: [
    { id: 'ORD-1287', product: 'Wireless Headphones Pro', customer: 'Ayesha Khan', amount: 89.99, status: 'Delivered', date: '2026-03-05', payment: 'Prepaid' },
    { id: 'ORD-1286', product: 'USB-C Fast Charger', customer: 'Hassan Raza', amount: 15.99, status: 'Shipped', date: '2026-03-05', payment: 'COD' },
    { id: 'ORD-1285', product: 'Phone Case Ultra Slim', customer: 'Fatima Ali', amount: 24.99, status: 'Pending', date: '2026-03-04', payment: 'Prepaid' },
    { id: 'ORD-1284', product: 'Screen Protector HD', customer: 'Sara Ahmed', amount: 9.99, status: 'Delivered', date: '2026-03-04', payment: 'Prepaid' },
    { id: 'ORD-1283', product: 'Laptop Stand Aluminum', customer: 'Omar Sheikh', amount: 45.99, status: 'Shipped', date: '2026-03-03', payment: 'COD' },
    { id: 'ORD-1282', product: 'Mechanical Keyboard RGB', customer: 'Zainab Malik', amount: 79.99, status: 'Cancelled', date: '2026-03-03', payment: 'Prepaid' },
    { id: 'ORD-1281', product: 'Mouse Pad Gaming XL', customer: 'Ali Rehman', amount: 12.99, status: 'Delivered', date: '2026-03-02', payment: 'COD' },
    { id: 'ORD-1280', product: 'USB Hub 4-Port', customer: 'Noor Fatima', amount: 34.99, status: 'Pending', date: '2026-03-02', payment: 'Prepaid' },
    { id: 'ORD-1279', product: 'Monitor Stand Adjustable', customer: 'Imran Khan', amount: 56.99, status: 'Shipped', date: '2026-03-01', payment: 'COD' },
    { id: 'ORD-1278', product: 'Power Bank 20000mAh', customer: 'Maria Qureshi', amount: 39.99, status: 'Delivered', date: '2026-03-01', payment: 'Prepaid' },
    { id: 'ORD-1277', product: 'Phone Holder Car Mount', customer: 'Ahmed Hassan', amount: 14.99, status: 'Pending', date: '2026-02-29', payment: 'COD' },
    { id: 'ORD-1276', product: 'LED Desk Lamp', customer: 'Sana Tariq', amount: 39.99, status: 'Delivered', date: '2026-02-29', payment: 'Prepaid' },
    { id: 'ORD-1275', product: 'Bluetooth Speaker Mini', customer: 'Usman Ali', amount: 29.99, status: 'Shipped', date: '2026-02-28', payment: 'COD' },
    { id: 'ORD-1274', product: 'Webcam HD 1080p', customer: 'Hina Ahmed', amount: 49.99, status: 'Delivered', date: '2026-02-28', payment: 'Prepaid' },
    { id: 'ORD-1273', product: 'Headphone Stand', customer: 'Bilal Mirza', amount: 19.99, status: 'Cancelled', date: '2026-02-27', payment: 'COD' },
  ],
  
  notifications: [
    { id: 'N-001', title: 'Low Stock Alert', text: 'Wireless Headphones Pro stock is below 5 units', time: '2 hours ago', unread: true, type: 'warning' },
    { id: 'N-002', title: 'New Order #ORD-1287', text: 'Ayesha Khan ordered Wireless Headphones Pro for $89.99', time: '4 hours ago', unread: true, type: 'order' },
    { id: 'N-003', title: 'KYC Verification Pending', text: 'Complete your KYC verification to unlock seller features', time: '1 day ago', unread: true, type: 'alert' },
    { id: 'N-004', title: 'Payout Processed', text: 'Your payout of $5,400 has been successfully processed', time: '2 days ago', unread: false, type: 'payment' },
    { id: 'N-005', title: 'Product Review (4.5★)', text: 'New 5-star review on "Wireless Headphones Pro"', time: '2 days ago', unread: false, type: 'review' },
    { id: 'N-006', title: 'Return Request', text: 'Customer requested return for order #ORD-1282', time: '3 days ago', unread: true, type: 'return' },
    { id: 'N-007', title: 'Monthly Report Ready', text: 'Your February sales report is now available', time: '4 days ago', unread: false, type: 'info' },
  ],
  
  chartData: {
    sales: {
      daily: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        data: [1200, 1900, 1500, 1750, 2100, 1800, 2200]
      },
      weekly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        data: [12000, 19000, 15000, 17500]
      },
      monthly: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        data: [32000, 38450, 35000, 41000, 43500, 45680]
      }
    },
    earnings: {
      daily: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        data: [850, 1200, 950, 1100, 1450, 1300, 1600]
      },
      weekly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        data: [8500, 12000, 9500, 11000]
      },
      monthly: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        data: [24000, 28500, 26000, 32000, 35000, 38450]
      }
    }
  }
};

function getMetrics() {
  const seller = dashboardState.seller;
  const orders = dashboardState.orders;
  
  const pendingOrders = orders.filter(o => o.status === 'Pending').length;
  const shippedOrders = orders.filter(o => o.status === 'Shipped').length;
  const deliveredOrders = orders.filter(o => o.status === 'Delivered').length;
  const cancelledOrders = orders.filter(o => o.status === 'Cancelled').length;
  
  const revenueGrowth = (((seller.revenue - seller.lastMonthRevenue) / seller.lastMonthRevenue) * 100).toFixed(1);
  
  return {
    totalRevenue: seller.revenue.toFixed(2),
    revenueGrowth: `${revenueGrowth}%`,
    revenueGrowthPositive: parseFloat(revenueGrowth) >= 0,
    totalOrders: seller.totalOrders,
    ordersGrowth: '+12.5%',
    ordersGrowthPositive: true,
    activeProducts: seller.activeProducts,
    totalProducts: seller.totalProducts,
    productsGrowth: '+3.2%',
    productsGrowthPositive: true,
    balance: seller.balance.toFixed(2),
    pendingBalance: seller.pendingBalance.toFixed(2),
    balanceGrowth: '+8.7%',
    balanceGrowthPositive: true,
    pendingOrders,
    shippedOrders,
    deliveredOrders,
    cancelledOrders,
    completedOrders: seller.completedOrders,
    rating: seller.rating
  };
}

function filterOrders(query = {}) {
  const { search = '', status = '', page = 1, pageSize = 10 } = query;
  
  let filtered = [...dashboardState.orders];
  
  // Search filter
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(order =>
      order.id.toLowerCase().includes(searchLower) ||
      order.customer.toLowerCase().includes(searchLower) ||
      order.product.toLowerCase().includes(searchLower)
    );
  }
  
  // Status filter
  if (status) {
    filtered = filtered.filter(order => order.status === status);
  }
  
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
  return dashboardState.orders.find(order => order.id === orderId);
}

function getNotifications(unreadOnly = false) {
  let notifs = [...dashboardState.notifications];
  
  if (unreadOnly) {
    notifs = notifs.filter(n => n.unread);
  }
  
  return {
    notifications: notifs,
    unreadCount: dashboardState.notifications.filter(n => n.unread).length,
    totalCount: dashboardState.notifications.length
  };
}

function markNotificationRead(notifId) {
  const notif = dashboardState.notifications.find(n => n.id === notifId);
  if (notif) {
    notif.unread = false;
    return true;
  }
  return false;
}

function markAllNotificationsRead() {
  dashboardState.notifications.forEach(n => n.unread = false);
  return true;
}

function getChartData(chartType = 'sales', period = 'daily') {
  const validChartTypes = ['sales', 'earnings'];
  const validPeriods = ['daily', 'weekly', 'monthly'];
  
  if (!validChartTypes.includes(chartType)) {
    chartType = 'sales';
  }
  
  if (!validPeriods.includes(period)) {
    period = 'daily';
  }
  
  return dashboardState.chartData[chartType][period];
}

function getSellerInfo() {
  return dashboardState.seller;
}

module.exports = {
  dashboardState,
  getMetrics,
  filterOrders,
  getOrderById,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getChartData,
  getSellerInfo
};
