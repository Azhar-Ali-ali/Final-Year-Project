console.log('Inventory-management.html script loaded');

const API_BASE_URL = window.API_BASE_URL || `${window.location.origin}/api`;
const API_BASE = `${API_BASE_URL}/seller/inventory`;

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
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok && response.headers.get('content-type')?.includes('text/csv')) {
    throw new Error('Request failed');
  }

  if (options.expectBlob) {
    const blob = await response.blob();
    if (!response.ok) throw new Error('Request failed');
    return blob;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload;
}

let inventory = [];
let filteredInventory = [];
let restockHistory = [];
let currentPage = 1;
const itemsPerPage = 10;
let selectedProductId = null;

let adjustStockModal;
let closeAdjustModal;

function initializeDOM() {
  adjustStockModal = document.getElementById('adjustStockModal');
  closeAdjustModal = document.getElementById('closeAdjustModal');
  setupEventListeners();
}

function setupEventListeners() {
  if (closeAdjustModal) {
    closeAdjustModal.addEventListener('click', () => {
      if (adjustStockModal) {
        adjustStockModal.classList.remove('active');
      }
    });
  }
}

async function applyFilters() {
  currentPage = 1;
  await loadInventory();
}

document.getElementById('searchInput').addEventListener('input', () => {
  applyFilters();
});

document.getElementById('statusFilter').addEventListener('change', () => {
  applyFilters();
});

