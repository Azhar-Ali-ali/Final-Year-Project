const express = require('express');

const router = express.Router();

const COURIER_ASSIGNED_STATUS = 'courier_assigned';
const commissionSettings = require('../../../admin_backend/src/data/commissionSettingsData');
const { getEarningsStatus, ensureSellerEarningsColumns } = require('./earningsUtils');

function getSellerId(req) {
  const raw = req.auth?.session?.userId || req.headers['x-seller-id'] || '';
  return String(raw).trim();
}

async function resolveSellerId(req) {
  const sellerId = getSellerId(req);
  return sellerId || null;
}

let cachedOrdersPaymentStatusColumn = null;
async function ordersTableHasPaymentStatus(req) {
  if (cachedOrdersPaymentStatusColumn !== null) {
    return cachedOrdersPaymentStatusColumn;
  }

  try {
    const result = await req.db.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'payment_status' LIMIT 1`
    );
    cachedOrdersPaymentStatusColumn = result.rows.length > 0;
  } catch (err) {
    cachedOrdersPaymentStatusColumn = false;
  }

  return cachedOrdersPaymentStatusColumn;
}

function mapUiStatus(dbStatus) {
  const value = String(dbStatus || '').toLowerCase();
  if (value === 'confirmed') return 'Confirmed';
  if (value === 'processing') return 'Packed';
  if (value === 'shipped') return 'Ready for Pickup';
  if (value === COURIER_ASSIGNED_STATUS) return 'Courier Assigned';
  if (value === 'delivered') return 'Delivered';
  if (value === 'cancelled') return 'Cancelled';
  if (value === 'refunded') return 'Refunded';
  if (value === 'returned') return 'Returned';
  return 'Pending';
}

function mapDbStatus(uiStatus) {
  const value = String(uiStatus || '').toLowerCase();
  if (value === 'confirmed') return 'confirmed';
  if (value === 'packed') return 'processing';
  if (value === 'ready for pickup') return COURIER_ASSIGNED_STATUS;
  if (value === 'courier assigned') return COURIER_ASSIGNED_STATUS;
  return 'pending';
}

function normalizeLocationValue(value) {
  return String(value || '').trim().toLowerCase();
}

function generateTrackingNumber(orderNumber) {
  const orderToken = String(orderNumber || '').replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase() || 'ORD';
  const randToken = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TRK-${orderToken}-${Date.now().toString().slice(-8)}-${randToken}`;
}

async function safeQuery(db, sql, params = []) {
  try {
    const result = await db.query(sql, params);
    return result.rows;
  } catch (error) {
    return [];
  }
}

async function ensureCourierAssignedSchema(req) {
  const enumRows = await safeQuery(
    req.db,
    `
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'order_status'
        AND e.enumlabel = $1
      LIMIT 1
    `,
    [COURIER_ASSIGNED_STATUS]
  );

  if (!enumRows.length) {
    await req.db.query(`ALTER TYPE order_status ADD VALUE '${COURIER_ASSIGNED_STATUS}'`);
  }

  await safeQuery(
    req.db,
    `
      ALTER TABLE IF EXISTS orders
        ADD COLUMN IF NOT EXISTS assigned_courier_id UUID REFERENCES couriers(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS assigned_courier_name TEXT,
        ADD COLUMN IF NOT EXISTS tracking_number TEXT
    `
  );
}

async function findAutoAssignmentCandidate(req, state, city) {
  const rows = await safeQuery(
    req.db,
    `
      SELECT
        sr.id AS shipping_rule_id,
        sr.state,
        sr.city,
        sr.priority,
        sr.created_at,
        c.id AS courier_id,
        c.name AS courier_name,
        c.service_states,
        c.service_cities
      FROM shipping_rules sr
      JOIN couriers c ON c.id = sr.courier_id
      WHERE sr.status = 'Active'
        AND c.is_active = TRUE
      ORDER BY COALESCE(sr.priority, 999) ASC, sr.created_at ASC
    `
  );

  const normalizedState = normalizeLocationValue(state);
  const normalizedCity = normalizeLocationValue(city);

  const matchedRule = rows
    .filter((row) => {
      const ruleState = normalizeLocationValue(row.state);
      const ruleCity = normalizeLocationValue(row.city);
      const courierStates = normalizeLocationValue(row.service_states);
      const courierCities = normalizeLocationValue(row.service_cities);

      const stateMatch = ruleState === 'all' || ruleState === normalizedState || courierStates.includes(normalizedState);
      const cityMatch = ruleCity === 'all' || ruleCity === normalizedCity || courierCities.includes(normalizedCity);
      return stateMatch && cityMatch;
    })
    .sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999))[0] || null;

  if (matchedRule) return matchedRule;

  const fallbackRows = await safeQuery(
    req.db,
    `
      SELECT
        c.id AS courier_id,
        c.name AS courier_name,
        c.service_states,
        c.service_cities,
        c.created_at
      FROM couriers c
      WHERE c.is_active = TRUE
      ORDER BY c.created_at ASC
    `
  );

  return fallbackRows.find((row) => {
    const courierStates = normalizeLocationValue(row.service_states);
    const courierCities = normalizeLocationValue(row.service_cities);
    return (
      courierStates.includes(normalizedState) ||
      courierCities.includes(normalizedCity) ||
      courierStates === 'all' ||
      courierCities === 'all'
    );
  }) || fallbackRows[0] || null;
}

