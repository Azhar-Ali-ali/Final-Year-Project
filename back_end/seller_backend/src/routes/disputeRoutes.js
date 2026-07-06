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

function statusLabel(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'in_progress') return 'In Progress';
  if (value === 'resolved') return 'Resolved';
  if (value === 'closed') return 'Closed';
  return 'Open';
}

function statusDbValue(status) {
  const value = String(status || '').trim().toLowerCase();
  if (!value || value === 'all') return '';
  if (value === 'in progress' || value === 'in_progress') return 'in_progress';
  if (value === 'resolved') return 'resolved';
  if (value === 'closed') return 'closed';
  return 'open';
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function parseDescriptionPayload(description, fallbackCategory) {
  if (!description) {
    return { orderId: '', issueType: fallbackCategory || 'Other', message: '' };
  }

  try {
    const parsed = JSON.parse(description);
    if (parsed && typeof parsed === 'object') {
      return {
        orderId: String(parsed.orderId || ''),
        issueType: String(parsed.issueType || fallbackCategory || 'Other'),
        message: String(parsed.message || ''),
        attachments: safeArray(parsed.attachments)
      };
    }
  } catch (_) {
    // Non-JSON descriptions are treated as plain message text.
  }

  return {
    orderId: '',
    issueType: String(fallbackCategory || 'Other'),
    message: String(description || ''),
    attachments: []
  };
}

function mapTicketRow(row) {
  const payload = parseDescriptionPayload(row.description, row.category);
  const initialAttachments = safeArray(row.initial_attachments || payload.attachments || []);

  return {
    id: row.ticket_number,
    ticketId: row.id,
    orderId: payload.orderId,
    issueType: payload.issueType,
    subject: row.subject,
    message: payload.message || row.latest_message || '',
    attachments: initialAttachments,
    status: statusLabel(row.status),
    createdAt: row.created_at
  };
}

async function getSellerProfileUserId(req, sellerId) {
  const result = await req.db.query(
    `
      SELECT sp.user_id
      FROM public.seller_profiles sp
      WHERE sp.user_id::text = $1
      LIMIT 1
    `,
    [sellerId]
  );

  return result.rows[0]?.user_id || null;
}

async function fetchTickets(req, sellerId, { status = '', search = '' } = {}) {
  const params = [sellerId];
  const where = [
    'st.requester_id::text = $1',
    'EXISTS (SELECT 1 FROM lumina.seller_profiles sp WHERE sp.user_id = st.requester_id)'
  ];

  const normalizedStatus = statusDbValue(status);
  if (normalizedStatus) {
    params.push(normalizedStatus);
    where.push(`st.status::text = $${params.length}`);
  }

  const searchTerm = String(search || '').trim();
  if (searchTerm) {
    params.push(`%${searchTerm}%`);
    where.push(`(st.ticket_number ILIKE $${params.length} OR st.subject ILIKE $${params.length} OR st.description ILIKE $${params.length})`);
  }

  const result = await req.db.query(
    `
      SELECT
        st.id,
        st.ticket_number,
        st.subject,
        st.description,
        st.category,
        st.status,
        st.created_at,
        last_msg.message AS latest_message,
        first_msg.attachments AS initial_attachments
      FROM lumina.support_tickets st
      LEFT JOIN LATERAL (
        SELECT sm.message
        FROM lumina.support_messages sm
        WHERE sm.ticket_id = st.id
        ORDER BY sm.created_at DESC
        LIMIT 1
      ) last_msg ON true
      LEFT JOIN LATERAL (
        SELECT sm.attachments
        FROM lumina.support_messages sm
        WHERE sm.ticket_id = st.id
        ORDER BY sm.created_at ASC
        LIMIT 1
      ) first_msg ON true
      WHERE ${where.join(' AND ')}
      ORDER BY st.created_at DESC
    `,
    params
  );

  return result.rows.map(mapTicketRow);
}

router.get('/overview', async (req, res) => {
  const sellerId = await resolveSellerId(req);

  if (!sellerId) {
    return res.json({
      success: true,
      data: { totalTickets: 0, openTickets: 0, inProgressTickets: 0 }
    });
  }

  try {
    const result = await req.db.query(
      `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'open')::int AS open,
          COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress
        FROM lumina.support_tickets st
        WHERE st.requester_id::text = $1
          AND EXISTS (SELECT 1 FROM lumina.seller_profiles sp WHERE sp.user_id = st.requester_id)
      `,
      [sellerId]
    );

    const row = result.rows[0] || { total: 0, open: 0, in_progress: 0 };
    return res.json({
      success: true,
      data: {
        totalTickets: Number(row.total || 0),
        openTickets: Number(row.open || 0),
        inProgressTickets: Number(row.in_progress || 0)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch overview', error: error.message });
  }
});

router.get('/tickets', async (req, res) => {
  const sellerId = await resolveSellerId(req);

  if (!sellerId) {
    return res.json({ success: true, data: [] });
  }

  try {
    const tickets = await fetchTickets(req, sellerId, {
      status: req.query.status,
      search: req.query.search
    });

    return res.json({ success: true, data: tickets });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch tickets', error: error.message });
  }
});

router.post('/tickets', async (req, res) => {
  const sellerId = await resolveSellerId(req);
  const orderId = String(req.body.orderId || '').trim();
  const issueType = String(req.body.issueType || 'Other').trim() || 'Other';
  const subject = String(req.body.subject || '').trim();
  const message = String(req.body.message || '').trim();
  const attachments = safeArray(req.body.attachments);

  if (!subject || !message) {
    return res.status(400).json({ success: false, message: 'Missing required fields: subject and message' });
  }

  try {
    const requesterId = await getSellerProfileUserId(req, sellerId);
    if (!requesterId) {
      return res.status(404).json({ success: false, message: 'Seller account not found' });
    }

    const payload = JSON.stringify({ orderId, issueType, message, attachments });

    const ticketResult = await req.db.query(
      `
        INSERT INTO lumina.support_tickets (
          ticket_number,
          requester_id,
          subject,
          description,
          category,
          source,
          priority,
          status,
          last_reply_at,
          last_reply_by,
          created_at,
          updated_at
        )
        VALUES (
          CONCAT('TK-', UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6))),
          $1,
          $2,
          $3,
          $4,
          'seller_dispute_page',
          'normal',
          'open',
          NOW(),
          $1,
          NOW(),
          NOW()
        )
        RETURNING id, ticket_number, subject, description, category, status, created_at
      `,
      [requesterId, subject, payload, issueType]
    );

    const createdTicket = ticketResult.rows[0];

    await req.db.query(
      `
        INSERT INTO lumina.support_messages (ticket_id, sender_id, message, attachments, created_at)
        VALUES ($1, $2, $3, $4::jsonb, NOW())
      `,
      [createdTicket.id, requesterId, message, JSON.stringify(attachments)]
    );

    return res.status(201).json({
      success: true,
      message: 'Ticket created successfully',
      data: mapTicketRow({ ...createdTicket, latest_message: message, initial_attachments: attachments })
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create ticket', error: error.message });
  }
});

router.get('/tickets/:ticketId', async (req, res) => {
  const sellerId = await resolveSellerId(req);
  const ticketId = String(req.params.ticketId || '').trim();

  try {
    const result = await req.db.query(
      `
        SELECT id, ticket_number, subject, description, category, status, created_at
        FROM lumina.support_tickets
        WHERE requester_id::text = $1
          AND (id::text = $2 OR ticket_number = $2)
        LIMIT 1
      `,
      [sellerId, ticketId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    return res.json({ success: true, data: mapTicketRow(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch ticket', error: error.message });
  }
});

router.get('/tickets/:ticketId/messages', async (req, res) => {
  const sellerId = await resolveSellerId(req);
  const ticketId = String(req.params.ticketId || '').trim();

  try {
    const ticketResult = await req.db.query(
      `
        SELECT id
        FROM lumina.support_tickets
        WHERE requester_id::text = $1
          AND (id::text = $2 OR ticket_number = $2)
        LIMIT 1
      `,
      [sellerId, ticketId]
    );

    if (!ticketResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const dbTicketId = ticketResult.rows[0].id;

    const messagesResult = await req.db.query(
      `
        SELECT
          sm.id,
          sm.message,
          sm.attachments,
          sm.created_at,
          CASE
            WHEN u.role = 'admin' THEN 'admin'
            ELSE 'seller'
          END AS sender_type
        FROM lumina.support_messages sm
        JOIN lumina.users u ON u.id = sm.sender_id
        WHERE sm.ticket_id = $1
        ORDER BY sm.created_at ASC
      `,
      [dbTicketId]
    );

    const messages = messagesResult.rows.map((row) => ({
      id: row.id,
      from: row.sender_type,
      text: row.message,
      attachments: safeArray(row.attachments),
      createdAt: row.created_at
    }));

    return res.json({ success: true, data: messages });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch messages', error: error.message });
  }
});

router.post('/tickets/:ticketId/messages', async (req, res) => {
  const sellerId = await resolveSellerId(req);
  const ticketId = String(req.params.ticketId || '').trim();
  const message = String(req.body.message || '').trim();
  const attachments = safeArray(req.body.attachments);

  if (!message) {
    return res.status(400).json({ success: false, message: 'Message is required' });
  }

  try {
    const insertResult = await req.db.query(
      `
        WITH target AS (
          SELECT id, requester_id
          FROM lumina.support_tickets
          WHERE requester_id::text = $1
            AND (id::text = $2 OR ticket_number = $2)
          LIMIT 1
        ),
        inserted AS (
          INSERT INTO lumina.support_messages (ticket_id, sender_id, message, attachments, created_at)
          SELECT id, requester_id, $3, $4::jsonb, NOW()
          FROM target
          RETURNING id, ticket_id, message, attachments, created_at
        )
        UPDATE lumina.support_tickets st
        SET last_reply_at = NOW(),
            last_reply_by = st.requester_id,
            updated_at = NOW()
        FROM inserted i
        WHERE st.id = i.ticket_id
        RETURNING i.id, i.message, i.attachments, i.created_at
      `,
      [sellerId, ticketId, message, JSON.stringify(attachments)]
    );

    if (!insertResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const row = insertResult.rows[0];

    return res.status(201).json({
      success: true,
      message: 'Reply sent',
      data: {
        id: row.id,
        from: 'seller',
        text: row.message,
        attachments: safeArray(row.attachments),
        createdAt: row.created_at
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to send reply', error: error.message });
  }
});

// Backward-compatible list endpoint for older pages.
router.get('/', async (req, res) => {
  const sellerId = await resolveSellerId(req);

  if (!sellerId) {
    return res.json({
      success: true,
      data: [],
      pagination: {
        currentPage: 1,
        pageSize: 0,
        totalItems: 0,
        totalPages: 1
      }
    });
  }

  try {
    const tickets = await fetchTickets(req, sellerId, {
      status: req.query.status,
      search: req.query.search
    });

    return res.json({
      success: true,
      data: tickets,
      pagination: {
        currentPage: 1,
        pageSize: tickets.length,
        totalItems: tickets.length,
        totalPages: 1
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch disputes', error: error.message });
  }
});

// Backward-compatible create endpoint for older pages.
router.post('/', async (req, res) => {
  const sellerId = await resolveSellerId(req);
  const orderId = String(req.body.orderId || '').trim();
  const issueType = String(req.body.type || req.body.issueType || 'Other').trim() || 'Other';
  const subject = String(req.body.subject || req.body.type || 'Support request').trim();
  const message = String(req.body.description || req.body.message || '').trim();
  const attachments = safeArray(req.body.evidence || req.body.attachments || []);

  if (!subject || !message) {
    return res.status(400).json({ success: false, message: 'Missing required fields: subject and message' });
  }

  try {
    const requesterId = await getSellerProfileUserId(req, sellerId);
    if (!requesterId) {
      return res.status(404).json({ success: false, message: 'Seller account not found' });
    }

    const payload = JSON.stringify({ orderId, issueType, message, attachments });

    const ticketResult = await req.db.query(
      `
        INSERT INTO lumina.support_tickets (
          ticket_number,
          requester_id,
          subject,
          description,
          category,
          source,
          priority,
          status,
          last_reply_at,
          last_reply_by,
          created_at,
          updated_at
        )
        VALUES (
          CONCAT('TK-', UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6))),
          $1,
          $2,
          $3,
          $4,
          'seller_dispute_page',
          'normal',
          'open',
          NOW(),
          $1,
          NOW(),
          NOW()
        )
        RETURNING id, ticket_number, subject, description, category, status, created_at
      `,
      [requesterId, subject, payload, issueType]
    );

    const createdTicket = ticketResult.rows[0];

    await req.db.query(
      `
        INSERT INTO lumina.support_messages (ticket_id, sender_id, message, attachments, created_at)
        VALUES ($1, $2, $3, $4::jsonb, NOW())
      `,
      [createdTicket.id, requesterId, message, JSON.stringify(attachments)]
    );

    return res.status(201).json({
      success: true,
      message: 'Dispute created successfully',
      data: mapTicketRow({ ...createdTicket, latest_message: message, initial_attachments: attachments })
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create dispute', error: error.message });
  }
});

router.get('/notifications/list', async (req, res) => {
  const sellerId = await resolveSellerId(req);

  if (!sellerId) {
    return res.json({ success: true, data: [], unreadCount: 0, totalCount: 0 });
  }

  try {
    const result = await req.db.query(
      `
        SELECT
          st.ticket_number,
          st.subject,
          st.status,
          st.updated_at
        FROM lumina.support_tickets st
        WHERE st.requester_id::text = $1
          AND EXISTS (SELECT 1 FROM lumina.seller_profiles sp WHERE sp.user_id = st.requester_id)
        ORDER BY st.updated_at DESC
        LIMIT 20
      `,
      [sellerId]
    );

    const notifications = result.rows.map((row, index) => ({
      id: `NTF-${index + 1}`,
      type: 'info',
      title: `Ticket ${row.ticket_number} updated`,
      text: `${row.subject} (${statusLabel(row.status)})`,
      date: row.updated_at,
      read: true
    }));

    return res.json({
      success: true,
      data: notifications,
      unreadCount: 0,
      totalCount: notifications.length
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications', error: error.message });
  }
});

router.post('/notifications/:notifId/read', (req, res) => {
  return res.json({ success: true, message: 'Notification marked as read' });
});

// Backward-compatible detail endpoint for older pages.
router.get('/:disputeId', async (req, res) => {
  const sellerId = await resolveSellerId(req);
  const disputeId = String(req.params.disputeId || '').trim();

  try {
    const result = await req.db.query(
      `
        SELECT id, ticket_number, subject, description, category, status, created_at
        FROM lumina.support_tickets
        WHERE requester_id::text = $1
          AND (id::text = $2 OR ticket_number = $2)
        LIMIT 1
      `,
      [sellerId, disputeId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Dispute not found' });
    }

    return res.json({ success: true, data: mapTicketRow(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch dispute', error: error.message });
  }
});

module.exports = router;
