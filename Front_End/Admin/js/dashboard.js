// dashboard.js
// Admin Dashboard logic using backend database APIs

const API_BASE_URL = window.ADMIN_API_BASE_URL || 'http://localhost:5000';

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function fetchJson(path) {
  const res = await fetch(apiUrl(path));
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

let statData = [];
let chartsData = null;

let salesChart = null;
let visitorChart = null;
let categoriesChart = null;
let sellersChart = null;
let revenueChart = null;

function toSafeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fallbackStats() {
  return [
    { title: 'Total Users', value: 0, growth: '0%', positive: true },
    { title: 'Total Sellers', value: 0, growth: '0%', positive: true },
    { title: 'Total Products', value: 0, growth: '0%', positive: true },
    { title: 'Total Orders', value: 0, growth: '0%', positive: true },
    { title: 'Pending Orders', value: 0, growth: '0%', positive: false },
    { title: 'Pending Seller Approvals', value: 0, growth: '0%', positive: true },
    { title: 'Total Revenue', value: 0, growth: '0%', positive: true },
    { title: 'Total Commission Earned', value: 0, growth: '0%', positive: true },
    { title: 'Refund Requests', value: 0, growth: '0%', positive: true },
    { title: 'Dispute Cases', value: 0, growth: '0%', positive: false },
    { title: 'Low Stock Alerts', value: 0, growth: '0%', positive: true }
  ];
}

// ====== Stat Cards ======
function renderStatCards() {
  const statWidgets = document.getElementById('statWidgets');
  if (!statWidgets) return;

  statWidgets.innerHTML = '';
  (statData.length ? statData : fallbackStats()).forEach(stat => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `
      <span class="stat-title">${stat.title}</span>
      <span class="stat-value">${toSafeNumber(stat.value).toLocaleString()}</span>
      <span class="stat-growth ${stat.positive ? '' : 'negative'}">${stat.growth || '0%'}</span>
    `;
    statWidgets.appendChild(card);
  });
}

// ====== Analytics Layout ======
function renderAnalyticsChartsLayout() {
  const analyticsSection = document.getElementById('analyticsSection');
  if (!analyticsSection) return;

  analyticsSection.innerHTML = '';

  const salesCard = document.createElement('div');
  salesCard.className = 'analytics-card';
  salesCard.innerHTML = `
    <div class="analytics-header">
      <span class="analytics-title">Sales Analytics</span>
      <div class="analytics-tabs">
        <button class="analytics-tab active" data-type="daily">Daily</button>
        <button class="analytics-tab" data-type="weekly">Weekly</button>
        <button class="analytics-tab" data-type="monthly">Monthly</button>
      </div>
    </div>
    <canvas id="salesChart"></canvas>
  `;
  analyticsSection.appendChild(salesCard);

  const visitorCard = document.createElement('div');
  visitorCard.className = 'analytics-card';
  visitorCard.innerHTML = `
    <div class="analytics-header">
      <span class="analytics-title">Visitor Analytics</span>
    </div>
    <canvas id="visitorChart"></canvas>
  `;
  analyticsSection.appendChild(visitorCard);

  const categoriesCard = document.createElement('div');
  categoriesCard.className = 'analytics-card';
  categoriesCard.innerHTML = `
    <div class="analytics-header">
      <span class="analytics-title">Top Categories</span>
    </div>
    <canvas id="categoriesChart"></canvas>
  `;
  analyticsSection.appendChild(categoriesCard);

  const sellersCard = document.createElement('div');
  sellersCard.className = 'analytics-card';
  sellersCard.innerHTML = `
    <div class="analytics-header">
      <span class="analytics-title">Top Performing Sellers</span>
    </div>
    <canvas id="sellersChart"></canvas>
  `;
  analyticsSection.appendChild(sellersCard);

  const revenueCard = document.createElement('div');
  revenueCard.className = 'analytics-card';
  revenueCard.innerHTML = `
    <div class="analytics-header">
      <span class="analytics-title">Revenue vs Returns</span>
    </div>
    <canvas id="revenueChart"></canvas>
  `;
  analyticsSection.appendChild(revenueCard);
}

function destroyCharts() {
  if (salesChart) salesChart.destroy();
  if (visitorChart) visitorChart.destroy();
  if (categoriesChart) categoriesChart.destroy();
  if (sellersChart) sellersChart.destroy();
  if (revenueChart) revenueChart.destroy();

  salesChart = null;
  visitorChart = null;
  categoriesChart = null;
  sellersChart = null;
  revenueChart = null;
}

function normalizeChartData(data) {
  const fallback = {
    sales: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], revenue: [0, 0, 0, 0, 0, 0, 0], orders: [0, 0, 0, 0, 0, 0, 0] },
    visitors: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], traffic: [0, 0, 0, 0, 0, 0, 0] },
    categories: { labels: ['No Data'], values: [0] },
    sellers: { labels: ['No Data'], values: [0] },
    revenueVsReturns: { labels: ['No Data'], revenue: [0], returns: [0] }
  };

  if (!data) return fallback;
  return {
    sales: data.sales || fallback.sales,
    visitors: data.visitors || fallback.visitors,
    categories: data.categories || fallback.categories,
    sellers: data.sellers || fallback.sellers,
    revenueVsReturns: data.revenueVsReturns || fallback.revenueVsReturns
  };
}

