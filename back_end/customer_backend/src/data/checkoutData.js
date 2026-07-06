/**
 * Checkout Data Module
 * Handles checkout process, address management, and order creation
 */

// Mock addresses database (keyed by user ID)
const userAddresses = {
  'user_1': [
    {
      id: 1,
      userId: 'user_1',
      name: 'Ahmed Khan',
      phone: '+92 300 1234567',
      street: 'House #123, Street 5',
      landmark: 'F-7 Markaz',
      city: 'Islamabad',
      state: 'ICT',
      country: 'Pakistan',
      postalCode: '44000',
      type: 'home', // home, office, other
      isDefault: true,
      createdAt: new Date('2026-01-15')
    },
    {
      id: 2,
      userId: 'user_1',
      name: 'Ahmed Khan',
      phone: '+92 300 1234567',
      street: 'Plaza 12, Blue Area',
      landmark: '',
      city: 'Islamabad',
      state: 'ICT',
      country: 'Pakistan',
      postalCode: '44000',
      type: 'office',
      isDefault: false,
      createdAt: new Date('2026-02-10')
    }
  ]
};

// Mock orders database
const orders = [];
let orderIdCounter = 1001;
let addressIdCounter = 3;

/**
 * Get all addresses for a user
 */
function getAddresses(userId = 'user_1') {
  if (!userAddresses[userId]) {
    userAddresses[userId] = [];
  }
  return userAddresses[userId].sort((a, b) => b.isDefault - a.isDefault);
}

/**
 * Get address by ID
 */
function getAddressById(userId = 'user_1', addressId) {
  if (!userAddresses[userId]) {
    return null;
  }
  return userAddresses[userId].find(addr => addr.id === parseInt(addressId));
}

/**
 * Add new address
 */
function addAddress(userId = 'user_1', addressData) {
  if (!userAddresses[userId]) {
    userAddresses[userId] = [];
  }

  // If this is set as default, remove default from others
  if (addressData.isDefault) {
    userAddresses[userId].forEach(addr => {
      addr.isDefault = false;
    });
  }

  // If this is the first address, make it default
  if (userAddresses[userId].length === 0) {
    addressData.isDefault = true;
  }

  const newAddress = {
    id: addressIdCounter++,
    userId,
    name: addressData.name,
    phone: addressData.phone,
    street: addressData.street,
    landmark: addressData.landmark || '',
    city: addressData.city,
    state: addressData.state || '',
    country: addressData.country || 'Pakistan',
    postalCode: addressData.postalCode,
    type: addressData.type || 'home',
    isDefault: addressData.isDefault || false,
    createdAt: new Date()
  };

  userAddresses[userId].push(newAddress);
  return newAddress;
}

/**
 * Update address
 */
function updateAddress(userId = 'user_1', addressId, addressData) {
  if (!userAddresses[userId]) {
    return { error: 'No addresses found' };
  }

  const addressIndex = userAddresses[userId].findIndex(addr => addr.id === parseInt(addressId));
  if (addressIndex === -1) {
    return { error: 'Address not found' };
  }

  // If setting as default, remove default from others
  if (addressData.isDefault) {
    userAddresses[userId].forEach(addr => {
      addr.isDefault = false;
    });
  }

  userAddresses[userId][addressIndex] = {
    ...userAddresses[userId][addressIndex],
    name: addressData.name,
    phone: addressData.phone,
    street: addressData.street,
    landmark: addressData.landmark || '',
    city: addressData.city,
    state: addressData.state || '',
    postalCode: addressData.postalCode,
    type: addressData.type || 'home',
    isDefault: addressData.isDefault || userAddresses[userId][addressIndex].isDefault
  };

  return userAddresses[userId][addressIndex];
}

/**
 * Delete address
 */
function deleteAddress(userId = 'user_1', addressId) {
  if (!userAddresses[userId]) {
    return { error: 'No addresses found' };
  }

  const addressIndex = userAddresses[userId].findIndex(addr => addr.id === parseInt(addressId));
  if (addressIndex === -1) {
    return { error: 'Address not found' };
  }

  const wasDefault = userAddresses[userId][addressIndex].isDefault;
  userAddresses[userId].splice(addressIndex, 1);

  // If deleted address was default, make first remaining address default
  if (wasDefault && userAddresses[userId].length > 0) {
    userAddresses[userId][0].isDefault = true;
  }

  return { success: true, message: 'Address deleted successfully' };
}

/**
 * Set default address
 */
function setDefaultAddress(userId = 'user_1', addressId) {
  if (!userAddresses[userId]) {
    return { error: 'No addresses found' };
  }

  const address = userAddresses[userId].find(addr => addr.id === parseInt(addressId));
  if (!address) {
    return { error: 'Address not found' };
  }

  // Remove default from all addresses
  userAddresses[userId].forEach(addr => {
    addr.isDefault = false;
  });

  // Set new default
  address.isDefault = true;

  return address;
}

/**
 * Validate payment method data
 */
