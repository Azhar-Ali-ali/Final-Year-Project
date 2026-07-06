(function () {
  function normalizeVerificationStatus(value) {
    const normalized = String(value || '').toLowerCase().trim();
    if (!normalized) return '';
    if (normalized === 'approved' || normalized === 'active') return 'verified';
    return normalized;
  }

  function isVerifiedStatus(value) {
    return normalizeVerificationStatus(value) === 'verified';
  }

  function readAuthUser() {
    const keys = ['lumina.auth', 'lumina.auth.user', 'lumina.seller.session', 'lumina.user'];

    for (const key of keys) {
      const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (!raw) {
        continue;
      }

      try {
        const parsed = JSON.parse(raw);
        if (key === 'lumina.auth' && parsed && typeof parsed === 'object' && parsed.user) {
          return parsed.user;
        }
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch (_) {
        // Ignore malformed storage entries and continue with fallbacks.
      }
    }

    return null;
  }

  function resolveSellerId(user) {
    const parsed = user || readAuthUser() || {};
    const keys = ['sellerId', 'seller_id', 'currentSellerId', 'sellerUserId', 'userId'];

    for (const key of keys) {
      const value = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (value) return String(value).trim();
    }

    return String(parsed.id || parsed.userId || parsed.sellerId || '').trim();
  }

  function getSellerState() {
    const user = readAuthUser() || {};
    const profile = user.sellerProfile || {};
    const cachedName = localStorage.getItem('lumina.seller.headerName') || '';
    const cachedStatus = localStorage.getItem('lumina.seller.kycStatus') || '';
    const fallbackName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const sellerName = String(profile.storeName || profile.sellerName || cachedName || fallbackName || user.email || 'Seller').trim();

    const verificationRaw = normalizeVerificationStatus(profile.verificationStatus || profile.kycStatus || cachedStatus);
    const verified = profile.isVerified === true || isVerifiedStatus(verificationRaw);

    return {
      sellerName,
      verified,
      label: verified ? 'Verified' : 'Not Verified',
      hint: verified ? 'All features unlocked' : 'Verify KYC first to unlock product publishing'
    };
  }

  async function fetchSellerLiveState() {
    const user = readAuthUser() || {};
    const sellerId = resolveSellerId(user);

    try {
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

      const [profileData, verificationData] = await Promise.all([
        requestWithSellerContext('/api/seller/settings/profile'),
        requestWithSellerContext('/api/seller/settings/verification')
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
        verified: isVerifiedStatus(normalizedStatus),
        verificationStatus: normalizedStatus || null
      };
    } catch (_) {
      return null;
    }
  }

  function findProfileToggle() {
    const explicitToggle = document.getElementById('profileDropdownToggle');
    if (explicitToggle) return explicitToggle;

    const withChevron = Array.from(document.querySelectorAll('nav button')).find((button) => {
      return button.querySelector('i[data-lucide="chevron-down"]');
    });

    return withChevron || null;
  }

  function updateProfileHeader(state) {
    const toggle = findProfileToggle();
    if (!toggle) return;

    const label = document.getElementById('sellerProfileLabel') || toggle.querySelector('span.text-xs.font-bold.text-gray-700');
    const avatar = document.getElementById('sellerProfileAvatar') || toggle.querySelector('div.w-8.h-8');

    if (label) label.textContent = state.sellerName;
    if (avatar) avatar.textContent = (state.sellerName.charAt(0) || 'S').toUpperCase();
  }

  function updateVerificationPanel(state) {
    const accountStatusSpan = Array.from(document.querySelectorAll('span')).find((span) => span.textContent.trim() === 'Account Status');
    const statusRow = accountStatusSpan ? accountStatusSpan.parentElement : null;

    const badge = document.getElementById('sellerVerificationBadge') || (statusRow ? statusRow.querySelector('span.inline-flex') : null);
    const hint = document.getElementById('sellerVerificationHint') || (statusRow && statusRow.parentElement ? statusRow.parentElement.querySelector('p.text-xs.text-gray-500') : null);

    if (!badge) return;

    badge.className = state.verified
      ? 'inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold'
      : 'inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold';

    badge.innerHTML = state.verified
      ? '<i data-lucide="check-circle" class="w-3 h-3"></i><span class="seller-verification-dynamic-text">Verified</span>'
      : '<i data-lucide="alert-circle" class="w-3 h-3"></i><span class="seller-verification-dynamic-text">Not Verified</span>';

    if (hint) hint.textContent = state.hint;

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function clearSellerAuthState() {
    const keys = [
      'lumina.auth',
      'lumina.auth.user',
      'lumina.auth.token',
      'lumina.auth.role',
      'lumina.isLoggedIn',
      'lumina.customer.session',
      'lumina.seller.session',
      'lumina.user',
      'lumina.seller.headerName',
      'lumina.seller.kycStatus',
      'sellerId',
      'seller_id',
      'currentSellerId',
      'sellerUserId',
      'userId'
    ];

    keys.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  }

  function performSellerLogout(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }

    const shouldLogout = window.confirm ? window.confirm('Are you sure you want to logout?') : true;
    if (!shouldLogout) {
      return false;
    }

    clearSellerAuthState();
    window.location.replace('/login_register.html');
    return true;
  }

  function bindSellerLogoutTriggers() {
    const candidates = Array.from(document.querySelectorAll('a, button'));
    candidates.forEach((element) => {
      const label = String(element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isLogoutTrigger = element.getAttribute('data-lumina-logout') === '1'
        || element.classList.contains('lumina-logout')
        || label === 'logout'
        || label === 'log out';

      if (!isLogoutTrigger || element.dataset.sellerLogoutBound === 'true') return;

      element.dataset.sellerLogoutBound = 'true';
      element.addEventListener('click', performSellerLogout);
    });
  }

  function collectHeaderAddButtons() {
    const nav = document.querySelector('nav');
    if (!nav) return [];

    return Array.from(nav.querySelectorAll('button')).filter((button) => {
      const compactText = String(button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const hasPlus = Boolean(button.querySelector('i[data-lucide="plus"], .material-symbols-rounded'));
      const isNamedAddProduct = compactText.includes('add product');
      const isLikelyHeaderAdd = hasPlus && (button.classList.contains('sm:hidden') || button.className.includes('hidden sm:flex'));
      return isNamedAddProduct || isLikelyHeaderAdd;
    });
  }

  function updateAddProductButtons(state) {
    const addButtons = collectHeaderAddButtons();

    addButtons.forEach((button) => {
      if (state.verified) {
        button.classList.remove('opacity-50', 'cursor-not-allowed');
        button.removeAttribute('aria-disabled');
        button.title = '';
      } else {
        button.classList.add('opacity-50', 'cursor-not-allowed');
        button.setAttribute('aria-disabled', 'true');
        button.title = 'Verify KYC first';
      }

      if (button.dataset.kycBound === 'true') return;
      button.dataset.kycBound = 'true';

      button.addEventListener('click', function (event) {
        const latest = getSellerState();
        if (!latest.verified) {
          event.preventDefault();
          event.stopPropagation();
          alert('Verify KYC first to add products.');
          return;
        }

        const path = String(window.location.pathname || '').toLowerCase();
        const hasInlineClick = button.hasAttribute('onclick');
        if (!hasInlineClick && !path.includes('product-management.html')) {
          window.location.href = 'Product-Management.html';
        }
      });
    });
  }

  async function initSellerHeaderState() {
    bindSellerLogoutTriggers();

    const state = getSellerState();
    updateProfileHeader(state);
    updateVerificationPanel(state);
    updateAddProductButtons(state);

    const liveState = await fetchSellerLiveState();
    if (liveState) {
      const refreshedState = {
        ...getSellerState(),
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
      updateProfileHeader(refreshedState);
      updateVerificationPanel(refreshedState);
      updateAddProductButtons(refreshedState);
    }
  }

  window.performSellerLogout = performSellerLogout;
  window.logout = performSellerLogout;
  window.handleLogout = performSellerLogout;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSellerHeaderState);
  } else {
    initSellerHeaderState();
  }
})();
