/**
 * Checkout Routes
 * REST API endpoints for checkout, address management, and order creation
 */

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Stripe webhook endpoint to update payment and order status
router.post('/webhooks/stripe', async (req, res) => {
  // Try to verify signature if webhook secret is provided
  let event = null;
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const signature = req.headers['stripe-signature'];
      const rawBody = req.rawBody || '';
      event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = req.body;
    }
  } catch (err) {
    console.error('Stripe webhook signature verification failed', err && err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (!event || !event.type) return res.status(200).json({ received: true });
    if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
      const session = event.data.object;
      const metadata = session.metadata || {};
      const paymentId = metadata.paymentId || metadata.payment_id || null;
      const orderId = metadata.orderId || metadata.order_id || null;

      if (paymentId) {
        await req.db.query(`UPDATE public.payments SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = $1`, [paymentId]);
      }

      if (orderId && await ordersTableHasPaymentStatus(req)) {
        await req.db.query(`UPDATE public.orders SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`, [orderId]);
      }
    }
  } catch (err) {
    console.error('Failed to process stripe webhook', err && err.message);
  }

  res.status(200).json({ received: true });
});
const {
  validatePaymentMethod,
  getCheckoutSummary,
  getOrderById,
  getUserOrders,
} = require('../data/checkoutData');
const { getCart } = require('../data/cartData');
const commissionSettings = require('../../../admin_backend/src/data/commissionSettingsData');

function isLikelyUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function resolveCustomerId(req) {
  return String(req.query?.userId || req.auth?.session?.userId || req.headers['x-user-id'] || '').trim();
}

