console.log('Product-Management.html script loaded');

const API_BASE_URL = window.API_BASE_URL || `${window.location.origin}/api`;
const API_BASE = `${API_BASE_URL}/seller/products`;

function isServerRuntimeAllowed() {
  const { hostname } = window.location;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!isLocalhost) {
    console.warn(`Product Management is expected on localhost, but loaded from ${window.location.origin}`);
    return false;
  }
  return true;
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
console.log('Seller ID:', sellerId || '(not set, backend will auto-resolve)');

let currentSellerViewState = null;

function normalizeVerificationStatus(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (!normalized) return '';
  if (normalized === 'approved' || normalized === 'active') return 'verified';
  return normalized;
}

function isVerifiedStatus(value) {
  return normalizeVerificationStatus(value) === 'verified';
}

function getSessionAuthUser() {
  const authRaw = localStorage.getItem('lumina.auth');
  if (!authRaw) return null;

  try {
    const parsed = JSON.parse(authRaw);
    return parsed && typeof parsed === 'object' ? parsed.user || null : null;
  } catch (_) {
    return null;
  }
}

function getSellerViewState() {
  const user = getSessionAuthUser() || {};
  const profile = user.sellerProfile || {};
  const cachedName = localStorage.getItem('lumina.seller.headerName') || '';
  const cachedStatus = localStorage.getItem('lumina.seller.kycStatus') || '';
  const fallbackName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  const sellerName = String(profile.storeName || profile.sellerName || cachedName || fallbackName || user.email || 'Seller').trim();
  const verificationRaw = normalizeVerificationStatus(profile.verificationStatus || profile.kycStatus || cachedStatus);
  const isVerifiedFlag = profile.isVerified === true;
  const verified = isVerifiedFlag || isVerifiedStatus(verificationRaw);

  return {
    sellerName,
    verified,
    label: verified ? 'Verified' : 'Not Verified',
    hint: verified ? 'All features unlocked' : 'Verify KYC first to unlock product publishing'
  };
}

async function fetchLiveSellerViewState() {
  const requestWithSellerContext = async (path) => {
    const url = new URL(path, window.location.origin);
    if (sellerId) {
      url.searchParams.set('sellerId', sellerId);
    }
    url.searchParams.set('_ts', String(Date.now()));

    const response = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      headers: {
        ...(sellerId ? { 'x-seller-id': sellerId } : {}),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache'
      }
    });

    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    return payload && payload.data ? payload.data : payload;
  };

  try {
    const [profileData, verificationData] = await Promise.all([
      requestWithSellerContext(`${API_BASE_URL}/seller/settings/profile`),
      requestWithSellerContext(`${API_BASE_URL}/seller/settings/verification`)
    ]);

    const name = String(profileData?.storeName || profileData?.sellerName || '').trim();
    const normalizedStatus = normalizeVerificationStatus(verificationData?.status);

    if (name) {
      localStorage.setItem('lumina.seller.headerName', name);
    }
    if (normalizedStatus) {
      localStorage.setItem('lumina.seller.kycStatus', normalizedStatus);
    }

    if (!name && !normalizedStatus) {
      return null;
    }

    return {
      sellerName: name || null,
      verified: isVerifiedStatus(normalizedStatus)
    };
  } catch (_) {
    return null;
  }
}

function applySellerHeaderState() {
  const state = currentSellerViewState || getSellerViewState();

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

  document.querySelectorAll('[data-kyc-locked="add-product"]').forEach((button) => {
    if (state.verified) {
      button.classList.remove('opacity-50', 'cursor-not-allowed');
      button.removeAttribute('aria-disabled');
      button.title = '';
      return;
    }

    button.classList.add('opacity-50', 'cursor-not-allowed');
    button.setAttribute('aria-disabled', 'true');
    button.title = 'Verify KYC first';
  });

  return state;
}

function ensureKycVerifiedForAddProduct() {
  const state = currentSellerViewState || getSellerViewState();
  if (state.verified) return true;
  alert('Verify KYC first to add products.');
  return false;
}

function formatPkr(value) {
  const amount = Number(value || 0);
  return `PKR ${amount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calculateDiscountPercent(price, discountPrice) {
  const basePrice = Number.isFinite(Number(price)) ? Number(price) : 0;
  const comparePrice = Number.isFinite(Number(discountPrice)) ? Number(discountPrice) : null;
  if (!basePrice || comparePrice === null || comparePrice <= 0 || comparePrice >= basePrice) {
    return 0;
  }
  return Math.round(((basePrice - comparePrice) / basePrice) * 100);
}

function updateCalculatedDiscountPercent() {
  const priceInput = document.getElementById('productPrice');
  const discountInput = document.getElementById('productDiscountPrice');
  const percentInput = document.getElementById('productDiscountPercent');
  if (!priceInput || !discountInput || !percentInput) return;
  const price = priceInput.value === '' ? null : Number(priceInput.value);
  const discountPrice = discountInput.value === '' ? null : Number(discountInput.value);
  const percent = calculateDiscountPercent(price, discountPrice);
  percentInput.value = percent;
}

function renderProductPriceDisplay(product) {
  const discountedPrice = Number(product.price || 0);
  const originalPrice = Number.isFinite(Number(product.discountPrice)) ? Number(product.discountPrice) : null;
  const hasDiscount = originalPrice !== null && originalPrice > 0 && discountedPrice > 0 && discountedPrice < originalPrice;

  if (!hasDiscount) {
    return formatPkr(discountedPrice);
  }

  const discountLabel = `<span style="font-weight: 700; color: #b12704;">${formatPkr(discountedPrice)}</span>`;
  const originalLabel = `<span style="text-decoration: line-through; color: #6b7280; margin-left: 0.5rem;">${formatPkr(originalPrice)}</span>`;
  const badge = `<span style="display: inline-flex; align-items: center; gap: 0.25rem; background: #ffe4e6; color: #b91c1c; font-size: 0.8rem; padding: 0.15rem 0.5rem; border-radius: 999px; margin-left: 0.5rem;">🔥 ${calculateDiscountPercent(originalPrice, discountedPrice)}% OFF</span>`;
  return `${discountLabel}${originalLabel}${badge}`;
}

function hasActiveDiscount(product) {
  const discountedPrice = Number(product.price || 0);
  const originalPrice = Number.isFinite(Number(product.discountPrice)) ? Number(product.discountPrice) : null;
  if (originalPrice === null || originalPrice <= 0 || discountedPrice <= 0 || discountedPrice >= originalPrice) {
    return false;
  }

  const startDate = product.discountStartDate ? new Date(product.discountStartDate) : null;
  const endDate = product.discountEndDate ? new Date(product.discountEndDate) : null;
  const now = new Date();

  const afterStart = !startDate || startDate <= now;
  const beforeEnd = !endDate || endDate >= now;
  return afterStart && beforeEnd;
}

function formatDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

function syncDiscountModalPercent() {
  const originalPrice = Number(document.getElementById('discountOriginalPrice')?.value || 0);
  const discountPrice = document.getElementById('discountPrice')?.value === '' ? null : Number(document.getElementById('discountPrice')?.value);
  const percentInput = document.getElementById('discountPercent');
  if (percentInput) {
    percentInput.value = calculateDiscountPercent(originalPrice, discountPrice);
  }
}

async function apiRequest(path, options = {}) {
  const url = new URL(`${API_BASE}${path}`);
  if (sellerId && !url.searchParams.has('sellerId')) {
    url.searchParams.set('sellerId', sellerId);
  }

  console.log(`📡 API Request: ${options.method || 'GET'} ${url.toString()}`);

  try {
    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(sellerId ? { 'x-seller-id': sellerId } : {}),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const payload = await response.json().catch(() => ({}));
    console.log(`📡 API Response:`, payload);

    if (!response.ok || payload.success === false) {
      const errorMsg = payload.message || `Request failed with status ${response.status}`;
      console.error(`❌ API Error: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    return payload;
  } catch (error) {
    console.error(`❌ API Exception:`, error.message);
    throw error;
  }
}

