/**
 * Auth Data Module
 * Mock authentication and registration logic for login_register.html flows.
 */

const crypto = require('crypto');

const users = [
  {
    id: 'user_1',
    role: 'customer',
    fullName: 'Ahmed Khan',
    email: 'ahmed@example.com',
    phone: '03001234567',
    password: 'Password123',
    createdAt: new Date('2026-01-10T10:00:00.000Z').toISOString(),
    isActive: true
  },
  {
    id: 'seller_1',
    role: 'seller',
    fullName: 'Hira Malik',
    email: 'seller@example.com',
    phone: '03111234567',
    password: 'Password123',
    createdAt: new Date('2026-01-15T12:00:00.000Z').toISOString(),
    isActive: true,
    sellerProfile: {
      storeName: 'Hira Beauty Hub',
      storeDescription: 'Original beauty products with fast local shipping and premium customer care across Pakistan.',
      storeCategory: 'beauty',
      city: 'Lahore',
      address: 'Shop 21, Main Boulevard, Gulberg',
      postalCode: '54000',
      bankInfo: {
        bankName: 'HBL',
        accountTitle: 'Hira Malik',
        accountNumber: '0012345678901',
        iban: 'PK36HABB0000000012345678901'
      },
      isVerified: false,
      verificationStatus: 'pending',
      verificationSubmittedAt: new Date('2026-01-15T12:00:00.000Z').toISOString()
    }
  }
];

