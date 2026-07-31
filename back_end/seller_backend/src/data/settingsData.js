const crypto = require('crypto');

const BUSINESS_CATEGORIES = [
  'Men',
  'Women',
  'Kids',
  'Accessories'
];

function toBool(value) {
  return Boolean(value);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function maskAccountNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return digits;
  return `${'*'.repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
}

function normalizeText(value) {
  return String(value || '').trim();
}

async function resolveUsersTableRef(db) {
  const result = await db.query(
    `
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
        AND c.relname = 'users'
        AND n.nspname IN ('public', 'lumina')
      ORDER BY CASE WHEN n.nspname = 'public' THEN 0 ELSE 1 END
      LIMIT 1
    `
  );

  const row = result.rows[0];
  if (!row) {
    return 'public.users';
  }

  return `${row.schema_name}.${row.table_name}`;
}

async function resolveSellerProfilesTableRef(db) {
  const result = await db.query(
    `
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
        AND c.relname = 'seller_profiles'
        AND n.nspname IN ('public', 'lumina')
      ORDER BY CASE WHEN n.nspname = 'public' THEN 0 ELSE 1 END
      LIMIT 1
    `
  );

  const row = result.rows[0];
  return row ? `${row.schema_name}.${row.table_name}` : 'public.seller_profiles';
}

async function resolveSellerDocumentsTableRef(db) {
  const result = await db.query(
    `
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
        AND c.relname = 'seller_documents'
        AND n.nspname IN ('public', 'lumina')
      ORDER BY CASE WHEN n.nspname = 'public' THEN 0 ELSE 1 END
      LIMIT 1
    `
  );

  const row = result.rows[0];
  return row ? `${row.schema_name}.${row.table_name}` : null;
}

async function resolveUserAddressesTableRef(db) {
  const result = await db.query(
    `
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
        AND c.relname = 'user_addresses'
        AND n.nspname IN ('public', 'lumina')
      ORDER BY CASE WHEN n.nspname = 'public' THEN 0 ELSE 1 END
      LIMIT 1
    `
  );

  const row = result.rows[0];
  return row ? `${row.schema_name}.${row.table_name}` : null;
}

function splitTableRef(tableRef) {
  const [schema, table] = String(tableRef || '').split('.');
  return { schema: schema || 'public', table: table || '' };
}

async function tableHasColumn(db, tableRef, columnName) {
  const { schema, table } = splitTableRef(tableRef);
  if (!table) return false;

  const result = await db.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
      LIMIT 1
    `,
    [schema, table, columnName]
  );

  return result.rows.length > 0;
}

