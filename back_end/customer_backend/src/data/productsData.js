/**
 * Products Data Module
 * Handles product listing, filtering, search, and retrieval for customer-facing pages
 */

// Mock product database
const products = [
  {
    id: 1,
    name: "Original Beauty Makeup Sponge For Foundation",
    description: "Original Beauty Makeup Sponge For Foundation, 2 Ct | Blender For Buildable Coverage",
    brand: "e.l.f.",
    category: "Makeup Brushes & Tools",
    subcategory: "Makeup Sponges",
    price: 5.82,
    originalPrice: 7.29,
    discount: 20,
    rating: 4.8,
    reviewCount: 28781,
    image: "https://images.unsplash.com/photo-1631214524020-7e18db9a8f92?auto=format&fit=crop&q=80&w=600",
    inStock: true,
    quantity: 150,
    sponsored: true,
    limitedDeal: true,
    couponDiscount: 5,
    freeDeliveryDate: "2026-03-04",
    freeDeliveryMinOrder: 0,
    form: "Sponge",
    finish: "Natural",
    skinTone: ["All"],
    skinType: ["All", "Normal", "Dry", "Oily"],
    tags: ["best-seller", "new-arrival"],
    sellerId: 1,
    sellerName: "Beauty Direct Store",
    views: 15420
  },
  {
    id: 2,
    name: "AOA Studio Makeup Sponge",
    description: "AOA Studio Makeup Sponge | Budget-Friendly – Original Pink Blending Foundation Sponge (2 pack)",
    brand: "AOA Studio",
    category: "Makeup Brushes & Tools",
    subcategory: "Makeup Sponges",
    price: 2.81,
    originalPrice: 2.81,
    discount: 0,
    rating: 4.3,
    reviewCount: 2781,
    image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&q=80&w=600",
    inStock: true,
    quantity: 320,
    sponsored: false,
    limitedDeal: false,
    couponDiscount: 0,
    freeDeliveryDate: "2026-03-03",
    freeDeliveryMinOrder: 35,
    form: "Sponge",
    finish: "Natural",
    skinTone: ["All"],
    skinType: ["All"],
    tags: ["budget-friendly"],
    sellerId: 2,
    sellerName: "AOA Official",
    views: 8920
  },
  {
    id: 3,
    name: "Real Techniques Miracle Complexion Sponge 3 Pack",
    description: "Real Techniques Miracle Complexion Sponge 3 Pack - Latex-Free Makeup Blender Sponge - For Foundation & Concealer",
    brand: "Real Techniques",
    category: "Makeup Brushes & Tools",
    subcategory: "Makeup Sponges",
    price: 11.99,
    originalPrice: 14.99,
    discount: 20,
    rating: 4.7,
    reviewCount: 50000,
    image: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=600",
    inStock: true,
    quantity: 89,
    sponsored: false,
    limitedDeal: false,
    couponDiscount: 0,
    freeDeliveryDate: "2026-03-05",
    freeDeliveryMinOrder: 0,
    form: "Sponge",
    finish: "Natural",
    skinTone: ["All"],
    skinType: ["All", "Normal", "Dry", "Sensitive"],
    tags: ["latex-free", "top-rated"],
    sellerId: 3,
    sellerName: "Real Techniques Store",
    views: 32150
  },
  {
    id: 4,
    name: "e.l.f. Camo Liquid Blush",
    description: "e.l.f. Camo Liquid Blush, Lightweight, Long Lasting, Highly Pigmented, Builds & Blends Seamlessly",
    brand: "e.l.f.",
    category: "Makeup",
    subcategory: "Face Makeup",
    price: 7.00,
    originalPrice: 7.00,
    discount: 0,
    rating: 4.4,
    reviewCount: 15243,
    image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=600",
    inStock: true,
    quantity: 250,
    sponsored: true,
    limitedDeal: false,
    couponDiscount: 0,
    freeDeliveryDate: "2026-03-04",
    freeDeliveryMinOrder: 35,
    form: "Liquid",
    finish: "Natural",
    skinTone: ["All", "Light", "Medium", "Deep"],
    skinType: ["All", "Normal", "Dry"],
    tags: ["vegan", "cruelty-free"],
    sellerId: 1,
    sellerName: "Beauty Direct Store",
    views: 12340
  },
  {
    id: 5,
    name: "JUNO & Co. Microfiber Velvet Sponge",
    description: "JUNO & Co. Microfiber Velvet Sponge Makeup Applicator for Liquid Foundation, 2ct. - Orange",
    brand: "JUNO & Co.",
    category: "Makeup Brushes & Tools",
    subcategory: "Makeup Sponges",
    price: 8.99,
    originalPrice: 8.99,
    discount: 0,
    rating: 4.6,
    reviewCount: 12891,
    image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=600",
    inStock: true,
    quantity: 175,
    sponsored: false,
    limitedDeal: false,
    couponDiscount: 0,
    freeDeliveryDate: "2026-03-03",
    freeDeliveryMinOrder: 0,
    form: "Sponge",
    finish: "Natural",
    skinTone: ["All"],
    skinType: ["All", "Normal", "Dry"],
    tags: ["microfiber", "premium"],
    sellerId: 4,
    sellerName: "JUNO Store",
    views: 9870
  },
  {
    id: 6,
    name: "Wet N Wild Makeup Sponge",
    description: "Wet N Wild Makeup Sponge, Pink Blender Foundation, Face Sponge Concealer, 5ct",
    brand: "Wet n Wild",
    category: "Makeup Brushes & Tools",
    subcategory: "Makeup Sponges",
    price: 2.23,
    originalPrice: 8.99,
    discount: 75,
    rating: 4.2,
    reviewCount: 5421,
    image: "https://images.unsplash.com/photo-1631214524020-7e18db9a8f92?auto=format&fit=crop&q=80&w=600",
    inStock: true,
    quantity: 420,
    sponsored: false,
    limitedDeal: true,
    couponDiscount: 0,
    freeDeliveryDate: "2026-03-04",
    freeDeliveryMinOrder: 0,
    form: "Sponge",
    finish: "Natural",
    skinTone: ["All"],
    skinType: ["All"],
    tags: ["value-pack", "budget"],
    sellerId: 5,
    sellerName: "Wet n Wild Official",
    views: 18750
  },
  {
    id: 7,
    name: "Shop MISS A AOA Studio PAW PAW",
    description: "Shop MISS A AOA Studio PAW PAW: Super Soft Makeup Sponge - Blend Like A Pro!",
    brand: "AOA Studio",
    category: "Makeup Brushes & Tools",
    subcategory: "Makeup Sponges",
    price: 5.45,
    originalPrice: 5.45,
    discount: 0,
    rating: 4.8,
    reviewCount: 3891,
    image: "https://images.unsplash.com/photo-1588159343745-445767c0ab02?auto=format&fit=crop&q=80&w=600",
    inStock: true,
    quantity: 200,
    sponsored: true,
    limitedDeal: false,
    couponDiscount: 0,
    freeDeliveryDate: "2026-03-05",
    freeDeliveryMinOrder: 35,
    form: "Sponge",
    finish: "Natural",
    skinTone: ["All"],
    skinType: ["All", "Sensitive"],
    tags: ["soft", "gentle"],
    sellerId: 2,
    sellerName: "AOA Official",
    views: 7650
  },
  {
    id: 8,
    name: "EcoTools Perfecting Blender Duo",
    description: "EcoTools Perfecting Blender Duo Makeup Sponges For A Seamless, Buildable Blending For All Makeup Types",
    brand: "EcoTools",
    category: "Makeup Brushes & Tools",
    subcategory: "Makeup Sponges",
    price: 6.39,
    originalPrice: 6.39,
    discount: 0,
    rating: 4.5,
    reviewCount: 10432,
    image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&q=80&w=600",
    inStock: true,
    quantity: 165,
    sponsored: false,
    limitedDeal: false,
    couponDiscount: 0,
    freeDeliveryDate: "2026-03-03",
    freeDeliveryMinOrder: 0,
    form: "Sponge",
    finish: "Natural",
    skinTone: ["All"],
    skinType: ["All"],
    tags: ["eco-friendly", "sustainable"],
    sellerId: 6,
    sellerName: "EcoTools Store",
    views: 11230
  },
  {
    id: 9,
    name: "L'Oreal Paris Colour Riche Original Satin Lipstick",
    description: "L'Oreal Paris Colour Riche Original Satin Lipstick With Hydrating Formula, Pink, Coral & Red Lip Color",
    brand: "L'Oreal Paris",
    category: "Makeup",
    subcategory: "Lipstick",
    price: 9.48,
    originalPrice: 9.48,
    discount: 0,
    rating: 4.7,
    reviewCount: 23541,
    image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=600",
    inStock: true,
    quantity: 310,
    sponsored: false,
    limitedDeal: false,
    couponDiscount: 0,
    freeDeliveryDate: "2026-03-04",
    freeDeliveryMinOrder: 35,
    form: "Stick",
    finish: "Satin",
    skinTone: ["All"],
    skinType: ["All"],
    tags: ["hydrating", "long-lasting"],
    sellerId: 7,
    sellerName: "L'Oreal Official",
    views: 28940
  },
  {
    id: 10,
    name: "NYX Professional Makeup Epic Ink Liner",
    description: "NYX Professional Makeup Epic Ink Liner, Waterproof Liquid Eyeliner - Pitch Black",
    brand: "NYX PROFESSIONAL MAKEUP",
    category: "Makeup",
    subcategory: "Eye Makeup",
    price: 10.00,
    originalPrice: 12.00,
    discount: 17,
    rating: 4.6,
    reviewCount: 18765,
    image: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=600",
    inStock: true,
    quantity: 230,
    sponsored: false,
    limitedDeal: false,
    couponDiscount: 10,
    freeDeliveryDate: "2026-03-03",
    freeDeliveryMinOrder: 0,
    form: "Liquid",
    finish: "Matte",
    skinTone: ["All"],
    skinType: ["All"],
    tags: ["waterproof", "long-wear"],
    sellerId: 8,
    sellerName: "NYX Store",
    views: 16780
  },
  {
    id: 11,
    name: "MAYBELLINE Lash Sensational Sky High Mascara",
    description: "MAYBELLINE Lash Sensational Sky High Mascara, Volumizing & Lengthening, Washable",
    brand: "MAYBELLINE",
    category: "Makeup",
    subcategory: "Eye Makeup",
    price: 11.98,
    originalPrice: 14.99,
    discount: 20,
    rating: 4.5,
    reviewCount: 34521,
    image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=600",
    inStock: true,
    quantity: 278,
    sponsored: true,
    limitedDeal: false,
    couponDiscount: 0,
    freeDeliveryDate: "2026-03-04",
    freeDeliveryMinOrder: 0,
    form: "Liquid",
    finish: "Natural",
    skinTone: ["All"],
    skinType: ["All", "Sensitive"],
    tags: ["volumizing", "lengthening"],
    sellerId: 9,
    sellerName: "Maybelline Store",
    views: 42310
  },
  {
    id: 12,
    name: "COVERGIRL Clean Fresh Skin Milk Foundation",
    description: "COVERGIRL Clean Fresh Skin Milk Foundation, Lightweight, Natural Finish, Medium Coverage",
    brand: "COVERGIRL",
    category: "Makeup",
    subcategory: "Face Makeup",
    price: 7.97,
    originalPrice: 9.99,
    discount: 20,
    rating: 4.3,
    reviewCount: 8932,
    image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=600",
    inStock: true,
    quantity: 145,
    sponsored: false,
    limitedDeal: false,
    couponDiscount: 0,
    freeDeliveryDate: "2026-03-05",
    freeDeliveryMinOrder: 35,
    form: "Liquid",
    finish: "Natural",
    skinTone: ["Light", "Medium", "Deep"],
    skinType: ["All", "Normal", "Dry"],
    tags: ["clean", "vegan"],
    sellerId: 10,
    sellerName: "Covergirl Store",
    views: 9870
  }
];

