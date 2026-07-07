const API_BASE = 'http://localhost:5000/api/seller/messages';
const SOCKET_URL = 'http://localhost:5000';

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
let socket = null;
let connectedThreadId = null;

async function apiRequest(path, options = {}) {
  const url = new URL(`${API_BASE}${path}`);
  if (sellerId && !url.searchParams.has('sellerId')) {
    url.searchParams.set('sellerId', sellerId);
  }

  const response = await fetch(url.toString(), {
    method: options.method || 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(sellerId ? { 'x-seller-id': sellerId } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload;
}

function resolveAuthState() {
  const state = { isLoggedIn: false, fullName: '' };

  try {
    const rawUser = localStorage.getItem('lumina.auth.user') || localStorage.getItem('lumina.customer.session');
    const isLoggedIn = localStorage.getItem('lumina.isLoggedIn') === 'true';

    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      const name = String(parsed.fullName || parsed.name || '').trim();
      state.isLoggedIn = Boolean(name) || isLoggedIn;
      state.fullName = name;
    } else {
      state.isLoggedIn = isLoggedIn;
    }
  } catch (_) {
    state.isLoggedIn = localStorage.getItem('lumina.isLoggedIn') === 'true';
  }

  return state;
}

function renderAccountFlyout() {
  const auth = resolveAuthState();
  const content = document.getElementById('accountMenuContent');
  const label = document.getElementById('accountMenuLabel');
  if (!content || !label) return;

  if (!auth.isLoggedIn) {
    label.textContent = 'Account';
    content.innerHTML = `
      <div class="px-4 py-3 border-b border-gray-200 text-center">
        <a href="login_register.html" class="signin-btn">Sign in</a>
        <p class="text-[10px] text-gray-500 mt-1">New customer? <a href="login_register.html" class="text-blue-600 hover:underline">Start here.</a></p>
      </div>
      <div class="grid grid-cols-2 gap-0">
        <div class="px-4 py-3 border-r border-gray-200">
          <h4 class="account-col-title">Your Lists</h4>
          <a href="wishlist.html" class="account-link">Create a List</a>
          <a href="login_register.html" class="account-link">Find a List or Registry</a>
        </div>
        <div class="px-4 py-3">
          <h4 class="account-col-title">Your Account</h4>
          <a href="login_register.html" class="account-link">Customer Dashboard</a>
          <a href="login_register.html" class="account-link">My Profile</a>
          <a href="login_register.html" class="account-link">My Orders</a>
          <a href="login_register.html" class="account-link">Cart</a>
          <a href="login_register.html" class="account-link">My Addresses</a>
          <a href="login_register.html" class="account-link">Messages</a>
          <a href="login_register.html" class="account-link">Returns & Refunds</a>
          <a href="login_register.html" class="account-link">Security Settings</a>
          <a href="login_register.html" class="account-link">Help & Support</a>
        </div>
      </div>
    `;
  } else {
    const firstName = auth.fullName ? auth.fullName.split(' ')[0] : 'Account';
    label.textContent = firstName;
    content.innerHTML = `
      <div class="px-4 py-3 border-b border-gray-200 text-center">
        <a href="Customer_Dashboard.html" class="signin-btn">Go to Dashboard</a>
        <p class="text-[10px] text-gray-500 mt-1">Signed in as ${auth.fullName || 'Customer'}</p>
      </div>
      <div class="grid grid-cols-2 gap-0">
        <div class="px-4 py-3 border-r border-gray-200">
          <h4 class="account-col-title">Your Lists</h4>
          <a href="wishlist.html" class="account-link">Wishlist</a>
          <a href="my_returns_refunds.html" class="account-link">Returns & Refunds</a>
          <a href="my_messages.html" class="account-link">Messages</a>
        </div>
        <div class="px-4 py-3">
          <h4 class="account-col-title">Your Account</h4>
          <a href="Customer_Dashboard.html" class="account-link">Customer Dashboard</a>
          <a href="my_profile.html" class="account-link">My Profile</a>
          <a href="my_orders.html" class="account-link">My Orders</a>
          <a href="cart.html" class="account-link">Cart</a>
          <a href="my_addresses.html" class="account-link">My Addresses</a>
          <a href="my_messages.html" class="account-link">Messages</a>
          <a href="my_returns_refunds.html" class="account-link">Returns & Refunds</a>
          <a href="security_settings.html" class="account-link">Security Settings</a>
          <a href="help_support.html" class="account-link">Help & Support</a>
        </div>
      </div>
    `;
  }
}

function avatarForName(name) {
  const encoded = encodeURIComponent(String(name || 'Seller').trim() || 'Seller');
  return `https://ui-avatars.com/api/?name=${encoded}&background=random&color=ffffff&size=80`;
}

function connectSocket() {
  if (!window.io || socket || !sellerId) return;

  socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    if (state.activeThreadId) {
      joinThread(state.activeThreadId);
    }
  });

  socket.on('message-received', (payload) => {
    if (!payload?.threadId) return;
    if (payload.senderId === sellerId && payload.sender === 'seller') return;

    const thread = state.threads.find((item) => item.id === payload.threadId);
    if (!thread) return;

    const incomingMessage = {
      id: payload.id,
      sender: payload.sender === 'seller' ? 'seller' : 'customer',
      text: payload.text || '',
      time: payload.createdAt || payload.time,
      createdAt: payload.createdAt || payload.time
    };

    if (state.activeThreadId === payload.threadId) {
      const exists = state.activeMessages.some((message) => message.text === incomingMessage.text && message.time === incomingMessage.time);
      if (!exists) {
        state.activeMessages.push(incomingMessage);
        renderChat();
      }
    }

    thread.lastMessage = payload.text || 'New message';
    if (state.activeThreadId !== payload.threadId) {
      thread.unreadCount = Number(thread.unreadCount || 0) + 1;
    }
    renderSellerList();
  });
}