let cachedOrdersPaymentStatusColumn = null;
async function ordersTableHasPaymentStatus(req) {
  if (cachedOrdersPaymentStatusColumn !== null) {
    return cachedOrdersPaymentStatusColumn;
  }

  try {
    const result = await req.db.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'payment_status' LIMIT 1`
    );
    cachedOrdersPaymentStatusColumn = result.rows.length > 0;
  } catch (err) {
    cachedOrdersPaymentStatusColumn = false;
  }

  return cachedOrdersPaymentStatusColumn;
}

function normalizeCheckoutAddress(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    street: row.street,
    landmark: row.landmark || '',
    city: row.city,
    state: row.state || '',
    country: row.country || 'Pakistan',
    postalCode: row.postalCode,
    type: row.type || 'home',
    isDefault: Boolean(row.isDefault),
    createdAt: row.createdAt
  };
}

function normalizeLocationValue(value) {
  return String(value || '').trim().toLowerCase();
}

async function getShippingChargeForAddress(req, address) {
  if (!req.db || typeof req.db.query !== 'function') {
    return 0;
  }

  try {
    const result = await req.db.query(
      `SELECT id, state, city, shipping_fee FROM public.shipping_charges ORDER BY created_at ASC`
    );

    const rules = (result.rows || []).map((row) => ({
      state: row.state || '',
      city: row.city || '',
      shippingFee: Number(row.shipping_fee || 0)
    }));

    if (!rules.length) {
      return 0;
    }

    const inputState = normalizeLocationValue(address?.state || '');
    const inputCity = normalizeLocationValue(address?.city || '');

    const matches = rules
      .map((rule) => {
        const ruleState = normalizeLocationValue(rule.state || 'All');
        const ruleCity = normalizeLocationValue(rule.city || 'All');
        const stateMatch = ruleState === 'all' || ruleState === inputState;
        const exactCityMatch = ruleCity === inputCity;
        const cityWildcardMatch = ruleCity === 'all' || ruleCity === '';
        const stateFallbackMatch = stateMatch && ruleState === inputState && !exactCityMatch && !cityWildcardMatch;
        const cityMatch = exactCityMatch || cityWildcardMatch || stateFallbackMatch;

        if (!stateMatch || !cityMatch) {
          return null;
        }

        let specificity = 0;
        if (ruleState !== 'all' && ruleState !== '') specificity += 2;
        if (exactCityMatch) specificity += 3;
        else if (cityWildcardMatch) specificity += 2;
        else if (stateFallbackMatch) specificity += 1;

        return { ...rule, specificity };
      })
      .filter(Boolean);

    if (!matches.length) {
      return 0;
    }

    matches.sort((a, b) => b.specificity - a.specificity);
    return Number(matches[0].shippingFee || 0);
  } catch (error) {
    console.error('Failed to resolve shipping charge', error && error.message);
    return 0;
  }
}

function normalizeCheckoutCartRows(userId, rows, shippingCharge = 0) {
  const items = rows.map((row) => {
    const price = Number(row.price) || 0;
    const quantity = Number(row.quantity) || 1;
    const sellerName = row.sellerName || 'Store';

    return {
      id: String(row.id),
      productId: String(row.productId),
      productName: row.productName || 'Product',
      productUrl: `products_details.html?id=${row.productId}`,
      sellerName,
      sellerInitial: sellerName.charAt(0).toUpperCase(),
      price,
      quantity,
      image: row.productImage || 'https://via.placeholder.com/200',
      canShipFree: Number(price * quantity) >= 7000,
      sellerId: row.sellerId,
      attributes: row.attributes || {},
      shippingInfo: {
        freeShippingThreshold: 7000,
        standardShipping: 250
      }
    };
  });

  const itemsBySellerMap = new Map();
  items.forEach((item) => {
    if (!itemsBySellerMap.has(item.sellerId)) {
      itemsBySellerMap.set(item.sellerId, {
        sellerId: item.sellerId,
        sellerName: item.sellerName,
        sellerAvatar: item.sellerInitial,
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
    const shipping = Number(shippingCharge || 0);
    return {
      ...sellerGroup,
      shipping,
      shippingMessage: shipping === 0
        ? 'No shipping charge configured'
        : `Standard shipping: Rs. ${shipping.toFixed(2)}`
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

async function getCartForUser(req, customerId, shippingCharge = 0) {
  if (!req.db || typeof req.db.query !== 'function' || !isLikelyUuid(customerId)) {
    return getCart(customerId);
  }

  const cartResult = await req.db.query('SELECT id FROM public.carts WHERE customer_id = $1 LIMIT 1', [customerId]);
  if (!cartResult.rows.length) {
    return normalizeCheckoutCartRows(customerId, []);
  }

  const cartId = cartResult.rows[0].id;
  const itemsResult = await req.db.query(
    `
    SELECT
      ci.id,
      ci.product_id AS "productId",
      ci.quantity,
      ci.unit_price AS price,
      p.name AS "productName",
      p.seller_id AS "sellerId",
      COALESCE(sp.store_name, 'Store') AS "sellerName",
      COALESCE(pi.image_url, '') AS "productImage"
    FROM public.cart_items ci
    JOIN public.products p ON p.id = ci.product_id
    LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
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

  return normalizeCheckoutCartRows(customerId, itemsResult.rows, shippingCharge);
}

async function getAddressesForUser(req, customerId) {
  if (!req.db || typeof req.db.query !== 'function' || !isLikelyUuid(customerId)) {
    return [];
  }

  const result = await req.db.query(
    `
    SELECT
      id,
      receiver_name AS name,
      phone,
      line1 AS street,
      line2 AS landmark,
      city,
      state,
      country,
      postal_code AS "postalCode",
      COALESCE(label, 'home') AS type,
      is_default AS "isDefault",
      created_at AS "createdAt"
    FROM public.user_addresses
    WHERE user_id = $1
    ORDER BY is_default DESC, created_at DESC
    `,
    [customerId]
  );

  return result.rows.map(normalizeCheckoutAddress);
}

async function getCheckoutSummaryForUser(req, customerId) {
  if (!req.db || typeof req.db.query !== 'function' || !isLikelyUuid(customerId)) {
    const cart = getCart(customerId);
    return getCheckoutSummary(customerId, cart);
  }

  const [addresses] = await Promise.all([
    getAddressesForUser(req, customerId)
  ]);

  const defaultAddress = addresses.find((address) => address.isDefault) || addresses[0] || null;
  const shippingCharge = await getShippingChargeForAddress(req, defaultAddress);
  const cart = await getCartForUser(req, customerId, shippingCharge);
  const cartWithShipping = {
    ...cart,
    totals: {
      ...cart.totals,
      shipping: Number(shippingCharge || 0),
      total: Number((Number(cart.totals.subtotal || 0) + Number(shippingCharge || 0) - Number(cart.totals.discount || 0)).toFixed(2))
    }
  };

  return {
    cart: cartWithShipping,
    defaultAddress,
    availableAddresses: addresses,
    paymentMethods: [
      { id: 'cod', name: 'Cash on Delivery', available: true },
      { id: 'card', name: 'Credit/Debit Card', available: true },
      { id: 'bank', name: 'Bank Transfer', available: true },
      { id: 'wallet', name: 'Mobile Wallet', available: true, providers: ['jazzcash', 'easypaisa'] }
    ]
  };
}

/**
 * GET /api/checkout/summary
 * Get checkout summary with cart and addresses
 * Query params:
 *  - userId: string (default: 'user_1')
 */
router.get('/summary', async (req, res) => {
  try {
    const userId = resolveCustomerId(req);
    const summary = await getCheckoutSummaryForUser(req, userId);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch checkout summary',
      error: error.message
    });
  }
});

