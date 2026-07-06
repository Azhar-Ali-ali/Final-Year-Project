const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../../../database/postgresClient');

const router = express.Router();
const projectRootPath = path.resolve(__dirname, '../../../..');
const uploadsProductsPath = path.join(projectRootPath, 'uploads', 'products');
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const MIME_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
};

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
      // Keep compatibility across deployments that use only one schema.
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
      message: 'Verify KYC first to add or update products'
    });
    return false;
  }

  return true;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'product';
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapUiStatusToDb(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'pending approval' || value === 'pending' || value === 'draft') return 'draft';
  if (value === 'active') return 'active';
  if (value === 'draft') return 'draft';
  if (value === 'hidden') return 'inactive';
  if (value === 'approved') return 'active';
  return '';
}

function mapDbStatusToUi(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'active') return 'Approved';
  if (value === 'draft') return 'Pending Approval';
  if (value === 'archived') return 'Rejected';
  return 'Hidden';
}

function normalizeCategoryName(name) {
  return String(name || '').trim();
}

function normalizeProductRow(row) {
  const images = Array.isArray(row.images) ? row.images.filter(Boolean) : [];
  const variants = Array.isArray(row.variants)
    ? row.variants.map((variant) => ({
        id: variant.id,
        color: variant.color || variant.attributes?.color || variant.attributes?.Color || '',
        size: variant.size || variant.attributes?.size || variant.attributes?.Size || '',
        variantName: variant.variant_name || variant.variantName || '',
        price: variant.price !== null && variant.price !== undefined ? Number(variant.price) : null,
        stock: variant.stock !== null && variant.stock !== undefined ? Number(variant.stock) : 0,
        sku: variant.sku || '',
        attributes: variant.attributes || {}
      }))
    : [];
  const reviews = Array.isArray(row.reviews)
    ? row.reviews.map((review) => ({
        id: review.id,
        customerName: review.customerName || 'Customer',
        rating: Number(review.rating || 0),
        comment: review.comment || '',
        date: review.date,
        sellerReply: review.sellerReply || null
      }))
    : [];
  const stock = Number(row.stock_quantity || 0);
  const computedRating = reviews.length
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
    : Number(row.average_rating || 0);
  const reviewCount = reviews.length || Number(row.total_reviews || 0);

  return {
    id: row.id,
    name: row.name,
    brand: row.brand_name || '',
    sku: row.sku || '',
    barcode: row.barcode || '',
    category: row.category_name || '',
    price: Number(row.base_price || 0),
    discountPrice: row.compare_price !== null && row.compare_price !== undefined ? Number(row.compare_price) : null,
    stock,
    color: row.color || null,
    size: row.size || null,
    fitType: row.fit_type || null,
    material: row.material || null,
    occasion: row.occasion || null,
    style: row.style || null,
    discountPercent: row.discount_percent !== null && row.discount_percent !== undefined ? Number(row.discount_percent) : 0,
    status: mapDbStatusToUi(row.status),
    description: row.description || '',
    weight: row.weight !== null && row.weight !== undefined ? Number(row.weight) : null,
    length: row.length !== null && row.length !== undefined ? Number(row.length) : null,
    width: row.width !== null && row.width !== undefined ? Number(row.width) : null,
    height: row.height !== null && row.height !== undefined ? Number(row.height) : null,
    rating: Number.isFinite(computedRating) ? Number(computedRating.toFixed(1)) : 0,
    reviewCount,
    variants,
    images,
    reviews
  };
}

