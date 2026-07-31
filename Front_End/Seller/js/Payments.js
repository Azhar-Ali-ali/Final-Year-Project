const API_BASE_URL = window.API_BASE_URL || `${window.location.origin}/api`;
const API_BASE = `${API_BASE_URL}/seller/payments`;

function getSellerId() {
  const candidateKeys = ['sellerId', 'seller_id', 'currentSellerId', 'sellerUserId', 'userId', 'lumina.seller.session', 'lumina.auth.user', 'lumina.auth', 'lumina.user'];
  const fallbackSellerId = '22222222-2222-4222-8222-222222222222';
  const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

  for (const key of candidateKeys) {
    const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const candidate = [
        parsed?.id,
        parsed?.userId,
        parsed?.sellerId,
        parsed?.seller_id,
        parsed?.user?.id,
        parsed?.user?.userId,
        parsed?.user?.sellerId,
        parsed?.user?.seller_id,
        parsed?.session?.userId,
        parsed?.session?.sellerId,
        parsed?.auth?.user?.id,
        parsed?.auth?.user?.userId,
        parsed?.auth?.user?.sellerId,
        parsed?.auth?.user?.seller_id
      ].find((value) => value !== undefined && value !== null && String(value).trim() !== '');

      if (candidate) {
        const text = String(candidate).trim();
        if (isUuid(text)) return text;
      }
    } catch (_) {
      const text = String(raw).trim();
      if (isUuid(text)) return text;
    }
  }

  return fallbackSellerId;
}

const sellerId = getSellerId();
let currentPage = 1;
const itemsPerPage = 5;
let transactions = [];
let filteredTransactions = [];
let currentTransaction = null;
let chartInstance = null;
let overviewData = {
  totalEarnings: 0,
  availableBalance: 0,
  pendingEarnings: 0,
  pendingWithdrawals: 0,
  monthlyEarnings: 0,
  commissionCharged: 0,
  processingFee: 2.5,
  minimumWithdrawal: 100
};
let bankAccounts = [];
let payoutEligibility = {
  canRequestPayout: false,
  verificationStatus: 'pending',
  statusMessage: 'Your bank account must be verified before you can request a payout.'
};

async function apiRequest(path, options = {}) {
  const url = new URL(`${API_BASE}${path}`);
  if (sellerId && !url.searchParams.has('sellerId')) {
    url.searchParams.set('sellerId', sellerId);
  }

  const token = localStorage.getItem('lumina.auth.token') || sessionStorage.getItem('lumina.auth.token') || '';
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(sellerId ? { 'x-seller-id': sellerId } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload;
}

function formatMoney(value, negative = false) {
  const amount = Number(value || 0);
  return `${negative ? '-' : ''}PKR ${Math.abs(amount).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function updateMetrics() {
  const metricValues = document.querySelectorAll('.metric-card .metric-value');
  const values = [
    { value: overviewData.totalEarnings, negative: false },
    { value: overviewData.availableBalance, negative: false },
    { value: overviewData.pendingEarnings, negative: false },
    { value: overviewData.pendingWithdrawals, negative: false },
    { value: overviewData.monthlyEarnings, negative: false },
    { value: overviewData.commissionCharged, negative: true }
  ];

  values.forEach((entry, index) => {
    if (metricValues[index]) {
      metricValues[index].textContent = formatMoney(entry.value, entry.negative);
    }
  });

  const availableBalanceEl = document.getElementById('availableBalance');
  if (availableBalanceEl) availableBalanceEl.textContent = formatMoney(overviewData.availableBalance);

  const withdrawalAmount = document.getElementById('withdrawalAmount');
  if (withdrawalAmount) {
    withdrawalAmount.min = String(overviewData.minimumWithdrawal || 100);
    withdrawalAmount.max = String(Math.max(overviewData.availableBalance || 0, overviewData.minimumWithdrawal || 100));
  }

  const availableText = document.querySelector('#withdrawalModal small');
  if (availableText) {
    availableText.textContent = `Minimum: PKR ${Number(overviewData.minimumWithdrawal || 100).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} | Maximum: ${formatMoney(overviewData.availableBalance)}`;
  }

  updateWithdrawalCalculation();
}

function normalizeSellerTransactions(inputTransactions) {
  const payoutReferences = new Set(
    (Array.isArray(inputTransactions) ? inputTransactions : [])
      .filter((transaction) => String(transaction?.type || '').toLowerCase() === 'payout request')
      .map((transaction) => String(transaction?.payoutReference || '').trim())
      .filter(Boolean)
  );

  return (Array.isArray(inputTransactions) ? inputTransactions : []).filter((transaction) => {
    const type = String(transaction?.type || '').toLowerCase();
    if (type !== 'adjustment') return true;
    const note = String(transaction?.description || '').trim();
    if (!note.startsWith('Withdrawal request')) return true;
    const payoutReference = note.replace(/^Withdrawal request\s+/i, '').trim();
    return !payoutReferences.has(payoutReference);
  });
}

function renderTransactions() {
  const tbody = document.getElementById('transactionsTableBody');
  if (!tbody) return;

  const start = (currentPage - 1) * itemsPerPage;
  const pageData = filteredTransactions.slice(start, start + itemsPerPage);

  if (!pageData.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px; color: #999;">
          No transactions found
        </td>
      </tr>
    `;
    renderPagination();
    return;
  }

  tbody.innerHTML = pageData.map(transaction => {
    const statusKey = String(transaction.status || '').toLowerCase();
    const statusBadgeClass = {
      received: 'status-received',
      processing: 'status-processing',
      deduction: 'status-deduction',
      refund: 'status-refund',
      paid: 'status-paid',
      rejected: 'status-rejected'
    }[statusKey] || 'status-received';
    const statusText = statusBadgeLabel(statusKey);

    const amountClass = transaction.amount >= 0 ? 'amount-positive' : 'amount-negative';
    const amountSign = transaction.amount >= 0 ? '+' : '-';

    return `
      <tr>
        <td><strong>${transaction.id}</strong></td>
        <td>${new Date(transaction.date).toLocaleDateString()}</td>
        <td>${transaction.type}</td>
        <td class="${amountClass}">${amountSign}${formatMoney(Math.abs(transaction.amount))}</td>
        <td><span class="status-badge ${statusBadgeClass}">${statusText}</span></td>
        <td><a class="action-btn" onclick="viewTransactionDetails('${transaction.id}')">View</a></td>
      </tr>
    `;
  }).join('');

  renderPagination();
}