/**
 * GET /api/checkout/addresses
 * Get all addresses for a user
 */
router.get('/addresses', async (req, res) => {
  try {
    const userId = resolveCustomerId(req);
    const addresses = await getAddressesForUser(req, userId);
    
    res.json({
      success: true,
      data: addresses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch addresses',
      error: error.message
    });
  }
});

/**
 * GET /api/checkout/addresses/:id
 * Get specific address by ID
 */
router.get('/addresses/:id', async (req, res) => {
  try {
    const userId = resolveCustomerId(req);
    const addressId = req.params.id;
    let address = null;

    if (req.db && typeof req.db.query === 'function' && isLikelyUuid(userId)) {
      const result = await req.db.query(
        `
        SELECT
          id,
          receiver_name AS name,
          phone,
          line1 AS street,
          line2 AS landmark,
          city,
          state,
          country,
          postal_code AS "postalCode",
          COALESCE(label, 'home') AS type,
          is_default AS "isDefault",
          created_at AS "createdAt"
        FROM public.user_addresses
        WHERE user_id = $1 AND id = $2
        LIMIT 1
        `,
        [userId, addressId]
      );

      address = result.rows[0] ? normalizeCheckoutAddress(result.rows[0]) : null;
    } else {
      const { getAddressById } = require('../data/checkoutData');
      address = getAddressById(userId, addressId);
    }
    
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }
    
    res.json({
      success: true,
      data: address
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch address',
      error: error.message
    });
  }
});

/**
 * POST /api/checkout/addresses
 * Add new address
 * Body: {
 *   name: string,
 *   phone: string,
 *   street: string,
 *   landmark: string,
 *   city: string,
 *   state: string,
 *   postalCode: string,
 *   type: string,
 *   isDefault: boolean
 * }
 */
