// Payment & Payout Management System
// ==================================

const DEFAULT_ADMIN_API_BASE_URL = (typeof window !== 'undefined' && (window.API_BASE_URL || window.ADMIN_API_BASE_URL || `${window.location.origin}/api`))
	? (window.API_BASE_URL || window.ADMIN_API_BASE_URL || `${window.location.origin}/api`)
	: `${window.location.origin}/api`;

const ADMIN_API_BASE = `${String(DEFAULT_ADMIN_API_BASE_URL).replace(/\/$/, '')}/admin`;
const API_BASE = `${ADMIN_API_BASE}/payments`;

function getAdminToken() {
	return localStorage.getItem('lumina.admin.authToken') || localStorage.getItem('lumina.auth.token') || localStorage.getItem('adminToken') || '';
}

function buildApiUrl(path) {
	return `${ADMIN_API_BASE}${path}`;
}

let db = {
	onlinePayments: [],
	codTracking: [],
	sellers: [],
	failedPayments: [],
	auditLog: [],
	overview: {}
};

let currentState = {
	allPayments: [],
	filteredPayments: [],
	filteredCOD: [],
	filteredSellers: [],
	filteredFailed: [],
	selectedPaymentsForBatch: [],
	sortBy: 'date',
	filterPaymentStatus: '',
	filterEscrowStatus: '',
	searchQuery: ''
};

function updateBulkActions() {
	const selectAll = document.getElementById('select-all-payout');
	const batchApproveBtn = document.getElementById('btn-batch-approve');
	const enabledCheckboxes = document.querySelectorAll('.seller-checkbox:not(:disabled)');
	const checkedCount = document.querySelectorAll('.seller-checkbox:checked').length;
	const totalCount = enabledCheckboxes.length;

	if (selectAll) {
		selectAll.checked = totalCount > 0 && checkedCount === totalCount;
		selectAll.indeterminate = checkedCount > 0 && checkedCount < totalCount;
	}

	if (batchApproveBtn) {
		batchApproveBtn.disabled = checkedCount === 0;
		batchApproveBtn.classList.toggle('disabled', checkedCount === 0);
	}
}

async function api(path, options = {}) {
	const token = getAdminToken();
	const headers = {
		'Content-Type': 'application/json',
		'x-admin-id': localStorage.getItem('adminId') || localStorage.getItem('userId') || '',
		...(options.headers || {})
	};

	if (token) {
		headers.Authorization = `Bearer ${token}`;
		headers['x-session-token'] = token;
	}

	const response = await fetch(`${API_BASE}${path}`, {
		...options,
		credentials: 'include',
		headers
	});

	if (response.headers.get('content-type')?.includes('text/csv')) return response.text();
	const payload = await response.json().catch(() => ({}));
	if (!response.ok || payload.success === false) throw new Error(payload.message || payload.error || 'Request failed');
	return payload;
}

async function ensureAdminSession() {
	const token = getAdminToken();
	if (!token) {
		window.location.href = 'admin_login.html';
		return false;
	}

	try {
		const response = await fetch(buildApiUrl('/auth/session'), {
			headers: {
				Authorization: `Bearer ${token}`,
				'x-session-token': token,
				'x-admin-id': localStorage.getItem('adminId') || localStorage.getItem('userId') || ''
			}
		});

		if (!response.ok) {
			// If the server explicitly rejects the session (401/403), clear tokens and force login.
			if (response.status === 401 || response.status === 403) {
				console.warn('Session check failed with status', response.status);
				localStorage.removeItem('lumina.admin.authToken');
				localStorage.removeItem('lumina.auth.token');
				window.location.href = 'admin_login.html';
				return false;
			}

			// For other server errors, log and allow the page to continue (transient issue).
			console.error('Session check returned non-auth status', response.status);
			return true;
		}

		const payload = await response.json().catch(() => ({}));
		if (!payload.success) {
			// If payload explicitly indicates session expired, clear tokens and redirect.
			if (payload.message && /session/i.test(payload.message)) {
				localStorage.removeItem('lumina.admin.authToken');
				localStorage.removeItem('lumina.auth.token');
				window.location.href = 'admin_login.html';
				return false;
			}

			console.warn('Session check returned unsuccessful payload:', payload);
			// don't force logout for unexpected payloads — treat as transient
			return true;
		}

		if (payload.data?.admin?.id) {
			localStorage.setItem('adminId', payload.data.admin.id);
		}
		return true;
	} catch (error) {
		// Network or unexpected error — log and allow user to remain logged in instead of immediate logout
		console.error('Session verification failed:', error);
		return true;
	}
}

async function loadDashboardData() {
	const [overviewRes, onlineRes, codRes, payoutRes, failedRes] = await Promise.all([
		api('/overview'),
		api('/online-payments'),
		api('/cod-tracking'),
		api('/payout-queue'),
		api('/failed-payments')
	]);

	db.overview = overviewRes.data || {};
	db.onlinePayments = (onlineRes.data || []).map((item) => ({
		...item,
		createdAt: item.createdAt ? new Date(item.createdAt) : null,
		returnsWindowExpiry: item.returnsWindowExpiry ? new Date(item.returnsWindowExpiry) : null
	}));
	db.codTracking = (codRes.data || []).map((item) => ({
		...item,
		createdAt: item.createdAt ? new Date(item.createdAt) : null
	}));
	db.sellers = (payoutRes.data || []).map((item) => ({
		...item,
		requestDate: item.requestDate ? new Date(item.requestDate) : null
	}));
	db.failedPayments = (failedRes.data || []).map((item) => ({
		...item,
		createdAt: item.createdAt ? new Date(item.createdAt) : null
	}));
	currentState.allPayments = [...db.onlinePayments];
	currentState.filteredPayments = [...db.onlinePayments];
	currentState.filteredCOD = [...db.codTracking];
	currentState.filteredSellers = [...db.sellers];
	currentState.filteredFailed = [...db.failedPayments];
	currentState.selectedPaymentsForBatch = [];
	updateBulkActions();
}

function clearDashboardData() {
	db.overview = {};
	db.onlinePayments = [];
	db.codTracking = [];
	db.sellers = [];
	db.failedPayments = [];
	currentState.allPayments = [];
	currentState.filteredPayments = [];
	currentState.filteredCOD = [];
	currentState.filteredSellers = [];
	currentState.filteredFailed = [];
	currentState.selectedPaymentsForBatch = [];
}

// ==================== UTILITY FUNCTIONS ====================

function showToast(message, type = 'success') {
	const toast = document.getElementById('toast');
	toast.textContent = message;
	toast.className = `toast ${type} show`;
	setTimeout(() => toast.classList.remove('show'), 3000);
}

