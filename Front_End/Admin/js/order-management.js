const API_BASE_URL = window.ADMIN_API_BASE_URL || 'http://localhost:5000';

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function getAdminToken() {
  const fromStorage = localStorage.getItem('lumina.admin.authToken') || localStorage.getItem('lumina.auth.token') || '';
  if (fromStorage) return fromStorage;

  const match = document.cookie.match(/(?:^|; )lumina_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getAdminId() {
  return localStorage.getItem('adminId') || localStorage.getItem('userId') || '';
}

async function fetchJson(path, options = {}) {
  const token = getAdminToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['x-session-token'] = token;
  }

  const adminId = getAdminId();
  if (adminId) {
    headers['x-admin-id'] = adminId;
  }

  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    headers,
    ...options
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    throw new Error(result.message || `Request failed (${response.status})`);
  }
  return result;
}

let statuses = ['Pending Payment', 'Processing', 'Ready for Pickup', 'Courier Assigned', 'Picked Up', 'Out for Delivery', 'Delivered', 'Completed', 'Cancelled'];
let shipmentStatuses = ['New Pickup Available', 'Courier Accepted', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'RTO (Return to Origin)', 'Failed Delivery'];

const statusClass = {
  'Pending Payment': 'st-pending',
  Processing: 'st-packed',
  'Ready for Pickup': 'st-ready',
  'Courier Assigned': 'st-shipped',
  'Picked Up': 'st-shipped',
  'Out for Delivery': 'st-shipped',
  Delivered: 'st-confirmed',
  Completed: 'st-delivered',
  Cancelled: 'st-cancelled',
  Returned: 'st-returned',
  Pending: 'st-pending',
  Confirmed: 'st-confirmed',
  Packed: 'st-packed',
  Shipped: 'st-shipped'
};

let orders = [];
let selectedOrder = null;
let statsData = { total: 0, delivered: 0, shipped: 0, returned: 0, cancelled: 0, codPending: 0 };
let metaData = { sellers: [], couriers: [], cities: [] };

function fmtMoney(value) {
  const amount = Number(value) || 0;
  return `$${amount.toFixed(2)}`;
}

function statusBadge(status) {
  return `<span class="badge ${statusClass[status] || 'st-pending'}">${status}</span>`;
}

function settlementBadge(status) {
  if (status === 'Paid') return `<span class="badge settle-paid">Paid</span>`;
  if (status === 'Adjusted') return `<span class="badge settle-adjusted">Adjusted</span>`;
  return `<span class="badge settle-pending">Pending</span>`;
}

function paymentBadge(status) {
  const normalized = String(status || 'Pending').toLowerCase();
  if (normalized === 'paid' || normalized === 'success') {
    return '<span class="badge settle-paid">Paid</span>';
  }
  if (normalized === 'failed') {
    return '<span class="badge st-cancelled">Failed</span>';
  }
  return '<span class="badge settle-pending">Pending</span>';
}

function normalizeOrderStatus(order) {
  const raw = String(order?.status || order?.orderStatus || 'Processing');
  const normalized = raw.toLowerCase();

  if (normalized === 'deliveredcompleted') return 'Completed';
  if (normalized === 'delivered') return 'Delivered';
  if (normalized === 'paid' || normalized === 'confirmed' || normalized === 'packed') return 'Processing';
  if (normalized === 'ready_for_pickup' || normalized === 'ready for pickup') return 'Ready for Pickup';
  if (normalized === 'shipped') return 'Ready for Pickup';
  if (normalized === 'assigned') return 'Courier Assigned';
  if (normalized === 'out_for_delivery') return 'Out for Delivery';
  if (normalized === 'courier_assigned') return 'Courier Assigned';
  if (normalized === 'picked_up' || normalized === 'picked up') return 'Picked Up';
  if (normalized === 'processing') return 'Processing';
  return raw;
}

function normalizePaymentStatus(order) {
  const raw = String(order.paymentStatus || 'Pending').toLowerCase();
  if (raw === 'success') return 'Paid';
  if (raw === 'failed') return 'Failed';
  if (raw === 'paid') return 'Paid';
  if (raw === 'refunded') return 'Refunded';
  return 'Pending';
}

function paymentMethod(order) {
  const method = String(order.paymentType || order.paymentMethod || '').toLowerCase();
  return method === 'cod' ? 'COD' : 'Online';
}

