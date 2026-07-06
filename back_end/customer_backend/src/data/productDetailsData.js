/**
 * Product Details Data Module
 * Product-detail page data including gallery, variants, specs, reviews, seller and delivery info.
 */

const {
  getProductById,
  getRelatedProducts,
  getTrendingProducts
} = require('./productsData');

const detailsByProductId = {
  1: {
    breadcrumb: ['Home', 'Beauty', 'Makeup Brushes & Tools', 'Makeup Sponge Set'],
    title: 'Premium Makeup Sponge Set - Professional Beauty Blender for Foundation',
    shortDescription: 'Perfect for flawless makeup application with buildable coverage',
    soldCountLabel: '5,000+ Sold',
    images: [
      'https://images.unsplash.com/photo-1631214524020-7e18db9a8f92?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=800'
    ],
    colorOptions: [
      { id: 'pink', name: 'Pink', hex: '#f472b6' },
      { id: 'orange', name: 'Orange', hex: '#fb923c' },
      { id: 'purple', name: 'Purple', hex: '#c084fc' },
      { id: 'blue', name: 'Blue', hex: '#60a5fa' }
    ],
    packOptions: [
      { id: 'pack_2', label: '2 Pack', price: 12.99, originalPrice: 24.99, isDefault: true },
      { id: 'pack_4', label: '4 Pack', price: 22.99, originalPrice: 39.99, isDefault: false },
      { id: 'pack_6', label: '6 Pack', price: 32.99, originalPrice: 54.99, isDefault: false }
    ],
    stock: {
      inStock: true,
      quantityAvailable: 500,
      statusLabel: 'In Stock - Ready to Ship'
    },
    descriptionSections: {
      intro: [
        'Our Premium Makeup Sponge Set is designed to give you flawless, airbrushed makeup application every time.',
        'Made from ultra-soft, latex-free material, these beauty blenders are perfect for both liquid and powder products.'
      ],
      keyFeatures: [
        'Ultra-soft, latex-free material',
        'Expands when wet for better blending',
        'Easy to clean and dries quickly',
        'Perfect for foundation, concealer, and powder',
        'Professional quality at an affordable price',
        'Suitable for all skin types'
      ],
      howToUse: [
        'Wet the sponge with water until fully expanded',
        'Squeeze out excess water',
        'Apply makeup product to sponge or directly to skin',
        'Bounce and blend for a flawless finish',
        'Wash after each use and let air dry'
      ]
    },
    specifications: [
      { key: 'Brand', value: 'BeautyBlend' },
      { key: 'Model', value: 'BB-PRO-2024' },
      { key: 'Material', value: 'Latex-Free Foam' },
      { key: 'Color Options', value: 'Pink, Orange, Purple, Blue' },
      { key: 'Pack Size', value: '2 Pack, 4 Pack, 6 Pack' },
      { key: 'Dimensions', value: '6 x 4 x 4 cm (each sponge when dry)' },
      { key: 'Weight', value: '15g per sponge' },
      { key: 'Features', value: 'Water-activated, Reusable, Easy to clean' },
      { key: 'Suitable For', value: 'All skin types' },
      { key: 'Care Instructions', value: 'Wash with soap and water after each use, Air dry' },
      { key: 'Warranty', value: '1 Year Manufacturer Warranty' },
      { key: 'Country of Origin', value: 'USA' }
    ],
    sellerInfo: {
      id: 1,
      storeName: 'BeautyHub Store',
      avatarText: 'B',
      rating: 4.9,
      ratingCount: 1250,
      positiveFeedbackPercent: 98,
      storeUrl: 'Front_End/Seller/index.html',
      contactUrl: 'mailto:support@beautyhub.example'
    },
    delivery: {
      freeDelivery: true,
      estimatedRangeDefault: 'Mar 5 - Mar 8',
      locationMessage: 'Select location to see delivery options',
      supportedCities: {
        Karachi: 'Mar 4 - Mar 7',
        Lahore: 'Mar 5 - Mar 8',
        Islamabad: 'Mar 5 - Mar 8',
        Rawalpindi: 'Mar 5 - Mar 9',
        Multan: 'Mar 6 - Mar 10'
      }
    },
    trustBadges: [
      { id: 'secure-payment', title: 'Secure Payment', icon: 'shield-check' },
      { id: 'easy-return', title: 'Easy Return', icon: 'rotate-ccw' },
      { id: 'warranty', title: '1 Year Warranty', icon: 'award' }
    ]
  }
};

