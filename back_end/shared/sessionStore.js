const crypto = require('crypto');

const sessions = new Map();

const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const REMEMBER_ME_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function nowMs() {
  return Date.now();
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

  return {
    token,
    session
  };
}

function getActiveSession(token) {
  const key = String(token || '').trim();
  if (!key || !sessions.has(key)) return null;

  const current = sessions.get(key);
  if (!current || !current.session) {
    sessions.delete(key);
    return null;
  }

  const expiry = new Date(current.session.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= nowMs()) {
    sessions.delete(key);
    return null;
  }

  return current;
}

function revokeSession(token) {
  const key = String(token || '').trim();
  if (!key || !sessions.has(key)) return false;
  sessions.delete(key);
  return true;
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
  const cookie = `lumina_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
  appendCookieHeader(res, cookie);
}

function clearSessionCookie(res) {
  const cookie = 'lumina_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
  appendCookieHeader(res, cookie);
}

module.exports = {
  createSession,
  getActiveSession,
  revokeSession,
  extractToken,
  setSessionCookie,
  clearSessionCookie
};