let allProducts = [];
let currentPage = 1;
const itemsPerPage = 10;
let currentProductId = null;
let currentVariants = [];
let currentImages = [];
let currentDetailProduct = null;
const VARIANT_DRAFT_STORAGE_KEY = 'lumina.seller.variantDraft';

const DEFAULT_VARIANT_COLORS = ['Black', 'Red', 'Blue', 'White'];
const DEFAULT_VARIANT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function normalizeVariantKey(value) {
  return String(value || '').trim().toLowerCase();
}

function readVariantDraft() {
  try {
    const raw = localStorage.getItem(VARIANT_DRAFT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((variant, index) => normalizeVariantRow(variant, index)) : [];
  } catch (_) {
    return [];
  }
}

function persistVariantDraft() {
  try {
    localStorage.setItem(VARIANT_DRAFT_STORAGE_KEY, JSON.stringify(currentVariants));
  } catch (_) {
    // Ignore storage failures.
  }
}

function clearVariantDraft() {
  try {
    localStorage.removeItem(VARIANT_DRAFT_STORAGE_KEY);
  } catch (_) {
    // Ignore storage failures.
  }
}

function getSavedVariantRows() {
  const source = currentVariants.length ? currentVariants : readVariantDraft();
  return source.map((variant, index) => normalizeVariantRow(variant, index)).filter((variant) => variant.color && variant.size);
}

function serializeVariantRow(variant, index = 0) {
  const normalized = normalizeVariantRow(variant, index);
  const variantName = [normalized.color, normalized.size].filter(Boolean).join(' ').trim();

  return {
    id: normalized.id,
    color: normalized.color,
    size: normalized.size,
    variantName,
    price: normalized.price === '' ? null : normalized.price,
    stock: normalized.stock === '' ? null : normalized.stock,
    sku: variant?.sku || null,
    attributes: {
      ...(variant?.attributes && typeof variant.attributes === 'object' ? variant.attributes : {}),
      color: normalized.color,
      size: normalized.size,
      variantName
    }
  };
}

function readVariantsFromRenderedTable() {
  const rows = document.querySelectorAll('#generatedVariantRows tr');
  if (!rows.length) return [];

  return [...rows].map((row, index) => {
    const inputs = row.querySelectorAll('input');
    return normalizeVariantRow({
      id: row.getAttribute('data-variant-id') || `dom-variant-${index + 1}`,
      color: inputs[0]?.value || '',
      size: inputs[1]?.value || '',
      price: inputs[2]?.value || '',
      stock: inputs[3]?.value || ''
    }, index);
  }).filter((variant) => variant.color && variant.size);
}

function getSelectedCheckboxValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => String(input.value || '').trim()).filter(Boolean);
}

function toggleCustomVariantColor(isEnabled) {
  const wrap = document.getElementById('variantCustomColorWrap');
  const input = document.getElementById('variantCustomColor');

  if (wrap) {
    wrap.style.display = isEnabled ? 'block' : 'none';
  }

  if (input) {
    input.disabled = !isEnabled;
    if (!isEnabled) input.value = '';
  }
}

function syncVariantCheckboxDefaults() {
  const colorInputs = document.querySelectorAll('input[name="variantColors"]');
  const sizeInputs = document.querySelectorAll('input[name="variantSizes"]');
  const colorOtherToggle = document.getElementById('variantColorOtherToggle');
  const customColorInput = document.getElementById('variantCustomColor');

  if (!colorInputs.length || !sizeInputs.length) return;

  const selectedColors = currentVariants.length
    ? [...new Set(currentVariants.map((variant) => String(variant.color || variant.attributes?.color || '').trim()).filter(Boolean))]
    : DEFAULT_VARIANT_COLORS;
  const selectedSizes = currentVariants.length
    ? [...new Set(currentVariants.map((variant) => String(variant.size || variant.attributes?.size || '').trim()).filter(Boolean))]
    : DEFAULT_VARIANT_SIZES;

  colorInputs.forEach((input) => {
    input.checked = selectedColors.some((value) => normalizeVariantKey(value) === normalizeVariantKey(input.value));
  });
  sizeInputs.forEach((input) => {
    input.checked = selectedSizes.some((value) => normalizeVariantKey(value) === normalizeVariantKey(input.value));
  });

  const customColor = currentVariants.length
    ? selectedColors.find((value) => !DEFAULT_VARIANT_COLORS.some((preset) => normalizeVariantKey(preset) === normalizeVariantKey(value)))
    : '';

  if (customColorInput) {
    customColorInput.value = customColor || '';
  }

  if (colorOtherToggle) {
    colorOtherToggle.checked = Boolean(customColor);
  }

  toggleCustomVariantColor(Boolean(customColor));
}

function normalizeVariantRow(variant = {}, index = 0) {
  const color = String(variant.color || variant.attributes?.color || variant.attributes?.Color || '').trim();
  const size = String(variant.size || variant.attributes?.size || variant.attributes?.Size || '').trim();
  const price = variant.price === '' || variant.price === null || variant.price === undefined ? '' : Number(variant.price);
  const stock = variant.stock === '' || variant.stock === null || variant.stock === undefined ? '' : Number(variant.stock);

  return {
    id: variant.id || `variant-${Date.now()}-${index + 1}`,
    color,
    size,
    price,
    stock
  };
}

async function initializeProductPage() {
  if (!isServerRuntimeAllowed()) {
    console.warn('⚠️ Server runtime allowed check returned false - but continuing anyway');
  }

  const baseState = getSellerViewState();
  currentSellerViewState = baseState;

  const liveState = await fetchLiveSellerViewState();
  if (liveState) {
    currentSellerViewState = {
      ...baseState,
      ...(liveState.sellerName ? { sellerName: liveState.sellerName } : {}),
      ...(typeof liveState.verified === 'boolean'
        ? {
            verified: liveState.verified,
            label: liveState.verified ? 'Verified' : 'Not Verified',
            hint: liveState.verified
              ? 'All features unlocked'
              : 'Verify KYC first to unlock product publishing'
          }
        : {})
    };
  }
  
  setTimeout(() => {
    try {
      console.log('🔧 Initializing product page...');
      applySellerHeaderState();
      setupEventListeners();
      setupImageUpload();
      attachProductButtonListeners();
      loadProducts();
      console.log('✅ Product page initialized successfully');
    } catch (error) {
      console.error('❌ Product page initialization error:', error);
    }
  }, 50);
}