async function findShippingCharge(req, state, city) {
  const rows = await safeQuery(
    req.db,
    `
      SELECT shipping_fee
      FROM shipping_charges
      WHERE (LOWER(COALESCE(state, '')) = LOWER($1) OR LOWER(COALESCE(state, '')) = 'all')
        AND (LOWER(COALESCE(city, '')) = LOWER($2) OR LOWER(COALESCE(city, '')) = 'all')
      ORDER BY
        CASE WHEN LOWER(COALESCE(state, '')) = LOWER($1) THEN 0 ELSE 1 END,
        CASE WHEN LOWER(COALESCE(city, '')) = LOWER($2) THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 1
    `,
    [state, city]
  );

  return rows[0] ? Number(rows[0].shipping_fee || 0) : 0;
}

function mapPaymentLabel(method) {
  const value = String(method || '').toLowerCase();
  if (!value) return 'COD';
  if (value.includes('cash') || value.includes('cod')) return 'COD';
  return 'Online';
}

function mapPaymentStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'paid' || value === 'authorized' || value === 'completed' || value === 'settled') return 'Paid';
  if (value === 'unpaid' || value === 'pending' || value === 'not_paid') return 'Unpaid';
  if (value === 'failed') return 'Failed';
  if (value === 'refunded' || value === 'partially_refunded') return 'Refunded';
  return 'Unpaid';
}

function mapShipmentStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'packed') return 'Packed';
  if (value === 'in_transit') return 'In Transit';
  if (value === 'out_for_delivery') return 'Out for Delivery';
  if (value === 'delivered') return 'Delivered';
  if (value === 'failed') return 'Delivery Failed';
  return 'Pending';
}

function parseAddress(row) {
  if (!row) {
    return {
      address: '-',
      city: '-',
      postal: '-'
    };
  }

  const line2 = row.line2 ? `, ${row.line2}` : '';
  return {
    address: `${row.line1 || ''}${line2}`.trim() || '-',
    city: row.city || '-',
    postal: row.postal_code || '-'
  };
}

function buildSellerOrderBaseQuery(sellerId, filters = {}) {
  const params = [sellerId];
  const where = ['oi.seller_id = $1'];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`(
      o.order_number ILIKE $${params.length} OR
      u.full_name ILIKE $${params.length} OR
      COALESCE(u.email, '') ILIKE $${params.length} OR
      COALESCE(ua.city, '') ILIKE $${params.length}
    )`);
  }

  if (filters.status) {
    params.push(mapDbStatus(filters.status));
    where.push(`o.status::text = $${params.length}`);
  }

  if (filters.payment) {
    params.push(String(filters.payment).toLowerCase());
    where.push(`CASE WHEN LOWER(COALESCE(pay.method, '')) LIKE '%cash%' OR LOWER(COALESCE(pay.method, '')) LIKE '%cod%' THEN 'cod' ELSE 'online' END = $${params.length}`);
  }

  if (filters.city) {
    params.push(filters.city);
    where.push(`COALESCE(ua.city, '') = $${params.length}`);
  }

  return { params, where };
}

