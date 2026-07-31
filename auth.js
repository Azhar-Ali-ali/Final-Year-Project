(function () {
    'use strict';

    var PUBLIC_PAGES = {
        'homepage.html': true,
        'all_product_spages.html': true,
        'products_details.html': true,
        'login_register.html': true,
        'sellerprofile.html': true
    };

    var CUSTOMER_ONLY_PAGES = {
        'customer_dashboard.html': true,
        'cart.html': true,
        'checkout.html': true,
        'wishlist.html': true,
        'my_profile.html': true,
        'my_orders.html': true,
        'my_addresses.html': true,
        'my_messages.html': true,
        'help_support.html': true,
        'my_returns_refunds.html': true,
        'order_details.html': true,
        'return_request_details.html': true,
        'track_refund.html': true
    };

    function parseJson(value) {
        if (!value) return null;
        try {
            return JSON.parse(value);
        } catch (err) {
            return null;
        }
    }

    function getCookie(name) {
        if (!name) return '';
        var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : '';
    }

    function setCookie(name, value, maxAgeSeconds) {
        if (!name) return;
        var expires = '';
        if (maxAgeSeconds) {
            var date = new Date();
            date.setTime(date.getTime() + maxAgeSeconds * 1000);
            expires = '; expires=' + date.toUTCString();
        }
        var sameSite = (location.protocol === 'https:' && location.hostname !== 'localhost') ? 'None' : 'Lax';
        var secure = (sameSite === 'None') ? '; Secure' : '';
        document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/; SameSite=' + sameSite + secure;
    }

    function clearCookie(name) {
        if (!name) return;
        document.cookie = name + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }

    function getStoredUser() {
        var cookieUser = parseJson(getCookie('lumina.auth.user'));
        var user = cookieUser ||
            parseJson(localStorage.getItem('lumina.auth.user')) ||
            parseJson(localStorage.getItem('lumina.customer.session')) ||
            parseJson(localStorage.getItem('lumina.seller.session')) ||
            parseJson(sessionStorage.getItem('lumina.auth.user'));
        return user || null;
    }

    function getToken() {
        return getCookie('lumina.auth.token') || localStorage.getItem('lumina.auth.token') || sessionStorage.getItem('lumina.auth.token') || '';
    }

    function isLoggedIn() {
        var user = getStoredUser();
        var token = getToken();
        var flag = getCookie('lumina.isLoggedIn') === 'true' || localStorage.getItem('lumina.isLoggedIn') === 'true' || sessionStorage.getItem('lumina.isLoggedIn') === 'true';
        return Boolean(user || token || flag);
    }

    function getRole() {
        var user = getStoredUser();
        var role = (user && user.role) || getCookie('lumina.auth.role') || localStorage.getItem('lumina.auth.role') || sessionStorage.getItem('lumina.auth.role') || 'customer';
        return String(role).toLowerCase();
    }

    function getFirstName() {
        var user = getStoredUser();
        if (!user) return '';
        var raw = String(user.fullName || user.name || user.username || '').trim();
        if (!raw) return '';
        return raw.split(/\s+/)[0];
    }

    function currentFileName() {
        var parts = window.location.pathname.split('/');
        return String(parts[parts.length - 1] || '').toLowerCase();
    }

    function redirectToLogin() {
        var next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = '/customer-pages/login_register.html?next=' + next;
    }

    function canAccessCurrentPage() {
        var file = currentFileName();
        if (PUBLIC_PAGES[file]) {
            return true;
        }

        if (!isLoggedIn()) {
            return false;
        }

        if (CUSTOMER_ONLY_PAGES[file] && getRole() !== 'customer') {
            return false;
        }

        if (window.location.pathname.toLowerCase().indexOf('/seller/') !== -1 && getRole() !== 'seller') {
            return false;
        }

        return true;
    }

    function enforceAccess() {
        if (!canAccessCurrentPage()) {
            redirectToLogin();
            return false;
        }
        return true;
    }

    function saveSession(authData) {
        if (!authData || !authData.user) return;

        var user = authData.user;
        var role = String(user.role || 'customer').toLowerCase();
        var token = authData.token || '';
        localStorage.setItem('lumina.auth.user', JSON.stringify(user));
        localStorage.setItem('lumina.auth.role', role);
        localStorage.setItem('lumina.isLoggedIn', 'true');
        localStorage.setItem('lumina.customer.session', JSON.stringify(user));
        if (role === 'seller') {
            localStorage.setItem('lumina.seller.session', JSON.stringify(user));
        }
        if (token) {
            localStorage.setItem('lumina.auth.token', token);
        }

        setCookie('lumina.auth.user', JSON.stringify(user), 28800);
        setCookie('lumina.auth.role', role, 28800);
        setCookie('lumina.isLoggedIn', 'true', 28800);
        if (token) {
            setCookie('lumina.auth.token', token, 28800);
        }
    }

    function syncCookieSessionToStorage() {
        var cookieUser = parseJson(getCookie('lumina.auth.user'));
        var cookieToken = getCookie('lumina.auth.token');
        var cookieRole = getCookie('lumina.auth.role');
        var cookieLoggedIn = getCookie('lumina.isLoggedIn') === 'true';

        if (cookieUser) {
            if (!localStorage.getItem('lumina.auth.user')) {
                localStorage.setItem('lumina.auth.user', JSON.stringify(cookieUser));
            }
            if (!localStorage.getItem('lumina.customer.session')) {
                localStorage.setItem('lumina.customer.session', JSON.stringify(cookieUser));
            }
        }

        if (cookieToken && !localStorage.getItem('lumina.auth.token')) {
            localStorage.setItem('lumina.auth.token', cookieToken);
        }

        if (cookieRole && !localStorage.getItem('lumina.auth.role')) {
            localStorage.setItem('lumina.auth.role', cookieRole);
        }

        if (cookieLoggedIn && !localStorage.getItem('lumina.isLoggedIn')) {
            localStorage.setItem('lumina.isLoggedIn', 'true');
        }
    }

    function logout() {
        localStorage.removeItem('lumina.auth.user');
        localStorage.removeItem('lumina.customer.session');
        localStorage.removeItem('lumina.seller.session');
        localStorage.removeItem('lumina.auth.token');
        localStorage.removeItem('lumina.auth.role');
        localStorage.removeItem('lumina.isLoggedIn');

        sessionStorage.removeItem('lumina.auth.user');
        sessionStorage.removeItem('lumina.auth.token');
        sessionStorage.removeItem('lumina.auth.role');
        sessionStorage.removeItem('lumina.isLoggedIn');

        clearCookie('lumina.auth.user');
        clearCookie('lumina.auth.token');
        clearCookie('lumina.auth.role');
        clearCookie('lumina.isLoggedIn');
        // also attempt to clear server session cookie
        document.cookie = 'lumina_session=; Path=/; Max-Age=0; SameSite=Lax';

        window.location.href = '/customer-pages/homepage.html';
    }

    function bindLogoutTriggers() {
        document.addEventListener('click', function (event) {
            var target = event.target;
            if (!target) return;

            var trigger = target.closest('[data-lumina-logout], .lumina-logout');
            if (!trigger) return;

            event.preventDefault();
            logout();
        });
    }

    function ensureDropdownLogoutButton() {
        var content = document.getElementById('accountMenuContent');
        if (!content || !isLoggedIn()) return;

        if (content.querySelector('.lumina-logout-row')) {
            return;
        }

        var wrapper = document.createElement('div');
        wrapper.className = 'lumina-logout-row px-4 py-3 border-t border-gray-200 text-center';
        wrapper.innerHTML = '<button type="button" data-lumina-logout="1" class="w-full bg-red-50 hover:bg-red-100 text-red-700 font-semibold py-2 px-4 rounded-lg transition-colors text-sm">Logout</button>';
        content.appendChild(wrapper);
    }

    function observeAccountMenuContent() {
        var content = document.getElementById('accountMenuContent');
        if (!content) return;

        ensureDropdownLogoutButton();

        var observer = new MutationObserver(function () {
            ensureDropdownLogoutButton();
            applyHeaderState();
        });

        observer.observe(content, { childList: true, subtree: true });
    }

    function applyHeaderState() {
        var loggedIn = isLoggedIn();
        var firstName = getFirstName();

        var accountLabel = document.getElementById('accountMenuLabel');
        if (accountLabel) {
            accountLabel.textContent = loggedIn ? (firstName || 'Account') : 'Login';
        }

        var headerAuthLabel = document.getElementById('headerAuthLabel');
        var headerAuthLink = document.getElementById('headerAuthLink');
        if (headerAuthLabel) {
            headerAuthLabel.textContent = loggedIn ? (firstName || 'Account') : 'Login';
        }
        if (headerAuthLink) {
            headerAuthLink.setAttribute('href', loggedIn ? 'Customer_Dashboard.html' : 'login_register.html');
        }
    }

    function guardProtectedLinks() {
        if (isLoggedIn()) return;

        var protectedPages = {
            'customer_dashboard.html': true,
            'cart.html': true,
            'wishlist.html': true,
            'checkout.html': true,
            'my_profile.html': true,
            'my_orders.html': true,
            'my_addresses.html': true,
            'my_messages.html': true,
            'help_support.html': true,
            'my_returns_refunds.html': true,
            'order_details.html': true,
            'return_request_details.html': true,
            'track_refund.html': true
        };

        var links = document.querySelectorAll('a[href]');
        for (var i = 0; i < links.length; i += 1) {
            var link = links[i];
            var rawHref = link.getAttribute('href') || '';
            if (!rawHref || rawHref.indexOf('#') === 0 || rawHref.indexOf('javascript:') === 0) continue;

            var baseHref = rawHref.split('?')[0].toLowerCase();
            var file = baseHref.split('/').pop();
            if (!protectedPages[file]) continue;

            link.addEventListener('click', function (event) {
                event.preventDefault();
                redirectToLogin();
            });
        }
    }

    function init() {
        syncCookieSessionToStorage();
        if (!enforceAccess()) return;
        applyHeaderState();
        guardProtectedLinks();
        bindLogoutTriggers();
        observeAccountMenuContent();
        setTimeout(function () {
            syncCookieSessionToStorage();
            applyHeaderState();
            ensureDropdownLogoutButton();
        }, 0);
    }

    // Global fetch wrapper: default to including credentials for same-origin requests.
    (function () {
        if (typeof window.fetch !== 'function') return;
        var _origFetch = window.fetch.bind(window);
        window.fetch = function (input, init) {
            try {
                var url = '';
                var isRequestObj = false;
                if (typeof input === 'string') {
                    url = input;
                } else if (input && input.url) {
                    url = input.url;
                    isRequestObj = (input.constructor && input.constructor.name === 'Request');
                }

                var include = false;
                if (!url || url.charAt(0) === '/' || url.indexOf(window.location.origin) === 0) {
                    include = true;
                } else {
                    try {
                        include = (new URL(url)).origin === window.location.origin;
                    } catch (e) {
                        include = false;
                    }
                }

                init = init || {};

                if (include && typeof init.credentials === 'undefined') {
                    // If input is a Request object, create a new Request preserving properties.
                    if (isRequestObj && typeof Request === 'function') {
                        var req = input;
                        var newReq = new Request(req, { credentials: 'include' });
                        return _origFetch(newReq, init);
                    }
                    init.credentials = 'include';
                }

                return _origFetch(input, init);
            } catch (e) {
                return _origFetch(input, init);
            }
        };
    })();

    window.LuminaAuth = {
        isLoggedIn: isLoggedIn,
        getRole: getRole,
        getStoredUser: getStoredUser,
        getToken: getToken,
        saveSession: saveSession,
        enforceAccess: enforceAccess,
        applyHeaderState: applyHeaderState,
        guardProtectedLinks: guardProtectedLinks,
        ensureDropdownLogoutButton: ensureDropdownLogoutButton,
        logout: logout,
        init: init
    };

    window.logout = logout;
    window.handleLogout = logout;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();