(function () {
  const API_BASE_URL = window.API_BASE_URL || `${window.location.origin}/api`;

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

  function resolveProfileDropdownElements() {
    const toggle = document.getElementById('profileDropdownToggle') || findProfileToggle();
    if (!toggle) return null;

    const explicitMenu = document.getElementById('profileDropdownMenu');
    let menu = explicitMenu;

    if (!menu) {
      const parent = toggle.parentElement;
      if (parent) {
        menu = Array.from(parent.children).find((child) => {
          return child !== toggle && child.querySelector && (child.querySelector('a') || child.className.includes('absolute'));
        }) || null;
      }
    }

    const wrap = document.getElementById('profileDropdownWrap') || (toggle.parentElement && toggle.parentElement.classList.contains('relative') ? toggle.parentElement : toggle.closest('.relative, .group'));

    return { toggle, menu, wrap };
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

  let sellerNotifications = [];

  function getNotificationIcon(type) {
    const normalized = String(type || '').toLowerCase();
    if (normalized.includes('order')) return '🛒';
    if (normalized.includes('stock') || normalized.includes('warning')) return '⚠️';
    if (normalized.includes('return')) return '↩️';
    if (normalized.includes('payment') || normalized.includes('payout') || normalized.includes('withdraw')) return '💰';
    if (normalized.includes('review') || normalized.includes('message') || normalized.includes('customer')) return '⭐';
    if (normalized.includes('account') || normalized.includes('profile')) return '👤';
    return '🔔';
  }

  function positionNotificationDropdown(dropdown, bell) {
    if (!dropdown || !bell) return;

    const rect = bell.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    const top = Math.min(rect.bottom + 8, window.innerHeight - 24);

    dropdown.style.left = `${left}px`;
    dropdown.style.top = `${top}px`;
    dropdown.style.width = `${width}px`;
  }

  function removeLegacyNotificationPopups(bell) {
    if (!bell) return;

    const scope = bell.parentElement || document.body;
    const candidates = Array.from(scope.querySelectorAll('div, a, button'));

    candidates.forEach((element) => {
      if (element === bell || element === scope) return;

      const text = String(element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const className = String(element.className || '');
      const looksLikeLegacyPopup = className.includes('absolute') || className.includes('top-full') || className.includes('dropdown-hidden');

      if (looksLikeLegacyPopup && text.includes('notifications')) {
        element.remove();
      }
    });
  }

  function closeNotificationDropdown() {
    const dropdown = document.getElementById('sellerNotificationDropdown');
    if (dropdown) {
      dropdown.classList.add('hidden');
    }
  }

  function closeProfileDropdownMenu() {
    const resolved = resolveProfileDropdownElements();
    const menu = resolved?.menu;
    if (!menu) return;

    menu.classList.remove('profile-menu-open');
    menu.classList.remove('dropdown-visible');
    menu.classList.add('dropdown-hidden');
    menu.style.opacity = '';
    menu.style.pointerEvents = '';
    menu.style.transform = '';
  }

  function ensureNotificationUi() {
    const bell = document.getElementById('notifBell');
    if (!bell) return null;

    if (bell.dataset.sellerNotificationBound === 'true') {
      return {
        dropdown: document.getElementById('sellerNotificationDropdown'),
        previewList: document.getElementById('sellerNotificationPreviewList'),
        modal: document.getElementById('sellerFullNotificationsModal')
      };
    }

    bell.dataset.sellerNotificationBound = 'true';
    removeLegacyNotificationPopups(bell);

    const wrapper = bell.parentElement;
    if (wrapper) {
      wrapper.classList.add('relative');
    }

    let dropdown = document.getElementById('sellerNotificationDropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'sellerNotificationDropdown';
      dropdown.className = 'fixed hidden rounded-xl border border-gray-100 bg-white p-0 shadow-lg z-[3000]';
      dropdown.innerHTML = `
        <div class="border-b border-gray-100 px-4 py-3">
          <p class="text-xs font-bold uppercase tracking-widest text-gray-600">Notifications</p>
        </div>
        <div id="sellerNotificationPreviewList" class="max-h-80 overflow-y-auto"></div>
        <div class="border-t border-gray-100 px-4 py-2 text-center">
          <button id="sellerNotificationViewAll" type="button" class="text-xs font-bold uppercase tracking-widest text-gray-600 hover:text-black">View All</button>
        </div>
      `;
      (wrapper || document.body).appendChild(dropdown);
    }

    let modal = document.getElementById('sellerFullNotificationsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'sellerFullNotificationsModal';
      modal.className = 'fixed inset-0 z-[4000] hidden items-center justify-center bg-black/50 px-4';
      modal.innerHTML = `
        <div class="w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[85vh] overflow-hidden">
          <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h3 class="text-lg font-bold text-gray-900">All Notifications</h3>
              <p class="text-sm text-gray-500">Recent seller updates and alerts.</p>
            </div>
            <button id="sellerCloseFullNotificationsModal" type="button" class="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Close notifications">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="max-h-[70vh] overflow-y-auto p-4">
            <div id="sellerFullNotificationsList" class="space-y-3"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const previewList = dropdown.querySelector('#sellerNotificationPreviewList') || document.getElementById('sellerNotificationPreviewList');
    const viewAllButton = document.getElementById('sellerNotificationViewAll');
    const closeButton = document.getElementById('sellerCloseFullNotificationsModal');

    bell.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeProfileDropdownMenu();
      if (dropdown) {
        dropdown.classList.toggle('hidden');
        if (!dropdown.classList.contains('hidden')) {
          positionNotificationDropdown(dropdown, bell);
        }
      }
    });

    if (viewAllButton) {
      viewAllButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (dropdown) dropdown.classList.add('hidden');
        if (modal) {
          renderSellerNotificationsModal();
          modal.classList.remove('hidden');
          modal.classList.add('flex');
          document.body.style.overflow = 'hidden';
        }
      });
    }

    if (closeButton && modal) {
      closeButton.addEventListener('click', () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
      });
    }

    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          modal.classList.add('hidden');
          modal.classList.remove('flex');
          document.body.style.overflow = '';
        }
      });
    }

    document.addEventListener('click', (event) => {
      if (!dropdown) return;
      const clickedInside = dropdown.contains(event.target) || bell.contains(event.target);
      if (!clickedInside) {
        dropdown.classList.add('hidden');
      }
    });

    window.addEventListener('resize', () => {
      if (dropdown && !dropdown.classList.contains('hidden')) {
        positionNotificationDropdown(dropdown, bell);
      }
    });

    return { dropdown, previewList, modal };
  }

  function renderSellerNotificationsPreview(previewList) {
    if (!previewList) return;

    const previewNotifications = sellerNotifications.slice(0, 3);
    previewList.innerHTML = '';

    if (!previewNotifications.length) {
      previewList.innerHTML = '<div class="px-4 py-3 text-sm text-gray-500">No notifications yet.</div>';
      return;
    }

    previewNotifications.forEach((notification) => {
      const item = document.createElement('div');
      item.className = 'cursor-pointer border-b border-gray-50 px-4 py-3 hover:bg-gray-50';
      item.innerHTML = `
        <div class="flex items-start gap-2">
          <span class="mt-0.5 text-base">${getNotificationIcon(notification.type)}</span>
          <div class="min-w-0">
            <p class="text-xs font-bold text-gray-900">${notification.title}</p>
            <p class="text-xs text-gray-500 mt-1">${notification.text}</p>
          </div>
        </div>
      `;
      previewList.appendChild(item);
    });
  }

  function renderSellerNotificationsModal() {
    const list = document.getElementById('sellerFullNotificationsList');
    if (!list) return;

    if (!sellerNotifications.length) {
      list.innerHTML = '<div class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">No notifications available right now.</div>';
      return;
    }

    list.innerHTML = sellerNotifications.map((notification) => `
      <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg shadow-sm">${getNotificationIcon(notification.type)}</div>
          <div>
            <p class="text-sm font-semibold text-gray-900">${notification.title}</p>
            <p class="mt-1 text-sm text-gray-600">${notification.text}</p>
            <p class="mt-2 text-xs font-medium uppercase tracking-widest text-gray-400">${notification.time || 'Recently'}</p>
          </div>
        </div>
      </div>
    `).join('');
  }

  async function loadSellerNotifications() {
    const bell = document.getElementById('notifBell');
    if (!bell) return;

    const ui = ensureNotificationUi();
    const previewList = ui?.previewList;

    try {
      const sellerId = resolveSellerId(readAuthUser() || {});
      const token = localStorage.getItem('lumina.auth.token') || sessionStorage.getItem('lumina.auth.token') || '';
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(sellerId ? { 'x-seller-id': sellerId } : {})
      };

      const response = await fetch(`${API_BASE}/dashboard/notifications?sellerId=` + encodeURIComponent(sellerId || ''), {
        method: 'GET',
        credentials: 'include',
        headers
      });

      const payload = await response.json().catch(() => ({}));
      const list = Array.isArray(payload?.data?.notifications) ? payload.data.notifications : Array.isArray(payload?.notifications) ? payload.notifications : [];
      sellerNotifications = list;
      renderSellerNotificationsPreview(previewList);
    } catch (_) {
      sellerNotifications = [];
      renderSellerNotificationsPreview(previewList);
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

  async function performSellerLogout(event) {
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

    const token = localStorage.getItem('lumina.auth.token') || sessionStorage.getItem('lumina.auth.token') || '';
    const headers = { 'Content-Type': 'application/json' };

    if (token) {
      headers['x-session-token'] = token;
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      await fetch(`${window.location.origin}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers
      });
    } catch (error) {
      console.warn('Seller logout request failed:', error);
    } finally {
      clearSellerAuthState();
      document.cookie = 'lumina_session=; Path=/; Max-Age=0; SameSite=Lax';
      window.location.replace('/login_register.html');
    }

    return true;
  }

  function formatStatusText(value) {
    const normalized = normalizeVerificationStatus(value);
    if (!normalized) return 'Not available';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function initializeSellerNotifications() {
    ensureNotificationUi();
    loadSellerNotifications();
  }

  async function fetchVerificationSummary() {
    const sellerId = resolveSellerId();
    const token = localStorage.getItem('lumina.auth.token') || sessionStorage.getItem('lumina.auth.token') || '';
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache'
    };

    if (sellerId) headers['x-seller-id'] = sellerId;
    if (token) {
      headers['x-session-token'] = token;
      headers.Authorization = `Bearer ${token}`;
    }

    const [verificationResponse, bankResponse] = await Promise.all([
      fetch(`${API_BASE}/settings/verification`, {
        method: 'GET',
        credentials: 'include',
        headers
      }),
      fetch(`${API_BASE}/settings/payment/bank-account`, {
        method: 'GET',
        credentials: 'include',
        headers
      })
    ]);

    const verificationPayload = verificationResponse.ok ? await verificationResponse.json().catch(() => null) : null;
    const bankPayload = bankResponse.ok ? await bankResponse.json().catch(() => null) : null;

    const verificationData = verificationPayload?.data || verificationPayload || {};
    const bankData = bankPayload?.data || bankPayload || {};

    return {
      kycStatus: formatStatusText(verificationData?.status || verificationData?.verificationStatus || verificationData?.kycStatus || 'not_submitted'),
      bankStatus: formatStatusText(bankData?.verificationStatus || bankData?.status || 'pending')
    };
  }

  function showVerificationDetailsPopup() {
    const existing = document.getElementById('seller-verification-popup');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'seller-verification-popup';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15, 23, 42, 0.6)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '20px';
    overlay.style.zIndex = '99999';

    const dialog = document.createElement('div');
    dialog.style.width = 'min(420px, 100%)';
    dialog.style.background = 'white';
    dialog.style.borderRadius = '16px';
    dialog.style.boxShadow = '0 20px 60px rgba(0,0,0,0.25)';
    dialog.style.padding = '24px';

    dialog.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div>
          <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.2em; color:#64748b;">Seller Verification</div>
          <div style="font-size:20px; font-weight:700; color:#111827;">Verification Details</div>
        </div>
        <button type="button" id="seller-verification-close" style="border:none; background:#f3f4f6; color:#111827; width:36px; height:36px; border-radius:999px; cursor:pointer; font-size:18px;">×</button>
      </div>
      <div style="display:grid; gap:12px;">
        <div style="padding:14px 16px; border:1px solid #e5e7eb; border-radius:12px; background:#f8fafc;">
          <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; color:#64748b; margin-bottom:4px;">KYC</div>
          <div id="seller-verification-kyc" style="font-size:16px; font-weight:600; color:#111827;">Loading...</div>
        </div>
        <div style="padding:14px 16px; border:1px solid #e5e7eb; border-radius:12px; background:#f8fafc;">
          <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; color:#64748b; margin-bottom:4px;">Bank Account</div>
          <div id="seller-verification-bank" style="font-size:16px; font-weight:600; color:#111827;">Loading...</div>
        </div>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const closeButton = document.getElementById('seller-verification-close');
    const close = () => overlay.remove();

    closeButton?.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    fetchVerificationSummary().then((summary) => {
      const kycElement = document.getElementById('seller-verification-kyc');
      const bankElement = document.getElementById('seller-verification-bank');
      if (kycElement) kycElement.textContent = `Status: ${summary.kycStatus}`;
      if (bankElement) bankElement.textContent = `Status: ${summary.bankStatus}`;
    }).catch(() => {
      const kycElement = document.getElementById('seller-verification-kyc');
      const bankElement = document.getElementById('seller-verification-bank');
      if (kycElement) kycElement.textContent = 'Status: unavailable';
      if (bankElement) bankElement.textContent = 'Status: unavailable';
    });
  }

  function updateSellerProfileDropdownLinks() {
    const resolved = resolveProfileDropdownElements();
    const menu = resolved?.menu;
    if (!menu) return;

    const items = Array.from(menu.querySelectorAll('a'));

    items.forEach((item) => {
      const label = String(item.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const href = item.getAttribute('href') || '';

      if (label === 'my profile' || label === 'profile') {
        item.setAttribute('href', 'Settings.html?tab=profile');
        item.setAttribute('data-lumina-profile-link', 'profile');
      } else if (label === 'store settings' || label === 'store') {
        item.setAttribute('href', 'Settings.html?tab=store');
        item.setAttribute('data-lumina-profile-link', 'store');
      } else if (label === 'verification details' || label === 'kyc') {
        item.setAttribute('href', '#');
        item.setAttribute('data-lumina-profile-link', 'verification');
        item.setAttribute('data-lumina-verification-popup', '1');
      } else if (href === '#') {
        item.setAttribute('data-lumina-profile-link', 'default');
      }
    });
  }

  function bindProfileDropdownBehavior() {
    const resolved = resolveProfileDropdownElements();
    const toggle = resolved?.toggle;
    const menu = resolved?.menu;
    const wrap = resolved?.wrap;

    if (!toggle || !menu) return;
    if (typeof window.closeProfileDropdown === 'function') return;
    if (toggle.dataset.profileBehaviorBound === 'true') return;

    toggle.dataset.profileBehaviorBound = 'true';

    const closeMenu = () => {
      menu.classList.remove('profile-menu-open');
      menu.classList.remove('dropdown-visible');
      menu.classList.add('dropdown-hidden');
      menu.style.opacity = '';
      menu.style.pointerEvents = '';
      menu.style.transform = '';
    };

    const openMenu = () => {
      menu.classList.remove('dropdown-hidden');
      menu.classList.add('profile-menu-open');
      menu.classList.add('dropdown-visible');
      menu.style.opacity = '1';
      menu.style.pointerEvents = 'auto';
      menu.style.transform = 'scale(1)';
    };

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeNotificationDropdown();
      if (menu.classList.contains('profile-menu-open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    menu.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.addEventListener('click', (event) => {
      if (wrap && wrap.contains(event.target)) return;
      closeMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    });
  }

  function bindVerificationPopupTrigger() {
    const bindItem = (item) => {
      if (!item || item.dataset.verificationBound === 'true') return;
      item.dataset.verificationBound = 'true';
      item.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        showVerificationDetailsPopup();
      });
    };

    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-lumina-verification-popup="1"]');
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      showVerificationDetailsPopup();
    });

    document.querySelectorAll('[data-lumina-verification-popup="1"]').forEach(bindItem);
  }

  function ensureProfileDropdownLinks() {
    const resolved = resolveProfileDropdownElements();
    const menu = resolved?.menu;
    if (!menu) return;

    const items = Array.from(menu.querySelectorAll('a'));
    items.forEach((item) => {
      const label = String(item.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (label === 'my profile' || label === 'profile') {
        item.setAttribute('href', 'Settings.html?tab=profile');
      } else if (label === 'store settings' || label === 'store') {
        item.setAttribute('href', 'Settings.html?tab=store');
      } else if (label === 'verification details' || label === 'kyc') {
        item.setAttribute('href', '#');
        item.setAttribute('data-lumina-verification-popup', '1');
      }
    });
  }

  function injectSidebarLogoutButton() {
    const sidebars = Array.from(document.querySelectorAll('aside nav'));

    sidebars.forEach((nav) => {
      const alreadyHasLogout = Array.from(nav.querySelectorAll('button, a')).some((element) => {
        const label = String(element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return element.getAttribute('data-lumina-sidebar-logout') === '1' || label === 'logout' || label === 'log out';
      });

      if (alreadyHasLogout) return;

      const divider = document.createElement('div');
      divider.className = 'h-px bg-gray-100 my-4';

      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-lumina-sidebar-logout', '1');
      button.className = 'w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 rounded-lg hover:bg-red-50 transition-all text-left';
      button.innerHTML = '<i data-lucide="log-out" class="w-4 h-4"></i><span>Logout</span>';
      button.addEventListener('click', performSellerLogout);

      nav.appendChild(divider);
      nav.appendChild(button);
    });
  }

  function bindSellerLogoutTriggers() {
    const candidates = Array.from(document.querySelectorAll('a, button'));
    candidates.forEach((element) => {
      const label = String(element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isLogoutTrigger = element.getAttribute('data-lumina-logout') === '1'
        || element.classList.contains('lumina-logout')
        || element.getAttribute('data-lumina-sidebar-logout') === '1'
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
    updateSellerProfileDropdownLinks();
    ensureProfileDropdownLinks();
    bindProfileDropdownBehavior();
    bindVerificationPopupTrigger();
    injectSidebarLogoutButton();
    bindSellerLogoutTriggers();

    const state = getSellerState();
    updateProfileHeader(state);
    updateVerificationPanel(state);
    updateAddProductButtons(state);

    initializeSellerNotifications();

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
