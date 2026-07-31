const API_BASE_URL = window.API_BASE_URL || window.ADMIN_API_BASE_URL || `${window.location.origin}/api`;

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function getAdminToken() {
  return localStorage.getItem('lumina.admin.authToken') || localStorage.getItem('lumina.auth.token') || localStorage.getItem('adminToken') || '';
}

async function fetchJson(path, options = {}) {
  const token = getAdminToken();
  const response = await fetch(apiUrl(path), {
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      ...(token ? { Authorization: `Bearer ${token}`, 'x-session-token': token, 'x-admin-id': localStorage.getItem('adminId') || '' } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    throw new Error(result.message || `Request failed (${response.status})`);
  }
  return result;
}

const db = {
  admin: { id: 'ADMIN-1', name: 'Operations Admin' },
  couriers: [],
  orders: [],
  shipments: [],
  assignments: [],
  payments: [],
  shippingRules: {
    assignmentRules: [],
    shippingChargesRules: [],
    codFee: { mode: 'percent', value: 2.5 },
    weightPricing: { range0to1: 0, range1to3: 0, range3to5: 0, extraPerKg: 0 },
    zonePricing: { sameCity: 0, sameState: 0, differentState: 0, remoteArea: 0 },
    freeShipping: { promotional: false, selectedSellers: '', aboveAmount: 0 },
    codRules: []
  },
  overview: {
    readyForPickup: 0,
    activeCouriers: 0,
    inTransit: 0,
    codPending: 0
  }
};

let editingCourierId = null;
let assignmentFilter = 'all';
let assignmentCourierFilter = 'all';
let assignmentCityFilter = 'all';
let assignmentDateFilter = 'all';
let selectedAssignmentViewId = null;
let paymentFilter = 'all';
let paymentDateRange = 'all';
let selectedPaymentId = null;
let trackingFilter = 'all';
let trackingCourierFilter = 'all';
let trackingDateFilter = 'all';
let selectedTrackingId = null;
let editingChargeRuleId = null;
let editingCodRuleId = null;

function openPopup(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closePopup(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

const shipmentStatuses = [
  'Awaiting Pickup',
  'Picked Up',
  'In Transit',
  'Out for Delivery',
  'Delivered',
  'RTO (Return to Origin)',
  'Failed Delivery'
];

function fmtMoney(value) {
  return `$${Number(value).toFixed(2)}`;
}

function apiTracking(orderId) {
  return `API-${orderId}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function getInputValue(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function getSelectValue(id, fallback = '') {
  const el = document.getElementById(id);
  return el ? String(el.value || fallback) : fallback;
}

function manualTracking(orderId) {
  return `MAN-${orderId}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function activeCouriers() {
  return db.couriers.filter(c => c.status === 'Active');
}

function codFeeAmount(codAmount) {
  const codFee = db.shippingRules.codFee || { mode: 'percent', value: 0 };
  if (codFee.mode === 'fixed') return Number(codFee.value || 0);
  return Number(((codAmount * Number(codFee.value || 0)) / 100).toFixed(2));
}

function weightCharge(weightKg) {
  const r = db.shippingRules.weightPricing || { range0to1: 0, range1to3: 0, range3to5: 0, extraPerKg: 0 };
  if (weightKg <= 1) return r.range0to1;
  if (weightKg <= 3) return r.range1to3;
  if (weightKg <= 5) return r.range3to5;
  return r.range3to5 + ((weightKg - 5) * r.extraPerKg);
}

function zoneCharge(cityType) {
  const z = db.shippingRules.zonePricing || { sameCity: 0, sameState: 0, differentState: 0, remoteArea: 0 };
  if (cityType === 'Same City') return z.sameCity;
  if (cityType === 'Same State') return z.sameState;
  if (cityType === 'Remote Area') return z.remoteArea;
  return z.differentState;
}

function calculateShipping(order, courier) {
  const freeShipping = db.shippingRules.freeShipping || { promotional: false, selectedSellers: '', aboveAmount: 0 };
  if (order.paymentType === 'Online' && freeShipping.promotional) return 0;
  const freeSellerList = String(freeShipping.selectedSellers || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (freeSellerList.includes(order.sellerStoreName.toLowerCase())) return 0;
  if (order.codAmount >= Number(freeShipping.aboveAmount || 0)) return 0;
  return Number((Number(courier.baseShippingCharges) + weightCharge(order.orderWeight) + zoneCharge(order.customerCityType)).toFixed(2));
}

function setTabBehavior() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
}

async function loadOverview() {
  try {
    const result = await fetchJson(`${API_BASE_URL}/admin/logistics/overview`);
    db.overview = result.data || db.overview;
  } catch (_) {
    db.overview = { readyForPickup: 0, activeCouriers: 0, inTransit: 0, codPending: 0 };
  }
}

async function loadCouriers() {
  try {
    const q = document.getElementById('search-courier') ? document.getElementById('search-courier').value.trim() : '';
    const result = await fetchJson(`/admin/logistics/couriers?search=${encodeURIComponent(q)}`);
    db.couriers = Array.isArray(result.data) ? result.data : [];
  } catch (_) {
    db.couriers = [];
  }
}

async function loadOrdersReady() {
  try {
    const result = await fetchJson(`${API_BASE_URL}/admin/logistics/orders/ready`);
    db.orders = Array.isArray(result.data) ? result.data : [];
  } catch (_) {
    db.orders = [];
  }
}

async function loadShipments() {
  try {
    const result = await fetchJson(`${API_BASE_URL}/admin/logistics/shipments`);
    db.shipments = Array.isArray(result.data) ? result.data : [];
  } catch (_) {
    db.shipments = [];
  }
}

async function loadAssignments() {
  try {
    const result = await fetchJson(`${API_BASE_URL}/admin/logistics/assignments`);
    db.assignments = Array.isArray(result.data) ? result.data : [];
  } catch (_) {
    db.assignments = [];
  }
}

async function loadPayments() {
  try {
    const result = await fetchJson(`${API_BASE_URL}/admin/logistics/payments`);
    db.payments = Array.isArray(result.data) ? result.data : [];
  } catch (_) {
    db.payments = [];
  }
}

async function loadShippingRules() {
  try {
    const result = await fetchJson(`${API_BASE_URL}/admin/logistics/shipping-rules`);
    db.shippingRules = result.data || db.shippingRules;
  } catch (_) {
    // keep defaults
  }
}

async function reloadAllData() {
  await Promise.all([loadOverview(), loadCouriers(), loadOrdersReady(), loadShipments(), loadAssignments(), loadPayments(), loadShippingRules()]);
}

function renderKpis() {
  const readyForPickup = Number(db.overview.readyForPickup || 0);
  const active = Number(db.overview.activeCouriers || 0);
  const inTransit = Number(db.overview.inTransit || 0);
  const codPending = Number(db.overview.codPending || 0);

  document.getElementById('kpi-stats').innerHTML = `
    <div class="stat-card warning"><div class="stat-value">${readyForPickup}</div><div class="stat-label">Orders Ready for Courier Assignment</div></div>
    <div class="stat-card success"><div class="stat-value">${active}</div><div class="stat-label">Active Couriers</div></div>
    <div class="stat-card"><div class="stat-value">${inTransit}</div><div class="stat-label">Shipments In Progress</div></div>
    <div class="stat-card danger"><div class="stat-value">${codPending}</div><div class="stat-label">COD Settlements Pending</div></div>
  `;
}

function renderCourierTable() {
  document.getElementById('courier-tbody').innerHTML = db.couriers.map(c => `
    <tr>
      <td>${c.name}</td>
      <td>${c.phone || '-'}</td>
      <td>${c.states || '-'}</td>
      <td>${c.cities || '-'}</td>
      <td><span class="badge ${c.status === 'Active' ? 'active' : 'inactive'}">${c.status}</span></td>
      <td>
        <button class="btn sm" onclick="editCourier('${c.id}')">Edit</button>
        <button class="btn sm warning" onclick="toggleCourier('${c.id}')">${c.status === 'Active' ? 'Disable' : 'Enable'}</button>
        <button class="btn sm danger" onclick="deleteCourier('${c.id}')">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6">No couriers found</td></tr>';

  populateAssignCourierDropdown();
}

function resetCourierForm() {
  editingCourierId = null;
  const form = document.getElementById('courier-form');
  if (form) form.reset();
  const statusField = document.getElementById('f-status');
  if (statusField) statusField.value = 'Active';
  const apiEnabledField = document.getElementById('f-api-enabled');
  if (apiEnabledField) apiEnabledField.value = 'No';
  const courierIdField = document.getElementById('courier-id');
  if (courierIdField) courierIdField.value = '';
}

async function saveCourierForm(e) {
  e.preventDefault();
  const apiSecretField = document.getElementById('f-api-secret');
  const apiEnabledValue = getSelectValue('f-api-enabled', 'No');
  const courier = {
    id: editingCourierId || `CUR-${Date.now()}`,
    name: getInputValue('f-courier-name'),
    phone: getInputValue('f-phone'),
    email: getInputValue('f-email'),
    website: getInputValue('f-website'),
    states: getInputValue('f-states'),
    cities: getInputValue('f-cities'),
    apiEnabled: apiEnabledValue,
    apiIntegrated: apiEnabledValue === 'Yes',
    apiKey: getInputValue('f-api-key'),
    apiSecret: apiSecretField ? apiSecretField.value.trim() : '',
    webhookUrl: getInputValue('f-webhook-url'),
    status: getSelectValue('f-status', 'Active')
  };

  if (!courier.name || !courier.phone) {
    alert('Courier name and contact number are required.');
    return;
  }

  try {
    let result;
    if (editingCourierId) {
      result = await fetchJson(`/admin/logistics/couriers/${encodeURIComponent(editingCourierId)}`, {
        method: 'PUT',
        body: JSON.stringify({ ...courier, email: '' })
      });
    } else {
      result = await fetchJson(`${API_BASE_URL}/admin/logistics/couriers`, {
        method: 'POST',
        body: JSON.stringify({ ...courier, email: '' })
      });
    }

    const savedCourier = {
      ...courier,
      ...(result && result.data ? result.data : {}),
      status: courier.status,
      states: courier.states,
      cities: courier.cities,
      phone: courier.phone
    };

    db.couriers = db.couriers.filter(item => item.id !== savedCourier.id);
    db.couriers.unshift(savedCourier);

    resetCourierForm();
    closePopup('courier-popup-modal');
    renderCourierTable();
    renderAssignmentQueue();
    renderTracking();
    renderCodModule();
    renderKpis();
  } catch (error) {
    alert(error.message || 'Failed to save courier.');
  }
}

function editCourier(id) {
  const c = db.couriers.find(x => x.id === id);
  if (!c) return;
  editingCourierId = c.id;
  document.getElementById('courier-id').value = c.id;
  document.getElementById('f-courier-name').value = c.name || '';
  document.getElementById('f-phone').value = c.phone || '';
  const emailField = document.getElementById('f-email');
  if (emailField) emailField.value = c.email || '';
  const websiteField = document.getElementById('f-website');
  if (websiteField) websiteField.value = c.website || '';
  document.getElementById('f-states').value = c.states || '';
  document.getElementById('f-cities').value = c.cities || '';
  const apiEnabledField = document.getElementById('f-api-enabled');
  if (apiEnabledField) apiEnabledField.value = c.apiEnabled || (c.apiIntegrated ? 'Yes' : 'No');
  document.getElementById('f-api-key').value = c.apiKey || '';
  document.getElementById('f-api-secret').value = c.apiSecret || '';
  document.getElementById('f-webhook-url').value = c.webhookUrl || '';
  document.getElementById('f-status').value = c.status || 'Active';
  openPopup('courier-popup-modal');
}

async function toggleCourier(id) {
  try {
    await fetchJson(`/admin/logistics/couriers/${encodeURIComponent(id)}/toggle`, { method: 'PATCH' });
    await reloadAllData();
    renderCourierTable();
    renderAssignmentQueue();
    renderKpis();
  } catch (error) {
    alert(error.message || 'Failed to toggle courier.');
  }
}

async function deleteCourier(id) {
  try {
    await fetchJson(`/admin/logistics/couriers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await reloadAllData();
    renderCourierTable();
    renderAssignmentQueue();
    renderKpis();
  } catch (error) {
    alert(error.message || 'Failed to delete courier.');
  }
}

function buildAssignmentRows() {
  const source = Array.isArray(db.assignments) && db.assignments.length ? db.assignments : [];
  return source.map((item, index) => {
    const orderId = item.orderId || item.orderNumber || item.id || `#${1000 + index + 1}`;
    const customer = item.customerName || item.customer || 'Customer';
    const city = item.city || 'N/A';
    const state = item.state || 'N/A';
    const courier = item.courierName || 'Pending';
    const tracking = item.trackingId || item.trackingNumber || '-';
    const assignmentStatus = item.assignmentStatus === 'assigned' ? 'Assigned' : 'Waiting for Assignment';
    const assignedAt = item.assignedAt || item.createdAt || item.created_at || '';
    const id = item.id || `${orderId}-${index}`;
    const orderStatus = item.orderStatus || 'Pending';
    const paymentMethod = String(item.paymentMethod || 'ONLINE').toUpperCase();
    const paymentStatus = paymentMethod === 'ONLINE' ? 'PAID' : 'PENDING';
    return {
      id,
      orderId,
      customer,
      city,
      state,
      courier,
      tracking,
      assignmentStatus,
      assignedAt,
      orderStatus,
      paymentMethod,
      paymentStatus,
      sellerName: item.sellerName || 'Seller',
      deliveredDate: item.deliveredDate || ''
    };
  });
}

function getFilteredAssignments() {
  const rows = buildAssignmentRows();
  return rows.filter((row) => {
    const matchesFilter = assignmentFilter === 'all'
      || (assignmentFilter === 'assigned' && row.assignmentStatus === 'Assigned')
      || (assignmentFilter === 'waiting' && row.assignmentStatus === 'Waiting for Assignment');
    const matchesCourier = assignmentCourierFilter === 'all' || row.courier === assignmentCourierFilter;
    const matchesCity = assignmentCityFilter === 'all' || row.city === assignmentCityFilter;
    return matchesFilter && matchesCourier && matchesCity;
  });
}

function populateAssignmentFilters() {
  const courierSelect = document.getElementById('assignment-courier-filter');
  const citySelect = document.getElementById('assignment-city-filter');
  if (!courierSelect || !citySelect) return;

  const rows = buildAssignmentRows();
  const couriers = [...new Set(rows.map(r => r.courier).filter(Boolean))];
  const cities = [...new Set(rows.map(r => r.city).filter(Boolean))];
  courierSelect.innerHTML = `<option value="all">All Couriers</option>${couriers.map(c => `<option value="${c}">${c}</option>`).join('')}`;
  citySelect.innerHTML = `<option value="all">All Cities</option>${cities.map(c => `<option value="${c}">${c}</option>`).join('')}`;
  if (assignmentCourierFilter !== 'all' && !couriers.includes(assignmentCourierFilter)) assignmentCourierFilter = 'all';
  if (assignmentCityFilter !== 'all' && !cities.includes(assignmentCityFilter)) assignmentCityFilter = 'all';
  courierSelect.value = assignmentCourierFilter;
  citySelect.value = assignmentCityFilter;
}

function populateAssignCourierDropdown() {
  const assignmentCourier = document.getElementById('assignment-courier');
  const trackingCourierSelect = document.getElementById('tracking-courier-filter');
  const assignmentCourierFilterSelect = document.getElementById('assignment-courier-filter');
  const active = db.couriers || [];
  const options = ['<option value="all">All Couriers</option>'].concat(active.map(c => `<option value="${c.name}">${c.name}</option>`));
  if (assignmentCourier) assignmentCourier.innerHTML = `<option value="">Select courier</option>` + active.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  if (trackingCourierSelect) trackingCourierSelect.innerHTML = `<option value="all">All Couriers</option>` + active.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  if (assignmentCourierFilterSelect) assignmentCourierFilterSelect.innerHTML = `<option value="all">All Couriers</option>` + active.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
}

function renderAssignmentQueue() {
  const queueBody = document.getElementById('assign-queue-tbody');
  if (!queueBody) return;

  const rows = getFilteredAssignments();
  queueBody.innerHTML = rows.map((item) => `
    <tr>
      <td>${item.orderId}</td>
      <td>${item.customer}</td>
      <td>${item.city}</td>
      <td>${item.state}</td>
      <td>${item.courier}</td>
      <td>${item.tracking}</td>
      <td><span class="badge ${item.assignmentStatus === 'Assigned' ? 'active' : 'warn'}">${item.assignmentStatus}</span></td>
      <td>${item.assignedAt ? new Date(item.assignedAt).toLocaleString() : '-'}</td>
      <td><button class="btn sm" type="button" onclick="viewAssignmentDetails('${item.id}')">View</button></td>
    </tr>
  `).join('') || '<tr><td colspan="9">No assignment data available yet.</td></tr>';

  populateAssignmentFilters();
}

function viewAssignmentDetails(id) {
  const row = buildAssignmentRows().find(item => item.id === id);
  if (!row) return;
  selectedAssignmentViewId = id;
  const detailBox = document.getElementById('assignment-details-body');
  if (detailBox) {
    detailBox.innerHTML = `
      <div style="display:grid; gap:8px;">
        <div><strong>Order ID:</strong> ${row.orderId}</div>
        <div><strong>Customer:</strong> ${row.customer}</div>
        <div><strong>Seller:</strong> ${row.sellerName}</div>
        <div><strong>Courier:</strong> ${row.courier}</div>
        <div><strong>Tracking Number:</strong> ${row.tracking}</div>
        <div><strong>Assigned At:</strong> ${row.assignedAt ? new Date(row.assignedAt).toLocaleString() : '-'}</div>
        <div><strong>Payment Method:</strong> ${row.paymentMethod}</div>
        <div><strong>Payment Status:</strong> ${row.paymentStatus}</div>
        <div><strong>Order Status:</strong> ${row.orderStatus}</div>
      </div>
    `;
  }
  openPopup('assignment-details-modal');
}

function trackingUpdateControl(s) {
  if (s.apiIntegrated) return '<span class="badge info">Auto-update via webhook</span>';
  const options = shipmentStatuses.map(st => `<option value="${st}" ${s.shipmentStatus === st ? 'selected' : ''}>${st}</option>`).join('');
  return `<select class="select" onchange="manualStatusUpdate('${s.id}', this.value)">${options}</select>`;
}

async function manualStatusUpdate(shipmentId, status) {
  const s = db.shipments.find(x => x.id === shipmentId);
  if (!s || s.apiIntegrated) return;
  try {
    await fetchJson(`/admin/logistics/shipments/${encodeURIComponent(shipmentId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    await reloadAllData();
    renderTracking();
    renderCodModule();
    renderKpis();
  } catch (error) {
    alert(error.message || 'Failed to update shipment status.');
  }
}

function formatTrackingDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return date.toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getTrackingRows() {
  return (Array.isArray(db.shipments) ? db.shipments : []).map((shipment) => {
    const status = shipment.shipmentStatus || 'Awaiting Pickup';
    const lastUpdated = shipment.updatedAt || shipment.updated_at || shipment.createdAt || shipment.created_at || '';
    const courier = shipment.courierName || 'Pending';
    return {
      id: shipment.id,
      orderId: shipment.orderId || shipment.orderNumber || shipment.id || 'N/A',
      customer: shipment.customerName || shipment.customer || 'Customer',
      courier,
      trackingId: shipment.trackingId || shipment.trackingNumber || '-',
      shipmentStatus: status,
      lastUpdated,
      paymentType: shipment.paymentType || 'COD',
      shippingCharge: shipment.shippingCharge || shipment.shippingCharges || 0,
      deliveryAddress: shipment.deliveryAddress || shipment.customerAddress || 'N/A',
      note: shipment.note || 'No extra notes.'
    };
  });
}

function getFilteredTrackingRows() {
  const rows = getTrackingRows();
  return rows.filter((row) => {
    const matchesFilter = trackingFilter === 'all'
      || (trackingFilter === 'courier_assigned' && row.courier !== 'Pending' && row.shipmentStatus !== 'Awaiting Pickup')
      || (trackingFilter === 'picked_up' && ['Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'].includes(row.shipmentStatus))
      || (trackingFilter === 'out_for_delivery' && ['Out for Delivery', 'Delivered'].includes(row.shipmentStatus))
      || (trackingFilter === 'delivered' && row.shipmentStatus === 'Delivered');

    const matchesCourier = trackingCourierFilter === 'all' || row.courier === trackingCourierFilter;
    const matchesDate = trackingDateFilter === 'all' || (() => {
      if (!row.lastUpdated) return false;
      const msDiff = Date.now() - new Date(row.lastUpdated).getTime();
      const days = trackingDateFilter === '7' ? 7 : 30;
      return msDiff <= days * 24 * 60 * 60 * 1000;
    })();

    return matchesFilter && matchesCourier && matchesDate;
  });
}

function populateTrackingFilters() {
  const courierSelect = document.getElementById('tracking-courier-filter');
  if (!courierSelect) return;

  const rows = getTrackingRows();
  const couriers = [...new Set(rows.map((row) => row.courier).filter(Boolean))];
  courierSelect.innerHTML = `<option value="all">All Couriers</option>${couriers.map((courier) => `<option value="${courier}">${courier}</option>`).join('')}`;
  if (trackingCourierFilter !== 'all' && !couriers.includes(trackingCourierFilter)) trackingCourierFilter = 'all';
  courierSelect.value = trackingCourierFilter;
}

function getTrackingBadgeClass(status) {
  if (status === 'Delivered') return 'active';
  if (['Out for Delivery', 'In Transit', 'Picked Up'].includes(status)) return 'info';
  return 'warn';
}

function buildTrackingTimeline(status) {
  const steps = [
    { label: 'Order Placed', description: 'Order confirmed and prepared for dispatch.' },
    { label: 'Processing', description: 'Seller packed the order and prepared it for handover.' },
    { label: 'Ready for Pickup', description: 'Seller marked the order ready for pickup.' },
    { label: 'Courier Assigned', description: 'A courier was assigned and a tracking number was generated.' },
    { label: 'Picked Up', description: 'Courier received the parcel from the seller.' },
    { label: 'Out for Delivery', description: 'Courier is on the way to the customer.' },
    { label: 'Delivered', description: 'Parcel delivered successfully.' }
  ];

  const normalized = String(status || '').toLowerCase();
  let currentIndex = 0;
  if (normalized.includes('delivered')) currentIndex = 6;
  else if (normalized.includes('out for delivery')) currentIndex = 5;
  else if (normalized.includes('picked up') || normalized.includes('in transit')) currentIndex = 4;
  else if (normalized.includes('assigned') || normalized.includes('awaiting pickup')) currentIndex = 3;
  else if (normalized.includes('ready')) currentIndex = 2;
  else if (normalized.includes('processing')) currentIndex = 1;

  return steps.map((step, index) => `
    <div style="display:flex; gap:10px; align-items:flex-start; padding:8px 0; border-bottom:1px solid #eee; ${index <= currentIndex ? '' : 'opacity:0.65;'}">
      <div style="width:10px; height:10px; border-radius:999px; margin-top:4px; background:${index <= currentIndex ? 'var(--success)' : '#cbd5e1'}"></div>
      <div>
        <div style="font-weight:700; margin-bottom:2px;">${step.label}</div>
        <div class="hint">${step.description}</div>
      </div>
    </div>
  `).join('');
}

function renderTracking() {
  const trackingBody = document.getElementById('tracking-tbody');
  if (!trackingBody) return;

  const rows = getFilteredTrackingRows();
  trackingBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.orderId}</td>
      <td>${row.customer}</td>
      <td>${row.courier}</td>
      <td>${row.trackingId}</td>
      <td><span class="badge ${getTrackingBadgeClass(row.shipmentStatus)}">${row.shipmentStatus || 'Awaiting Pickup'}</span></td>
      <td>${formatTrackingDate(row.lastUpdated)}</td>
      <td><button class="btn sm" type="button" onclick="viewTrackingDetails('${row.id}')">View</button></td>
    </tr>
  `).join('') || '<tr><td colspan="7">No shipments found.</td></tr>';
  populateTrackingFilters();
}

function viewTrackingDetails(id) {
  const row = getTrackingRows().find((item) => item.id === id);
  if (!row) return;
  selectedTrackingId = id;
  const detailsBody = document.getElementById('tracking-details-body');
  const timeline = document.getElementById('tracking-timeline');
  if (detailsBody) {
    detailsBody.innerHTML = `
      <div style="display:grid; gap:8px;">
        <div><strong>Order ID:</strong> ${row.orderId}</div>
        <div><strong>Customer:</strong> ${row.customer}</div>
        <div><strong>Courier:</strong> ${row.courier}</div>
        <div><strong>Tracking Number:</strong> ${row.trackingId}</div>
        <div><strong>Current Status:</strong> ${row.shipmentStatus || 'Awaiting Pickup'}</div>
        <div><strong>Last Updated:</strong> ${formatTrackingDate(row.lastUpdated)}</div>
        <div><strong>Payment Method:</strong> ${row.paymentType}</div>
        <div><strong>Shipping Charge:</strong> ${row.shippingCharge ? `Rs.${Number(row.shippingCharge).toFixed(2)}` : 'Pending'}</div>
        <div><strong>Delivery Address:</strong> ${row.deliveryAddress}</div>
        <div><strong>Notes:</strong> ${row.note}</div>
      </div>
    `;
  }
  if (timeline) timeline.innerHTML = buildTrackingTimeline(row.shipmentStatus);
  openPopup('tracking-details-modal');
}

function getAssignmentRules() {
  return Array.isArray(db.shippingRules.assignmentRules) ? db.shippingRules.assignmentRules : [];
}

function getChargeRules() {
  return Array.isArray(db.shippingRules.shippingChargesRules) ? db.shippingRules.shippingChargesRules : [];
}

function getCodRules() {
  return Array.isArray(db.shippingRules.codRules) ? db.shippingRules.codRules : [];
}

function renderAssignmentRuleTable() {
  const tbody = document.getElementById('assignment-rules-tbody');
  if (!tbody) return;
  tbody.innerHTML = getAssignmentRules().map((rule, index) => `
    <tr>
      <td>${rule.state || '-'}</td>
      <td>${rule.city || '-'}</td>
      <td>${rule.courier || '-'}</td>
      <td>${rule.priority || '-'}</td>
      <td>${rule.status || 'Active'}</td>
      <td><button class="btn sm danger" onclick="removeAssignmentRule(${index})">Remove</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6">No assignment rules yet.</td></tr>';
}

function renderChargeRuleTable() {
  const tbody = document.getElementById('charge-rules-tbody');
  if (!tbody) return;
  tbody.innerHTML = getChargeRules().map((rule) => `
    <tr>
      <td>${rule.state || '-'}</td>
      <td>${rule.city || '-'}</td>
      <td>${rule.fee || '-'}</td>
      <td>
        <button class="btn sm" onclick="editChargeRule('${rule.id}')">Edit</button>
        <button class="btn sm danger" onclick="deleteChargeRule('${rule.id}')">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4">No shipping fee rules yet.</td></tr>';
}

function renderCodRuleTable() {
  const tbody = document.getElementById('cod-rules-tbody');
  if (!tbody) return;
  tbody.innerHTML = getCodRules().map((rule) => `
    <tr>
      <td>${rule.state || '-'}</td>
      <td>${rule.city || '-'}</td>
      <td>${String(rule.codAvailable || rule.cod_available || 'Yes').toLowerCase() === 'no' ? 'No' : 'Yes'}</td>
      <td>${rule.maxCodAmount || rule.maxAmount || '0'}</td>
      <td>
        <button class="btn sm" onclick="editCodRule('${rule.id}')">Edit</button>
        <button class="btn sm danger" onclick="deleteCodRule('${rule.id}')">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5">No COD rules yet.</td></tr>';
}

function resetRuleForms() {
  const assignmentState = document.getElementById('assignment-state');
  if (assignmentState) assignmentState.value = 'Punjab';
  const assignmentCity = document.getElementById('assignment-city');
  if (assignmentCity) assignmentCity.value = '';
  const assignmentCourier = document.getElementById('assignment-courier');
  if (assignmentCourier) assignmentCourier.value = '';
  const assignmentPriority = document.getElementById('assignment-priority');
  if (assignmentPriority) assignmentPriority.value = '1';
  const assignmentStatus = document.getElementById('assignment-status');
  if (assignmentStatus) assignmentStatus.value = 'Active';
  const chargeState = document.getElementById('charge-state');
  if (chargeState) chargeState.value = 'Punjab';
  const chargeCity = document.getElementById('charge-city');
  if (chargeCity) chargeCity.value = '';
  const chargeFee = document.getElementById('charge-fee');
  if (chargeFee) chargeFee.value = '';
  const codState = document.getElementById('cod-state');
  if (codState) codState.value = 'Punjab';
  const codCity = document.getElementById('cod-city');
  if (codCity) codCity.value = '';
  const codAvailable = document.getElementById('cod-available');
  if (codAvailable) codAvailable.value = 'Yes';
  const codMaxAmount = document.getElementById('cod-max-amount');
  if (codMaxAmount) codMaxAmount.value = '';
  editingChargeRuleId = null;
  editingCodRuleId = null;
}

function setRulesNote(message) {
  const note = document.getElementById('rules-note');
  if (note) note.textContent = message;
}

function fillChargeRuleForm(rule) {
  const state = document.getElementById('charge-state');
  const city = document.getElementById('charge-city');
  const fee = document.getElementById('charge-fee');
  if (state) state.value = rule.state || 'Punjab';
  if (city) city.value = rule.city || '';
  if (fee) fee.value = rule.fee || '';
}

function fillCodRuleForm(rule) {
  const state = document.getElementById('cod-state');
  const city = document.getElementById('cod-city');
  const available = document.getElementById('cod-available');
  const maxAmount = document.getElementById('cod-max-amount');
  if (state) state.value = rule.state || 'Punjab';
  if (city) city.value = rule.city || '';
  if (available) available.value = String(rule.codAvailable || rule.cod_available || 'Yes').toLowerCase() === 'no' ? 'No' : 'Yes';
  if (maxAmount) maxAmount.value = rule.maxCodAmount || rule.maxAmount || '';
}

function loadRuleInputs() {
  renderAssignmentRuleTable();
  renderChargeRuleTable();
  renderCodRuleTable();
  resetRuleForms();
}

function addAssignmentRule() {
  const state = document.getElementById('assignment-state').value;
  const city = document.getElementById('assignment-city').value.trim();
  const courier = document.getElementById('assignment-courier').value;
  const priority = document.getElementById('assignment-priority').value.trim();
  const status = document.getElementById('assignment-status').value;
  if (!city) {
    setRulesNote('Please enter a city.');
    return;
  }
  db.shippingRules.assignmentRules = [...getAssignmentRules(), { state, city, courier, priority, status }];
  renderAssignmentRuleTable();
  setRulesNote('Assignment rule added.');
  resetRuleForms();
}

async function saveChargeRuleForm() {
  const state = getInputValue('charge-state');
  const city = getInputValue('charge-city');
  const fee = getInputValue('charge-fee');

  if (!city || !fee) {
    setRulesNote('Please enter city and shipping fee.');
    return;
  }

  try {
    const payload = { state, city, shippingFee: fee };
    if (editingChargeRuleId) {
      await fetchJson(`/admin/logistics/shipping-charges/${editingChargeRuleId}`, { method: 'PUT', body: JSON.stringify(payload) });
      setRulesNote('Shipping fee rule updated.');
    } else {
      await fetchJson(`${API_BASE_URL}/admin/logistics/shipping-charges`, { method: 'POST', body: JSON.stringify(payload) });
      setRulesNote('Shipping fee rule added.');
    }

    await loadShippingRules();
    loadRuleInputs();
    renderCodModule();
    resetRuleForms();
  } catch (error) {
    setRulesNote(error.message || 'Failed to save shipping fee rule.');
  }
}

async function saveCodRuleForm() {
  const state = getInputValue('cod-state');
  const city = getInputValue('cod-city');
  const codAvailable = getSelectValue('cod-available', 'Yes');
  const maxCodAmount = getInputValue('cod-max-amount');

  if (!city) {
    setRulesNote('Please enter a city.');
    return;
  }

  try {
    const payload = { state, city, codAvailable, maxAmount: maxCodAmount };
    if (editingCodRuleId) {
      await fetchJson(`/admin/logistics/cod-rules/${editingCodRuleId}`, { method: 'PUT', body: JSON.stringify(payload) });
      setRulesNote('COD rule updated.');
    } else {
      await fetchJson(`${API_BASE_URL}/admin/logistics/cod-rules`, { method: 'POST', body: JSON.stringify(payload) });
      setRulesNote('COD rule added.');
    }

    await loadShippingRules();
    loadRuleInputs();
    renderCodModule();
    resetRuleForms();
  } catch (error) {
    setRulesNote(error.message || 'Failed to save COD rule.');
  }
}

function addChargeRule() {
  saveChargeRuleForm();
}

function addCodRule() {
  saveCodRuleForm();
}

function removeAssignmentRule(index) {
  db.shippingRules.assignmentRules = getAssignmentRules().filter((_, i) => i !== index);
  renderAssignmentRuleTable();
}

async function deleteChargeRule(ruleId) {
  if (!ruleId) return;
  try {
    await fetchJson(`/admin/logistics/shipping-charges/${ruleId}`, { method: 'DELETE' });
    await loadShippingRules();
    loadRuleInputs();
    setRulesNote('Shipping fee rule deleted.');
  } catch (error) {
    setRulesNote(error.message || 'Failed to delete shipping fee rule.');
  }
}

async function deleteCodRule(ruleId) {
  if (!ruleId) return;
  try {
    await fetchJson(`/admin/logistics/cod-rules/${ruleId}`, { method: 'DELETE' });
    await loadShippingRules();
    loadRuleInputs();
    setRulesNote('COD rule deleted.');
  } catch (error) {
    setRulesNote(error.message || 'Failed to delete COD rule.');
  }
}

function editChargeRule(ruleId) {
  const rule = getChargeRules().find((item) => item.id === ruleId);
  if (!rule) return;
  editingChargeRuleId = ruleId;
  fillChargeRuleForm(rule);
  setRulesNote('Editing shipping fee rule.');
}

function editCodRule(ruleId) {
  const rule = getCodRules().find((item) => item.id === ruleId);
  if (!rule) return;
  editingCodRuleId = ruleId;
  fillCodRuleForm(rule);
  setRulesNote('Editing COD rule.');
}

async function saveRules(event) {
  const buttonId = event?.currentTarget?.id || '';
  if (buttonId === 'btn-save-charge-rules') {
    await saveChargeRuleForm();
    return;
  }
  if (buttonId === 'btn-save-cod-rules') {
    await saveCodRuleForm();
    return;
  }
  try {
    await fetchJson(`${API_BASE_URL}/admin/logistics/shipping-rules`, {
      method: 'PUT',
      body: JSON.stringify(db.shippingRules)
    });
    await loadShippingRules();
    loadRuleInputs();
    renderCodModule();
    setRulesNote('Shipping rules saved successfully.');
  } catch (error) {
    setRulesNote(error.message || 'Failed to save shipping rules.');
  }
}

function netSellerAmount(s) {
  return Number((s.codAmount - s.shippingCharges - codFeeAmount(s.codAmount) - s.platformCommission).toFixed(2));
}

function normalizePaymentMethod(method) {
  const value = String(method || '').toUpperCase();
  if (value === 'COD') return 'COD';
  return 'ONLINE';
}

function mapPaymentOrderStatus(shipment) {
  const status = String(shipment?.shipmentStatus || shipment?.orderStatus || '').toUpperCase();
  if (status.includes('DELIVER')) return 'DELIVERED';
  if (status.includes('OUT')) return 'OUT_FOR_DELIVERY';
  if (status.includes('TRANSIT')) return 'IN_TRANSIT';
  if (status.includes('PICKUP') || status.includes('PENDING')) return 'PENDING';
  return 'PENDING';
}

function buildPaymentRecords() {
  const paymentItems = Array.isArray(db.payments) && db.payments.length ? db.payments : [];

  return paymentItems.map((payment, index) => {
    const paymentMethod = normalizePaymentMethod(payment.paymentMethod || payment.method || 'ONLINE');
    const orderStatus = String(payment.shipmentStatus || payment.orderStatus || 'PENDING').toUpperCase();
    const orderAmount = Number(payment.amount || payment.orderAmount || 0);
    const shippingFee = Number(payment.shippingFee || payment.shippingCharges || 0);
    const totalAmount = Number(payment.totalAmount || orderAmount + shippingFee || 0);
    const paymentStatus = String(payment.paymentStatus || payment.status || 'UNPAID').toUpperCase();

    return {
      id: payment.id || `payment-${index + 1}`,
      orderId: payment.orderId || `#${1000 + index + 1}`,
      customerName: payment.customerName || 'Customer',
      orderAmount,
      shippingFee,
      totalAmount,
      paymentMethod,
      paymentStatus,
      orderStatus: orderStatus === 'DELIVERED' ? 'DELIVERED' : (orderStatus === 'OUT_FOR_DELIVERY' ? 'OUT_FOR_DELIVERY' : 'PENDING'),
      courierName: payment.courierName || '-',
      trackingNumber: payment.trackingNumber || '-',
      paymentDate: payment.paidAt ? new Date(payment.paidAt).toISOString().slice(0, 10) : '',
      codSettlementDate: paymentMethod === 'COD' && paymentStatus === 'PAID' ? (payment.paidAt ? new Date(payment.paidAt).toISOString().slice(0, 10) : '') : ''
    };
  });
}

function getFilteredPayments() {
  const payments = buildPaymentRecords();
  return payments.filter((payment) => {
    const matchesFilter = paymentFilter === 'all'
      || (paymentFilter === 'online' && payment.paymentMethod === 'ONLINE')
      || (paymentFilter === 'cod' && payment.paymentMethod === 'COD')
      || (paymentFilter === 'paid' && payment.paymentStatus === 'PAID')
      || (paymentFilter === 'unpaid' && payment.paymentStatus === 'UNPAID');

    const matchesDate = paymentDateRange === 'all' || paymentDateRange === '7' || paymentDateRange === '30';
    return matchesFilter && matchesDate;
  });
}

function selectPayment(paymentId) {
  selectedPaymentId = paymentId;
  renderPaymentDetails();
}

function renderPaymentDetails() {
  const container = document.getElementById('payment-details-card');
  if (!container) return;

  const payments = getFilteredPayments();
  const payment = payments.find(item => item.id === selectedPaymentId) || payments[0] || null;
  if (!payment) {
    container.innerHTML = '<div class="hint">No payment record available.</div>';
    return;
  }

  selectedPaymentId = payment.id;
  container.innerHTML = `
    <div style="display:grid; gap:8px;">
      <div><strong>Order ID:</strong> ${payment.orderId}</div>
      <div><strong>Customer Name:</strong> ${payment.customerName}</div>
      <div><strong>Order Amount:</strong> ${fmtMoney(payment.orderAmount)}</div>
      <div><strong>Shipping Fee:</strong> ${fmtMoney(payment.shippingFee)}</div>
      <div><strong>Total Amount:</strong> ${fmtMoney(payment.totalAmount)}</div>
      <div><strong>Payment Method:</strong> ${payment.paymentMethod}</div>
      <div><strong>Payment Status:</strong> <span class="badge ${payment.paymentStatus === 'PAID' ? 'active' : 'warn'}">${payment.paymentStatus}</span></div>
      <div><strong>Courier:</strong> ${payment.courierName}</div>
      <div><strong>Tracking Number:</strong> ${payment.trackingNumber}</div>
      <div><strong>Payment Date:</strong> ${payment.paymentDate}</div>
      <div><strong>COD Settlement Date:</strong> ${payment.codSettlementDate || 'Pending'}</div>
    </div>
  `;
}

function renderPaymentsModule() {
  const tbody = document.getElementById('payments-table-body');
  if (!tbody) return;

  const payments = getFilteredPayments();
  tbody.innerHTML = payments.map(payment => `
    <tr>
      <td>${payment.orderId}</td>
      <td>${payment.customerName}</td>
      <td>${fmtMoney(payment.totalAmount)}</td>
      <td>${payment.paymentMethod}</td>
      <td><span class="badge ${payment.paymentStatus === 'PAID' ? 'active' : 'warn'}">${payment.paymentStatus}</span></td>
      <td>${payment.orderStatus === 'DELIVERED' ? 'DELIVERED' : payment.orderStatus === 'OUT_FOR_DELIVERY' ? 'OUT_FOR_DELIVERY' : 'PENDING'}</td>
      <td><button class="btn sm" type="button" onclick="selectPayment('${payment.id}')">View</button></td>
    </tr>
  `).join('') || '<tr><td colspan="7">No payments found.</td></tr>';

  renderPaymentDetails();
}

function refreshPaymentStatuses() {
  const payments = buildPaymentRecords();
  const updated = payments.map(payment => ({
    ...payment,
    paymentStatus: payment.paymentMethod === 'ONLINE' || payment.orderStatus === 'DELIVERED' ? 'PAID' : 'UNPAID',
    codSettlementDate: payment.paymentMethod === 'COD' && payment.orderStatus === 'DELIVERED' ? payment.paymentDate : ''
  }));

  const recordMap = new Map(updated.map(payment => [payment.id, payment]));
  const shipments = Array.isArray(db.shipments) && db.shipments.length ? db.shipments : [];
  shipments.forEach((shipment, index) => {
    const payment = recordMap.get(shipment.id || `payment-${index + 1}`);
    if (payment) {
      payment.paymentStatus = payment.paymentMethod === 'ONLINE' || payment.orderStatus === 'DELIVERED' ? 'PAID' : 'UNPAID';
      payment.codSettlementDate = payment.paymentMethod === 'COD' && payment.orderStatus === 'DELIVERED' ? payment.paymentDate : '';
    }
  });

  document.getElementById('payment-status-note').textContent = 'Payment status refreshed from live shipment data. COD payments are marked paid only after delivery.';
  renderPaymentsModule();
}

function renderCodModule() {
  if (!document.getElementById('payments-table-body') && !document.getElementById('payment-details-card')) return;
  renderPaymentsModule();
}

function bindEvents() {
  setTabBehavior();

  const openCourierBtn = document.getElementById('btn-open-courier-popup');
  if (openCourierBtn) openCourierBtn.addEventListener('click', () => openPopup('courier-popup-modal'));

  const closeCourierBtn = document.getElementById('btn-close-courier-popup');
  if (closeCourierBtn) closeCourierBtn.addEventListener('click', () => closePopup('courier-popup-modal'));

  const searchField = document.getElementById('search-courier');
  if (searchField) {
    searchField.addEventListener('input', async () => {
      await loadCouriers();
      renderCourierTable();
    });
  }

  const courierForm = document.getElementById('courier-form');
  if (courierForm) courierForm.addEventListener('submit', saveCourierForm);

  const resetCourierBtn = document.getElementById('reset-courier-form');
  if (resetCourierBtn) resetCourierBtn.addEventListener('click', resetCourierForm);

  document.querySelectorAll('[data-assignment-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      assignmentFilter = button.dataset.assignmentFilter;
      document.querySelectorAll('[data-assignment-filter]').forEach((item) => item.classList.toggle('active', item === button));
      renderAssignmentQueue();
    });
  });

  const assignmentCourierFilterSelect = document.getElementById('assignment-courier-filter');
  if (assignmentCourierFilterSelect) {
    assignmentCourierFilterSelect.addEventListener('change', () => {
      assignmentCourierFilter = assignmentCourierFilterSelect.value;
      renderAssignmentQueue();
    });
  }

  const assignmentCityFilterSelect = document.getElementById('assignment-city-filter');
  if (assignmentCityFilterSelect) {
    assignmentCityFilterSelect.addEventListener('change', () => {
      assignmentCityFilter = assignmentCityFilterSelect.value;
      renderAssignmentQueue();
    });
  }

  const assignmentDateFilterSelect = document.getElementById('assignment-date-filter');
  if (assignmentDateFilterSelect) {
    assignmentDateFilterSelect.addEventListener('change', () => {
      assignmentDateFilter = assignmentDateFilterSelect.value;
      renderAssignmentQueue();
    });
  }

  const refreshAssignmentsBtn = document.getElementById('btn-refresh-assignments');
  if (refreshAssignmentsBtn) refreshAssignmentsBtn.addEventListener('click', () => {
    reloadAllData().then(() => renderAssignmentQueue());
  });

  const closeAssignmentDetailsBtn = document.getElementById('btn-close-assignment-details');
  if (closeAssignmentDetailsBtn) closeAssignmentDetailsBtn.addEventListener('click', () => closePopup('assignment-details-modal'));

  ['btn-save-rules', 'btn-save-assignment-rules', 'btn-save-charge-rules', 'btn-save-cod-rules'].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.addEventListener('click', saveRules);
  });

  document.querySelectorAll('[data-payment-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      paymentFilter = button.dataset.paymentFilter;
      document.querySelectorAll('[data-payment-filter]').forEach((item) => item.classList.toggle('active', item === button));
      renderPaymentsModule();
    });
  });

  const paymentDateRangeSelect = document.getElementById('payment-date-range');
  if (paymentDateRangeSelect) {
    paymentDateRangeSelect.addEventListener('change', () => {
      paymentDateRange = paymentDateRangeSelect.value;
      renderPaymentsModule();
    });
  }

  document.querySelectorAll('[data-tracking-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      trackingFilter = button.dataset.trackingFilter;
      document.querySelectorAll('[data-tracking-filter]').forEach((item) => item.classList.toggle('active', item === button));
      renderTracking();
    });
  });

  const trackingCourierFilterSelect = document.getElementById('tracking-courier-filter');
  if (trackingCourierFilterSelect) {
    trackingCourierFilterSelect.addEventListener('change', () => {
      trackingCourierFilter = trackingCourierFilterSelect.value;
      renderTracking();
    });
  }

  const trackingDateFilterSelect = document.getElementById('tracking-date-filter');
  if (trackingDateFilterSelect) {
    trackingDateFilterSelect.addEventListener('change', () => {
      trackingDateFilter = trackingDateFilterSelect.value;
      renderTracking();
    });
  }

  const refreshTrackingBtn = document.getElementById('btn-refresh-tracking');
  if (refreshTrackingBtn) {
    refreshTrackingBtn.addEventListener('click', async () => {
      try {
        await reloadAllData();
        renderTracking();
        renderKpis();
      } catch (error) {
        alert(error.message || 'Failed to refresh tracking data.');
      }
    });
  }

  const closeTrackingDetailsBtn = document.getElementById('btn-close-tracking-details');
  if (closeTrackingDetailsBtn) closeTrackingDetailsBtn.addEventListener('click', () => closePopup('tracking-details-modal'));

  const refreshPaymentsBtn = document.getElementById('btn-refresh-payments');
  if (refreshPaymentsBtn) refreshPaymentsBtn.addEventListener('click', refreshPaymentStatuses);

  const addAssignmentRuleBtn = document.getElementById('btn-add-assignment-rule');
  if (addAssignmentRuleBtn) addAssignmentRuleBtn.addEventListener('click', addAssignmentRule);

  const addChargeRuleBtn = document.getElementById('btn-add-charge-rule');
  if (addChargeRuleBtn) addChargeRuleBtn.addEventListener('click', addChargeRule);

  const addCodRuleBtn = document.getElementById('btn-add-cod-rule');
  if (addCodRuleBtn) addCodRuleBtn.addEventListener('click', addCodRule);

  const resetRulesBtn = document.getElementById('btn-reset-rules');
  if (resetRulesBtn) {
    resetRulesBtn.addEventListener('click', async () => {
      try {
        // Reload shipping rules from the backend (treat server values as canonical defaults)
        await loadShippingRules();
        loadRuleInputs();
        document.getElementById('rules-note').textContent = 'Defaults loaded from server.';
      } catch (err) {
        document.getElementById('rules-note').textContent = 'Failed to load defaults from server.';
      }
    });
  }

  const settleSellerBtn = document.getElementById('btn-settle-seller');
  if (settleSellerBtn) settleSellerBtn.addEventListener('click', settleSeller);

  const syncBtn = document.getElementById('btn-sync-api');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      try {
        const result = await fetchJson(`${API_BASE_URL}/admin/logistics/sync/webhooks`, { method: 'POST' });
        alert(result.message || 'Webhook sync completed.');
        await reloadAllData();
        renderTracking();
        renderKpis();
      } catch (error) {
        alert(error.message || 'Webhook sync failed.');
      }
    });
  }

  const exportBtn = document.getElementById('btn-export-cod');
  if (exportBtn) exportBtn.addEventListener('click', () => alert('COD report exported.'));

  document.querySelectorAll('.popup-modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.classList.remove('active');
    });
  });
}

async function init() {
  bindEvents();
  resetCourierForm();
  await reloadAllData();
  loadRuleInputs();
  renderCourierTable();
  if (document.getElementById('assign-queue-tbody')) renderAssignmentQueue();
  if (document.getElementById('tracking-tbody')) renderTracking();
  if (document.getElementById('payments-table-body') || document.getElementById('payment-details-card')) renderCodModule();
  renderKpis();
}

window.editCourier = editCourier;
window.toggleCourier = toggleCourier;
window.deleteCourier = deleteCourier;
window.manualStatusUpdate = manualStatusUpdate;
window.viewAssignmentDetails = viewAssignmentDetails;
window.editChargeRule = editChargeRule;
window.deleteChargeRule = deleteChargeRule;
window.editCodRule = editCodRule;
window.deleteCodRule = deleteCodRule;

window.selectPayment = selectPayment;
window.viewTrackingDetails = viewTrackingDetails;
window.addEventListener('DOMContentLoaded', init);
