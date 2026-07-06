const express = require('express');

const router = express.Router();

function getSellerId(req) {
  const raw = req.auth?.session?.userId || req.headers['x-seller-id'] || '';
  return String(raw).trim();
}

async function resolveSellerId(req) {
  const sellerId = getSellerId(req);
  return sellerId || null;
}

async function readSellerVerificationStatus(db, sellerId) {
  const queries = [
    `
      SELECT
        COALESCE(sp.kyc_status::text, to_jsonb(sp)->>'verification_status', '') AS kyc_status,
        COALESCE(to_jsonb(sp)->>'is_verified', 'false') AS is_verified
      FROM public.seller_profiles sp
      WHERE sp.user_id = $1
      LIMIT 1
    `,
    `
      SELECT
        COALESCE(sp.kyc_status::text, to_jsonb(sp)->>'verification_status', '') AS kyc_status,
        COALESCE(to_jsonb(sp)->>'is_verified', 'false') AS is_verified
      FROM lumina.seller_profiles sp
      WHERE sp.user_id = $1
      LIMIT 1
    `
  ];

  for (const sql of queries) {
    try {
      const result = await db.query(sql, [sellerId]);
      if (result.rows.length) {
        return result.rows[0];
      }
    } catch (_) {
      // Support deployments where only one schema exists.
    }
  }

  return null;
}

function isSellerVerified(profile) {
  if (!profile) return false;
  const status = String(profile.kyc_status || '').trim().toLowerCase();
  const verifiedFlag = String(profile.is_verified || '').trim().toLowerCase();
  return status === 'verified' || status === 'approved' || status === 'active' || verifiedFlag === 'true' || verifiedFlag === '1';
}

async function enforceSellerVerification(req, res, sellerId) {
  const profile = await readSellerVerificationStatus(req.db, sellerId);

  if (!isSellerVerified(profile)) {
    res.status(403).json({
      success: false,
      code: 'SELLER_NOT_VERIFIED',
      message: 'Verify KYC first to perform inventory updates'
    });
    return false;
  }

  return true;
}

function stockStatus(stock, threshold) {
  const qty = Number(stock || 0);
  const limit = Number(threshold || 10);
  if (qty <= 0) return 'Out of Stock';
  if (qty < limit) return 'Low Stock';
  return 'In Stock';
}

function statusToDbValue(status) {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'in stock') return 'in_stock';
  if (value === 'low stock') return 'low_stock';
  if (value === 'out of stock') return 'out_of_stock';
  return '';
}