// Filter metadata
const filterOptions = {
  brands: ["e.l.f.", "L'Oreal Paris", "NYX PROFESSIONAL MAKEUP", "MAYBELLINE", "COVERGIRL", "REVLON", "tarte", "AOA Studio", "Real Techniques", "JUNO & Co.", "Wet n Wild", "EcoTools"],
  categories: ["Makeup", "Makeup Brushes & Tools", "Beauty & Personal Care", "Foundation Makeup", "Lipstick", "Eyeshadow"],
  forms: ["Cream", "Liquid", "Powder", "Pencil", "Sponge", "Stick"],
  finishes: ["Natural", "Matte", "Dewy", "Satin", "Shimmer"],
  skinTones: ["All", "Light", "Medium", "Deep"],
  skinTypes: ["All", "Normal", "Dry", "Oily", "Combination", "Sensitive"],
  ratings: [4, 3, 2, 1],
  deals: ["All Discounts", "Today's Deals", "Limited Time Deals"],
  priceRanges: [
    { label: "Under $5", min: 0, max: 5 },
    { label: "$5 to $10", min: 5, max: 10 },
    { label: "$10 to $20", min: 10, max: 20 },
    { label: "$20 to $50", min: 20, max: 50 },
    { label: "$50 & Above", min: 50, max: Infinity }
  ]
};

