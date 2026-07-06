const productStatuses = ['pending', 'approved', 'rejected', 'disabled'];
const productVisibilities = ['live', 'hidden'];
const attributeTypes = ['dropdown', 'multi-select', 'text'];

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

const categoryIconMap = {
  men: 'male',
  women: 'female',
  kids: 'child_care',
  accessories: 'checkroom'
};

function getCategoryIcon(name, slug) {
  const normalizedName = normalizeText(name);
  const normalizedSlug = normalizeText(slug);
  return categoryIconMap[normalizedSlug] || categoryIconMap[normalizedName] || 'category';
}

function stockBucket(stock) {
  const s = Number(stock || 0);
  if (s === 0) return 'out-of-stock';
  if (s <= 20) return 'low-stock';
  return 'in-stock';
}

function mapDbStatusToUi(status) {
  if (status === 'active') return 'approved';
  if (status === 'inactive') return 'disabled';
  if (status === 'archived') return 'rejected';
  return 'pending';
}

function mapUiStatusToDb(status) {
  if (status === 'approved') return 'active';
  if (status === 'disabled') return 'inactive';
  if (status === 'rejected') return 'archived';
  return 'draft';
}

async function ensureProductAttributeColumns(db) {
  // Add filter attribute columns to products table if they don't exist
  const columns = [
    { name: 'color', type: 'VARCHAR(100)' },
    { name: 'size', type: 'VARCHAR(500)' }, // JSON-like comma-separated or array
    { name: 'fit_type', type: 'VARCHAR(100)' },
    { name: 'material', type: 'VARCHAR(100)' },
    { name: 'occasion', type: 'VARCHAR(100)' },
    { name: 'style', type: 'VARCHAR(100)' },
    { name: 'discount_percent', type: 'NUMERIC(5,2) DEFAULT 0' }
  ];

  for (const col of columns) {
    try {
      await db.query(`
        ALTER TABLE public.products
        ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}
      `);
    } catch (error) {
      // Column might already exist; silently continue
      console.warn(`Could not add column ${col.name}:`, error.message);
    }
  }
}

