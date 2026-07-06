const express = require('express');

const router = express.Router();
const commissionSettings = require('../data/commissionSettingsData');

const uiOrderStatuses = [
  'Pending Payment',
  'Processing',
  'Ready for Pickup',
  'Courier Assigned',
  'Picked Up',
  'Out for Delivery',
  'Delivered',
  'Completed',
  'Cancelled'
];

const uiShipmentStatuses = [
  'New Pickup Available',
  'Courier Accepted',
  'Picked Up',
  'In Transit',
  'Out for Delivery',
  'Delivered',
  'RTO (Return to Origin)',
  'Failed Delivery'
];

const uiToDbOrderStatus = {
  'Pending Payment': 'pending',
  Processing: 'processing',
  'Ready for Pickup': 'shipped',
  'Courier Assigned': 'processing',
  'Picked Up': 'shipped',
  'Out for Delivery': 'shipped',
  Delivered: 'delivered',
  Completed: 'delivered',
  Cancelled: 'cancelled',
  Returned: 'returned',
  Pending: 'pending',
  Confirmed: 'confirmed',
  Packed: 'processing',
  Shipped: 'shipped'
};

const dbToUiOrderStatus = {
  pending: 'Pending Payment',
  confirmed: 'Processing',
  processing: 'Processing',
  shipped: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Returned',
  returned: 'Returned'
};

const uiToDbShipmentStatus = {
  'New Pickup Available': 'pending',
  'Courier Accepted': 'pending',
  'Picked Up': 'packed',
  'In Transit': 'in_transit',
  'Out for Delivery': 'out_for_delivery',
  Delivered: 'delivered',
  'RTO (Return to Origin)': 'returned',
  'Failed Delivery': 'failed'
};

const dbToUiShipmentStatus = {
  pending: 'New Pickup Available',
  packed: 'Picked Up',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  returned: 'RTO (Return to Origin)',
  failed: 'Failed Delivery'
};

async function safeQuery(db, sql, params = []) {
  try {
    const result = await db.query(sql, params);
    return result.rows;
  } catch (_) {
    return [];
  }
}

async function syncOrderPaymentStatusToPaid(db, orderId, orderStatus) {
  const normalizedStatus = String(orderStatus || '').trim().toLowerCase();
  if (!orderId || !['delivered', 'completed'].includes(normalizedStatus)) {
    return;
  }

  try {
    await safeQuery(
      db,
      `
        UPDATE public.payments
        SET status = 'paid', paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
        WHERE order_id = $1
      `,
      [orderId]
    );

    await safeQuery(
      db,
      `
        UPDATE public.orders
        SET payment_status = 'paid', updated_at = NOW()
        WHERE id = $1
      `,
      [orderId]
    );
  } catch (error) {
    console.error('Failed to sync payment status after delivery', error && error.message);
  }
}

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizePaymentStatus(statusText) {
  const raw = String(statusText || 'pending').toLowerCase();
  if (raw === 'paid' || raw === 'success' || raw === 'succeeded' || raw === 'completed') return 'Paid';
  if (raw === 'failed' || raw === 'declined') return 'Failed';
  if (raw === 'refunded') return 'Refunded';
  return 'Pending';
}

function deriveUiOrderStatus(row, paymentType, paymentStatus) {
  const orderRaw = String(row.order_status || '').toLowerCase();
  const shipmentRaw = String(row.shipment_status || '').toLowerCase();
  const hasCourier = Boolean(row.courier_name);

  if (orderRaw === 'cancelled') return 'Cancelled';
  if (orderRaw === 'returned' || orderRaw === 'refunded') return 'Cancelled';

  if (orderRaw === 'delivered') {
    if (paymentType === 'COD' && paymentStatus !== 'Paid') return 'Delivered';
    return 'Completed';
  }

  if (orderRaw === 'courier_assigned') return 'Courier Assigned';

  if (shipmentRaw === 'out_for_delivery') return 'Out for Delivery';
  if (shipmentRaw === 'in_transit' || shipmentRaw === 'packed') return 'Picked Up';
  if (shipmentRaw === 'pending' && hasCourier) return 'Courier Assigned';
  if (shipmentRaw === 'pending') return 'Ready for Pickup';

  if (orderRaw === 'shipped' && !shipmentRaw) return 'Ready for Pickup';
  if (orderRaw === 'shipped') return 'Out for Delivery';

  if (orderRaw === 'pending') {
    if (paymentType === 'Online' && paymentStatus === 'Pending') return 'Pending Payment';
    return 'Processing';
  }

  if (orderRaw === 'confirmed' || orderRaw === 'processing') return 'Processing';

  return dbToUiOrderStatus[row.order_status] || 'Processing';
}

