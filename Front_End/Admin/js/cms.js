// cms.js - CMS Page Data Management
// Fetches CMS content from backend API

const API_BASE_URL = 'http://localhost:5000';

console.log('CMS API base URL set to', API_BASE_URL);

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function getAdminToken() {
  return localStorage.getItem('lumina.admin.authToken') || localStorage.getItem('lumina.auth.token') || '';
}

async function fetchJson(path, options = {}) {
  const token = getAdminToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = apiUrl(path);
  let res = await fetch(url, { ...options, headers });
  let text = await res.text().catch(() => '');

  if (!res.ok) {
    console.warn('API request failed', { url, status: res.status, body: text });

    if (res.status === 404 && path.startsWith('/api/')) {
      const fallbackUrl = `${window.location.origin}${path}`;
      if (fallbackUrl !== url) {
        console.warn('Retrying API request on fallback URL', fallbackUrl);
        res = await fetch(fallbackUrl, { ...options, headers });
        text = await res.text().catch(() => '');
      }
    }
  }

  if (!res.ok) {
    const body = text || res.statusText;
    throw new Error(`Request failed: ${res.status} - ${body}`);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    return {};
  }
}

let cmsData = {
  pages: [],
  sections: [],
  navigation: [],
  assets: [],
  announcements: []
};

let editingBannerId = null;

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = 'auto';
}

function clearBannerModalForm() {
  const fieldIds = [
    'banner-title',
    'banner-location',
    'banner-start',
    'banner-end',
    'banner-headline',
    'banner-subtext',
    'banner-cta-text',
    'banner-cta-link',
    'banner-media'
  ];

  fieldIds.forEach((id) => {
    const field = document.getElementById(id);
    if (!field) return;
    if (field.type === 'file') {
      field.value = '';
    } else {
      field.value = '';
    }
  });

  const preview = document.getElementById('banner-preview');
  if (preview) {
    preview.innerHTML = 'No media selected';
    delete preview.dataset.fileUrl;
  }

  editingBannerId = null;
  const titleEl = document.getElementById('banner-modal-title');
  if (titleEl) titleEl.textContent = 'Create New Banner';
}

function previewBannerMedia() {
  const input = document.getElementById('banner-media');
  const preview = document.getElementById('banner-preview');
  if (!input || !preview || !input.files || !input.files[0]) return;

  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    preview.innerHTML = `<img src="${reader.result}" alt="Banner preview" style="max-width: 100%; height: auto; display: block; border-radius: 8px;" />`;
    preview.dataset.fileUrl = reader.result;
  };
  reader.readAsDataURL(file);
}

async function saveBanner() {
  const title = document.getElementById('banner-title')?.value.trim();
  const location = document.getElementById('banner-location')?.value.trim();
  const headline = document.getElementById('banner-headline')?.value.trim();
  const subtext = document.getElementById('banner-subtext')?.value.trim();
  const ctaText = document.getElementById('banner-cta-text')?.value.trim();
  const ctaLink = document.getElementById('banner-cta-link')?.value.trim();
  const startDate = document.getElementById('banner-start')?.value;
  const endDate = document.getElementById('banner-end')?.value;
  const preview = document.getElementById('banner-preview');
  const fileInput = document.getElementById('banner-media');
  const file = fileInput?.files?.[0];

  if (!title || !location || !headline || !ctaText) {
    alert('Please fill in the required banner fields: title, location, headline, and CTA text.');
    return;
  }

  const fileUrl = preview?.dataset?.fileUrl || `https://via.placeholder.com/1200x400.png?text=${encodeURIComponent(title)}`;
  const mimeType = file?.type || 'image/png';
  const fileSize = file?.size || 0;

  try {
    const assetPayload = {
      title,
      fileUrl,
      mimeType,
      fileSize
    };

    let assetResult;
    if (editingBannerId) {
      console.log('Updating banner asset to', apiUrl(`/api/admin/cms/assets/${editingBannerId}`));
      assetResult = await fetchJson(`/api/admin/cms/assets/${editingBannerId}`, {
        method: 'PUT',
        body: JSON.stringify(assetPayload)
      });
    } else {
      console.log('Saving banner asset to', apiUrl('/api/admin/cms/assets'));
      assetResult = await fetchJson('/api/admin/cms/assets', {
        method: 'POST',
        body: JSON.stringify(assetPayload)
      });
    }

    if (!assetResult || !assetResult.success) {
      throw new Error(assetResult?.message || 'Failed to save banner asset');
    }

    const sectionPayload = {
      pageSlug: 'homepage',
      sectionKey: 'hero-banner',
      heading: headline,
      body: subtext,
      content: {
        title,
        location,
        image: fileUrl,
        ctaText,
        ctaLink,
        badge: 'Featured',
        summary: title,
        startDate: startDate || null,
        endDate: endDate || null
      },
      sectionType: 'hero',
      sortOrder: 1,
      isVisible: true
    };

    console.log('Saving hero section to', apiUrl('/api/admin/cms/sections'));
    const sectionResult = await fetchJson('/api/admin/cms/sections', {
      method: 'POST',
      body: JSON.stringify(sectionPayload)
    });

    if (!sectionResult.success) {
      throw new Error(sectionResult.message || 'Failed to save hero section');
    }

    await loadCMSData();
    renderBannersGrid();
    closeModal('banner-modal');
  } catch (error) {
    console.error('Save banner failed:', error);
    alert(`Could not save banner: ${error.message}`);
  }
}

