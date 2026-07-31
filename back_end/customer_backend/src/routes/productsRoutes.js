/**
 * Products Routes
 * REST API endpoints for customer-facing product browsing, filtering, and search
 */

const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  getFilterOptions,
  getTrendingProducts,
  getDealsOfDay,
  getSponsoredProducts,
  getRelatedProducts,
  searchProducts,
  getProductsByCategory,
  getProductsByBrand
} = require('../data/productsData');
const { smartSearchProducts } = require('../utils/smartSearch');

function parseListParam(value) {
  if (!value) return [];

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildFilterConditions(filters, values, where) {
  const search = String(filters.search || '').trim();

  if (search) {
    values.push(`%${search}%`);
    const index = values.length;
    where.push(`(
      p.name ILIKE $${index}
      OR COALESCE(p.description, '') ILIKE $${index}
      OR COALESCE(b.name, '') ILIKE $${index}
      OR COALESCE(c.name, '') ILIKE $${index}
      OR COALESCE(sp.store_name, '') ILIKE $${index}
    )`);
  }

  if (filters.minRating > 0) {
    values.push(filters.minRating);
    where.push(`COALESCE(p.average_rating, 0) >= $${values.length}`);
  }

  if (Number.isFinite(filters.minPrice)) {
    values.push(filters.minPrice);
    where.push(`p.base_price >= $${values.length}`);
  }

  if (Number.isFinite(filters.maxPrice) && filters.maxPrice !== Infinity) {
    values.push(filters.maxPrice);
    where.push(`p.base_price <= $${values.length}`);
  }

  if (filters.inStock === true) {
    where.push('COALESCE(stock.stock_quantity, 0) > 0');
  }

  if (filters.inStock === false) {
    where.push('COALESCE(stock.stock_quantity, 0) <= 0');
  }

  if (filters.limitedDeal === true) {
    where.push('p.compare_price IS NOT NULL AND p.compare_price > p.base_price');
  }

  if (filters.sponsored === true) {
    where.push('p.is_featured = TRUE');
  }

  if (filters.categories.length > 0) {
    // normalize categories to lowercase for case-insensitive matching
    const normalizedCategories = filters.categories.map((cat) =>
      String(cat || '').trim().toLowerCase()
    );
    values.push(normalizedCategories);
    where.push(`(
      LOWER(c.name) = ANY($${values.length}::text[])
      OR LOWER(c.slug) = ANY($${values.length}::text[])
    )`);
  }

  if (filters.brands.length > 0) {
    values.push(filters.brands);
    where.push(`(
      b.name = ANY($${values.length}::text[])
      OR b.slug = ANY($${values.length}::text[])
    )`);
  }

  if (Array.isArray(filters.tags) && filters.tags.length > 0) {
    values.push(filters.tags);
    where.push(`(p.tags && $${values.length}::text[])`);
  }
}

async function fetchTrendingProductsFromDb(reqDb, limit = 12) {
  const sql = `
    SELECT
      p.id,
      p.slug,
      p.name,
      COALESCE(p.description, '') AS description,
      COALESCE(p.tags, ARRAY[]::text[]) AS tags,
      p.base_price AS price,
      COALESCE(p.compare_price, p.base_price) AS "originalPrice",
      p.currency,
      COALESCE(p.average_rating, 0) AS rating,
      COALESCE(p.total_reviews, 0) AS "reviewCount",
      COALESCE(c.name, 'General') AS category,
      COALESCE(c.slug, '') AS "categorySlug",
      COALESCE(b.name, 'Generic') AS brand,
      COALESCE(b.slug, '') AS "brandSlug",
      COALESCE(sp.store_name, 'Store') AS "sellerName",
      COALESCE(img.image_url, '') AS image,
      COALESCE(stock.stock_quantity, 0) AS quantity,
      (COALESCE(stock.stock_quantity, 0) > 0) AS "inStock",
      CASE WHEN p.is_featured = TRUE THEN TRUE ELSE FALSE END AS sponsored,
      CASE WHEN p.compare_price IS NOT NULL AND p.compare_price > p.base_price THEN TRUE ELSE FALSE END AS "limitedDeal",
      CASE
        WHEN p.compare_price IS NOT NULL AND p.compare_price > p.base_price
        THEN ROUND(((p.compare_price - p.base_price) / NULLIF(p.compare_price, 0)) * 100)
        ELSE 0
      END AS discount,
      (
        (COALESCE(sales.units_sold, 0) * 5) +
        (COALESCE(view_stats.view_count, 0) * 2) +
        (COALESCE(cart_stats.cart_count, 0) * 3) +
        (COALESCE(wishlist_stats.wishlist_count, 0) * 2) +
        (COALESCE(review_stats.avg_rating, p.average_rating, 0) * 10)
      )::numeric AS "trendScore"
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
    LEFT JOIN LATERAL (
      SELECT image_url
      FROM public.product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order ASC, created_at ASC
      LIMIT 1
    ) img ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(COALESCE(stock_quantity, 0)), 0)::int AS stock_quantity
      FROM public.product_variants
      WHERE product_id = p.id AND is_active = TRUE
    ) stock ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(oi.quantity), 0)::int AS units_sold
      FROM public.order_items oi
      WHERE oi.product_id = p.id
    ) sales ON TRUE
    LEFT JOIN LATERAL (
      SELECT 0::int AS view_count
    ) view_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(ci.quantity), 0)::int AS cart_count
      FROM public.cart_items ci
      WHERE ci.product_id = p.id
    ) cart_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS wishlist_count
      FROM public.wishlists w
      WHERE w.product_id = p.id
    ) wishlist_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS review_count,
        COALESCE(AVG(pr.rating), 0)::numeric(3,2) AS avg_rating
      FROM public.product_reviews pr
      WHERE pr.product_id = p.id AND pr.is_hidden IS NOT TRUE
    ) review_stats ON TRUE
    WHERE p.status = 'active'
    ORDER BY "trendScore" DESC, COALESCE(review_stats.review_count, 0) DESC, COALESCE(p.average_rating, 0) DESC, p.created_at DESC
    LIMIT $1
  `;

  const result = await reqDb.query(sql, [Math.max(limit, 1)]);
  return result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    price: Number(row.price) || 0,
    originalPrice: Number(row.originalPrice) || Number(row.price) || 0,
    rating: Number(row.rating) || 0,
    reviewCount: Number(row.reviewCount) || 0,
    category: row.category || '',
    categorySlug: row.categorySlug || '',
    brand: row.brand || '',
    brandSlug: row.brandSlug || '',
    sellerName: row.sellerName || 'Store',
    image: row.image || '',
    quantity: Number(row.quantity) || 0,
    inStock: Boolean(row.inStock),
    sponsored: Boolean(row.sponsored),
    limitedDeal: Boolean(row.limitedDeal),
    discount: Number(row.discount) || 0,
    trendScore: Number(row.trendScore) || 0
  }));
}

