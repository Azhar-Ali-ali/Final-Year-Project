const API_BASE = '/api/admin/reviews';

const state = {
  queue: [],
  reported: [],
  suspicious: [],
  buyers: [],
  sellers: [],
  products: [],
  sentiment: null,
  ratingDistribution: null,
  overview: null,
  audit: [],
  settings: null,
  currentReviewId: null
};

function getAdminId() {
  return localStorage.getItem('adminId') || localStorage.getItem('userId') || '';
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-admin-id': getAdminId(),
    ...(options.headers || {})
  };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || payload.message || 'Request failed');
  }
  return payload;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatSimpleDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function stars(rating) {
  return '⭐'.repeat(Math.max(1, Number(rating || 0)));
}

function normalize(input) {
  return String(input || '').toLowerCase().trim();
}

function riskLevel(score) {
  const n = Number(score || 0);
  if (n < 20) return 'low';
  if (n < 70) return 'medium';
  return 'high';
}

function riskBadge(score) {
  const level = riskLevel(score);
  if (level === 'low') return '<span class="badge" style="background: #d1f2d7; color: #155724;">Low Risk</span>';
  if (level === 'medium') return '<span class="badge" style="background: #fff3cd; color: #856404;">Medium Risk</span>';
  return '<span class="badge" style="background: #f8d7da; color: #721c24;">High Risk</span>';
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.background = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#111827';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('active');
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('active');
}

function q(id) {
  return document.getElementById(id);
}

function getQueueFilters() {
  return {
    search: q('search-queue')?.value || '',
    status: q('filter-queue-status')?.value || '',
    rating: q('filter-queue-rating')?.value || '',
    verified: q('filter-queue-verified')?.value || ''
  };
}

function getReportedFilters() {
  return {
    search: q('search-reported')?.value || '',
    reason: q('filter-reported-reason')?.value || '',
    minReports: q('filter-reported-count')?.value || ''
  };
}

function getSuspiciousFilters() {
  return {
    search: q('search-suspicious')?.value || '',
    type: q('filter-suspicious-type')?.value || '',
    riskLevel: q('filter-suspicious-risk')?.value || ''
  };
}

async function loadQueue() {
  const params = new URLSearchParams(getQueueFilters());
  const result = await api(`/reviews?${params.toString()}`);
  state.queue = result.data || [];
}

async function loadReported() {
  const filters = getReportedFilters();
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.reason) params.set('reason', filters.reason);
  if (filters.minReports) params.set('minReports', filters.minReports);
  const result = await api(`/reported?${params.toString()}`);
  state.reported = result.data || [];
}

async function loadSuspicious() {
  const params = new URLSearchParams(getSuspiciousFilters());
  const result = await api(`/suspicious?${params.toString()}`);
  state.suspicious = result.data || [];
}

async function loadOverview() {
  const result = await api('/overview');
  state.overview = result.data || null;
}

async function loadAnalytics() {
  const [distribution, sentiment, buyers, sellers, products] = await Promise.all([
    api('/analytics/rating-distribution'),
    api('/analytics/sentiment'),
    api('/analytics/buyers'),
    api('/analytics/sellers'),
    api('/analytics/products')
  ]);

  state.ratingDistribution = distribution.data || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  state.sentiment = sentiment.data || { avgSentiment: '0.0', positive: 0, neutral: 0, negative: 0, total: 0 };
  state.buyers = buyers.data || [];
  state.sellers = sellers.data || [];
  state.products = products.data || [];
}

async function loadSettings() {
  const result = await api('/settings');
  state.settings = result.data || {};
}

async function loadAudit() {
  const result = await api('/audit-log?limit=100');
  state.audit = result.data || [];
}