function setupBannerModal() {
  const createBannerBtn = document.getElementById('btn-create-banner');
  if (createBannerBtn) {
    createBannerBtn.addEventListener('click', () => {
      clearBannerModalForm();
      openModal('banner-modal');
    });
  }

  const saveBannerBtn = document.getElementById('btn-save-banner');
  if (saveBannerBtn) {
    saveBannerBtn.addEventListener('click', saveBanner);
  }

  const mediaInput = document.getElementById('banner-media');
  if (mediaInput) {
    mediaInput.addEventListener('change', previewBannerMedia);
  }
}

// ====== Load CMS Data from Backend ======
async function loadCMSData() {
  try {
    const [pagesRes, sectionsRes, navRes, assetsRes, announcementsRes] = await Promise.all([
      fetchJson('/api/admin/cms/pages'),
      fetchJson('/api/admin/cms/sections'),
      fetchJson('/api/admin/cms/navigation'),
      fetchJson('/api/admin/cms/assets'),
      fetchJson('/api/admin/cms/announcements')
    ]);

    cmsData.pages = pagesRes.data || [];
    cmsData.sections = sectionsRes.data || [];
    cmsData.navigation = navRes.data || [];
    cmsData.assets = assetsRes.data || [];
    cmsData.announcements = announcementsRes.data || [];

    console.log('CMS Data Loaded:', cmsData);
  } catch (error) {
    console.error('Failed to load CMS data:', error);
    cmsData = {
      pages: [],
      sections: [],
      navigation: [],
      assets: [],
      announcements: []
    };
  }
}

