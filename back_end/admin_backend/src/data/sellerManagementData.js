function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function avatarUrl(name) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Seller')}&background=random&size=80`;
}

function normalizeUserStatus(status) {
  if (status === 'banned' || status === 'closed') return 'suspended';
  if (status === 'pending') return 'frozen';
  return status || 'active';
}

function normalizeBankAccountVerificationStatus(status) {
  const value = String(status || 'pending').trim().toLowerCase();
  if (['verified', 'approved', 'active'].includes(value)) return 'verified';
  if (['rejected', 'declined'].includes(value)) return 'rejected';
  return 'pending';
}

async function ensureBankAccountNotificationTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      title VARCHAR(180) NOT NULL,
      body TEXT,
      type VARCHAR(40),
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function createSellerNotification(db, sellerId, title, body, type = 'info', meta = {}) {
  await ensureBankAccountNotificationTables(db);
  await db.query(
    `
      INSERT INTO public.notifications (user_id, title, body, type, meta, created_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
    `,
    [sellerId, title, body, type, JSON.stringify(meta || {})]
  );
}

function deriveSubscription(revenue) {
  const amount = toNumber(revenue);
  if (amount >= 200000) return 'enterprise';
  if (amount >= 50000) return 'premium';
  return 'basic';
}

function getPerformanceScore(seller) {
  const rating = toNumber(seller.rating);
  const revenue = toNumber(seller.revenue);
  const orders = toNumber(seller.orders);
  const strikes = toNumber(seller.strikes);
  const kycBonus = seller.kycStatus === 'approved' ? 8 : seller.kycStatus === 'pending' ? 2 : -10;
  const base = (rating * 12) + Math.min(revenue / 10000, 30) + Math.min(orders / 200, 25) + kycBonus - (strikes * 7);
  return Math.max(0, Math.min(100, base)).toFixed(1);
}