function toUiOrder(row, commissionFraction = 0) {
  const paymentType = String(row.payment_method || 'ONLINE').toUpperCase() === 'COD' ? 'COD' : 'Online';
  const paymentStatus = normalizePaymentStatus(row.payment_status);
  const orderTotal = money(row.order_total);
  const codAmount = paymentType === 'COD' ? money(row.payment_amount || orderTotal) : 0;
  const shippingCharges = money(row.shipping_charges);
  const platformCommission = Number((orderTotal * commissionFraction).toFixed(2));
  const codFee = paymentType === 'COD' ? Number((codAmount * 0.025).toFixed(2)) : 0;
  const netSellerEarnings = Number((Math.max(0, orderTotal - shippingCharges - platformCommission - codFee)).toFixed(2));

  return {
    orderId: row.order_number,
    orderDate: row.order_date || '',
    customerName: row.customer_name || 'N/A',
    customerCity: row.customer_city || 'N/A',
    customerAddress: row.customer_address || 'N/A',
    customerPostal: row.customer_postal || '',
    customerPhone: row.customer_phone || '',
    deliveryInstructions: row.delivery_instructions || '',
    sellerName: row.seller_name || 'N/A',
    sellerStoreName: row.seller_store_name || 'N/A',
    sellerContact: row.seller_contact || '',
    pickupAddress: row.pickup_address || 'N/A',
    sellerWalletBalance: 0,
    sellerRiskStatus: 'Low',
    paymentType,
    paymentStatus,
    orderTotal,
    status: deriveUiOrderStatus(row, paymentType, paymentStatus),
    courierName: row.courier_name || '',
    trackingId: row.tracking_id || '',
    codAmount,
    settlementStatus: row.settlement_status || 'Pending',
    shipmentStatus: dbToUiShipmentStatus[row.shipment_status] || 'New Pickup Available',
    pickupDate: row.pickup_date || '',
    deliveredDate: row.delivered_date || '',
    inTransitUpdates: [],
    returnStatus: row.return_status || 'None',
    rtoReason: row.rto_reason || '',
    shippingCharges,
    platformCommission,
    codFee,
    netSellerEarnings,
    inventoryAdjusted: false,
    codReceived: Boolean(row.cod_received),
    sellerSettlementDone: Boolean(row.seller_settlement_done),
    activities: []
  };
}