async function ensureProductCompanionTables(dbClient) {
  // Ensure `products` table contains optional attribute columns used by the UI.
  await dbClient.query(`
    ALTER TABLE IF EXISTS public.products
    ADD COLUMN IF NOT EXISTS color VARCHAR(120),
    ADD COLUMN IF NOT EXISTS size VARCHAR(120),
    ADD COLUMN IF NOT EXISTS fit_type VARCHAR(120),
    ADD COLUMN IF NOT EXISTS material VARCHAR(120),
    ADD COLUMN IF NOT EXISTS occasion VARCHAR(120),
    ADD COLUMN IF NOT EXISTS style VARCHAR(120),
    ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(7,2) DEFAULT 0
  `);
  await dbClient.query(`
    CREATE TABLE IF NOT EXISTS public.product_details (
      product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
      barcode VARCHAR(120),
      stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
      weight NUMERIC(12,3),
      length NUMERIC(12,3),
      width NUMERIC(12,3),
      height NUMERIC(12,3),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbClient.query(`
    CREATE TABLE IF NOT EXISTS public.product_review_replies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      review_id UUID NOT NULL UNIQUE REFERENCES public.product_reviews(id) ON DELETE CASCADE,
      seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      reply_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function resolveCategoryId(dbClient, categoryName) {
  const normalized = normalizeCategoryName(categoryName);
  if (!normalized) return null;

  const slug = slugify(normalized);
  const existing = await dbClient.query(
    `
      SELECT id
      FROM public.categories
      WHERE LOWER(name) = LOWER($1) OR slug = $2
      LIMIT 1
    `,
    [normalized, slug]
  );

  if (existing.rows.length) {
    return existing.rows[0].id;
  }

  const inserted = await dbClient.query(
    `
      INSERT INTO public.categories (name, slug, description, is_active)
      VALUES ($1, $2, NULL, TRUE)
      RETURNING id
    `,
    [normalized, slug]
  );

  return inserted.rows[0].id;
}

async function resolveBrandId(dbClient, brandName) {
  const normalized = String(brandName || '').trim();
  if (!normalized) return null;

  const slug = slugify(normalized);
  const existing = await dbClient.query(
    `
      SELECT id
      FROM public.brands
      WHERE LOWER(name) = LOWER($1) OR slug = $2
      LIMIT 1
    `,
    [normalized, slug]
  );

  if (existing.rows.length) {
    return existing.rows[0].id;
  }

  const inserted = await dbClient.query(
    `
      INSERT INTO public.brands (name, slug)
      VALUES ($1, $2)
      RETURNING id
    `,
    [normalized, slug]
  );

  return inserted.rows[0].id;
}

async function fetchProducts(dbClient, sellerId, productId = null) {
  const params = [sellerId];
  const productClause = productId ? 'AND p.id = $2' : '';
  if (productId) {
    params.push(productId);
  }

  const result = await dbClient.query(
    `
      SELECT
        p.id,
        p.name,
        p.color,
        p.size,
        p.fit_type,
        p.material,
        p.occasion,
        p.style,
        p.discount_percent,
        p.sku,
        p.description,
        p.base_price,
        p.compare_price,
        p.status,
        p.average_rating,
        p.total_reviews,
        COALESCE(pd.barcode, '') AS barcode,
        pd.weight,
        pd.length,
        pd.width,
        pd.height,
        COALESCE(pd.stock_quantity, variants.stock_quantity, 0)::int AS stock_quantity,
        COALESCE(c.name, '') AS category_name,
        COALESCE(b.name, '') AS brand_name,
        COALESCE(images.images, '[]'::json) AS images,
        COALESCE(variants.variants, '[]'::json) AS variants,
        COALESCE(reviews.reviews, '[]'::json) AS reviews
      FROM public.products p
      LEFT JOIN public.product_details pd ON pd.product_id = p.id
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(pv.stock_quantity), 0)::int AS stock_quantity,
          json_agg(
            json_build_object(
              'id', pv.id,
              'color', COALESCE(NULLIF(pv.attributes->>'color', ''), ''),
              'size', COALESCE(NULLIF(pv.attributes->>'size', ''), ''),
              'variantName', COALESCE(NULLIF(pv.variant_name, ''), ''),
              'price', pv.price,
              'stock', pv.stock_quantity,
              'sku', pv.sku,
              'attributes', pv.attributes
            )
            ORDER BY pv.created_at ASC
          ) AS variants
        FROM public.product_variants pv
        WHERE pv.product_id = p.id
      ) variants ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(pi.image_url ORDER BY pi.sort_order ASC, pi.created_at ASC) AS images
        FROM public.product_images pi
        WHERE pi.product_id = p.id
      ) images ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', pr.id,
            'customerName', u.full_name,
            'rating', pr.rating,
            'comment', COALESCE(NULLIF(pr.body, ''), NULLIF(pr.title, ''), ''),
            'date', pr.created_at,
            'sellerReply', reply.reply_text
          )
          ORDER BY pr.created_at DESC
        ) AS reviews
        FROM public.product_reviews pr
        JOIN public.users u ON u.id = pr.customer_id
        LEFT JOIN LATERAL (
          SELECT prr.reply_text
          FROM public.product_review_replies prr
          WHERE prr.review_id = pr.id
          LIMIT 1
        ) reply ON TRUE
        WHERE pr.product_id = p.id AND NOT pr.is_hidden
      ) reviews ON TRUE
      WHERE p.seller_id = $1 ${productClause}
      ORDER BY p.created_at DESC
    `,
    params
  );

  return result.rows.map(normalizeProductRow);
}

function validateProductPayload(payload, partial = false) {
  const requiredFields = ['name', 'sku', 'category', 'price', 'stock', 'status'];

  if (!partial) {
    for (const field of requiredFields) {
      if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
        return `Missing required field: ${field}`;
      }
    }
  }

  if (payload.price !== undefined && (Number.isNaN(Number(payload.price)) || Number(payload.price) < 0)) {
    return 'price must be a non-negative number';
  }

  if (payload.stock !== undefined && (Number.isNaN(Number(payload.stock)) || Number(payload.stock) < 0)) {
    return 'stock must be a non-negative number';
  }

  if (payload.status !== undefined && !mapUiStatusToDb(payload.status)) {
    return 'status must be one of: Active, Draft, Hidden';
  }

  if (!partial) {
    if (!String(payload.brand || '').trim()) {
      return 'Missing required field: brand';
    }

    if (!String(payload.description || '').trim()) {
      return 'Missing required field: description';
    }

    const images = normalizeImages(payload.images);
    if (!images.length) {
      return 'At least one product image is required';
    }

    const variants = normalizeVariants(payload.variants);
    if (!variants.length) {
      return 'At least one product variant is required';
    }

    const shippingFields = [
      ['weight', payload.weight],
      ['length', payload.length],
      ['width', payload.width],
      ['height', payload.height]
    ];

    for (const [field, value] of shippingFields) {
      const numeric = toNumberOrNull(value);
      if (numeric === null) {
        return `Missing required field: ${field}`;
      }
      if (numeric <= 0) {
        return `${field} must be greater than 0`;
      }
    }
  }

  return null;
}

async function runInTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((image) => (typeof image === 'string' ? image : image?.data || image?.url || ''))
    .filter(Boolean);
}