async function ensureInventoryTables(req) {
  await req.db.query(`
    CREATE TABLE IF NOT EXISTS public.inventory_thresholds (
      product_id UUID PRIMARY KEY,
      threshold INTEGER NOT NULL DEFAULT 10 CHECK (threshold >= 0),
      warehouse VARCHAR(120) NOT NULL DEFAULT 'Main Warehouse',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await req.db.query(`
    CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id UUID NOT NULL,
      product_id UUID NOT NULL,
      old_qty INTEGER NOT NULL,
      new_qty INTEGER NOT NULL,
      change_qty INTEGER NOT NULL,
      action_type VARCHAR(20) NOT NULL,
      reason VARCHAR(120) NOT NULL,
      notes TEXT,
      warehouse VARCHAR(120) NOT NULL DEFAULT 'Main Warehouse',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function buildInventoryProduct(req, row) {
  const variantResult = await req.db.query(
    `
      SELECT
        COALESCE(pv.variant_name, 'Variant') AS name,
        COALESCE(NULLIF(pv.sku, ''), CONCAT('VAR-', UPPER(SUBSTRING(REPLACE(pv.id::text, '-', ''), 1, 6)))) AS sku,
        COALESCE(pv.stock_quantity, 0)::int AS qty
      FROM public.product_variants pv
      WHERE pv.product_id = $1
      ORDER BY pv.created_at ASC
    `,
    [row.id]
  );

  const stock = Number(row.stock_quantity || 0);
  const threshold = Number(row.threshold || 10);

  return {
    id: row.id,
    product: row.name,
    sku: row.sku,
    category: row.category,
    stock,
    threshold,
    status: stockStatus(stock, threshold),
    warehouse: row.warehouse || 'Main Warehouse',
    image: 'ðŸ“¦',
    price: Number(row.base_price || 0),
    variants: variantResult.rows
  };
}

// GET /api/seller/inventory/overview
router.get('/overview', async (req, res) => {
  try {
    await ensureInventoryTables(req);
    const sellerId = await resolveSellerId(req);

    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        SELECT
          COUNT(*)::int AS total_products,
             COUNT(*) FILTER (WHERE COALESCE(pd.stock_quantity, variants.stock_quantity, 0) > COALESCE(it.threshold, 10))::int AS in_stock_products,
             COUNT(*) FILTER (WHERE COALESCE(pd.stock_quantity, variants.stock_quantity, 0) > 0 AND COALESCE(pd.stock_quantity, variants.stock_quantity, 0) <= COALESCE(it.threshold, 10))::int AS low_stock_products,
             COUNT(*) FILTER (WHERE COALESCE(pd.stock_quantity, variants.stock_quantity, 0) <= 0)::int AS out_of_stock_products
        FROM public.products p
           LEFT JOIN public.product_details pd ON pd.product_id = p.id
           LEFT JOIN LATERAL (
             SELECT COALESCE(SUM(pv.stock_quantity), 0)::int AS stock_quantity
             FROM public.product_variants pv
             WHERE pv.product_id = p.id
           ) variants ON TRUE
        LEFT JOIN public.inventory_thresholds it ON it.product_id = p.id
        WHERE p.seller_id = $1
      `,
      [sellerId]
    );

    const row = result.rows[0] || {
      total_products: 0,
      in_stock_products: 0,
      low_stock_products: 0,
      out_of_stock_products: 0
    };

    return res.json({
      success: true,
      data: {
        totalProducts: Number(row.total_products || 0),
        inStockProducts: Number(row.in_stock_products || 0),
        lowStockProducts: Number(row.low_stock_products || 0),
        outOfStockProducts: Number(row.out_of_stock_products || 0)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch overview', error: error.message });
  }
});

// GET /api/seller/inventory/products
router.get('/products', async (req, res) => {
  try {
    await ensureInventoryTables(req);
    const sellerId = await resolveSellerId(req);

    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const search = String(req.query.search || '').trim();
    const status = statusToDbValue(req.query.status || '');
    const category = String(req.query.category || '').trim();

    const params = [sellerId];
    const where = ['p.seller_id = $1'];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(p.name ILIKE $${params.length} OR COALESCE(p.sku, '') ILIKE $${params.length})`);
    }

    if (category) {
      params.push(category);
      where.push(`COALESCE(c.name, 'General') = $${params.length}`);
    }

      if (status === 'in_stock') {
        where.push('COALESCE(pd.stock_quantity, variants.stock_quantity, 0) > COALESCE(it.threshold, 10)');
      } else if (status === 'low_stock') {
        where.push('COALESCE(pd.stock_quantity, variants.stock_quantity, 0) > 0 AND COALESCE(pd.stock_quantity, variants.stock_quantity, 0) <= COALESCE(it.threshold, 10)');
    } else if (status === 'out_of_stock') {
        where.push('COALESCE(pd.stock_quantity, variants.stock_quantity, 0) <= 0');
    }

    const result = await req.db.query(
      `
        SELECT
          p.id,
          p.name,
          COALESCE(NULLIF(p.sku, ''), CONCAT('SKU-', UPPER(SUBSTRING(REPLACE(p.id::text, '-', ''), 1, 6)))) AS sku,
          COALESCE(c.name, 'General') AS category,
         COALESCE(pd.stock_quantity, variants.stock_quantity, 0)::int AS stock_quantity,
          COALESCE(it.threshold, 10)::int AS threshold,
          COALESCE(it.warehouse, 'Main Warehouse') AS warehouse,
          COALESCE(p.base_price, 0)::numeric AS base_price
        FROM public.products p
        LEFT JOIN public.categories c ON c.id = p.category_id
         LEFT JOIN public.product_details pd ON pd.product_id = p.id
         LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(pv.stock_quantity), 0)::int AS stock_quantity
         FROM public.product_variants pv
         WHERE pv.product_id = p.id
         ) variants ON TRUE
        LEFT JOIN public.inventory_thresholds it ON it.product_id = p.id
        WHERE ${where.join(' AND ')}
        ORDER BY
          CASE
          WHEN COALESCE(pd.stock_quantity, variants.stock_quantity, 0) <= 0 THEN 0
          WHEN COALESCE(pd.stock_quantity, variants.stock_quantity, 0) <= COALESCE(it.threshold, 10) THEN 1
            ELSE 2
          END,
          p.updated_at DESC
      `,
      params
    );

    const products = [];
    for (const row of result.rows) {
      const mapped = await buildInventoryProduct(req, row);
      products.push(mapped);
    }

    return res.json({
      success: true,
      data: products,
      pagination: {
        currentPage: 1,
        pageSize: products.length,
        totalItems: products.length,
        totalPages: 1
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch products', error: error.message });
  }
});

// GET /api/seller/inventory/products/:productId
router.get('/products/:productId', async (req, res) => {
  try {
    await ensureInventoryTables(req);
    const sellerId = await resolveSellerId(req);
    const productId = String(req.params.productId || '').trim();

    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        SELECT
          p.id,
          p.name,
          COALESCE(NULLIF(p.sku, ''), CONCAT('SKU-', UPPER(SUBSTRING(REPLACE(p.id::text, '-', ''), 1, 6)))) AS sku,
          COALESCE(c.name, 'General') AS category,
          COALESCE(pd.stock_quantity, variants.stock_quantity, 0)::int AS stock_quantity,
          COALESCE(it.threshold, 10)::int AS threshold,
          COALESCE(it.warehouse, 'Main Warehouse') AS warehouse,
          COALESCE(p.base_price, 0)::numeric AS base_price
        FROM public.products p
        LEFT JOIN public.categories c ON c.id = p.category_id
        LEFT JOIN public.product_details pd ON pd.product_id = p.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(pv.stock_quantity), 0)::int AS stock_quantity
          FROM public.product_variants pv
          WHERE pv.product_id = p.id
        ) variants ON TRUE
        LEFT JOIN public.inventory_thresholds it ON it.product_id = p.id
        WHERE p.seller_id = $1
          AND p.id::text = $2
        LIMIT 1
      `,
      [sellerId, productId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const product = await buildInventoryProduct(req, result.rows[0]);
    return res.json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch product', error: error.message });
  }
});

// POST /api/seller/inventory/products/:productId/adjust
router.post('/products/:productId/adjust', async (req, res) => {
  try {
    await ensureInventoryTables(req);
    const sellerId = await resolveSellerId(req);

    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const verified = await enforceSellerVerification(req, res, sellerId);
    if (!verified) {
      return;
    }

    const productId = String(req.params.productId || '').trim();
    const actionType = String(req.body.actionType || '').trim();
    const quantity = Number(req.body.quantity);
    const reason = String(req.body.reason || '').trim();
    const notes = String(req.body.notes || '').trim();

    if (!['add', 'reduce', 'set'].includes(actionType)) {
      return res.status(400).json({ success: false, message: 'Invalid actionType. Must be: add, reduce, or set' });
    }

    if (Number.isNaN(quantity) || quantity < 0) {
      return res.status(400).json({ success: false, message: 'Invalid quantity. Must be a non-negative number' });
    }

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Missing required field: reason' });
    }

    const currentResult = await req.db.query(
      `
        SELECT
          p.id,
          p.name,
          COALESCE(NULLIF(p.sku, ''), CONCAT('SKU-', UPPER(SUBSTRING(REPLACE(p.id::text, '-', ''), 1, 6)))) AS sku,
             COALESCE(pd.stock_quantity, variants.stock_quantity, 0)::int AS old_qty,
          COALESCE(it.threshold, 10)::int AS threshold,
          COALESCE(it.warehouse, 'Main Warehouse') AS warehouse,
          COALESCE(p.base_price, 0)::numeric AS base_price
        FROM public.products p
           LEFT JOIN public.product_details pd ON pd.product_id = p.id
           LEFT JOIN LATERAL (
             SELECT COALESCE(SUM(pv.stock_quantity), 0)::int AS stock_quantity
             FROM public.product_variants pv
             WHERE pv.product_id = p.id
           ) variants ON TRUE
        LEFT JOIN public.inventory_thresholds it ON it.product_id = p.id
        WHERE p.seller_id = $1
          AND p.id::text = $2
        LIMIT 1
      `,
      [sellerId, productId]
    );

    if (!currentResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const current = currentResult.rows[0];
    const oldQty = Number(current.old_qty || 0);

    let newQty = oldQty;
    if (actionType === 'add') {
      newQty = oldQty + quantity;
    } else if (actionType === 'reduce') {
      newQty = Math.max(0, oldQty - quantity);
    } else {
      newQty = quantity;
    }

    const change = newQty - oldQty;

        await req.db.query(
          `
            INSERT INTO public.product_details (product_id, stock_quantity, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (product_id)
            DO UPDATE SET stock_quantity = EXCLUDED.stock_quantity, updated_at = NOW()
          `,
          [current.id, newQty]
        );

    await req.db.query(
      `
        INSERT INTO public.inventory_adjustments (
          seller_id,
          product_id,
          old_qty,
          new_qty,
          change_qty,
          action_type,
          reason,
          notes,
          warehouse,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `,
      [sellerId, current.id, oldQty, newQty, change, actionType, reason, notes || null, current.warehouse]
    );

    return res.json({
      success: true,
      message: 'Stock adjusted successfully',
      data: {
        product: {
          id: current.id,
          product: current.name,
          sku: current.sku,
          stock: newQty,
          threshold: Number(current.threshold || 10),
          status: stockStatus(newQty, current.threshold),
          warehouse: current.warehouse,
          price: Number(current.base_price || 0),
          image: 'ðŸ“¦'
        },
        oldStock: oldQty,
        newStock: newQty,
        change
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to adjust stock', error: error.message });
  }
});

// GET /api/seller/inventory/restock-history
router.get('/restock-history', async (req, res) => {
  try {
    await ensureInventoryTables(req);
    const sellerId = await resolveSellerId(req);

    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        SELECT
          ia.id,
          p.name AS product,
          COALESCE(NULLIF(p.sku, ''), CONCAT('SKU-', UPPER(SUBSTRING(REPLACE(p.id::text, '-', ''), 1, 6)))) AS sku,
          ia.old_qty AS "oldQty",
          ia.new_qty AS "newQty",
          ia.change_qty AS change,
          ia.reason,
          COALESCE(ia.notes, '') AS notes,
          TO_CHAR(ia.created_at, 'YYYY-MM-DD') AS date,
          TO_CHAR(ia.created_at, 'HH24:MI') AS time,
          'Seller' AS "user",
          ia.warehouse
        FROM public.inventory_adjustments ia
        JOIN public.products p ON p.id = ia.product_id
        WHERE ia.seller_id = $1
        ORDER BY ia.created_at DESC
        LIMIT 100
      `,
      [sellerId]
    );

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        currentPage: 1,
        pageSize: result.rows.length,
        totalItems: result.rows.length,
        totalPages: 1
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch restock history', error: error.message });
  }
});

// GET /api/seller/inventory/low-stock-alerts
router.get('/low-stock-alerts', async (req, res) => {
  try {
    await ensureInventoryTables(req);
    const sellerId = await resolveSellerId(req);

    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        SELECT
          p.id,
          p.name AS product,
          COALESCE(NULLIF(p.sku, ''), CONCAT('SKU-', UPPER(SUBSTRING(REPLACE(p.id::text, '-', ''), 1, 6)))) AS sku,
          COALESCE(c.name, 'General') AS category,
          COALESCE(pd.stock_quantity, variants.stock_quantity, 0)::int AS stock,
          COALESCE(it.threshold, 10)::int AS threshold,
          COALESCE(it.warehouse, 'Main Warehouse') AS warehouse,
          COALESCE(p.base_price, 0)::numeric AS price
        FROM public.products p
        LEFT JOIN public.categories c ON c.id = p.category_id
        LEFT JOIN public.product_details pd ON pd.product_id = p.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(pv.stock_quantity), 0)::int AS stock_quantity
          FROM public.product_variants pv
          WHERE pv.product_id = p.id
        ) variants ON TRUE
        LEFT JOIN public.inventory_thresholds it ON it.product_id = p.id
        WHERE p.seller_id = $1
          AND COALESCE(pd.stock_quantity, variants.stock_quantity, 0) <= COALESCE(it.threshold, 10)
        ORDER BY COALESCE(pd.stock_quantity, variants.stock_quantity, 0) ASC
      `,
      [sellerId]
    );

    const alerts = result.rows.map((row) => ({
      ...row,
      status: stockStatus(row.stock, row.threshold),
      image: 'ðŸ“¦',
      variants: []
    }));

    return res.json({ success: true, data: alerts, count: alerts.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch low stock alerts', error: error.message });
  }
});

// POST /api/seller/inventory/bulk-restock
router.post('/bulk-restock', async (req, res) => {
  try {
    await ensureInventoryTables(req);
    const sellerId = await resolveSellerId(req);

    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const verified = await enforceSellerVerification(req, res, sellerId);
    if (!verified) {
      return;
    }

    const restockData = Array.isArray(req.body.data) ? req.body.data : [];
    if (!restockData.length) {
      return res.status(400).json({ success: false, message: 'Invalid data format. Expected array of restock items' });
    }

    const details = [];
    let success = 0;
    let failed = 0;

    for (const item of restockData) {
      const sku = String(item.sku || '').trim();
      const quantity = Number(item.quantity || 0);
      const warehouse = String(item.warehouse || 'Main Warehouse').trim() || 'Main Warehouse';
      const notes = String(item.notes || '').trim();

      if (!sku || Number.isNaN(quantity) || quantity <= 0) {
        failed += 1;
        details.push({ sku, status: 'failed', message: 'Invalid SKU or quantity' });
        continue;
      }

      const currentResult = await req.db.query(
        `
          SELECT
            p.id,
            p.name,
            COALESCE(pd.stock_quantity, variants.stock_quantity, 0)::int AS old_qty
          FROM public.products p
          LEFT JOIN public.product_details pd ON pd.product_id = p.id
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(pv.stock_quantity), 0)::int AS stock_quantity
            FROM public.product_variants pv
            WHERE pv.product_id = p.id
          ) variants ON TRUE
          WHERE p.seller_id = $1
            AND COALESCE(NULLIF(sku, ''), '') = $2
          LIMIT 1
        `,
        [sellerId, sku]
      );

      if (!currentResult.rows.length) {
        failed += 1;
        details.push({ sku, status: 'failed', message: 'Product not found' });
        continue;
      }

      const current = currentResult.rows[0];
      const newQty = Number(current.old_qty || 0) + quantity;

      await req.db.query(
        `
          INSERT INTO public.product_details (product_id, stock_quantity, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (product_id)
          DO UPDATE SET stock_quantity = EXCLUDED.stock_quantity, updated_at = NOW()
        `,
        [current.id, newQty]
      );

      await req.db.query(
        `
          INSERT INTO public.inventory_adjustments (
            seller_id,
          COALESCE(pd.stock_quantity, variants.stock_quantity, 0)::int AS stock,
            old_qty,
            new_qty,
            change_qty,
            action_type,
            reason,
        LEFT JOIN public.product_details pd ON pd.product_id = p.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(pv.stock_quantity), 0)::int AS stock_quantity
          FROM public.product_variants pv
          WHERE pv.product_id = p.id
        ) variants ON TRUE
            notes,
            warehouse,
          AND COALESCE(pd.stock_quantity, variants.stock_quantity, 0) <= COALESCE(it.threshold, 10)
        ORDER BY COALESCE(pd.stock_quantity, variants.stock_quantity, 0) ASC
          VALUES ($1, $2, $3, $4, $5, 'add', 'Bulk Restock', $6, $7, NOW())
        `,
        [sellerId, current.id, Number(current.old_qty || 0), newQty, quantity, notes || null, warehouse]
      );

      await req.db.query(
        `
          INSERT INTO public.inventory_thresholds (product_id, warehouse, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (product_id)
          DO UPDATE SET warehouse = EXCLUDED.warehouse, updated_at = NOW()
        `,
        [current.id, warehouse]
      );

      success += 1;
      details.push({ sku, status: 'success', message: `Updated ${current.name}` });
    }

    return res.json({
      success: true,
      message: `Bulk restock complete. Success: ${success}, Failed: ${failed}`,
      data: { success, failed, details }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to perform bulk restock', error: error.message });
  }
});

// PUT /api/seller/inventory/products/:productId/threshold
router.put('/products/:productId/threshold', async (req, res) => {
  try {
    await ensureInventoryTables(req);
    const sellerId = await resolveSellerId(req);

    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const verified = await enforceSellerVerification(req, res, sellerId);
    if (!verified) {
      return;
    }

    const productId = String(req.params.productId || '').trim();
    const threshold = Number(req.body.threshold);

    if (Number.isNaN(threshold) || threshold < 0) {
      return res.status(400).json({ success: false, message: 'Invalid threshold. Must be a non-negative number' });
    }

    const exists = await req.db.query(
      `
        SELECT p.id
        FROM public.products p
        WHERE p.seller_id = $1
          AND p.id::text = $2
        LIMIT 1
      `,
      [sellerId, productId]
    );

    if (!exists.rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    await req.db.query(
      `
        INSERT INTO public.inventory_thresholds (product_id, threshold, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (product_id)
        DO UPDATE SET threshold = EXCLUDED.threshold, updated_at = NOW()
      `,
      [exists.rows[0].id, threshold]
    );

    return res.json({
      success: true,
      message: 'Threshold updated successfully',
      data: {
        productId: exists.rows[0].id,
        newThreshold: threshold
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update threshold', error: error.message });
  }
});

// GET /api/seller/inventory/export
router.get('/export', async (req, res) => {
  try {
    await ensureInventoryTables(req);
    const sellerId = await resolveSellerId(req);

    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        SELECT
          p.name AS product,
          COALESCE(NULLIF(p.sku, ''), CONCAT('SKU-', UPPER(SUBSTRING(REPLACE(p.id::text, '-', ''), 1, 6)))) AS sku,
          COALESCE(c.name, 'General') AS category,
          COALESCE(pd.stock_quantity, variants.stock_quantity, 0)::int AS stock,
          COALESCE(it.threshold, 10)::int AS threshold,
          COALESCE(it.warehouse, 'Main Warehouse') AS warehouse,
          CASE
            WHEN COALESCE(pd.stock_quantity, variants.stock_quantity, 0) <= 0 THEN 'Out of Stock'
            WHEN COALESCE(pd.stock_quantity, variants.stock_quantity, 0) <= COALESCE(it.threshold, 10) THEN 'Low Stock'
            ELSE 'In Stock'
          END AS status,
          COALESCE(p.base_price, 0)::numeric AS price
        FROM public.products p
        LEFT JOIN public.categories c ON c.id = p.category_id
        LEFT JOIN public.product_details pd ON pd.product_id = p.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(pv.stock_quantity), 0)::int AS stock_quantity
          FROM public.product_variants pv
          WHERE pv.product_id = p.id
        ) variants ON TRUE
        LEFT JOIN public.inventory_thresholds it ON it.product_id = p.id
        WHERE p.seller_id = $1
        ORDER BY p.updated_at DESC
      `,
      [sellerId]
    );

    const header = 'Product Name,SKU,Category,Current Stock,Threshold,Status,Warehouse,Price\n';
    const rows = result.rows
      .map((item) => `"${item.product}","${item.sku}","${item.category}",${item.stock},${item.threshold},"${item.status}","${item.warehouse}",${item.price}`)
      .join('\n');

    const csv = `${header}${rows}${rows ? '\n' : ''}`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=inventory-${new Date().toISOString().split('T')[0]}.csv`);
    return res.status(200).send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to export inventory', error: error.message });
  }
});

// GET /api/seller/inventory/categories
router.get('/categories', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);

    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        SELECT DISTINCT COALESCE(c.name, 'General') AS category
        FROM public.products p
        LEFT JOIN public.categories c ON c.id = p.category_id
        WHERE p.seller_id = $1
        ORDER BY category ASC
      `,
      [sellerId]
    );

    return res.json({ success: true, data: result.rows.map((r) => r.category) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch categories', error: error.message });
  }
});

