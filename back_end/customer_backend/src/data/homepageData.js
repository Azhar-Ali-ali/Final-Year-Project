/**
 * Homepage Data Module
 * Provides dynamic homepage content for banners, categories, product sections, and trust blocks.
 */

const {
  getTrendingProducts,
  getDealsOfDay,
  getSponsoredProducts,
  getProducts
} = require('./productsData');
const { getCart } = require('./cartData');

const heroSlides = [
  {
    id: 1,
    badge: 'Seasonal Sale',
    title: '50% OFF Electronics',
    subtitle: 'Upgrade your lifestyle with premium tech from verified global vendors.',
    ctaText: 'Shop the Deal',
    ctaLink: 'all_product_spages.html',
    image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=2000'
  },
  {
    id: 2,
    badge: 'New Arrivals',
    title: 'Glow Edit Beauty Week',
    subtitle: 'Fresh drops from top beauty brands with fast local delivery.',
    ctaText: 'Explore New',
    ctaLink: 'all_product_spages.html',
    image: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=2000'
  },
  {
    id: 3,
    badge: 'Limited Time',
    title: 'Member Exclusive Deals',
    subtitle: 'Save more this week on high-rated marketplace picks.',
    ctaText: 'Unlock Offers',
    ctaLink: 'all_product_spages.html',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=2000'
  }
];