function parseDataUrlImage(value) {
  const source = String(value || '').trim();
  const match = source.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    return null;
  }

  const mimeType = match[1].toLowerCase();
  const extension = MIME_TO_EXTENSION[mimeType];
  if (!extension) {
    throw new Error(`Unsupported image format: ${mimeType}`);
  }

  const base64Payload = match[2].replace(/\s+/g, '');
  const buffer = Buffer.from(base64Payload, 'base64');
  if (!buffer.length) {
    throw new Error('Uploaded image is empty');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Uploaded image exceeds 6MB limit');
  }

  return { buffer, extension };
}

async function persistUploadedImages(images, sellerId, productId, productName) {
  if (!images.length) {
    return [];
  }

  await fs.promises.mkdir(uploadsProductsPath, { recursive: true });
  const baseName = slugify(productName || productId || 'product');
  const stableSellerId = String(sellerId || 'seller').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'seller';
  const stableProductId = String(productId || 'new').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'new';
  const persisted = [];

  for (let index = 0; index < images.length; index += 1) {
    const candidate = images[index];
    const parsed = parseDataUrlImage(candidate);

    if (!parsed) {
      persisted.push(candidate);
      continue;
    }

    const uniquePart = crypto.randomBytes(6).toString('hex');
    const fileName = `${stableSellerId}-${stableProductId}-${baseName}-${Date.now()}-${index + 1}-${uniquePart}.${parsed.extension}`;
    const filePath = path.join(uploadsProductsPath, fileName);
    await fs.promises.writeFile(filePath, parsed.buffer);
    persisted.push(`/uploads/products/${fileName}`);
  }

  return persisted;
}

