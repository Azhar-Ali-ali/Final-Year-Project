/**
 * Cart Data Module
 * Handles shopping cart operations, calculations, and coupon management
 */

// Mock cart database (keyed by user ID)
const userCarts = {
  'user_1': {
    userId: 'user_1',
    items: [
      {
        id: 1,
        productId: 1,
        productName: "Premium Makeup Sponge Set - Professional Beauty Blender",
        productImage: "https://images.unsplash.com/photo-1631214524020-7e18db9a8f92?auto=format&fit=crop&q=80&w=200",
        price: 12.99,
        originalPrice: 12.99,
        quantity: 1,
        attributes: {
          color: "Pink",
          size: "2 Pack"
        },
        sellerId: 1,
        sellerName: "BeautyHub Store",
        sellerAvatar: "B",
        inStock: true,
        shippingInfo: {
          freeShippingThreshold: 50,
          standardShipping: 0
        }
      },
      {
        id: 2,
        productId: 2,
        productName: "Professional Makeup Brush Set - 12 Piece Collection",
        productImage: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&q=80&w=200",
        price: 18.99,
        originalPrice: 18.99,
        quantity: 2,
        attributes: {
          color: "Rose Gold"
        },
        sellerId: 1,
        sellerName: "BeautyHub Store",
        sellerAvatar: "B",
        inStock: true,
        shippingInfo: {
          freeShippingThreshold: 50,
          standardShipping: 0
        }
      },
      {
        id: 3,
        productId: 3,
        productName: "HD Foundation - Full Coverage Long Lasting",
        productImage: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=200",
        price: 24.99,
        originalPrice: 24.99,
        quantity: 1,
        attributes: {
          shade: "Medium Beige"
        },
        sellerId: 2,
        sellerName: "TechStore",
        sellerAvatar: "T",
        inStock: true,
        shippingInfo: {
          freeShippingThreshold: 100,
          standardShipping: 5
        }
      }
    ],
    appliedCoupon: null,
    lastUpdated: new Date()
  }
};

// Mock coupon database
const coupons = {
  'SAVE10': {
    code: 'SAVE10',
    type: 'fixed', // fixed or percentage
    value: 10,
    minOrderValue: 0,
    maxDiscount: null,
    expiresAt: new Date('2026-12-31'),
    active: true
  },
  'SAVE20': {
    code: 'SAVE20',
    type: 'fixed',
    value: 20,
    minOrderValue: 50,
    maxDiscount: null,
    expiresAt: new Date('2026-12-31'),
    active: true
  },
  'WELCOME': {
    code: 'WELCOME',
    type: 'fixed',
    value: 15,
    minOrderValue: 30,
    maxDiscount: null,
    expiresAt: new Date('2026-12-31'),
    active: true
  },
  'PERCENT10': {
    code: 'PERCENT10',
    type: 'percentage',
    value: 10,
    minOrderValue: 0,
    maxDiscount: 50,
    expiresAt: new Date('2026-12-31'),
    active: true
  }
};

let cartIdCounter = 4;

/**
 * Get cart for a user
 */
function getCart(userId = 'user_1') {
  if (!userCarts[userId]) {
    userCarts[userId] = {
      userId,
      items: [],
      appliedCoupon: null,
      lastUpdated: new Date()
    };
  }

  const cart = userCarts[userId];
  
  // Group items by seller
  const itemsBySeller = {};
  cart.items.forEach(item => {
    if (!itemsBySeller[item.sellerId]) {
      itemsBySeller[item.sellerId] = {
        sellerId: item.sellerId,
        sellerName: item.sellerName,
        sellerAvatar: item.sellerAvatar,
        items: [],
        subtotal: 0,
        shipping: item.shippingInfo.standardShipping,
        freeShippingThreshold: item.shippingInfo.freeShippingThreshold
      };
    }
    
    const itemTotal = item.price * item.quantity;
    itemsBySeller[item.sellerId].items.push(item);
    itemsBySeller[item.sellerId].subtotal += itemTotal;
  });

  // Calculate shipping for each seller
  Object.values(itemsBySeller).forEach(seller => {
    if (seller.subtotal >= seller.freeShippingThreshold) {
      seller.shipping = 0;
      seller.shippingMessage = `FREE shipping on orders over $${seller.freeShippingThreshold}`;
    } else {
      seller.shippingMessage = `Standard shipping: $${seller.shipping.toFixed(2)} • Add $${(seller.freeShippingThreshold - seller.subtotal).toFixed(2)} for FREE shipping`;
    }
  });

  // Calculate totals
  const totals = calculateCartTotals(cart);

  return {
    userId: cart.userId,
    items: cart.items,
    itemsBySeller: Object.values(itemsBySeller),
    totalItems: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    appliedCoupon: cart.appliedCoupon,
    totals,
    lastUpdated: cart.lastUpdated
  };
}

