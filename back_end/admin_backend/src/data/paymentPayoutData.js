const now = Date.now();

const paymentState = {
  onlinePayments: [
    {
      id: 'OP001',
      orderId: 'ORD-2024-001',
      customerName: 'Rajesh Kumar',
      sellerName: 'TechStore Pune',
      amount: 5000,
      gateway: 'Stripe',
      paymentStatus: 'success',
      escrowStatus: 'held',
      createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      returnWindowDays: 7,
      returnsWindowExpiry: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
      ref: 'STR-2024-001'
    },
    {
      id: 'OP002',
      orderId: 'ORD-2024-002',
      customerName: 'Priya Sharma',
      sellerName: 'ElectroHub',
      amount: 8500,
      gateway: 'PayPal',
      paymentStatus: 'success',
      escrowStatus: 'held',
      createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
      returnWindowDays: 7,
      returnsWindowExpiry: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
      ref: 'PP-2024-002'
    },
    {
      id: 'OP003',
      orderId: 'ORD-2024-003',
      customerName: 'Amit Das',
      sellerName: 'FashionView',
      amount: 3500,
      gateway: 'HDFC Bank',
      paymentStatus: 'success',
      escrowStatus: 'dispute',
      createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      returnWindowDays: 7,
      returnsWindowExpiry: new Date(now + 4 * 24 * 60 * 60 * 1000).toISOString(),
      ref: 'HDFC-2024-003'
    },
    {
      id: 'OP004',
      orderId: 'ORD-2024-004',
      customerName: 'Neha Patel',
      sellerName: 'TechStore Pune',
      amount: 12000,
      gateway: 'Stripe',
      paymentStatus: 'failed',
      escrowStatus: 'none',
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
      returnWindowDays: 7,
      returnsWindowExpiry: null,
      ref: 'STR-2024-004'
    },
    {
      id: 'OP005',
      orderId: 'ORD-2024-005',
      customerName: 'Ananya Singh',
      sellerName: 'HomeDelight',
      amount: 7200,
      gateway: 'Stripe',
      paymentStatus: 'success',
      escrowStatus: 'released',
      createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      returnWindowDays: 7,
      returnsWindowExpiry: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      ref: 'STR-2024-005'
    }
  ],
  codTracking: [
    {
      id: 'COD001',
      orderId: 'ORD-2024-006',
      sellerName: 'LocalGoods',
      courierName: 'Delhivery',
      codAmount: 4500,
      deliveryStatus: 'delivered',
      courierDepositStatus: 'pending',
      depositedAmount: null,
      variance: 0,
      createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'COD002',
      orderId: 'ORD-2024-007',
      sellerName: 'SendMore',
      courierName: 'Bluedart',
      codAmount: 6200,
      deliveryStatus: 'delivered',
      courierDepositStatus: 'deposited',
      depositedAmount: 6200,
      variance: 0,
      createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'COD003',
      orderId: 'ORD-2024-008',
      sellerName: 'FastCart',
      courierName: 'DTDC',
      codAmount: 3800,
      deliveryStatus: 'in-transit',
      courierDepositStatus: 'pending',
      depositedAmount: null,
      variance: 0,
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'COD004',
      orderId: 'ORD-2024-009',
      sellerName: 'QuickBuy',
      courierName: 'Delhivery',
      codAmount: 5000,
      deliveryStatus: 'delivered',
      courierDepositStatus: 'mismatch',
      depositedAmount: 4800,
      variance: -200,
      createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString()
    }
  ],
  sellers: [
    {
      id: 'S001',
      name: 'TechStore Pune',
      kycStatus: 'verified',
      bankStatus: 'verified',
      riskLevel: 'clear',
      bankName: 'HDFC Bank',
      accountHolder: 'Tech Store Pvt Ltd',
      accountNumber: '****2847',
      ifsc: 'HDFC0001234',
      grossSales: 45000,
      commission: 4500,
      shipping: 1000,
      taxes: 2000,
      refunds: 1500,
      availableBalance: 35000,
      pendingBalance: 12000,
      paidAmount: 89000
    },
    {
      id: 'S002',
      name: 'ElectroHub',
      kycStatus: 'verified',
      bankStatus: 'pending',
      riskLevel: 'medium',
      bankName: 'ICICI Bank',
      accountHolder: 'Electro Hub Ltd',
      accountNumber: '****5678',
      ifsc: 'ICICI0002456',
      grossSales: 62500,
      commission: 6250,
      shipping: 1500,
      taxes: 2800,
      refunds: 0,
      availableBalance: 51950,
      pendingBalance: 8000,
      paidAmount: 125000
    },
    {
      id: 'S003',
      name: 'FashionView',
      kycStatus: 'pending',
      bankStatus: 'verified',
      riskLevel: 'high',
      bankName: 'Axis Bank',
      accountHolder: 'Fashion View Co',
      accountNumber: '****9012',
      ifsc: 'AXIS0003456',
      grossSales: 28000,
      commission: 2800,
      shipping: 800,
      taxes: 1200,
      refunds: 500,
      availableBalance: 22700,
      pendingBalance: 0,
      paidAmount: 45000
    },
    {
      id: 'S004',
      name: 'HomeDelight',
      kycStatus: 'verified',
      bankStatus: 'verified',
      riskLevel: 'clear',
      bankName: 'SBI',
      accountHolder: 'Home Delight Inc',
      accountNumber: '****3456',
      ifsc: 'SBI0004567',
      grossSales: 51200,
      commission: 5120,
      shipping: 1200,
      taxes: 2300,
      refunds: 800,
      availableBalance: 41780,
      pendingBalance: 6000,
      paidAmount: 185000
    },
    {
      id: 'S005',
      name: 'LocalGoods',
      kycStatus: 'rejected',
      bankStatus: 'rejected',
      riskLevel: 'frozen',
      bankName: 'PNB',
      accountHolder: 'Local Goods Org',
      accountNumber: '****7890',
      ifsc: 'PNB0005678',
      grossSales: 15000,
      commission: 1500,
      shipping: 500,
      taxes: 800,
      refunds: 200,
      availableBalance: 12000,
      pendingBalance: 0,
      paidAmount: 35000
    }
  ],
  failedPayments: [
    {
      id: 'FP001',
      orderId: 'ORD-2024-010',
      customerName: 'Ravi Chandra',
      amount: 6500,
      failureType: 'gateway-failure',
      errorMsg: 'Connection timeout',
      retryCount: 0,
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'FP002',
      orderId: 'ORD-2024-011',
      customerName: 'Divya Mehta',
      amount: 9200,
      failureType: 'chargeback',
      errorMsg: 'Chargeback initiated by customer',
      retryCount: 0,
      createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'FP003',
      orderId: 'ORD-2024-012',
      customerName: 'Sanjay Verma',
      amount: 4000,
      failureType: 'insufficient-funds',
      errorMsg: 'Insufficient funds in account',
      retryCount: 0,
      createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
    }
  ],
  auditLog: [
    {
      id: 1,
      adminId: 'ADM-001',
      action: 'payout-approved',
      sellerId: 'S001',
      orderId: null,
      timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      prevValue: null,
      newValue: '₹35,000',
      notes: 'Weekly payout batch #1'
    }
  ]
};

