// Seller Payments and Earnings Data Module

const paymentsState = {
  wallet: {
    totalEarnings: 3280.0,
    availableBalance: 1820.0,
    pendingWithdrawals: 500.0,
    totalDeductions: 564.0,
    processingFee: 2.5,
    minimumWithdrawal: 100.0
  },

  bankAccounts: [
    { id: 'BA-001', label: 'HBL - ****1234', accountName: 'Seller Store', bankName: 'HBL', currency: 'USD', active: true },
    { id: 'BA-002', label: 'MCB - ****9876', accountName: 'Seller Store', bankName: 'MCB', currency: 'USD', active: true },
    { id: 'BA-003', label: 'UBL - ****4567', accountName: 'Seller Store', bankName: 'UBL', currency: 'USD', active: false }
  ],

  transactions: [
    {
      id: 'TXN-20250129-001',
      date: '2025-01-29',
      type: 'Payment received',
      description: 'Order #ORD-001234',
      amount: 120.5,
      status: 'received'
    },
    {
      id: 'TXN-20250129-002',
      date: '2025-01-29',
      type: 'Commission deduction',
      description: 'Platform commission (5%)',
      amount: -6.5,
      status: 'deduction'
    },
    {
      id: 'TXN-20250128-001',
      date: '2025-01-28',
      type: 'Payment received',
      description: 'Order #ORD-001235',
      amount: 89.99,
      status: 'received'
    },
    {
      id: 'TXN-20250128-002',
      date: '2025-01-28',
      type: 'Processing',
      description: 'Withdrawal in progress',
      amount: -500.0,
      status: 'processing'
    },
    {
      id: 'TXN-20250127-001',
      date: '2025-01-27',
      type: 'Refund deduction',
      description: 'Order #ORD-001236 refund',
      amount: -45.0,
      status: 'refund'
    },
    {
      id: 'TXN-20250127-002',
      date: '2025-01-27',
      type: 'Payment received',
      description: 'Order #ORD-001237',
      amount: 250.0,
      status: 'received'
    },
    {
      id: 'TXN-20250126-001',
      date: '2025-01-26',
      type: 'Commission deduction',
      description: 'Platform commission (5%)',
      amount: -12.5,
      status: 'deduction'
    },
    {
      id: 'TXN-20250125-001',
      date: '2025-01-25',
      type: 'Payment received',
      description: 'Order #ORD-001238',
      amount: 175.0,
      status: 'received'
    }
  ],

  withdrawals: [
    {
      id: 'WD-20250128-001',
      requestedAt: '2025-01-28T12:30:00Z',
      amount: 500.0,
      fee: 2.5,
      netAmount: 497.5,
      bankAccountId: 'BA-001',
      bankLabel: 'HBL - ****1234',
      status: 'processing'
    }
  ],

  chartData: {
    monthly: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      totalEarnings: [2500, 2800, 3100, 2900, 3400, 3800, 3200, 3600, 3400, 3700, 3280, 3500],
      netEarnings: [2300, 2580, 2870, 2690, 3140, 3520, 2960, 3340, 3160, 3430, 3040, 3250]
    },
    weekly: {
      labels: ['W1', 'W2', 'W3', 'W4'],
      totalEarnings: [720, 860, 780, 920],
      netEarnings: [684, 817, 741, 874]
    }
  }
};

function getOverview() {
  const positive = paymentsState.transactions
    .filter(item => item.amount > 0)
    .reduce((sum, item) => sum + item.amount, 0);

  const deductions = paymentsState.transactions
    .filter(item => item.amount < 0)
    .reduce((sum, item) => sum + Math.abs(item.amount), 0);

  const processingCount = paymentsState.withdrawals.filter(item => item.status === 'processing').length;

  return {
    ...paymentsState.wallet,
    transactionCount: paymentsState.transactions.length,
    processingWithdrawalCount: processingCount,
    receivedTotal: positive.toFixed(2),
    deductionsTotal: deductions.toFixed(2)
  };
}

function getBankAccounts(activeOnly = true) {
  if (!activeOnly) {
    return [...paymentsState.bankAccounts];
  }

  return paymentsState.bankAccounts.filter(account => account.active);
}