/**
 * Add item to cart
 */
function addToCart(userId = 'user_1', itemData) {
  if (!userCarts[userId]) {
    userCarts[userId] = {
      userId,
      items: [],
      appliedCoupon: null,
      lastUpdated: new Date()
    };
  }

  const cart = userCarts[userId];

  // Check if item already exists (same product and attributes)
  const existingItemIndex = cart.items.findIndex(item => 
    item.productId === itemData.productId &&
    JSON.stringify(item.attributes) === JSON.stringify(itemData.attributes)
  );

  if (existingItemIndex > -1) {
    // Update quantity
    cart.items[existingItemIndex].quantity += itemData.quantity || 1;
  } else {
    // Add new item
    const newItem = {
      id: cartIdCounter++,
      productId: itemData.productId,
      productName: itemData.productName,
      productImage: itemData.productImage,
      price: itemData.price,
      originalPrice: itemData.originalPrice || itemData.price,
      quantity: itemData.quantity || 1,
      attributes: itemData.attributes || {},
      sellerId: itemData.sellerId,
      sellerName: itemData.sellerName,
      sellerAvatar: itemData.sellerAvatar || itemData.sellerName.charAt(0),
      inStock: itemData.inStock !== undefined ? itemData.inStock : true,
      shippingInfo: itemData.shippingInfo || {
        freeShippingThreshold: 50,
        standardShipping: 5
      }
    };
    cart.items.push(newItem);
  }

  cart.lastUpdated = new Date();
  return getCart(userId);
}

/**
 * Update cart item quantity
 */
function updateCartItemQuantity(userId = 'user_1', itemId, quantity) {
  if (!userCarts[userId]) {
    return { error: 'Cart not found' };
  }

  const cart = userCarts[userId];
  const item = cart.items.find(i => i.id === parseInt(itemId));

  if (!item) {
    return { error: 'Item not found in cart' };
  }

  if (quantity < 1 || quantity > 99) {
    return { error: 'Invalid quantity. Must be between 1 and 99' };
  }

  item.quantity = quantity;
  cart.lastUpdated = new Date();

  return getCart(userId);
}

/**
 * Remove item from cart
 */
function removeFromCart(userId = 'user_1', itemId) {
  if (!userCarts[userId]) {
    return { error: 'Cart not found' };
  }

  const cart = userCarts[userId];
  const itemIndex = cart.items.findIndex(i => i.id === parseInt(itemId));

  if (itemIndex === -1) {
    return { error: 'Item not found in cart' };
  }

  cart.items.splice(itemIndex, 1);
  cart.lastUpdated = new Date();

  // Remove coupon if cart is empty
  if (cart.items.length === 0) {
    cart.appliedCoupon = null;
  }

  return getCart(userId);
}

/**
 * Clear entire cart
 */
function clearCart(userId = 'user_1') {
  if (userCarts[userId]) {
    userCarts[userId].items = [];
    userCarts[userId].appliedCoupon = null;
    userCarts[userId].lastUpdated = new Date();
  }
  return getCart(userId);
}

/**
 * Apply coupon to cart
 */
