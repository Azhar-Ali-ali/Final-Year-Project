const ALLOWED_ORIGINS = ['http://localhost:5000', 'http://127.0.0.1:5000'];
const API_BASE = `${window.location.origin}/api/seller/orders`;

function isServerRuntimeAllowed() {
  return ALLOWED_ORIGINS.includes(window.location.origin);
}

function showRuntimeWarning() {
  const warning = document.createElement('div');
  warning.style.background = '#fff3cd';
  warning.style.border = '1px solid #ffeeba';
  warning.style.color = '#856404';
  warning.style.padding = '10px 14px';
  warning.style.borderRadius = '8px';
  warning.style.marginBottom = '14px';
  warning.style.fontSize = '13px';
  warning.textContent = 'Database data is disabled in preview mode. Open this page from http://localhost:5000 to load live data.';

  const pageRoot = document.querySelector('main') || document.body;
  pageRoot.insertBefore(warning, pageRoot.firstChild);
}

function getSellerId() {
  const candidateKeys = ['sellerId', 'seller_id', 'currentSellerId', 'sellerUserId', 'userId'];

  for (const key of candidateKeys) {
    const fromSession = sessionStorage.getItem(key);
    if (fromSession && String(fromSession).trim()) return String(fromSession).trim();

    const fromLocal = localStorage.getItem(key);
    if (fromLocal && String(fromLocal).trim()) return String(fromLocal).trim();
  }

  return '';
}

const sellerId = getSellerId();
let allOrders = [];
let currentPage = 1;
const itemsPerPage = 10;
let selectedOrder = null;
let currentFilters = {
  search: '',
  status: '',
  payment: '',
  city: ''
};

async function apiRequest(path, options = {}) {
  const url = new URL(`${API_BASE}${path}`);
  if (sellerId && !url.searchParams.has('sellerId')) {
    url.searchParams.set('sellerId', sellerId);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(sellerId ? { 'x-seller-id': sellerId } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: options.cache || 'no-store'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || payload.error || 'Request failed');
  }

  return payload;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().split('T')[0];
}

