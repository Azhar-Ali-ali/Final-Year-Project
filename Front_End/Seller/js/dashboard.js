console.log('Dashboard script loaded');

try {
  const API_BASE = 'http://localhost:5000/api/seller/dashboard';
  let currentPage = 1;
  const itemsPerPage = 10;
  let totalPages = 1;
  let currentOrders = [];
  let notifications = [];

  const notifBell = document.getElementById('notifBell');
  const notifPanel = document.getElementById('notifPanel');
  const notifClose = document.getElementById('notifClose');
  const notifList = document.getElementById('notifList');
  const ordersTableBody = document.getElementById('ordersTableBody');
  const orderSearch = document.getElementById('orderSearch');
  const orderFilter = document.getElementById('orderFilter');
  const metricCards = document.querySelectorAll('.metric-value');
  const metricChanges = document.querySelectorAll('.metric-change');

  metricChanges.forEach((item) => {
    item.textContent = '0%';
  });

  function getSessionAuthUser() {
    try {
      const rawAuth = localStorage.getItem('lumina.auth');
      if (rawAuth) {
        const parsedAuth = JSON.parse(rawAuth);
        if (parsedAuth && typeof parsedAuth === 'object' && parsedAuth.user) {
          return parsedAuth.user;
        }
      }

      const fallbackRaw = localStorage.getItem('lumina.auth.user') || localStorage.getItem('lumina.seller.session');
      return fallbackRaw ? JSON.parse(fallbackRaw) : null;
    } catch (_) {
      return null;
    }
  }

  function getSellerHeaderState() {
    const user = getSessionAuthUser() || {};
    const profile = user.sellerProfile || {};
    const fallbackName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const sellerName = String(profile.storeName || profile.sellerName || fallbackName || user.email || 'Seller').trim();
    const verificationRaw = String(profile.verificationStatus || profile.kycStatus || '').toLowerCase().trim();
    const verified = profile.isVerified === true || verificationRaw === 'verified' || verificationRaw === 'active' || verificationRaw === 'approved';

    return {
      sellerName,
      verified,
      label: verified ? 'Verified' : 'Not Verified',
      hint: verified ? 'All features unlocked' : 'Verify KYC first to unlock product publishing'
    };
  }

  function applySellerHeaderState() {
    const state = getSellerHeaderState();

    const profileLabel = document.getElementById('sellerProfileLabel');
    const profileAvatar = document.getElementById('sellerProfileAvatar');
    const verificationBadge = document.getElementById('sellerVerificationBadge');
    const verificationText = document.getElementById('sellerVerificationText');
    const verificationHint = document.getElementById('sellerVerificationHint');

    if (profileLabel) profileLabel.textContent = state.sellerName;
    if (profileAvatar) profileAvatar.textContent = state.sellerName.charAt(0).toUpperCase() || 'S';
    if (verificationText) verificationText.textContent = state.label;
    if (verificationHint) verificationHint.textContent = state.hint;

    if (verificationBadge) {
      verificationBadge.className = state.verified
        ? 'inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold'
        : 'inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold';
    }

    return state;
  }

  function bindHeaderAddProductButtons() {
    const state = applySellerHeaderState();
    const addProductButtons = document.querySelectorAll('[data-kyc-locked="add-product"]');

    addProductButtons.forEach((button) => {
      if (state.verified) {
        button.classList.remove('opacity-50', 'cursor-not-allowed');
        button.removeAttribute('aria-disabled');
        button.title = '';
      } else {
        button.classList.add('opacity-50', 'cursor-not-allowed');
        button.setAttribute('aria-disabled', 'true');
        button.title = 'Verify KYC first';
      }

      if (button.dataset.bound === 'true') return;
      button.dataset.bound = 'true';

      button.addEventListener('click', (event) => {
        event.preventDefault();
        if (!getSellerHeaderState().verified) {
          alert('Verify KYC first to add products.');
          return;
        }
        window.location.href = 'Product-Management.html';
      });
    });
  }

  function isServerRuntimeAllowed() {
    return true;
  }

  function resolveSellerId() {
    const seededSellerId = '22222222-2222-4222-8222-222222222222';
    const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

    const candidateKeys = ['sellerId', 'seller_id', 'currentSellerId', 'sellerUserId', 'userId', 'lumina.seller.session', 'lumina.auth.user', 'lumina.auth', 'lumina.user'];

    for (const key of candidateKeys) {
      const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        const candidate = [
          parsed?.id,
          parsed?.userId,
          parsed?.sellerId,
          parsed?.seller_id,
          parsed?.user?.id,
          parsed?.user?.userId,
          parsed?.user?.sellerId,
          parsed?.user?.seller_id,
          parsed?.session?.userId,
          parsed?.session?.sellerId,
          parsed?.auth?.user?.id,
          parsed?.auth?.user?.userId,
          parsed?.auth?.user?.sellerId,
          parsed?.auth?.user?.seller_id
        ].find((value) => value !== undefined && value !== null && String(value).trim() !== '');

        if (candidate && isUuid(String(candidate).trim())) {
          return String(candidate).trim();
        }
      } catch (_) {
        const directValue = String(raw).trim();
        if (isUuid(directValue)) return directValue;
      }
    }

    return seededSellerId;
  }

  bindHeaderAddProductButtons();

  async function fetchJson(url, options = {}) {
    const sellerId = resolveSellerId();
    const token = localStorage.getItem('lumina.auth.token') || sessionStorage.getItem('lumina.auth.token') || '';
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(sellerId ? { 'x-seller-id': sellerId } : {}),
        ...(options.headers || {})
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || 'Request failed');
    }

    return payload.data !== undefined ? payload.data : payload;
  }

  function deviceIcon(device) {
    const d = String(device || '').toLowerCase();
    if (d.includes('iphone') || d.includes('android') || d.includes('mobile')) return 'smartphone';
    if (d.includes('ipad') || d.includes('tablet')) return 'tablet';
    return 'monitor';
  }

  function statusClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('ready') || normalized.includes('pack') || normalized.includes('confirm') || normalized.includes('ship')) return 'status-shipped';
    if (normalized.includes('deliver')) return 'status-delivered';
    if (normalized.includes('cancel')) return 'status-cancelled';
    return 'status-pending';
  }

  function formatDate(date) {
    if (!date) return '-';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return String(date);
    return d.toISOString().slice(0, 10);
  }

  function formatPkr(value) {
    const amount = Number(value || 0);
    return `PKR ${amount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function renderNotifications() {
    if (!notifList) return;
    notifList.innerHTML = '';

    notifications.forEach((notif) => {
      const li = document.createElement('li');
      li.className = `notif-item ${notif.unread ? 'unread' : ''}`;
      li.innerHTML = `
        <div class="notif-item-title">${notif.title}</div>
        <div class="notif-item-text">${notif.text}</div>
        <div class="notif-item-time">${notif.time || 'Recently'}</div>
      `;
      notifList.appendChild(li);
    });
  }

  function renderOrdersTable() {
    if (!ordersTableBody) return;
    ordersTableBody.innerHTML = '';

    currentOrders.forEach((order) => {
      const row = document.createElement('tr');
      const button = document.createElement('button');
      button.className = 'btn-view';
      button.textContent = 'View Details';
      button.setAttribute('data-order-id', order.id);
      button.onclick = function () {
        showOrderDetails(order.id);
      };

      row.innerHTML = `
        <td><span class="order-id">${order.id}</span></td>
        <td>
          <div class="product-info">
            <div class="product-img">📦</div>
            <div class="product-name">${order.product}</div>
          </div>
        </td>
        <td>${order.customer}</td>
        <td>${formatPkr(order.amount || 0)}</td>
        <td><span class="status-badge ${statusClass(order.status)}">${order.status}</span></td>
        <td>${formatDate(order.date)}</td>
      `;

      const actionCell = document.createElement('td');
      actionCell.appendChild(button);
      row.appendChild(actionCell);
      ordersTableBody.appendChild(row);
    });

    renderPagination();
  }

  function renderPagination() {
    const paginationDiv = document.getElementById('ordersPagination');
    if (!paginationDiv) return;
    paginationDiv.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.textContent = 'Prev';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener('click', async () => {
      if (currentPage > 1) {
        currentPage -= 1;
        await loadOrders();
      }
    });
    paginationDiv.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i += 1) {
      const pageBtn = document.createElement('button');
      pageBtn.textContent = String(i);
      pageBtn.className = i === currentPage ? 'active' : '';
      pageBtn.addEventListener('click', async () => {
        currentPage = i;
        await loadOrders();
      });
      paginationDiv.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener('click', async () => {
      if (currentPage < totalPages) {
        currentPage += 1;
        await loadOrders();
      }
    });
    paginationDiv.appendChild(nextBtn);
  }

  function animateMetrics() {
    metricCards.forEach((card) => {
      const target = Number(card.getAttribute('data-target') || 0);
      const increment = Math.max(1, Math.ceil(target / 30));
      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          current = target;
          clearInterval(timer);
        }
        card.textContent = current.toLocaleString();
      }, 25);
    });
  }

  function drawLineChart(canvasId, labels, data, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;
    const width = container.offsetWidth - 40;
    const height = 250;

    canvas.width = width;
    canvas.height = height;

    const safeData = Array.isArray(data) && data.length ? data.map((v) => Number(v || 0)) : [0, 0, 0, 0, 0, 0, 0];
    const safeLabels = Array.isArray(labels) && labels.length ? labels : ['-', '-', '-', '-', '-', '-', '-'];

    const maxValue = Math.max(1, ...safeData);
    const padding = 40;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;
    const pointSpacing = safeData.length > 1 ? graphWidth / (safeData.length - 1) : graphWidth;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i += 1) {
      const y = padding + (graphHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();

    safeData.forEach((value, index) => {
      const x = padding + pointSpacing * index;
      const y = height - padding - (value / maxValue) * graphHeight;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = color;
    safeData.forEach((value, index) => {
      const x = padding + pointSpacing * index;
      const y = height - padding - (value / maxValue) * graphHeight;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    safeLabels.forEach((label, index) => {
      const x = padding + pointSpacing * index;
      ctx.fillText(String(label), x, height - padding + 20);
    });
  }

  async function loadMetrics() {
    const sellerId = resolveSellerId();
    const metrics = await fetchJson(`${API_BASE}/metrics?sellerId=${encodeURIComponent(sellerId)}`);

    const targets = [
      Number(metrics.totalOrders || 0),
      Number(metrics.pendingOrders || 0),
      Number(metrics.deliveredOrders || 0),
      Number(metrics.cancelledOrders || 0),
      Math.round(Number(metrics.totalSales || 0)),
      Math.round(Number(metrics.lifetimeEarnings || 0)),
      Math.round(Number(metrics.withdrawableBalance || 0)),
      Math.round(Number(metrics.pendingEarnings || 0)),
      Math.round(Number(metrics.pendingPayouts || 0)),
      Math.round(Number(metrics.commissionCharged || 0)),
      Math.round(Number(metrics.sellerRating || 0) * 10)
    ];

    metricCards.forEach((card, idx) => {
      card.setAttribute('data-target', String(targets[idx] || 0));
      card.textContent = '0';
    });

    animateMetrics();
  }

  async function loadOrders() {
    const sellerId = resolveSellerId();
    const search = (orderSearch && orderSearch.value.trim()) || '';
    const status = (orderFilter && orderFilter.value.trim()) || '';

    const params = new URLSearchParams({
      sellerId,
      page: String(currentPage),
      pageSize: String(itemsPerPage)
    });

    if (search) params.set('search', search);
    if (status) params.set('status', status.toLowerCase());

    const payload = await fetchJson(`${API_BASE}/orders?${params.toString()}`);
    currentOrders = Array.isArray(payload.orders) ? payload.orders : [];
    totalPages = Math.max(1, Number(payload.pagination?.totalPages || 1));
    currentPage = Math.max(1, Number(payload.pagination?.currentPage || 1));
    renderOrdersTable();
  }

  async function loadNotifications() {
    const sellerId = resolveSellerId();
    const payload = await fetchJson(`${API_BASE}/notifications?sellerId=${encodeURIComponent(sellerId)}`);
    notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
    renderNotifications();
  }

  async function showOrderDetails(orderId) {
    const sellerId = resolveSellerId();
    let order = null;

    try {
      order = await fetchJson(`${API_BASE}/orders/${encodeURIComponent(orderId)}?sellerId=${encodeURIComponent(sellerId)}`);
    } catch (_) {
      alert('Order not found');
      return;
    }

    document.getElementById('modalTitle').textContent = `Order Details - ${order.id}`;
    document.getElementById('detailOrderId').textContent = order.id;
    document.getElementById('detailDate').textContent = formatDate(order.date);
    document.getElementById('detailProduct').textContent = order.product;
    document.getElementById('detailCustomer').textContent = order.customer;
    document.getElementById('detailAmount').textContent = formatPkr(order.amount || 0);
    document.getElementById('detailStatus').textContent = order.status;

    const statusEl = document.getElementById('detailStatus');
    statusEl.style.backgroundColor = '#e7f3ff';
    statusEl.style.color = '#0066c0';

    if (String(order.status).toLowerCase().includes('delivered')) {
      statusEl.style.backgroundColor = '#d4edda';
      statusEl.style.color = '#155724';
    } else if (
      String(order.status).toLowerCase().includes('shipped') ||
      String(order.status).toLowerCase().includes('ready') ||
      String(order.status).toLowerCase().includes('pack') ||
      String(order.status).toLowerCase().includes('confirm')
    ) {
      statusEl.style.backgroundColor = '#fff3cd';
      statusEl.style.color = '#856404';
    } else if (String(order.status).toLowerCase().includes('pending')) {
      statusEl.style.backgroundColor = '#f8d7da';
      statusEl.style.color = '#721c24';
    } else if (String(order.status).toLowerCase().includes('cancel')) {
      statusEl.style.backgroundColor = '#f5c6cb';
      statusEl.style.color = '#721c24';
    }

    const modal = document.getElementById('orderDetailsModal');
    if (modal) {
      modal.style.display = 'flex';
      modal.style.visibility = 'visible';
      modal.style.opacity = '1';
    }
  }

  function closeOrderModal() {
    const modal = document.getElementById('orderDetailsModal');
    if (modal) modal.style.display = 'none';
  }

  function setupModalHandlers() {
    const closeBtn = document.getElementById('closeOrderModal');
    const closeBtnAction = document.getElementById('closeOrderModalBtn');
    const modal = document.getElementById('orderDetailsModal');

    if (closeBtn) closeBtn.onclick = closeOrderModal;
    if (closeBtnAction) closeBtnAction.onclick = closeOrderModal;
    if (modal) {
      modal.onclick = function (e) {
        if (e.target === this) closeOrderModal();
      };
    }
  }

  async function loadChart(chartType, period, canvasId, color) {
    const sellerId = resolveSellerId();
    const payload = await fetchJson(`${API_BASE}/charts/${encodeURIComponent(chartType)}?sellerId=${encodeURIComponent(sellerId)}&period=${encodeURIComponent(period)}`);
    drawLineChart(canvasId, payload.labels, payload.data, color);
  }

  function bindChartTabs() {
    document.querySelectorAll('.chart-tab').forEach((tab) => {
      tab.addEventListener('click', async function () {
        const chart = this.getAttribute('data-chart');
        const parent = this.closest('.chart-card');
        const siblings = parent.querySelectorAll('.chart-tab');

        siblings.forEach((s) => s.classList.remove('active'));
        this.classList.add('active');

        try {
          if (parent.querySelector('#salesChart')) {
            await loadChart('sales', chart, 'salesChart', '#0066c0');
          } else if (parent.querySelector('#earningsChart')) {
            const period = chart.replace('earnings-', '');
            await loadChart('earnings', period, 'earningsChart', '#28a745');
          }
        } catch (error) {
          console.error('Chart load failed', error);
        }
      });
    });
  }

  if (notifBell && notifPanel) {
    notifBell.addEventListener('click', () => notifPanel.classList.add('active'));
  }
  if (notifClose && notifPanel) {
    notifClose.addEventListener('click', () => notifPanel.classList.remove('active'));
  }

  if (orderSearch && orderFilter) {
    orderSearch.addEventListener('input', async () => {
      currentPage = 1;
      await loadOrders();
    });
    orderFilter.addEventListener('change', async () => {
      currentPage = 1;
      await loadOrders();
    });
  }

  setupModalHandlers();
  bindChartTabs();

  if (!isServerRuntimeAllowed()) {
    console.warn('Dashboard data fetch disabled outside localhost:5000 runtime.');
  } else {
    (async function init() {
      try {
        await Promise.all([
          loadMetrics(),
          loadOrders(),
          loadNotifications(),
          loadChart('sales', 'daily', 'salesChart', '#0066c0'),
          loadChart('earnings', 'daily', 'earningsChart', '#28a745')
        ]);
      } catch (error) {
        console.error('Dashboard initialization failed:', error);
      }
    })();

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(async () => {
        const activeSalesTab = document.querySelector('.chart-card:nth-of-type(1) .chart-tab.active');
        const activeEarningsTab = document.querySelector('.chart-card:nth-of-type(2) .chart-tab.active');

        try {
          if (activeSalesTab) {
            await loadChart('sales', activeSalesTab.getAttribute('data-chart'), 'salesChart', '#0066c0');
          }
          if (activeEarningsTab) {
            await loadChart('earnings', activeEarningsTab.getAttribute('data-chart').replace('earnings-', ''), 'earningsChart', '#28a745');
          }
        } catch (_) {}
      }, 250);
    });
  }
} catch (error) {
  console.error('Dashboard script error:', error);
}