function validatePaymentMethod(paymentData) {
  const { method } = paymentData;

  if (!method) {
    return { valid: false, error: 'Payment method is required' };
  }

  switch (method) {
    case 'cod':
      return { valid: true };

    case 'card':
      if (!paymentData.cardNumber || !paymentData.expiryDate || !paymentData.cvv || !paymentData.cardHolder) {
        return { valid: false, error: 'All card details are required' };
      }
      // Basic card number validation (16 digits)
      const cardNumber = paymentData.cardNumber.replace(/\s/g, '');
      if (!/^\d{16}$/.test(cardNumber)) {
        return { valid: false, error: 'Invalid card number' };
      }
      // Basic expiry validation (MM/YY)
      if (!/^\d{2}\/\d{2}$/.test(paymentData.expiryDate)) {
        return { valid: false, error: 'Invalid expiry date format' };
      }
      // CVV validation (3 digits)
      if (!/^\d{3}$/.test(paymentData.cvv)) {
        return { valid: false, error: 'Invalid CVV' };
      }
      return { valid: true };

    case 'bank':
      // Bank transfer requires manual verification
      return { valid: true, requiresVerification: true };

    case 'wallet':
      if (!paymentData.walletProvider || !paymentData.mobileNumber) {
        return { valid: false, error: 'Wallet provider and mobile number are required' };
      }
      // Mobile number validation (Pakistani format)
      if (!/^03\d{9}$/.test(paymentData.mobileNumber.replace(/\s/g, ''))) {
        return { valid: false, error: 'Invalid mobile number' };
      }
      return { valid: true };

    default:
      return { valid: false, error: 'Invalid payment method' };
  }
}

/**
 * Create order from cart
 */
function createOrder(userId = 'user_1', orderData) {
  const { 
    addressId, 
    paymentMethod, 
    paymentDetails = {},
    orderNotes = '',
    deliveryInstructions = '',
    cartData 
  } = orderData;

  // Validate address
  const address = getAddressById(userId, addressId);
  if (!address) {
    return { success: false, error: 'Invalid delivery address' };
  }

  // Validate payment method
  const paymentValidation = validatePaymentMethod({ method: paymentMethod, ...paymentDetails });
  if (!paymentValidation.valid) {
    return { success: false, error: paymentValidation.error };
  }

  // Validate cart data
  if (!cartData || !cartData.items || cartData.items.length === 0) {
    return { success: false, error: 'Cart is empty' };
  }

  // Calculate order totals
  const subtotal = cartData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shipping = cartData.totals?.shipping || 0;
  const discount = cartData.totals?.discount || 0;
  const total = subtotal + shipping - discount;

  // Group items by seller for multi-vendor support
  const sellerOrders = {};
  cartData.items.forEach(item => {
    if (!sellerOrders[item.sellerId]) {
      sellerOrders[item.sellerId] = {
        sellerId: item.sellerId,
        sellerName: item.sellerName,
        items: [],
        subtotal: 0
      };
    }
    sellerOrders[item.sellerId].items.push(item);
    sellerOrders[item.sellerId].subtotal += item.price * item.quantity;
  });

  // Create main order
  const order = {
    id: orderIdCounter++,
    orderId: `LUM${Date.now().toString().slice(-8)}`,
    userId,
    
    // Delivery information
    deliveryAddress: {
      name: address.name,
      phone: address.phone,
      street: address.street,
      landmark: address.landmark,
      city: address.city,
      state: address.state,
      country: address.country,
      postalCode: address.postalCode
    },
    
    // Payment information
    paymentMethod: paymentMethod,
    paymentStatus: paymentMethod === 'cod' ? 'pending' : 'processing',
    paymentDetails: paymentMethod === 'card' ? 
      { 
        last4: paymentDetails.cardNumber?.slice(-4),
        cardHolder: paymentDetails.cardHolder 
      } : 
      paymentMethod === 'wallet' ? 
      { 
        provider: paymentDetails.walletProvider,
        mobileNumber: paymentDetails.mobileNumber 
      } : 
      {},
    
    // Order items
    items: cartData.items.map(item => ({
      productId: item.productId,
      productName: item.productName,
      productImage: item.productImage,
      price: item.price,
      quantity: item.quantity,
      attributes: item.attributes,
      sellerId: item.sellerId,
      sellerName: item.sellerName
    })),
    
    // Multi-seller breakdown
    sellers: Object.values(sellerOrders),
    
    // Pricing
    pricing: {
      subtotal: parseFloat(subtotal.toFixed(2)),
      shipping: parseFloat(shipping.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    },
    
    // Coupon
    appliedCoupon: cartData.appliedCoupon || null,
    
    // Additional info
    orderNotes,
    deliveryInstructions,
    
    // Status tracking
    status: 'pending', // pending, confirmed, processing, shipped, delivered, cancelled
    trackingNumber: null,
    
    // Timestamps
    createdAt: new Date(),
    estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
    
    // Order history
    statusHistory: [
      {
        status: 'pending',
        timestamp: new Date(),
        note: 'Order placed successfully'
      }
    ]
  };

  orders.push(order);

  return {
    success: true,
    order: {
      id: order.id,
      orderId: order.orderId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: order.pricing.total,
      estimatedDelivery: order.estimatedDelivery,
      createdAt: order.createdAt
    }
  };
}

/**
 * Get order by ID
 */
function getOrderById(userId = 'user_1', orderId) {
  const order = orders.find(o => o.orderId === orderId && o.userId === userId);
  return order || null;
}

/**
 * Get all orders for user
 */
function getUserOrders(userId = 'user_1', options = {}) {
  const { status, limit = 50, offset = 0 } = options;
  
  let userOrders = orders.filter(o => o.userId === userId);
  
  if (status) {
    userOrders = userOrders.filter(o => o.status === status);
  }
  
  userOrders.sort((a, b) => b.createdAt - a.createdAt);
  
  const total = userOrders.length;
  const paginatedOrders = userOrders.slice(offset, offset + limit);
  
  return {
    orders: paginatedOrders,
    total,
    limit,
    offset
  };
}

/**
 * Get checkout summary (cart + default address)
 */
function getCheckoutSummary(userId = 'user_1', cartData) {
  const addresses = getAddresses(userId);
  const defaultAddress = addresses.find(addr => addr.isDefault) || addresses[0];

  return {
    cart: cartData,
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

module.exports = {
  getAddresses,
  getAddressById,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  validatePaymentMethod,
  createOrder,
  getOrderById,
  getUserOrders,
  getCheckoutSummary
};
