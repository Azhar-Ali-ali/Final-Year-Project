const UI_ESCROW_STATES = ['held', 'released', 'dispute', 'refunded', 'none'];
const UI_BANK_STATES = ['verified', 'pending', 'rejected'];
const UI_RISK_LEVELS = ['clear', 'medium', 'high', 'frozen'];
const UI_COURIER_DEPOSIT_STATES = ['pending', 'deposited', 'mismatch'];
const UI_FAILURE_TYPES = ['gateway-failure', 'chargeback', 'dispute', 'timeout'];
const commissionSettings = require('./commissionSettingsData');

function adminId(req) {
  const candidate = String(req.headers['x-admin-id'] || req.body?.adminId || req.query?.adminId || '').trim();
  if (!candidate) return null;
  return /^[0-9a-fA-F-]{36}$/.test(candidate) ? candidate : null;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateAvailableBalance(seller) {
  const grossSales = toNumber(seller.gross_sales);
  const commission = toNumber(seller.commission);
  const shipping = toNumber(seller.shipping);
  const taxes = toNumber(seller.taxes);
  const refunds = toNumber(seller.refunds);
  const paidAmount = toNumber(seller.paid_amount);
  const pendingAmount = toNumber(seller.pending_balance);
  return Math.max(0, grossSales - commission - shipping - taxes - refunds - paidAmount - pendingAmount);
}

function mapKycStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'active' || value === 'approved' || value === 'verified') return 'verified';
  if (value === 'suspended' || value === 'banned' || value === 'rejected') return 'rejected';
  return 'pending';
}

function normalizeSellerBankStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['verified', 'approved', 'active'].includes(value)) return 'verified';
  if (['rejected', 'declined'].includes(value)) return 'rejected';
  return 'pending';
}

function normalizeSellerRiskLevel(riskLevel, userStatus = '', statusOverride = '') {
  const override = String(statusOverride || '').toLowerCase();
  const normalizedStatus = String(userStatus || '').toLowerCase();
  if (['frozen', 'suspended'].includes(override) || ['frozen', 'suspended'].includes(normalizedStatus)) return 'frozen';
  const normalized = String(riskLevel || '').toLowerCase();
  if (normalized === 'low' || normalized === 'clear') return 'clear';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'high') return 'high';
  if (normalized === 'frozen') return 'frozen';
  return 'clear';
}

async function getSellerManagementSnapshot(db, sellerId) {
  const [profileResult, publicBankResult, luminaBankResult, complianceResult, userResult] = await Promise.all([
    db.query(`SELECT store_name, kyc_status FROM public.seller_profiles WHERE user_id = $1 LIMIT 1`, [sellerId]),
    db.query(`SELECT account_holder_name, bank_name, account_number, verification_status FROM public.seller_bank_accounts WHERE seller_id = $1 ORDER BY updated_at DESC, created_at DESC`, [sellerId]),
    db.query(`SELECT account_holder_name, bank_name, account_number, verification_status FROM lumina.seller_bank_accounts WHERE seller_id = $1 ORDER BY updated_at DESC, created_at DESC`, [sellerId]),
    db.query(`SELECT risk_level, status_override FROM public.seller_compliance_settings WHERE seller_id = $1 LIMIT 1`, [sellerId]),
    db.query(`SELECT status::text AS status FROM public.users WHERE id = $1 LIMIT 1`, [sellerId])
  ]);

  const profile = profileResult.rows[0] || {};
  const bankRows = [...publicBankResult.rows, ...luminaBankResult.rows];
  const bankStatus = bankRows.length
    ? bankRows.some((row) => normalizeSellerBankStatus(row.verification_status || row.status) === 'verified')
      ? 'verified'
      : bankRows.some((row) => normalizeSellerBankStatus(row.verification_status || row.status) === 'rejected')
        ? 'rejected'
        : 'pending'
    : 'pending';
  const compliance = complianceResult.rows[0] || {};
  const userStatus = String(userResult.rows[0]?.status || '').toLowerCase();

  return {
    sellerName: profile.store_name || '',
    kycStatus: mapKycStatus(profile.kyc_status),
    bankStatus,
    riskLevel: normalizeSellerRiskLevel(compliance.risk_level || compliance.riskLevel, userStatus, compliance.status_override),
    bankName: bankRows[0]?.bank_name || '',
    accountHolder: bankRows[0]?.account_holder_name || '',
    accountNumber: bankRows[0]?.account_number || ''
  };
}

function mapPaymentStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'paid' || value === 'authorized') return 'success';
  if (value === 'refunded' || value === 'partially_refunded') return 'refunded';
  if (value === 'failed') return 'failed';
  return 'success';
}

function mapEscrowStatus(status, paymentStatus) {
  const normalized = String(status || '').toLowerCase();
  if (UI_ESCROW_STATES.includes(normalized)) return normalized;
  if (paymentStatus === 'failed') return 'none';
  if (paymentStatus === 'refunded') return 'refunded';
  return 'held';
}

function mapShipmentStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'delivered') return 'delivered';
  if (normalized === 'failed' || normalized === 'returned') return 'failed';
  if (normalized === 'pending') return 'pending';
  return 'in-transit';
}

function mapCourierDepositStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (UI_COURIER_DEPOSIT_STATES.includes(normalized)) return normalized;
  return 'pending';
}

