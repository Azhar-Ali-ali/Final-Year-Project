// Seller Refunds and Returns Routes

const express = require('express');
const router = express.Router();
const {
  VALID_STATUSES,
  getOverview,
  filterReturns,
  getReturnById,
  updateReturnStatus,
  approveReturn,
  rejectReturn,
  completeReturn,
  calculateRefund,
  getMeta
} = require('../data/refundsReturnsData');

// GET /api/seller/refunds-returns/overview
router.get('/overview', (req, res) => {
  try {
    res.status(200).json({ success: true, data: getOverview() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch refunds overview', error: error.message });
  }
});

// GET /api/seller/refunds-returns/meta
router.get('/meta', (req, res) => {
  try {
    res.status(200).json({ success: true, data: getMeta() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch refunds metadata', error: error.message });
  }
});

// GET /api/seller/refunds-returns/requests
router.get('/requests', (req, res) => {
  try {
    const { search, status, page, pageSize } = req.query;

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status filter' });
    }

    const result = filterReturns({ search, status, page, pageSize });
    res.status(200).json({ success: true, data: result.returns, pagination: result.pagination });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch return requests', error: error.message });
  }
});

// GET /api/seller/refunds-returns/requests/:returnId
router.get('/requests/:returnId', (req, res) => {
  try {
    const data = getReturnById(req.params.returnId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Return request not found' });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch return details', error: error.message });
  }
});

// PUT /api/seller/refunds-returns/requests/:returnId/status
router.put('/requests/:returnId/status', (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required' });
    }

    const result = updateReturnStatus(req.params.returnId, status, notes || '');
    if (!result) {
      return res.status(404).json({ success: false, message: 'Return request not found' });
    }
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    res.status(200).json({
      success: true,
      message: 'Return status updated successfully',
      oldStatus: result.oldStatus,
      newStatus: result.newStatus,
      data: result.data
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update return status', error: error.message });
  }
});

// POST /api/seller/refunds-returns/requests/:returnId/approve
router.post('/requests/:returnId/approve', (req, res) => {
  try {
    const result = approveReturn(req.params.returnId, req.body.notes || '');
    if (!result) {
      return res.status(404).json({ success: false, message: 'Return request not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Return approved successfully',
      oldStatus: result.oldStatus,
      newStatus: result.newStatus,
      data: result.data
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to approve return', error: error.message });
  }
});

// POST /api/seller/refunds-returns/requests/:returnId/reject
router.post('/requests/:returnId/reject', (req, res) => {
  try {
    const result = rejectReturn(req.params.returnId, req.body.notes || '');
    if (!result) {
      return res.status(404).json({ success: false, message: 'Return request not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Return rejected successfully',
      oldStatus: result.oldStatus,
      newStatus: result.newStatus,
      data: result.data
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to reject return', error: error.message });
  }
});

// POST /api/seller/refunds-returns/requests/:returnId/complete
router.post('/requests/:returnId/complete', (req, res) => {
  try {
    const result = completeReturn(req.params.returnId, req.body.notes || '');
    if (!result) {
      return res.status(404).json({ success: false, message: 'Return request not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Return marked as completed',
      oldStatus: result.oldStatus,
      newStatus: result.newStatus,
      data: result.data
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to complete return', error: error.message });
  }
});

// POST /api/seller/refunds-returns/calculate
router.post('/calculate', (req, res) => {
  try {
    const data = calculateRefund(req.body || {});
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to calculate refund', error: error.message });
  }
});

module.exports = router;
