/**
 * Auth Routes
 * REST API endpoints for login/register flows used by login_register.html.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (_) {
  nodemailer = null;
}

const {
  registerCustomer,
  registerSeller,
  login,
  logout,
  getCurrentSession,
  checkIdentifierAvailability,
  getDemoAccounts,
  requestPasswordReset,
  resetPasswordWithToken
} = require('../data/authData');
const {
  createSession,
  getActiveSession,
  revokeSession,
  extractToken,
  setSessionCookie,
  clearSessionCookie
} = require('../../../shared/sessionStore');
const { pool } = require('../../../database/postgresClient');

function hasDb(req) {
  return Boolean(req.db && typeof req.db.query === 'function');
}

const AUTH_SCHEMA = 'public';

let usersPasswordColumnPromise = null;

async function resolveUsersPasswordColumn(db) {
  if (!usersPasswordColumnPromise) {
    usersPasswordColumnPromise = db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name IN ('password_hash', 'password')
      ORDER BY CASE column_name WHEN 'password_hash' THEN 1 WHEN 'password' THEN 2 ELSE 3 END
      LIMIT 1
    `).then((result) => result.rows[0]?.column_name || 'password_hash');
  }

  return usersPasswordColumnPromise;
}

function buildPasswordMatchClause(columnName, tableAlias = 'u') {
  if (columnName === 'password') {
    return `${tableAlias}.password = $3`;
  }

  return `${tableAlias}.password_hash = $3 OR ${tableAlias}.password_hash = crypt($3, ${tableAlias}.password_hash)`;
}

async function withDbTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

function makeSession(user) {
  return createSession(user, { rememberMe: false });
}

function sanitizeDbUser(row) {
  const sellerProfile = row.sellerProfileJson && typeof row.sellerProfileJson === 'object'
    ? row.sellerProfileJson
    : null;
  const resolvedStoreName = row.storeName || (sellerProfile ? (sellerProfile.store_name || sellerProfile.shop_name || null) : null);
  const resolvedCategory = row.storeCategory || (sellerProfile ? (sellerProfile.store_category || null) : null);
  const resolvedCity = row.city || (sellerProfile ? (sellerProfile.city || null) : null);
  const resolvedKycStatus = row.kycStatus
    || (sellerProfile ? (sellerProfile.kyc_status || sellerProfile.verification_status || (sellerProfile.is_verified === true ? 'active' : null)) : null)
    || 'pending';

  return {
    id: row.id,
    role: row.role,
    fullName: row.fullName,
    name: row.fullName,
    email: row.email,
    phone: row.phone,
    createdAt: row.createdAt,
    isActive: row.status !== 'suspended' && row.status !== 'banned',
    sellerProfile: row.role === 'seller' ? {
      storeName: resolvedStoreName,
      storeCategory: resolvedCategory,
      city: resolvedCity,
      isVerified: resolvedKycStatus === 'active' || resolvedKycStatus === 'verified',
      verificationStatus: resolvedKycStatus,
      verificationSubmittedAt: row.createdAt
    } : undefined
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isValidPkPhone(value) {
  return /^03\d{9}$/.test(String(value || '').trim());
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getAppBaseUrl(req) {
  if (process.env.PUBLIC_APP_URL) {
    return String(process.env.PUBLIC_APP_URL).replace(/\/$/, '');
  }

  return `${req.protocol}://${req.get('host')}`;
}

async function getMailer() {
  if (!nodemailer) return null;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user, pass }
  });
}

async function sendResetEmail(req, user, resetUrl) {
  const transporter = await getMailer();
  if (!transporter) {
    console.log(`[Password Reset] ${user.email}: ${resetUrl}`);
    return { sent: false };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: user.email,
    subject: 'Reset your LUMINA password',
    text: `Hello ${user.full_name || user.fullName || 'there'},\n\nClick this link to reset your password:\n${resetUrl}\n\nThis link expires in 15 minutes.`,
    html: `<p>Hello ${user.full_name || user.fullName || 'there'},</p><p>Click this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 15 minutes.</p>`
  });

  return { sent: true };
}

function normalizeResetToken(token) {
  return hashResetToken(token);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * POST /api/auth/register/customer
 * Register a customer account and create a session token.
 */
