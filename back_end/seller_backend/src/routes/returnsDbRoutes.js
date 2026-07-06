const express = require('express');

const router = express.Router();

function getSellerId(req) {
  const raw = req.auth?.session?.userId || req.headers['x-seller-id'] || '';
  return String(raw).trim();
}

async function resolveSellerId(req) {
  const sellerId = getSellerId(req);
  return sellerId || null;
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toReturnCode(row) {
  return row.return_code || row.return_number || row.id;
}

function mapReturnRow(row) {
  const quantity = parseNumber(row.quantity, 1);
  const unitPrice = parseNumber(row.unit_price, 0);
  const lineTotal = parseNumber(row.lineTotal, quantity * unitPrice);
  const shipping = parseNumber(row.shipping_fee ?? row.shipping, 0);

  return {
    id: row.id,
    returnId: toReturnCode(row),
    orderId: row.orderId || row.order_number || '-',
    product: row.productName || row.product_name || '-',
    customer: row.customerName || row.customer_name || '-',
    customerEmail: row.customer_email || row.email || '',
    reason: row.selectedReason || row.reason || '-',
    status: row.status || 'pending',
    requestDate: row.requestDate || row.requested_at || row.created_at || null,
    quantity,
    price: row.price_display || `$${unitPrice.toFixed(2)}`,
    unitPrice,
    lineTotal,
    shipping,
    commissionRate: parseNumber(row.commission_rate, 5),
    sellerId: row.seller_id || null,
    description: row.customerDescription || row.customer_description || '',
    sellerMessage: row.sellerMessage || row.seller_message || '',
    sellerDecision: row.sellerDecision || row.seller_decision || '',
    courierName: row.courierName || row.courier_name || '',
    pickupSchedule: row.pickupSchedule || row.pickup_schedule || '',
    returnAddress: row.returnAddress || row.return_address || '',
    refundAmount: parseNumber(row.refundAmount ?? row.refund_amount, 0),
    refundMethod: row.refundMethod || row.refund_method || '',
    transactionId: row.transactionId || row.transaction_id || '',
    refundStep: parseNumber(row.refundStep ?? row.refund_step, 1),
    approvedAt: row.approvedAt || row.approved_at || null,
    completedAt: row.completedAt || row.completed_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    timeline: Array.isArray(row.timeline) ? row.timeline : []
  };
}

function buildTimeline(row) {
  const timeline = [];

  if (row.requested_at) {
    timeline.push({ action: 'Return Requested', by: 'Customer', date: row.requested_at });
  }

  if (row.approved_at) {
    timeline.push({ action: 'Approved', by: 'Seller', date: row.approved_at });
  }

  if (row.refund_step >= 3 || row.status === 'received') {
    timeline.push({ action: 'Item Received', by: 'Seller', date: row.updated_at || row.approved_at || row.requested_at });
  }

  if (row.completed_at || row.status === 'refunded') {
    timeline.push({ action: 'Refunded', by: 'Seller', date: row.completed_at || row.updated_at || row.approved_at || row.requested_at });
  }

  if (row.status === 'rejected') {
    timeline.push({ action: 'Rejected', by: 'Seller', date: row.updated_at || row.requested_at });
  }

  return timeline;
}

async function fetchReturnRequest(req, sellerId, returnRequestId) {
  const result = await req.db.query(
    `
      SELECT
        rr.id,
        rr.return_number AS return_code,
        rr.status,
        rr.reason AS selected_reason,
        rr.requested_at,
        rr.resolved_at AS completed_at,
        rr.updated_at,
        o.order_number,
        o.shipping_fee,
        ri.quantity,
        oi.unit_price,
        oi.line_total,
        oi.seller_id,
        COALESCE(oi.product_name, p.name) AS "productName",
        cu.full_name AS "customerName",
        cu.email AS "customerEmail"
      FROM public.return_requests rr
      JOIN public.return_items ri ON ri.return_request_id = rr.id
      JOIN public.order_items oi ON oi.id = ri.order_item_id
      JOIN public.orders o ON o.id = oi.order_id
      LEFT JOIN public.products p ON p.id = oi.product_id
      JOIN public.users cu ON cu.id = rr.customer_id
      WHERE oi.seller_id = $1 AND (rr.return_number = $2 OR rr.id::text = $2)
      LIMIT 1
    `,
    [sellerId, returnRequestId]
  );

  if (!result.rows.length) {
    return null;
  }

  const row = result.rows[0];
  const mapped = mapReturnRow({
    ...row,
    orderId: row.order_number,
    customerName: row.customerName,
    customer_email: row.customerEmail,
    lineTotal: row.line_total,
    shipping_fee: row.shipping_fee,
    price_display: `$${parseNumber(row.unit_price, 0).toFixed(2)}`,
    timeline: buildTimeline(row),
    evidence: Array.isArray(row.evidence) ? row.evidence : []
  });

  mapped.timeline = buildTimeline(row);
  mapped.evidence = Array.isArray(row.evidence) ? row.evidence : [];
  return mapped;
}

router.get('/requests', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const status = req.query.status;
    const params = [sellerId];
    const where = ['oi.seller_id = $1'];

    if (status && status !== 'all') {
      params.push(status);
      where.push(`rr.status = $${params.length}`);
    }

    const result = await req.db.query(
      `
        SELECT
          rr.id,
          rr.return_number AS return_code,
          rr.status,
          rr.reason AS selected_reason,
          rr.requested_at,
          rr.resolved_at AS completed_at,
          rr.updated_at,
          o.order_number,
          o.shipping_fee,
          ri.quantity,
          oi.unit_price,
          oi.line_total,
          oi.seller_id,
          COALESCE(oi.product_name, p.name) AS "productName",
          cu.full_name AS "customerName",
          cu.email AS "customerEmail"
        FROM public.return_requests rr
        JOIN public.return_items ri ON ri.return_request_id = rr.id
        JOIN public.order_items oi ON oi.id = ri.order_item_id
        JOIN public.orders o ON o.id = oi.order_id
        LEFT JOIN public.products p ON p.id = oi.product_id
        JOIN public.users cu ON cu.id = rr.customer_id
        WHERE ${where.join(' AND ')}
        ORDER BY rr.requested_at DESC
      `,
      params
    );

    return res.json({ success: true, data: result.rows.map((row) => {
      const mapped = mapReturnRow({
        ...row,
        orderId: row.order_number,
        customerName: row.customerName,
        customer_email: row.customerEmail,
        lineTotal: row.line_total,
        shipping_fee: row.shipping_fee,
        price_display: `$${parseNumber(row.unit_price, 0).toFixed(2)}`
      });
      mapped.timeline = buildTimeline(row);
      mapped.evidence = Array.isArray(row.evidence) ? row.evidence : [];
      return mapped;
    }) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch seller return requests', error: error.message });
  }
});

router.get('/requests/:returnRequestId', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const request = await fetchReturnRequest(req, sellerId, String(req.params.returnRequestId || '').trim());
    if (!request) {
      return res.status(404).json({ success: false, message: 'Return request not found for this seller' });
    }

    return res.json({ success: true, data: request });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch return request', error: error.message });
  }
});

