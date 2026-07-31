(function () {
  const API_BASE_URL = window.API_BASE_URL || window.ADMIN_API_BASE_URL || `${window.location.origin}/api`;
  let notifications = [];

  function getAdminAuthToken() {
    return localStorage.getItem('lumina.admin.authToken') || localStorage.getItem('lumina.auth.token') || '';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function formatNotificationTime(value) {
    if (!value) return '';
    const time = new Date(value);
    if (Number.isNaN(time.getTime())) return value;
    return time.toLocaleString();
  }

  async function fetchNotifications() {
    try {
      const token = getAdminAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}`, 'x-session-token': token } : {};
      const res = await fetch(`${API_BASE_URL}/admin/dashboard/notifications`, { headers });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const result = await res.json();
      notifications = Array.isArray(result?.data) ? result.data : [];
    } catch (_) {
      notifications = [];
    }
    renderNotifications();
  }

  function renderNotifications() {
    const container = document.getElementById('notificationList');
    const modalBody = document.getElementById('notificationsModalBody');
    const countLabel = document.getElementById('notificationCount');
    const dot = document.getElementById('notificationDot');

    const list = Array.isArray(notifications) ? notifications : [];

    if (container) {
      if (!list.length) {
        container.innerHTML = '<div class="px-4 py-4 text-sm text-gray-500">No notifications right now.</div>';
      } else {
        container.innerHTML = list.slice(0, 4).map((item) => {
          const unread = item.unread ?? !item.read;
          const title = escapeHtml(item.title || 'Notification');
          const message = escapeHtml(item.message || item.body || 'No details available.');
          const time = escapeHtml(formatNotificationTime(item.createdAt || item.created_at || item.time));
          return `
            <div class="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${unread ? 'bg-blue-50/60' : ''}">
              <p class="text-xs font-bold text-gray-900">${title}</p>
              <p class="text-xs text-gray-500 mt-1">${message}</p>
              <p class="text-[11px] text-gray-400 mt-2">${time}</p>
            </div>
          `;
        }).join('');
      }
    }

    if (modalBody) {
      if (!list.length) {
        modalBody.innerHTML = '<div class="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">No notifications right now.</div>';
      } else {
        modalBody.innerHTML = list.map((item) => {
          const unread = item.unread ?? !item.read;
          const title = escapeHtml(item.title || 'Notification');
          const message = escapeHtml(item.message || item.body || 'No details available.');
          const time = escapeHtml(formatNotificationTime(item.createdAt || item.created_at || item.time));
          return `
            <div class="rounded-xl border border-gray-100 p-4 mb-3 ${unread ? 'bg-blue-50/60' : 'bg-white'}">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-gray-900">${title}</p>
                  <p class="text-sm text-gray-600 mt-1">${message}</p>
                </div>
                <span class="text-[11px] text-gray-400 whitespace-nowrap">${time}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    const unreadCount = list.filter((item) => item.unread ?? !item.read).length;
    if (countLabel) {
      countLabel.textContent = unreadCount ? `${unreadCount} new` : '0 new';
    }
    if (dot) {
      dot.classList.toggle('hidden', unreadCount === 0);
    }
  }

  function openNotificationsModal() {
    const modal = document.getElementById('notificationsModal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      document.body.style.overflow = 'hidden';
      renderNotifications();
    }
  }

  function closeNotificationsModal() {
    const modal = document.getElementById('notificationsModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      document.body.style.overflow = '';
    }
  }

  function isBellButton(button) {
    if (!button || button.dataset.notificationsUiBound === 'true') return false;
    if (button.id === 'bellButton' || button.id === 'notifBell') return true;
    const label = (button.getAttribute('aria-label') || button.innerText || '').toLowerCase();
    if (label.includes('notification')) return true;
    if (button.querySelector('span.material-symbols-rounded')?.textContent?.toLowerCase().includes('notifications')) return true;
    if (button.querySelector('i[data-lucide="bell"], i[data-lucide="bell-ring"]')) return true;
    return false;
  }

  function ensureNotificationUi() {
    const bellButton = Array.from(document.querySelectorAll('button')).find(isBellButton);
    if (!bellButton) return;
    if (bellButton.dataset.notificationsUiBound === 'true') return;
    bellButton.dataset.notificationsUiBound = 'true';

    let wrapper = bellButton.parentElement;
    if (!wrapper || !wrapper.classList.contains('relative')) {
      wrapper = document.createElement('div');
      wrapper.className = 'relative group';
      bellButton.parentNode.insertBefore(wrapper, bellButton);
      wrapper.appendChild(bellButton);
    } else {
      wrapper.classList.add('relative', 'group');
    }

    const existingDropdown =
      wrapper.querySelector('.notification-dropdown') ||
      Array.from(wrapper.querySelectorAll('div')).find((node) =>
        node !== bellButton &&
        node !== wrapper &&
        node.querySelector('#notificationList') &&
        (node.querySelector('#notificationCount') || node.querySelector('#viewAllNotifications'))
      ) ||
      wrapper.querySelector('[id="notificationList"]')?.closest('div') ||
      wrapper.querySelector('[id="notificationCount"]')?.closest('div') ||
      wrapper.querySelector('[id="viewAllNotifications"]')?.closest('div');
    const dropdown = existingDropdown || document.createElement('div');
    dropdown.className = 'notification-dropdown dropdown-hidden absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 p-0 z-50 opacity-0 transform scale-95 transition-all pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto';
    dropdown.classList.remove('hidden');
    dropdown.style.display = '';

    if (!dropdown.querySelector('#notificationList') || !dropdown.querySelector('#notificationCount') || !dropdown.querySelector('#viewAllNotifications')) {
      dropdown.innerHTML = `
        <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p class="text-xs font-bold uppercase tracking-widest text-gray-600">Admin alerts</p>
          <span id="notificationCount" class="text-[11px] font-semibold text-gray-500">0 new</span>
        </div>
        <div id="notificationList" class="max-h-80 overflow-y-auto"></div>
        <div class="px-4 py-2 border-t border-gray-100 text-center">
          <button id="viewAllNotifications" type="button" class="text-xs font-bold text-gray-600 hover:text-black uppercase tracking-widest">View All</button>
        </div>
      `;
    }

    if (!existingDropdown) {
      wrapper.appendChild(dropdown);
    }

    let modal = document.getElementById('notificationsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'notificationsModal';
      modal.className = 'fixed inset-0 bg-black/50 hidden items-center justify-center z-[200] p-4';
      modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h3 class="text-lg font-semibold text-gray-900">All notifications</h3>
              <p class="text-sm text-gray-500">Recent admin activity and important alerts</p>
            </div>
            <button id="closeNotificationsModal" type="button" class="p-2 rounded-lg hover:bg-gray-100">
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>
          <div id="notificationsModalBody" class="p-5 overflow-y-auto max-h-[60vh]"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    if (!bellButton.querySelector('i[data-lucide="bell"')) {
      bellButton.innerHTML = '<i data-lucide="bell" class="w-5 h-5 text-gray-700"></i><span id="notificationDot" class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>';
    }
    if (!bellButton.querySelector('#notificationDot')) {
      bellButton.insertAdjacentHTML('beforeend', '<span id="notificationDot" class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>');
    }
    bellButton.className = 'relative p-2 hover:bg-gray-100 rounded-lg transition-colors';
    bellButton.type = 'button';
    bellButton.setAttribute('aria-label', 'Notifications');
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }

    bellButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openNotificationsModal();
    });

    dropdown.querySelector('#viewAllNotifications')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openNotificationsModal();
    });

    document.getElementById('closeNotificationsModal')?.addEventListener('click', closeNotificationsModal);
    modal.addEventListener('click', (event) => {
      if (event.target.id === 'notificationsModal') {
        closeNotificationsModal();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeNotificationsModal();
      }
    });

    window.openNotificationsModal = openNotificationsModal;
    window.closeNotificationsModal = closeNotificationsModal;
    window.loadNotifications = fetchNotifications;

    renderNotifications();
    fetchNotifications();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureNotificationUi);
  } else {
    ensureNotificationUi();
  }
})();
