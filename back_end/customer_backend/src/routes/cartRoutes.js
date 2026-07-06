/**
 * Cart Routes
 * REST API endpoints for shopping cart operations
 */

const express = require('express');
const router = express.Router();
const {
  getCart,
  addToCart,
  updateCartItemQuantity,
  removeFromCart,
  clearCart,
  applyCoupon,
  removeCoupon,
  validateCoupon,
  getAvailableCoupons
} = require('../data/cartData');

function isLikelyUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function isSupportedCustomerId(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return isLikelyUuid(trimmed) || /^[A-Za-z0-9_.:-]+$/.test(trimmed);
}

async function resolveCustomerId(req, requestedUserId) {
  const candidates = [
    requestedUserId,
    req.auth?.session?.userId,
    req.headers['x-user-id'],
    req.query?.userId,
    req.body?.userId
  ];

  for (const candidate of candidates) {
    if (isSupportedCustomerId(candidate)) {
      return String(candidate).trim();
    }
  }

  return null;
}

function buildEmptyCart(userId) {
  return {
    userId,
    items: [],
    itemsBySeller: [],
    totalItems: 0,
    appliedCoupon: null,
    totals: {
      subtotal: 0,
      shipping: 0,
      discount: 0,
      total: 0,
      itemCount: 0
    },
    lastUpdated: new Date().toISOString()
  };
}

function normalizeDbCartRows(userId, rows) {
  const items = rows.map((row) => {
    const price = Number(row.price) || 0;
    const originalPrice = Number(row.originalPrice) || price;
    const quantity = Number(row.quantity) || 1;
    const sellerName = row.sellerName || 'Store';
    const productId = row.productId;
    const itemSubtotal = price * quantity;

    return {
      id: row.id,
      productId,
      productName: row.productName || 'Product',
      productUrl: `products_details.html?id=${productId}`,
      productImage: row.productImage || 'https://via.placeholder.com/200',
      price,
      originalPrice,
      quantity,
      attributes: row.attributes || {},
      sellerId: row.sellerId,
      sellerName,
      sellerAvatar: sellerName ? sellerName.charAt(0).toUpperCase() : 'S',
      inStock: Boolean(row.inStock),
      shippingInfo: {
        freeShippingThreshold: 7000,
        standardShipping: 250
      },
      canShipFree: itemSubtotal >= 7000
    };
  });

  const itemsBySellerMap = new Map();
  items.forEach((item) => {
    if (!itemsBySellerMap.has(item.sellerId)) {
      itemsBySellerMap.set(item.sellerId, {
        sellerId: item.sellerId,
        sellerName: item.sellerName,
        sellerAvatar: item.sellerAvatar,
        items: [],
        subtotal: 0,
        shipping: 0,
        freeShippingThreshold: 7000
      });
    }

    const sellerGroup = itemsBySellerMap.get(item.sellerId);
    sellerGroup.items.push(item);
    sellerGroup.subtotal += item.price * item.quantity;
  });

  const itemsBySeller = Array.from(itemsBySellerMap.values()).map((sellerGroup) => {
    const shipping = sellerGroup.subtotal >= sellerGroup.freeShippingThreshold ? 0 : 250;
    return {
      ...sellerGroup,
      shipping,
      shippingMessage: shipping === 0
        ? `FREE shipping on orders over Rs. ${sellerGroup.freeShippingThreshold.toFixed(2)}`
        : `Standard shipping: Rs. ${shipping.toFixed(2)} • Add Rs. ${(sellerGroup.freeShippingThreshold - sellerGroup.subtotal).toFixed(2)} for FREE shipping`
    };
  });

  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shipping = itemsBySeller.reduce((sum, seller) => sum + seller.shipping, 0);

  return {
    userId,
    items,
    itemsBySeller,
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    appliedCoupon: null,
    totals: {
      subtotal: Number(subtotal.toFixed(2)),
      shipping: Number(shipping.toFixed(2)),
      discount: 0,
      total: Number((subtotal + shipping).toFixed(2)),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0)
    },
    lastUpdated: new Date().toISOString()
  };
}