async function loadOrderRows(db) {
  return safeQuery(
    db,
    `
      SELECT
        o.id,
        o.order_number,
        to_char(o.placed_at::date, 'YYYY-MM-DD') AS order_date,
        o.status::text AS order_status,
        o.grand_total AS order_total,
        o.shipping_fee AS shipping_charges,
        u.full_name AS customer_name,
        u.phone AS customer_phone,
        ua.city AS customer_city,
        ua.line1 AS customer_address,
        ua.postal_code AS customer_postal,
        COALESCE(pay.method, 'ONLINE') AS payment_method,
        COALESCE(pay.status::text, 'pending') AS payment_status,
        COALESCE(pay.amount, o.grand_total) AS payment_amount,
        shp.courier_name,
        shp.tracking_number AS tracking_id,
        shp.shipment_status::text AS shipment_status,
        to_char(shp.shipped_at::date, 'YYYY-MM-DD') AS pickup_date,
        to_char(shp.delivered_at::date, 'YYYY-MM-DD') AS delivered_date,
        COALESCE(seller_block.seller_name, 'N/A') AS seller_name,
        COALESCE(seller_block.seller_store_name, 'N/A') AS seller_store_name,
        COALESCE(seller_block.seller_contact, '') AS seller_contact,
        COALESCE(seller_block.pickup_address, 'N/A') AS pickup_address,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM audit_logs al
            WHERE al.entity_type = 'order' AND al.entity_id = o.id AND al.action ILIKE 'Refund processed%'
          ) OR EXISTS (
            SELECT 1 FROM audit_logs al
            WHERE al.entity_type = 'order' AND al.entity_id = o.id AND al.action ILIKE 'Seller earnings reversed%'
          ) THEN 'Adjusted'
          WHEN EXISTS (
            SELECT 1 FROM audit_logs al
            WHERE al.entity_type = 'order' AND al.entity_id = o.id AND al.action ILIKE 'Seller settlement posted to wallet%'
          ) THEN 'Paid'
          ELSE 'Pending'
        END AS settlement_status,
        'None'::text AS return_status,
        ''::text AS rto_reason,
        EXISTS (
          SELECT 1 FROM audit_logs al
          WHERE al.entity_type = 'order' AND al.entity_id = o.id AND al.action ILIKE 'COD cash receipt confirmed from courier%'
        ) AS cod_received,
        EXISTS (
          SELECT 1 FROM audit_logs al
          WHERE al.entity_type = 'order' AND al.entity_id = o.id AND al.action ILIKE 'Seller settlement posted to wallet%'
        ) AS seller_settlement_done,
        ''::text AS delivery_instructions
      FROM orders o
      JOIN users u ON u.id = o.customer_id
      LEFT JOIN user_addresses ua ON ua.id = o.shipping_address_id
      LEFT JOIN LATERAL (
        SELECT method, status, amount
        FROM payments p
        WHERE p.order_id = o.id
        ORDER BY p.created_at DESC
        LIMIT 1
      ) pay ON true
      LEFT JOIN LATERAL (
        SELECT courier_name, tracking_number, shipment_status, shipped_at, delivered_at
        FROM shipments s
        WHERE s.order_id = o.id
        ORDER BY s.created_at DESC
        LIMIT 1
      ) shp ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(sp.store_name, 'N/A') AS seller_name,
          COALESCE(sp.store_name, 'N/A') AS seller_store_name,
          COALESCE(seller_user.phone, '') AS seller_contact,
          COALESCE(sss.shipping_policy, 'N/A') AS pickup_address
        FROM order_items oi
        LEFT JOIN seller_profiles sp ON sp.user_id = oi.seller_id
        LEFT JOIN users seller_user ON seller_user.id = oi.seller_id
        LEFT JOIN seller_store_settings sss ON sss.seller_id = oi.seller_id
        WHERE oi.order_id = o.id
        LIMIT 1
      ) seller_block ON true
      ORDER BY o.placed_at DESC
    `
  );
}

async function orderByNumber(db, orderNumber) {
  const rows = await safeQuery(
    db,
    `
      SELECT id, order_number
      FROM orders
      WHERE order_number = $1
      LIMIT 1
    `,
    [orderNumber]
  );
  return rows[0] || null;
}

