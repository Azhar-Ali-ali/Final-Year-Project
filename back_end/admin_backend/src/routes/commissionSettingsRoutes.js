const express = require('express');
const settingsData = require('../data/commissionSettingsData');

const router = express.Router();

function getAdminId(req) {
  return String(req.headers['x-admin-id'] || req.headers['x-user-id'] || '').trim() || null;
}

async function getAdminName(req) {
  const adminId = getAdminId(req);
  if (!adminId) return null;
  try {
    const result = await req.db.query('SELECT full_name FROM public.users WHERE id = $1 LIMIT 1', [adminId]);
    return result.rows[0]?.full_name || null;
  } catch (error) {
    return null;
  }
}

router.get('/', async (req, res) => {
  try {
    const [settings, history] = await Promise.all([
      settingsData.getCommissionSettings(req.db),
      settingsData.getCommissionHistory(req.db, 20)
    ]);
    return res.json({ success: true, data: { settings, history } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load commission settings', error: error.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const adminName = await getAdminName(req);
    const settings = await settingsData.updateCommissionSettings(req.db, req.body || {}, adminId, adminName);
    const history = await settingsData.getCommissionHistory(req.db, 20);
    return res.json({ success: true, message: 'Commission settings updated successfully', data: { settings, history } });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Failed to update commission settings', error: error.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    const history = await settingsData.getCommissionHistory(req.db, 50);
    return res.json({ success: true, data: { history } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load commission history', error: error.message });
  }
});

module.exports = router;