function formatPkr(value) {
  const amount = Number(value || 0);
  return `PKR ${amount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getStatusBadge(status) {
  const styles = {
    Pending: 'status-pending',
    Confirmed: 'status-confirmed',
    Packed: 'status-packed',
    'Ready for Pickup': 'status-ready'
  };

  return styles[status] || 'status-pending';
}

function normalizeOrder(order) {
  return {
    id: order.id,
    dbId: order.dbId || order.db_id || order.id,
    customer: order.customer || 'Customer',
    phone: order.phone || '-',
    email: order.email || '-',
    address: order.address || '-',
    city: order.city || '-',
    postal: order.postal || '-',
    paymentType: order.paymentType || 'COD',
    paymentStatus: order.paymentStatus || 'Pending',
    status: order.status || 'Pending',
    date: formatDate(order.date),
    products: Array.isArray(order.products) ? order.products : [],
    subtotal: Number(order.subtotal || 0),
    commission: Number(order.commission || 0),
    earnings: Number(order.earnings || 0),
    courier: order.courier || null,
    tracking: order.tracking || null,
    deliveryStatus: order.deliveryStatus || null,
    notes: order.notes || ''
  };
}

function renderSummaryCards(overview = {}) {
  document.getElementById('pendingCount').innerText = overview.pendingCount ?? 0;
  document.getElementById('confirmedCount').innerText = overview.confirmedCount ?? 0;
  document.getElementById('packedCount').innerText = overview.packedCount ?? 0;
  document.getElementById('readyCount').innerText = overview.readyCount ?? 0;
}

function renderOrderList() {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;

  const pageOrders = allOrders;

  const html = pageOrders.map(order => `
    <tr>
      <td><strong>${order.id}</strong></td>
      <td>${order.customer}</td>
      <td>${order.city}</td>
      <td>${order.paymentType}</td>
      <td>${order.paymentStatus}</td>
      <td><span class="badge-status ${getStatusBadge(order.status)}">${order.status}</span></td>
      <td>${formatPkr(order.earnings || 0)}</td>
      <td>${order.earningsStatus || 'Pending Delivery'}</td>
      <td>${order.courier || '-'}</td>
      <td>${order.tracking || '-'}</td>
      <td>${order.date}</td>
      <td><strong>${formatPkr(order.subtotal)}</strong></td>
      <td><button class="btn-view" onclick="openOrderDetail('${order.id}')">View</button></td>
    </tr>
  `).join('');

  tbody.innerHTML = html || '<tr><td colspan="11" style="text-align:center; padding:40px; color:#999;">No orders found</td></tr>';
}

function renderPagination(pagination = {}) {
  const paginationDiv = document.getElementById('ordersPagination');
  if (!paginationDiv) return;

  const totalPages = pagination.totalPages || Math.ceil(allOrders.length / itemsPerPage);
  if (totalPages <= 1) {
    paginationDiv.innerHTML = '';
    return;
  }

  let html = '';
  if (currentPage > 1) html += `<button onclick="goToPage(${currentPage - 1})">← Prev</button>`;

  for (let i = 1; i <= totalPages; i += 1) {
    if (i <= 2 || i >= totalPages - 1 || (i >= currentPage - 1 && i <= currentPage + 1)) {
      html += `<button onclick="goToPage(${i})" ${currentPage === i ? 'class="active"' : ''}>${i}</button>`;
    } else if (i === currentPage - 2 || i === currentPage + 2) {
      html += '<button disabled>...</button>';
    }
  }

  if (currentPage < totalPages) html += `<button onclick="goToPage(${currentPage + 1})">Next →</button>`;
  paginationDiv.innerHTML = html;
}

function updateActionButtons(status) {
  const acceptBtn = document.getElementById('acceptBtn');
  const packBtn = document.getElementById('packBtn');
  const readyBtn = document.getElementById('readyBtn');

  [acceptBtn, packBtn, readyBtn].forEach(btn => btn && btn.classList.add('hidden'));

  if (status === 'Pending' && acceptBtn) {
    acceptBtn.classList.remove('hidden');
    acceptBtn.onclick = () => updateOrderStatus('Confirmed');
  } else if (status === 'Confirmed' && packBtn) {
    packBtn.classList.remove('hidden');
    packBtn.onclick = () => updateOrderStatus('Packed');
  } else if (status === 'Packed' && readyBtn) {
    readyBtn.classList.remove('hidden');
    readyBtn.onclick = () => updateOrderStatus('Ready for Pickup');
  }
}

function fillOrderModal(order) {
  document.getElementById('detailOrderId').innerText = order.id;
  document.getElementById('detailOrderDate').innerText = `Order placed on ${order.date}`;
  document.getElementById('detailStatusBadge').className = `badge-status ${getStatusBadge(order.status)}`;
  document.getElementById('detailStatusBadge').innerText = order.status;
  document.getElementById('detailPaymentType').innerText = order.paymentType;
  document.getElementById('detailPaymentStatus').innerText = order.paymentStatus;
  document.getElementById('detailTotal').innerText = formatPkr(order.subtotal);
  document.getElementById('detailCommission').innerText = formatPkr(order.commission);
  document.getElementById('detailEarnings').innerText = formatPkr(order.earnings);
  document.getElementById('detailEarningsStatus').innerText = order.earningsStatus || 'Pending Delivery';
  document.getElementById('detailCustomer').innerText = order.customer;
  document.getElementById('detailPhone').innerText = order.phone;
  document.getElementById('detailAddress').innerText = order.address;
  document.getElementById('detailCity').innerText = order.city;
  document.getElementById('detailPostal').innerText = order.postal;
  document.getElementById('detailCourier').innerText = order.courier || 'Awaiting Admin Assignment';
  document.getElementById('detailTracking').innerText = order.tracking || '-';
  document.getElementById('detailDeliveryStatus').innerText = order.deliveryStatus || 'Pending Admin Assignment';
  // document.getElementById('detailStoreName').innerText = 'Your Store'; // Replaced by seller-header-state.js for live shop name
  document.getElementById('detailPickupAddress').innerText = order.city || 'Karachi, Pakistan';

  const detailProducts = document.getElementById('detailProducts');
  detailProducts.innerHTML = order.products.map(product => `
    <div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #e5e7eb;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <strong>${product.name}</strong>
        <strong>${formatPkr(Number(product.price || 0) * Number(product.qty || 0))}</strong>
      </div>
      <div style="font-size: 13px; color: #666;">SKU: ${product.sku} | Qty: ${product.qty} x ${formatPkr(Number(product.price || 0))}</div>
    </div>
  `).join('');

  updateActionButtons(order.status);
}

async function loadOverview() {
  const response = await apiRequest('/overview');
  renderSummaryCards(response.data || {});
}

async function loadCities() {
  try {
    const response = await apiRequest('/filter/cities');
    const cities = Array.isArray(response.data) ? response.data : [];
    const cityFilter = document.getElementById('cityFilter');
    if (!cityFilter) return;

    const current = cityFilter.value;
    cityFilter.innerHTML = ['<option value="">All Cities</option>', ...cities.map(city => `<option value="${city}">${city}</option>`)].join('');
    cityFilter.value = current;
  } catch (error) {
    console.error('Failed to load cities', error);
  }
}

async function loadOrders(page = 1) {
  currentPage = page;
  currentFilters = {
    search: document.getElementById('searchInput')?.value.trim() || '',
    status: document.getElementById('statusFilter')?.value || '',
    payment: document.getElementById('paymentFilter')?.value || '',
    city: document.getElementById('cityFilter')?.value || ''
  };

  const params = new URLSearchParams();
  params.set('page', String(currentPage));
  params.set('pageSize', String(itemsPerPage));
  if (currentFilters.search) params.set('search', currentFilters.search);
  if (currentFilters.status) params.set('status', currentFilters.status);
  if (currentFilters.payment) params.set('payment', currentFilters.payment);
  if (currentFilters.city) params.set('city', currentFilters.city);

  const response = await apiRequest(`?${params.toString()}`);
  allOrders = Array.isArray(response.data) ? response.data.map(normalizeOrder) : [];
  renderOrderList();
  renderPagination(response.pagination || {});
}

async function refreshDashboard() {
  try {
    await Promise.all([loadOverview(), loadCities(), loadOrders(1)]);
  } catch (error) {
    console.error('Failed to refresh seller dashboard', error);
    alert(error.message || 'Failed to refresh dashboard');
  }
}

function filterOrders() {
  loadOrders(1).catch(error => alert(error.message || 'Failed to load orders'));
}

window.goToPage = (page) => {
  loadOrders(page).catch(error => alert(error.message || 'Failed to load page'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

async function loadOrderDetail(orderId) {
  const response = await apiRequest(`/${encodeURIComponent(orderId)}`);
  const order = normalizeOrder(response.data || {});
  selectedOrder = order;
  fillOrderModal(order);
  return order;
}

window.openOrderDetail = async function(orderId) {
  const modal = document.getElementById('orderDetailModal');
  if (!modal) return;

  try {
    const order = await loadOrderDetail(orderId);
    modal.style.display = 'flex';
    modal.style.visibility = 'visible';
    modal.style.pointerEvents = 'auto';
    modal.classList.add('active');
    void modal.offsetWidth;
    selectedOrder = order;
  } catch (error) {
    alert(error.message || 'Failed to load order details');
  }
};

async function updateOrderStatus(newStatus) {
  if (!selectedOrder) return;

  try {
    await apiRequest(`/${encodeURIComponent(selectedOrder.dbId || selectedOrder.id)}/status`, {
      method: 'PUT',
      body: { status: newStatus }
    });

    await Promise.all([
      loadOverview(),
      loadOrders(currentPage),
      loadOrderDetail(selectedOrder.id)
    ]);

    alert(`✅ Order ${selectedOrder.id} status updated to: ${newStatus}`);
  } catch (error) {
    alert(error.message || '❌ Failed to update order status');
  }
}

window.printInvoice = function() {
  if (!selectedOrder) return;
  const order = selectedOrder;
  const productList = order.products.map(p =>
    `<tr><td>${p.name}</td><td>${p.sku}</td><td>${p.qty}</td><td>${formatPkr(Number(p.price || 0))}</td><td>${formatPkr(Number(p.price || 0) * Number(p.qty || 0))}</td></tr>`
  ).join('');

  const content = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice ${order.id}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
        .header h3 { margin: 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #f0f0f0; padding: 10px; text-align: left; font-weight: bold; }
        td { padding: 10px; border-bottom: 1px solid #ddd; }
        .totals { margin-top: 20px; text-align: right; }
        .grandtotal { font-weight: bold; font-size: 16px; margin-top: 10px; border-top: 2px solid #333; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div><h3>Your Store Name</h3><p>${order.address}</p></div>
        <div style="text-align: right;"><h2>INVOICE</h2><h3>${order.id}</h3></div>
      </div>
      <div style="margin-bottom: 30px;">
        <strong>Customer:</strong> ${order.customer}<br>
        <strong>Phone:</strong> ${order.phone}<br>
        <strong>Address:</strong> ${order.address}, ${order.city}<br>
      </div>
      <table>
        <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>${productList}</tbody>
      </table>
      <div class="totals">
        <div>Subtotal: <strong>${formatPkr(order.subtotal)}</strong></div>
        <div>Commission: <strong>-${formatPkr(order.commission)}</strong></div>
        <div class="grandtotal">Your Earnings: <strong>${formatPkr(order.earnings)}</strong></div>
      </div>
    </body>
    </html>
  `;

  const w = window.open('', '', 'width=900,height=700');
  w.document.write(content);
  w.document.close();
  setTimeout(() => w.print(), 250);
};