async function ensureSupportTables(db) {
  await db.query(`ALTER TABLE public.seller_payouts ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(120)`);
  await db.query(`ALTER TABLE public.seller_payouts ADD COLUMN IF NOT EXISTS processed_by UUID`);
  await db.query(`ALTER TABLE public.seller_payouts ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.payment_payout_payment_state (
      payment_id UUID PRIMARY KEY REFERENCES public.payments(id) ON DELETE CASCADE,
      escrow_status VARCHAR(20) NOT NULL DEFAULT 'held' CHECK (escrow_status IN ('held', 'released', 'dispute', 'refunded', 'none')),
      return_window_days INTEGER NOT NULL DEFAULT 7,
      returns_window_expiry TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.payment_payout_cod_state (
      order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
      courier_deposit_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (courier_deposit_status IN ('pending', 'deposited', 'mismatch')),
      deposited_amount NUMERIC(12,2),
      variance NUMERIC(12,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.payment_payout_seller_state (
      seller_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
      bank_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (bank_status IN ('verified', 'pending', 'rejected')),
      risk_level VARCHAR(20) NOT NULL DEFAULT 'clear' CHECK (risk_level IN ('clear', 'medium', 'high', 'frozen')),
      bank_name VARCHAR(120),
      account_holder VARCHAR(120),
      account_number VARCHAR(60),
      ifsc VARCHAR(30),
      gross_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
      commission NUMERIC(12,2) NOT NULL DEFAULT 0,
      shipping NUMERIC(12,2) NOT NULL DEFAULT 0,
      taxes NUMERIC(12,2) NOT NULL DEFAULT 0,
      refunds NUMERIC(12,2) NOT NULL DEFAULT 0,
      available_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      pending_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      eligible_orders INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.payment_payout_failed_state (
      payment_id UUID PRIMARY KEY REFERENCES public.payments(id) ON DELETE CASCADE,
      failure_type VARCHAR(40) NOT NULL DEFAULT 'gateway-failure' CHECK (failure_type IN ('gateway-failure', 'chargeback', 'dispute', 'timeout')),
      error_msg TEXT NOT NULL DEFAULT 'Payment failed at gateway',
      retry_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

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

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.payment_payout_cod_deposit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
      action VARCHAR(40) NOT NULL,
      notes TEXT,
      admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.payment_payout_bank_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      action VARCHAR(40) NOT NULL,
      notes TEXT,
      admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.payment_payout_kyc_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      action VARCHAR(40) NOT NULL,
      notes TEXT,
      admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.payment_payout_failed_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
      action VARCHAR(40) NOT NULL,
      notes TEXT,
      admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.payment_payout_reconciliation_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
      action VARCHAR(40) NOT NULL,
      notes TEXT,
      admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.payment_payout_payout_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      action VARCHAR(40) NOT NULL,
      notes TEXT,
      amount NUMERIC(12,2),
      admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    INSERT INTO public.payment_payout_payment_state (payment_id, escrow_status, return_window_days, returns_window_expiry)
    SELECT
      p.id,
      CASE
        WHEN p.status::text = 'refunded' OR p.status::text = 'partially_refunded' THEN 'refunded'
        WHEN p.status::text = 'failed' THEN 'none'
        ELSE 'held'
      END,
      7,
      COALESCE(p.paid_at, p.created_at) + INTERVAL '7 days'
    FROM public.payments p
    ON CONFLICT (payment_id) DO NOTHING
  `);

  await db.query(`
    INSERT INTO public.payment_payout_cod_state (order_id, courier_deposit_status, deposited_amount, variance)
    SELECT
      o.id,
      'pending',
      NULL,
      0
    FROM public.orders o
    JOIN public.payments p ON p.order_id = o.id AND UPPER(COALESCE(p.method, '')) = 'COD'
    ON CONFLICT (order_id) DO NOTHING
  `);

  await db.query(`
    INSERT INTO public.payment_payout_failed_state (payment_id, failure_type, error_msg, retry_count)
    SELECT
      p.id,
      'gateway-failure',
      'Payment failed at gateway',
      0
    FROM public.payments p
    WHERE p.status::text = 'failed'
    ON CONFLICT (payment_id) DO NOTHING
  `);

  await db.query(`
    INSERT INTO public.payment_payout_seller_state (
      seller_id,
      bank_status,
      risk_level,
      bank_name,
      account_holder,
      account_number,
      ifsc,
      gross_sales,
      commission,
      shipping,
      taxes,
      refunds,
      available_balance,
      pending_balance,
      paid_amount,
      eligible_orders
    )
    SELECT
      u.id,
      'pending',
      'clear',
      NULL,
      NULL,
      NULL,
      NULL,
      COALESCE(stats.gross_sales, 0),
      COALESCE(stats.commission, 0),
      COALESCE(stats.shipping, 0),
      COALESCE(stats.taxes, 0),
      COALESCE(stats.refunds, 0),
      COALESCE(stats.gross_sales, 0) - COALESCE(stats.commission, 0) - COALESCE(stats.shipping, 0) - COALESCE(stats.taxes, 0) - COALESCE(stats.refunds, 0) - COALESCE(payouts.paid_amount, 0),
      COALESCE(payouts.pending_amount, 0),
      COALESCE(payouts.paid_amount, 0),
      COALESCE(orders.eligible_orders, 0)
    FROM public.users u
    LEFT JOIN public.seller_profiles sp ON sp.user_id = u.id
    LEFT JOIN (
      SELECT
        sl.seller_id,
        SUM(CASE WHEN sl.entry_type = 'sale_credit' THEN sl.amount ELSE 0 END)::numeric(12,2) AS gross_sales,
        SUM(CASE WHEN sl.entry_type = 'commission_debit' THEN sl.amount ELSE 0 END)::numeric(12,2) AS commission,
        SUM(CASE WHEN sl.entry_type = 'refund_debit' THEN sl.amount ELSE 0 END)::numeric(12,2) AS refunds,
        SUM(CASE WHEN sl.entry_type = 'adjustment' THEN sl.amount ELSE 0 END)::numeric(12,2) AS shipping,
        0::numeric(12,2) AS taxes
      FROM public.seller_ledger sl
      GROUP BY sl.seller_id
    ) stats ON stats.seller_id = u.id
    LEFT JOIN (
      SELECT
        seller_id,
        SUM(amount) FILTER (WHERE status::text = 'paid')::numeric(12,2) AS paid_amount,
        SUM(amount) FILTER (WHERE status::text IN ('pending', 'processing'))::numeric(12,2) AS pending_amount
      FROM public.seller_payouts
      GROUP BY seller_id
    ) payouts ON payouts.seller_id = u.id
    LEFT JOIN (
      SELECT oi.seller_id, COUNT(DISTINCT o.id)::int AS eligible_orders
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id AND o.status::text = 'delivered'
      GROUP BY oi.seller_id
    ) orders ON orders.seller_id = u.id
    WHERE u.role = 'seller'
    ON CONFLICT (seller_id) DO NOTHING
  `);

  // Recompute commission values using per-order stored commission where available.
  try {
    const fraction = (await commissionSettings.getCommissionSettings(db)).commissionRate / 100;
    await db.query(`
      UPDATE public.payment_payout_seller_state s
      SET commission = COALESCE(oi_stats.commission, s.commission),
          gross_sales = COALESCE(oi_stats.gross_sales, s.gross_sales),
          available_balance = COALESCE(s.gross_sales - COALESCE(oi_stats.commission, s.commission) - s.shipping - s.taxes - s.refunds - COALESCE(paid.paid_amount,0), s.available_balance)
      FROM (
        SELECT
          oi.seller_id,
          SUM(COALESCE(oi.commission_amount, (oi.line_total * $1)))::numeric(12,2) AS commission,
          SUM(COALESCE(oi.line_total, 0))::numeric(12,2) AS gross_sales
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE COALESCE(to_jsonb(o)->>'payment_status', 'pending') <> 'pending'
        GROUP BY oi.seller_id
      ) oi_stats
      LEFT JOIN (
        SELECT seller_id, SUM(amount) FILTER (WHERE status::text = 'paid')::numeric(12,2) AS paid_amount FROM public.seller_payouts GROUP BY seller_id
      ) paid ON paid.seller_id = s.seller_id
      WHERE oi_stats.seller_id = s.seller_id
    `, [fraction]);
  } catch (err) {
    console.warn('Failed to recompute payout seller commission from order_items', err && err.message);
  }

  await db.query(`
    UPDATE public.payment_payout_seller_state s
    SET
      bank_status = COALESCE(s.bank_status, 'pending'),
      risk_level = COALESCE(s.risk_level, 'clear'),
      gross_sales = COALESCE(s.gross_sales, 0),
      commission = COALESCE(s.commission, 0),
      shipping = COALESCE(s.shipping, 0),
      taxes = COALESCE(s.taxes, 0),
      refunds = COALESCE(s.refunds, 0),
      available_balance = COALESCE(s.available_balance, 0),
      pending_balance = COALESCE(s.pending_balance, 0),
      paid_amount = COALESCE(s.paid_amount, 0),
      eligible_orders = COALESCE(s.eligible_orders, 0),
      updated_at = NOW()
    WHERE s.seller_id IS NOT NULL
  `);
}

