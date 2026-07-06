/**
 * Homepage Routes
 * REST API endpoints for customer homepage sections and page-level data.
 */

const express = require('express');
const router = express.Router();

const {
  getHomepageData,
  getHomepageSummary,
  getHomeProductRows,
  getFlashDeals,
  getHeroSlides,
  getCategoryRows,
  getTestimonials,
  getTrustHighlights
} = require('../data/homepageData');

function resolveCustomerId(req) {
  return String(req.auth?.session?.userId || req.headers['x-user-id'] || req.query.userId || req.body.userId || '').trim();
}

function normalizeProductImageUrl(rawUrl) {
  const uploadHost = process.env.PUBLIC_UPLOAD_BASE_URL || 'http://localhost:5000';
  const fallback = `${uploadHost}/uploads/products/default-product.svg`;
  const value = String(rawUrl || '').trim();
  if (!value) return fallback;

  if (/^https?:\/\//i.test(value) || /^data:/i.test(value) || /^blob:/i.test(value)) {
    return value;
  }

  if (value.startsWith('/uploads/') || value.startsWith('uploads/')) {
    return `${uploadHost}${value.startsWith('/') ? value : `/${value}`}`;
  }

  return fallback;
}

function mapDbProduct(row) {
  return {
    id: row.productId,
    name: row.productName,
    slug: row.slug,
    price: Number(row.price) || 0,
    originalPrice: Number(row.originalPrice) || Number(row.price) || 0,
    discount: Number(row.discount) || 0,
    rating: Number(row.rating) || 0,
    reviewCount: Number(row.reviewCount) || 0,
    image: normalizeProductImageUrl(row.productImage),
    brand: row.brand || '',
    category: row.categoryName || '',
    sellerName: row.sellerName || 'Store',
    inStock: true,
    limitedDeal: Boolean(row.discount && Number(row.discount) > 0)
  };
}

function mapHomepageProduct(row) {
  return {
    id: row.productId,
    name: row.productName,
    slug: row.slug,
    price: Number(row.price) || 0,
    originalPrice: Number(row.originalPrice) || Number(row.price) || 0,
    discount: Number(row.discount) || 0,
    rating: Number(row.rating) || 0,
    reviewCount: Number(row.reviewCount) || 0,
    image: normalizeProductImageUrl(row.productImage),
    brand: row.brand || '',
    category: row.categoryName || '',
    sellerName: row.sellerName || 'Store',
    inStock: true,
    limitedDeal: Boolean(Number(row.discount) > 0),
    isFeatured: Boolean(row.isFeatured)
  };
}

async function queryHomepageProducts(req, limit, whereClause, orderBy) {
  const sql = `
    SELECT
      p.id AS "productId",
      p.slug,
      p.name AS "productName",
      p.base_price AS price,
      p.compare_price AS "originalPrice",
      CASE
        WHEN COALESCE(p.compare_price, 0) > p.base_price
          THEN ROUND(((p.compare_price - p.base_price) / p.compare_price) * 100)
        ELSE 0
      END AS discount,
      COALESCE(p.average_rating, 0) AS rating,
      COALESCE(p.total_reviews, 0) AS "reviewCount",
      COALESCE(c.name, '') AS "categoryName",
      COALESCE(b.name, '') AS brand,
      COALESCE(sp.store_name, 'Store') AS "sellerName",
      COALESCE(pm.image_url, '') AS "productImage",
      p.is_featured AS "isFeatured",
      p.created_at
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
    LEFT JOIN LATERAL (
      SELECT image_url
      FROM public.product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order ASC, id ASC
      LIMIT 1
    ) pm ON TRUE
    WHERE p.status = 'active'
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $1
  `;

  const result = await req.db.query(sql, [Math.max(limit, 1)]);
  return result.rows.map(mapHomepageProduct);
}

