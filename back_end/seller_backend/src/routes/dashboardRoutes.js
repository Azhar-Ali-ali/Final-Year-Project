const express = require('express');
const router = express.Router();
const { toMoney, ensureSellerEarningsColumns } = require('./earningsUtils');

function getSellerId(req) {
  const raw = [
    req.auth?.session?.userId,
    req.auth?.user?.id,
    req.auth?.user?.sellerId,
    req.auth?.session?.sellerId,
    req.headers['x-seller-id'],
    req.query?.sellerId,
    req.query?.sellerID
  ].find((value) => value !== undefined && value !== null && String(value).trim() !== '');

  return String(raw || '').trim();
}

async function resolveSellerId(req) {
  const sellerId = getSellerId(req);
  return sellerId || null;
}

function toLabelCase(value) {
  const str = String(value || '').trim().toLowerCase();
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function mapDashboardOrderStatus(dbStatus) {
  const value = String(dbStatus || '').toLowerCase();
  if (value === 'confirmed') return 'Confirmed';
  if (value === 'processing') return 'Packed';
  if (value === 'shipped') return 'Ready for Pickup';
  if (value === 'courier_assigned') return 'Courier Assigned';
  if (value === 'delivered') return 'Delivered';
  if (value === 'cancelled') return 'Cancelled';
  return 'Pending';
}

function mapDashboardStatusToDb(status) {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'confirmed') return 'confirmed';
  if (value === 'packed') return 'processing';
  if (value === 'ready for pickup') return 'shipped';
  if (value === 'delivered') return 'delivered';
  if (value === 'cancelled') return 'cancelled';
  return 'pending';
}

function formatRelativeTime(dateValue) {
  if (!dateValue) return 'Recently';
  const now = new Date();
  const then = new Date(dateValue);
  if (Number.isNaN(then.getTime())) return 'Recently';
  const diffMs = now - then;
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function isDbOfflineError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === 'ECONNREFUSED' ||
    message.includes('econnrefused') ||
    message.includes('database connection failed') ||
    message.includes('does not exist') ||
    message.includes('invalid input syntax for type uuid')
  );
}

async function logSellerEarningsDebug(req, sellerId, metricsSnapshot) {
  try {
    const debugResult = await req.db.query(
      `
        SELECT
          o.order_number,
          o.status::text AS order_status,
          COALESCE(o.payment_status::text, 'pending') AS order_payment_status,
          COALESCE((SELECT p.method FROM public.payments p WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1), 'ONLINE') AS payment_method,
          COALESCE((SELECT p.status::text FROM public.payments p WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1), 'pending') AS payment_status,
          SUM(oi.line_total)::numeric AS line_total,
          SUM(COALESCE(oi.commission_amount, 0))::numeric AS commission_amount,
          SUM(COALESCE(oi.line_total, 0) - COALESCE(oi.commission_amount, 0))::numeric AS seller_earning
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE oi.seller_id = $1
        GROUP BY o.id, o.order_number, o.status, o.payment_status
        ORDER BY o.created_at DESC
        LIMIT 10
      `,
      [sellerId]
    );

    console.warn('[seller-earnings-debug]', {
      sellerId,
      metrics: metricsSnapshot,
      sampleOrders: debugResult.rows
    });
  } catch (error) {
    console.warn('[seller-earnings-debug] failed', error?.message || error);
  }
}