async function logAudit(db, { action, entityType, entityId = null, adminId = null, notes = '' }) {
  await ensureSupportTables(db);
  const validAdmin = /^[0-9a-fA-F-]{36}$/.test(String(adminId || '')) ? adminId : null;
  await db.query(
    `
      INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, after_data)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [validAdmin, action, entityType, entityId || null, notes ? { notes: String(notes) } : null]
  );
}

async function getOverview(db) {
  await ensureSupportTables(db);
  const [payments, sellers, cod, refunds, revenueSummary] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*)::int AS total_payments,
        COUNT(*) FILTER (WHERE p.status::text = 'paid')::int AS success_payments,
        COUNT(*) FILTER (WHERE p.status::text = 'failed')::int AS failed_payments,
        COALESCE(SUM(p.amount) FILTER (WHERE p.status::text = 'paid'), 0)::numeric(12,2) AS gross_sales,
        COALESCE(SUM(p.amount) FILTER (WHERE p.status::text = 'failed'), 0)::numeric(12,2) AS failed_total
      FROM public.payments p
    `),
    db.query(`
      SELECT
        COUNT(*)::int AS total_sellers,
        COALESCE(SUM(s.commission), 0)::numeric(12,2) AS total_commission,
        COALESCE(SUM(s.available_balance), 0)::numeric(12,2) AS total_seller_payable,
        COALESCE(SUM(s.paid_amount), 0)::numeric(12,2) AS total_paid_out,
        COALESCE(SUM(s.refunds), 0)::numeric(12,2) AS total_refunds
      FROM public.payment_payout_seller_state s
    `),
    db.query(`
      SELECT
        COUNT(*) FILTER (WHERE courier_deposit_status = 'pending')::int AS pending_cod
      FROM public.payment_payout_cod_state
    `),
    db.query(`
      SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS total_refunds
      FROM public.refunds
      WHERE status::text = 'refunded'
    `),
    db.query(`
      WITH online_summary AS (
        SELECT
          COALESCE(SUM(CASE WHEN UPPER(COALESCE(p.method, '')) <> 'COD' AND o.status::text = 'delivered' AND p.status::text IN ('paid', 'authorized') THEN p.amount ELSE 0 END), 0)::numeric(12,2) AS collected,
          COALESCE(SUM(CASE WHEN UPPER(COALESCE(p.method, '')) <> 'COD' AND NOT (o.status::text = 'delivered' AND p.status::text IN ('paid', 'authorized')) AND p.status::text IN ('paid', 'authorized') THEN p.amount ELSE 0 END), 0)::numeric(12,2) AS pending
        FROM public.orders o
        JOIN public.payments p ON p.order_id = o.id
      ),
      cod_summary AS (
        SELECT
          COALESCE(SUM(CASE WHEN UPPER(COALESCE(p.method, '')) = 'COD' AND o.status::text = 'delivered' AND COALESCE(state.courier_deposit_status, 'pending') = 'deposited' THEN p.amount ELSE 0 END), 0)::numeric(12,2) AS cod_collected,
          COALESCE(SUM(CASE WHEN UPPER(COALESCE(p.method, '')) = 'COD' AND NOT (o.status::text = 'delivered' AND COALESCE(state.courier_deposit_status, 'pending') = 'deposited') THEN p.amount ELSE 0 END), 0)::numeric(12,2) AS cod_pending
        FROM public.orders o
        JOIN public.payments p ON p.order_id = o.id AND UPPER(COALESCE(p.method, '')) = 'COD'
        LEFT JOIN public.payment_payout_cod_state state ON state.order_id = o.id
      )
      SELECT
        (online_summary.collected + cod_summary.cod_collected) AS total_gross_sales,
        (online_summary.pending + cod_summary.cod_pending) AS pending_amount
      FROM online_summary, cod_summary
    `)
  ]);

  return {
    totalGrossSales: toNumber(revenueSummary.rows[0].total_gross_sales),
    totalCommission: toNumber(sellers.rows[0].total_commission),
    pendingAmount: toNumber(revenueSummary.rows[0].pending_amount),
    totalPendingEscrow: 0,
    totalSellerPayable: toNumber(sellers.rows[0].total_seller_payable),
    totalPaidOut: toNumber(sellers.rows[0].total_paid_out),
    totalRefunds: toNumber(refunds.rows[0].total_refunds || sellers.rows[0].total_refunds),
    codPendingReconciliation: payments.rows[0].failed_payments ? 0 : toNumber(cod.rows[0].pending_cod),
    failedPayments: payments.rows[0].failed_payments,
    totalSellers: sellers.rows[0].total_sellers
  };
}

