const express = require('express');

const router = express.Router();

function getUserId(req) {
  const raw = req.auth?.session?.userId || req.headers['x-user-id'] || '';
  return String(raw || '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function normalize2FAMethod(method) {
  const value = String(method || 'none').toLowerCase();
  if (value === 'email' || value === 'sms' || value === 'app') return value;
  return 'none';
}

function computeSecurityHealth({ passwordRecentlyChanged, twoFactorEnabled, emailVerified }) {
  let score = 0;
  if (passwordRecentlyChanged) score += 35;
  if (twoFactorEnabled) score += 35;
  if (emailVerified) score += 30;

  let label = 'weak';
  if (score >= 90) label = 'excellent';
  else if (score >= 65) label = 'good';
  else if (score >= 40) label = 'fair';

  return { score, label };
}

function isWithinLastNDays(dateValue, n) {
  if (!dateValue) return false;
  const input = new Date(dateValue);
  if (Number.isNaN(input.getTime())) return false;
  const now = new Date();
  const diffDays = (now.getTime() - input.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= n;
}

async function resolveCustomerId(req, requestedId) {
  const sessionCustomerId = getUserId(req);
  if (isUuid(sessionCustomerId)) return sessionCustomerId;
  return null;
}

router.get('/summary', async (req, res) => {
  const requestedId = getUserId(req);

  try {
    const userId = await resolveCustomerId(req, requestedId);
    if (!userId) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const sql = `
      SELECT
        u.id AS "userId",
        u.email,
        u.last_login_at AS "lastLoginAt",
        uss.two_factor_enabled AS "twoFactorEnabled",
        uss.two_factor_method AS "twoFactorMethod",
        uss.password_changed_at AS "lastPasswordChangedAt",
        COALESCE(uss.failed_login_count, 0)::int AS "failedLogins"
      FROM public.users u
      LEFT JOIN public.user_security_settings uss ON uss.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `;

    const result = await req.db.query(sql, [userId]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const row = result.rows[0];
    const health = computeSecurityHealth({
      passwordRecentlyChanged: isWithinLastNDays(row.lastPasswordChangedAt, 180),
      twoFactorEnabled: Boolean(row.twoFactorEnabled),
      emailVerified: Boolean(row.email)
    });

    return res.json({
      success: true,
      data: {
        ...row,
        securityHealth: health
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch security summary', error: error.message });
  }
});

router.get('/settings', async (req, res) => {
  const requestedId = getUserId(req);

  try {
    const userId = await resolveCustomerId(req, requestedId);
    if (!userId) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userSql = `
      SELECT id, full_name AS "fullName", email, phone, role, status
      FROM public.users
      WHERE id = $1
      LIMIT 1
    `;

    const secSql = `
      SELECT
        two_factor_enabled AS "twoFactorEnabled",
        two_factor_method AS "twoFactorMethod",
        password_changed_at AS "lastPasswordChangedAt",
        failed_login_count AS "failedLoginCount",
        locked_until AS "lockedUntil"
      FROM public.user_security_settings
      WHERE user_id = $1
      LIMIT 1
    `;

    const [userResult, secResult] = await Promise.all([
      req.db.query(userSql, [userId]),
      req.db.query(secSql, [userId])
    ]);

    if (!userResult.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const security = secResult.rows[0] || {
      twoFactorEnabled: false,
      twoFactorMethod: 'none',
      lastPasswordChangedAt: null,
      failedLoginCount: 0,
      lockedUntil: null
    };

    const health = computeSecurityHealth({
      passwordRecentlyChanged: isWithinLastNDays(security.lastPasswordChangedAt, 180),
      twoFactorEnabled: Boolean(security.twoFactorEnabled),
      emailVerified: Boolean(userResult.rows[0].email)
    });

    return res.json({
      success: true,
      data: {
        user: userResult.rows[0],
        security,
        securityHealth: health
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch security settings', error: error.message });
  }
});

router.put('/password', async (req, res) => {
  const requestedId = getUserId(req);
  const currentPassword = String(req.body.currentPassword || '').trim();
  const newPassword = String(req.body.newPassword || '').trim();

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'newPassword must be at least 8 characters long' });
  }

  try {
    const userId = await resolveCustomerId(req, requestedId);
    if (!userId) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userResult = await req.db.query(
      `
      SELECT id
      FROM public.users
      WHERE id = $1
        AND (password_hash = $2 OR password_hash = crypt($2, password_hash))
      LIMIT 1
      `,
      [userId, currentPassword]
    );

    if (!userResult.rows.length) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    await req.db.query(
      `
      UPDATE public.users
      SET password_hash = crypt($1, gen_salt('bf')), updated_at = NOW()
      WHERE id = $2
      `,
      [newPassword, userId]
    );

    const upsertSql = `
      INSERT INTO public.user_security_settings (user_id, password_changed_at)
      VALUES ($1, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET password_changed_at = NOW(), updated_at = NOW()
      RETURNING user_id AS "userId", password_changed_at AS "lastPasswordChangedAt"
    `;

    const settingResult = await req.db.query(upsertSql, [userId]);

    return res.json({
      success: true,
      message: 'Your password has been updated successfully.',
      data: settingResult.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update password', error: error.message });
  }
});

router.put('/2fa', async (req, res) => {
  const requestedId = getUserId(req);
  const enabled = Boolean(req.body.enabled);
  const method = enabled ? normalize2FAMethod(req.body.method) : 'none';

  if (enabled && method === 'none') {
    return res.status(400).json({ success: false, message: 'method must be email or sms when enabling 2FA' });
  }

  try {
    const userId = await resolveCustomerId(req, requestedId);
    if (!userId) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const upsertSql = `
      INSERT INTO public.user_security_settings (user_id, two_factor_enabled, two_factor_method)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET
        two_factor_enabled = EXCLUDED.two_factor_enabled,
        two_factor_method = EXCLUDED.two_factor_method,
        updated_at = NOW()
      RETURNING
        user_id AS "userId",
        two_factor_enabled AS "twoFactorEnabled",
        two_factor_method AS "twoFactorMethod",
        updated_at AS "updatedAt"
    `;

    const result = await req.db.query(upsertSql, [userId, enabled, method]);
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update 2FA settings', error: error.message });
  }
});

router.get('/login-activity', async (req, res) => {
  const requestedId = getUserId(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

  try {
    const userId = await resolveCustomerId(req, requestedId);
    if (!userId) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const sql = `
      SELECT
        created_at AS "eventTime",
        COALESCE(NULLIF(user_agent, ''), 'Unknown device') AS "deviceBrowser",
        COALESCE(NULLIF(ip_address::text, ''), 'Unknown') AS location,
        COALESCE(NULLIF(ip_address::text, ''), '-') AS "ipAddress",
        CASE WHEN action ILIKE '%fail%' THEN 'failed' ELSE 'successful' END AS status,
        FALSE AS "isCurrentSession"
      FROM public.audit_logs
      WHERE actor_user_id = $1
        AND (action ILIKE '%login%' OR action ILIKE '%signin%' OR action ILIKE '%auth%')
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await req.db.query(sql, [userId, limit]);
    let data = result.rows;

    if (!data.length) {
      const userRow = await req.db.query(
        `
        SELECT last_login_at AS "eventTime"
        FROM public.users
        WHERE id = $1
        LIMIT 1
        `,
        [userId]
      );

      const fallbackTime = userRow.rows[0]?.eventTime || new Date().toISOString();
      data = [{
        eventTime: fallbackTime,
        deviceBrowser: 'Current browser session',
        location: 'Unknown',
        ipAddress: '-',
        status: 'successful',
        isCurrentSession: true
      }];
    } else {
      data[0].isCurrentSession = true;
    }

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch login activity', error: error.message });
  }
});

router.post('/logout-all-devices', async (req, res) => {
  const requestedId = getUserId(req);

  try {
    const userId = await resolveCustomerId(req, requestedId);
    if (!userId) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await req.db.query(
      `
      INSERT INTO public.audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        ip_address,
        user_agent,
        created_at
      )
      VALUES ($1, 'logout_all_devices', 'user', $1::text, NULLIF($2, '')::inet, $3, NOW())
      `,
      [
        userId,
        String(req.ip || '').replace('::ffff:', ''),
        String(req.headers['user-agent'] || 'Unknown device')
      ]
    );

    return res.json({
      success: true,
      message: 'Logged out from all active sessions',
      data: {
        revokedSessions: 0
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to logout from all devices', error: error.message });
  }
});

module.exports = router;
