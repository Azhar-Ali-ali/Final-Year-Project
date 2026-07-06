/**
 * Wishlist Routes
 * REST API endpoints for wishlist functionality
 */

const express = require('express');
const router = express.Router();
const {
  getWishlist,
  getWishlistSummary,
  addToWishlist,
  removeFromWishlist,
  removeByProductId,
  clearWishlist,
  checkInWishlist,
  moveToCart,
  getWishlistByCategory,
  getWishlistAvailability
} = require('../data/wishlistData');

function isLikelyUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function getSessionCustomerId(req) {
  return String(req.auth?.session?.userId || req.headers['x-user-id'] || '').trim();
}

function buildEmptyWishlist(userId) {
  return {
    userId,
    items: [],
    summary: {
      totalItems: 0,
      inStockItems: 0,
      outOfStockItems: 0,
      totalValue: 0,
      totalSavings: 0
    }
  };
}

function normalizeDbWishlistRows(rows) {
  return rows.map((row) => {
    const price = Number(row.price) || 0;
    const originalPrice = Number(row.originalPrice) || price;
    const discount = Number.isFinite(Number(row.discount))
      ? Number(row.discount)
      : (originalPrice > 0 ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0);

    return {
      id: row.id,
      productId: row.productId,
      addedAt: row.addedAt,
      notes: row.notes || '',
      productName: row.productName || 'Product',
      price,
      originalPrice,
      discount: Math.max(0, discount),
      image: row.image || 'https://via.placeholder.com/300',
      stock: Number(row.stock) || 0,
      category: row.category || 'General',
      sellerId: row.sellerId,
      sellerName: row.sellerName || 'Store',
      sellerRating: Number(row.sellerRating) || 0,
      inStock: Boolean(row.inStock),
      isAvailable: Boolean(row.isAvailable),
      productUrl: `products_details.html?id=${row.productId}`
    };
  });
}

async function getWishlistFromDatabase(req, userId) {
  const result = await req.db.query(
    `
    SELECT
      w.id,
      w.product_id AS "productId",
      w.created_at AS "addedAt",
      '' AS notes,
      p.name AS "productName",
      p.base_price AS price,
      p.compare_price AS "originalPrice",
      CASE
        WHEN p.compare_price IS NOT NULL AND p.compare_price > p.base_price
        THEN ROUND(((p.compare_price - p.base_price) / p.compare_price) * 100)
        ELSE 0
      END AS discount,
      COALESCE(pi.image_url, '') AS image,
      COALESCE(stock.stock_quantity, 0) AS stock,
      COALESCE(c.name, 'General') AS category,
      p.seller_id AS "sellerId",
      COALESCE(sp.store_name, 'Store') AS "sellerName",
      COALESCE(sp.rating, 0) AS "sellerRating",
      COALESCE(stock.stock_quantity, 0) > 0 AS "inStock",
      COALESCE(p.status, 'active') = 'active' AND COALESCE(stock.stock_quantity, 0) > 0 AS "isAvailable"
    FROM public.wishlists w
    JOIN public.products p ON p.id = w.product_id
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(COALESCE(pv.stock_quantity, 0)), 0)::int AS stock_quantity
      FROM public.product_variants pv
      WHERE pv.product_id = p.id AND pv.is_active = TRUE
    ) stock ON TRUE
    LEFT JOIN LATERAL (
      SELECT image_url
      FROM public.product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order ASC, id ASC
      LIMIT 1
    ) pi ON TRUE
    WHERE w.customer_id = $1
    ORDER BY w.created_at DESC
    `,
    [userId]
  );

  const items = normalizeDbWishlistRows(result.rows);
  const totalItems = items.length;
  const inStockItems = items.filter((item) => item.inStock && item.isAvailable).length;
  const totalValue = items.reduce((sum, item) => sum + item.price, 0);
  const totalSavings = items.reduce((sum, item) => sum + Math.max((item.originalPrice || item.price) - item.price, 0), 0);

  return {
    userId,
    items,
    summary: {
      totalItems,
      inStockItems,
      outOfStockItems: totalItems - inStockItems,
      totalValue: Number(totalValue.toFixed(2)),
      totalSavings: Number(totalSavings.toFixed(2))
    }
  };
}