router.post('/register/customer', async (req, res) => {
  try {
    if (hasDb(req)) {
      const payload = req.body || {};
      const fullName = String(payload.fullName || '').trim();
      const identifier = String(payload.emailPhone || payload.email || payload.phone || '').trim();
      const password = String(payload.password || '');
      const confirmPassword = String(payload.confirmPassword || '');

      if (!fullName || !identifier || !password) {
        return res.status(400).json({ success: false, message: 'Full name, email/phone, and password are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Passwords do not match' });
      }

      const email = isValidEmail(identifier) ? identifier.toLowerCase() : (isValidPkPhone(identifier) ? `${identifier}@lumina.local` : null);
      const phone = isValidPkPhone(identifier) ? identifier : null;

      if (!email) {
        return res.status(400).json({ success: false, message: 'Please enter a valid email or Pakistani phone number (03XXXXXXXXX)' });
      }

      const passwordColumn = await resolveUsersPasswordColumn(req.db);

      const existing = await req.db.query(
        `SELECT id FROM ${AUTH_SCHEMA}.users WHERE LOWER(email) = LOWER($1) OR ($2::text IS NOT NULL AND phone = $2::text) LIMIT 1`,
        [email, phone]
      );

      if (existing.rows.length) {
        return res.status(400).json({ success: false, message: 'An account with this email/phone already exists' });
      }

      const insertUser = await req.db.query(
        `
        INSERT INTO ${AUTH_SCHEMA}.users (role, full_name, email, phone, ${passwordColumn}, status)
        VALUES ('customer', $1, $2, $3, ${passwordColumn === 'password' ? '$4' : "crypt($4, gen_salt('bf'))"}, 'active')
        RETURNING id, role, full_name AS "fullName", email, phone, status, created_at AS "createdAt"
        `,
        [fullName, email, phone, password]
      );

      const user = sanitizeDbUser(insertUser.rows[0]);
      const { token, session } = makeSession(user);
      setSessionCookie(res, token, session.expiresAt);

      return res.status(201).json({
        success: true,
        message: 'Customer account created successfully',
        data: { user, token }
      });
    }

    const result = registerCustomer(req.body || {});

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }

    const sessionData = makeSession(result.user);
    setSessionCookie(res, sessionData.token, sessionData.session.expiresAt);

    res.status(201).json({
      success: true,
      message: result.message,
      data: {
        user: result.user,
        token: sessionData.token
      }
    });
  } catch (error) {
    const result = registerCustomer(req.body || {});
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }

    const sessionData = makeSession(result.user);
    setSessionCookie(res, sessionData.token, sessionData.session.expiresAt);

    return res.status(201).json({
      success: true,
      message: result.message,
      data: {
        user: result.user,
        token: sessionData.token
      }
    });
  }
});

/**
 * POST /api/auth/register
 * Simple role-based registration endpoint:
 * { name, email, password, role }
 */