async function buildChartSeries(req, sellerId, chartType, period) {
  const validChartTypes = ['sales', 'earnings'];
  const validPeriods = ['daily', 'weekly', 'monthly'];
  const safeChartType = validChartTypes.includes(chartType) ? chartType : 'sales';
  const safePeriod = validPeriods.includes(period) ? period : 'daily';

  let sql = '';
  if (safePeriod === 'daily') {
    sql = `
      WITH points AS (
        SELECT generate_series(CURRENT_DATE - INTERVAL '6 day', CURRENT_DATE, INTERVAL '1 day')::date AS dt
      ),
      amounts AS (
        SELECT
          DATE(o.created_at) AS dt,
          SUM(oi.total_amount)::numeric AS amount
        FROM lumina.order_items oi
        JOIN lumina.orders o ON o.id = oi.order_id
        JOIN public.orders po ON po.id = o.id
        WHERE oi.seller_id = $1
          AND DATE(o.created_at) >= CURRENT_DATE - INTERVAL '6 day'
          AND LOWER(COALESCE(o.status::text, '')) <> 'cancelled'
        GROUP BY DATE(o.created_at)
      )
      SELECT TO_CHAR(p.dt, 'Dy') AS label, COALESCE(a.amount, 0)::numeric AS value
      FROM points p
      LEFT JOIN amounts a ON a.dt = p.dt
      ORDER BY p.dt ASC
    `;
  } else if (safePeriod === 'weekly') {
    sql = `
      WITH points AS (
        SELECT generate_series(date_trunc('week', CURRENT_DATE) - INTERVAL '7 week', date_trunc('week', CURRENT_DATE), INTERVAL '1 week')::date AS dt
      ),
      amounts AS (
        SELECT
          date_trunc('week', o.created_at)::date AS dt,
          SUM(oi.total_amount)::numeric AS amount
        FROM lumina.order_items oi
        JOIN lumina.orders o ON o.id = oi.order_id
        JOIN public.orders po ON po.id = o.id
        WHERE oi.seller_id = $1
          AND o.created_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 week'
          AND LOWER(COALESCE(o.status::text, '')) <> 'cancelled'
        GROUP BY date_trunc('week', o.created_at)::date
      )
      SELECT
        CONCAT('W', ROW_NUMBER() OVER (ORDER BY p.dt ASC)) AS label,
        COALESCE(a.amount, 0)::numeric AS value
      FROM points p
      LEFT JOIN amounts a ON a.dt = p.dt
      ORDER BY p.dt ASC
    `;
  } else {
    sql = `
      WITH points AS (
        SELECT generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '6 month', date_trunc('month', CURRENT_DATE), INTERVAL '1 month')::date AS dt
      ),
      amounts AS (
        SELECT
          date_trunc('month', o.created_at)::date AS dt,
          SUM(oi.total_amount)::numeric AS amount
        FROM lumina.order_items oi
        JOIN lumina.orders o ON o.id = oi.order_id
        JOIN public.orders po ON po.id = o.id
        WHERE oi.seller_id = $1
          AND o.created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '6 month'
          AND LOWER(COALESCE(o.status::text, '')) <> 'cancelled'
        GROUP BY date_trunc('month', o.created_at)::date
      )
      SELECT TO_CHAR(p.dt, 'Mon') AS label, COALESCE(a.amount, 0)::numeric AS value
      FROM points p
      LEFT JOIN amounts a ON a.dt = p.dt
      ORDER BY p.dt ASC
    `;
  }

  const result = await req.db.query(sql, [sellerId]);
  const multiplier = safeChartType === 'earnings' ? 0.85 : 1;

  return {
    chartType: safeChartType,
    period: safePeriod,
    labels: result.rows.map((r) => r.label),
    data: result.rows.map((r) => Number(r.value || 0) * multiplier)
  };
}