async function getWishlistForUser(req, userId) {
  if (req.db && typeof req.db.query === 'function' && isLikelyUuid(userId)) {
    try {
      return await getWishlistFromDatabase(req, userId);
    } catch (error) {
      console.warn('Falling back to in-memory wishlist data:', error.message);
    }
  }

  const items = getWishlist(userId);
  return {
    userId,
    items,
    summary: getWishlistSummary(userId)
  };
}

/**
 * GET /api/wishlist/:userId
 * Get all wishlist items for a user with enriched product data
 * Query params:
 *   - category: Filter by category (optional)
 *   - availability: 'available' | 'unavailable' | 'all' (optional, default: 'all')
 *   - sortBy: 'dateAdded' | 'price' | 'name' | 'discount' (optional)
 *   - order: 'asc' | 'desc' (optional, default: 'desc')
 */
router.get('/:userId', async (req, res) => {
  try {
    const userId = getSessionCustomerId(req);
    const { category, availability, sortBy, order = 'desc' } = req.query;

    if (!isLikelyUuid(userId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    let wishlist;
    
    const baseWishlist = await getWishlistForUser(req, userId);

    // Filter by availability
    if (availability === 'available' || availability === 'unavailable') {
      if (baseWishlist.items && baseWishlist.items.length && isLikelyUuid(userId)) {
        wishlist = availability === 'available'
          ? baseWishlist.items.filter((item) => item.isAvailable)
          : baseWishlist.items.filter((item) => !item.isAvailable);
      } else {
        const { available, unavailable } = getWishlistAvailability(userId);
        wishlist = availability === 'available' ? available : unavailable;
      }
    } else {
      wishlist = baseWishlist.items;
    }
    
    // Filter by category if provided
    if (category) {
      wishlist = wishlist.filter(item => 
        item.category && item.category.toLowerCase() === category.toLowerCase()
      );
    }
    
    // Sort wishlist
    if (sortBy) {
      wishlist.sort((a, b) => {
        let compareValue = 0;
        
        switch (sortBy) {
          case 'dateAdded':
            compareValue = new Date(a.addedAt) - new Date(b.addedAt);
            break;
          case 'price':
            compareValue = (a.price || 0) - (b.price || 0);
            break;
          case 'name':
            compareValue = (a.productName || '').localeCompare(b.productName || '');
            break;
          case 'discount':
            compareValue = (a.discount || 0) - (b.discount || 0);
            break;
          default:
            compareValue = new Date(a.addedAt) - new Date(b.addedAt);
        }
        
        return order === 'asc' ? compareValue : -compareValue;
      });
    }
    
    const summary = baseWishlist.summary || getWishlistSummary(userId);
    
    res.json({
      success: true,
      data: {
        items: wishlist,
        summary
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wishlist',
      message: error.message
    });
  }
});

/**
 * GET /api/wishlist/:userId/summary
 * Get wishlist summary (count, total value, etc.)
 */
router.get('/:userId/summary', (req, res) => {
  try {
    const userId = getSessionCustomerId(req);
    if (!isLikelyUuid(userId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const summary = getWishlistSummary(userId);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wishlist summary',
      message: error.message
    });
  }
});

/**
 * GET /api/wishlist/:userId/check/:productId
 * Check if a product is in user's wishlist
 */
router.get('/:userId/check/:productId', (req, res) => {
  try {
    const userId = getSessionCustomerId(req);
    const { productId } = req.params;
    if (!isLikelyUuid(userId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const result = checkInWishlist(userId, parseInt(productId));
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check wishlist status',
      message: error.message
    });
  }
});

/**
 * GET /api/wishlist/:userId/availability
 * Get wishlist items separated by availability
 */
router.get('/:userId/availability', (req, res) => {
  try {
    const userId = getSessionCustomerId(req);
    if (!isLikelyUuid(userId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const result = getWishlistAvailability(userId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wishlist availability',
      message: error.message
    });
  }
});

/**
 * POST /api/wishlist/:userId
 * Add item to wishlist
 * Body: { productId, notes? }
 */
router.post('/:userId', async (req, res) => {
  try {
    const userId = getSessionCustomerId(req);
    const { productId, notes } = req.body;

    // Debug: log incoming request details to help diagnose bad requests
    console.log('[Wishlist POST] userId resolved:', userId, 'body:', req.body);

    if (!isLikelyUuid(userId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'Product ID is required'
      });
    }
    
    let result;

    if (req.db && typeof req.db.query === 'function' && isLikelyUuid(userId)) {
      const productResult = await req.db.query(
        'SELECT id FROM public.products WHERE id = $1 LIMIT 1',
        [String(productId)]
      );

      if (!productResult.rows.length) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      const insertResult = await req.db.query(
        `
        INSERT INTO public.wishlists (customer_id, product_id)
        VALUES ($1, $2)
        ON CONFLICT (customer_id, product_id) DO NOTHING
        RETURNING id
        `,
        [userId, String(productId)]
      );

      if (!insertResult.rows.length) {
        return res.status(400).json({ success: false, error: 'Product already in wishlist' });
      }

      const refreshed = await getWishlistForUser(req, userId);
      result = {
        success: true,
        message: 'Product added to wishlist',
        item: refreshed.items.find((item) => item.productId === String(productId)),
        wishlistCount: refreshed.summary.totalItems
      };
    } else {
      result = addToWishlist(userId, parseInt(productId, 10), notes);
    }
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to add to wishlist',
      message: error.message
    });
  }
});

/**
 * DELETE /api/wishlist/:userId/item/:itemId
 * Remove specific item from wishlist (by wishlist item ID)
 */
router.delete('/:userId/item/:itemId', async (req, res) => {
  try {
    const userId = getSessionCustomerId(req);
    const { itemId } = req.params;
    let result;

    if (!isLikelyUuid(userId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.db && typeof req.db.query === 'function' && isLikelyUuid(userId)) {
      const deleteResult = await req.db.query(
        'DELETE FROM public.wishlists WHERE customer_id = $1 AND id = $2 RETURNING id',
        [userId, itemId]
      );

      if (!deleteResult.rowCount) {
        return res.status(404).json({ success: false, error: 'Item not found in wishlist' });
      }

      const refreshed = await getWishlistForUser(req, userId);
      result = {
        success: true,
        message: 'Item removed from wishlist',
        wishlistCount: refreshed.summary.totalItems
      };
    } else {
      result = removeFromWishlist(userId, parseInt(itemId, 10));
    }
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to remove from wishlist',
      message: error.message
    });
  }
});