async function queryBestSellingProducts(req, limit) {
  const sql = `
    SELECT
      p.id AS "productId",
      p.slug,
      p.name AS "productName",
      p.base_price AS price,
      p.compare_price AS "originalPrice",
      CASE
        WHEN COALESCE(p.compare_price, 0) > p.base_price
          THEN ROUND(((p.compare_price - p.base_price) / p.compare_price) * 100)
        ELSE 0
      END AS discount,
      COALESCE(p.average_rating, 0) AS rating,
      COALESCE(p.total_reviews, 0) AS "reviewCount",
      COALESCE(c.name, '') AS "categoryName",
      COALESCE(b.name, '') AS brand,
      COALESCE(sp.store_name, 'Store') AS "sellerName",
      COALESCE(pm.image_url, '') AS "productImage",
      p.is_featured AS "isFeatured",
      p.created_at,
      COALESCE(sales.units_sold, 0) AS "unitsSold"
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
    LEFT JOIN LATERAL (
      SELECT image_url
      FROM public.product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order ASC, id ASC
      LIMIT 1
    ) pm ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(oi.quantity), 0)::int AS units_sold
      FROM public.order_items oi
      WHERE oi.product_id = p.id
    ) sales ON TRUE
    WHERE p.status = 'active'
    ORDER BY COALESCE(sales.units_sold, 0) DESC, COALESCE(p.total_reviews, 0) DESC, COALESCE(p.average_rating, 0) DESC, p.created_at DESC
    LIMIT $1
  `;

  const result = await req.db.query(sql, [Math.max(limit, 1)]);
  if (!result.rows.length) {
    return queryHomepageProducts(req, limit, '', 'p.total_reviews DESC, p.average_rating DESC, p.created_at DESC');
  }

  return result.rows.map(mapHomepageProduct);
}

async function querySeasonalProducts(req, limit) {
  const seasonalTerms = ['%summer%', '%winter%', '%spring%', '%autumn%', '%fall%', '%seasonal%', '%holiday%', '%festive%', '%resort%', '%monsoon%', '%beach%', '%vacation%'];
  const sql = `
    SELECT
      p.id AS "productId",
      p.slug,
      p.name AS "productName",
      p.base_price AS price,
      p.compare_price AS "originalPrice",
      CASE
        WHEN COALESCE(p.compare_price, 0) > p.base_price
          THEN ROUND(((p.compare_price - p.base_price) / p.compare_price) * 100)
        ELSE 0
      END AS discount,
      COALESCE(p.average_rating, 0) AS rating,
      COALESCE(p.total_reviews, 0) AS "reviewCount",
      COALESCE(c.name, '') AS "categoryName",
      COALESCE(b.name, '') AS brand,
      COALESCE(sp.store_name, 'Store') AS "sellerName",
      COALESCE(pm.image_url, '') AS "productImage",
      p.is_featured AS "isFeatured",
      p.created_at
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
    LEFT JOIN LATERAL (
      SELECT image_url
      FROM public.product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order ASC, id ASC
      LIMIT 1
    ) pm ON TRUE
    WHERE p.status = 'active'
      AND LOWER(CONCAT_WS(' ', COALESCE(p.name, ''), COALESCE(p.description, ''), COALESCE(c.name, ''), COALESCE(b.name, ''))) LIKE ANY ($2::text[])
    ORDER BY p.is_featured DESC, COALESCE(p.total_reviews, 0) DESC, COALESCE(p.average_rating, 0) DESC, p.created_at DESC
    LIMIT $1
  `;

  const result = await req.db.query(sql, [Math.max(limit, 1), seasonalTerms]);
  if (!result.rows.length) {
    return queryHomepageProducts(req, limit, '', 'p.is_featured DESC, p.created_at DESC');
  }

  return result.rows.map(mapHomepageProduct);
}

async function getHomepageSummaryForUser(req, userId) {
  if (!req.db || typeof req.db.query !== 'function') {
    return getHomepageSummary(userId);
  }

  const cartSql = `
    SELECT
      COUNT(ci.id)::int AS "cartItems",
      COALESCE(SUM(ci.quantity * ci.unit_price), 0)::numeric AS "cartTotal"
    FROM public.carts c
    LEFT JOIN public.cart_items ci ON ci.cart_id = c.id
    WHERE c.customer_id::text = $1
  `;

  const wishlistSql = 'SELECT COUNT(*)::int AS total FROM public.wishlists WHERE customer_id::text = $1';
  const [cartResult, wishlistResult] = await Promise.all([
    req.db.query(cartSql, [userId]),
    req.db.query(wishlistSql, [userId])
  ]);

  const cartRow = cartResult.rows[0] || {};
  const wishlistItems = wishlistResult.rows[0] ? wishlistResult.rows[0].total : 0;

  return {
    cartItems: Number(cartRow.cartItems) || 0,
    wishlistItems: Number(wishlistItems) || 0,
    hasActiveCoupon: false,
    cartTotal: Number(cartRow.cartTotal) || 0
  };
}