try {
  initializeProductPage();
} catch (error) {
  console.error('❌ Product page initialization error:', error);
}

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const stockFilter = document.getElementById('stockFilter');

  const refreshView = () => {
    currentPage = 1;
    renderProducts();
  };

  if (searchInput) searchInput.addEventListener('input', refreshView);
  if (statusFilter) statusFilter.addEventListener('change', refreshView);
  if (stockFilter) stockFilter.addEventListener('change', refreshView);

  const productPriceInput = document.getElementById('productPrice');
  const productDiscountPriceInput = document.getElementById('productDiscountPrice');

  productPriceInput?.addEventListener('input', updateCalculatedDiscountPercent);
  productDiscountPriceInput?.addEventListener('input', updateCalculatedDiscountPercent);

  document.querySelectorAll('[data-kyc-locked="add-product"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      if (ensureKycVerifiedForAddProduct()) return;
      event.preventDefault();
      event.stopPropagation();
    });
  });
}

async function loadProducts() {
  try {
    if (!isServerRuntimeAllowed()) {
      console.warn('Continuing product loading despite runtime warning');
    }

    console.log('📦 Loading products and overview...');
    const [overviewResponse, productsResponse] = await Promise.all([
      apiRequest('/overview'),
      apiRequest('?pageSize=5000')
    ]);

    allProducts = Array.isArray(productsResponse.data) ? productsResponse.data : [];
    console.log(`✅ Loaded ${allProducts.length} products`);
    updateSummary(overviewResponse.data || null);
    renderProducts();
  } catch (error) {
    console.error('❌ Failed to load products:', error);
    allProducts = [];
    updateSummary(null);
    renderProducts();
  }
}

function updateSummary(overview = null) {
  const summary = overview || allProducts.reduce(
    (acc, product) => {
      acc.totalProducts += 1;
      const status = String(product.status || '').trim().toLowerCase();
      if (status === 'pending approval' || status === 'pending' || status === 'draft') {
        acc.pendingProducts += 1;
      }
      if (hasActiveDiscount(product)) {
        acc.discountProducts += 1;
      }

      if (product.stock > 10) {
        acc.inStockProducts += 1;
      } else if (product.stock > 0) {
        acc.lowStockProducts += 1;
      } else {
        acc.outOfStockProducts += 1;
      }
      return acc;
    },
    {
      totalProducts: 0,
      pendingProducts: 0,
      discountProducts: 0,
      inStockProducts: 0,
      lowStockProducts: 0,
      outOfStockProducts: 0
    }
  );

  const totalProducts = document.getElementById('totalProducts');
  const pendingProducts = document.getElementById('pendingProducts');
  const discountProducts = document.getElementById('discountProducts');
  const inStockProducts = document.getElementById('inStockProducts');
  const lowStockProducts = document.getElementById('lowStockProducts');
  const outOfStockProducts = document.getElementById('outOfStockProducts');

  if (totalProducts) totalProducts.textContent = summary.totalProducts || 0;
  if (pendingProducts) pendingProducts.textContent = summary.pendingProducts || 0;
  if (discountProducts) discountProducts.textContent = summary.discountProducts || 0;
  if (inStockProducts) inStockProducts.textContent = summary.inStockProducts || 0;
  if (lowStockProducts) lowStockProducts.textContent = summary.lowStockProducts || 0;
  if (outOfStockProducts) outOfStockProducts.textContent = summary.outOfStockProducts || 0;
}

function getFiltered() {
  let filtered = [...allProducts];

  const search = String(document.getElementById('searchInput')?.value || '').toLowerCase();
  if (search) {
    filtered = filtered.filter((product) =>
      String(product.name || '').toLowerCase().includes(search) ||
      String(product.sku || '').toLowerCase().includes(search) ||
      String(product.category || '').toLowerCase().includes(search) ||
      String(product.brand || '').toLowerCase().includes(search)
    );
  }

  const status = document.getElementById('statusFilter')?.value || '';
  if (status) {
    filtered = filtered.filter((product) => product.status === status);
  }

  const stock = document.getElementById('stockFilter')?.value || '';
  if (stock === 'instock') {
    filtered = filtered.filter((product) => product.stock > 10);
  } else if (stock === 'lowstock') {
    filtered = filtered.filter((product) => product.stock > 0 && product.stock <= 10);
  } else if (stock === 'outofstock') {
    filtered = filtered.filter((product) => product.stock === 0);
  } else if (stock === 'discounted') {
    filtered = filtered.filter((product) => hasActiveDiscount(product));
  }

  return filtered;
}

function getStockBadge(stock) {
  if (stock > 10) return 'badge-instock';
  if (stock > 0) return 'badge-lowstock';
  return 'badge-outofstock';
}

function getStockText(stock) {
  if (stock > 10) return `In Stock (${stock})`;
  if (stock > 0) return `Low Stock (${stock})`;
  return 'Out of Stock (0)';
}

function normalizeProductStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'active' || value === 'approved') return 'Approved';
  if (value === 'draft' || value === 'pending approval' || value === 'pending') return 'Pending Approval';
  if (value === 'archived' || value === 'rejected') return 'Rejected';
  if (value === 'inactive' || value === 'hidden' || value === 'disabled') return 'Hidden';
  return String(status || 'Hidden').trim() || 'Hidden';
}

function getStatusBadgeClass(status) {
  const label = normalizeProductStatus(status).toLowerCase();
  if (label === 'approved') return 'badge-approved';
  if (label === 'pending approval') return 'badge-pending-approval';
  if (label === 'rejected') return 'badge-rejected';
  if (label === 'hidden') return 'badge-hidden';
  return 'badge-hidden';
}

function getFirstImage(product) {
  if (!product || !Array.isArray(product.images) || !product.images.length) {
    return '';
  }

  const firstImage = product.images[0];
  return typeof firstImage === 'string' ? firstImage : firstImage?.url || firstImage?.data || '';
}