function renderInventoryTable() {
  const tbody = document.getElementById('inventoryTableBody');
  tbody.innerHTML = '';

  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const pageData = filteredInventory.slice(start, end);

  if (!pageData.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: #999;">
          No products found
        </td>
      </tr>
    `;
    renderPagination();
    return;
  }

  pageData.forEach((item) => {
    const statusClass = `stock-${item.status.toLowerCase().replace(/\s+/g, '')}`;
    const row = document.createElement('tr');
    const variantBtn = item.variants && item.variants.length > 0
      ? `<button class="btn-view" onclick="openVariantModal('${item.id}')" style="margin-right: 5px;">View Variants</button>`
      : '';

    row.innerHTML = `
      <td><span class="product-id">${item.product}</span></td>
      <td>${item.sku}</td>
      <td>${item.category}</td>
      <td><strong>${item.stock}</strong></td>
      <td>${item.threshold}</td>
      <td><span class="status-badge ${statusClass}">${item.status}</span></td>
      <td style="font-size: 12px;">${item.warehouse}</td>
      <td>${variantBtn}<button class="btn-view" onclick="openAdjustStockModal('${item.id}')">Adjust</button></td>
    `;

    tbody.appendChild(row);
  });

  renderPagination();
}

function renderPagination() {
  const container = document.getElementById('inventoryPagination');
  if (!container) return;

  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / itemsPerPage));
  if (currentPage > totalPages) currentPage = totalPages;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  if (currentPage > 1) {
    html += `<button onclick="goPage(${currentPage - 1})">← Prev</button>`;
  }

  for (let index = 1; index <= totalPages; index += 1) {
    if (index <= 2 || index >= totalPages - 1 || Math.abs(index - currentPage) <= 1) {
      html += `<button onclick="goPage(${index})" class="${currentPage === index ? 'active' : ''}">${index}</button>`;
    } else if (index === currentPage - 2 || index === currentPage + 2) {
      html += '<button disabled>...</button>';
    }
  }

  if (currentPage < totalPages) {
    html += `<button onclick="goPage(${currentPage + 1})">Next →</button>`;
  }

  container.innerHTML = html;
}

function goPage(page) {
  currentPage = page;
  renderInventoryTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openAdjustStockModal(productId) {
  selectedProductId = String(productId);
  const product = inventory.find((p) => String(p.id) === String(productId));
  if (!product) return;

  document.getElementById('productName').textContent = product.product;
  document.getElementById('productSku').textContent = product.sku;
  document.getElementById('productPrice').textContent = `$${Number(product.price || 0).toFixed(2)}`;
  document.getElementById('currentStock').textContent = `${product.stock} units`;
  document.getElementById('productStatus').textContent = product.status;
  document.getElementById('productImage').textContent = product.image || '📦';

  const statusEl = document.getElementById('productStatus');
  if (product.status === 'In Stock') {
    statusEl.style.color = '#28a745';
  } else if (product.status === 'Low Stock') {
    statusEl.style.color = '#ffc107';
  } else {
    statusEl.style.color = '#dc3545';
  }

  document.getElementById('quantityInput').value = '';
  document.getElementById('actionType').value = 'add';
  document.getElementById('adjustmentReason').value = '';
  document.getElementById('adjustmentNotes').value = '';
  updateActionLabel();

  const modal = document.getElementById('adjustStockModal');
  if (modal) modal.classList.add('active');
}

function closeAdjustStockModal() {
  const modal = document.getElementById('adjustStockModal');
  if (modal) modal.classList.remove('active');
  selectedProductId = null;
}

function updateActionLabel() {
  const actionType = document.getElementById('actionType').value;
  const label = document.getElementById('quantityLabel');

  if (actionType === 'add') {
    label.innerHTML = 'Quantity to Add <span style="color: #dc3545;">*</span>';
  } else if (actionType === 'reduce') {
    label.innerHTML = 'Quantity to Reduce <span style="color: #dc3545;">*</span>';
  } else {
    label.innerHTML = 'Set Exact Quantity <span style="color: #dc3545;">*</span>';
  }
}

async function saveStockAdjustment() {
  const quantity = parseInt(document.getElementById('quantityInput').value, 10);
  const reason = document.getElementById('adjustmentReason').value;
  const notes = document.getElementById('adjustmentNotes').value;
  const actionType = document.getElementById('actionType').value;

  if (!selectedProductId) return;

  if (Number.isNaN(quantity) || quantity < 0 || !reason) {
    alert('Please fill all required fields');
    return;
  }

  try {
    const response = await apiRequest(`/products/${encodeURIComponent(selectedProductId)}/adjust`, {
      method: 'POST',
      body: {
        actionType,
        quantity,
        reason,
        notes
      }
    });

    const result = response.data || {};

    let confirmMsg = '✓ Stock Updated Successfully!\n\n';
    confirmMsg += `Product: ${result.product?.product || '-'} (${result.product?.sku || '-'})\n`;
    confirmMsg += `Old Stock: ${result.oldStock ?? '-'}\n`;
    confirmMsg += `New Stock: ${result.newStock ?? '-'}\n`;
    confirmMsg += `Change: ${result.change > 0 ? '+' : ''}${result.change ?? 0} units\n`;
    confirmMsg += `Status: ${result.product?.status || '-'}\n`;
    confirmMsg += `Reason: ${reason}`;
    if (notes) confirmMsg += `\nNotes: ${notes}`;

    alert(confirmMsg);

    closeAdjustStockModal();
    await Promise.all([loadOverview(), loadInventory(), loadRestockHistory(), loadLowStockAlerts()]);
  } catch (error) {
    alert(error.message || 'Failed to update stock');
  }
}

function updateSummary(overview) {
  document.getElementById('totalProducts').textContent = overview.totalProducts || 0;
  document.getElementById('inStockProducts').textContent = overview.inStockProducts || 0;
  document.getElementById('lowStockProducts').textContent = overview.lowStockProducts || 0;
  document.getElementById('outOfStockProducts').textContent = overview.outOfStockProducts || 0;
}

function renderLowStockAlerts(alertItems) {
  const section = document.getElementById('lowStockAlertsSection');
  const container = document.getElementById('lowStockAlerts');

  container.innerHTML = '';

  if (!alertItems.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  alertItems.forEach((item) => {
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = 'padding: 12px; margin-bottom: 10px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;';
    alertDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>${item.product}</strong> (${item.sku})<br>
          <small>Current: ${item.stock} | Threshold: ${item.threshold} | Warehouse: ${item.warehouse}</small>
        </div>
        <button class="btn-view" onclick="openAdjustStockModal('${item.id}')">Restock Now</button>
      </div>
    `;
    container.appendChild(alertDiv);
  });
}