function mapSortOrder(sortBy) {
  const sortMap = {
    'price-asc': 'p.base_price ASC, p.created_at DESC',
    'price-desc': 'p.base_price DESC, p.created_at DESC',
    rating: 'p.average_rating DESC, p.total_reviews DESC, p.created_at DESC',
    newest: 'p.created_at DESC',
    popularity: 'p.total_reviews DESC, p.average_rating DESC, p.created_at DESC',
    relevance: 'CASE WHEN p.is_featured = TRUE THEN 0 ELSE 1 END, p.total_reviews DESC, p.average_rating DESC, p.created_at DESC'
  };

  return sortMap[sortBy] || sortMap.relevance;
}

async function fetchCatalogProductsFromDb(reqDb, filters) {
  const page = Math.max(filters.page, 1);
  const limit = Math.min(Math.max(filters.limit, 1), 100);
  const offset = (page - 1) * limit;

  const values = [];
  const where = ["p.status = 'active'"];

  buildFilterConditions(filters, values, where);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = mapSortOrder(filters.sortBy);

  const listParams = [...values, limit, offset];
  const listSql = `
    SELECT
      p.id,
      p.slug,
      p.name,
      COALESCE(p.description, '') AS description,
      COALESCE(p.tags, ARRAY[]::text[]) AS tags,
      p.base_price AS price,
      COALESCE(p.compare_price, p.base_price) AS "originalPrice",
      p.currency,
      COALESCE(p.average_rating, 0) AS rating,
      COALESCE(p.total_reviews, 0) AS "reviewCount",
      COALESCE(c.name, 'General') AS category,
      COALESCE(c.slug, '') AS "categorySlug",
      COALESCE(b.name, 'Generic') AS brand,
      COALESCE(b.slug, '') AS "brandSlug",
      COALESCE(sp.store_name, 'Store') AS "sellerName",
      COALESCE(img.image_url, '') AS image,
      COALESCE(stock.stock_quantity, 0) AS quantity,
      (COALESCE(stock.stock_quantity, 0) > 0) AS "inStock",
      CASE WHEN p.is_featured = TRUE THEN TRUE ELSE FALSE END AS sponsored,
      CASE WHEN p.compare_price IS NOT NULL AND p.compare_price > p.base_price THEN TRUE ELSE FALSE END AS "limitedDeal",
      CASE
        WHEN p.compare_price IS NOT NULL AND p.compare_price > p.base_price
        THEN ROUND(((p.compare_price - p.base_price) / NULLIF(p.compare_price, 0)) * 100)
        ELSE 0
      END AS discount
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
    LEFT JOIN LATERAL (
      SELECT image_url
      FROM public.product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order ASC, created_at ASC
      LIMIT 1
    ) img ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(COALESCE(stock_quantity, 0)), 0)::int AS stock_quantity
      FROM public.product_variants
      WHERE product_id = p.id AND is_active = TRUE
    ) stock ON TRUE
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(COALESCE(stock_quantity, 0)), 0)::int AS stock_quantity
      FROM public.product_variants
      WHERE product_id = p.id AND is_active = TRUE
    ) stock ON TRUE
    ${whereSql}
  `;

  const [listResult, countResult] = await Promise.all([
    reqDb.query(listSql, listParams),
    reqDb.query(countSql, values)
  ]);

  const totalProducts = countResult.rows[0]?.total || 0;
  const totalPages = Math.max(Math.ceil(totalProducts / limit), 1);

  return {
    products: listResult.rows,
    pagination: {
      currentPage: page,
      totalPages,
      totalProducts,
      productsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    },
    appliedFilters: {
      ...filters,
      priceRange: { min: filters.minPrice, max: filters.maxPrice }
    }
  };
}