function openModal(modalId) {
	document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
	document.getElementById(modalId).classList.remove('active');
}

function formatCurrency(amount) {
	const numericAmount = Number(amount ?? 0);
	if (!Number.isFinite(numericAmount)) return 'PKR 0.00';
	return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(numericAmount);
}

function formatDate(date) {
	return new Intl.DateTimeFormat('en-PK', { year: 'numeric', month: 'short', day: '2-digit' }).format(date);
}

function formatDateTime(date) {
	return new Intl.DateTimeFormat('en-PK', { 
		year: 'numeric', month: 'short', day: '2-digit', 
		hour: '2-digit', minute: '2-digit'
	}).format(date);
}

function getCountdownText(expiryDate) {
	const now = new Date();
	const diff = expiryDate - now;
	
	if (diff < 0) return { text: 'Expired', class: 'countdown' };
	
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));
	const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
	
	let cls = 'countdown safe';
	if (days <= 2) cls = 'countdown warning';
	if (days < 0) cls = 'countdown';
	
	return { text: `${days}d ${hours}h`, class: cls };
}

function getStatusBadgeClass(status) {
	const map = {
		'success': 'pill-success',
		'failed': 'pill-danger',
		'refunded': 'pill-gray',
		'held': 'pill-warning',
		'released': 'pill-success',
		'dispute': 'pill-danger',
		'verified': 'pill-success',
		'pending': 'pill-warning',
		'rejected': 'pill-danger',
		'clear': 'pill-success',
		'medium': 'pill-warning',
		'high': 'pill-danger',
		'frozen': 'pill-danger',
		'delivered': 'pill-success',
		'in-transit': 'pill-info',
		'failed': 'pill-danger',
		'deposited': 'pill-success',
		'mismatch': 'pill-danger',
	};
	return map[status] || 'pill-gray';
}

// ==================== FINANCIAL OVERVIEW ====================

function calculateFinancialMetrics() {
	const metrics = {
		totalGrossSales: 0,
		totalCommission: 0,
		totalSellerPayable: 0,
		totalPaidOut: 0,
		totalRefunds: 0,
		pendingAmount: 0,
		codPendingReconciliation: 0,
		failedPayments: 0
	};

	// From online payments
	db.onlinePayments.forEach(payment => {
		const orderTotal = Number(payment.orderTotal || payment.amount || 0);
		const delivered = ['delivered'].includes(String(payment.deliveryStatus || payment.orderStatus || '').toLowerCase());
		if (payment.paymentStatus === 'success') {
			if (delivered) {
				metrics.totalGrossSales += orderTotal;
			} else {
				metrics.pendingAmount += orderTotal;
			}
			if (payment.escrowStatus === 'released' || delivered) {
				metrics.totalSellerPayable += orderTotal;
			}
		} else if (payment.paymentStatus === 'failed') {
			metrics.failedPayments++;
		}
	});

	// From sellers
	db.sellers.forEach(seller => {
		metrics.totalCommission += seller.commission;
		metrics.totalSellerPayable += seller.availableBalance;
		metrics.totalPaidOut += seller.paidAmount;
		metrics.totalRefunds += seller.refunds;
	});

	// COD tracking
	db.codTracking.forEach(cod => {
		const amount = Number(cod.codAmount || 0);
		const delivered = String(cod.deliveryStatus || '').toLowerCase() === 'delivered';
		const deposited = String(cod.courierDepositStatus || '').toLowerCase() === 'deposited';
		if (delivered && deposited) {
			metrics.totalGrossSales += amount;
		} else {
			metrics.pendingAmount += amount;
		}
	});

	metrics.codPendingReconciliation = db.codTracking.filter(c => c.courierDepositStatus === 'pending').length;

	return metrics;
}

// ==================== KPI STATS (Logistics Pattern) ====================

function renderKPIStats() {
	const metrics = calculateFinancialMetrics();
	const statsGrid = document.getElementById('kpi-stats');
	
	if (!statsGrid) return;

	statsGrid.innerHTML = `
		<div class="stat-card">
			<div class="stat-value">${formatCurrency(metrics.totalGrossSales)}</div>
			<div class="stat-label">Total Payments Collected</div>
		</div>
		<div class="stat-card warning">
			<div class="stat-value">${formatCurrency(metrics.pendingAmount)}</div>
			<div class="stat-label">Pending Amount</div>
		</div>
		<div class="stat-card warning">
			<div class="stat-value">${metrics.failedPayments}</div>
			<div class="stat-label">Disputed Transactions</div>
		</div>
		<div class="stat-card success">
			<div class="stat-value">${formatCurrency(metrics.totalPaidOut)}</div>
			<div class="stat-label">Payouts Processed</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">${formatCurrency(metrics.totalCommission)}</div>
			<div class="stat-label">Commission Earned</div>
		</div>
		<div class="stat-card danger">
			<div class="stat-value">${formatCurrency(metrics.totalRefunds)}</div>
			<div class="stat-label">Refunds Issued</div>
		</div>
	`;
}

function renderFinancialOverview() {
	const metrics = calculateFinancialMetrics();
	const statsGrid = document.getElementById('stats-grid');
	
	const cards = [
		{ label: 'Total Gross Sales', value: formatCurrency(metrics.totalGrossSales), icon: 'trending_up', id: 'stat-1' },
		{ label: 'Pending Amount', value: formatCurrency(metrics.pendingAmount), icon: 'hourglass_top', id: 'stat-3' },
		{ label: 'Total Commission Earned', value: formatCurrency(metrics.totalCommission), icon: 'monetization_on', id: 'stat-2' },
		{ label: 'Seller Payable', value: formatCurrency(metrics.totalSellerPayable), icon: 'account_balance_wallet', id: 'stat-4' },
		{ label: 'Total Paid Out', value: formatCurrency(metrics.totalPaidOut), icon: 'done_all', id: 'stat-5' },
		{ label: 'Total Refunds', value: formatCurrency(metrics.totalRefunds), icon: 'undo', id: 'stat-6' },
		{ label: 'COD Pending Reconciliation', value: metrics.codPendingReconciliation.toString(), icon: 'local_shipping', id: 'stat-7' },
		{ label: 'Failed Payments', value: metrics.failedPayments.toString(), icon: 'error', id: 'stat-8' },
	];

	if (statsGrid) {
		statsGrid.innerHTML = cards.map(card => `
			<div class="stat-card" data-stat-id="${card.id}">
				<div class="label">
					<span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">${card.icon}</span>
					${card.label}
				</div>
				<div class="value">${card.value}</div>
			</div>
		`).join('');

		// Add click handlers for stat cards
		document.querySelectorAll('.stat-card').forEach(card => {
			card.addEventListener('click', handleStatCardClick);
		});
	}
}

