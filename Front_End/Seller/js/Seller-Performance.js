const API_BASE = 'http://localhost:5000/api/seller/performance';
const chartColors = ['#0066c0', '#28a745', '#ffc107', '#8b5cf6', '#dc3545', '#06b6d4'];

let salesLineChart = null;
let viewsBarChart = null;
let trafficDonut = null;
let currentSalesPeriod = 'monthly';
let currentViewsLimit = 5;

function resolveSellerId() {
  try {
    const keys = ['sellerId', 'seller_id', 'currentSellerId', 'sellerUserId', 'userId'];
    for (const key of keys) {
      const value = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (value) {
        return String(value).trim();
      }
    }

    const rawUser = localStorage.getItem('lumina.auth.user') || localStorage.getItem('lumina.seller.session');
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      return String(parsed.id || parsed.userId || parsed.sellerId || '2').trim();
    }
  } catch (_) {}

  return '2';
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload.data !== undefined ? payload.data : payload;
}

function sellerRequest(path, params = {}) {
  const sellerId = resolveSellerId();
  const query = new URLSearchParams();
  if (sellerId) {
    query.set('sellerId', sellerId);
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') {
      query.set(key, String(value));
    }
  });

  return {
    sellerId,
    url: `${API_BASE}${path}${query.toString() ? `?${query.toString()}` : ''}`,
    headers: sellerId ? { 'x-seller-id': sellerId } : {}
  };
}

function money(value) {
  return `PKR ${Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(value, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

function emptyTable(tbody, message) {
  tbody.innerHTML = '';
  const row = document.createElement('tr');
  row.innerHTML = `<td colspan="10" style="text-align:center; color:#777; padding:20px;">${message}</td>`;
  tbody.appendChild(row);
}

function renderMetricCards(metrics) {
  const container = document.getElementById('metricsContainer');
  if (!container) return;

  const cards = [
    { label: 'Daily Sales', value: metrics.dailySales || 0, color: '#28a745', icon: 'trending_up' },
    { label: 'Weekly Sales', value: metrics.weeklySales || 0, color: '#0066c0', icon: 'trending_up' },
    { label: 'Monthly Sales', value: metrics.monthlySales || 0, color: '#ffc107', icon: 'trending_up' },
    { label: 'Payment Received Rate', value: pct(metrics.conversionRate || 0, 1), color: '#dc3545', icon: 'trending_up' }
  ];

  container.innerHTML = '';
  cards.forEach((metric) => {
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.style.borderLeftColor = metric.color;
    card.innerHTML = `
      <p>${metric.label}</p>
      <div class="metric-value">${typeof metric.value === 'number' ? money(metric.value) : metric.value}</div>
      <div class="metric-change">
        <span class="material-symbols-rounded" style="font-size:14px">${metric.icon}</span>
        Live database metric
      </div>
    `;
    container.appendChild(card);
  });
}

function renderSalesChart(period, series) {
  const canvas = document.getElementById('salesLineChart');
  if (!canvas) return;

  if (salesLineChart) {
    salesLineChart.destroy();
  }

  salesLineChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: series.labels || [],
      datasets: [{
        label: 'Sales',
        data: series.data || [],
        borderColor: 'rgba(0,102,192,0.9)',
        backgroundColor: 'rgba(0,102,192,0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: '#0066c0'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: 'index' } },
      scales: { y: { beginAtZero: true } }
    }
  });

  document.querySelectorAll('.chart-tabs .chart-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-chart') === period);
  });
}

function renderProductViews(items) {
  const tbody = document.getElementById('mostViewed');
  const canvas = document.getElementById('viewsBarChart');
  if (!tbody || !canvas) return;

  if (!items.length) {
    emptyTable(tbody, 'No product activity found yet');
  } else {
    tbody.innerHTML = '';
    items.forEach((item) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${item.product}</td><td>${Number(item.views || 0).toLocaleString()}</td><td style="color:${Number(item.change || 0) >= 0 ? '#28a745' : '#dc3545'}">${Number(item.change || 0) >= 0 ? '+' : ''}${Number(item.change || 0)}%</td>`;
      tbody.appendChild(tr);
    });
  }

  if (viewsBarChart) {
    viewsBarChart.destroy();
  }

  viewsBarChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: items.map((item) => item.product),
      datasets: [{
        label: 'Views',
        data: items.map((item) => item.views),
        backgroundColor: 'rgba(0,102,192,0.85)'
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  });
}

function renderBestSelling(items) {
  const tbody = document.getElementById('bestSelling');
  if (!tbody) return;

  if (!items.length) {
    emptyTable(tbody, 'No sales data available yet');
    return;
  }

  tbody.innerHTML = '';
  items.forEach((item, index) => {
    const tr = document.createElement('tr');
    if (index < 3) tr.classList.add('highlight');
    tr.innerHTML = `<td><strong>${item.product}</strong></td><td>${Number(item.units || 0).toLocaleString()}</td><td>${money(item.revenue)} <span style="font-size:11px;color:#999">${pct(item.revenueSharePct || 0, 1)}</span></td><td>${item.category}</td>`;
    tbody.appendChild(tr);
  });
}