async function fetchCatalogFilterOptionsFromDb(reqDb) {
  const [categoryResult, brandResult] = await Promise.all([
    reqDb.query(`
      SELECT DISTINCT c.name, c.slug
      FROM public.products p
      JOIN public.categories c ON c.id = p.category_id
      WHERE p.status = 'active' AND c.is_active = TRUE
      ORDER BY c.name ASC
    `),
    reqDb.query(`
      SELECT DISTINCT b.name, b.slug
      FROM public.products p
      JOIN public.brands b ON b.id = p.brand_id
      WHERE p.status = 'active'
      ORDER BY b.name ASC
    `)
  ]);

  const tagsResult = await reqDb.query(`
    SELECT DISTINCT unnest(tags) AS tag
    FROM public.products p
    WHERE p.status = 'active' AND tags IS NOT NULL
    ORDER BY tag ASC
  `);

  return {
    categories: categoryResult.rows.map((row) => ({
      label: row.name,
      value: row.slug || row.name
    })),
    brands: brandResult.rows.map((row) => ({
      label: row.name,
      value: row.slug || row.name
    })),
    tags: tagsResult.rows.map((r) => ({ label: r.tag, value: r.tag })),
    ratings: [5, 4, 3, 2, 1].map((rating) => ({
      label: `${rating} & Up`,
      value: rating
    })),
    deals: [
      { label: 'Limited time deals', value: 'limitedDeal' },
      { label: 'Featured products', value: 'sponsored' }
    ]
  };
}

/**
 * GET /api/products
 * Get all products with filtering, sorting, and pagination
 * Query params:
 *  - search: string
 *  - brands: comma-separated string
 *  - categories: comma-separated string
 *  - minRating: number
 *  - minPrice: number
 *  - maxPrice: number
 *  - forms: comma-separated string
 *  - finishes: comma-separated string
 *  - skinTones: comma-separated string
 *  - skinTypes: comma-separated string
 *  - inStock: boolean
 *  - limitedDeal: boolean
 *  - sponsored: boolean
 *  - sortBy: string (relevance|price-asc|price-desc|rating|newest|popularity)
 *  - page: number
 *  - limit: number
 */