async function ensureSupportTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.seller_compliance_settings (
      seller_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
      strikes INTEGER NOT NULL DEFAULT 0,
      risk_level VARCHAR(20) NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
      status_override VARCHAR(20) CHECK (status_override IN ('active', 'frozen', 'suspended')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.seller_admin_notes (
      seller_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function fetchSellerDocuments(db, sellerId = null) {
  const publicQuery = db.query(
    `
      SELECT
        seller_id,
        document_type AS type,
        verification_status AS status,
        created_at::date::text AS "uploadedDate",
        document_url AS url,
        rejection_reason AS "rejectionReason"
      FROM public.seller_documents
      ${sellerId ? 'WHERE seller_id = $1' : ''}
      ORDER BY created_at DESC
    `,
    sellerId ? [sellerId] : []
  ).catch(() => ({ rows: [] }));

  const luminaQuery = db.query(
    `
      SELECT
        seller_id,
        document_type AS type,
        verification_status AS status,
        created_at::date::text AS "uploadedDate",
        document_url AS url,
        rejection_reason AS "rejectionReason"
      FROM lumina.seller_documents
      ${sellerId ? 'WHERE seller_id = $1' : ''}
      ORDER BY created_at DESC
    `,
    sellerId ? [sellerId] : []
  ).catch(() => ({ rows: [] }));

  const [publicResult, luminaResult] = await Promise.all([publicQuery, luminaQuery]);
  return [...(publicResult.rows || []), ...(luminaResult.rows || [])].sort((left, right) => {
    const leftDate = left.uploadedDate || '';
    const rightDate = right.uploadedDate || '';
    return String(rightDate).localeCompare(String(leftDate));
  });
}

async function fetchSellers(db) {
  await ensureSupportTables(db);

  const result = await db.query(`
    WITH product_metrics AS (
      SELECT p.seller_id, COUNT(*)::int AS products
      FROM public.products p
      GROUP BY p.seller_id
    ),
    order_metrics AS (
      SELECT oi.seller_id,
             COALESCE(SUM(oi.line_total) FILTER (
               WHERE LOWER(COALESCE(o.status::text, 'pending')) = 'delivered'
                  OR LOWER(COALESCE(p.payment_status, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured')
             ), 0)::numeric(12,2) AS revenue,
             COALESCE(SUM(oi.quantity) FILTER (
               WHERE LOWER(COALESCE(o.status::text, 'pending')) = 'delivered'
                  OR LOWER(COALESCE(p.payment_status, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured')
             ), 0)::int AS orders
      FROM public.order_items oi
      LEFT JOIN public.orders o ON o.id = oi.order_id
      LEFT JOIN (
        SELECT order_id, MAX(CASE WHEN LOWER(COALESCE(status::text, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured') THEN status::text ELSE NULL END) AS payment_status
        FROM public.payments
        GROUP BY order_id
      ) p ON p.order_id = o.id
      GROUP BY oi.seller_id
    ),
    payout_metrics AS (
      SELECT sp.seller_id,
             COALESCE(SUM(CASE WHEN sp.status IN ('pending', 'processing') THEN sp.amount ELSE 0 END), 0)::numeric(12,2) AS pending_payout,
             MAX(sp.created_at) AS last_payout_at
      FROM public.seller_payouts sp
      GROUP BY sp.seller_id
    )
    SELECT
      u.id,
      COALESCE(sp.store_name, CONCAT(COALESCE(u.full_name, 'Seller'), ' Store')) AS business_name,
      u.full_name AS owner,
      u.email,
      COALESCE(sp.business_phone, u.phone, '') AS phone,
      u.created_at,
      COALESCE(sp.kyc_status, 'pending') AS kyc_status,
      COALESCE(sc.status_override, CASE WHEN u.status = 'pending' THEN 'frozen' ELSE u.status::text END) AS status,
      COALESCE(pm.products, 0) AS products,
      COALESCE(om.revenue, 0) AS revenue,
      COALESCE(om.orders, 0) AS orders,
      COALESCE(sp.rating, 0) AS rating,
      COALESCE(py.pending_payout, 0) AS pending_payout,
      CASE WHEN COALESCE(py.pending_payout, 0) > 0 THEN 'pending' ELSE 'completed' END AS payout_status,
      COALESCE(sc.risk_level, 'low') AS risk_level,
      COALESCE(sc.strikes, 0) AS strikes,
      COALESCE(ss.store_logo_url, '') AS logo,
      COALESCE(sn.notes, '') AS notes,
      COALESCE(sp.tax_number, '') AS tax_id
    FROM public.users u
    LEFT JOIN public.seller_profiles sp ON sp.user_id = u.id
    LEFT JOIN product_metrics pm ON pm.seller_id = u.id
    LEFT JOIN order_metrics om ON om.seller_id = u.id
    LEFT JOIN payout_metrics py ON py.seller_id = u.id
    LEFT JOIN public.seller_store_settings ss ON ss.seller_id = u.id
    LEFT JOIN public.seller_compliance_settings sc ON sc.seller_id = u.id
    LEFT JOIN public.seller_admin_notes sn ON sn.seller_id = u.id
    WHERE u.role::text = 'seller'
    ORDER BY u.created_at DESC
  `);

  const documentsResult = await fetchSellerDocuments(db);

  const documentsBySeller = new Map();
  documentsResult.forEach((doc) => {
    const sellerId = String(doc.seller_id || '');
    if (!sellerId) return;
    if (!documentsBySeller.has(sellerId)) {
      documentsBySeller.set(sellerId, []);
    }
    documentsBySeller.get(sellerId).push({
      type: doc.type || 'Document',
      status: doc.status || 'pending',
      uploadedDate: doc.uploadedDate || '',
      url: doc.url || '',
      rejectionReason: doc.rejectionReason || ''
    });
  });

  return result.rows.map((row) => ({
    id: row.id,
    businessName: row.business_name || 'Untitled Store',
    owner: row.owner || 'Unknown Owner',
    email: row.email,
    phone: row.phone || '',
    registeredDate: toDate(row.created_at),
    kycStatus: row.kyc_status || 'pending',
    status: normalizeUserStatus(row.status),
    products: toNumber(row.products),
    revenue: toNumber(row.revenue).toFixed(2),
    orders: toNumber(row.orders),
    rating: toNumber(row.rating).toFixed(1),
    subscription: deriveSubscription(row.revenue),
    payoutStatus: row.payout_status || 'completed',
    pendingPayout: toNumber(row.pending_payout).toFixed(2),
    riskLevel: row.risk_level || 'low',
    strikes: toNumber(row.strikes),
    logo: row.logo || avatarUrl(row.business_name || row.owner),
    notes: row.notes || '',
    businessAddress: '',
    taxId: row.tax_id || '',
    documents: documentsBySeller.get(String(row.id)) || [],
    activity: []
  }));
}

function filterSellers(sellers, query = {}) {
  let filtered = [...sellers];

  if (query.search) {
    const term = String(query.search).toLowerCase();
    filtered = filtered.filter((seller) =>
      [seller.businessName, seller.owner, seller.email, seller.id].some((value) => String(value || '').toLowerCase().includes(term))
    );
  }

  const kycStatus = query.kycStatus || query.kyc;
  if (kycStatus && kycStatus !== 'all') {
    filtered = filtered.filter((seller) => seller.kycStatus === kycStatus);
  }

  if (query.status && query.status !== 'all') {
    filtered = filtered.filter((seller) => seller.status === query.status);
  }

  const riskLevel = query.riskLevel || query.risk;
  if (riskLevel && riskLevel !== 'all') {
    filtered = filtered.filter((seller) => seller.riskLevel === riskLevel);
  }

  if (query.tab && query.tab !== 'all') {
    if (query.tab === 'pending') filtered = filtered.filter((seller) => seller.kycStatus === 'pending');
    if (query.tab === 'approved') filtered = filtered.filter((seller) => seller.kycStatus === 'approved');
    if (query.tab === 'flagged') filtered = filtered.filter((seller) => seller.strikes > 0 || seller.riskLevel === 'high');
  }

  const sortBy = query.sortBy || 'registeredDate';
  const sortDir = query.sortDir === 'asc' ? 'asc' : 'desc';
  filtered.sort((a, b) => {
    const numericFields = new Set(['products', 'revenue', 'orders', 'rating', 'pendingPayout', 'strikes']);
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
    sellers: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(filtered.length / pageSize))
  };
}

async function getOverviewStats(db) {
  const sellers = await fetchSellers(db);
  return {
    total: sellers.length,
    active: sellers.filter((seller) => seller.status === 'active').length,
    frozen: sellers.filter((seller) => seller.status === 'frozen').length,
    suspended: sellers.filter((seller) => seller.status === 'suspended').length,
    approved: sellers.filter((seller) => seller.kycStatus === 'approved').length,
    pending: sellers.filter((seller) => seller.kycStatus === 'pending').length,
    rejected: sellers.filter((seller) => seller.kycStatus === 'rejected').length,
    highRisk: sellers.filter((seller) => seller.riskLevel === 'high').length,
    totalRevenue: sellers.reduce((sum, seller) => sum + toNumber(seller.revenue), 0).toFixed(2)
  };
}

async function getSellerById(db, sellerId) {
  const sellers = await fetchSellers(db);
  const seller = sellers.find((entry) => String(entry.id) === String(sellerId));
  if (!seller) return null;

  const [
    payoutsResult,
    documentsResult,
    bankPublicResult,
    bankLuminaResult,
    storeSettingsResult,
    addressResult,
    activityResult,
    complianceResult,
    notesResult,
    productSummaryResult,
    orderSummaryResult
  ] = await Promise.all([
    db.query(
      `
        SELECT id, seller_id AS "sellerId", amount, status, COALESCE(paid_at::date::text, created_at::date::text) AS date
        FROM public.seller_payouts
        WHERE seller_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      `,
      [sellerId]
    ),
    fetchSellerDocuments(db, sellerId),
    db.query(
      `
        SELECT
          seller_id AS "sellerId",
          account_holder_name AS "accountHolderName",
          bank_name AS "bankName",
          COALESCE(branch_name, '') AS "branchName",
          COALESCE(branch_code, '') AS "branchCode",
          account_type AS "accountType",
          mobile_wallet AS "mobileWallet",
          account_number_masked AS "accountNumberMasked",
          account_number AS "accountNumber",
          iban,
          bank_statement_url AS "bankStatementUrl",
          bank_statement_name AS "bankStatementName",
          verification_status AS status,
          rejection_reason AS "rejectionReason",
          verified_by AS "verifiedBy",
          verified_at AS "verifiedAt",
          created_at AS "submittedAt",
          updated_at AS "updatedAt",
          is_default AS "isDefault"
        FROM public.seller_bank_accounts
        WHERE seller_id = $1
        ORDER BY created_at DESC, updated_at DESC
      `,
      [sellerId]
    ),
    db.query(
      `
        SELECT
          seller_id AS "sellerId",
          account_holder_name AS "accountHolderName",
          bank_name AS "bankName",
          COALESCE(branch_name, '') AS "branchName",
          COALESCE(branch_code, '') AS "branchCode",
          account_type AS "accountType",
          mobile_wallet AS "mobileWallet",
          account_number_masked AS "accountNumberMasked",
          account_number AS "accountNumber",
          iban,
          bank_statement_url AS "bankStatementUrl",
          bank_statement_name AS "bankStatementName",
          verification_status AS status,
          rejection_reason AS "rejectionReason",
          verified_by AS "verifiedBy",
          verified_at AS "verifiedAt",
          created_at AS "submittedAt",
          updated_at AS "updatedAt",
          is_default AS "isDefault"
        FROM lumina.seller_bank_accounts
        WHERE seller_id = $1
        ORDER BY created_at DESC, updated_at DESC
      `,
      [sellerId]
    ),
    db.query(
      `
        SELECT support_email AS "supportEmail", support_phone AS "supportPhone", return_policy AS "returnPolicy", shipping_policy AS "shippingPolicy", store_banner_url AS "storeBannerUrl", store_logo_url AS "storeLogoUrl", vacation_mode AS "vacationMode"
        FROM public.seller_store_settings
        WHERE seller_id = $1
        LIMIT 1
      `,
      [sellerId]
    ),
    db.query(
      `
        SELECT line1, line2, city, state, postal_code AS "postalCode", country
        FROM public.user_addresses
        WHERE user_id = $1 AND is_default = TRUE
        LIMIT 1
      `,
      [sellerId]
    ),
    db.query(
      `
        SELECT action, created_at AS date, actor_user_id AS "actorUserId", COALESCE(after_data->>'details', '') AS details
        FROM public.audit_logs
        WHERE entity_type = 'seller' AND entity_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      `,
      [sellerId]
    ),
    db.query(
      `
        SELECT seller_id, strikes, risk_level AS "riskLevel", status_override AS "statusOverride"
        FROM public.seller_compliance_settings
        WHERE seller_id = $1
        LIMIT 1
      `,
      [sellerId]
    ),
    db.query(
      `
        SELECT notes, updated_at AS "updatedAt"
        FROM public.seller_admin_notes
        WHERE seller_id = $1
        LIMIT 1
      `,
      [sellerId]
    ),
    db.query(
      `
        SELECT
          COUNT(*)::int AS "totalProducts",
          COALESCE(
            (
              SELECT SUM(pv.stock_quantity)::int
              FROM public.product_variants pv
              JOIN public.products p ON p.id = pv.product_id
              WHERE p.seller_id = $1
            ),
            0
          ) AS "totalStock"
        FROM public.products
        WHERE seller_id = $1
      `,
      [sellerId]
    ),
    db.query(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(o.status::text, 'pending')) = 'delivered'
               OR LOWER(COALESCE(p.payment_status, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured')
          )::int AS "totalOrders",
          COALESCE(SUM(oi.quantity) FILTER (
            WHERE LOWER(COALESCE(o.status::text, 'pending')) = 'delivered'
               OR LOWER(COALESCE(p.payment_status, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured')
          ), 0)::int AS "unitsSold",
          COALESCE(SUM(oi.line_total) FILTER (
            WHERE LOWER(COALESCE(o.status::text, 'pending')) = 'delivered'
               OR LOWER(COALESCE(p.payment_status, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured')
          ), 0)::numeric(12,2) AS revenue
        FROM public.order_items oi
        LEFT JOIN public.orders o ON o.id = oi.order_id
        LEFT JOIN (
          SELECT order_id, MAX(CASE WHEN LOWER(COALESCE(status::text, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured') THEN status::text ELSE NULL END) AS payment_status
          FROM public.payments
          GROUP BY order_id
        ) p ON p.order_id = o.id
        WHERE oi.seller_id = $1
      `,
      [sellerId]
    )
  ]);

  const compliance = complianceResult.rows[0] || {};
  const noteRow = notesResult.rows[0] || {};
  const storeSettings = storeSettingsResult.rows[0] || {};
  const address = addressResult.rows[0] || {};
  const productSummary = productSummaryResult.rows[0] || {};
  const orderSummary = orderSummaryResult.rows[0] || {};
  const bankRows = [...bankPublicResult.rows, ...bankLuminaResult.rows].sort((left, right) => {
    const leftDate = left.updatedAt || left.submittedAt || '';
    const rightDate = right.updatedAt || right.submittedAt || '';
    return String(rightDate).localeCompare(String(leftDate));
  });
  const totalPaid = payoutsResult.rows.reduce((sum, payout) => sum + toNumber(payout.amount), 0);
  const averageOrderValue = toNumber(orderSummary.revenue) > 0 && toNumber(orderSummary.totalOrders) > 0
    ? toNumber(orderSummary.revenue) / toNumber(orderSummary.totalOrders)
    : 0;
  const addressText = [address.line1, address.line2, address.city, address.state, address.postalCode, address.country]
    .filter(Boolean)
    .join(', ');

  return {
    ...seller,
    performanceScore: getPerformanceScore(seller),
    profile: {
      businessName: seller.businessName,
      owner: seller.owner,
      email: seller.email,
      phone: seller.phone || '',
      registeredDate: seller.registeredDate,
      taxId: seller.taxId || '',
      businessAddress: seller.businessAddress || addressText || 'Not provided'
    },
    businessInfo: {
      supportEmail: storeSettings.supportEmail || '',
      supportPhone: storeSettings.supportPhone || '',
      returnPolicy: storeSettings.returnPolicy || '',
      shippingPolicy: storeSettings.shippingPolicy || '',
      storeBannerUrl: storeSettings.storeBannerUrl || '',
      storeLogoUrl: storeSettings.storeLogoUrl || '',
      vacationMode: Boolean(storeSettings.vacationMode)
    },
    performance: {
      products: toNumber(productSummary.totalProducts),
      totalStock: toNumber(productSummary.totalStock),
      orders: toNumber(orderSummary.totalOrders),
      unitsSold: toNumber(orderSummary.unitsSold),
      revenue: toNumber(orderSummary.revenue).toFixed(2),
      averageOrderValue: averageOrderValue.toFixed(2),
      rating: toNumber(seller.rating).toFixed(1)
    },
    financial: {
      pendingPayout: toNumber(seller.pendingPayout).toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      payoutStatus: seller.payoutStatus,
      payouts: payoutsResult.rows.map((payout) => ({
        ...payout,
        amount: toNumber(payout.amount).toFixed(2)
      }))
    },
    bankVerificationStatus: bankRows.length
      ? normalizeBankAccountVerificationStatus(bankRows[0].status)
      : 'pending',
    bankAccounts: bankRows.map((account) => ({
      ...account,
      status: normalizeBankAccountVerificationStatus(account.status),
      isDefault: Boolean(account.isDefault),
      submittedAt: account.submittedAt || null,
      updatedAt: account.updatedAt || null,
      verifiedAt: account.verifiedAt || null,
      verifiedBy: account.verifiedBy || null,
      bankStatementUrl: account.bankStatementUrl || '',
      bankStatementName: account.bankStatementName || '',
      hasBankStatement: Boolean(account.bankStatementUrl || account.bankStatementName)
    })),
    kyc: {
      status: seller.kycStatus,
      verified: seller.kycStatus === 'verified' || seller.kycStatus === 'approved',
      documents: documentsResult,
      riskLevel: seller.riskLevel,
      strikes: seller.strikes,
      compliance: compliance
    },
    notes: noteRow.notes || seller.notes || '',
    notesHistory: noteRow.notes ? [{ date: toDate(noteRow.updatedAt), note: noteRow.notes, actor: 'Admin' }] : [],
    activityLog: activityResult.rows.map((entry) => ({
      ...entry,
      details: entry.details || ''
    })),
    payouts: payoutsResult.rows,
    documents: documentsResult.rows,
    subscriptionPlan: { id: seller.subscription, name: seller.subscription.charAt(0).toUpperCase() + seller.subscription.slice(1) },
    compliance
  };
}

async function logAudit(db, action, sellerId, adminId = null, details = '') {
  const actorUserId = /^[0-9a-fA-F-]{36}$/.test(String(adminId || '')) ? adminId : null;
  await db.query(
    `
      INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, before_data, after_data, user_agent)
      VALUES ($1, $2, 'seller', $3, NULL, $4::jsonb, 'Admin Seller Management')
    `,
    [actorUserId, action, sellerId, JSON.stringify({ details })]
  );
}

async function upsertCompliance(db, sellerId, fields = {}) {
  await ensureSupportTables(db);
  const current = await db.query('SELECT seller_id, strikes, risk_level, status_override FROM public.seller_compliance_settings WHERE seller_id = $1 LIMIT 1', [sellerId]);
  const strikes = fields.strikes !== undefined ? fields.strikes : current.rows[0]?.strikes ?? 0;
  const riskLevel = fields.riskLevel || current.rows[0]?.risk_level || 'low';
  const statusOverride = fields.statusOverride !== undefined ? fields.statusOverride : current.rows[0]?.status_override || null;

  await db.query(
    `
      INSERT INTO public.seller_compliance_settings (seller_id, strikes, risk_level, status_override)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (seller_id) DO UPDATE
      SET strikes = EXCLUDED.strikes,
          risk_level = EXCLUDED.risk_level,
          status_override = EXCLUDED.status_override,
          updated_at = NOW()
    `,
    [sellerId, strikes, riskLevel, statusOverride]
  );
}

async function approveKyc(db, sellerId, adminId = null, notes = '') {
  await db.query('UPDATE public.seller_profiles SET kyc_status = $2, updated_at = NOW() WHERE user_id = $1', [sellerId, 'verified']);
  await db.query('UPDATE public.users SET status = $2, updated_at = NOW() WHERE id = $1', [sellerId, 'active']);
  await db.query('UPDATE public.seller_documents SET verification_status = $2, verified_at = NOW(), updated_at = NOW() WHERE seller_id = $1 AND verification_status = $3', [sellerId, 'approved', 'pending']);
  await upsertCompliance(db, sellerId, { statusOverride: null });
  await logAudit(db, 'kyc_approved', sellerId, adminId, notes || 'KYC approved');
  return getSellerById(db, sellerId);
}

async function rejectKyc(db, sellerId, reason, adminId = null, notes = '') {
  await db.query('UPDATE public.seller_profiles SET kyc_status = $2, updated_at = NOW() WHERE user_id = $1', [sellerId, 'rejected']);
  await db.query('UPDATE public.users SET status = $2, updated_at = NOW() WHERE id = $1', [sellerId, 'suspended']);
  await db.query(
    'UPDATE public.seller_documents SET verification_status = $2, rejection_reason = $3, updated_at = NOW() WHERE seller_id = $1 AND verification_status = $4',
    [sellerId, 'rejected', reason || notes || 'Rejected by admin', 'pending']
  );
  await upsertCompliance(db, sellerId, { statusOverride: 'suspended' });
  await logAudit(db, 'kyc_rejected', sellerId, adminId, `Reason: ${reason || notes}`);
  return getSellerById(db, sellerId);
}

async function issueStrike(db, sellerId, reason, adminId = null) {
  const current = await db.query('SELECT strikes FROM public.seller_compliance_settings WHERE seller_id = $1 LIMIT 1', [sellerId]);
  const nextStrikes = (current.rows[0]?.strikes ?? 0) + 1;
  const statusOverride = nextStrikes >= 3 ? 'suspended' : undefined;
  await upsertCompliance(db, sellerId, { strikes: nextStrikes, statusOverride });
  if (nextStrikes >= 3) {
    await db.query('UPDATE public.users SET status = $2, updated_at = NOW() WHERE id = $1', [sellerId, 'suspended']);
  }
  await logAudit(db, 'strike_issued', sellerId, adminId, `Strike ${nextStrikes}/3: ${reason || ''}`);
  return getSellerById(db, sellerId);
}

async function clearStrikes(db, sellerId, adminId = null) {
  await upsertCompliance(db, sellerId, { strikes: 0 });
  await logAudit(db, 'strikes_cleared', sellerId, adminId, 'Strikes cleared');
  return getSellerById(db, sellerId);
}

async function updateStatus(db, sellerId, status, adminId = null, reason = '') {
  if (status === 'frozen') {
    await upsertCompliance(db, sellerId, { statusOverride: 'frozen' });
  } else {
    await upsertCompliance(db, sellerId, { statusOverride: status });
    await db.query('UPDATE public.users SET status = $2, updated_at = NOW() WHERE id = $1', [sellerId, status]);
  }
  await logAudit(db, `status_changed_${status}`, sellerId, adminId, reason || 'Status changed');
  return getSellerById(db, sellerId);
}

async function updateSubscription(db, sellerId, subscription, adminId = null) {
  await logAudit(db, 'subscription_changed', sellerId, adminId, `Subscription set to ${subscription}`);
  return getSellerById(db, sellerId);
}

async function processPayout(db, sellerId, amount, method = 'bank_transfer', adminId = null) {
  const seller = await getSellerById(db, sellerId);
  if (!seller) return null;

  const payoutAmount = amount ? toNumber(amount) : toNumber(seller.pendingPayout);
  if (payoutAmount <= 0) {
    throw new Error('No pending payout amount');
  }

  const pendingRequest = await db.query(
    `
      SELECT id, amount, status::text AS status
      FROM public.seller_payouts
      WHERE seller_id = $1
        AND LOWER(COALESCE(status::text, 'pending')) IN ('pending', 'processing')
      ORDER BY created_at DESC, updated_at DESC
      LIMIT 1
    `,
    [sellerId]
  );

  const pendingRequestRow = pendingRequest.rows[0];
  if (!pendingRequestRow) {
    throw new Error('No pending payout request found');
  }

  if (!['pending', 'processing'].includes(String(pendingRequestRow.status || '').toLowerCase())) {
    throw new Error('This payout has already been processed.');
  }

  const result = await db.query(
    `
      UPDATE public.seller_payouts
      SET status = 'paid',
          paid_at = NOW(),
          reviewed_by = $2,
          reviewed_at = NOW(),
          processed_by = $2,
          processed_at = NOW(),
          transaction_reference = COALESCE(NULLIF($3, ''), payout_reference),
          payout_reference = COALESCE(payout_reference, $4),
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, seller_id AS "sellerId", amount, status, paid_at::date::text AS date
    `,
    [pendingRequestRow.id, adminId || null, String(method || '').trim() || 'bank_transfer', `MANUAL-${Date.now()}`]
  );

  await require('../data/paymentPayoutService').refreshSellerPayoutState(db, sellerId);
  await logAudit(db, 'payout_processed', sellerId, adminId, `Amount: ${payoutAmount.toFixed(2)} via ${method}`);

  return {
    seller: await getSellerById(db, sellerId),
    payout: result.rows[0]
  };
}

async function updateBankAccountVerification(db, sellerId, action, payload = {}, adminId = null) {
  await ensureSupportTables(db);
  const current = await db.query(
    `
      SELECT verification_status, rejection_reason, verified_by, verified_at
      FROM public.seller_bank_accounts
      WHERE seller_id = $1
      LIMIT 1
    `,
    [sellerId]
  );
  const luminaCurrent = await db.query(
    `
      SELECT verification_status, rejection_reason, verified_by, verified_at
      FROM lumina.seller_bank_accounts
      WHERE seller_id = $1
      LIMIT 1
    `,
    [sellerId]
  );

  if (!current.rows.length && !luminaCurrent.rows.length) {
    throw new Error('No bank account details found for this seller.');
  }

  const adminUserId = String(adminId || '').trim();
  const verifiedAt = new Date().toISOString();
  const reason = String(payload.reason || '').trim();

  if (action === 'verify') {
    await db.query(
      `
        UPDATE public.seller_bank_accounts
        SET verification_status = 'verified',
            rejection_reason = NULL,
            verified_by = $2,
            verified_at = $3,
            updated_at = NOW()
        WHERE seller_id = $1
      `,
      [sellerId, adminUserId || null, verifiedAt]
    );
    await db.query(
      `
        UPDATE lumina.seller_bank_accounts
        SET verification_status = 'verified',
            rejection_reason = NULL,
            verified_by = $2,
            verified_at = $3,
            updated_at = NOW()
        WHERE seller_id = $1
      `,
      [sellerId, adminUserId || null, verifiedAt]
    );
    await createSellerNotification(db, sellerId, 'Bank account verified', 'Your bank account has been verified and you can now request payouts.', 'success', { type: 'bank_verification' });
    await logAudit(db, 'bank_account_verified', sellerId, adminId, 'Bank account verified');
    return getSellerById(db, sellerId);
  }

  if (action === 'reject') {
    if (!reason) {
      throw new Error('Rejection reason is required.');
    }
    await db.query(
      `
        UPDATE public.seller_bank_accounts
        SET verification_status = 'rejected',
            rejection_reason = $2,
            verified_by = $3,
            verified_at = $4,
            updated_at = NOW()
        WHERE seller_id = $1
      `,
      [sellerId, reason, adminUserId || null, verifiedAt]
    );
    await db.query(
      `
        UPDATE lumina.seller_bank_accounts
        SET verification_status = 'rejected',
            rejection_reason = $2,
            verified_by = $3,
            verified_at = $4,
            updated_at = NOW()
        WHERE seller_id = $1
      `,
      [sellerId, reason, adminUserId || null, verifiedAt]
    );
    await createSellerNotification(db, sellerId, 'Bank account rejected', `Your bank account was rejected. Reason: ${reason}`, 'warning', { type: 'bank_rejection', reason });
    await logAudit(db, 'bank_account_rejected', sellerId, adminId, `Reason: ${reason}`);
    return getSellerById(db, sellerId);
  }

  if (action === 'request-reupload') {
    await db.query(
      `
        UPDATE public.seller_bank_accounts
        SET verification_status = 'pending',
            rejection_reason = NULL,
            verified_by = NULL,
            verified_at = NULL,
            updated_at = NOW()
        WHERE seller_id = $1
      `,
      [sellerId]
    );
    await db.query(
      `
        UPDATE lumina.seller_bank_accounts
        SET verification_status = 'pending',
            rejection_reason = NULL,
            verified_by = NULL,
            verified_at = NULL,
            updated_at = NOW()
        WHERE seller_id = $1
      `,
      [sellerId]
    );
    await createSellerNotification(db, sellerId, 'Re-upload requested', 'Please update your bank account details and upload a new bank statement for review.', 'info', { type: 'bank_reupload' });
    await logAudit(db, 'bank_account_reupload_requested', sellerId, adminId, 'Re-upload requested');
    return getSellerById(db, sellerId);
  }

  throw new Error('Invalid bank account action');
}

async function updateSellerInfo(db, sellerId, payload = {}, adminId = null) {
  const updates = [];
  const params = [];

  if (payload.businessName !== undefined) {
    params.push(payload.businessName);
    updates.push(`store_name = $${params.length}`);
  }

  if (payload.taxId !== undefined) {
    params.push(payload.taxId);
    updates.push(`tax_number = $${params.length}`);
  }

  if (updates.length) {
    params.push(sellerId);
    await db.query(`UPDATE public.seller_profiles SET ${updates.join(', ')}, updated_at = NOW() WHERE user_id = $${params.length}`, params);
  }

  const userUpdates = [];
  const userParams = [];
  if (payload.owner !== undefined) {
    userParams.push(payload.owner);
    userUpdates.push(`full_name = $${userParams.length}`);
  }
  if (payload.email !== undefined) {
    userParams.push(payload.email);
    userUpdates.push(`email = $${userParams.length}`);
  }
  if (payload.phone !== undefined) {
    userParams.push(payload.phone);
    userUpdates.push(`phone = $${userParams.length}`);
  }
  if (userUpdates.length) {
    userParams.push(sellerId);
    await db.query(`UPDATE public.users SET ${userUpdates.join(', ')}, updated_at = NOW() WHERE id = $${userParams.length}`, userParams);
  }

  if (payload.riskLevel) {
    await upsertCompliance(db, sellerId, { riskLevel: payload.riskLevel });
  }

  await logAudit(db, 'info_updated', sellerId, adminId, 'Seller information updated');
  return getSellerById(db, sellerId);
}

async function updateNotes(db, sellerId, notes, adminId = null) {
  await ensureSupportTables(db);
  await db.query(
    `
      INSERT INTO public.seller_admin_notes (seller_id, notes)
      VALUES ($1, $2)
      ON CONFLICT (seller_id) DO UPDATE
      SET notes = EXCLUDED.notes,
          updated_at = NOW()
    `,
    [sellerId, notes || '']
  );
  await logAudit(db, 'notes_updated', sellerId, adminId, 'Admin notes updated');
  return getSellerById(db, sellerId);
}

async function bulkApprove(db, sellerIds = [], adminId = null) {
  const approved = [];
  const failed = [];
  for (const id of sellerIds) {
    try {
      const seller = await getSellerById(db, id);
      if (!seller || seller.kycStatus !== 'pending') {
        failed.push(id);
      } else {
        await approveKyc(db, id, adminId, 'Bulk operation');
        approved.push(id);
      }
    } catch (_) {
      failed.push(id);
    }
  }
  return { approved, failed };
}

async function bulkFreeze(db, sellerIds = [], adminId = null, reason = '') {
  const frozen = [];
  const failed = [];
  for (const id of sellerIds) {
    try {
      await updateStatus(db, id, 'frozen', adminId, reason || 'Bulk freeze operation');
      frozen.push(id);
    } catch (_) {
      failed.push(id);
    }
  }
  return { frozen, failed };
}

async function bulkTerminate(db, sellerIds = [], adminId = null, reason = '') {
  const terminated = [];
  const failed = [];
  for (const id of sellerIds) {
    try {
      await rejectKyc(db, id, reason || 'Bulk termination', adminId, 'Bulk termination');
      await upsertCompliance(db, id, { strikes: 3, statusOverride: 'suspended' });
      terminated.push(id);
    } catch (_) {
      failed.push(id);
    }
  }
  return { terminated, failed };
}

function getSubscriptionPlans() {
  return [
    { id: 'basic', name: 'Basic' },
    { id: 'premium', name: 'Premium' },
    { id: 'enterprise', name: 'Enterprise' }
  ];
}

async function getPayoutHistory(db, { sellerId, status, page = 1, pageSize = 20 } = {}) {
  const conditions = [];
  const params = [];

  if (sellerId) {
    params.push(sellerId);
    conditions.push(`seller_id::text = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`status::text = $${params.length}`);
  }

  const limit = Math.max(1, Math.min(parseInt(pageSize, 10) || 20, 100));
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const offset = (pageNum - 1) * limit;

  params.push(limit, offset);

  const sql = `
    SELECT id, seller_id AS "sellerId", amount, status, COALESCE(paid_at::date::text, created_at::date::text) AS date
    FROM public.seller_payouts
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM public.seller_payouts
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
  `;

  const [rows, count] = await Promise.all([
    db.query(sql, params),
    db.query(countSql, params.slice(0, params.length - 2))
  ]);

  return {
    payouts: rows.rows,
    total: count.rows[0].total,
    page: pageNum,
    pageSize: limit,
    totalPages: Math.max(1, Math.ceil(count.rows[0].total / limit))
  };
}

async function getAuditLog(db, { sellerId, action, admin, limit = 50 } = {}) {
  const params = [];
  const conditions = [`entity_type = 'seller'`];

  if (sellerId) {
    params.push(sellerId);
    conditions.push(`entity_id::text = $${params.length}`);
  }

  if (action) {
    params.push(action);
    conditions.push(`action = $${params.length}`);
  }

  if (admin) {
    params.push(admin);
    conditions.push(`actor_user_id::text = $${params.length}`);
  }

  params.push(Math.max(1, Math.min(parseInt(limit, 10) || 50, 200)));

  const result = await db.query(
    `
      SELECT id, action, entity_id AS "entityId", actor_user_id AS admin, created_at AS timestamp, after_data
      FROM public.audit_logs
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `,
    params
  );

  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityId: row.entityId,
    admin: row.admin,
    timestamp: row.timestamp,
    notes: row.after_data?.details || ''
  }));
}

async function getTopPerformers(db, metric = 'revenue', limit = 10) {
  const sellers = await fetchSellers(db);
  const allowedMetrics = new Set(['revenue', 'orders', 'rating', 'products', 'performanceScore']);
  const sortMetric = allowedMetrics.has(metric) ? metric : 'revenue';

  const rows = sellers
    .filter((seller) => seller.status === 'active')
    .map((seller) => ({
      id: seller.id,
      businessName: seller.businessName,
      owner: seller.owner,
      revenue: toNumber(seller.revenue),
      orders: seller.orders,
      rating: toNumber(seller.rating),
      products: seller.products,
      performanceScore: toNumber(getPerformanceScore(seller))
    }))
    .sort((a, b) => b[sortMetric] - a[sortMetric]);

  return rows.slice(0, Math.max(1, parseInt(limit, 10) || 10));
}

async function getRiskAssessment(db) {
  const sellers = await fetchSellers(db);
  const highRisk = sellers.filter((seller) => seller.riskLevel === 'high');
  const mediumRisk = sellers.filter((seller) => seller.riskLevel === 'medium');
  const lowRisk = sellers.filter((seller) => seller.riskLevel === 'low');
  const sellersWithStrikes = sellers.filter((seller) => seller.strikes > 0);
  const suspendedSellers = sellers.filter((seller) => seller.status === 'suspended');

  return {
    riskDistribution: {
      high: highRisk.length,
      medium: mediumRisk.length,
      low: lowRisk.length
    },
    highRiskSellers: highRisk.map((seller) => ({
      id: seller.id,
      businessName: seller.businessName,
      riskLevel: seller.riskLevel,
      strikes: seller.strikes,
      status: seller.status,
      kycStatus: seller.kycStatus
    })),
    sellersWithStrikes: sellersWithStrikes.length,
    suspendedSellers: suspendedSellers.length
  };
}

module.exports = {
  fetchSellers,
  filterSellers,
  getOverviewStats,
  getSellerById,
  getPerformanceScore,
  approveKyc,
  rejectKyc,
  issueStrike,
  clearStrikes,
  updateStatus,
  updateSubscription,
  processPayout,
  normalizeBankAccountVerificationStatus,
  updateBankAccountVerification,
  updateSellerInfo,
  updateNotes,
  bulkApprove,
  bulkFreeze,
  bulkTerminate,
  getSubscriptionPlans,
  getPayoutHistory,
  getAuditLog,
  getTopPerformers,
  getRiskAssessment,
  logAudit
};