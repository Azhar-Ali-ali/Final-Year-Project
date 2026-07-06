// CMS Dashboard - Complete Backend Logic

// Mock Database
const cmsDatabase = {
	// Role: Super Admin
	currentAdmin: {
		id: 'ADMIN001',
		name: 'Admin User',
		email: 'admin@store.com',
		role: 'super-admin',
		permissions: ['banners', 'landing-pages', 'blog', 'faq', 'legal', 'media', 'announcements', 'audit']
	},

	// Banners Data
	banners: [
		{
			id: 'BAN001',
			title: 'Black Friday Sale',
			location: 'homepage',
			headline: 'Black Friday Event',
			subtext: 'Up to 70% off on selected items',
			ctaText: 'Shop Now',
			ctaLink: 'https://mystore.com/shop',
			image: 'https://via.placeholder.com/1200x400/232f3e/ffffff?text=Black+Friday',
			startDate: new Date(new Date().setDate(new Date().getDate() - 2)),
			endDate: new Date(new Date().setDate(new Date().getDate() + 5)),
			enabled: true,
			status: 'active',
			views: 12450,
			clicks: 2340
		},
		{
			id: 'BAN002',
			title: 'Nike Exclusive',
			location: 'shoes',
			headline: 'New Nike Collection',
			subtext: 'Limited edition shoes just arrived',
			ctaText: 'View Collection',
			ctaLink: 'https://mystore.com/shoes/nike',
			image: 'https://via.placeholder.com/1200x400/232f3e/ffffff?text=Nike+Collection',
			startDate: new Date(new Date().setDate(new Date().getDate() + 7)),
			endDate: new Date(new Date().setDate(new Date().getDate() + 30)),
			enabled: true,
			status: 'scheduled',
			views: 0,
			clicks: 0
		},
		{
			id: 'BAN003',
			title: 'Electronics Mega Deal',
			location: 'electronics',
			headline: 'Electronics Mega Deal',
			subtext: 'Best tech deals of the season',
			ctaText: 'Explore',
			ctaLink: 'https://mystore.com/electronics',
			image: 'https://via.placeholder.com/1200x400/232f3e/ffffff?text=Electronics+Deal',
			startDate: new Date(new Date().setDate(new Date().getDate() - 10)),
			endDate: new Date(new Date().setDate(new Date().getDate() - 3)),
			enabled: false,
			status: 'expired',
			views: 8920,
			clicks: 1560
		}
	],

	// Landing Pages Data
	landingPages: [
		{
			id: 'LAND001',
			name: 'Summer Vibes Campaign',
			slug: 'summer-vibes',
			status: 'published',
			publishedDate: new Date(new Date().setDate(new Date().getDate() - 15)),
			content: '<h1>Summer Collection</h1><p>Explore our latest summer collection...</p>',
			featuredProducts: ['PROD001', 'PROD002', 'PROD003'],
			views: 5234,
			conversions: 342,
			conversionRate: 6.5
		},
		{
			id: 'LAND002',
			name: 'Flash Sale Event',
			slug: 'flash-sale',
			status: 'scheduled',
			publishedDate: new Date(new Date().setDate(new Date().getDate() + 3)),
			content: '<h1>Flash Sale</h1><p>24-hour super sale...</p>',
			featuredProducts: ['PROD005', 'PROD006'],
			views: 0,
			conversions: 0,
			conversionRate: 0
		},
		{
			id: 'LAND003',
			name: 'Winter Fashion',
			slug: 'winter-fashion',
			status: 'draft',
			publishedDate: null,
			content: '<h1>Winter Fashion</h1><p>Stay warm and stylish...</p>',
			featuredProducts: ['PROD012', 'PROD013', 'PROD014'],
			views: 0,
			conversions: 0,
			conversionRate: 0
		}
	],

	// Blog Posts Data
	blogPosts: [
		{
			id: 'BLOG001',
			title: '10 Ways to Style Your Sneakers',
			category: 'guides',
			content: 'Sneakers are versatile and can be styled in multiple ways...',
			featuredImage: 'https://via.placeholder.com/800x450/232f3e/ffffff?text=Sneaker+Styling',
			metaTitle: '10 Ways to Style Sneakers | Fashion Guide',
			metaDescription: 'Learn how to style sneakers for any occasion. Complete guide with styling tips and trending looks.',
			keywords: 'sneaker styling, fashion guide, casual wear',
			status: 'published',
			createdDate: new Date(new Date().setDate(new Date().getDate() - 5)),
			publishedDate: new Date(new Date().setDate(new Date().getDate() - 5)),
			views: 3245,
			bounceRate: 32,
			avgTimeOnPage: 4.2,
			seoScore: 92
		},
		{
			id: 'BLOG002',
			title: 'Top 5 Electronics Trends 2025',
			category: 'news',
			content: 'The tech world is evolving rapidly. Here are the top 5 trends...',
			featuredImage: 'https://via.placeholder.com/800x450/232f3e/ffffff?text=Tech+Trends',
			metaTitle: 'Top 5 Electronics Trends 2025 | Tech News',
			metaDescription: 'Discover the hottest technology trends of 2025. From AI to IoT, see whats coming.',
			keywords: 'tech trends, electronics, 2025',
			status: 'published',
			createdDate: new Date(new Date().setDate(new Date().getDate() - 10)),
			publishedDate: new Date(new Date().setDate(new Date().getDate() - 10)),
			views: 2150,
			bounceRate: 28,
			avgTimeOnPage: 5.1,
			seoScore: 88
		},
		{
			id: 'BLOG003',
			title: 'How to Care for Your Designer Bags',
			category: 'tips',
			content: 'Designer bags are an investment...',
			featuredImage: 'https://via.placeholder.com/800x450/232f3e/ffffff?text=Bag+Care',
			metaTitle: 'Designer Bag Care Guide | Maintenance Tips',
			metaDescription: 'Keep your designer bags looking new. Expert tips on cleaning, storage, and maintenance.',
			keywords: 'designer bags, maintenance, luxury care',
			status: 'draft',
			createdDate: new Date(new Date().setDate(new Date().getDate() - 2)),
			publishedDate: null,
			views: 0,
			bounceRate: 0,
			avgTimeOnPage: 0,
			seoScore: 0
		}
	],

	// FAQ Data
	faqs: [
		{
			id: 'FAQ001',
			question: 'What is your return policy?',
			answer: 'We offer 30-day returns on all items. Items must be in original condition with all packaging.',
			category: 'returns',
			featured: true,
			visible: true,
			order: 1,
			helpfulCount: 324
		},
		{
			id: 'FAQ002',
			question: 'How long does shipping take?',
			answer: 'Standard shipping takes 5-7 business days. Express shipping available for 2-3 day delivery.',
			category: 'shipping',
			featured: true,
			visible: true,
			order: 2,
			helpfulCount: 512
		},
		{
			id: 'FAQ003',
			question: 'What payment methods do you accept?',
			answer: 'We accept credit cards, debit cards, digital wallets, and bank transfers.',
			category: 'payments',
			featured: false,
			visible: true,
			order: 3,
			helpfulCount: 245
		},
		{
			id: 'FAQ004',
			question: 'Can I track my order?',
			answer: 'Yes, you can track your order using the tracking number provided in your shipping confirmation email.',
			category: 'orders',
			featured: true,
			visible: true,
			order: 4,
			helpfulCount: 678
		},
		{
			id: 'FAQ005',
			question: 'Do you offer international shipping?',
			answer: 'Yes, we ship to over 50 countries. Shipping costs and times vary by location.',
			category: 'shipping',
			featured: false,
			visible: true,
			order: 5,
			helpfulCount: 189
		}
	],

	// Legal Pages Data
	legalPages: {
		terms: {
			id: 'LEGAL001',
			name: 'Terms & Conditions',
			slug: 'terms',
			currentVersion: 3.2,
			published: true,
			content: 'Terms & Conditions content...',
			versions: [
				{
					version: 3.2,
					date: new Date(new Date().setDate(new Date().getDate() - 2)),
					adminId: 'ADMIN001',
					adminName: 'Admin User',
					notes: 'Updated refund policy section',
					notifyUsers: true,
					acceptanceLog: []
				},
				{
					version: 3.1,
					date: new Date(new Date().setDate(new Date().getDate() - 30)),
					adminId: 'ADMIN001',
					adminName: 'Admin User',
					notes: 'Added new warranty terms',
					notifyUsers: true,
					acceptanceLog: []
				}
			]
		},
		privacy: {
			id: 'LEGAL002',
			name: 'Privacy Policy',
			slug: 'privacy',
			currentVersion: 2.8,
			published: true,
			content: 'Privacy Policy content...',
			versions: [
				{
					version: 2.8,
					date: new Date(new Date().setDate(new Date().getDate() - 7)),
					adminId: 'ADMIN001',
					adminName: 'Admin User',
					notes: 'Updated data retention policy',
					notifyUsers: false,
					acceptanceLog: []
				}
			]
		},
		about: {
			id: 'LEGAL003',
			name: 'About Us',
			slug: 'about',
			currentVersion: 1.0,
			published: true,
			content: 'About Us content...',
			versions: [
				{
					version: 1.0,
					date: new Date(new Date().setDate(new Date().getDate() - 60)),
					adminId: 'ADMIN001',
					adminName: 'Admin User',
					notes: 'Initial version',
					notifyUsers: false,
					acceptanceLog: []
				}
			]
		}
	},

	// Media Library Data
	mediaFiles: [
		{
			id: 'MEDIA001',
			name: 'summer-banner.jpg',
			type: 'image',
			size: '2.4 MB',
			uploadDate: new Date(new Date().setDate(new Date().getDate() - 8)),
			uploadedBy: 'ADMIN001',
			url: 'https://via.placeholder.com/1200x400/232f3e/ffffff?text=Summer+Banner',
			tags: ['banner', 'summer'],
			usedIn: ['BAN001', 'LAND001'],
			downloads: 0
		},
		{
			id: 'MEDIA002',
			name: 'product-showcase.mp4',
			type: 'video',
			size: '45.7 MB',
			uploadDate: new Date(new Date().setDate(new Date().getDate() - 15)),
			uploadedBy: 'ADMIN001',
			url: 'video-placeholder',
			tags: ['video', 'product', 'showcase'],
			usedIn: ['LAND002'],
			downloads: 2
		},
		{
			id: 'MEDIA003',
			name: 'brand-logo.png',
			type: 'image',
			size: '0.8 MB',
			uploadDate: new Date(new Date().setDate(new Date().getDate() - 45)),
			uploadedBy: 'ADMIN001',
			url: 'https://via.placeholder.com/200x200/232f3e/ffffff?text=Logo',
			tags: ['logo', 'brand'],
			usedIn: ['Multiple pages'],
			downloads: 15
		}
	],

	// Announcements Data
	announcements: [
		{
			id: 'ANN001',
			message: 'Free Shipping This Weekend Only!',
			type: 'banner',
			color: 'success',
			startDate: new Date(new Date().setDate(new Date().getDate() - 1)),
			endDate: new Date(new Date().setDate(new Date().getDate() + 1)),
			status: 'active',
			createdDate: new Date(new Date().setDate(new Date().getDate() - 2)),
			createdBy: 'ADMIN001'
		},
		{
			id: 'ANN002',
			message: 'We are upgrading our system. Expect some downtime on Sunday midnight.',
			type: 'alert',
			color: 'warning',
			startDate: new Date(new Date().setDate(new Date().getDate() + 3)),
			endDate: new Date(new Date().setDate(new Date().getDate() + 4)),
			status: 'scheduled',
			createdDate: new Date(new Date().setDate(new Date().getDate() - 5)),
			createdBy: 'ADMIN001'
		}
	],

	// Audit Log Data
	auditLog: [
		{
			id: 'AUDIT001',
			timestamp: new Date(new Date().setHours(new Date().getHours() - 2)),
			adminId: 'ADMIN001',
			adminName: 'Admin User',
			action: 'banner-updated',
			target: 'BAN001',
			targetName: 'Black Friday Sale',
			changes: 'Updated headline and CTA text',
			ipAddress: '192.168.1.100'
		},
		{
			id: 'AUDIT002',
			timestamp: new Date(new Date().setHours(new Date().getHours() - 5)),
			adminId: 'ADMIN001',
			adminName: 'Admin User',
			action: 'blog-published',
			target: 'BLOG001',
			targetName: '10 Ways to Style Your Sneakers',
			changes: 'Published blog post',
			ipAddress: '192.168.1.100'
		},
		{
			id: 'AUDIT003',
			timestamp: new Date(new Date().setDate(new Date().getDate() - 1)),
			adminId: 'ADMIN001',
			adminName: 'Admin User',
			action: 'legal-updated',
			target: 'LEGAL001',
			targetName: 'Terms & Conditions',
			changes: 'Version 3.2 published, users notified',
			ipAddress: '192.168.1.100'
		}
	]
};

