const express = require('express');
const {
  getOverview,
  getRevenueTrend,
  getTopCategories,
  getSalesRows,
  getOrdersRows,
  getUsersAnalytics,
  getProductsPerformance,
  getCustomReports,
  createCustomReport,
  runCustomReport,
  createSchedule,
  getAuditLog,
  logAudit
} = require('../data/reportsAnalyticsData');

const router = express.Router();

function adminId(req) {
  return String(req.headers['x-admin-id'] || req.body?.adminId || req.query?.adminId || '').trim() || null;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const raw = v === null || v === undefined ? '' : String(v);
    if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
    return raw;
  };
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((h) => esc(row[h])).join(','));
  });
  return lines.join('\n');
}

router.get('/overview', async (req, res) => {
  try {
    const [summary, trend, categories] = await Promise.all([
      getOverview(req.db, req.query || {}),
      getRevenueTrend(req.db, req.query || {}),
      getTopCategories(req.db, req.query || {})
    ]);

    return res.json({ success: true, data: { summary, trend, categories } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load overview', error: error.message });
  }
});

router.get('/sales', async (req, res) => {
  try {
    const rows = await getSalesRows(req.db, req.query || {});
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load sales report', error: error.message });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const rows = await getOrdersRows(req.db, req.query || {});
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load orders report', error: error.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const data = await getUsersAnalytics(req.db, req.query || {});
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load user analytics', error: error.message });
  }
});

router.get('/products', async (req, res) => {
  try {
    const rows = await getProductsPerformance(req.db, req.query || {});
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load product performance', error: error.message });
  }
});

router.get('/custom', async (req, res) => {
  try {
    const rows = await getCustomReports(req.db);
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load custom reports', error: error.message });
  }
});

router.post('/custom', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, error: 'Report name is required' });

    const report = await createCustomReport(req.db, {
      name,
      description: req.body?.description || '',
      config: req.body?.config || {},
      adminId: adminId(req)
    });

    await logAudit(req.db, {
      action: 'create_custom_report',
      entityType: 'report',
      entityId: report.id,
      adminId: adminId(req),
      notes: `Created ${report.name}`
    });

    return res.status(201).json({ success: true, data: report, message: 'Custom report created successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create custom report', error: error.message });
  }
});

router.post('/custom/:id/run', async (req, res) => {
  try {
    const report = await runCustomReport(req.db, req.params.id);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    await logAudit(req.db, {
      action: 'run_custom_report',
      entityType: 'report',
      entityId: report.id,
      adminId: adminId(req),
      notes: `Executed ${report.name}`
    });

    return res.json({ success: true, data: report, message: 'Report executed successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to run custom report', error: error.message });
  }
});

router.post('/schedules', async (req, res) => {
  try {
    const reportType = String(req.body?.reportType || '').trim();
    const frequency = String(req.body?.frequency || '').trim();
    const recipientsRaw = String(req.body?.recipients || '').trim();
    const recipients = recipientsRaw ? recipientsRaw.split(',').map((x) => x.trim()).filter(Boolean) : [];

    if (!reportType || !frequency || !recipients.length) {
      return res.status(400).json({ success: false, error: 'Report type, frequency, and recipients are required' });
    }

    const schedule = await createSchedule(req.db, {
      reportType,
      frequency,
      recipients,
      active: req.body?.active !== false,
      adminId: adminId(req)
    });

    await logAudit(req.db, {
      action: 'create_schedule',
      entityType: 'schedule',
      entityId: schedule.id,
      adminId: adminId(req),
      notes: `${schedule.reportType} - ${schedule.frequency}`
    });

    return res.status(201).json({ success: true, data: schedule, message: 'Report schedule created successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create schedule', error: error.message });
  }
});

router.post('/export', async (req, res) => {
  try {
    const reportType = String(req.body?.reportType || '').trim();
    const format = String(req.body?.format || 'csv').trim().toLowerCase();
    if (!reportType) return res.status(400).json({ success: false, error: 'Report type is required' });

    await logAudit(req.db, {
      action: 'export_report',
      entityType: 'report',
      entityId: null,
      adminId: adminId(req),
      notes: `${reportType} in ${format}`
    });

    return res.json({
      success: true,
      data: {
        reportType,
        format,
        downloadUrl: `/api/admin/reports/download?reportType=${encodeURIComponent(reportType)}&format=${encodeURIComponent(format)}`,
        generatedAt: new Date().toISOString()
      },
      message: `Report export prepared in ${format.toUpperCase()} format`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to export report', error: error.message });
  }
});

router.get('/download', async (req, res) => {
  try {
    const reportType = String(req.query.reportType || '').trim();
    const format = String(req.query.format || 'csv').trim().toLowerCase();
    const period = String(req.query.period || 'month').trim();
    if (!reportType) return res.status(400).json({ success: false, error: 'reportType is required' });
    if (format !== 'csv') return res.status(400).json({ success: false, error: 'Only CSV download is currently supported' });

    let rows = [];
    if (reportType === 'sales') {
      rows = await getSalesRows(req.db, { period, region: req.query.region || '', search: req.query.search || '' });
    } else if (reportType === 'orders') {
      rows = await getOrdersRows(req.db, {
        period,
        status: req.query.status || '',
        payment: req.query.payment || '',
        search: req.query.search || ''
      });
    } else if (reportType === 'users') {
      const users = await getUsersAnalytics(req.db, { period, role: req.query.role || '' });
      rows = users.growth || [];
    } else if (reportType === 'products') {
      rows = await getProductsPerformance(req.db, { category: req.query.category || '', search: req.query.search || '' });
    } else {
      return res.status(400).json({ success: false, error: 'Unsupported report type' });
    }

    await logAudit(req.db, {
      action: 'download_report',
      entityType: 'report',
      entityId: null,
      adminId: adminId(req),
      notes: `${reportType} CSV download`
    });

    const csv = toCsv(rows);
    const fileName = `${reportType}_report_${new Date().toISOString().slice(0, 10)}.csv`;
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to download report', error: error.message });
  }
});

router.get('/audit-log', async (req, res) => {
  try {
    const result = await getAuditLog(req.db, req.query || {});
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load audit log', error: error.message });
  }
});

module.exports = router;