router.post('/register', async (req, res) => {
  const role = String(req.body?.role || '').trim().toLowerCase();
  const name = String(req.body?.name || req.body?.fullName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'name, email, password, and role are required' });
  }

  if (!['customer', 'seller'].includes(role)) {
    return res.status(400).json({ success: false, message: 'role must be customer or seller' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
  }

  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
  }

  if (!hasDb(req)) {
    return res.status(500).json({ success: false, message: 'Database connection is required for this endpoint' });
  }

  try {
    const existing = await req.db.query(
      `SELECT id FROM ${AUTH_SCHEMA}.users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );

    if (existing.rows.length) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists' });
    }

    const created = await req.db.query(
      `
      INSERT INTO ${AUTH_SCHEMA}.users (role, full_name, email, password_hash, status)
      VALUES ($1, $2, $3, crypt($4, gen_salt('bf')), 'active')
      RETURNING id, role, full_name AS "fullName", email, phone, status, created_at AS "createdAt"
      `,
      [role, name, email, password]
    );

    if (role === 'seller') {
      const userId = created.rows[0].id;
      const storeName = `${name}'s Store`;
      const slug = `${slugify(storeName) || 'seller-store'}-${String(userId).slice(0, 8)}`;

      try {
        await req.db.query(
          `
          INSERT INTO ${AUTH_SCHEMA}.seller_profiles (user_id, store_name, store_slug, business_email, kyc_status)
          VALUES ($1, $2, $3, $4, 'pending')
          ON CONFLICT (user_id) DO NOTHING
          `,
          [userId, storeName, slug, email]
        );
      } catch (profileError) {
        await req.db.query(
          `
          INSERT INTO ${AUTH_SCHEMA}.seller_profiles (user_id, store_name, store_slug, business_email, kyc_status)
          VALUES ($1, $2, $3, $4, 'pending')
          ON CONFLICT (user_id) DO NOTHING
          `,
          [userId, storeName, slug, email]
        );
      }
    }

    const user = sanitizeDbUser(created.rows[0]);
    const { token, session } = makeSession(user);
    setSessionCookie(res, token, session.expiresAt);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: { user, token }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create account', error: error.message });
  }
});

/**
 * POST /api/auth/register/seller
 * Register a seller account in pending verification state.
 */
router.post('/register/seller', async (req, res) => {
  try {
    if (hasDb(req)) {
      const payload = req.body || {};
      const fullName = String(payload.fullName || '').trim();
      const email = String(payload.email || '').trim().toLowerCase();
      const phone = String(payload.phone || '').trim();
      const password = String(payload.password || '');
      const confirmPassword = String(payload.confirmPassword || '');
      const storeName = String(payload.storeName || '').trim();
      const storeDescription = String(payload.storeDescription || '').trim();
      const storeCategory = String(payload.storeCategory || '').trim();
      const city = String(payload.city || '').trim();
      const address = String(payload.address || '').trim();
      const postalCode = String(payload.postalCode || '').trim();

      if (!fullName || !email || !phone || !password || !confirmPassword || !storeName || !storeDescription || !storeCategory || !city || !address) {
        return res.status(400).json({ success: false, message: 'All required seller fields must be filled' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
      }

      if (!isValidPkPhone(phone)) {
        return res.status(400).json({ success: false, message: 'Please enter a valid Pakistani phone number (03XXXXXXXXX)' });
      }

      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Passwords do not match' });
      }

      if (storeDescription.length < 50) {
        return res.status(400).json({ success: false, message: 'Store description must be at least 50 characters long' });
      }

      if (!payload.agreeTerms || !payload.agreePrivacy || !payload.agreeCommission) {
        return res.status(400).json({ success: false, message: 'All seller terms must be accepted' });
      }

      const passwordColumn = await resolveUsersPasswordColumn(req.db);

      const existing = await req.db.query(
        `SELECT id FROM ${AUTH_SCHEMA}.users WHERE LOWER(email) = LOWER($1) OR phone = $2 LIMIT 1`,
        [email, phone]
      );

      if (existing.rows.length) {
        return res.status(400).json({ success: false, message: 'An account with this email/phone already exists' });
      }

      const createdUser = await withDbTransaction(async (client) => {
        const userInsert = await client.query(
          `
          INSERT INTO ${AUTH_SCHEMA}.users (role, full_name, email, phone, ${passwordColumn}, status)
          VALUES ('seller', $1, $2, $3, ${passwordColumn === 'password' ? '$4' : "crypt($4, gen_salt('bf'))"}, 'active')
          RETURNING id, role, full_name AS "fullName", email, phone, status, created_at AS "createdAt"
          `,
          [fullName, email, phone, password]
        );

        const userId = userInsert.rows[0].id;
        const baseSlug = slugify(storeName) || `seller-${Date.now()}`;
        const storeSlug = `${baseSlug}-${String(userId).slice(0, 8)}`;

        await client.query(
          `
          INSERT INTO ${AUTH_SCHEMA}.seller_profiles (user_id, store_name, store_slug, business_email, business_phone, kyc_status)
          VALUES ($1, $2, $3, $4, $5, 'pending')
          `,
          [userId, storeName, storeSlug, email, phone]
        );

        await client.query(
          `
          INSERT INTO ${AUTH_SCHEMA}.user_addresses (user_id, label, receiver_name, phone, line1, city, postal_code, country, is_default)
          VALUES ($1, 'business', $2, $3, $4, $5, $6, 'Pakistan', TRUE)
          `,
          [userId, fullName, phone, address, city, postalCode || '00000']
        );

        return userInsert.rows[0];
      });

      const user = sanitizeDbUser({
        ...createdUser,
        storeName,
        storeCategory,
        city,
        kycStatus: 'pending'
      });
      const { token } = makeSession(user);

      return res.status(201).json({
        success: true,
        message: 'Seller account created successfully. Verification is pending.',
        data: {
          user,
          token,
          verificationStatus: 'pending'
        }
      });
    }

    const result = registerSeller(req.body || {});

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }

    res.status(201).json({
      success: true,
      message: result.message,
      data: {
        user: result.user,
        token: result.token,
        verificationStatus: 'pending'
      }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'An account with this email/phone already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to register seller',
      error: error.message
    });
  }
});

