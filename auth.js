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
        'security_settings.html': true,
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

    function getStoredUser() {
        var user = parseJson(localStorage.getItem('lumina.auth.user')) ||
            parseJson(localStorage.getItem('lumina.customer.session')) ||
            parseJson(localStorage.getItem('lumina.seller.session')) ||
            parseJson(sessionStorage.getItem('lumina.auth.user'));
        return user || null;
    }

    function getToken() {
        return localStorage.getItem('lumina.auth.token') || sessionStorage.getItem('lumina.auth.token') || '';
    }

    function isLoggedIn() {
        var user = getStoredUser();
        var token = getToken();
        var flag = localStorage.getItem('lumina.isLoggedIn') === 'true' || sessionStorage.getItem('lumina.isLoggedIn') === 'true';
        return Boolean(user || token || flag);
    }

    function getRole() {
        var user = getStoredUser();
        var role = (user && user.role) || localStorage.getItem('lumina.auth.role') || sessionStorage.getItem('lumina.auth.role') || 'customer';
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
        localStorage.setItem('lumina.auth.user', JSON.stringify(user));
        localStorage.setItem('lumina.customer.session', JSON.stringify(user));
        localStorage.setItem('lumina.auth.role', String(user.role || 'customer'));
        localStorage.setItem('lumina.isLoggedIn', 'true');
        if (authData.token) {
            localStorage.setItem('lumina.auth.token', authData.token);
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
            'security_settings.html': true,
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
        if (!enforceAccess()) return;
        applyHeaderState();
        guardProtectedLinks();
        bindLogoutTriggers();
        observeAccountMenuContent();
        setTimeout(function () {
            applyHeaderState();
            ensureDropdownLogoutButton();
        }, 0);
    }

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