function renderProducts() {
  const filtered = getFiltered();
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const pageData = filtered.slice(start, end);

  const tbody = document.getElementById('productsTableBody');
  if (!tbody) return;

  if (!pageData.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          <span class="material-symbols-rounded">inbox</span>
          <p>No products found</p>
        </td>
      </tr>
    `;
    const pagination = document.getElementById('productsPagination');
    if (pagination) pagination.innerHTML = '';
    return;
  }

  tbody.innerHTML = pageData.map((product) => {
    const imageUrl = getFirstImage(product);
    const statusLabel = normalizeProductStatus(product.status);
    return `
      <tr>
        <td class="product-image-cell">
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${product.name}" class="product-thumbnail">`
            : `<div class="product-thumbnail placeholder"><span class="material-symbols-rounded">image</span></div>`
          }
        </td>
        <td class="product-name">${product.name}</td>
        <td>${product.sku || 'N/A'}</td>
        <td>${product.category || 'N/A'}</td>
        <td>${renderProductPriceDisplay(product)}</td>
        <td><span class="status-badge ${getStockBadge(Number(product.stock || 0))}">${getStockText(Number(product.stock || 0))}</span></td>
        <td><span class="status-badge ${getStatusBadgeClass(statusLabel)}">${statusLabel}</span></td>
        <td class="actions-cell">
          <button class="btn-action btn-view" data-product-id="${product.id}">View</button>
          <button class="btn-action btn-edit" data-product-id="${product.id}">Edit</button>
          <button class="btn-action btn-manage-discount" data-product-id="${product.id}">Manage Discount</button>
          <button class="btn-action delete btn-delete" data-product-id="${product.id}">Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  renderPagination(filtered.length);
}

function attachProductButtonListeners() {
  const tbody = document.getElementById('productsTableBody');
  if (!tbody || tbody.dataset.bound === 'true') return;

  tbody.dataset.bound = 'true';
  tbody.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    const productId = button.getAttribute('data-product-id');
    if (!productId) return;

    event.preventDefault();

    if (button.classList.contains('btn-view')) {
      viewProduct(productId);
    } else if (button.classList.contains('btn-edit')) {
      editProduct(productId);
    } else if (button.classList.contains('btn-manage-discount')) {
      openManageDiscountModal(productId);
    } else if (button.classList.contains('btn-delete')) {
      deleteProduct(productId);
    }
  });
}