/**
 * Get all products with filtering, sorting, and pagination
 */
function getProducts(filters = {}) {
  const {
    search = '',
    brands = [],
    categories = [],
    minRating = 0,
    minPrice = 0,
    maxPrice = Infinity,
    forms = [],
    finishes = [],
    skinTones = [],
    skinTypes = [],
    inStock = null,
    limitedDeal = null,
    sponsored = null,
    sortBy = 'relevance', // relevance, price-asc, price-desc, rating, newest, popularity
    page = 1,
    limit = 24
  } = filters;

  let filtered = [...products];

  // Search filter
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(searchLower) ||
      p.description.toLowerCase().includes(searchLower) ||
      p.brand.toLowerCase().includes(searchLower) ||
      p.category.toLowerCase().includes(searchLower)
    );
  }

  // Brand filter
  if (brands.length > 0) {
    filtered = filtered.filter(p => brands.includes(p.brand));
  }

  // Category filter
  if (categories.length > 0) {
    filtered = filtered.filter(p => categories.includes(p.category) || categories.includes(p.subcategory));
  }

  // Rating filter
  if (minRating > 0) {
    filtered = filtered.filter(p => p.rating >= minRating);
  }

  // Price filter
  filtered = filtered.filter(p => p.price >= minPrice && p.price <= maxPrice);

  // Form filter
  if (forms.length > 0) {
    filtered = filtered.filter(p => forms.includes(p.form));
  }

  // Finish filter
  if (finishes.length > 0) {
    filtered = filtered.filter(p => finishes.includes(p.finish));
  }

  // Skin tone filter
  if (skinTones.length > 0) {
    filtered = filtered.filter(p => p.skinTone.some(t => skinTones.includes(t)));
  }

  // Skin type filter
  if (skinTypes.length > 0) {
    filtered = filtered.filter(p => p.skinType.some(t => skinTypes.includes(t)));
  }

  // Stock filter
  if (inStock !== null) {
    filtered = filtered.filter(p => p.inStock === inStock);
  }

  // Limited deal filter
  if (limitedDeal !== null) {
    filtered = filtered.filter(p => p.limitedDeal === limitedDeal);
  }

  // Sponsored filter
  if (sponsored !== null) {
    filtered = filtered.filter(p => p.sponsored === sponsored);
  }

  // Sorting
  switch (sortBy) {
    case 'price-asc':
      filtered.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      filtered.sort((a, b) => b.price - a.price);
      break;
    case 'rating':
      filtered.sort((a, b) => b.rating - a.rating);
      break;
    case 'newest':
      filtered.sort((a, b) => b.id - a.id);
      break;
    case 'popularity':
      filtered.sort((a, b) => b.views - a.views);
      break;
    case 'relevance':
    default:
      // Sponsored first, then limited deals, then by rating
      filtered.sort((a, b) => {
        if (a.sponsored !== b.sponsored) return b.sponsored - a.sponsored;
        if (a.limitedDeal !== b.limitedDeal) return b.limitedDeal - a.limitedDeal;
        return b.rating - a.rating;
      });
  }

  // Pagination
  const totalProducts = filtered.length;
  const totalPages = Math.ceil(totalProducts / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedProducts = filtered.slice(startIndex, endIndex);

  return {
    products: paginatedProducts,
    pagination: {
      currentPage: page,
      totalPages,
      totalProducts,
      productsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    },
    appliedFilters: {
      search,
      brands,
      categories,
      minRating,
      priceRange: { min: minPrice, max: maxPrice },
      forms,
      finishes,
      skinTones,
      skinTypes,
      inStock,
      limitedDeal,
      sponsored,
      sortBy
    }
  };
}

