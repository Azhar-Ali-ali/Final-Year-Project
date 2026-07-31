const express = require('express');

const router = express.Router();
const commissionSettings = require('../data/commissionSettingsData');
const paymentPayoutService = require('../data/paymentPayoutService');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function safeQuery(db, sql, params = []) {
  try {
    const result = await db.query(sql, params);
    return result.rows;
  } catch (_) {
    return [];
  }
}

function toGrowthPercent(current, previous) {
  const currentValue = toNumber(current);
  const previousValue = toNumber(previous);

  if (previousValue <= 0) {
    return currentValue > 0 ? 100 : 0;
  }

  const diff = ((currentValue - previousValue) / previousValue) * 100;
  return Number.isFinite(diff) ? Number(diff.toFixed(1)) : 0;
}

function formatGrowth(value) {
  const normalized = Number(value || 0);
  const sign = normalized >= 0 ? '+' : '-';
  return `${sign}${Math.abs(normalized).toFixed(1)}%`;
}

function emptySales(labels) {
  return {
    labels,
    revenue: labels.map(() => 0),
    orders: labels.map(() => 0)
  };
}

router.get('/summary', async (req, res) => {
  const db = req.db;

  const [userStatsRows, orderStatsRows, issueRows, lowStockRows, payoutOverview, userGrowthRows, orderGrowthRows] = await Promise.all([
    safeQuery(db, `
      SELECT
        COUNT(*) FILTER (WHERE role = 'customer')::int AS total_users,
        COUNT(*) FILTER (WHERE role = 'seller')::int AS total_sellers,
        COUNT(*) FILTER (WHERE role = 'seller' AND status = 'pending')::int AS pending_seller_approvals
      FROM users
    `),
    safeQuery(db, `
      SELECT
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed', 'processing'))::int AS pending_orders
      FROM orders
    `),
    safeQuery(db, `
      SELECT
        (SELECT COUNT(*)::int FROM return_requests WHERE status IN ('requested', 'approved', 'in_transit')) AS refund_requests,
        (SELECT COUNT(*)::int FROM disputes WHERE status IN ('open', 'in_progress')) AS dispute_cases
    `),
    safeQuery(db, `
      SELECT COUNT(*)::int AS low_stock_alerts
      FROM product_variants
      WHERE stock_quantity <= 5
    `),
    paymentPayoutService.getOverview(db),
    safeQuery(db, `
      SELECT
        COUNT(*) FILTER (WHERE role = 'customer' AND created_at >= now() - interval '30 days')::int AS new_users,
        COUNT(*) FILTER (WHERE role = 'customer' AND created_at < now() - interval '30 days')::int AS previous_users
      FROM users
      WHERE role = 'customer'
    `),
    safeQuery(db, `
      SELECT
        COUNT(*) FILTER (WHERE placed_at >= now() - interval '30 days')::int AS new_orders,
        COUNT(*) FILTER (WHERE placed_at < now() - interval '30 days')::int AS previous_orders
      FROM orders
    `)
  ]);

  const userStats = userStatsRows[0] || {};
  const orderStats = orderStatsRows[0] || {};
  const issueStats = issueRows[0] || {};
  const lowStock = lowStockRows[0] || {};
  const moneyStats = payoutOverview || {};
  const userGrowth = userGrowthRows[0] || {};
  const orderGrowth = orderGrowthRows[0] || {};

  const userGrowthPercent = toGrowthPercent(toNumber(userGrowth.new_users), toNumber(userGrowth.previous_users));
  const orderGrowthPercent = toGrowthPercent(toNumber(orderGrowth.new_orders), toNumber(orderGrowth.previous_orders));

  const data = [
    {
      title: 'Total Users',
      icon: 'group',
      value: toNumber(userStats.total_users),
      growth: formatGrowth(userGrowthPercent),
      compare: 'vs previous 30 days',
      positive: userGrowthPercent >= 0
    },
    {
      title: 'Total Sellers',
      icon: 'storefront',
      value: toNumber(userStats.total_sellers),
      growth: formatGrowth(0),
      compare: 'from database',
      positive: true
    },
    {
      title: 'Total Products',
      icon: 'inventory_2',
      value: 0,
      growth: formatGrowth(0),
      compare: 'from database',
      positive: true
    },
    {
      title: 'Total Orders',
      icon: 'shopping_cart',
      value: toNumber(orderStats.total_orders),
      growth: formatGrowth(orderGrowthPercent),
      compare: 'vs previous 30 days',
      positive: orderGrowthPercent >= 0
    },
    {
      title: 'Pending Orders',
      icon: 'pending',
      value: toNumber(orderStats.pending_orders),
      growth: formatGrowth(0),
      compare: 'from database',
      positive: false
    },
    {
      title: 'Pending Seller Approvals',
      icon: 'verified',
      value: toNumber(userStats.pending_seller_approvals),
      growth: formatGrowth(0),
      compare: 'from database',
      positive: true
    },
    {
      title: 'Total Revenue',
      icon: 'payments',
      value: Math.round(toNumber(moneyStats.totalGrossSales)),
      growth: formatGrowth(0),
      compare: 'delivered and paid only',
      positive: true
    },
    {
      title: 'Pending Amount',
      icon: 'hourglass_top',
      value: Math.round(toNumber(moneyStats.pendingAmount)),
      growth: formatGrowth(0),
      compare: 'not delivered or not paid yet',
      positive: false
    },
    {
      title: 'Total Commission Earned',
      icon: 'monetization_on',
      value: Math.round(toNumber(moneyStats.totalCommission)),
      growth: formatGrowth(0),
      compare: 'estimated from database',
      positive: true
    },
    {
      title: 'Refund Requests',
      icon: 'assignment_returned',
      value: toNumber(issueStats.refund_requests),
      growth: formatGrowth(0),
      compare: 'from database',
      positive: true
    },
    {
      title: 'Dispute Cases',
      icon: 'report',
      value: toNumber(issueStats.dispute_cases),
      growth: formatGrowth(0),
      compare: 'from database',
      positive: false
    },
    {
      title: 'Low Stock Alerts',
      icon: 'warning',
      value: toNumber(lowStock.low_stock_alerts),
      growth: formatGrowth(0),
      compare: 'from database',
      positive: true
    }
  ];

  const productRows = await safeQuery(db, `SELECT COUNT(*)::int AS total_products FROM products`);
  data[2].value = toNumber((productRows[0] || {}).total_products);

  return res.json({ success: true, data });
});

