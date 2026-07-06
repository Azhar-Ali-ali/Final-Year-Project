const express = require('express');

const router = express.Router();

function getCustomerId(req) {
  const raw = req.auth?.session?.userId || req.headers['x-user-id'] || '';
  return String(raw || '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

async function resolveCustomerId(req, requestedId) {
  const sessionCustomerId = getCustomerId(req);
  if (isUuid(sessionCustomerId)) return sessionCustomerId;
  return null;
}

function mapStatusForUi(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'requested') return 'pending';
  if (value === 'approved') return 'approved';
  if (value === 'in_transit') return 'approved';
  if (value === 'received') return 'approved';
  if (value === 'rejected') return 'rejected';
  if (value === 'refunded') return 'refunded';
  if (value === 'closed') return 'refunded';
  return 'pending';
}

function canCancelReturn(status) {
  return mapStatusForUi(status) === 'pending';
}

function normalizeReason(value) {
  const text = String(value || '').trim();
  return text || 'Not specified';
}

async function getReturnRecordById(req, customerId, returnRequestId) {
  const sql = `
    SELECT
      rr.id,
      COALESCE(rr.return_number, rr.id::text) AS "returnRequestId",
      rr.order_id AS "orderDbId",
      o.order_number AS "orderId",
      rr.status,
      rr.reason,
      rr.admin_note AS "sellerMessage",
      rr.requested_at AS "requestDate",
      rr.resolved_at AS "completedAt",
      oi.id AS "orderItemId",
      oi.product_id AS "productId",
      oi.product_name AS "productName",
      oi.quantity,
      oi.unit_price AS "productPrice",
      COALESCE(pm.image_url, '') AS "productImage",
      COALESCE(sp.store_name, su.full_name, 'Seller') AS "sellerName"
    FROM public.return_requests rr
    JOIN public.orders o ON o.id = rr.order_id
    LEFT JOIN LATERAL (
      SELECT oi1.*
      FROM public.order_items oi1
      WHERE oi1.order_id = rr.order_id
      ORDER BY oi1.id ASC
      LIMIT 1
    ) oi ON TRUE
    LEFT JOIN LATERAL (
      SELECT pi.image_url
      FROM public.product_images pi
      WHERE pi.product_id = oi.product_id
      ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.id ASC
      LIMIT 1
    ) pm ON TRUE
    LEFT JOIN public.users su ON su.id = oi.seller_id
    LEFT JOIN public.seller_profiles sp ON sp.user_id = oi.seller_id
    WHERE rr.customer_id = $1
      AND (COALESCE(rr.return_number, rr.id::text) = $2 OR rr.id::text = $2)
    LIMIT 1
  `;

  const result = await req.db.query(sql, [customerId, String(returnRequestId || '').trim()]);
  return result.rows[0] || null;
}

function buildTimeline(row) {
  const status = String(row.status || '').toLowerCase();

  return [
    {
      code: 'request_created',
      label: 'Request Submitted',
      occurredAt: row.requestDate,
      completed: true
    },
    {
      code: 'seller_review',
      label: 'Seller Review',
      occurredAt: row.completedAt,
      completed: ['approved', 'rejected', 'in_transit', 'received', 'refunded', 'closed'].includes(status)
    },
    {
      code: 'refund_complete',
      label: 'Refund Completed',
      occurredAt: row.completedAt,
      completed: ['refunded', 'closed'].includes(status)
    }
  ];
}

function buildRefundTrackingData(row) {
  const mapped = mapStatusForUi(row.status);
  const step = mapped === 'refunded' ? 5 : mapped === 'approved' ? 3 : mapped === 'rejected' ? 2 : 1;

  return {
    returnRequestId: row.returnRequestId,
    orderId: row.orderId,
    status: mapped,
    step,
    refundAmount: mapped === 'refunded' ? Number(row.productPrice || 0) : 0,
    refundMethod: mapped === 'refunded' ? 'Original Payment Method' : 'Pending',
    refundStatus: mapped === 'refunded' ? 'Refund Completed' : mapped === 'approved' ? 'Return Approved' : mapped === 'rejected' ? 'Request Rejected' : 'Pending Approval',
    statusType: mapped === 'refunded' ? 'completed' : 'processing',
    originalPaymentMethod: 'Original Payment Method',
    refundDate: row.completedAt,
    transactionId: mapped === 'refunded' ? `RF-${String(row.returnRequestId).slice(-8).toUpperCase()}` : null,
    receiptAvailable: mapped === 'refunded'
  };
}

router.get('/requests', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const statusFilter = String(req.query.status || 'all').trim().toLowerCase();

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const sql = `
      SELECT
        rr.id,
        COALESCE(rr.return_number, rr.id::text) AS "returnRequestId",
        rr.order_id AS "orderDbId",
        o.order_number AS "orderId",
        rr.status,
        rr.reason AS "selectedReason",
        rr.requested_at AS "requestDate",
        rr.resolved_at AS "completedAt",
        oi.product_name AS "productName",
        COALESCE(pm.image_url, '') AS "productImage",
        COALESCE(sp.store_name, su.full_name, 'Seller') AS "sellerName"
      FROM public.return_requests rr
      JOIN public.orders o ON o.id = rr.order_id
      LEFT JOIN LATERAL (
        SELECT oi1.*
        FROM public.order_items oi1
        WHERE oi1.order_id = rr.order_id
        ORDER BY oi1.id ASC
        LIMIT 1
      ) oi ON TRUE
      LEFT JOIN LATERAL (
        SELECT pi.image_url
        FROM public.product_images pi
        WHERE pi.product_id = oi.product_id
        ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.id ASC
        LIMIT 1
      ) pm ON TRUE
      LEFT JOIN public.users su ON su.id = oi.seller_id
      LEFT JOIN public.seller_profiles sp ON sp.user_id = oi.seller_id
      WHERE rr.customer_id = $1
      ORDER BY rr.requested_at DESC
    `;

    const result = await req.db.query(sql, [customerId]);

    let data = result.rows.map((row) => ({
      id: row.id,
      returnRequestId: row.returnRequestId,
      orderDbId: row.orderDbId,
      orderId: row.orderId,
      status: mapStatusForUi(row.status),
      selectedReason: normalizeReason(row.selectedReason),
      requestDate: row.requestDate,
      completedAt: row.completedAt,
      productName: row.productName || 'Product',
      productImage: row.productImage || '',
      sellerName: row.sellerName || 'Seller'
    }));

    if (statusFilter !== 'all' && statusFilter) {
      data = data.filter((item) => item.status === statusFilter);
    }

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch return requests', error: error.message });
  }
});

