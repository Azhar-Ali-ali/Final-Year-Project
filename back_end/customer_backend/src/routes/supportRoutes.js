const express = require('express');

const router = express.Router();

function getCustomerId(req) {
  const raw = req.auth?.session?.userId || req.headers['x-user-id'] || '';
  return String(raw || '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function validateStatus(status) {
  return ['open', 'in_progress', 'resolved', 'closed'].includes(status);
}

function validatePriority(priority) {
  return ['low', 'medium', 'high', 'urgent', 'normal'].includes(priority);
}

function normalizePriority(priority) {
  const value = String(priority || 'normal').trim().toLowerCase();
  if (value === 'medium') return 'normal';
  if (value === 'low' || value === 'normal' || value === 'high' || value === 'urgent') return value;
  return 'normal';
}

function sanitizeCategory(category) {
  const value = String(category || 'general').trim().toLowerCase();
  return value || 'general';
}

async function resolveCustomerId(req, requestedId) {
  const sessionCustomerId = getCustomerId(req);
  if (isUuid(sessionCustomerId)) return sessionCustomerId;
  return null;
}

function mapTicketStatus(status) {
  const raw = String(status || '').toLowerCase();
  if (raw === 'open' || raw === 'in_progress' || raw === 'resolved' || raw === 'closed') return raw;
  return 'open';
}

router.get('/tickets/stats', async (req, res) => {
  const requestedId = getCustomerId(req);

  try {
    const customerId = await resolveCustomerId(req, requestedId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const sql = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
        COUNT(*) FILTER (WHERE status = 'closed')::int AS closed
      FROM public.support_tickets
      WHERE customer_id = $1
    `;

    const result = await req.db.query(sql, [customerId]);
    return res.json({ success: true, data: result.rows[0] || { total: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch ticket stats', error: error.message });
  }
});

router.get('/tickets', async (req, res) => {
  const requestedId = getCustomerId(req);
  const status = String(req.query.status || '').trim().toLowerCase();
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
  const offset = (page - 1) * pageSize;

  if (status && status !== 'all' && !validateStatus(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status filter' });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const where = ['st.customer_id = $1'];
    const params = [customerId];

    if (status && status !== 'all') {
      params.push(status);
      where.push(`st.status::text = $${params.length}`);
    }

    params.push(pageSize, offset);

    const sql = `
      SELECT
        st.id,
        st.ticket_number AS "ticketId",
        st.subject,
        COALESCE(last_msg.message, '') AS message,
        st.issue_type AS category,
        st.status::text AS status,
        st.priority,
        st.created_at AS "submittedAt",
        st.updated_at AS "updatedAt",
        st.closed_at AS "closedAt",
        COUNT(sm.id)::int AS "messageCount"
      FROM public.support_tickets st
      LEFT JOIN public.support_messages sm ON sm.ticket_id = st.id
      LEFT JOIN LATERAL (
        SELECT message
        FROM public.support_messages sm2
        WHERE sm2.ticket_id = st.id
          AND sm2.is_internal_note = FALSE
        ORDER BY sm2.created_at DESC
        LIMIT 1
      ) last_msg ON TRUE
      WHERE ${where.join(' AND ')}
      GROUP BY st.id, last_msg.message
      ORDER BY st.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM public.support_tickets st
      WHERE ${where.join(' AND ')}
    `;

    const [result, countResult] = await Promise.all([
      req.db.query(sql, params),
      req.db.query(countSql, params.slice(0, params.length - 2))
    ]);

    const data = result.rows.map((row) => ({
      ...row,
      status: mapTicketStatus(row.status)
    }));

    return res.json({
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        total: countResult.rows[0]?.total || 0
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch support tickets', error: error.message });
  }
});

router.post('/tickets', async (req, res) => {
  const requestedId = getCustomerId(req);
  const subject = String(req.body.subject || '').trim();
  const message = String(req.body.message || '').trim();
  const rawPriority = String(req.body.priority || 'normal').trim().toLowerCase();
  const category = sanitizeCategory(req.body.category);
  const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];

  if (!subject || !message) {
    return res.status(400).json({ success: false, message: 'subject and message are required' });
  }

  if (!validatePriority(rawPriority)) {
    return res.status(400).json({ success: false, message: 'Invalid priority value' });
  }

  const priority = normalizePriority(rawPriority);

  try {
    const customerId = await resolveCustomerId(req, requestedId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const ticketNumber = `SUP-${Date.now().toString().slice(-8)}`;

    const insertTicketSql = `
      INSERT INTO public.support_tickets (
        ticket_number,
        ticket_type,
        status,
        customer_id,
        subject,
        issue_type,
        priority,
        created_by,
        created_at,
        updated_at
      )
      VALUES ($1, 'customer', 'open', $2, $3, $4, $5, $2, NOW(), NOW())
      RETURNING id, ticket_number AS "ticketId", subject, status::text AS status, issue_type AS category, priority, created_at AS "submittedAt"
    `;

    const ticketResult = await req.db.query(insertTicketSql, [
      ticketNumber,
      customerId,
      subject,
      category,
      priority
    ]);

    const ticket = ticketResult.rows[0];

    const messageSql = `
      INSERT INTO public.support_messages (ticket_id, sender_id, sender_role, message, attachment_url, is_internal_note, created_at)
      VALUES ($1, $2, 'customer', $3, $4, FALSE, NOW())
      RETURNING id, ticket_id AS "ticketDbId", sender_id AS "senderId", sender_role AS "senderRole", message, created_at AS "createdAt"
    `;

    const attachmentUrl = attachments.length ? JSON.stringify(attachments) : null;
    const messageResult = await req.db.query(messageSql, [ticket.id, customerId, message, attachmentUrl]);

    return res.status(201).json({
      success: true,
      message: 'Support ticket submitted successfully',
      data: {
        ...ticket,
        firstMessage: messageResult.rows[0]
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create support ticket', error: error.message });
  }
});

router.get('/tickets/:ticketId', async (req, res) => {
  const requestedId = getCustomerId(req);
  const ticketId = String(req.params.ticketId || '').trim();

  try {
    const customerId = await resolveCustomerId(req, requestedId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const sql = `
      SELECT
        st.id,
        st.ticket_number AS "ticketId",
        st.subject,
        st.issue_type AS category,
        st.status::text AS status,
        st.priority,
        st.closed_at AS "closedAt",
        st.created_at AS "submittedAt",
        st.updated_at AS "updatedAt"
      FROM public.support_tickets st
      WHERE st.customer_id = $1
        AND (st.ticket_number = $2 OR st.id::text = $2)
      LIMIT 1
    `;

    const result = await req.db.query(sql, [customerId, ticketId]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const row = result.rows[0];
    row.status = mapTicketStatus(row.status);
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch ticket', error: error.message });
  }
});

router.get('/tickets/:ticketId/messages', async (req, res) => {
  const requestedId = getCustomerId(req);
  const ticketId = String(req.params.ticketId || '').trim();

  try {
    const customerId = await resolveCustomerId(req, requestedId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const ticketSql = `
      SELECT id
      FROM public.support_tickets
      WHERE customer_id = $1
        AND (ticket_number = $2 OR id::text = $2)
      LIMIT 1
    `;

    const ticketResult = await req.db.query(ticketSql, [customerId, ticketId]);
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const dbTicketId = ticketResult.rows[0].id;

    const messagesSql = `
      SELECT
        sm.id,
        sm.ticket_id AS "ticketDbId",
        sm.sender_id AS "senderId",
        u.full_name AS "senderName",
        sm.sender_role AS "senderRole",
        sm.message,
        CASE
          WHEN sm.attachment_url IS NULL OR sm.attachment_url = '' THEN '[]'::jsonb
          ELSE jsonb_build_array(jsonb_build_object('name', 'Attachment', 'url', sm.attachment_url))
        END AS attachments,
        sm.created_at AS "createdAt"
      FROM public.support_messages sm
      JOIN public.users u ON u.id = sm.sender_id
      WHERE sm.ticket_id = $1
        AND sm.is_internal_note = FALSE
      ORDER BY sm.created_at ASC
    `;

    const messagesResult = await req.db.query(messagesSql, [dbTicketId]);
    return res.json({ success: true, data: messagesResult.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch ticket messages', error: error.message });
  }
});

router.post('/tickets/:ticketId/messages', async (req, res) => {
  const requestedId = getCustomerId(req);
  const ticketId = String(req.params.ticketId || '').trim();
  const message = String(req.body.message || '').trim();
  const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];

  if (!message) {
    return res.status(400).json({ success: false, message: 'message is required' });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const ticketSql = `
      SELECT id, status::text AS status
      FROM public.support_tickets
      WHERE customer_id = $1
        AND (ticket_number = $2 OR id::text = $2)
      LIMIT 1
    `;

    const ticketResult = await req.db.query(ticketSql, [customerId, ticketId]);
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    if (mapTicketStatus(ticket.status) === 'closed') {
      return res.status(400).json({ success: false, message: 'Cannot reply to a closed ticket' });
    }

    const attachmentUrl = attachments.length ? JSON.stringify(attachments) : null;

    const insertSql = `
      INSERT INTO public.support_messages (ticket_id, sender_id, sender_role, message, attachment_url, is_internal_note, created_at)
      VALUES ($1, $2, 'customer', $3, $4, FALSE, NOW())
      RETURNING id, ticket_id AS "ticketDbId", sender_id AS "senderId", sender_role AS "senderRole", message, created_at AS "createdAt"
    `;

    const result = await req.db.query(insertSql, [ticket.id, customerId, message, attachmentUrl]);

    await req.db.query(
      `
      UPDATE public.support_tickets
      SET
        updated_at = NOW(),
        status = CASE WHEN status::text IN ('resolved', 'open') THEN 'in_progress'::ticket_status ELSE status END,
        closed_at = NULL
      WHERE id = $1
      `,
      [ticket.id]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to send message', error: error.message });
  }
});

module.exports = router;