function renderPagination(total) {
  const container = document.getElementById('productsPagination');
  if (!container) return;

  const pages = Math.max(1, Math.ceil(total / itemsPerPage));
  if (pages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  if (currentPage > 1) {
    html += `<button onclick="goPage(${currentPage - 1})">← Prev</button>`;
  }

  for (let index = 1; index <= pages; index += 1) {
    if (index <= 2 || index >= pages - 1 || Math.abs(index - currentPage) <= 1) {
      html += `<button onclick="goPage(${index})" class="${currentPage === index ? 'active' : ''}">${index}</button>`;
    } else if (index === currentPage - 2 || index === currentPage + 2) {
      html += '<button disabled>...</button>';
    }
  }

  if (currentPage < pages) {
    html += `<button onclick="goPage(${currentPage + 1})">Next →</button>`;
  }

  container.innerHTML = html;
}

function goPage(page) {
  currentPage = page;
  renderProducts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchTab(tab, element) {
  document.querySelectorAll('.tab-content').forEach((section) => section.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((button) => button.classList.remove('active'));

  const tabContent = document.getElementById(`${tab}-tab`);
  if (tabContent) {
    tabContent.classList.add('active');
  }

  if (element) {
    element.closest('.tab-btn')?.classList.add('active');
  }
}

function resetModalState() {
  currentProductId = null;
  currentVariants = [];
  currentImages = [];
  currentDetailProduct = null;
}

function getCurrentProductStatusLabel() {
  return String(document.getElementById('productStatusDisplay')?.textContent || '').trim().toLowerCase();
}

function shouldDefaultShippingToOne(statusLabel = '') {
  const normalized = String(statusLabel || '').trim().toLowerCase();
  if (normalized.includes('pending') || normalized.includes('draft')) return true;
  return !currentProductId && !normalized;
}

function applyShippingDefaultsForPendingDraft(statusLabel = '') {
  if (!shouldDefaultShippingToOne(statusLabel)) return;

  ['productWeight', 'productLength', 'productWidth', 'productHeight'].forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (!field) return;

    const currentValue = String(field.value || '').trim();
    if (currentValue === '' || currentValue === '0' || Number(currentValue) <= 0) {
      field.value = '1';
    }
  });
}

function openAddProductModal() {
  if (!ensureKycVerifiedForAddProduct()) return;

  try {
    resetModalState();
    clearVariantDraft();

    const productForm = document.getElementById('productForm');
    const productDescription = document.getElementById('productDescription');
    const productStatusDisplay = document.getElementById('productStatusDisplay');
    const imagesGallery = document.getElementById('imagesGallery');
    const modalTitle = document.getElementById('modalTitle');
    const productModal = document.getElementById('productModal');

    productForm?.reset();
    if (productDescription) productDescription.value = '';
    if (productStatusDisplay) productStatusDisplay.textContent = 'Pending Approval';
    applyShippingDefaultsForPendingDraft('Pending Approval');
    if (imagesGallery) imagesGallery.innerHTML = '';
    if (modalTitle) modalTitle.textContent = 'Add Product';
    syncVariantCheckboxDefaults();
    renderVariants();

    productModal?.classList.add('active');
  } catch (error) {
    console.error('Error opening product modal:', error);
  }
}

function closeProductModal() {
  document.getElementById('productModal')?.classList.remove('active');
}

function editProduct(id) {
  const product = allProducts.find((entry) => String(entry.id) === String(id));
  if (!product) return;

  currentProductId = product.id;
  currentVariants = [...(product.variants || [])];
  persistVariantDraft();
  currentImages = [...(product.images || [])];

  const setValue = (selector, value) => {
    const element = document.getElementById(selector);
    if (element) element.value = value ?? '';
  };

  setValue('productName', product.name);
  setValue('productBrand', product.brand || '');
  setValue('productSKU', product.sku || '');
  setValue('productBarcode', product.barcode || '');
  setValue('productCategory', product.category || '');
  setValue('productPrice', product.price ?? '');
  setValue('productDiscountPrice', product.discountPrice ?? '');
  updateCalculatedDiscountPercent();
  setValue('productStock', product.stock ?? '');
  setValue('productWeight', product.weight ?? '');
  setValue('productLength', product.length ?? '');
  setValue('productWidth', product.width ?? '');
  setValue('productHeight', product.height ?? '');

  setValue('productDescription', product.description || '');
  const productStatusDisplay = document.getElementById('productStatusDisplay');
  if (productStatusDisplay) productStatusDisplay.textContent = String(product.status || 'Hidden');
  applyShippingDefaultsForPendingDraft(String(product.status || 'Hidden'));
  setValue('productColor', product.color || '');
  setValue('productSize', product.size || '');
  setValue('productFitType', product.fitType || '');
  setValue('productMaterial', product.material || '');
  setValue('productOccasion', product.occasion || '');
  setValue('productStyle', product.style || '');
  setValue('productDiscountPercent', product.discountPercent ?? '');
  renderImages();
  syncVariantCheckboxDefaults();
  renderVariants();
  const modalTitle = document.getElementById('modalTitle');
  if (modalTitle) modalTitle.textContent = 'Edit Product';
  document.getElementById('productModal')?.classList.add('active');
}

function collectProductPayload() {
  applyShippingDefaultsForPendingDraft(getCurrentProductStatusLabel());

  const savedVariants = getSavedVariantRows();
  const renderedVariants = readVariantsFromRenderedTable();
  const variantsToSubmit = savedVariants.length ? savedVariants : renderedVariants;
  return {
    name: String(document.getElementById('productName')?.value || '').trim(),
    brand: String(document.getElementById('productBrand')?.value || '').trim(),
    sku: String(document.getElementById('productSKU')?.value || '').trim(),
    barcode: String(document.getElementById('productBarcode')?.value || '').trim(),
    category: String(document.getElementById('productCategory')?.value || '').trim(),
    price: document.getElementById('productPrice')?.value === '' ? null : Number(document.getElementById('productPrice')?.value),
    discountPrice: document.getElementById('productDiscountPrice')?.value === '' ? null : Number(document.getElementById('productDiscountPrice')?.value),
    discountPercent: calculateDiscountPercent(
      document.getElementById('productPrice')?.value === '' ? null : Number(document.getElementById('productPrice')?.value),
      document.getElementById('productDiscountPrice')?.value === '' ? null : Number(document.getElementById('productDiscountPrice')?.value)
    ),
    stock: document.getElementById('productStock')?.value === '' ? null : Number(document.getElementById('productStock')?.value),
    description: String(document.getElementById('productDescription')?.value || '').trim(),
    weight: document.getElementById('productWeight')?.value === '' ? null : Number(document.getElementById('productWeight')?.value),
    length: document.getElementById('productLength')?.value === '' ? null : Number(document.getElementById('productLength')?.value),
    width: document.getElementById('productWidth')?.value === '' ? null : Number(document.getElementById('productWidth')?.value),
    height: document.getElementById('productHeight')?.value === '' ? null : Number(document.getElementById('productHeight')?.value),
    color: String(document.getElementById('productColor')?.value || '').trim() || null,
    size: String(document.getElementById('productSize')?.value || '').trim() || null,
    fitType: String(document.getElementById('productFitType')?.value || '').trim() || null,
    material: String(document.getElementById('productMaterial')?.value || '').trim() || null,
    occasion: String(document.getElementById('productOccasion')?.value || '').trim() || null,
    style: String(document.getElementById('productStyle')?.value || '').trim() || null,
    discountPercent: document.getElementById('productDiscountPercent')?.value === '' ? 0 : Number(document.getElementById('productDiscountPercent')?.value) || 0,
    status: 'Active',
    variants: variantsToSubmit.map((variant, index) => serializeVariantRow(variant, index)),
    images: currentImages.map((image) => (typeof image === 'string' ? image : image.data || image.url || ''))
  };
}

function validateCompleteProductPayload(payload) {
  const missing = [];

  if (!payload.name) missing.push('Product Name');
  if (!payload.brand) missing.push('Brand');
  if (!payload.sku) missing.push('SKU');
  if (!payload.category) missing.push('Category');
  if (!payload.description) missing.push('Description');

  if (payload.price === null || Number.isNaN(payload.price)) missing.push('Price');
  if (payload.stock === null || Number.isNaN(payload.stock)) missing.push('Stock');

  if (!Array.isArray(payload.images) || payload.images.filter(Boolean).length === 0) {
    missing.push('At least 1 Image');
  }

  if (!Array.isArray(payload.variants) || payload.variants.length === 0) {
    missing.push('At least 1 Variant');
  }

  const hasShipping =
    payload.weight !== null && !Number.isNaN(payload.weight) &&
    payload.length !== null && !Number.isNaN(payload.length) &&
    payload.width !== null && !Number.isNaN(payload.width) &&
    payload.height !== null && !Number.isNaN(payload.height);

  if (!hasShipping) {
    missing.push('Shipping (Weight, Length, Width, Height)');
  }

  if (payload.price !== null && !Number.isNaN(payload.price) && payload.price < 0) {
    return 'Price must be a non-negative number';
  }

  if (payload.discountPrice !== null && !Number.isNaN(payload.discountPrice) && payload.discountPrice < 0) {
    return 'Discount Price must be a non-negative number';
  }

  if (
    payload.discountPrice !== null &&
    payload.price !== null &&
    !Number.isNaN(payload.discountPrice) &&
    !Number.isNaN(payload.price) &&
    payload.discountPrice >= payload.price
  ) {
    return 'Discount Price must be less than Price';
  }

  if (payload.stock !== null && !Number.isNaN(payload.stock) && payload.stock < 0) {
    return 'Stock must be a non-negative number';
  }

  if (hasShipping && (payload.weight <= 0 || payload.length <= 0 || payload.width <= 0 || payload.height <= 0)) {
    return 'Shipping values must be greater than 0';
  }

  const invalidVariant = (payload.variants || []).find((variant) => {
    const hasColor = String(variant?.color || '').trim().length > 0;
    const hasSize = String(variant?.size || '').trim().length > 0;
    const priceValid = variant?.price !== null && !Number.isNaN(Number(variant.price)) && Number(variant.price) >= 0;
    const stockValid = variant?.stock !== null && !Number.isNaN(Number(variant.stock)) && Number(variant.stock) >= 0;
    return !hasColor || !hasSize || !priceValid || !stockValid;
  });

  if (invalidVariant) {
    return 'Each variant must have color, size, price, and stock';
  }

  if (missing.length) {
    return `Complete required sections before saving:\n- ${missing.join('\n- ')}`;
  }

  return '';
}

async function saveProduct() {
  if (!ensureKycVerifiedForAddProduct()) return;

  const payload = collectProductPayload();

  const validationMessage = validateCompleteProductPayload(payload);
  if (validationMessage) {
    alert(validationMessage);
    return;
  }

  try {
    if (currentProductId) {
      await apiRequest(`/${encodeURIComponent(currentProductId)}`, {
        method: 'PUT',
        body: payload
      });
      alert('Product updated successfully!');
    } else {
      await apiRequest('', {
        method: 'POST',
        body: payload
      });
      alert('Product added successfully!');
    }

    clearVariantDraft();
    closeProductModal();
    currentPage = 1;
    await loadProducts();
  } catch (error) {
    alert(error.message || 'Unable to save product');
  }
}

let currentDiscountProductId = null;

function openManageDiscountModal(id) {
  const product = allProducts.find((entry) => String(entry.id) === String(id));
  if (!product) return;

  currentDiscountProductId = product.id;
  const originalPrice = Number(product.discountPrice && Number(product.discountPrice) > Number(product.price || 0) ? product.discountPrice : product.price || 0);
  const discountedPrice = Number(product.discountPrice && Number(product.discountPrice) > Number(product.price || 0) ? product.price || 0 : (product.discountPrice !== null && product.discountPrice !== undefined && Number(product.discountPrice) < Number(product.price || 0) ? product.discountPrice : ''));

  const productNameLabel = document.getElementById('discountProductNameLabel');
  const originalInput = document.getElementById('discountOriginalPrice');
  const discountInput = document.getElementById('discountPrice');
  const percentInput = document.getElementById('discountPercent');
  const startInput = document.getElementById('discountStartDate');
  const endInput = document.getElementById('discountEndDate');

  if (productNameLabel) productNameLabel.textContent = `Managing discount for ${product.name}`;
  if (originalInput) originalInput.value = Number.isFinite(originalPrice) ? originalPrice : '';
  if (discountInput) discountInput.value = Number.isFinite(discountedPrice) ? discountedPrice : '';
  if (percentInput) percentInput.value = calculateDiscountPercent(originalPrice, Number.isFinite(discountedPrice) ? discountedPrice : null);
  if (startInput) startInput.value = formatDateInputValue(product.discountStartDate);
  if (endInput) endInput.value = formatDateInputValue(product.discountEndDate);

  document.getElementById('discountModal')?.classList.add('active');
}

function closeDiscountModal() {
  currentDiscountProductId = null;
  document.getElementById('discountModal')?.classList.remove('active');
}

async function saveDiscount() {
  if (!currentDiscountProductId) return;

  const product = allProducts.find((entry) => String(entry.id) === String(currentDiscountProductId));
  if (!product) return;

  const originalPrice = Number(document.getElementById('discountOriginalPrice')?.value || 0);
  const discountPriceValue = document.getElementById('discountPrice')?.value === '' ? null : Number(document.getElementById('discountPrice')?.value);
  const discountPercent = calculateDiscountPercent(originalPrice, discountPriceValue);
  const startDateValue = document.getElementById('discountStartDate')?.value || null;
  const endDateValue = document.getElementById('discountEndDate')?.value || null;

  if (discountPriceValue !== null && discountPriceValue >= originalPrice) {
    alert('Discount price must be less than the original price.');
    return;
  }

  try {
    await apiRequest(`/${encodeURIComponent(currentDiscountProductId)}`, {
      method: 'PUT',
      body: {
        name: product.name,
        brand: product.brand || '',
        sku: product.sku || '',
        category: product.category || '',
        description: product.description || '',
        price: originalPrice,
        discountPrice: discountPriceValue,
        discountPercent,
        discountStartDate: startDateValue,
        discountEndDate: endDateValue,
        stock: product.stock ?? 0,
        weight: product.weight ?? null,
        length: product.length ?? null,
        width: product.width ?? null,
        height: product.height ?? null,
        barcode: product.barcode || '',
        color: product.color || null,
        size: product.size || null,
        fitType: product.fitType || null,
        material: product.material || null,
        occasion: product.occasion || null,
        style: product.style || null,
        status: product.status || 'Approved',
        images: Array.isArray(product.images) ? product.images : [],
        variants: Array.isArray(product.variants) ? product.variants : []
      }
    });

    closeDiscountModal();
    await loadProducts();
    alert('Discount updated successfully!');
  } catch (error) {
    alert(error.message || 'Unable to update discount');
  }
}

function deleteProduct(id) {
  currentProductId = id;
  document.getElementById('deleteModal')?.classList.add('active');
}

function closeDeleteModal() {
  document.getElementById('deleteModal')?.classList.remove('active');
}

async function confirmDelete() {
  if (!currentProductId) return;

  try {
    await apiRequest(`/${encodeURIComponent(currentProductId)}`, { method: 'DELETE' });
    alert('Product deleted successfully!');
    closeDeleteModal();
    currentPage = 1;
    await loadProducts();
  } catch (error) {
    alert(error.message || 'Unable to delete product');
  }
}

function setupImageUpload() {
  const area = document.getElementById('imageUploadArea');
  const input = document.getElementById('productImageFiles');
  if (!area || !input) return;

  area.addEventListener('click', () => input.click());

  area.addEventListener('dragover', (event) => {
    event.preventDefault();
    area.classList.add('dragover');
  });

  area.addEventListener('dragleave', () => area.classList.remove('dragover'));

  area.addEventListener('drop', (event) => {
    event.preventDefault();
    area.classList.remove('dragover');
    handleImageUpload(event.dataTransfer.files);
  });

  input.addEventListener('change', (event) => handleImageUpload(event.target.files));
}

function handleImageUpload(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      alert('Only image files allowed');
      continue;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Max 5MB per image');
      continue;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      currentImages.push({
        id: `img-${Date.now()}`,
        name: file.name,
        data: event.target.result
      });
      renderImages();
    };
    reader.readAsDataURL(file);
  }
}

