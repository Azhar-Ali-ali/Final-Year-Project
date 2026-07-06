const express = require('express');
const data = require('../data/reviewsRatingsData');

const router = express.Router();

function getAdminId(req) {
  return String(req.headers['x-admin-id'] || req.body?.adminId || req.query?.adminId || '').trim() || null;
}

async function getReviewById(db, id) {
  const reviews = await data.fetchReviews(db);
  return reviews.find((r) => String(r.id) === String(id));
}

router.get('/overview', async (req, res) => {
  try {
    const reviews = await data.fetchReviews(req.db);
    return res.json({ success: true, data: data.getOverviewStats(reviews) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch overview', error: error.message });
  }
});

router.get('/reviews', async (req, res) => {
  try {
    const reviews = await data.fetchReviews(req.db);
    const result = data.filterReviews(reviews, req.query || {});
    return res.json({
      success: true,
      data: result.reviews,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch reviews', error: error.message });
  }
});

router.get('/reviews/:id', async (req, res) => {
  try {
    const review = await getReviewById(req.db, req.params.id);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });

    const details = await req.db.query(
      `
        SELECT
          pr.id,
          p.category_id,
          c.name AS category_name,
          bu.id AS buyer_id,
          bu.full_name AS buyer_name,
          bu.email AS buyer_email,
          su.id AS seller_id,
          COALESCE(sp.store_name, su.full_name) AS seller_name
        FROM public.product_reviews pr
        JOIN public.products p ON p.id = pr.product_id
        LEFT JOIN public.categories c ON c.id = p.category_id
        JOIN public.users bu ON bu.id = pr.customer_id
        JOIN public.users su ON su.id = p.seller_id
        LEFT JOIN public.seller_profiles sp ON sp.user_id = su.id
        WHERE pr.id = $1
        LIMIT 1
      `,
      [req.params.id]
    );

    const row = details.rows[0] || {};
    return res.json({
      success: true,
      data: {
        review,
        buyerProfile: {
          buyerId: row.buyer_id,
          name: row.buyer_name,
          email: row.buyer_email,
          trustScore: 80,
          hasProfileImage: true,
          purchases: 0,
          reviews: 0,
          avgRating: 0
        },
        sellerProfile: {
          sellerId: row.seller_id,
          name: row.seller_name,
          avgRating: 0,
          totalReviews: 0,
          trustScore: 80,
          riskScore: review.riskScore,
          suspension: false
        },
        product: {
          id: review.productId,
          name: review.productName,
          category: row.category_name || 'General',
          avgRating: 0,
          reviewCount: 0
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch review details', error: error.message });
  }
});

router.post('/reviews/:id/approve', async (req, res) => {
  try {
    const review = await getReviewById(req.db, req.params.id);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });

    await data.upsertReviewMeta(req.db, review.id, {
      status: 'approved',
      denialReason: null,
      approvedBy: getAdminId(req),
      approvalDate: new Date().toISOString()
    });
    await data.logAudit(req.db, 'review_approved', 'review', review.id, 'Review approved', review.status, 'approved', getAdminId(req));

    const updated = await getReviewById(req.db, req.params.id);
    return res.json({ success: true, data: updated, message: 'Review approved and published' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reviews/:id/deny', async (req, res) => {
  try {
    const { reason, notes } = req.body || {};
    if (!reason) return res.status(400).json({ success: false, error: 'Denial reason is required' });

    const review = await getReviewById(req.db, req.params.id);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });

    await data.upsertReviewMeta(req.db, review.id, { status: 'denied', denialReason: reason });
    await req.db.query('UPDATE public.product_reviews SET is_hidden = TRUE, updated_at = NOW() WHERE id = $1', [review.id]);
    await data.logAudit(req.db, 'review_denied', 'review', review.id, `Reason: ${reason}. Notes: ${notes || ''}`, review.status, 'denied', getAdminId(req));

    const updated = await getReviewById(req.db, req.params.id);
    return res.json({ success: true, data: updated, message: 'Review denied and hidden from platform' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reviews/:id/flag', async (req, res) => {
  try {
    const reason = req.body?.reason || 'Flagged for manual investigation';
    const review = await getReviewById(req.db, req.params.id);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });

    await data.upsertReviewMeta(req.db, review.id, { status: 'flagged' });
    await data.logAudit(req.db, 'review_flagged', 'review', review.id, reason, review.status, 'flagged', getAdminId(req));

    const updated = await getReviewById(req.db, req.params.id);
    return res.json({ success: true, data: updated, message: 'Review flagged for investigation' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/reviews/:id', async (req, res) => {
  try {
    const reason = req.body?.reason || 'fake_review';
    const review = await getReviewById(req.db, req.params.id);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });

    await data.upsertReviewMeta(req.db, review.id, { status: 'deleted' });
    await req.db.query('UPDATE public.product_reviews SET is_hidden = TRUE, updated_at = NOW() WHERE id = $1', [review.id]);
    await data.logAudit(req.db, 'review_deleted', 'review', review.id, reason, review.status, 'deleted', getAdminId(req));

    return res.json({ success: true, message: 'Review permanently deleted' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reviews/bulk/approve', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.reviewIds) ? req.body.reviewIds : [];
    if (!ids.length) return res.status(400).json({ success: false, error: 'Review IDs array is required' });

    let approvedCount = 0;
    for (const id of ids) {
      const review = await getReviewById(req.db, id);
      if (review) {
        await data.upsertReviewMeta(req.db, review.id, {
          status: 'approved',
          denialReason: null,
          approvedBy: getAdminId(req),
          approvalDate: new Date().toISOString()
        });
        await data.logAudit(req.db, 'review_approved', 'review', review.id, 'Bulk approval', review.status, 'approved', getAdminId(req));
        approvedCount += 1;
      }
    }

    return res.json({ success: true, data: { approvedCount, requestedCount: ids.length }, message: `${approvedCount} reviews approved` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reviews/bulk/deny', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.reviewIds) ? req.body.reviewIds : [];
    const reason = req.body?.reason;
    if (!ids.length) return res.status(400).json({ success: false, error: 'Review IDs array is required' });
    if (!reason) return res.status(400).json({ success: false, error: 'Denial reason is required' });

    let deniedCount = 0;
    for (const id of ids) {
      const review = await getReviewById(req.db, id);
      if (review) {
        await data.upsertReviewMeta(req.db, review.id, { status: 'denied', denialReason: reason });
        await req.db.query('UPDATE public.product_reviews SET is_hidden = TRUE, updated_at = NOW() WHERE id = $1', [review.id]);
        await data.logAudit(req.db, 'review_denied', 'review', review.id, `Bulk denial. Reason: ${reason}`, review.status, 'denied', getAdminId(req));
        deniedCount += 1;
      }
    }

    return res.json({ success: true, data: { deniedCount, requestedCount: ids.length }, message: `${deniedCount} reviews denied` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reviews/:id/seller-response', async (req, res) => {
  try {
    const responseText = String(req.body?.response || '').trim();
    if (!responseText) return res.status(400).json({ success: false, error: 'Response text is required' });

    const review = await getReviewById(req.db, req.params.id);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });

    await data.upsertReviewMeta(req.db, review.id, { sellerResponse: responseText });
    await data.logAudit(req.db, 'seller_response_added', 'review', review.id, 'Seller response added', review.status, review.status, getAdminId(req));

    const updated = await getReviewById(req.db, req.params.id);
    return res.json({ success: true, data: updated, message: 'Seller response added' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/reported', async (req, res) => {
  try {
    const reviews = await data.fetchReviews(req.db);
    const minReports = parseInt(req.query.minReports || 1, 10);
    const search = data.normalizeText(req.query.search || '');
    const reason = data.normalizeText(req.query.reason || '');
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const pageSize = Math.max(1, Math.min(parseInt(req.query.pageSize || 20, 10), 100));

    let filtered = reviews.filter((r) => r.reportCount >= minReports);
    if (search) {
      filtered = filtered.filter((r) =>
        data.normalizeText(r.id).includes(search)
        || data.normalizeText(r.productName).includes(search)
        || data.normalizeText(r.buyerName).includes(search)
      );
    }
    if (reason) {
      filtered = filtered.filter((r) => (r.reportReasons || []).some((x) => data.normalizeText(x).includes(reason)));
    }

    filtered.sort((a, b) => b.reportCount - a.reportCount);
    const start = (page - 1) * pageSize;

    return res.json({
      success: true,
      data: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reviews/:id/clear-reports', async (req, res) => {
  try {
    const review = await getReviewById(req.db, req.params.id);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });

    await data.upsertReviewMeta(req.db, review.id, { reportCount: 0, reportReasons: [] });
    await data.logAudit(req.db, 'reports_cleared', 'review', review.id, 'Reports reviewed and dismissed', review.status, review.status, getAdminId(req));

    const updated = await getReviewById(req.db, req.params.id);
    return res.json({ success: true, data: updated, message: 'Review cleared of reports' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/suspicious', async (req, res) => {
  try {
    const reviews = await data.fetchReviews(req.db);
    const search = data.normalizeText(req.query.search || '');
    const riskLevel = req.query.riskLevel || '';
    const type = data.normalizeText(req.query.type || '');
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const pageSize = Math.max(1, Math.min(parseInt(req.query.pageSize || 20, 10), 100));

    let filtered = reviews.filter((r) => r.riskScore > 50);

    if (search) {
      filtered = filtered.filter((r) =>
        data.normalizeText(r.id).includes(search)
        || data.normalizeText(r.productName).includes(search)
        || data.normalizeText(r.buyerName).includes(search)
      );
    }

    if (riskLevel) {
      filtered = filtered.filter((r) => data.riskLabel(r.riskScore) === riskLevel);
    }

    if (type) {
      filtered = filtered.filter((r) => (r.keywordFlags || []).some((k) => data.normalizeText(k).includes(type)));
    }

    filtered.sort((a, b) => b.riskScore - a.riskScore);
    const start = (page - 1) * pageSize;

    return res.json({ success: true, data: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/users/:buyerId/shadowban', async (req, res) => {
  try {
    const buyerId = req.params.buyerId;
    const reason = String(req.body?.reason || 'Abuse pattern detected');

    await data.ensureSupportTables(req.db);
    await req.db.query(
      `
        INSERT INTO public.review_shadowbanned_users (user_id, reason)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason
      `,
      [buyerId, reason]
    );

    const reviews = await data.fetchReviews(req.db);
    const affected = reviews.filter((r) => String(r.buyerId) === String(buyerId) && r.status === 'approved');
    for (const r of affected) {
      await data.upsertReviewMeta(req.db, r.id, { status: 'suspended' });
      await data.logAudit(req.db, 'review_suspended', 'review', r.id, `Shadowban applied to user ${buyerId}`, 'approved', 'suspended', getAdminId(req));
    }

    await data.logAudit(req.db, 'user_shadowbanned', 'user', buyerId, reason, null, 'shadowbanned', getAdminId(req));

    return res.json({ success: true, data: { buyerId, suspendedReviews: affected.length }, message: `User ${buyerId} shadowbanned. ${affected.length} reviews suspended.` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/users/:buyerId/shadowban', async (req, res) => {
  try {
    const buyerId = req.params.buyerId;
    const result = await req.db.query('DELETE FROM public.review_shadowbanned_users WHERE user_id::text = $1', [buyerId]);
    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: 'User not shadowbanned' });
    }
    await data.logAudit(req.db, 'shadowban_removed', 'user', buyerId, 'Shadowban lifted', 'shadowbanned', 'active', getAdminId(req));
    return res.json({ success: true, message: `Shadowban removed from user ${buyerId}` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/shadowbanned-users', async (req, res) => {
  try {
    await data.ensureSupportTables(req.db);
    const result = await req.db.query(
      `
        SELECT rsu.user_id AS "buyerId", u.full_name AS "buyerName", rsu.reason,
               COUNT(pr.id)::int AS "totalReviews",
               COUNT(*) FILTER (WHERE COALESCE(meta.status, 'approved') = 'suspended')::int AS "suspendedReviews",
               COALESCE(bp.trust_score, 80) AS "trustScore"
        FROM public.review_shadowbanned_users rsu
        LEFT JOIN public.users u ON u.id = rsu.user_id
        LEFT JOIN public.product_reviews pr ON pr.customer_id = rsu.user_id
        LEFT JOIN public.review_moderation_meta meta ON meta.review_id = pr.id
        LEFT JOIN public.review_buyer_profiles bp ON bp.buyer_id = rsu.user_id
        GROUP BY rsu.user_id, u.full_name, rsu.reason, bp.trust_score
      `
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/analytics/rating-distribution', async (req, res) => {
  try {
    const reviews = await data.fetchReviews(req.db);
    return res.json({ success: true, data: data.getRatingDistribution(reviews) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/analytics/sentiment', async (req, res) => {
  try {
    const reviews = await data.fetchReviews(req.db);
    return res.json({ success: true, data: data.getSentimentAnalysis(reviews) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/analytics/buyers', async (req, res) => {
  try {
    const rows = await req.db.query(
      `
        SELECT
          u.id AS "buyerId",
          u.full_name AS name,
          COUNT(pr.id)::int AS "totalReviews",
          COUNT(*) FILTER (WHERE COALESCE(meta.status, 'approved') = 'approved')::int AS "approvedReviews",
          COUNT(*) FILTER (WHERE COALESCE(meta.status, 'approved') = 'denied')::int AS "deniedReviews",
          COALESCE(AVG(COALESCE(meta.risk_score, 0)), 0)::numeric(10,1) AS "avgRiskScore",
          COALESCE(bp.trust_score, 80) AS "trustScore",
          EXISTS(SELECT 1 FROM public.review_shadowbanned_users rsu WHERE rsu.user_id = u.id) AS "isShadowbanned"
        FROM public.users u
        JOIN public.product_reviews pr ON pr.customer_id = u.id
        LEFT JOIN public.review_moderation_meta meta ON meta.review_id = pr.id
        LEFT JOIN public.review_buyer_profiles bp ON bp.buyer_id = u.id
        GROUP BY u.id, u.full_name, bp.trust_score
        ORDER BY "totalReviews" DESC
        LIMIT 20
      `
    );
    return res.json({ success: true, data: rows.rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/analytics/sellers', async (req, res) => {
  try {
    const rows = await req.db.query(
      `
        SELECT
          p.seller_id AS "sellerId",
          COALESCE(sp.store_name, su.full_name) AS name,
          COALESCE(AVG(pr.rating), 0)::numeric(10,1) AS "avgRating",
          COUNT(pr.id)::int AS "totalReviews",
          COALESCE(AVG(COALESCE(meta.sentiment_score, 50)), 0)::numeric(10,1) AS "avgSentiment",
          COALESCE(AVG(COALESCE(meta.risk_score, 0)), 0)::numeric(10,1) AS "riskScore"
        FROM public.products p
        JOIN public.users su ON su.id = p.seller_id
        LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
        LEFT JOIN public.product_reviews pr ON pr.product_id = p.id
        LEFT JOIN public.review_moderation_meta meta ON meta.review_id = pr.id
        GROUP BY p.seller_id, sp.store_name, su.full_name
        ORDER BY "totalReviews" DESC
      `
    );
    return res.json({ success: true, data: rows.rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/analytics/products', async (req, res) => {
  try {
    const rows = await req.db.query(
      `
        SELECT
          p.id,
          p.name,
          c.name AS category,
          COALESCE(AVG(pr.rating), 0)::numeric(10,1) AS "avgRating",
          COUNT(pr.id)::int AS "reviewCount",
          COALESCE(AVG(COALESCE(meta.sentiment_score, 50)), 0)::numeric(10,1) AS "avgSentiment"
        FROM public.products p
        LEFT JOIN public.categories c ON c.id = p.category_id
        LEFT JOIN public.product_reviews pr ON pr.product_id = p.id
        LEFT JOIN public.review_moderation_meta meta ON meta.review_id = pr.id
        GROUP BY p.id, p.name, c.name
        ORDER BY "reviewCount" DESC
      `
    );
    return res.json({ success: true, data: rows.rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const settings = await data.getSettings(req.db);
    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const settings = await data.updateSettings(req.db, req.body || {}, getAdminId(req));
    return res.json({ success: true, data: settings, message: 'Settings updated successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/audit-log', async (req, res) => {
  try {
    const result = await data.getAuditLog(req.db, req.query || {});
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