router.post('/addresses', async (req, res) => {
  try {
    const userId = resolveCustomerId(req);
    const addressData = req.body;

    // Validate required fields
    if (!addressData.name || !addressData.phone || !addressData.street || !addressData.city || !addressData.postalCode) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, phone, street, city, postalCode'
      });
    }

    let newAddress;

    if (req.db && typeof req.db.query === 'function' && isLikelyUuid(userId)) {
      if (addressData.isDefault) {
        await req.db.query('UPDATE public.user_addresses SET is_default = FALSE WHERE user_id = $1', [userId]);
      }

      const existingCount = await req.db.query('SELECT COUNT(*)::int AS total FROM public.user_addresses WHERE user_id = $1', [userId]);
      const shouldDefault = addressData.isDefault || existingCount.rows[0].total === 0;

      const insertResult = await req.db.query(
        `
        INSERT INTO public.user_addresses (
          user_id, label, receiver_name, phone, line1, line2, city, state, postal_code, country, is_default
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING
          id,
          receiver_name AS name,
          phone,
          line1 AS street,
          line2 AS landmark,
          city,
          state,
          country,
          postal_code AS "postalCode",
          COALESCE(label, 'home') AS type,
          is_default AS "isDefault",
          created_at AS "createdAt"
        `,
        [
          userId,
          addressData.type || 'home',
          addressData.name,
          addressData.phone,
          addressData.street,
          addressData.landmark || '',
          addressData.city,
          addressData.state || '',
          addressData.postalCode,
          addressData.country || 'Pakistan',
          shouldDefault
        ]
      );

      newAddress = normalizeCheckoutAddress(insertResult.rows[0]);
    } else {
      const { addAddress } = require('../data/checkoutData');
      newAddress = addAddress(userId, addressData);
    }
    
    res.status(201).json({
      success: true,
      message: 'Address added successfully',
      data: newAddress
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add address',
      error: error.message
    });
  }
});

/**
 * PUT /api/checkout/addresses/:id
 * Update existing address
 */
router.put('/addresses/:id', async (req, res) => {
  try {
    const userId = resolveCustomerId(req);
    const addressId = req.params.id;
    const addressData = req.body;

    // Validate required fields
    if (!addressData.name || !addressData.phone || !addressData.street || !addressData.city || !addressData.postalCode) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, phone, street, city, postalCode'
      });
    }

    let result;

    if (req.db && typeof req.db.query === 'function' && isLikelyUuid(userId)) {
      if (addressData.isDefault) {
        await req.db.query('UPDATE public.user_addresses SET is_default = FALSE WHERE user_id = $1', [userId]);
      }

      const updateResult = await req.db.query(
        `
        UPDATE public.user_addresses
        SET
          label = $3,
          receiver_name = $4,
          phone = $5,
          line1 = $6,
          line2 = $7,
          city = $8,
          state = $9,
          postal_code = $10,
          country = $11,
          is_default = $12,
          updated_at = NOW()
        WHERE user_id = $1 AND id = $2
        RETURNING
          id,
          receiver_name AS name,
          phone,
          line1 AS street,
          line2 AS landmark,
          city,
          state,
          country,
          postal_code AS "postalCode",
          COALESCE(label, 'home') AS type,
          is_default AS "isDefault",
          created_at AS "createdAt"
        `,
        [
          userId,
          addressId,
          addressData.type || 'home',
          addressData.name,
          addressData.phone,
          addressData.street,
          addressData.landmark || '',
          addressData.city,
          addressData.state || '',
          addressData.postalCode,
          addressData.country || 'Pakistan',
          Boolean(addressData.isDefault)
        ]
      );

      if (!updateResult.rows.length) {
        return res.status(404).json({
          success: false,
          message: 'Address not found'
        });
      }

      result = normalizeCheckoutAddress(updateResult.rows[0]);
    } else {
      const { updateAddress } = require('../data/checkoutData');
      result = updateAddress(userId, addressId, addressData);
    }
    
    if (result.error) {
      return res.status(404).json({
        success: false,
        message: result.error
      });
    }

    res.json({
      success: true,
      message: 'Address updated successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update address',
      error: error.message
    });
  }
});

/**
 * DELETE /api/checkout/addresses/:id
 * Delete address
 */
router.delete('/addresses/:id', async (req, res) => {
  try {
    const userId = resolveCustomerId(req);
    const addressId = req.params.id;

    let result;

    if (req.db && typeof req.db.query === 'function' && isLikelyUuid(userId)) {
      const deleteResult = await req.db.query(
        'DELETE FROM public.user_addresses WHERE user_id = $1 AND id = $2 RETURNING id',
        [userId, addressId]
      );

      result = deleteResult.rows.length ? { success: true, message: 'Address deleted successfully' } : { error: 'Address not found' };
    } else {
      const { deleteAddress } = require('../data/checkoutData');
      result = deleteAddress(userId, addressId);
    }
    
    if (result.error) {
      return res.status(404).json({
        success: false,
        message: result.error
      });
    }

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete address',
      error: error.message
    });
  }
});