function renderCharts() {
  const normalized = normalizeChartData(chartsData);
  destroyCharts();

  const salesCtx = document.getElementById('salesChart');
  const visitorCtx = document.getElementById('visitorChart');
  const categoriesCtx = document.getElementById('categoriesChart');
  const sellersCtx = document.getElementById('sellersChart');
  const revenueCtx = document.getElementById('revenueChart');

  if (!salesCtx || !visitorCtx || !categoriesCtx || !sellersCtx || !revenueCtx) return;

  salesChart = new Chart(salesCtx.getContext('2d'), {
    type: 'line',
    data: {
      labels: normalized.sales.labels,
      datasets: [
        {
          label: 'Revenue',
          data: normalized.sales.revenue,
          borderColor: '#0066c0',
          backgroundColor: 'rgba(0,102,192,0.08)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#0066c0'
        },
        {
          label: 'Orders',
          data: normalized.sales.orders,
          borderColor: '#28a745',
          backgroundColor: 'rgba(40,167,69,0.08)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#28a745'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true } }
    }
  });

  visitorChart = new Chart(visitorCtx.getContext('2d'), {
    type: 'line',
    data: {
      labels: normalized.visitors.labels,
      datasets: [{
        label: 'Traffic',
        data: normalized.visitors.traffic,
        borderColor: '#ffc107',
        backgroundColor: 'rgba(255,193,7,0.08)',
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: '#ffc107'
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } } }
  });

  categoriesChart = new Chart(categoriesCtx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: normalized.categories.labels,
      datasets: [{
        label: 'Sales',
        data: normalized.categories.values,
        backgroundColor: '#0066c0',
        borderRadius: 8
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'x', plugins: { legend: { display: false } } }
  });

  sellersChart = new Chart(sellersCtx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: normalized.sellers.labels,
      datasets: [{
        label: 'Revenue',
        data: normalized.sellers.values,
        backgroundColor: '#28a745',
        borderRadius: 8
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }
  });

  revenueChart = new Chart(revenueCtx.getContext('2d'), {
    type: 'line',
    data: {
      labels: normalized.revenueVsReturns.labels,
      datasets: [
        {
          label: 'Revenue',
          data: normalized.revenueVsReturns.revenue,
          borderColor: '#0066c0',
          backgroundColor: 'rgba(0,102,192,0.08)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#0066c0'
        },
        {
          label: 'Refunds',
          data: normalized.revenueVsReturns.returns,
          borderColor: '#dc3545',
          backgroundColor: 'rgba(220,53,69,0.08)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#dc3545'
        }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } } }
  });
}

async function loadSummary() {
  try {
    const result = await fetchJson('/api/admin/dashboard/summary');
    statData = Array.isArray(result.data) ? result.data : [];
  } catch (_) {
    statData = fallbackStats();
  }
}

async function loadCharts(period) {
  try {
    const result = await fetchJson(`/api/admin/dashboard/charts?period=${encodeURIComponent(period)}`);
    chartsData = result.data || null;
  } catch (_) {
    chartsData = null;
  }
}

function setupSalesTabEvents() {
  const tabs = document.querySelectorAll('.analytics-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', async function() {
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      const period = this.getAttribute('data-type') || 'daily';
      await loadCharts(period);
      renderCharts();
    });
  });
}

// ====== Optional UI Handlers (kept safe) ======
function setupDarkMode() {
  const toggleDark = document.getElementById('toggleDark');
  if (!toggleDark) return;
  toggleDark.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
  });
}

function setupProfileDropdown() {
  const profileDropdown = document.getElementById('profileDropdown');
  if (!profileDropdown) return;

  profileDropdown.addEventListener('click', () => {
    profileDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!profileDropdown.contains(e.target)) {
      profileDropdown.classList.remove('open');
    }
  });
}

function setupSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const toggleSidebar = document.getElementById('toggleSidebar');
  if (!sidebar || !toggleSidebar) return;

  toggleSidebar.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });
}

function setupNotifBell() {
  const notifBell = document.getElementById('notifBell');
  if (!notifBell) return;

  notifBell.addEventListener('click', () => {
    alert('Notifications panel coming soon!');
  });
}

// ====== Dashboard Init ======
window.addEventListener('DOMContentLoaded', async function() {
  renderAnalyticsChartsLayout();

  await Promise.all([
    loadSummary(),
    loadCharts('daily')
  ]);

  renderStatCards();
  renderCharts();
  setupSalesTabEvents();
  setupDarkMode();
  setupProfileDropdown();
  setupSidebarToggle();
  setupNotifBell();
});