function renderPagination() {
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const container = document.getElementById('paginationControls');

  if (!container || totalPages <= 1) {
    if (container) container.innerHTML = '';
    return;
  }

  let html = '';
  if (currentPage > 1) html += `<button onclick="goToPage(${currentPage - 1})">← Previous</button>`;

  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      html += `<button onclick="goToPage(${i})" class="${currentPage === i ? 'active' : ''}">${i}</button>`;
    } else if (i === currentPage - 2 || i === currentPage + 2) {
      html += '<button disabled>...</button>';
    }
  }

  if (currentPage < totalPages) html += `<button onclick="goToPage(${currentPage + 1})">Next →</button>`;
  container.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  renderTransactions();
}

async function loadPayoutEligibility() {
  try {
    const response = await apiRequest('/payout-eligibility');
    payoutEligibility = response.data || payoutEligibility;
    const notice = document.getElementById('withdrawalNotice');
    const button = document.getElementById('requestWithdrawalButton');
    if (notice) {
      notice.style.display = payoutEligibility.canRequestPayout ? 'none' : 'block';
      notice.textContent = payoutEligibility.statusMessage || 'Your bank account must be verified before you can request a payout.';
    }
    if (button) {
      button.disabled = !payoutEligibility.canRequestPayout;
      button.style.opacity = payoutEligibility.canRequestPayout ? '1' : '0.6';
      button.style.cursor = payoutEligibility.canRequestPayout ? 'pointer' : 'not-allowed';
    }
  } catch (error) {
    console.error('Failed to load payout eligibility', error);
  }
}

async function openWithdrawalModal() {
  if (!payoutEligibility.canRequestPayout) {
    await loadPayoutEligibility();
  }

  if (!payoutEligibility.canRequestPayout) {
    alert(payoutEligibility.statusMessage || 'Your bank account must be verified before you can request a payout.');
    return;
  }

  document.getElementById('withdrawalModal').classList.add('active');
  updateWithdrawalCalculation();
}

function closeWithdrawalModal() {
  document.getElementById('withdrawalModal').classList.remove('active');
  document.getElementById('withdrawalAmount').value = '';
  document.getElementById('bankAccount').value = '';
  document.getElementById('termsCheckbox').checked = false;
  updateWithdrawalCalculation();
}

