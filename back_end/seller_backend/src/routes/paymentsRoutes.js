const express = require('express');

const router = express.Router();
const commissionSettings = require('../../../admin_backend/src/data/commissionSettingsData');
const { refreshSellerPayoutState } = require('../../../admin_backend/src/data/paymentPayoutService');
const { toMoney, ensureSellerEarningsColumns } = require('./earningsUtils');

function getSellerId(req) {
  const raw = [
    req.auth?.session?.userId,
    req.auth?.user?.id,
    req.auth?.user?.sellerId,
    req.auth?.session?.sellerId,
    req.headers['x-seller-id'],
    req.headers['x-user-id'],
    req.query?.sellerId,
    req.query?.sellerID,
    req.body?.sellerId,
    req.body?.sellerID
  ].find((value) => value !== undefined && value !== null && String(value).trim() !== '');

  return String(raw || '').trim();
}

async function resolveSellerId(req) {
  const sellerId = getSellerId(req);
  return sellerId || null;
}

async function ensurePayoutReference(req) {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS public.seller_payouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      period_start DATE,
      period_end DATE,
      amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'rejected')),
      payout_reference VARCHAR(120),
      bank_account_id UUID,
      request_note TEXT,
      rejection_reason TEXT,
      reviewed_by UUID,
      reviewed_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      transaction_reference VARCHAR(120),
      processed_by UUID,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  try {
    await req.db.query(createTableSql);
  } catch (error) {
    const message = String(error?.message || '');
    if (!message.includes('payout_status') && !message.includes('does not exist')) {
      throw error;
    }
    await req.db.query(createTableSql.replace('status VARCHAR(20) NOT NULL DEFAULT \'pending\' CHECK (status IN (\'pending\', \'processing\', \'paid\', \'failed\'))', 'status VARCHAR(20) NOT NULL DEFAULT \'pending\''));
  }

  await req.db.query(`ALTER TABLE public.seller_payouts ADD COLUMN IF NOT EXISTS bank_account_id UUID`);
  await req.db.query(`ALTER TABLE public.seller_payouts ADD COLUMN IF NOT EXISTS request_note TEXT`);
  await req.db.query(`ALTER TABLE public.seller_payouts ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await req.db.query(`ALTER TABLE public.seller_payouts ADD COLUMN IF NOT EXISTS reviewed_by UUID`);
  await req.db.query(`ALTER TABLE public.seller_payouts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
  await req.db.query(`ALTER TABLE public.seller_payouts ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(120)`);
  await req.db.query(`ALTER TABLE public.seller_payouts ADD COLUMN IF NOT EXISTS processed_by UUID`);
  await req.db.query(`ALTER TABLE public.seller_payouts ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`);
}

