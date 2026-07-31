const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');
const { Server } = require('socket.io');
const Stripe = require('stripe');
const { query, testConnection, closePool } = require('../../database/postgresClient');
const { extractToken, getActiveSession } = require('../../shared/sessionStore');
const multer = require('multer');
const FormData = require('form-data');

// Admin routes
const adminDashboardRoutes = require('./routes/dashboardRoutes');
const adminCmsRoutes = require('./routes/cmsRoutes');
const adminDisputeRoutes = require('./routes/disputeRoutes');
const adminLogisticsRoutes = require('./routes/logisticsRoutes');
const adminOrderRoutes = require('./routes/orderRoutes');
const adminPaymentPayoutRoutes = require('./routes/paymentPayoutRoutes');
const adminProductCatalogRoutes = require('./routes/productCatalogRoutes');
const adminReportsAnalyticsRoutes = require('./routes/reportsAnalyticsRoutes');
const adminReviewsRatingsRoutes = require('./routes/reviewsRatingsRoutes');
const adminSellerManagementRoutes = require('./routes/sellerManagementRoutes');
const adminUserManagementRoutes = require('./routes/userManagementRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const adminSupportRoutes = require('./routes/supportRoutes');
const adminCommissionSettingsRoutes = require('./routes/commissionSettingsRoutes');
const adminReturnsRoutes = require('./routes/returnsRoutes');
const adminRolesRoutes = require('./routes/adminRolesRoutes');

// Seller routes
const sellerDashboardRoutes = require('../../seller_backend/src/routes/dashboardRoutes');
const sellerDisputeRoutes = require('../../seller_backend/src/routes/disputeRoutes');
const sellerInventoryRoutes = require('../../seller_backend/src/routes/inventoryRoutes');
const sellerMessagesRoutes = require('../../seller_backend/src/routes/messagesRoutes');
const sellerOrderRoutes = require('../../seller_backend/src/routes/orderRoutes');
const sellerPaymentsRoutes = require('../../seller_backend/src/routes/paymentsRoutes');
const sellerProductManagementRoutes = require('../../seller_backend/src/routes/productManagementRoutes');
const sellerRefundsReturnsRoutes = require('../../seller_backend/src/routes/refundsReturnsRoutes');
const sellerPerformanceRoutes = require('../../seller_backend/src/routes/sellerPerformanceRoutes');
const sellerSettingsRoutes = require('../../seller_backend/src/routes/settingsRoutes');
const sellerReturnsDbRoutes = require('../../seller_backend/src/routes/returnsDbRoutes');

// Customer routes
const customerProductsRoutes = require('../../customer_backend/src/routes/productsRoutes');
const customerCartRoutes = require('../../customer_backend/src/routes/cartRoutes');
const customerCheckoutRoutes = require('../../customer_backend/src/routes/checkoutRoutes');
const customerHomepageRoutes = require('../../customer_backend/src/routes/homepageRoutes');
const customerAuthRoutes = require('../../customer_backend/src/routes/authRoutes');
const customerProductDetailsRoutes = require('../../customer_backend/src/routes/productDetailsRoutes');
const customerWishlistRoutes = require('../../customer_backend/src/routes/wishlistRoutes');
const customerDashboardRoutes = require('../../customer_backend/src/routes/dashboardRoutes');
const customerAddressesRoutes = require('../../customer_backend/src/routes/addressesRoutes');
const customerMessagesRoutes = require('../../customer_backend/src/routes/messagesRoutes');
const customerOrdersRoutes = require('../../customer_backend/src/routes/ordersRoutes');
const customerProfileRoutes = require('../../customer_backend/src/routes/profileRoutes');
const customerSellerProfileRoutes = require('../../customer_backend/src/routes/sellerProfileRoutes');
const customerSupportRoutes = require('../../customer_backend/src/routes/supportRoutes');
const customerSecurityRoutes = require('../../customer_backend/src/routes/securityRoutes');
const customerReturnsRoutes = require('../../customer_backend/src/routes/returnsRoutes');

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const SOCKET_CORS_ORIGIN = FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN;
const HUGGING_FACE_API_URL = process.env.HUGGING_FACE_API_URL || 'https://api-inference.huggingface.co/models/theArijitDas/distilbert-finetuned-fake-reviews';
const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE_TOKEN;
const HUGGING_FACE_HEADERS = {
  Authorization: `Bearer ${HUGGING_FACE_TOKEN}`
};

app.disable('x-powered-by');
if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(cors({
  origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan(isProduction ? 'combined' : 'dev'));

// Friendly handler for invalid JSON bodies (body-parser SyntaxError)
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400 && 'body' in err)) {
    return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
  }
  return next(err);
});

