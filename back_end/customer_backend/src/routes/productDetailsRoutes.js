const express = require('express');
const axios = require('axios');
const router = express.Router();
const { getReviewState, isDeliveredOrderStatus } = require('../utils/reviewEligibility');

const HUGGING_FACE_API_URL = process.env.HUGGING_FACE_API_URL || 'https://api-inference.huggingface.co/models/theArijitDas/distilbert-finetuned-fake-reviews';
const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE_TOKEN || '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';
const HUGGING_FACE_HEADERS = {
  Authorization: `Bearer ${HUGGING_FACE_TOKEN}`
};
function getCustomerId(req) {
  const raw = req.auth?.session?.userId || req.headers['x-user-id'] || req.query.userId || req.body?.userId || '';
  return String(raw).trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function parsePagination(req) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

async function getCustomerReview(req, customerId, productId) {
  if (!customerId || !isUuid(customerId)) {
    return null;
  }

  const result = await req.db.query(
    `
    SELECT
      id,
      product_id AS "productId",
      customer_id AS "customerId",
      rating,
      title,
      body,
      is_verified_purchase AS "verifiedPurchase",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM public.product_reviews
    WHERE product_id = $1 AND customer_id = $2
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [productId, customerId]
  );

  return result.rows[0] || null;
}

async function getDeliveredOrderItem(req, customerId, productId) {
  if (!customerId || !isUuid(customerId)) {
    return null;
  }

  const result = await req.db.query(
    `
    SELECT oi.id AS "orderItemId"
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = $1
      AND o.customer_id = $2
      AND o.status = 'delivered'
    ORDER BY o.placed_at DESC, o.created_at DESC, oi.id DESC
    LIMIT 1
    `,
    [productId, customerId]
  );

  return result.rows[0] || null;
}

async function buildReviewEligibility(req, customerId, productId) {
  const [customerReview, deliveredItem] = await Promise.all([
    getCustomerReview(req, customerId, productId),
    getDeliveredOrderItem(req, customerId, productId)
  ]);

  return {
    ...getReviewState({
      review: customerReview,
      eligibleForReview: Boolean(deliveredItem),
      now: new Date()
    }),
    orderItemId: deliveredItem?.orderItemId || null
  };
}

async function evaluateReviewModeration(comment) {
  const aiResult = await checkFakeReview(comment);
  const topResult = Array.isArray(aiResult) ? aiResult[0] : null;
  const label = String(topResult?.label || '').toLowerCase();
  const score = Number(topResult?.score || 0);
  const isFake = label.includes('fake') || label === 'label_0';
  const moderation = {
    checked: true,
    provider: 'huggingface',
    label: topResult?.label || null,
    score,
    verdict: isFake && score > 0.7 ? 'REJECTED' : 'APPROVED'
  };

  return {
    moderation,
    isRejected: isFake && score > 0.7
  };
}

async function resolveProduct(req, productIdOrSlug) {
  const sql = `
    SELECT
      p.id,
      p.seller_id AS "sellerId",
      p.category_id AS "categoryId",
      p.brand_id AS "brandId",
      p.sku,
      p.name,
      p.slug,
      p.description AS "shortDescription",
      p.description AS "longDescription",
      p.base_price AS "basePrice",
      p.compare_price AS "compareAtPrice",
      p.currency,
      COALESCE(stock.stock_quantity, 0) AS "stockQuantity",
      p.average_rating AS "averageRating",
      p.total_reviews AS "reviewCount",
      (p.status = 'active') AS "isActive",
      b.name AS "brandName",
      c.name AS "categoryName",
      sp.store_name AS "sellerName"
    FROM public.products p
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(COALESCE(pv.stock_quantity, 0)), 0)::int AS stock_quantity
      FROM public.product_variants pv
      WHERE pv.product_id = p.id AND pv.is_active = TRUE
    ) stock ON TRUE
    WHERE p.status = 'active'
      AND (p.id::text = $1 OR p.slug = $1)
    LIMIT 1
  `;

  const result = await req.db.query(sql, [productIdOrSlug]);
  return result.rows[0] || null;
}

async function getProductSummary(req, productId) {
  const summarySql = `
    SELECT
      COALESCE(COUNT(DISTINCT oi.order_id), 0)::int AS "ordersCount",
      COALESCE(SUM(oi.quantity), 0)::int AS "unitsSold"
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = $1
      AND o.status IN ('confirmed', 'processing', 'shipped', 'delivered', 'returned', 'refunded')
  `;

  const summaryResult = await req.db.query(summarySql, [productId]);
  return summaryResult.rows[0] || { ordersCount: 0, unitsSold: 0 };
}

async function checkFakeReview(text) {
  const response = await axios.post(
    HUGGING_FACE_API_URL,
    { inputs: text },
    { headers: HUGGING_FACE_HEADERS }
  );

  return response.data;
}

router.get('/:productId', async (req, res) => {
  const customerId = getCustomerId(req);
  const productId = String(req.params.productId || '').trim();

  try {
    const product = await resolveProduct(req, productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const [mediaResult, variantsResult, specsResult, summary, wishlistResult] = await Promise.all([
      req.db.query(
        `
        SELECT id, image_url AS "mediaUrl", alt_text AS "altText", sort_order AS "sortOrder", is_primary AS "isPrimary"
        FROM public.product_images
        WHERE product_id = $1
        ORDER BY is_primary DESC, sort_order ASC, id ASC
        `,
        [product.id]
      ),
      req.db.query(
        `
        SELECT
          id,
          sku AS "variantSku",
          COALESCE(NULLIF(variant_name, ''), 'Variant') AS title,
          attributes,
          price,
          NULL::numeric AS "compareAtPrice",
          stock_quantity AS "stockQuantity"
        FROM public.product_variants
        WHERE product_id = $1 AND is_active = TRUE
        ORDER BY id ASC
        `,
        [product.id]
      ),
      req.db.query(
        `
        SELECT NULL::text AS "key", NULL::text AS "value", 0::int AS "sortOrder"
        WHERE FALSE
        `,
        []
      ),
      getProductSummary(req, product.id),
      isUuid(customerId)
        ? req.db.query(
            'SELECT 1 FROM public.wishlists WHERE customer_id = $1 AND product_id = $2 LIMIT 1',
            [customerId, product.id]
          )
        : Promise.resolve({ rows: [] })
    ]);

    const pricing = {
      basePrice: Number(product.basePrice),
      compareAtPrice: product.compareAtPrice !== null ? Number(product.compareAtPrice) : null,
      currency: product.currency,
      discountPercent:
        product.compareAtPrice && Number(product.compareAtPrice) > Number(product.basePrice)
          ? Math.round(((Number(product.compareAtPrice) - Number(product.basePrice)) / Number(product.compareAtPrice)) * 100)
          : 0
    };

    return res.json({
      success: true,
      data: {
        product,
        pricing,
        stock: {
          inStock: Number(product.stockQuantity) > 0,
          stockQuantity: Number(product.stockQuantity)
        },
        media: mediaResult.rows,
        variants: variantsResult.rows,
        specifications: specsResult.rows,
        rating: {
          average: Number(product.averageRating || 0),
          count: Number(product.reviewCount || 0)
        },
        sales: {
          unitsSold: Number(summary.unitsSold || 0),
          ordersCount: Number(summary.ordersCount || 0)
        },
        customerState: {
          inWishlist: Boolean(wishlistResult.rows.length)
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch product details', error: error.message });
  }
});

router.get('/:productId/specifications', async (req, res) => {
  const productId = String(req.params.productId || '').trim();

  try {
    const product = await resolveProduct(req, productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    return res.json({ success: true, data: [] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch specifications', error: error.message });
  }
});

router.get('/:productId/reviews', async (req, res) => {
  const customerId = getCustomerId(req);
  const productId = String(req.params.productId || '').trim();
  const { page, limit, offset } = parsePagination(req);
  const ratingFilter = Number(req.query.rating);
  const sortBy = String(req.query.sortBy || 'newest').trim().toLowerCase();

  const orderByMap = {
    newest: 'r.created_at DESC',
    helpful: 'r.helpful_count DESC, r.created_at DESC',
    'rating-desc': 'r.rating DESC, r.created_at DESC',
    'rating-asc': 'r.rating ASC, r.created_at DESC'
  };

  try {
    const product = await resolveProduct(req, productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const where = ['r.product_id = $1', 'NOT r.is_hidden'];
    const params = [product.id];

    if (ratingFilter >= 1 && ratingFilter <= 5) {
      params.push(ratingFilter);
      where.push(`r.rating = $${params.length}`);
    }

    params.push(limit, offset);

    const listSql = `
      SELECT
        r.id,
        r.rating,
        r.title,
        r.body,
        r.is_verified_purchase AS "verifiedPurchase",
        0::int AS "helpfulCount",
        r.created_at AS "createdAt",
        u.id AS "userId",
        u.full_name AS "userName",
        NULL::text AS "userAvatar"
      FROM public.product_reviews r
      JOIN public.users u ON u.id = r.customer_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderByMap[sortBy] || orderByMap.newest}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM public.product_reviews r
      WHERE ${where.join(' AND ')}
    `;

    const summarySql = `
      SELECT
        ROUND(AVG(r.rating)::numeric, 2) AS "averageRating",
        COUNT(*)::int AS "totalReviews",
        COUNT(*) FILTER (WHERE r.rating = 5)::int AS "rating5",
        COUNT(*) FILTER (WHERE r.rating = 4)::int AS "rating4",
        COUNT(*) FILTER (WHERE r.rating = 3)::int AS "rating3",
        COUNT(*) FILTER (WHERE r.rating = 2)::int AS "rating2",
        COUNT(*) FILTER (WHERE r.rating = 1)::int AS "rating1"
      FROM public.product_reviews r
      WHERE r.product_id = $1 AND NOT r.is_hidden
    `;

    const [listResult, countResult, summaryResult, customerReview, reviewEligibility] = await Promise.all([
      req.db.query(listSql, params),
      req.db.query(countSql, params.slice(0, params.length - 2)),
      req.db.query(summarySql, [product.id]),
      getCustomerReview(req, customerId, product.id),
      buildReviewEligibility(req, customerId, product.id)
    ]);

    return res.json({
      success: true,
      data: {
        reviews: listResult.rows,
        summary: summaryResult.rows[0],
        pagination: {
          page,
          limit,
          total: countResult.rows[0].total
        },
        customerReview: customerReview || null,
        reviewEligibility
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch reviews', error: error.message });
  }
});

router.post('/:productId/reviews', async (req, res) => {
  const customerId = getCustomerId(req);
  const productId = String(req.params.productId || '').trim();
  const rating = Number(req.body.rating);
  const title = String(req.body.title || '').trim();
  const comment = String(req.body.comment || '').trim();

  if (!(rating >= 1 && rating <= 5)) {
    return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
  }

  if (comment.length < 10) {
    return res.status(400).json({ success: false, message: 'Review comment must be at least 10 characters long' });
  }

  try {
    const product = await resolveProduct(req, productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (!customerId || !isUuid(customerId)) {
      return res.status(401).json({ success: false, message: 'Customer authentication required' });
    }

    const { moderation, isRejected } = await evaluateReviewModeration(comment);
    if (isRejected) {
      return res.status(422).json({
        success: false,
        status: 'REJECTED',
        message: 'Review rejected by AI moderation',
        reason: 'Fake review detected',
        moderation
      });
    }

    const reviewEligibility = await buildReviewEligibility(req, customerId, product.id);
    if (!reviewEligibility.eligibleForReview) {
      return res.status(403).json({
        success: false,
        message: 'You can review this product only after receiving the delivered order.'
      });
    }

    const existingReview = await getCustomerReview(req, customerId, product.id);
    if (existingReview) {
      if (reviewEligibility.canEdit) {
        const updateResult = await req.db.query(
          `
          UPDATE public.product_reviews
          SET rating = $1, title = $2, body = $3, updated_at = NOW()
          WHERE id = $4 AND customer_id = $5
          RETURNING
            id,
            product_id AS "productId",
            customer_id AS "customerId",
            rating,
            title,
            body,
            is_verified_purchase AS "verifiedPurchase",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          `,
          [rating, title || null, comment, existingReview.id, customerId]
        );

        return res.status(200).json({
          success: true,
          status: 'APPROVED',
          message: 'Review updated successfully',
          moderation,
          data: updateResult.rows[0] || null
        });
      }

      return res.status(409).json({
        success: false,
        message: 'You already reviewed this product. Delete your existing review to submit a new one.'
      });
    }

    const reviewSql = `
      INSERT INTO public.product_reviews (
        product_id,
        customer_id,
        order_item_id,
        rating,
        title,
        body,
        is_verified_purchase
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        product_id AS "productId",
        customer_id AS "customerId",
        rating,
        title,
        body,
        is_verified_purchase AS "verifiedPurchase",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    const result = await req.db.query(reviewSql, [
      product.id,
      customerId,
      reviewEligibility.orderItemId || null,
      rating,
      title || null,
      comment,
      Boolean(reviewEligibility.orderItemId)
    ]);

    return res.status(201).json({
      success: true,
      status: 'APPROVED',
      message: 'Review checked by AI and submitted successfully',
      moderation,
      data: result.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to submit review', error: error.message });
  }
});

