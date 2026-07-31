const express = require('express');

const router = express.Router();

function getSellerKey(req) {
  const raw = req.query.sellerId || req.query.id || req.query.slug || req.params.sellerId || '';
  return String(raw || '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

async function resolveSellerId(req, sellerKey) {
  const key = String(sellerKey || '').trim();
  if (!key) {
    const fallback = await req.db.query(
      `
      SELECT sp.user_id
      FROM public.seller_profiles sp
      ORDER BY sp.created_at ASC
      LIMIT 1
      `
    );
    return fallback.rows[0]?.user_id || null;
  }

  if (isUuid(key)) {
    const result = await req.db.query(
      `
      SELECT sp.user_id
      FROM public.seller_profiles sp
      WHERE sp.user_id = $1
      LIMIT 1
      `,
      [key]
    );

    if (result.rows.length) return result.rows[0].user_id;
  }

  const bySlug = await req.db.query(
    `
    SELECT sp.user_id
    FROM public.seller_profiles sp
    WHERE sp.store_slug = $1
      OR sp.store_name ILIKE $1
    LIMIT 1
    `,
    [key]
  );

  if (bySlug.rows.length) return bySlug.rows[0].user_id;

  const byUserText = await req.db.query(
    `
    SELECT sp.user_id
    FROM public.seller_profiles sp
    WHERE sp.user_id::text = $1
    LIMIT 1
    `,
    [key]
  );

  if (byUserText.rows.length) return byUserText.rows[0].user_id;

  return null;
}

function formatMemberSince(dateValue) {
  if (!dateValue) return 'Unknown';
  const year = new Date(dateValue).getFullYear();
  return Number.isNaN(year) ? 'Unknown' : String(year);
}

function buildPolicies(profile) {
  return {
    shipping: 'Delivery in 3-5 days',
    returns: 'Returns accepted within 7 days',
    payments: 'COD and Card'
  };
}

function formatResponseTime(seconds) {
  if (!seconds || seconds <= 0) return 'No response data';
  if (seconds < 60) return '< 1 min';
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  if (seconds < 7200) return '< 2 hours';
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  const days = Math.round(seconds / 86400);
  return `${days} day${days === 1 ? '' : 's'}`;
}

router.get('/profile', async (req, res) => {
  const sellerKey = getSellerKey(req);

  try {
    const sellerId = await resolveSellerId(req, sellerKey);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const [sellerResult, productStatsResult, orderStatsResult, shipmentStatsResult, reviewStatsResult, productsResult, reviewsResult, responseTimeResult] = await Promise.all([
      req.db.query(
        `
        SELECT
          sp.user_id AS "sellerId",
          sp.store_name AS "storeName",
          sp.store_slug AS "storeSlug",
          COALESCE(sp.rating, 0) AS rating,
          COALESCE(sp.total_reviews, 0) AS "totalReviews",
          COALESCE(sp.business_email, u.email) AS "email",
          COALESCE(sp.business_phone, u.phone, '') AS "phone",
          u.created_at AS "memberSince",
          COALESCE(ua.country, 'Pakistan') AS location,
          (sp.kyc_status = 'active') AS "isVerified",
          '' AS "profileImage"
        FROM public.seller_profiles sp
        JOIN public.users u ON u.id = sp.user_id
        LEFT JOIN LATERAL (
          SELECT country
          FROM public.user_addresses ua
          WHERE ua.user_id = sp.user_id
          ORDER BY ua.is_default DESC, ua.updated_at DESC, ua.created_at DESC
          LIMIT 1
        ) ua ON TRUE
        WHERE sp.user_id = $1
        LIMIT 1
        `,
        [sellerId]
      ),
      req.db.query(
        `
        SELECT
          COUNT(*)::int AS "totalProducts",
          COUNT(*) FILTER (WHERE p.status = 'active')::int AS "activeProducts"
        FROM public.products p
        WHERE p.seller_id = $1
        `,
        [sellerId]
      ),
      req.db.query(
        `
        SELECT
          COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('delivered', 'refunded', 'returned'))::int AS "completedOrders",
          COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('shipped', 'delivered'))::int AS "inProgressOrders",
          COUNT(DISTINCT o.id)::int AS "totalOrders"
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.seller_id = $1
        `,
        [sellerId]
      ),
      req.db.query(
        `
        SELECT
          COUNT(DISTINCT s.id) FILTER (WHERE s.delivered_at IS NOT NULL AND s.shipped_at IS NOT NULL)::int AS "deliveredShipments",
          COUNT(DISTINCT s.id) FILTER (
            WHERE s.delivered_at IS NOT NULL
              AND s.shipped_at IS NOT NULL
              AND s.delivered_at <= s.shipped_at + INTERVAL '5 days'
          )::int AS "onTimeShipments"
        FROM public.shipments s
        JOIN public.order_items oi ON oi.order_id = s.order_id
        WHERE oi.seller_id = $1
        `,
        [sellerId]
      ),
      req.db.query(
        `
        SELECT
          COUNT(*)::int AS "reviewCount",
          COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0)::numeric AS "satisfactionScore"
        FROM public.product_reviews r
        JOIN public.products p ON p.id = r.product_id
        WHERE p.seller_id = $1
          AND NOT r.is_hidden
        `,
        [sellerId]
      ),
      req.db.query(
        `
        SELECT
          p.id,
          p.slug,
          p.name,
          p.base_price AS price,
          COALESCE(p.compare_price, p.base_price) AS "originalPrice",
          COALESCE(p.average_rating, 0) AS rating,
          COALESCE(p.total_reviews, 0) AS "reviewCount",
          COALESCE(c.name, 'General') AS category,
          COALESCE(img.image_url, '') AS image,
          (SELECT COALESCE(SUM(COALESCE(pv.stock_quantity, 0)), 0)::int FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.is_active = TRUE) AS quantity,
          (SELECT COALESCE(SUM(COALESCE(pv.stock_quantity, 0)), 0)::int FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.is_active = TRUE) > 0 AS "inStock"
        FROM public.products p
        LEFT JOIN public.categories c ON c.id = p.category_id
        LEFT JOIN LATERAL (
          SELECT image_url
          FROM public.product_images
          WHERE product_id = p.id
          ORDER BY is_primary DESC, sort_order ASC, id ASC
          LIMIT 1
        ) img ON TRUE
        WHERE p.seller_id = $1
          AND p.status = 'active'
        ORDER BY p.is_featured DESC, p.average_rating DESC, p.total_reviews DESC, p.created_at DESC
        LIMIT $2
        `,
        [sellerId, Math.max(1, Math.min(parseInt(req.query.limit, 10) || 500, 1000))]
      ),
      req.db.query(
        `
        SELECT
          r.id,
          r.rating,
          r.title,
          r.body,
          r.created_at AS "createdAt",
          u.full_name AS "customerName",
          p.name AS "productName"
        FROM public.product_reviews r
        JOIN public.products p ON p.id = r.product_id
        JOIN public.users u ON u.id = r.customer_id
        WHERE p.seller_id = $1
          AND NOT r.is_hidden
        ORDER BY r.created_at DESC
        LIMIT 8
        `,
        [sellerId]
      ),
      req.db.query(
        `
        SELECT
          AVG(EXTRACT(EPOCH FROM (sm.created_at - sm.previous_created_at))) AS "averageResponseSeconds"
        FROM (
          SELECT
            sm.ticket_id,
            sm.sender_role,
            sm.created_at,
            lag(sm.sender_role) OVER (PARTITION BY sm.ticket_id ORDER BY sm.created_at) AS previous_sender_role,
            lag(sm.created_at) OVER (PARTITION BY sm.ticket_id ORDER BY sm.created_at) AS previous_created_at
          FROM public.support_messages sm
          JOIN public.support_tickets st ON st.id = sm.ticket_id
          WHERE st.ticket_type = 'seller'
            AND st.seller_id = $1
            AND sm.is_internal_note = FALSE
        ) sm
        WHERE sm.sender_role = 'seller'
          AND sm.previous_sender_role = 'customer'
          AND sm.previous_created_at IS NOT NULL
        `,
        [sellerId]
      )
    ]);

    const sellerRow = sellerResult.rows[0];
    if (!sellerRow) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const products = productsResult.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      price: Number(row.price) || 0,
      originalPrice: Number(row.originalPrice) || Number(row.price) || 0,
      rating: Number(row.rating) || 0,
      reviewCount: Number(row.reviewCount) || 0,
      category: row.category || 'General',
      image: row.image || 'https://via.placeholder.com/480x480?text=Product',
      quantity: Number(row.quantity) || 0,
      inStock: Boolean(row.inStock)
    }));

    const reviews = reviewsResult.rows.map((row) => ({
      id: row.id,
      rating: Number(row.rating) || 0,
      title: row.title || '',
      body: row.body || '',
      createdAt: row.createdAt,
      customerName: row.customerName || 'Customer',
      productName: row.productName || 'Product'
    }));

    const totalOrders = Number(orderStatsResult.rows[0]?.totalOrders) || 0;
    const completedOrders = Number(orderStatsResult.rows[0]?.completedOrders) || 0;
    const deliveredShipments = Number(shipmentStatsResult.rows[0]?.deliveredShipments) || 0;
    const onTimeShipments = Number(shipmentStatsResult.rows[0]?.onTimeShipments) || 0;
    const reviewCount = Number(reviewStatsResult.rows[0]?.reviewCount) || 0;
    const satisfactionScore = Number(reviewStatsResult.rows[0]?.satisfactionScore) || 0;
    const avgResponseSeconds = Number(responseTimeResult.rows[0]?.averageResponseSeconds) || 0;

    const completionRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;
    const onTimeDelivery = deliveredShipments > 0 ? Math.round((onTimeShipments / deliveredShipments) * 100) : 0;
    const satisfaction = Number(satisfactionScore.toFixed ? satisfactionScore.toFixed(1) : satisfactionScore) || 0;

    const payload = {
      seller: {
        sellerId: sellerRow.sellerId,
        storeName: sellerRow.storeName,
        storeSlug: sellerRow.storeSlug,
        rating: Number(sellerRow.rating) || 0,
        totalReviews: Number(sellerRow.totalReviews) || 0,
        location: sellerRow.location || 'Pakistan',
        memberSince: formatMemberSince(sellerRow.memberSince),
        email: sellerRow.email || '',
        phone: sellerRow.phone || '',
        profileImage: sellerRow.profileImage || '',
        isVerified: Boolean(sellerRow.isVerified),
        about: `${sellerRow.storeName} specializes in quality products with a customer-first service approach.`,
        policies: buildPolicies(sellerRow)
      },
      stats: {
        totalProducts: Number(productStatsResult.rows[0]?.totalProducts) || 0,
        activeProducts: Number(productStatsResult.rows[0]?.activeProducts) || 0,
        completedOrders,
        inProgressOrders: Number(orderStatsResult.rows[0]?.inProgressOrders) || 0,
        responseTimeText: formatResponseTime(avgResponseSeconds),
        completionRate,
        onTimeDelivery,
        satisfaction
      },
      products,
      reviews,
      categories: ['All', 'Men', 'Women', 'Kids', 'Accessories'],
      policies: buildPolicies(sellerRow)
    };

    return res.json({ success: true, data: payload });
  } catch (error) {
    console.error('[sellerProfileRoutes] Failed to fetch seller profile:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch seller profile', error: error.message });
  }
});

module.exports = router;