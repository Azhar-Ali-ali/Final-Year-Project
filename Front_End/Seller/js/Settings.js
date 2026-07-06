const API_BASE = 'http://localhost:5000/api/seller/settings';
const pendingVerificationUploads = {};
const pendingBankStatement = { file: null, dataUrl: '' };

function resolveSellerId() {
  const possibleKeys = [
    'sellerId',
    'seller_id',
    'currentSellerId',
    'sellerUserId',
    'userId',
    'lumina.seller.session',
    'lumina.auth.user',
    'lumina.auth',
    'lumina.user'
  ];

  for (const key of possibleKeys) {
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const candidate = String(parsed?.id || parsed?.userId || parsed?.sellerId || parsed?.user?.id || parsed?.user?.userId || parsed?.session?.userId || '').trim();
      if (candidate) return candidate;
    } catch (_) {
      const text = String(raw).trim();
      if (text) return text;
    }
  }

  return '22222222-2222-4222-8222-222222222222';
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload.data !== undefined ? payload.data : payload;
}

function request(path, options = {}) {
  const sellerId = resolveSellerId();
  const method = String(options.method || 'GET').toUpperCase();
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  url.searchParams.set('sellerId', sellerId);
  if (method === 'GET') {
    url.searchParams.set('_ts', String(Date.now()));
  }
  return fetchJson(url.toString(), {
    ...options,
    method,
    cache: 'no-store',
    headers: {
      'x-seller-id': sellerId,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      ...(options.headers || {})
    }
  });
}

function showSuccessMessage(message = 'Changes saved successfully!') {
  const msgBox = document.getElementById('successMessage');
  if (!msgBox) return;
  msgBox.textContent = `? ${message}`;
  msgBox.classList.remove('hidden');
  setTimeout(() => msgBox.classList.add('hidden'), 4000);
}