async function getCartFromDatabase(req, userId) {
  try {
    const cartResult = await req.db.query(
      'SELECT id FROM public.carts WHERE customer_id = $1 LIMIT 1',
      [userId]
    );

    if (!cartResult.rows.length) {
      return buildEmptyCart(userId);
    }

    const cartId = cartResult.rows[0].id;
    const itemsResult = await req.db.query(
      `
      SELECT
        ci.id,
        ci.product_id AS "productId",
        ci.quantity,
        ci.unit_price AS price,
        p.compare_price AS "originalPrice",
        p.name AS "productName",
        p.seller_id AS "sellerId",
        COALESCE(sp.store_name, 'Store') AS "sellerName",
        COALESCE(pi.image_url, '') AS "productImage",
        COALESCE(stock.stock_quantity, 0) > 0 AS "inStock"
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
      LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(COALESCE(stock_quantity, 0)), 0)::int AS stock_quantity
        FROM public.product_variants
        WHERE product_id = p.id AND is_active = TRUE
      ) stock ON TRUE
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM public.product_images
        WHERE product_id = p.id
        ORDER BY is_primary DESC, sort_order ASC, id ASC
        LIMIT 1
      ) pi ON TRUE
      WHERE ci.cart_id = $1
      ORDER BY ci.created_at ASC
      `,
      [cartId]
    );

    return normalizeDbCartRows(userId, itemsResult.rows);
  } catch (error) {
    console.warn('[Cart] Falling back to empty cart because database lookup failed:', error.message);
    return buildEmptyCart(userId);
  }
}

async function getCartForUser(req, requestedUserId) {
  const userId = await resolveCustomerId(req, requestedUserId) || 'user_1';

  if (!(req.db && typeof req.db.query === 'function')) {
    return buildEmptyCart(userId);
  }

  return getCartFromDatabase(req, userId);
}

/**
 * GET /api/cart
 * Get user's cart with all items, grouped by seller, and totals
 * Query params:
 *  - userId: string (default: 'user_1')
 */
router.get('/', async (req, res) => {
  try {
    const requestedUserId = String(req.query?.userId || '').trim();
    const cart = await getCartForUser(req, requestedUserId);
    
    res.json({
      success: true,
      data: cart
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cart',
      error: error.message
    });
  }
});

/**
 * POST /api/cart/items
 * Add item to cart
 * Body: {
 *   productId: number,
 *   productName: string,
 *   productImage: string,
 *   price: number,
 *   quantity: number,
 *   attributes: object,
 *   sellerId: number,
 *   sellerName: string
 * }
 */
router.post('/items', async (req, res) => {
  try {
    const requestedUserId = String(req.query?.userId || '').trim();
    const userId = await resolveCustomerId(req, requestedUserId);
    const itemData = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Valid customer is required'
      });
    }

    if (!itemData.productId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: productId'
      });
    }

    if (!(req.db && typeof req.db.query === 'function')) {
      return res.status(503).json({
        success: false,
        message: 'Database client is not configured for cart operations'
      });
    }

    const productId = String(itemData.productId).trim();
    const quantity = Math.max(1, parseInt(itemData.quantity, 10) || 1);

    const productResult = await req.db.query(
      `
      SELECT id, base_price
      FROM public.products
      WHERE id = $1 AND status = 'active'
      LIMIT 1
      `,
      [productId]
    );

    if (!productResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const unitPrice = Number(productResult.rows[0].base_price) || 0;

    const cartResult = await req.db.query(
      'SELECT id FROM public.carts WHERE customer_id = $1 LIMIT 1',
      [userId]
    );

    let cartId = cartResult.rows[0]?.id;

    if (!cartId) {
      const createCartResult = await req.db.query(
        'INSERT INTO public.carts (customer_id) VALUES ($1) RETURNING id',
        [userId]
      );
      cartId = createCartResult.rows[0].id;
    }

    const mergeResult = await req.db.query(
      `
      UPDATE public.cart_items
      SET quantity = quantity + $3,
          unit_price = $4,
          updated_at = NOW()
      WHERE cart_id = $1
        AND product_id = $2
        AND variant_id IS NULL
      RETURNING id
      `,
      [cartId, productId, quantity, unitPrice]
    );

    if (!mergeResult.rowCount) {
      await req.db.query(
        `
        INSERT INTO public.cart_items (cart_id, product_id, quantity, unit_price)
        VALUES ($1, $2, $3, $4)
        `,
        [cartId, productId, quantity, unitPrice]
      );
    }

    const cart = await getCartForUser(req, userId);

    res.status(201).json({
      success: true,
      message: 'Item added to cart',
      data: cart
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add item to cart',
      error: error.message
    });
  }
});

/**
 * PUT /api/cart/items/:itemId
 * Update cart item quantity
 * Body: { quantity: number }
 */
