const express = require('express');
const { normalizeOrderStatus, deriveDisplayStatus } = require('../utils/orderStatus');

const router = express.Router();

function getCustomerId(req) {
  const raw = req.query?.userId || req.auth?.session?.userId || req.headers['x-user-id'] || '';
  return String(raw || '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

async function resolveCustomerId(req, requestedId) {
  const sessionCustomerId = getCustomerId(req);
  if (isUuid(sessionCustomerId)) return sessionCustomerId;
  return null;
}

function canCancel(status) {
  return ['pending', 'confirmed', 'processing'].includes(status);
}

function normalizePagination(req) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 10, 1), 100);
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

router.get('/summary', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const sql = `
      SELECT
        COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed', 'processing', 'shipped', 'courier_assigned'))::int AS pending,
            COUNT(*) FILTER (WHERE status IN ('shipped', 'courier_assigned'))::int AS shipped,
        COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
        COUNT(*) FILTER (WHERE status = 'returned')::int AS returned,
        COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded
      FROM public.orders
      WHERE customer_id = $1
    `;

    const result = await req.db.query(sql, [customerId]);
    return res.json({ success: true, data: result.rows[0] || {} });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch order summary', error: error.message });
  }
});

router.get('/', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const status = String(req.query.status || '').trim().toLowerCase();
  const search = String(req.query.search || '').trim();
  const { page, pageSize, offset } = normalizePagination(req);

  const statusMap = {
    pending: ['pending'],
    confirmed: ['confirmed'],
    processing: ['processing'],
    packed: ['processing'],
        shipped: ['shipped', 'courier_assigned'],
    delivered: ['delivered'],
    cancelled: ['cancelled'],
    returned: ['returned'],
    refunded: ['refunded'],
    all: []
  };

  if (status && !statusMap[status]) {
    return res.status(400).json({ success: false, message: 'Invalid status filter' });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const where = ['o.customer_id = $1'];
    const params = [customerId];

    const mapped = statusMap[status] || [];
    if (mapped.length > 0) {
      const placeholders = mapped.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      where.push(`o.status::text IN (${placeholders.join(', ')})`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        o.order_number ILIKE $${params.length}
        OR EXISTS (
          SELECT 1 FROM public.order_items oi2
          WHERE oi2.order_id = o.id
            AND oi2.product_name ILIKE $${params.length}
        )
      )`);
    }

    params.push(pageSize, offset);

    const sql = `
      SELECT
        o.id AS "orderDbId",
        o.order_number AS "orderId",
        o.status,
        o.grand_total AS "totalAmount",
        o.currency,
        COALESCE(o.placed_at::date, o.created_at::date) AS "orderDate",
        NULL::timestamp AS "cancelledAt",
        NULL::timestamp AS "deliveredAt",
        fp.product_name AS "productName",
        fp.line_total AS "lineAmount",
        fp.quantity,
        COALESCE(pm.image_url, '') AS "productImage",
        su.full_name AS "sellerName",
        sp.store_name AS "storeName",
        item_stats.item_count::int AS "itemCount",
        COALESCE(shp.tracking_number, '') AS "trackingNumber",
        COALESCE(shp.shipment_status::text, '') AS "shippingStatus",
        COALESCE(shp.courier_name, '') AS courier_name,
        COALESCE(shp.tracking_number, '') AS tracking_number,
        COALESCE(shp.shipment_status::text, '') AS shipment_status,
        COALESCE(UPPER(pay.method), 'ONLINE') AS payment_method,
        COALESCE(UPPER(pay.status::text), 'PENDING') AS payment_status
      FROM public.orders o
      LEFT JOIN LATERAL (
        SELECT courier_name, tracking_number, status::text AS shipment_status
        FROM public.shipments
        WHERE order_id = o.id
        ORDER BY created_at DESC
        LIMIT 1
      ) shp ON TRUE
      LEFT JOIN LATERAL (
        SELECT method, status
        FROM public.payments
        WHERE order_id = o.id
        ORDER BY created_at DESC
        LIMIT 1
      ) pay ON TRUE
      LEFT JOIN LATERAL (
        SELECT oi.id, oi.product_id, oi.seller_id, oi.product_name, oi.line_total, oi.quantity
        FROM public.order_items oi
        WHERE oi.order_id = o.id
        ORDER BY oi.id ASC
        LIMIT 1
      ) fp ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS item_count
        FROM public.order_items oi
        WHERE oi.order_id = o.id
      ) item_stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM public.product_images
        WHERE product_id = fp.product_id
        ORDER BY is_primary DESC, sort_order ASC, id ASC
        LIMIT 1
      ) pm ON TRUE
      LEFT JOIN public.users su ON su.id = fp.seller_id
      LEFT JOIN public.seller_profiles sp ON sp.user_id = fp.seller_id
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(o.placed_at, o.created_at) DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM public.orders o
      WHERE ${where.join(' AND ')}
    `;

    const [result, countResult] = await Promise.all([
      req.db.query(sql, params),
      req.db.query(countSql, params.slice(0, params.length - 2))
    ]);

    const data = result.rows.map((row) => {
      const derived = deriveDisplayStatus(row.status, row.shipment_status, row.courier_name);
      const normalized = normalizeOrderStatus(derived.status);
      return {
        ...row,
        paymentMethod: row.payment_method || 'ONLINE',
        paymentStatus: row.payment_status || 'PENDING',
        displayStatus: derived.status,
        displayLabel: derived.label || normalized.label,
        statusMessage: derived.message || normalized.message,
        canCancel: canCancel(row.status)
      };
    });

    return res.json({
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        total: countResult.rows[0]?.total || 0
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch orders', error: error.message });
  }
});

router.get('/:orderId/details', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const orderId = String(req.params.orderId || '').trim();

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const orderSql = `
      SELECT
        o.id AS "orderDbId",
        o.order_number AS "orderId",
        o.status,
        COALESCE(o.placed_at::date, o.created_at::date) AS "orderDate",
        NULL::timestamp AS "deliveredAt",
        o.currency,
        o.subtotal,
        o.shipping_fee AS "shippingFee",
        o.discount_total AS "discountAmount",
        o.tax_total AS "taxAmount",
        o.grand_total AS "totalAmount",
        COALESCE(UPPER(pay.method), 'ONLINE') AS payment_method,
        COALESCE(UPPER(pay.status::text), 'PENDING') AS payment_status,
        ua.phone,
        ua.receiver_name AS "recipientName",
        ua.line1 AS "addressLine1",
        ua.line2 AS "addressLine2",
        ua.city,
        ua.state AS "province",
        ua.postal_code AS "postalCode",
        ua.country,
        COALESCE(shp.courier_name, '') AS "courierName",
        COALESCE(shp.tracking_number, '') AS "trackingNumber",
        COALESCE(shp.shipment_status::text, '') AS "shipmentStatus"
      FROM public.orders o
      LEFT JOIN public.user_addresses ua ON ua.id = o.shipping_address_id
      LEFT JOIN LATERAL (
        SELECT courier_name, tracking_number, status::text AS shipment_status
        FROM public.shipments
        WHERE order_id = o.id
        ORDER BY created_at DESC
        LIMIT 1
      ) shp ON TRUE
      LEFT JOIN LATERAL (
        SELECT method, status
        FROM public.payments
        WHERE order_id = o.id
        ORDER BY created_at DESC
        LIMIT 1
      ) pay ON TRUE
      WHERE o.customer_id = $1 AND (o.order_number = $2 OR o.id::text = $2)
      LIMIT 1
    `;

    const orderResult = await req.db.query(orderSql, [customerId, orderId]);
    if (!orderResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    const itemsSql = `
      SELECT
        oi.id AS "orderItemId",
        oi.product_id AS "productId",
        oi.product_name AS "productName",
        oi.quantity,
        oi.unit_price AS "unitPrice",
        oi.line_total AS "lineTotal",
        COALESCE(pm.image_url, '') AS "productImage",
        COALESCE(sp.store_name, su.full_name) AS "sellerName",
        NULL::text AS "returnRequestId",
        NULL::text AS "returnStatus"
      FROM public.order_items oi
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM public.product_images
        WHERE product_id = oi.product_id
        ORDER BY is_primary DESC, sort_order ASC, id ASC
        LIMIT 1
      ) pm ON TRUE
      LEFT JOIN public.seller_profiles sp ON sp.user_id = oi.seller_id
      LEFT JOIN public.users su ON su.id = oi.seller_id
      WHERE oi.order_id = $1
      ORDER BY oi.id ASC
    `;

    const itemsResult = await req.db.query(itemsSql, [order.orderDbId]);

    const derived = deriveDisplayStatus(order.status, order.shipmentStatus, order.courierName);
    const normalized = normalizeOrderStatus(derived.status);

    return res.json({
      success: true,
      data: {
        ...order,
        paymentMethod: order.payment_method || 'ONLINE',
        paymentStatus: order.payment_status || 'PENDING',
        displayStatus: derived.status,
        displayLabel: derived.label || normalized.label,
        statusMessage: derived.message || normalized.message,
        canCancel: canCancel(order.status),
        items: itemsResult.rows,
        timeline: []
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch order details', error: error.message });
  }
});

router.post('/:orderId/cancel', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const orderId = String(req.params.orderId || '').trim();

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const statusCheck = await req.db.query(
      `
      SELECT id, status
      FROM public.orders
      WHERE customer_id = $1 AND (order_number = $2 OR id::text = $2)
      LIMIT 1
      `,
      [customerId, orderId]
    );

    if (!statusCheck.rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const currentStatus = String(statusCheck.rows[0].status || '').toLowerCase();
    if (!canCancel(currentStatus)) {
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled in current status' });
    }

    await req.db.query(
      `
      UPDATE public.orders
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1
      `,
      [statusCheck.rows[0].id]
    );

    return res.json({ success: true, message: 'Order cancelled successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to cancel order', error: error.message });
  }
});

module.exports = router;