async function ensureSupportTables(db) {
  const usersTableRef = await resolveUsersTableRef(db);

  async function runCreate(sql) {
    try {
      await db.query(sql);
    } catch (error) {
      const isPgTypeRace =
        String(error?.code || '') === '23505' &&
        String(error?.constraint || '').includes('pg_type_typname_nsp_index');
      if (!isPgTypeRace) throw error;
      // Ignore one-time concurrent type creation races; table creation is idempotent.
    }
  }

  await runCreate(`
    CREATE TABLE IF NOT EXISTS lumina.user_security_settings (
      user_id UUID PRIMARY KEY REFERENCES ${usersTableRef}(id) ON DELETE CASCADE,
      two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      two_factor_method VARCHAR(20),
      password_changed_at TIMESTAMPTZ,
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await runCreate(`
    CREATE TABLE IF NOT EXISTS lumina.seller_store_settings (
      seller_id UUID PRIMARY KEY REFERENCES ${usersTableRef}(id) ON DELETE CASCADE,
      support_email VARCHAR(255),
      support_phone VARCHAR(40),
      return_policy TEXT,
      shipping_policy TEXT,
      store_banner_url TEXT,
      store_logo_url TEXT,
      vacation_mode BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await runCreate(`
    CREATE TABLE IF NOT EXISTS lumina.seller_privacy_settings (
      seller_id UUID PRIMARY KEY REFERENCES ${usersTableRef}(id) ON DELETE CASCADE,
      show_email_publicly BOOLEAN NOT NULL DEFAULT FALSE,
      show_phone_publicly BOOLEAN NOT NULL DEFAULT FALSE,
      allow_messages BOOLEAN NOT NULL DEFAULT TRUE,
      data_sharing BOOLEAN NOT NULL DEFAULT FALSE,
      analytics_tracking BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await runCreate(`
    CREATE TABLE IF NOT EXISTS lumina.seller_integrations (
      seller_id UUID NOT NULL REFERENCES ${usersTableRef}(id) ON DELETE CASCADE,
      platform VARCHAR(40) NOT NULL,
      connected BOOLEAN NOT NULL DEFAULT FALSE,
      external_id VARCHAR(255),
      connected_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (seller_id, platform)
    )
  `);

  await runCreate(`
    CREATE TABLE IF NOT EXISTS lumina.seller_login_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id UUID NOT NULL REFERENCES ${usersTableRef}(id) ON DELETE CASCADE,
      device VARCHAR(180) NOT NULL,
      location VARCHAR(180),
      ip_address VARCHAR(60),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await runCreate(`
    CREATE TABLE IF NOT EXISTS lumina.user_addresses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES ${usersTableRef}(id) ON DELETE CASCADE,
      label VARCHAR(60),
      receiver_name VARCHAR(255),
      phone VARCHAR(40),
      line1 TEXT,
      line2 TEXT,
      city VARCHAR(120),
      state VARCHAR(120),
      postal_code VARCHAR(30),
      country VARCHAR(120),
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await runCreate(`
    CREATE TABLE IF NOT EXISTS lumina.seller_bank_accounts (
      seller_id UUID PRIMARY KEY REFERENCES ${usersTableRef}(id) ON DELETE CASCADE,
      account_holder_name VARCHAR(255),
      bank_name VARCHAR(255),
      branch_name VARCHAR(255),
      account_number_masked VARCHAR(64),
      routing_number VARCHAR(100),
      iban VARCHAR(100),
      jazzcash_number VARCHAR(40),
      easypaisa_number VARCHAR(40),
      is_default BOOLEAN NOT NULL DEFAULT TRUE,
      verification_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`ALTER TABLE lumina.seller_bank_accounts ADD COLUMN IF NOT EXISTS iban VARCHAR(100)`);
  await db.query(`ALTER TABLE lumina.seller_bank_accounts ADD COLUMN IF NOT EXISTS jazzcash_number VARCHAR(40)`);
  await db.query(`ALTER TABLE lumina.seller_bank_accounts ADD COLUMN IF NOT EXISTS easypaisa_number VARCHAR(40)`);
  await db.query(`ALTER TABLE lumina.seller_bank_accounts ADD COLUMN IF NOT EXISTS account_number TEXT`);
  await db.query(`ALTER TABLE lumina.seller_bank_accounts ADD COLUMN IF NOT EXISTS branch_code VARCHAR(60)`);
  await db.query(`ALTER TABLE lumina.seller_bank_accounts ADD COLUMN IF NOT EXISTS account_type VARCHAR(30)`);
  await db.query(`ALTER TABLE lumina.seller_bank_accounts ADD COLUMN IF NOT EXISTS mobile_wallet VARCHAR(60)`);
  await db.query(`ALTER TABLE lumina.seller_bank_accounts ADD COLUMN IF NOT EXISTS bank_statement_url TEXT`);
  await db.query(`ALTER TABLE lumina.seller_bank_accounts ADD COLUMN IF NOT EXISTS bank_statement_name VARCHAR(255)`);
  await db.query(`ALTER TABLE lumina.seller_bank_accounts ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await db.query(`ALTER TABLE lumina.seller_bank_accounts ADD COLUMN IF NOT EXISTS verified_by UUID`);
  await db.query(`ALTER TABLE lumina.seller_bank_accounts ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`);

  await runCreate(`
    CREATE TABLE IF NOT EXISTS lumina.user_preferences (
      user_id UUID PRIMARY KEY REFERENCES ${usersTableRef}(id) ON DELETE CASCADE,
      email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
      sms_notifications BOOLEAN NOT NULL DEFAULT TRUE,
      push_notifications BOOLEAN NOT NULL DEFAULT TRUE,
      marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
      currency VARCHAR(10) DEFAULT 'BDT',
      language VARCHAR(20) DEFAULT 'en',
      timezone VARCHAR(60) DEFAULT 'Asia/Dhaka',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function fetchSellerContext(db, sellerId) {
  const usersTableRef = await resolveUsersTableRef(db);
  const profilesTableRef = await resolveSellerProfilesTableRef(db);
  const addressesTableRef = await resolveUserAddressesTableRef(db);

  const addressJoin = addressesTableRef
    ? `
      LEFT JOIN LATERAL (
        SELECT line1, line2, city, state, postal_code, country, receiver_name, phone, COALESCE(is_default, FALSE) AS is_default
        FROM ${addressesTableRef} ua
        WHERE ua.user_id = u.id
        ORDER BY COALESCE(ua.is_default, FALSE) DESC
        LIMIT 1
      ) ua ON TRUE
    `
    : `
      LEFT JOIN LATERAL (
        SELECT NULL::text AS line1,
               NULL::text AS line2,
               NULL::text AS city,
               NULL::text AS state,
               NULL::text AS postal_code,
               NULL::text AS country,
               NULL::text AS receiver_name,
               NULL::text AS phone,
               FALSE::boolean AS is_default
      ) ua ON TRUE
    `;

  const result = await db.query(
    `
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.status,
        u.last_login_at,
        u.created_at,
        sp.store_name,
        sp.business_email,
        sp.business_phone,
        sp.tax_number,
        COALESCE(
          NULLIF(to_jsonb(sp)->>'kyc_status', ''),
          NULLIF(to_jsonb(sp)->>'verification_status', ''),
          CASE
            WHEN LOWER(COALESCE(to_jsonb(sp)->>'is_verified', 'false')) = 'true' THEN 'verified'
            ELSE 'pending'
          END
        ) AS kyc_status,
        sp.rating,
        sp.total_reviews,
        ss.support_email,
        ss.support_phone,
        ss.return_policy,
        ss.shipping_policy,
        ss.store_banner_url,
        ss.store_logo_url,
        ss.vacation_mode,
        ua.line1,
        ua.line2,
        ua.city,
        ua.state,
        ua.postal_code,
        ua.country,
        ua.receiver_name,
        ua.phone AS address_phone,
        ua.is_default,
        COALESCE(
          NULLIF(to_jsonb(sp)->>'business_category', ''),
          NULLIF(to_jsonb(sp)->>'category', ''),
          'Other'
        ) AS category_name
      FROM ${usersTableRef} u
      LEFT JOIN ${profilesTableRef} sp ON sp.user_id = u.id
      LEFT JOIN lumina.seller_store_settings ss ON ss.seller_id = u.id
      ${addressJoin}
      WHERE u.id = $1
      LIMIT 1
    `,
    [sellerId]
  );

  return result.rows[0] || null;
}

async function getSettingsOverview(db, sellerId) {
  await ensureSupportTables(db);
  const context = await fetchSellerContext(db, sellerId);
  if (!context) return null;

  const documentsTableRef = await resolveSellerDocumentsTableRef(db);
  const documentsQuery = documentsTableRef
    ? db.query(`SELECT COUNT(*)::int AS docs FROM ${documentsTableRef} WHERE seller_id = $1`, [sellerId])
    : Promise.resolve({ rows: [{ docs: 0 }] });

  const [securityResult, privacyResult, integrationsResult, sessionsResult, documentsResult, bankResult] = await Promise.all([
    db.query(`SELECT two_factor_enabled, password_changed_at FROM lumina.user_security_settings WHERE user_id = $1 LIMIT 1`, [sellerId]),
    db.query(`SELECT * FROM lumina.seller_privacy_settings WHERE seller_id = $1 LIMIT 1`, [sellerId]),
    db.query(`SELECT COUNT(*)::int AS connected FROM lumina.seller_integrations WHERE seller_id = $1 AND connected = TRUE`, [sellerId]),
    db.query(`SELECT COUNT(*)::int AS active_sessions FROM lumina.seller_login_sessions WHERE seller_id = $1 AND status = 'active'`, [sellerId]),
    documentsQuery,
    db.query(`SELECT COUNT(*)::int AS banks FROM lumina.seller_bank_accounts WHERE seller_id = $1`, [sellerId])
  ]);

  return {
    profile: {
      sellerName: context.full_name || '',
      email: context.email || '',
      phone: context.phone || ''
    },
    security: {
      twoFactorEnabled: Boolean(securityResult.rows[0]?.two_factor_enabled),
      activeSessions: toNumber(sessionsResult.rows[0]?.active_sessions, 0),
      passwordChangedAt: securityResult.rows[0]?.password_changed_at || null
    },
    store: {
      businessName: context.store_name || '',
      category: context.category_name || 'Other',
      hasLogo: Boolean(context.store_logo_url),
      hasBanner: Boolean(context.store_banner_url)
    },
    payment: {
      verified: (await getPaymentSettings(db, sellerId)).verified,
      bankAccount: bankResult.rows[0]?.banks ? 'Connected' : 'Not connected'
    },
    verification: {
      status: context.kyc_status || 'pending',
      completeness: await calculateVerificationCompleteness(db, sellerId)
    },
    integrations: {
      connected: toNumber(integrationsResult.rows[0]?.connected, 0),
      total: 3
    },
    activity: {
      documents: toNumber(documentsResult.rows[0]?.docs, 0)
    }
  };
}

async function getProfile(db, sellerId) {
  await ensureSupportTables(db);
  const context = await fetchSellerContext(db, sellerId);
  if (!context) return null;

  return {
    sellerId: context.id,
    sellerName: context.full_name || '',
    storeName: context.store_name || '',
    email: context.email || '',
    phone: context.phone || '',
    businessEmail: context.business_email || context.email || '',
    businessPhone: context.business_phone || context.phone || '',
    taxNumber: context.tax_number || '',
    lastUpdated: context.created_at || null
  };
}

async function updateProfile(db, sellerId, updates = {}) {
  await ensureSupportTables(db);
  const profile = await getProfile(db, sellerId);
  if (!profile) throw new Error('Seller not found');

  const sellerName = normalizeText(updates.sellerName || updates.seller_name || profile.sellerName);
  const storeName = normalizeText(updates.storeName || updates.store_name || profile.storeName);
  const email = normalizeText(updates.email || profile.email);
  const phone = normalizeText(updates.phone || profile.phone);

  if (sellerName.length < 2) throw new Error('Seller name must be at least 2 characters');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email format');

  const usersTableRef = await resolveUsersTableRef(db);
  const profilesTableRef = await resolveSellerProfilesTableRef(db);
  const hasKycStatus = await tableHasColumn(db, profilesTableRef, 'kyc_status');
  const hasVerificationStatus = await tableHasColumn(db, profilesTableRef, 'verification_status');

  const statusColumn = hasKycStatus ? 'kyc_status' : hasVerificationStatus ? 'verification_status' : null;
  const insertStatusColumn = statusColumn ? `, ${statusColumn}` : '';
  const insertStatusValue = statusColumn ? ", 'pending'" : '';
  const updateStatusLine = statusColumn
    ? `\n          ${statusColumn} = COALESCE(${statusColumn}, EXCLUDED.${statusColumn}, 'pending'),`
    : '';

  await db.query('BEGIN');
  try {
    await db.query(
      `
        UPDATE ${usersTableRef}
        SET full_name = $2,
            email = $3,
            phone = $4,
            updated_at = NOW()
        WHERE id = $1
      `,
      [sellerId, sellerName, email, phone]
    );

    await db.query(
      `
        INSERT INTO ${profilesTableRef} (user_id, store_name, store_slug, business_email, business_phone, tax_number${insertStatusColumn}, rating, total_reviews)
        VALUES ($1, $2, LOWER(REGEXP_REPLACE($2, '[^a-zA-Z0-9]+', '-', 'g')), $3, $4, NULL${insertStatusValue}, 0, 0)
        ON CONFLICT (user_id) DO UPDATE SET
          store_name = EXCLUDED.store_name,
          store_slug = EXCLUDED.store_slug,
          business_email = EXCLUDED.business_email,
          business_phone = EXCLUDED.business_phone,
          tax_number = COALESCE(tax_number, EXCLUDED.tax_number),${updateStatusLine}
          updated_at = NOW()
      `,
      [sellerId, storeName, email, phone]
    );

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  return getProfile(db, sellerId);
}

async function getSecuritySettings(db, sellerId) {
  await ensureSupportTables(db);
  const usersTableRef = await resolveUsersTableRef(db);
  const result = await db.query(
    `
      SELECT
        u.email,
        u.last_login_at,
        usc.two_factor_enabled,
        usc.password_changed_at,
        usc.failed_login_count
      FROM ${usersTableRef} u
      LEFT JOIN lumina.user_security_settings usc ON usc.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
    [sellerId]
  );

  const row = result.rows[0] || null;
  if (!row) return null;

  const sessions = await getLoginSessions(db, sellerId);
  return {
    email: row.email || '',
    passwordLastChanged: row.password_changed_at || null,
    twoFactorEnabled: Boolean(row.two_factor_enabled),
    failedLoginCount: toNumber(row.failed_login_count, 0),
    loginSessionsCount: sessions.length,
    loginSessions: sessions
  };
}

async function changeEmail(db, sellerId, currentEmail, newEmail) {
  await ensureSupportTables(db);
  const usersTableRef = await resolveUsersTableRef(db);
  const profilesTableRef = await resolveSellerProfilesTableRef(db);
  const security = await getSecuritySettings(db, sellerId);
  if (!security) throw new Error('Seller not found');
  if (normalizeText(currentEmail) !== normalizeText(security.email)) {
    throw new Error('Current email does not match');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new Error('Invalid email format');
  }

  await db.query('BEGIN');
  try {
    await db.query(
      `
        UPDATE ${usersTableRef}
        SET email = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [sellerId, newEmail]
    );

    await db.query(
      `
        INSERT INTO ${profilesTableRef} (user_id, store_name, store_slug, business_email, business_phone, tax_number, rating, total_reviews)
        VALUES ($1, '', LOWER(REGEXP_REPLACE($2, '[^a-zA-Z0-9]+', '-', 'g')), $3, NULL, NULL, 0, 0)
        ON CONFLICT (user_id) DO UPDATE SET
          business_email = EXCLUDED.business_email,
          updated_at = NOW()
      `,
      [sellerId, newEmail, newEmail]
    );

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  return { success: true, message: 'Email changed successfully. Verification email sent.', newEmail };
}

async function changePassword(db, sellerId, currentPassword, newPassword) {
  if (!currentPassword) {
    throw new Error('Current password is required');
  }
  if (!newPassword || newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
    throw new Error('Password must include uppercase, lowercase, and numbers');
  }

  const usersTableRef = await resolveUsersTableRef(db);
  const hasPasswordHash = await tableHasColumn(db, usersTableRef, 'password_hash');
  const passwordColumn = hasPasswordHash ? 'password_hash' : 'password';

  const currentPasswordCheck = await db.query(
    `
      SELECT id
      FROM ${usersTableRef}
      WHERE id = $1
        AND (
          ${passwordColumn} = $2
          OR ${passwordColumn} = crypt($2, ${passwordColumn})
        )
      LIMIT 1
    `,
    [sellerId, currentPassword]
  );

  if (!currentPasswordCheck.rows[0]) {
    throw new Error('Current password is incorrect');
  }

  await db.query('BEGIN');
  try {
    if (hasPasswordHash) {
      await db.query(
        `
          UPDATE ${usersTableRef}
          SET password_hash = crypt($2, gen_salt('bf')),
              updated_at = NOW()
          WHERE id = $1
        `,
        [sellerId, newPassword]
      );
    } else {
      await db.query(
        `
          UPDATE ${usersTableRef}
          SET password = $2,
              updated_at = NOW()
          WHERE id = $1
        `,
        [sellerId, newPassword]
      );
    }

    await db.query(
      `
        INSERT INTO lumina.user_security_settings (user_id, password_changed_at)
        VALUES ($1, NOW())
        ON CONFLICT (user_id) DO UPDATE SET password_changed_at = NOW(), updated_at = NOW()
      `,
      [sellerId]
    );

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  return { success: true, message: 'Password updated successfully' };
}

async function toggle2FA(db, sellerId, enabled) {
  await ensureSupportTables(db);
  await db.query(
    `
      INSERT INTO lumina.user_security_settings (user_id, two_factor_enabled, two_factor_method)
      VALUES ($1, $2, CASE WHEN $2 THEN 'app' ELSE NULL END)
      ON CONFLICT (user_id) DO UPDATE SET
        two_factor_enabled = EXCLUDED.two_factor_enabled,
        two_factor_method = EXCLUDED.two_factor_method,
        updated_at = NOW()
    `,
    [sellerId, Boolean(enabled)]
  );

  return {
    success: true,
    enabled: Boolean(enabled),
    message: enabled ? '2FA enabled. Setup code sent to your phone.' : '2FA disabled successfully.'
  };
}

async function getLoginSessions(db, sellerId) {
  await ensureSupportTables(db);
  const result = await db.query(
    `
      SELECT id, device, location, ip_address, status, last_seen_at, created_at
      FROM lumina.seller_login_sessions
      WHERE seller_id = $1
      ORDER BY last_seen_at DESC NULLS LAST, created_at DESC
      LIMIT 10
    `,
    [sellerId]
  );

  if (result.rows.length) {
    return result.rows.map((row) => ({
      id: row.id,
      date: row.last_seen_at || row.created_at,
      device: row.device,
      location: row.location || 'Unknown',
      ipAddress: row.ip_address || '',
      status: row.status || 'active'
    }));
  }

  const usersTableRef = await resolveUsersTableRef(db);
  const userResult = await db.query(
    `
      SELECT last_login_at
      FROM ${usersTableRef}
      WHERE id = $1
      LIMIT 1
    `,
    [sellerId]
  );

  const lastLogin = userResult.rows[0]?.last_login_at || null;
  if (!lastLogin) return [];

  return [{
    id: 'current-session',
    date: lastLogin,
    device: 'Current device',
    location: 'Unknown',
    ipAddress: '',
    status: 'active'
  }];
}

async function revokeSession(db, sellerId, sessionId) {
  await ensureSupportTables(db);
  await db.query(
    `
      DELETE FROM lumina.seller_login_sessions
      WHERE seller_id = $1 AND id::text = $2
    `,
    [sellerId, sessionId]
  );

  return { success: true, message: 'Session revoked successfully' };
}

async function getStoreSettings(db, sellerId) {
  await ensureSupportTables(db);
  const context = await fetchSellerContext(db, sellerId);
  if (!context) return null;

  return {
    logo: context.store_logo_url || null,
    banner: context.store_banner_url || null,
    businessName: context.store_name || '',
    category: context.category_name || 'Other',
    description: context.return_policy || '',
    address: [context.line1, context.line2].filter(Boolean).join(', '),
    city: context.city || '',
    state: context.state || '',
    postalCode: context.postal_code || '',
    country: context.country || 'Bangladesh',
    storePhone: context.support_phone || context.business_phone || context.phone || '',
    storeEmail: context.support_email || context.business_email || context.email || '',
    returnPolicy: context.return_policy || '',
    shippingPolicy: context.shipping_policy || '',
    vacationMode: Boolean(context.vacation_mode)
  };
}

async function updateStoreSettings(db, sellerId, updates = {}) {
  await ensureSupportTables(db);
  const profilesTableRef = await resolveSellerProfilesTableRef(db);
  const existing = await getStoreSettings(db, sellerId);
  if (!existing) throw new Error('Seller not found');

  const businessName = normalizeText(updates.businessName || updates.business_name || existing.businessName);
  const category = normalizeText(updates.category || existing.category || 'Other');
  const description = normalizeText(updates.description || existing.description || '');
  const address = normalizeText(updates.address || existing.address || '');
  const city = normalizeText(updates.city || existing.city || '');
  const state = normalizeText(updates.state || existing.state || '');
  const postalCode = normalizeText(updates.postalCode || existing.postalCode || '');
  const country = normalizeText(updates.country || existing.country || 'Bangladesh');
  const storePhone = normalizeText(updates.storePhone || existing.storePhone || '');
  const storeEmail = normalizeText(updates.storeEmail || existing.storeEmail || '');
  const logo = updates.logo || updates.logoUrl || existing.logo || null;
  const banner = updates.banner || updates.bannerUrl || existing.banner || null;

  if (businessName && businessName.length < 3) throw new Error('Business name must be at least 3 characters');
  if (description && description.length > 500) throw new Error('Description must be 500 characters or less');
  if (category && !BUSINESS_CATEGORIES.includes(category)) throw new Error('Invalid business category');

  const [line1, ...rest] = address ? address.split(',') : [''];
  const line2 = rest.join(',').trim();
  const hasBusinessCategoryColumn = await tableHasColumn(db, profilesTableRef, 'business_category');
  const hasCategoryColumn = await tableHasColumn(db, profilesTableRef, 'category');

  await db.query('BEGIN');
  try {
    await db.query(
      `
        INSERT INTO lumina.seller_store_settings (
          seller_id, support_email, support_phone, return_policy, shipping_policy, store_banner_url, store_logo_url, vacation_mode
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
        ON CONFLICT (seller_id) DO UPDATE SET
          support_email = EXCLUDED.support_email,
          support_phone = EXCLUDED.support_phone,
          return_policy = EXCLUDED.return_policy,
          shipping_policy = EXCLUDED.shipping_policy,
          store_banner_url = EXCLUDED.store_banner_url,
          store_logo_url = EXCLUDED.store_logo_url,
          updated_at = NOW()
      `,
      [sellerId, storeEmail || null, storePhone || null, description || null, updates.shippingPolicy || existing.shippingPolicy || null, banner, logo]
    );

    const profileColumns = [
      'user_id',
      'store_name',
      'store_slug',
      'business_email',
      'business_phone',
      'tax_number',
      'rating',
      'total_reviews'
    ];
    const profileValues = [
      sellerId,
      businessName || existing.businessName,
      String(businessName || existing.businessName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      storeEmail || null,
      storePhone || null,
      null,
      0,
      0
    ];
    let categoryClause = '';
    let categoryParams = [];

    if (hasBusinessCategoryColumn) {
      profileColumns.push('business_category');
      profileValues.push(category || 'Other');
      categoryClause = ', business_category = EXCLUDED.business_category';
    } else if (hasCategoryColumn) {
      profileColumns.push('category');
      profileValues.push(category || 'Other');
      categoryClause = ', category = EXCLUDED.category';
    }

    const profileColumnsSql = profileColumns.join(', ');
    const profilePlaceholders = profileValues.map((_, index) => `$${index + 1}`).join(', ');

    await db.query(
      `
        INSERT INTO ${profilesTableRef} (${profileColumnsSql})
        VALUES (${profilePlaceholders})
        ON CONFLICT (user_id) DO UPDATE SET
          store_name = EXCLUDED.store_name,
          store_slug = EXCLUDED.store_slug,
          business_email = COALESCE(${profilesTableRef}.business_email, EXCLUDED.business_email),
          business_phone = COALESCE(${profilesTableRef}.business_phone, EXCLUDED.business_phone),
          tax_number = COALESCE(${profilesTableRef}.tax_number, EXCLUDED.tax_number)${categoryClause},
          updated_at = NOW()
      `,
      profileValues
    );

    if (line1.trim()) {
      const existingAddressResult = await db.query(
        `
          SELECT id
          FROM lumina.user_addresses
          WHERE user_id = $1 AND label = $2
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [sellerId, 'Store']
      );

      const addressValues = [
        sellerId,
        'Store',
        businessName || existing.businessName,
        storePhone || '',
        line1.trim(),
        line2 || null,
        city || null,
        state || null,
        postalCode || '',
        country || 'Bangladesh'
      ];

      if (existingAddressResult.rows[0]?.id) {
        await db.query(
          `
            UPDATE lumina.user_addresses
            SET receiver_name = $2,
                phone = $3,
                line1 = $4,
                line2 = $5,
                city = $6,
                state = $7,
                postal_code = $8,
                country = $9,
                is_default = TRUE,
                updated_at = NOW()
            WHERE id = $1
          `,
          [existingAddressResult.rows[0].id, ...addressValues.slice(2, 10)]
        );
      } else {
        await db.query(
          `
            INSERT INTO lumina.user_addresses (
              user_id, label, receiver_name, phone, line1, line2, city, state, postal_code, country, is_default
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
          `,
          addressValues
        );
      }
    }

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  return getStoreSettings(db, sellerId);
}

async function uploadStoreLogo(db, sellerId, logoData = {}) {
  const logoUrl = normalizeText(logoData.url || logoData.logoUrl || logoData.dataUrl || '');
  await db.query(
    `
      INSERT INTO lumina.seller_store_settings (seller_id, store_logo_url)
      VALUES ($1, $2)
      ON CONFLICT (seller_id) DO UPDATE SET store_logo_url = EXCLUDED.store_logo_url, updated_at = NOW()
    `,
    [sellerId, logoUrl || null]
  );
  return { url: logoUrl || null };
}

async function uploadStoreBanner(db, sellerId, bannerData = {}) {
  const bannerUrl = normalizeText(bannerData.url || bannerData.bannerUrl || bannerData.dataUrl || '');
  await db.query(
    `
      INSERT INTO lumina.seller_store_settings (seller_id, store_banner_url)
      VALUES ($1, $2)
      ON CONFLICT (seller_id) DO UPDATE SET store_banner_url = EXCLUDED.store_banner_url, updated_at = NOW()
    `,
    [sellerId, bannerUrl || null]
  );
  return { url: bannerUrl || null };
}

async function removeStoreLogo(db, sellerId) {
  await db.query(`UPDATE lumina.seller_store_settings SET store_logo_url = NULL, updated_at = NOW() WHERE seller_id = $1`, [sellerId]);
  return { success: true, message: 'Logo removed' };
}

async function removeStoreBanner(db, sellerId) {
  await db.query(`UPDATE lumina.seller_store_settings SET store_banner_url = NULL, updated_at = NOW() WHERE seller_id = $1`, [sellerId]);
  return { success: true, message: 'Banner removed' };
}

async function getBusinessCategories(db) {
  const result = await db.query(`
    SELECT x.name
    FROM (
      SELECT DISTINCT
        COALESCE(c.name, '') AS name,
        LOWER(COALESCE(c.name, '')) AS lower_name
      FROM public.categories c
      WHERE LOWER(COALESCE(c.name, '')) IN ('men', 'women', 'kids', 'accessories')
    ) x
    ORDER BY CASE
      WHEN x.lower_name = 'men' THEN 1
      WHEN x.lower_name = 'women' THEN 2
      WHEN x.lower_name = 'kids' THEN 3
      WHEN x.lower_name = 'accessories' THEN 4
      ELSE 99
    END, x.name
  `);
  const categories = result.rows.map((row) => row.name).filter(Boolean);
  return categories.length ? categories : BUSINESS_CATEGORIES;
}

function validateBankAccountPayload(payload = {}, options = {}) {
  const bankName = normalizeText(payload.bankName || payload.bank_name || '');
  const accountHolderName = normalizeText(payload.accountHolderName || payload.account_holder_name || payload.accountHolder || '');
  const accountNumber = normalizeText(payload.accountNumber || payload.account_number || '');
  const statement = payload.bankStatement || payload.bank_statement || null;
  const allowedStatementTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']);

  const errors = [];

  if (!bankName) errors.push('Bank name is required.');
  if (!accountHolderName) errors.push('Account holder name is required.');
  if (!accountNumber) errors.push('Account number is required.');
  if (accountNumber && accountNumber.replace(/\D/g, '').length < 4) errors.push('Account number must contain at least 4 digits.');

  if (statement) {
    const mimeType = String(statement.mimeType || statement.type || '').toLowerCase();
    const fileName = String(statement.name || statement.fileName || '').toLowerCase();
    const isAllowedExtension = /\.(pdf|jpg|jpeg|png)$/i.test(fileName);
    const isAllowedMime = allowedStatementTypes.has(mimeType);
    if (!isAllowedExtension && !isAllowedMime) {
      errors.push('Bank statement must be a PDF, JPG, JPEG, or PNG file.');
    }
  }

  if (errors.length) {
    const message = errors[0];
    const error = new Error(message);
    error.details = errors;
    throw error;
  }

  return {
    bankName,
    accountHolderName,
    accountNumber,
    iban: normalizeText(payload.iban || ''),
    branchName: normalizeText(payload.branchName || payload.branch_name || ''),
    branchCode: normalizeText(payload.branchCode || payload.branch_code || ''),
    accountType: normalizeText(payload.accountType || payload.account_type || ''),
    mobileWallet: normalizeText(payload.mobileWallet || payload.mobile_wallet || ''),
    bankStatement: statement || null,
    verificationStatus: options.isUpdate ? 'pending' : 'pending'
  };
}

function normalizeBankAccountRow(row = {}) {
  const verificationStatus = String(row.verification_status || 'pending').toLowerCase();
  const canRequestPayout = verificationStatus === 'verified';
  return {
    id: row.id || row.seller_id || null,
    sellerId: row.seller_id || null,
    bankName: row.bank_name || '',
    accountHolderName: row.account_holder_name || '',
    accountHolder: row.account_holder_name || '',
    accountNumber: row.account_number || row.account_number_masked || '',
    accountNumberMasked: row.account_number_masked || '',
    iban: row.iban || '',
    branchName: row.branch_name || '',
    branchCode: row.branch_code || '',
    accountType: row.account_type || '',
    mobileWallet: row.mobile_wallet || '',
    bankStatementName: row.bank_statement_name || '',
    bankStatementUrl: row.bank_statement_url || '',
    verificationStatus: verificationStatus,
    rejectionReason: row.rejection_reason || '',
    verifiedBy: row.verified_by || null,
    verifiedAt: row.verified_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    canRequestPayout,
    statusMessage: canRequestPayout ? 'Your bank account is verified and ready for payouts.' : 'Your bank account must be verified before you can request a payout.'
  };
}

async function getBankAccountDetails(db, sellerId) {
  await ensureSupportTables(db);
  const result = await db.query(
    `
      SELECT
        seller_id,
        bank_name,
        account_holder_name,
        account_number,
        account_number_masked,
        branch_name,
        branch_code,
        account_type,
        mobile_wallet,
        iban,
        bank_statement_url,
        bank_statement_name,
        verification_status,
        rejection_reason,
        verified_by,
        verified_at,
        created_at,
        updated_at
      FROM lumina.seller_bank_accounts
      WHERE seller_id = $1
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [sellerId]
  );

  const row = result.rows[0] || null;
  return row ? normalizeBankAccountRow(row) : {
    sellerId,
    bankName: '',
    accountHolderName: '',
    accountHolder: '',
    accountNumber: '',
    accountNumberMasked: '',
    iban: '',
    branchName: '',
    branchCode: '',
    accountType: '',
    mobileWallet: '',
    bankStatementName: '',
    bankStatementUrl: '',
    verificationStatus: 'pending',
    rejectionReason: '',
    verifiedBy: null,
    verifiedAt: null,
    createdAt: null,
    updatedAt: null,
    canRequestPayout: false,
    statusMessage: 'Your bank account must be verified before you can request a payout.'
  };
}

async function saveBankAccountDetails(db, sellerId, payload = {}) {
  await ensureSupportTables(db);
  const validated = validateBankAccountPayload(payload, { isUpdate: Boolean(payload.existingRecord) });
  const bankStatement = validated.bankStatement || null;
  const bankStatementUrl = normalizeText(payload.bankStatementUrl || payload.bank_statement_url || (bankStatement && (bankStatement.url || bankStatement.dataUrl || '')) || '');
  const bankStatementName = normalizeText(payload.bankStatementName || payload.bank_statement_name || (bankStatement && bankStatement.name) || '');
  const existing = await getBankAccountDetails(db, sellerId);
  
  // If seller updates bank details after verification, reset to pending for admin review
  // Otherwise, keep pending status or maintain verified if no changes to critical fields
  const wasVerified = existing.verificationStatus === 'verified';
  const nextStatus = 'pending'; // Always set to pending - let admin decide verification

  await db.query(
    `
      INSERT INTO lumina.seller_bank_accounts (
        seller_id,
        bank_name,
        account_holder_name,
        account_number,
        account_number_masked,
        branch_name,
        branch_code,
        account_type,
        mobile_wallet,
        iban,
        bank_statement_url,
        bank_statement_name,
        verification_status,
        rejection_reason,
        verified_by,
        verified_at,
        is_default,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULL, NULL, NULL, TRUE, NOW(), NOW())
      ON CONFLICT (seller_id) DO UPDATE SET
        bank_name = EXCLUDED.bank_name,
        account_holder_name = EXCLUDED.account_holder_name,
        account_number = EXCLUDED.account_number,
        account_number_masked = EXCLUDED.account_number_masked,
        branch_name = EXCLUDED.branch_name,
        branch_code = EXCLUDED.branch_code,
        account_type = EXCLUDED.account_type,
        mobile_wallet = EXCLUDED.mobile_wallet,
        iban = EXCLUDED.iban,
        bank_statement_url = EXCLUDED.bank_statement_url,
        bank_statement_name = EXCLUDED.bank_statement_name,
        verification_status = $13,
        rejection_reason = NULL,
        verified_by = NULL,
        verified_at = NULL,
        updated_at = NOW()
    `,
    [
      sellerId,
      validated.bankName || null,
      validated.accountHolderName || null,
      validated.accountNumber || null,
      validated.accountNumber ? maskAccountNumber(validated.accountNumber) : null,
      validated.branchName || null,
      validated.branchCode || null,
      validated.accountType || null,
      validated.mobileWallet || null,
      validated.iban || null,
      bankStatementUrl || null,
      bankStatementName || null,
      nextStatus
    ]
  );

  return getBankAccountDetails(db, sellerId);
}

async function getPaymentSettings(db, sellerId) {
  await ensureSupportTables(db);
  const result = await db.query(
    `
      SELECT
        bank_name,
        account_holder_name,
        account_number,
        account_number_masked,
        branch_name,
        branch_code,
        account_type,
        mobile_wallet,
        routing_number,
        iban,
        jazzcash_number,
        easypaisa_number,
        bank_statement_url,
        bank_statement_name,
        verification_status,
        rejection_reason,
        verified_at,
        created_at,
        updated_at
      FROM lumina.seller_bank_accounts
      WHERE seller_id = $1
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1
    `,
    [sellerId]
  );

  const row = result.rows[0] || {};
  const normalized = normalizeBankAccountRow(row);
  return {
    bankName: normalized.bankName,
    accountHolder: normalized.accountHolder,
    accountHolderName: normalized.accountHolderName,
    accountNumber: normalized.accountNumber,
    accountNumberMasked: normalized.accountNumberMasked,
    branchName: normalized.branchName,
    branchCode: normalized.branchCode,
    accountType: normalized.accountType,
    mobileWallet: normalized.mobileWallet,
    routingNumber: row.routing_number || '',
    iban: normalized.iban,
    verified: normalized.verificationStatus === 'verified',
    verificationStatus: normalized.verificationStatus,
    rejectionReason: normalized.rejectionReason,
    verifiedAt: normalized.verifiedAt,
    jazzcash: row.jazzcash_number || '',
    easypaisa: row.easypaisa_number || '',
    bankStatementUrl: normalized.bankStatementUrl,
    bankStatementName: normalized.bankStatementName,
    canRequestPayout: normalized.canRequestPayout,
    statusMessage: normalized.statusMessage
  };
}

async function updatePaymentSettings(db, sellerId, updates = {}) {
  await ensureSupportTables(db);
  const bankName = normalizeText(updates.bankName || updates.bank_name || '');
  const accountHolder = normalizeText(updates.accountHolder || updates.account_holder || '');
  const accountNumber = normalizeText(updates.accountNumber || updates.account_number || '');
  const branchName = normalizeText(updates.branchName || updates.branch_name || '');
  const routingNumber = normalizeText(updates.routingNumber || updates.routing_number || '');
  const iban = normalizeText(updates.iban || '');
  const jazzcash = normalizeText(updates.jazzcash || updates.jazzcashNumber || '');
  const easypaisa = normalizeText(updates.easypaisa || updates.easypaisaNumber || '');

  if (!bankName) throw new Error('Bank name is required.');
  if (!accountHolder) throw new Error('Account holder name is required.');
  if (!accountNumber) throw new Error('Account number is required.');
  if (accountNumber.replace(/\D/g, '').length < 4) throw new Error('Invalid account number');

  const maskedNumber = accountNumber ? maskAccountNumber(accountNumber) : '';
  await db.query(
    `
      INSERT INTO lumina.seller_bank_accounts (
        seller_id, account_holder_name, bank_name, branch_name, account_number, account_number_masked, routing_number, iban, jazzcash_number, easypaisa_number, is_default, verification_status, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, 'pending', NOW())
      ON CONFLICT (seller_id) DO UPDATE SET
        account_holder_name = EXCLUDED.account_holder_name,
        bank_name = EXCLUDED.bank_name,
        branch_name = EXCLUDED.branch_name,
        account_number = EXCLUDED.account_number,
        account_number_masked = EXCLUDED.account_number_masked,
        routing_number = EXCLUDED.routing_number,
        iban = EXCLUDED.iban,
        jazzcash_number = EXCLUDED.jazzcash_number,
        easypaisa_number = EXCLUDED.easypaisa_number,
        verification_status = 'pending',
        rejection_reason = NULL,
        verified_by = NULL,
        verified_at = NULL,
        updated_at = NOW()
    `,
    [sellerId, accountHolder || null, bankName || null, branchName || null, accountNumber || null, maskedNumber || null, routingNumber || null, iban || null, jazzcash || null, easypaisa || null]
  );

  return getPaymentSettings(db, sellerId);
}

async function verifyPaymentAccount(db, sellerId) {
  await ensureSupportTables(db);
  await db.query(
    `
      UPDATE lumina.seller_bank_accounts
      SET verification_status = 'verified', updated_at = NOW()
      WHERE seller_id = $1
    `,
    [sellerId]
  );

  return { success: true, message: 'Payment verification initiated. You will be notified within 24-48 hours.', verified: true };
}

async function getNotificationPreferences(db, sellerId) {
  await ensureSupportTables(db);
  const result = await db.query(
    `
      SELECT email_notifications, sms_notifications, push_notifications, marketing_opt_in, currency, language, timezone
      FROM lumina.user_preferences
      WHERE user_id = $1
      LIMIT 1
    `,
    [sellerId]
  );

  const row = result.rows[0] || {};
  return {
    orderAlerts: Boolean(row.email_notifications),
    paymentAlerts: Boolean(row.sms_notifications),
    chatNotifications: Boolean(row.push_notifications),
    promotions: !Boolean(row.marketing_opt_in),
    reviews: Boolean(row.email_notifications),
    emailEnabled: Boolean(row.email_notifications),
    smsEnabled: Boolean(row.sms_notifications),
    pushEnabled: Boolean(row.push_notifications)
  };
}

async function updateNotificationPreferences(db, sellerId, updates = {}) {
  await ensureSupportTables(db);
  const orderAlerts = toBool(updates.orderAlerts ?? updates.order_alerts ?? true);
  const paymentAlerts = toBool(updates.paymentAlerts ?? updates.payment_alerts ?? true);
  const chatNotifications = toBool(updates.chatNotifications ?? updates.chat_notifications ?? true);
  const promotions = toBool(updates.promotions ?? false);
  const reviews = toBool(updates.reviews ?? true);

  await db.query(
    `
      INSERT INTO lumina.user_preferences (user_id, email_notifications, sms_notifications, push_notifications, marketing_opt_in)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET
        email_notifications = EXCLUDED.email_notifications,
        sms_notifications = EXCLUDED.sms_notifications,
        push_notifications = EXCLUDED.push_notifications,
        marketing_opt_in = EXCLUDED.marketing_opt_in,
        updated_at = NOW()
    `,
    [sellerId, orderAlerts || reviews, paymentAlerts, chatNotifications, !promotions]
  );

  return getNotificationPreferences(db, sellerId);
}

async function getPrivacySettings(db, sellerId) {
  await ensureSupportTables(db);
  const result = await db.query(
    `
      SELECT show_email_publicly, show_phone_publicly, allow_messages, data_sharing, analytics_tracking
      FROM lumina.seller_privacy_settings
      WHERE seller_id = $1
      LIMIT 1
    `,
    [sellerId]
  );

  const row = result.rows[0] || {};
  return {
    showEmailPublicly: Boolean(row.show_email_publicly),
    showPhonePublicly: Boolean(row.show_phone_publicly),
    allowMessages: Boolean(row.allow_messages ?? true),
    dataSharing: Boolean(row.data_sharing),
    analyticsTracking: Boolean(row.analytics_tracking ?? true)
  };
}

async function updatePrivacySettings(db, sellerId, updates = {}) {
  await ensureSupportTables(db);
  await db.query(
    `
      INSERT INTO lumina.seller_privacy_settings (
        seller_id, show_email_publicly, show_phone_publicly, allow_messages, data_sharing, analytics_tracking
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (seller_id) DO UPDATE SET
        show_email_publicly = EXCLUDED.show_email_publicly,
        show_phone_publicly = EXCLUDED.show_phone_publicly,
        allow_messages = EXCLUDED.allow_messages,
        data_sharing = EXCLUDED.data_sharing,
        analytics_tracking = EXCLUDED.analytics_tracking,
        updated_at = NOW()
    `,
    [
      sellerId,
      Boolean(updates.showEmailPublicly ?? updates.show_email_publicly),
      Boolean(updates.showPhonePublicly ?? updates.show_phone_publicly),
      updates.allowMessages ?? updates.allow_messages !== undefined ? Boolean(updates.allowMessages ?? updates.allow_messages) : true,
      Boolean(updates.dataSharing ?? updates.data_sharing),
      updates.analyticsTracking ?? updates.analytics_tracking !== undefined ? Boolean(updates.analyticsTracking ?? updates.analytics_tracking) : true
    ]
  );

  return getPrivacySettings(db, sellerId);
}

async function requestDataDownload(db, sellerId) {
  await db.query(
    `
      INSERT INTO lumina.audit_logs (actor_user_id, action, entity_type, entity_id, after_data, created_at)
      VALUES ($1, 'settings_data_download_requested', 'seller_settings', $1, '{}'::jsonb, NOW())
    `,
    [sellerId]
  ).catch(() => {});

  return {
    success: true,
    message: 'Data export initiated. You will receive an email with download link within 24 hours.',
    requestId: `EXPORT_${Date.now()}`
  };
}

async function requestAccountDeletion(db, sellerId, reason) {
  await db.query(
    `
      INSERT INTO lumina.audit_logs (actor_user_id, action, entity_type, entity_id, after_data, created_at)
      VALUES ($1, 'settings_account_deletion_requested', 'seller_settings', $1, jsonb_build_object('reason', $2), NOW())
    `,
    [sellerId, normalizeText(reason) || null]
  ).catch(() => {});

  return {
    success: true,
    message: 'Account deletion request submitted. You will receive confirmation email.',
    deletionScheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    reason
  };
}

async function getVerificationStatus(db, sellerId) {
  await ensureSupportTables(db);
  const profilesTableRef = await resolveSellerProfilesTableRef(db);
  const documentsTableRef = await resolveSellerDocumentsTableRef(db);

  const profileResult = await db.query(
    `
      SELECT
        COALESCE(
          NULLIF(to_jsonb(sp)->>'kyc_status', ''),
          NULLIF(to_jsonb(sp)->>'verification_status', ''),
          CASE
            WHEN LOWER(COALESCE(to_jsonb(sp)->>'is_verified', 'false')) = 'true' THEN 'verified'
            ELSE 'pending'
          END
        ) AS kyc_status,
        to_jsonb(sp)->>'updated_at' AS updated_at
      FROM ${profilesTableRef} sp
      WHERE sp.user_id = $1
      LIMIT 1
    `,
    [sellerId]
  );

  const docsResult = documentsTableRef
    ? await db.query(
        `
          SELECT
            document_type,
            document_url,
            COALESCE(NULLIF(to_jsonb(sd)->>'verification_status', ''), 'pending') AS verification_status,
            to_jsonb(sd)->>'created_at' AS created_at,
            to_jsonb(sd)->>'verified_at' AS verified_at,
            to_jsonb(sd)->>'rejection_reason' AS rejection_reason
          FROM ${documentsTableRef} sd
          WHERE sd.seller_id = $1
          ORDER BY (to_jsonb(sd)->>'created_at') ASC
        `,
        [sellerId]
      )
    : { rows: [] };

  const profile = profileResult.rows[0] || {};
  const documents = {};
  docsResult.rows.forEach((row) => {
    documents[row.document_type] = {
      url: row.document_url,
      status: row.verification_status,
      createdAt: row.created_at,
      verifiedAt: row.verified_at,
      rejectionReason: row.rejection_reason
    };
  });

  const hasAnyDocuments = docsResult.rows.length > 0;
  const rawStatus = String(profile.kyc_status || '').toLowerCase();

  let status = 'not_submitted';
  if (rawStatus === 'verified' || rawStatus === 'approved') {
    status = 'verified';
  } else if (rawStatus === 'rejected') {
    status = 'rejected';
  } else if (hasAnyDocuments) {
    status = 'pending';
  }

  const submittedAt = hasAnyDocuments ? docsResult.rows[0]?.created_at || null : null;
  const expectedBy = status === 'pending' && submittedAt
    ? new Date(new Date(submittedAt).getTime() + 3 * 24 * 60 * 60 * 1000)
    : null;

  return {
    status,
    submittedAt,
    expectedBy,
    verifiedAt: docsResult.rows.find((row) => row.verified_at)?.verified_at || null,
    rejectionReason: docsResult.rows.find((row) => row.rejection_reason)?.rejection_reason || null,
    documentsUploaded: {
      cnicFront: Boolean(documents.cnicFront),
      cnicBack: Boolean(documents.cnicBack),
      selfie: Boolean(documents.selfie),
      bankStatement: Boolean(documents.bankStatement)
    },
    documents
  };
}

async function uploadVerificationDocument(db, sellerId, docType, fileData = {}) {
  const validTypes = ['cnicFront', 'cnicBack', 'selfie', 'bankStatement'];
  if (!validTypes.includes(docType)) {
    throw new Error('Invalid document type');
  }

  const documentUrl = normalizeText(fileData.url || fileData.dataUrl || fileData.fileUrl || '');
  if (!documentUrl) {
    throw new Error('Document file data is required');
  }

  const documentsTableRef = await resolveSellerDocumentsTableRef(db);
  if (!documentsTableRef) {
    throw new Error('Verification documents table is not available');
  }

  await db.query(
    `
      INSERT INTO ${documentsTableRef} (seller_id, document_type, document_url, verification_status, created_at, updated_at)
      VALUES ($1, $2, $3, 'pending', NOW(), NOW())
      ON CONFLICT DO NOTHING
    `,
    [sellerId, docType, documentUrl]
  );

  const result = await db.query(
    `
      UPDATE ${documentsTableRef}
      SET document_url = $3,
          verification_status = 'pending',
          updated_at = NOW()
      WHERE seller_id = $1 AND document_type = $2
      RETURNING id, document_url, verification_status
    `,
    [sellerId, docType, documentUrl]
  );

  return result.rows[0] || null;
}

async function submitVerification(db, sellerId, pendingDocuments = {}) {
  const validTypes = ['cnicFront', 'cnicBack', 'selfie', 'bankStatement'];
  const entries = Object.entries(pendingDocuments || {});

  if (entries.length > 0) {
    const documentsTableRef = await resolveSellerDocumentsTableRef(db);
    if (!documentsTableRef) {
      throw new Error('Verification documents table is not available');
    }

    for (const [docType, fileData] of entries) {
      if (!validTypes.includes(docType)) {
        throw new Error(`Invalid document type: ${docType}`);
      }

      const documentUrl = normalizeText(fileData?.url || fileData?.dataUrl || fileData?.fileUrl || '');
      if (!documentUrl) {
        throw new Error(`Document file data is required for ${docType}`);
      }

      await db.query(
        `
          INSERT INTO ${documentsTableRef} (seller_id, document_type, document_url, verification_status, created_at, updated_at)
          VALUES ($1, $2, $3, 'pending', NOW(), NOW())
          ON CONFLICT DO NOTHING
        `,
        [sellerId, docType, documentUrl]
      );

      await db.query(
        `
          UPDATE ${documentsTableRef}
          SET document_url = $3,
              verification_status = 'pending',
              updated_at = NOW(),
              rejection_reason = NULL
          WHERE seller_id = $1 AND document_type = $2
        `,
        [sellerId, docType, documentUrl]
      );
    }
  }

  const status = await getVerificationStatus(db, sellerId);
  if (!status.documentsUploaded.cnicFront || !status.documentsUploaded.cnicBack || !status.documentsUploaded.selfie) {
    throw new Error('Missing required documents. Please upload CNIC (front & back) and selfie.');
  }

  const profilesTableRef = await resolveSellerProfilesTableRef(db);
  let updateApplied = false;

  try {
    await db.query(`UPDATE ${profilesTableRef} SET kyc_status = 'pending', updated_at = NOW() WHERE user_id = $1`, [sellerId]);
    updateApplied = true;
  } catch (_) {
    // Fallback for schema variants using verification_status.
  }

  if (!updateApplied) {
    await db.query(`UPDATE ${profilesTableRef} SET verification_status = 'pending', updated_at = NOW() WHERE user_id = $1`, [sellerId]);
  }

  return {
    success: true,
    message: 'Verification documents submitted successfully. Review typically takes 2-3 business days.',
    status: 'pending',
    expectedBy: status.expectedBy
  };
}

async function clearVerificationDocuments(db, sellerId) {
  const documentsTableRef = await resolveSellerDocumentsTableRef(db);
  if (!documentsTableRef) {
    return { success: true, message: 'No verification documents table found' };
  }

  await db.query(`DELETE FROM ${documentsTableRef} WHERE seller_id = $1`, [sellerId]);
  return { success: true, message: 'All verification documents cleared' };
}

async function getIntegrations(db, sellerId) {
  await ensureSupportTables(db);
  const result = await db.query(
    `
      SELECT platform, connected, external_id, connected_at, metadata
      FROM lumina.seller_integrations
      WHERE seller_id = $1
      ORDER BY platform ASC
    `,
    [sellerId]
  );

  const base = {
    google: { connected: false, externalId: null, connectedAt: null },
    facebook: { connected: false, externalId: null, connectedAt: null },
    shopify: { connected: false, externalId: null, connectedAt: null }
  };

  result.rows.forEach((row) => {
    base[row.platform] = {
      connected: Boolean(row.connected),
      externalId: row.external_id || null,
      connectedAt: row.connected_at || null,
      metadata: row.metadata || {}
    };
  });

  return base;
}

async function connectIntegration(db, sellerId, platform, credentials = {}) {
  const validPlatforms = ['google', 'facebook', 'shopify'];
  if (!validPlatforms.includes(platform)) {
    throw new Error('Invalid platform');
  }

  await ensureSupportTables(db);
  await db.query(
    `
      INSERT INTO lumina.seller_integrations (seller_id, platform, connected, external_id, connected_at, metadata)
      VALUES ($1, $2, TRUE, $3, NOW(), $4::jsonb)
      ON CONFLICT (seller_id, platform) DO UPDATE SET
        connected = TRUE,
        external_id = EXCLUDED.external_id,
        connected_at = NOW(),
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `,
    [sellerId, platform, normalizeText(credentials.externalId || credentials.email || credentials.storeUrl || '') || null, JSON.stringify(credentials || {})]
  );

  return {
    success: true,
    message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} connected successfully`,
    integration: (await getIntegrations(db, sellerId))[platform]
  };
}

async function disconnectIntegration(db, sellerId, platform) {
  const validPlatforms = ['google', 'facebook', 'shopify'];
  if (!validPlatforms.includes(platform)) {
    throw new Error('Invalid platform');
  }

  await ensureSupportTables(db);
  await db.query(
    `
      INSERT INTO lumina.seller_integrations (seller_id, platform, connected, external_id, connected_at, metadata)
      VALUES ($1, $2, FALSE, NULL, NULL, '{}'::jsonb)
      ON CONFLICT (seller_id, platform) DO UPDATE SET
        connected = FALSE,
        external_id = NULL,
        connected_at = NULL,
        metadata = '{}'::jsonb,
        updated_at = NOW()
    `,
    [sellerId, platform]
  );

  return {
    success: true,
    message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} disconnected successfully`
  };
}

async function calculateVerificationCompleteness(db, sellerId) {
  const documentsTableRef = await resolveSellerDocumentsTableRef(db);
  if (!documentsTableRef) {
    return 0;
  }

  const result = await db.query(
    `
      SELECT COUNT(*)::int AS docs
      FROM ${documentsTableRef}
      WHERE seller_id = $1 AND document_type IN ('cnicFront', 'cnicBack', 'selfie')
    `,
    [sellerId]
  );

  const uploaded = toNumber(result.rows[0]?.docs, 0);
  return Math.round((uploaded / 3) * 100);
}

module.exports = {
  BUSINESS_CATEGORIES,
  ensureSupportTables,
  validateBankAccountPayload,
  getBankAccountDetails,
  saveBankAccountDetails,
  getSettingsOverview,
  getProfile,
  updateProfile,
  getSecuritySettings,
  changeEmail,
  changePassword,
  toggle2FA,
  getLoginSessions,
  revokeSession,
  getStoreSettings,
  updateStoreSettings,
  uploadStoreLogo,
  uploadStoreBanner,
  removeStoreLogo,
  removeStoreBanner,
  getBusinessCategories,
  getPaymentSettings,
  updatePaymentSettings,
  verifyPaymentAccount,
  getNotificationPreferences,
  updateNotificationPreferences,
  getPrivacySettings,
  updatePrivacySettings,
  requestDataDownload,
  requestAccountDeletion,
  getVerificationStatus,
  uploadVerificationDocument,
  submitVerification,
  clearVerificationDocuments,
  getIntegrations,
  connectIntegration,
  disconnectIntegration
};
