// ============================================================================
// ADMIN DISPUTE & SUPPORT MANAGEMENT SYSTEM
// Real-world marketplace behavior with complete financial logic
// ============================================================================

// ============================================================================
// MOCK DATABASE
// ============================================================================

const platform = {
	revenue: 145000,
	commissionsCollected: 38000,
	refundsIssued: 12000,
	finesCollected: 2500,
	ledgerBalance: 0,
	totalDisputes: 0,
	resolvedDisputes: 0,
};

const sellers = [
	{
		id: 'S001',
		name: 'ElectroHub Store',
		email: 'contact@electrohub.com',
		availableBalance: 28500,
		pendingBalance: 5200,
		totalEarnings: 125000,
		refundDeductions: 2100,
		finesApplied: 500,
		totalDisputesCount: 8,
		totalDisputesResolved: 6,
		disputeRate: 0.064,
		refundRate: 0.045,
		lateDeliveryPercentage: 8,
		chatViolations: 2,
		status: 'active',
		kycStatus: 'verified',
		riskScore: 45,
		listings: 2400,
	},
	{
		id: 'S002',
		name: 'FashionHub',
		email: 'support@fashionhub.com',
		availableBalance: 18900,
		pendingBalance: 3400,
		totalEarnings: 92000,
		refundDeductions: 3500,
		finesApplied: 1200,
		totalDisputesCount: 12,
		totalDisputesResolved: 10,
		disputeRate: 0.098,
		refundRate: 0.072,
		lateDeliveryPercentage: 15,
		chatViolations: 5,
		status: 'active',
		kycStatus: 'verified',
		riskScore: 68,
		listings: 1800,
	},
	{
		id: 'S003',
		name: 'HomeDecor Plus',
		email: 'team@homedecorplus.com',
		availableBalance: 12300,
		pendingBalance: 2100,
		totalEarnings: 65000,
		refundDeductions: 950,
		finesApplied: 300,
		totalDisputesCount: 2,
		totalDisputesResolved: 2,
		disputeRate: 0.021,
		refundRate: 0.018,
		lateDeliveryPercentage: 3,
		chatViolations: 0,
		status: 'active',
		kycStatus: 'verified',
		riskScore: 22,
		listings: 950,
	},
	{
		id: 'S004',
		name: 'BookWorld',
		email: 'support@bookworld.com',
		availableBalance: -850,
		pendingBalance: 1200,
		totalEarnings: 45000,
		refundDeductions: 4200,
		finesApplied: 2500,
		totalDisputesCount: 18,
		totalDisputesResolved: 14,
		disputeRate: 0.156,
		refundRate: 0.118,
		lateDeliveryPercentage: 22,
		chatViolations: 8,
		status: 'active',
		kycStatus: 'pending',
		riskScore: 92,
		listings: 1200,
	},
	{
		id: 'S005',
		name: 'TechWorld',
		email: 'contact@techworld.com',
		availableBalance: 5200,
		pendingBalance: 0,
		totalEarnings: 32000,
		refundDeductions: 5600,
		finesApplied: 3100,
		totalDisputesCount: 22,
		totalDisputesResolved: 18,
		disputeRate: 0.187,
		refundRate: 0.145,
		lateDeliveryPercentage: 28,
		chatViolations: 12,
		status: 'deactivated',
		kycStatus: 'rejected',
		riskScore: 98,
		listings: 0,
	},
];

const buyers = [
	{ id: 'B001', name: 'Rahul Kumar', email: 'rahul@email.com', phone: '9876543210', status: 'active' },
	{ id: 'B002', name: 'Priya Singh', email: 'priya@email.com', phone: '9876543211', status: 'active' },
	{ id: 'B003', name: 'Amit Patel', email: 'amit@email.com', phone: '9876543212', status: 'active' },
	{ id: 'B004', name: 'Neha Gupta', email: 'neha@email.com', phone: '9876543213', status: 'blocked' },
	{ id: 'B005', name: 'Vikram Joshi', email: 'vikram@email.com', phone: '9876543214', status: 'active' },
];

const orders = [
	{
		id: 'ORD001',
		buyerId: 'B001',
		buyerName: 'Rahul Kumar',
		sellerId: 'S001',
		sellerName: 'ElectroHub Store',
		product: 'Wireless Earbuds',
		amount: 1299,
		escrowAmount: 1299,
		status: 'under-dispute',
		paymentMethod: 'credit-card',
		deliveryDate: '2025-02-15',
		createdDate: '2025-02-01',
	},
	{
		id: 'ORD002',
		buyerId: 'B002',
		buyerName: 'Priya Singh',
		sellerId: 'S002',
		sellerName: 'FashionHub',
		product: 'Summer Dress',
		amount: 599,
		escrowAmount: 599,
		status: 'delivered',
		paymentMethod: 'upi',
		deliveryDate: '2025-02-12',
		createdDate: '2025-02-05',
	},
	{
		id: 'ORD003',
		buyerId: 'B003',
		buyerName: 'Amit Patel',
		sellerId: 'S001',
		sellerName: 'ElectroHub Store',
		product: 'USB-C Cable',
		amount: 349,
		escrowAmount: 349,
		status: 'under-dispute',
		paymentMethod: 'debit-card',
		deliveryDate: '2025-02-18',
		createdDate: '2025-02-08',
	},
	{
		id: 'ORD004',
		buyerId: 'B005',
		buyerName: 'Vikram Joshi',
		sellerId: 'S003',
		sellerName: 'HomeDecor Plus',
		product: 'Wall Mount',
		amount: 450,
		escrowAmount: 450,
		status: 'delivered',
		paymentMethod: 'wallet',
		deliveryDate: '2025-02-10',
		createdDate: '2025-02-03',
	},
];