// ====== Render Landing Pages Table ======
function renderLandingPagesTable() {
  const tbody = document.getElementById('landing-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!cmsData.pages.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No landing pages created yet</td></tr>';
    return;
  }

  cmsData.pages.forEach(page => {
    const createdDate = new Date(page.created_at).toLocaleDateString();
    const publishedDate = page.published_at ? new Date(page.published_at).toLocaleDateString() : 'Not scheduled';
    
    const statusBadge = `<span class="badge badge-${page.status}">${page.status.charAt(0).toUpperCase() + page.status.slice(1)}</span>`;

    const row = `
      <tr>
        <td>${page.title}</td>
        <td>${page.slug}</td>
        <td>${statusBadge}</td>
        <td style="text-align: center;">0</td>
        <td>${createdDate}</td>
        <td>${publishedDate}</td>
        <td style="white-space: normal;">
          <button class="action-btn" onclick="editPage(${page.id})">Edit</button>
          <button class="action-btn" onclick="deletePage(${page.id})">Delete</button>
        </td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}

// ====== Render Blog Posts Table ======
function renderBlogTable() {
  const tbody = document.getElementById('blog-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!cmsData.pages.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No blog posts created yet</td></tr>';
    return;
  }

  cmsData.pages.forEach(page => {
    const createdDate = new Date(page.created_at).toLocaleDateString();
    
    const statusBadge = `<span class="badge badge-${page.status}">${page.status.charAt(0).toUpperCase() + page.status.slice(1)}</span>`;

    const row = `
      <tr>
        <td>${page.title}</td>
        <td>Blog</td>
        <td>${statusBadge}</td>
        <td style="text-align: center;">0</td>
        <td style="text-align: center;">0</td>
        <td>${createdDate}</td>
        <td style="white-space: normal;">
          <button class="action-btn" onclick="editPage(${page.id})">Edit</button>
          <button class="action-btn" onclick="deletePage(${page.id})">Delete</button>
        </td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}

// ====== Render FAQ Items ======
function renderFAQList() {
  const container = document.getElementById('faq-list');
  if (!container) return;

  container.innerHTML = '';

  if (!cmsData.sections.length) {
    container.innerHTML = '<p style="text-align: center; color: var(--muted); padding: 20px;">No FAQs created yet</p>';
    return;
  }

  const faqs = cmsData.sections.filter(s => s.section_type === 'faq').slice(0, 10);
  
  if (!faqs.length) {
    container.innerHTML = '<p style="text-align: center; color: var(--muted); padding: 20px;">No FAQs created yet</p>';
    return;
  }

  faqs.forEach(faq => {
    const item = `
      <div class="draggable-item">
        <span class="material-symbols-rounded drag-handle">drag_handle</span>
        <div style="flex: 1;">
          <div style="font-weight: 600; color: var(--text);">${faq.title}</div>
          <div style="font-size: 12px; color: var(--muted);">Order: ${faq.display_order}</div>
        </div>
        <button class="action-btn" onclick="editFaq(${faq.id})">Edit</button>
        <button class="action-btn" onclick="deleteFaq(${faq.id})">Delete</button>
      </div>
    `;
    container.innerHTML += item;
  });
}

// ====== Render Banners Grid ======
function renderBannersGrid() {
  const grid = document.getElementById('banners-grid');
  if (!grid) return;

  grid.innerHTML = '';

  const banners = cmsData.assets.filter(a => {
    const type = String(a.file_type || a.asset_type || '').toLowerCase();
    return type === 'image' || type.startsWith('image/');
  });

  if (!banners.length) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">No banners created yet</div>';
    return;
  }

  banners.forEach(banner => {
    const statusBadge = `<span class="badge badge-${banner.status}">${banner.status}</span>`;
    const createdDate = new Date(banner.created_at).toLocaleDateString();

    const card = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${banner.file_name}</div>
            <div class="card-meta">${banner.location || 'N/A'}</div>
          </div>
          ${statusBadge}
        </div>
        <div class="card-thumb">
          <img src="${banner.file_url}" alt="${banner.alt_text || banner.file_name}" onerror="this.style.display='none'">
          <span style="display: ${banner.file_url ? 'none' : 'block'}">No Image</span>
        </div>
        <div style="font-size: 12px; color: var(--muted);">Created: ${createdDate}</div>
        <div class="card-actions">
          <button class="btn secondary sm" onclick="editBanner('${banner.id}')">Edit</button>
          <button class="btn danger sm" onclick="deleteBanner('${banner.id}')">Delete</button>
        </div>
      </div>
    `;
    grid.innerHTML += card;
  });
}

// ====== Render Announcements ======
function renderAnnouncements() {
  const container = document.getElementById('announcements-list');
  if (!container) {
    console.log('Announcements container not found on this page');
    return;
  }

  container.innerHTML = '';

  if (!cmsData.announcements.length) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--muted);">No announcements</div>';
    return;
  }

  cmsData.announcements.forEach(announcement => {
    const badge = `<span class="badge badge-${announcement.announcement_type}">${announcement.announcement_type}</span>`;
    const createdDate = new Date(announcement.created_at).toLocaleDateString();

    const item = `
      <div style="background: white; padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: start; gap: 12px;">
          <div style="flex: 1;">
            <div style="font-weight: 600; color: var(--text);">${announcement.title}</div>
            <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">Order: ${announcement.display_order}</div>
            <div style="font-size: 12px; color: var(--muted);">Created: ${createdDate}</div>
          </div>
          <div style="display: flex; gap: 6px;">
            ${badge}
            <button class="action-btn" onclick="editAnnouncement(${announcement.id})">Edit</button>
            <button class="action-btn" onclick="deleteAnnouncement(${announcement.id})">Delete</button>
          </div>
        </div>
      </div>
    `;
    container.innerHTML += item;
  });
}

// ====== Render Media Library ======
function renderMediaLibrary() {
  const grid = document.getElementById('media-grid');
  if (!grid) {
    console.log('Media grid not found on this page');
    return;
  }

  grid.innerHTML = '';

  const mediaItems = cmsData.assets.filter(a => {
    const type = String(a.file_type || a.asset_type || '').toLowerCase();
    return type !== 'image' && !type.startsWith('image/');
  });

  if (!mediaItems.length) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">No media files uploaded yet</div>';
    return;
  }

  mediaItems.forEach(media => {
    const createdDate = new Date(media.created_at).toLocaleDateString();

    const card = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${media.file_name}</div>
            <div class="card-meta">${media.file_type}</div>
          </div>
        </div>
        <div class="card-thumb">
          <img src="${media.file_url}" alt="${media.alt_text || media.file_name}" onerror="this.style.display='none'">
          <span style="display: ${media.file_url ? 'none' : 'block'}">No Preview</span>
        </div>
        <div style="font-size: 12px; color: var(--muted);">Created: ${createdDate}</div>
        <div class="card-actions">
          <button class="btn secondary sm" onclick="editMedia(${media.id})">Edit</button>
          <button class="btn danger sm" onclick="deleteMedia(${media.id})">Delete</button>
        </div>
      </div>
    `;
    grid.innerHTML += card;
  });
}

// ====== Placeholder Action Functions ======
function editPage(id) {
  alert(`Edit page feature coming soon (ID: ${id})`);
}

function deletePage(id) {
  if (confirm('Are you sure you want to delete this page?')) {
    alert(`Delete page feature coming soon (ID: ${id})`);
  }
}

function editFaq(id) {
  alert(`Edit FAQ feature coming soon (ID: ${id})`);
}

function deleteFaq(id) {
  if (confirm('Are you sure you want to delete this FAQ?')) {
    alert(`Delete FAQ feature coming soon (ID: ${id})`);
  }
}

function prefillBannerModal(banner) {
  editingBannerId = banner.id;
  const titleEl = document.getElementById('banner-modal-title');
  if (titleEl) titleEl.textContent = 'Edit Banner';

  document.getElementById('banner-title').value = banner.file_name || '';
  document.getElementById('banner-location').value = banner.location || '';
  document.getElementById('banner-headline').value = banner.headline || banner.file_name || '';
  document.getElementById('banner-subtext').value = banner.subtext || '';
  document.getElementById('banner-cta-text').value = banner.ctaText || '';
  document.getElementById('banner-cta-link').value = banner.ctaLink || '';
  document.getElementById('banner-start').value = banner.startDate ? banner.startDate.slice(0, 16) : '';
  document.getElementById('banner-end').value = banner.endDate ? banner.endDate.slice(0, 16) : '';

  const preview = document.getElementById('banner-preview');
  if (preview) {
    preview.innerHTML = `<img src="${banner.file_url}" alt="Banner preview" style="max-width: 100%; height: auto; display: block; border-radius: 8px;" />`;
    preview.dataset.fileUrl = banner.file_url;
  }
}

function normalizeBannerId(id) {
  return typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;
}

function editBanner(id) {
  id = normalizeBannerId(id);
  const banner = cmsData.assets.find((item) => item.id === id || String(item.id) === String(id));
  if (!banner) {
    alert('Banner not found');
    return;
  }

  clearBannerModalForm();
  prefillBannerModal(banner);
  openModal('banner-modal');
}

async function deleteBanner(id) {
  id = normalizeBannerId(id);
  if (!confirm('Are you sure you want to delete this banner?')) {
    return;
  }

  try {
    console.log('Deleting banner asset', apiUrl(`/api/admin/cms/assets/${id}`));
    const result = await fetchJson(`/api/admin/cms/assets/${id}`, {
      method: 'DELETE'
    });

    if (!result.success) {
      throw new Error(result.message || 'Failed to delete banner asset');
    }

    await loadCMSData();
    renderBannersGrid();
  } catch (error) {
    console.error('Delete banner failed:', error);
    alert(`Could not delete banner: ${error.message}`);
  }
}

function editMedia(id) {
  alert(`Edit media feature coming soon (ID: ${id})`);
}

function deleteMedia(id) {
  if (confirm('Are you sure you want to delete this media file?')) {
    alert(`Delete media feature coming soon (ID: ${id})`);
  }
}

function editAnnouncement(id) {
  alert(`Edit announcement feature coming soon (ID: ${id})`);
}

function deleteAnnouncement(id) {
  if (confirm('Are you sure you want to delete this announcement?')) {
    alert(`Delete announcement feature coming soon (ID: ${id})`);
  }
}

// ====== Tab Switching ======
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const tabId = tab.getAttribute('data-tab');
      const content = document.getElementById(tabId);
      if (content) content.classList.add('active');
    });
  });
}