async function ensureSupportTables(db) {
  await ensureProductAttributeColumns(db);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.product_catalog_meta (
      product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
      visibility VARCHAR(10) NOT NULL DEFAULT 'hidden' CHECK (visibility IN ('live', 'hidden')),
      moderation_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
      quality_score INTEGER NOT NULL DEFAULT 80,
      views INTEGER NOT NULL DEFAULT 0,
      conversion_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
      refund_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.product_catalog_brand_meta (
      brand_id UUID PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
      category VARCHAR(120),
      status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending')),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.product_catalog_attributes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(120) NOT NULL,
      type VARCHAR(30) NOT NULL CHECK (type IN ('dropdown', 'multi-select', 'text')),
      values_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      categories_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.product_catalog_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action VARCHAR(80) NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id TEXT,
      admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function logAudit(db, { action, entityType, entityId, adminId = null, notes = '' }) {
  await ensureSupportTables(db);
  const validAdmin = /^[0-9a-fA-F-]{36}$/.test(String(adminId || '')) ? adminId : null;
  await db.query(
    `
      INSERT INTO public.product_catalog_audit (action, entity_type, entity_id, admin_id, notes)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [action, entityType, entityId ? String(entityId) : null, validAdmin, String(notes || '').trim() || null]
  );
}

async function getOverview(db) {
  await ensureSupportTables(db);

  const [products, categories, brands, attributes] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE p.status = 'draft')::int AS pending,
        COUNT(*) FILTER (WHERE p.status = 'active')::int AS approved,
        COUNT(*) FILTER (WHERE p.status = 'archived')::int AS rejected,
        COUNT(*) FILTER (WHERE p.status = 'inactive')::int AS disabled,
        COUNT(*) FILTER (WHERE COALESCE(stock.total_stock, 0) > 0 AND COALESCE(stock.total_stock, 0) <= 20)::int AS low_stock,
        COUNT(*) FILTER (WHERE COALESCE(stock.total_stock, 0) = 0)::int AS out_of_stock
      FROM public.products p
      LEFT JOIN (
        SELECT pv.product_id, SUM(pv.stock_quantity)::int AS total_stock
        FROM public.product_variants pv
        GROUP BY pv.product_id
      ) stock ON stock.product_id = p.id
    `),
    db.query('SELECT COUNT(*)::int AS total FROM public.categories'),
    db.query('SELECT COUNT(*)::int AS total FROM public.brands'),
    db.query('SELECT COUNT(*)::int AS total FROM public.product_catalog_attributes')
  ]);

  return {
    totalProducts: products.rows[0].total,
    pending: products.rows[0].pending,
    approved: products.rows[0].approved,
    rejected: products.rows[0].rejected,
    disabled: products.rows[0].disabled,
    lowStock: products.rows[0].low_stock,
    outOfStock: products.rows[0].out_of_stock,
    totalCategories: categories.rows[0].total,
    totalBrands: brands.rows[0].total,
    totalAttributes: attributes.rows[0].total
  };
}

async function getMeta(db) {
  await ensureSupportTables(db);

  const [categories, brands, sellers] = await Promise.all([
    db.query(`
      SELECT name
      FROM (
        SELECT DISTINCT
          COALESCE(c.name, '') AS name,
          CASE
            WHEN LOWER(c.name) = 'men' THEN 1
            WHEN LOWER(c.name) = 'women' THEN 2
            WHEN LOWER(c.name) = 'kids' THEN 3
            WHEN LOWER(c.name) = 'accessories' THEN 4
            ELSE 99
          END AS sort_order
        FROM public.categories c
        WHERE c.name IS NOT NULL
      ) categories
      ORDER BY sort_order, name
    `),
    db.query(`
      SELECT name
      FROM (
        SELECT DISTINCT COALESCE(b.name, '') AS name
        FROM public.brands b
        WHERE b.name IS NOT NULL
      ) brands
      ORDER BY name
    `),
    db.query(`
      SELECT DISTINCT COALESCE(sp.store_name, u.full_name) AS name
      FROM public.users u
      LEFT JOIN public.seller_profiles sp ON sp.user_id = u.id
      WHERE u.role = 'seller' AND COALESCE(sp.store_name, u.full_name) IS NOT NULL
      ORDER BY COALESCE(sp.store_name, u.full_name)
    `)
  ]);

  return {
    statuses: productStatuses,
    visibilities: productVisibilities,
    stockBuckets: ['in-stock', 'low-stock', 'out-of-stock'],
    categories: categories.rows.map((r) => r.name).filter(Boolean),
    brands: brands.rows.map((r) => r.name).filter(Boolean),
    sellers: sellers.rows.map((r) => r.name).filter(Boolean)
  };
}

async function fetchProducts(db, query = {}) {
  await ensureSupportTables(db);

  const params = [];
  const where = [];

  if (query.search) {
    params.push(`%${normalizeText(query.search)}%`);
    where.push(`(
      LOWER(p.name) LIKE $${params.length}
      OR LOWER(COALESCE(sp.store_name, su.full_name, '')) LIKE $${params.length}
      OR LOWER(COALESCE(p.sku, '')) LIKE $${params.length}
      OR LOWER(COALESCE(b.name, '')) LIKE $${params.length}
    )`);
  }

  if (query.category && query.category !== 'all') {
    params.push(normalizeText(query.category));
    where.push(`LOWER(COALESCE(c.name, '')) = $${params.length}`);
  }

  if (query.brand && query.brand !== 'all') {
    params.push(normalizeText(query.brand));
    where.push(`LOWER(COALESCE(b.name, '')) = $${params.length}`);
  }

  if (query.status && query.status !== 'all') {
    params.push(query.status);
    where.push(`CASE p.status WHEN 'active' THEN 'approved' WHEN 'inactive' THEN 'disabled' WHEN 'archived' THEN 'rejected' ELSE 'pending' END = $${params.length}`);
  }

  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const baseRows = await db.query(
    `
      SELECT
        p.id,
        p.name,
        p.description,
        COALESCE(sp.store_name, su.full_name, 'Seller') AS seller,
        COALESCE(c.name, 'Uncategorized') AS category,
        COALESCE(b.name, 'Unknown') AS brand,
        COALESCE(p.sku, '') AS sku,
        p.base_price AS price,
        COALESCE(stock.total_stock, 0)::int AS stock,
        p.status,
        COALESCE(meta.visibility, CASE WHEN p.status = 'active' THEN 'live' ELSE 'hidden' END) AS visibility,
        COALESCE(NULLIF(p.average_rating, 0), 4.0)::numeric(10,1) AS rating,
        COALESCE(p.total_reviews, 0)::int AS reviews,
        p.created_at AS "dateAdded",
        COALESCE(img.images, ARRAY['https://via.placeholder.com/400x400/334155/ffffff?text=Product']) AS images,
        COALESCE(sales.sales, 0)::int AS sales,
        COALESCE(sales.revenue, 0)::numeric(14,2) AS revenue,
        COALESCE(meta.views, 0)::int AS views,
        COALESCE(meta.conversion_rate, 0)::numeric(10,2) AS "conversionRate",
        COALESCE(meta.refund_rate, 0)::numeric(10,2) AS "refundRate",
        COALESCE(meta.moderation_flags, '[]'::jsonb) AS "moderationFlags",
        COALESCE(meta.quality_score, 80)::int AS "qualityScore"
      FROM public.products p
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      LEFT JOIN public.users su ON su.id = p.seller_id
      LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
      LEFT JOIN (
        SELECT pv.product_id, SUM(pv.stock_quantity)::int AS total_stock
        FROM public.product_variants pv
        GROUP BY pv.product_id
      ) stock ON stock.product_id = p.id
      LEFT JOIN (
        SELECT oi.product_id, SUM(oi.quantity)::int AS sales, SUM(oi.line_total)::numeric(14,2) AS revenue
        FROM public.order_items oi
        GROUP BY oi.product_id
      ) sales ON sales.product_id = p.id
      LEFT JOIN (
        SELECT pi.product_id, ARRAY_AGG(pi.image_url ORDER BY pi.sort_order, pi.created_at) AS images
        FROM public.product_images pi
        GROUP BY pi.product_id
      ) img ON img.product_id = p.id
      LEFT JOIN public.product_catalog_meta meta ON meta.product_id = p.id
      ${sqlWhere}
    `,
    params
  );

  let rows = baseRows.rows.map((r) => ({
    ...r,
    status: mapDbStatusToUi(r.status),
    stockStatus: stockBucket(r.stock)
  }));

  if (query.stock && query.stock !== 'all') {
    rows = rows.filter((r) => r.stockStatus === query.stock);
  }

  if (query.tab && query.tab !== 'all') {
    if (query.tab === 'low-stock') rows = rows.filter((r) => r.stockStatus === 'low-stock');
    else rows = rows.filter((r) => r.status === query.tab);
  }

  const sortKey = query.sortKey || 'dateAdded';
  const sortDir = String(query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  rows.sort((a, b) => {
    const aVal = sortKey === 'dateAdded' ? new Date(a.dateAdded).getTime() : a[sortKey];
    const bVal = sortKey === 'dateAdded' ? new Date(b.dateAdded).getTime() : b[sortKey];
    if (aVal === bVal) return 0;
    return sortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
  });

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.max(1, Math.min(parseInt(query.pageSize, 10) || 10, 100));
  const start = (page - 1) * pageSize;

  return {
    total: rows.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
    data: rows.slice(start, start + pageSize)
  };
}

async function getProduct(db, id) {
  const result = await fetchProducts(db, { search: '', page: 1, pageSize: 5000 });
  return result.data.find((r) => String(r.id) === String(id)) || null;
}

async function updateProductStatus(db, id, statusUi, visibility = null) {
  await db.query('UPDATE public.products SET status = $1::product_status, updated_at = NOW() WHERE id = $2', [mapUiStatusToDb(statusUi), id]);
  if (visibility) {
    await db.query(
      `
        INSERT INTO public.product_catalog_meta (product_id, visibility)
        VALUES ($1, $2)
        ON CONFLICT (product_id) DO UPDATE SET visibility = EXCLUDED.visibility, updated_at = NOW()
      `,
      [id, visibility]
    );
  }
}

async function updateProduct(db, id, payload = {}) {
  const fields = [];
  const values = [];

  const map = {
    name: 'name',
    description: 'description',
    sku: 'sku',
    price: 'base_price'
  };

  Object.entries(map).forEach(([k, col]) => {
    if (payload[k] !== undefined) {
      values.push(k === 'price' ? Number(payload[k]) : payload[k]);
      fields.push(`${col} = $${values.length}`);
    }
  });

  if (payload.category) {
    values.push(normalizeText(payload.category));
    fields.push(`category_id = (SELECT id FROM public.categories WHERE LOWER(name) = $${values.length} LIMIT 1)`);
  }

  if (payload.brand) {
    values.push(normalizeText(payload.brand));
    fields.push(`brand_id = (SELECT id FROM public.brands WHERE LOWER(name) = $${values.length} LIMIT 1)`);
  }

  if (fields.length) {
    values.push(id);
    await db.query(`UPDATE public.products SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
  }

  if (payload.stock !== undefined) {
    const current = await db.query('SELECT id FROM public.product_variants WHERE product_id = $1 ORDER BY created_at ASC LIMIT 1', [id]);
    if (current.rows[0]) {
      await db.query('UPDATE public.product_variants SET stock_quantity = $1, updated_at = NOW() WHERE id = $2', [Math.max(0, Number(payload.stock) || 0), current.rows[0].id]);
    } else {
      await db.query(
        `
          INSERT INTO public.product_variants (product_id, variant_name, price, stock_quantity)
          SELECT id, 'Default', base_price, $2 FROM public.products WHERE id = $1
        `,
        [id, Math.max(0, Number(payload.stock) || 0)]
      );
    }
  }
}

async function createProduct(db, payload = {}) {
  // Ensure attribute columns exist first
  await ensureProductAttributeColumns(db);

  const sellerName = normalizeText(payload.seller);
  const categoryName = normalizeText(payload.category);
  const brandName = normalizeText(payload.brand);

  const seller = await db.query(
    `
      SELECT u.id
      FROM public.users u
      LEFT JOIN public.seller_profiles sp ON sp.user_id = u.id
      WHERE u.role = 'seller' AND (LOWER(COALESCE(sp.store_name, u.full_name)) = $1 OR LOWER(u.full_name) = $1)
      LIMIT 1
    `,
    [sellerName]
  );

  if (!seller.rows[0]) throw new Error('Seller not found');

  const category = await db.query('SELECT id FROM public.categories WHERE LOWER(name) = $1 LIMIT 1', [categoryName]);
  const brand = await db.query('SELECT id FROM public.brands WHERE LOWER(name) = $1 LIMIT 1', [brandName]);

  const slugBase = String(payload.name || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const slug = `${slugBase}-${Date.now()}`;

  const created = await db.query(
    `
      INSERT INTO public.products (
        seller_id, category_id, brand_id, name, slug, description, base_price, sku, status,
        color, size, fit_type, material, occasion, style, discount_percent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `,
    [
      seller.rows[0].id,
      category.rows[0]?.id || null,
      brand.rows[0]?.id || null,
      payload.name,
      slug,
      payload.description || 'No description provided.',
      Number(payload.price) || 0,
      payload.sku || '',
      payload.color ? String(payload.color).trim() : null,
      payload.size ? String(payload.size).trim() : null,
      payload.fitType || payload.fit_type ? String(payload.fitType || payload.fit_type).trim() : null,
      payload.material ? String(payload.material).trim() : null,
      payload.occasion ? String(payload.occasion).trim() : null,
      payload.style ? String(payload.style).trim() : null,
      Number(payload.discountPercent || payload.discount_percent) || 0
    ]
  );

  const id = created.rows[0].id;

  await db.query(
    `
      INSERT INTO public.product_variants (product_id, variant_name, price, stock_quantity)
      VALUES ($1, 'Default', $2, $3)
    `,
    [id, Number(payload.price) || 0, Math.max(0, Number(payload.stock) || 0)]
  );

  if (Array.isArray(payload.images) && payload.images.length) {
    for (let i = 0; i < payload.images.length; i += 1) {
      await db.query(
        'INSERT INTO public.product_images (product_id, image_url, sort_order, is_primary) VALUES ($1, $2, $3, $4)',
        [id, payload.images[i], i, i === 0]
      );
    }
  }

  await db.query(
    `
      INSERT INTO public.product_catalog_meta (product_id, visibility, quality_score)
      VALUES ($1, 'hidden', $2)
      ON CONFLICT (product_id) DO NOTHING
    `,
    [id, Number(payload.qualityScore) || 75]
  );

  return id;
}

async function deleteProduct(db, id) {
  const result = await db.query('DELETE FROM public.products WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

async function getCategories(db) {
  const result = await db.query(
    `
      SELECT
        c.id,
        c.parent_id AS parent,
        c.name,
        COALESCE(c.slug, 'category') AS icon,
        c.is_active AS active,
        COUNT(p.id)::int AS "productCount"
      FROM public.categories c
      LEFT JOIN public.products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY CASE
        WHEN LOWER(c.name) = 'men' THEN 1
        WHEN LOWER(c.name) = 'women' THEN 2
        WHEN LOWER(c.name) = 'kids' THEN 3
        WHEN LOWER(c.name) = 'accessories' THEN 4
        ELSE 99
      END, c.name
    `
  );
  return result.rows.map((row) => ({
    ...row,
    icon: getCategoryIcon(row.name, row.icon)
  }));
}

async function createCategory(db, payload) {
  const slug = String(payload.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `category-${Date.now()}`;
  const result = await db.query(
    `
      INSERT INTO public.categories (parent_id, name, slug, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING id, parent_id AS parent, name, slug AS icon, is_active AS active
    `,
    [payload.parent || null, payload.name, slug, payload.active !== false]
  );
  return {
    ...result.rows[0],
    icon: getCategoryIcon(result.rows[0]?.name, result.rows[0]?.icon)
  };
}

async function updateCategory(db, id, payload) {
  const fields = [];
  const values = [];

  if (payload.name !== undefined) {
    values.push(payload.name);
    fields.push(`name = $${values.length}`);
  }
  if (payload.icon !== undefined) {
    values.push(payload.icon);
    fields.push(`slug = $${values.length}`);
  }
  if (payload.active !== undefined) {
    values.push(Boolean(payload.active));
    fields.push(`is_active = $${values.length}`);
  }
  if (payload.parent !== undefined) {
    values.push(payload.parent || null);
    fields.push(`parent_id = $${values.length}`);
  }

  if (!fields.length) return null;
  values.push(id);

  const result = await db.query(
    `
      UPDATE public.categories
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING id, parent_id AS parent, name, slug AS icon, is_active AS active
    `,
    values
  );

  if (!result.rows[0]) return null;
  return {
    ...result.rows[0],
    icon: getCategoryIcon(result.rows[0].name, result.rows[0].icon)
  };
}

async function deleteCategory(db, id) {
  const linked = await db.query('SELECT COUNT(*)::int AS count FROM public.products WHERE category_id = $1', [id]);
  if (Number(linked.rows[0].count || 0) > 0) {
    throw new Error('Cannot delete category with assigned products');
  }
  const result = await db.query('DELETE FROM public.categories WHERE id = $1 RETURNING id, name', [id]);
  return result.rows[0] || null;
}

async function getBrands(db, query = {}) {
  await ensureSupportTables(db);
  const search = normalizeText(query.search || '');
  const status = normalizeText(query.status || '');

  const result = await db.query(
    `
      SELECT
        b.id,
        b.name,
        COALESCE(meta.category, 'General') AS category,
        COALESCE(meta.status, 'approved') AS status,
        b.created_at AS "dateAdded",
        COUNT(p.id)::int AS "productCount"
      FROM public.brands b
      LEFT JOIN public.product_catalog_brand_meta meta ON meta.brand_id = b.id
      LEFT JOIN public.products p ON p.brand_id = b.id
      GROUP BY b.id, meta.category, meta.status
      ORDER BY b.name
    `
  );

  let rows = result.rows.map((r) => ({
    ...r,
    logo: `https://ui-avatars.com/api/?name=${encodeURIComponent(r.name)}&background=random&size=80`
  }));

  if (search) rows = rows.filter((r) => normalizeText(r.name).includes(search) || normalizeText(r.category).includes(search));
  if (status && status !== 'all') rows = rows.filter((r) => normalizeText(r.status) === status);

  return rows;
}

async function createBrand(db, payload) {
  const slug = String(payload.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `brand-${Date.now()}`;
  const created = await db.query('INSERT INTO public.brands (name, slug) VALUES ($1, $2) RETURNING id, name, created_at AS "dateAdded"', [payload.name, slug]);
  const id = created.rows[0].id;

  await db.query(
    `
      INSERT INTO public.product_catalog_brand_meta (brand_id, category, status)
      VALUES ($1, $2, $3)
      ON CONFLICT (brand_id) DO UPDATE SET category = EXCLUDED.category, status = EXCLUDED.status, updated_at = NOW()
    `,
    [id, payload.category || 'General', payload.status || 'approved']
  );

  return {
    ...created.rows[0],
    category: payload.category || 'General',
    status: payload.status || 'approved',
    productCount: 0,
    logo: `https://ui-avatars.com/api/?name=${encodeURIComponent(created.rows[0].name)}&background=random&size=80`
  };
}

async function updateBrand(db, id, payload) {
  if (payload.name !== undefined) {
    await db.query('UPDATE public.brands SET name = $1, updated_at = NOW() WHERE id = $2', [payload.name, id]);
  }

  await ensureSupportTables(db);
  const meta = {};
  if (payload.category !== undefined) meta.category = payload.category;
  if (payload.status !== undefined) meta.status = payload.status;

  if (Object.keys(meta).length) {
    await db.query(
      `
        INSERT INTO public.product_catalog_brand_meta (brand_id, category, status)
        VALUES ($1, COALESCE($2, 'General'), COALESCE($3, 'approved'))
        ON CONFLICT (brand_id) DO UPDATE
        SET category = COALESCE($2, public.product_catalog_brand_meta.category),
            status = COALESCE($3, public.product_catalog_brand_meta.status),
            updated_at = NOW()
      `,
      [id, meta.category, meta.status]
    );
  }

  const rows = await getBrands(db, {});
  return rows.find((r) => String(r.id) === String(id)) || null;
}

async function deleteBrand(db, id) {
  const linked = await db.query('SELECT COUNT(*)::int AS count FROM public.products WHERE brand_id = $1', [id]);
  if (Number(linked.rows[0].count || 0) > 0) {
    throw new Error('Cannot delete brand with assigned products');
  }

  const result = await db.query('DELETE FROM public.brands WHERE id = $1 RETURNING id, name', [id]);
  return result.rows[0] || null;
}

async function getAttributes(db, query = {}) {
  await ensureSupportTables(db);
  const result = await db.query(
    `
      SELECT id, name, type, values_json AS values, categories_json AS categories, active
      FROM public.product_catalog_attributes
      ORDER BY created_at DESC
    `
  );

  const activeFilter = normalizeText(query.active || '');
  let rows = result.rows;
  if (activeFilter === 'true' || activeFilter === 'false') rows = rows.filter((r) => Boolean(r.active) === (activeFilter === 'true'));
  return rows;
}

async function createAttribute(db, payload) {
  const result = await db.query(
    `
      INSERT INTO public.product_catalog_attributes (name, type, values_json, categories_json, active)
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
      RETURNING id, name, type, values_json AS values, categories_json AS categories, active
    `,
    [
      payload.name,
      payload.type,
      JSON.stringify(Array.isArray(payload.values) ? payload.values : []),
      JSON.stringify(Array.isArray(payload.categories) ? payload.categories : []),
      payload.active !== false
    ]
  );

  return result.rows[0];
}

async function updateAttribute(db, id, payload) {
  const fields = [];
  const values = [];

  if (payload.name !== undefined) {
    values.push(payload.name);
    fields.push(`name = $${values.length}`);
  }
  if (payload.type !== undefined) {
    values.push(payload.type);
    fields.push(`type = $${values.length}`);
  }
  if (payload.values !== undefined) {
    values.push(JSON.stringify(Array.isArray(payload.values) ? payload.values : String(payload.values).split(',').map((x) => x.trim()).filter(Boolean)));
    fields.push(`values_json = $${values.length}::jsonb`);
  }
  if (payload.categories !== undefined) {
    values.push(JSON.stringify(Array.isArray(payload.categories) ? payload.categories : String(payload.categories).split(',').map((x) => x.trim()).filter(Boolean)));
    fields.push(`categories_json = $${values.length}::jsonb`);
  }
  if (payload.active !== undefined) {
    values.push(Boolean(payload.active));
    fields.push(`active = $${values.length}`);
  }

  if (!fields.length) return null;
  values.push(id);

  const result = await db.query(
    `
      UPDATE public.product_catalog_attributes
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING id, name, type, values_json AS values, categories_json AS categories, active
    `,
    values
  );

  return result.rows[0] || null;
}

async function deleteAttribute(db, id) {
  const result = await db.query('DELETE FROM public.product_catalog_attributes WHERE id = $1 RETURNING id, name', [id]);
  return result.rows[0] || null;
}

async function getAuditLog(db, limit = 100) {
  await ensureSupportTables(db);
  const lim = Math.max(1, Math.min(parseInt(limit, 10) || 100, 500));
  const result = await db.query(
    `
      SELECT id, action, entity_type AS "entityType", entity_id AS "entityId", admin_id AS "adminId", notes, created_at AS timestamp
      FROM public.product_catalog_audit
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [lim]
  );
  return result.rows;
}

module.exports = {
  productStatuses,
  productVisibilities,
  attributeTypes,
  normalizeText,
  stockBucket,
  ensureSupportTables,
  logAudit,
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
  getAuditLog
};