// GET /api/seller/inventory/warehouses
router.get('/warehouses', async (req, res) => {
  try {
    await ensureInventoryTables(req);
    const sellerId = await resolveSellerId(req);

    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        SELECT DISTINCT COALESCE(it.warehouse, 'Main Warehouse') AS warehouse
        FROM public.products p
        LEFT JOIN public.inventory_thresholds it ON it.product_id = p.id
        WHERE p.seller_id = $1
        ORDER BY warehouse ASC
      `,
      [sellerId]
    );

    return res.json({ success: true, data: result.rows.map((r) => r.warehouse) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch warehouses', error: error.message });
  }
});

// GET /api/seller/inventory/kyc
router.get('/kyc', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);

    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const profileResult = await req.db.query(
      `
        SELECT
             COALESCE(sp.store_name, 'Seller Store') AS seller_name,
          COALESCE(u.email, '-') AS email,
          COALESCE(u.phone, '-') AS phone,
             COALESCE(sp.kyc_status::text, 'pending') AS verification_status
        FROM public.seller_profiles sp
        JOIN public.users u ON u.id = sp.user_id
        WHERE sp.user_id = $1
        LIMIT 1
      `,
      [sellerId]
    );

    const docResult = await req.db.query(
      `
        SELECT document_type, verification_status::text AS status
        FROM public.seller_documents
        WHERE seller_id = $1
        ORDER BY created_at ASC
      `,
      [sellerId]
    );

    const profile = profileResult.rows[0] || {
      seller_name: 'Seller Store',
      email: '-',
      phone: '-',
      verification_status: 'pending'
    };

    return res.json({
      success: true,
      data: {
        sellerName: profile.seller_name,
        email: profile.email,
        phone: profile.phone,
        status: profile.verification_status,
        documents: docResult.rows
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch KYC status', error: error.message });
  }
});

module.exports = router;