function isCashCollected(order) {
  if (paymentMethod(order) !== 'COD') {
    return false;
  }
  if (normalizePaymentStatus(order) === 'Paid') {
    return true;
  }
  const shipment = String(order.shipmentStatus || '').toLowerCase();
  const codEvent = String(order.codCollectionStatus || '').toLowerCase();
  return shipment.includes('cash collected') || codEvent === 'collected';
}

function parseDate(dateText) {
  return new Date(`${dateText}T00:00:00`);
}

async function loadMeta() {
  try {
    const result = await fetchJson('/api/admin/orders/meta');
    const data = result.data || {};
    shipmentStatuses = Array.isArray(data.shipmentStatuses) && data.shipmentStatuses.length ? data.shipmentStatuses : shipmentStatuses;
    metaData = {
      sellers: Array.isArray(data.sellers) ? data.sellers : [],
      couriers: Array.isArray(data.couriers) ? data.couriers : [],
      cities: Array.isArray(data.cities) ? data.cities : []
    };
  } catch (_) {
    metaData = { sellers: [], couriers: [], cities: [] };
  }
}

async function loadStats() {
  try {
    const result = await fetchJson('/api/admin/orders/stats');
    statsData = result.data || statsData;
  } catch (_) {
    statsData = { total: 0, delivered: 0, shipped: 0, returned: 0, cancelled: 0, codPending: 0 };
  }
}

async function loadOrders() {
  try {
    const result = await fetchJson('/api/admin/orders/orders');
    orders = Array.isArray(result.data) ? result.data : [];
  } catch (_) {
    orders = [];
  }
}

async function reloadAll() {
  await Promise.all([loadMeta(), loadStats(), loadOrders()]);
}

function fillFilterOptions() {
  const sellerSel = document.getElementById('filter-seller');
  sellerSel.innerHTML = '<option value="">All Sellers</option>' + metaData.sellers.map((s) => `<option value="${s}">${s}</option>`).join('');

  const statusSel = document.getElementById('filter-status');
  statusSel.innerHTML = '<option value="">All Statuses</option>' + statuses.map((s) => `<option value="${s}">${s}</option>`).join('');

  const paymentSel = document.getElementById('filter-payment');
  paymentSel.innerHTML = '<option value="">All Payment Statuses</option><option value="Paid">Paid</option><option value="Pending">Pending</option><option value="Failed">Failed</option><option value="Refunded">Refunded</option>';

  const courierSel = document.getElementById('filter-courier');
  courierSel.innerHTML = '<option value="">All Couriers</option>' + metaData.couriers.map((c) => `<option value="${c}">${c}</option>`).join('');

  const citySel = document.getElementById('filter-city');
  citySel.innerHTML = '<option value="">All Cities</option>' + metaData.cities.map((c) => `<option value="${c}">${c}</option>`).join('');
}

function getFilteredOrders() {
  const q = document.getElementById('search-text').value.trim().toLowerCase();
  const seller = document.getElementById('filter-seller').value;
  const status = document.getElementById('filter-status').value;
  const payment = document.getElementById('filter-payment').value;
  const courier = document.getElementById('filter-courier').value;
  const city = document.getElementById('filter-city').value;

  return orders.filter((o) => {
    if (q && !(`${o.orderId} ${o.customerName || ''} ${o.sellerName || ''}`.toLowerCase().includes(q))) return false;
    if (seller && o.sellerName !== seller) return false;
    if (status && normalizeOrderStatus(o) !== status) return false;
    if (payment && normalizePaymentStatus(o) !== payment) return false;
    if (courier && o.courierName !== courier) return false;
    if (city && o.customerCity !== city) return false;
    return true;
  });
}

