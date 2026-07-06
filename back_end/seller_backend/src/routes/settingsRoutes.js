const express = require('express');
const settingsData = require('../data/settingsData');

const router = express.Router();

function getSellerId(req) {
  const raw = req.auth?.session?.userId || req.headers['x-seller-id'] || '';
  return String(raw).trim();
}

async function resolveSellerId(req) {
  const sellerId = getSellerId(req);
  return sellerId || null;
}

function notFound(res, message = 'Seller not found') {
  return res.status(404).json({ success: false, message });
}

router.get('/', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.getSettingsOverview(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch settings overview', error: error.message });
  }
});

router.get('/profile', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.getProfile(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch profile', error: error.message });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.updateProfile(req.db, sellerId, req.body || {});
    return res.json({ success: true, message: 'Profile updated successfully', data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to update profile', error: error.message });
  }
});

router.get('/security', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.getSecuritySettings(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch security settings', error: error.message });
  }
});

router.post('/security/change-email', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const { currentEmail, newEmail } = req.body || {};
    if (!currentEmail || !newEmail) {
      return res.status(400).json({ success: false, message: 'Current email and new email are required' });
    }
    const data = await settingsData.changeEmail(req.db, sellerId, currentEmail, newEmail);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to change email', error: error.message });
  }
});

router.post('/security/change-password', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }
    const data = await settingsData.changePassword(req.db, sellerId, currentPassword, newPassword);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to change password', error: error.message });
  }
});

router.post('/security/2fa', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'enabled field must be a boolean' });
    }
    const data = await settingsData.toggle2FA(req.db, sellerId, enabled);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to toggle 2FA', error: error.message });
  }
});

router.get('/security/sessions', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.getLoginSessions(req.db, sellerId);
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch login sessions', error: error.message });
  }
});

router.delete('/security/sessions/:sessionId', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.revokeSession(req.db, sellerId, req.params.sessionId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(404).json({ success: false, message: 'Failed to revoke session', error: error.message });
  }
});

router.get('/store', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.getStoreSettings(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch store settings', error: error.message });
  }
});

router.put('/store', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.updateStoreSettings(req.db, sellerId, req.body || {});
    return res.json({ success: true, message: 'Store settings updated successfully', data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to update store settings', error: error.message });
  }
});

router.post('/store/logo', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.uploadStoreLogo(req.db, sellerId, req.body || {});
    return res.json({ success: true, message: 'Logo uploaded successfully', data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to upload logo', error: error.message });
  }
});

router.post('/store/banner', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.uploadStoreBanner(req.db, sellerId, req.body || {});
    return res.json({ success: true, message: 'Banner uploaded successfully', data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to upload banner', error: error.message });
  }
});

router.delete('/store/logo', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.removeStoreLogo(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to remove logo', error: error.message });
  }
});

router.delete('/store/banner', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.removeStoreBanner(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to remove banner', error: error.message });
  }
});

router.get('/store/categories', async (req, res) => {
  try {
    const data = await settingsData.getBusinessCategories(req.db);
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch categories', error: error.message });
  }
});

router.get('/payment', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.getPaymentSettings(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch payment settings', error: error.message });
  }
});

router.get('/payment/bank-account', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.getBankAccountDetails(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch bank account details', error: error.message });
  }
});

router.post('/payment/bank-account', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.saveBankAccountDetails(req.db, sellerId, req.body || {});
    return res.json({ success: true, message: 'Bank account details saved successfully', data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to save bank account details', error: error.message });
  }
});

router.put('/payment', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.updatePaymentSettings(req.db, sellerId, req.body || {});
    return res.json({ success: true, message: 'Payment settings updated successfully', data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to update payment settings', error: error.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.getNotificationPreferences(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch notification preferences', error: error.message });
  }
});

router.put('/notifications', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.updateNotificationPreferences(req.db, sellerId, req.body || {});
    return res.json({ success: true, message: 'Notification preferences updated successfully', data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to update notification preferences', error: error.message });
  }
});

router.get('/privacy', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.getPrivacySettings(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch privacy settings', error: error.message });
  }
});

router.put('/privacy', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.updatePrivacySettings(req.db, sellerId, req.body || {});
    return res.json({ success: true, message: 'Privacy settings updated successfully', data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to update privacy settings', error: error.message });
  }
});

router.post('/privacy/download-data', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.requestDataDownload(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to request data download', error: error.message });
  }
});

router.post('/privacy/delete-account', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const { reason } = req.body || {};
    const data = await settingsData.requestAccountDeletion(req.db, sellerId, reason);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to request account deletion', error: error.message });
  }
});

router.get('/verification', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.getVerificationStatus(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch verification status', error: error.message });
  }
});

router.post('/verification/upload', async (req, res) => {
  return res.status(400).json({
    success: false,
    message: 'Direct upload is disabled. Documents are saved only when Submit Verification is clicked.'
  });
});

router.post('/verification/submit', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const { pendingDocuments } = req.body || {};
    const data = await settingsData.submitVerification(req.db, sellerId, pendingDocuments || {});
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to submit verification', error: error.message });
  }
});

router.delete('/verification/documents', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.clearVerificationDocuments(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to clear documents', error: error.message });
  }
});

router.get('/integrations', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.getIntegrations(req.db, sellerId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch integrations', error: error.message });
  }
});

router.post('/integrations/:platform/connect', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.connectIntegration(req.db, sellerId, req.params.platform, req.body || {});
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to connect integration', error: error.message });
  }
});

router.post('/integrations/:platform/disconnect', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return notFound(res);
    const data = await settingsData.disconnectIntegration(req.db, sellerId, req.params.platform);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to disconnect integration', error: error.message });
  }
});

module.exports = router;
