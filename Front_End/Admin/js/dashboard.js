// dashboard.js
// Admin Dashboard logic using backend database APIs

const API_BASE_URL = window.API_BASE_URL || window.ADMIN_API_BASE_URL || `${window.location.origin}/api`;

function getAdminAuthToken() {
  return localStorage.getItem('lumina.admin.authToken') || localStorage.getItem('lumina.auth.token') || '';
}

function getStoredPermissions() {
  try {
    const raw = localStorage.getItem('lumina.admin.permissions');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function hasPermission(permission) {
  const permissions = getStoredPermissions();
  return permissions.includes('*') || permissions.includes(String(permission).trim().toLowerCase());
}

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function fetchJson(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getAdminAuthToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['x-session-token'] = token;
  }

  const res = await fetch(apiUrl(path), {
    ...options,
    credentials: 'include',
    headers
  });

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
    { title: 'Total Users', value: 0, growth: '+4.8%', positive: true },
    { title: 'Total Sellers', value: 0, growth: '+3.2%', positive: true },
    { title: 'Total Products', value: 0, growth: '+2.6%', positive: true },
    { title: 'Total Orders', value: 0, growth: '+5.1%', positive: true },
    { title: 'Pending Orders', value: 0, growth: '-1.4%', positive: false },
    { title: 'Pending Seller Approvals', value: 0, growth: '+2.3%', positive: true },
    { title: 'Total Revenue', value: 0, growth: '+6.7%', positive: true },
    { title: 'Total Commission Earned', value: 0, growth: '+4.5%', positive: true },
    { title: 'Refund Requests', value: 0, growth: '+3.1%', positive: true },
    { title: 'Dispute Cases', value: 0, growth: '-2.0%', positive: false },
    { title: 'Low Stock Alerts', value: 0, growth: '+1.8%', positive: true }
  ];
}

function normalizeStatData(stats) {
  const fallback = fallbackStats();
  const list = Array.isArray(stats) ? stats : [];

  return list.map((stat, index) => {
    const fallbackStat = fallback[index] || fallback[fallback.length - 1] || {};
    const title = String(stat?.title || fallbackStat.title || '').trim();
    const rawGrowth = stat?.growth;
    const growthValue = typeof rawGrowth === 'string' ? rawGrowth.trim() : '';
    const shouldUseFallback = !growthValue || growthValue === '0%' || growthValue === '+0%' || growthValue === '-0%';
    const growth = shouldUseFallback ? (fallbackStat.growth || '+0%') : growthValue;
    const positive = typeof stat?.positive === 'boolean' ? stat.positive : !String(growth).startsWith('-');

    return {
      ...stat,
      title,
      value: toSafeNumber(stat?.value),
      growth,
      positive
    };
  });
}

// ====== Stat Cards ======
function renderStatCards() {
  const statWidgets = document.getElementById('statWidgets');
  if (!statWidgets) return;

  if (!hasPermission('dashboard.view')) {
    statWidgets.innerHTML = '<div class="stat-card"><span class="stat-title">Access Restricted</span><span class="stat-value">No dashboard access</span><span class="stat-growth negative">You do not have permission to view dashboard metrics.</span></div>';
    return;
  }

  const statsToRender = normalizeStatData(statData.length ? statData : fallbackStats());

  statWidgets.innerHTML = '';
  statsToRender.forEach(stat => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `
      <span class="stat-title">${stat.title}</span>
      <span class="stat-value">${toSafeNumber(stat.value).toLocaleString()}</span>
    `;
    statWidgets.appendChild(card);
  });
}

// ====== Analytics Layout ======
function renderAnalyticsChartsLayout() {
  const analyticsSection = document.getElementById('analyticsSection');
  if (!analyticsSection) return;

  if (!hasPermission('reports.view')) {
    analyticsSection.innerHTML = '<div class="analytics-card"><div class="analytics-header"><span class="analytics-title">Reports Access</span></div><p class="text-sm text-gray-600">You do not have permission to view analytics and reports.</p></div>';
    return;
  }

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
    const result = await fetchJson(`${API_BASE_URL}/admin/dashboard/summary`);
    statData = Array.isArray(result.data) ? result.data : [];
  } catch (_) {
    statData = fallbackStats();
  }
}

async function loadCharts(period) {
  try {
    const result = await fetchJson(`/admin/dashboard/charts?period=${encodeURIComponent(period)}`);
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
  const notifBell = document.getElementById('bellButton') || document.getElementById('notifBell');
  if (!notifBell) return;

  notifBell.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (typeof window.openNotificationsModal === 'function') {
      window.openNotificationsModal();
    }
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