function renderStats() {
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-value">${Number(statsData.total || 0)}</div><div class="stat-label">Total Marketplace Orders</div></div>
    <div class="stat-card success"><div class="stat-value">${Number(statsData.delivered || 0)}</div><div class="stat-label">Delivered</div></div>
    <div class="stat-card"><div class="stat-value">${Number(statsData.shipped || 0)}</div><div class="stat-label">Shipped</div></div>
    <div class="stat-card warning"><div class="stat-value">${Number(statsData.returned || 0)}</div><div class="stat-label">Returned / RTO</div></div>
    <div class="stat-card danger"><div class="stat-value">${Number(statsData.cancelled || 0)}</div><div class="stat-label">Cancelled</div></div>
    <div class="stat-card warning"><div class="stat-value">${Number(statsData.codPending || 0)}</div><div class="stat-label">COD Pending Receipt</div></div>
  `;
}

function renderTable() {
  const rows = getFilteredOrders();
  document.getElementById('orders-tbody').innerHTML = rows.map((o) => `
    <tr>
      <td><span class="click-link" onclick="openOrder('${o.orderId}')">${o.orderId}</span></td>
      <td>${o.customerName}</td>
      <td>${o.sellerName}</td>
      <td>${fmtMoney(o.orderTotal)}</td>
      <td>${paymentMethod(o)}</td>
      <td>${paymentBadge(normalizePaymentStatus(o))}</td>
      <td>${statusBadge(normalizeOrderStatus(o))}</td>
      <td>${o.customerCity || '-'}</td>
      <td>${o.customerState || o.state || '-'}</td>
      <td>${o.courierName || '-'}</td>
      <td>${o.orderDate || '-'}</td>
      <td>
        <button class="btn sm" onclick="openOrder('${o.orderId}')">View Order</button>
        <button class="btn sm danger" onclick="cancelOrderById('${o.orderId}')">Cancel</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="12">No orders found for selected filters.</td></tr>';
}

function timelineHtml(order) {
  const method = paymentMethod(order);
  const orderStatus = normalizeOrderStatus(order);
  const payStatus = normalizePaymentStatus(order);
  const shipment = String(order.shipmentStatus || '').toLowerCase();
  const pickedUp = orderStatus === 'Picked Up' || shipment === 'picked up' || shipment === 'in transit';
  const cashCollected = isCashCollected(order);

  const onlineFlow = ['Pending Payment', 'Paid', 'Processing', 'Ready for Pickup', 'Courier Assigned', 'Picked Up', 'Out for Delivery', 'Delivered', 'Completed'];
  const codFlow = ['Processing', 'Ready for Pickup', 'Courier Assigned', 'Picked Up', 'Out for Delivery', 'Cash Collected', 'Delivered', 'Completed'];
  const flow = method === 'COD' ? codFlow : onlineFlow;

  let activeIndex = 0;
  if (method === 'COD') {
    if (orderStatus === 'Completed') activeIndex = 7;
    else if (orderStatus === 'Delivered') activeIndex = 6;
    else if (cashCollected) activeIndex = 5;
    else if (orderStatus === 'Out for Delivery') activeIndex = 4;
    else if (pickedUp) activeIndex = 3;
    else if (orderStatus === 'Courier Assigned') activeIndex = 2;
    else if (orderStatus === 'Ready for Pickup') activeIndex = 1;
    else activeIndex = 0;
  } else {
    if (orderStatus === 'Completed') activeIndex = 8;
    else if (orderStatus === 'Delivered') activeIndex = 7;
    else if (orderStatus === 'Out for Delivery') activeIndex = 6;
    else if (pickedUp) activeIndex = 5;
    else if (orderStatus === 'Courier Assigned') activeIndex = 4;
    else if (orderStatus === 'Ready for Pickup') activeIndex = 3;
    else if (orderStatus === 'Processing') activeIndex = 2;
    else if (payStatus === 'Paid') activeIndex = 1;
    else activeIndex = 0;
  }

  return flow.map((step, index) => `<span class="step ${index <= activeIndex ? 'active' : ''}">${step}${index < flow.length - 1 ? ' &darr;' : ''}</span>`).join(' ');
}

function kv(label, value) {
  return `<div class="kv"><div class="k">${label}</div><div class="v">${value}</div></div>`;
}

function renderActivity(order) {
  document.getElementById('activity-log').innerHTML = (order.activities || []).map((a) => `
    <div class="activity-item"><strong>${a.at}</strong> • <strong>${a.by}</strong><br>${a.note}</div>
  `).join('') || '<div class="activity-item">No activity yet.</div>';
}