function renderImages() {
  const gallery = document.getElementById('imagesGallery');
  if (!gallery) return;

  if (!currentImages.length) {
    gallery.innerHTML = '';
    return;
  }

  gallery.innerHTML = currentImages.map((image, index) => {
    const src = typeof image === 'string' ? image : image.data || image.url || '';
    const name = typeof image === 'string' ? `Image ${index + 1}` : image.name || `Image ${index + 1}`;
    return `
      <div class="image-item">
        <img src="${src}" alt="${name}">
        <button class="remove-btn" onclick="removeImage(${index})">×</button>
      </div>
    `;
  }).join('');
}

function removeImage(index) {
  currentImages.splice(index, 1);
  renderImages();
}

function openAddVariantModal() {
  syncVariantCheckboxDefaults();
  updateVariantActionLabels();
  renderVariantGeneratorTable();
  updateVariantModalState();
  document.getElementById('variantModal')?.classList.add('active');
}

function closeVariantModal() {
  document.getElementById('variantModal')?.classList.remove('active');
}

function updateVariantActionLabels() {
  const hasVariants = currentVariants.length > 0;
  const variantsActionBtn = document.getElementById('variantsActionBtn');

  if (variantsActionBtn) {
    variantsActionBtn.textContent = hasVariants ? 'Edit Variants' : '+ Generate Variants';
  }
}

function updateVariantModalState() {
  const setup = document.getElementById('variantGeneratorSetup');
  const editor = document.getElementById('variantGeneratorEditor');
  const saveBtn = document.getElementById('variantModalSaveBtn');
  const addRowBtn = document.getElementById('variantAddRowBtn');
  const generateBtn = document.getElementById('variantModalGenerateBtn');
  const hasVariants = currentVariants.length > 0;

  if (setup) setup.style.display = hasVariants ? 'none' : 'block';
  if (editor) editor.style.display = hasVariants ? 'block' : 'none';
  if (saveBtn) saveBtn.style.display = hasVariants ? 'inline-flex' : 'none';
  if (addRowBtn) addRowBtn.style.display = hasVariants ? 'inline-flex' : 'none';
  if (generateBtn) generateBtn.style.display = hasVariants ? 'none' : 'inline-flex';
}

function generateVariants() {
  const colors = getSelectedCheckboxValues('variantColors');
  const customColor = String(document.getElementById('variantCustomColor')?.value || '').trim();
  const sizes = getSelectedCheckboxValues('variantSizes');
  const basePrice = Number(document.getElementById('variantBasePrice')?.value || document.getElementById('productPrice')?.value || 0);
  const baseStock = Number(document.getElementById('productStock')?.value || 0);

  if (document.getElementById('variantColorOtherToggle')?.checked && !customColor) {
    alert('Type the custom color name first');
    return;
  }

  if (customColor) {
    colors.push(customColor);
  }

  const uniqueColors = [...new Set(colors.map((color) => String(color || '').trim()).filter(Boolean))];

  if (!uniqueColors.length || !sizes.length) {
    alert('Select at least one color and one size');
    return;
  }

  if (currentVariants.length) {
    const confirmed = window.confirm('This will replace the current variant table. Continue?');
    if (!confirmed) return;
  }

  currentVariants = uniqueColors.flatMap((color) => sizes.map((size, index) => ({
    id: `var-${Date.now()}-${normalizeVariantKey(color)}-${normalizeVariantKey(size)}-${index}`,
    color,
    size,
    price: Number.isFinite(basePrice) && basePrice > 0 ? basePrice : '',
    stock: Number.isFinite(baseStock) && baseStock >= 0 ? baseStock : ''
  })));

  renderVariants();
  updateVariantActionLabels();
  renderVariantGeneratorTable();
  updateVariantModalState();
  persistVariantDraft();
}