const disputes = [
	{
		id: 'DT001',
		orderId: 'ORD001',
		buyerId: 'B001',
		buyerName: 'Rahul Kumar',
		sellerId: 'S001',
		sellerName: 'ElectroHub Store',
		issueType: 'damaged',
		description: 'Earbuds received with broken right speaker',
		evidenceSubmitted: ['photo-1.jpg', 'video-1.mp4'],
		escrowStatus: 'held',
		payoutStatus: 'blocked',
		priority: 'high',
		status: 'under-review',
		createdDate: '2025-02-16',
		updatedDate: '2025-02-19',
		sellerResponse: 'Ready to send replacement or refund',
		buyerResponse: 'Need refund, do not want replacement',
		adminNotes: '',
		resolution: null,
	},
	{
		id: 'DT002',
		orderId: 'ORD003',
		buyerId: 'B003',
		buyerName: 'Amit Patel',
		sellerId: 'S001',
		sellerName: 'ElectroHub Store',
		issueType: 'wrong-item',
		description: 'Received USB-A instead of USB-C cable',
		evidenceSubmitted: ['photo-2.jpg'],
		escrowStatus: 'held',
		payoutStatus: 'blocked',
		priority: 'medium',
		status: 'open',
		createdDate: '2025-02-19',
		updatedDate: '2025-02-19',
		sellerResponse: null,
		buyerResponse: null,
		adminNotes: '',
		resolution: null,
	},
];

const chats = [
	{
		orderId: 'ORD001',
		buyerId: 'B001',
		buyerName: 'Rahul Kumar',
		sellerId: 'S001',
		sellerName: 'ElectroHub Store',
		status: 'escalated',
		flags: ['rude-language'],
		messages: [
			{ role: 'buyer', name: 'Rahul Kumar', text: 'Hi, I received earbuds but right speaker is broken', time: '2025-02-16 10:30' },
			{ role: 'seller', name: 'ElectroHub Store', text: 'Sorry to hear that. Can you send us photos?', time: '2025-02-16 11:15' },
			{ role: 'buyer', name: 'Rahul Kumar', text: 'Already sent! This is ridiculous, you always send defective items', time: '2025-02-16 12:00' },
			{ role: 'seller', name: 'ElectroHub Store', text: 'We understand your frustration. We can send replacement immediately.', time: '2025-02-16 13:30' },
			{ role: 'buyer', name: 'Rahul Kumar', text: 'No replacement. I want my money back NOW', time: '2025-02-16 14:15' },
		],
		lastMessageTime: '2025-02-16 14:15',
		adminJoined: false,
		adminMessages: [],
	},
	{
		orderId: 'ORD003',
		buyerId: 'B003',
		buyerName: 'Amit Patel',
		sellerId: 'S001',
		sellerName: 'ElectroHub Store',
		status: 'normal',
		flags: [],
		messages: [
			{ role: 'buyer', name: 'Amit Patel', text: 'Hi, I ordered USB-C cable but received USB-A', time: '2025-02-19 09:00' },
			{ role: 'seller', name: 'ElectroHub Store', text: 'Apologies for the mix-up. We will send correct item immediately.', time: '2025-02-19 09:45' },
			{ role: 'buyer', name: 'Amit Patel', text: 'Can I get a refund instead?', time: '2025-02-19 10:30' },
		],
		lastMessageTime: '2025-02-19 10:30',
		adminJoined: false,
		adminMessages: [],
	},
];

const auditLog = [];