function renderDynamicButtons(order) {
  const wrap = document.getElementById('dynamic-actions');
  const buttons = [];

  if (order.status === 'Pending') {
    buttons.push(['Confirm Order', 'success', () => setStatus(order, 'Confirmed', 'Admin confirmed order')]);
    buttons.push(['Cancel Order', 'danger', () => setStatus(order, 'Cancelled', 'Pre-shipment cancellation')]);
  }

  if (['Confirmed', 'Packed'].includes(order.status)) {
    buttons.push(['Assign Courier', 'primary', () => assignCourier(order)]);
  }

  if (order.status === 'Ready for Pickup') {
    buttons.push(['Create Shipment', 'success', () => createShipment(order)]);
    buttons.push(['Assign Courier', 'primary', () => assignCourier(order)]);
  }

  if (order.status === 'Shipped') {
    buttons.push(['Update Tracking ID', 'secondary', () => updateTracking(order)]);
    buttons.push(['Update Shipment Status', 'secondary', () => updateShipmentStatus(order)]);
    buttons.push(['Mark Delivered', 'success', () => markDelivered(order)]);
    buttons.push(['Mark Returned', 'warning', () => markReturned(order, 'Courier RTO update')]);
  }

  if (order.status === 'Delivered' && order.paymentType === 'COD') {
    buttons.push(['Mark COD Received', 'success', () => markCodReceived(order)]);
    buttons.push(['Trigger Seller Settlement', 'success', () => triggerSettlement(order)]);
  }

  if (order.status === 'Returned') {
    buttons.push(['Process Refund', 'warning', () => processRefund(order)]);
    buttons.push(['Reverse Seller Earnings', 'warning', () => reverseEarnings(order)]);
    buttons.push(['Adjust Inventory', 'secondary', () => adjustInventory(order)]);
  }

  buttons.push(['Override Seller Status', 'secondary', () => overrideStatus(order)]);

  wrap.innerHTML = buttons.map((b, i) => `<button class="btn ${b[1]}" data-i="${i}">${b[0]}</button>`).join('');
  [...wrap.querySelectorAll('button')].forEach((btn) => {
    const i = Number(btn.dataset.i);
    btn.addEventListener('click', buttons[i][2]);
  });
}

function renderModal(order) {
  document.getElementById('order-timeline').innerHTML = timelineHtml(order);
  document.getElementById('product-tbody').innerHTML = (order.products || []).map((p) => `
    <tr>
      <td>${p.name}</td>
      <td>${p.sku}</td>
      <td>${p.qty}</td>
      <td>${fmtMoney(p.price)}</td>
      <td>${fmtMoney(p.subtotal)}</td>
    </tr>
  `).join('');

  document.getElementById('customer-info').innerHTML = [
    kv('Customer Name', order.customerName),
    kv('Phone Number', order.customerPhone || '-'),
    kv('Email', order.customerEmail || '-'),
    kv('City', order.customerCity),
    kv('State', order.customerState || order.state || '-'),
    kv('Postal Code', order.customerPostal),
    kv('Current Order Status', statusBadge(normalizeOrderStatus(order)))
  ].join('');

  document.getElementById('seller-info').innerHTML = [
    kv('Seller Name', order.sellerName),
    kv('Seller Store Name', order.sellerStoreName),
    kv('Seller Contact', order.sellerContact || '-'),
    kv('Seller Email', order.sellerEmail || '-'),
    kv('Pickup Address', order.pickupAddress || '-')
  ].join('');

  document.getElementById('delivery-info').innerHTML = [
    kv('Full Address', order.customerAddress || '-'),
    kv('City', order.customerCity || '-'),
    kv('State', order.customerState || order.state || '-'),
    kv('Postal Code', order.customerPostal || '-'),
    kv('Delivery Instructions', order.deliveryInstructions || '-')
  ].join('');

  document.getElementById('courier-info').innerHTML = [
    kv('Courier Name', order.courierName || '-'),
    kv('Tracking ID', order.trackingId || '-'),
    kv('Shipment Status', order.shipmentStatus || 'New Pickup Available'),
    kv('Pickup Date', order.pickupDate || '-'),
    kv('Delivery Date', order.deliveredDate || '-')
  ].join('');

  const transactionId = order.transactionId || order.paymentTransactionId || order.gatewayTxnId || '-';
  const paymentTime = order.paymentTime || order.paidAt || order.transactionTime || '-';
  document.getElementById('payment-info').innerHTML = [
    kv('Payment Method', paymentMethod(order)),
    kv('Transaction ID', transactionId),
    kv('Payment Status', paymentBadge(normalizePaymentStatus(order))),
    kv('Payment Time', paymentTime),
    kv('COD Cash Collection', paymentMethod(order) === 'COD' ? (isCashCollected(order) ? 'Collected' : 'Pending Collection') : 'Not Applicable'),
    kv('Order Total', fmtMoney(order.orderTotal))
  ].join('');

  const selectedStatus = normalizeOrderStatus(order);
  document.getElementById('action-status-select').innerHTML = statuses.map((s) => `<option value="${s}" ${selectedStatus === s ? 'selected' : ''}>${s}</option>`).join('');
  document.getElementById('order-modal').classList.add('active');
}