async function fetchSellerOrders(req, sellerId, filters = {}) {
  const { params, where } = buildSellerOrderBaseQuery(sellerId, filters);

  const page = Math.max(parseInt(filters.page || '1', 10), 1);
  const pageSize = Math.max(parseInt(filters.pageSize || '10', 10), 1);
  const offset = (page - 1) * pageSize;

  const countSql = `
    WITH seller_orders AS (
      SELECT DISTINCT
        o.id,
        o.order_number,
        o.customer_id,
        o.shipping_address_id,
        o.status,
        to_jsonb(o)->>'payment_status' AS order_payment_status,
        o.placed_at,
        SUM(oi.line_total)::numeric AS seller_subtotal,
        SUM(COALESCE(oi.commission_amount, 0))::numeric AS commission_amount,
        SUM(COALESCE(oi.line_total, 0) - COALESCE(oi.commission_amount, 0))::numeric AS seller_earning
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      LEFT JOIN LATERAL (
        SELECT *
        FROM public.user_addresses
        WHERE id = o.shipping_address_id
        LIMIT 1
      ) ua ON true
      LEFT JOIN LATERAL (
        SELECT *
        FROM public.payments
        WHERE order_id = o.id
        ORDER BY created_at DESC
        LIMIT 1
      ) pay ON true
      WHERE ${where.join(' AND ')}
      GROUP BY o.id, o.order_number, o.customer_id, o.shipping_address_id, o.status, o.placed_at
    )
    SELECT COUNT(*)::int AS total FROM seller_orders
  `;

  const dataParams = [...params, pageSize, offset];
  const dataSql = `
    WITH seller_orders AS (
      SELECT
        o.id,
        o.order_number,
        o.customer_id,
        o.shipping_address_id,
        o.status,
        to_jsonb(o)->>'payment_status' AS order_payment_status,
        o.placed_at,
        SUM(oi.line_total)::numeric AS seller_subtotal,
        SUM(COALESCE(oi.commission_amount, 0))::numeric AS commission_amount,
        SUM(COALESCE(oi.line_total, 0) - COALESCE(oi.commission_amount, 0))::numeric AS seller_earning
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      LEFT JOIN LATERAL (
        SELECT *
        FROM public.user_addresses
        WHERE id = o.shipping_address_id
        LIMIT 1
      ) ua ON true
      LEFT JOIN LATERAL (
        SELECT *
        FROM public.payments
        WHERE order_id = o.id
        ORDER BY created_at DESC
        LIMIT 1
      ) pay ON true
      WHERE ${where.join(' AND ')}
      GROUP BY o.id, o.order_number, o.customer_id, o.shipping_address_id, o.status, o.placed_at
    )
    SELECT
      so.id,
      so.order_number,
      so.status AS db_status,
      so.placed_at,
      so.seller_subtotal,
      u.full_name,
      u.phone,
      u.email,
      COALESCE(ua.city, '-') AS city,
      COALESCE(ua.postal_code, '-') AS postal_code,
      COALESCE(pay.method, '') AS payment_method,
      COALESCE(so.order_payment_status, pay.status::text, 'pending') AS payment_status,
      so.commission_amount,
      so.seller_earning,
      COALESCE(ship.courier_name, '') AS courier_name,
      COALESCE(ship.tracking_number, '') AS tracking_number,
      COALESCE(ship.shipment_status::text, 'pending') AS shipment_status,
      COALESCE(ua.line1, '') AS line1,
      COALESCE(ua.line2, '') AS line2
    FROM seller_orders so
    JOIN public.users u ON u.id = so.customer_id
    LEFT JOIN LATERAL (
      SELECT *
      FROM public.user_addresses
      WHERE id = so.shipping_address_id
      LIMIT 1
    ) ua ON true
    LEFT JOIN LATERAL (
      SELECT *
      FROM public.payments
      WHERE order_id = so.id
      ORDER BY created_at DESC
      LIMIT 1
    ) pay ON true
    LEFT JOIN LATERAL (
      SELECT *
      FROM public.shipments
      WHERE order_id = so.id
      ORDER BY created_at DESC
      LIMIT 1
    ) ship ON true
    ORDER BY so.placed_at DESC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  const [countResult, dataResult] = await Promise.all([
    req.db.query(countSql, params),
    req.db.query(dataSql, dataParams)
  ]);

  return {
    totalItems: countResult.rows[0]?.total || 0,
    rows: dataResult.rows,
    page,
    pageSize
  };
}

function mapOrderRow(row, commissionFraction = 0) {
  const address = parseAddress(row);
  const subtotal = Number(row.seller_subtotal || 0);
  const commissionAmount = Number(row.commission_amount || 0);
  const sellerEarning = Number(row.seller_earning || Number((subtotal - commissionAmount).toFixed(2)) || 0);
  const earningsStatus = getEarningsStatus({
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    orderStatus: row.db_status
  });

  return {
    id: row.order_number,
    dbId: row.id,
    customer: row.full_name || row.email || 'Customer',
    phone: row.phone || '-',
    email: row.email || '-',
    address: address.address,
    city: address.city,
    postal: address.postal,
    paymentType: mapPaymentLabel(row.payment_method),
    paymentMethod: mapPaymentLabel(row.payment_method),
    paymentStatus: mapPaymentStatus(row.payment_status),
    status: mapUiStatus(row.db_status),
    orderStatus: mapUiStatus(row.db_status),
    date: row.placed_at,
    subtotal: Number(subtotal.toFixed(2)),
    commission: Number(commissionAmount.toFixed(2)),
    commissionAmount: Number(commissionAmount.toFixed(2)),
    earnings: Number(sellerEarning.toFixed(2)),
    sellerEarning: Number(sellerEarning.toFixed(2)),
    earningsStatus,
    courier: row.courier_name || null,
    tracking: row.tracking_number || null,
    deliveryStatus: mapShipmentStatus(row.shipment_status),
    notes: ''
  };
}

// GET /api/seller/orders/overview
router.get('/overview', async (req, res) => {
  try {
    await ensureSellerEarningsColumns(req);
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE o.status = 'pending')::int AS pending_count,
          COUNT(*) FILTER (WHERE o.status = 'confirmed')::int AS confirmed_count,
          COUNT(*) FILTER (WHERE o.status = 'processing')::int AS packed_count,
          COUNT(*) FILTER (WHERE o.status = 'shipped')::int AS ready_count,
          COUNT(DISTINCT o.id)::int AS total_orders,
          COALESCE(SUM(oi.line_total) FILTER (WHERE COALESCE(to_jsonb(o)->>'payment_status', 'pending') <> 'pending'), 0)::numeric AS total_revenue
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE oi.seller_id = $1
      `,
      [sellerId]
    );

    const row = result.rows[0] || {};
    const fraction = (await commissionSettings.getCommissionSettings(req.db)).commissionRate / 100;
    const totalRevenue = Number(row.total_revenue || 0);
    const totalCommission = Number((totalRevenue * fraction).toFixed(2));
    const totalEarnings = Number((totalRevenue - totalCommission).toFixed(2));

    return res.json({
      success: true,
      data: {
        pendingCount: Number(row.pending_count || 0),
        confirmedCount: Number(row.confirmed_count || 0),
        packedCount: Number(row.packed_count || 0),
        readyCount: Number(row.ready_count || 0),
        totalOrders: Number(row.total_orders || 0),
        totalRevenue: totalRevenue.toFixed(2),
        totalEarnings: totalEarnings.toFixed(2),
        totalCommission: totalCommission.toFixed(2)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch overview', error: error.message });
  }
});

