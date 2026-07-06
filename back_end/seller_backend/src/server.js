const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { query, testConnection, closePool } = require('../../database/postgresClient');
const { extractToken, getActiveSession } = require('../../shared/sessionStore');

const dashboardRoutes = require('./routes/dashboardRoutes');
const disputeRoutes = require('./routes/disputeRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const messagesRoutes = require('./routes/messagesRoutes');
const orderRoutes = require('./routes/orderRoutes');
const paymentsRoutes = require('./routes/paymentsRoutes');
const productManagementRoutes = require('./routes/productManagementRoutes');
const refundsReturnsRoutes = require('./routes/refundsReturnsRoutes');
const sellerPerformanceRoutes = require('./routes/sellerPerformanceRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const returnsDbRoutes = require('./routes/returnsDbRoutes');
const homepageRoutes = require('../../customer_backend/src/routes/homepageRoutes');
const productsRoutes = require('../../customer_backend/src/routes/productsRoutes');
const productDetailsRoutes = require('../../customer_backend/src/routes/productDetailsRoutes');
const customerDashboardRoutes = require('../../customer_backend/src/routes/dashboardRoutes');
const customerProfileRoutes = require('../../customer_backend/src/routes/profileRoutes');
const customerOrdersRoutes = require('../../customer_backend/src/routes/ordersRoutes');
const customerAddressesRoutes = require('../../customer_backend/src/routes/addressesRoutes');
const customerMessagesRoutes = require('../../customer_backend/src/routes/messagesRoutes');
const customerReturnsRoutes = require('../../customer_backend/src/routes/returnsRoutes');
const customerSecurityRoutes = require('../../customer_backend/src/routes/securityRoutes');
const customerSupportRoutes = require('../../customer_backend/src/routes/supportRoutes');
const customerSellerProfileRoutes = require('../../customer_backend/src/routes/sellerProfileRoutes');
const cartRoutes = require('../../customer_backend/src/routes/cartRoutes');
const authRoutes = require('../../customer_backend/src/routes/authRoutes');
const wishlistRoutes = require('../../customer_backend/src/routes/wishlistRoutes');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';

app.use(cors({ origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(morgan('dev'));

app.locals.db = { query };

app.use((req, res, next) => {
  req.db = app.locals.db;
  next();
});

function authenticateRequest(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const current = getActiveSession(token);
  if (!current) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }

  req.auth = {
    token,
    user: current.user,
    session: current.session
  };

  // Keep compatibility with existing seller routes.
  req.headers['x-user-id'] = current.session.userId;
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

app.get('/api/health', async (req, res) => {
  try {
    const dbInfo = await testConnection();
    res.json({
      success: true,
      message: 'Seller backend is running',
      database: {
        connected: true,
        name: dbInfo.db,
        serverTime: dbInfo.serverTime
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Seller backend is running but database is unavailable',
      database: {
        connected: false,
        error: error.message || error.code || 'Database connection failed'
      }
    });
  }
});

app.use('/api/seller/dashboard', authenticateRequest, requireRole('seller'), dashboardRoutes);
app.use('/api/seller/disputes', authenticateRequest, requireRole('seller'), disputeRoutes);
app.use('/api/seller/inventory', authenticateRequest, requireRole('seller'), inventoryRoutes);
app.use('/api/seller/messages', authenticateRequest, requireRole('seller'), messagesRoutes);
app.use('/api/seller/orders', authenticateRequest, requireRole('seller'), orderRoutes);
app.use('/api/seller/payments', authenticateRequest, requireRole('seller'), paymentsRoutes);
app.use('/api/seller/products', authenticateRequest, requireRole('seller'), productManagementRoutes);
app.use('/api/seller/refunds-returns', authenticateRequest, requireRole('seller'), refundsReturnsRoutes);
app.use('/api/seller/performance', authenticateRequest, requireRole('seller'), sellerPerformanceRoutes);
app.use('/api/seller/settings', authenticateRequest, requireRole('seller'), settingsRoutes);
app.use('/api/seller/returns', authenticateRequest, requireRole('seller'), returnsDbRoutes);
app.use('/api/homepage', homepageRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/product-details', productDetailsRoutes);
app.use('/api/customer/dashboard', customerDashboardRoutes);
app.use('/api/customer/profile', customerProfileRoutes);
app.use('/api/customer/orders', customerOrdersRoutes);
app.use('/api/customer/addresses', customerAddressesRoutes);
app.use('/api/customer/messages', customerMessagesRoutes);
app.use('/api/customer/returns', customerReturnsRoutes);
app.use('/api/customer/security', customerSecurityRoutes);
app.use('/api/customer/support', customerSupportRoutes);
app.use('/api/customer/sellers', customerSellerProfileRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/wishlist', wishlistRoutes);

const projectRootPath = path.resolve(__dirname, '../../..');
app.use(express.static(projectRootPath));

const uploadsPath = path.join(projectRootPath, 'uploads');
const defaultProductImagePath = path.join(uploadsPath, 'products', 'default-product.svg');

app.use('/uploads', express.static(uploadsPath));
app.use('/uploads', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  const requestPath = String(req.path || '');
  if (!requestPath.startsWith('/products/')) {
    return next();
  }

  if (fs.existsSync(defaultProductImagePath)) {
    return res.sendFile(defaultProductImagePath);
  }

  return next();
});

const sellerPagesPath = path.resolve(__dirname, '../../..', 'Front_End/Seller/pages');
app.use('/seller-pages', express.static(sellerPagesPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(projectRootPath, 'homepage.html'));
});

app.get('/Front_End/homepage.html', (req, res) => {
  res.sendFile(path.join(projectRootPath, 'homepage.html'));
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

async function startServer() {
  try {
    const dbInfo = await testConnection();
    console.log(`[Seller API] Database connected: ${dbInfo.db}`);
  } catch (error) {
    console.warn(`[Seller API] Database connection failed: ${error.message}`);
  }

  app.listen(PORT, () => {
    console.log(`Seller backend running on http://localhost:${PORT}`);
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