app.locals.db = { query };

app.use((req, res, next) => {
  req.db = app.locals.db;
  next();
});

const io = new Server(server, {
  cors: {
    origin: SOCKET_CORS_ORIGIN,
    credentials: true
  }
});

app.locals.io = io;

io.on('connection', (socket) => {
  socket.on('join-room', ({ threadId, userId, role }) => {
    if (!threadId) return;

    socket.join(String(threadId));
    socket.data.threadId = String(threadId);
    socket.data.userId = String(userId || '');
    socket.data.role = String(role || '');
  });

  socket.on('leave-room', ({ threadId }) => {
    if (threadId) {
      socket.leave(String(threadId));
    }
  });

  socket.on('send-message', ({ threadId, userId, role, message, attachmentUrl }) => {
    if (!threadId || !message) return;

    const payload = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      threadId: String(threadId),
      senderId: String(userId || ''),
      sender: String(role || 'customer'),
      text: String(message).trim(),
      attachmentUrl: String(attachmentUrl || '').trim(),
      createdAt: new Date().toISOString(),
      time: new Date().toISOString()
    };

    io.to(String(threadId)).emit('message-received', payload);
  });
});

function authenticateRequest(req, res, next) {
  const token = extractToken(req);
  const requestedUserId = [
    req.query?.userId,
    req.query?.customerId,
    req.query?.sellerId,
    req.query?.sellerID,
    req.body?.userId,
    req.body?.customerId,
    req.body?.sellerId,
    req.body?.sellerID,
    req.headers['x-user-id'],
    req.headers['x-customer-id'],
    req.headers['x-seller-id']
  ].find((value) => value !== undefined && value !== null && String(value).trim() !== '');

  const requestedRole = String(req.path || '').toLowerCase().includes('/customer/') ? 'customer' : 'seller';

  if (!token) {
    if (requestedUserId) {
      req.auth = {
        token: null,
        user: { id: String(requestedUserId).trim() },
        session: { userId: String(requestedUserId).trim(), role: requestedRole }
      };
      req.headers['x-user-id'] = String(requestedUserId).trim();
      req.headers['x-customer-id'] = String(requestedUserId).trim();
      req.headers['x-seller-id'] = String(requestedUserId).trim();
      return next();
    }

    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const current = getActiveSession(token);
  if (!current) {
    if (requestedUserId) {
      req.auth = {
        token,
        user: { id: String(requestedUserId).trim() },
        session: { userId: String(requestedUserId).trim(), role: requestedRole }
      };
      req.headers['x-user-id'] = String(requestedUserId).trim();
      req.headers['x-customer-id'] = String(requestedUserId).trim();
      req.headers['x-seller-id'] = String(requestedUserId).trim();
      return next();
    }

    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }

  req.auth = {
    token,
    user: current.user,
    session: current.session
  };

  // Keep compatibility with existing routes that still read user ID from headers.
  req.headers['x-user-id'] = current.session.userId;
  req.headers['x-customer-id'] = current.session.userId;
  req.headers['x-seller-id'] = current.session.userId;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.auth || !req.auth.session) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (String(req.auth.session.role || '').toLowerCase() !== String(role || '').toLowerCase()) {
      return res.status(403).json({ success: false, message: 'Access denied for this role' });
    }

    next();
  };
}

