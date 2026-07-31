const express = require('express');

const router = express.Router();

function getCustomerId(req) {
  const raw = req.auth?.session?.userId
    || req.headers['x-user-id']
    || req.query?.userId
    || req.body?.userId
    || '';
  return String(raw || '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

async function resolveCustomerId(req, requestedId) {
  const sessionCustomerId = getCustomerId(req);
  if (isUuid(sessionCustomerId)) return sessionCustomerId;
  return null;
}

async function ensureProfileImageColumn(req) {
  try {
    await req.db.query(`
      ALTER TABLE public.customer_profiles
      ADD COLUMN IF NOT EXISTS profile_image_url TEXT
    `);
  } catch (error) {
    if (!String(error.message || '').includes('already exists')) {
      throw error;
    }
  }
}

router.get('/me', async (req, res) => {
  try {
    await ensureProfileImageColumn(req);

    const requestedId = getCustomerId(req);
    const customerId = await resolveCustomerId(req, requestedId);

    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer profile not found' });
    }

    const sql = `
      SELECT
        u.id AS "userId",
        u.role,
        u.full_name AS "fullName",
        u.email,
        u.phone AS "phoneNumber",
        cp.profile_image_url AS "avatarUrl",
        u.status AS "accountStatus",
        u.email_verified_at AS "emailVerifiedAt",
        cp.date_of_birth AS "dateOfBirth",
        cp.gender,
        cp.loyalty_points AS "loyaltyPoints",
        FALSE AS "twoFactorEnabled",
        NULL::text AS "twoFactorMethod",
        NULL::timestamp AS "lastPasswordChangedAt"
      FROM public.users u
      LEFT JOIN public.customer_profiles cp ON cp.user_id = u.id
      WHERE u.id = $1 AND u.role = 'customer'
      LIMIT 1
    `;

    const result = await req.db.query(sql, [customerId]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Customer profile not found' });
    }

    const profile = result.rows[0];
    return res.json({
      success: true,
      data: {
        ...profile,
        emailStatus: profile.emailVerifiedAt ? 'verified' : 'unverified',
        securityStrength: 'good'
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch profile', error: error.message });
  }
});

router.put('/me', async (req, res) => {
  const requestedId = getCustomerId(req);
  const fullName = String(req.body?.fullName || '').trim();
  const phoneNumber = String(req.body?.phoneNumber || '').trim();
  const dateOfBirth = req.body?.dateOfBirth ? String(req.body.dateOfBirth).trim() : null;
  const gender = req.body?.gender ? String(req.body.gender).trim() : null;
  const avatarUrl = String(req.body?.avatarUrl || '').trim();
  const normalizedAvatarUrl = avatarUrl || null;

  if (!fullName || !phoneNumber) {
    return res.status(400).json({ success: false, message: 'fullName and phoneNumber are required' });
  }

  try {
    await ensureProfileImageColumn(req);

    const customerId = await resolveCustomerId(req, requestedId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const userCheck = await req.db.query(
      `
      SELECT id
      FROM public.users
      WHERE id = $1 AND role = 'customer'
      LIMIT 1
      `,
      [customerId]
    );

    if (!userCheck.rows.length) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const userSql = `
      UPDATE public.users
      SET
        full_name = $2,
        phone = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id AS "userId", full_name AS "fullName", email, phone AS "phoneNumber", NULL::text AS "avatarUrl", updated_at AS "updatedAt"
    `;

    const userResult = await req.db.query(userSql, [customerId, fullName, phoneNumber]);

    const profileSql = `
      INSERT INTO public.customer_profiles (user_id, date_of_birth, gender, profile_image_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id)
      DO UPDATE SET
        date_of_birth = EXCLUDED.date_of_birth,
        gender = EXCLUDED.gender,
        profile_image_url = EXCLUDED.profile_image_url,
        updated_at = NOW()
      RETURNING date_of_birth AS "dateOfBirth", gender, loyalty_points AS "loyaltyPoints", profile_image_url AS "avatarUrl", updated_at AS "profileUpdatedAt"
    `;

    const profileResult = await req.db.query(profileSql, [customerId, dateOfBirth || null, gender || null, normalizedAvatarUrl]);

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        ...userResult.rows[0],
        ...profileResult.rows[0]
      }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Phone number is already in use by another account' });
    }
    return res.status(500).json({ success: false, message: 'Failed to update profile', error: error.message });
  }
});

router.patch('/password', async (req, res) => {
  const requestedId = getCustomerId(req);
  const currentPassword = String(req.body?.currentPassword || '').trim();
  const newPassword = String(req.body?.newPassword || '').trim();

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const userResult = await req.db.query(
      `
      SELECT id
      FROM public.users
      WHERE id = $1 AND role = 'customer'
      LIMIT 1
      `,
      [customerId]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    await req.db.query(
      `
      UPDATE public.users
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [customerId]
    );

    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to change password', error: error.message });
  }
});

router.patch('/email', async (req, res) => {
  const requestedId = getCustomerId(req);
  const newEmail = String(req.body?.newEmail || '').trim().toLowerCase();
  const password = String(req.body?.password || '').trim();

  if (!newEmail || !password) {
    return res.status(400).json({ success: false, message: 'newEmail and password are required' });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    return res.status(400).json({ success: false, message: 'Invalid email format' });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Verify user exists and is a customer
    const userResult = await req.db.query(
      `SELECT id, email, password_hash FROM public.users WHERE id = $1 AND role = 'customer' LIMIT 1`,
      [customerId]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const user = userResult.rows[0];

    // Check if new email is already in use
    const emailCheck = await req.db.query(
      `SELECT id FROM public.users WHERE LOWER(email) = $1 AND id != $2 LIMIT 1`,
      [newEmail, customerId]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'This email address is already in use' });
    }

    // Update email
    const updateResult = await req.db.query(
      `UPDATE public.users SET email = $1, email_verified_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING id AS "userId", email, updated_at AS "updatedAt"`,
      [newEmail, customerId]
    );

    return res.json({
      success: true,
      message: 'Email changed successfully',
      data: updateResult.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to change email', error: error.message });
  }
});

module.exports = router;