// ====== Search & Filter ======
function setupSearch() {
  const landingSearch = document.getElementById('search-landing');
  if (landingSearch) {
    landingSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const tbody = document.getElementById('landing-tbody');
      if (!tbody) return;

      Array.from(tbody.querySelectorAll('tr')).forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
      });
    });
  }

  const blogSearch = document.getElementById('search-blog');
  if (blogSearch) {
    blogSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const tbody = document.getElementById('blog-tbody');
      if (!tbody) return;

      Array.from(tbody.querySelectorAll('tr')).forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
      });
    });
  }

  const bannerSearch = document.getElementById('search-banners');
  if (bannerSearch) {
    bannerSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const grid = document.getElementById('banners-grid');
      if (!grid) return;

      Array.from(grid.querySelectorAll('.card')).forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(query) ? '' : 'none';
      });
    });
  }

  const mediaSearch = document.getElementById('search-media');
  if (mediaSearch) {
    mediaSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const grid = document.getElementById('media-grid');
      if (!grid) return;

      Array.from(grid.querySelectorAll('.card')).forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(query) ? '' : 'none';
      });
    });
  }
}

// ====== Initialize CMS Page ======
window.addEventListener('DOMContentLoaded', async function() {
  await loadCMSData();
  
  renderLandingPagesTable();
  renderBlogTable();
  renderBannersGrid();
  renderFAQList();
  renderMediaLibrary();
  renderAnnouncements();
  
  setupTabs();
  setupSearch();
  setupBannerModal();
  
  console.log('CMS page initialized with data from backend');
});
