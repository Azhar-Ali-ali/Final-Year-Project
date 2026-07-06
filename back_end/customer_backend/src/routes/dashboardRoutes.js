const express = require('express');

const router = express.Router();

function getCustomerId(req) {
  const raw = req.auth?.session?.userId || req.headers['x-user-id'] || '';
  return String(raw || '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function getLimit(req, key, fallback, min = 1, max = 50) {
  const value = Number(req.query[key]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

async function resolveCustomerId(req, requestedId) {
  const sessionCustomerId = getCustomerId(req);
  if (isUuid(sessionCustomerId)) return sessionCustomerId;
  return null;
}

router.get('/overview', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const recentOrdersLimit = getLimit(req, 'recentOrdersLimit', 5);
  const recommendationLimit = getLimit(req, 'recommendationLimit', 6);
  const wishlistLimit = getLimit(req, 'wishlistLimit', 4);

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const metricsSql = `
      SELECT
        (SELECT COUNT(*)::int FROM public.orders WHERE customer_id = $1) AS "totalOrders",
        (SELECT COUNT(*)::int FROM public.orders WHERE customer_id = $1 AND status IN ('pending', 'confirmed', 'processing', 'shipped')) AS "pendingOrders",
        (SELECT COUNT(*)::int FROM public.orders WHERE customer_id = $1 AND status = 'delivered') AS "deliveredOrders",
        (SELECT COUNT(*)::int FROM public.wishlists WHERE customer_id = $1) AS "wishlistItems",
        0::int AS "openSupportTickets",
        0::int AS "activeReturns"
    `;

    const recentOrdersSql = `
      SELECT
        o.id AS "orderDbId",
        o.order_number AS "orderId",
        o.status,
        o.grand_total AS "orderTotal",
        o.currency,
        o.placed_at AS "placedAt",
        NULL::timestamp AS "deliveredAt",
        oi.product_name AS "productName",
        oi.quantity,
        oi.line_total AS "lineTotal",
        COALESCE(pm.image_url, '') AS "productImage",
        COALESCE(shp.courier_name, '') AS "courierName",
        COALESCE(shp.shipment_status::text, '') AS "shipmentStatus",
        CASE
          WHEN o.status::text = 'courier_assigned' THEN 'courier_assigned'::text
          WHEN o.status::text = 'shipped' AND COALESCE(shp.courier_name, '') <> '' THEN 'courier_assigned'::text
          WHEN o.status::text = 'shipped' THEN 'ready_for_pickup'::text
          WHEN o.status::text = 'processing' THEN 'processing'::text
          WHEN o.status::text = 'confirmed' THEN 'confirmed'::text
          WHEN o.status::text = 'pending' THEN 'pending'::text
          WHEN o.status::text = 'delivered' THEN 'delivered'::text
          WHEN o.status::text = 'cancelled' THEN 'cancelled'::text
          WHEN o.status::text = 'returned' THEN 'returned'::text
          WHEN o.status::text = 'refunded' THEN 'refunded'::text
          ELSE o.status::text
        END AS "displayStatus",
        CASE
          WHEN o.status::text = 'courier_assigned' THEN 'Courier Assigned'::text
          WHEN o.status::text = 'shipped' AND COALESCE(shp.courier_name, '') <> '' THEN 'Courier Assigned'::text
          WHEN o.status::text = 'shipped' THEN 'Ready for Pickup'::text
          WHEN o.status::text = 'processing' THEN 'Packed'::text
          WHEN o.status::text = 'confirmed' THEN 'Confirmed'::text
          WHEN o.status::text = 'pending' THEN 'Pending'::text
          WHEN o.status::text = 'delivered' THEN 'Delivered'::text
          WHEN o.status::text = 'cancelled' THEN 'Cancelled'::text
          WHEN o.status::text = 'returned' THEN 'Returned'::text
          WHEN o.status::text = 'refunded' THEN 'Refunded'::text
          ELSE INITCAP(o.status::text)
        END AS "displayLabel"
      FROM public.orders o
      LEFT JOIN LATERAL (
        SELECT oi.id, oi.product_id, oi.product_name, oi.quantity, oi.line_total
        FROM public.order_items oi
        WHERE oi.order_id = o.id
        ORDER BY oi.id ASC
        LIMIT 1
      ) oi ON TRUE
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM public.product_images
        WHERE product_id = oi.product_id
        ORDER BY is_primary DESC, sort_order ASC, id ASC
        LIMIT 1
      ) pm ON TRUE
      LEFT JOIN LATERAL (
        SELECT courier_name, status AS shipment_status
        FROM public.shipments
        WHERE order_id = o.id
        ORDER BY created_at DESC
        LIMIT 1
      ) shp ON TRUE
      WHERE o.customer_id = $1
      ORDER BY COALESCE(o.placed_at, o.created_at) DESC
      LIMIT $2
    `;

    const recommendationsSql = `
      SELECT
        p.id AS "productId",
        p.name AS "productName",
        p.slug,
        p.base_price AS "price",
        p.currency,
        p.average_rating AS "rating",
        p.total_reviews AS "reviewCount",
        COALESCE(pm.image_url, '') AS "productImage",
        sp.store_name AS "sellerName",
        c.name AS "categoryName"
      FROM public.products p
      LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM public.product_images
        WHERE product_id = p.id
        ORDER BY is_primary DESC, sort_order ASC, id ASC
        LIMIT 1
      ) pm ON TRUE
      WHERE p.status = 'active'
      ORDER BY p.average_rating DESC, p.total_reviews DESC, p.created_at DESC
      LIMIT $1
    `;

    const wishlistPreviewSql = `
      SELECT
        w.id,
        w.created_at AS "addedAt",
        p.id AS "productId",
        p.name AS "productName",
        p.slug,
        p.base_price AS "price",
        p.currency,
        COALESCE(pm.image_url, '') AS "productImage"
      FROM public.wishlists w
      JOIN public.products p ON p.id = w.product_id
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM public.product_images
        WHERE product_id = p.id
        ORDER BY is_primary DESC, sort_order ASC, id ASC
        LIMIT 1
      ) pm ON TRUE
      WHERE w.customer_id = $1
      ORDER BY w.created_at DESC
      LIMIT $2
    `;

    const profileSql = `
      SELECT
        u.id AS "customerId",
        u.full_name AS "fullName",
        u.email,
        u.phone,
        cp.loyalty_points AS "loyaltyPoints"
      FROM public.users u
      LEFT JOIN public.customer_profiles cp ON cp.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `;

    const [metricsResult, recentOrdersResult, recommendationsResult, wishlistResult, profileResult] = await Promise.all([
      req.db.query(metricsSql, [customerId]),
      req.db.query(recentOrdersSql, [customerId, recentOrdersLimit]),
      req.db.query(recommendationsSql, [recommendationLimit]),
      req.db.query(wishlistPreviewSql, [customerId, wishlistLimit]),
      req.db.query(profileSql, [customerId])
    ]);

    if (!profileResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    return res.json({
      success: true,
      data: {
        profile: profileResult.rows[0],
        metrics: metricsResult.rows[0],
        recentOrders: recentOrdersResult.rows,
        recommendations: recommendationsResult.rows,
        wishlistPreview: wishlistResult.rows
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch dashboard overview', error: error.message });
  }
});

router.get('/recent-orders', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const limit = getLimit(req, 'limit', 10);

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const sql = `
      SELECT
        o.id AS "orderDbId",
        o.order_number AS "orderId",
        o.status,
        o.grand_total AS "orderTotal",
        o.currency,
        o.placed_at AS "placedAt",
        NULL::timestamp AS "deliveredAt"
      FROM public.orders o
      WHERE o.customer_id = $1
      ORDER BY COALESCE(o.placed_at, o.created_at) DESC
      LIMIT $2
    `;

    const result = await req.db.query(sql, [customerId, limit]);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch recent orders', error: error.message });
  }
});

router.get('/recommendations', async (req, res) => {
  const limit = getLimit(req, 'limit', 8);

  try {
    const sql = `
      SELECT
        p.id AS "productId",
        p.name AS "productName",
        p.slug,
        p.base_price AS "price",
        p.currency,
        p.average_rating AS "rating",
        p.total_reviews AS "reviewCount",
        COALESCE(pm.image_url, '') AS "productImage",
        sp.store_name AS "sellerName"
      FROM public.products p
      LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM public.product_images
        WHERE product_id = p.id
        ORDER BY is_primary DESC, sort_order ASC, id ASC
        LIMIT 1
      ) pm ON TRUE
      WHERE p.status = 'active'
      ORDER BY p.average_rating DESC, p.total_reviews DESC, p.created_at DESC
      LIMIT $1
    `;

    const result = await req.db.query(sql, [limit]);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch recommendations', error: error.message });
  }
});

module.exports = router;