function updateWithdrawalCalculation() {
  const amount = parseFloat(document.getElementById('withdrawalAmount').value) || 0;
  const fee = Number(overviewData.processingFee || 2.5);
  const net = amount - fee;

  const feeField = document.getElementById('processingFee');
  if (feeField) feeField.value = formatMoney(fee);

  const netAmount = document.getElementById('netAmount');
  if (netAmount) netAmount.textContent = formatMoney(net);
}

function statusBadgeLabel(status) {
  const badges = {
    received: 'Payment Received',
    processing: 'Processing',
    deduction: 'Deduction',
    refund: 'Refund',
    paid: 'Paid',
    rejected: 'Rejected'
  };
  return badges[String(status || '').toLowerCase()] || 'Payment Received';
}

function viewTransactionDetails(transactionId) {
  currentTransaction = transactions.find(item => item.id === transactionId);
  if (!currentTransaction) return;

  const statusClass = {
    received: 'status-received',
    processing: 'status-processing',
    refund: 'status-refund',
    deduction: 'status-deduction',
    paid: 'status-paid',
    rejected: 'status-rejected'
  }[String(currentTransaction.status || '').toLowerCase()] || 'status-received';

  const details = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
      <div>
        <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Transaction ID</p>
        <p style="font-weight: 600; color: #333;">${currentTransaction.id}</p>
      </div>
      <div>
        <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Date</p>
        <p style="font-weight: 600; color: #333;">${new Date(currentTransaction.date).toLocaleDateString()}</p>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
      <div>
        <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Type</p>
        <p style="font-weight: 600; color: #333;">${currentTransaction.type}</p>
      </div>
      <div>
        <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Amount</p>
        <p style="font-weight: 600; font-size: 16px; color: ${currentTransaction.amount >= 0 ? '#10b981' : '#ef4444'};">
          ${currentTransaction.amount >= 0 ? '+' : '-'}${formatMoney(Math.abs(currentTransaction.amount))}
        </p>
      </div>
    </div>

    <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Description</p>
      <p style="font-weight: 600; color: #333; margin: 0;">${currentTransaction.description}</p>
    </div>

    <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px;">
      <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Status</p>
      <p style="margin: 0;"><span class="status-badge ${statusClass}">${statusBadgeLabel(currentTransaction.status)}</span></p>
    </div>
  `;

  document.getElementById('transactionDetails').innerHTML = details;
  document.getElementById('transactionModal').classList.add('active');
}

function closeTransactionModal() {
  document.getElementById('transactionModal').classList.remove('active');
}

function downloadInvoice() {
  if (!currentTransaction) return;
  alert(`Invoice for ${currentTransaction.id} downloaded successfully!`);
  closeTransactionModal();
}

function showSuccessModal(title, message) {
  document.getElementById('successTitle').textContent = title;
  document.getElementById('successMessage').textContent = message;
  document.getElementById('successModal').classList.add('active');
}

function closeSuccessModal() {
  document.getElementById('successModal').classList.remove('active');
}

async function exportTransactions() {
  try {
    const query = new URLSearchParams();
    const search = document.getElementById('searchInput').value.trim();
    const filterType = document.getElementById('filterSelect').value;
    if (search) query.set('search', search);
    if (filterType) query.set('status', filterType);

    const response = await fetch(`${API_BASE}/export?${query.toString()}${sellerId ? `&sellerId=${encodeURIComponent(sellerId)}` : ''}`, {
      headers: sellerId ? { 'x-seller-id': sellerId } : {}
    });

    if (!response.ok) {
      throw new Error('Failed to export transactions');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message || 'Transactions export failed');
  }
}

function filterTransactions() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const filterType = document.getElementById('filterSelect').value;

  filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = transaction.id.toLowerCase().includes(searchTerm) || transaction.description.toLowerCase().includes(searchTerm) || transaction.type.toLowerCase().includes(searchTerm);
    const matchesFilter = !filterType || transaction.status === filterType;
    return matchesSearch && matchesFilter;
  });

  currentPage = 1;
  renderTransactions();
}

async function loadOverview() {
  const response = await apiRequest('/overview');
  overviewData = {
    ...overviewData,
    ...response.data
  };
  updateMetrics();
}

async function loadTransactions() {
  const params = new URLSearchParams();
  params.set('page', String(currentPage));
  params.set('pageSize', String(itemsPerPage));
  const search = document.getElementById('searchInput').value.trim();
  const filterType = document.getElementById('filterSelect').value;
  if (search) params.set('search', search);
  if (filterType) params.set('status', filterType);

  const response = await apiRequest(`/transactions?${params.toString()}`);
  transactions = normalizeSellerTransactions(Array.isArray(response.data) ? response.data : []);
  filteredTransactions = [...transactions];
  renderTransactions();
}

async function loadChart() {
  try {
    const response = await apiRequest('/chart?period=monthly&series=totalEarnings');
    const chartData = response.data || {};
    const canvas = document.getElementById('earningsChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const labels = Array.isArray(chartData.labels) && chartData.labels.length ? chartData.labels : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const rawData = Array.isArray(chartData.data) ? chartData.data : [];
    const data = rawData.length ? rawData.map((value) => Number(value || 0)) : Array(labels.length).fill(0);

    if (chartInstance) {
      chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Total Earnings',
          data,
          borderColor: '#232f3e',
          backgroundColor: 'rgba(35, 47, 62, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointBackgroundColor: '#232f3e',
          pointBorderColor: 'white',
          pointBorderWidth: 2,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `PKR ${Number(context.parsed.y || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return 'PKR ' + Number(value).toLocaleString('en-PK');
              }
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Failed to load chart data', error);
  }
}

