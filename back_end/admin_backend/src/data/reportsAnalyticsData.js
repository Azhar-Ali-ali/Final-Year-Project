function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function periodToDays(period) {
  const key = normalizeText(period);
  if (key === 'today') return 1;
  if (key === 'week' || key === '7d') return 7;
  if (key === 'month' || key === '30d') return 30;
  if (key === 'quarter' || key === '90d') return 90;
  if (key === 'year') return 365;
  return 7;
}

function mapRegionCaseExpr() {
  return `
    CASE
      WHEN LOWER(COALESCE(ua.state, ua.city, '')) ~ '(rajshahi|rangpur|mymensingh)' THEN 'north'
      WHEN LOWER(COALESCE(ua.state, ua.city, '')) ~ '(chattogram|cox|khagrachari|bandarban|rangamati|sylhet)' THEN 'east'
      WHEN LOWER(COALESCE(ua.state, ua.city, '')) ~ '(khulna|barisal|barishal)' THEN 'south'
      WHEN LOWER(COALESCE(ua.state, ua.city, '')) ~ '(dhaka)' THEN 'west'
      ELSE 'unknown'
    END
  `;
}

const commissionSettings = require('./commissionSettingsData');

async function ensureSupportTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.report_custom_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(180) NOT NULL,
      description TEXT,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
      last_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.report_schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_type VARCHAR(50) NOT NULL,
      frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
      recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      next_run_at TIMESTAMPTZ,
      created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.report_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action VARCHAR(80) NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id UUID,
      admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function logAudit(db, { action, entityType, entityId = null, adminId = null, notes = '' }) {
  await ensureSupportTables(db);
  const validAdmin = /^[0-9a-fA-F-]{36}$/.test(String(adminId || '')) ? adminId : null;
  await db.query(
    `
      INSERT INTO public.report_audit_logs (action, entity_type, entity_id, admin_id, notes)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [action, entityType, entityId, validAdmin, String(notes || '').trim() || null]
  );
}

function getDateFilterSql(columnName, period, params) {
  const days = periodToDays(period);
  params.push(days);
  return `${columnName} >= NOW() - ($${params.length}::int * INTERVAL '1 day')`;
}

async function getOverview(db, { period = 'week', region = '' } = {}) {
  const params = [];
  const dateFilter = getDateFilterSql('o.placed_at', period, params);
  const regionExpr = mapRegionCaseExpr();

  let regionSql = '';
  if (region && region !== 'all') {
    params.push(normalizeText(region));
    regionSql = ` AND ${regionExpr} = $${params.length} `;
  }

  const metrics = await db.query(
    `
      SELECT
        COALESCE(SUM(o.grand_total), 0)::numeric(14,2) AS total_gmv,
        COUNT(DISTINCT o.id)::int AS total_orders,
        COALESCE(SUM(o.grand_total - o.tax_total), 0)::numeric(14,2) AS net_revenue,
        COALESCE(SUM(COALESCE(r.amount, 0)), 0)::numeric(14,2) AS refunded_amount
      FROM public.orders o
      LEFT JOIN public.user_addresses ua ON ua.id = o.shipping_address_id
      LEFT JOIN public.refunds r ON r.payment_id IN (
        SELECT p.id FROM public.payments p WHERE p.order_id = o.id
      )
      WHERE ${dateFilter}
      ${regionSql}
    `,
    params
  );

  const today = await db.query(
    `
      SELECT COALESCE(SUM(o.grand_total), 0)::numeric(14,2) AS today_gmv
      FROM public.orders o
      WHERE o.placed_at >= NOW()::date
    `
  );

  const commission = await db.query(
    `
      SELECT COALESCE(SUM(COALESCE(oi.commission_amount, oi.line_total * $2)), 0)::numeric(14,2) AS commission
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE ${dateFilter}
    `,
    [periodToDays(period), (await commissionSettings.getCommissionSettings(db)).commissionRate / 100]
  );

  const totalRevenue = Number(metrics.rows[0].net_revenue || 0);
  const refunded = Number(metrics.rows[0].refunded_amount || 0);

  return {
    todayGMV: Number(today.rows[0].today_gmv || 0),
    periodGMV: Number(metrics.rows[0].total_gmv || 0),
    commissionEarned: Number(commission.rows[0].commission || 0),
    refundRate: totalRevenue > 0 ? Number(((refunded / totalRevenue) * 100).toFixed(2)) : 0,
    totalOrders: Number(metrics.rows[0].total_orders || 0)
  };
}

async function getRevenueTrend(db, { period = 'week', region = '' } = {}) {
  const params = [];
  const dateFilter = getDateFilterSql('o.placed_at', period, params);
  const regionExpr = mapRegionCaseExpr();

  let regionSql = '';
  if (region && region !== 'all') {
    params.push(normalizeText(region));
    regionSql = ` AND ${regionExpr} = $${params.length} `;
  }

  const result = await db.query(
    `
      SELECT
        DATE(o.placed_at) AS period,
        COUNT(DISTINCT o.id)::int AS orders,
        COALESCE(SUM(o.grand_total), 0)::numeric(14,2) AS revenue
      FROM public.orders o
      LEFT JOIN public.user_addresses ua ON ua.id = o.shipping_address_id
      WHERE ${dateFilter}
      ${regionSql}
      GROUP BY DATE(o.placed_at)
      ORDER BY DATE(o.placed_at) ASC
    `,
    params
  );

  return result.rows;
}

async function getTopCategories(db, { period = 'week' } = {}) {
  const params = [];
  const dateFilter = getDateFilterSql('o.placed_at', period, params);

  const result = await db.query(
    `
      SELECT
        COALESCE(c.name, 'Uncategorized') AS name,
        COALESCE(SUM(oi.line_total), 0)::numeric(14,2) AS revenue,
        COALESCE(SUM(oi.quantity), 0)::int AS orders
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      LEFT JOIN public.products p ON p.id = oi.product_id
      LEFT JOIN public.categories c ON c.id = p.category_id
      WHERE ${dateFilter}
      GROUP BY c.name
      ORDER BY revenue DESC
      LIMIT 8
    `,
    params
  );

  return result.rows;
}

async function getSalesRows(db, { period = 'month', region = '', search = '' } = {}) {
  const params = [];
  const dateFilter = getDateFilterSql('o.placed_at', period, params);
  const regionExpr = mapRegionCaseExpr();

  let regionSql = '';
  if (region && region !== 'all') {
    params.push(normalizeText(region));
    regionSql = ` AND ${regionExpr} = $${params.length} `;
  }

  let searchSql = '';
  if (search) {
    params.push(`%${normalizeText(search)}%`);
    searchSql = ` AND (LOWER(o.order_number) LIKE $${params.length} OR LOWER(COALESCE(ua.city,'')) LIKE $${params.length}) `;
  }

  const result = await db.query(
    `
      SELECT
        DATE(o.placed_at) AS period,
        COALESCE(SUM(o.grand_total), 0)::numeric(14,2) AS revenue,
        COUNT(DISTINCT o.id)::int AS orders,
        COALESCE(AVG(o.grand_total), 0)::numeric(14,2) AS avg_order_value
      FROM public.orders o
      LEFT JOIN public.user_addresses ua ON ua.id = o.shipping_address_id
      WHERE ${dateFilter}
      ${regionSql}
      ${searchSql}
      GROUP BY DATE(o.placed_at)
      ORDER BY DATE(o.placed_at) DESC
      LIMIT 60
    `,
    params
  );

  return result.rows;
}

async function getOrdersRows(db, { period = 'week', status = '', payment = '', search = '' } = {}) {
  const params = [];
  const dateFilter = getDateFilterSql('o.placed_at', period, params);

  let statusSql = '';
  if (status) {
    params.push(normalizeText(status));
    statusSql = ` AND LOWER(o.status::text) = $${params.length} `;
  }

  let paymentSql = '';
  if (payment) {
    params.push(normalizeText(payment));
    paymentSql = ` AND LOWER(COALESCE(p.status::text, 'pending')) = $${params.length} `;
  }

  let searchSql = '';
  if (search) {
    params.push(`%${normalizeText(search)}%`);
    searchSql = ` AND (LOWER(o.order_number) LIKE $${params.length} OR LOWER(COALESCE(u.full_name, '')) LIKE $${params.length}) `;
  }

  const result = await db.query(
    `
      SELECT
        o.id,
        o.order_number AS "orderId",
        u.full_name AS customer,
        o.grand_total::numeric(14,2) AS amount,
        COALESCE(SUM(oi.quantity), 0)::int AS items,
        LOWER(o.status::text) AS status,
        LOWER(COALESCE(p.status::text, 'pending')) AS payment,
        o.placed_at AS date
      FROM public.orders o
      LEFT JOIN public.users u ON u.id = o.customer_id
      LEFT JOIN public.order_items oi ON oi.order_id = o.id
      LEFT JOIN LATERAL (
        SELECT status FROM public.payments px
        WHERE px.order_id = o.id
        ORDER BY px.created_at DESC
        LIMIT 1
      ) p ON TRUE
      WHERE ${dateFilter}
      ${statusSql}
      ${paymentSql}
      ${searchSql}
      GROUP BY o.id, o.order_number, u.full_name, o.grand_total, o.status, p.status, o.placed_at
      ORDER BY o.placed_at DESC
      LIMIT 100
    `,
    params
  );

  return result.rows;
}

async function getUsersAnalytics(db, { period = 'week', role = '' } = {}) {
  const days = periodToDays(period);

  const distribution = await db.query(`
    SELECT role::text AS role, COUNT(*)::int AS count
    FROM public.users
    GROUP BY role
  `);

  const growth = await db.query(
    `
      SELECT DATE(u.created_at) AS day,
             COUNT(*) FILTER (WHERE u.role = 'customer')::int AS buyers,
             COUNT(*) FILTER (WHERE u.role = 'seller')::int AS sellers,
             COUNT(*) FILTER (WHERE u.role = 'admin')::int AS admins
      FROM public.users u
      WHERE u.created_at >= NOW() - ($1::int * INTERVAL '1 day')
      GROUP BY DATE(u.created_at)
      ORDER BY DATE(u.created_at) ASC
    `,
    [days]
  );

  let filteredDistribution = distribution.rows;
  if (role) filteredDistribution = distribution.rows.filter((r) => normalizeText(r.role) === normalizeText(role));

  return {
    growth: growth.rows,
    distribution: filteredDistribution,
    allDistribution: distribution.rows
  };
}

async function getProductsPerformance(db, { category = '', search = '' } = {}) {
  const params = [];

  let categorySql = '';
  if (category) {
    params.push(normalizeText(category));
    categorySql = ` AND LOWER(COALESCE(c.name,'')) LIKE $${params.length} `;
  }

  let searchSql = '';
  if (search) {
    params.push(`%${normalizeText(search)}%`);
    searchSql = ` AND LOWER(p.name) LIKE $${params.length} `;
  }

  const result = await db.query(
    `
      SELECT
        p.id,
        p.name,
        COALESCE(c.name, 'Uncategorized') AS category,
        COALESCE(SUM(oi.quantity), 0)::int AS sales,
        COALESCE(SUM(oi.line_total), 0)::numeric(14,2) AS revenue,
        COALESCE(AVG(pr.rating), 0)::numeric(10,2) AS "avgRating",
        COALESCE(SUM(pv.stock_quantity), 0)::int AS stock
      FROM public.products p
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.order_items oi ON oi.product_id = p.id
      LEFT JOIN public.product_reviews pr ON pr.product_id = p.id
      LEFT JOIN public.product_variants pv ON pv.product_id = p.id
      WHERE 1=1
      ${categorySql}
      ${searchSql}
      GROUP BY p.id, p.name, c.name
      ORDER BY revenue DESC NULLS LAST
      LIMIT 100
    `,
    params
  );

  return result.rows;
}

async function getCustomReports(db) {
  await ensureSupportTables(db);
  const result = await db.query(
    `
      SELECT id, name, description,
             created_at AS "createdAt",
             last_run_at AS "lastRun",
             created_by AS "createdBy"
      FROM public.report_custom_reports
      ORDER BY created_at DESC
    `
  );
  return result.rows;
}

async function createCustomReport(db, { name, description = '', config = {}, adminId = null }) {
  await ensureSupportTables(db);
  const validAdmin = /^[0-9a-fA-F-]{36}$/.test(String(adminId || '')) ? adminId : null;
  const result = await db.query(
    `
      INSERT INTO public.report_custom_reports (name, description, config, created_by)
      VALUES ($1, $2, $3::jsonb, $4)
      RETURNING id, name, description, created_at AS "createdAt", last_run_at AS "lastRun", created_by AS "createdBy"
    `,
    [name, description, JSON.stringify(config || {}), validAdmin]
  );
  return result.rows[0];
}

async function runCustomReport(db, id) {
  await ensureSupportTables(db);
  const result = await db.query(
    `
      UPDATE public.report_custom_reports
      SET last_run_at = NOW(), updated_at = NOW()
      WHERE id::text = $1
      RETURNING id, name, description, created_at AS "createdAt", last_run_at AS "lastRun", created_by AS "createdBy"
    `,
    [String(id)]
  );
  return result.rows[0] || null;
}

async function createSchedule(db, { reportType, frequency, recipients = [], active = true, adminId = null }) {
  await ensureSupportTables(db);
  const validAdmin = /^[0-9a-fA-F-]{36}$/.test(String(adminId || '')) ? adminId : null;

  const days = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : 30;
  const result = await db.query(
    `
      INSERT INTO public.report_schedules (report_type, frequency, recipients, active, next_run_at, created_by)
      VALUES ($1, $2, $3::jsonb, $4, NOW() + ($5::int * INTERVAL '1 day'), $6)
      RETURNING id, report_type AS "reportType", frequency, recipients, active, next_run_at AS "nextRun"
    `,
    [reportType, frequency, JSON.stringify(Array.isArray(recipients) ? recipients : [recipients]), Boolean(active), days, validAdmin]
  );
  return result.rows[0];
}

async function getAuditLog(db, { limit = 50, page = 1 } = {}) {
  await ensureSupportTables(db);
  const lim = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const offset = (pageNum - 1) * lim;

  const [rows, total] = await Promise.all([
    db.query(
      `
        SELECT id, action, entity_type AS "entityType", entity_id AS "entityId", admin_id AS "adminId", notes, created_at AS timestamp
        FROM public.report_audit_logs
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `,
      [lim, offset]
    ),
    db.query('SELECT COUNT(*)::int AS total FROM public.report_audit_logs')
  ]);

  return { data: rows.rows, total: total.rows[0].total, page: pageNum, limit: lim };
}

module.exports = {
  normalizeText,
  periodToDays,
  ensureSupportTables,
  logAudit,
  getOverview,
  getRevenueTrend,
  getTopCategories,
  getSalesRows,
  getOrdersRows,
  getUsersAnalytics,
  getProductsPerformance,
  getCustomReports,
  createCustomReport,
  runCustomReport,
  createSchedule,
  getAuditLog
};
