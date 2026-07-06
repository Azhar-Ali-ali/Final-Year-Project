const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const { query, testConnection, closePool } = require('../../database/postgresClient');
const { extractToken, getActiveSession } = require('../../shared/sessionStore');

const productsRoutes = require('./routes/productsRoutes');
const cartRoutes = require('./routes/cartRoutes');
const checkoutRoutes = require('./routes/checkoutRoutes');
const homepageRoutes = require('./routes/homepageRoutes');
const authRoutes = require('./routes/authRoutes');
const productDetailsRoutes = require('./routes/productDetailsRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const addressesRoutes = require('./routes/addressesRoutes');
const messagesRoutes = require('./routes/messagesRoutes');
const ordersRoutes = require('./routes/ordersRoutes');
const profileRoutes = require('./routes/profileRoutes');
const supportRoutes = require('./routes/supportRoutes');
const securityRoutes = require('./routes/securityRoutes');
const returnsRoutes = require('./routes/returnsRoutes');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';

app.use(cors({ origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN }));
app.use(express.json());
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

  // Keep compatibility with route handlers that read customer id from headers/query.
  req.headers['x-user-id'] = current.session.userId;
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
      message: 'Customer backend is running',
      database: {
        connected: true,
        name: dbInfo.db,
        serverTime: dbInfo.serverTime
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Customer backend is running but database is unavailable',
      database: {
        connected: false,
        error: error.message || error.code || 'Database connection failed'
      }
    });
  }
});

app.use('/api/products', productsRoutes);
app.use('/api/homepage', homepageRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/product-details', productDetailsRoutes);
app.use('/api/cart', authenticateRequest, requireRole('customer'), cartRoutes);
app.use('/api/checkout', authenticateRequest, requireRole('customer'), checkoutRoutes);
app.use('/api/wishlist', authenticateRequest, requireRole('customer'), wishlistRoutes);
app.use('/api/customer/dashboard', authenticateRequest, requireRole('customer'), dashboardRoutes);
app.use('/api/customer/addresses', authenticateRequest, requireRole('customer'), addressesRoutes);
app.use('/api/customer/messages', authenticateRequest, requireRole('customer'), messagesRoutes);
app.use('/api/customer/orders', authenticateRequest, requireRole('customer'), ordersRoutes);
app.use('/api/customer/profile', authenticateRequest, requireRole('customer'), profileRoutes);
app.use('/api/customer/support', authenticateRequest, requireRole('customer'), supportRoutes);
app.use('/api/customer/security', authenticateRequest, requireRole('customer'), securityRoutes);
app.use('/api/customer/returns', authenticateRequest, requireRole('customer'), returnsRoutes);

const customerPagesPath = path.resolve(__dirname, '../../../Front_End/Customer/pages');
app.use('/customer-pages', express.static(customerPagesPath));

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

async function startServer() {
  try {
    const dbInfo = await testConnection();
    console.log(`[Customer API] Database connected: ${dbInfo.db}`);
  } catch (error) {
    console.warn(`[Customer API] Database connection failed: ${error.message}`);
  }

  app.listen(PORT, () => {
    console.log(`Customer backend running on http://localhost:${PORT}`);
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