function joinThread(threadId) {
  if (!socket || !threadId) return;
  if (connectedThreadId && connectedThreadId !== threadId) {
    socket.emit('leave-room', { threadId: connectedThreadId });
  }
  connectedThreadId = threadId;
  socket.emit('join-room', { threadId, userId: sellerId, role: 'seller' });
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const state = {
  threads: [],
  activeThreadId: null,
  activeMessages: []
};

const sellerList = document.getElementById('sellerList');
const chatHistory = document.getElementById('chatHistory');
const activeSellerAvatar = document.getElementById('activeSellerAvatar');
const activeSellerName = document.getElementById('activeSellerName');
const activeSellerContext = document.getElementById('activeSellerContext');
const totalUnreadBadge = document.getElementById('totalUnreadBadge');
const messageInput = document.getElementById('messageInput');
const chatForm = document.getElementById('chatForm');
const attachButton = document.getElementById('attachButton');

function getActiveThread() {
  return state.threads.find((thread) => thread.id === state.activeThreadId) || null;
}

function updateUnreadSummary() {
  if (!totalUnreadBadge) return;

  const totalUnread = state.threads.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0);
  totalUnreadBadge.textContent = totalUnread > 0 ? `${totalUnread} unread` : 'All caught up';
}

function renderEmptyState() {
  if (activeSellerAvatar) activeSellerAvatar.src = avatarForName('Lumina');
  if (activeSellerName) activeSellerName.textContent = 'No conversations yet';
  if (activeSellerContext) activeSellerContext.textContent = 'Messages will appear here when a customer starts a conversation.';
  if (chatHistory) {
    chatHistory.innerHTML = `
      <div class="h-full flex items-center justify-center text-center text-gray-500 px-6">
        <div>
          <div class="text-4xl mb-3">Inbox</div>
          <p class="font-semibold text-gray-700">No conversations yet</p>
          <p class="text-sm mt-1">Customer messages will appear here once they contact you.</p>
        </div>
      </div>
    `;
  }
}