function renderKPIStats() {
  const el = q('kpi-stats');
  if (!el || !state.overview) return;
  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Reviews</div>
      <div class="stat-value">${state.overview.total || 0}</div>
    </div>
    <div class="stat-card success">
      <div class="stat-label">Approved</div>
      <div class="stat-value">${state.overview.approved || 0}</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-label">Suspicious</div>
      <div class="stat-value">${state.overview.suspicious || 0}</div>
    </div>
    <div class="stat-card danger">
      <div class="stat-label">Reported</div>
      <div class="stat-value">${state.overview.reported || 0}</div>
    </div>
  `;
}

function renderQueue() {
  const tbody = q('queue-tbody');
  if (!tbody) return;

  tbody.innerHTML = state.queue.map((review) => `
    <tr>
      <td><input type="checkbox" class="queue-select" value="${review.id}"></td>
      <td><strong>${review.id}</strong></td>
      <td>${review.productName}</td>
      <td>${review.sellerName}</td>
      <td>${review.buyerName}</td>
      <td style="text-align: center;">${stars(review.rating)}</td>
      <td style="font-size: 12px; max-width: 220px; overflow: hidden; text-overflow: ellipsis;">"${(review.text || '').slice(0, 60)}..."</td>
      <td style="text-align: center;"><span class="badge" style="background: ${review.verifiedPurchase ? '#d4edda' : '#fff3cd'}; color: ${review.verifiedPurchase ? '#155724' : '#856404'};">${review.verifiedPurchase ? '✓ Verified' : 'Unverified'}</span></td>
      <td style="text-align: center;">${riskBadge(review.riskScore)}</td>
      <td><span class="badge status-${review.status}">${String(review.status || '').toUpperCase()}</span></td>
      <td>
        <button class="action-btn" onclick="openReviewModal('${review.id}')">Review</button>
        ${review.status === 'pending' ? `<button class="action-btn" onclick="approveReview('${review.id}')">✓ Approve</button>` : ''}
      </td>
    </tr>
  `).join('');

  if (!state.queue.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: var(--muted); padding: 40px;">No reviews found</td></tr>';
  }

  bindBulkSelection('queue');
}

function renderReported() {
  const tbody = q('reported-tbody');
  if (!tbody) return;

  tbody.innerHTML = state.reported.map((review) => {
    const primaryReason = (review.reportReasons || [])[0] || 'unspecified';
    return `
      <tr>
        <td><strong>${review.id}</strong></td>
        <td>${review.productName}</td>
        <td style="text-align: center;">${stars(review.rating)}</td>
        <td>${review.buyerName}</td>
        <td style="text-align: center; font-weight: 600; color: #dc3545;">${review.reportCount}</td>
        <td><span class="badge" style="background: #fee2e2; color: #991b1b;">${String(primaryReason).replaceAll('_', ' ')}</span></td>
        <td style="font-size: 12px; max-width: 250px; overflow: hidden; text-overflow: ellipsis;">"${(review.text || '').slice(0, 50)}..."</td>
        <td>
          <button class="action-btn" onclick="openReviewModal('${review.id}')">Review</button>
          <button class="action-btn success" onclick="keepReview('${review.id}')">Keep</button>
          <button class="action-btn danger" onclick="openDenialModal('${review.id}')">Remove</button>
        </td>
      </tr>
    `;
  }).join('');

  if (!state.reported.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--muted); padding: 40px;">No reported reviews</td></tr>';
  }
}

function renderSuspicious() {
  const tbody = q('suspicious-tbody');
  if (!tbody) return;

  tbody.innerHTML = state.suspicious.map((review) => {
    const risk = riskLevel(review.riskScore);
    const color = risk === 'high' ? '#dc3545' : risk === 'medium' ? '#ffc107' : '#28a745';
    const pattern = (review.keywordFlags || [])[0] || 'unusual_pattern';
    return `
      <tr>
        <td><input type="checkbox" class="suspicious-select" value="${review.id}"></td>
        <td><strong>${review.id}</strong></td>
        <td>${review.productName}</td>
        <td>${review.buyerName}</td>
        <td style="text-align: center;">${stars(review.rating)}</td>
        <td>${String(pattern).replaceAll('_', ' ')}</td>
        <td><span class="badge" style="background: ${color}20; color: ${color};">${risk.toUpperCase()}</span></td>
        <td>
          <button class="action-btn" onclick="openReviewModal('${review.id}')">Review</button>
          <button class="action-btn danger" onclick="deleteReview('${review.id}', 'fake_review')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  if (!state.suspicious.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--muted); padding: 40px;">No suspicious reviews at this time</td></tr>';
  }

  bindBulkSelection('suspicious');
}