async function getOnlinePayments(db) {
  await ensureSupportTables(db);
  const result = await db.query(`
    SELECT
      p.id AS payment_id,
      o.order_number,
      COALESCE(c.full_name, 'Customer') AS customer_name,
      COALESCE(sellers.seller_name, 'Seller') AS seller_name,
      p.amount,
      COALESCE(NULLIF(p.provider, ''), p.method) AS gateway,
      p.status::text AS payment_status,
      COALESCE(state.escrow_status, CASE WHEN p.status::text = 'failed' THEN 'none' WHEN p.status::text = 'refunded' THEN 'refunded' ELSE 'held' END) AS escrow_status,
      p.created_at,
      COALESCE(state.return_window_days, 7) AS return_window_days,
      state.returns_window_expiry,
      COALESCE(p.transaction_ref, o.order_number) AS transaction_ref,
      o.status::text AS order_status,
      ship.shipment_status::text AS shipment_status
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    JOIN public.users c ON c.id = o.customer_id
    LEFT JOIN public.shipments ship ON ship.order_id = o.id
    LEFT JOIN public.payment_payout_payment_state state ON state.payment_id = p.id
    LEFT JOIN (
      SELECT
        oi.order_id,
        STRING_AGG(DISTINCT COALESCE(sp.store_name, su.full_name), ', ') AS seller_name
      FROM public.order_items oi
      JOIN public.users su ON su.id = oi.seller_id
      LEFT JOIN public.seller_profiles sp ON sp.user_id = oi.seller_id
      GROUP BY oi.order_id
    ) sellers ON sellers.order_id = o.id
    WHERE UPPER(COALESCE(p.method, '')) <> 'COD'
    ORDER BY p.created_at DESC
  `);

  return result.rows.map((row) => {
    const paymentStatus = mapPaymentStatus(row.payment_status);
    const orderTotal = toNumber(row.amount);
    const resolvedDeliveryStatus = row.order_status === 'delivered' || row.shipment_status === 'delivered'
      ? 'delivered'
      : (row.shipment_status || row.order_status || 'pending');

    return {
      id: row.payment_id,
      orderId: row.order_number,
      customerName: row.customer_name,
      sellerName: row.seller_name,
      productAmount: orderTotal,
      shippingCharge: 0,
      orderTotal,
      amount: orderTotal,
      gateway: row.gateway,
      paymentMethod: String(row.gateway || 'ONLINE').toUpperCase(),
      paymentStatus,
      paymentStatusLabel: String(row.payment_status || '').toUpperCase(),
      escrowStatus: mapEscrowStatus(row.escrow_status, paymentStatus),
      deliveryStatus: mapShipmentStatus(resolvedDeliveryStatus),
      orderStatus: String(row.order_status || '').toLowerCase(),
      createdAt: new Date(row.created_at),
      returnWindowDays: Number(row.return_window_days || 7),
      returnsWindowExpiry: row.returns_window_expiry ? new Date(row.returns_window_expiry) : null,
      ref: row.transaction_ref,
      transactionRef: row.transaction_ref
    };
  });
}

async function getCodTracking(db) {
  await ensureSupportTables(db);
  const result = await db.query(`
    SELECT
      o.id AS order_id,
      o.order_number,
      COALESCE(sellers.seller_name, 'Seller') AS seller_name,
      COALESCE(ship.courier_name, 'Courier') AS courier_name,
      COALESCE(p.amount, o.grand_total, 0) AS cod_amount,
      o.status::text AS order_status,
      ship.shipment_status::text AS shipment_status,
      COALESCE(state.courier_deposit_status, 'pending') AS courier_deposit_status,
      state.deposited_amount,
      COALESCE(state.variance, 0) AS variance,
      COALESCE(state.updated_at, o.created_at) AS created_at
    FROM public.orders o
    JOIN public.payments p ON p.order_id = o.id AND UPPER(COALESCE(p.method, '')) = 'COD'
    LEFT JOIN public.shipments ship ON ship.order_id = o.id
    LEFT JOIN public.payment_payout_cod_state state ON state.order_id = o.id
    LEFT JOIN (
      SELECT
        oi.order_id,
        STRING_AGG(DISTINCT COALESCE(sp.store_name, su.full_name), ', ') AS seller_name
      FROM public.order_items oi
      JOIN public.users su ON su.id = oi.seller_id
      LEFT JOIN public.seller_profiles sp ON sp.user_id = oi.seller_id
      GROUP BY oi.order_id
    ) sellers ON sellers.order_id = o.id
    ORDER BY o.created_at DESC
  `);

  return result.rows.map((row) => ({
    id: row.order_id,
    orderId: row.order_number,
    sellerName: row.seller_name,
    courierName: row.courier_name,
    codAmount: toNumber(row.cod_amount),
    deliveryStatus: mapShipmentStatus(row.shipment_status),
    courierDepositStatus: mapCourierDepositStatus(row.courier_deposit_status),
    depositedAmount: row.deposited_amount === null ? null : toNumber(row.deposited_amount),
    variance: toNumber(row.variance),
    createdAt: new Date(row.created_at)
  }));
}

async function getPayoutQueue(db) {
  await ensureSupportTables(db);
  const result = await db.query(`
    WITH seller_order_totals AS (
      SELECT
        o.id AS order_id,
        o.status::text AS order_status,
        COALESCE(o.payment_status::text, 'pending') AS order_payment_status,
        COALESCE(
          (
            SELECT p.method
            FROM public.payments p
            WHERE p.order_id = o.id
            ORDER BY p.created_at DESC
            LIMIT 1
          ),
          'ONLINE'
        ) AS payment_method,
        COALESCE(
          (
            SELECT p.status::text
            FROM public.payments p
            WHERE p.order_id = o.id
            ORDER BY p.created_at DESC
            LIMIT 1
          ),
          'pending'
        ) AS payment_status,
        oi.seller_id,
        SUM(oi.line_total)::numeric AS seller_sales,
        SUM(COALESCE(oi.commission_amount, 0))::numeric AS commission_amount,
        SUM(COALESCE(oi.line_total, 0) - COALESCE(oi.commission_amount, 0))::numeric AS seller_earning
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      GROUP BY o.id, o.status, o.payment_status, oi.seller_id
    ),
    seller_stats AS (
      SELECT
        seller_id,
        COALESCE(SUM(CASE WHEN (
          LOWER(COALESCE(order_status, 'pending')) IN ('delivered', 'completed') AND LOWER(COALESCE(payment_status, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured')
        ) THEN seller_earning ELSE 0 END), 0)::numeric AS lifetime_earnings,
        COALESCE(SUM(seller_sales), 0)::numeric AS total_sales,
        COALESCE(SUM(commission_amount), 0)::numeric AS total_commission
      FROM seller_order_totals
      GROUP BY seller_id
    ),
    payout_stats AS (
      SELECT
        seller_id,
        COALESCE(SUM(amount) FILTER (WHERE LOWER(COALESCE(status::text, 'pending')) = 'paid'), 0)::numeric(12,2) AS completed_payouts,
        COALESCE(SUM(amount) FILTER (WHERE LOWER(COALESCE(status::text, 'pending')) IN ('pending', 'processing')), 0)::numeric(12,2) AS pending_payouts
      FROM public.seller_payouts
      GROUP BY seller_id
    )
    SELECT
      u.id AS seller_id,
      COALESCE(sp.store_name, u.full_name) AS seller_name,
      COALESCE(sp.kyc_status::text, 'pending') AS kyc_status,
      COALESCE(stats.lifetime_earnings, 0)::numeric(12,2) AS lifetime_earnings,
      COALESCE(stats.total_sales, 0)::numeric(12,2) AS total_sales,
      COALESCE(stats.total_commission, 0)::numeric(12,2) AS total_commission,
      COALESCE(payouts.completed_payouts, 0)::numeric(12,2) AS completed_payouts,
      COALESCE(payouts.pending_payouts, 0)::numeric(12,2) AS pending_payouts,
      COALESCE(stats.lifetime_earnings, 0) - COALESCE(payouts.completed_payouts, 0) - COALESCE(payouts.pending_payouts, 0) AS withdrawable_balance
    FROM public.users u
    LEFT JOIN public.seller_profiles sp ON sp.user_id = u.id
    LEFT JOIN seller_stats stats ON stats.seller_id = u.id
    LEFT JOIN payout_stats payouts ON payouts.seller_id = u.id
    WHERE u.role = 'seller'
    ORDER BY COALESCE(sp.store_name, u.full_name)
  `);

  const enrichedRows = await Promise.all(result.rows.map(async (row) => {
    const managementSnapshot = await getSellerManagementSnapshot(db, row.seller_id);

    const availableBalance = Math.max(0, toNumber(row.withdrawable_balance));

    return {
      id: row.seller_id,
      name: managementSnapshot.sellerName || row.seller_name,
      kycStatus: managementSnapshot.kycStatus || mapKycStatus(row.kyc_status),
      bankStatus: managementSnapshot.bankStatus || 'pending',
      riskLevel: managementSnapshot.riskLevel || 'clear',
      bankName: managementSnapshot.bankName || 'Bank not added',
      accountHolder: managementSnapshot.accountHolder || row.seller_name,
      accountNumber: managementSnapshot.accountNumber || '----',
      ifsc: 'N/A',
      grossSales: toNumber(row.total_sales),
      commission: toNumber(row.total_commission),
      shipping: 0,
      taxes: 0,
      refunds: 0,
      availableBalance,
      available_balance: availableBalance,
      pendingBalance: toNumber(row.pending_payouts),
      pending_balance: toNumber(row.pending_payouts),
      paidAmount: toNumber(row.completed_payouts),
      paid_amount: toNumber(row.completed_payouts),
      eligibleOrders: 0,
      lifetimeEarnings: toNumber(row.lifetime_earnings)
    };
  }));

  return enrichedRows;
}