function handleStatCardClick(e) {
	const statId = e.currentTarget.dataset.statId;
	console.log('Stat card clicked:', statId);
	showToast(`Filtering by ${statId}`, 'info');
}

// ==================== ONLINE PAYMENTS ====================

function renderOnlinePayments() {
	const tbody = document.getElementById('online-payments-tbody');
	
	const rows = currentState.filteredPayments.map(payment => {
		const orderTotal = Number(payment.orderTotal || payment.amount || 0);
		const paymentStatusLabel = String(payment.paymentStatusLabel || payment.paymentStatus || 'pending').toUpperCase();
		const escrowStatusLabel = String(payment.escrowStatus || 'held').toUpperCase();
		return `
			<tr>
				<td>${payment.orderId || '—'}</td>
				<td>${payment.customerName || '—'}</td>
				<td>${payment.sellerName || '—'}</td>
				<td>${formatCurrency(orderTotal)}</td>
				<td>${payment.gateway || payment.paymentMethod || 'N/A'}</td>
				<td><span class="pill ${getStatusBadgeClass(payment.paymentStatus)}">${paymentStatusLabel}</span></td>
				<td><span class="pill ${getStatusBadgeClass(payment.escrowStatus)}">${escrowStatusLabel}</span></td>
				<td>
					${payment.returnsWindowExpiry ? `
						<span class="${getCountdownText(payment.returnsWindowExpiry).class}">
							${getCountdownText(payment.returnsWindowExpiry).text}
						</span>
					` : '<span class="pill pill-gray">N/A</span>'}
				</td>
				<td class="actions">
					<button class="action-btn" onclick="viewPaymentDetails('${payment.id}')"><span class="material-symbols-rounded" style="font-size: 16px;">info</span></button>
					<button class="action-btn" onclick="openRefundModal('${payment.id}')"><span class="material-symbols-rounded" style="font-size: 16px;">undo</span></button>
					<button class="action-btn" onclick="openDisputeModal('${payment.id}')"><span class="material-symbols-rounded" style="font-size: 16px;">flag</span></button>
				</td>
			</tr>
		`;
	}).join('');

	tbody.innerHTML = rows || '<tr><td colspan="9" style="text-align: center; padding: 20px;">No payments found</td></tr>';
}

function viewPaymentDetails(paymentId) {
	const payment = db.onlinePayments.find(p => p.id === paymentId);
	if (!payment) return;

	const body = document.getElementById('payment-details-body');
	body.innerHTML = `
		<div class="info-grid">
			<div class="info-item">
				<div class="label">Order ID</div>
				<div class="value">${payment.orderId || '—'}</div>
			</div>
			<div class="info-item">
				<div class="label">Customer</div>
				<div class="value">${payment.customerName || '—'}</div>
			</div>
			<div class="info-item">
				<div class="label">Seller</div>
				<div class="value">${payment.sellerName || '—'}</div>
			</div>
			<div class="info-item">
				<div class="label">Amount</div>
				<div class="value">${formatCurrency(Number(payment.orderTotal || payment.amount || 0))}</div>
			</div>
			<div class="info-item">
				<div class="label">Payment Gateway</div>
				<div class="value">${payment.gateway || payment.paymentMethod || 'N/A'}</div>
			</div>
			<div class="info-item">
				<div class="label">Payment Status</div>
				<div class="value"><span class="pill ${getStatusBadgeClass(payment.paymentStatus)}">${String(payment.paymentStatusLabel || payment.paymentStatus || 'pending').toUpperCase()}</span></div>
			</div>
			<div class="info-item">
				<div class="label">Escrow Status</div>
				<div class="value"><span class="pill ${getStatusBadgeClass(payment.escrowStatus)}">${String(payment.escrowStatus || 'held').toUpperCase()}</span></div>
			</div>
			<div class="info-item">
				<div class="label">Gateway Reference ID</div>
				<div class="value" style="font-family: monospace; font-size: 11px;">${payment.transactionRef || payment.ref || 'N/A'}</div>
			</div>
			<div class="info-item">
				<div class="label">Payment Date</div>
				<div class="value">${payment.createdAt ? formatDateTime(payment.createdAt) : 'N/A'}</div>
			</div>
			<div class="info-item">
				<div class="label">Return Window Expiry</div>
				<div class="value">${payment.returnsWindowExpiry ? formatDate(payment.returnsWindowExpiry) : 'N/A'}</div>
			</div>
		</div>
	`;

	openModal('payment-details-modal');
}

function openRefundModal(paymentId) {
	const payment = db.onlinePayments.find(p => p.id === paymentId);
	if (!payment) return;

	const info = document.getElementById('refund-info');
	info.innerHTML = `
		<div class="info-item">
			<div class="label">Order ID</div>
			<div class="value">${payment.orderId}</div>
		</div>
		<div class="info-item">
			<div class="label">Customer</div>
			<div class="value">${payment.customerName}</div>
		</div>
		<div class="info-item">
			<div class="label">Amount to Refund</div>
			<div class="value">${formatCurrency(payment.amount)}</div>
		</div>
		<div class="info-item">
			<div class="label">Gateway</div>
			<div class="value">${payment.gateway}</div>
		</div>
	`;

	document.getElementById('btn-confirm-refund').onclick = () => confirmRefund(paymentId);
	openModal('refund-modal');
}

async function confirmRefund(paymentId) {
	const refundReason = document.getElementById('refund-reason').value;
	const refundNotes = document.getElementById('refund-notes').value;

	if (!refundReason) {
		showToast('Please select a refund reason', 'error');
		return;
	}

	try {
		await api(`/payments/${paymentId}/refund`, {
			method: 'POST',
			body: JSON.stringify({ reason: refundReason, notes: refundNotes })
		});
		await loadDashboardData();
		closeModal('refund-modal');
		renderOnlinePayments();
		renderKPIStats();
		renderFinancialOverview();
		showToast('Refund processed successfully', 'success');
	} catch (error) {
		showToast(error.message, 'error');
	}
}