function switchTab(tabName, btn) {
  document.querySelectorAll('.tab-content').forEach((tab) => tab.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((button) => button.classList.remove('active'));
  const tab = document.getElementById(`${tabName}-tab`);
  if (tab) tab.classList.add('active');
  if (btn) btn.classList.add('active');
}

function formatDate(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.value = value ?? '';
}

function setChecked(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.checked = Boolean(value);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = value ?? '';
}

function renderVerificationStatus(verification) {
  const badge = document.getElementById('kycStatusBadge');
  if (!badge) return;

  const raw = String(verification?.status || 'not_submitted').toLowerCase();
  const normalized = raw === 'approved' ? 'verified' : raw;
  const labelMap = {
    not_submitted: 'Not Submitted',
    pending: 'Pending',
    verified: 'Verified',
    rejected: 'Rejected'
  };
  const label = labelMap[normalized] || normalized.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  badge.textContent = label;
  badge.classList.remove('status-active', 'status-pending');
  if (normalized === 'verified') {
    badge.classList.add('status-active');
  } else {
    badge.classList.add('status-pending');
  }

  setText('kycSubmittedAt', verification?.submittedAt ? formatDate(verification.submittedAt) : '--');
  setText('kycExpectedBy', verification?.expectedBy ? formatDate(verification.expectedBy) : '--');

  const isVerified = normalized === 'verified';
  const uploadNotice = document.getElementById('kycUploadNotice');
  const verifiedInfo = document.getElementById('kycVerifiedInfo');
  const uploadSections = document.getElementById('kycUploadSections');
  const actionButtons = document.getElementById('kycActionButtons');

  if (uploadNotice) uploadNotice.style.display = isVerified ? 'none' : 'flex';
  if (verifiedInfo) verifiedInfo.style.display = isVerified ? 'flex' : 'none';
  if (uploadSections) uploadSections.style.display = isVerified ? 'none' : 'block';
  if (actionButtons) actionButtons.style.display = isVerified ? 'none' : 'flex';

  if (isVerified) {
    Object.keys(pendingVerificationUploads).forEach((key) => delete pendingVerificationUploads[key]);
  }
}

function renderVerificationDocuments(verification) {
  const docs = verification?.documents || {};

  if (docs.cnicFront?.url) {
    const preview = document.getElementById('cnicFrontPreview');
    const img = document.getElementById('cnicFrontImg');
    if (preview && img) {
      img.src = docs.cnicFront.url;
      preview.style.display = 'block';
    }
  }

  if (docs.cnicBack?.url) {
    const preview = document.getElementById('cnicBackPreview');
    const img = document.getElementById('cnicBackImg');
    if (preview && img) {
      img.src = docs.cnicBack.url;
      preview.style.display = 'block';
    }
  }

  if (docs.selfie?.url) {
    const preview = document.getElementById('selfiePreview');
    const img = document.getElementById('selfieImg');
    if (preview && img) {
      img.src = docs.selfie.url;
      preview.style.display = 'block';
    }
  }

  if (docs.bankStatement?.url) {
    const preview = document.getElementById('bankStatementPreview');
    const name = document.getElementById('bankStatementName');
    if (preview) preview.style.display = 'block';
    if (name) name.textContent = 'Uploaded bank statement';
  }
}

function renderPaymentStatus(payment) {
  // Payment Status rendering removed - using only Bank Account Verification status now
  return;
}

function renderBankAccountStatus(bankAccount) {
  const statusBox = document.getElementById('bankAccountStatusBox');
  const statusText = document.getElementById('bankAccountStatusText');
  const rejectionReason = document.getElementById('bankAccountRejectionReason');

  if (!statusBox || !statusText) return;

  const verificationStatus = String(bankAccount?.verificationStatus || 'pending').toLowerCase();
  const isVerified = verificationStatus === 'verified';
  const isPending = verificationStatus === 'pending';
  const isRejected = verificationStatus === 'rejected';

  // Update status box styling
  statusBox.className = isVerified ? 'info-box success' : isRejected ? 'info-box warning' : 'info-box';

  // Set appropriate status message
  if (isVerified) {
    statusText.innerHTML = '<div style="font-size:14px;">🟢 <strong>Verified</strong></div><div style="margin-top:8px; font-size:13px; color:#666;">Your bank account has been verified and is ready to receive payouts.</div>';
  } else if (isPending) {
    statusText.innerHTML = '<div style="font-size:14px;">🟡 <strong>Pending Verification</strong></div><div style="margin-top:8px; font-size:13px; color:#666;">Your bank account is currently being reviewed by the Admin. You cannot request payouts until your account has been verified.</div>';
  } else if (isRejected) {
    statusText.innerHTML = '<div style="font-size:14px;">🔴 <strong>Verification Rejected</strong></div><div style="margin-top:8px; font-size:13px; color:#666;">Your bank account verification was rejected. Please review the reason below and update your details.</div>';
  }

  // Show rejection reason if applicable
  if (rejectionReason) {
    if (isRejected && bankAccount?.rejectionReason) {
      rejectionReason.style.display = 'block';
      rejectionReason.innerHTML = `
        <div style="font-weight:600; margin-bottom: 10px;">🔴 Verification Rejected</div>
        <div style="margin-bottom: 15px;">
          <div style="font-weight:600;">Reason:</div>
          <div style="margin-top:5px; color:#333;">${bankAccount.rejectionReason}</div>
        </div>
        <div style="font-size:13px; color:#666;">Please update your bank details and upload a new bank statement.</div>
      `;
    } else {
      rejectionReason.style.display = 'none';
    }
  }
}

function updateBankAccountButtonText(bankAccount) {
  const saveBtn = document.getElementById('saveBankDetailsBtn');
  if (!saveBtn) return;

  const bankName = document.getElementById('bankName')?.value?.trim() || '';
  const hasExistingData = bankName && (bankAccount?.bankName || bankAccount?.accountNumber);
  
  saveBtn.textContent = hasExistingData ? 'Update Bank Details' : 'Save Bank Details';
}

function renderPreview(previewId, fileInputId, placeholderMarkup, url) {
  const preview = document.getElementById(previewId);
  const input = document.getElementById(fileInputId);
  if (!preview) return;

  if (!url) {
    preview.innerHTML = placeholderMarkup;
    if (input) input.dataset.uploadUrl = '';
    return;
  }

  preview.innerHTML = `<img src="${url}" alt="preview">`;
  if (input) input.dataset.uploadUrl = url;
}

function renderLoginSessions(sessions) {
  const tbody = document.getElementById('loginSessionsBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!sessions || !sessions.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="4" style="text-align:center; color:#777;">No recent login activity found.</td>';
    tbody.appendChild(row);
    return;
  }

  sessions.forEach((session) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatDate(session.date)}</td>
      <td>${session.device || 'Unknown device'}</td>
      <td>${session.location || 'Unknown'}</td>
      <td><span class="status-badge ${String(session.status || '').toLowerCase() === 'active' ? 'status-active' : 'status-pending'}">${session.status || 'Active'}</span></td>
    `;
    tbody.appendChild(row);
  });
}

function renderIntegrations(integrations) {
  const mapping = [
    ['google', 'googleIntegrationStatus', 'googleIntegrationButton'],
    ['facebook', 'facebookIntegrationStatus', 'facebookIntegrationButton'],
    ['shopify', 'shopifyIntegrationStatus', 'shopifyIntegrationButton']
  ];

  mapping.forEach(([platform, statusId, buttonId]) => {
    const status = document.getElementById(statusId);
    const button = document.getElementById(buttonId);
    const data = integrations?.[platform] || { connected: false };

    if (status) {
      status.textContent = data.connected ? 'Connected' : 'Not Connected';
      status.className = data.connected ? 'text-xs text-green-600' : 'text-xs text-gray-500';
    }

    if (button) {
      button.textContent = data.connected ? '?? Unlink' : '?? Link Account';
      button.className = data.connected ? 'btn btn-danger' : 'btn btn-primary';
      button.onclick = () => (data.connected ? disconnectIntegration(platform) : connectIntegration(platform));
    }
  });
}

async function loadAllSettings() {
  const [profile, security, sessions, store, payment, notifications, privacy, verification, integrations, categories] = await Promise.all([
    request('/profile'),
    request('/security'),
    request('/security/sessions'),
    request('/store'),
    request('/payment'),
    request('/notifications'),
    request('/privacy'),
    request('/verification'),
    request('/integrations'),
    request('/store/categories')
  ]);

  setValue('sellerName', profile?.sellerName || '');
  setValue('storeName', profile?.storeName || '');
  setValue('email', profile?.email || '');
  setValue('phone', profile?.phone || '');
  setValue('newEmail', profile?.email || '');

  setValue('storeBusinessName', store?.businessName || '');
  setValue('businessCategory', store?.category || 'Other');
  setValue('storeDescription', store?.description || '');
  setValue('storeAddress', store?.address || '');
  setValue('storeCity', store?.city || '');
  setValue('storeState', store?.state || '');
  setValue('storePostalCode', store?.postalCode || '');
  setValue('storeCountry', store?.country || '');
  setValue('storePhone', store?.storePhone || '');
  setValue('storeEmail', store?.storeEmail || '');

  setValue('bankName', payment?.bankName || '');
  setValue('accountHolder', payment?.accountHolderName || payment?.accountHolder || '');
  setValue('accountNumber', payment?.accountNumber || '');
  setValue('iban', payment?.iban || '');
  setValue('branchName', payment?.branchName || '');
  setValue('branchCode', payment?.branchCode || '');
  setValue('accountType', payment?.accountType || '');
  setValue('mobileWallet', payment?.mobileWallet || '');
  setValue('jazzcash', payment?.jazzcash || '');
  setValue('easypaisa', payment?.easypaisa || '');
  const bankStatementName = document.getElementById('bankStatementFileName');
  if (bankStatementName) {
    bankStatementName.textContent = payment?.bankStatementName ? `Uploaded file: ${payment.bankStatementName}` : 'No file chosen';
  }
  renderPaymentStatus(payment || {});
  renderBankAccountStatus(payment || {});
  updateBankAccountButtonText(payment || {});

  setChecked('twoFAToggle', security?.twoFactorEnabled);
  setChecked('orderAlerts', notifications?.orderAlerts);
  setChecked('paymentAlerts', notifications?.paymentAlerts);
  setChecked('chatNotifications', notifications?.chatNotifications);
  setChecked('promotions', notifications?.promotions);
  setChecked('reviews', notifications?.reviews);
  setChecked('showEmail', privacy?.showEmailPublicly);
  setChecked('showPhone', privacy?.showPhonePublicly);
  setChecked('allowMessages', privacy?.allowMessages);

  renderVerificationStatus(verification || {});
  renderVerificationDocuments(verification || {});

  renderPreview(
    'logoPreview',
    'logoInput',
    '<div class="upload-placeholder"><span class="material-symbols-rounded">cloud_upload</span><p>Click to upload</p><p style="font-size: 11px;">PNG, JPG (Square)</p></div>',
    store?.logo || ''
  );
  renderPreview(
    'bannerPreview',
    'bannerInput',
    '<div class="upload-placeholder"><span class="material-symbols-rounded">cloud_upload</span><p>Click to upload</p><p style="font-size: 11px;">PNG, JPG (16:9 Recommended)</p></div>',
    store?.banner || ''
  );

  renderLoginSessions(sessions || []);
  renderIntegrations(integrations || {});

  const categorySelect = document.getElementById('businessCategory');
  if (categorySelect && Array.isArray(categories)) {
    const options = Array.from(categorySelect.options).map((option) => option.value || option.textContent);
    if (!options.includes(store?.category)) {
      const option = document.createElement('option');
      option.value = store?.category || 'Other';
      option.textContent = store?.category || 'Other';
      categorySelect.appendChild(option);
    }
  }
}

function getStorePayload() {
  return {
    businessName: document.getElementById('storeBusinessName')?.value || '',
    category: document.getElementById('businessCategory')?.value || '',
    description: document.getElementById('storeDescription')?.value || '',
    address: document.getElementById('storeAddress')?.value || '',
    city: document.getElementById('storeCity')?.value || '',
    state: document.getElementById('storeState')?.value || '',
    postalCode: document.getElementById('storePostalCode')?.value || '',
    country: document.getElementById('storeCountry')?.value || '',
    storePhone: document.getElementById('storePhone')?.value || '',
    storeEmail: document.getElementById('storeEmail')?.value || '',
    logo: document.getElementById('logoInput')?.dataset.uploadUrl || '',
    banner: document.getElementById('bannerInput')?.dataset.uploadUrl || ''
  };
}

async function saveChanges(section) {
  try {
    if (section === 'profile') {
      await request('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          sellerName: document.getElementById('sellerName')?.value || '',
          storeName: document.getElementById('storeName')?.value || '',
          email: document.getElementById('email')?.value || '',
          phone: document.getElementById('phone')?.value || ''
        })
      });
      await loadAllSettings();
      showSuccessMessage('Profile updated successfully');
      return;
    }

    if (section === 'email') {
      await request('/security/change-email', {
        method: 'POST',
        body: JSON.stringify({
          currentEmail: document.getElementById('email')?.value || '',
          newEmail: document.getElementById('newEmail')?.value || ''
        })
      });
      await loadAllSettings();
      showSuccessMessage('Email updated successfully');
      return;
    }

    if (section === 'password') {
      await request('/security/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: document.getElementById('currentPassword')?.value || '',
          newPassword: document.getElementById('newPassword')?.value || ''
        })
      });
      await loadAllSettings();
      showSuccessMessage('Password updated successfully');
      return;
    }

    if (section === 'store') {
      const payload = getStorePayload();
      await request('/store', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      if (payload.logo) {
        await request('/store/logo', { method: 'POST', body: JSON.stringify({ url: payload.logo }) });
      }
      if (payload.banner) {
        await request('/store/banner', { method: 'POST', body: JSON.stringify({ url: payload.banner }) });
      }
      await loadAllSettings();
      showSuccessMessage('Store settings updated successfully');
      return;
    }

    if (section === 'payment') {
      await request('/payment', {
        method: 'PUT',
        body: JSON.stringify({
          bankName: document.getElementById('bankName')?.value || '',
          accountHolder: document.getElementById('accountHolder')?.value || '',
          accountNumber: document.getElementById('accountNumber')?.value || '',
          iban: document.getElementById('iban')?.value || '',
          jazzcash: document.getElementById('jazzcash')?.value || '',
          easypaisa: document.getElementById('easypaisa')?.value || ''
        })
      });
      await loadAllSettings();
      showSuccessMessage('Payment settings updated successfully');
      return;
    }

    if (section === 'notifications') {
      await request('/notifications', {
        method: 'PUT',
        body: JSON.stringify({
          orderAlerts: document.getElementById('orderAlerts')?.checked || false,
          paymentAlerts: document.getElementById('paymentAlerts')?.checked || false,
          chatNotifications: document.getElementById('chatNotifications')?.checked || false,
          promotions: document.getElementById('promotions')?.checked || false,
          reviews: document.getElementById('reviews')?.checked || false
        })
      });
      await loadAllSettings();
      showSuccessMessage('Notification preferences updated successfully');
      return;
    }

    if (section === 'privacy') {
      await request('/privacy', {
        method: 'PUT',
        body: JSON.stringify({
          showEmailPublicly: document.getElementById('showEmail')?.checked || false,
          showPhonePublicly: document.getElementById('showPhone')?.checked || false,
          allowMessages: document.getElementById('allowMessages')?.checked || false,
          dataSharing: false,
          analyticsTracking: true
        })
      });
      await loadAllSettings();
      showSuccessMessage('Privacy settings updated successfully');
      return;
    }

    if (section === 'verification') {
      await request('/verification/submit', { method: 'POST' });
      await loadAllSettings();
      showSuccessMessage('Verification submitted successfully');
      return;
    }
  } catch (error) {
    alert(error.message || 'Unable to save settings');
  }
}



async function saveBankAccountDetails() {
  try {
    const saveBtn = document.getElementById('saveBankDetailsBtn');
    const originalText = saveBtn?.textContent || 'Save Bank Details';
    
    // Validation first - before disabling button
    const bankName = document.getElementById('bankName')?.value?.trim() || '';
    const accountHolder = document.getElementById('accountHolder')?.value?.trim() || '';
    const accountNumber = document.getElementById('accountNumber')?.value?.trim() || '';

    if (!bankName || !accountHolder || !accountNumber) {
      throw new Error('Bank Name, Account Holder Name, and Account Number are required.');
    }

    // Disable button and show loading state
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    const payload = {
      bankName: bankName,
      accountHolderName: accountHolder,
      accountNumber: accountNumber,
      iban: document.getElementById('iban')?.value?.trim() || '',
      branchName: document.getElementById('branchName')?.value?.trim() || '',
      branchCode: document.getElementById('branchCode')?.value?.trim() || '',
      accountType: document.getElementById('accountType')?.value || '',
      mobileWallet: document.getElementById('mobileWallet')?.value?.trim() || '',
      bankStatement: pendingBankStatement.file ? {
        name: pendingBankStatement.file.name,
        mimeType: pendingBankStatement.file.type,
        dataUrl: pendingBankStatement.dataUrl,
        size: pendingBankStatement.file.size
      } : null,
      bankStatementName: pendingBankStatement.file ? pendingBankStatement.file.name : '',
      bankStatementUrl: pendingBankStatement.dataUrl || ''
    };

    const result = await request('/payment/bank-account', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    // Only clear after successful save
    pendingBankStatement.file = null;
    pendingBankStatement.dataUrl = '';
    document.getElementById('bankStatementInput').value = '';
    const bankStatementName = document.getElementById('bankStatementFileName');
    if (bankStatementName) bankStatementName.textContent = 'No file chosen';
    
    await loadAllSettings();
    showSuccessMessage('Your bank details have been submitted successfully and are waiting for admin verification.');
  } catch (error) {
    alert(error.message || 'Unable to save bank account details');
  } finally {
    // Re-enable button and update text based on data existence
    const saveBtn = document.getElementById('saveBankDetailsBtn');
    const bankName = document.getElementById('bankName')?.value?.trim() || '';
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = bankName ? 'Update Bank Details' : 'Save Bank Details';
    }
  }
}

function resetBankAccountForm() {
  document.getElementById('bankName').value = '';
  document.getElementById('accountHolder').value = '';
  document.getElementById('accountNumber').value = '';
  document.getElementById('iban').value = '';
  document.getElementById('branchName').value = '';
  document.getElementById('branchCode').value = '';
  document.getElementById('accountType').value = '';
  document.getElementById('mobileWallet').value = '';
  document.getElementById('bankStatementInput').value = '';
  const bankStatementName = document.getElementById('bankStatementFileName');
  if (bankStatementName) bankStatementName.textContent = 'No file chosen';
  pendingBankStatement.file = null;
  pendingBankStatement.dataUrl = '';
  loadAllSettings().catch(() => {});
}

function handleBankStatementSelection(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const allowedExtensions = /\.(pdf|jpg|jpeg|png)$/i;
  if (!allowedExtensions.test(file.name)) {
    alert('Bank statement must be a PDF, JPG, JPEG, or PNG file.');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(event) {
    pendingBankStatement.file = file;
    pendingBankStatement.dataUrl = event.target.result;
    const bankStatementName = document.getElementById('bankStatementFileName');
    if (bankStatementName) bankStatementName.textContent = `Selected file: ${file.name}`;
  };
  reader.readAsDataURL(file);
}

async function downloadData() {
  try {
    const result = await request('/privacy/download-data', { method: 'POST' });
    alert(result?.message || 'Data export requested');
  } catch (error) {
    alert(error.message || 'Unable to request data export');
  }
}

async function confirmDelete() {
  if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) return;
  try {
    const result = await request('/privacy/delete-account', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Requested from settings page' })
    });
    alert(result?.message || 'Deletion request submitted');
  } catch (error) {
    alert(error.message || 'Unable to request account deletion');
  }
}

function handleFilePreview(input, previewId, placeholderMarkup) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    renderPreview(previewId, input.id, placeholderMarkup, event.target.result);
  };
  reader.readAsDataURL(file);
}

async function uploadVerificationDocument(input, docType) {
  const file = input.files && input.files[0];
  if (!file) return;

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = () => reject(new Error('Unable to read selected file'));
    reader.readAsDataURL(file);
  });

  await request('/verification/upload', {
    method: 'POST',
    body: JSON.stringify({
      docType,
      fileData: {
        name: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl
      }
    })
  });

  const verification = await request('/verification');
  renderVerificationStatus(verification || {});
  renderVerificationDocuments(verification || {});
}

async function stageVerificationDocument(input, docType) {
  const file = input.files && input.files[0];
  if (!file) return;

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = () => reject(new Error('Unable to read selected file'));
    reader.readAsDataURL(file);
  });

  pendingVerificationUploads[docType] = {
    name: file.name,
    mimeType: file.type,
    size: file.size,
    dataUrl
  };
}

function previewLogo(input) {
  handleFilePreview(input, 'logoPreview', '<div class="upload-placeholder"><span class="material-symbols-rounded">cloud_upload</span><p>Click to upload</p><p style="font-size: 11px;">PNG, JPG (Square)</p></div>');
}

function previewBanner(input) {
  handleFilePreview(input, 'bannerPreview', '<div class="upload-placeholder"><span class="material-symbols-rounded">cloud_upload</span><p>Click to upload</p><p style="font-size: 11px;">PNG, JPG (16:9 Recommended)</p></div>');
}

function clearLogoPreview() {
  const input = document.getElementById('logoInput');
  if (input) input.value = '';
  renderPreview('logoPreview', 'logoInput', '<div class="upload-placeholder"><span class="material-symbols-rounded">cloud_upload</span><p>Click to upload</p><p style="font-size: 11px;">PNG, JPG (Square)</p></div>', '');
}

function clearBannerPreview() {
  const input = document.getElementById('bannerInput');
  if (input) input.value = '';
  renderPreview('bannerPreview', 'bannerInput', '<div class="upload-placeholder"><span class="material-symbols-rounded">cloud_upload</span><p>Click to upload</p><p style="font-size: 11px;">PNG, JPG (16:9 Recommended)</p></div>', '');
}

function resetForm() {
  loadAllSettings().catch((error) => alert(error.message || 'Unable to reset profile form'));
}

function resetStoreForm() {
  loadAllSettings().catch((error) => alert(error.message || 'Unable to reset store form'));
}

function handleCnicFrontUpload(input) {
  handleFilePreview(input, 'cnicFrontPreview', '');
  stageVerificationDocument(input, 'cnicFront')
    .then(() => showSuccessMessage('CNIC front is ready to submit'))
    .catch((error) => alert(error.message || 'Unable to stage CNIC front'));
}

function handleCnicBackUpload(input) {
  handleFilePreview(input, 'cnicBackPreview', '');
  stageVerificationDocument(input, 'cnicBack')
    .then(() => showSuccessMessage('CNIC back is ready to submit'))
    .catch((error) => alert(error.message || 'Unable to stage CNIC back'));
}

function handleSelfieUpload(input) {
  handleFilePreview(input, 'selfiePreview', '');
  stageVerificationDocument(input, 'selfie')
    .then(() => showSuccessMessage('Selfie is ready to submit'))
    .catch((error) => alert(error.message || 'Unable to stage selfie'));
}

function handleBankStatementUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const preview = document.getElementById('bankStatementPreview');
  const name = document.getElementById('bankStatementName');
  if (name) name.textContent = file.name;
  if (preview) preview.style.display = 'block';

  stageVerificationDocument(input, 'bankStatement')
    .then(() => showSuccessMessage('Bank statement is ready to submit'))
    .catch((error) => alert(error.message || 'Unable to stage bank statement'));
}

function removeCnicFront() { delete pendingVerificationUploads.cnicFront; const input = document.getElementById('cnicFront'); if (input) input.value = ''; const preview = document.getElementById('cnicFrontPreview'); if (preview) preview.style.display = 'none'; }
function removeCnicBack() { delete pendingVerificationUploads.cnicBack; const input = document.getElementById('cnicBack'); if (input) input.value = ''; const preview = document.getElementById('cnicBackPreview'); if (preview) preview.style.display = 'none'; }
function removeSelfie() { delete pendingVerificationUploads.selfie; const input = document.getElementById('selfie'); if (input) input.value = ''; const preview = document.getElementById('selfiePreview'); if (preview) preview.style.display = 'none'; }
function removeBankStatement() { delete pendingVerificationUploads.bankStatement; const input = document.getElementById('bankStatement'); if (input) input.value = ''; const preview = document.getElementById('bankStatementPreview'); if (preview) preview.style.display = 'none'; }

function resetVerificationForm() {
  if (confirm('Are you sure you want to clear all documents?')) {
    Object.keys(pendingVerificationUploads).forEach((key) => delete pendingVerificationUploads[key]);
    removeCnicFront();
    removeCnicBack();
    removeSelfie();
    removeBankStatement();
    request('/verification/documents', { method: 'DELETE' })
      .then(async () => {
        const verification = await request('/verification');
        renderVerificationStatus(verification || {});
        showSuccessMessage('All documents cleared');
      })
      .catch(() => {});
  }
}

function connectIntegration(platform) {
  request(`/integrations/${encodeURIComponent(platform)}/connect`, {
    method: 'POST',
    body: JSON.stringify({ externalId: '' })
  })
    .then(() => {
      showSuccessMessage(`${platform} connected successfully`);
      return loadAllSettings();
    })
    .catch((error) => alert(error.message || 'Unable to connect integration'));
}

function disconnectIntegration(platform) {
  if (!confirm(`Are you sure you want to disconnect ${platform}?`)) return;
  request(`/integrations/${encodeURIComponent(platform)}/disconnect`, { method: 'POST' })
    .then(() => {
      showSuccessMessage(`${platform} disconnected successfully`);
      return loadAllSettings();
    })
    .catch((error) => alert(error.message || 'Unable to disconnect integration'));
}

function logout(event) {
  if (typeof window.performSellerLogout === 'function') {
    window.performSellerLogout(event);
    return;
  }

  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  if (confirm('Are you sure you want to logout?')) {
    const keys = [
      'lumina.auth',
      'lumina.auth.user',
      'lumina.auth.token',
      'lumina.auth.role',
      'lumina.isLoggedIn',
      'lumina.customer.session',
      'lumina.seller.session',
      'lumina.user',
      'sellerId',
      'seller_id',
      'currentSellerId',
      'sellerUserId',
      'userId'
    ];

    keys.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    window.location.replace('/login_register.html');
  }
}

function submitVerification() {
  request('/verification')
    .then(async (verification) => {
      const currentStatus = String(verification?.status || '').toLowerCase();
      if (currentStatus === 'verified' || currentStatus === 'approved') {
        showSuccessMessage('Your account is already verified.');
        return;
      }

      const uploaded = verification?.documentsUploaded || {};
      const required = ['cnicFront', 'cnicBack', 'selfie'];
      const missing = required.filter((type) => !uploaded[type] && !pendingVerificationUploads[type]);

      if (missing.length) {
        throw new Error('Missing required documents. Please provide CNIC front, CNIC back, and selfie before submit.');
      }

      await request('/verification/submit', {
        method: 'POST',
        body: JSON.stringify({ pendingDocuments: pendingVerificationUploads })
      });
      Object.keys(pendingVerificationUploads).forEach((key) => delete pendingVerificationUploads[key]);

      const refreshed = await request('/verification');
      renderVerificationStatus(refreshed || {});
      renderVerificationDocuments(refreshed || {});
      showSuccessMessage('Verification submitted successfully');
    })
    .catch((error) => {
      alert(error.message || 'Unable to submit verification');
    });
}

document.addEventListener('DOMContentLoaded', () => {
  loadAllSettings().catch((error) => console.error('Failed to load settings:', error));
});

window.switchTab = switchTab;
window.saveChanges = saveChanges;
window.verifyAccount = verifyAccount;
window.downloadData = downloadData;
window.confirmDelete = confirmDelete;
window.submitVerification = submitVerification;
window.handleCnicFrontUpload = handleCnicFrontUpload;
window.removeCnicFront = removeCnicFront;
window.handleCnicBackUpload = handleCnicBackUpload;
window.removeCnicBack = removeCnicBack;
window.handleSelfieUpload = handleSelfieUpload;
window.removeSelfie = removeSelfie;
window.handleBankStatementUpload = handleBankStatementUpload;
window.removeBankStatement = removeBankStatement;
window.resetVerificationForm = resetVerificationForm;
window.connectIntegration = connectIntegration;
window.disconnectIntegration = disconnectIntegration;
window.logout = logout;
window.resetForm = resetForm;
window.previewLogo = previewLogo;
window.previewBanner = previewBanner;
window.clearLogoPreview = clearLogoPreview;
window.clearBannerPreview = clearBannerPreview;
window.resetStoreForm = resetStoreForm;
window.showSuccessMessage = showSuccessMessage;
window.saveBankAccountDetails = saveBankAccountDetails;
window.resetBankAccountForm = resetBankAccountForm;
window.handleBankStatementSelection = handleBankStatementSelection;