async function getFailedPayments(db) {
  await ensureSupportTables(db);
  const result = await db.query(`
    SELECT
      p.id AS payment_id,
      o.order_number,
      COALESCE(c.full_name, 'Customer') AS customer_name,
      p.amount,
      COALESCE(state.failure_type, 'gateway-failure') AS failure_type,
      COALESCE(state.error_msg, 'Payment failed at gateway') AS error_msg,
      COALESCE(state.retry_count, 0) AS retry_count,
      p.created_at,
      COALESCE(NULLIF(p.provider, ''), p.method) AS gateway
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    JOIN public.users c ON c.id = o.customer_id
    LEFT JOIN public.payment_payout_failed_state state ON state.payment_id = p.id
    WHERE p.status::text = 'failed'
    ORDER BY p.created_at DESC
  `);

  return result.rows.map((row) => ({
    id: row.payment_id,
    orderId: row.order_number,
    customerName: row.customer_name,
    amount: toNumber(row.amount),
    failureType: row.failure_type,
    errorMsg: row.error_msg,
    retryCount: Number(row.retry_count || 0),
    createdAt: new Date(row.created_at),
    gateway: row.gateway
  }));
}

async function getAuditLog(db) {
  await ensureSupportTables(db);
  const result = await db.query(`
    SELECT
      id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      after_data,
      created_at
    FROM public.audit_logs
    ORDER BY created_at DESC
    LIMIT 200
  `);

  return result.rows.map((row) => ({
    id: row.id,
    adminId: row.actor_user_id || 'SYSTEM',
    action: row.action,
    sellerId: row.entity_type === 'seller' ? row.entity_id : null,
    orderId: row.entity_type === 'order' ? row.entity_id : null,
    timestamp: new Date(row.created_at),
    prevValue: null,
    newValue: null,
    notes: row.after_data?.notes || ''
  }));
}

async function getPaymentById(db, paymentId) {
  await ensureSupportTables(db);
  const result = await db.query(`
    SELECT p.id, p.order_id, p.amount, p.status::text AS payment_status, p.method, p.provider, p.transaction_ref,
           o.order_number, o.customer_id, COALESCE(state.escrow_status, 'held') AS escrow_status,
           state.return_window_days, state.returns_window_expiry
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    LEFT JOIN public.payment_payout_payment_state state ON state.payment_id = p.id
    WHERE p.id = $1
    LIMIT 1
  `, [paymentId]);
  return result.rows[0] || null;
}

async function getCodByOrderId(db, orderId) {
  await ensureSupportTables(db);
  const result = await db.query(`
    SELECT o.id AS order_id, o.order_number, p.amount AS cod_amount, COALESCE(state.courier_deposit_status, 'pending') AS courier_deposit_status,
           state.deposited_amount, COALESCE(state.variance, 0) AS variance
    FROM public.orders o
    JOIN public.payments p ON p.order_id = o.id AND UPPER(COALESCE(p.method, '')) = 'COD'
    LEFT JOIN public.payment_payout_cod_state state ON state.order_id = o.id
    WHERE o.id = $1 OR o.order_number = $1
    LIMIT 1
  `, [orderId]);
  return result.rows[0] || null;
}

async function getSellerState(db, sellerId) {
  await ensureSupportTables(db);
  const stateResult = await db.query(`
    SELECT
      u.id,
      COALESCE(state.bank_status, 'pending') AS bank_status,
      COALESCE(state.risk_level, 'clear') AS risk_level,
      COALESCE(state.bank_name, 'Bank not added') AS bank_name,
      COALESCE(state.account_holder, '') AS account_holder,
      COALESCE(state.account_number, '----') AS account_number,
      COALESCE(state.ifsc, 'N/A') AS ifsc,
      COALESCE(state.gross_sales, 0) AS gross_sales,
      COALESCE(state.commission, 0) AS commission,
      COALESCE(state.shipping, 0) AS shipping,
      COALESCE(state.taxes, 0) AS taxes,
      COALESCE(state.refunds, 0) AS refunds,
      COALESCE(state.available_balance, 0) AS available_balance,
      COALESCE(state.pending_balance, 0) AS pending_balance,
      COALESCE(state.paid_amount, 0) AS paid_amount,
      COALESCE(state.eligible_orders, 0) AS eligible_orders
    FROM public.users u
    LEFT JOIN public.payment_payout_seller_state state ON state.seller_id = u.id
    WHERE u.id = $1
    LIMIT 1
  `, [sellerId]);

  const state = stateResult.rows[0];
  if (!state) return null;

  const managementSnapshot = await getSellerManagementSnapshot(db, sellerId);

  const availableBalance = calculateAvailableBalance({
    gross_sales: state.gross_sales,
    commission: state.commission,
    shipping: state.shipping,
    taxes: state.taxes,
    refunds: state.refunds,
    paid_amount: state.paid_amount,
    pending_balance: state.pending_balance
  });

  return {
    ...state,
    seller_name: managementSnapshot.sellerName || '',
    kyc_status: managementSnapshot.kycStatus || 'pending',
    bank_status: managementSnapshot.bankStatus || state.bank_status || 'pending',
    risk_level: managementSnapshot.riskLevel || state.risk_level || 'clear',
    bank_name: managementSnapshot.bankName || state.bank_name || 'Bank not added',
    account_holder: managementSnapshot.accountHolder || state.account_holder || managementSnapshot.sellerName || '',
    account_number: managementSnapshot.accountNumber || state.account_number || '----',
    ifsc: state.ifsc || 'N/A',
    available_balance: availableBalance,
    pending_balance: state.pending_balance || 0
  };
}