const categoryRows = [
  {
    id: 'row-1',
    tiles: [
      {
        id: 'gaming',
        title: 'Get your game on',
        ctaText: 'See more',
        ctaLink: 'all_product_spages.html',
        items: [
          { name: 'Gaming PCs', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=240' },
          { name: 'Monitors', image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&q=80&w=240' },
          { name: 'Controllers', image: 'https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&q=80&w=240' },
          { name: 'Headsets', image: 'https://images.unsplash.com/photo-1517511620798-cec17d428bc0?auto=format&fit=crop&q=80&w=240' }
        ]
      },
      {
        id: 'home-essentials',
        title: 'Shop home essentials',
        ctaText: 'See more',
        ctaLink: 'all_product_spages.html',
        items: [
          { name: 'Furniture', image: 'https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&q=80&w=240' },
          { name: 'Decor', image: 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&q=80&w=240' },
          { name: 'Lighting', image: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&q=80&w=240' },
          { name: 'Kitchen', image: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&q=80&w=240' }
        ]
      },
      {
        id: 'fashion',
        title: 'Fashion for less',
        ctaText: 'See more',
        ctaLink: 'all_product_spages.html',
        items: [
          { name: 'Women', image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=240' },
          { name: 'Men', image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=240' },
          { name: 'Kids', image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=240' },
          { name: 'Shoes', image: 'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?auto=format&fit=crop&q=80&w=240' }
        ]
      },
      {
        id: 'new-home',
        title: 'New home arrivals',
        ctaText: 'See more',
        ctaLink: 'all_product_spages.html',
        items: [
          { name: 'Bedding', image: 'https://images.unsplash.com/photo-1487014679447-9f8336841d58?auto=format&fit=crop&q=80&w=240' },
          { name: 'Storage', image: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&q=80&w=240' },
          { name: 'Bath', image: 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&q=80&w=240' },
          { name: 'Decor', image: 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&q=80&w=240' }
        ]
      }
    ]
  }
];

const testimonials = [
  {
    id: 1,
    name: 'Sarah Jenkins',
    rating: 5,
    review: 'Lumina changed how I shop. Supporting independent sellers while getting world-class quality is unbeatable.'
  },
  {
    id: 2,
    name: 'Ali Raza',
    rating: 5,
    review: 'Delivery was quick and every product matched the listing. Great marketplace experience.'
  },
  {
    id: 3,
    name: 'Maha Khan',
    rating: 4,
    review: 'I love the variety and trusted reviews. Checkout and payment options are very smooth.'
  }
];

const trustHighlights = [
  {
    id: 'secure-payment',
    title: 'Secure Payment',
    description: 'Every transaction is protected',
    icon: 'shield-check'
  },
  {
    id: 'fast-delivery',
    title: 'Fast Delivery',
    description: 'Global tracking on all orders',
    icon: 'truck'
  },
  {
    id: 'verified-sellers',
    title: 'Verified Sellers',
    description: 'Strict quality hand-picks',
    icon: 'user-check'
  },
  {
    id: 'support',
    title: '24/7 Support',
    description: 'Ready to help anytime',
    icon: 'headphones'
  }
];

function mapProductCard(product) {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    originalPrice: product.originalPrice,
    discount: product.discount,
    rating: product.rating,
    reviewCount: product.reviewCount,
    image: product.image,
    brand: product.brand,
    category: product.category,
    sellerName: product.sellerName,
    inStock: product.inStock,
    limitedDeal: product.limitedDeal
  };
}

function getHomeProductRows(limit = 8) {
  const normalizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 8, 20));
  const seasonalTerms = /summer|winter|spring|autumn|fall|seasonal|holiday|festive|resort|monsoon|beach|vacation/i;

  const newArrivals = getProducts({ sortBy: 'newest', limit: normalizedLimit }).products.map(mapProductCard);
  const trendingNow = getTrendingProducts(normalizedLimit).map(mapProductCard);
  const bestSellers = getProducts({ sortBy: 'popularity', limit: normalizedLimit }).products.map(mapProductCard);
  const seasonalCollection = getProducts({ sortBy: 'newest', limit: normalizedLimit * 3 }).products
    .filter((product) => {
      const searchable = [product.name, product.description, product.brand, product.category, ...(Array.isArray(product.tags) ? product.tags : [])].join(' ');
      return seasonalTerms.test(searchable);
    })
    .map(mapProductCard)
    .slice(0, normalizedLimit);
  const recentlyAdded = getProducts({ sortBy: 'newest', limit: normalizedLimit }).products.map(mapProductCard);
  const limitedTimeDeals = getDealsOfDay(normalizedLimit).map(mapProductCard);

  return [
    { id: 'new-arrivals', title: 'New Arrivals', products: newArrivals },
    { id: 'trending-products', title: 'Trending Products', products: trendingNow },
    { id: 'best-sellers', title: 'Best Sellers', products: bestSellers },
    { id: 'seasonal-collection', title: 'Seasonal Collection', products: seasonalCollection.length ? seasonalCollection : recentlyAdded },
    { id: 'recently-added', title: 'Recently Added', products: recentlyAdded },
    { id: 'limited-time-deals', title: 'Limited Time Deals', products: limitedTimeDeals }
  ];
}

function getFlashDeals(limit = 6) {
  const normalizedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 6, 20));
  const items = getDealsOfDay(normalizedLimit).map((product) => ({
    id: product.id,
    name: product.name,
    salePrice: product.price,
    originalPrice: product.originalPrice,
    discount: product.discount,
    image: product.image
  }));

  const now = new Date();
  const endsAt = new Date(now.getTime() + ((2 * 60 + 15) * 60 + 10) * 1000);

  return {
    title: 'Flash Deals',
    subtitle: 'Limited Stock Available',
    startsAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
    items
  };
}

function getHomepageSummary(userId = 'user_1') {
  const cart = getCart(userId);
  return {
    cartItems: cart.totalItems,
    wishlistItems: 0,
    hasActiveCoupon: Boolean(cart.appliedCoupon),
    cartTotal: cart.totals.total
  };
}

function getHomepageData({ userId = 'user_1', sectionLimit = 8, flashDealLimit = 6 } = {}) {
  return {
    summary: getHomepageSummary(userId),
    heroSlides,
    categoryRows,
    productRows: getHomeProductRows(sectionLimit),
    flashDeals: getFlashDeals(flashDealLimit),
    testimonials,
    trustHighlights
  };
}

module.exports = {
  getHomepageData,
  getHomepageSummary,
  getHomeProductRows,
  getFlashDeals,
  getHeroSlides: () => heroSlides,
  getCategoryRows: () => categoryRows,
  getTestimonials: () => testimonials,
  getTrustHighlights: () => trustHighlights
};