function normalizeVariants(variants) {
  if (!Array.isArray(variants)) return [];
  return variants
    .map((variant) => ({
      color: String(
        variant?.color ||
        variant?.attributes?.color ||
        variant?.attributes?.Color ||
        variant?.attributes?.variantColor ||
        variant?.variantColor ||
        variant?.variant_name?.split?.(' ')?.[0] ||
        variant?.variantName?.split?.(' ')?.[0] ||
        ''
      ).trim(),
      size: String(
        variant?.size ||
        variant?.attributes?.size ||
        variant?.attributes?.Size ||
        variant?.attributes?.variantSize ||
        variant?.variantSize ||
        variant?.variant_name?.split?.(' ')?.slice?.(1)?.join(' ') ||
        variant?.variantName?.split?.(' ')?.slice?.(1)?.join(' ') ||
        ''
      ).trim(),
      price: toNumberOrNull(variant?.price),
      stock: toNumberOrNull(variant?.stock ?? variant?.stockQuantity),
      sku: String(variant?.sku || '').trim() || null,
      attributes: variant?.attributes && typeof variant.attributes === 'object' ? variant.attributes : {}
    }))
    .filter((variant) => variant.color && variant.size);
}

async function upsertProductDetails(client, productId, payload) {
  await client.query(
    `
      INSERT INTO public.product_details (
        product_id, barcode, stock_quantity, weight, length, width, height
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (product_id) DO UPDATE SET
        barcode = EXCLUDED.barcode,
        stock_quantity = EXCLUDED.stock_quantity,
        weight = EXCLUDED.weight,
        length = EXCLUDED.length,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        updated_at = NOW()
    `,
    [
      productId,
      payload.barcode || null,
      Number(payload.stock || 0),
      payload.weight === undefined || payload.weight === null || payload.weight === '' ? null : Number(payload.weight),
      payload.length === undefined || payload.length === null || payload.length === '' ? null : Number(payload.length),
      payload.width === undefined || payload.width === null || payload.width === '' ? null : Number(payload.width),
      payload.height === undefined || payload.height === null || payload.height === '' ? null : Number(payload.height)
    ]
  );
}

async function replaceVariants(client, productId, variants, productSku) {
  await client.query('DELETE FROM public.product_variants WHERE product_id = $1', [productId]);

  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    const fallbackSkuParts = [
      String(productSku || 'VAR').trim().slice(0, 24) || 'VAR',
      String(productId || '').trim().slice(0, 8) || 'product',
      String(index + 1)
    ];
    const generatedSku = fallbackSkuParts.join('-').slice(0, 100);
    const variantName = [variant.color, variant.size].filter(Boolean).join(' ').trim() || `Variant ${index + 1}`;
    await client.query(
      `
        INSERT INTO public.product_variants (
          product_id, sku, variant_name, price, stock_quantity, attributes, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      `,
      [
        productId,
        String(variant.sku || generatedSku).trim().slice(0, 100),
        variantName,
        variant.price === null ? 0 : Number(variant.price),
        variant.stock === null || Number.isNaN(Number(variant.stock)) ? 0 : Number(variant.stock),
        JSON.stringify({ ...variant.attributes, color: variant.color, size: variant.size, variantName })
      ]
    );
  }
}