function applyCoupon(userId = 'user_1', couponCode) {
  if (!userCarts[userId]) {
    return { error: 'Cart not found', success: false };
  }

  const cart = userCarts[userId];
  const code = couponCode.trim().toUpperCase();

  // Check if coupon exists
  const coupon = coupons[code];
  if (!coupon) {
    return { error: 'Invalid coupon code', success: false };
  }

  // Check if coupon is active
  if (!coupon.active) {
    return { error: 'This coupon is no longer active', success: false };
  }

  // Check if coupon is expired
  if (new Date(coupon.expiresAt) < new Date()) {
    return { error: 'This coupon has expired', success: false };
  }

  // Calculate subtotal
  const subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Check minimum order value
  if (subtotal < coupon.minOrderValue) {
    return { 
      error: `Minimum order value of $${coupon.minOrderValue.toFixed(2)} required`,
      success: false 
    };
  }

  // Apply coupon
  cart.appliedCoupon = {
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    maxDiscount: coupon.maxDiscount
  };
  cart.lastUpdated = new Date();

  const cartData = getCart(userId);
  
  return {
    success: true,
    message: 'Coupon applied successfully!',
    discount: cartData.totals.discount,
    cart: cartData
  };
}

/**
 * Remove coupon from cart
 */
function removeCoupon(userId = 'user_1') {
  if (userCarts[userId]) {
    userCarts[userId].appliedCoupon = null;
    userCarts[userId].lastUpdated = new Date();
  }
  return getCart(userId);
}

/**
 * Calculate cart totals
 */
function calculateCartTotals(cart) {
  let subtotal = 0;
  let shipping = 0;
  let discount = 0;

  // Calculate subtotal and shipping
  cart.items.forEach(item => {
    subtotal += item.price * item.quantity;
  });

  // Group by seller to calculate shipping
  const sellerGroups = {};
  cart.items.forEach(item => {
    if (!sellerGroups[item.sellerId]) {
      sellerGroups[item.sellerId] = {
        subtotal: 0,
        shipping: item.shippingInfo.standardShipping,
        threshold: item.shippingInfo.freeShippingThreshold
      };
    }
    sellerGroups[item.sellerId].subtotal += item.price * item.quantity;
  });

  // Calculate total shipping
  Object.values(sellerGroups).forEach(seller => {
    if (seller.subtotal < seller.threshold) {
      shipping += seller.shipping;
    }
  });

  // Calculate discount from coupon
  if (cart.appliedCoupon) {
    if (cart.appliedCoupon.type === 'fixed') {
      discount = cart.appliedCoupon.value;
    } else if (cart.appliedCoupon.type === 'percentage') {
      discount = (subtotal * cart.appliedCoupon.value) / 100;
      if (cart.appliedCoupon.maxDiscount) {
        discount = Math.min(discount, cart.appliedCoupon.maxDiscount);
      }
    }
  }

  const total = subtotal + shipping - discount;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    shipping: parseFloat(shipping.toFixed(2)),
    discount: parseFloat(discount.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
    itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0)
  };
}

/**
 * Validate coupon code
 */
function validateCoupon(couponCode) {
  const code = couponCode.trim().toUpperCase();
  const coupon = coupons[code];

  if (!coupon) {
    return { valid: false, message: 'Invalid coupon code' };
  }

  if (!coupon.active) {
    return { valid: false, message: 'This coupon is no longer active' };
  }

  if (new Date(coupon.expiresAt) < new Date()) {
    return { valid: false, message: 'This coupon has expired' };
  }

  return {
    valid: true,
    coupon: {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      minOrderValue: coupon.minOrderValue,
      maxDiscount: coupon.maxDiscount
    }
  };
}

/**
 * Get available coupons
 */
function getAvailableCoupons() {
  const now = new Date();
  return Object.values(coupons)
    .filter(coupon => coupon.active && new Date(coupon.expiresAt) > now)
    .map(coupon => ({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      minOrderValue: coupon.minOrderValue,
      description: coupon.type === 'fixed' 
        ? `$${coupon.value} off` 
        : `${coupon.value}% off${coupon.maxDiscount ? ` (max $${coupon.maxDiscount})` : ''}`
    }));
}

module.exports = {
  getCart,
  addToCart,
  updateCartItemQuantity,
  removeFromCart,
  clearCart,
  applyCoupon,
  removeCoupon,
  validateCoupon,
  getAvailableCoupons
};