async function ensureNotificationTable(req) {
  await req.db.query(`
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

async function getNotificationPreference(req, sellerId, preferenceKey) {
  try {
    const result = await req.db.query(
      `
        SELECT email_notifications, sms_notifications, push_notifications, marketing_opt_in
        FROM lumina.user_preferences
        WHERE user_id = $1
        LIMIT 1
      `,
      [sellerId]
    );

    const row = result.rows[0] || {};
    if (preferenceKey === 'orderAlerts') return Boolean(row.email_notifications ?? true);
    if (preferenceKey === 'paymentAlerts') return Boolean(row.sms_notifications ?? true);
    if (preferenceKey === 'chatNotifications') return Boolean(row.push_notifications ?? true);
    if (preferenceKey === 'promotions') return !Boolean(row.marketing_opt_in ?? false);
    if (preferenceKey === 'reviews') return Boolean(row.email_notifications ?? true);
    return true;
  } catch (_) {
    return true;
  }
}

async function createSellerNotification(req, sellerId, title, body, type = 'info', meta = {}, preferenceKey = null) {
  if (preferenceKey) {
    const isEnabled = await getNotificationPreference(req, sellerId, preferenceKey);
    if (!isEnabled) return null;
  }

  await ensureNotificationTable(req);
  await req.db.query(
    `
      INSERT INTO public.notifications (user_id, title, body, type, meta, created_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
    `,
    [sellerId, title, body, type, JSON.stringify(meta || {})]
  );

  return { success: true };
}

async function getBankAccountCount(req, sellerId) {
  const candidates = [
    `SELECT COUNT(*)::int AS bank_accounts FROM public.seller_bank_accounts WHERE seller_id = $1`,
    `SELECT COUNT(*)::int AS bank_accounts FROM lumina.seller_bank_accounts WHERE seller_id = $1`
  ];

  for (const sql of candidates) {
    try {
      const result = await req.db.query(sql, [sellerId]);
      return Number(result.rows[0]?.bank_accounts || 0);
    } catch (_) {
      // try next schema
    }
  }

  return 0;
}

async function getSellerBalanceSnapshot(req, sellerId) {
  const [earningsResult, payoutResult] = await Promise.all([
    req.db.query(
      `
        WITH seller_order_totals AS (
          SELECT
            o.id AS order_id,
            o.status::text AS order_status,
            COALESCE(UPPER(COALESCE((SELECT p.status::text FROM public.payments p WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1), 'pending')), 'PENDING') AS payment_status,
            o.placed_at AS order_placed_at,
            o.created_at AS order_created_at,
            SUM(COALESCE(oi.line_total, 0))::numeric AS seller_sales,
            SUM(COALESCE(oi.commission_amount, 0))::numeric AS commission_amount,
            SUM(COALESCE(oi.line_total, 0) - COALESCE(oi.commission_amount, 0))::numeric AS seller_earning
          FROM public.orders o
          JOIN public.order_items oi ON oi.order_id = o.id
          WHERE oi.seller_id = $1
          GROUP BY o.id, o.status, o.placed_at, o.created_at
        )
        SELECT
          COALESCE(SUM(CASE WHEN (
            LOWER(COALESCE(order_status, 'pending')) = 'delivered' AND LOWER(COALESCE(payment_status, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured')
          ) THEN seller_earning ELSE 0 END), 0)::numeric AS withdrawable_earnings,
          COALESCE(SUM(CASE WHEN NOT (
            LOWER(COALESCE(order_status, 'pending')) = 'delivered' AND LOWER(COALESCE(payment_status, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured')
          ) THEN seller_earning ELSE 0 END), 0)::numeric AS pending_earnings,
          COALESCE(SUM(commission_amount), 0)::numeric AS commission_charged
        FROM seller_order_totals
      `,
      [sellerId]
    ),
    req.db.query(
      `
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE LOWER(COALESCE(status::text, 'pending')) = 'pending'), 0)::numeric AS pending_payouts,
          COALESCE(SUM(amount) FILTER (WHERE LOWER(COALESCE(status::text, 'pending')) = 'paid'), 0)::numeric AS completed_payouts
        FROM public.seller_payouts
        WHERE seller_id = $1
      `,
      [sellerId]
    )
  ]);

  const earnings = earningsResult.rows[0] || {};
  const payouts = payoutResult.rows[0] || {};
  const withdrawableEarnings = toMoney(earnings.withdrawable_earnings || 0);
  const pendingEarnings = toMoney(earnings.pending_earnings || 0);
  const commissionCharged = toMoney(earnings.commission_charged || 0);
  const pendingPayouts = toMoney(payouts.pending_payouts || 0);
  const completedPayouts = toMoney(payouts.completed_payouts || 0);

  return {
    withdrawableEarnings,
    pendingEarnings,
    commissionCharged,
    pendingPayouts,
    completedPayouts,
    availableBalance: toMoney(Math.max(0, withdrawableEarnings - completedPayouts - pendingPayouts))
  };
}

function formatDate(dateValue) {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function isDbOfflineError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === 'ECONNREFUSED' ||
    message.includes('econnrefused') ||
    message.includes('database connection failed') ||
    message.includes('password authentication failed') ||
    message.includes('does not exist') ||
    message.includes('invalid input syntax for type uuid')
  );
}

function transactionLabel(entryType) {
  switch (entryType) {
    case 'sale_credit':
      return 'Payment received';
    case 'commission_debit':
      return 'Commission deduction';
    case 'refund_debit':
      return 'Refund deduction';
    default:
      return 'Adjustment';
  }
}

function transactionStatus(entryType) {
  switch (entryType) {
    case 'sale_credit':
      return 'received';
    case 'commission_debit':
      return 'deduction';
    case 'refund_debit':
      return 'refund';
    default:
      return 'processing';
  }
}

function normalizePayoutStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (['paid', 'completed', 'successful', 'approved', 'settled'].includes(normalized)) return 'paid';
  if (['rejected', 'failed', 'declined', 'cancelled', 'canceled'].includes(normalized)) return 'rejected';
  return 'processing';
}

function buildPayoutTransaction(row) {
  const normalizedStatus = normalizePayoutStatus(row.status);
  const description = String(row.request_note || row.payout_reference || 'Payout request').trim();
  return {
    id: `payout-${row.id}`,
    date: formatDate(row.created_at),
    type: 'Payout request',
    description: description || 'Payout request',
    amount: -Math.abs(Number(row.amount || 0)),
    status: normalizedStatus,
    payoutReference: row.payout_reference || null,
    rawStatus: row.status || 'pending'
  };
}

function shouldSuppressLedgerPayoutEntry(transaction, payoutReferences) {
  if (String(transaction?.type || '').toLowerCase() !== 'adjustment') return false;
  const note = String(transaction?.description || '').trim();
  if (!note.startsWith('Withdrawal request')) return false;
  const payoutRef = note.replace(/^Withdrawal request\s+/i, '').trim();
  return payoutReferences.has(payoutRef);
}

async function fetchSellerLedger(req, sellerId, { search = '', status = '', page = 1, pageSize = 5 } = {}) {
  const params = [sellerId];
  const where = [
    'sl.seller_id = $1',
    "(sl.entry_type <> 'sale_credit' OR sl.order_item_id IS NULL OR COALESCE(to_jsonb(o)->>'payment_status', 'pending') <> 'pending')"
  ];

  const searchTerm = String(search || '').trim();
  if (searchTerm) {
    params.push(`%${searchTerm}%`);
    where.push(`(
      COALESCE(o.order_number, '') ILIKE $${params.length} OR
      COALESCE(sl.note, '') ILIKE $${params.length} OR
      COALESCE(sl.entry_type, '') ILIKE $${params.length}
    )`);
  }

  const statusTerm = String(status || '').trim().toLowerCase();
  if (statusTerm) {
    if (statusTerm === 'received') where.push(`sl.entry_type = 'sale_credit'`);
    if (statusTerm === 'processing') where.push(`sl.entry_type = 'adjustment'`);
    if (statusTerm === 'deduction') where.push(`sl.entry_type = 'commission_debit'`);
    if (statusTerm === 'refund') where.push(`sl.entry_type = 'refund_debit'`);
  }

  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safePageSize = Math.max(parseInt(pageSize, 10) || 5, 1);
  const offset = (safePage - 1) * safePageSize;

  const countResult = await req.db.query(
    `
      SELECT COUNT(*)::int AS total
      FROM public.seller_ledger sl
      LEFT JOIN public.order_items oi ON oi.id = sl.order_item_id
      LEFT JOIN public.orders o ON o.id = oi.order_id
      WHERE ${where.join(' AND ')}
    `,
    params
  );

  const dataResult = await req.db.query(
    `
      SELECT
        sl.id,
        sl.created_at,
        sl.entry_type,
        sl.amount,
        COALESCE(o.order_number, '') AS order_number,
        COALESCE(sl.note, '') AS note,
        COALESCE(oi.product_name, '') AS product_name
      FROM public.seller_ledger sl
      LEFT JOIN public.order_items oi ON oi.id = sl.order_item_id
      LEFT JOIN public.orders o ON o.id = oi.order_id
      WHERE ${where.join(' AND ')}
      ORDER BY sl.created_at DESC
    `,
    params
  );

  const ledgerTransactions = dataResult.rows.map((row) => ({
    id: row.id,
    date: formatDate(row.created_at),
    type: transactionLabel(row.entry_type),
    description: row.note || (row.order_number ? `Order #${row.order_number}` : row.product_name || 'Ledger entry'),
    amount: Number(row.amount || 0),
    status: transactionStatus(row.entry_type)
  }));

  const payoutWhere = ['seller_id = $1'];
  const payoutParams = [sellerId];
  if (searchTerm) {
    payoutParams.push(`%${searchTerm}%`);
    payoutWhere.push(`(
      COALESCE(payout_reference, '') ILIKE $${payoutParams.length} OR
      COALESCE(request_note, '') ILIKE $${payoutParams.length} OR
      COALESCE(status::text, '') ILIKE $${payoutParams.length}
    )`);
  }

  if (statusTerm) {
    if (statusTerm === 'processing') {
      payoutWhere.push(`LOWER(COALESCE(status::text, 'pending')) IN ('pending', 'processing')`);
    } else if (statusTerm === 'paid') {
      payoutWhere.push(`LOWER(COALESCE(status::text, 'pending')) = 'paid'`);
    } else if (statusTerm === 'rejected') {
      payoutWhere.push(`LOWER(COALESCE(status::text, 'pending')) IN ('rejected', 'failed')`);
    }
  }

  const payoutResult = await req.db.query(
    `
      SELECT
        id,
        created_at,
        amount,
        status::text AS status,
        payout_reference,
        request_note
      FROM public.seller_payouts
      WHERE ${payoutWhere.join(' AND ')}
      ORDER BY created_at DESC
    `,
    payoutParams
  );

  const payoutTransactions = payoutResult.rows.map(buildPayoutTransaction);
  const payoutReferences = new Set(payoutTransactions.map((row) => String(row.payoutReference || '').trim()).filter(Boolean));
  const filteredLedgerTransactions = ledgerTransactions.filter((transaction) => !shouldSuppressLedgerPayoutEntry(transaction, payoutReferences));
  const transactions = [...filteredLedgerTransactions, ...payoutTransactions]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(offset, offset + safePageSize);

  return {
    transactions,
    pagination: {
      currentPage: safePage,
      pageSize: safePageSize,
      totalItems: filteredLedgerTransactions.length + payoutTransactions.length,
      totalPages: Math.max(1, Math.ceil((filteredLedgerTransactions.length + payoutTransactions.length) / safePageSize))
    }
  };
}

async function fetchOrderFallbackTransactions(req, sellerId, { search = '', status = '', page = 1, pageSize = 5 } = {}) {
  const statusTerm = String(status || '').trim().toLowerCase();
  if (statusTerm && statusTerm !== 'received') {
    return {
      transactions: [],
      pagination: {
        currentPage: Math.max(parseInt(page, 10) || 1, 1),
        pageSize: Math.max(parseInt(pageSize, 10) || 5, 1),
        totalItems: 0,
        totalPages: 1
      }
    };
  }

  const params = [sellerId];
  const where = [
    'oi.seller_id = $1',
    "COALESCE(to_jsonb(o)->>'payment_status', 'pending') <> 'pending'"
  ];
  const searchTerm = String(search || '').trim();

  if (searchTerm) {
    params.push(`%${searchTerm}%`);
    where.push(`(
      COALESCE(o.order_number, '') ILIKE $${params.length} OR
      COALESCE(oi.product_name, '') ILIKE $${params.length}
    )`);
  }

  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safePageSize = Math.max(parseInt(pageSize, 10) || 5, 1);
  const offset = (safePage - 1) * safePageSize;

  const countResult = await req.db.query(
    `
      SELECT COUNT(*)::int AS total
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE ${where.join(' AND ')}
    `,
    params
  );

  const dataResult = await req.db.query(
    `
      SELECT
        oi.id,
        oi.product_name,
        oi.line_total,
        o.order_number,
        COALESCE(o.placed_at, o.created_at) AS created_at
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(o.placed_at, o.created_at) DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    [...params, safePageSize, offset]
  );

  const transactions = dataResult.rows.map((row) => ({
    id: row.id,
    date: formatDate(row.created_at),
    type: 'Payment received',
    description: row.order_number ? `Order #${row.order_number}` : row.product_name || 'Order payment',
    amount: Number(row.line_total || 0),
    status: 'received'
  }));

  return {
    transactions,
    pagination: {
      currentPage: safePage,
      pageSize: safePageSize,
      totalItems: countResult.rows[0]?.total || 0,
      totalPages: Math.max(1, Math.ceil((countResult.rows[0]?.total || 0) / safePageSize))
    }
  };
}