function renderAnalytics() {
  const distribution = state.ratingDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const maxValue = Math.max(1, ...Object.values(distribution));

  if (q('analytics-trend')) q('analytics-trend').textContent = state.overview?.avgRating || '0.00';
  if (q('analytics-trend-details')) {
    q('analytics-trend-details').innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <div>Total Reviews: <strong>${state.overview?.total || 0}</strong></div>
        <div>Verified Rate: <strong>${state.overview?.verifiedPurchaseRate || 0}%</strong></div>
      </div>
    `;
  }

  if (q('analytics-distribution')) {
    q('analytics-distribution').innerHTML = [5, 4, 3, 2, 1].map((rating) => `
      <div class="distribution-bar">
        <div class="distribution-label">${rating} ⭐</div>
        <div class="distribution-fill">
          <div class="distribution-value" style="width: ${(distribution[rating] / maxValue) * 100}%; background: #28a745;">&nbsp;</div>
        </div>
        <div style="font-size: 12px; font-weight: 700; min-width: 26px; text-align: right;">${distribution[rating]}</div>
      </div>
    `).join('');
  }

  if (q('analytics-category')) {
    const byCategory = new Map();
    state.products.forEach((p) => {
      const key = p.category || 'General';
      const prev = byCategory.get(key) || { reviewCount: 0, weighted: 0 };
      prev.reviewCount += Number(p.reviewCount || 0);
      prev.weighted += Number(p.avgRating || 0) * Number(p.reviewCount || 0);
      byCategory.set(key, prev);
    });

    const rows = [...byCategory.entries()].map(([category, v]) => ({
      category,
      reviews: v.reviewCount,
      rating: v.reviewCount ? (v.weighted / v.reviewCount).toFixed(1) : '0.0'
    })).sort((a, b) => b.reviews - a.reviews).slice(0, 6);

    q('analytics-category').innerHTML = rows.map((r) => `
      <div style="display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--border);">
        <span><strong>${r.category}</strong><br><span class="subtle">${r.reviews} reviews</span></span>
        <span style="font-weight: 700; color: var(--info);">${r.rating}/5</span>
      </div>
    `).join('') || '<div class="subtle">No category data found</div>';
  }

  if (q('analytics-sellers')) {
    q('analytics-sellers').innerHTML = state.sellers.slice(0, 8).map((s, i) => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border);">
        <div><strong>${i + 1}. ${s.name}</strong><br><span class="subtle">${s.totalReviews} reviews</span></div>
        <div style="text-align: right;"><strong>${Number(s.avgRating || 0).toFixed(1)}/5</strong><br><span class="subtle">Risk ${Number(s.riskScore || 0).toFixed(1)}</span></div>
      </div>
    `).join('') || '<div class="subtle">No seller analytics found</div>';
  }
}

