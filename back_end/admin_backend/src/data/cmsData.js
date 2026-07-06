const now = new Date();

const cmsState = {
  currentAdmin: {
    id: 'ADMIN001',
    name: 'Admin User',
    email: 'admin@store.com',
    role: 'super-admin'
  },
  banners: [
    {
      id: 'BAN001',
      title: 'Black Friday Sale',
      location: 'homepage',
      headline: 'Black Friday Event',
      subtext: 'Up to 70% off on selected items',
      ctaText: 'Shop Now',
      ctaLink: 'https://mystore.com/shop',
      image: 'https://via.placeholder.com/1200x400/232f3e/ffffff?text=Black+Friday',
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).toISOString(),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5).toISOString(),
      enabled: true,
      views: 12450,
      clicks: 2340
    },
    {
      id: 'BAN002',
      title: 'Nike Exclusive',
      location: 'shoes',
      headline: 'New Nike Collection',
      subtext: 'Limited edition shoes just arrived',
      ctaText: 'View Collection',
      ctaLink: 'https://mystore.com/shoes/nike',
      image: 'https://via.placeholder.com/1200x400/232f3e/ffffff?text=Nike+Collection',
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString(),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString(),
      enabled: true,
      views: 0,
      clicks: 0
    },
    {
      id: 'BAN003',
      title: 'Electronics Mega Deal',
      location: 'electronics',
      headline: 'Electronics Mega Deal',
      subtext: 'Best tech deals of the season',
      ctaText: 'Explore',
      ctaLink: 'https://mystore.com/electronics',
      image: 'https://via.placeholder.com/1200x400/232f3e/ffffff?text=Electronics+Deal',
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10).toISOString(),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3).toISOString(),
      enabled: false,
      views: 8920,
      clicks: 1560
    }
  ],
  landingPages: [
    {
      id: 'LAND001',
      name: 'Summer Vibes Campaign',
      slug: 'summer-vibes',
      status: 'published',
      publishedDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 15).toISOString(),
      views: 5234,
      conversions: 342,
      conversionRate: 6.5
    },
    {
      id: 'LAND002',
      name: 'Flash Sale Event',
      slug: 'flash-sale',
      status: 'scheduled',
      publishedDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3).toISOString(),
      views: 0,
      conversions: 0,
      conversionRate: 0
    },
    {
      id: 'LAND003',
      name: 'Winter Fashion',
      slug: 'winter-fashion',
      status: 'draft',
      publishedDate: null,
      views: 0,
      conversions: 0,
      conversionRate: 0
    }
  ],
  blogPosts: [
    {
      id: 'BLOG001',
      title: '10 Ways to Style Your Sneakers',
      category: 'guides',
      status: 'published',
      views: 3245,
      seoScore: 92,
      createdDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5).toISOString()
    },
    {
      id: 'BLOG002',
      title: 'Top 5 Electronics Trends 2025',
      category: 'news',
      status: 'published',
      views: 2150,
      seoScore: 88,
      createdDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10).toISOString()
    },
    {
      id: 'BLOG003',
      title: 'How to Care for Your Designer Bags',
      category: 'tips',
      status: 'draft',
      views: 0,
      seoScore: 0,
      createdDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).toISOString()
    }
  ],
  faqs: [
    {
      id: 'FAQ001',
      question: 'What is your return policy?',
      category: 'returns',
      featured: true,
      visible: true,
      order: 1,
      helpfulCount: 324
    },
    {
      id: 'FAQ002',
      question: 'How long does shipping take?',
      category: 'shipping',
      featured: true,
      visible: true,
      order: 2,
      helpfulCount: 512
    },
    {
      id: 'FAQ003',
      question: 'What payment methods do you accept?',
      category: 'payments',
      featured: false,
      visible: true,
      order: 3,
      helpfulCount: 245
    }
  ],
  legalPages: [
    {
      id: 'LEGAL001',
      name: 'Terms & Conditions',
      slug: 'terms',
      currentVersion: 3.2,
      published: true,
      lastUpdated: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).toISOString()
    },
    {
      id: 'LEGAL002',
      name: 'Privacy Policy',
      slug: 'privacy',
      currentVersion: 2.8,
      published: true,
      lastUpdated: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString()
    },
    {
      id: 'LEGAL003',
      name: 'About Us',
      slug: 'about',
      currentVersion: 1.0,
      published: true,
      lastUpdated: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60).toISOString()
    }
  ],
  mediaFiles: [
    {
      id: 'MEDIA001',
      name: 'summer-banner.jpg',
      type: 'image',
      size: '2.4 MB',
      tags: ['banner', 'summer'],
      downloads: 0,
      uploadDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 8).toISOString()
    },
    {
      id: 'MEDIA002',
      name: 'product-showcase.mp4',
      type: 'video',
      size: '45.7 MB',
      tags: ['video', 'product'],
      downloads: 2,
      uploadDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 15).toISOString()
    },
    {
      id: 'MEDIA003',
      name: 'brand-logo.png',
      type: 'image',
      size: '0.8 MB',
      tags: ['logo', 'brand'],
      downloads: 15,
      uploadDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 45).toISOString()
    }
  ],
  announcements: [
    {
      id: 'ANN001',
      message: 'Free Shipping This Weekend Only!',
      type: 'banner',
      color: 'success',
      status: 'active',
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString(),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
    },
    {
      id: 'ANN002',
      message: 'We are upgrading our system. Expect some downtime on Sunday midnight.',
      type: 'alert',
      color: 'warning',
      status: 'scheduled',
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3).toISOString(),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4).toISOString()
    }
  ],
  auditLog: [
    {
      id: 'AUDIT001',
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      adminName: 'Admin User',
      action: 'banner-updated',
      targetName: 'Black Friday Sale',
      changes: 'Updated headline and CTA text'
    },
    {
      id: 'AUDIT002',
      timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
      adminName: 'Admin User',
      action: 'blog-published',
      targetName: '10 Ways to Style Your Sneakers',
      changes: 'Published blog post'
    }
  ]
};

module.exports = {
  cmsState
};