function buildMonthlySeries(rows, seriesKey) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const map = new Map(rows.map((row) => [Number(row.month_index), Number(row.value || 0)]));
  return months.map((_, index) => toMoney(map.get(index + 1) || 0));
}

// GET /api/seller/payments/overview
router.get('/overview', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  try {
    await ensurePayoutReference(req);
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const bankAccountCount = await getBankAccountCount(req, sellerId);
    const balanceSnapshot = await getSellerBalanceSnapshot(req, sellerId);
    const lifetimeEarnings = toMoney(balanceSnapshot.withdrawableEarnings || 0);
    const pendingEarnings = toMoney(balanceSnapshot.pendingEarnings || 0);
    const monthlyEarnings = toMoney(balanceSnapshot.withdrawableEarnings || 0);
    const commissionCharged = toMoney(balanceSnapshot.commissionCharged || 0);
    const pendingPayouts = toMoney(balanceSnapshot.pendingPayouts || 0);
    const completedPayouts = toMoney(balanceSnapshot.completedPayouts || 0);
    const withdrawableBalance = toMoney(balanceSnapshot.availableBalance || 0);

    return res.json({
      success: true,
      data: {
        totalEarnings: lifetimeEarnings,
        lifetimeEarnings,
        availableBalance: withdrawableBalance,
        withdrawableBalance,
        pendingEarnings,
        pendingWithdrawals: pendingPayouts,
        pendingPayouts,
        monthlyEarnings,
        commissionCharged,
        processingFee: 2.5,
        minimumWithdrawal: 100,
        bankAccountCount
      }
    });
  } catch (error) {
    if (isDbOfflineError(error)) {
      return res.json({
        success: true,
        data: {
          totalEarnings: 0,
          lifetimeEarnings: 0,
          availableBalance: 0,
          withdrawableBalance: 0,
          pendingEarnings: 0,
          pendingWithdrawals: 0,
          pendingPayouts: 0,
          monthlyEarnings: 0,
          commissionCharged: 0,
          processingFee: 2.5,
          minimumWithdrawal: 100,
          bankAccountCount: 0
        }
      });
    }

    return res.status(500).json({ success: false, message: 'Failed to fetch payments overview', error: error.message });
  }
});