function renderSentiment() {
  const sentiment = state.sentiment || { avgSentiment: '0.0', positive: 0, neutral: 0, negative: 0, total: 0 };
  const reviews = [...state.queue, ...state.reported, ...state.suspicious];

  const pos = {};
  const neg = {};
  const posWords = ['amazing', 'excellent', 'great', 'perfect', 'love', 'quality', 'recommend', 'best'];
  const negWords = ['broken', 'damaged', 'defective', 'waste', 'poor', 'late', 'problem', 'issue'];

  reviews.forEach((r) => {
    const text = normalize(`${r.title || ''} ${r.text || ''}`);
    posWords.forEach((w) => { if (text.includes(w)) pos[w] = (pos[w] || 0) + 1; });
    negWords.forEach((w) => { if (text.includes(w)) neg[w] = (neg[w] || 0) + 1; });
  });

  const topPos = Object.entries(pos).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topNeg = Object.entries(neg).sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (q('sentiment-positive')) {
    q('sentiment-positive').innerHTML = topPos.map(([k, c]) => `<div class="keyword positive">${k} (${c})</div>`).join('') || '<div class="subtle">No positive keywords found</div>';
  }

  if (q('sentiment-negative')) {
    q('sentiment-negative').innerHTML = topNeg.map(([k, c]) => `<div class="keyword negative">${k} (${c})</div>`).join('') || '<div class="subtle">No negative keywords found</div>';
  }

  if (q('sentiment-score')) {
    q('sentiment-score').innerHTML = `
      <div class="metric-row">
        <div class="metric"><div class="metric-label">Average Score</div><div class="metric-value">${sentiment.avgSentiment}/100</div></div>
        <div class="metric"><div class="metric-label">Positive</div><div class="metric-value">${sentiment.positive}</div></div>
        <div class="metric"><div class="metric-label">Neutral</div><div class="metric-value">${sentiment.neutral}</div></div>
        <div class="metric"><div class="metric-label">Negative</div><div class="metric-value">${sentiment.negative}</div></div>
      </div>
    `;
  }

  if (q('sentiment-categories')) {
    const byCategory = new Map();
    state.products.forEach((p) => {
      const key = p.category || 'General';
      const prev = byCategory.get(key) || { total: 0, count: 0 };
      prev.total += Number(p.avgSentiment || 0);
      prev.count += 1;
      byCategory.set(key, prev);
    });

    const rows = [...byCategory.entries()].map(([k, v]) => ({ category: k, score: v.count ? (v.total / v.count).toFixed(1) : '0.0' }));
    q('sentiment-categories').innerHTML = rows.map((r) => `
      <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
        <span>${r.category}</span><strong>${r.score}/100</strong>
      </div>
    `).join('') || '<div class="subtle">No sentiment category data</div>';
  }
}

function renderAbuseControl() {
  const buyerSearch = normalize(q('search-buyer-abuse')?.value || '');
  const sellerSearch = normalize(q('search-seller-abuse')?.value || '');

  const buyerRows = state.buyers
    .filter((b) => normalize(b.name).includes(buyerSearch))
    .slice(0, 20)
    .map((b) => {
      const violations = Number(b.deniedReviews || 0) + Number(b.totalReviews || 0) - Number(b.approvedReviews || 0);
      const status = b.isShadowbanned ? 'Banned' : (Number(b.avgRiskScore || 0) >= 60 ? 'Under Review' : 'Monitoring');
      const badgeClass = b.isShadowbanned ? 'badge-suspicious' : status === 'Under Review' ? 'badge-pending' : 'badge-approved';
      const actionBtn = b.isShadowbanned
        ? `<button class="action-btn" onclick="removeShadowBan('${b.buyerId}')">Unban</button>`
        : `<button class="action-btn danger" onclick="shadowBanUser('${b.buyerId}')">Ban</button>`;
      return `
        <tr>
          <td><strong>${b.name || 'Buyer'}</strong></td>
          <td style="text-align: center;"><span class="badge badge-flagged">${Math.max(0, violations)}</span></td>
          <td><span class="badge ${badgeClass}">${status}</span></td>
          <td><button class="action-btn" onclick="showToast('Buyer ${b.buyerId}', 'info')">View</button> ${actionBtn}</td>
        </tr>
      `;
    }).join('');

  const sellerRows = state.sellers
    .filter((s) => normalize(s.name).includes(sellerSearch))
    .slice(0, 20)
    .map((s) => {
      const score = Number(s.riskScore || 0).toFixed(0);
      const level = Number(s.riskScore || 0) >= 70 ? 'high' : Number(s.riskScore || 0) >= 40 ? 'medium' : 'low';
      const status = level === 'high' ? 'Under Review' : level === 'medium' ? 'Monitoring' : 'Clean';
      return `
        <tr>
          <td><strong>${s.name || 'Seller'}</strong></td>
          <td style="text-align: center;"><span class="risk-score ${level}">⚠️ ${score}</span></td>
          <td><span class="badge ${level === 'high' ? 'badge-suspicious' : level === 'medium' ? 'badge-pending' : 'badge-approved'}">${status}</span></td>
          <td><button class="action-btn" onclick="showToast('Seller ${s.sellerId}', 'info')">Review</button></td>
        </tr>
      `;
    }).join('');

  q('buyer-abuse-tbody').innerHTML = buyerRows || '<tr><td colspan="4" style="text-align:center; color: var(--muted); padding: 24px;">No buyer abuse records</td></tr>';
  q('seller-abuse-tbody').innerHTML = sellerRows || '<tr><td colspan="4" style="text-align:center; color: var(--muted); padding: 24px;">No seller manipulation records</td></tr>';
}

