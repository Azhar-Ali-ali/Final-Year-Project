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

function normalizeLimit(value, fallback = 50, min = 1, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function avatarForName(name) {
  const encoded = encodeURIComponent(String(name || 'Seller').trim() || 'Seller');
  return `https://ui-avatars.com/api/?name=${encoded}&background=random&color=ffffff&size=80`;
}

async function getConversationThread(req, sellerId, threadId) {
  const result = await req.db.query(
    `
      SELECT
        c.id,
        c.topic,
        c.conversation_type,
        c.order_id,
        c.support_ticket_id,
        c.dispute_id,
        c.created_at,
        c.updated_at,
        seller_participant.last_read_at,
        counterpart.user_id AS counterpart_id,
        u.full_name AS counterpart_name,
        COALESCE(sp.store_name, '') AS counterpart_store_name,
        last_message.message AS last_message,
        last_message.created_at AS last_message_at,
        COALESCE(unread.unread_count, 0)::int AS unread_count
      FROM lumina.conversations c
      JOIN lumina.conversation_participants seller_participant
        ON seller_participant.conversation_id = c.id
       AND seller_participant.user_id = $1
      LEFT JOIN LATERAL (
        SELECT cp.user_id
        FROM lumina.conversation_participants cp
        WHERE cp.conversation_id = c.id
          AND cp.user_id <> $1
        ORDER BY cp.joined_at ASC
        LIMIT 1
      ) counterpart ON TRUE
      LEFT JOIN lumina.users u ON u.id = counterpart.user_id
      LEFT JOIN lumina.seller_profiles sp ON sp.user_id = counterpart.user_id
      LEFT JOIN LATERAL (
        SELECT cm.message, cm.created_at
        FROM lumina.conversation_messages cm
        WHERE cm.conversation_id = c.id
          AND cm.is_deleted = FALSE
        ORDER BY cm.created_at DESC
        LIMIT 1
      ) last_message ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS unread_count
        FROM lumina.conversation_messages cm
        WHERE cm.conversation_id = c.id
          AND cm.sender_id <> $1
          AND cm.created_at > COALESCE(seller_participant.last_read_at, '1970-01-01'::timestamptz)
          AND cm.is_deleted = FALSE
      ) unread ON TRUE
      WHERE c.id = $2
      LIMIT 1
    `,
    [sellerId, threadId]
  );

  return result.rows[0] || null;
}

router.get('/threads', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const result = await req.db.query(
      `
        SELECT
          c.id,
          c.topic,
          c.conversation_type,
          c.order_id,
          c.support_ticket_id,
          c.dispute_id,
          c.created_at,
          c.updated_at,
          seller_participant.last_read_at,
          counterpart.user_id AS counterpart_id,
          u.full_name AS counterpart_name,
          COALESCE(sp.store_name, '') AS counterpart_store_name,
          last_message.message AS last_message,
          last_message.created_at AS last_message_at,
          COALESCE(unread.unread_count, 0)::int AS unread_count
        FROM lumina.conversations c
        JOIN lumina.conversation_participants seller_participant
          ON seller_participant.conversation_id = c.id
         AND seller_participant.user_id = $1
        LEFT JOIN LATERAL (
          SELECT cp.user_id
          FROM lumina.conversation_participants cp
          WHERE cp.conversation_id = c.id
            AND cp.user_id <> $1
          ORDER BY cp.joined_at ASC
          LIMIT 1
        ) counterpart ON TRUE
        LEFT JOIN lumina.users u ON u.id = counterpart.user_id
        LEFT JOIN lumina.seller_profiles sp ON sp.user_id = counterpart.user_id
        LEFT JOIN LATERAL (
          SELECT cm.message, cm.created_at
          FROM lumina.conversation_messages cm
          WHERE cm.conversation_id = c.id
            AND cm.is_deleted = FALSE
          ORDER BY cm.created_at DESC
          LIMIT 1
        ) last_message ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS unread_count
          FROM lumina.conversation_messages cm
          WHERE cm.conversation_id = c.id
            AND cm.sender_id <> $1
            AND cm.created_at > COALESCE(seller_participant.last_read_at, '1970-01-01'::timestamptz)
            AND cm.is_deleted = FALSE
        ) unread ON TRUE
        ORDER BY COALESCE(last_message.created_at, c.updated_at, c.created_at) DESC
      `,
      [sellerId]
    );

    const data = result.rows.map((row) => {
      const counterpartName = row.counterpart_name || row.counterpart_store_name || row.topic || 'Conversation';
      const lastMessage = row.last_message || 'No messages yet';
      const contextPieces = [];

      if (row.conversation_type === 'order') {
        contextPieces.push('Order conversation');
      } else if (row.conversation_type === 'support') {
        contextPieces.push('Support conversation');
      } else if (row.conversation_type === 'dispute') {
        contextPieces.push('Dispute conversation');
      }

      if (row.topic) {
        contextPieces.push(row.topic);
      }

      if (row.order_id) {
        contextPieces.push(`Order ${row.order_id}`);
      }

      return {
        id: row.id,
        name: counterpartName,
        avatar: avatarForName(counterpartName),
        context: contextPieces.length ? contextPieces.join(' | ') : lastMessage,
        unreadCount: Number(row.unread_count || 0),
        lastMessage,
        lastMessageAt: row.last_message_at,
        conversationType: row.conversation_type,
        threadCode: row.id
      };
    });

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch seller conversations', error: error.message });
  }
});