// GET /api/seller/payments/transactions
router.get('/transactions', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await fetchSellerLedger(req, sellerId, {
      search: req.query.search,
      status: req.query.status,
      page: req.query.page,
      pageSize: req.query.pageSize
    });

    const responsePayload = result.pagination.totalItems > 0
      ? result
      : await fetchOrderFallbackTransactions(req, sellerId, {
          search: req.query.search,
          status: req.query.status,
          page: req.query.page,
          pageSize: req.query.pageSize
        });

    return res.json({ success: true, data: responsePayload.transactions, pagination: responsePayload.pagination });
  } catch (error) {
    if (isDbOfflineError(error)) {
      return res.json({ success: true, data: [], pagination: { currentPage: 1, pageSize: 5, totalItems: 0, totalPages: 1 } });
    }

    return res.status(500).json({ success: false, message: 'Failed to fetch transactions', error: error.message });
  }
});

// GET /api/seller/payments/transactions/:transactionId
router.get('/transactions/:transactionId', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        SELECT
          sl.id,
          sl.created_at,
          sl.entry_type,
          sl.amount,
          COALESCE(o.order_number, '') AS order_number,
          COALESCE(sl.note, '') AS note,
          COALESCE(oi.product_name, '') AS product_name
        FROM public.seller_ledger sl
        LEFT JOIN public.order_items oi ON oi.id = sl.order_item_id
        LEFT JOIN public.orders o ON o.id = oi.order_id
        WHERE sl.seller_id = $1
          AND sl.id::text = $2
        LIMIT 1
      `,
      [sellerId, String(req.params.transactionId || '').trim()]
    );

    let row = result.rows[0];
    if (!row) {
      const fallback = await req.db.query(
        `
          SELECT
            oi.id,
            oi.product_name,
            oi.line_total AS amount,
            o.order_number,
            COALESCE(o.placed_at, o.created_at) AS created_at
          FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
          WHERE oi.seller_id = $1
            AND oi.id::text = $2
            AND COALESCE(to_jsonb(o)->>'payment_status', 'pending') <> 'pending'
          LIMIT 1
        `,
        [sellerId, String(req.params.transactionId || '').trim()]
      );

      if (!fallback.rows.length) {
        return res.status(404).json({ success: false, message: 'Transaction not found' });
      }

      const orderRow = fallback.rows[0];
      return res.json({
        success: true,
        data: {
          id: orderRow.id,
          date: formatDate(orderRow.created_at),
          type: 'Payment received',
          description: orderRow.order_number ? `Order #${orderRow.order_number}` : orderRow.product_name || 'Order payment',
          amount: Number(orderRow.amount || 0),
          status: 'received'
        }
      });
    }

    return res.json({
      success: true,
      data: {
        id: row.id,
        date: formatDate(row.created_at),
        type: transactionLabel(row.entry_type),
        description: row.note || (row.order_number ? `Order #${row.order_number}` : row.product_name || 'Ledger entry'),
        amount: Number(row.amount || 0),
        status: transactionStatus(row.entry_type)
      }
    });
  } catch (error) {
    if (isDbOfflineError(error)) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    return res.status(500).json({ success: false, message: 'Failed to fetch transaction', error: error.message });
  }
});