function filterTransactions(query = {}) {
  const { search = '', status = '', page = 1, pageSize = 5 } = query;

  let filtered = [...paymentsState.transactions];

  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(item =>
      item.id.toLowerCase().includes(searchLower) ||
      item.description.toLowerCase().includes(searchLower) ||
      item.type.toLowerCase().includes(searchLower)
    );
  }

  if (status) {
    filtered = filtered.filter(item => item.status === status);
  }

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 5);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const start = (safePage - 1) * safePageSize;
  const data = filtered.slice(start, start + safePageSize);

  return {
    transactions: data,
    pagination: {
      currentPage: safePage,
      pageSize: safePageSize,
      totalItems,
      totalPages
    }
  };
}

function getTransactionById(transactionId) {
  return paymentsState.transactions.find(item => item.id === transactionId);
}

function getEarningsChart(period = 'monthly', series = 'totalEarnings') {
  const chart = paymentsState.chartData[period];
  if (!chart) return null;

  if (!chart[series]) {
    return {
      labels: chart.labels,
      data: chart.totalEarnings
    };
  }

  return {
    labels: chart.labels,
    data: chart[series]
  };
}

function requestWithdrawal(payload) {
  const amount = Number(payload.amount);
  const bankAccountId = payload.bankAccountId;

  if (!Number.isFinite(amount)) {
    return { success: false, message: 'Invalid amount' };
  }

  if (amount < paymentsState.wallet.minimumWithdrawal) {
    return {
      success: false,
      message: `Amount must be at least ${paymentsState.wallet.minimumWithdrawal.toFixed(2)}`
    };
  }

  if (amount > paymentsState.wallet.availableBalance) {
    return { success: false, message: 'Amount exceeds available balance' };
  }

  const bankAccount = paymentsState.bankAccounts.find(item => item.id === bankAccountId && item.active);
  if (!bankAccount) {
    return { success: false, message: 'Invalid or inactive bank account' };
  }

  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = String(paymentsState.withdrawals.length + 1).padStart(3, '0');
  const withdrawalId = `WD-${datePart}-${suffix}`;
  const txnId = `TXN-${datePart}-${String(paymentsState.transactions.length + 1).padStart(3, '0')}`;

  const fee = paymentsState.wallet.processingFee;
  const netAmount = Number((amount - fee).toFixed(2));

  const withdrawal = {
    id: withdrawalId,
    requestedAt: now.toISOString(),
    amount: Number(amount.toFixed(2)),
    fee,
    netAmount,
    bankAccountId: bankAccount.id,
    bankLabel: bankAccount.label,
    status: 'processing'
  };

  paymentsState.withdrawals.unshift(withdrawal);

  paymentsState.transactions.unshift({
    id: txnId,
    date: now.toISOString().slice(0, 10),
    type: 'Processing',
    description: `Withdrawal request (${withdrawal.id})`,
    amount: -Number(amount.toFixed(2)),
    status: 'processing'
  });

  paymentsState.wallet.availableBalance = Number((paymentsState.wallet.availableBalance - amount).toFixed(2));
  paymentsState.wallet.pendingWithdrawals = Number((paymentsState.wallet.pendingWithdrawals + amount).toFixed(2));

  return {
    success: true,
    withdrawal,
    message: 'Withdrawal requested successfully'
  };
}

function getWithdrawals(query = {}) {
  const { status = '' } = query;

  let withdrawals = [...paymentsState.withdrawals];
  if (status) {
    withdrawals = withdrawals.filter(item => item.status === status);
  }

  withdrawals.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  return withdrawals;
}

function exportTransactionsCSV(query = {}) {
  const filtered = filterTransactions({ ...query, page: 1, pageSize: Number.MAX_SAFE_INTEGER }).transactions;
  let csv = 'Transaction ID,Date,Type,Description,Amount,Status\n';

  filtered.forEach(item => {
    csv += `"${item.id}","${item.date}","${item.type}","${item.description}","${item.amount}","${item.status}"\n`;
  });

  return csv;
}

module.exports = {
  paymentsState,
  getOverview,
  getBankAccounts,
  filterTransactions,
  getTransactionById,
  getEarningsChart,
  requestWithdrawal,
  getWithdrawals,
  exportTransactionsCSV
};