router.post('/requests', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const orderItemId = String(req.body.orderItemId || '').trim();
  const selectedReason = String(req.body.selectedReason || '').trim();

  if (!orderItemId || !selectedReason) {
    return res.status(400).json({ success: false, message: 'orderItemId and selectedReason are required' });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const ownershipSql = `
      SELECT oi.order_id AS "orderId"
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id::text = $1 AND o.customer_id = $2
      LIMIT 1
    `;

    const ownership = await req.db.query(ownershipSql, [orderItemId, customerId]);
    if (!ownership.rows.length) {
      return res.status(404).json({ success: false, message: 'Order item not found for this customer' });
    }

    const returnNumber = `RR-${Date.now().toString().slice(-8)}`;

    const insertSql = `
      INSERT INTO public.return_requests (
        return_number,
        order_id,
        customer_id,
        status,
        reason,
        requested_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'requested', $4, NOW(), NOW(), NOW())
      RETURNING id, COALESCE(return_number, id::text) AS "returnRequestId"
    `;

    const inserted = await req.db.query(insertSql, [
      returnNumber,
      ownership.rows[0].orderId,
      customerId,
      selectedReason
    ]);

    return res.status(201).json({
      success: true,
      message: 'Return request created',
      data: {
        id: inserted.rows[0].id,
        returnRequestId: inserted.rows[0].returnRequestId
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create return request', error: error.message });
  }
});

router.get('/requests/by-order/:orderId', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const orderId = String(req.params.orderId || '').trim();

  if (!orderId) {
    return res.status(400).json({ success: false, message: 'orderId is required' });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const sql = `
      SELECT COALESCE(rr.return_number, rr.id::text) AS "returnRequestId"
      FROM public.return_requests rr
      JOIN public.orders o ON o.id = rr.order_id
      WHERE rr.customer_id = $1
        AND (o.order_number = $2 OR rr.order_id::text = $2)
      ORDER BY rr.requested_at DESC
      LIMIT 1
    `;

    const result = await req.db.query(sql, [customerId, orderId]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Return request not found for the provided order' });
    }

    const data = await getReturnRecordById(req, customerId, result.rows[0].returnRequestId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Return request not found for the provided order' });
    }

    return res.json({
      success: true,
      data: {
        ...data,
        status: mapStatusForUi(data.status),
        selectedReason: normalizeReason(data.reason),
        canCancel: canCancelReturn(data.status)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch return request by order', error: error.message });
  }
});

router.get('/requests/:returnRequestId', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const returnRequestId = String(req.params.returnRequestId || '').trim();

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const data = await getReturnRecordById(req, customerId, returnRequestId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Return request not found' });
    }

    return res.json({
      success: true,
      data: {
        ...data,
        status: mapStatusForUi(data.status),
        selectedReason: normalizeReason(data.reason),
        canCancel: canCancelReturn(data.status)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch return request', error: error.message });
  }
});

router.get('/requests/:returnRequestId/timeline', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const returnRequestId = String(req.params.returnRequestId || '').trim();

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const data = await getReturnRecordById(req, customerId, returnRequestId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Return request not found' });
    }

    return res.json({
      success: true,
      data: {
        returnRequestId: data.returnRequestId,
        status: mapStatusForUi(data.status),
        refundStep: buildRefundTrackingData(data).step,
        timeline: buildTimeline(data)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch return timeline', error: error.message });
  }
});

router.get('/requests/by-order/:orderId/refund-tracking', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const orderId = String(req.params.orderId || '').trim();

  if (!orderId) {
    return res.status(400).json({ success: false, message: 'orderId is required' });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const sql = `
      SELECT COALESCE(rr.return_number, rr.id::text) AS "returnRequestId"
      FROM public.return_requests rr
      JOIN public.orders o ON o.id = rr.order_id
      WHERE rr.customer_id = $1
        AND (o.order_number = $2 OR rr.order_id::text = $2)
      ORDER BY rr.requested_at DESC
      LIMIT 1
    `;

    const result = await req.db.query(sql, [customerId, orderId]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Refund tracking not found for the provided order' });
    }

    const data = await getReturnRecordById(req, customerId, result.rows[0].returnRequestId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Refund tracking not found for the provided order' });
    }

    return res.json({ success: true, data: buildRefundTrackingData(data) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch refund tracking by order', error: error.message });
  }
});

router.get('/requests/:returnRequestId/refund-tracking', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const returnRequestId = String(req.params.returnRequestId || '').trim();

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const data = await getReturnRecordById(req, customerId, returnRequestId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Refund tracking not found' });
    }

    return res.json({ success: true, data: buildRefundTrackingData(data) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch refund tracking', error: error.message });
  }
});

router.patch('/requests/:returnRequestId/cancel', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const returnRequestId = String(req.params.returnRequestId || '').trim();

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const sql = `
      UPDATE public.return_requests
      SET
        status = 'rejected',
        updated_at = NOW(),
        resolved_at = COALESCE(resolved_at, NOW())
      WHERE customer_id = $1
        AND (COALESCE(return_number, id::text) = $2 OR id::text = $2)
        AND status = 'requested'
      RETURNING id, COALESCE(return_number, id::text) AS "returnRequestId", status, updated_at AS "updatedAt"
    `;

    const result = await req.db.query(sql, [customerId, returnRequestId]);
    if (!result.rows.length) {
      return res.status(400).json({ success: false, message: 'Only pending return requests can be cancelled' });
    }

    return res.json({ success: true, message: 'Return request cancelled', data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to cancel return request', error: error.message });
  }
});

module.exports = router;