function permissionAllows(userPermission, requiredPermission) {
  const normalizedUser = String(userPermission || '').trim().toLowerCase();
  const normalizedRequired = String(requiredPermission || '').trim().toLowerCase();

  if (!normalizedRequired) return true;
  if (!normalizedUser) return false;
  if (normalizedUser === '*' || normalizedUser === normalizedRequired) return true;

  const [userModule, userAction] = normalizedUser.split('.');
  const [requiredModule, requiredAction] = normalizedRequired.split('.');
  if (!userModule || !requiredModule || userModule !== requiredModule) {
    return false;
  }

  if (userAction === 'manage' || userAction === '*') {
    return true;
  }

  return false;
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.auth || !req.auth.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const permissions = Array.isArray(req.auth.user.permissions) ? req.auth.user.permissions : [];
    const hasAccess = permissions.some((entry) => permissionAllows(entry, String(permission).trim().toLowerCase()));

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Forbidden: insufficient permissions' });
    }

    next();
  };
}

function adminPageGuard(req, res, next) {
  const requestedPath = String(req.path || '').toLowerCase();
  if (requestedPath.includes('admin_login.html')) {
    return next();
  }

  const token = extractToken(req);
  const current = getActiveSession(token);
  if (!current || String(current.session.role || '').toLowerCase() !== 'admin') {
    return res.redirect('/admin-pages/admin_login.html');
  }

  return next();
}

function sellerPageGuard(req, res, next) {
  const token = extractToken(req);
  const current = getActiveSession(token);

  if (!current || String(current.session.role || '').toLowerCase() !== 'seller') {
    return res.redirect('/customer-pages/login_register.html');
  }

  return next();
}

app.get('/api/health', async (req, res) => {
  try {
    const dbInfo = await testConnection();
    res.json({
      success: true,
      message: 'Unified backend is running',
      database: {
        connected: true,
        name: dbInfo.db,
        serverTime: dbInfo.serverTime
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Unified backend is running but database is unavailable',
      database: {
        error: error.message || error.code || 'Database connection failed'
      }
    });
  }
});

// Stripe integration endpoints (publishable key + create PaymentIntent)
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

app.get('/api/stripe/config', (req, res) => {
  return res.json({
    success: true,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
  });
});

// Backwards-compatible aliases used by frontend
app.get('/api/checkout/stripe-config', (req, res) => {
  return res.json({ success: true, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '' });
});

app.post('/api/stripe/create-payment-intent', async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ success: false, message: 'Stripe not configured on server' });

    const amount = Number(req.body.amount || 0);
    const currency = String(req.body.currency || 'pkr').toLowerCase();
    const metadata = req.body.metadata || {};

    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency,
      automatic_payment_methods: { enabled: true },
      metadata
    });

    return res.json({ success: true, clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (err) {
    console.error('create-payment-intent error', err && err.message);
    return res.status(500).json({ success: false, message: 'Failed to create payment intent', error: String(err && err.message) });
  }
});

// Alias for frontend legacy path
app.post('/api/checkout/create-payment-intent', async (req, res) => {
  // forward to same logic
  try {
    if (!stripe) return res.status(500).json({ success: false, message: 'Stripe not configured on server' });
    const amount = Number(req.body.amount || 0);
    const currency = String(req.body.currency || 'pkr').toLowerCase();
    const metadata = req.body.metadata || {};
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });
    const intent = await stripe.paymentIntents.create({ amount: Math.round(amount), currency, automatic_payment_methods: { enabled: true }, metadata });
    return res.json({ success: true, clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (err) {
    console.error('create-payment-intent alias error', err && err.message);
    return res.status(500).json({ success: false, message: 'Failed to create payment intent', error: String(err && err.message) });
  }
});

// Visual Search: accept image upload, forward to AI service, return real products from DB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.post('/api/visual-search', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Image file is required (field name: image)' });

    const top_k = Number(req.query.top_k || req.body.top_k || 5);
    const AI_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000/api/visual-search';

    const form = new FormData();
    form.append('image', req.file.buffer, {
      filename: req.file.originalname || 'upload.jpg',
      contentType: req.file.mimetype || 'image/jpeg'
    });

    const forwardUrl = `${AI_URL}?top_k=${encodeURIComponent(top_k)}`;

    const aiResp = await axios.post(forwardUrl, form, { headers: { ...form.getHeaders(), ...(process.env.HUGGING_FACE_HEADERS || {}) } });

    const recommendations = (aiResp?.data?.recommendations) || [];
    const productIds = recommendations.map((r) => String(r.product_id));

    if (!productIds.length) {
      return res.json({ success: true, recommendations: [], products: [] });
    }

    // Discover an appropriate id column in the products table and query it.
    const candidateColumns = ['product_id', 'id', 'productid', 'sku', 'code', 'pid'];
    const colRes = await query("SELECT column_name FROM information_schema.columns WHERE table_name='products'");
    const existing = Array.isArray(colRes?.rows) ? colRes.rows.map(r => String(r.column_name).toLowerCase()) : [];
    const found = candidateColumns.find(c => existing.includes(c));

    if (!found) {
      console.warn('No suitable product id column found in products table; returning recommendations without DB enrichment');
      return res.json({ success: true, recommendations, products: [] });
    }

    const sql = `SELECT * FROM products WHERE ${found}::text = ANY($1)`;
    const dbRes = await query(sql, [productIds]);

    return res.json({ success: true, recommendations, products: dbRes.rows });
  } catch (error) {
    console.error('visual-search error:', error?.message || error);
    return res.status(500).json({ success: false, message: 'Visual search failed', error: String(error?.message || error) });
  }
});