router.get('/', async (req, res) => {
  try {
    const filters = {
      search: req.query.search || '',
      brands: parseListParam(req.query.brands),
      categories: parseListParam(req.query.categories),
        tags: parseListParam(req.query.tags),
      minRating: parseFloat(req.query.minRating) || 0,
      minPrice: parseFloat(req.query.minPrice) || 0,
      maxPrice: parseFloat(req.query.maxPrice) || Infinity,
      inStock: req.query.inStock !== undefined ? req.query.inStock === 'true' : null,
      limitedDeal: req.query.limitedDeal !== undefined ? req.query.limitedDeal === 'true' : null,
      sponsored: req.query.sponsored !== undefined ? req.query.sponsored === 'true' : null,
      sortBy: req.query.sortBy || 'relevance',
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 24
    };

    if (req.db && typeof req.db.query === 'function') {
      try {
        const result = await fetchCatalogProductsFromDb(req.db, filters);

        res.json({
          success: true,
          data: result
        });
        return;
      } catch (dbError) {
        console.warn('Products DB query failed:', dbError.message);
        return res.status(503).json({
          success: false,
          message: 'Database unavailable for products listing',
          error: dbError.message
        });
      }
    }

    return res.status(503).json({
      success: false,
      message: 'Database client is not configured for products listing'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

/**
 * GET /api/products/filters
 * Get available filter options
 */
router.get('/filters', (req, res) => {
  try {
    if (req.db && typeof req.db.query === 'function') {
      fetchCatalogFilterOptionsFromDb(req.db)
        .then((options) => {
          res.json({
            success: true,
            data: options
          });
        })
        .catch((error) => {
          res.status(503).json({
            success: false,
            message: 'Database unavailable for filter options',
            error: error.message
          });
        });
      return;
    }

    res.status(503).json({
      success: false,
      message: 'Database client is not configured for filter options'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch filter options',
      error: error.message
    });
  }
});

/**
 * GET /api/products/trending
 * Get trending/popular products
 * Query params:
 *  - limit: number (default 10)
 */
router.get('/trending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;

    if (req.db && typeof req.db.query === 'function') {
      try {
        const products = await fetchTrendingProductsFromDb(req.db, limit);
        return res.json({
          success: true,
          data: products
        });
      } catch (dbError) {
        console.warn('Trending products DB query failed:', dbError.message);
      }
    }

    const products = getTrendingProducts(limit);
    return res.json({
      success: true,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trending products',
      error: error.message
    });
  }
});

/**
 * GET /api/products/deals
 * Get products with deals/discounts
 * Query params:
 *  - limit: number (default 12)
 */
router.get('/deals', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const products = getDealsOfDay(limit);
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch deals',
      error: error.message
    });
  }
});

/**
 * GET /api/products/sponsored
 * Get sponsored products
 * Query params:
 *  - limit: number (default 5)
 */
router.get('/sponsored', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const products = getSponsoredProducts(limit);
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sponsored products',
      error: error.message
    });
  }
});

/**
 * GET /api/products/search
 * Smart search with database-first, Gemini fallback
 * Query params:
 *  - q: string (required)
 *  - categories: comma-separated string (optional)
 *  - limit: number (default 20)
 */
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const categories = parseListParam(req.query.categories);
    const limit = parseInt(req.query.limit) || 20;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    // Try database search first if available
    if (req.db && typeof req.db.query === 'function') {
      try {
        const products = await smartSearchProducts(req.db, query, categories);
        const paginated = products.slice(0, limit);
        
        return res.json({
          success: true,
          data: paginated,
          source: 'database',
          totalResults: products.length
        });
      } catch (dbError) {
        console.warn('Database search failed, falling back to mock data:', dbError.message);
      }
    }

    // Fallback to mock data search
    const products = searchProducts(query, categories, limit);
    res.json({
      success: true,
      data: products,
      source: 'mock',
      totalResults: products.length
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error.message
    });
  }
});

/**
 * GET /api/products/category/:category
 * Get products by category
 * Query params:
 *  - limit: number (default 24)
 */
router.get('/category/:category', (req, res) => {
  try {
    const category = req.params.category;
    const limit = parseInt(req.query.limit) || 24;
    const products = getProductsByCategory(category, limit);
    res.json({
      success: true,
      data: products,
      category
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products by category',
      error: error.message
    });
  }
});

/**
 * GET /api/products/brand/:brand
 * Get products by brand
 * Query params:
 *  - limit: number (default 24)
 */
router.get('/brand/:brand', (req, res) => {
  try {
    const brand = req.params.brand;
    const limit = parseInt(req.query.limit) || 24;
    const products = getProductsByBrand(brand, limit);
    res.json({
      success: true,
      data: products,
      brand
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products by brand',
      error: error.message
    });
  }
});

/**
 * GET /api/products/:id
 * Get product details by ID
 */
router.get('/:id', (req, res) => {
  try {
    const productId = req.params.id;
    const product = getProductById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
});

/**
 * GET /api/products/:id/related
 * Get related products
 * Query params:
 *  - limit: number (default 6)
 */
router.get('/:id/related', (req, res) => {
  try {
    const productId = req.params.id;
    const limit = parseInt(req.query.limit) || 6;
    const products = getRelatedProducts(productId, limit);
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch related products',
      error: error.message
    });
  }
});

module.exports = router;