async function buildOrderDetail(db, orderNumber) {
  const rows = await safeQuery(
    db,
    `
      SELECT *
      FROM (
        SELECT
          o.id,
          o.order_number,
          to_char(o.placed_at::date, 'YYYY-MM-DD') AS order_date,
          o.status::text AS order_status,
          o.grand_total AS order_total,
          o.shipping_fee AS shipping_charges,
          u.full_name AS customer_name,
          u.phone AS customer_phone,
          ua.city AS customer_city,
          ua.line1 AS customer_address,
          ua.postal_code AS customer_postal,
          COALESCE(pay.method, 'ONLINE') AS payment_method,
          COALESCE(pay.status::text, 'pending') AS payment_status,
          COALESCE(pay.amount, o.grand_total) AS payment_amount,
          shp.id AS shipment_id,
          shp.courier_name,
          shp.tracking_number AS tracking_id,
          shp.shipment_status::text AS shipment_status,
          to_char(shp.shipped_at::date, 'YYYY-MM-DD') AS pickup_date,
          to_char(shp.delivered_at::date, 'YYYY-MM-DD') AS delivered_date,
          COALESCE(seller_block.seller_name, 'N/A') AS seller_name,
          COALESCE(seller_block.seller_store_name, 'N/A') AS seller_store_name,
          COALESCE(seller_block.seller_contact, '') AS seller_contact,
          COALESCE(seller_block.pickup_address, 'N/A') AS pickup_address,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM audit_logs al
              WHERE al.entity_type = 'order' AND al.entity_id = o.id AND al.action ILIKE 'Refund processed%'
            ) OR EXISTS (
              SELECT 1 FROM audit_logs al
              WHERE al.entity_type = 'order' AND al.entity_id = o.id AND al.action ILIKE 'Seller earnings reversed%'
            ) THEN 'Adjusted'
            WHEN EXISTS (
              SELECT 1 FROM audit_logs al
              WHERE al.entity_type = 'order' AND al.entity_id = o.id AND al.action ILIKE 'Seller settlement posted to wallet%'
            ) THEN 'Paid'
            ELSE 'Pending'
          END AS settlement_status,
          'None'::text AS return_status,
          ''::text AS rto_reason,
          EXISTS (
            SELECT 1 FROM audit_logs al
            WHERE al.entity_type = 'order' AND al.entity_id = o.id AND al.action ILIKE 'COD cash receipt confirmed from courier%'
          ) AS cod_received,
          EXISTS (
            SELECT 1 FROM audit_logs al
            WHERE al.entity_type = 'order' AND al.entity_id = o.id AND al.action ILIKE 'Seller settlement posted to wallet%'
          ) AS seller_settlement_done,
          ''::text AS delivery_instructions
        FROM orders o
        JOIN users u ON u.id = o.customer_id
        LEFT JOIN user_addresses ua ON ua.id = o.shipping_address_id
        LEFT JOIN LATERAL (
          SELECT method, status, amount
          FROM payments p
          WHERE p.order_id = o.id
          ORDER BY p.created_at DESC
          LIMIT 1
        ) pay ON true
        LEFT JOIN LATERAL (
          SELECT id, courier_name, tracking_number, shipment_status, shipped_at, delivered_at
          FROM shipments s
          WHERE s.order_id = o.id
          ORDER BY s.created_at DESC
          LIMIT 1
        ) shp ON true
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(sp.store_name, 'N/A') AS seller_name,
            COALESCE(sp.store_name, 'N/A') AS seller_store_name,
            COALESCE(seller_user.phone, '') AS seller_contact,
            COALESCE(sss.shipping_policy, 'N/A') AS pickup_address
          FROM order_items oi
          LEFT JOIN seller_profiles sp ON sp.user_id = oi.seller_id
          LEFT JOIN users seller_user ON seller_user.id = oi.seller_id
          LEFT JOIN seller_store_settings sss ON sss.seller_id = oi.seller_id
          WHERE oi.order_id = o.id
          LIMIT 1
        ) seller_block ON true
      ) base
      WHERE base.order_number = $1
      LIMIT 1
    `,
    [orderNumber]
  );

  if (!rows.length) return null;
  const fraction = (await commissionSettings.getCommissionSettings(db)).commissionRate / 100;
  const order = toUiOrder(rows[0], fraction);

  const products = await safeQuery(
    db,
    `
      SELECT
        oi.product_name AS name,
        COALESCE(oi.sku, '') AS sku,
        oi.quantity AS qty,
        oi.unit_price AS price,
        oi.line_total AS subtotal,
        COALESCE(pi.image_url, 'https://via.placeholder.com/42') AS image
      FROM order_items oi
      LEFT JOIN product_images pi ON pi.product_id = oi.product_id AND pi.is_primary = TRUE
      WHERE oi.order_id = $1
      ORDER BY oi.created_at ASC
    `,
    [rows[0].id]
  );

  const activity = await safeQuery(
    db,
    `
      SELECT
        to_char(created_at, 'YYYY-MM-DD HH24:MI') AS at,
        'Admin'::text AS by,
        action AS note
      FROM audit_logs
      WHERE entity_type = 'order' AND entity_id = $1
      ORDER BY created_at DESC
      LIMIT 30
    `,
    [rows[0].id]
  );

  const shipmentActivity = await safeQuery(
    db,
    `
      SELECT
        to_char(event_time, 'YYYY-MM-DD HH24:MI') AS at,
        'System'::text AS by,
        event_label AS note
      FROM shipment_events
      WHERE shipment_id = $1
      ORDER BY event_time ASC
      LIMIT 50
    `,
    [rows[0].shipment_id]
  );

  order.products = products.map((p) => ({
    image: p.image,
    name: p.name,
    sku: p.sku,
    qty: Number(p.qty || 0),
    price: money(p.price),
    subtotal: money(p.subtotal)
  }));

  order.activities = [...activity, ...shipmentActivity].sort((a, b) => (a.at < b.at ? 1 : -1));
  order.inTransitUpdates = shipmentActivity.map((item) => `${item.at.slice(0, 10)}: ${item.note}`);

  return order;
}

