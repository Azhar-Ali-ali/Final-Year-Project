/**
 * Homepage Routes
 * REST API endpoints for customer homepage sections and page-level data.
 */

const express = require('express');
const { randomUUID } = require('crypto');
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
const { isDiscountActive } = require('../utils/limitedDeals');

function resolveCustomerId(req) {
  return String(req.auth?.session?.userId || req.headers['x-user-id'] || req.query.userId || req.body.userId || '').trim();
}

function normalizeProductImageUrl(rawUrl) {
  const uploadHost = process.env.PUBLIC_UPLOAD_BASE_URL || process.env.PUBLIC_APP_URL || process.env.FRONTEND_ORIGIN || 'http://localhost:5000';
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
  const createdAt = row.created_at ? new Date(row.created_at) : new Date(0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const isNew = createdAt >= sevenDaysAgo;

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
    isFeatured: Boolean(row.isFeatured),
    isNew: isNew
  };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

async function ensureBrowsingHistoryTable(req) {
  if (!req.db || typeof req.db.query !== 'function') {
    return;
  }

  await req.db.query(`
    CREATE TABLE IF NOT EXISTS public.user_browsing_history (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
      viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await req.db.query(`
    CREATE INDEX IF NOT EXISTS idx_user_browsing_history_user_viewed_at
    ON public.user_browsing_history (user_id, viewed_at DESC)
  `);
}

async function recordProductView(req, customerId, productId) {
  if (!req.db || typeof req.db.query !== 'function') {
    return;
  }

  if (!customerId || !isUuid(customerId) || !productId || !isUuid(productId)) {
    return;
  }

  try {
    await ensureBrowsingHistoryTable(req);
    const historyId = randomUUID();
    await req.db.query(
      `INSERT INTO public.user_browsing_history (id, user_id, product_id, viewed_at)
       VALUES ($1, $2, $3, NOW())`,
      [historyId, customerId, productId]
    );
  } catch (error) {
    console.warn('Failed to record browsing history:', error.message || error);
  }
}

async function queryRecommendedProductsForUser(req, limit) {
  const customerId = resolveCustomerId(req);
  if (!customerId || !isUuid(customerId) || !req.db || typeof req.db.query !== 'function') {
    return [];
  }

  try {
    await ensureBrowsingHistoryTable(req);

    const sql = `
      WITH recent_views AS (
        SELECT product_id
        FROM public.user_browsing_history
        WHERE user_id = $1
        ORDER BY viewed_at DESC, id DESC
        LIMIT 12
      ),
      viewed_products AS (
        SELECT
          p.id,
          p.category_id,
          p.brand_id,
          p.base_price
        FROM public.products p
        JOIN recent_views rv ON rv.product_id = p.id
      ),
      viewed_product_tags AS (
        SELECT DISTINCT unnest(COALESCE(p.tags, ARRAY[]::text[])) AS tag
        FROM public.products p
        JOIN recent_views rv ON rv.product_id = p.id
      ),
      price_stats AS (
        SELECT
          MIN(base_price) AS min_price,
          MAX(base_price) AS max_price,
          AVG(base_price) AS avg_price
        FROM viewed_products
      )
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
        (
          CASE WHEN EXISTS (SELECT 1 FROM viewed_products vp WHERE vp.category_id IS NOT NULL AND vp.category_id = p.category_id) THEN 3 ELSE 0 END +
          CASE WHEN EXISTS (SELECT 1 FROM viewed_products vp WHERE vp.brand_id IS NOT NULL AND vp.brand_id = p.brand_id) THEN 2 ELSE 0 END +
          CASE WHEN EXISTS (
            SELECT 1
            FROM viewed_product_tags vpt
            WHERE EXISTS (
              SELECT 1
              FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) AS tag
              WHERE tag = vpt.tag
            )
          ) THEN 2 ELSE 0 END +
          CASE WHEN ps.min_price IS NOT NULL AND ps.max_price IS NOT NULL AND p.base_price BETWEEN ps.min_price AND ps.max_price THEN 1 ELSE 0 END
        )::int AS "matchScore"
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
      LEFT JOIN price_stats ps ON TRUE
      WHERE p.status = 'active'
        AND p.id NOT IN (SELECT product_id FROM recent_views)
        AND (
          EXISTS (SELECT 1 FROM viewed_products vp WHERE vp.category_id IS NOT NULL AND vp.category_id = p.category_id)
          OR EXISTS (SELECT 1 FROM viewed_products vp WHERE vp.brand_id IS NOT NULL AND vp.brand_id = p.brand_id)
          OR EXISTS (
            SELECT 1
            FROM viewed_product_tags vpt
            WHERE EXISTS (
              SELECT 1
              FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) AS tag
              WHERE tag = vpt.tag
            )
          )
        )
      ORDER BY "matchScore" DESC, COALESCE(p.average_rating, 0) DESC, COALESCE(p.total_reviews, 0) DESC, p.created_at DESC
      LIMIT $2
    `;

    const result = await req.db.query(sql, [customerId, Math.max(limit, 1)]);
    return result.rows.length ? result.rows.map(mapHomepageProduct) : [];
  } catch (error) {
    console.warn('Failed to load personalized recommendations:', error.message || error);
    return [];
  }
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

async function queryTrendingProducts(req, limit) {
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
      COALESCE(review_stats.avg_rating, p.average_rating, 0) AS rating,
      COALESCE(review_stats.review_count, p.total_reviews, 0) AS "reviewCount",
      COALESCE(c.name, '') AS "categoryName",
      COALESCE(b.name, '') AS brand,
      COALESCE(sp.store_name, 'Store') AS "sellerName",
      COALESCE(pm.image_url, '') AS "productImage",
      p.is_featured AS "isFeatured",
      p.created_at,
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
      ORDER BY is_primary DESC, sort_order ASC, id ASC
      LIMIT 1
    ) pm ON TRUE
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
    ORDER BY "trendScore" DESC, COALESCE(review_stats.review_count, 0) DESC, COALESCE(review_stats.avg_rating, p.average_rating, 0) DESC, p.created_at DESC
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
      SELECT
        COALESCE(SUM(oi.quantity), 0)::int AS units_sold,
        MAX(o.updated_at) AS last_sale_at
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.product_id = p.id
        AND LOWER(COALESCE(o.status::text, '')) = 'delivered'
    ) sales ON TRUE
    WHERE p.status = 'active'
    ORDER BY COALESCE(sales.units_sold, 0) DESC, COALESCE(p.average_rating, 0) DESC, COALESCE(p.total_reviews, 0) DESC, sales.last_sale_at DESC NULLS LAST, p.created_at DESC
    LIMIT $1
  `;

  const result = await req.db.query(sql, [Math.max(limit, 1)]);
  if (!result.rows.length) {
    return queryHomepageProducts(req, limit, '', 'p.total_reviews DESC, p.average_rating DESC, p.created_at DESC');
  }

  return result.rows.map(mapHomepageProduct);
}

