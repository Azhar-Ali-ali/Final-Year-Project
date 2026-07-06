(function () {
    'use strict';

    function enforce() {
        if (window.LuminaAuth && typeof window.LuminaAuth.enforceAccess === 'function') {
            window.LuminaAuth.enforceAccess();
        }
    }

    window.LuminaPageAccess = {
        enforce: enforce
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enforce);
    } else {
        enforce();
    }
})();