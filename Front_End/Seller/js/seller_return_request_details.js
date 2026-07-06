const API_BASE = 'http://localhost:5000/api/seller/returns';

function getSellerId() {
  const candidateKeys = ['sellerId', 'seller_id', 'currentSellerId', 'sellerUserId', 'userId'];

  for (const key of candidateKeys) {
    const fromSession = sessionStorage.getItem(key);
    if (fromSession && String(fromSession).trim()) return String(fromSession).trim();

    const fromLocal = localStorage.getItem(key);
    if (fromLocal && String(fromLocal).trim()) return String(fromLocal).trim();
  }

  return '';
}

const sellerId = getSellerId();

async function apiRequest(path, options = {}) {
  const url = new URL(`${API_BASE}${path}`);
  if (sellerId && !url.searchParams.has('sellerId')) {
    url.searchParams.set('sellerId', sellerId);
  }

  const response = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(sellerId ? { 'x-seller-id': sellerId } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload;
}

const state = {
  currentReturn: null
};

const modalElements = {
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  sidebarOverlay: document.getElementById('sidebarOverlay'),
  markReceivedBtn: document.getElementById('markReceivedBtn'),
  sendVoucherBtn: document.getElementById('sendVoucherBtn'),
  copyVoucherBtn: document.getElementById('copyVoucherBtn'),
  voucherBox: document.getElementById('voucherBox'),
  refundSection: document.getElementById('refundSection'),
  refundHint: document.getElementById('refundHint'),
  evidenceGallery: document.getElementById('evidenceGallery'),
  noEvidenceMessage: document.getElementById('noEvidenceMessage')
};

function getStatusBadgeClass(status) {
  const classes = {
    pending: 'badge-pending',
    approved: 'badge-approved',
    rejected: 'badge-rejected',
    received: 'badge-received',
    refunded: 'badge-refunded'
  };
  return classes[status] || 'badge-pending';
}

function getStatusText(status) {
  const texts = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    received: 'Received',
    refunded: 'Refunded'
  };
  return texts[status] || String(status || '').replace(/^./, (char) => char.toUpperCase());
}

function goBack() {
  window.location.href = 'seller_return_requests.html';
}

function parseMoney(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });
}

