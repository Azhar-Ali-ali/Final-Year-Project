const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const uploadsDir = path.resolve(__dirname, '../../..', 'uploads', 'support');

function getAdminId(req) {
  const raw = req.headers['x-admin-id'] || req.query.adminId || req.body.adminId || '';
  return String(raw).trim();
}

function sanitizeFileName(name) {
  return String(name || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 180);
}

function parseAttachments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') return [parsed];
  } catch (error) {
    // raw is not JSON
  }
  return [{ url: String(raw), filename: '' }];
}

function normalizePriority(priority) {
  if (!priority) return '';
  const value = String(priority).trim().toLowerCase();
  if (value === 'all') return 'all';
  if (value === 'medium') return 'normal';
  if (['low', 'normal', 'high', 'urgent'].includes(value)) return value;
  return 'normal';
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
          AND role = 'admin'
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
      WHERE role = 'admin'
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
        COUNT(*) FILTER (WHERE assigned_admin_id IS NULL AND status IN ('open', 'in_progress'))::int AS unassigned,
        COUNT(*) FILTER (WHERE priority = 'urgent' AND status IN ('open', 'in_progress'))::int AS urgent_open
      FROM public.support_tickets
    `;

    const result = await req.db.query(sql);
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch support overview', error: error.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const result = await req.db.query(`
      SELECT
        COUNT(*)::int AS totalTickets,
        COUNT(*) FILTER (WHERE status = 'open')::int AS openTickets,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS inProgressTickets,
        COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolvedTickets,
        COUNT(*) FILTER (WHERE status = 'closed')::int AS closedTickets,
        COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60))::int, 0) AS avgResponseMinutes
      FROM public.support_tickets
    `);
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch support summary', error: error.message });
  }
});

router.get('/tickets', async (req, res) => {
  const status = String(req.query.status || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim().toLowerCase();
  const search = String(req.query.search || '').trim();
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
  const offset = (page - 1) * pageSize;
  const priority = normalizePriority(String(req.query.priority || '').trim().toLowerCase());
  const assigned = String(req.query.assigned || '').trim();
  const userType = String(req.query.userType || '').trim().toLowerCase();

  if (status && status !== 'all' && !isValidStatus(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status filter' });
  }

  try {
    const where = ['1=1'];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      where.push(`st.status = $${params.length}`);
    }

    if (userType && userType !== 'all') {
      if (!['customer', 'seller'].includes(userType)) {
        return res.status(400).json({ success: false, message: 'Invalid user type filter' });
      }
      params.push(userType);
      where.push(`st.ticket_type = $${params.length}`);
    }

    if (priority && priority !== 'all') {
      params.push(priority);
      where.push(`st.priority = $${params.length}`);
    }

    if (assigned && assigned !== 'all') {
      if (assigned === 'unassigned') {
        where.push('st.assigned_admin_id IS NULL');
      } else {
        params.push(assigned);
        where.push(`st.assigned_admin_id = $${params.length}`);
      }
    }

    if (category && category !== 'all') {
      params.push(category);
      where.push(`LOWER(COALESCE(st.issue_type, '')) = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        st.ticket_number ILIKE $${params.length}
        OR st.subject ILIKE $${params.length}
        OR u.full_name ILIKE $${params.length}
        OR u.email ILIKE $${params.length}
        OR COALESCE(st.order_id::text, '') ILIKE $${params.length}
      )`);
    }

    params.push(pageSize, offset);

    const sql = `
      SELECT
        st.id,
        st.ticket_number AS "ticketId",
        st.ticket_type AS "userType",
        st.subject,
        NULL AS "description",
        st.issue_type AS "issueType",
        st.status,
        st.priority,
        st.order_id AS "orderId",
        st.updated_at AS "lastReplyAt",
        NULL AS "closedReason",
        NULL AS "reopenedCount",
        st.created_at AS "createdAt",
        st.updated_at AS "updatedAt",
        NULL AS "resolvedAt",
        COALESCE(st.customer_id, st.seller_id) AS "requesterId",
        u.full_name AS "requesterName",
        u.email AS "requesterEmail",
        u.role AS "requesterRole",
        st.assigned_admin_id AS "assignedAdminId",
        aa.full_name AS "assignedAdminName",
        COUNT(sm.id)::int AS "messageCount"
      FROM public.support_tickets st
      LEFT JOIN public.users u ON u.id = COALESCE(st.customer_id, st.seller_id)
      LEFT JOIN public.users aa ON aa.id = st.assigned_admin_id
      LEFT JOIN public.support_messages sm ON sm.ticket_id = st.id
      WHERE ${where.join(' AND ')}
      GROUP BY st.id, u.id, aa.id
      ORDER BY st.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM public.support_tickets st
      LEFT JOIN public.users u ON u.id = COALESCE(st.customer_id, st.seller_id)
      WHERE ${where.join(' AND ')}
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

