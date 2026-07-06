const crypto = require('crypto');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function avatarUrl(name) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=random&size=80`;
}

function getRisk(role, refundCount, refundAmount) {
  if (role !== 'customer') return 'low';
  if (refundCount >= 5 || refundAmount >= 5000) return 'high';
  if (refundCount >= 2 || refundAmount >= 1000) return 'medium';
  return 'low';
}

function isKycVerified(status) {
  return status === 'verified' || status === 'approved';
}

function normalizeKycStatus(status) {
  if (isKycVerified(status)) return 'verified';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function getPayoutStatus(role, kycStatus, payoutStatus) {
  if (role !== 'seller') return null;
  if (!isKycVerified(kycStatus)) return 'frozen';
  if (payoutStatus === 'paid') return 'available';
  if (payoutStatus === 'processing') return 'processing';
  if (payoutStatus === 'failed') return 'frozen';
  return 'pending';
}

async function fetchUsers(db) {
  const result = await db.query(`
    WITH customer_metrics AS (
      SELECT
        o.customer_id AS user_id,
        COUNT(*)::int AS orders_count,
        COALESCE(SUM(o.grand_total), 0)::numeric(12,2) AS total_value
      FROM public.orders o
      GROUP BY o.customer_id
    ),
    refund_metrics AS (
      SELECT
        rr.customer_id AS user_id,
        COUNT(rf.id)::int AS refunds_count,
        COALESCE(SUM(rf.amount), 0)::numeric(12,2) AS refund_amount
      FROM public.return_requests rr
      LEFT JOIN public.refunds rf ON rf.return_request_id = rr.id
      GROUP BY rr.customer_id
    ),
    seller_product_metrics AS (
      SELECT
        p.seller_id AS user_id,
        COUNT(*)::int AS products_count
      FROM public.products p
      GROUP BY p.seller_id
    ),
    seller_sales_metrics AS (
      SELECT
        oi.seller_id AS user_id,
        COALESCE(SUM(oi.quantity), 0)::int AS sales_count,
        COALESCE(SUM(oi.line_total), 0)::numeric(12,2) AS sales_value
      FROM public.order_items oi
      GROUP BY oi.seller_id
    ),
    latest_payout AS (
      SELECT DISTINCT ON (seller_id)
        seller_id,
        status AS payout_status
      FROM public.seller_payouts
      ORDER BY seller_id, created_at DESC
    ),
    latest_note AS (
      SELECT DISTINCT ON (entity_id)
        entity_id AS user_id,
        COALESCE(NULLIF(after_data->>'notes', ''), NULLIF(before_data->>'notes', ''), '') AS notes
      FROM public.audit_logs
      WHERE entity_type = 'user'
        AND entity_id IS NOT NULL
        AND action IN ('notes_updated', 'user_note_updated')
      ORDER BY entity_id, created_at DESC
    ),
    latest_ip AS (
      SELECT
        entity_id AS user_id,
        ARRAY_AGG(ip_address::text ORDER BY created_at DESC) AS ip_history
      FROM public.audit_logs
      WHERE entity_type = 'user'
        AND entity_id IS NOT NULL
        AND ip_address IS NOT NULL
      GROUP BY entity_id
    )
    SELECT
      u.id,
      u.full_name AS name,
      u.email,
      u.phone,
      u.role,
      u.status,
      u.created_at,
      u.last_login_at,
      COALESCE(cm.orders_count, 0) AS orders,
      COALESCE(cm.total_value, 0) AS value,
      COALESCE(rm.refunds_count, 0) AS refunds,
      COALESCE(rm.refund_amount, 0) AS refund_amount,
      CASE
        WHEN u.role = 'customer' THEN CASE
          WHEN COALESCE(rm.refunds_count, 0) >= 5 OR COALESCE(rm.refund_amount, 0) >= 5000 THEN 'high'
          WHEN COALESCE(rm.refunds_count, 0) >= 2 OR COALESCE(rm.refund_amount, 0) >= 1000 THEN 'medium'
          ELSE 'low'
        END
        ELSE 'low'
      END AS risk,
      COALESCE(sm.products_count, 0) AS products,
      COALESCE(ssales.sales_count, 0) AS sales,
      COALESCE(ROUND(COALESCE(ssales.sales_value, 0) * 0.05, 2), 0)::numeric(12,2) AS commission,
      COALESCE(sp.kyc_status, 'pending') AS kyc,
      lp.payout_status,
      COALESCE(ss.store_logo_url, '') AS logo,
      COALESCE(ln.notes, '') AS notes,
      COALESCE(li.ip_history, ARRAY[]::text[]) AS ip_history,
      COALESCE(sec.two_factor_enabled, false) AS two_factor_enabled,
      COALESCE(prefs.marketing_opt_in, false) AS newsletter,
      COALESCE(prefs.sms_notifications, false) AS sms_notifications,
      COALESCE(prefs.email_notifications, false) AS email_notifications,
      COALESCE(u.email_verified_at IS NOT NULL, false) AS email_verified
    FROM public.users u
    LEFT JOIN customer_metrics cm ON cm.user_id = u.id
    LEFT JOIN refund_metrics rm ON rm.user_id = u.id
    LEFT JOIN seller_product_metrics sm ON sm.user_id = u.id
    LEFT JOIN seller_sales_metrics ssales ON ssales.user_id = u.id
    LEFT JOIN public.seller_profiles sp ON sp.user_id = u.id
    LEFT JOIN public.seller_store_settings ss ON ss.seller_id = u.id
    LEFT JOIN latest_payout lp ON lp.seller_id = u.id
    LEFT JOIN latest_note ln ON ln.user_id = u.id
    LEFT JOIN latest_ip li ON li.user_id = u.id
    LEFT JOIN public.user_security_settings sec ON sec.user_id = u.id
    LEFT JOIN public.user_preferences prefs ON prefs.user_id = u.id
    ORDER BY u.created_at DESC
  `);

  return result.rows.map((row) => {
    const risk = getRisk(row.role, toNumber(row.refunds), toNumber(row.refund_amount));
    const normalizedKyc = normalizeKycStatus(row.kyc);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone || '',
      role: row.role,
      status: row.status,
      registered: formatDate(row.created_at),
      lastLogin: formatDate(row.last_login_at),
      orders: toNumber(row.orders),
      value: toNumber(row.value),
      refunds: toNumber(row.refunds),
      risk,
      products: toNumber(row.products),
      sales: toNumber(row.sales),
      commission: toNumber(row.commission),
      kyc: row.role === 'seller' ? normalizedKyc : null,
      payout: getPayoutStatus(row.role, normalizedKyc, row.payout_status),
      logo: row.logo || avatarUrl(row.name),
      notes: row.notes || '',
      ipHistory: Array.isArray(row.ip_history) ? row.ip_history.filter(Boolean) : [],
      activity: [],
      passwordResetToken: null,
      emailVerified: Boolean(row.email_verified),
      phoneVerified: false,
      twoFactorEnabled: Boolean(row.two_factor_enabled),
      preferences: {
        newsletter: Boolean(row.newsletter),
        smsNotifications: Boolean(row.sms_notifications),
        emailNotifications: Boolean(row.email_notifications)
      }
    };
  });
}

function filterUsers(users, query = {}) {
  let filtered = [...users];

  if (query.search) {
    const term = String(query.search).toLowerCase();
    filtered = filtered.filter((user) =>
      [user.name, user.email, user.phone, user.id].some((value) => String(value || '').toLowerCase().includes(term))
    );
  }

  if (query.role && query.role !== 'all') {
    filtered = filtered.filter((user) => user.role === query.role);
  }

  if (query.status && query.status !== 'all') {
    filtered = filtered.filter((user) => user.status === query.status);
  }

  if (query.kyc && query.kyc !== 'all') {
    filtered = filtered.filter((user) => user.role === 'seller' && user.kyc === query.kyc);
  }

  if (query.risk && query.risk !== 'all') {
    filtered = filtered.filter((user) => user.risk === query.risk);
  }

  if (query.tab && query.tab !== 'all') {
    if (query.tab === 'customer') filtered = filtered.filter((user) => user.role === 'customer');
    if (query.tab === 'seller') filtered = filtered.filter((user) => user.role === 'seller');
    if (query.tab === 'suspended') filtered = filtered.filter((user) => user.status === 'suspended');
    if (query.tab === 'banned') filtered = filtered.filter((user) => user.status === 'banned');
    if (query.tab === 'kycPending') filtered = filtered.filter((user) => user.role === 'seller' && user.kyc === 'pending');
  }

  const sortBy = query.sortBy || 'registered';
  const sortDir = query.sortDir === 'asc' ? 'asc' : 'desc';
  filtered.sort((a, b) => {
    const numericFields = new Set(['orders', 'value', 'refunds', 'products', 'sales', 'commission']);
    const aVal = numericFields.has(sortBy) ? toNumber(a[sortBy]) : String(a[sortBy] ?? '');
    const bVal = numericFields.has(sortBy) ? toNumber(b[sortBy]) : String(b[sortBy] ?? '');
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.max(1, Math.min(parseInt(query.pageSize, 10) || filtered.length || 1, 1000));
  const start = (page - 1) * pageSize;

  return {
    users: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(filtered.length / pageSize))
  };
}

async function getOverviewStats(db) {
  const users = await fetchUsers(db);
  const total = users.length;
  const customers = users.filter((user) => user.role === 'customer').length;
  const sellers = users.filter((user) => user.role === 'seller').length;
  const active = users.filter((user) => user.status === 'active').length;
  const suspended = users.filter((user) => user.status === 'suspended').length;
  const banned = users.filter((user) => user.status === 'banned').length;
  const kycPending = users.filter((user) => user.role === 'seller' && user.kyc === 'pending').length;
  const kycApproved = users.filter((user) => user.role === 'seller' && isKycVerified(user.kyc)).length;
  const kycRejected = users.filter((user) => user.role === 'seller' && user.kyc === 'rejected').length;
  const highRisk = users.filter((user) => user.risk === 'high').length;
  const totalOrders = users.reduce((sum, user) => sum + toNumber(user.orders), 0);
  const totalValue = users.reduce((sum, user) => sum + toNumber(user.value), 0);
  const totalRefunds = users.reduce((sum, user) => sum + toNumber(user.refunds), 0);
  const totalCommission = users.reduce((sum, user) => sum + toNumber(user.commission), 0);

  return {
    total,
    customers,
    sellers,
    active,
    suspended,
    banned,
    kycPending,
    kycApproved,
    kycRejected,
    highRisk,
    totalOrders,
    totalValue: totalValue.toFixed(2),
    totalRefunds,
    totalCommission: totalCommission.toFixed(2)
  };
}

async function getUserById(db, userId) {
  const users = await fetchUsers(db);
  const user = users.find((entry) => String(entry.id) === String(userId));
  if (!user) return null;

  const activity = await getActivity(db, userId, 50);
  const ipHistoryResult = await db.query(
    `
      SELECT ip_address::text AS ip_address
      FROM public.audit_logs
      WHERE entity_type = 'user'
        AND entity_id = $1
        AND ip_address IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 5
    `,
    [userId]
  );

  return {
    ...user,
    ipHistory: ipHistoryResult.rows.map((row) => row.ip_address).filter(Boolean),
    activity
  };
}

async function logAudit(db, action, userId, adminId = 'SYSTEM', beforeData = null, afterData = null, notes = '', ipAddress = null) {
  const actorUserId = /^[0-9a-fA-F-]{36}$/.test(String(adminId || '')) ? adminId : null;
  await db.query(
    `
      INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, before_data, after_data, ip_address, user_agent)
      VALUES ($1, $2, 'user', $3, $4, $5, $6, $7)
    `,
    [actorUserId, action, userId, beforeData, afterData, ipAddress, notes || 'Admin UI']
  );
}

async function updateStatus(db, userId, status, adminId = 'SYSTEM', reason = '', notes = '') {
  const current = await db.query('SELECT status FROM public.users WHERE id = $1 LIMIT 1', [userId]);
  if (!current.rows.length) throw new Error('User not found');

  const previousStatus = current.rows[0].status;
  await db.query('UPDATE public.users SET status = $2, updated_at = NOW() WHERE id = $1', [userId, status]);
  await logAudit(
    db,
    `status_changed_${status}`,
    userId,
    adminId,
    { status: previousStatus },
    { status },
    `Changed from ${previousStatus} to ${status}. Reason: ${reason}. ${notes}`.trim()
  );
  return getUserById(db, userId);
}

async function updateRole(db, userId, role, adminId = 'SYSTEM', notes = '') {
  const current = await db.query('SELECT role FROM public.users WHERE id = $1 LIMIT 1', [userId]);
  if (!current.rows.length) throw new Error('User not found');

  const previousRole = current.rows[0].role;
  await db.query('UPDATE public.users SET role = $2, updated_at = NOW() WHERE id = $1', [userId, role]);
  await logAudit(db, 'role_changed', userId, adminId, { role: previousRole }, { role }, `Changed from ${previousRole} to ${role}. ${notes}`.trim());
  return getUserById(db, userId);
}

async function resetPassword(db, userId, adminId = 'SYSTEM', sendEmail = true) {
  const current = await db.query('SELECT id FROM public.users WHERE id = $1 LIMIT 1', [userId]);
  if (!current.rows.length) throw new Error('User not found');

  const token = `RST-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.query(
    `
      INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt]
  );
  await logAudit(db, 'password_reset', userId, adminId, null, null, sendEmail ? 'Password reset email sent' : 'Password reset token generated');

  return { resetToken: sendEmail ? null : token };
}

async function updateNotes(db, userId, notes, adminId = 'SYSTEM') {
  const user = await getUserById(db, userId);
  if (!user) throw new Error('User not found');
  await logAudit(db, 'notes_updated', userId, adminId, { notes: user.notes || '' }, { notes: notes || '' }, 'Admin notes updated');
  return getUserById(db, userId);
}

async function updatePreferences(db, userId, preferences = {}) {
  const current = await db.query('SELECT user_id FROM public.user_preferences WHERE user_id = $1 LIMIT 1', [userId]);
  const existing = current.rows.length
    ? await db.query('SELECT * FROM public.user_preferences WHERE user_id = $1 LIMIT 1', [userId])
    : { rows: [] };

  const newsletter = preferences.newsletter ?? existing.rows[0]?.marketing_opt_in ?? true;
  const smsNotifications = preferences.smsNotifications ?? existing.rows[0]?.sms_notifications ?? false;
  const emailNotifications = preferences.emailNotifications ?? existing.rows[0]?.email_notifications ?? true;

  await db.query(
    `
      INSERT INTO public.user_preferences (user_id, marketing_opt_in, sms_notifications, email_notifications)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) DO UPDATE
      SET marketing_opt_in = EXCLUDED.marketing_opt_in,
          sms_notifications = EXCLUDED.sms_notifications,
          email_notifications = EXCLUDED.email_notifications,
          updated_at = NOW()
    `,
    [userId, Boolean(newsletter), Boolean(smsNotifications), Boolean(emailNotifications)]
  );

  return getUserById(db, userId);
}

async function toggleTwoFactor(db, userId, enabled, adminId = 'SYSTEM') {
  await db.query(
    `
      INSERT INTO public.user_security_settings (user_id, two_factor_enabled)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE
      SET two_factor_enabled = EXCLUDED.two_factor_enabled,
          updated_at = NOW()
    `,
    [userId, Boolean(enabled)]
  );
  await logAudit(db, enabled ? '2fa_enabled' : '2fa_disabled', userId, adminId, null, { twoFactorEnabled: Boolean(enabled) }, 'Two-factor authentication updated');
  return getUserById(db, userId);
}

async function verifyEmail(db, userId, adminId = 'SYSTEM') {
  await db.query('UPDATE public.users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1', [userId]);
  await logAudit(db, 'email_verified', userId, adminId, null, { emailVerified: true }, 'Email verified by admin');
  return getUserById(db, userId);
}

async function verifyPhone(db, userId, adminId = 'SYSTEM') {
  await logAudit(db, 'phone_verified', userId, adminId, null, { phoneVerified: true }, 'Phone verified by admin');
  return getUserById(db, userId);
}

async function approveKyc(db, userId, adminId = 'SYSTEM', notes = '') {
  const current = await db.query('SELECT kyc_status FROM public.seller_profiles WHERE user_id = $1 LIMIT 1', [userId]);
  if (!current.rows.length) throw new Error('User is not a seller');

  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'account_status' AND e.enumlabel = 'verified'
      ) THEN
        ALTER TYPE account_status ADD VALUE 'verified';
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.query('UPDATE public.seller_profiles SET kyc_status = $2, updated_at = NOW() WHERE user_id = $1', [userId, 'verified']);
  await logAudit(db, 'kyc_approved', userId, adminId, { kycStatus: current.rows[0].kyc_status }, { kycStatus: 'verified' }, notes || 'KYC documents verified and approved');
  return getUserById(db, userId);
}

async function rejectKyc(db, userId, reason, adminId = 'SYSTEM', notes = '') {
  const current = await db.query('SELECT kyc_status FROM public.seller_profiles WHERE user_id = $1 LIMIT 1', [userId]);
  if (!current.rows.length) throw new Error('User is not a seller');
  if (!reason) throw new Error('Rejection reason required');
  await db.query('UPDATE public.seller_profiles SET kyc_status = $2, updated_at = NOW() WHERE user_id = $1', [userId, 'rejected']);
  await logAudit(db, 'kyc_rejected', userId, adminId, { kycStatus: current.rows[0].kyc_status }, { kycStatus: 'rejected' }, `Reason: ${reason}. ${notes}`.trim());
  return getUserById(db, userId);
}

function pickDocument(rows, patterns) {
  const match = rows.find((row) => {
    const type = String(row.document_type || '').toLowerCase();
    return patterns.some((pattern) => type.includes(pattern));
  });
  return match?.document_url || '';
}

async function getSellerKycDetails(db, userId) {
  const seller = await db.query(
    `
      SELECT
        u.id,
        u.full_name,
        u.role,
        COALESCE(sp.tax_number, '') AS cnic,
        COALESCE(sp.kyc_status, 'pending') AS kyc_status
      FROM public.users u
      LEFT JOIN public.seller_profiles sp ON sp.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (!seller.rows.length || seller.rows[0].role !== 'seller') {
    throw new Error('User is not a seller');
  }

  const docs = await db.query(
    `
      SELECT document_type, document_url
      FROM public.seller_documents
      WHERE seller_id = $1
      ORDER BY created_at DESC
    `,
    [userId]
  );

  const rows = docs.rows || [];
  return {
    userId,
    fullName: seller.rows[0].full_name,
    cnic: seller.rows[0].cnic || 'Not provided',
    status: normalizeKycStatus(seller.rows[0].kyc_status),
    documents: {
      cnicFrontUrl: pickDocument(rows, ['cnic_front', 'cnic front', 'front', 'nid_front']),
      cnicBackUrl: pickDocument(rows, ['cnic_back', 'cnic back', 'back', 'nid_back']),
      selfieUrl: pickDocument(rows, ['selfie', 'face', 'photo'])
    }
  };
}