// GET /api/seller/orders/filter/cities
router.get('/filter/cities', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        SELECT DISTINCT COALESCE(ua.city, '') AS city
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        LEFT JOIN LATERAL (
          SELECT *
          FROM public.user_addresses
          WHERE id = o.shipping_address_id
          LIMIT 1
        ) ua ON true
        WHERE oi.seller_id = $1
          AND COALESCE(ua.city, '') <> ''
        ORDER BY city ASC
      `,
      [sellerId]
    );

    return res.json({ success: true, data: result.rows.map((row) => row.city) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch cities', error: error.message });
  }
});

// GET /api/seller/orders/filter/by-status/:status
router.get('/filter/by-status/:status', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const status = String(req.params.status || '').trim();
    const orders = await fetchSellerOrders(req, sellerId, { status: mapDbStatus(status), page: 1, pageSize: 1000 });
    const fraction = (await commissionSettings.getCommissionSettings(req.db)).commissionRate / 100;
    return res.json({ success: true, data: orders.rows.map((r) => mapOrderRow(r, fraction)), count: orders.rows.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch orders by status', error: error.message });
  }
});

// GET /api/seller/orders/stats/detailed
router.get('/stats/detailed', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        SELECT
          o.status::text AS status,
          COUNT(DISTINCT o.id)::int AS count,
          COALESCE(SUM(oi.line_total), 0)::numeric AS revenue
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE oi.seller_id = $1
        GROUP BY o.status
      `,
      [sellerId]
    );

    return res.json({
      success: true,
      data: {
        byStatus: result.rows.reduce((acc, row) => {
          acc[mapUiStatus(row.status)] = {
            count: Number(row.count || 0),
            revenue: Number(row.revenue || 0).toFixed(2)
          };
          return acc;
        }, {})
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch order statistics', error: error.message });
  }
});

