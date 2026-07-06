// Admin Login/Auth Data Module

const crypto = require('crypto');

const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours
const SESSION_TTL_REMEMBER_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const RESET_TOKEN_TTL_MS = 1000 * 60 * 15; // 15 minutes

const authState = {
  admins: [
    {
      id: 'ADM-001',
      name: 'Sarah Ahmed',
      email: 'admin@lumina.com',
      password: 'Admin@123',
      role: 'super_admin',
      status: 'active',
      lastLogin: '2026-03-05T14:20:00Z',
      failedAttempts: 0,
      lockedUntil: null,
      twoFactorEnabled: false
    },
    {
      id: 'ADM-002',
      name: 'Noah Hassan',
      email: 'ops.admin@lumina.com',
      password: 'OpsAdmin@123',
      role: 'admin',
      status: 'active',
      lastLogin: '2026-03-04T11:10:00Z',
      failedAttempts: 0,
      lockedUntil: null,
      twoFactorEnabled: true
    }
  ],
  sessions: [],
  passwordResets: [],
  auditLog: []
};

function sanitizeAdmin(admin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    status: admin.status,
    lastLogin: admin.lastLogin,
    twoFactorEnabled: admin.twoFactorEnabled
  };
}

function logAuth(action, adminId, details = '', meta = {}) {
  authState.auditLog.unshift({
    id: `AUTH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    action,
    adminId,
    details,
    ip: meta.ip || '0.0.0.0',
    userAgent: meta.userAgent || 'unknown',
    timestamp: new Date().toISOString()
  });
}

function findAdminByEmail(email = '') {
  const normalizedEmail = String(email).trim().toLowerCase();
  return authState.admins.find(admin => admin.email.toLowerCase() === normalizedEmail);
}

function createSession(admin, rememberMe = false, meta = {}) {
  const now = Date.now();
  const expiresAtMs = now + (rememberMe ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_MS);
  const token = `adm_${crypto.randomBytes(20).toString('hex')}`;

  const session = {
    token,
    adminId: admin.id,
    rememberMe: Boolean(rememberMe),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    ip: meta.ip || '0.0.0.0',
    userAgent: meta.userAgent || 'unknown',
    revoked: false
  };

  authState.sessions.push(session);
  return session;
}

function getSession(token = '') {
  const normalizedToken = String(token).trim();
  if (!normalizedToken) {
    return null;
  }

  const session = authState.sessions.find(item => item.token === normalizedToken);
  if (!session || session.revoked) {
    return null;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    session.revoked = true;
    return null;
  }

  return session;
}

function revokeSession(token = '') {
  const session = authState.sessions.find(item => item.token === String(token).trim());
  if (!session) {
    return false;
  }

  session.revoked = true;
  return true;
}

function registerFailedAttempt(admin, meta = {}) {
  admin.failedAttempts += 1;

  if (admin.failedAttempts >= 5) {
    admin.lockedUntil = new Date(Date.now() + 1000 * 60 * 15).toISOString();
  }

  logAuth('login_failed', admin.id, `Failed login attempt ${admin.failedAttempts}`, meta);
}

function clearFailedAttempts(admin) {
  admin.failedAttempts = 0;
  admin.lockedUntil = null;
}

function requestPasswordReset(admin, meta = {}) {
  const token = `rst_${crypto.randomBytes(16).toString('hex')}`;
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

  authState.passwordResets.push({
    token,
    adminId: admin.id,
    expiresAt,
    used: false,
    requestedAt: new Date().toISOString()
  });

  logAuth('password_reset_requested', admin.id, 'Password reset requested', meta);

  return { token, expiresAt };
}

function resetPasswordByToken(token = '', newPassword = '', meta = {}) {
  const resetRequest = authState.passwordResets.find(item => item.token === String(token).trim());
  if (!resetRequest) {
    return { success: false, message: 'Invalid reset token' };
  }

  if (resetRequest.used) {
    return { success: false, message: 'Reset token already used' };
  }

  if (new Date(resetRequest.expiresAt).getTime() <= Date.now()) {
    return { success: false, message: 'Reset token expired' };
  }

  const admin = authState.admins.find(item => item.id === resetRequest.adminId);
  if (!admin) {
    return { success: false, message: 'Admin account not found' };
  }

  admin.password = String(newPassword);
  resetRequest.used = true;

  logAuth('password_reset_completed', admin.id, 'Password updated with reset token', meta);
  return { success: true, admin };
}

module.exports = {
  authState,
  sanitizeAdmin,
  logAuth,
  findAdminByEmail,
  createSession,
  getSession,
  revokeSession,
  registerFailedAttempt,
  clearFailedAttempts,
  requestPasswordReset,
  resetPasswordByToken
};