function renderAuditLog() {
  const search = normalize(q('search-audit')?.value || '');
  const actionFilter = normalize(q('filter-audit-action')?.value || '');
  const container = q('audit-log');
  if (!container) return;

  const filtered = state.audit.filter((entry) => {
    const action = normalize(entry.action);
    const actionSimple = action.replace('review_', '');
    const passAction = !actionFilter || action.includes(actionFilter) || actionSimple.includes(actionFilter);
    const passSearch = !search
      || normalize(entry.action).includes(search)
      || normalize(entry.reason).includes(search)
      || normalize(entry.reviewId).includes(search);
    return passAction && passSearch;
  });

  container.innerHTML = filtered.map((entry) => `
    <div style="padding: 12px; border-left: 4px solid var(--primary); background: #f9fafb; margin-bottom: 8px; border-radius: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
        <div>
          <span style="font-weight: 600; color: var(--primary);">${String(entry.action || '').replaceAll('_', ' ').toUpperCase()}</span><br>
          <span style="font-size: 12px; color: var(--muted);">${formatDate(entry.timestamp)}</span>
        </div>
        <div style="text-align: right; font-size: 12px;">
          ${entry.reviewId ? `<div><strong>Review:</strong> ${entry.reviewId}</div>` : ''}
          <div><strong>Admin:</strong> ${entry.adminId || 'system'}</div>
        </div>
      </div>
      <p style="font-size: 12px; margin-top: 6px; color: #333;">${entry.reason || '-'}</p>
    </div>
  `).join('') || '<div style="text-align: center; color: var(--muted); padding: 20px;">No audit logs found</div>';
}

function bindBulkSelection(scope) {
  const rowClass = scope === 'queue' ? 'queue-select' : 'suspicious-select';
  const bar = q(`bulk-actions-${scope}`);
  const count = q(`bulk-count-${scope}`);
  const toggles = [q(`toggle-select-${scope}`), q(`select-all-${scope}`)].filter(Boolean);
  const checkboxes = [...document.querySelectorAll(`.${rowClass}`)];

  const update = () => {
    const selected = checkboxes.filter((c) => c.checked).length;
    if (count) count.textContent = String(selected);
    if (bar) bar.style.display = selected > 0 ? 'flex' : 'none';
    toggles.forEach((t) => { t.checked = checkboxes.length > 0 && selected === checkboxes.length; });
  };

  checkboxes.forEach((cb) => cb.addEventListener('change', update));
  toggles.forEach((toggle) => toggle.addEventListener('change', () => {
    checkboxes.forEach((cb) => { cb.checked = toggle.checked; });
    update();
  }));
  update();
}

function getSelected(scope) {
  const rowClass = scope === 'queue' ? 'queue-select' : 'suspicious-select';
  return [...document.querySelectorAll(`.${rowClass}:checked`)].map((cb) => cb.value);
}

async function refreshAll() {
  await Promise.all([loadOverview(), loadQueue(), loadReported(), loadSuspicious(), loadAnalytics(), loadSettings(), loadAudit()]);
  renderKPIStats();
  renderQueue();
  renderReported();
  renderSuspicious();
  renderAnalytics();
  renderSentiment();
  renderAbuseControl();
  applySettingsToForm();
  renderAuditLog();
}