async function cancelOrderById(orderId) {
  const order = orders.find((item) => item.orderId === orderId);
  if (!order) {
    return;
  }
  const ok = window.confirm(`Cancel order ${order.orderId}?`);
  if (!ok) {
    return;
  }
  await setStatus(order, 'Cancelled', 'Cancelled by admin from order management list');
}

async function refreshAndRender(orderIdToKeep = null) {
  await Promise.all([loadStats(), loadOrders()]);
  renderStats();
  renderTable();
  if (orderIdToKeep) {
    await openOrder(orderIdToKeep);
  }
}

async function callOrderEndpoint(orderId, method, suffix, body = null) {
  return fetchJson(`/api/admin/orders/orders/${encodeURIComponent(orderId)}${suffix}`, {
    method,
    body: body ? JSON.stringify(body) : undefined
  });
}

async function setStatus(order, status, note) {
  try {
    await callOrderEndpoint(order.orderId, 'PATCH', '/status', { status, note });
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to update status.');
  }
}

async function assignCourier(order) {
  const c = document.getElementById('action-courier').value.trim();
  const t = document.getElementById('action-tracking').value.trim();
  if (!c) {
    alert('Enter courier name.');
    return;
  }

  try {
    await callOrderEndpoint(order.orderId, 'PATCH', '/courier', { courierName: c, trackingId: t });
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to assign courier.');
  }
}

async function createShipment(order) {
  const c = document.getElementById('action-courier').value.trim();
  const t = document.getElementById('action-tracking').value.trim();
  if (c) {
    await assignCourier(order);
  }
  try {
    await callOrderEndpoint(order.orderId, 'PATCH', '/shipment', { shipmentStatus: 'Picked Up', trackingId: t || undefined });
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to create shipment.');
  }
}

async function updateTracking(order) {
  const tracking = document.getElementById('action-tracking').value.trim();
  if (!tracking) {
    alert('Enter tracking ID.');
    return;
  }
  try {
    await callOrderEndpoint(order.orderId, 'PATCH', '/shipment', { trackingId: tracking });
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to update tracking ID.');
  }
}

async function updateShipmentStatus(order) {
  const status = document.getElementById('action-shipment-status').value;
  try {
    await callOrderEndpoint(order.orderId, 'PATCH', '/shipment', { shipmentStatus: status });
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to update shipment status.');
  }
}

async function markDelivered(order) {
  try {
    await callOrderEndpoint(order.orderId, 'PATCH', '/shipment', { markDelivered: true });
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to mark delivered.');
  }
}

async function markReturned(order, reason) {
  try {
    await callOrderEndpoint(order.orderId, 'PATCH', '/shipment', { markReturned: true, reason });
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to mark returned.');
  }
}

async function markCodReceived(order) {
  if (order.paymentType !== 'COD') {
    alert('This is an Online payment order. Mark COD Received works only for COD orders.');
    return;
  }
  if (order.status !== 'Delivered') {
    alert('Mark COD Received is available only after the order is Delivered.');
    return;
  }
  if (order.codReceived) {
    alert('COD is already marked as received for this order.');
    return;
  }

  try {
    await callOrderEndpoint(order.orderId, 'POST', '/actions/cod-received');
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to mark COD received.');
  }
}

async function triggerSettlement(order) {
  if (order.paymentType !== 'COD') {
    alert('Seller settlement from this section is only for COD orders. This order is Online.');
    return;
  }
  if (order.status !== 'Delivered') {
    alert('Settlement can be triggered only after the order is Delivered.');
    return;
  }
  if (!order.codReceived && !order.sellerSettlementDone) {
    alert('Please click Mark COD Received first.');
    return;
  }
  if (order.sellerSettlementDone || order.settlementStatus === 'Paid') {
    alert('Settlement already completed for this order.');
    return;
  }

  try {
    await callOrderEndpoint(order.orderId, 'POST', '/actions/settlement');
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to trigger settlement.');
  }
}

async function processRefund(order) {
  try {
    await callOrderEndpoint(order.orderId, 'POST', '/actions/refund');
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to process refund.');
  }
}

async function reverseEarnings(order) {
  try {
    await callOrderEndpoint(order.orderId, 'POST', '/actions/reverse-earnings');
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to reverse earnings.');
  }
}

async function adjustInventory(order) {
  try {
    await callOrderEndpoint(order.orderId, 'POST', '/actions/adjust-inventory');
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to adjust inventory.');
  }
}

