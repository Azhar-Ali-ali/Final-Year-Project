function normalizePermissions(rawPermissions) {
  if (!Array.isArray(rawPermissions)) {
    return [];
  }

  return rawPermissions
    .filter(Boolean)
    .map((permission) => String(permission).trim().toLowerCase())
    .filter(Boolean);
}

function getStoredPermissions() {
  try {
    const raw = localStorage.getItem('lumina.admin.permissions');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizePermissions(parsed);
  } catch (_) {
    return [];
  }
}

function permissionMatches(userPermission, requiredPermission) {
  const normalizedUserPermission = String(userPermission || '').trim().toLowerCase();
  const normalizedRequiredPermission = String(requiredPermission || '').trim().toLowerCase();

  if (!normalizedRequiredPermission) return true;
  if (!normalizedUserPermission) return false;
  if (normalizedUserPermission === '*' || normalizedUserPermission === normalizedRequiredPermission) return true;

  const [requiredModule, requiredAction] = normalizedRequiredPermission.split('.');
  const [userModule, userAction] = normalizedUserPermission.split('.');

  if (!requiredModule || !userModule) return false;
  if (requiredModule !== userModule) return false;

  if (userAction === 'manage' || userAction === '*') {
    return true;
  }

  return false;
}

function hasPermission(permission, permissions = getStoredPermissions()) {
  const normalizedPermission = String(permission || '').trim().toLowerCase();
  if (!normalizedPermission) return true;
  return permissions.some((userPermission) => permissionMatches(userPermission, normalizedPermission));
}

function getRequiredPermissionForCurrentPage() {
  const path = String(window.location.pathname || '').toLowerCase();
  const fileName = path.split('/').pop() || '';
  const pageMap = {
    'admin_dashboard.html': 'dashboard.view',
    'product_catalog_management.html': 'products.view',
    'cms.html': 'cms.view',
    'order_management.html': 'orders.view',
    'user_management.html': 'customers.view',
    'seller_management.html': 'sellers.view',
    'payment_payout_management.html': 'payments.view',
    'reports_analytics.html': 'reports.view',
    'setting.html': 'settings.view',
    'reviews_ratings_management.html': 'reviews.view',
    'dispute&support.html': 'support.view',
    'logistics_courier_management.html': 'logistics.view'
  };

  return pageMap[fileName] || null;
}

function applyPermissionBasedVisibility(root = document) {
  const elements = root.querySelectorAll('[data-permission]');
  elements.forEach((element) => {
    const permission = element.getAttribute('data-permission');
    if (!permission) return;
    if (!hasPermission(permission)) {
      element.style.display = 'none';
    }
  });
}