const reviewsByProductId = {
  1: [
    {
      id: 1,
      userName: 'Sarah Martinez',
      avatar: 'SM',
      rating: 5,
      comment: 'These sponges are amazing! They blend my foundation so smoothly and the quality is better than some expensive brands I have tried.',
      verifiedPurchase: true,
      helpfulCount: 24,
      createdAt: new Date('2026-03-06T10:00:00.000Z').toISOString()
    },
    {
      id: 2,
      userName: 'Jessica Davis',
      avatar: 'JD',
      rating: 5,
      comment: 'Perfect for both beginners and professionals. The sponges expand nicely when wet and give a flawless finish.',
      verifiedPurchase: true,
      helpfulCount: 18,
      createdAt: new Date('2026-03-01T16:30:00.000Z').toISOString()
    },
    {
      id: 3,
      userName: 'Amanda Lee',
      avatar: 'AL',
      rating: 4,
      comment: 'Good quality and great value for the price. Daily use can reduce durability but overall very good.',
      verifiedPurchase: true,
      helpfulCount: 12,
      createdAt: new Date('2026-02-22T09:10:00.000Z').toISOString()
    }
  ]
};

let reviewIdCounter = 4;

function ensureProductDetail(productId) {
  const id = parseInt(productId, 10);
  const baseProduct = getProductById(id);
  if (!baseProduct) {
    return { error: 'Product not found' };
  }

  if (!detailsByProductId[id]) {
    detailsByProductId[id] = {
      breadcrumb: ['Home', baseProduct.category || 'Products', baseProduct.subcategory || baseProduct.category, baseProduct.name],
      title: baseProduct.name,
      shortDescription: baseProduct.description,
      soldCountLabel: '1,000+ Sold',
      images: [baseProduct.image],
      colorOptions: [{ id: 'default', name: 'Default', hex: '#9ca3af' }],
      packOptions: [{ id: 'default_pack', label: 'Standard Pack', price: baseProduct.price, originalPrice: baseProduct.originalPrice || baseProduct.price, isDefault: true }],
      stock: {
        inStock: baseProduct.inStock,
        quantityAvailable: baseProduct.quantity || 0,
        statusLabel: baseProduct.inStock ? 'In Stock - Ready to Ship' : 'Out of Stock'
      },
      descriptionSections: {
        intro: [baseProduct.description],
        keyFeatures: ['Quality product', 'Reliable seller'],
        howToUse: []
      },
      specifications: [
        { key: 'Brand', value: baseProduct.brand },
        { key: 'Category', value: baseProduct.category }
      ],
      sellerInfo: {
        id: baseProduct.sellerId,
        storeName: baseProduct.sellerName,
        avatarText: String(baseProduct.sellerName || 'S').charAt(0),
        rating: 4.5,
        ratingCount: 100,
        positiveFeedbackPercent: 95,
        storeUrl: 'Front_End/Seller/index.html',
        contactUrl: 'mailto:support@example.com'
      },
      delivery: {
        freeDelivery: true,
        estimatedRangeDefault: 'Mar 5 - Mar 9',
        locationMessage: 'Select location to see delivery options',
        supportedCities: {}
      },
      trustBadges: [
        { id: 'secure-payment', title: 'Secure Payment', icon: 'shield-check' }
      ]
    };
  }

  if (!reviewsByProductId[id]) {
    reviewsByProductId[id] = [];
  }

  return { id, baseProduct };
}

function getRatingSummary(productId) {
  const id = parseInt(productId, 10);
  const reviews = reviewsByProductId[id] || [];

  const defaultSummary = {
    average: 0,
    totalReviews: 0,
    breakdown: {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0
    }
  };

  if (reviews.length === 0) {
    return defaultSummary;
  }

  const summary = reviews.reduce((acc, review) => {
    acc.average += review.rating;
    acc.breakdown[review.rating] += 1;
    return acc;
  }, defaultSummary);

  summary.average = Number((summary.average / reviews.length).toFixed(1));
  summary.totalReviews = reviews.length;

  return summary;
}