// ============ UTILITY FUNCTIONS ============

function formatDate(date) {
	return new Date(date).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

function formatDateTime(date) {
	return new Date(date).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

function openModal(modalId) {
	document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
	document.getElementById(modalId).classList.remove('active');
}

function showToast(message, type = 'info') {
	const toast = document.getElementById('toast');
	toast.textContent = message;
	toast.style.background = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#111827';
	toast.classList.add('show');
	setTimeout(() => toast.classList.remove('show'), 3000);
}

function calculateBannerStatus(banner) {
	const now = new Date();
	if (!banner.enabled) return 'inactive';
	if (now < new Date(banner.startDate)) return 'scheduled';
	if (now > new Date(banner.endDate)) return 'expired';
	return 'active';
}

function calculateSEOScore(metaTitle, metaDesc, keywords) {
	let score = 0;
	if (metaTitle && metaTitle.length > 30 && metaTitle.length < 60) score += 30;
	if (metaDesc && metaDesc.length > 120 && metaDesc.length < 160) score += 30;
	if (keywords && keywords.split(',').length >= 3) score += 20;
	if (metaTitle && keywords && metaTitle.toLowerCase().includes(keywords.split(',')[0].trim().toLowerCase())) score += 20;
	return Math.min(100, score);
}

function logAuditEntry(action, target, targetName, changes) {
	const entry = {
		id: `AUDIT${Date.now()}`,
		timestamp: new Date(),
		adminId: cmsDatabase.currentAdmin.id,
		adminName: cmsDatabase.currentAdmin.name,
		action: action,
		target: target,
		targetName: targetName,
		changes: changes,
		ipAddress: '192.168.1.100'
	};
	cmsDatabase.auditLog.unshift(entry);
	showToast('Changes logged to audit trail', 'success');
}

// ============ BANNER MANAGEMENT ============

function renderBanners() {
	const grid = document.getElementById('banners-grid');
	const searchTerm = document.getElementById('search-banners').value.toLowerCase();
	const statusFilter = document.getElementById('filter-banner-status').value;
	const locationFilter = document.getElementById('filter-banner-location').value;

	let filtered = cmsDatabase.banners.filter(banner => {
		const passSearch = banner.title.toLowerCase().includes(searchTerm);
		const passStatus = !statusFilter || calculateBannerStatus(banner) === statusFilter;
		const passLocation = !locationFilter || banner.location === locationFilter;
		return passSearch && passStatus && passLocation;
	});

	grid.innerHTML = filtered.map(banner => {
		const status = calculateBannerStatus(banner);
		const statusBadge = status === 'active' ? 'badge-active' : status === 'scheduled' ? 'badge-scheduled' : status === 'expired' ? 'badge-expired' : 'badge-inactive';
		const statusText = status.charAt(0).toUpperCase() + status.slice(1);

		return `
			<div class="card">
				<div class="card-header">
					<div>
						<div class="card-title">${banner.title}</div>
						<div class="card-meta">${banner.location.replace(/-/g, ' ').toUpperCase()}</div>
					</div>
					<span class="badge ${statusBadge}">${statusText}</span>
				</div>
				<div class="card-thumb">
					<img src="${banner.image}" alt="${banner.title}">
				</div>
				<div style="font-size: 12px; color: var(--muted); margin-bottom: 8px;">
					<strong>CTA:</strong> ${banner.ctaText} <br>
					<strong>Scheduled:</strong> ${formatDate(banner.startDate)} - ${formatDate(banner.endDate)}<br>
					<strong>Engagement:</strong> ${banner.views} views, ${banner.clicks} clicks
				</div>
				<div class="card-actions">
					<button class="btn secondary sm" onclick="editBanner('${banner.id}')">Edit</button>
					<button class="btn danger sm" onclick="deleteBanner('${banner.id}')">Delete</button>
				</div>
			</div>
		`;
	}).join('');

	if (filtered.length === 0) {
		grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: var(--muted);">No banners found</div>';
	}
}

function editBanner(bannerId) {
	const banner = cmsDatabase.banners.find(b => b.id === bannerId);
	if (banner) {
		document.getElementById('banner-modal-title').textContent = 'Edit Banner: ' + banner.title;
		document.getElementById('banner-title').value = banner.title;
		document.getElementById('banner-location').value = banner.location;
		document.getElementById('banner-headline').value = banner.headline;
		document.getElementById('banner-subtext').value = banner.subtext;
		document.getElementById('banner-cta-text').value = banner.ctaText;
		document.getElementById('banner-cta-link').value = banner.ctaLink;
		document.getElementById('banner-start').value = new Date(banner.startDate).toISOString().slice(0, 16);
		document.getElementById('banner-end').value = new Date(banner.endDate).toISOString().slice(0, 16);
		document.getElementById('btn-save-banner').onclick = () => saveBanner(bannerId);
		openModal('banner-modal');
	}
}

function saveBanner(bannerId = null) {
	const title = document.getElementById('banner-title').value;
	const location = document.getElementById('banner-location').value;
	const headline = document.getElementById('banner-headline').value;
	const subtext = document.getElementById('banner-subtext').value;
	const ctaText = document.getElementById('banner-cta-text').value;
	const ctaLink = document.getElementById('banner-cta-link').value;
	const startDate = new Date(document.getElementById('banner-start').value);
	const endDate = new Date(document.getElementById('banner-end').value);

	if (!title || !location || !headline || !ctaText) {
		showToast('Please fill all required fields', 'error');
		return;
	}

	if (bannerId) {
		const banner = cmsDatabase.banners.find(b => b.id === bannerId);
		if (banner) {
			banner.title = title;
			banner.location = location;
			banner.headline = headline;
			banner.subtext = subtext;
			banner.ctaText = ctaText;
			banner.ctaLink = ctaLink;
			banner.startDate = startDate;
			banner.endDate = endDate;
			logAuditEntry('banner-updated', bannerId, title, 'Updated banner content and scheduling');
		}
	} else {
		cmsDatabase.banners.push({
			id: `BAN${Date.now()}`,
			title,
			location,
			headline,
			subtext,
			ctaText,
			ctaLink,
			image: 'https://via.placeholder.com/1200x400/232f3e/ffffff?text=' + encodeURIComponent(title),
			startDate,
			endDate,
			enabled: true,
			status: startDate > new Date() ? 'scheduled' : 'active',
			views: 0,
			clicks: 0
		});
		logAuditEntry('banner-created', 'New', title, 'Created new banner');
	}

	closeModal('banner-modal');
	renderBanners();
	showToast('Banner saved successfully', 'success');
}

function deleteBanner(bannerId) {
	if (confirm('Delete this banner? This cannot be undone.')) {
		const index = cmsDatabase.banners.findIndex(b => b.id === bannerId);
		if (index > -1) {
			const banner = cmsDatabase.banners[index];
			cmsDatabase.banners.splice(index, 1);
			logAuditEntry('banner-deleted', bannerId, banner.title, 'Deleted banner');
			renderBanners();
			showToast('Banner deleted', 'success');
		}
	}
}

// ============ LANDING PAGE MANAGEMENT ============

function renderLandingPages() {
	const tbody = document.getElementById('landing-tbody');
	const searchTerm = document.getElementById('search-landing').value.toLowerCase();
	const statusFilter = document.getElementById('filter-landing-status').value;

	let filtered = cmsDatabase.landingPages.filter(page => {
		const passSearch = page.name.toLowerCase().includes(searchTerm) || page.slug.toLowerCase().includes(searchTerm);
		const passStatus = !statusFilter || page.status === statusFilter;
		return passSearch && passStatus;
	});

	tbody.innerHTML = filtered.map(page => {
		const statusBadge = page.status === 'published' ? 'badge-published' : page.status === 'draft' ? 'badge-draft' : 'badge-scheduled';
		const statusText = page.status.charAt(0).toUpperCase() + page.status.slice(1);

		return `
			<tr>
				<td><strong>${page.name}</strong></td>
				<td><code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${page.slug}</code></td>
				<td><span class="badge ${statusBadge}">${statusText}</span></td>
				<td>${page.views.toLocaleString()}</td>
				<td>${formatDate(page.createdDate)}</td>
				<td>${page.publishedDate ? formatDate(page.publishedDate) : (page.status === 'scheduled' ? 'Pending' : '-')}</td>
				<td>
					<button class="action-btn" onclick="editLandingPage('${page.id}')">Edit</button>
					<button class="action-btn" onclick="previewLandingPage('${page.id}')">Preview</button>
					<button class="action-btn" onclick="deleteLandingPage('${page.id}')" style="color: #dc3545;">Delete</button>
				</td>
			</tr>
		`;
	}).join('');

	if (filtered.length === 0) {
		tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 40px;">No landing pages found</td></tr>';
	}
}

function editLandingPage(pageId) {
	const page = cmsDatabase.landingPages.find(p => p.id === pageId);
	if (page) {
		document.getElementById('landing-name').value = page.name;
		document.getElementById('landing-slug').value = page.slug;
		document.getElementById('landing-status').value = page.status;
		document.getElementById('landing-content').value = page.content;
		document.getElementById('landing-products').value = page.featuredProducts.join(', ');
		document.getElementById('btn-save-landing').onclick = () => saveLandingPage(pageId);
		openModal('landing-modal');
	}
}

function saveLandingPage(pageId = null) {
	const name = document.getElementById('landing-name').value;
	const slug = document.getElementById('landing-slug').value;
	const status = document.getElementById('landing-status').value;
	const content = document.getElementById('landing-content').value;
	const products = document.getElementById('landing-products').value.split(',').map(p => p.trim()).filter(p => p);

	if (!name || !slug || !status) {
		showToast('Please fill all required fields', 'error');
		return;
	}

	if (pageId) {
		const page = cmsDatabase.landingPages.find(p => p.id === pageId);
		if (page) {
			page.name = name;
			page.slug = slug;
			page.status = status;
			page.content = content;
			page.featuredProducts = products;
			if (status === 'published' && !page.publishedDate) page.publishedDate = new Date();
			logAuditEntry('landing-page-updated', pageId, name, 'Updated landing page');
		}
	} else {
		cmsDatabase.landingPages.push({
			id: `LAND${Date.now()}`,
			name,
			slug,
			status,
			publishedDate: status === 'published' ? new Date() : null,
			content,
			featuredProducts: products,
			views: 0,
			conversions: 0,
			conversionRate: 0
		});
		logAuditEntry('landing-page-created', 'New', name, 'Created new landing page');
	}

	closeModal('landing-modal');
	renderLandingPages();
	showToast('Landing page saved successfully', 'success');
}

function previewLandingPage(pageId) {
	const page = cmsDatabase.landingPages.find(p => p.id === pageId);
	if (page) {
		showToast('Preview: ' + page.name + ' (mystore.com/' + page.slug + ')', 'info');
	}
}

function deleteLandingPage(pageId) {
	if (confirm('Delete this landing page?')) {
		const index = cmsDatabase.landingPages.findIndex(p => p.id === pageId);
		if (index > -1) {
			const page = cmsDatabase.landingPages[index];
			cmsDatabase.landingPages.splice(index, 1);
			logAuditEntry('landing-page-deleted', pageId, page.name, 'Deleted landing page');
			renderLandingPages();
			showToast('Landing page deleted', 'success');
		}
	}
}

// ============ BLOG MANAGEMENT ============

function renderBlogPosts() {
	const tbody = document.getElementById('blog-tbody');
	const searchTerm = document.getElementById('search-blog').value.toLowerCase();
	const statusFilter = document.getElementById('filter-blog-status').value;
	const categoryFilter = document.getElementById('filter-blog-category').value;

	let filtered = cmsDatabase.blogPosts.filter(post => {
		const passSearch = post.title.toLowerCase().includes(searchTerm);
		const passStatus = !statusFilter || post.status === statusFilter;
		const passCategory = !categoryFilter || post.category === categoryFilter;
		return passSearch && passStatus && passCategory;
	});

	tbody.innerHTML = filtered.map(post => {
		const statusBadge = post.status === 'published' ? 'badge-published' : post.status === 'draft' ? 'badge-draft' : 'badge-scheduled';
		const statusText = post.status.charAt(0).toUpperCase() + post.status.slice(1);

		return `
			<tr>
				<td><strong>${post.title}</strong></td>
				<td>${post.category.charAt(0).toUpperCase() + post.category.slice(1)}</td>
				<td><span class="badge ${statusBadge}">${statusText}</span></td>
				<td><strong>${post.seoScore}</strong>/100</td>
				<td>${post.views.toLocaleString()}</td>
				<td>${formatDate(post.createdDate)}</td>
				<td>
					<button class="action-btn" onclick="editBlogPost('${post.id}')">Edit</button>
					<button class="action-btn" onclick="viewBlogSEO('${post.id}')">SEO</button>
					<button class="action-btn" onclick="deleteBlogPost('${post.id}')" style="color: #dc3545;">Delete</button>
				</td>
			</tr>
		`;
	}).join('');

	if (filtered.length === 0) {
		tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 40px;">No blog posts found</td></tr>';
	}
}

function editBlogPost(postId) {
	const post = cmsDatabase.blogPosts.find(p => p.id === postId);
	if (post) {
		document.getElementById('blog-title').value = post.title;
		document.getElementById('blog-category').value = post.category;
		document.getElementById('blog-status').value = post.status;
		document.getElementById('blog-content').value = post.content;
		document.getElementById('blog-meta-title').value = post.metaTitle;
		document.getElementById('blog-meta-desc').value = post.metaDescription;
		document.getElementById('blog-keywords').value = post.keywords;
		document.getElementById('btn-save-blog').onclick = () => saveBlogPost(postId);
		updateSEOPreview();
		openModal('blog-modal');
	}
}

function saveBlogPost(postId = null) {
	const title = document.getElementById('blog-title').value;
	const category = document.getElementById('blog-category').value;
	const status = document.getElementById('blog-status').value;
	const content = document.getElementById('blog-content').value;
	const metaTitle = document.getElementById('blog-meta-title').value;
	const metaDesc = document.getElementById('blog-meta-desc').value;
	const keywords = document.getElementById('blog-keywords').value;

	if (!title || !category || !status) {
		showToast('Please fill all required fields', 'error');
		return;
	}

	const seoScore = calculateSEOScore(metaTitle, metaDesc, keywords);

	if (postId) {
		const post = cmsDatabase.blogPosts.find(p => p.id === postId);
		if (post) {
			post.title = title;
			post.category = category;
			post.status = status;
			post.content = content;
			post.metaTitle = metaTitle;
			post.metaDescription = metaDesc;
			post.keywords = keywords;
			post.seoScore = seoScore;
			if (status === 'published' && !post.publishedDate) post.publishedDate = new Date();
			logAuditEntry('blog-updated', postId, title, 'Updated blog post and SEO settings');
		}
	} else {
		cmsDatabase.blogPosts.push({
			id: `BLOG${Date.now()}`,
			title,
			category,
			content,
			metaTitle,
			metaDescription: metaDesc,
			keywords,
			status,
			createdDate: new Date(),
			publishedDate: status === 'published' ? new Date() : null,
			views: 0,
			bounceRate: 0,
			avgTimeOnPage: 0,
			seoScore
		});
		logAuditEntry('blog-created', 'New', title, 'Created new blog post');
	}

	closeModal('blog-modal');
	renderBlogPosts();
	showToast('Blog post saved successfully', 'success');
}

function deleteBlogPost(postId) {
	if (confirm('Delete this blog post?')) {
		const index = cmsDatabase.blogPosts.findIndex(p => p.id === postId);
		if (index > -1) {
			const post = cmsDatabase.blogPosts[index];
			cmsDatabase.blogPosts.splice(index, 1);
			logAuditEntry('blog-deleted', postId, post.title, 'Deleted blog post');
			renderBlogPosts();
			showToast('Blog post deleted', 'success');
		}
	}
}

function viewBlogSEO(postId) {
	const post = cmsDatabase.blogPosts.find(p => p.id === postId);
	if (post) {
		showToast(`SEO Score: ${post.seoScore}/100 | Meta Title: ${post.metaTitle.length} chars | Meta Desc: ${post.metaDescription.length} chars`, 'info');
	}
}

function updateSEOPreview() {
	const metaTitle = document.getElementById('blog-meta-title').value || 'Post Title';
	const metaDesc = document.getElementById('blog-meta-desc').value || 'Meta description shows up here...';
	const metaTitleCount = document.getElementById('blog-meta-title').value.length;
	const metaDescCount = document.getElementById('blog-meta-desc').value.length;

	document.getElementById('meta-title-count').textContent = metaTitleCount;
	document.getElementById('meta-desc-count').textContent = metaDescCount;
	document.getElementById('preview-meta-title').textContent = metaTitle;
	document.getElementById('preview-meta-desc').textContent = metaDesc;

	// Color coding
	document.getElementById('blog-meta-title').style.borderColor = metaTitleCount < 30 || metaTitleCount > 60 ? '#dc3545' : '#28a745';
	document.getElementById('blog-meta-desc').style.borderColor = metaDescCount < 120 || metaDescCount > 160 ? '#dc3545' : '#28a745';
}

// ============ FAQ MANAGEMENT ============

function renderFAQs() {
	const container = document.getElementById('faq-list');
	const categoryFilter = document.getElementById('filter-faq-category').value;

	let filtered = cmsDatabase.faqs.filter(faq => {
		const passCategory = !categoryFilter || faq.category === categoryFilter;
		return passCategory;
	});

	filtered.sort((a, b) => a.order - b.order);

	container.innerHTML = filtered.map(faq => {
		return `
			<div class="draggable-item" data-faq-id="${faq.id}">
				<span class="drag-handle material-symbols-rounded">drag_handle</span>
				<div style="flex: 1;">
					<div style="font-weight: 600; font-size: 13px;">${faq.question}</div>
					<div style="font-size: 12px; color: var(--muted); margin-top: 4px;">${faq.answer.substring(0, 60)}...</div>
					<div style="font-size: 11px; color: var(--muted); margin-top: 6px;">
						${faq.featured ? '<span style="background: #ffc107; color: #000; padding: 2px 6px; border-radius: 3px; margin-right: 6px;">Featured</span>' : ''}
						${faq.category} • ${faq.helpfulCount} found helpful
					</div>
				</div>
				<div style="display: flex; gap: 6px;">
					<button class="action-btn" onclick="editFAQ('${faq.id}')">Edit</button>
					<button class="action-btn" onclick="deleteFAQ('${faq.id}')" style="color: #dc3545;">Delete</button>
				</div>
			</div>
		`;
	}).join('');

	if (filtered.length === 0) {
		container.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 40px;">No FAQs in this category</div>';
	}
}

function editFAQ(faqId) {
	const faq = cmsDatabase.faqs.find(f => f.id === faqId);
	if (faq) {
		document.getElementById('faq-question').value = faq.question;
		document.getElementById('faq-answer').value = faq.answer;
		document.getElementById('faq-category').value = faq.category;
		document.getElementById('faq-featured').checked = faq.featured;
		document.getElementById('faq-visible').checked = faq.visible;
		document.getElementById('btn-save-faq').onclick = () => saveFAQ(faqId);
		openModal('faq-modal');
	}
}

function saveFAQ(faqId = null) {
	const question = document.getElementById('faq-question').value;
	const answer = document.getElementById('faq-answer').value;
	const category = document.getElementById('faq-category').value;
	const featured = document.getElementById('faq-featured').checked;
	const visible = document.getElementById('faq-visible').checked;

	if (!question || !answer || !category) {
		showToast('Please fill all required fields', 'error');
		return;
	}

	if (faqId) {
		const faq = cmsDatabase.faqs.find(f => f.id === faqId);
		if (faq) {
			faq.question = question;
			faq.answer = answer;
			faq.category = category;
			faq.featured = featured;
			faq.visible = visible;
			logAuditEntry('faq-updated', faqId, question, 'Updated FAQ');
		}
	} else {
		const newOrder = Math.max(...cmsDatabase.faqs.map(f => f.order), 0) + 1;
		cmsDatabase.faqs.push({
			id: `FAQ${Date.now()}`,
			question,
			answer,
			category,
			featured,
			visible,
			order: newOrder,
			helpfulCount: 0
		});
		logAuditEntry('faq-created', 'New', question, 'Created new FAQ');
	}

	closeModal('faq-modal');
	renderFAQs();
	showToast('FAQ saved successfully', 'success');
}

function deleteFAQ(faqId) {
	if (confirm('Delete this FAQ?')) {
		const index = cmsDatabase.faqs.findIndex(f => f.id === faqId);
		if (index > -1) {
			const faq = cmsDatabase.faqs[index];
			cmsDatabase.faqs.splice(index, 1);
			logAuditEntry('faq-deleted', faqId, faq.question, 'Deleted FAQ');
			renderFAQs();
			showToast('FAQ deleted', 'success');
		}
	}
}

// ============ LEGAL PAGE MANAGEMENT ============

function editLegalPage(pageType) {
	const legalPage = cmsDatabase.legalPages[pageType];
	if (legalPage) {
		document.getElementById('legal-page-title').textContent = legalPage.name;
		document.getElementById('legal-content').value = legalPage.content;
		document.getElementById('btn-save-legal').onclick = () => saveLegalPage(pageType);
		openModal('legal-modal');
	}
}

function saveLegalPage(pageType) {
	const content = document.getElementById('legal-content').value;
	const changeNotes = document.getElementById('legal-change-notes').value;
	const notifyUsers = document.getElementById('legal-notify-users').checked;

	if (!content) {
		showToast('Please enter page content', 'error');
		return;
	}

	const legalPage = cmsDatabase.legalPages[pageType];
	if (legalPage) {
		legalPage.content = content;
		
		// Create new version
		const newVersion = legalPage.currentVersion + 0.1;
		legalPage.versions.unshift({
			version: parseFloat(newVersion.toFixed(1)),
			date: new Date(),
			adminId: cmsDatabase.currentAdmin.id,
			adminName: cmsDatabase.currentAdmin.name,
			notes: changeNotes || 'Updated content',
			notifyUsers: notifyUsers,
			acceptanceLog: []
		});
		legalPage.currentVersion = parseFloat(newVersion.toFixed(1));
		
		logAuditEntry('legal-updated', legalPage.id, legalPage.name, `Version ${legalPage.currentVersion} published${notifyUsers ? ', users notified' : ''}`);
		showToast('Legal page updated and version saved', 'success');
		closeModal('legal-modal');
	}
}

function viewVersionHistory(pageType) {
	const legalPage = cmsDatabase.legalPages[pageType];
	if (legalPage) {
		let versionList = 'Version History for ' + legalPage.name + ':\n\n';
		legalPage.versions.forEach((v, idx) => {
			versionList += `v${v.version} (${formatDateTime(v.date)}) - ${v.notes}\n`;
		});
		alert(versionList);
	}
}

// ============ MEDIA LIBRARY MANAGEMENT ============

function renderMediaLibrary() {
	const grid = document.getElementById('media-grid');
	const searchTerm = document.getElementById('search-media').value.toLowerCase();
	const typeFilter = document.getElementById('filter-media-type').value;

	let filtered = cmsDatabase.mediaFiles.filter(file => {
		const passSearch = file.name.toLowerCase().includes(searchTerm) || file.tags.some(t => t.includes(searchTerm));
		const passType = !typeFilter || file.type === typeFilter;
		return passSearch && passType;
	});

	grid.innerHTML = filtered.map(file => {
		const isImage = file.type === 'image';
		const isVideo = file.type === 'video';

		return `
			<div class="card">
				<div class="card-header">
					<div>
						<div class="card-title">${file.name}</div>
						<div class="card-meta">${file.size} • ${formatDate(file.uploadDate)}</div>
					</div>
				</div>
				<div class="card-thumb">
					${isImage ? `<img src="${file.url}" alt="${file.name}">` : isVideo ? `<span class="material-symbols-rounded" style="font-size: 48px; color: var(--primary);">play_circle</span>` : '<span class="material-symbols-rounded" style="font-size: 48px; color: var(--muted);">description</span>'}
				</div>
				<div style="font-size: 12px; color: var(--muted); margin-bottom: 8px;">
					<strong>Used in:</strong> ${file.usedIn.join(', ')}<br>
					<strong>Tags:</strong> ${file.tags.join(', ')}<br>
					<strong>Downloads:</strong> ${file.downloads}
				</div>
				<div class="card-actions">
					<button class="btn secondary sm" onclick="downloadMedia('${file.id}')">Download</button>
					<button class="btn danger sm" onclick="deleteMedia('${file.id}')">Delete</button>
				</div>
			</div>
		`;
	}).join('');

	if (filtered.length === 0) {
		grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: var(--muted);">No media files found</div>';
	}
}

function downloadMedia(mediaId) {
	const file = cmsDatabase.mediaFiles.find(f => f.id === mediaId);
	if (file) {
		file.downloads++;
		logAuditEntry('media-downloaded', mediaId, file.name, 'Downloaded media file');
		showToast('Media file downloaded', 'success');
	}
}

function deleteMedia(mediaId) {
	if (confirm('Delete this media file? It will be removed from all locations where it\'s used.')) {
		const index = cmsDatabase.mediaFiles.findIndex(f => f.id === mediaId);
		if (index > -1) {
			const file = cmsDatabase.mediaFiles[index];
			cmsDatabase.mediaFiles.splice(index, 1);
			logAuditEntry('media-deleted', mediaId, file.name, 'Deleted media file');
			renderMediaLibrary();
			showToast('Media file deleted', 'success');
		}
	}
}

// ============ ANNOUNCEMENT MANAGEMENT ============

function createAnnouncement() {
	const message = document.getElementById('announcement-text').value;
	const type = document.getElementById('announcement-type').value;
	const color = document.getElementById('announcement-color').value;
	const startDate = new Date(document.getElementById('announcement-start').value);
	const endDate = new Date(document.getElementById('announcement-end').value);

	if (!message || !type) {
		showToast('Please fill all required fields', 'error');
		return;
	}

	cmsDatabase.announcements.push({
		id: `ANN${Date.now()}`,
		message,
		type,
		color,
		startDate,
		endDate,
		status: startDate > new Date() ? 'scheduled' : 'active',
		createdDate: new Date(),
		createdBy: cmsDatabase.currentAdmin.id
	});

	closeModal('announcement-modal');
	showToast(`Announcement "${message.substring(0, 30)}..." created successfully!`, 'success');
	logAuditEntry('announcement-created', 'New', message.substring(0, 30), 'Created new announcement');
	
	// Reset form
	document.getElementById('announcement-text').value = '';
	document.getElementById('announcement-type').value = 'banner';
	document.getElementById('announcement-color').value = 'info';
}

// ============ AUDIT LOG MANAGEMENT ============

function renderAuditLog() {
	const timeline = document.getElementById('audit-timeline');
	const searchTerm = document.getElementById('search-audit').value.toLowerCase();
	const typeFilter = document.getElementById('filter-audit-type').value;

	let filtered = cmsDatabase.auditLog.filter(entry => {
		const passSearch = entry.targetName.toLowerCase().includes(searchTerm) || entry.changes.toLowerCase().includes(searchTerm);
		const passType = !typeFilter || entry.action === typeFilter;
		return passSearch && passType;
	});

	timeline.innerHTML = filtered.map(entry => {
		return `
			<div class="timeline-item">
				<div class="dot"></div>
				<div class="timeline-content">
					<strong style="text-transform: capitalize;">${entry.action.replace(/-/g, ' ')}</strong><br>
					<div class="time">${formatDateTime(entry.timestamp)}</div>
					<div style="margin-top: 6px; font-size: 11px;">
						<strong>Target:</strong> ${entry.targetName}<br>
						<strong>Admin:</strong> ${entry.adminName}<br>
						<strong>Change:</strong> ${entry.changes}
					</div>
				</div>
			</div>
		`;
	}).join('');

	if (filtered.length === 0) {
		timeline.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 20px;">No audit logs found</div>';
	}
}

function exportAuditLog() {
	let csv = 'Timestamp,Admin,Action,Target,Changes\n';
	cmsDatabase.auditLog.forEach(entry => {
		csv += `"${formatDateTime(entry.timestamp)}","${entry.adminName}","${entry.action}","${entry.targetName}","${entry.changes}"\n`;
	});

	const blob = new Blob([csv], { type: 'text/csv' });
	const url = window.URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'audit-log-' + new Date().getTime() + '.csv';
	a.click();
	
	showToast('Audit log exported as CSV', 'success');
}

// ============ EVENT LISTENERS & INITIALIZATION ============

function initializeCMS() {
	// Tab Navigation
	document.querySelectorAll('.tab').forEach(tab => {
		tab.addEventListener('click', () => {
			document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
			document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
			
			tab.classList.add('active');
			const tabId = tab.getAttribute('data-tab');
			document.getElementById(tabId).classList.add('active');
		});
	});

	// Buttons
	document.getElementById('btn-create-banner').addEventListener('click', () => {
		document.getElementById('banner-modal-title').textContent = 'Create New Banner';
		document.getElementById('banner-title').value = '';
		document.getElementById('banner-location').value = '';
		document.getElementById('banner-headline').value = '';
		document.getElementById('banner-subtext').value = '';
		document.getElementById('banner-cta-text').value = '';
		document.getElementById('banner-cta-link').value = '';
		document.getElementById('banner-start').value = '';
		document.getElementById('banner-end').value = '';
		document.getElementById('btn-save-banner').onclick = () => saveBanner();
		openModal('banner-modal');
	});

	document.getElementById('btn-create-landing').addEventListener('click', () => {
		document.getElementById('landing-name').value = '';
		document.getElementById('landing-slug').value = '';
		document.getElementById('landing-status').value = 'draft';
		document.getElementById('landing-content').value = '';
		document.getElementById('landing-products').value = '';
		document.getElementById('btn-save-landing').onclick = () => saveLandingPage();
		openModal('landing-modal');
	});

	document.getElementById('btn-create-blog').addEventListener('click', () => {
		document.getElementById('blog-title').value = '';
		document.getElementById('blog-category').value = '';
		document.getElementById('blog-status').value = 'draft';
		document.getElementById('blog-content').value = '';
		document.getElementById('blog-meta-title').value = '';
		document.getElementById('blog-meta-desc').value = '';
		document.getElementById('blog-keywords').value = '';
		document.getElementById('btn-save-blog').onclick = () => saveBlogPost();
		openModal('blog-modal');
	});

	document.getElementById('btn-create-faq').addEventListener('click', () => {
		document.getElementById('faq-question').value = '';
		document.getElementById('faq-answer').value = '';
		document.getElementById('faq-category').value = '';
		document.getElementById('faq-featured').checked = false;
		document.getElementById('faq-visible').checked = true;
		document.getElementById('btn-save-faq').onclick = () => saveFAQ();
		openModal('faq-modal');
	});

	document.getElementById('btn-announcement').addEventListener('click', () => {
		document.getElementById('announcement-text').value = '';
		document.getElementById('announcement-type').value = 'banner';
		document.getElementById('announcement-color').value = 'info';
		document.getElementById('announcement-start').value = '';
		document.getElementById('announcement-end').value = '';
		document.getElementById('btn-create-announcement').onclick = () => createAnnouncement();
		openModal('announcement-modal');
	});

	document.getElementById('btn-audit-log').addEventListener('click', () => {
		renderAuditLog();
		document.getElementById('btn-export-audit').onclick = () => exportAuditLog();
		openModal('audit-modal');
	});

	// Search & Filter Events
	document.getElementById('search-banners').addEventListener('input', renderBanners);
	document.getElementById('filter-banner-status').addEventListener('change', renderBanners);
	document.getElementById('filter-banner-location').addEventListener('change', renderBanners);

	document.getElementById('search-landing').addEventListener('input', renderLandingPages);
	document.getElementById('filter-landing-status').addEventListener('change', renderLandingPages);

	document.getElementById('search-blog').addEventListener('input', renderBlogPosts);
	document.getElementById('filter-blog-status').addEventListener('change', renderBlogPosts);
	document.getElementById('filter-blog-category').addEventListener('change', renderBlogPosts);

	document.getElementById('filter-faq-category').addEventListener('change', renderFAQs);

	document.getElementById('search-media').addEventListener('input', renderMediaLibrary);
	document.getElementById('filter-media-type').addEventListener('change', renderMediaLibrary);

	// SEO Preview Update
	document.getElementById('blog-meta-title').addEventListener('input', updateSEOPreview);
	document.getElementById('blog-meta-desc').addEventListener('input', updateSEOPreview);

	// Close modals on outside click
	document.querySelectorAll('.modal').forEach(modal => {
		modal.addEventListener('click', (e) => {
			if (e.target === modal) closeModal(modal.id);
		});
	});

	// Initial Render
	renderBanners();
	renderLandingPages();
	renderBlogPosts();
	renderFAQs();
	renderMediaLibrary();
}

// Start on Page Load
window.addEventListener('DOMContentLoaded', initializeCMS);