function applyActiveSidebarLink(root = document) {
  const sidebar = root.getElementById('sidebar');
  if (!sidebar) return;

  const currentPath = String(window.location.pathname || '').split('/').pop() || '';
  const currentFile = currentPath.toLowerCase();

  const sidebarLinks = sidebar.querySelectorAll('a[href]');
  sidebarLinks.forEach((link) => {
    const href = link.getAttribute('href') || '';
    const targetFile = String(href).split('?')[0].split('#')[0].split('/').pop().toLowerCase();

    const isActive = targetFile && currentFile && targetFile === currentFile;

    link.classList.toggle('bg-gray-100', isActive);
    link.classList.toggle('font-semibold', isActive);
    link.classList.toggle('text-gray-900', isActive);
    link.classList.toggle('text-gray-700', !isActive);

    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function attachAdminSearchSuggestions(root = document) {
  const searchInput = root.querySelector('input[placeholder*="Search"], input[type="search"]');
  if (!searchInput || searchInput.dataset.searchBound === 'true') return;

  searchInput.dataset.searchBound = 'true';
  const container = searchInput.parentElement;
  if (!container) return;

  let dropdown = root.getElementById('admin-search-suggestions');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'admin-search-suggestions';
    dropdown.className = 'absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 hidden z-[120] max-h-64 overflow-y-auto';
    container.appendChild(dropdown);
  }

  const getSuggestions = () => {
    const sidebarLinks = Array.from(root.querySelectorAll('#sidebar a[href], nav a[href]'));
    const seen = new Set();
    const items = [];

    sidebarLinks.forEach((link) => {
      const label = (link.textContent || '').trim();
      const href = link.getAttribute('href') || '';
      const target = String(href).split('?')[0].split('#')[0];
      if (!label || !target || !target.endsWith('.html') || seen.has(target)) return;
      seen.add(target);
      items.push({ label, href: target });
    });

    return items;
  };

  const renderSuggestions = (query = '') => {
    const suggestions = getSuggestions().filter((item) => {
      const haystack = `${item.label} ${item.href}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    });

    if (!query.trim() || suggestions.length === 0) {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      return;
    }

    dropdown.innerHTML = suggestions.map((item) => `
      <button type="button" class="w-full flex items-center justify-between px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors" data-href="${item.href}">
        <span>${item.label}</span>
        <span class="text-xs text-gray-400">Open</span>
      </button>
    `).join('');

    dropdown.classList.remove('hidden');

    dropdown.querySelectorAll('button[data-href]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.getAttribute('data-href');
        if (target) {
          window.location.assign(target);
        }
      });
    });
  };

  searchInput.addEventListener('input', (event) => {
    renderSuggestions(event.target.value);
  });

  searchInput.addEventListener('focus', () => {
    renderSuggestions(searchInput.value);
  });

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

function logoutAdmin(redirectTo = 'admin_login.html') {
  const storageKeys = [
    'lumina.admin.authToken',
    'lumina.auth.token',
    'lumina.admin.permissions',
    'lumina.admin.user',
    'lumina.admin.userData',
    'lumina.admin.userDataRaw',
    'lumina.admin.profile',
    'lumina.admin.role'
  ];

  storageKeys.forEach((key) => localStorage.removeItem(key));
  try {
    sessionStorage.removeItem('lumina.admin.authToken');
    sessionStorage.removeItem('lumina.auth.token');
  } catch (_) {}

  if (window.location.pathname.includes('admin_login.html')) {
    return;
  }

  window.location.replace(redirectTo);
}

function bindHeaderQuickActions(root = document) {
  const headerLinks = Array.from(root.querySelectorAll('a'));

  headerLinks.forEach((element) => {
    const text = (element.textContent || '').trim().toLowerCase();

    if (text === 'profile') {
      element.setAttribute('href', 'setting.html#admin-profile');
      element.setAttribute('data-admin-header-action', 'profile');
      element.addEventListener('click', (event) => {
        event.preventDefault();
        window.location.assign('setting.html#admin-profile');
      });
    } else if (text === 'system settings') {
      element.setAttribute('href', 'setting.html');
      element.setAttribute('data-admin-header-action', 'settings');
      element.addEventListener('click', (event) => {
        event.preventDefault();
        window.location.assign('setting.html');
      });
    } else if (text === 'logout') {
      element.setAttribute('href', '#');
      element.setAttribute('data-admin-header-action', 'logout');
      element.setAttribute('data-admin-logout-link', 'true');
      element.addEventListener('click', (event) => {
        event.preventDefault();
        logoutAdmin();
      });
    }
  });
}

function bindLogoutActions(root = document) {
  const logoutCandidates = Array.from(root.querySelectorAll('a,button'))
    .filter((element) => {
      if (element.dataset.logoutBound === 'true') return false;
      const text = (element.textContent || '').trim().toLowerCase();
      const ariaLabel = (element.getAttribute('aria-label') || '').trim().toLowerCase();
      const hasLogoutText = text.includes('logout') || text.includes('log out');
      const hasLogoutAria = ariaLabel.includes('logout') || ariaLabel.includes('log out');
      return hasLogoutText || hasLogoutAria || element.hasAttribute('data-admin-logout-link');
    });

  logoutCandidates.forEach((element) => {
    element.dataset.logoutBound = 'true';
    element.addEventListener('click', (event) => {
      if (element.tagName.toLowerCase() === 'a' && (element.getAttribute('href') || '#') === '#') {
        event.preventDefault();
      }
      event.stopPropagation();
      logoutAdmin();
    });
  });
}

function injectSidebarLogoutLink(root = document) {
  const sidebar = root.getElementById('sidebar');
  if (!sidebar) return;

  if (sidebar.querySelector('[data-admin-logout-link]')) return;

  const container = sidebar.querySelector('nav') || sidebar;
  const divider = document.createElement('div');
  divider.className = 'h-px bg-gray-100 my-3';
  container.appendChild(divider);

  const logoutLink = document.createElement('a');
  logoutLink.href = '#';
  logoutLink.setAttribute('data-admin-logout-link', 'true');
  logoutLink.className = 'flex items-center gap-3 px-4 py-3 text-sm text-red-600 rounded-lg hover:bg-red-50 transition-all';
  logoutLink.innerHTML = `
    <i data-lucide="log-out" class="w-4 h-4"></i>
    <span>Logout</span>
  `;
  logoutLink.addEventListener('click', (event) => {
    event.preventDefault();
    logoutAdmin();
  });

  container.appendChild(logoutLink);

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function enforcePageAccess(redirectTo = '../../403.html') {
  if (window.location.pathname.includes('admin_login.html') || window.location.pathname.includes('403.html')) {
    return true;
  }

  const requiredPermission = getRequiredPermissionForCurrentPage();
  if (!requiredPermission) {
    return true;
  }

  return requireAdminAccess(requiredPermission, redirectTo);
}

function requireAdminAccess(requiredPermission, redirectTo = '../403.html') {
  const token = localStorage.getItem('lumina.admin.authToken') || localStorage.getItem('lumina.auth.token');
  if (!token) {
    window.location.replace('admin_login.html');
    return false;
  }

  if (!hasPermission(requiredPermission)) {
    window.location.replace(redirectTo);
    return false;
  }

  return true;
}

if (typeof document !== 'undefined') {
  const initializeAdminAccess = () => {
    applyPermissionBasedVisibility();
    applyActiveSidebarLink();
    bindHeaderQuickActions();
    bindLogoutActions();
    injectSidebarLogoutLink();
    attachAdminSearchSuggestions();
    enforcePageAccess();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAdminAccess);
  } else {
    initializeAdminAccess();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizePermissions, getStoredPermissions, hasPermission, requireAdminAccess, applyPermissionBasedVisibility, getRequiredPermissionForCurrentPage, enforcePageAccess, logoutAdmin, injectSidebarLogoutLink };
}