function normalizeEvidence(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function buildTimeline(data) {
  if (Array.isArray(data.timeline) && data.timeline.length) {
    return data.timeline;
  }

  const timeline = [];
  if (data.requestDate) {
    timeline.push({ action: 'Return Requested', by: 'Customer', date: data.requestDate });
  }
  if (data.approvedAt) {
    timeline.push({ action: 'Approved', by: 'Seller', date: data.approvedAt });
  }
  if (data.status === 'received') {
    timeline.push({ action: 'Item Received', by: 'Seller', date: data.updatedAt || data.approvedAt || data.requestDate });
  }
  if (data.status === 'refunded') {
    timeline.push({ action: 'Refunded', by: 'Seller', date: data.completedAt || data.updatedAt || data.requestDate });
  }
  if (data.status === 'rejected') {
    timeline.push({ action: 'Rejected', by: 'Seller', date: data.updatedAt || data.requestDate });
  }
  return timeline;
}

function buildReturnState(payload) {
  const data = payload || {};
  const quantity = Number(data.quantity || 1);
  const unitPrice = data.unitPrice !== undefined && data.unitPrice !== null
    ? parseMoney(data.unitPrice)
    : data.lineTotal !== undefined && data.lineTotal !== null
      ? parseMoney(data.lineTotal) / Math.max(quantity, 1)
      : parseMoney(data.price);

  return {
    id: data.id || null,
    returnId: data.returnId || data.returnRequestId || data.return_code || data.id || 'N/A',
    orderId: data.orderId || data.order_number || 'N/A',
    product: data.product || data.productName || 'N/A',
    customer: data.customer || data.customerName || 'N/A',
    customerEmail: data.customerEmail || '',
    reason: data.reason || data.selectedReason || 'N/A',
    status: data.status || 'pending',
    requestDate: data.requestDate || data.requestedAt || null,
    quantity,
    unitPrice,
    lineTotal: data.lineTotal !== undefined && data.lineTotal !== null ? parseMoney(data.lineTotal) : unitPrice * quantity,
    shipping: data.shipping !== undefined && data.shipping !== null ? parseMoney(data.shipping) : 0,
    commissionRate: data.commissionRate !== undefined && data.commissionRate !== null ? Number(data.commissionRate) : 5,
    description: data.description || data.customerDescription || 'N/A',
    sellerMessage: data.sellerMessage || '',
    sellerDecision: data.sellerDecision || '',
    courierName: data.courierName || '',
    pickupSchedule: data.pickupSchedule || '',
    returnAddress: data.returnAddress || '',
    refundAmount: data.refundAmount !== undefined && data.refundAmount !== null ? parseMoney(data.refundAmount) : 0,
    refundMethod: data.refundMethod || '',
    transactionId: data.transactionId || '',
    refundStep: data.refundStep !== undefined && data.refundStep !== null ? Number(data.refundStep) : 1,
    approvedAt: data.approvedAt || null,
    completedAt: data.completedAt || null,
    updatedAt: data.updatedAt || null,
    evidence: normalizeEvidence(data.evidence),
    timeline: buildTimeline(data)
  };
}

function renderStatusBadge(target, status) {
  if (!target) return;
  target.innerHTML = `<span class="status-badge ${getStatusBadgeClass(status)}">${getStatusText(status)}</span>`;
}

function updateTimeline(status) {
  const approvedStage = document.getElementById('approvedStage');
  const receivedStage = document.getElementById('receivedStage');
  const refundedStage = document.getElementById('refundedStage');
  const rejectedStage = document.getElementById('rejectedStage');

  [approvedStage, receivedStage, refundedStage, rejectedStage].forEach((stage) => {
    if (stage) {
      stage.className = 'timeline-item';
    }
  });

  if (status === 'approved') {
    approvedStage?.classList.add('active', 'completed');
  }

  if (status === 'received') {
    approvedStage?.classList.add('completed');
    receivedStage?.classList.add('active', 'completed');
  }

  if (status === 'refunded') {
    approvedStage?.classList.add('completed');
    receivedStage?.classList.add('completed');
    refundedStage?.classList.add('active', 'completed');
  }

  if (status === 'rejected') {
    rejectedStage?.classList.add('active', 'completed');
  }
}

function updateReceivedControls() {
  if (!state.currentReturn) return;

  const { markReceivedBtn, sendVoucherBtn } = modalElements;

  if (state.currentReturn.status === 'approved') {
    if (markReceivedBtn) markReceivedBtn.style.display = 'inline-block';
    if (sendVoucherBtn) sendVoucherBtn.style.display = 'none';
  } else if (state.currentReturn.status === 'received') {
    if (markReceivedBtn) markReceivedBtn.style.display = 'none';
    if (sendVoucherBtn) sendVoucherBtn.style.display = 'inline-block';
  } else {
    if (markReceivedBtn) markReceivedBtn.style.display = 'none';
    if (sendVoucherBtn) sendVoucherBtn.style.display = 'none';
  }
}

function renderTimelineEvents() {
  if (!state.currentReturn) return;

  const container = document.getElementById('timelineEvents');
  if (!container) return;

  const sortedTimeline = [...state.currentReturn.timeline].sort((a, b) => new Date(a.date) - new Date(b.date));
  container.innerHTML = sortedTimeline.map((entry) => `
    <div class="timeline-event-item">
      <div class="timeline-event-left">
        <span>${entry.action}</span>
        <span class="timeline-event-by">${entry.by}</span>
      </div>
      <span class="timeline-event-date">${formatDateTime(entry.date)}</span>
    </div>
  `).join('');
}

function renderEvidence() {
  const evidence = state.currentReturn?.evidence || [];
  const gallery = modalElements.evidenceGallery;
  const noEvidence = modalElements.noEvidenceMessage;

  if (!gallery || !noEvidence) return;

  if (!evidence.length) {
    gallery.innerHTML = '';
    noEvidence.style.display = 'block';
    return;
  }

  noEvidence.style.display = 'none';
  gallery.innerHTML = evidence.map((item, index) => {
    const url = typeof item === 'string' ? item : item?.url || item?.imageUrl || item?.fileUrl || '';
    const label = typeof item === 'object' && item?.label ? item.label : `Evidence ${index + 1}`;

    if (!url) {
      return `
        <div style="background: #f5f5f5; min-height: 100px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 12px; padding: 10px; text-align: center;">${label}</div>
      `;
    }

    return `
      <a href="${url}" target="_blank" rel="noreferrer" style="background: #f5f5f5; min-height: 100px; border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; text-decoration: none;">
        <img src="${url}" alt="${label}" style="width: 100%; height: 100%; object-fit: cover;">
      </a>
    `;
  }).join('');
}

function updateRefundSection() {
  if (!state.currentReturn) return;

  const refundSection = document.getElementById('refundSection');
  const sendVoucherBtn = document.getElementById('sendVoucherBtn');
  const voucherBox = document.getElementById('voucherBox');
  const refundHint = document.getElementById('refundHint');

  const refundAmount = state.currentReturn.lineTotal + state.currentReturn.shipping - ((state.currentReturn.lineTotal * state.currentReturn.commissionRate) / 100);
  const finalRefund = Math.max(refundAmount, 0);

  document.getElementById('refundProductPrice').textContent = formatMoney(state.currentReturn.lineTotal);
  document.getElementById('refundShipping').textContent = formatMoney(state.currentReturn.shipping);
  document.getElementById('refundCommission').textContent = formatMoney((state.currentReturn.lineTotal * state.currentReturn.commissionRate) / 100);
  document.getElementById('refundFinal').textContent = formatMoney(finalRefund);

  const voucherMetaText = document.getElementById('voucherMetaText');
  if (voucherMetaText) {
    voucherMetaText.textContent = `Send voucher to ${state.currentReturn.customerEmail || 'customer email'} and deduct from seller balance.`;
  }

  if (state.currentReturn.status === 'approved' || state.currentReturn.status === 'received' || state.currentReturn.status === 'refunded') {
    refundSection?.classList.add('visible');
  } else {
    refundSection?.classList.remove('visible');
  }

  if (state.currentReturn.status === 'approved') {
    if (sendVoucherBtn) sendVoucherBtn.style.display = 'none';
    voucherBox?.classList.add('hidden');
    if (refundHint) refundHint.textContent = 'Seller must mark the return as received before sending the voucher.';
  } else if (state.currentReturn.status === 'received') {
    if (sendVoucherBtn) sendVoucherBtn.style.display = 'inline-block';
    voucherBox?.classList.add('hidden');
    if (refundHint) refundHint.textContent = 'Item received. You can now send the voucher.';
  } else if (state.currentReturn.status === 'refunded') {
    if (sendVoucherBtn) sendVoucherBtn.style.display = 'none';
    voucherBox?.classList.remove('hidden');
    const voucherCodeText = document.getElementById('voucherCodeText');
    if (voucherCodeText) voucherCodeText.textContent = state.currentReturn.transactionId || 'Voucher sent';
    if (refundHint) refundHint.textContent = 'Voucher already sent and refund completed.';
  } else {
    if (sendVoucherBtn) sendVoucherBtn.style.display = 'none';
    voucherBox?.classList.add('hidden');
    if (refundHint) refundHint.textContent = 'Voucher button is available only when return status is Item Received.';
  }

  updateReceivedControls();
}

function updatePageFields() {
  if (!state.currentReturn) return;

  document.getElementById('returnTitle').textContent = `Return Request ${state.currentReturn.returnId}`;
  document.getElementById('returnId').textContent = `Return ID: ${state.currentReturn.returnId}`;
  document.getElementById('breadcrumbReturn').textContent = state.currentReturn.returnId;

  renderStatusBadge(document.getElementById('statusBadgeContainer'), state.currentReturn.status);
  renderStatusBadge(document.getElementById('detailStatus'), state.currentReturn.status);

  document.getElementById('detailReturnId').textContent = state.currentReturn.returnId;
  document.getElementById('detailOrderId').textContent = state.currentReturn.orderId;
  document.getElementById('detailRequestDate').textContent = formatDate(state.currentReturn.requestDate);

  document.getElementById('productName').textContent = state.currentReturn.product;
  document.getElementById('productOrderId').textContent = state.currentReturn.orderId;
  document.getElementById('productQuantity').textContent = String(state.currentReturn.quantity || 1);
  document.getElementById('productPrice').textContent = formatMoney(state.currentReturn.unitPrice);
  document.getElementById('productCustomer').textContent = state.currentReturn.customer;

  document.getElementById('returnReason').textContent = state.currentReturn.reason;
  document.getElementById('customerDescription').textContent = state.currentReturn.description || 'N/A';

  const messageToCustomer = document.getElementById('messageToCustomer');
  if (messageToCustomer && !messageToCustomer.value.trim() && state.currentReturn.sellerMessage) {
    messageToCustomer.value = state.currentReturn.sellerMessage;
  }

  document.getElementById('courierName').value = state.currentReturn.courierName || '';
  document.getElementById('pickupDate').value = '';
  document.getElementById('returnAddress').value = state.currentReturn.returnAddress || document.getElementById('returnAddress').value;
  document.getElementById('rejectionReason').value = state.currentReturn.sellerMessage || '';

  updateTimeline(state.currentReturn.status);
  renderTimelineEvents();
  renderEvidence();
  updateRefundSection();
}

function toggleConditionalSections() {
  const decision = document.querySelector('input[name="decision"]:checked')?.value;
  const approveSection = document.getElementById('approveSection');
  const rejectSection = document.getElementById('rejectSection');

  approveSection?.classList.remove('active');
  rejectSection?.classList.remove('active');

  if (decision === 'approve') {
    approveSection?.classList.add('active');
  } else if (decision === 'reject') {
    rejectSection?.classList.add('active');
  }
}

function calculateRefund() {
  if (!state.currentReturn) return 0;
  const commissionAmount = (state.currentReturn.lineTotal * state.currentReturn.commissionRate) / 100;
  return Math.max(state.currentReturn.lineTotal + state.currentReturn.shipping - commissionAmount, 0);
}

async function loadReturnDetails() {
  const params = new URLSearchParams(window.location.search);
  const returnId = params.get('returnId');

  if (!returnId) {
    goBack();
    return;
  }

  try {
    const response = await apiRequest(`/requests/${encodeURIComponent(returnId)}`);
    state.currentReturn = buildReturnState(response.data);
    updatePageFields();
  } catch (error) {
    console.error('Failed to load return request details:', error);
    alert(error.message || 'Return request not found');
    goBack();
  }
}

async function handleDecision(event) {
  event.preventDefault();

  if (!state.currentReturn) return;

  const decision = document.querySelector('input[name="decision"]:checked')?.value;
  if (!decision) {
    alert('Please select a decision (Approve or Reject)');
    return;
  }

  const message = document.getElementById('messageToCustomer').value.trim();
  if (!message) {
    alert('Please provide a message to the customer');
    return;
  }

  try {
    if (decision === 'approve') {
      const courier = document.getElementById('courierName').value.trim();
      const pickupDate = document.getElementById('pickupDate').value.trim();
      const address = document.getElementById('returnAddress').value.trim();

      if (!courier || !pickupDate || !address) {
        alert('Please fill in all return authorization details');
        return;
      }

      const response = await apiRequest(`/requests/${encodeURIComponent(state.currentReturn.returnId)}/approve`, {
        method: 'PATCH',
        body: {
          courierName: courier,
          pickupSchedule: pickupDate,
          returnAddress: address,
          sellerMessage: message
        }
      });

      state.currentReturn = buildReturnState(response.data);
      updatePageFields();
      alert('Return approved successfully.');
      return;
    }

    const rejectionReason = document.getElementById('rejectionReason').value.trim() || message;
    const response = await apiRequest(`/requests/${encodeURIComponent(state.currentReturn.returnId)}/reject`, {
      method: 'PATCH',
      body: { sellerMessage: rejectionReason }
    });

    state.currentReturn = buildReturnState(response.data);
    updatePageFields();
    alert('Return rejected successfully.');
  } catch (error) {
    alert(error.message || 'Unable to save decision');
  }
}

async function markAsReceived() {
  if (!state.currentReturn || state.currentReturn.status !== 'approved') return;

  try {
    const response = await apiRequest(`/requests/${encodeURIComponent(state.currentReturn.returnId)}/received`, {
      method: 'PATCH',
      body: { sellerMessage: document.getElementById('messageToCustomer').value.trim() || 'Returned item received by seller.' }
    });

    state.currentReturn = buildReturnState(response.data);
    updatePageFields();
    alert('Return marked as received.');
  } catch (error) {
    alert(error.message || 'Unable to mark as received');
  }
}

async function sendVoucher() {
  if (!state.currentReturn || state.currentReturn.status !== 'received') return;

  const refundAmount = calculateRefund();
  const voucherCode = `VOUCHER-${Date.now().toString(36).toUpperCase()}`;
  const sellerMessage = document.getElementById('messageToCustomer').value.trim() || 'Refund completed successfully.';

  try {
    const response = await apiRequest(`/requests/${encodeURIComponent(state.currentReturn.returnId)}/refunded`, {
      method: 'PATCH',
      body: {
        refundAmount,
        refundMethod: 'Voucher',
        transactionId: voucherCode,
        sellerMessage
      }
    });

    state.currentReturn = buildReturnState(response.data);
    state.currentReturn.transactionId = voucherCode;
    updatePageFields();

    const voucherBox = document.getElementById('voucherBox');
    const voucherCodeText = document.getElementById('voucherCodeText');
    const voucherMetaText = document.getElementById('voucherMetaText');

    voucherBox?.classList.remove('hidden');
    if (voucherCodeText) voucherCodeText.textContent = voucherCode;
    if (voucherMetaText) {
      voucherMetaText.textContent = `Voucher emailed to ${state.currentReturn.customerEmail || 'customer email'}. Seller balance deducted by ${formatMoney(refundAmount)}.`;
    }

    const copyVoucherBtn = document.getElementById('copyVoucherBtn');
    if (copyVoucherBtn) {
      copyVoucherBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(voucherCode);
          alert('Voucher code copied to clipboard.');
        } catch (_) {
          alert('Unable to copy voucher code.');
        }
      };
    }

    alert(`Voucher sent successfully.\n\nVoucher Code: ${voucherCode}\nRefund Amount: ${formatMoney(refundAmount)}`);
  } catch (error) {
    alert(error.message || 'Unable to send voucher');
  }
}