// GET /api/seller/orders
router.get('/', async (req, res) => {
  try {
    await ensureSellerEarningsColumns(req);
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const { search = '', status = '', payment = '', city = '', page = '1', pageSize = '10' } = req.query;
    const result = await fetchSellerOrders(req, sellerId, { search, status, payment, city, page, pageSize });
    const fraction = (await commissionSettings.getCommissionSettings(req.db)).commissionRate / 100;
    return res.json({
      success: true,
      data: result.rows.map((r) => mapOrderRow(r, fraction)),
      pagination: {
        currentPage: result.page,
        pageSize: result.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / result.pageSize)
      }
    });
  } catch (error) {
    console.error('[SellerOrders] Failed to fetch orders', { sellerId, query: req.query, error });
    return res.status(500).json({ success: false, message: 'Failed to fetch orders', error: error.message });
  }
});

// GET /api/seller/orders/:orderId
router.get('/:orderId', async (req, res) => {
  try {
    await ensureSellerEarningsColumns(req);
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const orderId = String(req.params.orderId || '').trim();
    const result = await req.db.query(
      `
        SELECT
          o.id,
          o.order_number,
          o.status AS db_status,
          o.placed_at,
          o.customer_id,
          o.shipping_address_id,
          COALESCE(SUM(oi.line_total), 0)::numeric AS seller_subtotal,
          COALESCE(SUM(oi.commission_amount), 0)::numeric AS commission_amount,
          COALESCE(SUM(COALESCE(oi.line_total, 0) - COALESCE(oi.commission_amount, 0)), 0)::numeric AS seller_earning,
          u.full_name,
          u.phone,
          u.email,
          COALESCE(ua.line1, '') AS line1,
          COALESCE(ua.line2, '') AS line2,
          COALESCE(ua.city, '-') AS city,
          COALESCE(ua.postal_code, '-') AS postal_code,
          COALESCE(pay.method, '') AS payment_method,
          COALESCE(to_jsonb(o)->>'payment_status', pay.status::text, 'pending') AS payment_status,
          COALESCE(ship.courier_name, '') AS courier_name,
          COALESCE(ship.tracking_number, '') AS tracking_number,
          COALESCE(ship.shipment_status::text, 'pending') AS shipment_status
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        JOIN public.users u ON u.id = o.customer_id
        LEFT JOIN LATERAL (
          SELECT *
          FROM public.user_addresses
          WHERE id = o.shipping_address_id
          LIMIT 1
        ) ua ON true
        LEFT JOIN LATERAL (
          SELECT *
          FROM public.payments
          WHERE order_id = o.id
          ORDER BY created_at DESC
          LIMIT 1
        ) pay ON true
        LEFT JOIN LATERAL (
          SELECT *
          FROM public.shipments
          WHERE order_id = o.id
          ORDER BY created_at DESC
          LIMIT 1
        ) ship ON true
        WHERE oi.seller_id = $1
          AND (o.id::text = $2 OR o.order_number = $2)
        GROUP BY o.id, o.order_number, o.status, o.placed_at, o.customer_id, o.shipping_address_id, u.full_name, u.phone, u.email, ua.line1, ua.line2, ua.city, ua.postal_code, pay.method, pay.status, ship.courier_name, ship.tracking_number, ship.shipment_status
        LIMIT 1
      `,
      [sellerId, orderId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const row = result.rows[0];
    const address = parseAddress(row);

    const productsResult = await req.db.query(
      `
        SELECT
          oi.product_name,
          COALESCE(oi.sku, '') AS sku,
          oi.quantity,
          oi.unit_price
        FROM public.order_items oi
        WHERE oi.seller_id = $1
          AND oi.order_id = $2
        ORDER BY oi.created_at ASC
      `,
      [sellerId, row.id]
    );

    const subtotal = Number(row.seller_subtotal || 0);
    const commission = Number(row.commission_amount || 0);
    const earnings = Number(row.seller_earning || Number((subtotal - commission).toFixed(2)) || 0);
    const earningsStatus = getEarningsStatus({
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      orderStatus: row.db_status
    });

    return res.json({
      success: true,
      data: {
        id: row.order_number,
        dbId: row.id,
        customer: row.full_name || row.email || 'Customer',
        phone: row.phone || '-',
        email: row.email || '-',
        address: address.address,
        city: address.city,
        postal: address.postal,
        paymentType: mapPaymentLabel(row.payment_method),
        paymentStatus: mapPaymentStatus(row.payment_status),
        status: mapUiStatus(row.db_status),
        date: row.placed_at,
        products: productsResult.rows.map((product) => ({
          name: product.product_name,
          sku: product.sku || '-',
          qty: Number(product.quantity || 0),
          price: Number(product.unit_price || 0)
        })),
        subtotal: Number(subtotal.toFixed(2)),
        commission: Number(commission.toFixed(2)),
        commissionAmount: Number(commission.toFixed(2)),
        earnings: Number(earnings.toFixed(2)),
        sellerEarning: Number(earnings.toFixed(2)),
        earningsStatus,
        courier: row.courier_name || null,
        tracking: row.tracking_number || null,
        deliveryStatus: mapShipmentStatus(row.shipment_status),
        notes: ''
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch order', error: error.message });
  }
});

// PUT /api/seller/orders/:orderId/status
router.put('/:orderId/status', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const orderId = String(req.params.orderId || '').trim();
    const status = String(req.body.status || '').trim();

    const currentResult = await req.db.query(
      `
        SELECT o.id, o.status AS db_status, o.order_number
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE oi.seller_id = $1
          AND (o.id::text = $2 OR o.order_number = $2)
        GROUP BY o.id, o.status, o.order_number
        LIMIT 1
      `,
      [sellerId, orderId]
    );

    if (!currentResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const current = currentResult.rows[0];
    const currentUiStatus = mapUiStatus(current.db_status);
    const nextMap = {
      Pending: 'Confirmed',
      Confirmed: 'Packed',
      Packed: 'Ready for Pickup'
    };

    if (nextMap[currentUiStatus] !== status) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition. Expected: ${nextMap[currentUiStatus] || 'No further transitions'}`,
        currentStatus: currentUiStatus,
        allowedNextStatus: nextMap[currentUiStatus] || null
      });
    }

    if (status === 'Confirmed') {
      const dbStatus = mapDbStatus(status);
      await req.db.query(
        `
          UPDATE public.orders
          SET status = $1,
              updated_at = NOW()
          WHERE id = $2
        `,
        [dbStatus, current.id]
      );
    } else if (status === 'Packed' || status === 'Ready for Pickup') {
      if (status === 'Packed') {
        const dbStatus = mapDbStatus(status);
        await req.db.query(
          `
            UPDATE public.orders
            SET status = $1,
                updated_at = NOW()
            WHERE id = $2
          `,
          [mapDbStatus(status), current.id]
        );
      } else {
        await ensureCourierAssignedSchema(req);

        const addressResult = await req.db.query(
          `
            SELECT
              COALESCE(ua.state, '') AS state,
              COALESCE(ua.city, '') AS city
            FROM public.orders o
            LEFT JOIN public.user_addresses ua ON ua.id = o.shipping_address_id
            WHERE o.id = $1
            LIMIT 1
          `,
          [current.id]
        );

        const address = addressResult.rows[0] || { state: '', city: '' };
        const assignmentRule = await findAutoAssignmentCandidate(req, address.state, address.city);

        if (!assignmentRule) {
          return res.status(409).json({
            success: false,
            message: 'No active courier serves the selected location'
          });
        }

        const trackingId = generateTrackingNumber(current.order_number);
        const shippingFee = await findShippingCharge(req, address.state, address.city);

        const courierName = assignmentRule.courier_name;

        const shipmentRows = await req.db.query(
          `
            INSERT INTO public.shipments (order_id, courier_name, tracking_number, shipment_status, courier_id, shipped_at, created_at, updated_at)
            VALUES ($1, $2, $3, 'pending', $4, NOW(), NOW(), NOW())
            RETURNING id, shipment_status, shipped_at, delivered_at
          `,
          [current.id, courierName, trackingId, assignmentRule.courier_id]
        );

        await req.db.query(
          `
            INSERT INTO public.assignments (order_id, courier_id, tracking_number, assignment_status, created_at, updated_at)
            VALUES ($1, $2, $3, 'assigned', NOW(), NOW())
          `,
          [current.id, assignmentRule.courier_id, trackingId]
        );

        await req.db.query(
          `
            UPDATE public.orders
            SET status = $4,
                assigned_courier_id = $1,
                assigned_courier_name = $2,
                tracking_number = $3,
                updated_at = NOW()
            WHERE id = $5
          `,
          [assignmentRule.courier_id, courierName, trackingId, COURIER_ASSIGNED_STATUS, current.id]
        );

        if (await ordersTableHasPaymentStatus(req)) {
          await req.db.query(
            `UPDATE public.orders SET payment_status = COALESCE(payment_status, 'pending'), updated_at = NOW() WHERE id = $1`,
            [current.id]
          );
        }

        await req.db.query(
          `INSERT INTO public.audit_logs (entity_type, entity_id, action, after_data, created_at) VALUES ('order', $1, 'Courier assigned automatically', $2, NOW())`,
          [current.id, JSON.stringify({ courier: courierName, trackingId, shippingFee, state: address.state, city: address.city })]
        );

        current.assigned_courier_id = assignmentRule.courier_id;
        current.assigned_courier_name = courierName;
        current.tracking_number = trackingId;
        current.status = COURIER_ASSIGNED_STATUS;
        current.shipment_status = shipmentRows.rows[0]?.shipment_status || 'pending';
      }
    }

    const updated = await req.db.query(
      `
        SELECT
          o.id,
          o.order_number,
          o.status AS db_status,
          o.placed_at,
          COALESCE(SUM(oi.line_total), 0)::numeric AS seller_subtotal,
          u.full_name,
          u.phone,
          u.email,
          COALESCE(ua.line1, '') AS line1,
          COALESCE(ua.line2, '') AS line2,
          COALESCE(ua.city, '-') AS city,
          COALESCE(ua.postal_code, '-') AS postal_code,
          COALESCE(pay.method, '') AS payment_method,
          COALESCE(to_jsonb(o)->>'payment_status', pay.status::text, 'pending') AS payment_status,
          COALESCE(ship.courier_name, '') AS courier_name,
          COALESCE(ship.tracking_number, '') AS tracking_number,
          COALESCE(ship.shipment_status::text, 'pending') AS shipment_status
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        JOIN public.users u ON u.id = o.customer_id
        LEFT JOIN LATERAL (
          SELECT *
          FROM public.user_addresses
          WHERE id = o.shipping_address_id
          LIMIT 1
        ) ua ON true
        LEFT JOIN LATERAL (
          SELECT *
          FROM public.payments
          WHERE order_id = o.id
          ORDER BY created_at DESC
          LIMIT 1
        ) pay ON true
        LEFT JOIN LATERAL (
          SELECT *
          FROM public.shipments
          WHERE order_id = o.id
          ORDER BY created_at DESC
          LIMIT 1
        ) ship ON true
        WHERE oi.seller_id = $1
          AND o.id = $2
        GROUP BY o.id, o.order_number, o.status, o.placed_at, u.full_name, u.phone, u.email, ua.line1, ua.line2, ua.city, ua.postal_code, pay.method, pay.status, ship.courier_name, ship.tracking_number, ship.shipment_status
        LIMIT 1
      `,
      [sellerId, current.id]
    );

    const fraction = (await commissionSettings.getCommissionSettings(req.db)).commissionRate / 100;
    return res.json({
      success: true,
      message: 'Order status updated successfully',
      data: updated.rows[0] ? mapOrderRow(updated.rows[0], fraction) : { status }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update order status', error: error.message });
  }
});

module.exports = router;