async function upsertSellerState(db, sellerId, updates = {}) {
  await ensureSupportTables(db);
  const current = await getSellerState(db, sellerId);
  if (!current) throw new Error('Seller not found');

  const next = {
    bank_status: updates.bank_status || current.bank_status || 'pending',
    risk_level: updates.risk_level || current.risk_level || 'clear',
    bank_name: updates.bank_name !== undefined ? updates.bank_name : current.bank_name,
    account_holder: updates.account_holder !== undefined ? updates.account_holder : current.account_holder,
    account_number: updates.account_number !== undefined ? updates.account_number : current.account_number,
    ifsc: updates.ifsc !== undefined ? updates.ifsc : current.ifsc,
    gross_sales: updates.gross_sales !== undefined ? updates.gross_sales : current.gross_sales,
    commission: updates.commission !== undefined ? updates.commission : current.commission,
    shipping: updates.shipping !== undefined ? updates.shipping : current.shipping,
    taxes: updates.taxes !== undefined ? updates.taxes : current.taxes,
    refunds: updates.refunds !== undefined ? updates.refunds : current.refunds,
    available_balance: updates.available_balance !== undefined ? updates.available_balance : current.available_balance,
    pending_balance: updates.pending_balance !== undefined ? updates.pending_balance : current.pending_balance,
    paid_amount: updates.paid_amount !== undefined ? updates.paid_amount : current.paid_amount,
    eligible_orders: updates.eligible_orders !== undefined ? updates.eligible_orders : current.eligible_orders
  };

  await db.query(`
    INSERT INTO public.payment_payout_seller_state (
      seller_id, bank_status, risk_level, bank_name, account_holder, account_number, ifsc,
      gross_sales, commission, shipping, taxes, refunds, available_balance, pending_balance, paid_amount, eligible_orders, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
    ON CONFLICT (seller_id) DO UPDATE SET
      bank_status = EXCLUDED.bank_status,
      risk_level = EXCLUDED.risk_level,
      bank_name = EXCLUDED.bank_name,
      account_holder = EXCLUDED.account_holder,
      account_number = EXCLUDED.account_number,
      ifsc = EXCLUDED.ifsc,
      gross_sales = EXCLUDED.gross_sales,
      commission = EXCLUDED.commission,
      shipping = EXCLUDED.shipping,
      taxes = EXCLUDED.taxes,
      refunds = EXCLUDED.refunds,
      available_balance = EXCLUDED.available_balance,
      pending_balance = EXCLUDED.pending_balance,
      paid_amount = EXCLUDED.paid_amount,
      eligible_orders = EXCLUDED.eligible_orders,
      updated_at = NOW()
  `, [
    sellerId,
    next.bank_status,
    next.risk_level,
    next.bank_name,
    next.account_holder,
    next.account_number,
    next.ifsc,
    next.gross_sales,
    next.commission,
    next.shipping,
    next.taxes,
    next.refunds,
    next.available_balance,
    next.pending_balance,
    next.paid_amount,
    next.eligible_orders
  ]);
}

async function refundPayment(db, paymentId, { reason = '', notes = '' } = {}, admin = null) {
  const payment = await getPaymentById(db, paymentId);
  if (!payment) throw new Error('Payment not found');

  await db.query(`UPDATE public.payments SET status = 'refunded', updated_at = NOW() WHERE id = $1`, [paymentId]);
  await db.query(`
    INSERT INTO public.refunds (return_request_id, payment_id, amount, status, transaction_ref, processed_at)
    VALUES (NULL, $1, $2, 'refunded', $3, NOW())
  `, [paymentId, payment.amount, `RF-${String(paymentId).slice(0, 8).toUpperCase()}`]);
  await db.query(`
    UPDATE public.payment_payout_payment_state
    SET escrow_status = 'refunded', updated_at = NOW()
    WHERE payment_id = $1
  `, [paymentId]);

  await logAudit(db, {
    action: 'refund-issued',
    entityType: 'order',
    entityId: payment.order_id,
    adminId: admin,
    notes: [reason, notes].filter(Boolean).join('. ')
  });
}

async function markDispute(db, paymentId, { disputeType = '', details = '' } = {}, admin = null) {
  const payment = await getPaymentById(db, paymentId);
  if (!payment) throw new Error('Payment not found');

  await db.query(`
    UPDATE public.payment_payout_payment_state
    SET escrow_status = 'dispute', updated_at = NOW()
    WHERE payment_id = $1
  `, [paymentId]);

  await logAudit(db, {
    action: 'dispute-marked',
    entityType: 'order',
    entityId: payment.order_id,
    adminId: admin,
    notes: [disputeType, details].filter(Boolean).join(': ')
  });
}

async function retryFailedPayment(db, paymentId, admin = null) {
  const payment = await getPaymentById(db, paymentId);
  if (!payment) throw new Error('Payment not found');

  await db.query(`
    INSERT INTO public.payment_payout_failed_state (payment_id, failure_type, error_msg, retry_count)
    VALUES ($1, 'gateway-failure', 'Payment failed at gateway', 1)
    ON CONFLICT (payment_id) DO UPDATE SET retry_count = public.payment_payout_failed_state.retry_count + 1, updated_at = NOW()
  `, [paymentId]);

  await logAudit(db, {
    action: 'failed-payment-retry',
    entityType: 'order',
    entityId: payment.order_id,
    adminId: admin,
    notes: 'Retry initiated for failed payment'
  });
}