const enforcementActions = [
	{
		id: 'EA001',
		subject: 'BookWorld',
		subjectType: 'seller',
		actionType: 'fine',
		amount: 2500,
		reason: 'High dispute rate (18.6%)',
		dateApplied: '2025-02-15',
		status: 'active',
		notes: 'Fine due to excessive disputes and policy violations',
	},
	{
		id: 'EA002',
		subject: 'Neha Gupta',
		subjectType: 'buyer',
		actionType: 'blocking',
		amount: null,
		reason: 'Refund abuse pattern',
		dateApplied: '2025-02-10',
		status: 'active',
		notes: 'Blocked account and IP after 5 false refund claims',
	},
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function showToast(message, type = 'info') {
	const toast = document.getElementById('toast');
	toast.textContent = message;
	toast.classList.add('show');
	setTimeout(() => toast.classList.remove('show'), 3000);
}

function closeModal(modalId) {
	document.getElementById(modalId).classList.remove('active');
}

function openModal(modalId, callback) {
	document.getElementById(modalId).classList.add('active');
	if (callback) callback();
}

function logAuditEntry(action, details) {
	const entry = {
		id: `AL${Date.now()}`,
		adminId: 'ADMIN001',
		adminName: 'System Admin',
		actionType: action,
		timestamp: new Date().toLocaleString('en-IN'),
		targetId: details.targetId || '',
		targetType: details.targetType || '',
		previousValue: details.previousValue || '',
		newValue: details.newValue || '',
		reason: details.reason || '',
		metadata: details.metadata || {},
	};
	auditLog.push(entry);
	console.log('Audit logged:', entry);
}

function calculateRiskScore(seller) {
	let score = 0;
	score += seller.disputeRate * 100 * 3; // Disputes weighted heavily
	score += seller.refundRate * 100 * 2;
	score += seller.lateDeliveryPercentage * 1.5;
	score += seller.chatViolations * 5;
	return Math.min(100, Math.round(score));
}

function getRiskLevel(riskScore) {
	if (riskScore < 30) return 'low';
	if (riskScore < 60) return 'medium';
	if (riskScore < 85) return 'high';
	return 'frozen';
}

// ============================================================================
// INITIALIZATION & RENDERING
// ============================================================================

function initializePage() {
	calculatePlatformMetrics();
	renderKPIStats();
	setupTabNavigation();
	setupSearch();
	renderDisputeTickets();
	renderChatMonitoring();
	renderAnalytics();
	renderEnforcement();
	setupModalListeners();
}

function calculatePlatformMetrics() {
	const totalDisputes = disputes.length;
	const resolvedDisputes = disputes.filter(d => d.status === 'resolved').length;
	const openDisputes = disputes.filter(d => d.status === 'open').length;
	const escalatedDisputes = disputes.filter(d => d.status === 'escalated').length;

	platform.totalDisputes = totalDisputes;
	platform.resolvedDisputes = resolvedDisputes;
	platform.ledgerBalance =
		platform.revenue - platform.commissionsCollected - platform.refundsIssued + platform.finesCollected;
}

function renderKPIStats() {
	const stats = [
		{
			label: 'Active Disputes',
			value: disputes.filter(d => ['open', 'under-review', 'escalated'].includes(d.status)).length,
			icon: 'assignment',
		},
		{
			label: 'Resolved (Success)',
			value: disputes.filter(d => d.status === 'resolved').length,
			icon: 'done_all',
		},
		{
			label: 'Total Refunds Issued',
			value: `₹${platform.refundsIssued.toLocaleString()}`,
			icon: 'money',
		},
		{
			label: 'Fines Collected',
			value: `₹${platform.finesCollected.toLocaleString()}`,
			icon: 'gavel',
		},
	];

	const statsGrid = document.getElementById('kpi-stats');
	statsGrid.innerHTML = stats
		.map(
			(stat) => `
		<div class="stat-card">
			<div class="label">${stat.label}</div>
			<div class="value">${stat.value}</div>
		</div>
	`
		)
		.join('');
}

// ============================================================================
// TAB NAVIGATION
// ============================================================================

function setupTabNavigation() {
	const tabs = document.querySelectorAll('.tab');
	const contents = document.querySelectorAll('.tab-content');

	tabs.forEach((tab) => {
		tab.addEventListener('click', () => {
			tabs.forEach((t) => t.classList.remove('active'));
			contents.forEach((c) => c.classList.remove('active'));

			tab.classList.add('active');
			const tabId = tab.getAttribute('data-tab');
			document.getElementById(tabId).classList.add('active');
		});
	});
}

// ============================================================================
// DISPUTES TAB
// ============================================================================

function renderDisputeTickets(filteredDisputes = null) {
	const disputesToShow = filteredDisputes || disputes;
	const tbody = document.getElementById('disputes-tbody');

	tbody.innerHTML = disputesToShow
		.map(
			(dispute) => `
		<tr>
			<td><strong>${dispute.id}</strong></td>
			<td>${dispute.orderId}</td>
			<td>${dispute.buyerName}</td>
			<td>${dispute.sellerName}</td>
			<td>${dispute.issueType.replace('-', ' ').toUpperCase()}</td>
			<td><span class="pill pill-${dispute.priority}">${dispute.priority}</span></td>
			<td><span class="pill pill-${dispute.status.replace('-', '-')}">${dispute.status.replace('-', ' ')}</span></td>
			<td>
				<span class="risk-badge risk-${getRiskLevel(calculateSellerRisk(dispute.sellerId))}" style="font-size: 11px;">
					${getRiskLevel(calculateSellerRisk(dispute.sellerId)).toUpperCase()}
				</span>
			</td>
			<td>${new Date(dispute.createdDate).toLocaleDateString('en-IN')}</td>
			<td>
				<button class="action-btn" onclick="viewDisputeDetails('${dispute.id}')">View</button>
				<button class="action-btn" onclick="openResolveModal('${dispute.id}')">Resolve</button>
			</td>
		</tr>
	`
		)
		.join('');
}

function calculateSellerRisk(sellerId) {
	const seller = sellers.find((s) => s.id === sellerId);
	return seller ? seller.riskScore : 0;
}

function viewDisputeDetails(disputeId) {
	const dispute = disputes.find((d) => d.id === disputeId);
	if (!dispute) return;

	const order = orders.find((o) => o.id === dispute.orderId);
	const seller = sellers.find((s) => s.id === dispute.sellerId);
	const buyer = buyers.find((b) => b.id === dispute.buyerId);

	const detailsHTML = `
		<div class="info-grid">
			<div class="info-item">
				<div class="label">Order ID</div>
				<div class="value">${dispute.orderId}</div>
			</div>
			<div class="info-item">
				<div class="label">Buyer</div>
				<div class="value">${buyer.name}</div>
			</div>
			<div class="info-item">
				<div class="label">Seller</div>
				<div class="value">${seller.name}</div>
			</div>
			<div class="info-item">
				<div class="label">Product</div>
				<div class="value">${order.product}</div>
			</div>
		</div>

		<div class="alert alert-info" style="margin: 12px 0;">
			<strong>Issue Type:</strong> ${dispute.issueType.replace('-', ' ').toUpperCase()}<br>
			<strong>Description:</strong> ${dispute.description}
		</div>

		<h4 style="margin: 16px 0 8px 0; font-weight: 600;">Financial Impact</h4>
		<div class="info-grid">
			<div class="info-item">
				<div class="label">Order Amount</div>
				<div class="value">₹${order.amount.toLocaleString()}</div>
			</div>
			<div class="info-item">
				<div class="label">Escrow Status</div>
				<div class="value">${dispute.escrowStatus}</div>
			</div>
			<div class="info-item">
				<div class="label">Escrow Amount</div>
				<div class="value">₹${dispute.escrowAmount || order.amount}</div>
			</div>
			<div class="info-item">
				<div class="label">Seller Available</div>
				<div class="value">₹${seller.availableBalance.toLocaleString()}</div>
			</div>
		</div>

		<h4 style="margin: 16px 0 8px 0; font-weight: 600;">Evidence Submitted</h4>
		<div class="evidence-container">
			${dispute.evidenceSubmitted
				.map(
					(file, i) => `
				<div class="evidence-item">
					${file.includes('.jpg') || file.includes('.png') ? `<img src="https://via.placeholder.com/150?text=Photo+${i + 1}" alt="Evidence">` : `<div style="width: 100%; height: 150px; display: flex; align-items: center; justify-content: center; background: #f0f0f0; font-size: 12px; text-align: center;">Video/File<br>${file}</div>`}
					<div class="type">${file.split('.').pop().toUpperCase()}</div>
				</div>
			`
				)
				.join('')}
		</div>

		<h4 style="margin: 16px 0 8px 0; font-weight: 600;">Buyer & Seller Responses</h4>
		<div style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 12px; font-size: 12px;">
			<strong>Buyer:</strong> ${dispute.buyerResponse || 'No response yet'}
		</div>
		<div style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 12px; font-size: 12px;">
			<strong>Seller:</strong> ${dispute.sellerResponse || 'No response yet'}
		</div>

		<h4 style="margin: 16px 0 8px 0; font-weight: 600;">Admin Actions</h4>
		<div style="display: flex; flex-direction: column; gap: 8px;">
			<button class="btn primary sm" onclick="openResolveModal('${dispute.id}')" style="justify-content: flex-start;">
				<span class="material-symbols-rounded" style="font-size: 16px;">check_circle</span>
				Resolve Dispute
			</button>
			<button class="btn warning sm" onclick="openManualRefundModal('${dispute.id}')" style="justify-content: flex-start;">
				<span class="material-symbols-rounded" style="font-size: 16px;">money</span>
				Manual Refund Override
			</button>
			<button class="btn danger sm" onclick="openFinedModal('${dispute.sellerId}')" style="justify-content: flex-start;">
				<span class="material-symbols-rounded" style="font-size: 16px;">gavel</span>
				Apply Fine to Seller
			</button>
		</div>
	`;

	document.getElementById('dispute-details-body').innerHTML = detailsHTML;
	document.getElementById('ticket-id-display').textContent = dispute.id;
	openModal('dispute-details-modal');
}

// ============================================================================
// CHAT MONITORING
// ============================================================================

function renderChatMonitoring(filteredChats = null) {
	const chatsToShow = filteredChats || chats;
	const tbody = document.getElementById('chats-tbody');

	tbody.innerHTML = chatsToShow
		.map(
			(chat) => `
		<tr>
			<td><strong>${chat.orderId}</strong></td>
			<td>${chat.buyerName}</td>
			<td>${chat.sellerName}</td>
			<td><span class="pill pill-${chat.status}">${chat.status.replace('-', ' ')}</span></td>
			<td>
				${
					chat.flags.length === 0
						? '<span class="pill pill-success">No Flags</span>'
						: chat.flags.map((f) => `<span class="pill pill-danger">${f.replace('-', ' ')}</span>`).join('')
				}
			</td>
			<td>${chat.messages.length}</td>
			<td>${chat.lastMessageTime}</td>
			<td>
				<button class="action-btn" onclick="viewChat('${chat.orderId}')">View Chat</button>
			</td>
		</tr>
	`
		)
		.join('');
}

function viewChat(orderId) {
	const chat = chats.find((c) => c.orderId === orderId);
	if (!chat) return;

	const chatHTML = `
		<div style="background: white; padding: 12px; border-radius: 10px; margin-bottom: 12px;">
			<div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
				<div>
					<strong>${chat.buyerName}</strong> (Buyer) ↔ <strong>${chat.sellerName}</strong> (Seller)
				</div>
				<div style="font-size: 11px; color: var(--muted);">
					Status: <span class="pill pill-${chat.status}">${chat.status}</span>
				</div>
			</div>

			<div class="chat-window">
				<div class="chat-messages">
					${chat.messages
						.map(
							(msg) => `
						<div class="chat-message ${msg.role}">
							<div class="message-row ${msg.role}">
								<span>${msg.name}</span>
								<span>${msg.time}</span>
							</div>
							<div class="message-bubble ${msg.role}">
								${msg.text}
							</div>
						</div>
					`
						)
						.join('')}
					${chat.adminMessages
						.map(
							(msg) => `
						<div class="chat-message admin">
							<div class="message-row admin">
								<span>🔵 ADMIN JOINED</span>
								<span>${msg.time}</span>
							</div>
							<div class="message-bubble admin">
								${msg.text}
							</div>
						</div>
					`
						)
						.join('')}
				</div>
			</div>

			${
				!chat.adminJoined
					? `
				<div class="alert alert-warning" style="margin-top: 12px; font-size: 12px;">
					<strong>Admin Status:</strong> Not yet joined. Click "Join Conversation" to enter visible to both parties.
				</div>
			`
					: `
				<div class="alert alert-success" style="margin-top: 12px; font-size: 12px;">
					<strong>Admin Status:</strong> ✓ Admin has joined this conversation
				</div>
			`
			}
		</div>
	`;

	document.getElementById('chat-window-body').innerHTML = chatHTML;
	document.getElementById('chat-order-id').textContent = orderId;

	const joinButton = document.getElementById('btn-join-chat');
	if (chat.adminJoined) {
		joinButton.textContent = 'Admin Already Joined';
		joinButton.disabled = true;
	} else {
		joinButton.disabled = false;
		joinButton.onclick = () => joinChat(orderId);
	}

	openModal('chat-window-modal');
}

function joinChat(orderId) {
	const chat = chats.find((c) => c.orderId === orderId);
	if (!chat) return;

	chat.adminJoined = true;
	chat.adminMessages.push({
		text: 'Admin has joined the conversation to help resolve this issue. Both parties will cooperate to find a solution.',
		time: new Date().toLocaleString('en-IN'),
	});

	logAuditEntry('admin-joined-chat', {
		targetId: orderId,
		targetType: 'chat',
		reason: 'Admin intervention for dispute management',
	});

	showToast('✓ Admin joined chat. Buyers and sellers have been notified.');
	viewChat(orderId); // Refresh
}

// ============================================================================
// ANALYTICS TAB
// ============================================================================

function renderAnalytics() {
	renderDisputeRateChart();
	renderIssueTypeChart();
	renderRiskScoresTable();
}

function renderDisputeRateChart() {
	const topSellers = sellers
		.map((s) => ({
			name: s.name,
			disputes: s.totalDisputesCount,
			rate: (s.disputeRate * 100).toFixed(2),
			riskScore: s.riskScore,
		}))
		.sort((a, b) => b.disputes - a.disputes)
		.slice(0, 5);

	const chartHTML = topSellers
		.map(
			(seller) => `
		<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
			<div style="flex: 1; font-size: 12px; min-width: 120px;">
				<strong>${seller.name}</strong><br>
				<span style="color: var(--muted); font-size: 11px;">${seller.disputes} disputes (${seller.rate}%)</span>
			</div>
			<div style="flex: 1; height: 20px; background: #e5e7eb; border-radius: 999px; overflow: hidden;">
				<div style="height: 100%; width: ${Math.min(seller.rate * 5, 100)}%; background: ${
				seller.rate < 5 ? '#28a745' : seller.rate < 10 ? '#ffc107' : '#dc3545'
			}; transition: width 0.3s;"></div>
			</div>
			<div style="font-size: 12px; font-weight: 600; min-width: 40px; text-align: right;">
				<span class="risk-badge risk-${getRiskLevel(seller.riskScore)}">${getRiskLevel(seller.riskScore).toUpperCase()}</span>
			</div>
		</div>
	`
		)
		.join('');

	document.getElementById('dispute-rate-chart').innerHTML = chartHTML;
}

function renderIssueTypeChart() {
	const issueCounts = {};
	disputes.forEach((d) => {
		issueCounts[d.issueType] = (issueCounts[d.issueType] || 0) + 1;
	});

	const chartHTML = Object.entries(issueCounts)
		.map(
			([type, count]) => `
		<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
			<div style="flex: 1; font-size: 12px; min-width: 120px;">
				<strong>${type.replace('-', ' ').toUpperCase()}</strong><br>
				<span style="color: var(--muted); font-size: 11px;">${count} disputes</span>
			</div>
			<div style="flex: 1; height: 20px; background: #e5e7eb; border-radius: 999px; overflow: hidden;">
				<div style="height: 100%; width: ${Math.min((count / disputes.length) * 100, 100)}%; background: #7c3aed; transition: width 0.3s;"></div>
			</div>
			<div style="font-size: 12px; font-weight: 600; min-width: 3 0px; text-align: right;">
				${((count / disputes.length) * 100).toFixed(1)}%
			</div>
		</div>
	`
		)
		.join('');

	document.getElementById('issue-type-chart').innerHTML = chartHTML;
}

function renderRiskScoresTable() {
	const sellerRisks = sellers
		.map((s) => ({
			...s,
			riskLevel: getRiskLevel(s.riskScore),
		}))
		.sort((a, b) => b.riskScore - a.riskScore);

	const tbody = document.getElementById('risk-scores-tbody');
	tbody.innerHTML = sellerRisks
		.map(
			(seller) => `
		<tr>
			<td><strong>${seller.name}</strong></td>
			<td>${seller.totalDisputesCount}</td>
			<td>${(seller.disputeRate * 100).toFixed(2)}%</td>
			<td>${(seller.refundRate * 100).toFixed(2)}%</td>
			<td>${seller.lateDeliveryPercentage}%</td>
			<td>${seller.chatViolations}</td>
			<td><strong>${seller.riskScore}/100</strong></td>
			<td><span class="risk-badge risk-${seller.riskLevel}">${seller.riskLevel.toUpperCase()}</span></td>
			<td>
				${
					seller.status === 'active'
						? '<span class="pill pill-success">Active</span>'
						: '<span class="pill pill-danger">Deactivated</span>'
				}
			</td>
		</tr>
	`
		)
		.join('');
}

// ============================================================================
// ENFORCEMENT TAB
// ============================================================================

function renderEnforcement(filteredActions = null) {
	const actionsToShow = filteredActions || enforcementActions;
	const tbody = document.getElementById('enforcement-tbody');

	tbody.innerHTML = actionsToShow
		.map(
			(action) => `
		<tr>
			<td><strong>${action.id}</strong></td>
			<td>${action.subject}</td>
			<td>${action.subjectType === 'seller' ? '🏪 Seller' : '👤 Buyer'}</td>
			<td>${action.actionType.replace('-', ' ').toUpperCase()}</td>
			<td>${action.amount ? '₹' + action.amount.toLocaleString() : '-'}</td>
			<td>${action.reason}</td>
			<td>${action.dateApplied}</td>
			<td><span class="pill ${action.status === 'active' ? 'pill-danger' : 'pill-success'}">${action.status}</span></td>
			<td>
				<button class="action-btn" onclick="viewEnforcementAction('${action.id}')">View</button>
			</td>
		</tr>
	`
		)
		.join('');
}

function viewEnforcementAction(actionId) {
	const action = enforcementActions.find((a) => a.id === actionId);
	if (!action) return;
	showToast(`Enforcement Action: ${action.actionType} on ${action.subject}`);
}

// ============================================================================
// DISPUTE RESOLUTION LOGIC
// ============================================================================

function openResolveModal(disputeId) {
	const dispute = disputes.find((d) => d.id === disputeId);
	if (!dispute) return;

	// Store current dispute for resolution
	window.currentDisputeId = disputeId;

	const options = document.querySelectorAll('input[name="resolution-option"]');
	options.forEach((opt) => {
		opt.addEventListener('change', () => {
			const partialSection = document.getElementById('partial-refund-options');
			partialSection.classList.toggle('hidden', opt.value !== 'partial-refund');
		});
	});

	document.getElementById('btn-confirm-resolve').onclick = () => resolveDispute(disputeId);
	openModal('resolve-dispute-modal');
}

function resolveDispute(disputeId) {
	const dispute = disputes.find((d) => d.id === disputeId);
	const order = orders.find((o) => o.id === dispute.orderId);
	const seller = sellers.find((s) => s.id === dispute.sellerId);
	const buyer = buyers.find((b) => b.id === dispute.buyerId);

	const option = document.querySelector('input[name="resolution-option"]:checked').value;
	const reason = document.getElementById('resolution-reason').value;

	if (!reason) {
		showToast('Please provide a resolution reason', 'warning');
		return;
	}

	let previousBalance = seller.availableBalance;
	let refundAmount = 0;

	if (option === 'release-seller') {
		// Release full escrow to seller
		seller.availableBalance += order.escrowAmount;
		dispute.escrowStatus = 'released';
		logAuditEntry('dispute-resolved', {
			targetId: disputeId,
			targetType: 'dispute',
			previousValue: `Balance: ${previousBalance}`,
			newValue: `Balance: ${seller.availableBalance}`,
			reason: 'Release to seller - ' + reason,
		});
		showToast(`✓ Dispute ${disputeId} resolved: Escrow released to seller`);
	} else if (option === 'refund-customer') {
		// Full refund to customer
		refundAmount = order.escrowAmount;
		seller.refundDeductions += refundAmount;
		seller.availableBalance -= refundAmount;
		platform.refundsIssued += refundAmount;
		dispute.escrowStatus = 'refunded';
		logAuditEntry('refund-issued', {
			targetId: disputeId,
			targetType: 'dispute',
			previousValue: `Balance: ${previousBalance}, Refunds: ${seller.refundDeductions - refundAmount}`,
			newValue: `Balance: ${seller.availableBalance}, Refunds: ${seller.refundDeductions}`,
			reason: 'Full customer refund - ' + reason,
		});
		showToast(`✓ Dispute ${disputeId} resolved: ₹${refundAmount} refunded to customer`);
	} else if (option === 'partial-refund') {
		// Partial refund
		const percentage = parseInt(document.getElementById('refund-percentage').value);
		refundAmount = Math.round((order.escrowAmount * percentage) / 100);
		const sellerAmount = order.escrowAmount - refundAmount;

		seller.refundDeductions += refundAmount;
		seller.availableBalance = seller.availableBalance - refundAmount + sellerAmount;
		platform.refundsIssued += refundAmount;
		dispute.escrowStatus = 'split';
		logAuditEntry('partial-refund-issued', {
			targetId: disputeId,
			targetType: 'dispute',
			previousValue: `Balance: ${previousBalance}`,
			newValue: `Balance: ${seller.availableBalance}`,
			reason: `${percentage}% refund to customer, ${100 - percentage}% to seller - ${reason}`,
		});
		showToast(
			`✓ Dispute ${disputeId} resolved: ₹${refundAmount} refunded, ₹${sellerAmount} to seller`
		);
	}

	dispute.status = 'resolved';
	dispute.resolution = { option, amount: refundAmount, reason, timestamp: new Date().toLocaleString('en-IN') };
	dispatch.payoutStatus = 'processed';
	order.status = 'dispute-resolved';

	closeModal('resolve-dispute-modal');
	renderDisputeTickets();
	renderKPIStats();
}

// ============================================================================
// FINANCIAL OVERRIDE FUNCTIONS
// ============================================================================

function openManualRefundModal(disputeId) {
	const dispute = disputes.find((d) => d.id === disputeId);
	const order = orders.find((o) => o.id === dispute.orderId);
	const seller = sellers.find((s) => s.id === dispute.sellerId);

	window.currentRefundDisputeId = disputeId;

	const infoHTML = `
		<div class="info-item">
			<div class="label">Order Amount</div>
			<div class="value">₹${order.amount.toLocaleString()}</div>
		</div>
		<div class="info-item">
			<div class="label">Escrow Available</div>
			<div class="value">₹${order.escrowAmount.toLocaleString()}</div>
		</div>
		<div class="info-item">
			<div class="label">Seller Balance</div>
			<div class="value">₹${seller.availableBalance.toLocaleString()}</div>
		</div>
	`;

	document.getElementById('refund-info-display').innerHTML = infoHTML;
	document.getElementById('refund-amount').max = order.escrowAmount;

	const refundTypeSelect = document.getElementById('refund-type');
	refundTypeSelect.addEventListener('change', () => {
		const partialSection = document.getElementById('partial-amount-section');
		partialSection.classList.toggle('hidden', refundTypeSelect.value === 'full');
	});

	document.getElementById('btn-confirm-refund').onclick = () => processManualRefund(disputeId);
	openModal('manual-refund-modal');
}

function processManualRefund(disputeId) {
	const dispute = disputes.find((d) => d.id === disputeId);
	const order = orders.find((o) => o.id === dispute.orderId);
	const seller = sellers.find((s) => s.id === dispute.sellerId);

	const refundType = document.getElementById('refund-type').value;
	const refundSource = document.getElementById('refund-source').value;
	const reason = document.getElementById('refund-reason').value;

	if (!reason) {
		showToast('Please provide reason for manual refund', 'warning');
		return;
	}

	let refundAmount = 0;

	if (refundType === 'full') {
		refundAmount = order.escrowAmount;
	} else {
		refundAmount = parseFloat(document.getElementById('refund-amount').value);
		if (refundAmount > order.escrowAmount) {
			showToast('Refund amount cannot exceed order amount', 'warning');
			return;
		}
	}

	if (refundSource === 'escrow') {
		seller.refundDeductions += refundAmount;
	} else {
		seller.availableBalance -= refundAmount;
		seller.refundDeductions += refundAmount;
	}

	platform.refundsIssued += refundAmount;

	logAuditEntry('manual-refund-issued', {
		targetId: disputeId,
		targetType: 'dispute',
		previousValue: `Refunds: ${seller.refundDeductions - refundAmount}`,
		newValue: `Refunds: ${seller.refundDeductions}`,
		reason: `Manual override - ${refundSource} - ${reason}`,
	});

	showToast(`✓ Manual refund of ₹${refundAmount} processed`);
	closeModal('manual-refund-modal');
	viewDisputeDetails(disputeId); // Refresh
}

// ============================================================================
// ENFORCEMENT FUNCTIONS
// ============================================================================

function openFinedModal(sellerId) {
	const seller = sellers.find((s) => s.id === sellerId);
	if (!seller) return;

	window.currentFinesSellerId = sellerId;

	const infoHTML = `
		<div class="info-item">
			<div class="label">Seller</div>
			<div class="value">${seller.name}</div>
		</div>
		<div class="info-item">
			<div class="label">Current Balance</div>
			<div class="value">₹${seller.availableBalance.toLocaleString()}</div>
		</div>
		<div class="info-item">
			<div class="label">Total Fines Applied</div>
			<div class="value">₹${seller.finesApplied.toLocaleString()}</div>
		</div>
	`;

	document.getElementById('fine-seller-info').innerHTML = infoHTML;
	document.getElementById('btn-confirm-fine').onclick = () => applyFine(sellerId);
	openModal('apply-fine-modal');
}

function applyFine(sellerId) {
	const seller = sellers.find((s) => s.id === sellerId);
	const amount = parseInt(document.getElementById('fine-amount').value);
	const reason = document.getElementById('fine-reason').value;
	const notes = document.getElementById('fine-notes').value;

	if (!reason) {
		showToast('Please select a reason for fine', 'warning');
		return;
	}

	if (amount <= 0) {
		showToast('Fine amount must be greater than 0', 'warning');
		return;
	}

	const previousBalance = seller.availableBalance;
	seller.finesApplied += amount;
	seller.availableBalance -= amount;
	platform.finesCollected += amount;

	enforcementActions.push({
		id: `EA${Date.now()}`,
		subject: seller.name,
		subjectType: 'seller',
		actionType: 'fine',
		amount: amount,
		reason: reason,
		dateApplied: new Date().toLocaleDateString('en-IN'),
		status: 'active',
		notes: notes,
	});

	logAuditEntry('fine-applied', {
		targetId: sellerId,
		targetType: 'seller',
		previousValue: `Balance: ${previousBalance}, Fines: ${seller.finesApplied - amount}`,
		newValue: `Balance: ${seller.availableBalance}, Fines: ${seller.finesApplied}`,
		reason: `${reason} - ${notes}`,
	});

	showToast(`✓ Fine of ₹${amount} applied to ${seller.name}`);
	closeModal('apply-fine-modal');
	renderEnforcement();
}

function openDeactivateSellerModal(sellerId) {
	const seller = sellers.find((s) => s.id === sellerId);
	if (!seller) return;

	window.currentDeactivateSellerId = sellerId;

	const infoHTML = `
		<div class="info-item">
			<div class="label">Seller</div>
			<div class="value">${seller.name}</div>
		</div>
		<div class="info-item">
			<div class="label">Risk Score</div>
			<div class="value">${seller.riskScore}/100</div>
		</div>
		<div class="info-item">
			<div class="label">Listings</div>
			<div class="value">${seller.listings}</div>
		</div>
	`;

	document.getElementById('deactivate-seller-info').innerHTML = infoHTML;

	const confirmCheckbox = document.getElementById('confirm-deactivation');
	const submitButton = document.getElementById('btn-confirm-deactivation');

	confirmCheckbox.addEventListener('change', () => {
		submitButton.disabled = !confirmCheckbox.checked;
	});

	submitButton.onclick = () => deactivateSeller(sellerId);
	openModal('deactivate-seller-modal');
}

function deactivateSeller(sellerId) {
	const seller = sellers.find((s) => s.id === sellerId);
	const reason = document.getElementById('deactivate-reason').value;
	const notes = document.getElementById('deactivate-notes').value;

	if (!reason) {
		showToast('Please select a reason', 'warning');
		return;
	}

	seller.status = 'deactivated';
	seller.listings = 0;

	enforcementActions.push({
		id: `EA${Date.now()}`,
		subject: seller.name,
		subjectType: 'seller',
		actionType: 'deactivation',
		amount: null,
		reason: reason,
		dateApplied: new Date().toLocaleDateString('en-IN'),
		status: 'active',
		notes: notes,
	});

	logAuditEntry('seller-deactivated', {
		targetId: sellerId,
		targetType: 'seller',
		previousValue: `Status: active, Listings: ${seller.listings}`,
		newValue: `Status: deactivated, Listings: 0`,
		reason: `${reason} - ${notes}`,
	});

	showToast(`✓ ${seller.name} has been deactivated`);
	closeModal('deactivate-seller-modal');
	renderEnforcement();
}

function openBlockBuyerModal(buyerId) {
	const buyer = buyers.find((b) => b.id === buyerId);
	if (!buyer) return;

	window.currentBlockBuyerId = buyerId;

	const infoHTML = `
		<div class="info-item">
			<div class="label">Buyer</div>
			<div class="value">${buyer.name}</div>
		</div>
		<div class="info-item">
			<div class="label">Email</div>
			<div class="value">${buyer.email}</div>
		</div>
		<div class="info-item">
			<div class="label">Phone</div>
			<div class="value">${buyer.phone}</div>
		</div>
	`;

	document.getElementById('block-buyer-info').innerHTML = infoHTML;
	document.getElementById('btn-confirm-block').onclick = () => blockBuyer(buyerId);
	openModal('block-buyer-modal');
}

function blockBuyer(buyerId) {
	const buyer = buyers.find((b) => b.id === buyerId);
	const reason = document.getElementById('block-buyer-reason').value;
	const notes = document.getElementById('block-buyer-notes').value;
	const blockOptions = Array.from(document.querySelectorAll('.block-option:checked')).map((el) => el.value);

	if (!reason) {
		showToast('Please select a reason', 'warning');
		return;
	}

	if (blockOptions.length === 0) {
		showToast('Select at least one blocking option', 'warning');
		return;
	}

	buyer.status = 'blocked';

	enforcementActions.push({
		id: `EA${Date.now()}`,
		subject: buyer.name,
		subjectType: 'buyer',
		actionType: 'blocking',
		amount: null,
		reason: reason,
		dateApplied: new Date().toLocaleDateString('en-IN'),
		status: 'active',
		notes: `Blocked: ${blockOptions.join(', ')} - ${notes}`,
	});

	logAuditEntry('buyer-blocked', {
		targetId: buyerId,
		targetType: 'buyer',
		previousValue: `Status: active`,
		newValue: `Status: blocked (${blockOptions.join(', ')})`,
		reason: `${reason} - ${notes}`,
	});

	showToast(`✓ ${buyer.name} has been blocked`);
	closeModal('block-buyer-modal');
	renderEnforcement();
}

// ============================================================================
// SEARCH & FILTERING
// ============================================================================

function setupSearch() {
	// Disputes
	document.getElementById('search-disputes').addEventListener('input', (e) => {
		const query = e.target.value.toLowerCase();
		const filtered = disputes.filter(
			(d) =>
				d.id.toLowerCase().includes(query) ||
				d.orderId.toLowerCase().includes(query) ||
				d.buyerName.toLowerCase().includes(query) ||
				d.sellerName.toLowerCase().includes(query)
		);
		renderDisputeTickets(filtered);
	});

	// Dispute Status Filter
	document.getElementById('filter-status').addEventListener('change', applyDisputeFilters);
	document.getElementById('filter-type').addEventListener('change', applyDisputeFilters);
	document.getElementById('filter-priority').addEventListener('change', applyDisputeFilters);

	// Chats
	document.getElementById('search-chats').addEventListener('input', (e) => {
		const query = e.target.value.toLowerCase();
		const filtered = chats.filter(
			(c) =>
				c.orderId.toLowerCase().includes(query) ||
				c.buyerName.toLowerCase().includes(query) ||
				c.sellerName.toLowerCase().includes(query)
		);
		renderChatMonitoring(filtered);
	});

	document.getElementById('filter-chat-status').addEventListener('change', applyChatFilters);
	document.getElementById('filter-chat-flags').addEventListener('change', applyChatFilters);

	// Enforcement
	document.getElementById('search-enforcement').addEventListener('input', (e) => {
		const query = e.target.value.toLowerCase();
		const filtered = enforcementActions.filter(
			(a) =>
				a.id.toLowerCase().includes(query) ||
				a.subject.toLowerCase().includes(query) ||
				a.reason.toLowerCase().includes(query)
		);
		renderEnforcement(filtered);
	});

	document.getElementById('filter-enforcement-type').addEventListener('change', applyEnforcementFilters);
	document.getElementById('filter-enforcement-status').addEventListener('change', applyEnforcementFilters);
}

function applyDisputeFilters() {
	const status = document.getElementById('filter-status').value;
	const type = document.getElementById('filter-type').value;
	const priority = document.getElementById('filter-priority').value;

	const filtered = disputes.filter((d) => {
		return (
			(status === '' || d.status === status) &&
			(type === '' || d.issueType === type) &&
			(priority === '' || d.priority === priority)
		);
	});

	renderDisputeTickets(filtered);
}

function applyChatFilters() {
	const status = document.getElementById('filter-chat-status').value;
	const flags = document.getElementById('filter-chat-flags').value;

	const filtered = chats.filter((c) => {
		const statusMatch = status === '' || c.status === status;
		const flagsMatch =
			flags === '' ||
			(flags === 'clean' && c.flags.length === 0) ||
			(flags !== 'clean' && c.flags.includes(flags));
		return statusMatch && flagsMatch;
	});

	renderChatMonitoring(filtered);
}

function applyEnforcementFilters() {
	const type = document.getElementById('filter-enforcement-type').value;
	const status = document.getElementById('filter-enforcement-status').value;

	const filtered = enforcementActions.filter((a) => {
		return (type === '' || a.actionType === type) && (status === '' || a.status === status);
	});

	renderEnforcement(filtered);
}

// ============================================================================
// AUDIT LOG
// ============================================================================

function setupAuditLog() {
	document.getElementById('btn-audit-logs').addEventListener('click', () => {
		renderAuditLog();
		openModal('audit-log-modal');
	});
}

function renderAuditLog() {
	const timeline = document.getElementById('audit-timeline');
	timeline.innerHTML = auditLog
		.slice()
		.reverse()
		.map(
			(entry) => `
		<div class="timeline-item">
			<div class="dot"></div>
			<div class="timeline-content">
				<div style="font-weight: 600; margin-bottom: 4px;">
					${entry.actionType.replace('-', ' ').toUpperCase()}
				</div>
				<div class="time">${entry.timestamp}</div>
				<div style="margin-top: 6px; font-size: 11px; color: var(--text);">
					<strong>Target:</strong> ${entry.targetType} (${entry.targetId})<br>
					<strong>Change:</strong> ${entry.previousValue} → ${entry.newValue}<br>
					<strong>Reason:</strong> ${entry.reason}
				</div>
			</div>
		</div>
	`
		)
		.join('');
}

// ============================================================================
// MODAL LISTENER SETUP
// ============================================================================

function setupModalListeners() {
	setupAuditLog();
}

// ============================================================================
// PAGE INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', initializePage);
