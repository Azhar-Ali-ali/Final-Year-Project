const API_BASE = '/api/admin/reports';

const state = {
  overview: null,
  trend: [],
  categories: [],
  sales: [],
  orders: [],
  users: null,
  products: [],
  customReports: []
};

function q(id) {
  return document.getElementById(id);
}

function normalize(value) {
  return String(value || '').toLowerCase().trim();
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `\u09F3${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showToast(message, type = 'success') {
  const toast = q('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.background = type === 'success' ? '#28a745' : '#dc3545';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function openModal(id) {
  q(id)?.classList.add('active');
}

function closeModal(id) {
  q(id)?.classList.remove('active');
}

function getAdminId() {
  return localStorage.getItem('adminId') || localStorage.getItem('userId') || '';
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-id': getAdminId(),
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || payload.message || 'Request failed');
  }
  return payload;
}

function currentOverviewFilters() {
  return {
    period: q('filter-overview-period')?.value || 'week',
    region: q('filter-overview-region')?.value || ''
  };
}

async function loadOverview() {
  const params = new URLSearchParams(currentOverviewFilters());
  const res = await api(`/overview?${params.toString()}`);
  state.overview = res.data?.summary || null;
  state.trend = res.data?.trend || [];
  state.categories = res.data?.categories || [];
}

async function loadSales() {
  const params = new URLSearchParams({
    period: q('filter-sales-period')?.value || 'month',
    region: q('filter-sales-region')?.value || '',
    search: q('search-sales')?.value || ''
  });
  const res = await api(`/sales?${params.toString()}`);
  state.sales = res.data || [];
}

async function loadOrders() {
  const params = new URLSearchParams({
    period: 'week',
    status: q('filter-orders-status')?.value || '',
    payment: q('filter-orders-payment')?.value || '',
    search: q('search-orders')?.value || ''
  });
  const res = await api(`/orders?${params.toString()}`);
  state.orders = res.data || [];
}

async function loadUsers() {
  const params = new URLSearchParams({
    period: q('filter-users-period')?.value || 'week',
    role: q('filter-users-role')?.value || ''
  });
  const res = await api(`/users?${params.toString()}`);
  state.users = res.data || { growth: [], distribution: [], allDistribution: [] };
}

async function loadProducts() {
  const params = new URLSearchParams({
    category: q('filter-products-category')?.value || '',
    search: q('search-products')?.value || ''
  });
  const res = await api(`/products?${params.toString()}`);
  state.products = res.data || [];
}

async function loadCustomReports() {
  const res = await api('/custom');
  state.customReports = res.data || [];
}

function renderOverview() {
  const kpi = q('kpi-stats');
  const summary = state.overview || {
    todayGMV: 0,
    periodGMV: 0,
    commissionEarned: 0,
    refundRate: 0
  };

  if (kpi) {
    kpi.innerHTML = `
      <div class="stat-card success">
        <div class="stat-value">${formatCurrency(summary.todayGMV)}</div>
        <div class="stat-label">Today's GMV</div>
      </div>
      <div class="stat-card info">
        <div class="stat-value">${formatCurrency(summary.periodGMV)}</div>
        <div class="stat-label">Period GMV</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${formatCurrency(summary.commissionEarned)}</div>
        <div class="stat-label">Commission Earned</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-value">${Number(summary.refundRate || 0).toFixed(2)}%</div>
        <div class="stat-label">Refund Rate</div>
      </div>
    `;
  }

  const maxRevenue = Math.max(1, ...state.trend.map((x) => Number(x.revenue || 0)));
  const trendBars = state.trend.slice(-7).map((item) => {
    const h = Math.max(30, Math.round((Number(item.revenue || 0) / maxRevenue) * 220));
    return `<div style="flex: 1; background: linear-gradient(to top, var(--success), var(--info)); height: ${h}px; border-radius: 4px; display: flex; align-items: flex-end; justify-content: center; color: white; font-size: 11px; font-weight: 600;">${formatNumber(item.orders || 0)}</div>`;
  }).join('');

  const revenueBox = document.querySelector('#overview div[style*="height: 300px"]');
  if (revenueBox) revenueBox.innerHTML = trendBars || '<div class="subtle">No trend data found</div>';

  const categoriesEl = q('chart-categories');
  if (categoriesEl) {
    categoriesEl.innerHTML = state.categories.map((cat) => `
      <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
        <span><strong>${cat.name}</strong><br><span class="subtle">${formatNumber(cat.orders)} orders</span></span>
        <span style="font-weight: 700; color: var(--info);">${formatCurrency(cat.revenue)}</span>
      </div>
    `).join('') || '<div class="subtle">No category data found</div>';
  }
}

function growthBadge(current, prev) {
  const a = Number(current || 0);
  const b = Number(prev || 0);
  if (!b) return '<span class="badge">-</span>';
  const diff = ((a - b) / b) * 100;
  if (diff >= 0) return `<span class="badge success">\u2191 ${diff.toFixed(1)}%</span>`;
  return `<span class="badge warning">\u2193 ${Math.abs(diff).toFixed(1)}%</span>`;
}

function renderSales() {
  const tbody = q('sales-tbody');
  if (!tbody) return;

  tbody.innerHTML = state.sales.map((row, idx) => {
    const prev = state.sales[idx + 1];
    return `
      <tr>
        <td>${formatDate(row.period)}</td>
        <td style="text-align: right;">${formatCurrency(row.revenue)}</td>
        <td style="text-align: center;">${formatNumber(row.orders)}</td>
        <td style="text-align: right;">${formatCurrency(row.avg_order_value)}</td>
        <td style="text-align: center;">${growthBadge(row.revenue, prev?.revenue)}</td>
        <td><span class="badge success">\u2713 Completed</span></td>
        <td><button class="btn sm ghost">View</button></td>
      </tr>
    `;
  }).join('');

  if (!state.sales.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--muted); padding: 28px;">No sales data found</td></tr>';
  }
}

function renderOrders() {
  const tbody = q('orders-tbody');
  if (!tbody) return;

  tbody.innerHTML = state.orders.map((row) => {
    const status = normalize(row.status);
    const payment = normalize(row.payment);
    const statusClass = status === 'delivered' || status === 'completed' ? 'success' : status === 'cancelled' ? 'danger' : 'warning';
    const paymentClass = payment === 'paid' ? 'success' : payment === 'failed' ? 'danger' : 'warning';
    return `
      <tr>
        <td><strong>${row.orderId || '-'}</strong></td>
        <td>${row.customer || 'Unknown'}</td>
        <td style="text-align: right;">${formatCurrency(row.amount)}</td>
        <td style="text-align: center;">${formatNumber(row.items)}</td>
        <td><span class="badge ${statusClass}">${status}</span></td>
        <td><span class="badge ${paymentClass}">${payment}</span></td>
        <td style="font-size: 11px;">${formatDate(row.date)}</td>
        <td><button class="btn sm ghost">Details</button></td>
      </tr>
    `;
  }).join('');

  if (!state.orders.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--muted); padding: 28px;">No orders found</td></tr>';
  }
}

function renderUsers() {
  const growthEl = q('analytics-user-growth');
  const distEl = q('analytics-user-dist');
  const data = state.users || { growth: [], allDistribution: [] };

  if (growthEl) {
    const maxVal = Math.max(1, ...data.growth.map((g) => Number(g.buyers || 0) + Number(g.sellers || 0) + Number(g.admins || 0)));
    growthEl.innerHTML = data.growth.slice(-6).map((g) => {
      const total = Number(g.buyers || 0) + Number(g.sellers || 0) + Number(g.admins || 0);
      const h = Math.max(24, Math.round((total / maxVal) * 180));
      return `<div style="flex: 1; background: linear-gradient(to top, var(--info), var(--purple)); height: ${h}px; border-radius: 4px;" title="${formatDate(g.day)}"></div>`;
    }).join('') || '<div class="subtle">No user growth data</div>';
  }

  if (distEl) {
    const map = { customer: 0, seller: 0, admin: 0 };
    (data.allDistribution || []).forEach((r) => { map[normalize(r.role)] = Number(r.count || 0); });
    const total = map.customer + map.seller + map.admin;
    const inactive = Math.max(0, Math.round(total * 0.03));
    distEl.innerHTML = `
      <div style="background: #e3f2fd; padding: 12px; border-radius: 6px; border-left: 4px solid var(--info);">
        <div style="font-weight: 700; font-size: 16px; color: var(--info);">${formatNumber(map.customer)}</div>
        <div style="color: var(--muted);">Buyers</div>
      </div>
      <div style="background: #f3e5f5; padding: 12px; border-radius: 6px; border-left: 4px solid var(--purple);">
        <div style="font-weight: 700; font-size: 16px; color: var(--purple);">${formatNumber(map.seller)}</div>
        <div style="color: var(--muted);">Sellers</div>
      </div>
      <div style="background: #fff3e0; padding: 12px; border-radius: 6px; border-left: 4px solid var(--orange);">
        <div style="font-weight: 700; font-size: 16px; color: var(--orange);">${formatNumber(map.admin)}</div>
        <div style="color: var(--muted);">Admins</div>
      </div>
      <div style="background: #f0f0f0; padding: 12px; border-radius: 6px; border-left: 4px solid var(--gray);">
        <div style="font-weight: 700; font-size: 16px;">${formatNumber(inactive)}</div>
        <div style="color: var(--muted);">Inactive (estimated)</div>
      </div>
    `;
  }
}

function renderProducts() {
  const tbody = q('products-tbody');
  if (!tbody) return;

  tbody.innerHTML = state.products.map((p) => {
    let status = '<span class="badge success">Active</span>';
    if (Number(p.stock || 0) < 200) status = '<span class="badge warning">Restock Alert</span>';
    if (Number(p.avgRating || 0) < 3.5) status = '<span class="badge danger">Quality Review</span>';
    if (Number(p.sales || 0) > 2000) status = '<span class="badge success">Trending</span>';

    return `
      <tr>
        <td><strong>${p.name}</strong></td>
        <td>${p.category}</td>
        <td style="text-align: center;">${formatNumber(p.sales)}</td>
        <td style="text-align: right;">${formatCurrency(p.revenue)}</td>
        <td style="text-align: center;">\u2b50 ${Number(p.avgRating || 0).toFixed(1)}</td>
        <td style="text-align: center;"><span class="badge info">${formatNumber(p.stock)}</span></td>
        <td>${status}</td>
        <td><button class="btn sm ghost">Edit</button></td>
      </tr>
    `;
  }).join('');

  if (!state.products.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--muted); padding: 28px;">No product performance data found</td></tr>';
  }
}

function renderCustomReports() {
  const grid = q('custom-reports-grid');
  if (!grid) return;

  grid.innerHTML = state.customReports.map((r) => `
    <div style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
      <div style="font-weight: 700; margin-bottom: 8px;">${r.name}</div>
      <div style="font-size: 12px; color: var(--muted); margin-bottom: 12px;">
        <div>Created: ${formatDate(r.createdAt)}</div>
        <div>Last run: ${r.lastRun ? formatDate(r.lastRun) : 'Never'}</div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn sm success" onclick="runCustomReport('${r.id}')">Run Now</button>
        <button class="btn sm ghost">Edit</button>
      </div>
    </div>
  `).join('');

  if (!state.customReports.length) {
    grid.innerHTML = '<div class="subtle">No custom reports created yet</div>';
  }
}

async function refreshAll() {
  await Promise.all([loadOverview(), loadSales(), loadOrders(), loadUsers(), loadProducts(), loadCustomReports()]);
  renderOverview();
  renderSales();
  renderOrders();
  renderUsers();
  renderProducts();
  renderCustomReports();
}

async function runCustomReport(id) {
  try {
    await api(`/custom/${id}/run`, { method: 'POST', body: JSON.stringify({}) });
    await loadCustomReports();
    renderCustomReports();
    showToast('Report executed successfully');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function createCustomReport() {
  const name = prompt('Enter custom report name:');
  if (!name) return;
  try {
    await api('/custom', {
      method: 'POST',
      body: JSON.stringify({ name, description: 'Created from Admin Reports page' })
    });
    await loadCustomReports();
    renderCustomReports();
    showToast('Custom report created');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function saveSchedule() {
  const reportType = q('schedule-report-type')?.value || '';
  const frequency = q('schedule-frequency')?.value || '';
  const recipients = q('schedule-recipients')?.value || '';
  const active = q('schedule-active')?.checked !== false;

  if (!reportType || !frequency || !recipients) {
    showToast('Report type, frequency, and recipients are required', 'error');
    return;
  }

  try {
    await api('/schedules', {
      method: 'POST',
      body: JSON.stringify({ reportType, frequency, recipients, active })
    });
    closeModal('schedule-modal');
    showToast('Schedule saved successfully');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function exportReport() {
  const reportType = q('export-report-type')?.value || 'sales';
  const format = q('export-format')?.value || 'csv';
  const startDate = q('export-start-date')?.value || null;
  const endDate = q('export-end-date')?.value || null;

  try {
    const result = await api('/export', {
      method: 'POST',
      body: JSON.stringify({ reportType, format, startDate, endDate })
    });

    if (format === 'csv') {
      const url = result.data?.downloadUrl || `/api/admin/reports/download?reportType=${encodeURIComponent(reportType)}&format=csv`;
      const link = document.createElement('a');
      link.href = url;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    closeModal('export-modal');
    showToast(`Report export prepared in ${format.toUpperCase()} format`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function bindFilters() {
  q('filter-overview-period')?.addEventListener('change', async () => { await loadOverview(); renderOverview(); });
  q('filter-overview-region')?.addEventListener('change', async () => { await loadOverview(); renderOverview(); });
  q('btn-refresh-overview')?.addEventListener('click', async () => { await loadOverview(); renderOverview(); showToast('Overview refreshed'); });

  q('search-sales')?.addEventListener('input', async () => { await loadSales(); renderSales(); });
  q('filter-sales-period')?.addEventListener('change', async () => { await loadSales(); renderSales(); });
  q('filter-sales-region')?.addEventListener('change', async () => { await loadSales(); renderSales(); });

  q('search-orders')?.addEventListener('input', async () => { await loadOrders(); renderOrders(); });
  q('filter-orders-status')?.addEventListener('change', async () => { await loadOrders(); renderOrders(); });
  q('filter-orders-payment')?.addEventListener('change', async () => { await loadOrders(); renderOrders(); });

  q('filter-users-period')?.addEventListener('change', async () => { await loadUsers(); renderUsers(); });
  q('filter-users-role')?.addEventListener('change', async () => { await loadUsers(); renderUsers(); });

  q('search-products')?.addEventListener('input', async () => { await loadProducts(); renderProducts(); });
  q('filter-products-category')?.addEventListener('change', async () => { await loadProducts(); renderProducts(); });
}

function bindActions() {
  q('btn-export-report')?.addEventListener('click', () => openModal('export-modal'));
  q('btn-schedule-report')?.addEventListener('click', () => openModal('schedule-modal'));
  q('btn-confirm-export')?.addEventListener('click', exportReport);
  q('btn-save-schedule')?.addEventListener('click', saveSchedule);

  q('btn-export-sales')?.addEventListener('click', () => openModal('export-modal'));
  q('btn-export-orders')?.addEventListener('click', () => openModal('export-modal'));
  q('btn-export-products')?.addEventListener('click', () => openModal('export-modal'));

  q('btn-create-custom')?.addEventListener('click', createCustomReport);

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal.id);
    });
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.getAttribute('data-tab');
      q(id)?.classList.add('active');
    });
  });
}

async function initializeReportsAnalytics() {
  try {
    bindActions();
    bindFilters();
    await refreshAll();
  } catch (error) {
    showToast(error.message || 'Failed to load reports data', 'error');
  }
}

window.closeModal = closeModal;
window.openModal = openModal;
window.runCustomReport = runCustomReport;

document.addEventListener('DOMContentLoaded', initializeReportsAnalytics);