// Get dashboard metrics/stats
router.get('/metrics', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const sellerId = await resolveSellerId(req);

  try {
    await ensureSellerEarningsColumns(req);
    const metricsSql = `
      WITH product_stats AS (
        SELECT
          COUNT(*)::int AS total_products,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active_products,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1
              FROM public.product_variants pv
              WHERE pv.product_id = p.id
                AND pv.is_active = TRUE
                AND pv.stock_quantity > 0
            )
          )::int AS out_of_stock
        FROM public.products p
        WHERE seller_id = $1
      ),
      seller_order_totals AS (
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
          o.placed_at AS order_placed_at,
          o.created_at AS order_created_at,
          SUM(oi.line_total)::numeric AS seller_sales,
          SUM(COALESCE(oi.commission_amount, 0))::numeric AS commission_amount,
          SUM(COALESCE(oi.line_total, 0) - COALESCE(oi.commission_amount, 0))::numeric AS seller_earning
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE oi.seller_id = $1
        GROUP BY o.id, o.status, o.payment_status, o.placed_at, o.created_at
      ),
      order_stats AS (
        SELECT
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(order_status, 'pending')) NOT IN ('delivered', 'cancelled', 'canceled', 'refunded', 'returned'))::int AS pending_orders,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(order_status, 'pending')) = 'delivered')::int AS delivered_orders,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(order_status, 'pending')) IN ('cancelled', 'canceled'))::int AS cancelled_orders,
          COALESCE(SUM(seller_sales), 0)::numeric AS total_sales,
          COALESCE(SUM(CASE WHEN (
            LOWER(COALESCE(order_status, 'pending')) = 'delivered' AND LOWER(COALESCE(payment_status, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured')
          ) THEN seller_earning ELSE 0 END), 0)::numeric AS lifetime_earnings,
          COALESCE(SUM(CASE WHEN NOT (
            LOWER(COALESCE(order_status, 'pending')) = 'delivered' AND LOWER(COALESCE(payment_status, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured')
          ) THEN seller_earning ELSE 0 END), 0)::numeric AS pending_earnings,
          COALESCE(SUM(CASE WHEN DATE_TRUNC('month', COALESCE(order_placed_at, order_created_at)) = DATE_TRUNC('month', CURRENT_DATE) AND (
            LOWER(COALESCE(order_status, 'pending')) = 'delivered' AND LOWER(COALESCE(payment_status, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured')
          ) THEN seller_earning ELSE 0 END), 0)::numeric AS monthly_earnings,
          COALESCE(SUM(CASE WHEN (
            LOWER(COALESCE(order_status, 'pending')) = 'delivered' AND LOWER(COALESCE(payment_status, 'pending')) IN ('paid', 'authorized', 'completed', 'succeeded', 'settled', 'captured')
          ) THEN seller_earning ELSE 0 END), 0)::numeric AS withdrawable_balance,
          COALESCE(SUM(commission_amount), 0)::numeric AS commission_charged
        FROM seller_order_totals
      ),
      return_stats AS (
        SELECT
          COUNT(DISTINCT rr.id)::int AS return_requests,
          0::numeric AS total_refund_cost
        FROM public.return_requests rr
        JOIN public.order_items oi ON oi.order_id = rr.order_id
        WHERE oi.seller_id = $1
      ),
      payout_stats AS (
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE LOWER(COALESCE(status::text, 'pending')) = 'pending'), 0)::numeric AS pending_payouts,
          COALESCE(SUM(amount) FILTER (WHERE LOWER(COALESCE(status::text, 'pending')) = 'paid'), 0)::numeric AS completed_payouts
        FROM public.seller_payouts
        WHERE seller_id = $1
      ),
      rating_stats AS (
        SELECT COALESCE(AVG(average_rating), 0)::numeric AS seller_rating
        FROM public.products
        WHERE seller_id = $1
      )
      SELECT
        p.total_products AS "totalProducts",
        p.active_products AS "activeListings",
        p.out_of_stock AS "outOfStock",
        o.total_orders AS "totalOrders",
        o.pending_orders AS "pendingOrders",
        o.delivered_orders AS "deliveredOrders",
        o.cancelled_orders AS "cancelledOrders",
        o.total_sales AS "totalSales",
        o.total_sales AS "totalSalesDaily",
        o.lifetime_earnings AS "lifetimeEarnings",
        (o.lifetime_earnings - COALESCE(w.completed_payouts, 0) - COALESCE(w.pending_payouts, 0)) AS "withdrawableBalance",
        o.pending_earnings AS "pendingEarnings",
        o.monthly_earnings AS "monthlyEarnings",
        w.pending_payouts AS "pendingPayouts",
        o.commission_charged AS "commissionCharged",
        o.lifetime_earnings AS "totalEarnings",
        r.return_requests AS "returnRequests",
        r.total_refund_cost AS "totalRefundCost",
        w.pending_payouts AS "payoutsPending",
        rt.seller_rating AS "sellerRating"
      FROM product_stats p
      CROSS JOIN order_stats o
      CROSS JOIN return_stats r
      CROSS JOIN payout_stats w
      CROSS JOIN rating_stats rt
    `;

    const result = await req.db.query(metricsSql, [sellerId]);
    const metrics = result.rows[0] || {
      totalProducts: 0,
      activeListings: 0,
      outOfStock: 0,
      totalOrders: 0,
      pendingOrders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0,
      totalSales: 0,
      totalSalesDaily: 0,
      totalEarnings: 0,
      lifetimeEarnings: 0,
      withdrawableBalance: 0,
      pendingEarnings: 0,
      monthlyEarnings: 0,
      pendingPayouts: 0,
      commissionCharged: 0,
      returnRequests: 0,
      totalRefundCost: 0,
      payoutsPending: 0,
      sellerRating: 0
    };

    if (Number(metrics.totalEarnings || 0) === 0 && Number(metrics.pendingEarnings || 0) === 0 && Number(metrics.withdrawableBalance || 0) === 0) {
      await logSellerEarningsDebug(req, sellerId, metrics);
    }

    res.json({
      success: true,
      data: {
        ...metrics,
        totalSales: toMoney(metrics.totalSales || 0),
        totalSalesDaily: toMoney(metrics.totalSalesDaily || 0),
        totalEarnings: toMoney(metrics.totalEarnings || 0),
        lifetimeEarnings: toMoney(metrics.lifetimeEarnings || 0),
        withdrawableBalance: toMoney(metrics.withdrawableBalance || 0),
        pendingEarnings: toMoney(metrics.pendingEarnings || 0),
        monthlyEarnings: toMoney(metrics.monthlyEarnings || 0),
        pendingPayouts: toMoney(metrics.pendingPayouts || 0),
        commissionCharged: toMoney(metrics.commissionCharged || 0),
        payoutsPending: toMoney(metrics.payoutsPending || 0)
      }
    });
  } catch (error) {
    if (isDbOfflineError(error)) {
      return res.json({
        success: true,
        data: {
          totalProducts: 0,
          activeListings: 0,
          outOfStock: 0,
          totalOrders: 0,
          pendingOrders: 0,
          deliveredOrders: 0,
          cancelledOrders: 0,
          totalSales: 0,
          totalSalesDaily: 0,
          totalEarnings: 0,
          lifetimeEarnings: 0,
          withdrawableBalance: 0,
          pendingEarnings: 0,
          monthlyEarnings: 0,
          pendingPayouts: 0,
          commissionCharged: 0,
          returnRequests: 0,
          totalRefundCost: 0,
          payoutsPending: 0,
          sellerRating: 0
        },
        warning: 'Database is currently unavailable. Returning fallback metrics.'
      });
    }

    res.status(500).json({ success: false, message: error.message });
  }
});