router.patch('/requests/:returnRequestId/approve', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const returnRequestId = String(req.params.returnRequestId || '').trim();
    const result = await req.db.query(
      `
        UPDATE public.return_requests rr
        SET
          status = 'approved',
          updated_at = NOW()
        FROM public.return_items ri
        JOIN public.order_items oi ON oi.id = ri.order_item_id
        WHERE rr.id = ri.return_request_id
          AND oi.seller_id = $1
          AND (rr.return_number = $2 OR rr.id::text = $2)
        RETURNING rr.id
      `,
      [sellerId, returnRequestId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Return request not found for this seller' });
    }

    const updated = await fetchReturnRequest(req, sellerId, returnRequestId);
    return res.json({ success: true, message: 'Return request approved', data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to approve return request', error: error.message });
  }
});

router.patch('/requests/:returnRequestId/received', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const returnRequestId = String(req.params.returnRequestId || '').trim();
    const result = await req.db.query(
      `
        UPDATE public.return_requests rr
        SET
          status = 'received',
          updated_at = NOW()
        FROM public.return_items ri
        JOIN public.order_items oi ON oi.id = ri.order_item_id
        WHERE rr.id = ri.return_request_id
          AND oi.seller_id = $1
          AND (rr.return_number = $2 OR rr.id::text = $2)
        RETURNING rr.id
      `,
      [sellerId, returnRequestId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Return request not found for this seller' });
    }

    const updated = await fetchReturnRequest(req, sellerId, returnRequestId);
    return res.json({ success: true, message: 'Return request marked as received', data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to mark return as received', error: error.message });
  }
});

router.patch('/requests/:returnRequestId/reject', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const returnRequestId = String(req.params.returnRequestId || '').trim();
    const result = await req.db.query(
      `
        UPDATE public.return_requests rr
        SET
          status = 'rejected',
          resolved_at = NOW(),
          updated_at = NOW()
        FROM public.return_items ri
        JOIN public.order_items oi ON oi.id = ri.order_item_id
        WHERE rr.id = ri.return_request_id
          AND oi.seller_id = $1
          AND (rr.return_number = $2 OR rr.id::text = $2)
        RETURNING rr.id
      `,
      [sellerId, returnRequestId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Return request not found for this seller' });
    }

    const updated = await fetchReturnRequest(req, sellerId, returnRequestId);
    return res.json({ success: true, message: 'Return request rejected', data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to reject return request', error: error.message });
  }
});

router.patch('/requests/:returnRequestId/refunded', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const returnRequestId = String(req.params.returnRequestId || '').trim();
    const result = await req.db.query(
      `
        UPDATE public.return_requests rr
        SET
          status = 'refunded',
          resolved_at = NOW(),
          updated_at = NOW()
        FROM public.return_items ri
        JOIN public.order_items oi ON oi.id = ri.order_item_id
        WHERE rr.id = ri.return_request_id
          AND oi.seller_id = $1
          AND (rr.return_number = $2 OR rr.id::text = $2)
        RETURNING rr.id
      `,
      [sellerId, returnRequestId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Return request not found for this seller' });
    }

    const updated = await fetchReturnRequest(req, sellerId, returnRequestId);
    return res.json({ success: true, message: 'Refund marked as completed', data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to mark refund as completed', error: error.message });
  }
});

module.exports = router;