function renderSellerList() {
  if (!sellerList) return;

  if (!state.threads.length) {
    sellerList.innerHTML = `
      <div class="p-4 text-center text-sm text-gray-500">
        No conversations found.
      </div>
    `;
    updateUnreadSummary();
    return;
  }

  sellerList.innerHTML = state.threads.map((thread) => {
    const isActive = thread.id === state.activeThreadId;
    const preview = thread.lastMessage || 'No messages yet';

    return `
      <button class="seller-item ${isActive ? 'active' : ''} w-full text-left p-3" onclick="openSeller('${thread.id}')">
        <div class="flex items-start gap-3">
          <img src="${thread.avatar || avatarForName(thread.name)}" alt="${thread.name}" class="w-11 h-11 rounded-xl object-cover border border-gray-200">
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-bold text-[#232f3e] truncate">${thread.name}</p>
              ${thread.unreadCount > 0 ? `<span class="badge-unread">${thread.unreadCount}</span>` : ''}
            </div>
            <p class="text-xs text-gray-500 truncate mt-1">${preview}</p>
          </div>
        </div>
      </button>
    `;
  }).join('');

  updateUnreadSummary();
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function renderChat() {
  const thread = getActiveThread();
  if (!thread) {
    renderEmptyState();
    return;
  }

  if (activeSellerAvatar) activeSellerAvatar.src = thread.avatar || avatarForName(thread.name);
  if (activeSellerName) activeSellerName.textContent = thread.name;
  if (activeSellerContext) activeSellerContext.textContent = thread.context || thread.lastMessage || 'Conversation';

  if (!chatHistory) return;

  if (!state.activeMessages.length) {
    chatHistory.innerHTML = `
      <div class="h-full flex items-center justify-center text-center text-gray-500 px-6">
        <div>
          <div class="text-4xl mb-3">Chat</div>
          <p class="font-semibold text-gray-700">No messages yet</p>
          <p class="text-sm mt-1">Start the conversation from the message box below.</p>
        </div>
      </div>
    `;
    return;
  }

  chatHistory.innerHTML = state.activeMessages.map((message) => `
    <div class="message-row ${message.sender === 'seller' ? 'sent' : 'received'}">
      <div class="message-bubble">
        <div>${message.text || ''}</div>
        <div class="message-time">${formatTime(message.time || message.createdAt)}</div>
      </div>
    </div>
  `).join('');

  chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function loadThreads(preserveActive = true) {
  try {
    const response = await apiRequest('/threads');
    state.threads = Array.isArray(response.data) ? response.data : [];

    if (!preserveActive || !state.threads.some((thread) => thread.id === state.activeThreadId)) {
      state.activeThreadId = state.threads[0]?.id || null;
    }

    renderSellerList();

    if (state.activeThreadId) {
      await loadMessages(state.activeThreadId, false);
    } else {
      state.activeMessages = [];
      renderChat();
    }
  } catch (error) {
    console.error('Failed to load conversations:', error);
    state.threads = [];
    state.activeThreadId = null;
    state.activeMessages = [];
    renderSellerList();
    renderEmptyState();
  }
}

async function loadMessages(threadId, renderAfter = true) {
  if (!threadId) return;

  try {
    const response = await apiRequest(`/threads/${encodeURIComponent(threadId)}/messages?limit=100`);
    state.activeMessages = Array.isArray(response.data) ? response.data : [];

    const activeThread = state.threads.find((thread) => thread.id === threadId);
    if (activeThread) {
      activeThread.unreadCount = 0;
    }

    if (renderAfter) {
      renderSellerList();
    }
    renderChat();

    await apiRequest(`/threads/${encodeURIComponent(threadId)}/read`, { method: 'PATCH' }).catch(() => {});
  } catch (error) {
    console.error('Failed to load conversation messages:', error);
    state.activeMessages = [];
    renderChat();
  }
}

window.openSeller = async function openSeller(threadId) {
  state.activeThreadId = threadId;
  const thread = getActiveThread();
  if (thread) {
    thread.unreadCount = 0;
  }
  renderSellerList();
  joinThread(threadId);
  await loadMessages(threadId);
};

async function sendMessage(event) {
  event.preventDefault();

  const thread = getActiveThread();
  const text = String(messageInput?.value || '').trim();
  if (!thread || !text) return;

  try {
    await apiRequest(`/threads/${encodeURIComponent(thread.id)}/messages`, {
      method: 'POST',
      body: { message: text }
    });

    if (socket) {
      socket.emit('send-message', { threadId: thread.id, userId: sellerId, role: 'seller', message: text });
    }

    if (messageInput) messageInput.value = '';
    await loadThreads(true);
  } catch (error) {
    alert(error.message || 'Failed to send message');
  }
}

function setupHandlers() {
  if (chatForm) {
    chatForm.addEventListener('submit', sendMessage);
  }

  if (attachButton) {
    attachButton.addEventListener('click', () => {
      alert('Attachment upload can be connected to backend storage in the next step.');
    });
  }
}

function bootstrap() {
  renderAccountFlyout();
  setupHandlers();
  connectSocket();
  loadThreads(false);

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

bootstrap();