// GET /api/seller/payments/chart?period=monthly&series=totalEarnings
router.get('/chart', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const period = String(req.query.period || 'monthly').toLowerCase();
    const series = String(req.query.series || 'totalEarnings');
    const validPeriods = ['monthly', 'weekly'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ success: false, message: 'Invalid period. Use monthly or weekly' });
    }

    const sql = period === 'weekly'
      ? `
        WITH seller_order_totals AS (
          SELECT
            o.id AS order_id,
            o.status::text AS order_status,
            COALESCE(UPPER(COALESCE((SELECT p.status::text FROM public.payments p WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1), 'pending')), 'PENDING') AS payment_status,
            o.placed_at AS order_placed_at,
            o.created_at AS order_created_at,
            SUM(GREATEST(0, COALESCE(oi.line_total, 0) - COALESCE(oi.commission_amount, 0)))::numeric AS seller_earning
          FROM public.orders o
          JOIN public.order_items oi ON oi.order_id = o.id
          WHERE oi.seller_id = $1
          GROUP BY o.id, o.status, o.placed_at, o.created_at
        ),
        filtered_orders AS (
          SELECT *
          FROM seller_order_totals
          WHERE LOWER(COALESCE(order_status, 'pending')) = 'delivered'
        ),
        data AS (
          SELECT
            EXTRACT(WEEK FROM COALESCE(order_placed_at, order_created_at))::int AS bucket,
            SUM(seller_earning)::numeric AS value
          FROM filtered_orders
          WHERE COALESCE(order_placed_at, order_created_at) >= CURRENT_DATE - INTERVAL '28 days'
          GROUP BY EXTRACT(WEEK FROM COALESCE(order_placed_at, order_created_at))
        )
        SELECT bucket AS month_index, value FROM data ORDER BY bucket ASC
      `
      : `
        WITH seller_order_totals AS (
          SELECT
            o.id AS order_id,
            o.status::text AS order_status,
            COALESCE(UPPER(COALESCE((SELECT p.status::text FROM public.payments p WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1), 'pending')), 'PENDING') AS payment_status,
            o.placed_at AS order_placed_at,
            o.created_at AS order_created_at,
            SUM(GREATEST(0, COALESCE(oi.line_total, 0) - COALESCE(oi.commission_amount, 0)))::numeric AS seller_earning
          FROM public.orders o
          JOIN public.order_items oi ON oi.order_id = o.id
          WHERE oi.seller_id = $1
          GROUP BY o.id, o.status, o.placed_at, o.created_at
        ),
        filtered_orders AS (
          SELECT *
          FROM seller_order_totals
          WHERE LOWER(COALESCE(order_status, 'pending')) = 'delivered'
        ),
        data AS (
          SELECT
            EXTRACT(MONTH FROM COALESCE(order_placed_at, order_created_at))::int AS bucket,
            SUM(seller_earning)::numeric AS value
          FROM filtered_orders
          WHERE COALESCE(order_placed_at, order_created_at) >= DATE_TRUNC('year', CURRENT_DATE)
          GROUP BY EXTRACT(MONTH FROM COALESCE(order_placed_at, order_created_at))
        )
        SELECT bucket AS month_index, value FROM data ORDER BY bucket ASC
      `;

    const result = await req.db.query(sql, [sellerId]);
    const labels = period === 'weekly'
      ? ['W1', 'W2', 'W3', 'W4']
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const data = period === 'weekly'
      ? result.rows.slice(0, 4).map((row) => toMoney(row.value || 0))
      : buildMonthlySeries(result.rows, series);

    return res.json({ success: true, data: { labels, data } });
  } catch (error) {
    if (isDbOfflineError(error)) {
      return res.json({ success: true, data: { labels: [], data: [] } });
    }

    return res.status(500).json({ success: false, message: 'Failed to fetch chart data', error: error.message });
  }
});

