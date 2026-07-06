const summaryStats = [
  {
    title: 'Total Users',
    icon: 'group',
    value: 12450,
    growth: '+12%',
    compare: 'vs last week',
    positive: true
  },
  {
    title: 'Total Sellers',
    icon: 'storefront',
    value: 3200,
    growth: '+8%',
    compare: 'vs last week',
    positive: true
  },
  {
    title: 'Total Products',
    icon: 'inventory_2',
    value: 15600,
    growth: '+5%',
    compare: 'vs last week',
    positive: true
  },
  {
    title: 'Total Orders',
    icon: 'shopping_cart',
    value: 12480,
    growth: '+9%',
    compare: 'vs yesterday',
    positive: true
  },
  {
    title: 'Pending Orders',
    icon: 'pending',
    value: 230,
    growth: '-3%',
    compare: 'vs yesterday',
    positive: false
  },
  {
    title: 'Pending Seller Approvals',
    icon: 'verified',
    value: 17,
    growth: '+2%',
    compare: 'new this week',
    positive: true
  },
  {
    title: 'Total Revenue',
    icon: 'payments',
    value: 4523000,
    growth: '+15%',
    compare: 'vs last month',
    positive: true
  },
  {
    title: 'Total Commission Earned',
    icon: 'monetization_on',
    value: 285000,
    growth: '+8%',
    compare: 'vs last month',
    positive: true
  },
  {
    title: 'Refund Requests',
    icon: 'assignment_returned',
    value: 54,
    growth: '+4%',
    compare: 'new this month',
    positive: true
  },
  {
    title: 'Dispute Cases',
    icon: 'report',
    value: 48,
    growth: '-2%',
    compare: 'vs last month',
    positive: false
  },
  {
    title: 'Low Stock Alerts',
    icon: 'warning',
    value: 34,
    growth: '+1%',
    compare: 'new this week',
    positive: true
  }
];

const chartData = {
  sales: {
    daily: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      revenue: [1200, 1800, 1500, 2000, 1700, 2200, 2100],
      orders: [120, 180, 150, 200, 170, 220, 210]
    },
    weekly: {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      revenue: [11000, 12500, 9800, 14000],
      orders: [1100, 1250, 980, 1400]
    },
    monthly: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      revenue: [120000, 135000, 128000, 140000, 150000, 160000, 155000, 170000, 165000, 180000, 175000, 190000],
      orders: [12000, 13500, 12800, 14000, 15000, 16000, 15500, 17000, 16500, 18000, 17500, 19000]
    }
  },
  visitors: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    traffic: [3200, 4100, 3800, 4200, 3900, 4700, 4500]
  },
  categories: {
    labels: ['Men', 'Women', 'Kids', 'Accessories'],
    values: [14800, 16200, 9100, 7200]
  },
  sellers: {
    labels: ['Seller A', 'Seller B', 'Seller C', 'Seller D', 'Seller E'],
    values: [42000, 39000, 37000, 35000, 32000]
  },
  revenueVsReturns: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    revenue: [120000, 135000, 128000, 140000, 150000, 160000, 155000, 170000, 165000, 180000, 175000, 190000],
    returns: [2000, 2500, 1800, 2200, 2100, 2600, 2400, 2700, 2500, 2800, 2600, 3000]
  }
};

const recentOrders = [
  { id: 'ORD-1001', customer: 'Ayesha Khan', seller: 'Glow Cosmetics', total: 8500, status: 'pending', placedAt: '2026-03-05T09:20:00Z' },
  { id: 'ORD-1002', customer: 'Ali Raza', seller: 'Tech Bazaar', total: 23999, status: 'processing', placedAt: '2026-03-05T10:15:00Z' },
  { id: 'ORD-1003', customer: 'Sara Ahmed', seller: 'Home Ease', total: 4200, status: 'completed', placedAt: '2026-03-04T13:05:00Z' },
  { id: 'ORD-1004', customer: 'Bilal Noor', seller: 'Urban Wear', total: 6900, status: 'cancelled', placedAt: '2026-03-04T15:45:00Z' },
  { id: 'ORD-1005', customer: 'Hina Malik', seller: 'Beauty Hub', total: 11200, status: 'pending', placedAt: '2026-03-03T08:10:00Z' },
  { id: 'ORD-1006', customer: 'Muneeb Tariq', seller: 'Smart Gadgets', total: 15800, status: 'processing', placedAt: '2026-03-03T12:45:00Z' }
];

const notifications = [
  {
    id: 'NTF-1',
    type: 'order',
    title: 'High-value order received',
    message: 'Order ORD-1002 exceeded PKR 20,000 and needs manual review.',
    read: false,
    createdAt: '2026-03-05T10:20:00Z'
  },
  {
    id: 'NTF-2',
    type: 'seller',
    title: 'New seller approval pending',
    message: '3 new seller applications are waiting for approval.',
    read: false,
    createdAt: '2026-03-05T08:00:00Z'
  },
  {
    id: 'NTF-3',
    type: 'inventory',
    title: 'Low stock alert',
    message: '34 products have stock below minimum threshold.',
    read: true,
    createdAt: '2026-03-04T16:00:00Z'
  }
];

module.exports = {
  summaryStats,
  chartData,
  recentOrders,
  notifications
};