router.put('/:productId/reviews/:reviewId', async (req, res) => {
  const customerId = getCustomerId(req);
  const productId = String(req.params.productId || '').trim();
  const reviewId = String(req.params.reviewId || '').trim();
  const rating = Number(req.body.rating);
  const title = String(req.body.title || '').trim();
  const comment = String(req.body.comment || '').trim();

  if (!(rating >= 1 && rating <= 5)) {
    return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
  }

  if (comment.length < 10) {
    return res.status(400).json({ success: false, message: 'Review comment must be at least 10 characters long' });
  }

  try {
    const product = await resolveProduct(req, productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (!customerId || !isUuid(customerId)) {
      return res.status(401).json({ success: false, message: 'Customer authentication required' });
    }

    const existingReview = await getCustomerReview(req, customerId, product.id);
    if (!existingReview || existingReview.id !== reviewId) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    const reviewEligibility = await buildReviewEligibility(req, customerId, product.id);
    if (!reviewEligibility.canEdit) {
      return res.status(403).json({ success: false, message: 'Review edit window has expired.' });
    }

    const { moderation, isRejected } = await evaluateReviewModeration(comment);
    if (isRejected) {
      return res.status(422).json({
        success: false,
        status: 'REJECTED',
        message: 'Review rejected by AI moderation',
        reason: 'Fake review detected',
        moderation
      });
    }

    const updateResult = await req.db.query(
      `
      UPDATE public.product_reviews
      SET rating = $1, title = $2, body = $3, updated_at = NOW()
      WHERE id = $4 AND product_id = $5 AND customer_id = $6
      RETURNING
        id,
        product_id AS "productId",
        customer_id AS "customerId",
        rating,
        title,
        body,
        is_verified_purchase AS "verifiedPurchase",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      `,
      [rating, title || null, comment, reviewId, product.id, customerId]
    );

    return res.status(200).json({
      success: true,
      status: 'APPROVED',
      message: 'Review updated successfully',
      moderation,
      data: updateResult.rows[0] || null
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update review', error: error.message });
  }
});

router.delete('/:productId/reviews/:reviewId', async (req, res) => {
  const customerId = getCustomerId(req);
  const productId = String(req.params.productId || '').trim();
  const reviewId = String(req.params.reviewId || '').trim();

  try {
    const product = await resolveProduct(req, productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (!customerId || !isUuid(customerId)) {
      return res.status(401).json({ success: false, message: 'Customer authentication required' });
    }

    const existingReview = await getCustomerReview(req, customerId, product.id);
    if (!existingReview || existingReview.id !== reviewId) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    await req.db.query(
      `DELETE FROM public.product_reviews WHERE id = $1 AND product_id = $2 AND customer_id = $3`,
      [reviewId, product.id, customerId]
    );

    return res.json({ success: true, message: 'Review deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete review', error: error.message });
  }
});

router.get('/:productId/related', async (req, res) => {
  const productId = String(req.params.productId || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20);

  try {
    const product = await resolveProduct(req, productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const sql = `
      SELECT
        p.id,
        p.slug,
        p.name,
        p.base_price AS "basePrice",
        p.compare_price AS "compareAtPrice",
        p.currency,
        p.average_rating AS "averageRating",
        p.total_reviews AS "reviewCount",
        COALESCE(pm.image_url, '') AS "imageUrl"
      FROM public.products p
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM public.product_images
        WHERE product_id = p.id
        ORDER BY is_primary DESC, sort_order ASC
        LIMIT 1
      ) pm ON TRUE
      WHERE p.id <> $1
        AND p.status = 'active'
        AND (
          p.category_id = $2
          OR p.seller_id = $3
        )
      ORDER BY p.average_rating DESC, p.total_reviews DESC, p.created_at DESC
      LIMIT $4
    `;

    const result = await req.db.query(sql, [product.id, product.categoryId, product.sellerId, limit]);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch related products', error: error.message });
  }
});

module.exports = router;
