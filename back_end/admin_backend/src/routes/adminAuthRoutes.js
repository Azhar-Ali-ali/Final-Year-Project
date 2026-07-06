const express = require('express');
const {
  createSession,
  getActiveSession,
  revokeSession,
  extractToken,
  setSessionCookie,
  clearSessionCookie
} = require('../../../shared/sessionStore');

const router = express.Router();

function sanitizeAdmin(row) {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at
  };
}

async function findAdminByEmail(req, email) {
  const sql = `
    SELECT id, full_name, email, role::text AS role, status::text AS status, password_hash, last_login_at
    FROM users
    WHERE LOWER(email) = LOWER($1)
      AND role::text = 'admin'
    LIMIT 1
  `;

  const result = await req.db.query(sql, [email]);
  return result.rows[0] || null;
}

router.post('/login', async (req, res) => {
  try {
    const { email, password, rememberMe = false } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const admin = await findAdminByEmail(req, String(email).trim());
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (admin.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Admin account is not active' });
    }

    const compareSql = `
      SELECT id
      FROM users
      WHERE id = $1
        AND (password_hash = $2 OR password_hash = crypt($2, password_hash))
      LIMIT 1
    `;
    const compareResult = await req.db.query(compareSql, [admin.id, String(password)]);
    const passwordMatches = compareResult.rows.length > 0;
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const updateSql = `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`;
    await req.db.query(updateSql, [admin.id]);

    const sessionData = createSession(
      {
        id: admin.id,
        role: 'admin',
        fullName: admin.full_name,
        email: admin.email
      },
      { rememberMe: Boolean(rememberMe) }
    );
    setSessionCookie(res, sessionData.token, sessionData.session.expiresAt);

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        token: sessionData.token,
        expiresAt: sessionData.session.expiresAt,
        rememberMe: Boolean(rememberMe),
        admin: sanitizeAdmin({ ...admin, last_login_at: new Date().toISOString() })
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Login failed', error: error.message });
  }
});

router.get('/session', async (req, res) => {
  try {
    const token = extractToken(req);
    const session = getActiveSession(token);

    if (!session || String(session.session.role || '').toLowerCase() !== 'admin') {
      return res.status(401).json({ success: false, message: 'Invalid or expired session' });
    }

    const sql = `
      SELECT id, full_name, email, role::text AS role, status::text AS status, last_login_at
      FROM users
      WHERE id = $1 AND role::text = 'admin'
      LIMIT 1
    `;

    const result = await req.db.query(sql, [session.session.userId]);
    if (!result.rows.length) {
      return res.status(401).json({ success: false, message: 'Session owner not found' });
    }

    return res.json({
      success: true,
      data: {
        session: {
          token: session.session.token,
          expiresAt: session.session.expiresAt,
          rememberMe: false
        },
        admin: sanitizeAdmin(result.rows[0])
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to validate session', error: error.message });
  }
});

router.post('/logout', (req, res) => {
  const token = extractToken(req);
  const session = getActiveSession(token);

  if (!session || String(session.session.role || '').toLowerCase() !== 'admin') {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }

  revokeSession(token);
  clearSessionCookie(res);

  return res.json({ success: true, message: 'Logout successful' });
});

router.post('/forgot-password', (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Forgot password flow is not configured yet'
  });
});

router.post('/reset-password', (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Reset password flow is not configured yet'
  });
});

router.post('/login/google', (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Google login is not configured yet'
  });
});

router.get('/overview', async (req, res) => {
  try {
    const totalSql = `SELECT COUNT(*)::int AS total_admins FROM users WHERE role::text = 'admin'`;
    const activeSql = `SELECT COUNT(*)::int AS active_admins FROM users WHERE role::text = 'admin' AND status::text = 'active'`;

    const [totalResult, activeResult] = await Promise.all([
      req.db.query(totalSql),
      req.db.query(activeSql)
    ]);

    return res.json({
      success: true,
      data: {
        totalAdmins: totalResult.rows[0]?.total_admins || 0,
        activeAdmins: activeResult.rows[0]?.active_admins || 0,
        activeSessions: null,
        recentLogins: []
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch auth overview', error: error.message });
  }
});

router.get('/audit-log', (req, res) => {
  return res.json({
    success: true,
    data: [],
    total: 0,
    message: 'Audit log is not configured yet'
  });
});

module.exports = router;