// GET /api/seller/payments/payout-eligibility
router.get('/payout-eligibility', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        SELECT COALESCE(verification_status, 'pending')::text AS verification_status
        FROM lumina.seller_bank_accounts
        WHERE seller_id = $1
        LIMIT 1
      `,
      [sellerId]
    );

    const verificationStatus = String(result.rows[0]?.verification_status || 'pending').toLowerCase();
    const canRequestPayout = verificationStatus === 'verified';
    return res.json({
      success: true,
      data: {
        canRequestPayout,
        verificationStatus,
        statusMessage: canRequestPayout
          ? 'Your bank account is verified and ready for payouts.'
          : 'Your bank account must be verified before you can request a payout.'
      }
    });
  } catch (error) {
    if (isDbOfflineError(error)) {
      return res.json({ success: true, data: { canRequestPayout: false, verificationStatus: 'pending', statusMessage: 'Your bank account must be verified before you can request a payout.' } });
    }

    return res.status(500).json({ success: false, message: 'Failed to fetch payout eligibility', error: error.message });
  }
});

// GET /api/seller/payments/bank-accounts?activeOnly=true
router.get('/bank-accounts', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const activeOnly = req.query.activeOnly !== 'false';
    const params = [sellerId];
    let sql = `
      SELECT
        seller_id AS account_id,
        account_holder_name,
        bank_name,
        branch_name,
        account_number_masked,
        routing_number,
        is_default,
        verification_status::text AS verification_status,
        created_at
      FROM lumina.seller_bank_accounts
      WHERE seller_id = $1
    `;

    if (activeOnly) {
      sql += ` AND COALESCE(verification_status, 'pending') IN ('active', 'verified', 'pending')`;
    }

    sql += ` ORDER BY is_default DESC, created_at DESC`;

    const result = await req.db.query(sql, params);
    return res.json({
      success: true,
      data: result.rows.map((row) => ({
        id: row.account_id || row.seller_id || null,
        label: `${row.bank_name} - ${row.account_number_masked}`,
        accountName: row.account_holder_name,
        bankName: row.bank_name,
        currency: 'BDT',
        active: activeOnly ? ['active', 'verified', 'pending'].includes(row.verification_status) : true,
        isDefault: row.is_default,
        branchName: row.branch_name,
        routingNumber: row.routing_number
      }))
    });
  } catch (error) {
    if (isDbOfflineError(error)) {
      return res.json({ success: true, data: [] });
    }

    return res.status(500).json({ success: false, message: 'Failed to fetch bank accounts', error: error.message });
  }
});

// POST /api/seller/payments/withdrawals
router.post('/withdrawals', async (req, res) => {
  try {
    await ensurePayoutReference(req);
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const amount = Number(req.body.amount);
    const bankAccountId = String(req.body.bankAccountId || '').trim();
    const requestNote = String(req.body.note || '').trim();

    const eligibilityResult = await req.db.query(
      `
        SELECT COALESCE(verification_status, 'pending')::text AS verification_status
        FROM lumina.seller_bank_accounts
        WHERE seller_id = $1
        LIMIT 1
      `,
      [sellerId]
    );

    const verificationStatus = String(eligibilityResult.rows[0]?.verification_status || 'pending').toLowerCase();
    if (verificationStatus !== 'verified') {
      return res.status(403).json({ success: false, message: 'Your bank account must be verified before you can request a payout.' });
    }

    if (!Number.isFinite(amount) || amount <= 0 || !bankAccountId) {
      return res.status(400).json({ success: false, message: 'Missing required fields: amount, bankAccountId' });
    }

    const bankAccountResult = await req.db.query(
      `
        SELECT
          seller_id AS account_id,
          bank_name,
          account_number_masked,
          account_holder_name,
          verification_status
        FROM lumina.seller_bank_accounts
        WHERE seller_id = $1
        ORDER BY is_default DESC, created_at DESC
        LIMIT 1
      `,
      [sellerId]
    );

    if (!bankAccountResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Bank account not found' });
    }

    const bankAccount = bankAccountResult;

    const balanceSnapshot = await getSellerBalanceSnapshot(req, sellerId);
    const currentBalance = balanceSnapshot.availableBalance;

    const activeRequest = await req.db.query(
      `
        SELECT id
        FROM public.seller_payouts
        WHERE seller_id = $1
          AND LOWER(COALESCE(status::text, 'pending')) IN ('pending', 'processing')
        LIMIT 1
      `,
      [sellerId]
    );

    if (activeRequest.rows.length) {
      return res.status(409).json({ success: false, message: 'You already have a pending payout request.' });
    }

    if (amount > currentBalance) {
      return res.status(400).json({ success: false, message: 'Amount exceeds available balance' });
    }

    if (amount < 100) {
      return res.status(400).json({ success: false, message: 'Amount must be at least 100.00' });
    }

    const fee = 2.5;
    const netAmount = toMoney(amount - fee);
    const payoutRef = `WD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-6)}`;

    const insertResult = await req.db.query(
      `
        INSERT INTO public.seller_payouts (
          seller_id,
          bank_account_id,
          period_start,
          period_end,
          amount,
          status,
          payout_reference,
          request_note,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          DATE_TRUNC('month', CURRENT_DATE)::date,
          CURRENT_DATE,
          $3,
          'pending',
          $4,
          $5,
          NOW(),
          NOW()
        )
        RETURNING id, created_at, amount, status, payout_reference
      `,
      [sellerId, null, amount, payoutRef, requestNote || null]
    );

    await req.db.query(
      `
        INSERT INTO public.seller_ledger (seller_id, entry_type, amount, note, created_at)
        VALUES ($1, 'adjustment', $2, $3, NOW())
      `,
      [sellerId, -amount, `Withdrawal request ${payoutRef}`]
    );

    await createSellerNotification(req, sellerId, 'Payout request submitted', `Your payout request for ${toMoney(amount)} is awaiting admin review.`, 'info', { payoutReference: payoutRef, amount }, 'paymentAlerts');
    await refreshSellerPayoutState(req.db, sellerId);

    const withdrawal = insertResult.rows[0];
    return res.status(201).json({
      success: true,
      message: 'Withdrawal requested successfully',
      data: {
        id: withdrawal.id,
        requestedAt: withdrawal.created_at,
        amount: Number(withdrawal.amount),
        fee,
        netAmount,
        bankAccountId,
        bankLabel: `${bankAccount.rows[0].bank_name} - ${bankAccount.rows[0].account_number_masked}`,
        status: withdrawal.status,
        payoutReference: withdrawal.payout_reference
      }
    });
  } catch (error) {
    if (isDbOfflineError(error)) {
      return res.status(503).json({ success: false, message: 'Payments service is currently unavailable. Please try again later.' });
    }

    return res.status(500).json({ success: false, message: 'Failed to create withdrawal request', error: error.message });
  }
});

// GET /api/seller/payments/withdrawals?status=processing
router.get('/withdrawals', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const status = String(req.query.status || '').trim().toLowerCase();
    const params = [sellerId];
    let sql = `
      SELECT
        sp.id,
        sp.created_at,
        sp.amount,
        sp.status::text AS status,
        sp.payout_reference,
        sp.bank_account_id,
        sp.request_note,
        sp.rejection_reason,
        sp.reviewed_at,
        sba.bank_name,
        sba.account_number_masked
      FROM public.seller_payouts sp
      LEFT JOIN lumina.seller_bank_accounts sba ON sba.seller_id = sp.bank_account_id
      WHERE sp.seller_id = $1
    `;

    if (status) {
      params.push(status);
      sql += ` AND sp.status::text = $2`;
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await req.db.query(sql, params);
    return res.json({
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        requestedAt: row.created_at,
        amount: Number(row.amount || 0),
        fee: 2.5,
        netAmount: toMoney(Number(row.amount || 0) - 2.5),
        bankAccountId: row.bank_account_id || null,
        bankLabel: row.bank_name ? `${row.bank_name} - ${row.account_number_masked || ''}`.trim() : (row.payout_reference || 'Bank Transfer'),
        status: normalizePayoutStatus(row.status),
        payoutReference: row.payout_reference,
        requestNote: row.request_note || null,
        rejectionReason: row.rejection_reason || null,
        reviewedAt: row.reviewed_at || null
      })),
      count: result.rows.length
    });
  } catch (error) {
    if (isDbOfflineError(error)) {
      return res.json({ success: true, data: [], count: 0 });
    }

    return res.status(500).json({ success: false, message: 'Failed to fetch withdrawals', error: error.message });
  }
});

// GET /api/seller/payments/export?search=&status=
router.get('/export', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await fetchSellerLedger(req, sellerId, {
      search: req.query.search,
      status: req.query.status,
      page: 1,
      pageSize: Number.MAX_SAFE_INTEGER
    });

    let csv = 'Transaction ID,Date,Type,Description,Amount,Status\n';
    result.transactions.forEach((item) => {
      csv += `"${item.id}","${item.date}","${item.type}","${item.description}","${item.amount}","${item.status}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=transactions-${new Date().toISOString().slice(0, 10)}.csv`);
    return res.status(200).send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to export transactions', error: error.message });
  }
});

module.exports = router;
module.exports.normalizePayoutStatus = normalizePayoutStatus;
module.exports.shouldSuppressLedgerPayoutEntry = shouldSuppressLedgerPayoutEntry;
module.exports.__testCreateSellerNotification = createSellerNotification;
