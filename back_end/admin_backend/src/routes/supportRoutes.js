const express = require('express');

const router = express.Router();

function getAdminId(req) {
  const raw = req.headers['x-admin-id'] || req.query.adminId || req.body.adminId || '';
  return String(raw).trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

async function resolveAdminId(req) {
  const provided = getAdminId(req);
  if (isUuid(provided)) {
    const found = await req.db.query(
      `
        SELECT id
        FROM public.users
        WHERE id = $1
          AND role IN ('admin', 'super_admin')
        LIMIT 1
      `,
      [provided]
    );
    if (found.rows.length) return found.rows[0].id;
  }

  const fallback = await req.db.query(
    `
      SELECT id
      FROM public.users
      WHERE role IN ('admin', 'super_admin')
      ORDER BY created_at ASC
      LIMIT 1
    `
  );

  return fallback.rows[0]?.id || null;
}

function isValidStatus(status) {
  return ['open', 'in_progress', 'resolved', 'closed'].includes(status);
}

router.get('/overview', async (req, res) => {
  try {
    const sql = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
        COUNT(*) FILTER (WHERE status = 'closed')::int AS closed,
        COUNT(*) FILTER (WHERE assigned_admin IS NULL AND status IN ('open', 'in_progress'))::int AS unassigned,
        COUNT(*) FILTER (WHERE priority = 'urgent' AND status IN ('open', 'in_progress'))::int AS urgent_open
      FROM lumina.support_tickets
    `;

    const result = await req.db.query(sql);
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch support overview', error: error.message });
  }
});

router.get('/tickets', async (req, res) => {
  const status = req.query.status;
  const category = String(req.query.category || '').trim().toLowerCase();
  const search = String(req.query.search || '').trim();
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
  const offset = (page - 1) * pageSize;

  if (status && status !== 'all' && !isValidStatus(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status filter' });
  }

  try {
    const where = ['1=1'];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      where.push(`st.status = $${params.length}::lumina.ticket_status`);
    }

    if (category) {
      params.push(category);
      where.push(`st.category = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`(st.ticket_number ILIKE $${params.length} OR st.subject ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
    }

    params.push(pageSize, offset);

    const sql = `
      SELECT
        st.id,
        st.ticket_number AS "ticketId",
        st.subject,
        st.description,
        st.category,
        st.status,
        st.priority,
        st.source,
        st.last_reply_at AS "lastReplyAt",
        st.closed_reason AS "closedReason",
        st.reopened_count AS "reopenedCount",
        st.created_at AS "submittedAt",
        st.updated_at AS "updatedAt",
        st.resolved_at AS "resolvedAt",
        st.requester_id AS "requesterId",
        u.full_name AS "requesterName",
        u.email AS "requesterEmail",
        u.role AS "requesterRole",
        st.assigned_admin AS "assignedAdminId",
        aa.full_name AS "assignedAdminName",
        COUNT(sm.id)::int AS "messageCount"
      FROM lumina.support_tickets st
      JOIN lumina.users u ON u.id = st.requester_id
      LEFT JOIN lumina.users aa ON aa.id = st.assigned_admin
      LEFT JOIN lumina.support_messages sm ON sm.ticket_id = st.id
      WHERE ${where.join(' AND ')}
      GROUP BY st.id, u.id, aa.id
      ORDER BY st.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM lumina.support_tickets st
      JOIN lumina.users u ON u.id = st.requester_id
      WHERE ${where.slice(0, where.length).join(' AND ')}
    `;

    const [result, countResult] = await Promise.all([
      req.db.query(sql, params),
      req.db.query(countSql, params.slice(0, params.length - 2))
    ]);

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        page,
        pageSize,
        total: countResult.rows[0].total
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch tickets', error: error.message });
  }
});

router.patch('/tickets/:ticketId/status', async (req, res) => {
  const adminId = await resolveAdminId(req);
  const ticketId = String(req.params.ticketId || '').trim();
  const status = String(req.body.status || '').trim();
  const closedReason = String(req.body.closedReason || '').trim() || null;

  if (!adminId) {
    return res.status(400).json({ success: false, message: 'No valid admin user found for status update' });
  }

  if (!isValidStatus(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status value' });
  }

  try {
    const sql = `
      UPDATE lumina.support_tickets
      SET
        status = $1::lumina.ticket_status,
        assigned_admin = COALESCE(assigned_admin, $2),
        closed_by = CASE WHEN $1::lumina.ticket_status = 'closed' THEN $2 ELSE NULL END,
        closed_reason = CASE WHEN $1::lumina.ticket_status = 'closed' THEN COALESCE($4, closed_reason) ELSE NULL END,
        resolved_at = CASE WHEN $1::lumina.ticket_status IN ('resolved', 'closed') THEN NOW() ELSE NULL END,
        updated_at = NOW()
      WHERE ticket_number = $3 OR id::text = $3
      RETURNING
        id,
        ticket_number AS "ticketId",
        status,
        assigned_admin AS "assignedAdmin",
        closed_reason AS "closedReason",
        resolved_at AS "resolvedAt",
        updated_at AS "updatedAt"
    `;

    const result = await req.db.query(sql, [status, adminId, ticketId, closedReason]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    return res.json({ success: true, message: 'Ticket status updated', data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update ticket status', error: error.message });
  }
});

router.get('/tickets/:ticketId/messages', async (req, res) => {
  const ticketId = String(req.params.ticketId || '').trim();

  try {
    const ticketSql = `
      SELECT id, ticket_number AS "ticketId", subject, status
      FROM lumina.support_tickets
      WHERE ticket_number = $1 OR id::text = $1
      LIMIT 1
    `;

    const ticketResult = await req.db.query(ticketSql, [ticketId]);
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const messagesSql = `
      SELECT
        sm.id,
        sm.ticket_id AS "ticketDbId",
        sm.sender_id AS "senderId",
        u.full_name AS "senderName",
        u.role AS "senderRole",
        sm.message,
        sm.attachments,
        sm.created_at AS "createdAt"
      FROM lumina.support_messages sm
      JOIN lumina.users u ON u.id = sm.sender_id
      WHERE sm.ticket_id = $1
      ORDER BY sm.created_at ASC
    `;

    const messagesResult = await req.db.query(messagesSql, [ticketResult.rows[0].id]);

    return res.json({
      success: true,
      data: {
        ticket: ticketResult.rows[0],
        messages: messagesResult.rows
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch ticket messages', error: error.message });
  }
});

router.post('/tickets/:ticketId/messages', async (req, res) => {
  const adminId = await resolveAdminId(req);
  const ticketId = String(req.params.ticketId || '').trim();
  const message = String(req.body.message || '').trim();
  const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];

  if (!adminId) {
    return res.status(400).json({ success: false, message: 'No valid admin user found for replying' });
  }

  if (!message) {
    return res.status(400).json({ success: false, message: 'message is required' });
  }

  try {
    const ticketResult = await req.db.query(
      `
      SELECT id
      FROM lumina.support_tickets
      WHERE ticket_number = $1 OR id::text = $1
      LIMIT 1
      `,
      [ticketId]
    );

    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const dbTicketId = ticketResult.rows[0].id;

    const insertSql = `
      INSERT INTO lumina.support_messages (ticket_id, sender_id, message, attachments)
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING id, ticket_id AS "ticketDbId", sender_id AS "senderId", message, attachments, created_at AS "createdAt"
    `;

    const insertResult = await req.db.query(insertSql, [dbTicketId, adminId, message, JSON.stringify(attachments)]);

    await req.db.query(
      `
      UPDATE lumina.support_tickets
      SET
        assigned_admin = COALESCE(assigned_admin, $2),
        last_reply_at = NOW(),
        last_reply_by = $2,
        status = CASE WHEN status IN ('open', 'resolved') THEN 'in_progress'::lumina.ticket_status ELSE status END,
        updated_at = NOW()
      WHERE id = $1
      `,
      [dbTicketId, adminId]
    );

    return res.status(201).json({ success: true, message: 'Reply sent', data: insertResult.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to send reply', error: error.message });
  }
});

router.patch('/tickets/:ticketId/assign', async (req, res) => {
  const adminId = await resolveAdminId(req);
  const ticketId = String(req.params.ticketId || '').trim();
  const requestedAssignedAdmin = String(req.body.assignedAdmin || '').trim();
  const assignedAdmin = isUuid(requestedAssignedAdmin) ? requestedAssignedAdmin : adminId;

  if (!assignedAdmin) {
    return res.status(400).json({ success: false, message: 'No valid admin user found for assignment' });
  }

  try {
    const sql = `
      UPDATE lumina.support_tickets
      SET
        assigned_admin = $1,
        updated_at = NOW()
      WHERE ticket_number = $2 OR id::text = $2
      RETURNING id, ticket_number AS "ticketId", assigned_admin AS "assignedAdmin", updated_at AS "updatedAt"
    `;

    const result = await req.db.query(sql, [assignedAdmin, ticketId]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    return res.json({ success: true, message: 'Ticket assigned', data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to assign ticket', error: error.message });
  }
});

module.exports = router;
