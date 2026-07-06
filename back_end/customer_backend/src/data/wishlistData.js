/**
 * Wishlist Data Module
 * Handles wishlist functionality for customer backend
 */

const { getProductById, searchProducts } = require('./productsData');
const { addToCart } = require('./cartData');

// In-memory wishlist storage (in production, this would be a database)
// Structure: { userId: [ {wishlistItems...} ] }
const wishlistsByUser = {};

// Seed some initial wishlist data
wishlistsByUser['user_1'] = [
  {
    id: 1,
    productId: 1,
    addedAt: '2026-03-01T10:30:00Z',
    notes: '' // Optional user notes
  },
  {
    id: 2,
    productId: 3,
    addedAt: '2026-03-03T14:20:00Z',
    notes: ''
  },
  {
    id: 3,
    productId: 7,
    addedAt: '2026-03-05T09:15:00Z',
    notes: ''
  }
];

// Counter for generating unique wishlist item IDs
let nextWishlistItemId = 4;

/**
 * Get full wishlist for a user with enriched product data
 * @param {string} userId - User ID
 * @returns {Array} Array of wishlist items with product details
 */
function getWishlist(userId) {
  const userWishlist = wishlistsByUser[userId] || [];
  
  // Enrich each wishlist item with full product details
  const enrichedWishlist = userWishlist.map(wishlistItem => {
    const product = getProductById(wishlistItem.productId);
    
    if (!product) {
      // Product might have been removed, but keep wishlist entry
      return {
        ...wishlistItem,
        productNotFound: true,
        productName: 'Product No Longer Available'
      };
    }
    
    // Combine wishlist metadata with product data
    return {
      id: wishlistItem.id,
      productId: wishlistItem.productId,
      addedAt: wishlistItem.addedAt,
      notes: wishlistItem.notes,
      // Product details
      productName: product.name,
      price: product.price,
      originalPrice: product.originalPrice,
      discount: product.discount,
      image: product.thumbnail,
      images: product.images,
      stock: product.stock,
      category: product.category,
      brand: product.brand,
      rating: product.rating,
      reviewCount: product.reviewCount,
      // Seller details
      sellerId: product.sellerId,
      sellerName: product.sellerName,
      sellerRating: product.sellerRating,
      // Availability
      inStock: product.stock > 0,
      isAvailable: product.isActive && product.stock > 0
    };
  });
  
  return enrichedWishlist;
}

/**
 * Get wishlist summary (count and total value)
 * @param {string} userId - User ID
 * @returns {Object} Summary with count, total value, in-stock count
 */
function getWishlistSummary(userId) {
  const wishlist = getWishlist(userId);
  
  const totalItems = wishlist.length;
  const inStockItems = wishlist.filter(item => item.inStock && !item.productNotFound).length;
  const totalValue = wishlist.reduce((sum, item) => {
    if (item.productNotFound) return sum;
    return sum + (item.price || 0);
  }, 0);
  const totalSavings = wishlist.reduce((sum, item) => {
    if (item.productNotFound) return sum;
    const savings = (item.originalPrice || item.price) - item.price;
    return sum + savings;
  }, 0);
  
  return {
    totalItems,
    inStockItems,
    outOfStockItems: totalItems - inStockItems,
    totalValue: parseFloat(totalValue.toFixed(2)),
    totalSavings: parseFloat(totalSavings.toFixed(2))
  };
}

/**
 * Add item to wishlist
 * @param {string} userId - User ID
 * @param {number} productId - Product ID to add
 * @param {string} notes - Optional notes
 * @returns {Object} Result with success status and data
 */
function addToWishlist(userId, productId, notes = '') {
  // Validate product exists
  const product = getProductById(productId);
  if (!product) {
    return {
      success: false,
      error: 'Product not found'
    };
  }
  
  // Initialize user wishlist if doesn't exist
  if (!wishlistsByUser[userId]) {
    wishlistsByUser[userId] = [];
  }
  
  // Check if product already in wishlist
  const existingItem = wishlistsByUser[userId].find(
    item => item.productId === productId
  );
  
  if (existingItem) {
    return {
      success: false,
      error: 'Product already in wishlist',
      existingItemId: existingItem.id
    };
  }
  
  // Create new wishlist item
  const newItem = {
    id: nextWishlistItemId++,
    productId,
    addedAt: new Date().toISOString(),
    notes
  };
  
  wishlistsByUser[userId].push(newItem);
  
  // Get enriched item to return
  const enrichedItem = getWishlist(userId).find(item => item.id === newItem.id);
  
  return {
    success: true,
    message: 'Product added to wishlist',
    item: enrichedItem,
    wishlistCount: wishlistsByUser[userId].length
  };
}

/**
 * Remove item from wishlist
 * @param {string} userId - User ID
 * @param {number} itemId - Wishlist item ID (not product ID)
 * @returns {Object} Result with success status
 */
function removeFromWishlist(userId, itemId) {
  if (!wishlistsByUser[userId]) {
    return {
      success: false,
      error: 'Wishlist not found'
    };
  }
  
  const initialLength = wishlistsByUser[userId].length;
  wishlistsByUser[userId] = wishlistsByUser[userId].filter(
    item => item.id !== parseInt(itemId)
  );
  
  if (wishlistsByUser[userId].length === initialLength) {
    return {
      success: false,
      error: 'Item not found in wishlist'
    };
  }
  
  return {
    success: true,
    message: 'Item removed from wishlist',
    wishlistCount: wishlistsByUser[userId].length
  };
}