async function replaceImages(client, productId, images) {
  await client.query('DELETE FROM public.product_images WHERE product_id = $1', [productId]);

  for (let index = 0; index < images.length; index += 1) {
    await client.query(
      `
        INSERT INTO public.product_images (
          product_id, image_url, alt_text, sort_order, is_primary
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [productId, images[index], `Product image ${index + 1}`, index, index === 0]
    );
  }
}

async function createOrUpdateProduct(client, sellerId, productId, payload, existingSlug = null) {
  const categoryId = await resolveCategoryId(client, payload.category);
  const brandId = await resolveBrandId(client, payload.brand);
  const status = 'draft';
  const slug = existingSlug || `${slugify(payload.name)}-${Date.now().toString(36)}`;
  const normalizedImages = normalizeImages(payload.images);

  if (productId) {
    const updateResult = await client.query(
      `
        UPDATE public.products
        SET
          category_id = $3,
          brand_id = $4,
          name = $5,
          description = $6,
          base_price = $7,
          compare_price = $8,
          sku = $9,
          status = $10,
          updated_at = NOW()
        WHERE id = $1 AND seller_id = $2
        RETURNING *
      `,
      [
        productId,
        sellerId,
        categoryId,
        brandId,
        String(payload.name).trim(),
        String(payload.description || '').trim() || null,
        Number(payload.price),
        payload.discountPrice === undefined || payload.discountPrice === null || payload.discountPrice === '' ? null : Number(payload.discountPrice),
        String(payload.sku).trim(),
        status
      ]
    );

    if (!updateResult.rows.length) {
      return null;
    }

    await upsertProductDetails(client, productId, payload);
    const persistedImages = await persistUploadedImages(normalizedImages, sellerId, productId, payload.name);
    await replaceImages(client, productId, persistedImages);
    await replaceVariants(client, productId, normalizeVariants(payload.variants), payload.sku);
    return productId;
  }

    const insertResult = await client.query(
    `
      INSERT INTO public.products (
        seller_id, category_id, brand_id, name, slug, description, base_price, compare_price, currency, sku, status, is_featured, average_rating, total_reviews,
        color, size, fit_type, material, occasion, style, discount_percent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'BDT', $9, $10, FALSE, 0, 0, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
    `,
    [
      sellerId,
      categoryId,
      brandId,
      String(payload.name).trim(),
      slug,
      String(payload.description || '').trim() || null,
      Number(payload.price),
      payload.discountPrice === undefined || payload.discountPrice === null || payload.discountPrice === '' ? null : Number(payload.discountPrice),
      String(payload.sku).trim(),
      status,
      payload.color ? String(payload.color).trim() : null,
      payload.size ? String(payload.size).trim() : null,
      payload.fitType ? String(payload.fitType).trim() : null,
      payload.material ? String(payload.material).trim() : null,
      payload.occasion ? String(payload.occasion).trim() : null,
      payload.style ? String(payload.style).trim() : null,
      payload.discountPercent !== undefined && payload.discountPercent !== null ? Number(payload.discountPercent) : 0
    ]
  );

  const newProductId = insertResult.rows[0].id;
  await upsertProductDetails(client, newProductId, payload);
  const persistedImages = await persistUploadedImages(normalizedImages, sellerId, newProductId, payload.name);
  await replaceImages(client, newProductId, persistedImages);
  await replaceVariants(client, newProductId, normalizeVariants(payload.variants), payload.sku);
  return newProductId;
}

async function ensureLoadedProduct(req, res, sellerId, productId) {
  await ensureProductCompanionTables(req.db);
  const products = await fetchProducts(req.db, sellerId, productId);
  const product = products[0] || null;
  if (!product) {
    res.status(404).json({ success: false, message: 'Product not found' });
    return null;
  }
  return product;
}

router.get('/overview', async (req, res) => {
  try {
    await ensureProductCompanionTables(req.db);
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const products = await fetchProducts(req.db, sellerId);
    const overview = products.reduce(
      (acc, product) => {
        acc.totalProducts += 1;
        if (product.stock > 10) {
          acc.inStockProducts += 1;
        } else if (product.stock > 0) {
          acc.lowStockProducts += 1;
        } else {
          acc.outOfStockProducts += 1;
        }
        acc.totalInventoryValue += (Number(product.discountPrice ?? product.price) || 0) * Number(product.stock || 0);
        return acc;
      },
      {
        totalProducts: 0,
        inStockProducts: 0,
        lowStockProducts: 0,
        outOfStockProducts: 0,
        totalInventoryValue: 0
      }
    );

    overview.totalInventoryValue = overview.totalInventoryValue.toFixed(2);
    return res.status(200).json({ success: true, data: overview });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch product overview', error: error.message });
  }
});

router.get('/meta', async (req, res) => {
  try {
    await ensureProductCompanionTables(req.db);
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const products = await fetchProducts(req.db, sellerId);
    const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort();
    const brands = [...new Set(products.map((product) => product.brand).filter(Boolean))].sort();

    return res.status(200).json({
      success: true,
      data: {
        categories,
        brands,
        statuses: ['Active', 'Draft', 'Hidden'],
        stockFilters: ['instock', 'lowstock', 'outofstock']
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch product metadata', error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    await ensureProductCompanionTables(req.db);
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const products = await fetchProducts(req.db, sellerId);
    return res.status(200).json({ success: true, data: products });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch products', error: error.message });
  }
});

router.get('/:productId', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const product = await ensureLoadedProduct(req, res, sellerId, req.params.productId);
    if (!product) {
      return;
    }

    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch product detail', error: error.message });
  }
});

router.post('/', async (req, res) => {
  const validationError = validateProductPayload(req.body, false);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  try {
    await ensureProductCompanionTables(req.db);
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const verified = await enforceSellerVerification(req, res, sellerId);
    if (!verified) {
      return;
    }

    const createdProductId = await runInTransaction(async (client) => createOrUpdateProduct(client, sellerId, null, req.body));
    const product = await ensureLoadedProduct(req, res, sellerId, createdProductId);
    if (!product) {
      return;
    }

    return res.status(201).json({ success: true, message: 'Product created successfully', data: product });
  } catch (error) {
    console.error('Failed to create product:', error);
    const debug = process.env.NODE_ENV === 'production' ? undefined : error.stack;
    return res.status(500).json({ success: false, message: 'Failed to create product', error: error.message, debug });
  }
});

router.put('/:productId', async (req, res) => {
  const validationError = validateProductPayload(req.body, true);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  try {
    await ensureProductCompanionTables(req.db);
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const verified = await enforceSellerVerification(req, res, sellerId);
    if (!verified) {
      return;
    }

    const updatedProductId = await runInTransaction(async (client) => {
      const existingResult = await client.query(
        `
          SELECT id, slug
          FROM public.products
          WHERE id = $1 AND seller_id = $2
          LIMIT 1
        `,
        [req.params.productId, sellerId]
      );

      if (!existingResult.rows.length) {
        return null;
      }

      const existing = existingResult.rows[0];
      return createOrUpdateProduct(client, sellerId, req.params.productId, req.body, existing.slug);
    });

    if (!updatedProductId) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const product = await ensureLoadedProduct(req, res, sellerId, updatedProductId);
    if (!product) {
      return;
    }

    return res.status(200).json({ success: true, message: 'Product updated successfully', data: product });
  } catch (error) {
    console.error('Failed to update product:', error);
    const debug = process.env.NODE_ENV === 'production' ? undefined : error.stack;
    return res.status(500).json({ success: false, message: 'Failed to update product', error: error.message, debug });
  }
});

router.delete('/:productId', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        DELETE FROM public.products
        WHERE id = $1 AND seller_id = $2
        RETURNING id
      `,
      [req.params.productId, sellerId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    return res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete product', error: error.message });
  }
});

router.post('/:productId/reviews/:reviewId/reply', async (req, res) => {
  const replyText = String(req.body?.replyText || '').trim();
  if (!replyText) {
    return res.status(400).json({ success: false, message: 'replyText is required' });
  }

  try {
    await ensureProductCompanionTables(req.db);
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const reviewResult = await req.db.query(
      `
        SELECT pr.id
        FROM public.product_reviews pr
        JOIN public.products p ON p.id = pr.product_id
        WHERE pr.id = $1 AND pr.product_id = $2 AND p.seller_id = $3
        LIMIT 1
      `,
      [req.params.reviewId, req.params.productId, sellerId]
    );

    if (!reviewResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    const result = await req.db.query(
      `
        INSERT INTO public.product_review_replies (review_id, seller_id, reply_text)
        VALUES ($1, $2, $3)
        ON CONFLICT (review_id) DO UPDATE SET
          seller_id = EXCLUDED.seller_id,
          reply_text = EXCLUDED.reply_text,
          updated_at = NOW()
        RETURNING id
      `,
      [req.params.reviewId, sellerId, replyText]
    );

    return res.status(200).json({ success: true, message: 'Review reply added successfully', data: { id: result.rows[0].id } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to submit review reply', error: error.message });
  }
});

module.exports = router;