function calculateFinancialMetrics() {
  const metrics = {
    totalGrossSales: 0,
    totalCommission: 0,
    totalPendingEscrow: 0,
    totalSellerPayable: 0,
    totalPaidOut: 0,
    totalRefunds: 0,
    codPendingReconciliation: 0,
    failedPayments: 0
  };

  paymentState.onlinePayments.forEach((payment) => {
    if (payment.paymentStatus === 'success') {
      metrics.totalGrossSales += payment.amount;
      if (payment.escrowStatus === 'held' || payment.escrowStatus === 'dispute') {
        metrics.totalPendingEscrow += payment.amount;
      }
      if (payment.escrowStatus === 'released') {
        metrics.totalSellerPayable += payment.amount;
      }
    } else if (payment.paymentStatus === 'failed') {
      metrics.failedPayments += 1;
    }
  });

  paymentState.sellers.forEach((seller) => {
    metrics.totalCommission += seller.commission;
    metrics.totalSellerPayable += seller.availableBalance;
    metrics.totalPaidOut += seller.paidAmount;
    metrics.totalRefunds += seller.refunds;
  });

  metrics.codPendingReconciliation = paymentState.codTracking.filter((item) => item.courierDepositStatus === 'pending').length;

  return metrics;
}

function logAudit(action, sellerId, orderId, prevValue, newValue, notes) {
  const entry = {
    id: paymentState.auditLog.length + 1,
    adminId: 'ADM-001',
    action,
    sellerId,
    orderId,
    timestamp: new Date().toISOString(),
    prevValue,
    newValue,
    notes
  };

  paymentState.auditLog.unshift(entry);
  return entry;
}

module.exports = {
  paymentState,
  calculateFinancialMetrics,
  logAudit
};