function getReviews(productId, { page = 1, limit = 10, rating = null, sortBy = 'newest' } = {}) {
  const id = parseInt(productId, 10);
  const allReviews = [...(reviewsByProductId[id] || [])];

  let filtered = rating ? allReviews.filter((r) => r.rating === Number(rating)) : allReviews;

  if (sortBy === 'helpful') {
    filtered.sort((a, b) => b.helpfulCount - a.helpfulCount);
  } else if (sortBy === 'rating-desc') {
    filtered.sort((a, b) => b.rating - a.rating);
  } else if (sortBy === 'rating-asc') {
    filtered.sort((a, b) => a.rating - b.rating);
  } else {
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const normalizedPage = Math.max(1, parseInt(page, 10) || 1);
  const normalizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));
  const start = (normalizedPage - 1) * normalizedLimit;
  const paginated = filtered.slice(start, start + normalizedLimit);

  return {
    ratingSummary: getRatingSummary(id),
    reviews: paginated,
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / normalizedLimit))
    }
  };
}

function addReview(productId, payload = {}) {
  const id = parseInt(productId, 10);
  const userName = String(payload.userName || '').trim();
  const rating = Number(payload.rating);
  const comment = String(payload.comment || '').trim();

  if (!userName) {
    return { success: false, error: 'User name is required' };
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { success: false, error: 'Rating must be an integer between 1 and 5' };
  }
  if (comment.length < 10) {
    return { success: false, error: 'Review comment must be at least 10 characters long' };
  }

  const review = {
    id: reviewIdCounter++,
    userName,
    avatar: userName.split(' ').map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase(),
    rating,
    comment,
    verifiedPurchase: Boolean(payload.verifiedPurchase),
    helpfulCount: 0,
    createdAt: new Date().toISOString()
  };

  if (!reviewsByProductId[id]) {
    reviewsByProductId[id] = [];
  }

  reviewsByProductId[id].unshift(review);
  return { success: true, data: review };
}

function getProductDetails(productId, { city } = {}) {
  const ensured = ensureProductDetail(productId);
  if (ensured.error) {
    return { error: ensured.error };
  }

  const { id, baseProduct } = ensured;
  const extra = detailsByProductId[id];
  const ratingSummary = getRatingSummary(id);

  const defaultPack = extra.packOptions.find((p) => p.isDefault) || extra.packOptions[0];
  const estimatedRange = city && extra.delivery.supportedCities[city]
    ? extra.delivery.supportedCities[city]
    : extra.delivery.estimatedRangeDefault;

  return {
    productId: id,
    breadcrumb: extra.breadcrumb,
    product: {
      id: baseProduct.id,
      name: extra.title || baseProduct.name,
      brand: baseProduct.brand,
      shortDescription: extra.shortDescription,
      description: baseProduct.description,
      category: baseProduct.category,
      subcategory: baseProduct.subcategory,
      price: defaultPack ? defaultPack.price : baseProduct.price,
      originalPrice: defaultPack ? defaultPack.originalPrice : (baseProduct.originalPrice || baseProduct.price),
      discount: baseProduct.discount,
      soldCountLabel: extra.soldCountLabel,
      rating: ratingSummary.average || baseProduct.rating,
      totalReviews: ratingSummary.totalReviews || baseProduct.reviewCount,
      inStock: extra.stock.inStock,
      quantityAvailable: extra.stock.quantityAvailable
    },
    gallery: extra.images,
    variants: {
      colors: extra.colorOptions,
      packs: extra.packOptions
    },
    seller: extra.sellerInfo,
    delivery: {
      freeDelivery: extra.delivery.freeDelivery,
      estimatedRange,
      locationMessage: extra.delivery.locationMessage
    },
    trustBadges: extra.trustBadges,
    tabs: {
      description: extra.descriptionSections,
      specifications: extra.specifications,
      ratingSummary
    }
  };
}

function getSpecifications(productId) {
  const ensured = ensureProductDetail(productId);
  if (ensured.error) {
    return { error: ensured.error };
  }

  return detailsByProductId[ensured.id].specifications;
}

function getRelatedForProduct(productId, limit = 8) {
  const ensured = ensureProductDetail(productId);
  if (ensured.error) {
    return { error: ensured.error };
  }

  const id = ensured.id;
  const normalizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 8, 20));
  const related = getRelatedProducts(id, normalizedLimit);

  if (related.length > 0) {
    return related;
  }

  return getTrendingProducts(normalizedLimit);
}

module.exports = {
  getProductDetails,
  getSpecifications,
  getReviews,
  addReview,
  getRelatedForProduct
};