// Get orders with filtering and pagination
router.get('/orders', async (req, res) => {
  const sellerId = await resolveSellerId(req);

  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 10, 1), 100);
    const offset = (page - 1) * pageSize;
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();

    const where = ['oi.seller_id = $1'];
    const params = [sellerId];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        o.order_number ILIKE $${params.length}
        OR oi.product_name ILIKE $${params.length}
        OR cu.full_name ILIKE $${params.length}
      )`);
    }

    const statusDb = mapDashboardStatusToDb(status);
    if (statusDb) {
      params.push(statusDb);
      where.push(`LOWER(o.status::text) = $${params.length}`);
    }

    params.push(pageSize, offset);

    const sql = `
      SELECT
        o.id AS "orderDbId",
        o.order_number AS "id",
        oi.product_name AS "product",
        cu.full_name AS "customer",
        oi.line_total AS "amount",
        CASE
          WHEN o.status::text = 'confirmed' THEN 'Confirmed'
          WHEN o.status::text = 'processing' THEN 'Packed'
          WHEN o.status::text = 'courier_assigned' THEN 'Courier Assigned'
          WHEN o.status::text = 'shipped' THEN 'Ready for Pickup'
          WHEN o.status::text = 'delivered' THEN 'Delivered'
          WHEN o.status::text = 'cancelled' THEN 'Cancelled'
          ELSE 'Pending'
        END AS "status",
        COALESCE(o.placed_at::date, o.created_at::date) AS "date"
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      JOIN public.users cu ON cu.id = o.customer_id
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(o.placed_at, o.created_at) DESC, oi.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      JOIN public.users cu ON cu.id = o.customer_id
      WHERE ${where.join(' AND ')}
    `;

    const [rowsResult, countResult] = await Promise.all([
      req.db.query(sql, params),
      req.db.query(countSql, params.slice(0, params.length - 2))
    ]);

    const result = {
      orders: rowsResult.rows,
      pagination: {
        currentPage: page,
        pageSize,
        totalItems: Number(countResult.rows[0]?.total || 0),
        totalPages: Math.max(1, Math.ceil(Number(countResult.rows[0]?.total || 0) / pageSize))
      }
    };

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single order by ID
router.get('/orders/:orderId', async (req, res) => {
  const sellerId = await resolveSellerId(req);
  const orderId = String(req.params.orderId || '').trim();

  try {
    const sql = `
      SELECT
        o.order_number AS "id",
        oi.product_name AS "product",
        cu.full_name AS "customer",
        oi.line_total AS "amount",
        CASE
          WHEN o.status::text = 'confirmed' THEN 'Confirmed'
          WHEN o.status::text = 'processing' THEN 'Packed'
          WHEN o.status::text = 'shipped' THEN 'Ready for Pickup'
          WHEN o.status::text = 'delivered' THEN 'Delivered'
          WHEN o.status::text = 'cancelled' THEN 'Cancelled'
          ELSE 'Pending'
        END AS "status",
        COALESCE(o.placed_at::date, o.created_at::date) AS "date"
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      JOIN public.users cu ON cu.id = o.customer_id
      WHERE oi.seller_id = $1
        AND (o.order_number = $2 OR o.id::text = $2)
      ORDER BY oi.id ASC
      LIMIT 1
    `;

    const result = await req.db.query(sql, [sellerId, orderId]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get notifications
router.get('/notifications', async (req, res) => {
  const sellerId = await resolveSellerId(req);

  try {
    const [orderRows, stockRows, returnRows] = await Promise.all([
      req.db.query(
        `
        SELECT o.order_number AS "orderId", cu.full_name AS "customerName", o.created_at AS "createdAt"
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        JOIN public.users cu ON cu.id = o.customer_id
        WHERE oi.seller_id = $1
        ORDER BY o.created_at DESC
        LIMIT 5
        `,
        [sellerId]
      ),
      req.db.query(
        `
        SELECT p.id, p.name, COALESCE(SUM(pv.stock_quantity), 0) AS "stockQuantity", MAX(pv.updated_at) AS "updatedAt"
        FROM public.products p
        LEFT JOIN public.product_variants pv ON pv.product_id = p.id AND pv.is_active = TRUE
        WHERE p.seller_id = $1
        GROUP BY p.id, p.name
        HAVING COALESCE(SUM(pv.stock_quantity), 0) <= 5
        ORDER BY "stockQuantity" ASC, "updatedAt" DESC
        LIMIT 5
        `,
        [sellerId]
      ),
      req.db.query(
        `
        SELECT rr.return_number AS "returnRequestId", rr.requested_at AS "requestedAt"
        FROM public.return_requests rr
        JOIN public.order_items oi ON oi.order_id = rr.order_id
        WHERE oi.seller_id = $1
        ORDER BY rr.requested_at DESC
        LIMIT 5
        `,
        [sellerId]
      )
    ]);

    let sequence = 1;
    const notifications = [];

    orderRows.rows.forEach((row) => {
      notifications.push({
        id: `ORD-${sequence++}`,
        title: `New Order #${row.orderId}`,
        text: `${row.customerName || 'Customer'} placed an order.`,
        time: formatRelativeTime(row.createdAt),
        unread: true,
        type: 'order'
      });
    });

    stockRows.rows.forEach((row) => {
      notifications.push({
        id: `STK-${sequence++}`,
        title: 'Low Stock Alert',
        text: `${row.name} stock is ${Number(row.stockQuantity || 0)} unit(s).`,
        time: formatRelativeTime(row.updatedAt),
        unread: true,
        type: 'warning'
      });
    });

    returnRows.rows.forEach((row) => {
      notifications.push({
        id: `RTN-${sequence++}`,
        title: 'Return Request',
        text: `Return request ${row.returnRequestId} requires review.`,
        time: formatRelativeTime(row.requestedAt),
        unread: true,
        type: 'return'
      });
    });

    const unreadOnly = req.query.unreadOnly === 'true';
    const filtered = unreadOnly ? notifications.filter((n) => n.unread) : notifications;

    const result = {
      notifications: filtered.slice(0, 20),
      unreadCount: notifications.filter((n) => n.unread).length,
      totalCount: notifications.length
    };

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark notification as read
router.post('/notifications/:notifId/read', (req, res) => {
  try {
    void req.params.notifId;
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark all notifications as read
router.post('/notifications/read-all', (req, res) => {
  try {
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get chart data
router.get('/charts/:chartType', async (req, res) => {
  const sellerId = await resolveSellerId(req);

  try {
    const { chartType } = req.params;
    const { period = 'daily' } = req.query;
    const data = await buildChartSeries(req, sellerId, chartType, String(period));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get seller information
router.get('/seller-info', async (req, res) => {
  const sellerId = await resolveSellerId(req);

  try {
    const sql = `
      SELECT
        u.id,
        u.full_name AS "name",
        u.email,
        u.created_at AS "joinedDate",
        sp.store_name AS "storeName",
        COALESCE(AVG(p.average_rating), 0)::numeric AS "rating"
      FROM lumina.users u
      LEFT JOIN lumina.seller_profiles sp ON sp.user_id = u.id
      LEFT JOIN lumina.products p ON p.seller_id = u.id
      WHERE u.id = $1
      GROUP BY u.id, u.full_name, u.email, u.created_at, sp.store_name
      LIMIT 1
    `;

    const result = await req.db.query(sql, [sellerId]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const seller = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      email: result.rows[0].email,
      joinedDate: result.rows[0].joinedDate,
      rating: Number(result.rows[0].rating || 0),
      storeName: result.rows[0].storeName || 'Store'
    };

    res.json({ success: true, data: seller });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