async function checkFakeReview(text) {
  const response = await axios.post(
    HUGGING_FACE_API_URL,
    { inputs: text },
    { headers: HUGGING_FACE_HEADERS }
  );

  return response.data;
}

app.post('/submit-review', async (req, res) => {
  try {
    const reviewText = String(req.body?.text || '').trim();

    if (!reviewText) {
      return res.status(400).json({
        status: 'ERROR',
        reason: 'Review text is required'
      });
    }

    const result = await checkFakeReview(reviewText);

    console.log('AI RESULT:', result);

    const topResult = Array.isArray(result) ? result[0] : null;
    const label = String(topResult?.label || '').toLowerCase();
    const score = Number(topResult?.score || 0);
    const isFake = label.includes('fake') || label === 'label_0';

    if (isFake && score > 0.7) {
      return res.json({
        status: 'BLOCKED',
        reason: 'Fake review detected'
      });
    }

    return res.json({
      status: 'APPROVED'
    });
  } catch (error) {
    console.log(error.message);

    return res.json({
      status: 'ERROR'
    });
  }
});

// Admin endpoints
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/roles', authenticateRequest, requireRole('admin'), requirePermission('settings.manage'), adminRolesRoutes);
app.use('/api/admin/dashboard', authenticateRequest, requireRole('admin'), requirePermission('dashboard.view'), adminDashboardRoutes);
app.use('/api/admin/cms', authenticateRequest, requireRole('admin'), requirePermission('cms.view'), adminCmsRoutes);
app.use('/api/admin/disputes', authenticateRequest, requireRole('admin'), requirePermission('support.view'), adminDisputeRoutes);
app.use('/api/admin/logistics', authenticateRequest, requireRole('admin'), requirePermission('logistics.view'), adminLogisticsRoutes);
app.use('/api/admin/orders', authenticateRequest, requireRole('admin'), requirePermission('orders.view'), adminOrderRoutes);
app.use('/api/admin/payments', authenticateRequest, requireRole('admin'), requirePermission('payments.view'), adminPaymentPayoutRoutes);
app.use('/api/admin/catalog', authenticateRequest, requireRole('admin'), requirePermission('products.view'), adminProductCatalogRoutes);
app.use('/api/admin/reports', authenticateRequest, requireRole('admin'), requirePermission('reports.view'), adminReportsAnalyticsRoutes);
app.use('/api/admin/reviews', authenticateRequest, requireRole('admin'), requirePermission('reviews.view'), adminReviewsRatingsRoutes);
app.use('/api/admin/sellers', authenticateRequest, requireRole('admin'), requirePermission('sellers.view'), adminSellerManagementRoutes);
app.use('/api/admin/users', authenticateRequest, requireRole('admin'), requirePermission('customers.view'), adminUserManagementRoutes);
app.use('/api/admin/support', authenticateRequest, requireRole('admin'), requirePermission('support.view'), adminSupportRoutes);
app.use('/api/admin/commission-settings', authenticateRequest, requireRole('admin'), requirePermission('settings.view'), adminCommissionSettingsRoutes);
app.use('/api/admin/marketplace-settings', authenticateRequest, requireRole('admin'), requirePermission('settings.view'), adminCommissionSettingsRoutes);
app.use('/api/admin/returns', authenticateRequest, requireRole('admin'), requirePermission('orders.view'), adminReturnsRoutes);