async function updateUserInfo(db, userId, data = {}, adminId = 'SYSTEM') {
  const current = await db.query('SELECT id, full_name, email, phone FROM public.users WHERE id = $1 LIMIT 1', [userId]);
  if (!current.rows.length) throw new Error('User not found');

  const updates = [];
  const params = [];

  if (data.name !== undefined && data.name !== current.rows[0].full_name) {
    params.push(data.name);
    updates.push(`full_name = $${params.length}`);
  }

  if (data.email !== undefined && data.email !== current.rows[0].email) {
    params.push(data.email);
    updates.push(`email = $${params.length}`);
  }

  if (data.phone !== undefined && data.phone !== current.rows[0].phone) {
    params.push(data.phone);
    updates.push(`phone = $${params.length}`);
  }

  if (updates.length) {
    params.push(userId);
    await db.query(`UPDATE public.users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params);
  }

  await logAudit(db, 'info_updated', userId, adminId, current.rows[0], data, 'User information updated');
  return getUserById(db, userId);
}

async function getActivity(db, userId, limit = 50) {
  const result = await db.query(
    `
      SELECT
        action,
        created_at AS timestamp,
        COALESCE(actor_user_id::text, 'SYSTEM') AS admin,
        COALESCE(NULLIF(after_data->>'notes', ''), NULLIF(before_data->>'notes', ''), '') AS notes
      FROM public.audit_logs
      WHERE entity_type = 'user'
        AND entity_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows.map((row) => ({
    action: row.action,
    timestamp: row.timestamp,
    admin: row.admin,
    notes: row.notes || ''
  }));
}

async function getAuditLog(db, query = {}) {
  const conditions = [];
  const params = [];

  if (query.userId) {
    params.push(query.userId);
    conditions.push(`entity_id = $${params.length}`);
  }

  if (query.action) {
    params.push(query.action);
    conditions.push(`action = $${params.length}`);
  }

  if (query.admin) {
    params.push(query.admin);
    conditions.push(`actor_user_id::text = $${params.length}`);
  }

  const limit = Math.min(parseInt(query.limit, 10) || 50, 200);
  params.push(limit);

  const result = await db.query(
    `
      SELECT
        id,
        action,
        entity_type,
        entity_id,
        actor_user_id,
        created_at,
        COALESCE(NULLIF(after_data->>'notes', ''), NULLIF(before_data->>'notes', ''), '') AS notes
      FROM public.audit_logs
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `,
    params
  );

  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    admin: row.actor_user_id,
    timestamp: row.created_at,
    notes: row.notes || ''
  }));
}

async function bulkUpdateStatus(db, userIds = [], status, adminId = 'SYSTEM', reason = '') {
  const completed = [];
  const failed = [];

  for (const userId of userIds) {
    try {
      await updateStatus(db, userId, status, adminId, reason, 'Bulk operation');
      completed.push(userId);
    } catch (error) {
      failed.push(userId);
    }
  }

  return { completed, failed };
}

module.exports = {
  fetchUsers,
  filterUsers,
  getOverviewStats,
  getUserById,
  getSellerKycDetails,
  updateStatus,
  updateRole,
  resetPassword,
  updateNotes,
  updatePreferences,
  toggleTwoFactor,
  verifyEmail,
  verifyPhone,
  approveKyc,
  rejectKyc,
  updateUserInfo,
  getActivity,
  getAuditLog,
  bulkUpdateStatus
};