async function flagFraud(db, paymentId, admin = null) {
  const payment = await getPaymentById(db, paymentId);
  if (!payment) throw new Error('Payment not found');

  await logAudit(db, {
    action: 'fraud-flagged',
    entityType: 'order',
    entityId: payment.order_id,
    adminId: admin,
    notes: 'Fraud suspected on failed payment'
  });
}

async function confirmCodDeposit(db, orderId, admin = null) {
  const cod = await getCodByOrderId(db, orderId);
  if (!cod) throw new Error('COD order not found');

  await db.query(`
    INSERT INTO public.payment_payout_cod_state (order_id, courier_deposit_status, deposited_amount, variance)
    VALUES ($1, 'deposited', $2, 0)
    ON CONFLICT (order_id) DO UPDATE SET courier_deposit_status = 'deposited', deposited_amount = EXCLUDED.deposited_amount, variance = 0, updated_at = NOW()
  `, [cod.order_id, cod.cod_amount]);

  await db.query(`
    INSERT INTO public.payment_payout_cod_deposit_log (order_id, action, notes, admin_id)
    VALUES ($1, 'cod-confirmed', 'Courier deposit confirmed', $2)
  `, [cod.order_id, admin]);

  await logAudit(db, {
    action: 'cod-confirmed',
    entityType: 'order',
    entityId: cod.order_id,
    adminId: admin,
    notes: 'Courier deposit confirmed'
  });
}

async function flagCodMismatch(db, orderId, admin = null) {
  const cod = await getCodByOrderId(db, orderId);
  if (!cod) throw new Error('COD order not found');

  await db.query(`
    INSERT INTO public.payment_payout_cod_state (order_id, courier_deposit_status, deposited_amount, variance)
    VALUES ($1, 'mismatch', $2, $3)
    ON CONFLICT (order_id) DO UPDATE SET courier_deposit_status = 'mismatch', deposited_amount = EXCLUDED.deposited_amount, variance = EXCLUDED.variance, updated_at = NOW()
  `, [cod.order_id, cod.deposited_amount || cod.cod_amount - 200, toNumber(cod.deposited_amount || cod.cod_amount - 200) - toNumber(cod.cod_amount)]);

  await db.query(`
    INSERT INTO public.payment_payout_cod_deposit_log (order_id, action, notes, admin_id)
    VALUES ($1, 'cod-mismatch', 'Courier amount mismatch flagged', $2)
  `, [cod.order_id, admin]);

  await logAudit(db, {
    action: 'cod-mismatch',
    entityType: 'order',
    entityId: cod.order_id,
    adminId: admin,
    notes: 'Courier amount mismatch flagged'
  });
}

async function updateSellerKyc(db, sellerId, action, notes = '', admin = null) {
  const seller = await getSellerState(db, sellerId);
  if (!seller) throw new Error('Seller not found');

  let nextStatus = 'pending';
  let nextUserStatus = 'active';
  if (action === 'approve') {
    nextStatus = 'verified';
    nextUserStatus = 'active';
  }
  if (action === 'reject') {
    nextStatus = 'rejected';
    nextUserStatus = 'suspended';
  }
  if (action === 'request') {
    nextStatus = 'pending';
    nextUserStatus = 'frozen';
  }

  await db.query(`UPDATE public.seller_profiles SET kyc_status = $2, updated_at = NOW() WHERE user_id = $1`, [sellerId, nextStatus]);
  await db.query(`UPDATE public.users SET status = $2, updated_at = NOW() WHERE id = $1`, [sellerId, nextUserStatus]);
  await db.query(`INSERT INTO public.payment_payout_kyc_audit (seller_id, action, notes, admin_id) VALUES ($1, $2, $3, $4)`, [sellerId, `kyc-${action}`, notes, admin]);

  if (action === 'reject') {
    await upsertSellerState(db, sellerId, { risk_level: 'frozen' });
  }

  await logAudit(db, {
    action: `kyc-${action}`,
    entityType: 'seller',
    entityId: sellerId,
    adminId: admin,
    notes: notes || `KYC ${action}`
  });
}

async function updateSellerBank(db, sellerId, action, notes = '', admin = null) {
  const seller = await getSellerState(db, sellerId);
  if (!seller) throw new Error('Seller not found');

  const nextBankStatus = action === 'approve' ? 'verified' : 'rejected';
  const nextRisk = action === 'reject' ? 'frozen' : seller.risk_level;
  await upsertSellerState(db, sellerId, { bank_status: nextBankStatus, risk_level: nextRisk });
  await db.query(`UPDATE public.seller_bank_accounts SET verification_status = $2, rejection_reason = CASE WHEN $2 = 'rejected' THEN COALESCE(NULLIF($3, ''), 'Rejected by admin') ELSE NULL END, verified_by = $4, verified_at = NOW(), updated_at = NOW() WHERE seller_id = $1`, [sellerId, nextBankStatus, notes, admin]);
  await db.query(`UPDATE lumina.seller_bank_accounts SET verification_status = $2, rejection_reason = CASE WHEN $2 = 'rejected' THEN COALESCE(NULLIF($3, ''), 'Rejected by admin') ELSE NULL END, verified_by = $4, verified_at = NOW(), updated_at = NOW() WHERE seller_id = $1`, [sellerId, nextBankStatus, notes, admin]);
  await db.query(`INSERT INTO public.payment_payout_bank_audit (seller_id, action, notes, admin_id) VALUES ($1, $2, $3, $4)`, [sellerId, `bank-${action}`, notes, admin]);

  await logAudit(db, {
    action: `bank-${action}`,
    entityType: 'seller',
    entityId: sellerId,
    adminId: admin,
    notes: notes || `Bank ${action}`
  });
}