/**
 * PUT /api/checkout/addresses/:id/default
 * Set address as default
 */
router.put('/addresses/:id/default', async (req, res) => {
  try {
    const userId = resolveCustomerId(req);
    const addressId = req.params.id;

    let result;

    if (req.db && typeof req.db.query === 'function' && isLikelyUuid(userId)) {
      await req.db.query('UPDATE public.user_addresses SET is_default = FALSE WHERE user_id = $1', [userId]);
      const updateResult = await req.db.query(
        `
        UPDATE public.user_addresses
        SET is_default = TRUE, updated_at = NOW()
        WHERE user_id = $1 AND id = $2
        RETURNING
          id,
          receiver_name AS name,
          phone,
          line1 AS street,
          line2 AS landmark,
          city,
          state,
          country,
          postal_code AS "postalCode",
          COALESCE(label, 'home') AS type,
          is_default AS "isDefault",
          created_at AS "createdAt"
        `,
        [userId, addressId]
      );

      if (!updateResult.rows.length) {
        return res.status(404).json({
          success: false,
          message: 'Address not found'
        });
      }

      result = normalizeCheckoutAddress(updateResult.rows[0]);
    } else {
      const { setDefaultAddress } = require('../data/checkoutData');
      result = setDefaultAddress(userId, addressId);
    }
    
    if (result.error) {
      return res.status(404).json({
        success: false,
        message: result.error
      });
    }

    res.json({
      success: true,
      message: 'Default address updated',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to set default address',
      error: error.message
    });
  }
});

/**
 * POST /api/checkout/validate-payment
 * Validate payment method details
 * Body: {
 *   method: string,
 *   ...payment details based on method
 * }
 */
router.post('/validate-payment', (req, res) => {
  try {
    const paymentData = req.body;
    const validation = validatePaymentMethod(paymentData);
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: validation.error
      });
    }

    res.json({
      success: true,
      valid: true,
      requiresVerification: validation.requiresVerification || false
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Payment validation failed',
      error: error.message
    });
  }
});

/**
 * POST /api/checkout/place-order
 * Create order from cart
 * Body: {
 *   addressId: number,
 *   paymentMethod: string,
 *   paymentDetails: object,
 *   orderNotes: string,
 *   deliveryInstructions: string
 * }
 */