function renderRestockHistoryUI() {
  const container = document.getElementById('restockHistory');
  container.innerHTML = '';

  if (!restockHistory.length) {
    container.innerHTML = '<p style="color: #999; text-align: center;">No restock history yet</p>';
    return;
  }

  restockHistory.forEach((item) => {
    const diff = Number(item.newQty || 0) - Number(item.oldQty || 0);
    const change = diff > 0 ? `+${diff}` : `${diff}`;
    const changeColor = diff > 0 ? '#28a745' : diff < 0 ? '#dc3545' : '#6c757d';

    const historyDiv = document.createElement('div');
    historyDiv.style.cssText = 'padding: 12px; margin-bottom: 10px; background: #f9fafb; border-left: 3px solid #0066c0; border-radius: 4px;';
    historyDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>${item.product}</strong> (${item.sku})<br>
          <small>${item.oldQty} -> ${item.newQty} | Reason: ${item.reason}</small><br>
          <small style="color: #999;">${item.date} ${item.time} | By: ${item.user} | ${item.warehouse}</small>
        </div>
        <div style="color: ${changeColor}; font-weight: 600; font-size: 16px;">${change}</div>
      </div>
    `;
    container.appendChild(historyDiv);
  });
}

async function loadOverview() {
  const response = await apiRequest('/overview');
  updateSummary(response.data || {});
}

async function loadInventory() {
  const searchTerm = document.getElementById('searchInput').value.trim();
  const statusTerm = document.getElementById('statusFilter').value.trim();

  const query = new URLSearchParams();
  if (sellerId) query.set('sellerId', sellerId);
  if (searchTerm) query.set('search', searchTerm);
  if (statusTerm) query.set('status', statusTerm);

  const path = query.toString() ? `/products?${query.toString()}` : '/products';
  const response = await apiRequest(path);

  inventory = Array.isArray(response.data) ? response.data : [];
  filteredInventory = [...inventory];

  renderInventoryTable();
}

async function loadRestockHistory() {
  const response = await apiRequest('/restock-history');
  restockHistory = Array.isArray(response.data) ? response.data : [];
  renderRestockHistoryUI();
}

async function loadLowStockAlerts() {
  const response = await apiRequest('/low-stock-alerts');
  const alerts = Array.isArray(response.data) ? response.data : [];
  renderLowStockAlerts(alerts);
}

function openVariantModal(productId) {
  const product = inventory.find((p) => String(p.id) === String(productId));
  if (!product) {
    alert('Product not found');
    return;
  }
  if (!product.variants || !product.variants.length) {
    alert('No variants for this product');
    return;
  }

  alert(`${product.product} Variants:\n\n${product.variants.map((v) => `${v.name} (${v.sku}): ${v.qty} units`).join('\n')}`);
}

async function openBulkRestockModal() {
  const csvTemplate = `SKU,Product Name,Quantity,Warehouse\nSKU-001,Wireless Headphones,20,Main Warehouse\nSKU-002,USB Type-C Cable,30,Main Warehouse\nSKU-005,Mechanical Keyboard,15,Main Warehouse`;

  const userInput = prompt('Enter restock data (CSV format):\n\nFormat: SKU, Product Name, Quantity, Warehouse\n\nExample:\n' + csvTemplate, csvTemplate);

  if (!userInput) return;

  const lines = userInput.trim().split('\n');
  const data = [];

  lines.forEach((line, index) => {
    if (index === 0) return;
    const [sku, , quantity, warehouse] = line.split(',').map((s) => s.trim());
    if (!sku) return;
    data.push({ sku, quantity: Number(quantity || 0), warehouse });
  });

  try {
    const response = await apiRequest('/bulk-restock', {
      method: 'POST',
      body: { data }
    });

    alert(response.message || 'Bulk restock complete');
    await Promise.all([loadOverview(), loadInventory(), loadRestockHistory(), loadLowStockAlerts()]);
  } catch (error) {
    alert(error.message || 'Bulk restock failed');
  }
}

async function exportInventoryCSV() {
  try {
    const query = new URLSearchParams();
    if (sellerId) query.set('sellerId', sellerId);

    const blob = await apiRequest(`/export${query.toString() ? `?${query.toString()}` : ''}`, {
      expectBlob: true,
      headers: sellerId ? { 'x-seller-id': sellerId } : {}
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    alert(error.message || 'Failed to export inventory CSV');
  }
}

async function setLowStockThreshold(productId) {
  const product = inventory.find((p) => String(p.id) === String(productId));
  if (!product) return;

  const newThreshold = prompt(
    `Set Low Stock Threshold for ${product.product}:\n\nCurrent Threshold: ${product.threshold}`,
    product.threshold
  );

  if (newThreshold === null || Number.isNaN(Number(newThreshold))) return;

  try {
    await apiRequest(`/products/${encodeURIComponent(productId)}/threshold`, {
      method: 'PUT',
      body: { threshold: Number(newThreshold) }
    });

    alert(`Threshold updated to ${newThreshold} units`);
    await Promise.all([loadOverview(), loadInventory(), loadLowStockAlerts()]);
  } catch (error) {
    alert(error.message || 'Failed to update threshold');
  }
}

let kycState = {
  status: 'review',
  documents: []
};

function normalizeKycStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'active' || value === 'verified' || value === 'approved') return 'verified';
  if (value === 'rejected' || value === 'suspended') return 'rejected';
  if (value === 'review' || value === 'under_review') return 'review';
  return 'pending';
}

async function loadKYCData() {
  try {
    const response = await apiRequest('/kyc');
    const data = response.data || {};

    kycState.status = normalizeKycStatus(data.status);
    kycState.documents = Array.isArray(data.documents) ? data.documents : [];

    const sellerEmail = document.getElementById('kycSellerEmail');
    const sellerPhone = document.getElementById('kycSellerPhone');
    const documentsList = document.getElementById('kycDocumentsList');

    // Shop name is now set by seller-header-state.js for live state
    if (sellerEmail) sellerEmail.textContent = data.email || '-';
    if (sellerPhone) sellerPhone.textContent = data.phone || '-';

    if (documentsList) {
      const documents = Array.isArray(data.documents) ? data.documents : [];

      if (!documents.length) {
        documentsList.innerHTML = '<p style="font-size: 12px; color: #999;">No KYC documents uploaded yet.</p>';
      } else {
        documentsList.innerHTML = documents.map((doc) => {
          const normalized = String(doc.status || 'pending').toLowerCase();
          const label = normalized === 'active' || normalized === 'verified' || normalized === 'approved'
            ? 'Verified'
            : normalized === 'review' || normalized === 'under_review'
              ? 'Under Review'
              : normalized === 'rejected'
                ? 'Rejected'
                : 'Pending';

          return `
            <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: #f9fafb; border-radius: 6px; margin-bottom: 10px;">
              <span style="font-size: 18px;">✓</span>
              <div>
                <div style="font-weight: 600; font-size: 13px;">${doc.document_type || 'Document'}</div>
                <div style="font-size: 11px; color: #999;">${label}</div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    updateKYCDisplay();
  } catch (_) {
    updateKYCDisplay();
  }
}

function openKYCModal() {
  const kycModal = document.getElementById('kycModal');
  const closeKYCModalBtn = document.getElementById('closeKYCModal');

  updateKYCDisplay();
  if (kycModal) {
    kycModal.classList.add('active');
  }

  if (closeKYCModalBtn) {
    closeKYCModalBtn.addEventListener('click', closeKYCModal_handler);
  }
}

function closeKYCModal_handler() {
  const kycModal = document.getElementById('kycModal');
  if (kycModal) {
    kycModal.classList.remove('active');
  }
}

function closeKYCModal() {
  const kycModal = document.getElementById('kycModal');
  if (kycModal) {
    kycModal.classList.remove('active');
  }
}

function updateKYCDisplay() {
  const statusMap = {
    pending: '⏳ Pending Review',
    review: '🔍 Under Review',
    verified: '✓ Verified',
    rejected: '✗ Rejected'
  };

  const colorMap = {
    pending: '#ffc107',
    review: '#0066c0',
    verified: '#28a745',
    rejected: '#dc3545'
  };

  const statusDisplay = document.getElementById('kycStatusDisplay');
  const statusDetail = document.getElementById('kycStatusDetail');
  const resolvedStatus = statusMap[kycState.status] || 'Under Review';
  const resolvedColor = colorMap[kycState.status] || '#0066c0';

  if (statusDisplay) {
    statusDisplay.textContent = resolvedStatus;
    statusDisplay.style.color = resolvedColor;
  }

  if (statusDetail) {
    statusDetail.textContent = resolvedStatus;
    statusDetail.style.color = resolvedColor;
  }
}

function viewKYCProfile() {
  closeKYCModal();
  window.location.href = 'Profile-KYC.html';
}

async function bootstrap() {
  initializeDOM();

  try {
    await Promise.all([loadOverview(), loadInventory(), loadRestockHistory(), loadLowStockAlerts(), loadKYCData()]);
  } catch (error) {
    console.error(error);
    alert(error.message || 'Failed to load inventory data from database.');
  }
}

setTimeout(() => {
  bootstrap();
}, 100);

window.openAdjustStockModal = openAdjustStockModal;
window.openVariantModal = openVariantModal;
window.closeAdjustStockModal = closeAdjustStockModal;
window.saveStockAdjustment = saveStockAdjustment;
window.openBulkRestockModal = openBulkRestockModal;
window.renderLowStockAlerts = renderLowStockAlerts;
window.setLowStockThreshold = setLowStockThreshold;
window.exportInventoryCSV = exportInventoryCSV;
window.updateActionLabel = updateActionLabel;
window.applyFilters = applyFilters;
window.openKYCModal = openKYCModal;
window.closeKYCModal = closeKYCModal;
window.viewKYCProfile = viewKYCProfile;