async function writeOrderAudit(db, orderId, action, afterData = null) {
  await safeQuery(
    db,
    `
      INSERT INTO audit_logs (action, entity_type, entity_id, after_data)
      VALUES ($1, 'order', $2, $3::jsonb)
    `,
    [action, orderId, JSON.stringify(afterData || {})]
  );
}

router.get('/meta', async (req, res) => {
  const rows = await loadOrderRows(req.db);
  const sellers = [...new Set(rows.map((r) => r.seller_name).filter(Boolean))];
  const couriers = [...new Set(rows.map((r) => r.courier_name).filter(Boolean))];
  const cities = [...new Set(rows.map((r) => r.customer_city).filter(Boolean))];

  res.json({
    success: true,
    data: {
      statuses: uiOrderStatuses,
      shipmentStatuses: uiShipmentStatuses,
      sellers,
      couriers,
      cities
    }
  });
});

router.get('/stats', async (req, res) => {
  const rows = await safeQuery(
    req.db,
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
        COUNT(*) FILTER (WHERE status IN ('shipped', 'courier_assigned'))::int AS shipped,
        COUNT(*) FILTER (WHERE status IN ('returned', 'refunded'))::int AS returned,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
      FROM orders
    `
  );

  const codRows = await safeQuery(
    req.db,
    `
      SELECT COUNT(*)::int AS cod_pending
      FROM orders o
      JOIN payments p ON p.order_id = o.id
      WHERE UPPER(p.method) = 'COD' AND COALESCE(p.status::text, 'pending') NOT IN ('paid', 'success', 'succeeded', 'completed')
    `
  );

  const row = rows[0] || {};
  res.json({
    success: true,
    data: {
      total: Number(row.total || 0),
      delivered: Number(row.delivered || 0),
      shipped: Number(row.shipped || 0),
      returned: Number(row.returned || 0),
      cancelled: Number(row.cancelled || 0),
      codPending: Number((codRows[0] && codRows[0].cod_pending) || 0)
    }
  });
});

router.get('/orders', async (req, res) => {
  const rows = await loadOrderRows(req.db);
  const data = rows.map(toUiOrder);
  res.json({ success: true, total: data.length, data });
});

router.get('/orders/:orderId', async (req, res) => {
  const order = await buildOrderDetail(req.db, req.params.orderId);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  return res.json({ success: true, data: order });
});

router.patch('/orders/:orderId/status', async (req, res) => {
  const target = await orderByNumber(req.db, req.params.orderId);
  if (!target) return res.status(404).json({ success: false, message: 'Order not found' });

  const status = req.body && req.body.status;
  const dbStatus = uiToDbOrderStatus[status];
  if (!dbStatus) {
    return res.status(400).json({ success: false, message: 'Invalid status value' });
  }

  const paymentRows = await safeQuery(
    req.db,
    `SELECT COALESCE(method, 'ONLINE') AS method, COALESCE(status::text, 'pending') AS status FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [target.id]
  );
  const paymentMethod = paymentRows.length && String(paymentRows[0].method || '').toUpperCase() === 'COD' ? 'COD' : 'Online';
  const paymentStatus = normalizePaymentStatus(paymentRows.length ? paymentRows[0].status : 'pending');

  if (status === 'Completed') {
    if (paymentMethod === 'COD' && paymentStatus !== 'Paid') {
      return res.status(400).json({ success: false, message: 'COD order cannot be Completed before Payment Status is Paid' });
    }
  }

  if (status === 'Pending Payment' && paymentMethod === 'COD') {
    return res.status(400).json({ success: false, message: 'COD order should not be in Pending Payment status' });
  }

  await safeQuery(req.db, `UPDATE orders SET status = $2::order_status, updated_at = NOW() WHERE id = $1`, [target.id, dbStatus]);

  if (status === 'Ready for Pickup') {
    const shipmentRows = await safeQuery(req.db, `SELECT id FROM shipments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [target.id]);
    if (!shipmentRows.length) {
      await safeQuery(
        req.db,
        `INSERT INTO shipments (order_id, shipment_status, created_at, updated_at) VALUES ($1, 'pending', NOW(), NOW())`,
        [target.id]
      );
    } else {
      await safeQuery(req.db, `UPDATE shipments SET shipment_status = 'pending', updated_at = NOW() WHERE id = $1`, [shipmentRows[0].id]);
    }
  }

  if (status === 'Courier Assigned' || status === 'Picked Up' || status === 'Out for Delivery' || status === 'Delivered' || status === 'Completed') {
    const shipmentRows = await safeQuery(req.db, `SELECT id FROM shipments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [target.id]);
    if (shipmentRows.length) {
      const shipStatusMap = {
        'Courier Assigned': 'pending',
        'Picked Up': 'packed',
        'Out for Delivery': 'out_for_delivery',
        Delivered: 'delivered',
        Completed: 'delivered'
      };
      await safeQuery(
        req.db,
        `UPDATE shipments SET shipment_status = $2::shipment_status, updated_at = NOW() ${status === 'Delivered' || status === 'Completed' ? ', delivered_at = NOW()' : ''} WHERE id = $1`,
        [shipmentRows[0].id, shipStatusMap[status]]
      );
    }
  }

  if (status === 'Delivered' || status === 'Completed') {
    await syncOrderPaymentStatusToPaid(req.db, target.id, dbStatus);
  }

  if ((status === 'Delivered' || status === 'Completed') && paymentMethod === 'COD' && paymentStatus === 'Pending') {
    await writeOrderAudit(req.db, target.id, 'COD delivered; cash collection still pending');
  }

  await writeOrderAudit(req.db, target.id, req.body.note || `Status changed to ${status}`);

  const order = await buildOrderDetail(req.db, req.params.orderId);
  return res.json({ success: true, data: order });
});