/**
 * Get product by ID
 */
function getProductById(id) {
  const product = products.find(p => p.id === parseInt(id));
  if (!product) {
    return null;
  }
  return product;
}

/**
 * Get filter options
 */
function getFilterOptions() {
  return filterOptions;
}

/**
 * Get popular/trending products
 */
function getTrendingProducts(limit = 10) {
  return [...products]
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

/**
 * Get deals of the day
 */
function getDealsOfDay(limit = 12) {
  return products
    .filter(p => p.limitedDeal || p.discount > 0)
    .sort((a, b) => b.discount - a.discount)
    .slice(0, limit);
}

/**
 * Get sponsored products
 */
function getSponsoredProducts(limit = 5) {
  return products.filter(p => p.sponsored).slice(0, limit);
}

/**
 * Get related products
 */
function getRelatedProducts(productId, limit = 6) {
  const product = products.find(p => p.id === parseInt(productId));
  if (!product) return [];

  return products
    .filter(p => 
      p.id !== product.id && 
      (p.category === product.category || p.brand === product.brand)
    )
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
}

/**
 * Search products
 */
function searchProducts(query, limit = 10) {
  if (!query) return [];
  
  const searchLower = query.toLowerCase();
  return products
    .filter(p =>
      p.name.toLowerCase().includes(searchLower) ||
      p.description.toLowerCase().includes(searchLower) ||
      p.brand.toLowerCase().includes(searchLower) ||
      p.tags.some(tag => tag.toLowerCase().includes(searchLower))
    )
    .slice(0, limit);
}

/**
 * Get products by category
 */
function getProductsByCategory(category, limit = 24) {
  return products
    .filter(p => p.category === category || p.subcategory === category)
    .slice(0, limit);
}

/**
 * Get products by brand
 */
function getProductsByBrand(brand, limit = 24) {
  return products.filter(p => p.brand === brand).slice(0, limit);
}

module.exports = {
  getProducts,
  getProductById,
  getFilterOptions,
  getTrendingProducts,
  getDealsOfDay,
  getSponsoredProducts,
  getRelatedProducts,
  searchProducts,
  getProductsByCategory,
  getProductsByBrand
};