function applySettingsToForm() {
  if (!state.settings) return;
  q('setting-require-approval').checked = !!state.settings.requireApprovalBeforePublish;
  q('setting-auto-publish-positive').checked = !!state.settings.autoPublishHighRatings;
  q('setting-auto-flag-negative').checked = !!state.settings.autoDenyOneStar;
  q('setting-verified-only').checked = !!state.settings.verifiedPurchaseOnly;
  q('setting-show-verified-badge').checked = true;
  q('setting-hide-unverified').checked = false;
  q('setting-enable-duplicate-detection').checked = !!state.settings.autoFlagSuspiciousKeywords;
  q('setting-enable-bombing-detection').checked = true;
  q('setting-block-pre-delivery').checked = false;
  q('setting-max-reviews-per-day').value = Number(state.settings.shadowBanThreshold || 5);
  q('setting-risk-threshold').value = 60;
  q('setting-review-delay-days').value = 0;
}

async function saveSettings() {
  try {
    const payload = {
      requireApprovalBeforePublish: q('setting-require-approval').checked,
      autoPublishHighRatings: q('setting-auto-publish-positive').checked,
      autoDenyOneStar: q('setting-auto-flag-negative').checked,
      verifiedPurchaseOnly: q('setting-verified-only').checked,
      autoFlagSuspiciousKeywords: q('setting-enable-duplicate-detection').checked,
      shadowBanThreshold: Number(q('setting-max-reviews-per-day').value || 5)
    };
    await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
    await loadSettings();
    applySettingsToForm();
    closeModal('settings-modal');
    showToast('Moderation settings updated successfully', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function openReviewModal(reviewId) {
  try {
    state.currentReviewId = reviewId;
    const result = await api(`/reviews/${reviewId}`);
    const data = result.data || {};
    const review = data.review || {};
    const buyer = data.buyerProfile || {};
    const seller = data.sellerProfile || {};

    q('review-details').innerHTML = `
      <div style="background: #f9fafb; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
        <strong>Review Details</strong>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px; margin-top: 8px;">
          <div>ID: <strong>${review.id || reviewId}</strong></div>
          <div>Status: <strong class="status-${review.status}">${String(review.status || '').toUpperCase()}</strong></div>
          <div>Rating: <strong>${stars(review.rating)}</strong></div>
          <div>Verified: <strong>${review.verifiedPurchase ? '✓ Yes' : '✗ No'}</strong></div>
          <div>Submitted: <strong>${formatDate(review.submissionDate)}</strong></div>
          <div>Risk Score: <strong>${review.riskScore || 0}/100</strong></div>
          <div>Reports: <strong>${review.reportCount || 0}</strong></div>
          <div>Helpful: <strong>${review.helpfulVotes || 0} / ${review.unhelpfulVotes || 0}</strong></div>
        </div>
      </div>

      <div style="background: #f9fafb; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
        <strong>Buyer Profile</strong>
        <div style="font-size: 12px; margin-top: 8px;">
          Name: <strong>${buyer.name || review.buyerName || '-'}</strong><br>
          Email: <strong>${buyer.email || review.buyerEmail || '-'}</strong><br>
          Total Reviews: <strong>${buyer.reviews || 0}</strong><br>
          Avg Rating: <strong>${buyer.avgRating || 0}/5</strong><br>
          Total Purchases: <strong>${buyer.purchases || 0}</strong><br>
          Trust Score: <strong>${buyer.trustScore || 0}/100</strong><br>
          Profile Image: <strong>${buyer.hasProfileImage ? '✓ Yes' : '✗ No'}</strong>
        </div>
      </div>

      <div style="background: #f9fafb; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
        <strong>Seller Profile</strong>
        <div style="font-size: 12px; margin-top: 8px;">
          Name: <strong>${seller.name || review.sellerName || '-'}</strong><br>
          Avg Rating: <strong>${seller.avgRating || 0}/5</strong><br>
          Total Reviews: <strong>${seller.totalReviews || 0}</strong><br>
          Risk Score: <strong>${seller.riskScore || 0}/100</strong>
        </div>
      </div>

      <div style="background: white; padding: 12px; border-radius: 6px; border-left: 4px solid var(--primary);">
        <strong>Review Content</strong><br>
        <p style="font-size: 13px; margin-top: 8px;"><strong>"${review.title || ''}"</strong></p>
        <p style="font-size: 12px; color: #333;">${review.text || ''}</p>
        ${review.sellerResponse ? `<div style="background: #f5f5f5; padding: 8px; margin-top: 8px; border-radius: 4px; border-left: 3px solid var(--primary);"><strong>Seller Response:</strong><br><span style="font-size: 12px;">${review.sellerResponse}</span></div>` : ''}
      </div>
    `;


    openModal('review-modal');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function openDenialModal(reviewId) {
  q('current-review-id').value = reviewId;
  openModal('denial-modal');
}

async function approveReview(reviewId) {
  try {
    await api(`/reviews/${reviewId}/approve`, { method: 'POST', body: JSON.stringify({}) });
    await refreshAll();
    closeModal('review-modal');
    showToast(`Review ${reviewId} approved and published`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function approveReviewModal() {
  if (!state.currentReviewId) return;
  await approveReview(state.currentReviewId);
}

function denyReviewModal() {
  if (!state.currentReviewId) return;
  openDenialModal(state.currentReviewId);
}

async function confirmDenial() {
  const reviewId = q('current-review-id').value;
  const reason = q('denial-reason').value;
  const notes = q('denial-notes').value;
  if (!reason) {
    showToast('Please select a denial reason', 'error');
    return;
  }

  try {
    await api(`/reviews/${reviewId}/deny`, { method: 'POST', body: JSON.stringify({ reason, notes }) });
    closeModal('denial-modal');
    closeModal('review-modal');
    await refreshAll();
    showToast(`Review ${reviewId} denied and hidden from platform`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteReview(reviewId, reason = 'fake_review') {
  if (!confirm('Permanently delete this review? This action cannot be undone.')) return;
  try {
    await api(`/reviews/${reviewId}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
    await refreshAll();
    showToast(`Review ${reviewId} permanently deleted`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function keepReview(reviewId) {
  try {
    await api(`/reviews/${reviewId}/clear-reports`, { method: 'POST', body: JSON.stringify({}) });
    await refreshAll();
    showToast(`Review ${reviewId} cleared of reports`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function flagReview(reviewId) {
  try {
    await api(`/reviews/${reviewId}/flag`, { method: 'POST', body: JSON.stringify({}) });
    await refreshAll();
    closeModal('review-modal');
    showToast(`Review ${reviewId} flagged for investigation`, 'warning');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function shadowBanUser(buyerId) {
  if (!confirm('Shadow ban this buyer? Approved reviews by this buyer may be suspended.')) return;
  try {
    await api(`/users/${buyerId}/shadowban`, { method: 'POST', body: JSON.stringify({ reason: 'Abuse pattern detected' }) });
    await refreshAll();
    showToast(`User ${buyerId} shadow banned`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function removeShadowBan(buyerId) {
  try {
    await api(`/users/${buyerId}/shadowban`, { method: 'DELETE' });
    await refreshAll();
    showToast(`Shadowban removed from user ${buyerId}`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function exportAuditLog() {
  let csv = 'Timestamp,Admin ID,Action,Review ID,Reason,Previous Status,New Status\n';
  state.audit.forEach((entry) => {
    csv += `"${formatDate(entry.timestamp)}","${entry.adminId || '-'}","${entry.action || '-'}","${entry.reviewId || '-'}","${(entry.reason || '').replaceAll('"', '""')}","${entry.previousStatus || '-'}","${entry.newStatus || '-'}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `review-audit-log-${Date.now()}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
  showToast('Audit log exported as CSV', 'success');
}

async function bulkApproveQueue() {
  const ids = getSelected('queue');
  if (!ids.length) return;
  try {
    await api('/reviews/bulk/approve', { method: 'POST', body: JSON.stringify({ reviewIds: ids }) });
    await refreshAll();
    showToast(`${ids.length} reviews approved`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function bulkDenyQueue() {
  const ids = getSelected('queue');
  if (!ids.length) return;
  const reason = prompt('Enter denial reason for selected reviews:');
  if (!reason) return;
  try {
    await api('/reviews/bulk/deny', { method: 'POST', body: JSON.stringify({ reviewIds: ids, reason }) });
    await refreshAll();
    showToast(`${ids.length} reviews denied`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function bulkDeleteSuspicious() {
  const ids = getSelected('suspicious');
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} suspicious reviews?`)) return;
  try {
    await Promise.all(ids.map((id) => api(`/reviews/${id}`, { method: 'DELETE', body: JSON.stringify({ reason: 'fake_review' }) })));
    await refreshAll();
    showToast(`${ids.length} suspicious reviews deleted`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function bindEvents() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      const tabId = tab.getAttribute('data-tab');
      q(tabId).classList.add('active');
      if (tabId === 'analytics') renderAnalytics();
      if (tabId === 'sentiment') renderSentiment();
    });
  });

  ['search-queue', 'filter-queue-status', 'filter-queue-rating', 'filter-queue-verified'].forEach((id) => {
    q(id)?.addEventListener(id.startsWith('search') ? 'input' : 'change', async () => {
      await loadQueue();
      renderQueue();
    });
  });

  ['search-reported', 'filter-reported-reason', 'filter-reported-count'].forEach((id) => {
    q(id)?.addEventListener(id.startsWith('search') ? 'input' : 'change', async () => {
      await loadReported();
      renderReported();
    });
  });

  ['search-suspicious', 'filter-suspicious-type', 'filter-suspicious-risk'].forEach((id) => {
    q(id)?.addEventListener(id.startsWith('search') ? 'input' : 'change', async () => {
      await loadSuspicious();
      renderSuspicious();
    });
  });

  q('search-buyer-abuse')?.addEventListener('input', renderAbuseControl);
  q('search-seller-abuse')?.addEventListener('input', renderAbuseControl);

  q('search-audit')?.addEventListener('input', renderAuditLog);
  q('filter-audit-action')?.addEventListener('change', renderAuditLog);

  q('btn-settings')?.addEventListener('click', () => openModal('settings-modal'));
  q('btn-audit-log')?.addEventListener('click', () => {
    renderAuditLog();
    openModal('audit-modal');
  });

  q('btn-bulk-approve')?.addEventListener('click', bulkApproveQueue);
  q('btn-bulk-deny')?.addEventListener('click', bulkDenyQueue);
  q('btn-bulk-delete-suspicious')?.addEventListener('click', bulkDeleteSuspicious);
  q('btn-bulk-investigate')?.addEventListener('click', () => showToast('Investigation marks saved in audit logs.', 'info'));

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal.id);
    });
  });
}

async function initializeReviews() {
  try {
    bindEvents();
    await refreshAll();
  } catch (error) {
    showToast(error.message || 'Failed to initialize reviews module', 'error');
  }
}

window.openModal = openModal;
window.closeModal = closeModal;
window.openReviewModal = openReviewModal;
window.openDenialModal = openDenialModal;
window.approveReview = approveReview;
window.approveReviewModal = approveReviewModal;
window.denyReviewModal = denyReviewModal;
window.confirmDenial = confirmDenial;
window.deleteReview = deleteReview;
window.flagReview = flagReview;
window.keepReview = keepReview;
window.shadowBanUser = shadowBanUser;
window.removeShadowBan = removeShadowBan;
window.exportAuditLog = exportAuditLog;
window.saveSettings = saveSettings;
window.showToast = showToast;

window.addEventListener('DOMContentLoaded', initializeReviews);