window.printPackingSlip = function() {
  if (!selectedOrder) return;
  const order = selectedOrder;
  const productList = order.products.map((p, i) => `<tr><td>${i + 1}.</td><td>${p.name}</td><td>${p.qty}</td></tr>`).join('');

  const content = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Packing Slip ${order.id}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
        .header h1 { margin: 0 0 10px 0; font-size: 24px; }
        .orderinfo { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #f0f0f0; padding: 10px; text-align: left; font-weight: bold; }
        td { padding: 12px 10px; border-bottom: 1px solid #ddd; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>PACKING SLIP</h1>
        <h2>${order.id}</h2>
      </div>
      <div class="orderinfo">
        <div>
          <strong>Order Date:</strong> ${order.date}<br>
          <strong>Payment:</strong> ${order.paymentType}<br>
          <strong>Status:</strong> ${order.status}
        </div>
        <div>
          <strong>Customer:</strong> ${order.customer}<br>
          <strong>Phone:</strong> ${order.phone}<br>
          <strong>Address:</strong> ${order.address}
        </div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Product</th><th>Qty</th></tr></thead>
        <tbody>${productList}</tbody>
      </table>
      <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #333;">
        <p style="margin: 0;"><strong>Packed by:</strong> _________________</p>
        <p style="margin: 10px 0 0 0;"><strong>Date:</strong> _________________</p>
      </div>
    </body>
    </html>
  `;

  const w = window.open('', '', 'width=900,height=700');
  w.document.write(content);
  w.document.close();
  setTimeout(() => w.print(), 250);
};

function closeModal() {
  const modal = document.getElementById('orderDetailModal');
  if (modal) {
    modal.style.display = 'none';
    modal.style.visibility = 'hidden';
    modal.classList.remove('active');
  }
  selectedOrder = null;
}

window.closeOrderDetail = closeModal;
window.filterOrders = filterOrders;
window.updateOrderStatus = updateOrderStatus;

function setupEventListeners() {
  document.getElementById('searchInput')?.addEventListener('input', filterOrders);
  document.getElementById('statusFilter')?.addEventListener('change', filterOrders);
  document.getElementById('paymentFilter')?.addEventListener('change', filterOrders);
  document.getElementById('cityFilter')?.addEventListener('change', filterOrders);
  document.getElementById('closeOrderDetail')?.addEventListener('click', closeModal);

  const modal = document.getElementById('orderDetailModal');
  if (modal) {
    window.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
}

function initOrderPage() {
  if (!isServerRuntimeAllowed()) {
    showRuntimeWarning();
    console.warn('Order page data fetch disabled outside localhost:5000 runtime.');
    return;
  }

  setupEventListeners();
  refreshDashboard().catch(error => {
    console.error(error);
    alert(error.message || 'Failed to load order data from database.');
  });
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', initOrderPage)
  : initOrderPage();