router.post('/place-order', async (req, res) => {
  try {
    const userId = resolveCustomerId(req);
    const orderData = req.body;

    // Validate required fields
    if (!orderData.addressId || !orderData.paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: addressId, paymentMethod'
      });
    }

    const paymentValidation = validatePaymentMethod({ method: orderData.paymentMethod, ...orderData.paymentDetails });

    if (!paymentValidation.valid) {
      return res.status(400).json({
        success: false,
        message: paymentValidation.error
      });
    }

    if (req.db && typeof req.db.query === 'function' && isLikelyUuid(userId)) {
      const cart = await getCartForUser(req, userId);
      if (!cart.items || cart.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cart is empty'
        });
      }

      const addressResult = await req.db.query(
        'SELECT id FROM public.user_addresses WHERE user_id = $1 AND id = $2 LIMIT 1',
        [userId, orderData.addressId]
      );

      if (!addressResult.rows.length) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery address'
        });
      }

      const subtotal = Number(cart.totals.subtotal || 0);
      const discount = Number(cart.totals.discount || 0);
      const addressRow = (await req.db.query(
        `SELECT id, city, state FROM public.user_addresses WHERE user_id = $1 AND id = $2 LIMIT 1`,
        [userId, orderData.addressId]
      )).rows[0] || null;
      const shipping = await getShippingChargeForAddress(req, addressRow ? normalizeCheckoutAddress(addressRow) : null);
      const total = Number((subtotal + shipping - discount).toFixed(2));
      const orderNumber = `LUM${Date.now().toString().slice(-8)}`;

      const paymentMethod = String(orderData.paymentMethod || '').toLowerCase() === 'cod' ? 'COD' : 'ONLINE';
      const dbPaymentStatus = paymentMethod === 'COD' ? 'pending' : 'paid';
      const responsePaymentStatus = paymentMethod === 'COD' ? 'UNPAID' : 'PAID';
      const hasPaymentStatusColumn = await ordersTableHasPaymentStatus(req);
      const orderInsertSql = hasPaymentStatusColumn ? `
        INSERT INTO public.orders (
          order_number,
          customer_id,
          shipping_address_id,
          billing_address_id,
          status,
          payment_status,
          subtotal,
          discount_total,
          shipping_fee,
          tax_total,
          grand_total,
          currency,
          note,
          placed_at
        )
        VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, 'PKR', $11, NOW())
        RETURNING id, order_number, status, payment_status, grand_total, placed_at
      ` : `
        INSERT INTO public.orders (
          order_number,
          customer_id,
          shipping_address_id,
          billing_address_id,
          status,
          subtotal,
          discount_total,
          shipping_fee,
          tax_total,
          grand_total,
          currency,
          note,
          placed_at
        )
        VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, 'PKR', $10, NOW())
        RETURNING id, order_number, status, grand_total, placed_at
      `;
      const orderQueryParams = hasPaymentStatusColumn
        ? [orderNumber, userId, orderData.addressId, 'pending', dbPaymentStatus, subtotal, discount, shipping, 0, total, orderData.orderNotes || '']
        : [orderNumber, userId, orderData.addressId, 'pending', subtotal, discount, shipping, 0, total, orderData.orderNotes || ''];
      const orderResult = await req.db.query(orderInsertSql, orderQueryParams);

      const orderId = orderResult.rows[0].id;

      // Ensure commission columns exist
      try {
        await req.db.query(`ALTER TABLE IF EXISTS public.orders ADD COLUMN IF NOT EXISTS platform_commission NUMERIC(12,2) DEFAULT 0`);
        await req.db.query(`ALTER TABLE IF EXISTS public.order_items ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(6,2) DEFAULT 0`);
        await req.db.query(`ALTER TABLE IF EXISTS public.order_items ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2) DEFAULT 0`);
      } catch (err) {
        console.warn('Failed to ensure commission columns', err && err.message);
      }

      // Calculate commission fraction and persist per-item commission
      const fraction = (await commissionSettings.getCommissionSettings(req.db)).commissionRate / 100;
      let totalCommission = 0;

      for (const item of cart.items) {
        const qty = Number(item.quantity || 0);
        const unit = Number(item.price || 0);
        const lineTotal = Number((qty * unit).toFixed(2));
        const itemCommissionAmount = Number((lineTotal * fraction).toFixed(2));
        const itemCommissionRate = Number((fraction * 100).toFixed(2));
        totalCommission += itemCommissionAmount;

        await req.db.query(
          `
          INSERT INTO public.order_items (
            order_id,
            product_id,
            variant_id,
            seller_id,
            product_name,
            sku,
            quantity,
            unit_price,
            discount_amount,
            line_total,
            commission_rate,
            commission_amount
          )
          VALUES ($1, $2, NULL, $3, $4, NULL, $5, $6, 0, $7, $8, $9)
          `,
          [
            orderId,
            item.productId,
            item.sellerId,
            item.productName,
            qty,
            unit,
            lineTotal,
            itemCommissionRate,
            itemCommissionAmount
          ]
        );
      }

      totalCommission = Number(totalCommission.toFixed(2));

      const paymentInsertResult = await req.db.query(
        `
        INSERT INTO public.payments (
          order_id,
          customer_id,
          method,
          provider,
          transaction_ref,
          amount,
          currency,
          status,
          paid_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'PKR', $7, $8)
        RETURNING id
        `,
        [
          orderId,
          userId,
          paymentMethod,
          orderData.paymentDetails?.walletProvider || null,
          `CHK-${orderNumber}`,
          total,
          dbPaymentStatus,
          paymentMethod === 'COD' ? null : new Date()
        ]
      );

      const paymentId = paymentInsertResult.rows[0] && paymentInsertResult.rows[0].id;

      // Persist total commission on payments and orders when possible
      try {
        await req.db.query(`ALTER TABLE IF EXISTS public.payments ADD COLUMN IF NOT EXISTS platform_commission NUMERIC(12,2) DEFAULT 0`);
      } catch (err) {
        // ignore
      }

      try {
        if (paymentId) {
          await req.db.query(`UPDATE public.payments SET platform_commission = $1 WHERE id = $2`, [totalCommission, paymentId]);
        }
      } catch (err) {
        // ignore
      }

      try {
        await req.db.query(`UPDATE public.orders SET platform_commission = $1 WHERE id = $2`, [totalCommission, orderId]);
      } catch (err) {
        // ignore
      }

      // If payment method is card, create a Stripe Checkout session and return its URL
      if (orderData.paymentMethod === 'card' && stripe) {
        try {
          const line_items = (cart.items || []).map((item) => ({
            price_data: {
              currency: 'pkr',
              product_data: { name: item.productName || 'Product' },
              unit_amount: Math.round((Number(item.price) || 0) * 100)
            },
            quantity: Number(item.quantity) || 1
          }));

          const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items,
            mode: 'payment',
            metadata: { orderId: String(orderId), paymentId: String(paymentId) },
            success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/cancel`
          });

          // Clear cart items
          const cartRecord = await req.db.query('SELECT id FROM public.carts WHERE customer_id = $1 LIMIT 1', [userId]);
          if (cartRecord.rows.length) {
            await req.db.query('DELETE FROM public.cart_items WHERE cart_id = $1', [cartRecord.rows[0].id]);
          }

          return res.status(201).json({
            success: true,
            message: 'Order created; redirect to Stripe Checkout',
            data: {
              id: orderId,
              orderId: orderNumber,
              status: 'pending',
              paymentStatus: responsePaymentStatus,
              paymentMethod,
              total,
              sessionUrl: session.url
            }
          });
        } catch (stripeErr) {
          console.error('Stripe session creation failed', stripeErr && stripeErr.message);
          // continue and return order without session url
        }
      }

      const cartRecord = await req.db.query('SELECT id FROM public.carts WHERE customer_id = $1 LIMIT 1', [userId]);
      if (cartRecord.rows.length) {
        await req.db.query('DELETE FROM public.cart_items WHERE cart_id = $1', [cartRecord.rows[0].id]);
      }

      return res.status(201).json({
        success: true,
        message: 'Order placed successfully',
        data: {
          id: orderId,
          orderId: orderNumber,
          status: 'pending',
          paymentStatus: responsePaymentStatus,
          paymentMethod,
          total,
          estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          createdAt: new Date()
        }
      });
    }

    // Fallback to in-memory data for non-UUID demo users
    const cart = getCart(userId);
    
    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    const { createOrder } = require('../data/checkoutData');
    const result = createOrder(userId, {
      ...orderData,
      cartData: cart
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: result.order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to place order',
      error: error.message
    });
  }
});

/**
 * GET /api/checkout/orders/:orderId
 * Get order details
 */
router.get('/orders/:orderId', (req, res) => {
  try {
    const userId = resolveCustomerId(req);
    const orderId = req.params.orderId;

    if (!isLikelyUuid(userId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    const order = getOrderById(userId, orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message
    });
  }
});

/**
 * GET /api/checkout/orders
 * Get all orders for user
 * Query params:
 *  - userId: string
 *  - status: string (optional)
 *  - limit: number (default: 50)
 *  - offset: number (default: 0)
 */
router.get('/orders', (req, res) => {
  try {
    const userId = resolveCustomerId(req);
    const options = {
      status: req.query.status,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0
    };

    if (!isLikelyUuid(userId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    const result = getUserOrders(userId, options);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

module.exports = router;
