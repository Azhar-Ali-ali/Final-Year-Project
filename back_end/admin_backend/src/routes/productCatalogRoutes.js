const express = require('express');
const {
  productStatuses,
  productVisibilities,
  attributeTypes,
  normalizeText,
  stockBucket,
  getOverview,
  getMeta,
  fetchProducts,
  getProduct,
  createProduct,
  updateProduct,
  updateProductStatus,
  deleteProduct,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getBrands,
  createBrand,
  updateBrand,
  deleteBrand,
  getAttributes,
  createAttribute,
  updateAttribute,
  deleteAttribute,
  getAuditLog,
  logAudit
} = require('../data/productCatalogData');

const router = express.Router();

function adminId(req) {
  return String(req.headers['x-admin-id'] || req.body?.adminId || req.query?.adminId || '').trim() || null;
}

function csvEscape(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

router.get('/overview', async (req, res) => {
  try {
    const data = await getOverview(req.db);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load overview', error: error.message });
  }
});

router.get('/meta', async (req, res) => {
  try {
    const data = await getMeta(req.db);
    return res.json({
      success: true,
      data: {
        statuses: productStatuses,
        visibilities: productVisibilities,
        stockBuckets: ['in-stock', 'low-stock', 'out-of-stock'],
        categories: data.categories,
        brands: data.brands,
        attributeTypes
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load metadata', error: error.message });
  }
});

router.get('/products', async (req, res) => {
  try {
    const data = await fetchProducts(req.db, req.query || {});
    return res.json({ success: true, ...data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load products', error: error.message });
  }
});

router.get('/products/export', async (req, res) => {
  try {
    const result = await fetchProducts(req.db, { ...(req.query || {}), page: 1, pageSize: 100000 });
    const headers = ['ID', 'Name', 'Seller', 'Category', 'Brand', 'SKU', 'Price', 'Stock', 'Status', 'Visibility', 'Rating', 'Date Added'];
    const rows = result.data.map((item) => [
      item.id,
      item.name,
      item.seller,
      item.category,
      item.brand,
      item.sku,
      item.price,
      item.stock,
      item.status,
      item.visibility,
      item.rating,
      item.dateAdded
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');

    await logAudit(req.db, {
      action: 'product_export',
      entityType: 'product',
      entityId: null,
      adminId: adminId(req),
      notes: `Exported ${result.data.length} products`
    });

    res.type('text/csv');
    res.header('Content-Disposition', `attachment; filename="products_export_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to export products', error: error.message });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const product = await getProduct(req.db, req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    return res.json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch product', error: error.message });
  }
});

router.post('/products', async (req, res) => {
  try {
    const required = ['name', 'seller', 'category', 'brand', 'sku'];
    const missing = required.find((f) => !String(req.body?.[f] || '').trim());
    if (missing) return res.status(400).json({ success: false, message: `${missing} is required` });

    const id = await createProduct(req.db, req.body || {});
    await logAudit(req.db, {
      action: 'product_created',
      entityType: 'product',
      entityId: id,
      adminId: adminId(req),
      notes: `Created ${req.body.name}`
    });

    const product = await getProduct(req.db, id);
    return res.status(201).json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create product', error: error.message });
  }
});

router.put('/products/:id', async (req, res) => {
  try {
    await updateProduct(req.db, req.params.id, req.body || {});
    await logAudit(req.db, {
      action: 'product_updated',
      entityType: 'product',
      entityId: req.params.id,
      adminId: adminId(req),
      notes: 'Product updated'
    });
    const product = await getProduct(req.db, req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    return res.json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update product', error: error.message });
  }
});

router.post('/products/:id/approve', async (req, res) => {
  try {
    await updateProductStatus(req.db, req.params.id, 'approved', 'live');
    await logAudit(req.db, {
      action: 'product_approved',
      entityType: 'product',
      entityId: req.params.id,
      adminId: adminId(req),
      notes: String(req.body?.notes || 'Approved by admin')
    });
    const product = await getProduct(req.db, req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    return res.json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to approve product', error: error.message });
  }
});

router.post('/products/:id/reject', async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });

    await updateProductStatus(req.db, req.params.id, 'rejected', 'hidden');
    await logAudit(req.db, {
      action: 'product_rejected',
      entityType: 'product',
      entityId: req.params.id,
      adminId: adminId(req),
      notes: reason
    });

    const product = await getProduct(req.db, req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    return res.json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to reject product', error: error.message });
  }
});

router.post('/products/:id/disable', async (req, res) => {
  try {
    await updateProductStatus(req.db, req.params.id, 'disabled', 'hidden');
    await logAudit(req.db, {
      action: 'product_disabled',
      entityType: 'product',
      entityId: req.params.id,
      adminId: adminId(req),
      notes: String(req.body?.notes || 'Disabled by admin')
    });

    const product = await getProduct(req.db, req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    return res.json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to disable product', error: error.message });
  }
});

router.post('/products/:id/toggle-visibility', async (req, res) => {
  try {
    const product = await getProduct(req.db, req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    if (product.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Only approved products can change visibility' });
    }

    const next = product.visibility === 'live' ? 'hidden' : 'live';
    await updateProductStatus(req.db, req.params.id, 'approved', next);

    await logAudit(req.db, {
      action: 'product_visibility_toggled',
      entityType: 'product',
      entityId: req.params.id,
      adminId: adminId(req),
      notes: `Visibility set to ${next}`
    });

    const updated = await getProduct(req.db, req.params.id);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to toggle visibility', error: error.message });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    const removed = await deleteProduct(req.db, req.params.id);
    if (!removed) return res.status(404).json({ success: false, message: 'Product not found' });

    await logAudit(req.db, {
      action: 'product_deleted',
      entityType: 'product',
      entityId: req.params.id,
      adminId: adminId(req),
      notes: 'Deleted by admin'
    });

    return res.json({ success: true, data: removed });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete product', error: error.message });
  }
});

router.post('/products/bulk', async (req, res) => {
  try {
    const action = normalizeText(req.body?.action);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length || !action) return res.status(400).json({ success: false, message: 'action and ids[] are required' });

    let affected = 0;

    if (action === 'delete') {
      for (const id of ids) {
        const removed = await deleteProduct(req.db, id);
        if (removed) affected += 1;
      }
    } else if (['approve', 'reject', 'disable'].includes(action)) {
      for (const id of ids) {
        const current = await getProduct(req.db, id);
        if (!current) continue;
        if (action === 'approve') await updateProductStatus(req.db, id, 'approved', 'live');
        if (action === 'reject') await updateProductStatus(req.db, id, 'rejected', 'hidden');
        if (action === 'disable') await updateProductStatus(req.db, id, 'disabled', 'hidden');
        affected += 1;
      }
    } else {
      return res.status(400).json({ success: false, message: 'Unsupported bulk action' });
    }

    await logAudit(req.db, {
      action: `product_bulk_${action}`,
      entityType: 'product',
      entityId: ids.join(','),
      adminId: adminId(req),
      notes: `${affected} products updated`
    });

    return res.json({ success: true, affected });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to run bulk action', error: error.message });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const data = await getCategories(req.db);
    return res.json({ success: true, total: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load categories', error: error.message });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const icon = String(req.body?.icon || '').trim();
    if (!name || !icon) return res.status(400).json({ success: false, message: 'name and icon are required' });

    const category = await createCategory(req.db, {
      name,
      icon,
      active: req.body?.active !== false,
      parent: req.body?.parent || null
    });

    await logAudit(req.db, {
      action: 'category_created',
      entityType: 'category',
      entityId: category.id,
      adminId: adminId(req),
      notes: `Category ${name} created`
    });

    return res.status(201).json({ success: true, data: category });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create category', error: error.message });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const category = await updateCategory(req.db, req.params.id, req.body || {});
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    await logAudit(req.db, {
      action: 'category_updated',
      entityType: 'category',
      entityId: category.id,
      adminId: adminId(req),
      notes: `Category ${category.name} updated`
    });

    return res.json({ success: true, data: category });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update category', error: error.message });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const deleted = await deleteCategory(req.db, req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Category not found' });

    await logAudit(req.db, {
      action: 'category_deleted',
      entityType: 'category',
      entityId: deleted.id,
      adminId: adminId(req),
      notes: `Category ${deleted.name} deleted`
    });

    return res.json({ success: true, data: deleted });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to delete category' });
  }
});

router.get('/brands', async (req, res) => {
  try {
    const data = await getBrands(req.db, req.query || {});
    return res.json({ success: true, total: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load brands', error: error.message });
  }
});

router.post('/brands', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const category = String(req.body?.category || '').trim();
    if (!name || !category) return res.status(400).json({ success: false, message: 'name and category are required' });

    const brand = await createBrand(req.db, { name, category, status: 'approved' });

    await logAudit(req.db, {
      action: 'brand_created',
      entityType: 'brand',
      entityId: brand.id,
      adminId: adminId(req),
      notes: `Brand ${brand.name} created`
    });

    return res.status(201).json({ success: true, data: brand });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create brand', error: error.message });
  }
});

router.post('/brands/:id/approve', async (req, res) => {
  try {
    const brand = await updateBrand(req.db, req.params.id, { status: 'approved' });
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });

    await logAudit(req.db, {
      action: 'brand_approved',
      entityType: 'brand',
      entityId: brand.id,
      adminId: adminId(req),
      notes: String(req.body?.notes || `${brand.name} approved`)
    });

    return res.json({ success: true, data: brand });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to approve brand', error: error.message });
  }
});

router.put('/brands/:id', async (req, res) => {
  try {
    const brand = await updateBrand(req.db, req.params.id, req.body || {});
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });

    await logAudit(req.db, {
      action: 'brand_updated',
      entityType: 'brand',
      entityId: brand.id,
      adminId: adminId(req),
      notes: `Brand ${brand.name} updated`
    });

    return res.json({ success: true, data: brand });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update brand', error: error.message });
  }
});

router.delete('/brands/:id', async (req, res) => {
  try {
    const deleted = await deleteBrand(req.db, req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Brand not found' });

    await logAudit(req.db, {
      action: 'brand_deleted',
      entityType: 'brand',
      entityId: deleted.id,
      adminId: adminId(req),
      notes: `Brand ${deleted.name} deleted`
    });

    return res.json({ success: true, data: deleted });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to delete brand' });
  }
});

router.get('/attributes', async (req, res) => {
  try {
    const data = await getAttributes(req.db, req.query || {});
    return res.json({ success: true, total: data.length, data, meta: { supportedTypes: attributeTypes } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load attributes', error: error.message });
  }
});

router.post('/attributes', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const type = normalizeText(req.body?.type);
    if (!name || !type) return res.status(400).json({ success: false, message: 'name and type are required' });
    if (!attributeTypes.includes(type)) {
      return res.status(400).json({ success: false, message: `type must be one of: ${attributeTypes.join(', ')}` });
    }

    const attribute = await createAttribute(req.db, {
      name,
      type,
      values: Array.isArray(req.body?.values) ? req.body.values : [],
      categories: Array.isArray(req.body?.categories) ? req.body.categories : [],
      active: req.body?.active !== false
    });

    await logAudit(req.db, {
      action: 'attribute_created',
      entityType: 'attribute',
      entityId: attribute.id,
      adminId: adminId(req),
      notes: `Attribute ${attribute.name} created`
    });

    return res.status(201).json({ success: true, data: attribute });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create attribute', error: error.message });
  }
});

router.put('/attributes/:id', async (req, res) => {
  try {
    if (req.body?.type && !attributeTypes.includes(normalizeText(req.body.type))) {
      return res.status(400).json({ success: false, message: `type must be one of: ${attributeTypes.join(', ')}` });
    }

    const attribute = await updateAttribute(req.db, req.params.id, req.body || {});
    if (!attribute) return res.status(404).json({ success: false, message: 'Attribute not found' });

    await logAudit(req.db, {
      action: 'attribute_updated',
      entityType: 'attribute',
      entityId: attribute.id,
      adminId: adminId(req),
      notes: `Attribute ${attribute.name} updated`
    });

    return res.json({ success: true, data: attribute });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update attribute', error: error.message });
  }
});

router.delete('/attributes/:id', async (req, res) => {
  try {
    const deleted = await deleteAttribute(req.db, req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Attribute not found' });

    await logAudit(req.db, {
      action: 'attribute_deleted',
      entityType: 'attribute',
      entityId: deleted.id,
      adminId: adminId(req),
      notes: `Attribute ${deleted.name} deleted`
    });

    return res.json({ success: true, data: deleted });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete attribute', error: error.message });
  }
});

router.get('/analytics/top-products', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 10, 100));
    const rows = await fetchProducts(req.db, { page: 1, pageSize: 1000, sortKey: 'sales', sortDir: 'desc' });
    return res.json({ success: true, total: Math.min(limit, rows.data.length), data: rows.data.slice(0, limit) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch top products', error: error.message });
  }
});

router.get('/analytics/stock-alerts', async (req, res) => {
  try {
    const rows = await fetchProducts(req.db, { page: 1, pageSize: 2000 });
    const alerts = rows.data
      .filter((item) => stockBucket(item.stock) !== 'in-stock')
      .map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        stock: item.stock,
        stockStatus: stockBucket(item.stock),
        status: item.status
      }));

    return res.json({ success: true, total: alerts.length, data: alerts });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch stock alerts', error: error.message });
  }
});

router.get('/audit-log', async (req, res) => {
  try {
    const data = await getAuditLog(req.db, req.query.limit || 100);
    return res.json({ success: true, total: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch audit log', error: error.message });
  }
});

module.exports = router;