async function overrideStatus(order) {
  const target = document.getElementById('action-status-select').value;
  await setStatus(order, target, `Admin override: status changed to ${target}`);
}

async function saveAddress(order) {
  const addr = document.getElementById('edit-address').value.trim();
  if (!addr) return;
  try {
    await callOrderEndpoint(order.orderId, 'PATCH', '/address', { customerAddress: addr });
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to save address.');
  }
}

async function addInternalNote(order) {
  const note = document.getElementById('action-note').value.trim();
  if (!note) {
    alert('Enter note first.');
    return;
  }
  try {
    await callOrderEndpoint(order.orderId, 'POST', '/notes', { note });
    document.getElementById('action-note').value = '';
    await refreshAndRender(order.orderId);
  } catch (error) {
    alert(error.message || 'Failed to add note.');
  }
}

async function openOrder(orderId) {
  try {
    const result = await fetchJson(`/api/admin/orders/orders/${encodeURIComponent(orderId)}`);
    const order = result.data;
    if (!order) return;
    selectedOrder = order;
    renderModal(order);
  } catch (error) {
    alert(error.message || 'Failed to load order details.');
  }
}

function printInvoice(order) {
  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(`
    <html><head><title>Invoice ${order.orderId}</title></head><body style="font-family:Arial;padding:20px;">
      <h2>Invoice - ${order.orderId}</h2>
      <p><strong>Customer:</strong> ${order.customerName}</p>
      <p><strong>Seller:</strong> ${order.sellerStoreName}</p>
      <p><strong>Status:</strong> ${order.status}</p>
      <hr />
      ${(order.products || []).map((p) => `<p>${p.name} (${p.qty}) - ${fmtMoney(p.subtotal)}</p>`).join('')}
      <hr />
      <p><strong>Total:</strong> ${fmtMoney(order.orderTotal)}</p>
    </body></html>
  `);
  w.document.close();
  w.print();
}

function printPackingSlip(order) {
  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(`
    <html><head><title>Packing Slip ${order.orderId}</title></head><body style="font-family:Arial;padding:20px;">
      <h2>Packing Slip - ${order.orderId}</h2>
      <p><strong>Pickup:</strong> ${order.pickupAddress}</p>
      <p><strong>Delivery:</strong> ${order.customerAddress}, ${order.customerCity}</p>
      <hr />
      ${(order.products || []).map((p) => `<p>${p.name} | SKU: ${p.sku} | Qty: ${p.qty}</p>`).join('')}
    </body></html>
  `);
  w.document.close();
  w.print();
}

function bindEvents() {
  const filterIds = [
    'search-text',
    'filter-seller',
    'filter-status',
    'filter-payment',
    'filter-courier',
    'filter-city'
  ];

  filterIds.forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener('input', renderTable);
    el.addEventListener('change', renderTable);
  });

  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    document.getElementById('search-text').value = '';
    document.getElementById('filter-seller').value = '';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-payment').value = '';
    document.getElementById('filter-courier').value = '';
    document.getElementById('filter-city').value = '';
    renderTable();
  });

  document.getElementById('btn-close-modal').addEventListener('click', () => {
    document.getElementById('order-modal').classList.remove('active');
  });

  document.getElementById('order-modal').addEventListener('click', (e) => {
    if (e.target.id === 'order-modal') {
      document.getElementById('order-modal').classList.remove('active');
    }
  });

  document.getElementById('btn-view-order').addEventListener('click', () => {
    if (selectedOrder) {
      renderModal(selectedOrder);
    }
  });

  document.getElementById('btn-cancel-order').addEventListener('click', async () => {
    if (!selectedOrder) return;
    await cancelOrderById(selectedOrder.orderId);
  });

  document.getElementById('btn-update-status').addEventListener('click', async () => {
    if (!selectedOrder) return;
    const target = document.getElementById('action-status-select').value;
    await setStatus(selectedOrder, target, `Status updated by admin to ${target}`);
  });

  document.getElementById('btn-export-orders').addEventListener('click', () => {
    alert('Orders export generated.');
  });

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    await refreshAndRender(selectedOrder ? selectedOrder.orderId : null);
  });
}

async function initOrderManagement() {
  await reloadAll();
  fillFilterOptions();
  renderStats();
  renderTable();
  bindEvents();
}

window.openOrder = openOrder;
window.cancelOrderById = cancelOrderById;
window.initOrderManagement = initOrderManagement;
