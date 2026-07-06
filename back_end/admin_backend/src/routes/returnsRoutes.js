const express = require('express');

const router = express.Router();

function getAdminId(req) {
  const raw = req.headers['x-admin-id'] || req.query.adminId || req.body.adminId || 1;
  return Number(raw);
}

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'refunded'];

router.get('/requests', async (req, res) => {
  const status = req.query.status;
  const search = String(req.query.search || '').trim();

  if (status && status !== 'all' && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status filter' });
  }

  try {
    const where = ['1=1'];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      where.push(`rr.status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`(rr.return_code ILIKE $${params.length} OR o.order_number ILIKE $${params.length} OR p.name ILIKE $${params.length} OR cu.full_name ILIKE $${params.length})`);
    }

    const sql = `
      SELECT
        rr.id,
        rr.return_code AS "returnRequestId",
        rr.status,
        rr.selected_reason AS "selectedReason",
        rr.customer_description AS "customerDescription",
        rr.seller_message AS "sellerMessage",
        rr.seller_decision AS "sellerDecision",
        rr.courier_name AS "courierName",
        rr.pickup_schedule AS "pickupSchedule",
        rr.return_address AS "returnAddress",
        rr.refund_amount AS "refundAmount",
        rr.refund_method AS "refundMethod",
        rr.transaction_id AS "transactionId",
        rr.refund_step AS "refundStep",
        rr.requested_at AS "requestDate",
        rr.approved_at AS "approvedAt",
        rr.completed_at AS "completedAt",
        o.order_number AS "orderId",
        p.name AS "productName",
        oi.quantity,
        oi.total_amount AS "lineTotal",
        cu.id AS "customerId",
        cu.full_name AS "customerName",
        su.id AS "sellerId",
        su.full_name AS "sellerName",
        sp.store_name AS "storeName"
      FROM lumina.return_requests rr
      JOIN lumina.order_items oi ON oi.id = rr.order_item_id
      JOIN lumina.orders o ON o.id = oi.order_id
      LEFT JOIN lumina.products p ON p.id = oi.product_id
      JOIN lumina.users cu ON cu.id = rr.customer_id
      JOIN lumina.users su ON su.id = oi.seller_id
      LEFT JOIN lumina.seller_profiles sp ON sp.user_id = oi.seller_id
      WHERE ${where.join(' AND ')}
      ORDER BY rr.requested_at DESC
    `;

    const result = await req.db.query(sql, params);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch return requests', error: error.message });
  }
});

router.patch('/requests/:returnRequestId/status', async (req, res) => {
  const adminId = getAdminId(req);
  const returnRequestId = String(req.params.returnRequestId || '').trim();
  const status = String(req.body.status || '').trim();

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  const sellerMessage = String(req.body.sellerMessage || '').trim() || null;
  const sellerDecision = String(req.body.sellerDecision || '').trim() || null;
  const courierName = String(req.body.courierName || '').trim() || null;
  const pickupSchedule = String(req.body.pickupSchedule || '').trim() || null;
  const returnAddress = String(req.body.returnAddress || '').trim() || null;
  const refundAmount = req.body.refundAmount === undefined || req.body.refundAmount === null ? null : Number(req.body.refundAmount);
  const refundMethod = String(req.body.refundMethod || '').trim() || null;
  const transactionId = String(req.body.transactionId || '').trim() || null;
  const refundStep = req.body.refundStep === undefined || req.body.refundStep === null ? null : Number(req.body.refundStep);

  try {
    const sql = `
      UPDATE lumina.return_requests
      SET
        status = $1,
        approved_by = CASE WHEN $1 = 'approved' THEN $2 ELSE approved_by END,
        approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE approved_at END,
        completed_at = CASE WHEN $1 = 'refunded' THEN NOW() ELSE completed_at END,
        seller_message = COALESCE($4, seller_message),
        seller_decision = COALESCE($5, seller_decision),
        courier_name = COALESCE($6, courier_name),
        pickup_schedule = COALESCE($7, pickup_schedule),
        return_address = COALESCE($8, return_address),
        refund_amount = COALESCE($9, refund_amount),
        refund_method = COALESCE($10, refund_method),
        transaction_id = COALESCE($11, transaction_id),
        refund_step = COALESCE($12, refund_step),
        updated_at = NOW()
      WHERE return_code = $3 OR id::text = $3
      RETURNING
        id,
        return_code AS "returnRequestId",
        status,
        seller_message AS "sellerMessage",
        seller_decision AS "sellerDecision",
        courier_name AS "courierName",
        pickup_schedule AS "pickupSchedule",
        return_address AS "returnAddress",
        refund_amount AS "refundAmount",
        refund_method AS "refundMethod",
        transaction_id AS "transactionId",
        refund_step AS "refundStep",
        approved_by AS "approvedBy",
        approved_at AS "approvedAt",
        completed_at AS "completedAt",
        updated_at AS "updatedAt"
    `;

    const result = await req.db.query(sql, [
      status,
      adminId,
      returnRequestId,
      sellerMessage,
      sellerDecision,
      courierName,
      pickupSchedule,
      returnAddress,
      refundAmount,
      refundMethod,
      transactionId,
      refundStep
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Return request not found' });
    }

    return res.json({ success: true, message: 'Return request updated', data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update return request', error: error.message });
  }
});

module.exports = router;