function openDisputeModal(paymentId) {
	const payment = db.onlinePayments.find(p => p.id === paymentId);
	if (!payment) return;

	const info = document.getElementById('dispute-info');
	info.innerHTML = `
		<div class="info-item">
			<div class="label">Order ID</div>
			<div class="value">${payment.orderId}</div>
		</div>
		<div class="info-item">
			<div class="label">Customer</div>
			<div class="value">${payment.customerName}</div>
		</div>
		<div class="info-item">
			<div class="label">Amount</div>
			<div class="value">${formatCurrency(payment.amount)}</div>
		</div>
		<div class="info-item">
			<div class="label">Current Escrow Status</div>
			<div class="value"><span class="pill ${getStatusBadgeClass(payment.escrowStatus)}">${payment.escrowStatus}</span></div>
		</div>
	`;

	document.getElementById('btn-confirm-dispute').onclick = () => confirmDispute(paymentId);
	openModal('dispute-modal');
}

async function confirmDispute(paymentId) {
	const disputeType = document.getElementById('dispute-type').value;
	const disputeDetails = document.getElementById('dispute-details').value;

	if (!disputeType || !disputeDetails) {
		showToast('Please fill all fields', 'error');
		return;
	}

	try {
		await api(`/payments/${paymentId}/dispute`, {
			method: 'POST',
			body: JSON.stringify({ disputeType, details: disputeDetails })
		});
		await loadDashboardData();
		closeModal('dispute-modal');
		renderOnlinePayments();
		showToast('Dispute marked and funds frozen', 'success');
	} catch (error) {
		showToast(error.message, 'error');
	}
}

// ==================== COD TRACKING ====================

function renderCODTracking() {
	const tbody = document.getElementById('cod-tracking-tbody');
	
	const rows = currentState.filteredCOD.map(cod => {
		const varianceClass = cod.variance === 0 ? 'pill-success' : (cod.variance < 0 ? 'pill-danger' : 'pill-warning');
		return `
			<tr>
				<td>${cod.orderId}</td>
				<td>${cod.sellerName}</td>
				<td>${cod.courierName}</td>
				<td>${formatCurrency(cod.codAmount)}</td>
				<td><span class="pill ${getStatusBadgeClass(cod.deliveryStatus)}">${cod.deliveryStatus}</span></td>
				<td><span class="pill ${getStatusBadgeClass(cod.courierDepositStatus)}">${cod.courierDepositStatus}</span></td>
				<td>${cod.variance === 0 ? '<span class="pill pill-success">✓ Match</span>' : `<span class="pill ${varianceClass}">${formatCurrency(cod.variance)}</span>`}</td>
				<td class="actions">
					<button class="action-btn" onclick="openCODReconciliationModal('${cod.id}')"><span class="material-symbols-rounded" style="font-size: 16px;">check_circle</span></button>
				</td>
			</tr>
		`;
	}).join('');

	tbody.innerHTML = rows || '<tr><td colspan="8" style="text-align: center; padding: 20px;">No COD records found</td></tr>';
}

function openCODReconciliationModal(codId) {
	const cod = db.codTracking.find(c => c.id === codId);
	if (!cod) return;

	const body = document.getElementById('cod-reconciliation-body');
	body.innerHTML = `
		<div class="info-grid">
			<div class="info-item">
				<div class="label">Order ID</div>
				<div class="value">${cod.orderId}</div>
			</div>
			<div class="info-item">
				<div class="label">Seller</div>
				<div class="value">${cod.sellerName}</div>
			</div>
			<div class="info-item">
				<div class="label">Courier</div>
				<div class="value">${cod.courierName}</div>
			</div>
			<div class="info-item">
				<div class="label">COD Amount</div>
				<div class="value">${formatCurrency(cod.codAmount)}</div>
			</div>
			<div class="info-item">
				<div class="label">Delivery Status</div>
				<div class="value"><span class="pill ${getStatusBadgeClass(cod.deliveryStatus)}">${cod.deliveryStatus}</span></div>
			</div>
			<div class="info-item">
				<div class="label">Courier Deposited Amount</div>
				<div class="value">${cod.depositedAmount ? formatCurrency(cod.depositedAmount) : 'Not yet deposited'}</div>
			</div>
			<div class="info-item">
				<div class="label">Variance</div>
				<div class="value">${cod.variance === 0 ? '<span class="pill pill-success">Match</span>' : `<span class="pill ${cod.variance < 0 ? 'pill-danger' : 'pill-warning'}">${formatCurrency(cod.variance)}</span>`}</div>
			</div>
			<div class="info-item">
				<div class="label">Delivery Date</div>
				<div class="value">${formatDate(cod.createdAt)}</div>
			</div>
		</div>

		${cod.deliveryStatus === 'delivered' && cod.courierDepositStatus === 'pending' ? `
			<div class="alert alert-warning">
				<span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">warning</span>
				Awaiting courier deposit confirmation
			</div>
		` : ''}

		${cod.courierDepositStatus === 'mismatch' ? `
			<div class="alert alert-danger">
				<span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">error</span>
				Amount mismatch detected. ${cod.sellerName} payout frozen until resolved.
			</div>
		` : ''}
	`;

	document.getElementById('btn-confirm-deposit').onclick = () => confirmCODDeposit(codId);
	document.getElementById('btn-flag-mismatch').onclick = () => flagCODMismatch(codId);
	openModal('cod-reconciliation-modal');
}

async function confirmCODDeposit(codId) {
	try {
		await api(`/cod/${codId}/confirm-deposit`, { method: 'POST', body: JSON.stringify({}) });
		await loadDashboardData();
		closeModal('cod-reconciliation-modal');
		renderCODTracking();
		showToast('COD deposit confirmed', 'success');
	} catch (error) {
		showToast(error.message, 'error');
	}
}

async function flagCODMismatch(codId) {
	try {
		await api(`/cod/${codId}/flag-mismatch`, { method: 'POST', body: JSON.stringify({}) });
		await loadDashboardData();
		closeModal('cod-reconciliation-modal');
		renderCODTracking();
		showToast('COD mismatch flagged - Seller payout frozen', 'warning');
	} catch (error) {
		showToast(error.message, 'error');
	}
}

// ==================== PAYOUT QUEUE ====================