router.put('/items/:itemId', async (req, res) => {
  try {
    const requestedUserId = String(req.query?.userId || '').trim();
    const userId = await resolveCustomerId(req, requestedUserId);
    const itemId = req.params.itemId;
    const { quantity } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Valid customer is required'
      });
    }

    if (!quantity || isNaN(quantity)) {
      return res.status(400).json({
        success: false,
        message: 'Valid quantity is required'
      });
    }

    if (!(req.db && typeof req.db.query === 'function')) {
      return res.status(503).json({
        success: false,
        message: 'Database client is not configured for cart operations'
      });
    }

    const updateResult = await req.db.query(
      `
      UPDATE public.cart_items ci
      SET quantity = $2, updated_at = NOW()
      FROM public.carts c
      WHERE c.id = ci.cart_id
        AND c.customer_id = $1
        AND ci.id = $3
      RETURNING ci.id
      `,
      [userId, parseInt(quantity, 10), itemId]
    );

    if (!updateResult.rowCount) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    const result = await getCartForUser(req, userId);

    if (result.error) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }

    res.json({
      success: true,
      message: 'Cart item updated',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update cart item',
      error: error.message
    });
  }
});

/**
 * DELETE /api/cart/items/:itemId
 * Remove item from cart
 */
router.delete('/items/:itemId', async (req, res) => {
  try {
    const requestedUserId = String(req.query?.userId || '').trim();
    const userId = await resolveCustomerId(req, requestedUserId);
    const itemId = req.params.itemId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Valid customer is required'
      });
    }

    if (!(req.db && typeof req.db.query === 'function')) {
      return res.status(503).json({
        success: false,
        message: 'Database client is not configured for cart operations'
      });
    }

    const deleteResult = await req.db.query(
      `
      DELETE FROM public.cart_items ci
      USING public.carts c
      WHERE c.id = ci.cart_id
        AND c.customer_id = $1
        AND ci.id = $2
      RETURNING ci.id
      `,
      [userId, itemId]
    );

    if (!deleteResult.rowCount) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    const result = await getCartForUser(req, userId);

    if (result.error) {
      return res.status(404).json({
        success: false,
        message: result.error
      });
    }

    res.json({
      success: true,
      message: 'Item removed from cart',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to remove item from cart',
      error: error.message
    });
  }
});

/**
 * DELETE /api/cart
 * Clear entire cart
 */
router.delete('/', async (req, res) => {
  try {
    const requestedUserId = String(req.query?.userId || '').trim();
    const userId = await resolveCustomerId(req, requestedUserId);
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Valid customer is required'
      });
    }

    if (!(req.db && typeof req.db.query === 'function')) {
      return res.status(503).json({
        success: false,
        message: 'Database client is not configured for cart operations'
      });
    }

    const cartResult = await req.db.query(
      'SELECT id FROM public.carts WHERE customer_id = $1 LIMIT 1',
      [userId]
    );

    if (cartResult.rows.length) {
      await req.db.query('DELETE FROM public.cart_items WHERE cart_id = $1', [cartResult.rows[0].id]);
    }

    const cart = await getCartForUser(req, userId);
    
    res.json({
      success: true,
      message: 'Cart cleared',
      data: cart
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart',
      error: error.message
    });
  }
});

/**
 * POST /api/cart/coupon
 * Apply coupon to cart
 * Body: { couponCode: string }
 */
router.post('/coupon', (req, res) => {
  try {
    const userId = String(req.auth?.session?.userId || req.headers['x-user-id'] || '').trim();
    const { couponCode } = req.body;

    if (!isLikelyUuid(userId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code is required'
      });
    }

    const result = applyCoupon(userId, couponCode);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }

    res.json({
      success: true,
      message: result.message,
      data: {
        discount: result.discount,
        cart: result.cart
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to apply coupon',
      error: error.message
    });
  }
});

/**
 * DELETE /api/cart/coupon
 * Remove coupon from cart
 */
router.delete('/coupon', (req, res) => {
  try {
    const userId = String(req.auth?.session?.userId || req.headers['x-user-id'] || '').trim();
    if (!isLikelyUuid(userId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const cart = removeCoupon(userId);
    
    res.json({
      success: true,
      message: 'Coupon removed',
      data: cart
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to remove coupon',
      error: error.message
    });
  }
});

/**
 * GET /api/cart/coupons/validate/:code
 * Validate a coupon code
 */
router.get('/coupons/validate/:code', (req, res) => {
  try {
    const couponCode = req.params.code;
    const result = validateCoupon(couponCode);
    
    if (!result.valid) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: result.message
      });
    }

    res.json({
      success: true,
      valid: true,
      data: result.coupon
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to validate coupon',
      error: error.message
    });
  }
});

/**
 * GET /api/cart/coupons
 * Get all available coupons
 */
router.get('/coupons', (req, res) => {
  try {
    const coupons = getAvailableCoupons();
    
    res.json({
      success: true,
      data: coupons
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupons',
      error: error.message
    });
  }
});

module.exports = router;