/**
 * DELETE /api/wishlist/:userId/product/:productId
 * Remove item from wishlist by product ID
 */
router.delete('/:userId/product/:productId', async (req, res) => {
  try {
    const userId = getSessionCustomerId(req);
    const { productId } = req.params;
    let result;

    if (!isLikelyUuid(userId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.db && typeof req.db.query === 'function' && isLikelyUuid(userId)) {
      const deleteResult = await req.db.query(
        'DELETE FROM public.wishlists WHERE customer_id = $1 AND product_id = $2 RETURNING id',
        [userId, String(productId)]
      );

      if (!deleteResult.rowCount) {
        return res.status(404).json({ success: false, error: 'Product not in wishlist' });
      }

      const refreshed = await getWishlistForUser(req, userId);
      result = {
        success: true,
        message: 'Item removed from wishlist',
        wishlistCount: refreshed.summary.totalItems
      };
    } else {
      result = removeByProductId(userId, parseInt(productId, 10));
    }
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to remove from wishlist',
      message: error.message
    });
  }
});

/**
 * DELETE /api/wishlist/:userId
 * Clear entire wishlist
 */
router.delete('/:userId', async (req, res) => {
  try {
    const userId = getSessionCustomerId(req);
    let result;

    if (!isLikelyUuid(userId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.db && typeof req.db.query === 'function' && isLikelyUuid(userId)) {
      await req.db.query('DELETE FROM public.wishlists WHERE customer_id = $1', [userId]);
      result = { success: true, message: 'Wishlist cleared', clearedCount: 0 };
    } else {
      result = clearWishlist(userId);
    }
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to clear wishlist',
      message: error.message
    });
  }
});