function saveVariants() {
  if (!currentVariants.length) {
    alert('Generate at least one variant first');
    return;
  }

  renderVariants();
  updateVariantActionLabels();
  renderVariantGeneratorTable();
  updateVariantModalState();
  closeVariantModal();
  persistVariantDraft();
}

function addVariant() {
  generateVariants();
}

function addVariantRow() {
  currentVariants.push({
    id: `var-manual-${Date.now()}-${currentVariants.length + 1}`,
    color: '',
    size: '',
    price: '',
    stock: ''
  });

  renderVariants();
  updateVariantActionLabels();
  renderVariantGeneratorTable();
  updateVariantModalState();
  persistVariantDraft();
}

function updateVariantField(index, field, value) {
  if (!currentVariants[index]) return;
  currentVariants[index][field] = value;
  persistVariantDraft();
}

function renderVariants() {
  const list = document.getElementById('variantsList');
  if (!list) return;

  if (!currentVariants.length) {
    list.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded">tune</span><p>No variants generated yet</p></div>';
    updateVariantActionLabels();
    return;
  }

  list.innerHTML = `
    <div style="overflow-x:auto; border:1px solid #e5e7eb; border-radius:10px; background:white;">
      <table class="data-table" style="min-width:720px; margin:0;">
        <thead>
          <tr>
            <th>Color</th>
            <th>Size</th>
            <th>Price (PKR)</th>
            <th>Stock</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${currentVariants.map((variant, index) => `
            <tr>
              <td><strong>${variant.color || 'N/A'}</strong></td>
              <td>${variant.size || 'N/A'}</td>
              <td>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value="${variant.price ?? ''}"
                  placeholder="0.00"
                  oninput="updateVariantField(${index}, 'price', this.value)"
                  style="max-width:140px;"
                >
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value="${variant.stock ?? ''}"
                  placeholder="0"
                  oninput="updateVariantField(${index}, 'stock', this.value)"
                  style="max-width:120px;"
                >
              </td>
              <td>
                <button type="button" class="btn-action delete" onclick="removeVariant(${index})">Remove</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  updateVariantActionLabels();
}

function renderVariantGeneratorTable() {
  const wrap = document.getElementById('generatedVariantTableWrap');
  const rows = document.getElementById('generatedVariantRows');
  if (!wrap || !rows) return;

  if (!currentVariants.length) {
    wrap.style.display = 'none';
    rows.innerHTML = '';
    updateVariantModalState();
    return;
  }

  wrap.style.display = 'block';
  rows.innerHTML = currentVariants.map((variant, index) => `
    <tr>
      <td>
        <input type="text" value="${variant.color ?? ''}" placeholder="Color" oninput="updateVariantField(${index}, 'color', this.value)" style="width:100%; max-width:160px; padding:8px; border:1px solid #d1d5db; border-radius:6px;">
      </td>
      <td>
        <input type="text" value="${variant.size ?? ''}" placeholder="Size" oninput="updateVariantField(${index}, 'size', this.value)" style="width:100%; max-width:120px; padding:8px; border:1px solid #d1d5db; border-radius:6px;">
      </td>
      <td>
        <input type="number" min="0" step="0.01" value="${variant.price ?? ''}" oninput="updateVariantField(${index}, 'price', this.value)" style="width:100%; max-width:140px; padding:8px; border:1px solid #d1d5db; border-radius:6px;">
      </td>
      <td>
        <input type="number" min="0" step="1" value="${variant.stock ?? ''}" oninput="updateVariantField(${index}, 'stock', this.value)" style="width:100%; max-width:120px; padding:8px; border:1px solid #d1d5db; border-radius:6px;">
      </td>
      <td>
        <button type="button" class="btn-action delete" onclick="removeVariant(${index})">Remove</button>
      </td>
    </tr>
  `).join('');

  updateVariantModalState();
}

function removeVariant(index) {
  currentVariants.splice(index, 1);
  renderVariants();
  renderVariantGeneratorTable();
  persistVariantDraft();
}

