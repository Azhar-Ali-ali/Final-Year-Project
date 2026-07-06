function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function riskLabel(score) {
  if (score < 20) return 'low';
  if (score < 70) return 'medium';
  return 'high';
}

async function ensureSupportTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.review_moderation_meta (
      review_id UUID PRIMARY KEY REFERENCES public.product_reviews(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'flagged', 'suspended', 'deleted')),
      risk_score INTEGER NOT NULL DEFAULT 0,
      report_count INTEGER NOT NULL DEFAULT 0,
      report_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
      sentiment_score INTEGER NOT NULL DEFAULT 50,
      keyword_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
      image_count INTEGER NOT NULL DEFAULT 0,
      helpful_votes INTEGER NOT NULL DEFAULT 0,
      unhelpful_votes INTEGER NOT NULL DEFAULT 0,
      seller_response TEXT,
      denial_reason TEXT,
      approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
      approval_date TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.review_moderation_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      require_approval_before_publish BOOLEAN NOT NULL DEFAULT TRUE,
      auto_deny_one_star BOOLEAN NOT NULL DEFAULT FALSE,
      auto_publish_high_ratings BOOLEAN NOT NULL DEFAULT FALSE,
      verified_purchase_only BOOLEAN NOT NULL DEFAULT FALSE,
      auto_flag_suspicious_keywords BOOLEAN NOT NULL DEFAULT TRUE,
      shadow_ban_threshold INTEGER NOT NULL DEFAULT 5,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.review_shadowbanned_users (
      user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.review_buyer_profiles (
      buyer_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
      trust_score INTEGER NOT NULL DEFAULT 80,
      has_profile_image BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.review_moderation_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id UUID,
      admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      reason TEXT,
      previous_status VARCHAR(20),
      new_status VARCHAR(20),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    INSERT INTO public.review_moderation_settings (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);
}

async function logAudit(db, action, entityType, entityId, reason = '', previousStatus = null, newStatus = null, adminId = null) {
  const validAdminId = /^[0-9a-fA-F-]{36}$/.test(String(adminId || '')) ? adminId : null;
  await db.query(
    `
      INSERT INTO public.review_moderation_audit
      (action, entity_type, entity_id, admin_id, reason, previous_status, new_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [action, entityType, entityId || null, validAdminId, String(reason || ''), previousStatus, newStatus]
  );
}

function buildRiskScore(review) {
  let score = 0;
  if (!review.verifiedPurchase) score += 35;
  if ((review.imageCount || 0) === 0) score += 10;
  if ((review.rating === 1 || review.rating === 5) && (review.text || '').length < 50) score += 15;
  const text = `${review.title || ''} ${review.text || ''}`.toLowerCase();
  const suspicious = ['perfect', 'best', 'worst', 'fake', 'scam', 'spam'];
  let hits = 0;
  suspicious.forEach((k) => { if (text.includes(k)) hits += 1; });
  if (hits >= 3) score += 20;
  return Math.min(score, 100);
}

async function fetchReviews(db) {
  await ensureSupportTables(db);

  const result = await db.query(`
    SELECT
      pr.id,
      pr.product_id AS "productId",
      p.name AS "productName",
      p.seller_id AS "sellerId",
      COALESCE(sp.store_name, su.full_name, 'Seller') AS "sellerName",
      pr.customer_id AS "buyerId",
      bu.full_name AS "buyerName",
      bu.email AS "buyerEmail",
      pr.rating,
      pr.title,
      pr.body AS text,
      pr.is_verified_purchase AS "verifiedPurchase",
      pr.created_at AS "submissionDate",
      COALESCE(meta.status, CASE WHEN pr.is_hidden THEN 'denied' ELSE 'approved' END) AS status,
      COALESCE(meta.risk_score, 0) AS "riskScore",
      COALESCE(meta.report_count, 0) AS "reportCount",
      COALESCE(meta.report_reasons, '[]'::jsonb) AS "reportReasons",
      COALESCE(meta.sentiment_score, 50) AS "sentimentScore",
      COALESCE(meta.keyword_flags, '[]'::jsonb) AS "keywordFlags",
      COALESCE(meta.image_count, 0) AS "imageCount",
      COALESCE(meta.helpful_votes, 0) AS "helpfulVotes",
      COALESCE(meta.unhelpful_votes, 0) AS "unhelpfulVotes",
      meta.seller_response AS "sellerResponse",
      meta.denial_reason AS "denialReason",
      meta.approved_by AS "approvedBy",
      meta.approval_date AS "approvalDate"
    FROM public.product_reviews pr
    JOIN public.products p ON p.id = pr.product_id
    JOIN public.users bu ON bu.id = pr.customer_id
    LEFT JOIN public.users su ON su.id = p.seller_id
    LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
    LEFT JOIN public.review_moderation_meta meta ON meta.review_id = pr.id
    ORDER BY pr.created_at DESC
  `);

  return result.rows.map((row) => {
    const computedRisk = row.riskScore > 0 ? toNumber(row.riskScore) : buildRiskScore(row);
    return {
      id: row.id,
      productId: row.productId,
      productName: row.productName,
      sellerId: row.sellerId,
      sellerName: row.sellerName,
      buyerId: row.buyerId,
      buyerName: row.buyerName,
      buyerEmail: row.buyerEmail,
      buyerIp: '',
      rating: toNumber(row.rating),
      title: row.title || '',
      text: row.text || '',
      verifiedPurchase: Boolean(row.verifiedPurchase),
      purchaseDate: row.verifiedPurchase ? row.submissionDate : null,
      submissionDate: row.submissionDate,
      status: row.status,
      riskScore: computedRisk,
      reportCount: toNumber(row.reportCount),
      reportReasons: Array.isArray(row.reportReasons) ? row.reportReasons : [],
      sentimentScore: toNumber(row.sentimentScore, 50),
      keywordFlags: Array.isArray(row.keywordFlags) ? row.keywordFlags : [],
      imageCount: toNumber(row.imageCount),
      helpfulVotes: toNumber(row.helpfulVotes),
      unhelpfulVotes: toNumber(row.unhelpfulVotes),
      sellerResponse: row.sellerResponse || null,
      approvedBy: row.approvedBy,
      approvalDate: row.approvalDate,
      denialReason: row.denialReason || null
    };
  });
}

function filterReviews(reviews, query = {}) {
  const {
    search = '',
    status = '',
    rating = '',
    verified = '',
    riskLevel = '',
    reportCount = '',
    sortBy = 'submissionDate',
    sortDir = 'desc',
    page = 1,
    pageSize = 20
  } = query;

  let filtered = reviews.filter((review) => {
    const passSearch = !search
      || normalizeText(review.id).includes(normalizeText(search))
      || normalizeText(review.productName).includes(normalizeText(search))
      || normalizeText(review.buyerName).includes(normalizeText(search))
      || normalizeText(review.sellerName).includes(normalizeText(search));

    const passStatus = !status || normalizeText(review.status) === normalizeText(status);
    const passRating = !rating || review.rating === parseInt(rating, 10);
    const passVerified = !verified
      || (verified === 'verified' && review.verifiedPurchase)
      || (verified === 'unverified' && !review.verifiedPurchase);

    let passRisk = true;
    if (riskLevel) {
      if (riskLevel === 'low' && review.riskScore >= 20) passRisk = false;
      if (riskLevel === 'medium' && (review.riskScore < 20 || review.riskScore >= 70)) passRisk = false;
      if (riskLevel === 'high' && review.riskScore < 70) passRisk = false;
    }

    let passReportCount = true;
    if (reportCount) {
      passReportCount = review.reportCount >= parseInt(reportCount, 10);
    }

    return passSearch && passStatus && passRating && passVerified && passRisk && passReportCount;
  });

  filtered.sort((a, b) => {
    const dateKeys = new Set(['submissionDate', 'approvalDate']);
    const aVal = dateKeys.has(sortBy) ? new Date(a[sortBy] || 0).getTime() : (a[sortBy] ?? 0);
    const bVal = dateKeys.has(sortBy) ? new Date(b[sortBy] || 0).getTime() : (b[sortBy] ?? 0);
    if (sortDir === 'asc') return aVal > bVal ? 1 : -1;
    return aVal < bVal ? 1 : -1;
  });

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limit = Math.max(1, Math.min(parseInt(pageSize, 10) || 20, 200));
  const start = (pageNum - 1) * limit;

  return {
    reviews: filtered.slice(start, start + limit),
    total: filtered.length,
    page: pageNum,
    pageSize: limit
  };
}

function getOverviewStats(reviews) {
  const total = reviews.length;
  const pending = reviews.filter((r) => r.status === 'pending').length;
  const approved = reviews.filter((r) => r.status === 'approved').length;
  const flagged = reviews.filter((r) => r.status === 'flagged').length;
  const suspended = reviews.filter((r) => r.status === 'suspended').length;
  const reported = reviews.filter((r) => r.reportCount > 0).length;
  const suspicious = reviews.filter((r) => r.riskScore > 50).length;
  const avgRating = total ? (reviews.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(2) : '0.00';
  const verifiedPurchaseRate = total ? ((reviews.filter((r) => r.verifiedPurchase).length / total) * 100).toFixed(1) : '0.0';

  return { total, pending, approved, flagged, suspended, reported, suspicious, avgRating, verifiedPurchaseRate };
}

function getRatingDistribution(reviews) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.filter((r) => r.status === 'approved').forEach((r) => {
    distribution[r.rating] = (distribution[r.rating] || 0) + 1;
  });
  return distribution;
}

function getSentimentAnalysis(reviews) {
  const approved = reviews.filter((r) => r.status === 'approved');
  const total = approved.length;
  const avgSentiment = total ? (approved.reduce((sum, r) => sum + toNumber(r.sentimentScore, 50), 0) / total).toFixed(1) : '0.0';
  const positive = approved.filter((r) => toNumber(r.sentimentScore, 50) >= 70).length;
  const neutral = approved.filter((r) => toNumber(r.sentimentScore, 50) >= 40 && toNumber(r.sentimentScore, 50) < 70).length;
  const negative = approved.filter((r) => toNumber(r.sentimentScore, 50) < 40).length;
  return { avgSentiment, positive, neutral, negative, total };
}

async function getSettings(db) {
  await ensureSupportTables(db);
  const result = await db.query('SELECT * FROM public.review_moderation_settings WHERE id = 1 LIMIT 1');
  const row = result.rows[0];
  return {
    requireApprovalBeforePublish: row.require_approval_before_publish,
    autoDenyOneStar: row.auto_deny_one_star,
    autoPublishHighRatings: row.auto_publish_high_ratings,
    verifiedPurchaseOnly: row.verified_purchase_only,
    autoFlagSuspiciousKeywords: row.auto_flag_suspicious_keywords,
    shadowBanThreshold: row.shadow_ban_threshold
  };
}

async function updateSettings(db, payload = {}, adminId = null) {
  await ensureSupportTables(db);
  await db.query(
    `
      UPDATE public.review_moderation_settings
      SET
        require_approval_before_publish = COALESCE($1, require_approval_before_publish),
        auto_deny_one_star = COALESCE($2, auto_deny_one_star),
        auto_publish_high_ratings = COALESCE($3, auto_publish_high_ratings),
        verified_purchase_only = COALESCE($4, verified_purchase_only),
        auto_flag_suspicious_keywords = COALESCE($5, auto_flag_suspicious_keywords),
        shadow_ban_threshold = COALESCE($6, shadow_ban_threshold),
        updated_at = NOW()
      WHERE id = 1
    `,
    [
      payload.requireApprovalBeforePublish,
      payload.autoDenyOneStar,
      payload.autoPublishHighRatings,
      payload.verifiedPurchaseOnly,
      payload.autoFlagSuspiciousKeywords,
      payload.shadowBanThreshold !== undefined ? parseInt(payload.shadowBanThreshold, 10) : null
    ]
  );
  await logAudit(db, 'settings_updated', 'settings', null, 'Moderation settings updated', null, null, adminId);
  return getSettings(db);
}

async function getAuditLog(db, { limit = 50, page = 1 } = {}) {
  await ensureSupportTables(db);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.max(1, Math.min(parseInt(limit, 10) || 50, 500));
  const offset = (pageNum - 1) * lim;

  const [rows, total] = await Promise.all([
    db.query(
      `
        SELECT id, created_at AS timestamp, admin_id AS "adminId", action, entity_id AS "reviewId", reason, previous_status AS "previousStatus", new_status AS "newStatus"
        FROM public.review_moderation_audit
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `,
      [lim, offset]
    ),
    db.query('SELECT COUNT(*)::int AS total FROM public.review_moderation_audit')
  ]);

  return {
    data: rows.rows,
    total: total.rows[0].total,
    page: pageNum,
    limit: lim
  };
}

async function upsertReviewMeta(db, reviewId, payload = {}) {
  await db.query(
    `
      INSERT INTO public.review_moderation_meta
      (review_id, status, risk_score, report_count, report_reasons, sentiment_score, keyword_flags, image_count, helpful_votes, unhelpful_votes, seller_response, denial_reason, approved_by, approval_date, updated_at)
      VALUES ($1, COALESCE($2, 'pending'), COALESCE($3, 0), COALESCE($4, 0), COALESCE($5, '[]'::jsonb), COALESCE($6, 50), COALESCE($7, '[]'::jsonb), COALESCE($8, 0), COALESCE($9, 0), COALESCE($10, 0), $11, $12, $13, $14, NOW())
      ON CONFLICT (review_id) DO UPDATE
      SET
        status = COALESCE($2, public.review_moderation_meta.status),
        risk_score = COALESCE($3, public.review_moderation_meta.risk_score),
        report_count = COALESCE($4, public.review_moderation_meta.report_count),
        report_reasons = COALESCE($5, public.review_moderation_meta.report_reasons),
        sentiment_score = COALESCE($6, public.review_moderation_meta.sentiment_score),
        keyword_flags = COALESCE($7, public.review_moderation_meta.keyword_flags),
        image_count = COALESCE($8, public.review_moderation_meta.image_count),
        helpful_votes = COALESCE($9, public.review_moderation_meta.helpful_votes),
        unhelpful_votes = COALESCE($10, public.review_moderation_meta.unhelpful_votes),
        seller_response = COALESCE($11, public.review_moderation_meta.seller_response),
        denial_reason = COALESCE($12, public.review_moderation_meta.denial_reason),
        approved_by = COALESCE($13, public.review_moderation_meta.approved_by),
        approval_date = COALESCE($14, public.review_moderation_meta.approval_date),
        updated_at = NOW()
    `,
    [
      reviewId,
      payload.status,
      payload.riskScore,
      payload.reportCount,
      payload.reportReasons ? JSON.stringify(payload.reportReasons) : null,
      payload.sentimentScore,
      payload.keywordFlags ? JSON.stringify(payload.keywordFlags) : null,
      payload.imageCount,
      payload.helpfulVotes,
      payload.unhelpfulVotes,
      payload.sellerResponse,
      payload.denialReason,
      payload.approvedBy,
      payload.approvalDate || null
    ]
  );
}

module.exports = {
  normalizeText,
  ensureSupportTables,
  fetchReviews,
  filterReviews,
  getOverviewStats,
  getRatingDistribution,
  getSentimentAnalysis,
  getSettings,
  updateSettings,
  getAuditLog,
  upsertReviewMeta,
  logAudit,
  riskLabel
};