// Seller Performance and Analytics Data Module

const performanceState = {
  metrics: [
    { label: 'Daily Sales', value: 1280, change: 6.5, positive: true, color: '#28a745', icon: 'trending_up' },
    { label: 'Weekly Sales', value: 8760, change: 12, positive: true, color: '#0066c0', icon: 'trending_up' },
    { label: 'Monthly Sales', value: 34200, change: 3.2, positive: true, color: '#ffc107', icon: 'trending_up' },
    { label: 'Conversion Rate', value: '3.8%', change: -0.2, positive: false, color: '#dc3545', icon: 'trending_down' }
  ],

  sales: {
    daily: { labels: ['8am', '10am', '12pm', '2pm', '4pm', '6pm', '8pm'], data: [120, 200, 340, 280, 300, 380, 420] },
    weekly: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], data: [1200, 1500, 1300, 1700, 1800, 1900, 1600] },
    monthly: { labels: ['Week1', 'Week2', 'Week3', 'Week4'], data: [7200, 8800, 9400, 9500] }
  },

  views: [
    { product: 'Men Essential Tee', views: 10240, change: 12 },
    { product: 'Women Summer Dress', views: 8420, change: -4 },
    { product: 'Kids Graphic Hoodie', views: 7820, change: 6 },
    { product: 'Classic Leather Belt', views: 6520, change: 2 },
    { product: 'Canvas Tote Bag', views: 4220, change: 18 }
  ],

  bestSelling: [
    { product: 'Men Essential Tee', units: 1200, revenue: 48000, category: 'Men' },
    { product: 'Women Summer Dress', units: 980, revenue: 39200, category: 'Women' },
    { product: 'Kids Graphic Hoodie', units: 620, revenue: 31000, category: 'Kids' },
    { product: 'Classic Leather Belt', units: 430, revenue: 17200, category: 'Accessories' },
    { product: 'Canvas Tote Bag', units: 300, revenue: 4200, category: 'Accessories' }
  ],

  refunds: [
    { product: 'Smart Watch', rate: '5.2%', units: 51, reason: 'Battery issue' },
    { product: 'Running Shoes', rate: '3.9%', units: 17, reason: 'Size mismatch' },
    { product: 'Wireless Headphones', rate: '2.1%', units: 25, reason: 'Sound issue' }
  ],

  traffic: [
    { source: 'Search', pct: 38 },
    { source: 'Homepage', pct: 18 },
    { source: 'Ads', pct: 14 },
    { source: 'Social', pct: 12 },
    { source: 'Direct', pct: 10 },
    { source: 'Email', pct: 8 }
  ]
};

function getMetrics() {
  return [...performanceState.metrics];
}

function getSales(period = 'monthly') {
  if (!performanceState.sales[period]) return null;
  return performanceState.sales[period];
}

function getViews(limit = 5) {
  const safeLimit = Math.max(1, Number(limit) || 5);
  return [...performanceState.views]
    .sort((a, b) => b.views - a.views)
    .slice(0, safeLimit);
}

function getBestSelling(limit = 5, category = '') {
  const safeLimit = Math.max(1, Number(limit) || 5);
  let records = [...performanceState.bestSelling];

  if (category) {
    records = records.filter(item => item.category.toLowerCase() === category.toLowerCase());
  }

  const totalRevenue = records.reduce((sum, item) => sum + item.revenue, 0);

  return records
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, safeLimit)
    .map(item => ({
      ...item,
      revenueSharePct: totalRevenue > 0 ? Number(((item.revenue / totalRevenue) * 100).toFixed(2)) : 0
    }));
}

function getRefundAnalytics() {
  const totalUnits = performanceState.refunds.reduce((sum, item) => sum + item.units, 0);

  const weightedRate = performanceState.refunds.reduce((sum, item) => {
    const rate = Number(String(item.rate).replace('%', '')) || 0;
    return sum + rate;
  }, 0);

  return {
    items: [...performanceState.refunds],
    totalUnits,
    averageRate: performanceState.refunds.length > 0
      ? Number((weightedRate / performanceState.refunds.length).toFixed(2))
      : 0
  };
}

function getTraffic() {
  const total = performanceState.traffic.reduce((sum, item) => sum + item.pct, 0);
  return {
    sources: [...performanceState.traffic],
    totalPct: total
  };
}

function getOverview() {
  const totalSales = performanceState.bestSelling.reduce((sum, item) => sum + item.revenue, 0);
  const totalUnits = performanceState.bestSelling.reduce((sum, item) => sum + item.units, 0);
  const topProduct = [...performanceState.bestSelling].sort((a, b) => b.revenue - a.revenue)[0] || null;

  return {
    totalSales,
    totalUnits,
    topProduct,
    metricsCount: performanceState.metrics.length,
    topTrafficSource: [...performanceState.traffic].sort((a, b) => b.pct - a.pct)[0] || null
  };
}

function getMeta() {
  return {
    salesPeriods: Object.keys(performanceState.sales),
    categories: [...new Set(performanceState.bestSelling.map(item => item.category))],
    chartSeries: ['sales', 'views', 'traffic']
  };
}

module.exports = {
  performanceState,
  getMetrics,
  getSales,
  getViews,
  getBestSelling,
  getRefundAnalytics,
  getTraffic,
  getOverview,
  getMeta
};