function attachSidebarHandlers() {
  const { sidebar, sidebarToggle, sidebarOverlay } = modalElements;

  function openMobileSidebar() {
    sidebar?.classList.remove('hidden');
    sidebarOverlay?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileSidebar() {
    sidebar?.classList.add('hidden');
    sidebarOverlay?.classList.add('hidden');
    document.body.style.overflow = 'auto';
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      if (sidebar?.classList.contains('hidden')) {
        openMobileSidebar();
      } else {
        closeMobileSidebar();
      }
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeMobileSidebar);
  }

  if (sidebar) {
    sidebar.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMobileSidebar);
    });
  }
}

function attachStaticHandlers() {
  const decisionForm = document.getElementById('decisionForm');
  if (decisionForm) {
    decisionForm.addEventListener('submit', handleDecision);
  }

  modalElements.markReceivedBtn?.addEventListener('click', markAsReceived);
  modalElements.sendVoucherBtn?.addEventListener('click', sendVoucher);
  modalElements.copyVoucherBtn?.addEventListener('click', async () => {
    const code = document.getElementById('voucherCodeText')?.textContent || '';
    if (!code || code === 'Voucher code will appear here') return;
    try {
      await navigator.clipboard.writeText(code);
      alert('Voucher code copied to clipboard.');
    } catch (_) {
      alert('Unable to copy voucher code.');
    }
  });
}

window.goBack = goBack;
window.toggleConditionalSections = toggleConditionalSections;
window.handleDecision = handleDecision;
window.markAsReceived = markAsReceived;
window.sendVoucher = sendVoucher;

attachSidebarHandlers();
attachStaticHandlers();
loadReturnDetails().finally(() => {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});