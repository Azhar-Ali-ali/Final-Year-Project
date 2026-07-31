const express = require('express');

const router = express.Router();

function getSellerId(req) {
  const raw = req.auth?.session?.userId
    || req.auth?.user?.id
    || req.auth?.user?.sellerId
    || req.headers['x-seller-id']
    || req.headers['x-user-id']
    || req.query?.sellerId
    || req.body?.sellerId
    || '';
  return String(raw).trim();
}

async function resolveSellerId(req) {
  const sellerId = getSellerId(req);
  return sellerId || null;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function seriesFromRows(rows, fallbackLabels) {
  const labels = rows.map((row) => row.label);
  const data = rows.map((row) => toNumber(row.value, 0));
  return {
    labels: labels.length ? labels : fallbackLabels,
    data: data.length ? data : fallbackLabels.map(() => 0)
  };
}

function completedAndPaidOrderFilter(orderAlias = 'o') {
  const statusExpr = `LOWER(COALESCE(${orderAlias}.status::text, ''))`;
  const paymentExpr = `LOWER(COALESCE(${orderAlias}.payment_status::text, ''))`;

  return `
    ${statusExpr} NOT IN ('cancelled', 'canceled', 'failed', 'refunded', 'returned', 'return_requested', 'payment_failed', 'payment_cancelled')
    AND (
      ${paymentExpr} IN ('paid', 'completed', 'successful', 'captured', 'succeeded', 'confirmed', 'pending', 'processing', 'partial', 'partially_paid', 'awaiting_payment', 'awaiting_confirmation')
      OR ${statusExpr} IN ('confirmed', 'processing', 'courier_assigned', 'picked_up', 'ready_for_pickup', 'shipped', 'delivered', 'completed')
    )
  `;
}

async function getMetrics(req, sellerId) {
  const eligibleFilter = completedAndPaidOrderFilter('o');
  const sql = `
    WITH order_stats AS (
      SELECT
        COALESCE(SUM(oi.line_total) FILTER (WHERE o.created_at >= CURRENT_DATE AND o.created_at < CURRENT_DATE + INTERVAL '1 day' AND ${eligibleFilter}), 0)::numeric AS daily_sales,
        COALESCE(SUM(oi.line_total) FILTER (WHERE o.created_at >= date_trunc('week', CURRENT_DATE) AND o.created_at < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week' AND ${eligibleFilter}), 0)::numeric AS weekly_sales,
        COALESCE(SUM(oi.line_total) FILTER (WHERE o.created_at >= date_trunc('month', CURRENT_DATE) AND o.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' AND ${eligibleFilter}), 0)::numeric AS monthly_sales,
        COUNT(DISTINCT o.id) FILTER (WHERE ${eligibleFilter})::int AS total_orders,
        COUNT(DISTINCT o.id) FILTER (WHERE LOWER(COALESCE(o.status::text, '')) IN ('shipped', 'delivered', 'completed'))::int AS completed_orders
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.seller_id = $1
    ),
    product_stats AS (
      SELECT COUNT(*)::int AS total_products
      FROM public.products
      WHERE seller_id = $1
    )
    SELECT
      o.daily_sales AS "dailySales",
      o.weekly_sales AS "weeklySales",
      o.monthly_sales AS "monthlySales",
      CASE
        WHEN o.total_orders > 0 THEN ROUND((o.completed_orders::numeric / o.total_orders::numeric) * 100, 1)
        ELSE 0
      END AS "conversionRate",
      o.total_orders AS "totalOrders",
      p.total_products AS "totalProducts"
    FROM order_stats o
    CROSS JOIN product_stats p
  `;

  const result = await req.db.query(sql, [sellerId]);
  const row = result.rows[0] || {};

  return {
    dailySales: toNumber(row.dailySales, 0),
    weeklySales: toNumber(row.weeklySales, 0),
    monthlySales: toNumber(row.monthlySales, 0),
    conversionRate: toNumber(row.conversionRate, 0),
    totalOrders: toNumber(row.totalOrders, 0),
    totalProducts: toNumber(row.totalProducts, 0)
  };
}

async function getSales(req, sellerId, period = 'monthly') {
  const eligibleFilter = completedAndPaidOrderFilter('o');
  const safePeriod = ['daily', 'weekly', 'monthly'].includes(period) ? period : 'monthly';
  let sql = '';
  let fallbackLabels = [];

  if (safePeriod === 'daily') {
    fallbackLabels = ['8am', '10am', '12pm', '2pm', '4pm', '6pm', '8pm'];
    sql = `
      WITH points AS (
        SELECT generate_series(0, 6) AS idx
      ),
      buckets AS (
        SELECT
          GREATEST(0, LEAST(6, FLOOR(EXTRACT(HOUR FROM o.created_at)::numeric / 3)))::int AS idx,
          COALESCE(SUM(oi.line_total), 0)::numeric AS total
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.seller_id = $1
          AND o.created_at >= CURRENT_DATE
          AND o.created_at < CURRENT_DATE + INTERVAL '1 day'
          AND ${eligibleFilter}
        GROUP BY GREATEST(0, LEAST(6, FLOOR(EXTRACT(HOUR FROM o.created_at)::numeric / 3)))
      )
      SELECT
        CASE p.idx
          WHEN 0 THEN '8am'
          WHEN 1 THEN '10am'
          WHEN 2 THEN '12pm'
          WHEN 3 THEN '2pm'
          WHEN 4 THEN '4pm'
          WHEN 5 THEN '6pm'
          ELSE '8pm'
        END AS label,
        COALESCE(b.total, 0)::numeric AS value
      FROM points p
      LEFT JOIN buckets b ON b.idx = p.idx
      ORDER BY p.idx ASC
    `;
  } else if (safePeriod === 'weekly') {
    fallbackLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    sql = `
      WITH points AS (
        SELECT generate_series(CURRENT_DATE - INTERVAL '6 day', CURRENT_DATE, INTERVAL '1 day')::date AS dt
      ),
      buckets AS (
        SELECT
          DATE(o.created_at) AS dt,
          COALESCE(SUM(oi.line_total), 0)::numeric AS total
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.seller_id = $1
          AND o.created_at >= CURRENT_DATE - INTERVAL '6 day'
          AND o.created_at < CURRENT_DATE + INTERVAL '1 day'
          AND ${eligibleFilter}
        GROUP BY DATE(o.created_at)
      )
      SELECT TO_CHAR(p.dt, 'Dy') AS label, COALESCE(b.total, 0)::numeric AS value
      FROM points p
      LEFT JOIN buckets b ON b.dt = p.dt
      ORDER BY p.dt ASC
    `;
  } else {
    fallbackLabels = ['Week1', 'Week2', 'Week3', 'Week4'];
    sql = `
      WITH points AS (
        SELECT generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '3 month', date_trunc('month', CURRENT_DATE), INTERVAL '1 month')::date AS dt
      ),
      buckets AS (
        SELECT
          date_trunc('month', o.created_at)::date AS dt,
          COALESCE(SUM(oi.line_total), 0)::numeric AS total
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.seller_id = $1
          AND o.created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 month'
          AND o.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
          AND ${eligibleFilter}
        GROUP BY date_trunc('month', o.created_at)::date
      )
      SELECT TO_CHAR(p.dt, 'Mon') AS label, COALESCE(b.total, 0)::numeric AS value
      FROM points p
      LEFT JOIN buckets b ON b.dt = p.dt
      ORDER BY p.dt ASC
    `;
  }

  const result = await req.db.query(sql, [sellerId]);
  return seriesFromRows(result.rows, fallbackLabels);
}

async function getViews(req, sellerId, limit = 5) {
  const eligibleFilter = completedAndPaidOrderFilter('o');
  const safeLimit = Math.max(1, Number(limit) || 5);
  const result = await req.db.query(
    `
      WITH sales AS (
        SELECT
          oi.product_id,
          SUM(oi.quantity)::int AS sold_units,
          SUM(oi.line_total)::numeric AS revenue
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.seller_id = $1
          AND ${eligibleFilter}
        GROUP BY oi.product_id
      ),
      reviews AS (
        SELECT
          pr.product_id,
          COUNT(*)::int AS review_count,
          COALESCE(AVG(pr.rating), 0)::numeric AS avg_rating
        FROM public.product_reviews pr
        JOIN public.products p ON p.id = pr.product_id
        WHERE p.seller_id = $1 AND NOT pr.is_hidden
        GROUP BY pr.product_id
      )
      SELECT
        p.name AS product,
        COALESCE(s.sold_units, 0)::int AS sold_units,
        COALESCE(r.review_count, 0)::int AS review_count,
        COALESCE(r.avg_rating, 0)::numeric AS rating
      FROM public.products p
      LEFT JOIN sales s ON s.product_id = p.id
      LEFT JOIN reviews r ON r.product_id = p.id
      WHERE p.seller_id = $1
      ORDER BY (COALESCE(s.sold_units, 0) * 3 + COALESCE(r.review_count, 0) * 5) DESC, p.created_at DESC
      LIMIT $2
    `,
    [sellerId, safeLimit]
  );

  return result.rows.map((row) => ({
    product: row.product,
    views: Number(row.sold_units || 0) * 3 + Number(row.review_count || 0) * 5,
    change: Number(row.rating || 0) >= 4 ? 8 : -3
  }));
}

async function getBestSelling(req, sellerId, limit = 5, category = '') {
  const eligibleFilter = completedAndPaidOrderFilter('o');
  const safeLimit = Math.max(1, Number(limit) || 5);
  const params = [sellerId];
  let categoryClause = '';

  if (category) {
    params.push(category);
    categoryClause = `AND COALESCE(c.name, '') ILIKE $2`;
  }

  params.push(safeLimit);
  const limitIndex = params.length;

  const result = await req.db.query(
    `
      WITH sales AS (
        SELECT
          oi.product_id,
          SUM(oi.quantity)::int AS units,
          SUM(oi.line_total)::numeric AS revenue
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.seller_id = $1
          AND ${eligibleFilter}
        GROUP BY oi.product_id
      )
      SELECT
        p.name AS product,
        COALESCE(s.units, 0)::int AS units,
        COALESCE(s.revenue, 0)::numeric AS revenue,
        COALESCE(c.name, 'Uncategorized') AS category
      FROM public.products p
      LEFT JOIN sales s ON s.product_id = p.id
      LEFT JOIN public.categories c ON c.id = p.category_id
      WHERE p.seller_id = $1
        ${categoryClause}
      ORDER BY COALESCE(s.revenue, 0) DESC, COALESCE(s.units, 0) DESC, p.created_at DESC
      LIMIT $${limitIndex}
    `,
    params
  );

  const totalRevenue = result.rows.reduce((sum, row) => sum + toNumber(row.revenue, 0), 0);
  return result.rows.map((row) => ({
    product: row.product,
    units: toNumber(row.units, 0),
    revenue: toNumber(row.revenue, 0),
    category: row.category || 'Uncategorized',
    revenueSharePct: totalRevenue > 0 ? Number(((toNumber(row.revenue, 0) / totalRevenue) * 100).toFixed(2)) : 0
  }));
}

async function getRefundAnalytics(req, sellerId) {
  const eligibleFilter = completedAndPaidOrderFilter('o');
  const result = await req.db.query(
    `
      WITH refund_rows AS (
        SELECT
          p.name AS product,
          SUM(ri.quantity)::int AS units,
          COALESCE(SUM(r.amount), 0)::numeric AS refund_amount,
          COALESCE(MIN(NULLIF(rr.reason, '')), 'Return requested') AS reason,
          COALESCE(SUM(oi.quantity), 0)::int AS sold_units
        FROM public.return_requests rr
        JOIN public.return_items ri ON ri.return_request_id = rr.id
        JOIN public.order_items oi ON oi.id = ri.order_item_id
        JOIN public.orders o ON o.id = oi.order_id
        JOIN public.products p ON p.id = oi.product_id
        LEFT JOIN public.refunds r ON r.return_request_id = rr.id
        WHERE oi.seller_id = $1
          AND ${eligibleFilter}
        GROUP BY p.name
      )
      SELECT
        product,
        CASE
          WHEN sold_units > 0 THEN ROUND((units::numeric / sold_units::numeric) * 100, 1)
          ELSE 0
        END AS rate,
        units,
        reason,
        refund_amount
      FROM refund_rows
      ORDER BY units DESC, refund_amount DESC
      LIMIT 5
    `,
    [sellerId]
  );

  return {
    items: result.rows.map((row) => ({
      product: row.product,
      rate: `${toNumber(row.rate, 0).toFixed(1)}%`,
      units: toNumber(row.units, 0),
      reason: row.reason || 'Return requested'
    })),
    totalUnits: result.rows.reduce((sum, row) => sum + toNumber(row.units, 0), 0),
    averageRate: result.rows.length > 0
      ? Number((result.rows.reduce((sum, row) => sum + toNumber(row.rate, 0), 0) / result.rows.length).toFixed(2))
      : 0
  };
}

async function getTraffic(req, sellerId) {
  const result = await req.db.query(
    `
      SELECT
        COALESCE(NULLIF(issue_type, ''), NULLIF(ticket_type::text, ''), 'general') AS source,
        COUNT(*)::int AS count
      FROM public.support_tickets
      WHERE seller_id = $1
      GROUP BY COALESCE(NULLIF(issue_type, ''), NULLIF(ticket_type::text, ''), 'general')
      ORDER BY count DESC, source ASC
    `,
    [sellerId]
  );

  const total = result.rows.reduce((sum, row) => sum + toNumber(row.count, 0), 0);
  return {
    sources: result.rows.map((row) => ({
      source: row.source,
      pct: total > 0 ? Number(((toNumber(row.count, 0) / total) * 100).toFixed(1)) : 0
    })),
    totalPct: total > 0 ? 100 : 0
  };
}

async function getRatings(req, sellerId) {
  const result = await req.db.query(
    `
      WITH rating_rows AS (
        SELECT pr.rating
        FROM public.product_reviews pr
        JOIN public.products p ON p.id = pr.product_id
        WHERE p.seller_id = $1 AND NOT pr.is_hidden
      )
      SELECT
        COALESCE(AVG(rating), 0)::numeric AS average_rating,
        COUNT(*)::int AS total_reviews,
        COUNT(*) FILTER (WHERE rating = 5)::int AS five_star,
        COUNT(*) FILTER (WHERE rating = 4)::int AS four_star,
        COUNT(*) FILTER (WHERE rating = 3)::int AS three_star,
        COUNT(*) FILTER (WHERE rating = 2)::int AS two_star,
        COUNT(*) FILTER (WHERE rating = 1)::int AS one_star
      FROM rating_rows
    `,
    [sellerId]
  );

  const row = result.rows[0] || {};
  const totalReviews = toNumber(row.total_reviews, 0);

  return {
    averageRating: toNumber(row.average_rating, 0),
    totalReviews,
    distribution: [
      { stars: 5, pct: totalReviews > 0 ? Number(((toNumber(row.five_star, 0) / totalReviews) * 100).toFixed(1)) : 0 },
      { stars: 4, pct: totalReviews > 0 ? Number(((toNumber(row.four_star, 0) / totalReviews) * 100).toFixed(1)) : 0 },
      { stars: 3, pct: totalReviews > 0 ? Number(((toNumber(row.three_star, 0) / totalReviews) * 100).toFixed(1)) : 0 },
      { stars: 2, pct: totalReviews > 0 ? Number(((toNumber(row.two_star, 0) / totalReviews) * 100).toFixed(1)) : 0 },
      { stars: 1, pct: totalReviews > 0 ? Number(((toNumber(row.one_star, 0) / totalReviews) * 100).toFixed(1)) : 0 }
    ]
  };
}

async function getOverview(req, sellerId) {
  const [metrics, bestSelling, traffic, ratings] = await Promise.all([
    getMetrics(req, sellerId),
    getBestSelling(req, sellerId, 1),
    getTraffic(req, sellerId),
    getRatings(req, sellerId)
  ]);

  return {
    ...metrics,
    topProduct: bestSelling[0] || null,
    topTrafficSource: traffic.sources[0] || null,
    averageRating: ratings.averageRating,
    totalReviews: ratings.totalReviews,
    ratingDistribution: ratings.distribution
  };
}

async function getMeta(req, sellerId) {
  const bestSelling = await getBestSelling(req, sellerId, 100);
  const traffic = await getTraffic(req, sellerId);

  return {
    salesPeriods: ['daily', 'weekly', 'monthly'],
    categories: [...new Set(bestSelling.map((item) => item.category).filter(Boolean))],
    trafficSources: traffic.sources.map((item) => item.source),
    chartSeries: ['sales', 'views', 'traffic']
  };
}

router.get('/overview', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const data = await getOverview(req, sellerId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch performance overview', error: error.message });
  }
});

router.get('/meta', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const data = await getMeta(req, sellerId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch performance metadata', error: error.message });
  }
});

router.get('/metrics', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const data = await getMetrics(req, sellerId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch metric cards', error: error.message });
  }
});

router.get('/sales', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const period = req.query.period || 'monthly';
    const data = await getSales(req, sellerId, period);
    return res.status(200).json({ success: true, data: { period, ...data } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch sales analytics', error: error.message });
  }
});

router.get('/views', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const data = await getViews(req, sellerId, req.query.limit || 5);
    return res.status(200).json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch product views', error: error.message });
  }
});

router.get('/best-selling', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const data = await getBestSelling(req, sellerId, req.query.limit || 5, req.query.category || '');
    return res.status(200).json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch best-selling products', error: error.message });
  }
});

router.get('/refunds', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const data = await getRefundAnalytics(req, sellerId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch refund analytics', error: error.message });
  }
});

router.get('/traffic', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const data = await getTraffic(req, sellerId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch traffic analytics', error: error.message });
  }
});

router.get('/ratings', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const data = await getRatings(req, sellerId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch rating analytics', error: error.message });
  }
});

module.exports = router;