// Seller endpoints
app.use('/api/seller/dashboard', authenticateRequest, requireRole('seller'), sellerDashboardRoutes);
app.use('/api/seller/disputes', authenticateRequest, requireRole('seller'), sellerDisputeRoutes);
app.use('/api/seller/inventory', authenticateRequest, requireRole('seller'), sellerInventoryRoutes);
app.use('/api/seller/messages', authenticateRequest, requireRole('seller'), sellerMessagesRoutes);
app.use('/api/seller/orders', authenticateRequest, requireRole('seller'), sellerOrderRoutes);
app.use('/api/seller/payments', authenticateRequest, requireRole('seller'), sellerPaymentsRoutes);
app.use('/api/seller/products', authenticateRequest, requireRole('seller'), sellerProductManagementRoutes);
app.use('/api/seller/refunds-returns', authenticateRequest, requireRole('seller'), sellerRefundsReturnsRoutes);
app.use('/api/seller/performance', authenticateRequest, requireRole('seller'), sellerPerformanceRoutes);
app.use('/api/seller/settings', authenticateRequest, requireRole('seller'), sellerSettingsRoutes);
app.use('/api/seller/returns', authenticateRequest, requireRole('seller'), sellerReturnsDbRoutes);

// Customer endpoints (existing public and customer-scoped routes)
app.use('/api/products', customerProductsRoutes);
app.use('/api/homepage', customerHomepageRoutes);
app.use('/api/auth', customerAuthRoutes);
app.use('/api/product-details', customerProductDetailsRoutes);

// Checkout and cart endpoints - allow with or without auth
app.use('/api/cart', (req, res, next) => {
	const fallbackUserId = req.query?.userId || req.body?.userId;
	if (fallbackUserId) {
		req.headers['x-user-id'] = String(fallbackUserId);
	}

  const token = extractToken(req);
  if (token) {
    const current = getActiveSession(token);
    if (current && String(current.session.role || '').toLowerCase() === 'customer') {
      req.auth = { token, user: current.user, session: current.session };
      req.headers['x-user-id'] = current.session.userId;
    }
  }
  next();
}, customerCartRoutes);

app.use('/api/checkout', (req, res, next) => {
	const fallbackUserId = req.query?.userId || req.body?.userId;
	if (fallbackUserId) {
		req.headers['x-user-id'] = String(fallbackUserId);
	}

  const token = extractToken(req);
  if (token) {
    const current = getActiveSession(token);
    if (current && String(current.session.role || '').toLowerCase() === 'customer') {
      req.auth = { token, user: current.user, session: current.session };
      req.headers['x-user-id'] = current.session.userId;
    }
  }
  next();
}, customerCheckoutRoutes);

app.use('/api/orders', (req, res, next) => {
  const fallbackUserId = req.query?.userId || req.body?.userId;
  if (fallbackUserId) {
    req.headers['x-user-id'] = String(fallbackUserId);
  }

  const token = extractToken(req);
  if (token) {
    const current = getActiveSession(token);
    if (current && String(current.session.role || '').toLowerCase() === 'customer') {
      req.auth = { token, user: current.user, session: current.session };
      req.headers['x-user-id'] = current.session.userId;
    }
  }
  next();
}, customerOrdersRoutes);

app.use('/api/wishlist', authenticateRequest, requireRole('customer'), customerWishlistRoutes);
app.use('/api/customer/dashboard', authenticateRequest, requireRole('customer'), customerDashboardRoutes);
app.use('/api/customer/addresses', authenticateRequest, requireRole('customer'), customerAddressesRoutes);
app.use('/api/customer/messages', authenticateRequest, requireRole('customer'), customerMessagesRoutes);
app.use('/api/customer/orders', authenticateRequest, requireRole('customer'), customerOrdersRoutes);
app.use('/api/customer/profile', authenticateRequest, requireRole('customer'), customerProfileRoutes);
app.use('/api/customer/support', authenticateRequest, requireRole('customer'), customerSupportRoutes);
app.use('/api/customer/security', authenticateRequest, requireRole('customer'), customerSecurityRoutes);
app.use('/api/customer/returns', authenticateRequest, requireRole('customer'), customerReturnsRoutes);
app.use('/api/customer/sellers', customerSellerProfileRoutes);