async function getCmsHeroSlides(req) {
  if (!req.db || typeof req.db.query !== 'function') {
    return [];
  }

  try {
    const pageResult = await req.db.query(`
      SELECT id
      FROM cms_pages
      WHERE slug = 'homepage'
      LIMIT 1
    `);

    if (!pageResult.rows.length) {
      return [];
    }

    const pageId = pageResult.rows[0].id;
    const sectionResult = await req.db.query(`
      SELECT heading, body, content
      FROM cms_sections
      WHERE page_id = $1
        AND section_key = 'hero-banner'
      LIMIT 1
    `, [pageId]);

    if (!sectionResult.rows.length) {
      return [];
    }

    const section = sectionResult.rows[0];
    let content = section.content || {};
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch (_) {
        content = {};
      }
    }

    let image = '';
    if (content && typeof content === 'object') {
      image = content.image || content.imageUrl || content.banner || '';
    }

    if (!image) {
      const assetResult = await req.db.query(`
        SELECT file_url
        FROM cms_assets
        WHERE asset_type IN ('image', 'video')
          AND LOWER(file_name) LIKE '%hero%'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      if (assetResult.rows.length) {
        image = assetResult.rows[0].file_url || '';
      }
    }

    const heroSlide = {
      id: 1,
      badge: content.badge || 'Featured',
      title: section.heading || 'Featured Collection',
      subtitle: section.body || (content.summary || 'Discover our latest offers.'),
      ctaText: content.ctaText || content.buttonText || 'Shop Now',
      ctaLink: content.ctaLink || content.buttonLink || 'all_product_spages.html',
      image: normalizeProductImageUrl(image || '')
    };

    return [heroSlide];
  } catch (error) {
    console.error('Failed to fetch CMS hero banner:', error.message || error);
    return [];
  }
}

async function getHeroSlidesForHomepage(req) {
  if (!req.db || typeof req.db.query !== 'function') {
    return getHeroSlides();
  }

  const cmsSlides = await getCmsHeroSlides(req);
  if (Array.isArray(cmsSlides) && cmsSlides.length) {
    return cmsSlides;
  }

  const sql = `
    SELECT
      p.id AS "productId",
      p.name AS "productName",
      p.slug,
      p.base_price AS price,
      COALESCE(pm.image_url, '') AS "productImage"
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT image_url
      FROM public.product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order ASC
      LIMIT 1
    ) pm ON TRUE
    WHERE p.status = 'active'
    ORDER BY p.is_featured DESC, p.average_rating DESC, p.total_reviews DESC, p.created_at DESC
    LIMIT 3
  `;

  const result = await req.db.query(sql);
  if (!result.rows.length) {
    return getHeroSlides();
  }

  return result.rows.map((row, index) => ({
    id: index + 1,
    badge: index === 0 ? 'Seasonal Sale' : index === 1 ? 'New Arrivals' : 'Limited Time',
    title: row.productName,
    subtitle: 'Discover top marketplace picks from verified global vendors.',
    ctaText: 'Shop Now',
    ctaLink: row.slug ? `products_details.html?slug=${encodeURIComponent(row.slug)}` : `products_details.html?id=${row.productId}`,
    image: normalizeProductImageUrl(row.productImage)
  }));
}

async function getHomeRowsForHomepage(req, limit) {
  if (!req.db || typeof req.db.query !== 'function') {
    const fallbackRows = getHomeProductRows(limit);
    return [
      { id: 'new-arrivals', title: 'New Arrivals', products: fallbackRows[0]?.products || [] },
      { id: 'trending-products', title: 'Trending Products', products: fallbackRows[1]?.products || [] },
      { id: 'best-sellers', title: 'Best Sellers', products: fallbackRows[2]?.products || [] },
      { id: 'seasonal-collection', title: 'Seasonal Collection', products: fallbackRows[3]?.products || [] },
      { id: 'recently-added', title: 'Recently Added', products: fallbackRows[4]?.products || [] }
    ];
  }

  const [newArrivals, trendingProducts, bestSellers, seasonalCollection, recentlyAdded] = await Promise.all([
    queryHomepageProducts(req, limit, '', 'p.created_at DESC'),
    queryHomepageProducts(req, limit, '', 'p.total_reviews DESC, p.average_rating DESC, p.created_at DESC'),
    queryBestSellingProducts(req, limit),
    querySeasonalProducts(req, limit),
    queryHomepageProducts(req, limit, "AND p.created_at >= NOW() - INTERVAL '30 days'", 'p.created_at DESC')
  ]);

  return [
    { id: 'new-arrivals', title: 'New Arrivals', products: newArrivals },
    { id: 'trending-products', title: 'Trending Products', products: trendingProducts },
    { id: 'best-sellers', title: 'Best Sellers', products: bestSellers },
    { id: 'seasonal-collection', title: 'Seasonal Collection', products: seasonalCollection },
    { id: 'recently-added', title: 'Recently Added', products: recentlyAdded }
  ];
}

async function getFeaturedSellersForHomepage(req, limit) {
  if (!req.db || typeof req.db.query !== 'function') {
    return [];
  }

  const sql = `
    SELECT
      sp.user_id,
      sp.store_name,
      sp.store_slug,
      sp.rating,
      sp.total_reviews,
      COUNT(p.id)::int AS product_count,
      COALESCE(pi.image_url, '') AS image_url
    FROM public.seller_profiles sp
    LEFT JOIN public.products p ON p.seller_id = sp.user_id AND p.status = 'active'
    LEFT JOIN LATERAL (
      SELECT image_url
      FROM public.product_images
      JOIN public.products px ON px.id = product_images.product_id
      WHERE px.seller_id = sp.user_id AND px.status = 'active'
      ORDER BY product_images.is_primary DESC, product_images.sort_order ASC, product_images.id ASC
      LIMIT 1
    ) pi ON TRUE
    GROUP BY sp.user_id, sp.store_name, sp.store_slug, sp.rating, sp.total_reviews, pi.image_url
    ORDER BY sp.rating DESC, sp.total_reviews DESC, product_count DESC, sp.store_name ASC
    LIMIT $1
  `;

  const result = await req.db.query(sql, [Math.max(limit, 1)]);
  return result.rows.map((row) => ({
    id: row.user_id,
    name: row.store_name,
    slug: row.store_slug,
    rating: Number(row.rating) || 0,
    totalReviews: Number(row.total_reviews) || 0,
    productCount: Number(row.product_count) || 0,
    image: row.image_url || 'https://via.placeholder.com/480'
  }));
}

async function getFlashDealsForHomepage(req, limit) {
  if (!req.db || typeof req.db.query !== 'function') {
    return getFlashDeals(limit);
  }

  const sql = `
    SELECT
      p.id,
      p.name,
      p.base_price AS "salePrice",
      COALESCE(p.compare_price, p.base_price) AS "originalPrice",
      CASE
        WHEN COALESCE(p.compare_price, 0) > p.base_price
          THEN ROUND(((p.compare_price - p.base_price) / p.compare_price) * 100)
        ELSE 0
      END AS discount,
      COALESCE(pm.image_url, '') AS image
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT image_url
      FROM public.product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order ASC
      LIMIT 1
    ) pm ON TRUE
    WHERE p.status = 'active'
    ORDER BY discount DESC, p.created_at DESC
    LIMIT $1
  `;

  const result = await req.db.query(sql, [Math.max(limit, 1)]);
  const now = new Date();
  const endsAt = new Date(now.getTime() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000 + 10 * 1000);

  return {
    title: 'Flash Deals',
    subtitle: 'Limited Stock Available',
    startsAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
    items: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      salePrice: Number(row.salePrice) || 0,
      originalPrice: Number(row.originalPrice) || 0,
      discount: Number(row.discount) || 0,
      image: normalizeProductImageUrl(row.image)
    }))
  };
}

/**
 * GET /api/homepage
 * Get complete homepage payload
 * Query params:
 *  - userId: string (default user_1)
 *  - sectionLimit: number (default 8)
 *  - flashDealLimit: number (default 6)
 */
router.get('/', async (req, res) => {
  try {
    const userId = resolveCustomerId(req);
    const sectionLimit = parseInt(req.query.sectionLimit, 10) || 8;
    const flashDealLimit = parseInt(req.query.flashDealLimit, 10) || 6;

    if (req.db && typeof req.db.query === 'function') {
      const [summary, heroSlides, productRows, flashDeals] = await Promise.all([
        getHomepageSummaryForUser(req, userId),
        getHeroSlidesForHomepage(req),
        getHomeRowsForHomepage(req, sectionLimit),
        getFlashDealsForHomepage(req, flashDealLimit)
      ]);

      const featuredSellers = await getFeaturedSellersForHomepage(req, 4);

      return res.json({
        success: true,
        data: {
          summary,
          heroSlides,
          categoryRows: getCategoryRows(),
          productRows,
          flashDeals,
          featuredSellers,
          testimonials: getTestimonials(),
          trustHighlights: getTrustHighlights()
        }
      });
    }

    const data = getHomepageData({ userId, sectionLimit, flashDealLimit });

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch homepage data',
      error: error.message
    });
  }
});

/**
 * GET /api/homepage/summary
 * Get compact top-bar info (cart/wishlist)
 */
router.get('/summary', async (req, res) => {
  try {
    const userId = resolveCustomerId(req);

    if (req.db && typeof req.db.query === 'function') {
      const summary = await getHomepageSummaryForUser(req, userId);
      return res.json({ success: true, data: summary });
    }

    res.json({
      success: true,
      data: getHomepageSummary(userId)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch homepage summary',
      error: error.message
    });
  }
});

/**
 * GET /api/homepage/hero
 * Get hero slider content
 */
router.get('/hero', async (req, res) => {
  try {
    if (req.db && typeof req.db.query === 'function') {
      const slides = await getHeroSlidesForHomepage(req);
      return res.json({ success: true, data: slides });
    }

    res.json({
      success: true,
      data: getHeroSlides()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hero slides',
      error: error.message
    });
  }
});

/**
 * GET /api/homepage/categories
 * Get homepage category tile rows
 */
router.get('/categories', (req, res) => {
  try {
    res.json({
      success: true,
      data: getCategoryRows()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch homepage categories',
      error: error.message
    });
  }
});

/**
 * GET /api/homepage/product-rows
 * Get product strip sections for homepage
 * Query params:
 *  - limit: number (default 8)
 */
router.get('/product-rows', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 8;

    if (req.db && typeof req.db.query === 'function') {
      const rows = await getHomeRowsForHomepage(req, limit);
      return res.json({ success: true, data: rows });
    }

    res.json({
      success: true,
      data: getHomeProductRows(limit)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch homepage product rows',
      error: error.message
    });
  }
});

/**
 * GET /api/homepage/flash-deals
 * Get flash deal block with timer range
 * Query params:
 *  - limit: number (default 6)
 */
router.get('/flash-deals', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 6;

    if (req.db && typeof req.db.query === 'function') {
      const deals = await getFlashDealsForHomepage(req, limit);
      return res.json({ success: true, data: deals });
    }

    res.json({
      success: true,
      data: getFlashDeals(limit)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch flash deals',
      error: error.message
    });
  }
});

/**
 * GET /api/homepage/testimonials
 * Get customer testimonials
 */
router.get('/testimonials', (req, res) => {
  try {
    res.json({
      success: true,
      data: getTestimonials()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch testimonials',
      error: error.message
    });
  }
});

/**
 * GET /api/homepage/trust-highlights
 * Get trust badges/features
 */
router.get('/trust-highlights', (req, res) => {
  try {
    res.json({
      success: true,
      data: getTrustHighlights()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trust highlights',
      error: error.message
    });
  }
});

module.exports = router;