async function loadBankAccounts() {
  const response = await apiRequest('/bank-accounts?activeOnly=true');
  bankAccounts = Array.isArray(response.data) ? response.data : [];
  const select = document.getElementById('bankAccount');
  if (!select) return;

  const previous = select.value;
  select.innerHTML = '<option value="">Select Bank Account</option>' + bankAccounts.map(account => `<option value="${account.id}">${account.label}</option>`).join('');
  if (previous) select.value = previous;
  if (bankAccounts.length === 0) {
    select.innerHTML = '<option value="">No bank accounts available</option>';
  }
}

async function submitWithdrawal() {
  if (!payoutEligibility.canRequestPayout) {
    await loadPayoutEligibility();
  }

  if (!payoutEligibility.canRequestPayout) {
    alert(payoutEligibility.statusMessage || 'Your bank account must be verified before you can request a payout.');
    return;
  }

  const amount = parseFloat(document.getElementById('withdrawalAmount').value);
  const bankAccount = document.getElementById('bankAccount').value;
  const termsChecked = document.getElementById('termsCheckbox').checked;

  if (!amount || amount < Number(overviewData.minimumWithdrawal || 100)) {
    alert(`Please enter an amount of at least ${formatMoney(overviewData.minimumWithdrawal || 100)}`);
    return;
  }

  if (!bankAccount) {
    alert('Please select a bank account');
    return;
  }

  if (!termsChecked) {
    alert('Please confirm the terms and conditions');
    return;
  }

  try {
    const response = await apiRequest('/withdrawals', {
      method: 'POST',
      body: {
        amount,
        bankAccountId: bankAccount
      }
    });

    closeWithdrawalModal();
    await Promise.all([loadOverview(), loadTransactions(), loadChart()]);
    showSuccessModal('Withdrawal Requested', `Your withdrawal request for ${formatMoney(amount)} has been submitted successfully. You will receive the funds in 2-3 business days.`);
    return response;
  } catch (error) {
    alert(error.message || 'Withdrawal request failed');
  }
}

async function bootstrap() {
  try {
    await Promise.all([loadOverview(), loadTransactions(), loadChart(), loadBankAccounts(), loadPayoutEligibility()]);
    updateMetrics();
  } catch (error) {
    console.error(error);
    alert(error.message || 'Failed to load payments data from database.');
  }
}

window.openWithdrawalModal = openWithdrawalModal;
window.closeWithdrawalModal = closeWithdrawalModal;
window.loadPayoutEligibility = loadPayoutEligibility;
window.updateWithdrawalCalculation = updateWithdrawalCalculation;
window.submitWithdrawal = submitWithdrawal;
window.viewTransactionDetails = viewTransactionDetails;
window.closeTransactionModal = closeTransactionModal;
window.downloadInvoice = downloadInvoice;
window.showSuccessModal = showSuccessModal;
window.closeSuccessModal = closeSuccessModal;
window.exportTransactions = exportTransactions;
window.filterTransactions = filterTransactions;
window.goToPage = goToPage;

window.addEventListener('click', function(event) {
  if (event.target.classList && event.target.classList.contains('modal')) {
    event.target.classList.remove('active');
  }
});

document.addEventListener('DOMContentLoaded', function() {
  bootstrap();
});