// Optional customer aliases under /api/customer/*
app.use('/api/customer/products', customerProductsRoutes);
app.use('/api/customer/homepage', customerHomepageRoutes);
app.use('/api/customer/auth', customerAuthRoutes);
app.use('/api/customer/product-details', customerProductDetailsRoutes);
app.use('/api/customer/cart', authenticateRequest, requireRole('customer'), customerCartRoutes);
app.use('/api/customer/checkout', authenticateRequest, requireRole('customer'), customerCheckoutRoutes);
app.use('/api/customer/wishlist', authenticateRequest, requireRole('customer'), customerWishlistRoutes);

const adminPagesPath = path.resolve(__dirname, '../../..', 'Front_End/Admin/pages');
const adminJsPath = path.resolve(__dirname, '../../..', 'Front_End/Admin/js');
const sellerPagesPath = path.resolve(__dirname, '../../..', 'Front_End/Seller/pages');
const sellerJsPath = path.resolve(__dirname, '../../..', 'Front_End/Seller/js');
const sellerRootPath = path.resolve(__dirname, '../../..', 'Front_End/Seller');
const customerPagesPath = path.resolve(__dirname, '../../..');

const uploadsPath = path.resolve(__dirname, '../../..', 'uploads');

const staticOptions = isProduction ? { maxAge: '30d', immutable: true } : { maxAge: 0 };
const htmlStaticOptions = isProduction ? { maxAge: '1d' } : { maxAge: 0 };
const uploadsStaticOptions = isProduction ? { maxAge: '7d' } : { maxAge: 0 };

// Serve uploaded files publicly
app.use('/uploads', express.static(uploadsPath, uploadsStaticOptions));

// Serve JS files without auth guards (these are public assets)
app.use('/js', express.static(adminJsPath, staticOptions));
app.use('/js', express.static(sellerJsPath, staticOptions));

// Serve admin pages with auth guard
app.use('/admin-pages', adminPageGuard, express.static(adminPagesPath, htmlStaticOptions));

// Serve seller pages with auth guard
app.use('/seller-pages', sellerPageGuard, express.static(sellerPagesPath, htmlStaticOptions));
app.use('/Seller/pages', sellerPageGuard, express.static(sellerPagesPath, htmlStaticOptions));
app.use('/Seller/js', express.static(sellerJsPath, staticOptions));
app.use('/Front_End/Seller', sellerPageGuard, express.static(sellerRootPath, htmlStaticOptions));

// Serve customer pages
app.use('/customer-pages/Front_End/Seller', sellerPageGuard, express.static(sellerRootPath, htmlStaticOptions));
app.use('/customer-pages', express.static(customerPagesPath, htmlStaticOptions));

// Serve top-level customer pages directly (e.g. /login_register.html)
app.use('/', express.static(customerPagesPath, htmlStaticOptions));

// Root aliases for common customer auth pages
app.get('/login_register.html', (req, res) => {
  res.sendFile(path.resolve(customerPagesPath, 'login_register.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.resolve(customerPagesPath, 'login_register.html'));
});

app.get('/register.html', (req, res) => {
  res.sendFile(path.resolve(customerPagesPath, 'login_register.html'));
});

// Optional logo fallbacks to avoid noisy 404s when pages reference logo.png
app.get('/logo.png', (req, res) => {
  res.status(204).end();
});

app.get('/seller-pages/logo.png', (req, res) => {
  res.status(204).end();
});

app.get('/customer-pages/logo.png', (req, res) => {
  res.status(204).end();
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

async function startServer() {
  try {
    const dbInfo = await testConnection();
    console.log(`[Unified API] Database connected: ${dbInfo.db}`);
  } catch (error) {
    console.warn(`[Unified API] Database connection failed: ${error.message}`);
  }

  server.listen(PORT, () => {
    console.log(`[Unified API] Listening on port ${PORT}`);
  });
}

process.on('SIGINT', async () => {
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePool();
  process.exit(0);
});

startServer();