async function querySeasonalProducts(req, limit) {
  // Determine current season based on month
  const month = new Date().getMonth() + 1; // 1-12
  let currentSeason = 'summer';
  if (month >= 6 && month <= 8) {
    currentSeason = 'summer';
  } else if (month >= 9 && month <= 11) {
    currentSeason = 'autumn';
  } else if (month === 12 || month <= 2) {
    currentSeason = 'winter';
  } else if (month >= 3 && month <= 5) {
    currentSeason = 'spring';
  }

  // Query products with current season tag
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
      AND p.tags && ARRAY[$2]::text[]
    ORDER BY p.is_featured DESC, COALESCE(p.total_reviews, 0) DESC, COALESCE(p.average_rating, 0) DESC, p.created_at DESC
    LIMIT $1
  `;

  const result = await req.db.query(sql, [Math.max(limit, 1), currentSeason]);
  if (!result.rows.length) {
    // Fallback to featured products if no seasonal products found
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

  const [newArrivals, trendingProducts, bestSellers, seasonalCollection, recentlyAdded, recommendedProducts, limitedDeals] = await Promise.all([
    queryHomepageProducts(req, limit, '', 'p.created_at DESC'),
    queryTrendingProducts(req, limit),
    queryBestSellingProducts(req, limit),
    querySeasonalProducts(req, limit),
    queryHomepageProducts(req, limit, "AND p.created_at >= NOW() - INTERVAL '30 days'", 'p.created_at DESC'),
    queryRecommendedProductsForUser(req, limit),
    getLimitedDealsRows(req, limit)
  ]);

  const rows = [
    { id: 'new-arrivals', title: 'New Arrivals', products: newArrivals },
    ...(recommendedProducts.length ? [{ id: 'recommended-for-you', title: 'Recommended For You', subtitle: 'Based on your recent browsing', products: recommendedProducts }] : []),
    { id: 'trending-products', title: 'Trending Products', products: trendingProducts },
    { id: 'best-sellers', title: 'Best Sellers', products: bestSellers },
    { id: 'seasonal-collection', title: 'Seasonal Collection', products: seasonalCollection },
    ...(limitedDeals.length ? [{ id: 'limited-time-deals', title: 'Limited Time Deals', subtitle: 'Active discounts', products: limitedDeals }] : []),
    { id: 'recently-added', title: 'Recently Added', products: recentlyAdded }
  ];

  return rows;
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
      p.slug,
      p.name,
      p.base_price AS "salePrice",
      COALESCE(p.compare_price, p.base_price) AS "originalPrice",
      CASE
        WHEN COALESCE(p.compare_price, 0) > p.base_price
          THEN ROUND(((p.compare_price - p.base_price) / p.compare_price) * 100)
        ELSE 0
      END AS discount,
      p.discount_percent AS "discountPercent",
      p.discount_start_date AS "discountStartDate",
      p.discount_end_date AS "discountEndDate",
      COALESCE(pm.image_url, '') AS image,
      COALESCE(p.average_rating, 0) AS rating,
      COALESCE(p.total_reviews, 0) AS "reviewCount"
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
  const activeItems = result.rows.filter((row) => isDiscountActive({
    discountPercent: row.discountPercent,
    discountStartDate: row.discountStartDate,
    discountEndDate: row.discountEndDate,
    now
  }));

  const items = activeItems.length
    ? activeItems
    : result.rows.filter((row) => Number(row.discount) > 0);

  const fallbackEndsAt = new Date(now.getTime() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000 + 10 * 1000);
  const endsAt = items.length ? fallbackEndsAt : fallbackEndsAt;

  return {
    title: 'Limited Time Deals',
    subtitle: 'Active discounts and special offers',
    startsAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
    items: items.slice(0, Math.max(limit, 1)).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      salePrice: Number(row.salePrice) || 0,
      originalPrice: Number(row.originalPrice) || 0,
      discount: Number(row.discount) || Number(row.discountPercent) || 0,
      image: normalizeProductImageUrl(row.image),
      rating: Number(row.rating) || 0,
      reviewCount: Number(row.reviewCount) || 0
    }))
  };
}

async function getLimitedDealsRows(req, limit) {
  if (!req.db || typeof req.db.query !== 'function') {
    return [];
  }

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
      p.discount_percent AS "discountPercent",
      p.discount_start_date AS "discountStartDate",
      p.discount_end_date AS "discountEndDate",
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
    ORDER BY discount DESC, p.created_at DESC
    LIMIT $1
  `;

  const result = await req.db.query(sql, [Math.max(limit, 1)]);
  const now = new Date();

  const rows = result.rows.filter((row) => isDiscountActive({
    discountPercent: row.discountPercent,
    discountStartDate: row.discountStartDate,
    discountEndDate: row.discountEndDate,
    now
  }));

  if (!rows.length) {
    return result.rows.filter((row) => Number(row.discount) > 0).map(mapHomepageProduct);
  }

  return rows.map(mapHomepageProduct);
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