/**
 * Remove item by product ID
 * @param {string} userId - User ID
 * @param {number} productId - Product ID
 * @returns {Object} Result with success status
 */
function removeByProductId(userId, productId) {
  if (!wishlistsByUser[userId]) {
    return {
      success: false,
      error: 'Wishlist not found'
    };
  }
  
  const item = wishlistsByUser[userId].find(
    item => item.productId === parseInt(productId)
  );
  
  if (!item) {
    return {
      success: false,
      error: 'Product not in wishlist'
    };
  }
  
  return removeFromWishlist(userId, item.id);
}

/**
 * Clear entire wishlist
 * @param {string} userId - User ID
 * @returns {Object} Result with success status
 */
function clearWishlist(userId) {
  if (!wishlistsByUser[userId]) {
    return {
      success: false,
      error: 'Wishlist not found'
    };
  }
  
  const clearedCount = wishlistsByUser[userId].length;
  wishlistsByUser[userId] = [];
  
  return {
    success: true,
    message: 'Wishlist cleared',
    clearedCount
  };
}

/**
 * Check if product is in user's wishlist
 * @param {string} userId - User ID
 * @param {number} productId - Product ID
 * @returns {Object} Result with inWishlist boolean and item ID if found
 */
function checkInWishlist(userId, productId) {
  if (!wishlistsByUser[userId]) {
    return {
      inWishlist: false,
      productId
    };
  }
  
  const item = wishlistsByUser[userId].find(
    item => item.productId === parseInt(productId)
  );
  
  return {
    inWishlist: !!item,
    productId,
    itemId: item ? item.id : null,
    addedAt: item ? item.addedAt : null
  };
}

/**
 * Move selected items from wishlist to cart
 * @param {string} userId - User ID
 * @param {Array} itemIds - Array of wishlist item IDs to move
 * @param {Object} options - Additional options (quantity per item, etc.)
 * @returns {Object} Result with success status and details
 */
function moveToCart(userId, itemIds, options = {}) {
  if (!wishlistsByUser[userId]) {
    return {
      success: false,
      error: 'Wishlist not found'
    };
  }
  
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return {
      success: false,
      error: 'No items selected'
    };
  }
  
  const results = {
    success: true,
    addedToCart: [],
    failed: [],
    removed: []
  };
  
  // Get enriched wishlist items first
  const enrichedWishlist = getWishlist(userId);
  
  itemIds.forEach(itemId => {
    const wishlistItem = wishlistsByUser[userId].find(
      item => item.id === parseInt(itemId)
    );
    
    if (!wishlistItem) {
      results.failed.push({
        itemId,
        reason: 'Item not found in wishlist'
      });
      return;
    }
    
    // Get enriched item data
    const enrichedItem = enrichedWishlist.find(item => item.id === parseInt(itemId));
    
    if (!enrichedItem || enrichedItem.productNotFound) {
      results.failed.push({
        itemId,
        reason: 'Product no longer available'
      });
      return;
    }
    
    // Try to add to cart
    const quantity = options.quantities?.[itemId] || 1;
    
    // Prepare cart item data
    const cartItemData = {
      productId: enrichedItem.productId,
      productName: enrichedItem.productName,
      productImage: enrichedItem.image,
      price: enrichedItem.price,
      originalPrice: enrichedItem.originalPrice,
      quantity,
      attributes: {},
      sellerId: enrichedItem.sellerId,
      sellerName: enrichedItem.sellerName,
      inStock: enrichedItem.inStock,
      shippingInfo: {
        freeShippingThreshold: 50,
        standardShipping: enrichedItem.inStock ? 5 : 0
      }
    };
    
    // Add to cart
    const cartResult = addToCart(userId, cartItemData);
    
    if (cartResult && !cartResult.error) {
      // Find the newly added cart item ID
      const newCartItem = cartResult.items?.[cartResult.items.length - 1];
      
      results.addedToCart.push({
        itemId: wishlistItem.id,
        productId: wishlistItem.productId,
        quantity,
        cartItemId: newCartItem?.id
      });
      
      // Remove from wishlist after successful cart addition
      const removeResult = removeFromWishlist(userId, itemId);
      if (removeResult.success) {
        results.removed.push(itemId);
      }
    } else {
      results.failed.push({
        itemId,
        productId: wishlistItem.productId,
        reason: cartResult?.error || 'Failed to add to cart'
      });
    }
  });
  
  // Overall success if at least one item was processed
  results.success = results.addedToCart.length > 0;
  results.message = `${results.addedToCart.length} item(s) moved to cart`;
  
  if (results.failed.length > 0) {
    results.message += `, ${results.failed.length} failed`;
  }
  
  return results;
}

/**
 * Get wishlist items by category
 * @param {string} userId - User ID
 * @param {string} category - Category to filter by
 * @returns {Array} Filtered wishlist items
 */
function getWishlistByCategory(userId, category) {
  const wishlist = getWishlist(userId);
  
  if (!category) return wishlist;
  
  return wishlist.filter(item => 
    item.category && item.category.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Get available vs unavailable wishlist items
 * @param {string} userId - User ID
 * @returns {Object} Separated available and unavailable items
 */
function getWishlistAvailability(userId) {
  const wishlist = getWishlist(userId);
  
  const available = wishlist.filter(item => item.isAvailable);
  const unavailable = wishlist.filter(item => !item.isAvailable);
  
  return {
    available,
    unavailable,
    availableCount: available.length,
    unavailableCount: unavailable.length
  };
}

module.exports = {
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
};