function renderPayoutQueue() {
	const tbody = document.getElementById('payout-queue-tbody');
	
	const rows = currentState.filteredSellers.map((seller, idx) => {
		const isEligible = seller.kycStatus === 'verified' && seller.bankStatus === 'verified' && seller.riskLevel === 'clear';
		const eligibleOrders = seller.eligibleOrders || 0;
		const availableBalance = seller.availableBalance ?? seller.available_balance ?? 0;
		const paymentRequestAmount = seller.paymentRequestAmount ?? seller.payment_request_amount ?? 0;
		const paymentRequestStatus = String(seller.pendingRequestStatus ?? seller.pending_request_status ?? (paymentRequestAmount > 0 ? 'pending' : 'none')).toLowerCase();
		const totalWithdrawal = seller.paidAmount ?? seller.paid_amount ?? 0;
		const requestLabel = paymentRequestAmount > 0 ? 'Pending Request' : 'No Request';
		
		return `
			<tr>
				<td><input type="checkbox" class="seller-checkbox" data-seller-id="${seller.id}" ${isEligible ? '' : 'disabled'} /></td>
				<td>${seller.name}</td>
				<td>${formatCurrency(availableBalance)}</td>
				<td>
					<div>${formatCurrency(paymentRequestAmount)}</div>
					<div class="pill ${paymentRequestStatus === 'pending' ? 'pill-pending' : 'pill-completed'}" style="margin-top: 4px; display: inline-block;">${requestLabel}</div>
				</td>
				<td><span class="pill ${getStatusBadgeClass(seller.kycStatus)}">${seller.kycStatus}</span></td>
				<td><span class="pill ${getStatusBadgeClass(seller.bankStatus)}">${seller.bankStatus}</span></td>
				<td><span class="pill ${getStatusBadgeClass(seller.riskLevel)}">${seller.riskLevel}</span></td>
				<td>${eligibleOrders}</td>
				<td>${formatCurrency(totalWithdrawal)}</td>
			</tr>
		`;
	}).join('');

	tbody.innerHTML = rows || '<tr><td colspan="9" style="text-align: center; padding: 20px;">No sellers found</td></tr>';

	// Add batch selection logic
	const selectAll = document.getElementById('select-all-payout');
	selectAll?.addEventListener('change', (e) => {
		document.querySelectorAll('.seller-checkbox:not(:disabled)').forEach(cb => cb.checked = e.target.checked);
		updateBulkActions();
	});
	document.querySelectorAll('.seller-checkbox:not(:disabled)').forEach((checkbox) => {
		checkbox.addEventListener('change', updateBulkActions);
	});
	updateBulkActions();
}

function openPayoutBreakdownModal(sellerId) {
	const seller = db.sellers.find(s => s.id === sellerId);
	if (!seller) return;

	const netPayout = seller.grossSales - seller.commission - seller.shipping - seller.taxes - seller.refunds;

	document.getElementById('seller-name-break').textContent = seller.name;

	const body = document.getElementById('payout-breakdown-body');
	body.innerHTML = `
		<div class="alert alert-info">
			<span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">info</span>
			Net payout calculated after all deductions
		</div>

		<div class="info-grid">
			<div class="info-item">
				<div class="label">Gross Sales</div>
				<div class="value">${formatCurrency(seller.grossSales)}</div>
			</div>
			<div class="info-item">
				<div class="label">Platform Commission</div>
				<div class="value" style="color: var(--danger);">- ${formatCurrency(seller.commission)}</div>
			</div>
			<div class="info-item">
				<div class="label">Shipping Deduction</div>
				<div class="value" style="color: var(--danger);">- ${formatCurrency(seller.shipping)}</div>
			</div>
			<div class="info-item">
				<div class="label">Tax Deduction</div>
				<div class="value" style="color: var(--danger);">- ${formatCurrency(seller.taxes)}</div>
			</div>
			<div class="info-item">
				<div class="label">Refund Deductions</div>
				<div class="value" style="color: var(--danger);">- ${formatCurrency(seller.refunds)}</div>
			</div>
		</div>

		<div class="divider"></div>

		<div class="info-grid">
			<div class="info-item">
				<div class="label">Withdrawable Balance</div>
				<div class="value" style="font-size: 18px; color: var(--success);">${formatCurrency(seller.availableBalance ?? seller.available_balance ?? 0)}</div>
			</div>
			<div class="info-item">
				<div class="label">Pending Balance</div>
				<div class="value">${formatCurrency(seller.pendingBalance)}</div>
			</div>
			<div class="info-item">
				<div class="label">Already Paid</div>
				<div class="value">${formatCurrency(seller.paidAmount)}</div>
			</div>
		</div>

		<div style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-top: 12px;">
			<strong>KYC Status:</strong> <span class="pill ${getStatusBadgeClass(seller.kycStatus)}">${seller.kycStatus}</span><br>
			<strong>Bank Status:</strong> <span class="pill ${getStatusBadgeClass(seller.bankStatus)}">${seller.bankStatus}</span><br>
			<strong>Risk Level:</strong> <span class="pill ${getStatusBadgeClass(seller.riskLevel)}">${seller.riskLevel}</span>
		</div>
	`;

	document.getElementById('btn-approve-payout').onclick = () => {
		closeModal('payout-breakdown-modal');
		openAppovePayoutModal(sellerId);
	};

	document.getElementById('btn-adjust-balance').onclick = () => {
		showToast('Adjust balance feature would load seller adjustment form', 'info');
	};

	openModal('payout-breakdown-modal');
}

function openAppovePayoutModal(sellerId) {
	const seller = db.sellers.find(s => s.id === sellerId);
	if (!seller) return;

	const isEligible = seller.kycStatus === 'verified' && seller.bankStatus === 'verified' && seller.riskLevel === 'clear';

	const body = document.getElementById('approve-payout-body');
	body.innerHTML = `
		${!isEligible ? `
			<div class="alert alert-danger">
				<span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">error</span>
				Cannot approve payout: ${seller.kycStatus !== 'verified' ? 'KYC not verified' : seller.bankStatus !== 'verified' ? 'Bank not verified' : 'High risk level'}
			</div>
		` : ''}

		<div class="info-grid">
			<div class="info-item">
				<div class="label">Seller</div>
				<div class="value">${seller.name}</div>
			</div>
			<div class="info-item">
				<div class="label">Payment Request</div>
				<div class="value">${formatCurrency(seller.paymentRequestAmount ?? seller.payment_request_amount ?? 0)}</div>
			</div>
			<div class="info-item">
				<div class="label">Withdrawable Balance</div>
				<div class="value">${formatCurrency(seller.availableBalance ?? seller.available_balance ?? 0)}</div>
			</div>
			<div class="info-item">
				<div class="label">Bank</div>
				<div class="value">${seller.bankName}</div>
			</div>
			<div class="info-item">
				<div class="label">Account</div>
				<div class="value">${seller.accountNumber}</div>
			</div>
		</div>

		${(seller.paymentRequestAmount ?? seller.payment_request_amount ?? 0) > 0 ? `
			<div class="alert alert-info">
				<span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">payments</span>
				A pending payout request exists for this seller and will be marked paid after approval.
			</div>
		` : ''}

		<div class="form-group">
			<label>Transaction Reference</label>
			<input type="text" id="payout-transaction-ref" placeholder="Enter transaction reference" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px;" />
		</div>
		<div class="form-group">
			<label>Admin Notes</label>
			<textarea placeholder="Add notes about this payout..." id="payout-notes"></textarea>
		</div>

		${isEligible ? `
			<div class="alert alert-success">
				<span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px;">check_circle</span>
				All verifications passed. Ready for payout approval.
			</div>
		` : ''}
	`;

	document.getElementById('btn-confirm-payout').disabled = !isEligible;
	document.getElementById('btn-confirm-payout').onclick = () => confirmPayoutApproval(sellerId);
	document.getElementById('btn-reject-payout').onclick = () => rejectPayoutApproval(sellerId);

	openModal('approve-payout-modal');
}