router.get('/charts', async (req, res) => {
  const period = String(req.query.period || 'daily').toLowerCase();
  const validPeriods = ['daily', 'weekly', 'monthly'];

  if (!validPeriods.includes(period)) {
    return res.status(400).json({
      success: false,
      message: `Invalid period. Use one of: ${validPeriods.join(', ')}`
    });
  }

  const db = req.db;

  let sales = emptySales(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  if (period === 'weekly') sales = emptySales(['Week 1', 'Week 2', 'Week 3', 'Week 4']);
  if (period === 'monthly') sales = emptySales(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

  if (period === 'daily') {
    const rows = await safeQuery(db, `
      WITH base_days AS (
        SELECT generate_series(current_date - interval '6 day', current_date, interval '1 day')::date AS day
      )
      SELECT
        TO_CHAR(b.day, 'Dy') AS label,
        COALESCE(SUM(o.grand_total), 0)::numeric AS revenue,
        COALESCE(COUNT(o.id), 0)::int AS orders
      FROM base_days b
      LEFT JOIN orders o ON DATE(o.placed_at) = b.day
      GROUP BY b.day
      ORDER BY b.day
    `);

    if (rows.length) {
      sales = {
        labels: rows.map(r => String(r.label).trim()),
        revenue: rows.map(r => toNumber(r.revenue)),
        orders: rows.map(r => toNumber(r.orders))
      };
    }
  }

  if (period === 'weekly') {
    const rows = await safeQuery(db, `
      SELECT
        TO_CHAR(date_trunc('week', o.placed_at), '"Week" IW') AS label,
        COALESCE(SUM(o.grand_total), 0)::numeric AS revenue,
        COUNT(*)::int AS orders
      FROM orders o
      WHERE o.placed_at >= now() - interval '8 weeks'
      GROUP BY date_trunc('week', o.placed_at)
      ORDER BY date_trunc('week', o.placed_at)
      LIMIT 4
    `);

    if (rows.length) {
      sales = {
        labels: rows.map(r => String(r.label).trim()),
        revenue: rows.map(r => toNumber(r.revenue)),
        orders: rows.map(r => toNumber(r.orders))
      };
    }
  }

  if (period === 'monthly') {
    const rows = await safeQuery(db, `
      WITH months AS (
        SELECT generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') AS mon
      )
      SELECT
        TO_CHAR(m.mon, 'Mon') AS label,
        COALESCE(SUM(o.grand_total), 0)::numeric AS revenue,
        COALESCE(COUNT(o.id), 0)::int AS orders
      FROM months m
      LEFT JOIN orders o ON date_trunc('month', o.placed_at) = m.mon
      GROUP BY m.mon
      ORDER BY m.mon
    `);

    if (rows.length) {
      sales = {
        labels: rows.map(r => String(r.label).trim()),
        revenue: rows.map(r => toNumber(r.revenue)),
        orders: rows.map(r => toNumber(r.orders))
      };
    }
  }

  const visitorsRows = await safeQuery(db, `
    WITH base_days AS (
      SELECT generate_series(current_date - interval '6 day', current_date, interval '1 day')::date AS day
    )
    SELECT
      TO_CHAR(b.day, 'Dy') AS label,
      COALESCE(COUNT(u.id), 0)::int AS traffic
    FROM base_days b
    LEFT JOIN users u ON DATE(u.created_at) = b.day
    GROUP BY b.day
    ORDER BY b.day
  `);

  const categoriesRows = await safeQuery(db, `
    SELECT c.name AS label, COALESCE(SUM(oi.line_total), 0)::numeric AS value
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    GROUP BY c.name
    ORDER BY value DESC
    LIMIT 6
  `);

  const sellersRows = await safeQuery(db, `
    SELECT COALESCE(sp.store_name, u.full_name, 'Unknown Seller') AS label, COALESCE(SUM(oi.line_total), 0)::numeric AS value
    FROM order_items oi
    JOIN users u ON u.id = oi.seller_id
    LEFT JOIN seller_profiles sp ON sp.user_id = u.id
    GROUP BY sp.store_name, u.full_name
    ORDER BY value DESC
    LIMIT 5
  `);

  const revenueReturnRows = await safeQuery(db, `
    WITH months AS (
      SELECT generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') AS mon
    )
    SELECT
      TO_CHAR(m.mon, 'Mon') AS label,
      COALESCE((
        SELECT SUM(o.grand_total)
        FROM orders o
        WHERE date_trunc('month', o.placed_at) = m.mon
      ), 0)::numeric AS revenue,
      COALESCE((
        SELECT SUM(r.amount)
        FROM refunds r
        WHERE date_trunc('month', r.created_at) = m.mon
      ), 0)::numeric AS returns
    FROM months m
    ORDER BY m.mon
  `);

  const data = {
    sales,
    visitors: visitorsRows.length
      ? {
          labels: visitorsRows.map(r => String(r.label).trim()),
          traffic: visitorsRows.map(r => toNumber(r.traffic))
        }
      : { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], traffic: [0, 0, 0, 0, 0, 0, 0] },
    categories: categoriesRows.length
      ? {
          labels: categoriesRows.map(r => r.label || 'Uncategorized'),
          values: categoriesRows.map(r => toNumber(r.value))
        }
      : { labels: ['No Data'], values: [0] },
    sellers: sellersRows.length
      ? {
          labels: sellersRows.map(r => r.label || 'Unknown'),
          values: sellersRows.map(r => toNumber(r.value))
        }
      : { labels: ['No Data'], values: [0] },
    revenueVsReturns: revenueReturnRows.length
      ? {
          labels: revenueReturnRows.map(r => String(r.label).trim()),
          revenue: revenueReturnRows.map(r => toNumber(r.revenue)),
          returns: revenueReturnRows.map(r => toNumber(r.returns))
        }
      : { labels: ['No Data'], revenue: [0], returns: [0] }
  };

  return res.json({ success: true, data });
});

router.get('/orders', async (req, res) => {
  const { status, search = '', limit = '10' } = req.query;
  const parsedLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);

  const params = [];
  const where = [];

  if (status) {
    params.push(String(status).toLowerCase());
    where.push(`LOWER(o.status::text) = $${params.length}`);
  }

  if (String(search).trim()) {
    params.push(`%${String(search).trim()}%`);
    where.push(`(
      o.order_number ILIKE $${params.length}
      OR cu.full_name ILIKE $${params.length}
      OR COALESCE(sp.store_name, su.full_name, '') ILIKE $${params.length}
    )`);
  }

  params.push(parsedLimit);

  const sql = `
    SELECT
      o.order_number AS id,
      COALESCE(cu.full_name, 'Unknown Customer') AS customer,
      COALESCE(sp.store_name, su.full_name, 'Unknown Seller') AS seller,
      COALESCE(o.grand_total, 0)::numeric AS total,
      LOWER(o.status::text) AS status,
      o.placed_at AS "placedAt"
    FROM orders o
    LEFT JOIN users cu ON cu.id = o.customer_id
    LEFT JOIN LATERAL (
      SELECT oi.seller_id
      FROM order_items oi
      WHERE oi.order_id = o.id
      ORDER BY oi.created_at ASC
      LIMIT 1
    ) first_seller ON TRUE
    LEFT JOIN users su ON su.id = first_seller.seller_id
    LEFT JOIN seller_profiles sp ON sp.user_id = su.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY o.placed_at DESC
    LIMIT $${params.length}
  `;

  const rows = await safeQuery(req.db, sql, params);

  return res.json({
    success: true,
    total: rows.length,
    data: rows
  });
});

router.get('/notifications', async (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  const rows = await safeQuery(req.db, `
    SELECT
      id,
      COALESCE(type, 'system') AS type,
      title,
      COALESCE(body, '') AS message,
      is_read AS read,
      created_at AS "createdAt"
    FROM notifications
    ORDER BY created_at DESC
    LIMIT 30
  `);

  const list = unreadOnly ? rows.filter(item => !item.read) : rows;
  const unreadCount = rows.filter(item => !item.read).length;

  return res.json({
    success: true,
    unreadCount,
    data: list
  });
});

module.exports = router;
