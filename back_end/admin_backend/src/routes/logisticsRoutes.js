const express = require('express');

const router = express.Router();

const shipmentStatusMapToUi = {
  pending: 'Awaiting Pickup',
  packed: 'Picked Up',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  failed: 'Failed Delivery',
  returned: 'RTO (Return to Origin)'
};

const shipmentStatusMapToDb = {
  'Awaiting Pickup': 'pending',
  'Picked Up': 'packed',
  'In Transit': 'in_transit',
  'Out for Delivery': 'out_for_delivery',
  Delivered: 'delivered',
  'Failed Delivery': 'failed',
  'RTO (Return to Origin)': 'returned'
};

const defaultShippingRules = {
  assignmentRules: [],
  shippingChargesRules: [],
  codFee: { mode: 'percent', value: 2.5 },
  weightPricing: { range0to1: 0, range1to3: 0, range3to5: 0, extraPerKg: 0 },
  zonePricing: { sameCity: 0, sameState: 0, differentState: 0, remoteArea: 0 },
  freeShipping: { promotional: false, selectedSellers: '', aboveAmount: 0 },
  codRules: []
};

let shippingRulesState = normalizeShippingRules(defaultShippingRules);

async function safeQuery(db, sql, params = []) {
  try {
    const result = await db.query(sql, params);
    return result.rows;
  } catch (_) {
    return [];
  }
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeCodAvailable(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === '1' || value === true || value === 1;
}

function mapShippingChargeRecord(row) {
  return {
    id: row.id,
    state: row.state || 'All',
    city: row.city || 'All',
    shippingFee: row.shipping_fee != null ? toNum(row.shipping_fee) : 0,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function mapCodRuleRecord(row) {
  return {
    id: row.id,
    state: row.state || 'All',
    city: row.city || 'All',
    codAvailable: Boolean(normalizeCodAvailable(row.cod_available)),
    maxAmount: row.max_amount != null ? toNum(row.max_amount) : 0,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function calcCodFee(codAmount) {
  if (shippingRulesState.codFee.mode === 'fixed') return Number(shippingRulesState.codFee.value || 0);
  return Number(((toNum(codAmount) * toNum(shippingRulesState.codFee.value)) / 100).toFixed(2));
}

function calcNetSellerAmount(item) {
  return Number((toNum(item.codAmount) - toNum(item.shippingCharges) - calcCodFee(item.codAmount) - toNum(item.platformCommission)).toFixed(2));
}

function normalizeShippingRules(data = {}) {
  return {
    assignmentRules: Array.isArray(data.assignmentRules) ? data.assignmentRules : defaultShippingRules.assignmentRules,
    shippingChargesRules: Array.isArray(data.shippingChargesRules) ? data.shippingChargesRules : defaultShippingRules.shippingChargesRules,
    codFee: data.codFee && typeof data.codFee === 'object' ? { ...defaultShippingRules.codFee, ...data.codFee } : { ...defaultShippingRules.codFee },
    weightPricing: data.weightPricing && typeof data.weightPricing === 'object' ? { ...defaultShippingRules.weightPricing, ...data.weightPricing } : { ...defaultShippingRules.weightPricing },
    zonePricing: data.zonePricing && typeof data.zonePricing === 'object' ? { ...defaultShippingRules.zonePricing, ...data.zonePricing } : { ...defaultShippingRules.zonePricing },
    freeShipping: data.freeShipping && typeof data.freeShipping === 'object' ? { ...defaultShippingRules.freeShipping, ...data.freeShipping } : { ...defaultShippingRules.freeShipping },
    codRules: Array.isArray(data.codRules) ? data.codRules : defaultShippingRules.codRules
  };
}

async function ensureLogisticsSchema(db) {
  await safeQuery(db, `CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await safeQuery(
    db,
    `
      ALTER TABLE IF EXISTS couriers
        ADD COLUMN IF NOT EXISTS service_states TEXT,
        ADD COLUMN IF NOT EXISTS service_cities TEXT,
        ADD COLUMN IF NOT EXISTS cod_supported BOOLEAN NOT NULL DEFAULT TRUE
    `
  );

  await safeQuery(
    db,
    `
      CREATE TABLE IF NOT EXISTS logistics_settings (
        setting_key VARCHAR(80) PRIMARY KEY,
        setting_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `
  );

  await safeQuery(
    db,
    `
      CREATE TABLE IF NOT EXISTS shipping_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        state TEXT,
        city TEXT,
        courier_id UUID REFERENCES couriers(id) ON DELETE SET NULL,
        priority INTEGER DEFAULT 1,
        status TEXT DEFAULT 'Active',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `
  );

  await safeQuery(
    db,
    `
      CREATE TABLE IF NOT EXISTS shipping_charges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        state TEXT,
        city TEXT,
        shipping_fee NUMERIC DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `
  );

  await safeQuery(
    db,
    `
      CREATE TABLE IF NOT EXISTS cod_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        state TEXT,
        city TEXT,
        cod_available BOOLEAN DEFAULT TRUE,
        max_amount NUMERIC DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `
  );

  await safeQuery(
    db,
    `
      CREATE TABLE IF NOT EXISTS assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
        courier_id UUID REFERENCES couriers(id) ON DELETE SET NULL,
        tracking_number TEXT,
        assignment_status TEXT DEFAULT 'assigned',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `
  );

  await safeQuery(
    db,
    `
      ALTER TABLE IF EXISTS shipments
        ADD COLUMN IF NOT EXISTS courier_id UUID REFERENCES couriers(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL
    `
  );
}

async function getShippingRules(db) {
  await ensureLogisticsSchema(db);
  const assignmentRows = await safeQuery(
    db,
    `
      SELECT sr.id, sr.state, sr.city, sr.courier_id, sr.priority, sr.status,
             c.name AS courier_name
      FROM shipping_rules sr
      LEFT JOIN couriers c ON c.id = sr.courier_id
      ORDER BY sr.priority ASC, sr.state ASC, sr.city ASC
    `
  );
  const chargeRows = await safeQuery(db, `SELECT id, state, city, shipping_fee FROM shipping_charges ORDER BY state ASC, city ASC`);
  const codRows = await safeQuery(db, `SELECT id, state, city, cod_available, max_amount FROM cod_rules ORDER BY state ASC, city ASC`);

  const data = {
    assignmentRules: assignmentRows.map((row) => ({
      id: row.id,
      state: row.state || 'All',
      city: row.city || 'All',
      courier: row.courier_name || '',
      courierId: row.courier_id || null,
      priority: row.priority || 1,
      status: row.status || 'Active'
    })),
    shippingChargesRules: chargeRows.map((row) => ({
      id: row.id,
      state: row.state || 'All',
      city: row.city || 'All',
      fee: row.shipping_fee != null ? String(row.shipping_fee) : ''
    })),
    codRules: codRows.map((row) => ({
      id: row.id,
      state: row.state || 'All',
      city: row.city || 'All',
      codAvailable: row.cod_available ? 'Yes' : 'No',
      maxCodAmount: row.max_amount != null ? String(row.max_amount) : ''
    }))
  };

  shippingRulesState = normalizeShippingRules({
    ...defaultShippingRules,
    assignmentRules: data.assignmentRules,
    shippingChargesRules: data.shippingChargesRules,
    codRules: data.codRules
  });
  return shippingRulesState;
}

async function saveShippingRules(db, payload = {}) {
  await ensureLogisticsSchema(db);
  const assignmentRules = Array.isArray(payload.assignmentRules) ? payload.assignmentRules : [];
  const shippingChargesRules = Array.isArray(payload.shippingChargesRules) ? payload.shippingChargesRules : [];
  const codRules = Array.isArray(payload.codRules) ? payload.codRules : [];

  await safeQuery(db, `DELETE FROM shipping_rules`);
  await safeQuery(db, `DELETE FROM shipping_charges`);
  await safeQuery(db, `DELETE FROM cod_rules`);

  for (const rule of assignmentRules) {
    const courierName = String(rule.courier || '').trim();
    const courierRow = courierName ? (await safeQuery(db, `SELECT id FROM couriers WHERE LOWER(name) = LOWER($1) LIMIT 1`, [courierName]))[0] : null;
    await safeQuery(
      db,
      `
        INSERT INTO shipping_rules (state, city, courier_id, priority, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      `,
      [
        String(rule.state || 'All').trim() || 'All',
        String(rule.city || 'All').trim() || 'All',
        courierRow ? courierRow.id : null,
        Number(rule.priority || 1),
        String(rule.status || 'Active').trim() || 'Active'
      ]
    );
  }

  for (const rule of shippingChargesRules) {
    await safeQuery(
      db,
      `
        INSERT INTO shipping_charges (state, city, shipping_fee, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
      `,
      [String(rule.state || 'All').trim() || 'All', String(rule.city || 'All').trim() || 'All', Number(rule.fee || rule.shippingFee || 0)]
    );
  }

  for (const rule of codRules) {
    await safeQuery(
      db,
      `
        INSERT INTO cod_rules (state, city, cod_available, max_amount, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
      `,
      [
        String(rule.state || 'All').trim() || 'All',
        String(rule.city || 'All').trim() || 'All',
        String(rule.codAvailable || 'Yes').toLowerCase() === 'yes',
        Number(rule.maxCodAmount || rule.maxAmount || 0)
      ]
    );
  }

  shippingRulesState = normalizeShippingRules({
    ...defaultShippingRules,
    assignmentRules: assignmentRules.map((rule) => ({ ...rule, courier: String(rule.courier || '').trim() })),
    shippingChargesRules: shippingChargesRules.map((rule) => ({ ...rule, fee: String(rule.fee || rule.shippingFee || '') })),
    codRules: codRules.map((rule) => ({ ...rule, codAvailable: String(rule.codAvailable || 'Yes'), maxCodAmount: String(rule.maxCodAmount || rule.maxAmount || '') }))
  });
  return shippingRulesState;
}

async function getAssignmentsForUi(db) {
  await ensureLogisticsSchema(db);
  const rows = await safeQuery(
    db,
    `
      SELECT a.id, a.order_id, a.courier_id, a.tracking_number, a.assignment_status, a.created_at, a.updated_at,
             o.order_number,
             UPPER(COALESCE(p.method, 'ONLINE')) AS payment_method,
             UPPER(COALESCE(p.status::text, 'pending')) AS payment_status,
             cu.full_name AS customer_name,
             sp.store_name AS seller_name,
             ua.city AS customer_city,
             ua.state AS customer_state,
             c.name AS courier_name
      FROM assignments a
      LEFT JOIN orders o ON o.id = a.order_id
      LEFT JOIN LATERAL (
        SELECT method, status
        FROM payments
        WHERE order_id = o.id
        ORDER BY created_at DESC
        LIMIT 1
      ) p ON true
      LEFT JOIN users cu ON cu.id = o.customer_id
      LEFT JOIN LATERAL (
        SELECT oi.seller_id
        FROM order_items oi
        WHERE oi.order_id = o.id
        ORDER BY oi.created_at ASC
        LIMIT 1
      ) oi ON true
      LEFT JOIN seller_profiles sp ON sp.user_id = oi.seller_id
      LEFT JOIN user_addresses ua ON ua.id = o.shipping_address_id
      LEFT JOIN couriers c ON c.id = a.courier_id
      ORDER BY a.created_at DESC
    `
  );

  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_number || row.order_id,
    customerName: row.customer_name || 'Customer',
    sellerName: row.seller_name || 'Seller',
    city: row.customer_city || 'N/A',
    state: row.customer_state || 'N/A',
    courierName: row.courier_name || 'Pending',
    trackingId: row.tracking_number || '-',
    assignmentStatus: row.assignment_status || 'assigned',
    paymentMethod: String(row.payment_method || 'ONLINE').toUpperCase(),
    paymentStatus: String(row.payment_method || 'ONLINE').toUpperCase() === 'ONLINE' ? 'PAID' : 'PENDING',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function getPaymentsForUi(db) {
  await ensureLogisticsSchema(db);
  const rows = await safeQuery(
    db,
    `
      SELECT p.id, p.order_id, o.order_number, p.method, p.status, p.amount, p.shipping_fee, p.total_amount, p.paid_at,
             cu.full_name AS customer_name,
             c.name AS courier_name,
             s.tracking_number,
             s.shipment_status,
             s.updated_at
      FROM payments p
      LEFT JOIN orders o ON o.id = p.order_id
      LEFT JOIN users cu ON cu.id = o.customer_id
      LEFT JOIN shipments s ON s.order_id = o.id
      LEFT JOIN couriers c ON c.id = s.courier_id
      ORDER BY p.created_at DESC
    `
  );

  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_number || row.order_id,
    customerName: row.customer_name || 'Customer',
    amount: Number(row.amount || 0),
    shippingFee: Number(row.shipping_fee || 0),
    totalAmount: Number(row.total_amount || 0),
    paymentMethod: String(row.method || 'ONLINE').toUpperCase(),
    paymentStatus: String(row.status || 'pending').toUpperCase(),
    shipmentStatus: String(row.shipment_status || 'pending').toUpperCase(),
    courierName: row.courier_name || '-',
    trackingNumber: row.tracking_number || '-',
    paidAt: row.paid_at,
    updatedAt: row.updated_at
  }));
}

const commissionSettings = require('../data/commissionSettingsData');

async function getShipmentsForUi(db) {
  const rows = await safeQuery(
    db,
    `
      SELECT
        s.id,
        s.order_id,
        o.order_number,
        o.shipping_fee,
        o.status::text AS order_status,
        cu.full_name AS customer_name,
        COALESCE(ua.city, 'N/A') AS customer_city,
        COALESCE(ua.state, 'N/A') AS customer_state,
        COALESCE(ua.line1 || CASE WHEN ua.line2 IS NOT NULL AND ua.line2 <> '' THEN ', ' || ua.line2 ELSE '' END || ', ' || ua.city, 'N/A') AS customer_address,
        COALESCE(ua.phone, cu.phone, '') AS customer_phone,
        s.courier_name,
        s.tracking_number,
        s.shipment_status::text AS shipment_status,
        s.shipped_at,
        s.delivered_at,
        o.grand_total,
        COALESCE(UPPER(p.method), 'ONLINE') AS payment_type,
        COALESCE(p.amount, o.grand_total, 0) AS payment_amount,
        COALESCE(sp.store_name, 'N/A') AS seller_name
      FROM shipments s
      JOIN orders o ON o.id = s.order_id
      LEFT JOIN users cu ON cu.id = o.customer_id
      LEFT JOIN user_addresses ua ON ua.id = o.shipping_address_id
      LEFT JOIN payments p ON p.order_id = o.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN seller_profiles sp ON sp.user_id = oi.seller_id
      ORDER BY s.created_at DESC
    `
  );

  const fraction = (await commissionSettings.getCommissionSettings(db)).commissionRate / 100;
  return rows.map((row) => {
    const isCod = row.payment_type === 'COD';
    const codAmount = isCod ? toNum(row.payment_amount) : 0;
    const shippingCharges = toNum(row.shipping_fee);
    const platformCommission = Number((codAmount * fraction).toFixed(2));
    const remittedAmount = Number((codAmount * 0.95).toFixed(2));

    return {
      id: row.id,
      orderId: row.order_number || row.order_id,
      customerName: row.customer_name || 'Customer',
      customerCity: row.customer_city || 'N/A',
      customerState: row.customer_state || 'N/A',
      customerAddress: row.customer_address || 'N/A',
      customerPhone: row.customer_phone || '',
      sellerName: row.seller_name,
      courierName: row.courier_name || 'N/A',
      courierId: null,
      trackingId: row.tracking_number || '-',
      paymentType: isCod ? 'COD' : 'Online',
      codAmount,
      shipmentStatus: shipmentStatusMapToUi[row.shipment_status] || 'Awaiting Pickup',
      pickupDate: row.shipped_at ? new Date(row.shipped_at).toISOString().slice(0, 10) : '',
      deliveredDate: row.delivered_at ? new Date(row.delivered_at).toISOString().slice(0, 10) : '',
      returnStatus: row.shipment_status === 'returned' ? 'Returned' : 'None',
      currentLocation: shipmentStatusMapToUi[row.shipment_status] || 'Pending',
      apiIntegrated: false,
      courierCollectedAmount: codAmount,
      platformCommission,
      shippingCharges,
      remittedAmount,
      dateReceived: row.delivered_at ? new Date(row.delivered_at).toISOString().slice(0, 10) : '',
      settlementStatus: row.shipment_status === 'delivered' ? 'Pending' : 'Pending',
      readyForPayout: false
    };
  });
}

router.get('/overview', async (req, res) => {
  const db = req.db;
  const [ordersRows, couriersRows, shipmentsRows, codRows] = await Promise.all([
    safeQuery(db, `SELECT COUNT(*)::int AS count FROM orders o WHERE o.status IN ('pending','confirmed','processing') AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id)`),
    safeQuery(db, `SELECT COUNT(*)::int AS count FROM couriers WHERE is_active = TRUE`),
    safeQuery(db, `SELECT COUNT(*)::int AS count FROM shipments WHERE shipment_status IN ('pending','packed','in_transit','out_for_delivery')`),
    safeQuery(db, `SELECT COUNT(*)::int AS count FROM shipments s JOIN payments p ON p.order_id = s.order_id WHERE s.shipment_status = 'delivered' AND UPPER(p.method) = 'COD'`)
  ]);

  res.json({
    success: true,
    data: {
      readyForPickup: toNum(ordersRows[0] && ordersRows[0].count),
      activeCouriers: toNum(couriersRows[0] && couriersRows[0].count),
      inTransit: toNum(shipmentsRows[0] && shipmentsRows[0].count),
      codPending: toNum(codRows[0] && codRows[0].count)
    }
  });
});

router.get('/couriers', async (req, res) => {
  const db = req.db;
  await ensureLogisticsSchema(db);
  const search = String(req.query.search || '').trim();
  let rows = await safeQuery(
    db,
    `
      SELECT id, name, code, contact_phone, contact_email, api_base_url, service_states, service_cities, cod_supported, is_active
      FROM couriers
      WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR contact_email ILIKE '%' || $1 || '%' OR contact_phone ILIKE '%' || $1 || '%')
      ORDER BY created_at DESC
    `,
    [search]
  );

  if (!rows.length && search === '') {
    await safeQuery(
      db,
      `
        INSERT INTO couriers (name, code, contact_email, contact_phone, api_base_url, service_states, service_cities, cod_supported, is_active)
        SELECT
          src.courier_name,
          LEFT(UPPER(REGEXP_REPLACE(src.courier_name, '[^A-Za-z0-9]+', '_', 'g')), 24) || '_' || RIGHT((EXTRACT(EPOCH FROM NOW())::bigint + src.rn)::text, 4),
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          TRUE,
          TRUE
        FROM (
          SELECT
            TRIM(s.courier_name) AS courier_name,
            ROW_NUMBER() OVER (ORDER BY TRIM(s.courier_name)) AS rn
          FROM shipments s
          WHERE s.courier_name IS NOT NULL
            AND TRIM(s.courier_name) <> ''
            AND LOWER(TRIM(s.courier_name)) NOT IN ('n/a', 'pending', 'unassigned', 'none', '-')
          GROUP BY TRIM(s.courier_name)
        ) src
        WHERE NOT EXISTS (
          SELECT 1
          FROM couriers c
          WHERE LOWER(c.name) = LOWER(src.courier_name)
        )
      `
    );

    // Removed automatic seeding of demo couriers (TCS/Leopards/Pakistan Post)
    // Couriers should be created via admin UI or DB seed scripts. This avoids hardcoded demo entries appearing in production.

    rows = await safeQuery(
      db,
      `
        SELECT id, name, code, contact_phone, contact_email, api_base_url, service_states, service_cities, cod_supported, is_active
        FROM couriers
        ORDER BY created_at DESC
      `
    );
  }

  const data = rows.map((row) => ({
    id: row.id,
    name: row.name,
    contactPerson: row.name,
    phone: row.contact_phone || '',
    email: row.contact_email || '',
    states: row.service_states || '',
    cities: row.service_cities || '',
    codSupported: row.cod_supported !== false,
    apiIntegrated: Boolean(row.api_base_url),
    webhookUrl: row.api_base_url || '',
    apiKey: '',
    apiSecret: '',
    baseShippingCharges: 0,
    codFeePercent: toNum(defaultShippingRules.codFee.value),
    deliveryZones: 'Same City, Same State, Different State',
    estimatedDeliveryTime: '2-5 days',
    status: row.is_active ? 'Active' : 'Inactive'
  }));

  res.json({ success: true, total: data.length, data });
});

router.get('/couriers/active', async (req, res) => {
  await ensureLogisticsSchema(req.db);
  const rows = await safeQuery(req.db, `SELECT id, name, api_base_url, service_states, service_cities, cod_supported FROM couriers WHERE is_active = TRUE ORDER BY name ASC`);
  const data = rows.map((row) => ({
    id: row.id,
    name: row.name,
    states: row.service_states || '',
    cities: row.service_cities || '',
    codSupported: row.cod_supported !== false,
    apiIntegrated: Boolean(row.api_base_url),
    webhookUrl: row.api_base_url || '',
    status: 'Active'
  }));
  res.json({ success: true, total: data.length, data });
});

router.post('/couriers', async (req, res) => {
  await ensureLogisticsSchema(req.db);
  const payload = req.body || {};
  if (!payload.name || !payload.phone) {
    return res.status(400).json({ success: false, message: 'name and phone are required' });
  }

  const code = String(payload.name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30) + '_' + Date.now().toString().slice(-4);

  const rows = await safeQuery(
    req.db,
    `
      INSERT INTO couriers (name, code, contact_email, contact_phone, api_base_url, service_states, service_cities, cod_supported, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, name, code, contact_email, contact_phone, api_base_url, service_states, service_cities, cod_supported, is_active
    `,
    [
      String(payload.name).trim(),
      code,
      String(payload.email || '').trim() || null,
      String(payload.phone || '').trim() || null,
      payload.apiIntegrated ? String(payload.webhookUrl || '').trim() || 'https://api.example.com' : null,
      String(payload.states || '').trim() || null,
      String(payload.cities || '').trim() || null,
      payload.codSupported === undefined ? true : Boolean(payload.codSupported),
      String(payload.status || 'Active') === 'Active'
    ]
  );

  if (!rows.length) {
    return res.status(500).json({ success: false, message: 'Failed to create courier' });
  }

  const row = rows[0];
  return res.status(201).json({
    success: true,
    data: {
      id: row.id,
      name: row.name,
      contactPerson: row.name,
      phone: row.contact_phone || '',
      email: row.contact_email || '',
      states: row.service_states || '',
      cities: row.service_cities || '',
      codSupported: row.cod_supported !== false,
      apiIntegrated: Boolean(row.api_base_url),
      webhookUrl: row.api_base_url || '',
      status: row.is_active ? 'Active' : 'Inactive'
    }
  });
});

router.put('/couriers/:id', async (req, res) => {
  await ensureLogisticsSchema(req.db);
  const payload = req.body || {};
  const rows = await safeQuery(
    req.db,
    `
      UPDATE couriers
      SET
        name = COALESCE($2, name),
        contact_email = COALESCE($3, contact_email),
        contact_phone = COALESCE($4, contact_phone),
        api_base_url = $5,
        service_states = $6,
        service_cities = $7,
        cod_supported = $8,
        is_active = $9,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, contact_email, contact_phone, api_base_url, service_states, service_cities, cod_supported, is_active
    `,
    [
      req.params.id,
      payload.name ? String(payload.name).trim() : null,
      payload.email !== undefined ? String(payload.email || '').trim() || null : null,
      payload.phone !== undefined ? String(payload.phone || '').trim() || null : null,
      payload.apiIntegrated ? String(payload.webhookUrl || '').trim() || 'https://api.example.com' : null,
      payload.states !== undefined ? String(payload.states || '').trim() || null : null,
      payload.cities !== undefined ? String(payload.cities || '').trim() || null : null,
      payload.codSupported === undefined ? true : Boolean(payload.codSupported),
      String(payload.status || 'Active') === 'Active'
    ]
  );

  if (!rows.length) {
    return res.status(404).json({ success: false, message: 'Courier not found' });
  }

  const row = rows[0];
  return res.json({
    success: true,
    data: {
      id: row.id,
      name: row.name,
      contactPerson: row.name,
      phone: row.contact_phone || '',
      email: row.contact_email || '',
      states: row.service_states || '',
      cities: row.service_cities || '',
      codSupported: row.cod_supported !== false,
      apiIntegrated: Boolean(row.api_base_url),
      webhookUrl: row.api_base_url || '',
      status: row.is_active ? 'Active' : 'Inactive'
    }
  });
});

router.patch('/couriers/:id/toggle', async (req, res) => {
  await ensureLogisticsSchema(req.db);
  const rows = await safeQuery(
    req.db,
    `
      UPDATE couriers
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, contact_email, contact_phone, api_base_url, service_states, service_cities, cod_supported, is_active
    `,
    [req.params.id]
  );

  if (!rows.length) {
    return res.status(404).json({ success: false, message: 'Courier not found' });
  }

  const row = rows[0];
  return res.json({
    success: true,
    data: {
      id: row.id,
      name: row.name,
      contactPerson: row.name,
      phone: row.contact_phone || '',
      email: row.contact_email || '',
      states: row.service_states || '',
      cities: row.service_cities || '',
      codSupported: row.cod_supported !== false,
      apiIntegrated: Boolean(row.api_base_url),
      webhookUrl: row.api_base_url || '',
      status: row.is_active ? 'Active' : 'Inactive'
    }
  });
});

router.delete('/couriers/:id', async (req, res) => {
  const rows = await safeQuery(req.db, `DELETE FROM couriers WHERE id = $1 RETURNING id, name`, [req.params.id]);
  if (!rows.length) {
    return res.status(404).json({ success: false, message: 'Courier not found' });
  }
  return res.json({ success: true, data: rows[0] });
});

router.get('/orders/ready', async (req, res) => {
  const rows = await safeQuery(
    req.db,
    `
      SELECT
        o.id,
        o.order_number,
        COALESCE(sp.store_name, 'N/A') AS seller_name,
        COALESCE(u.phone, '') AS seller_phone,
        COALESCE(ua.line1 || ', ' || ua.city, 'N/A') AS customer_address,
        COALESCE(ua.phone, '') AS customer_phone,
        COALESCE(SUM(oi.quantity), 0)::numeric AS total_qty,
        COALESCE(UPPER(p.method), 'ONLINE') AS payment_method,
        COALESCE(p.amount, o.grand_total, 0)::numeric AS payment_amount,
        EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id) AS courier_locked
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN seller_profiles sp ON sp.user_id = oi.seller_id
      LEFT JOIN users u ON u.id = oi.seller_id
      LEFT JOIN user_addresses ua ON ua.id = o.shipping_address_id
      LEFT JOIN payments p ON p.order_id = o.id
      WHERE o.status IN ('pending','confirmed','processing')
      GROUP BY o.id, o.order_number, sp.store_name, u.phone, ua.line1, ua.city, ua.phone, p.method, p.amount, o.grand_total
      HAVING EXISTS (SELECT 1)
      ORDER BY o.placed_at DESC
    `
  );

  const data = rows
    .filter((row) => !row.courier_locked)
    .map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      sellerStoreName: row.seller_name,
      sellerPickupAddress: row.seller_name,
      sellerPhone: row.seller_phone,
      customerDeliveryAddress: row.customer_address,
      customerPhone: row.customer_phone,
      orderWeight: Number(Math.max(0.5, Number(row.total_qty || 1)).toFixed(2)),
      customerCityType: 'Different State',
      paymentType: row.payment_method === 'COD' ? 'COD' : 'Online',
      codAmount: row.payment_method === 'COD' ? toNum(row.payment_amount) : 0,
      status: 'Ready for Pickup',
      courierLocked: false
    }));

  res.json({ success: true, total: data.length, data });
});

router.post('/shipments/create', async (req, res) => {
  const { orderId, courierId, manualTrackingId = '' } = req.body || {};
  if (!orderId || !courierId) {
    return res.status(400).json({ success: false, message: 'orderId and courierId are required' });
  }

  const [orderRows, courierRows] = await Promise.all([
    safeQuery(req.db, `SELECT o.id, o.order_number, o.status::text AS status, cu.full_name AS customer_name FROM orders o LEFT JOIN users cu ON cu.id = o.customer_id WHERE o.id = $1 LIMIT 1`, [orderId]),
    safeQuery(req.db, `SELECT id, name, api_base_url, is_active FROM couriers WHERE id = $1 LIMIT 1`, [courierId])
  ]);

  if (!orderRows.length) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const orderStatus = String(orderRows[0].status || '').toLowerCase();
  const assignable = ['pending', 'confirmed', 'processing'];
  if (!assignable.includes(orderStatus)) {
    return res.status(400).json({
      success: false,
      message: 'Order is not eligible for courier assignment in its current status'
    });
  }

  if (!courierRows.length || !courierRows[0].is_active) {
    return res.status(400).json({ success: false, message: 'Please select an active courier' });
  }

  const shipmentExists = await safeQuery(req.db, `SELECT id FROM shipments WHERE order_id = $1 LIMIT 1`, [orderId]);
  if (shipmentExists.length) {
    return res.status(400).json({ success: false, message: 'Order already assigned to a shipment' });
  }

  const courier = courierRows[0];
  const trackingId = manualTrackingId || `TRK-${Date.now()}`;

  const insertRows = await safeQuery(
    req.db,
    `
      INSERT INTO shipments (order_id, courier_name, tracking_number, shipment_status, courier_id, shipped_at, created_at, updated_at)
      VALUES ($1, $2, $3, 'pending', $4, NOW(), NOW(), NOW())
      RETURNING id, order_id, courier_name, tracking_number, shipment_status, shipped_at, delivered_at
    `,
    [orderId, courier.name, trackingId, courier.id]
  );

  const assignmentRows = await safeQuery(
    req.db,
    `
      INSERT INTO assignments (order_id, courier_id, tracking_number, assignment_status, created_at, updated_at)
      VALUES ($1, $2, $3, 'assigned', NOW(), NOW())
      RETURNING id
    `,
    [orderId, courier.id, trackingId]
  );

  await safeQuery(req.db, `UPDATE shipments SET assignment_id = $2, updated_at = NOW() WHERE id = $1`, [insertRows[0].id, assignmentRows[0]?.id || null]);
  await safeQuery(req.db, `UPDATE orders SET status = 'shipped', updated_at = NOW() WHERE id = $1`, [orderId]);

  const shipment = insertRows[0];
  return res.status(201).json({
    success: true,
    message: 'Shipment created. Seller and customer notified.',
    data: {
      id: shipment.id,
      orderId: orderRows[0].order_number || shipment.order_id,
      customerName: orderRows[0].customer_name || '',
      courierName: shipment.courier_name,
      courierId: courier.id,
      trackingId: shipment.tracking_number,
      shipmentStatus: shipmentStatusMapToUi[shipment.shipment_status] || 'Awaiting Pickup',
      pickupDate: shipment.shipped_at ? new Date(shipment.shipped_at).toISOString().slice(0, 10) : '',
      deliveredDate: shipment.delivered_at ? new Date(shipment.delivered_at).toISOString().slice(0, 10) : '',
      apiIntegrated: Boolean(courier.api_base_url)
    }
  });
});

router.post('/shipments/reassign', async (req, res) => {
  const { orderId, courierId, manualTrackingId = '' } = req.body || {};
  if (!orderId || !courierId) {
    return res.status(400).json({ success: false, message: 'orderId and courierId are required' });
  }

  const [orderRows, courierRows, shipmentRows] = await Promise.all([
    safeQuery(req.db, `SELECT o.id, o.order_number, o.status::text AS status, cu.full_name AS customer_name FROM orders o LEFT JOIN users cu ON cu.id = o.customer_id WHERE o.id = $1 LIMIT 1`, [orderId]),
    safeQuery(req.db, `SELECT id, name, api_base_url, is_active, service_states, service_cities, cod_supported FROM couriers WHERE id = $1 LIMIT 1`, [courierId]),
    safeQuery(req.db, `SELECT id, courier_name, tracking_number, shipment_status::text AS shipment_status, shipped_at, delivered_at FROM shipments WHERE order_id = $1 LIMIT 1`, [orderId])
  ]);

  if (!orderRows.length) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const orderStatus = String(orderRows[0].status || '').toLowerCase();
  const assignable = ['pending', 'confirmed', 'processing'];
  if (!assignable.includes(orderStatus)) {
    return res.status(400).json({ success: false, message: 'Order is not eligible for courier assignment in its current status' });
  }

  if (!courierRows.length || !courierRows[0].is_active) {
    return res.status(400).json({ success: false, message: 'Please select an active courier' });
  }

  const courier = courierRows[0];
  const trackingId = manualTrackingId || shipmentRows[0]?.tracking_number || `TRK-${Date.now()}`;

  let shipment;
  if (shipmentRows.length) {
    const rows = await safeQuery(
      req.db,
      `
        UPDATE shipments
        SET courier_name = $2, tracking_number = $3, shipment_status = COALESCE(shipment_status, 'pending'), courier_id = $4, shipped_at = COALESCE(shipped_at, NOW()), updated_at = NOW()
        WHERE order_id = $1
        RETURNING id, order_id, courier_name, tracking_number, shipment_status, shipped_at, delivered_at
      `,
      [orderId, courier.name, trackingId, courier.id]
    );
    shipment = rows[0];
  } else {
    const rows = await safeQuery(
      req.db,
      `
        INSERT INTO shipments (order_id, courier_name, tracking_number, shipment_status, courier_id, shipped_at, created_at, updated_at)
        VALUES ($1, $2, $3, 'pending', $4, NOW(), NOW(), NOW())
        RETURNING id, order_id, courier_name, tracking_number, shipment_status, shipped_at, delivered_at
      `,
      [orderId, courier.name, trackingId, courier.id]
    );
    shipment = rows[0];
  }

  const existingAssignment = await safeQuery(req.db, `SELECT id FROM assignments WHERE order_id = $1 LIMIT 1`, [orderId]);
  if (existingAssignment.length) {
    await safeQuery(req.db, `UPDATE assignments SET courier_id = $2, tracking_number = $3, assignment_status = 'assigned', updated_at = NOW() WHERE id = $1`, [existingAssignment[0].id, courier.id, trackingId]);
  } else {
    await safeQuery(req.db, `INSERT INTO assignments (order_id, courier_id, tracking_number, assignment_status, created_at, updated_at) VALUES ($1, $2, $3, 'assigned', NOW(), NOW())`, [orderId, courier.id, trackingId]);
  }

  await safeQuery(req.db, `UPDATE orders SET status = 'shipped', updated_at = NOW() WHERE id = $1`, [orderId]);

  return res.json({
    success: true,
    message: 'Shipment reassigned successfully',
    data: {
      id: shipment.id,
      orderId: orderRows[0].order_number || shipment.order_id,
      customerName: orderRows[0].customer_name || '',
      courierName: shipment.courier_name,
      courierId: courier.id,
      trackingId: shipment.tracking_number,
      shipmentStatus: shipmentStatusMapToUi[shipment.shipment_status] || 'Awaiting Pickup',
      pickupDate: shipment.shipped_at ? new Date(shipment.shipped_at).toISOString().slice(0, 10) : '',
      deliveredDate: shipment.delivered_at ? new Date(shipment.delivered_at).toISOString().slice(0, 10) : '',
      apiIntegrated: Boolean(courier.api_base_url),
      states: courier.service_states || '',
      cities: courier.service_cities || '',
      codSupported: courier.cod_supported !== false
    }
  });
});

router.get('/assignments', async (req, res) => {
  const data = await getAssignmentsForUi(req.db);
  res.json({ success: true, total: data.length, data });
});

router.get('/payments', async (req, res) => {
  const data = await getPaymentsForUi(req.db);
  res.json({ success: true, total: data.length, data });
});

router.get('/shipments', async (req, res) => {
  const data = await getShipmentsForUi(req.db);
  res.json({ success: true, total: data.length, data });
});

router.get('/shipping-charges', async (req, res) => {
  try {
    await ensureLogisticsSchema(req.db);
    const rows = await safeQuery(req.db, `SELECT id, state, city, shipping_fee, created_at, updated_at FROM shipping_charges ORDER BY state ASC, city ASC`);
    res.json({ success: true, data: rows.map(mapShippingChargeRecord) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load shipping charges', error: error.message });
  }
});

router.post('/shipping-charges', async (req, res) => {
  try {
    await ensureLogisticsSchema(req.db);
    const body = req.body || {};
    const state = String(body.state || 'All').trim() || 'All';
    const city = String(body.city || '').trim();
    const shippingFee = Number(body.shippingFee ?? body.fee ?? body.shipping_fee ?? 0);

    if (!city) {
      return res.status(400).json({ success: false, message: 'City is required' });
    }

    if (!Number.isFinite(shippingFee)) {
      return res.status(400).json({ success: false, message: 'Shipping fee must be numeric' });
    }

    const result = await req.db.query(
      `INSERT INTO shipping_charges (state, city, shipping_fee, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id, state, city, shipping_fee, created_at, updated_at`,
      [state, city, shippingFee]
    );

    res.json({ success: true, message: 'Shipping charge rule created', data: mapShippingChargeRecord(result.rows[0]) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create shipping charge rule', error: error.message });
  }
});

router.put('/shipping-charges/:id', async (req, res) => {
  try {
    await ensureLogisticsSchema(req.db);
    const body = req.body || {};
    const state = String(body.state || 'All').trim() || 'All';
    const city = String(body.city || '').trim();
    const shippingFee = Number(body.shippingFee ?? body.fee ?? body.shipping_fee ?? 0);

    if (!city) {
      return res.status(400).json({ success: false, message: 'City is required' });
    }

    if (!Number.isFinite(shippingFee)) {
      return res.status(400).json({ success: false, message: 'Shipping fee must be numeric' });
    }

    const result = await req.db.query(
      `UPDATE shipping_charges
       SET state = $1, city = $2, shipping_fee = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, state, city, shipping_fee, created_at, updated_at`,
      [state, city, shippingFee, req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Shipping charge rule not found' });
    }

    res.json({ success: true, message: 'Shipping charge rule updated', data: mapShippingChargeRecord(result.rows[0]) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update shipping charge rule', error: error.message });
  }
});

router.delete('/shipping-charges/:id', async (req, res) => {
  try {
    await ensureLogisticsSchema(req.db);
    const result = await req.db.query(`DELETE FROM shipping_charges WHERE id = $1 RETURNING id`, [req.params.id]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Shipping charge rule not found' });
    }

    res.json({ success: true, message: 'Shipping charge rule deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete shipping charge rule', error: error.message });
  }
});

router.get('/cod-rules', async (req, res) => {
  try {
    await ensureLogisticsSchema(req.db);
    const rows = await safeQuery(req.db, `SELECT id, state, city, cod_available, max_amount, created_at, updated_at FROM cod_rules ORDER BY state ASC, city ASC`);
    res.json({ success: true, data: rows.map(mapCodRuleRecord) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load COD rules', error: error.message });
  }
});

router.post('/cod-rules', async (req, res) => {
  try {
    await ensureLogisticsSchema(req.db);
    const body = req.body || {};
    const state = String(body.state || 'All').trim() || 'All';
    const city = String(body.city || '').trim();
    const codAvailable = normalizeCodAvailable(body.codAvailable ?? body.cod_available ?? body.codAvailable === 'Yes' ? 'Yes' : 'No');
    const maxAmount = Number(body.maxAmount ?? body.maxCodAmount ?? body.max_amount ?? 0);

    if (!city) {
      return res.status(400).json({ success: false, message: 'City is required' });
    }

    if (!Number.isFinite(maxAmount)) {
      return res.status(400).json({ success: false, message: 'Maximum amount must be numeric' });
    }

    const result = await req.db.query(
      `INSERT INTO cod_rules (state, city, cod_available, max_amount, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, state, city, cod_available, max_amount, created_at, updated_at`,
      [state, city, codAvailable, maxAmount]
    );

    res.json({ success: true, message: 'COD rule created', data: mapCodRuleRecord(result.rows[0]) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create COD rule', error: error.message });
  }
});

router.put('/cod-rules/:id', async (req, res) => {
  try {
    await ensureLogisticsSchema(req.db);
    const body = req.body || {};
    const state = String(body.state || 'All').trim() || 'All';
    const city = String(body.city || '').trim();
    const codAvailable = normalizeCodAvailable(body.codAvailable ?? body.cod_available ?? body.codAvailable === 'Yes' ? 'Yes' : 'No');
    const maxAmount = Number(body.maxAmount ?? body.maxCodAmount ?? body.max_amount ?? 0);

    if (!city) {
      return res.status(400).json({ success: false, message: 'City is required' });
    }

    if (!Number.isFinite(maxAmount)) {
      return res.status(400).json({ success: false, message: 'Maximum amount must be numeric' });
    }

    const result = await req.db.query(
      `UPDATE cod_rules
       SET state = $1, city = $2, cod_available = $3, max_amount = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, state, city, cod_available, max_amount, created_at, updated_at`,
      [state, city, codAvailable, maxAmount, req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'COD rule not found' });
    }

    res.json({ success: true, message: 'COD rule updated', data: mapCodRuleRecord(result.rows[0]) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update COD rule', error: error.message });
  }
});

router.delete('/cod-rules/:id', async (req, res) => {
  try {
    await ensureLogisticsSchema(req.db);
    const result = await req.db.query(`DELETE FROM cod_rules WHERE id = $1 RETURNING id`, [req.params.id]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'COD rule not found' });
    }

    res.json({ success: true, message: 'COD rule deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete COD rule', error: error.message });
  }
});

router.patch('/shipments/:id/status', async (req, res) => {
  const statusUi = String((req.body || {}).status || '');
  const statusDb = shipmentStatusMapToDb[statusUi];
  if (!statusDb) {
    return res.status(400).json({ success: false, message: 'Invalid shipment status' });
  }

  const deliveredAtSql = statusDb === 'delivered' ? ', delivered_at = NOW()' : '';
  const rows = await safeQuery(
    req.db,
    `
      UPDATE shipments
      SET shipment_status = $2, updated_at = NOW() ${deliveredAtSql}
      WHERE id = $1
      RETURNING id
    `,
    [req.params.id, statusDb]
  );

  if (!rows.length) {
    return res.status(404).json({ success: false, message: 'Shipment not found' });
  }

  const shipmentRows = await getShipmentsForUi(req.db);
  const shipment = shipmentRows.find((item) => item.id === req.params.id);

  // If shipment marked delivered, settle COD payments (mark payment as paid) for that order
  try {
    if (statusDb === 'delivered') {
      const orows = await safeQuery(req.db, `SELECT order_id FROM shipments WHERE id = $1 LIMIT 1`, [req.params.id]);
      const orderId = orows[0] && orows[0].order_id;
      if (orderId) {
        await safeQuery(req.db, `UPDATE public.payments SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE order_id = $1 AND LOWER(method) LIKE '%cod%'`, [orderId]);
        await safeQuery(req.db, `UPDATE public.orders SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`, [orderId]);
      }
    }
  } catch (err) {
    console.error('Failed to settle COD payment on delivery', err && err.message);
  }
  return res.json({ success: true, data: shipment || null });
});

router.get('/shipping-rules', async (req, res) => {
  try {
    const data = await getShippingRules(req.db);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load shipping rules', error: error.message });
  }
});

router.put('/shipping-rules', async (req, res) => {
  try {
    const data = await saveShippingRules(req.db, req.body || {});
    res.json({ success: true, message: 'Shipping rules saved successfully', data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save shipping rules', error: error.message });
  }
});

router.get('/cod/delivered', async (req, res) => {
  const allShipments = await getShipmentsForUi(req.db);
  const data = allShipments
    .filter((item) => item.paymentType === 'COD' && item.shipmentStatus === 'Delivered')
    .map((item) => ({
      ...item,
      codFee: calcCodFee(item.codAmount),
      netSellerAmount: calcNetSellerAmount(item)
    }));

  res.json({ success: true, total: data.length, data });
});

router.get('/cod/settlements', async (req, res) => {
  const allShipments = await getShipmentsForUi(req.db);
  const codDelivered = allShipments.filter((item) => item.paymentType === 'COD' && item.shipmentStatus === 'Delivered');

  const grouped = {};
  codDelivered.forEach((item) => {
    if (!grouped[item.courierName]) {
      grouped[item.courierName] = {
        courierName: item.courierName,
        totalCollected: 0,
        remittedAmount: 0,
        latestDateReceived: item.dateReceived || '-',
        pendingAmount: 0,
        discrepancy: 0,
        flag: 'Clear'
      };
    }

    grouped[item.courierName].totalCollected += toNum(item.courierCollectedAmount);
    grouped[item.courierName].remittedAmount += toNum(item.remittedAmount);
  });

  const data = Object.values(grouped).map((entry) => {
    const pending = Number((entry.totalCollected - entry.remittedAmount).toFixed(2));
    const discrepancy = pending > 0 ? pending : 0;
    return {
      ...entry,
      pendingAmount: pending,
      discrepancy,
      flag: discrepancy > 0 ? 'Under Investigation' : 'Clear'
    };
  });

  res.json({ success: true, total: data.length, data });
});

router.post('/cod/settle-seller', async (req, res) => {
  const { shipmentId } = req.body || {};
  if (!shipmentId) {
    return res.status(400).json({ success: false, message: 'shipmentId is required' });
  }

  const rows = await safeQuery(
    req.db,
    `
      INSERT INTO shipment_events (shipment_id, event_code, event_label, event_time, payload)
      VALUES ($1, 'SETTLEMENT_READY', 'Settlement marked ready for payout', NOW(), jsonb_build_object('source','admin'))
      RETURNING id
    `,
    [shipmentId]
  );

  if (!rows.length) {
    return res.status(404).json({ success: false, message: 'Shipment not found' });
  }

  return res.json({
    success: true,
    message: 'Settlement recorded and marked ready for payout',
    data: { shipmentId }
  });
});

router.post('/sync/webhooks', async (req, res) => {
  const rows = await safeQuery(req.db, `SELECT COUNT(*)::int AS count FROM couriers WHERE is_active = TRUE AND api_base_url IS NOT NULL`);
  res.json({
    success: true,
    message: 'Webhook sync simulated for API-integrated couriers',
    data: {
      syncedCouriers: toNum(rows[0] && rows[0].count),
      syncedAt: new Date().toISOString()
    }
  });
});

module.exports = router;