async function confirmPayoutApproval(sellerId) {
	const seller = db.sellers.find(s => s.id === sellerId);
	const notes = document.getElementById('payout-notes').value || 'Scheduled payout approval';
	const transactionReference = (document.getElementById('payout-transaction-ref')?.value || '').trim();

	if (!transactionReference) {
		showToast('Transaction reference is required.', 'error');
		return;
	}

	if (!window.confirm(`Proceed with payout for ${seller?.name || 'this seller'}?`)) {
		return;
	}

	try {
		await api(`/sellers/${sellerId}/payout/approve`, { method: 'POST', body: JSON.stringify({ notes, transactionReference }) });
		await loadDashboardData();
		closeModal('approve-payout-modal');
		renderPayoutQueue();
		showToast(`Payout approved for ${seller.name}`, 'success');
	} catch (error) {
		showToast(error.message, 'error');
	}
}

async function rejectPayoutApproval(sellerId) {
	const seller = db.sellers.find(s => s.id === sellerId);
	if (!seller) return;

	try {
		await api(`/sellers/${sellerId}/payout/reject`, { method: 'POST', body: JSON.stringify({ notes: 'Payout rejected - seller marked frozen' }) });
		await loadDashboardData();
		closeModal('approve-payout-modal');
		renderPayoutQueue();
		showToast(`Payout rejected and ${seller.name} marked as frozen`, 'danger');
	} catch (error) {
		showToast(error.message, 'error');
	}
}

// ==================== BANK VERIFICATION ====================

function openBankVerificationModal(sellerId) {
	const seller = db.sellers.find(s => s.id === sellerId);
	if (!seller) return;

	const body = document.getElementById('bank-verification-body');
	body.innerHTML = `
		<div class="alert ${seller.bankStatus === 'verified' ? 'alert-success' : seller.bankStatus === 'pending' ? 'alert-warning' : 'alert-danger'}">
			<strong>Current Status:</strong> ${seller.bankStatus.toUpperCase()}
		</div>

		<div class="info-grid">
			<div class="info-item">
				<div class="label">Bank Name</div>
				<div class="value">${seller.bankName}</div>
			</div>
			<div class="info-item">
				<div class="label">Account Holder</div>
				<div class="value">${seller.accountHolder}</div>
			</div>
			<div class="info-item">
				<div class="label">Masked Account Number</div>
				<div class="value" style="font-family: monospace;">${seller.accountNumber}</div>
			</div>
			<div class="info-item">
				<div class="label">IFSC Code</div>
				<div class="value" style="font-family: monospace;">${seller.ifsc}</div>
			</div>
		</div>

		<div style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-top: 12px; border: 2px dashed var(--border);">
			<strong>📄 Bank Proof:</strong> Bank Statement Uploaded (file_name.pdf)<br>
			<small style="color: var(--muted);">Uploaded on: ${formatDate(new Date())}</small>
		</div>

		<div class="form-group" style="margin-top: 12px;">
			<label>Verification Notes</label>
			<textarea placeholder="Add verification notes..." id="bank-notes"></textarea>
		</div>
	`;

	document.getElementById('btn-approve-bank').onclick = () => approveBankVerification(sellerId);
	document.getElementById('btn-reject-bank').onclick = () => rejectBankVerification(sellerId);

	openModal('bank-verification-modal');
}

async function approveBankVerification(sellerId) {
	const seller = db.sellers.find(s => s.id === sellerId);
	const notes = document.getElementById('bank-notes').value || 'Bank verification approved';

	try {
		await api(`/sellers/${sellerId}/bank/approve`, { method: 'POST', body: JSON.stringify({ notes }) });
		await loadDashboardData();
		closeModal('bank-verification-modal');
		renderPayoutQueue();
		showToast(`Bank account verified for ${seller.name}`, 'success');
	} catch (error) {
		showToast(error.message, 'error');
	}
}

async function rejectBankVerification(sellerId) {
	const seller = db.sellers.find(s => s.id === sellerId);
	const notes = document.getElementById('bank-notes').value || 'Bank verification rejected';

	try {
		await api(`/sellers/${sellerId}/bank/reject`, { method: 'POST', body: JSON.stringify({ notes }) });
		await loadDashboardData();
		closeModal('bank-verification-modal');
		renderPayoutQueue();
		showToast(`Bank verification rejected for ${seller.name} - Payout frozen`, 'danger');
	} catch (error) {
		showToast(error.message, 'error');
	}
}

// ==================== KYC VERIFICATION ====================

function openKYCModal(sellerId) {
	const seller = db.sellers.find(s => s.id === sellerId);
	if (!seller) return;

	const body = document.getElementById('kyc-body');
	body.innerHTML = `
		<div class="alert ${seller.kycStatus === 'verified' ? 'alert-success' : seller.kycStatus === 'pending' ? 'alert-warning' : 'alert-danger'}">
			<strong>Current Status:</strong> ${seller.kycStatus.toUpperCase()}
		</div>

		<div style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
			<strong>📋 Government ID:</strong> Aadhar/PAN (Document uploaded)<br>
			<strong>📍 Address Proof:</strong> Utility Bill (Document uploaded)<br>
			<strong>🏢 Business Registration:</strong> MSME/GST Certificate (Document uploaded)<br>
			<small style="color: var(--muted);">All documents uploaded on: ${formatDate(new Date())}</small>
		</div>

		<h4 style="margin: 12px 0 8px 0; font-size: 13px;">KYC Details</h4>
		<div class="info-grid">
			<div class="info-item">
				<div class="label">Business Name</div>
				<div class="value">${seller.name}</div>
			</div>
			<div class="info-item">
				<div class="label">Account Holder</div>
				<div class="value">${seller.accountHolder}</div>
			</div>
			<div class="info-item">
				<div class="label">ID Type</div>
				<div class="value">Aadhar</div>
			</div>
			<div class="info-item">
				<div class="label">ID Number</div>
				<div class="value">XXXX XXXX 1234</div>
			</div>
		</div>

		<div class="form-group" style="margin-top: 12px;">
			<label>Verification Notes</label>
			<textarea placeholder="Add KYC verification notes..." id="kyc-notes"></textarea>
		</div>
	`;

	document.getElementById('btn-approve-kyc').onclick = () => approveKYC(sellerId);
	document.getElementById('btn-reject-kyc').onclick = () => rejectKYC(sellerId);
	document.getElementById('btn-request-kyc').onclick = () => requestKYCResubmission(sellerId);

	openModal('kyc-modal');
}