async function refreshSellerPayoutState(db, sellerId) {
  const seller = await getSellerState(db, sellerId);
  if (!seller) return null;

  const payoutResult = await db.query(
    `
      SELECT
        COALESCE(ledger.gross_sales, 0)::numeric(12,2) AS gross_sales,
        COALESCE(ledger.commission, 0)::numeric(12,2) AS commission,
        COALESCE(ledger.shipping, 0)::numeric(12,2) AS shipping,
        COALESCE(ledger.taxes, 0)::numeric(12,2) AS taxes,
        COALESCE(ledger.refunds, 0)::numeric(12,2) AS refunds,
        COALESCE(payouts.paid_amount, 0)::numeric(12,2) AS paid_amount,
        COALESCE(payouts.pending_amount, 0)::numeric(12,2) AS pending_amount
      FROM (
        SELECT
          seller_id,
          SUM(CASE WHEN entry_type = 'sale_credit' THEN amount ELSE 0 END)::numeric(12,2) AS gross_sales,
          SUM(CASE WHEN entry_type = 'commission_debit' THEN amount ELSE 0 END)::numeric(12,2) AS commission,
          SUM(CASE WHEN entry_type = 'refund_debit' THEN amount ELSE 0 END)::numeric(12,2) AS refunds,
          SUM(CASE WHEN entry_type = 'adjustment' THEN amount ELSE 0 END)::numeric(12,2) AS shipping,
          0::numeric(12,2) AS taxes
        FROM public.seller_ledger
        WHERE seller_id = $1
        GROUP BY seller_id
      ) ledger
      LEFT JOIN (
        SELECT
          seller_id,
          SUM(amount) FILTER (WHERE status::text = 'paid')::numeric(12,2) AS paid_amount,
          SUM(amount) FILTER (WHERE status::text IN ('pending', 'processing'))::numeric(12,2) AS pending_amount
        FROM public.seller_payouts
        WHERE seller_id = $1
        GROUP BY seller_id
      ) payouts ON payouts.seller_id = ledger.seller_id
    `,
    [sellerId]
  );

  const ledgerRow = payoutResult.rows[0] || {};
  const pendingAmount = toNumber(ledgerRow.pending_amount || 0);
  const paidAmount = toNumber(ledgerRow.paid_amount || 0);
  const availableBalance = Math.max(0, toNumber(ledgerRow.gross_sales || 0) - toNumber(ledgerRow.commission || 0) - toNumber(ledgerRow.shipping || 0) - toNumber(ledgerRow.taxes || 0) - toNumber(ledgerRow.refunds || 0) - paidAmount - pendingAmount);

  await upsertSellerState(db, sellerId, {
    available_balance: availableBalance,
    pending_balance: pendingAmount,
    paid_amount: paidAmount
  });

  return { pendingAmount, paidAmount, availableBalance };
}

async function resolvePendingPayout(db, sellerId) {
  const result = await db.query(
    `
      SELECT id, seller_id, amount, status::text AS status, payout_reference
      FROM public.seller_payouts
      WHERE seller_id = $1
        AND LOWER(COALESCE(status::text, 'pending')) IN ('pending', 'processing')
      ORDER BY created_at DESC, updated_at DESC
      LIMIT 1
    `,
    [sellerId]
  );

  return result.rows[0] || null;
}

async function approvePayout(db, sellerId, notes = '', admin = null, transactionReference = '') {
  const seller = await getSellerState(db, sellerId);
  if (!seller) throw new Error('Seller not found');

  const payoutRequest = await resolvePendingPayout(db, sellerId);
  if (!payoutRequest || !['pending', 'processing'].includes(String(payoutRequest.status || '').toLowerCase())) {
    throw new Error('This payout has already been processed.');
  }

  const payoutAmount = toNumber(payoutRequest.amount);
  if (!payoutAmount) throw new Error('No payable payout request found');

  await db.query(
    `
      UPDATE public.seller_payouts
      SET status = 'paid',
          payout_reference = COALESCE(NULLIF($2, ''), payout_reference, $2),
          reviewed_by = $3,
          reviewed_at = NOW(),
          rejection_reason = NULL,
          transaction_reference = COALESCE(NULLIF($4, ''), transaction_reference, $2),
          processed_by = $3,
          processed_at = NOW(),
          updated_at = NOW(),
          paid_at = NOW()
      WHERE id = $1
    `,
    [payoutRequest.id, payoutRequest.payout_reference || `PAYOUT-${Date.now()}`, admin, transactionReference || '']
  );

  await refreshSellerPayoutState(db, sellerId);

  await db.query(`INSERT INTO public.payment_payout_payout_log (seller_id, action, notes, amount, admin_id) VALUES ($1, 'payout-approved', $2, $3, $4)`, [sellerId, notes || 'Payout approved', payoutAmount, admin]);
  await db.query(`INSERT INTO public.notifications (user_id, title, body, type, meta, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`, [sellerId, 'Payout approved', `Your payout request for ${payoutAmount.toFixed(2)} has been approved.`, 'info', JSON.stringify({ payoutAmount, action: 'approved' })]);
  await logAudit(db, {
    action: 'payout-approved',
    entityType: 'seller',
    entityId: sellerId,
    adminId: admin,
    notes: notes || 'Payout approved'
  });
}

async function rejectPayout(db, sellerId, notes = '', admin = null) {
  const seller = await getSellerState(db, sellerId);
  if (!seller) throw new Error('Seller not found');

  const payoutRequest = await resolvePendingPayout(db, sellerId);
  if (!payoutRequest || !['pending', 'processing'].includes(String(payoutRequest.status || '').toLowerCase())) {
    throw new Error('This payout has already been processed.');
  }

  await db.query(
    `
      UPDATE public.seller_payouts
      SET status = 'rejected',
          reviewed_by = $2,
          reviewed_at = NOW(),
          rejection_reason = $3,
          processed_by = $2,
          processed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [payoutRequest.id, admin, notes || 'Payout rejected']
  );

  await refreshSellerPayoutState(db, sellerId);
  await upsertSellerState(db, sellerId, { risk_level: 'frozen' });
  await db.query(`INSERT INTO public.payment_payout_payout_log (seller_id, action, notes, amount, admin_id) VALUES ($1, 'payout-rejected', $2, NULL, $3)`, [sellerId, notes || 'Payout rejected', admin]);
  await db.query(`INSERT INTO public.notifications (user_id, title, body, type, meta, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`, [sellerId, 'Payout rejected', `Your payout request was rejected. ${notes || ''}`.trim(), 'warning', JSON.stringify({ action: 'rejected' })]);

  await logAudit(db, {
    action: 'payout-rejected',
    entityType: 'seller',
    entityId: sellerId,
    adminId: admin,
    notes: notes || 'Payout rejected'
  });
}

async function batchApprovePayouts(db, sellerIds = [], admin = null) {
  for (const sellerId of sellerIds) {
    const seller = await getSellerState(db, sellerId);
    if (!seller) continue;
    if (seller.kyc_status !== 'verified' || seller.bank_status !== 'verified' || seller.risk_level !== 'clear') continue;
    await approvePayout(db, sellerId, 'Batch payout approval', admin);
  }
}

module.exports = {
  adminId,
  normalizeText,
  ensureSupportTables,
  logAudit,
  getOverview,
  getOnlinePayments,
  getCodTracking,
  getPayoutQueue,
  getFailedPayments,
  getAuditLog,
  getPaymentById,
  getCodByOrderId,
  getSellerState,
  refundPayment,
  markDispute,
  retryFailedPayment,
  flagFraud,
  confirmCodDeposit,
  flagCodMismatch,
  updateSellerKyc,
  updateSellerBank,
  approvePayout,
  rejectPayout,
  refreshSellerPayoutState,
  batchApprovePayouts,
  mapKycStatus
};