/**
 * POST /api/auth/login
 * Login with email or phone and optional role filter.
 */
router.post('/login', async (req, res) => {
  try {
    if (hasDb(req)) {
      const identifier = String(req.body.identifier || req.body.emailPhone || req.body.email || req.body.phone || '').trim();
      const password = String(req.body.password || '');
      const role = req.body.role ? String(req.body.role).trim().toLowerCase() : null;

      if (!identifier || !password) {
        return res.status(401).json({ success: false, message: 'Identifier and password are required' });
      }

      if (role && !['customer', 'seller'].includes(role)) {
        return res.status(401).json({ success: false, message: 'Role must be customer or seller' });
      }

      const passwordColumn = await resolveUsersPasswordColumn(req.db);
      const passwordMatchClause = buildPasswordMatchClause(passwordColumn, 'u');

      const sql = `
        SELECT
          u.id,
          u.role,
          u.full_name AS "fullName",
          u.email,
          u.phone,
          u.status,
          u.created_at AS "createdAt",
          NULL::text AS "storeName",
          NULL::text AS "kycStatus",
          COALESCE(to_jsonb(sp), '{}'::jsonb) AS "sellerProfileJson"
        FROM ${AUTH_SCHEMA}.users u
        LEFT JOIN ${AUTH_SCHEMA}.seller_profiles sp ON sp.user_id = u.id
        WHERE (LOWER(u.email) = LOWER($1) OR u.phone = $1)
          AND ($2::text IS NULL OR u.role::text = $2)
          AND (${passwordMatchClause})
        LIMIT 1
      `;

      const result = await req.db.query(sql, [identifier, role, password]);
      if (!result.rows.length) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const row = result.rows[0];
      if (row.status === 'suspended' || row.status === 'banned') {
        return res.status(401).json({ success: false, message: 'This account is currently inactive' });
      }

      await req.db.query(`UPDATE ${AUTH_SCHEMA}.users SET last_login_at = NOW() WHERE id = $1`, [row.id]);

      const user = sanitizeDbUser(row);
      const { token, session } = makeSession(user);
      setSessionCookie(res, token, session.expiresAt);

      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          user,
          token,
          redirectTo: user.role === 'seller' ? '/seller-pages/Dashboard.html' : '/customer-pages/homepage.html'
        }
      });
    }

    const payload = {
      identifier: req.body.identifier || req.body.emailPhone || req.body.email || req.body.phone,
      password: req.body.password,
      role: req.body.role
    };

    const result = login(payload);

    if (!result.success) {
      return res.status(401).json({
        success: false,
        message: result.error
      });
    }

    const sessionData = makeSession(result.user);
    setSessionCookie(res, sessionData.token, sessionData.session.expiresAt);

    res.json({
      success: true,
      message: result.message,
      data: {
        user: result.user,
        token: sessionData.token,
        redirectTo: result.redirectTo
      }
    });
  } catch (error) {
    const payload = {
      identifier: req.body.identifier || req.body.emailPhone || req.body.email || req.body.phone,
      password: req.body.password,
      role: req.body.role
    };

    const result = login(payload);
    if (!result.success) {
      return res.status(401).json({
        success: false,
        message: result.error
      });
    }

    const sessionData = makeSession(result.user);
    setSessionCookie(res, sessionData.token, sessionData.session.expiresAt);

    return res.json({
      success: true,
      message: result.message,
      data: {
        user: result.user,
        token: sessionData.token,
        redirectTo: result.redirectTo
      }
    });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    if (!hasDb(req)) {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const role = req.body?.role ? String(req.body.role).trim().toLowerCase() : null;
      const result = requestPasswordReset(email, role);

      if (!result.success) {
        return res.status(404).json({ success: false, message: result.error });
      }

      return res.json({
        success: true,
        message: 'If the email exists, a reset link has been sent',
        data: {
          sent: false,
          ...(process.env.NODE_ENV !== 'production' ? { resetUrl: result.resetUrl } : {})
        }
      });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = req.body?.role ? String(req.body.role).trim().toLowerCase() : null;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
    }

    if (role && !['customer', 'seller', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const userQuery = role
      ? `SELECT id, email, full_name, role::text AS role FROM public.users WHERE LOWER(email) = LOWER($1) AND role::text = $2 LIMIT 1`
      : `SELECT id, email, full_name, role::text AS role FROM public.users WHERE LOWER(email) = LOWER($1) LIMIT 1`;

    const userResult = await req.db.query(userQuery, role ? [email, role] : [email]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with that email' });
    }

    const rawToken = createResetToken();
    const tokenHash = normalizeResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const baseUrl = getAppBaseUrl(req);
    const resetUrl = `${baseUrl}/reset-password.html?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}&role=${encodeURIComponent(user.role)}`;

    await withDbTransaction(async (client) => {
      await client.query(
        `
          UPDATE public.users
          SET reset_token = $2,
              reset_token_expiry = $3,
              updated_at = NOW()
          WHERE id = $1
        `,
        [user.id, tokenHash, expiresAt]
      );
    });

    const delivery = await sendResetEmail(req, user, resetUrl);

    return res.json({
      success: true,
      message: 'If the email exists, a reset link has been sent',
      data: {
        sent: delivery.sent,
        ...(process.env.NODE_ENV !== 'production' ? { resetUrl } : {})
      }
    });
  } catch (error) {
    const fallbackEmail = String(req.body?.email || '').trim().toLowerCase();
    const fallbackRole = req.body?.role ? String(req.body.role).trim().toLowerCase() : null;

    if (error.message && /password authentication failed|database connection failed|ECONNREFUSED|timeout/i.test(error.message)) {
      const result = requestPasswordReset(fallbackEmail, fallbackRole);
      if (!result.success) {
        return res.status(404).json({ success: false, message: result.error });
      }

      return res.json({
        success: true,
        message: 'If the email exists, a reset link has been sent',
        data: {
          sent: false,
          ...(process.env.NODE_ENV !== 'production' ? { resetUrl: result.resetUrl } : {})
        }
      });
    }

    return res.status(500).json({ success: false, message: 'Failed to start password reset', error: error.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    if (!hasDb(req)) {
      const result = resetPasswordWithToken(
        String(req.body?.token || '').trim(),
        String(req.body?.password || '').trim(),
        String(req.body?.confirmPassword || '').trim()
      );

      if (!result.success) {
        return res.status(400).json({ success: false, message: result.error });
      }

      return res.json({
        success: true,
        message: 'Password updated successfully. You can now log in with your new password.'
      });
    }

    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '').trim();
    const confirmPassword = String(req.body?.confirmPassword || '').trim();

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Token, new password, and confirm password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    const tokenHash = normalizeResetToken(token);

    const result = await withDbTransaction(async (client) => {
      const tokenResult = await client.query(
        `
          SELECT id AS user_id, email, full_name, role::text AS role
          FROM public.users
          WHERE reset_token = $1
            AND reset_token_expiry > NOW()
          LIMIT 1
        `,
        [tokenHash]
      );

      if (!tokenResult.rows.length) {
        return { valid: false };
      }

      const row = tokenResult.rows[0];
      const passwordColumn = await resolveUsersPasswordColumn(client);

      if (passwordColumn === 'password') {
        await client.query(
          'UPDATE public.users SET password = $2, updated_at = NOW() WHERE id = $1',
          [row.user_id, password]
        );
      } else {
        await client.query(
          'UPDATE public.users SET password_hash = crypt($2, gen_salt(\'bf\')), updated_at = NOW() WHERE id = $1',
          [row.user_id, password]
        );
      }

      await client.query(
        `
          UPDATE public.users
          SET reset_token = NULL,
              reset_token_expiry = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        [row.user_id]
      );

      return { valid: true, role: row.role };
    });

    if (!result.valid) {
      return res.status(400).json({ success: false, message: 'Reset link is invalid or expired' });
    }

    return res.json({
      success: true,
      message: 'Password updated successfully. You can now log in with your new password.'
    });
  } catch (error) {
    const result = resetPasswordWithToken(
      String(req.body?.token || '').trim(),
      String(req.body?.password || '').trim(),
      String(req.body?.confirmPassword || '').trim()
    );

    if (result.success && error.message && /password authentication failed|database connection failed|ECONNREFUSED|timeout/i.test(error.message)) {
      return res.json({
        success: true,
        message: 'Password updated successfully. You can now log in with your new password.'
      });
    }

    return res.status(500).json({ success: false, message: 'Failed to reset password', error: error.message });
  }
});

/**
 * POST /api/auth/logout
 * Logout user by removing session token.
 */
router.post('/logout', (req, res) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Session token is required'
      });
    }

    const removed = revokeSession(token) || logout(token);
    clearSessionCookie(res);

    if (!removed) {
      return res.status(404).json({
        success: false,
        message: 'Session not found or already expired'
      });
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user/session using session token.
 */
router.get('/me', (req, res) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Session token is required'
      });
    }

    const current = getActiveSession(token) || getCurrentSession(token);
    if (!current) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }

    res.json({
      success: true,
      data: {
        user: current.user,
        session: current.session
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch current user',
      error: error.message
    });
  }
});

/**
 * GET /api/auth/check-availability?identifier=
 * Check if an email or phone is available for registration.
 */
router.get('/check-availability', async (req, res) => {
  try {
    const identifier = req.query.identifier;

    if (hasDb(req)) {
      const value = String(identifier || '').trim();
      if (!value) {
        return res.json({
          success: true,
          data: { available: false, message: 'Identifier is required' }
        });
      }

      const result = await req.db.query(
        `SELECT id FROM ${AUTH_SCHEMA}.users WHERE LOWER(email) = LOWER($1) OR phone = $1 LIMIT 1`,
        [value]
      );

      return res.json({
        success: true,
        data: {
          available: result.rows.length === 0,
          message: result.rows.length ? 'Identifier is already in use' : 'Identifier is available'
        }
      });
    }

    const result = checkIdentifierAvailability(identifier);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check identifier availability',
      error: error.message
    });
  }
});

/**
 * GET /api/auth/demo-accounts
 * Returns seeded accounts for quick local testing.
 */
router.get('/demo-accounts', (req, res) => {
  try {
    res.json({
      success: true,
      data: getDemoAccounts()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch demo accounts',
      error: error.message
    });
  }
});

module.exports = router;