function renderRefunds(payload) {
  const tbody = document.getElementById('refundsTable');
  if (!tbody) return;

  const items = payload.items || [];
  if (!items.length) {
    emptyTable(tbody, 'No return activity found yet');
    return;
  }

  tbody.innerHTML = '';
  items.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${item.product}</td><td>${item.rate}</td><td>${Number(item.units || 0).toLocaleString()}</td><td>${item.reason}</td>`;
    tbody.appendChild(tr);
  });
}

function renderTraffic(payload) {
  const canvas = document.getElementById('trafficDonut');
  const list = document.getElementById('trafficList');
  if (!canvas || !list) return;

  const items = payload.sources || [];
  if (trafficDonut) {
    trafficDonut.destroy();
  }

  trafficDonut = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: items.map((item) => item.source),
      datasets: [{
        data: items.map((item) => item.pct),
        backgroundColor: chartColors
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  if (!items.length) {
    list.innerHTML = '';
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="2" style="text-align:center; color:#777; padding:18px;">No source data available yet</td>';
    list.appendChild(tr);
    return;
  }

  list.innerHTML = '';
  items.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${item.source}</td><td>${pct(item.pct, 1)}</td>`;
    list.appendChild(tr);
  });
}

function renderRatings(payload) {
  const averageRating = document.getElementById('averageRating');
  const totalReviews = document.getElementById('totalReviews');
  const ratingBars = document.getElementById('ratingBars');
  if (!averageRating || !totalReviews || !ratingBars) return;

  averageRating.textContent = Number(payload.averageRating || 0).toFixed(1);
  totalReviews.textContent = `${Number(payload.totalReviews || 0).toLocaleString()} reviews`;

  ratingBars.innerHTML = '';
  (payload.distribution || []).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'rating-row';
    row.innerHTML = `<span>${item.stars}?</span><div class="bar"><div class="fill" style="width:${Number(item.pct || 0)}%"></div></div><span>${pct(item.pct || 0, 1)}</span>`;
    ratingBars.appendChild(row);
  });
}

function updateConversionFunnel(metrics, views, bestSelling) {
  const funnelViews = document.getElementById('funnelViews');
  const funnelCart = document.getElementById('funnelCart');
  const funnelOrders = document.getElementById('funnelOrders');
  const totalViews = document.getElementById('totalViews');
  const cartRate = document.getElementById('cartRate');
  const orderRate = document.getElementById('orderRate');

  if (!funnelViews || !funnelCart || !funnelOrders || !totalViews || !cartRate || !orderRate) {
    return;
  }

  const viewTotal = views.reduce((sum, item) => sum + Number(item.views || 0), 0);
  const topUnits = bestSelling.reduce((sum, item) => sum + Number(item.units || 0), 0);
  const cartUnits = Math.max(topUnits, Math.round(viewTotal * 0.22));
  const orders = Number(metrics.totalOrders || 0);
  const cartPct = viewTotal > 0 ? (cartUnits / viewTotal) * 100 : 0;
  const orderPct = viewTotal > 0 ? (orders / viewTotal) * 100 : 0;

  funnelViews.textContent = `Product Views: ${viewTotal.toLocaleString()} (100%)`;
  funnelCart.textContent = `Add to Cart: ${cartUnits.toLocaleString()} (${cartPct.toFixed(1)}%)`;
  funnelOrders.textContent = `Orders: ${orders.toLocaleString()} (${orderPct.toFixed(1)}%)`;
  totalViews.textContent = viewTotal.toLocaleString();
  cartRate.textContent = pct(cartPct, 1);
  orderRate.textContent = pct(orderPct, 1);
}

async function loadPerformance(period = currentSalesPeriod, viewsLimit = currentViewsLimit) {
  currentSalesPeriod = period;
  currentViewsLimit = Number(viewsLimit) || 5;
  const { url: baseUrl, headers } = sellerRequest('/metrics');
  const metrics = await fetchJson(baseUrl, { headers });

  const salesRequest = sellerRequest('/sales', { period });
  const viewsRequest = sellerRequest('/views', { limit: currentViewsLimit });
  const bestSellingRequest = sellerRequest('/best-selling', { limit: 5 });
  const refundsRequest = sellerRequest('/refunds');
  const trafficRequest = sellerRequest('/traffic');
  const ratingsRequest = sellerRequest('/ratings');

  const [sales, views, bestSelling, refunds, traffic, ratings] = await Promise.all([
    fetchJson(salesRequest.url, { headers: salesRequest.headers }),
    fetchJson(viewsRequest.url, { headers: viewsRequest.headers }),
    fetchJson(bestSellingRequest.url, { headers: bestSellingRequest.headers }),
    fetchJson(refundsRequest.url, { headers: refundsRequest.headers }),
    fetchJson(trafficRequest.url, { headers: trafficRequest.headers }),
    fetchJson(ratingsRequest.url, { headers: ratingsRequest.headers })
  ]);

  renderMetricCards(metrics);
  renderSalesChart(period, sales);
  renderProductViews(views);
  renderBestSelling(bestSelling);
  renderRefunds(refunds);
  renderTraffic(traffic);
  renderRatings(ratings);
  updateConversionFunnel(metrics, views, bestSelling);
}

function switchSalesChart(period) {
  loadPerformance(period, currentViewsLimit).catch((error) => {
    console.error('Error switching sales chart:', error);
  });
}

function switchViewsRange(limit) {
  loadPerformance(currentSalesPeriod, limit).catch((error) => {
    console.error('Error changing views range:', error);
  });
}

function init() {
  loadPerformance('monthly', currentViewsLimit).catch((error) => {
    console.error('Error loading seller performance:', error);
  });
}

document.addEventListener('DOMContentLoaded', init);

window.init = init;
window.switchSalesChart = switchSalesChart;
window.renderSalesChart = renderSalesChart;
window.renderProductViews = renderProductViews;
window.renderBestSelling = renderBestSelling;
window.renderRefunds = renderRefunds;
window.renderTraffic = renderTraffic;
window.renderMetricCards = renderMetricCards;
window.loadPerformance = loadPerformance;
window.switchViewsRange = switchViewsRange;


