const express = require('express');
const userManagementData = require('../data/userManagementData');

const router = express.Router();

function getAdminId(req) {
  return String(req.headers['x-admin-id'] || req.body?.admin || req.query.admin || 'ADM-001').trim();
}

function notFound(res, message = 'User not found') {
  return res.status(404).json({ success: false, message });
}

function getKycDocumentUrl(details, docType) {
  const docs = details?.documents || {};
  const key = String(docType || '').toLowerCase();

  if (key === 'cnicfront') return docs.cnicFrontUrl || '';
  if (key === 'cnicback') return docs.cnicBackUrl || '';
  if (key === 'selfie') return docs.selfieUrl || '';
  return '';
}

async function resolveUserId(req) {
  const provided = String(req.params.id || req.query.userId || req.body?.userId || '').trim();
  if (provided) {
    const match = await req.db.query('SELECT id FROM public.users WHERE id::text = $1 LIMIT 1', [provided]);
    if (match.rows.length) return match.rows[0].id;
    return null;
  }

  const fallback = await req.db.query('SELECT id FROM public.users ORDER BY created_at ASC LIMIT 1');
  return fallback.rows[0]?.id || null;
}

router.get('/', async (req, res) => {
  try {
    const users = await userManagementData.fetchUsers(req.db);
    res.json({ success: true, data: { users, total: users.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/overview', async (req, res) => {
  try {
    const stats = await userManagementData.getOverviewStats(req.db);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await userManagementData.fetchUsers(req.db);
    const result = userManagementData.filterUsers(users, req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    const user = await userManagementData.getUserById(req.db, userId);
    if (!user) return notFound(res);
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/users/:id/kyc', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    const details = await userManagementData.getSellerKycDetails(req.db, userId);
    res.json({ success: true, data: details });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/users/:id/kyc/document/:docType', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);

    const details = await userManagementData.getSellerKycDetails(req.db, userId);
    const docUrl = getKycDocumentUrl(details, req.params.docType);
    if (!docUrl) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    if (docUrl.startsWith('data:')) {
      const match = /^data:([^;]+);base64,(.+)$/i.exec(docUrl);
      if (!match) {
        return res.status(400).json({ success: false, message: 'Unsupported document format' });
      }

      const mimeType = match[1] || 'application/octet-stream';
      const buffer = Buffer.from(match[2], 'base64');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', 'inline');
      return res.send(buffer);
    }

    return res.redirect(docUrl);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/users/:id/status', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    const { status, reason = '', notes = '' } = req.body || {};
    if (!status || !['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Valid status required (active, suspended, banned)' });
    }
    const data = await userManagementData.updateStatus(req.db, userId, status, getAdminId(req), reason, notes);
    res.json({ success: true, data, message: `User status changed to ${status}` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/users/:id/role', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    const { role, notes = '' } = req.body || {};
    if (!role || !['customer', 'seller', 'admin', 'super_admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    const data = await userManagementData.updateRole(req.db, userId, role, getAdminId(req), notes);
    res.json({ success: true, data, message: `User role changed to ${role}` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    const { sendEmail = true } = req.body || {};
    const data = await userManagementData.resetPassword(req.db, userId, getAdminId(req), Boolean(sendEmail));
    res.json({ success: true, data, message: sendEmail ? 'Password reset email sent to user' : 'Password reset token generated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/users/:id/kyc/approve', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    const data = await userManagementData.approveKyc(req.db, userId, getAdminId(req), req.body?.notes || '');
    res.json({ success: true, data, message: 'KYC approved' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/users/:id/kyc/reject', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    const { reason, notes = '' } = req.body || {};
    const data = await userManagementData.rejectKyc(req.db, userId, reason, getAdminId(req), notes);
    res.json({ success: true, data, message: 'KYC rejected' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    const data = await userManagementData.updateUserInfo(req.db, userId, req.body || {}, getAdminId(req));
    res.json({ success: true, data, message: 'User information updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/users/:id/notes', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    if (req.body?.notes === undefined) {
      return res.status(400).json({ success: false, message: 'Notes field required' });
    }
    const data = await userManagementData.updateNotes(req.db, userId, req.body.notes, getAdminId(req));
    res.json({ success: true, data, message: 'Notes updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/users/:id/preferences', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    const data = await userManagementData.updatePreferences(req.db, userId, req.body || {});
    res.json({ success: true, data, message: 'User preferences updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/users/:id/two-factor', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    if (typeof req.body?.enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Enabled field must be boolean' });
    }
    const data = await userManagementData.toggleTwoFactor(req.db, userId, req.body.enabled, getAdminId(req));
    res.json({ success: true, data, message: `Two-factor authentication ${req.body.enabled ? 'enabled' : 'disabled'}` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/users/:id/verify-email', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    const data = await userManagementData.verifyEmail(req.db, userId, getAdminId(req));
    res.json({ success: true, data, message: 'Email verified' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/users/:id/verify-phone', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    const data = await userManagementData.verifyPhone(req.db, userId, getAdminId(req));
    res.json({ success: true, data, message: 'Phone verified' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/users/bulk/activate', async (req, res) => {
  try {
    const { userIds } = req.body || {};
    if (!Array.isArray(userIds) || !userIds.length) {
      return res.status(400).json({ success: false, message: 'User IDs array required' });
    }
    const data = await userManagementData.bulkUpdateStatus(req.db, userIds, 'active', getAdminId(req), 'Bulk activation');
    res.json({ success: true, data, message: `${data.completed.length} users activated, ${data.failed.length} failed` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/users/bulk/suspend', async (req, res) => {
  try {
    const { userIds, reason = 'Bulk suspension' } = req.body || {};
    if (!Array.isArray(userIds) || !userIds.length) {
      return res.status(400).json({ success: false, message: 'User IDs array required' });
    }
    const data = await userManagementData.bulkUpdateStatus(req.db, userIds, 'suspended', getAdminId(req), reason);
    res.json({ success: true, data, message: `${data.completed.length} users suspended, ${data.failed.length} failed` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/users/bulk/ban', async (req, res) => {
  try {
    const { userIds, reason = 'Bulk ban' } = req.body || {};
    if (!Array.isArray(userIds) || !userIds.length) {
      return res.status(400).json({ success: false, message: 'User IDs array required' });
    }
    const data = await userManagementData.bulkUpdateStatus(req.db, userIds, 'banned', getAdminId(req), reason);
    res.json({ success: true, data, message: `${data.completed.length} users banned, ${data.failed.length} failed` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/users/:id/activity', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return notFound(res);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 100));
    const data = await userManagementData.getActivity(req.db, userId, limit);
    res.json({ success: true, data, total: data.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/audit-log', async (req, res) => {
  try {
    const data = await userManagementData.getAuditLog(req.db, req.query || {});
    res.json({ success: true, data, total: data.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