router.patch('/orders/:orderId/courier', async (req, res) => {
  const target = await orderByNumber(req.db, req.params.orderId);
  if (!target) return res.status(404).json({ success: false, message: 'Order not found' });

  const courierName = String((req.body && req.body.courierName) || '').trim();
  if (!courierName) {
    return res.status(400).json({ success: false, message: 'courierName is required' });
  }

  const activeCourierRows = await safeQuery(
    req.db,
    `
      SELECT id, name
      FROM couriers
      WHERE is_active = TRUE
        AND LOWER(name) = LOWER($1)
      LIMIT 1
    `,
    [courierName]
  );

  if (!activeCourierRows.length) {
    return res.status(400).json({
      success: false,
      message: 'Selected courier is not registered or not active. Add/activate courier in Logistics first.'
    });
  }

  const trackingId = String((req.body && req.body.trackingId) || '').trim() || `TRK-${Math.floor(Math.random() * 900000)}`;

  const shipmentRows = await safeQuery(req.db, `SELECT id FROM shipments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [target.id]);
  if (shipmentRows.length) {
    await safeQuery(
      req.db,
      `UPDATE shipments SET courier_name = $2, tracking_number = $3, updated_at = NOW() WHERE id = $1`,
      [shipmentRows[0].id, courierName, trackingId]
    );
  } else {
    await safeQuery(
      req.db,
      `INSERT INTO shipments (order_id, courier_name, tracking_number, shipment_status, created_at, updated_at) VALUES ($1, $2, $3, 'pending', NOW(), NOW())`,
      [target.id, courierName, trackingId]
    );
  }

  await safeQuery(req.db, `UPDATE orders SET status = 'processing', updated_at = NOW() WHERE id = $1 AND status IN ('pending','confirmed','processing')`, [target.id]);
  await writeOrderAudit(req.db, target.id, `Courier assigned: ${courierName}, Tracking ID: ${trackingId}`);

  const order = await buildOrderDetail(req.db, req.params.orderId);
  return res.json({ success: true, data: order });
});

router.patch('/orders/:orderId/shipment', async (req, res) => {
  const target = await orderByNumber(req.db, req.params.orderId);
  if (!target) return res.status(404).json({ success: false, message: 'Order not found' });

  const shipmentRows = await safeQuery(req.db, `SELECT id FROM shipments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [target.id]);
  if (!shipmentRows.length) {
    await safeQuery(req.db, `INSERT INTO shipments (order_id, shipment_status, created_at, updated_at) VALUES ($1, 'pending', NOW(), NOW())`, [target.id]);
  }

  const currentShipment = (await safeQuery(req.db, `SELECT id FROM shipments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [target.id]))[0];

  if (req.body && req.body.trackingId) {
    await safeQuery(req.db, `UPDATE shipments SET tracking_number = $2, updated_at = NOW() WHERE id = $1`, [currentShipment.id, String(req.body.trackingId).trim()]);
  }

  if (req.body && req.body.shipmentStatus) {
    const dbShip = uiToDbShipmentStatus[req.body.shipmentStatus];
    if (!dbShip) {
      return res.status(400).json({ success: false, message: 'Invalid shipmentStatus value' });
    }

    const deliveredSql = dbShip === 'delivered' ? ', delivered_at = NOW()' : '';
    await safeQuery(
      req.db,
      `UPDATE shipments SET shipment_status = $2::shipment_status, updated_at = NOW() ${deliveredSql} WHERE id = $1`,
      [currentShipment.id, dbShip]
    );

    if (dbShip === 'packed') {
      await safeQuery(req.db, `UPDATE orders SET status = 'shipped', updated_at = NOW() WHERE id = $1`, [target.id]);
    }
    if (dbShip === 'out_for_delivery') {
      await safeQuery(req.db, `UPDATE orders SET status = 'shipped', updated_at = NOW() WHERE id = $1`, [target.id]);
    }

    await writeOrderAudit(req.db, target.id, `Shipment status updated to ${req.body.shipmentStatus}`);
  }

  if (req.body && req.body.markDelivered === true) {
    await safeQuery(req.db, `UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = $1`, [target.id]);
    await safeQuery(req.db, `UPDATE shipments SET shipment_status = 'delivered', delivered_at = NOW(), updated_at = NOW() WHERE id = $1`, [currentShipment.id]);
    await syncOrderPaymentStatusToPaid(req.db, target.id, 'delivered');
    await writeOrderAudit(req.db, target.id, 'Order marked Delivered by Admin');
  }

  if (req.body && req.body.markReturned === true) {
    const reason = req.body.reason || 'RTO update';
    await safeQuery(req.db, `UPDATE orders SET status = 'returned', updated_at = NOW() WHERE id = $1`, [target.id]);
    await safeQuery(req.db, `UPDATE shipments SET shipment_status = 'returned', updated_at = NOW() WHERE id = $1`, [currentShipment.id]);
  await safeQuery(req.db, `INSERT INTO shipment_events (shipment_id, event_code, event_label, payload) VALUES ($1, 'RTO', $2, jsonb_build_object('reason', $3))`, [currentShipment.id, 'RTO (Return to Origin)', reason]);
    await writeOrderAudit(req.db, target.id, `Order marked Returned. Reason: ${reason}`);
  }

  const order = await buildOrderDetail(req.db, req.params.orderId);
  return res.json({ success: true, data: order });
});

router.patch('/orders/:orderId/address', async (req, res) => {
  const target = await orderByNumber(req.db, req.params.orderId);
  if (!target) return res.status(404).json({ success: false, message: 'Order not found' });

  const customerAddress = String((req.body && req.body.customerAddress) || '').trim();
  if (!customerAddress) {
    return res.status(400).json({ success: false, message: 'customerAddress is required' });
  }

  await safeQuery(
    req.db,
    `
      UPDATE user_addresses ua
      SET line1 = $2, updated_at = NOW()
      WHERE ua.id = (SELECT shipping_address_id FROM orders WHERE id = $1)
    `,
    [target.id, customerAddress]
  );

  await writeOrderAudit(req.db, target.id, 'Customer address updated by Admin', { customerAddress });
  const order = await buildOrderDetail(req.db, req.params.orderId);
  return res.json({ success: true, data: order });
});

router.post('/orders/:orderId/notes', async (req, res) => {
  const target = await orderByNumber(req.db, req.params.orderId);
  if (!target) return res.status(404).json({ success: false, message: 'Order not found' });

  const note = String((req.body && req.body.note) || '').trim();
  if (!note) {
    return res.status(400).json({ success: false, message: 'note is required' });
  }

  await writeOrderAudit(req.db, target.id, `Internal Note: ${note}`, { note });
  return res.status(201).json({
    success: true,
    data: {
      at: new Date().toISOString().slice(0, 16).replace('T', ' '),
      by: 'Admin',
      note: `Internal Note: ${note}`
    }
  });
});

router.post('/orders/:orderId/actions/cod-received', async (req, res) => {
  const target = await orderByNumber(req.db, req.params.orderId);
  if (!target) return res.status(404).json({ success: false, message: 'Order not found' });

  const paymentRows = await safeQuery(req.db, `SELECT method FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [target.id]);
  const isCod = paymentRows.length && String(paymentRows[0].method || '').toUpperCase() === 'COD';
  if (!isCod) {
    return res.status(400).json({ success: false, message: 'COD action is only for COD orders' });
  }

  await safeQuery(
    req.db,
    `
      UPDATE payments
      SET status = 'paid', updated_at = NOW()
      WHERE id = (
        SELECT id FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1
      )
    `,
    [target.id]
  );

  await writeOrderAudit(req.db, target.id, 'COD cash receipt confirmed from courier');
  const order = await buildOrderDetail(req.db, req.params.orderId);
  return res.json({ success: true, data: { ...order, codReceived: true, paymentStatus: 'Paid' } });
});

router.post('/orders/:orderId/actions/settlement', async (req, res) => {
  const target = await orderByNumber(req.db, req.params.orderId);
  if (!target) return res.status(404).json({ success: false, message: 'Order not found' });

  const paymentRows = await safeQuery(req.db, `SELECT method FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [target.id]);
  const isCod = paymentRows.length && String(paymentRows[0].method || '').toUpperCase() === 'COD';
  if (!isCod) {
    return res.status(400).json({ success: false, message: 'Settlement action is only for COD orders' });
  }

  await writeOrderAudit(req.db, target.id, 'Seller settlement posted to wallet');
  const order = await buildOrderDetail(req.db, req.params.orderId);
  return res.json({ success: true, data: { ...order, settlementStatus: 'Paid', sellerSettlementDone: true } });
});

router.post('/orders/:orderId/actions/refund', async (req, res) => {
  const target = await orderByNumber(req.db, req.params.orderId);
  if (!target) return res.status(404).json({ success: false, message: 'Order not found' });

  await writeOrderAudit(req.db, target.id, 'Refund processed by Admin');
  const order = await buildOrderDetail(req.db, req.params.orderId);
  return res.json({ success: true, data: { ...order, settlementStatus: 'Adjusted' } });
});

router.post('/orders/:orderId/actions/reverse-earnings', async (req, res) => {
  const target = await orderByNumber(req.db, req.params.orderId);
  if (!target) return res.status(404).json({ success: false, message: 'Order not found' });

  await writeOrderAudit(req.db, target.id, 'Seller earnings reversed by Admin');
  const order = await buildOrderDetail(req.db, req.params.orderId);
  return res.json({ success: true, data: { ...order, settlementStatus: 'Adjusted' } });
});

router.post('/orders/:orderId/actions/adjust-inventory', async (req, res) => {
  const target = await orderByNumber(req.db, req.params.orderId);
  if (!target) return res.status(404).json({ success: false, message: 'Order not found' });

  await writeOrderAudit(req.db, target.id, 'Inventory adjusted after return/cancellation');
  const order = await buildOrderDetail(req.db, req.params.orderId);
  return res.json({ success: true, data: { ...order, inventoryAdjusted: true } });
});

module.exports = router;