function viewProduct(id) {
  try {
    const product = allProducts.find((entry) => String(entry.id) === String(id));
    if (!product) {
      console.error('Product not found:', id);
      return;
    }

    currentProductId = product.id;
    currentDetailProduct = product;

    const setText = (elementId, text) => {
      const element = document.getElementById(elementId);
      if (element) element.textContent = text;
    };

    setText('detailProductName', product.name || 'Product Name');
    setText('detailProductSKU', product.sku ? `SKU: ${product.sku}` : 'SKU: N/A');
    setText('detailBrand', product.brand || 'N/A');
    setText('detailCategory', product.category || 'N/A');
    setText('detailPrice', formatPkr(product.price || 0));
    setText('detailStock', String(product.stock ?? 0));
    setText('detailStatus', normalizeProductStatus(product.status));
    setText('detailBarcode', product.barcode || 'N/A');
    setText('detailDescription', product.description || 'No description provided');

    const weight = product.weight !== null && product.weight !== undefined && product.weight !== '' ? `${product.weight} kg` : 'N/A';
    setText('detailWeight', weight);

    const dims = product.length && product.width && product.height
      ? `${product.length}L × ${product.width}W × ${product.height}H cm`
      : 'N/A';
    setText('detailDimensions', dims);

    const rating = Number(product.rating || 0);
    const reviewCount = Number(product.reviewCount || 0);
    setText('detailRating', rating.toFixed(1));
    setText('detailRatingStars', rating > 0 ? `${'★'.repeat(Math.floor(rating))}${'☆'.repeat(Math.max(0, 5 - Math.ceil(rating)))}`.padEnd(5, '☆') : '☆☆☆☆☆');
    setText('detailReviewCount', `(${reviewCount} reviews)`);

    const mainImage = document.getElementById('mainImage');
    const noImagesPlaceholder = document.getElementById('noImagesPlaceholder');
    const thumbnailGallery = document.getElementById('thumbnailGallery');

    if (mainImage && noImagesPlaceholder && thumbnailGallery) {
      const images = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
      if (images.length) {
        const firstImage = typeof images[0] === 'string' ? images[0] : images[0]?.url || images[0]?.data || '';
        mainImage.src = firstImage;
        mainImage.style.display = 'block';
        noImagesPlaceholder.style.display = 'none';

        thumbnailGallery.innerHTML = images.map((image, index) => {
          const src = typeof image === 'string' ? image : image?.url || image?.data || '';
          return `<img src="${src}" alt="Product image ${index + 1}" class="thumbnail-item ${index === 0 ? 'active' : ''}" onclick="switchProductImage('${src}', this)">`;
        }).join('');
      } else {
        mainImage.style.display = 'none';
        noImagesPlaceholder.style.display = 'flex';
        thumbnailGallery.innerHTML = '';
      }
    }

    const variantsSection = document.getElementById('variantsSection');
    const detailVariantsList = document.getElementById('detailVariantsList');
    if (variantsSection && detailVariantsList) {
      if (product.variants && product.variants.length) {
        variantsSection.style.display = 'block';
        detailVariantsList.innerHTML = product.variants.map((variant) => `
          <div class="variant-row">
            <div><strong>Color:</strong> ${variant.color || variant.attributes?.color || 'N/A'}</div>
            <div><strong>Size:</strong> ${variant.size || variant.attributes?.size || 'N/A'}</div>
            <div><strong>Price:</strong> ${variant.price !== null && variant.price !== undefined ? formatPkr(variant.price) : 'Product price'}</div>
            <div><strong>Stock:</strong> ${variant.stock !== null && variant.stock !== undefined ? variant.stock : 'Product stock'}</div>
          </div>
        `).join('');
      } else {
        variantsSection.style.display = 'none';
      }
    }

    const reviewsList = document.getElementById('reviewsList');
    const noReviewsMessage = document.getElementById('noReviewsMessage');
    const reviews = product.reviews || [];

    if (reviewsList && noReviewsMessage) {
      if (reviews.length) {
        noReviewsMessage.style.display = 'none';
        reviewsList.innerHTML = reviews.map((review, index) => `
          <div style="padding: 15px; background: #f9f9f9; border: 1px solid #e5e7eb; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
              <div>
                <strong style="color: #232f3e;">${review.customerName}</strong>
                <div style="color: #ffc107; font-size: 12px; margin-top: 3px;">${'★'.repeat(Number(review.rating || 0))}${'☆'.repeat(Math.max(0, 5 - Number(review.rating || 0)))}</div>
              </div>
              <div style="color: #999; font-size: 12px;">${review.date ? new Date(review.date).toLocaleDateString() : ''}</div>
            </div>
            <p style="margin: 10px 0; color: #333; font-size: 13px;">${review.comment || ''}</p>
            ${review.sellerReply ? `
              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb; background: #f0f7ff; padding: 10px; border-radius: 4px;">
                <div style="color: #0066c0; font-weight: 600; font-size: 12px; margin-bottom: 5px;">Seller Reply:</div>
                <p style="margin: 0; color: #333; font-size: 13px;">${review.sellerReply}</p>
              </div>
            ` : `
              <button class="btn btn-sm" onclick="openReplyForm(${index})" style="margin-top: 10px; padding: 6px 12px; background: #0066c0; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Reply</button>
              <div id="replyForm-${index}" style="display: none; margin-top: 10px; padding: 10px; background: white; border: 1px solid #e5e7eb; border-radius: 4px;">
                <textarea id="replyText-${index}" placeholder="Write your reply..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: Arial; font-size: 12px; resize: vertical; min-height: 60px;"></textarea>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                  <button onclick="submitReply(${index})" style="padding: 6px 12px; background: #0066c0; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Submit</button>
                  <button onclick="cancelReply(${index})" style="padding: 6px 12px; background: #ddd; color: #333; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Cancel</button>
                </div>
              </div>
            `}
          </div>
        `).join('');
      } else {
        noReviewsMessage.style.display = 'block';
        reviewsList.innerHTML = '';
      }
    }

    const modal = document.getElementById('productDetailModal');
    if (modal) {
      modal.classList.add('active');
      attachModalEventListeners();
    }
  } catch (error) {
    console.error('Error in viewProduct:', error);
  }
}

function attachModalEventListeners() {
  document.querySelectorAll('.btn-close-modal').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      closeDetailModal();
    };
  });

  const editBtn = document.querySelector('.btn-edit-modal');
  if (editBtn) {
    editBtn.onclick = (event) => {
      event.preventDefault();
      editFromDetail();
    };
  }

  const modal = document.getElementById('productDetailModal');
  if (modal) {
    modal.onclick = (event) => {
      if (event.target === modal) {
        closeDetailModal();
      }
    };
  }
}

function openReplyForm(reviewIndex) {
  document.getElementById(`replyForm-${reviewIndex}`)?.style.setProperty('display', 'block');
}

function cancelReply(reviewIndex) {
  document.getElementById(`replyForm-${reviewIndex}`)?.style.setProperty('display', 'none');
}

async function submitReply(reviewIndex) {
  if (!currentDetailProduct || !currentDetailProduct.reviews || !currentDetailProduct.reviews[reviewIndex]) return;

  const review = currentDetailProduct.reviews[reviewIndex];
  const replyText = String(document.getElementById(`replyText-${reviewIndex}`)?.value || '').trim();

  if (!replyText) {
    alert('Please write a reply');
    return;
  }

  try {
    await apiRequest(`/${encodeURIComponent(currentProductId)}/reviews/${encodeURIComponent(review.id)}/reply`, {
      method: 'POST',
      body: { replyText }
    });

    await loadProducts();
    viewProduct(currentProductId);
  } catch (error) {
    alert(error.message || 'Unable to submit reply');
  }
}

function switchProductImage(src, element) {
  const mainImage = document.getElementById('mainImage');
  if (mainImage) {
    mainImage.src = src;
  }

  document.querySelectorAll('.thumbnail-item').forEach((thumb) => thumb.classList.remove('active'));
  element?.classList.add('active');
}

function closeDetailModal() {
  document.getElementById('productDetailModal')?.classList.remove('active');
}

function editFromDetail() {
  closeDetailModal();
  if (currentProductId) {
    setTimeout(() => editProduct(currentProductId), 250);
  }
}

window.openAddProductModal = openAddProductModal;
window.closeProductModal = closeProductModal;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.closeDeleteModal = closeDeleteModal;
window.confirmDelete = confirmDelete;
window.openManageDiscountModal = openManageDiscountModal;
window.closeDiscountModal = closeDiscountModal;
window.saveDiscount = saveDiscount;
window.syncDiscountModalPercent = syncDiscountModalPercent;
window.switchTab = switchTab;
window.addVariant = addVariant;
window.generateVariants = generateVariants;
window.saveVariants = saveVariants;
window.removeVariant = removeVariant;
window.closeVariantModal = closeVariantModal;
window.openAddVariantModal = openAddVariantModal;
window.updateVariantField = updateVariantField;
window.saveProduct = saveProduct;
window.viewProduct = viewProduct;
window.switchProductImage = switchProductImage;
window.closeDetailModal = closeDetailModal;
window.editFromDetail = editFromDetail;
window.goPage = goPage;
window.removeImage = removeImage;
window.openReplyForm = openReplyForm;
window.cancelReply = cancelReply;
window.submitReply = submitReply;
window.attachProductButtonListeners = attachProductButtonListeners;
window.attachModalEventListeners = attachModalEventListeners;