/**
 * POST /api/wishlist/:userId/move-to-cart
 * Move selected items from wishlist to cart
 * Body: { itemIds: [1, 2, 3], quantities?: { 1: 2, 2: 1 } }
 */
router.post('/:userId/move-to-cart', async (req, res) => {
  try {
    const userId = getSessionCustomerId(req);
    const { itemIds, quantities } = req.body;

    if (!isLikelyUuid(userId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'itemIds array is required and must not be empty'
      });
    }
    
    let result;

    if (req.db && typeof req.db.query === 'function' && isLikelyUuid(userId)) {
      const cartResult = await req.db.query(
        'SELECT id FROM public.carts WHERE customer_id = $1 LIMIT 1',
        [userId]
      );

      let cartId = cartResult.rows[0]?.id;
      if (!cartId) {
        const insertCartResult = await req.db.query(
          `INSERT INTO public.carts (customer_id) VALUES ($1) RETURNING id`,
          [userId]
        );
        cartId = insertCartResult.rows[0].id;
      }

      const wishlistRows = await req.db.query(
        `
        SELECT w.id, w.product_id AS "productId", p.name AS "productName", p.base_price AS price,
               p.compare_price AS "originalPrice", p.seller_id AS "sellerId",
               COALESCE(sp.store_name, 'Store') AS "sellerName",
               COALESCE(pi.image_url, '') AS "productImage",
               COALESCE(stock.stock_quantity, 0) > 0 AS "inStock"
        FROM public.wishlists w
        JOIN public.products p ON p.id = w.product_id
        LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(COALESCE(pv.stock_quantity, 0)), 0)::int AS stock_quantity
          FROM public.product_variants pv
          WHERE pv.product_id = p.id AND pv.is_active = TRUE
        ) stock ON TRUE
        LEFT JOIN LATERAL (
          SELECT image_url
          FROM public.product_images
          WHERE product_id = p.id
          ORDER BY is_primary DESC, sort_order ASC, id ASC
          LIMIT 1
        ) pi ON TRUE
        WHERE w.customer_id = $1 AND w.id = ANY($2::uuid[])
        `,
        [userId, itemIds]
      );

      const addedToCart = [];
      for (const row of wishlistRows.rows) {
        const quantity = Number(quantities?.[row.id]) || 1;
        await req.db.query(
          `
          INSERT INTO public.cart_items (cart_id, product_id, quantity, unit_price)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (cart_id, product_id, variant_id)
          DO UPDATE SET quantity = public.cart_items.quantity + EXCLUDED.quantity,
                        updated_at = NOW()
          `,
          [cartId, row.productId, quantity, Number(row.price) || 0]
        );

        await req.db.query('DELETE FROM public.wishlists WHERE id = $1', [row.id]);

        addedToCart.push({
          itemId: row.id,
          productId: row.productId,
          cartItemId: null
        });
      }

      result = {
        success: true,
        message: `${addedToCart.length} item(s) moved to cart`,
        addedToCart,
        skippedItems: []
      };
    } else {
      result = moveToCart(userId, itemIds, { quantities });
    }
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to move items to cart',
      message: error.message
    });
  }
});

/**
 * GET /api/wishlist/:userId/category/:category
 * Get wishlist items filtered by category
 */
router.get('/:userId/category/:category', (req, res) => {
  try {
    const { userId, category } = req.params;
    const items = getWishlistByCategory(userId, category);
    
    res.json({
      success: true,
      data: {
        category,
        items,
        count: items.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wishlist by category',
      message: error.message
    });
  }
});

module.exports = router;