async function approveKYC(sellerId) {
	const seller = db.sellers.find(s => s.id === sellerId);
	const notes = document.getElementById('kyc-notes').value || 'KYC verification approved';

	try {
		await api(`/sellers/${sellerId}/kyc/approve`, { method: 'POST', body: JSON.stringify({ notes }) });
		await loadDashboardData();
		closeModal('kyc-modal');
		renderPayoutQueue();
		showToast(`KYC verified for ${seller.name}`, 'success');
	} catch (error) {
		showToast(error.message, 'error');
	}
}

async function rejectKYC(sellerId) {
	const seller = db.sellers.find(s => s.id === sellerId);
	const notes = document.getElementById('kyc-notes').value || 'KYC verification rejected';

	try {
		await api(`/sellers/${sellerId}/kyc/reject`, { method: 'POST', body: JSON.stringify({ notes }) });
		await loadDashboardData();
		closeModal('kyc-modal');
		renderPayoutQueue();
		showToast(`KYC rejected for ${seller.name} - Payout frozen`, 'danger');
	} catch (error) {
		showToast(error.message, 'error');
	}
}

async function requestKYCResubmission(sellerId) {
	const seller = db.sellers.find(s => s.id === sellerId);
	const notes = document.getElementById('kyc-notes').value || 'KYC resubmission requested';

	try {
		await api(`/sellers/${sellerId}/kyc/request`, { method: 'POST', body: JSON.stringify({ notes }) });
		await loadDashboardData();
		closeModal('kyc-modal');
		renderPayoutQueue();
		showToast(`KYC resubmission requested from ${seller.name}`, 'warning');
	} catch (error) {
		showToast(error.message, 'error');
	}
}

// ==================== FAILED PAYMENTS ====================

function renderFailedPayments() {
	const tbody = document.getElementById('failed-payments-tbody');
	
	const rows = currentState.filteredFailed.map(fp => `
		<tr>
			<td>${fp.orderId}</td>
			<td>${fp.customerName}</td>
			<td>${formatCurrency(fp.amount)}</td>
			<td><span class="pill ${getStatusBadgeClass(fp.failureType)}">${fp.failureType.replace('-', ' ')}</span></td>
			<td>${fp.errorMsg}</td>
			<td>${formatDate(fp.createdAt)}</td>
			<td class="actions">
				<button class="action-btn" onclick="retryFailedPayment('${fp.id}')"><span class="material-symbols-rounded" style="font-size: 16px;">refresh</span></button>
				<button class="action-btn" onclick="markPaymentFraud('${fp.id}')"><span class="material-symbols-rounded" style="font-size: 16px;">security</span></button>
			</td>
		</tr>
	`).join('');

	tbody.innerHTML = rows || '<tr><td colspan="7" style="text-align: center; padding: 20px;">No failed payments</td></tr>';
}

async function retryFailedPayment(failedPaymentId) {
	try {
		await api(`/failed-payments/${failedPaymentId}/retry`, { method: 'POST', body: JSON.stringify({}) });
		await loadDashboardData();
		renderFailedPayments();
		showToast('Retry initiated', 'info');
	} catch (error) {
		showToast(error.message, 'error');
	}
}

async function markPaymentFraud(failedPaymentId) {
	try {
		await api(`/failed-payments/${failedPaymentId}/fraud`, { method: 'POST', body: JSON.stringify({}) });
		await loadDashboardData();
		renderFailedPayments();
		showToast('Fraud marked - Related seller risk level increased', 'danger');
	} catch (error) {
		showToast(error.message, 'error');
	}
}

// ==================== AUDIT LOG ====================

async function showAuditLog() {
	const timeline = document.getElementById('audit-timeline');
	const response = await api('/audit');
	db.auditLog = response.data || [];
	
	const items = db.auditLog.map(entry => `
		<div class="timeline-item">
			<div class="dot"></div>
			<div class="timeline-content">
				<strong>${entry.action.replace('-', ' ').toUpperCase()}</strong><br>
				${entry.orderId ? `Order: ${entry.orderId}<br>` : ''}
				${entry.sellerId ? `Seller: ${entry.sellerId}<br>` : ''}
				${entry.notes ? `<em>${entry.notes}</em><br>` : ''}
				<span class="time">${formatDateTime(entry.timestamp)}</span>
			</div>
		</div>
	`).join('');

	timeline.innerHTML = items || '<div style="text-align: center; padding: 20px; color: var(--muted);">No audit entries yet</div>';

	openModal('audit-log-modal');
}

// ==================== FILTERS & SEARCH ====================

function setupFilters() {
	// Online Payments Filters
	document.getElementById('search-online').addEventListener('input', filterOnlinePayments);
	document.getElementById('filter-payment-status').addEventListener('change', filterOnlinePayments);
	document.getElementById('filter-escrow-status').addEventListener('change', filterOnlinePayments);

	// COD Filters
	document.getElementById('search-cod').addEventListener('input', filterCOD);
	document.getElementById('filter-delivery-status').addEventListener('change', filterCOD);
	document.getElementById('filter-cod-deposit').addEventListener('change', filterCOD);

	// Payout Filters
	document.getElementById('search-payout').addEventListener('input', filterPayout);
	document.getElementById('filter-kyc-status').addEventListener('change', filterPayout);
	document.getElementById('filter-bank-status').addEventListener('change', filterPayout);
	document.getElementById('filter-risk-status').addEventListener('change', filterPayout);

	// Failed Payments Filter
	document.getElementById('search-failed').addEventListener('input', filterFailedPayments);
	document.getElementById('filter-failure-type').addEventListener('change', filterFailedPayments);
}

function filterOnlinePayments() {
	const search = document.getElementById('search-online').value.toLowerCase();
	const paymentStatus = document.getElementById('filter-payment-status').value;
	const escrowStatus = document.getElementById('filter-escrow-status').value;

	currentState.filteredPayments = db.onlinePayments.filter(p => {
		const matchesSearch = !search || 
			p.orderId.toLowerCase().includes(search) ||
			p.customerName.toLowerCase().includes(search) ||
			p.sellerName.toLowerCase().includes(search);
		
		const matchesPaymentStatus = !paymentStatus || p.paymentStatus === paymentStatus;
		const matchesEscrowStatus = !escrowStatus || p.escrowStatus === escrowStatus;

		return matchesSearch && matchesPaymentStatus && matchesEscrowStatus;
	});

	renderOnlinePayments();
}

