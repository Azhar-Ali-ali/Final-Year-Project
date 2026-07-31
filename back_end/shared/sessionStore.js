const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const REMEMBER_ME_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_STORE_PATH = process.env.SESSION_STORE_PATH || path.join(__dirname, '..', 'storage', 'admin-sessions.json');

const sessions = new Map();

function nowMs() {
  return Date.now();
}

function ensureStoreDirectory() {
  const dir = path.dirname(SESSION_STORE_PATH);
  fs.mkdirSync(dir, { recursive: true });
}

function readPersistedSessions() {
  try {
    ensureStoreDirectory();
    if (!fs.existsSync(SESSION_STORE_PATH)) {
      return [];
    }

    const raw = fs.readFileSync(SESSION_STORE_PATH, 'utf8');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (_) {
    return [];
  }
}

function writePersistedSessions() {
  ensureStoreDirectory();
  const persisted = Array.from(sessions.entries()).map(([token, entry]) => ({
    token,
    user: entry.user,
    session: entry.session
  }));
  fs.writeFileSync(SESSION_STORE_PATH, JSON.stringify(persisted, null, 2));
}

function loadPersistedSessions() {
  const persisted = readPersistedSessions();
  persisted.forEach((entry) => {
    if (!entry?.token || !entry?.session) return;
    const expiry = new Date(entry.session.expiresAt).getTime();
    if (!Number.isFinite(expiry) || expiry <= nowMs()) return;

    sessions.set(entry.token, {
      user: entry.user,
      session: entry.session
    });
  });
}

function createToken() {
  return `lum_${crypto.randomBytes(20).toString('hex')}`;
}

function createSession(user, options = {}) {
  const rememberMe = Boolean(options.rememberMe);
  const token = createToken();
  const createdAt = new Date(nowMs());
  const expiresAt = new Date(nowMs() + (rememberMe ? REMEMBER_ME_TTL_MS : SESSION_TTL_MS));

  const session = {
    token,
    userId: user.id,
    role: String(user.role || '').toLowerCase(),
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  sessions.set(token, {
    user,
    session
  });
  writePersistedSessions();

  return {
    token,
    session
  };
}

function getActiveSession(token) {
  const key = String(token || '').trim();
  if (!key) return null;

  if (!sessions.has(key)) {
    loadPersistedSessions();
  }

  if (!sessions.has(key)) return null;

  const current = sessions.get(key);
  if (!current || !current.session) {
    sessions.delete(key);
    writePersistedSessions();
    return null;
  }

  const expiry = new Date(current.session.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= nowMs()) {
    sessions.delete(key);
    writePersistedSessions();
    return null;
  }

  return current;
}

function revokeSession(token) {
  const key = String(token || '').trim();
  if (!key) return false;
  if (sessions.delete(key)) {
    writePersistedSessions();
    return true;
  }
  return false;
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  if (!raw) return {};

  return raw.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx <= 0) return acc;

    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) return acc;

    acc[name] = decodeURIComponent(value || '');
    return acc;
  }, {});
}

function extractToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  const headerToken = req.headers['x-session-token'];
  if (headerToken) {
    return String(headerToken).trim();
  }

  if (req.query && req.query.token) {
    return String(req.query.token).trim();
  }

  if (req.body && req.body.token) {
    return String(req.body.token).trim();
  }

  const cookies = parseCookies(req);
  if (cookies.lumina_session) {
    return String(cookies.lumina_session).trim();
  }

  return null;
}

function appendCookieHeader(res, cookieValue) {
  const previous = res.getHeader('Set-Cookie');
  if (!previous) {
    res.setHeader('Set-Cookie', cookieValue);
    return;
  }

  if (Array.isArray(previous)) {
    res.setHeader('Set-Cookie', [...previous, cookieValue]);
    return;
  }

  res.setHeader('Set-Cookie', [String(previous), cookieValue]);
}

function setSessionCookie(res, token, expiresAtIso) {
  const expiresAtMs = new Date(expiresAtIso).getTime();
  const maxAgeSec = Math.max(1, Math.floor((expiresAtMs - nowMs()) / 1000));
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const sameSite = isProd ? 'None' : 'Lax';
  const secure = isProd ? '; Secure' : '';
  const domain = process.env.FRONTEND_COOKIE_DOMAIN ? `; Domain=${process.env.FRONTEND_COOKIE_DOMAIN}` : '';
  const cookie = `lumina_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAgeSec}${secure}${domain}`;
  appendCookieHeader(res, cookie);
}

function clearSessionCookie(res) {
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const sameSite = isProd ? 'None' : 'Lax';
  const secure = isProd ? '; Secure' : '';
  const domain = process.env.FRONTEND_COOKIE_DOMAIN ? `; Domain=${process.env.FRONTEND_COOKIE_DOMAIN}` : '';
  const cookie = `lumina_session=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure}${domain}`;
  appendCookieHeader(res, cookie);
}

loadPersistedSessions();

module.exports = {
  createSession,
  getActiveSession,
  revokeSession,
  extractToken,
  setSessionCookie,
  clearSessionCookie
};