const sessions = {};
const passwordResetTokens = {};
let userCounter = 2;
let sellerCounter = 2;

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isPakPhone(value) {
  return /^03\d{9}$/.test(String(value || '').trim());
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeUser(user) {
  const safeUser = {
    id: user.id,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt,
    isActive: user.isActive
  };

  if (user.role === 'seller' && user.sellerProfile) {
    safeUser.sellerProfile = {
      storeName: user.sellerProfile.storeName,
      storeCategory: user.sellerProfile.storeCategory,
      city: user.sellerProfile.city,
      isVerified: user.sellerProfile.isVerified,
      verificationStatus: user.sellerProfile.verificationStatus,
      verificationSubmittedAt: user.sellerProfile.verificationSubmittedAt
    };
  }

  return safeUser;
}

function findUserByIdentifier(identifier, role) {
  const normalized = normalizeIdentifier(identifier);

  return users.find((user) => {
    if (role && user.role !== role) {
      return false;
    }

    const emailMatch = user.email && user.email.toLowerCase() === normalized;
    const phoneMatch = user.phone && user.phone === identifier;
    return emailMatch || phoneMatch;
  });
}

function createSession(user) {
  const token = `lum_${crypto.randomBytes(16).toString('hex')}`;
  sessions[token] = {
    userId: user.id,
    role: user.role,
    createdAt: new Date().toISOString()
  };
  return token;
}

function getUserById(userId) {
  return users.find((u) => u.id === userId);
}

function validatePassword(password) {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  return null;
}

function validateCustomerRegistration(payload = {}) {
  const fullName = String(payload.fullName || '').trim();
  const emailPhone = String(payload.emailPhone || '').trim();
  const password = String(payload.password || '');
  const confirmPassword = String(payload.confirmPassword || '');

  if (!fullName) return 'Full name is required';
  if (!emailPhone) return 'Email or phone is required';

  const passwordError = validatePassword(password);
  if (passwordError) return passwordError;
  if (password !== confirmPassword) return 'Passwords do not match';

  const isEmailValue = isEmail(emailPhone);
  const isPhoneValue = isPakPhone(emailPhone);
  if (!isEmailValue && !isPhoneValue) {
    return 'Please enter a valid email or Pakistani phone number (03XXXXXXXXX)';
  }

  const existing = findUserByIdentifier(emailPhone);
  if (existing) return 'An account with this email/phone already exists';

  return null;
}

function registerCustomer(payload = {}) {
  const validationError = validateCustomerRegistration(payload);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const identifier = String(payload.emailPhone).trim();
  const nowIso = new Date().toISOString();
  const user = {
    id: `user_${userCounter++}`,
    role: 'customer',
    fullName: String(payload.fullName).trim(),
    email: isEmail(identifier) ? identifier.toLowerCase() : null,
    phone: isPakPhone(identifier) ? identifier : null,
    password: String(payload.password),
    createdAt: nowIso,
    isActive: true
  };

  users.push(user);
  const token = createSession(user);

  return {
    success: true,
    message: 'Customer account created successfully',
    user: sanitizeUser(user),
    token
  };
}

function validateSellerRegistration(payload = {}) {
  const requiredFields = [
    ['fullName', 'Full name is required'],
    ['email', 'Email is required'],
    ['phone', 'Phone is required'],
    ['password', 'Password is required'],
    ['confirmPassword', 'Confirm password is required'],
    ['storeName', 'Store name is required'],
    ['storeDescription', 'Store description is required'],
    ['storeCategory', 'Store category is required'],
    ['city', 'City is required'],
    ['address', 'Address is required']
  ];

  for (const [field, message] of requiredFields) {
    if (!String(payload[field] || '').trim()) {
      return message;
    }
  }

  if (!isEmail(payload.email)) return 'Please enter a valid email address';
  if (!isPakPhone(payload.phone)) return 'Please enter a valid Pakistani phone number (03XXXXXXXXX)';

  const passwordError = validatePassword(String(payload.password || ''));
  if (passwordError) return passwordError;
  if (String(payload.password) !== String(payload.confirmPassword)) {
    return 'Passwords do not match';
  }

  if (String(payload.storeDescription).trim().length < 50) {
    return 'Store description must be at least 50 characters long';
  }

  if (!payload.agreeTerms || !payload.agreePrivacy || !payload.agreeCommission) {
    return 'All seller terms must be accepted';
  }

  if (findUserByIdentifier(payload.email)) {
    return 'An account with this email already exists';
  }
  if (findUserByIdentifier(payload.phone)) {
    return 'An account with this phone already exists';
  }

  return null;
}

function registerSeller(payload = {}) {
  const validationError = validateSellerRegistration(payload);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const nowIso = new Date().toISOString();
  const user = {
    id: `seller_${sellerCounter++}`,
    role: 'seller',
    fullName: String(payload.fullName).trim(),
    email: String(payload.email).trim().toLowerCase(),
    phone: String(payload.phone).trim(),
    password: String(payload.password),
    createdAt: nowIso,
    isActive: true,
    sellerProfile: {
      storeName: String(payload.storeName).trim(),
      storeDescription: String(payload.storeDescription).trim(),
      storeCategory: String(payload.storeCategory).trim(),
      city: String(payload.city).trim(),
      address: String(payload.address).trim(),
      postalCode: String(payload.postalCode || '').trim() || null,
      bankInfo: {
        bankName: String(payload.bankName || '').trim() || null,
        accountTitle: String(payload.accountTitle || '').trim() || null,
        accountNumber: String(payload.accountNumber || '').trim() || null,
        iban: String(payload.iban || '').trim() || null
      },
      isVerified: false,
      verificationStatus: 'pending',
      verificationSubmittedAt: nowIso
    }
  };

  users.push(user);
  const token = createSession(user);

  return {
    success: true,
    message: 'Seller account created successfully. Verification is pending.',
    user: sanitizeUser(user),
    token
  };
}

function login(payload = {}) {
  const identifier = String(payload.identifier || '').trim();
  const password = String(payload.password || '');
  const role = payload.role ? String(payload.role).trim().toLowerCase() : null;

  if (!identifier || !password) {
    return { success: false, error: 'Identifier and password are required' };
  }

  if (role && !['customer', 'seller'].includes(role)) {
    return { success: false, error: 'Role must be customer or seller' };
  }

  const user = findUserByIdentifier(identifier, role);

  if (!user || user.password !== password) {
    return { success: false, error: 'Invalid credentials' };
  }

  if (!user.isActive) {
    return { success: false, error: 'This account is currently inactive' };
  }

  const token = createSession(user);

  return {
    success: true,
    message: 'Login successful',
    user: sanitizeUser(user),
    token,
    redirectTo: user.role === 'seller' ? 'Front_End/Seller/index.html' : 'homepage.html'
  };
}

function logout(token) {
  if (token && sessions[token]) {
    delete sessions[token];
    return true;
  }
  return false;
}

function getCurrentSession(token) {
  if (!token || !sessions[token]) {
    return null;
  }

  const session = sessions[token];
  const user = getUserById(session.userId);
  if (!user) {
    delete sessions[token];
    return null;
  }

  return {
    token,
    session,
    user: sanitizeUser(user)
  };
}

function checkIdentifierAvailability(identifier) {
  const value = String(identifier || '').trim();
  if (!value) {
    return { available: false, message: 'Identifier is required' };
  }

  const existing = findUserByIdentifier(value);
  return {
    available: !existing,
    message: existing ? 'Identifier is already in use' : 'Identifier is available'
  };
}

function getDemoAccounts() {
  return users.map((user) => ({
    role: user.role,
    identifier: user.email || user.phone,
    password: user.password,
    displayName: user.fullName,
    sellerStatus: user.sellerProfile ? user.sellerProfile.verificationStatus : null
  }));
}

function requestPasswordReset(identifier, role) {
  const normalizedEmail = normalizeIdentifier(identifier);
  const user = users.find((entry) => {
    if (role && entry.role !== role) return false;
    return entry.email && entry.email.toLowerCase() === normalizedEmail;
  });

  if (!user) {
    return { success: false, error: 'No account found with that email' };
  }

  const token = `rst_${crypto.randomBytes(16).toString('hex')}`;
  passwordResetTokens[token] = {
    userId: user.id,
    expiresAt: Date.now() + 15 * 60 * 1000,
    used: false
  };

  return {
    success: true,
    user,
    token,
    resetUrl: `http://localhost:5000/reset-password.html?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email || '')}&role=${encodeURIComponent(user.role)}`
  };
}

function resetPasswordWithToken(token, password, confirmPassword) {
  if (!token) {
    return { success: false, error: 'Token is required' };
  }

  if (!password || password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long' };
  }

  if (password !== confirmPassword) {
    return { success: false, error: 'Passwords do not match' };
  }

  const record = passwordResetTokens[token];
  if (!record || record.used || record.expiresAt <= Date.now()) {
    return { success: false, error: 'Reset link is invalid or expired' };
  }

  const user = getUserById(record.userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  user.password = String(password);
  record.used = true;

  return { success: true };
}

module.exports = {
  registerCustomer,
  registerSeller,
  login,
  logout,
  getCurrentSession,
  checkIdentifierAvailability,
  getDemoAccounts,
  requestPasswordReset,
  resetPasswordWithToken
};