function filterCOD() {
	const search = document.getElementById('search-cod').value.toLowerCase();
	const deliveryStatus = document.getElementById('filter-delivery-status').value;
	const depositStatus = document.getElementById('filter-cod-deposit').value;

	currentState.filteredCOD = db.codTracking.filter((item) => {
		const matchesSearch = !search || item.orderId.toLowerCase().includes(search) || item.sellerName.toLowerCase().includes(search) || item.courierName.toLowerCase().includes(search);
		const matchesDelivery = !deliveryStatus || item.deliveryStatus === deliveryStatus;
		const matchesDeposit = !depositStatus || item.courierDepositStatus === depositStatus;
		return matchesSearch && matchesDelivery && matchesDeposit;
	});

	renderCODTracking();
}

function filterPayout() {
	const search = document.getElementById('search-payout').value.toLowerCase();
	const kycStatus = document.getElementById('filter-kyc-status').value;
	const bankStatus = document.getElementById('filter-bank-status').value;
	const riskStatus = document.getElementById('filter-risk-status').value;

	currentState.filteredSellers = db.sellers.filter((seller) => {
		const matchesSearch = !search || seller.name.toLowerCase().includes(search);
		const matchesKyc = !kycStatus || seller.kycStatus === kycStatus;
		const matchesBank = !bankStatus || seller.bankStatus === bankStatus;
		const matchesRisk = !riskStatus || seller.riskLevel === riskStatus;
		return matchesSearch && matchesKyc && matchesBank && matchesRisk;
	});

	renderPayoutQueue();
}

function filterFailedPayments() {
	const search = document.getElementById('search-failed').value.toLowerCase();
	const failureType = document.getElementById('filter-failure-type').value;

	currentState.filteredFailed = db.failedPayments.filter((payment) => {
		const matchesSearch = !search || payment.orderId.toLowerCase().includes(search) || payment.customerName.toLowerCase().includes(search);
		const matchesFailure = !failureType || payment.failureType === failureType;
		return matchesSearch && matchesFailure;
	});

	renderFailedPayments();
}

// ==================== TAB MANAGEMENT ====================

function activateTab(tabId) {
	const tabs = document.querySelectorAll('.tab');
	tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
	document.querySelectorAll('.tab-content').forEach(content => {
		content.classList.toggle('active', content.id === tabId);
	});
}

function setupTabs() {
	const tabs = document.querySelectorAll('.tab');
	
	tabs.forEach(tab => {
		tab.addEventListener('click', () => {
			// Remove active from all tabs and contents
			tabs.forEach(t => t.classList.remove('active'));
			document.querySelectorAll('.tab-content').forEach(content => {
				content.classList.remove('active');
			});

			// Add active to clicked tab and corresponding content
			tab.classList.add('active');
			const tabId = tab.dataset.tab;
			document.getElementById(tabId).classList.add('active');
			history.replaceState(null, '', `#${tabId}`);
		});
	});
}

function openInitialTab() {
	const targetTab = window.location.hash ? window.location.hash.slice(1) : '';
	const validTab = document.querySelector(`.tab[data-tab="${targetTab}"]`);
	if (validTab) {
		activateTab(targetTab);
	} else {
		activateTab('online-payments');
	}
}

// ==================== INITIALIZATION ====================

async function initializeDashboard() {
	try {
		const sessionReady = await ensureAdminSession();
		if (!sessionReady) return;
		await loadDashboardData();
		renderKPIStats();
		renderFinancialOverview();
		renderOnlinePayments();
		renderCODTracking();
		renderPayoutQueue();
		renderFailedPayments();
		setupTabs();
		openInitialTab();
		setupFilters();
		setupEventListeners();
	} catch (error) {
		console.error('Payment dashboard init failed:', error);
		clearDashboardData();
		renderKPIStats();
		renderFinancialOverview();
		renderOnlinePayments();
		renderCODTracking();
		renderPayoutQueue();
		renderFailedPayments();
		showToast(`Failed to load payment data: ${error.message}`, 'error');
	}
}

function setupEventListeners() {
	// Reconciliation button
	document.getElementById('btn-reconcile-cod').addEventListener('click', () => {
		const pendingCod = db.codTracking.filter(c => c.courierDepositStatus === 'pending');
		showToast(`${pendingCod.length} COD records pending reconciliation`, 'info');
	});

	// Audit log button
	document.getElementById('btn-audit-log').addEventListener('click', showAuditLog);

	// Report download
	document.getElementById('btn-generate-report').addEventListener('click', () => {
		const metrics = calculateFinancialMetrics();
		const csv = `Financial Report\nGenerated: ${new Date().toISOString()}\n\nTotal Gross Sales,${metrics.totalGrossSales}\nTotal Commission,${metrics.totalCommission}\nTotal Paid Out,${metrics.totalPaidOut}`;
		downloadFile(csv, 'financial-report.csv');
		showToast('Report downloaded', 'success');
	});

	// Batch approve button
	document.getElementById('btn-batch-approve').addEventListener('click', async () => {
		const selected = document.querySelectorAll('.seller-checkbox:checked');
		if (selected.length === 0) {
			showToast('Please select sellers to approve', 'warning');
			return;
		}

		const hasPendingRequests = Array.from(selected).some((item) => {
			const seller = db.sellers?.find((entry) => entry.id === item.dataset.sellerId);
			const requestAmount = seller?.paymentRequestAmount ?? seller?.payment_request_amount ?? 0;
			return Number(requestAmount) > 0;
		});

		if (!hasPendingRequests) {
			showToast('No payment requests available for the selected sellers', 'warning');
			return;
		}

		try {
			await api('/payouts/batch-approve', {
				method: 'POST',
				body: JSON.stringify({ ids: Array.from(selected).map((item) => item.dataset.sellerId) })
			});
			await loadDashboardData();
			renderPayoutQueue();
			showToast(`Batch approval processed for ${selected.length} sellers`, 'success');
		} catch (error) {
			showToast(error.message, 'error');
		}
	});
}

function downloadFile(content, filename) {
	const element = document.createElement('a');
	element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
	element.setAttribute('download', filename);
	element.style.display = 'none';
	document.body.appendChild(element);
	element.click();
	document.body.removeChild(element);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeDashboard);