router.get('/threads/:threadId/messages', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const threadId = String(req.params.threadId || '').trim();
    const thread = await getConversationThread(req, sellerId, threadId);
    if (!thread) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const limit = normalizeLimit(req.query.limit, 100);
    const result = await req.db.query(
      `
        SELECT
          cm.id,
          cm.sender_id AS "senderId",
          u.full_name AS "senderName",
          cm.message,
          cm.attachments,
          cm.created_at AS "createdAt"
        FROM lumina.conversation_messages cm
        JOIN lumina.users u ON u.id = cm.sender_id
        WHERE cm.conversation_id = $1
          AND cm.is_deleted = FALSE
        ORDER BY cm.created_at ASC
        LIMIT $2
      `,
      [threadId, limit]
    );

    await req.db.query(
      `
        UPDATE lumina.conversation_participants
        SET last_read_at = NOW()
        WHERE conversation_id = $1 AND user_id = $2
      `,
      [threadId, sellerId]
    );

    const data = result.rows.map((row) => ({
      id: row.id,
      senderId: row.senderId,
      senderName: row.senderName,
      sender: String(row.senderId) === String(sellerId) ? 'seller' : 'customer',
      text: row.message,
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      time: row.createdAt,
      createdAt: row.createdAt
    }));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch conversation messages', error: error.message });
  }
});

router.post('/threads/:threadId/messages', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const threadId = String(req.params.threadId || '').trim();
    const thread = await getConversationThread(req, sellerId, threadId);
    if (!thread) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const message = String(req.body.message || '').trim();
    const attachmentUrl = String(req.body.attachmentUrl || '').trim();

    if (!message && !attachmentUrl) {
      return res.status(400).json({ success: false, message: 'message or attachmentUrl is required' });
    }

    const insertResult = await req.db.query(
      `
        INSERT INTO lumina.conversation_messages (
          conversation_id,
          sender_id,
          message,
          attachments,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
        RETURNING id, conversation_id AS "conversationId", sender_id AS "senderId", message, attachments, created_at AS "createdAt"
      `,
      [
        threadId,
        sellerId,
        message || '[Attachment]',
        JSON.stringify(attachmentUrl ? [{ url: attachmentUrl }] : [])
      ]
    );

    await req.db.query(
      `
        UPDATE lumina.conversation_participants
        SET last_read_at = NOW()
        WHERE conversation_id = $1 AND user_id = $2
      `,
      [threadId, sellerId]
    );

    const inserted = insertResult.rows[0];
    return res.status(201).json({
      success: true,
      data: {
        id: inserted.id,
        senderId: inserted.senderId,
        sender: 'seller',
        text: inserted.message,
        attachments: Array.isArray(inserted.attachments) ? inserted.attachments : [],
        time: inserted.createdAt,
        createdAt: inserted.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to send message', error: error.message });
  }
});

router.patch('/threads/:threadId/read', async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const threadId = String(req.params.threadId || '').trim();
    const thread = await getConversationThread(req, sellerId, threadId);
    if (!thread) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    await req.db.query(
      `
        UPDATE lumina.conversation_participants
        SET last_read_at = NOW()
        WHERE conversation_id = $1 AND user_id = $2
      `,
      [threadId, sellerId]
    );

    return res.json({ success: true, message: 'Conversation marked as read' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to mark conversation as read', error: error.message });
  }
});

module.exports = router;