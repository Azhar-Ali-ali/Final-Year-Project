const express = require('express');

const router = express.Router();

function getCustomerId(req) {
  const raw = req.auth?.session?.userId || req.headers['x-user-id'] || '';
  return String(raw || '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

async function resolveUserId(req, candidate) {
  if (!candidate) return null;
  const raw = String(candidate).trim();
  if (!raw) return null;
  if (isUuid(raw)) return raw;

  const lookup = await req.db.query(
    `
      SELECT id
      FROM public.users
      WHERE id::text = $1
         OR lower(username) = lower($1)
         OR lower(email) = lower($1)
      LIMIT 1
    `,
    [raw]
  );

  return lookup.rows[0]?.id || null;
}

function normalizeLimit(value, fallback = 50, min = 1, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

async function resolveCustomerId(req, requestedId) {
  const candidates = [
    requestedId,
    req.query?.userId,
    req.body?.userId,
    req.headers['x-user-id'],
    req.auth?.session?.userId,
    req.auth?.user?.id,
    getCustomerId(req)
  ];

  for (const candidate of candidates) {
    const resolved = await resolveUserId(req, candidate);
    if (resolved) return resolved;
  }

  return null;
}

async function resolveConversationId(req, customerId, threadId) {
  const normalizedThreadId = String(threadId || '').trim();
  if (!normalizedThreadId) return null;

  const sql = `
    SELECT c.id
    FROM public.conversations c
    JOIN public.conversation_participants cp
      ON cp.conversation_id = c.id
     AND cp.user_id = $1
    WHERE c.id::text = $2
    LIMIT 1
  `;

  const result = await req.db.query(sql, [customerId, normalizedThreadId]);
  return result.rows[0]?.id || null;
}

async function createConversationAndMessage(req, customerId, sellerId, message, attachmentUrl) {
  const sellerUserId = await resolveUserId(req, sellerId);
  if (!sellerUserId) {
    throw new Error('Seller not found');
  }

  const conversationResult = await req.db.query(
    `
      INSERT INTO public.conversations (topic, conversation_type, created_by, created_at, updated_at)
      VALUES ($1, 'direct', $2, NOW(), NOW())
      RETURNING id
    `,
    [`Conversation with seller ${sellerUserId}`, customerId]
  );

  const conversationId = conversationResult.rows[0]?.id;
  if (!conversationId) {
    throw new Error('Failed to create conversation');
  }

  await req.db.query(
    `
      INSERT INTO public.conversation_participants (conversation_id, user_id, role_in_conversation, joined_at, last_read_at)
      VALUES ($1, $2, 'customer', NOW(), NOW()), ($1, $3, 'seller', NOW(), NOW())
    `,
    [conversationId, customerId, sellerUserId]
  );

  const insertSql = `
    INSERT INTO public.conversation_messages (
      conversation_id,
      sender_id,
      message,
      attachments,
      is_deleted,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4::jsonb, FALSE, NOW(), NOW())
    RETURNING
      id,
      conversation_id AS "conversationId",
      sender_id AS "senderId",
      message,
      created_at AS "createdAt"
  `;

  const inserted = await req.db.query(insertSql, [
    conversationId,
    customerId,
    message || '[Attachment]',
    JSON.stringify(attachmentUrl ? [{ url: attachmentUrl }] : [])
  ]);

  return inserted.rows[0];
}

router.get('/threads', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const limit = normalizeLimit(req.query.limit, 50);

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const sql = `
      SELECT
        c.id,
        c.topic AS subject,
        c.order_id AS "orderDbId",
        o.order_number AS "orderId",
        c.conversation_type AS "conversationType",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        seller.user_id AS "sellerId",
        u.full_name AS "sellerName",
        sp.store_name AS "storeName",
        last_message.message AS "lastMessagePreview",
        last_message.created_at AS "lastMessageAt",
        COALESCE(unread.unread_count, 0)::int AS "unreadCount"
      FROM public.conversations c
      JOIN public.conversation_participants customer_participant
        ON customer_participant.conversation_id = c.id
       AND customer_participant.user_id = $1
      LEFT JOIN LATERAL (
        SELECT cp.user_id
        FROM public.conversation_participants cp
        WHERE cp.conversation_id = c.id
          AND cp.user_id <> $1
        ORDER BY cp.joined_at ASC
        LIMIT 1
      ) seller ON TRUE
      LEFT JOIN public.users u ON u.id = seller.user_id
      LEFT JOIN public.seller_profiles sp ON sp.user_id = seller.user_id
      LEFT JOIN public.orders o ON o.id = c.order_id
      LEFT JOIN LATERAL (
        SELECT cm.message, cm.created_at
        FROM public.conversation_messages cm
        WHERE cm.conversation_id = c.id
          AND cm.is_deleted = FALSE
        ORDER BY cm.created_at DESC
        LIMIT 1
      ) last_message ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS unread_count
        FROM public.conversation_messages cm
        WHERE cm.conversation_id = c.id
          AND cm.sender_id <> $1
          AND cm.created_at > COALESCE(customer_participant.last_read_at, '1970-01-01'::timestamptz)
          AND cm.is_deleted = FALSE
      ) unread ON TRUE
      ORDER BY COALESCE(last_message.created_at, c.updated_at, c.created_at) DESC
      LIMIT $2
    `;

    const result = await req.db.query(sql, [customerId, limit]);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch message threads', error: error.message });
  }
});

router.get('/threads/:threadId/messages', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const threadId = String(req.params.threadId || '').trim();
  const limit = normalizeLimit(req.query.limit, 100);

  if (!threadId) {
    return res.status(400).json({ success: false, message: 'Invalid thread id' });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const conversationId = await resolveConversationId(req, customerId, threadId);
    if (!conversationId) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const sql = `
      SELECT
        cm.id,
        cm.conversation_id AS "conversationId",
        cm.sender_id AS "senderId",
        CASE WHEN cm.sender_id = $1 THEN 'customer' ELSE 'seller' END AS sender,
        u.full_name AS "senderName",
        cm.message,
        cm.created_at AS "createdAt"
      FROM public.conversation_messages cm
      JOIN public.users u ON u.id = cm.sender_id
      WHERE cm.conversation_id = $2
        AND cm.is_deleted = FALSE
      ORDER BY cm.created_at ASC
      LIMIT $3
    `;

    const result = await req.db.query(sql, [customerId, conversationId, limit]);

    await req.db.query(
      `
      UPDATE public.conversation_participants
      SET last_read_at = NOW()
      WHERE conversation_id = $1 AND user_id = $2
      `,
      [conversationId, customerId]
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch conversation messages', error: error.message });
  }
});

router.post('/threads/:threadId/messages', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const threadId = String(req.params.threadId || '').trim();
  const message = String(req.body.message || '').trim();
  const attachmentUrl = String(req.body.attachmentUrl || '').trim();

  if (!threadId) {
    return res.status(400).json({ success: false, message: 'Invalid thread id' });
  }

  if (!message && !attachmentUrl) {
    return res.status(400).json({ success: false, message: 'message or attachmentUrl is required' });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    let conversationId = await resolveConversationId(req, customerId, threadId);
    if (!conversationId) {
      const created = await createConversationAndMessage(req, customerId, threadId, message, attachmentUrl);
      const payload = {
        id: created?.id,
        conversationId: created?.conversationId || conversationId,
        senderId: customerId,
        sender: 'customer',
        text: created?.message || message,
        attachmentUrl,
        createdAt: created?.createdAt,
        time: created?.createdAt
      };
      req.app.locals.io?.to(String(created?.conversationId || threadId)).emit('message-received', payload);
      return res.status(201).json({ success: true, data: created });
    }

    const insertSql = `
      INSERT INTO public.conversation_messages (
        conversation_id,
        sender_id,
        message,
        attachments,
        is_deleted,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, FALSE, NOW(), NOW())
      RETURNING
        id,
        conversation_id AS "conversationId",
        sender_id AS "senderId",
        message,
        created_at AS "createdAt"
    `;

    const inserted = await req.db.query(insertSql, [
      conversationId,
      customerId,
      message || '[Attachment]',
      JSON.stringify(attachmentUrl ? [{ url: attachmentUrl }] : [])
    ]);

    await req.db.query(
      `
      UPDATE public.conversation_participants
      SET last_read_at = NOW()
      WHERE conversation_id = $1 AND user_id = $2
      `,
      [conversationId, customerId]
    );

    await req.db.query(
      `
      UPDATE public.conversations
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [conversationId]
    );

    const payload = {
      id: inserted.rows[0]?.id,
      conversationId: inserted.rows[0]?.conversationId || conversationId,
      senderId: customerId,
      sender: 'customer',
      text: inserted.rows[0]?.message || message,
      attachmentUrl,
      createdAt: inserted.rows[0]?.createdAt,
      time: inserted.rows[0]?.createdAt
    };
    req.app.locals.io?.to(String(conversationId)).emit('message-received', payload);

    return res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to send message', error: error.message });
  }
});

router.patch('/threads/:threadId/read', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const threadId = String(req.params.threadId || '').trim();

  if (!threadId) {
    return res.status(400).json({ success: false, message: 'Invalid thread id' });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const conversationId = await resolveConversationId(req, customerId, threadId);
    if (!conversationId) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    await req.db.query(
      `
      UPDATE public.conversation_participants
      SET last_read_at = NOW()
      WHERE conversation_id = $1 AND user_id = $2
      `,
      [conversationId, customerId]
    );

    return res.json({ success: true, message: 'Conversation marked as read' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update read state', error: error.message });
  }
});

module.exports = router;