async function updateTicketStatus(req, res) {
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
      UPDATE public.support_tickets
      SET
        status = $1,
        assigned_admin_id = COALESCE(assigned_admin_id, $2),
        closed_at = CASE WHEN $1 = 'closed' THEN NOW() ELSE NULL END,
        updated_at = NOW()
      WHERE ticket_number = $3 OR id::text = $3
      RETURNING
        id,
        ticket_number AS "ticketId",
        status,
        assigned_admin_id AS "assignedAdmin",
        closed_at AS "closedAt",
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
}

router.patch('/tickets/:ticketId/status', updateTicketStatus);
router.post('/tickets/:ticketId/status', updateTicketStatus);

router.get('/tickets/:ticketId', async (req, res) => {
  const ticketId = String(req.params.ticketId || '').trim();

  try {
    const ticketSql = `
      SELECT
        st.id,
        st.ticket_number AS "ticketId",
        st.subject,
        NULL AS "description",
        st.issue_type AS "issueType",
        st.status,
        st.priority,
        st.order_id AS "orderId",
        st.created_at AS "createdAt",
        st.updated_at AS "updatedAt",
        COALESCE(st.customer_id, st.seller_id) AS "requesterId",
        u.full_name AS "requesterName",
        u.email AS "requesterEmail",
        u.role AS "requesterRole",
        st.assigned_admin_id AS "assignedAdminId",
        aa.full_name AS "assignedAdminName"
      FROM public.support_tickets st
      LEFT JOIN public.users u ON u.id = COALESCE(st.customer_id, st.seller_id)
      LEFT JOIN public.users aa ON aa.id = st.assigned_admin_id
      WHERE st.ticket_number = $1 OR st.id::text = $1
      LIMIT 1
    `;

    const ticketResult = await req.db.query(ticketSql, [ticketId]);
    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];

    const messagesSql = `
      SELECT
        sm.id,
        sm.ticket_id AS "ticketDbId",
        sm.sender_id AS "senderId",
        u.full_name AS "senderName",
        sm.sender_role AS "senderRole",
        sm.message,
        sm.attachment_url AS "attachmentUrl",
        sm.created_at AS "createdAt"
      FROM public.support_messages sm
      LEFT JOIN public.users u ON u.id = sm.sender_id
      WHERE sm.ticket_id = $1
      ORDER BY sm.created_at ASC
    `;

    const messagesResult = await req.db.query(messagesSql, [ticket.id]);

    const ticketMessages = messagesResult.rows.map((msg) => ({
      ...msg,
      attachments: parseAttachments(msg.attachmentUrl)
    }));

    return res.json({ success: true, data: { ...ticket, messages: ticketMessages } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch ticket', error: error.message });
  }
});

router.get('/tickets/:ticketId/messages', async (req, res) => {
  const ticketId = String(req.params.ticketId || '').trim();

  try {
    const ticketSql = `
      SELECT id
      FROM public.support_tickets
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
        sm.sender_role AS "senderRole",
        sm.message,
        sm.attachment_url AS "attachmentUrl",
        sm.created_at AS "createdAt"
      FROM public.support_messages sm
      LEFT JOIN public.users u ON u.id = sm.sender_id
      WHERE sm.ticket_id = $1
      ORDER BY sm.created_at ASC
    `;

    const messagesResult = await req.db.query(messagesSql, [ticketResult.rows[0].id]);

    const messageRows = messagesResult.rows.map((msg) => ({
      ...msg,
      attachments: parseAttachments(msg.attachmentUrl)
    }));

    return res.json({ success: true, data: messageRows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch ticket messages', error: error.message });
  }
});

async function postTicketReply(req, res) {
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
      FROM public.support_tickets
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
      INSERT INTO public.support_messages (ticket_id, sender_id, sender_role, message, attachment_url, is_internal_note, created_at)
      VALUES ($1, $2, 'admin', $3, $4, FALSE, NOW())
      RETURNING id, ticket_id AS "ticketDbId", sender_id AS "senderId", sender_role AS "senderRole", message, attachment_url AS "attachmentUrl", created_at AS "createdAt"
    `;

    const insertResult = await req.db.query(insertSql, [dbTicketId, adminId, message, attachments.length ? JSON.stringify(attachments) : null]);

    const io = req.app.locals.io;
    if (io) {
      const payload = {
        id: insertResult.rows[0]?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ticketId: ticketId,
        ticketDbId: dbTicketId,
        senderId: adminId,
        senderRole: 'admin',
        senderName: 'Admin',
        message,
        attachments,
        createdAt: insertResult.rows[0]?.createdAt || new Date().toISOString()
      };
      io.to(String(ticketId)).emit('support-message-received', payload);
    }

    await req.db.query(
      `
      UPDATE public.support_tickets
      SET
        assigned_admin_id = COALESCE(assigned_admin_id, $2),
        status = CASE WHEN status IN ('open', 'resolved') THEN 'in_progress' ELSE status END,
        updated_at = NOW()
      WHERE id = $1
      `,
      [dbTicketId, adminId]
    );

    return res.status(201).json({ success: true, message: 'Reply sent', data: insertResult.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to send reply', error: error.message });
  }
}

router.post('/tickets/:ticketId/messages', postTicketReply);
router.post('/tickets/:ticketId/reply', postTicketReply);

async function assignTicketAdmin(req, res) {
  const adminId = await resolveAdminId(req);
  const ticketId = String(req.params.ticketId || '').trim();
  const requestedAssignedAdmin = String(req.body.assignedAdmin || req.body.adminId || '').trim();
  const assignedAdmin = isUuid(requestedAssignedAdmin) ? requestedAssignedAdmin : adminId;

  if (!assignedAdmin) {
    return res.status(400).json({ success: false, message: 'No valid admin user found for assignment' });
  }

  try {
    const sql = `
      UPDATE public.support_tickets
      SET
        assigned_admin_id = $1,
        updated_at = NOW()
      WHERE ticket_number = $2 OR id::text = $2
      RETURNING id, ticket_number AS "ticketId", assigned_admin_id AS "assignedAdmin", updated_at AS "updatedAt"
    `;

    const result = await req.db.query(sql, [assignedAdmin, ticketId]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    return res.json({ success: true, message: 'Ticket assigned', data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to assign ticket', error: error.message });
  }
}

router.patch('/tickets/:ticketId/assign', assignTicketAdmin);
router.post('/tickets/:ticketId/assign', assignTicketAdmin);

async function updateTicketPriority(req, res) {
  const ticketId = String(req.params.ticketId || '').trim();
  const priority = normalizePriority(req.body.priority || req.body.priorityLevel || req.body.level);

  try {
    const sql = `
      UPDATE public.support_tickets
      SET priority = $1,
          updated_at = NOW()
      WHERE ticket_number = $2 OR id::text = $2
      RETURNING id, ticket_number AS "ticketId", priority, updated_at AS "updatedAt"
    `;

    const result = await req.db.query(sql, [priority, ticketId]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    return res.json({ success: true, message: 'Priority updated', data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update ticket priority', error: error.message });
  }
}

router.patch('/tickets/:ticketId/priority', updateTicketPriority);
router.post('/tickets/:ticketId/priority', updateTicketPriority);

router.delete('/tickets/:ticketId', async (req, res) => {
  const ticketId = String(req.params.ticketId || '').trim();

  try {
    const result = await req.db.query(
      `
      DELETE FROM public.support_tickets
      WHERE ticket_number = $1 OR id::text = $1
      RETURNING id
      `,
      [ticketId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    return res.json({ success: true, message: 'Ticket deleted' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete ticket', error: error.message });
  }
});

router.post('/attachments', async (req, res) => {
  try {
    const { filename, content, mimeType } = req.body || {};
    if (!filename || !content) {
      return res.status(400).json({ success: false, message: 'filename and content are required' });
    }

    const safeName = `${Date.now()}-${sanitizeFileName(filename)}`;
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    const fileBuffer = Buffer.from(String(content), 'base64');
    const filePath = path.join(uploadsDir, safeName);
    await fs.promises.writeFile(filePath, fileBuffer);

    const url = `/uploads/support/${safeName}`;
    return res.json({ success: true, data: { url, filename: safeName, mimeType: String(mimeType || '') } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to save attachment', error: error.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const statusResult = await req.db.query(`
      SELECT status, COUNT(*)::int AS count
      FROM public.support_tickets
      GROUP BY status
    `);
    const typeResult = await req.db.query(`
      SELECT COALESCE(issue_type, 'unknown') AS type, COUNT(*)::int AS count
      FROM public.support_tickets
      GROUP BY COALESCE(issue_type, 'unknown')
    `);
    const monthlyResult = await req.db.query(`
      SELECT to_char(created_at, 'YYYY-MM') AS month, COUNT(*)::int AS count
      FROM public.support_tickets
      GROUP BY month
      ORDER BY month
    `);

    return res.json({
      success: true,
      data: {
        byStatus: statusResult.rows.reduce((acc, row) => ({ ...acc, [row.status]: row.count }), {}),
        byType: typeResult.rows.reduce((acc, row) => ({ ...acc, [row.type]: row.count }), {}),
        months: monthlyResult.rows.map((row) => row.month),
        monthCounts: monthlyResult.rows.map((row) => row.count)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch analytics', error: error.message });
  }
});

module.exports = router;
