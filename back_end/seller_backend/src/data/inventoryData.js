// Seller Inventory Management Data Module

const inventoryState = {
  products: [
    { 
      id: 1, 
      product: 'Wireless Headphones', 
      sku: 'SKU-001', 
      category: 'Men', 
      stock: 45, 
      threshold: 20, 
      status: 'In Stock', 
      warehouse: 'Main Warehouse', 
      image: '🎧', 
      price: 79.99, 
      variants: [
        { name: 'Black', sku: 'SKU-001-BK', qty: 25 }, 
        { name: 'White', sku: 'SKU-001-WH', qty: 20 }
      ] 
    },
    { 
      id: 2, 
      product: 'USB Type-C Cable', 
      sku: 'SKU-002', 
      category: 'Accessories', 
      stock: 8, 
      threshold: 15, 
      status: 'Low Stock', 
      warehouse: 'Main Warehouse', 
      image: '🔌', 
      price: 12.99, 
      variants: [] 
    },
    { 
      id: 3, 
      product: 'Phone Case', 
      sku: 'SKU-003', 
      category: 'Accessories', 
      stock: 0, 
      threshold: 10, 
      status: 'Out of Stock', 
      warehouse: 'Warehouse A', 
      image: '📱', 
      price: 24.99, 
      variants: [] 
    },
    { 
      id: 4, 
      product: 'Laptop Stand', 
      sku: 'SKU-004', 
      category: 'Women', 
      stock: 32, 
      threshold: 15, 
      status: 'In Stock', 
      warehouse: 'Warehouse B', 
      image: '🖥️', 
      price: 45.99, 
      variants: [] 
    },
    { 
      id: 5, 
      product: 'Mechanical Keyboard', 
      sku: 'SKU-005', 
      category: 'Men', 
      stock: 12, 
      threshold: 25, 
      status: 'Low Stock', 
      warehouse: 'Main Warehouse', 
      image: '⌨️', 
      price: 89.99, 
      variants: [
        { name: 'RGB', sku: 'SKU-005-RGB', qty: 7 }, 
        { name: 'Standard', sku: 'SKU-005-STD', qty: 5 }
      ] 
    },
    { 
      id: 6, 
      product: 'Monitor Mount', 
      sku: 'SKU-006', 
      category: 'Women', 
      stock: 0, 
      threshold: 5, 
      status: 'Out of Stock', 
      warehouse: 'Warehouse A', 
      image: '🖨️', 
      price: 34.99, 
      variants: [] 
    },
    { 
      id: 7, 
      product: 'USB Hub', 
      sku: 'SKU-007', 
      category: 'Men', 
      stock: 55, 
      threshold: 20, 
      status: 'In Stock', 
      warehouse: 'Main Warehouse', 
      image: '🔗', 
      price: 29.99, 
      variants: [] 
    },
    { 
      id: 8, 
      product: 'Screen Protector', 
      sku: 'SKU-008', 
      category: 'Accessories', 
      stock: 120, 
      threshold: 50, 
      status: 'In Stock', 
      warehouse: 'Warehouse B', 
      image: '🛡️', 
      price: 9.99, 
      variants: [
        { name: 'iPhone 13', sku: 'SKU-008-IP13', qty: 60 }, 
        { name: 'iPhone 14', sku: 'SKU-008-IP14', qty: 60 }
      ] 
    },
    { 
      id: 9, 
      product: 'Bluetooth Speaker', 
      sku: 'SKU-009', 
      category: 'Electronics', 
      stock: 28, 
      threshold: 15, 
      status: 'In Stock', 
      warehouse: 'Main Warehouse', 
      image: '🔊', 
      price: 54.99, 
      variants: [] 
    },
    { 
      id: 10, 
      product: 'Desk Lamp', 
      sku: 'SKU-010', 
      category: 'Office', 
      stock: 5, 
      threshold: 10, 
      status: 'Low Stock', 
      warehouse: 'Warehouse B', 
      image: '💡', 
      price: 39.99, 
      variants: [] 
    },
    { 
      id: 11, 
      product: 'Webcam HD', 
      sku: 'SKU-011', 
      category: 'Electronics', 
      stock: 18, 
      threshold: 12, 
      status: 'In Stock', 
      warehouse: 'Main Warehouse', 
      image: '📹', 
      price: 69.99, 
      variants: [] 
    },
    { 
      id: 12, 
      product: 'Mouse Pad', 
      sku: 'SKU-012', 
      category: 'Accessories', 
      stock: 85, 
      threshold: 30, 
      status: 'In Stock', 
      warehouse: 'Warehouse A', 
      image: '🖱️', 
      price: 14.99, 
      variants: [
        { name: 'Small', sku: 'SKU-012-SM', qty: 35 }, 
        { name: 'Large', sku: 'SKU-012-LG', qty: 50 }
      ] 
    }
  ],

  restockHistory: [
    { 
      id: 1, 
      product: 'Wireless Headphones', 
      sku: 'SKU-001',
      oldQty: 40, 
      newQty: 45, 
      change: 5,
      reason: 'Restocking', 
      notes: 'Regular monthly restock',
      date: '2026-03-06', 
      time: '14:30', 
      user: 'Admin', 
      warehouse: 'Main Warehouse' 
    },
    { 
      id: 2, 
      product: 'USB Type-C Cable', 
      sku: 'SKU-002',
      oldQty: 15, 
      newQty: 8, 
      change: -7,
      reason: 'Sales', 
      notes: 'Sold during flash sale',
      date: '2026-03-06', 
      time: '10:15', 
      user: 'System', 
      warehouse: 'Main Warehouse' 
    },
    { 
      id: 3, 
      product: 'Mechanical Keyboard', 
      sku: 'SKU-005',
      oldQty: 20, 
      newQty: 12, 
      change: -8,
      reason: 'Damaged Items', 
      notes: 'Water damage during shipment',
      date: '2026-03-05', 
      time: '09:45', 
      user: 'Manager', 
      warehouse: 'Main Warehouse' 
    },
    { 
      id: 4, 
      product: 'Monitor Mount', 
      sku: 'SKU-006',
      oldQty: 5, 
      newQty: 0, 
      change: -5,
      reason: 'Out of Stock', 
      notes: 'Sold last units',
      date: '2026-03-05', 
      time: '16:20', 
      user: 'Admin', 
      warehouse: 'Warehouse A' 
    },
    { 
      id: 5, 
      product: 'Laptop Stand', 
      sku: 'SKU-004',
      oldQty: 25, 
      newQty: 32, 
      change: 7,
      reason: 'Bulk Restock', 
      notes: 'New shipment arrived',
      date: '2026-03-04', 
      time: '11:00', 
      user: 'Warehouse Staff', 
      warehouse: 'Warehouse B' 
    },
    { 
      id: 6, 
      product: 'Screen Protector', 
      sku: 'SKU-008',
      oldQty: 100, 
      newQty: 120, 
      change: 20,
      reason: 'Restocking', 
      notes: 'High demand product',
      date: '2026-03-03', 
      time: '13:45', 
      user: 'Admin', 
      warehouse: 'Warehouse B' 
    }
  ]
};

// Helper function to update product status based on stock and threshold
function updateProductStatus(product) {
  if (product.stock === 0) {
    product.status = 'Out of Stock';
  } else if (product.stock < product.threshold) {
    product.status = 'Low Stock';
  } else {
    product.status = 'In Stock';
  }
}

function getOverview() {
  const total = inventoryState.products.length;
  const inStock = inventoryState.products.filter(p => p.status === 'In Stock').length;
  const lowStock = inventoryState.products.filter(p => p.status === 'Low Stock').length;
  const outOfStock = inventoryState.products.filter(p => p.status === 'Out of Stock').length;
  
  const totalStockValue = inventoryState.products.reduce((sum, p) => sum + (p.stock * p.price), 0);
  const alertCount = lowStock + outOfStock;

  return {
    totalProducts: total,
    inStockProducts: inStock,
    lowStockProducts: lowStock,
    outOfStockProducts: outOfStock,
    totalStockValue: totalStockValue.toFixed(2),
    alertCount
  };
}

function filterProducts(query = {}) {
  const { search = '', status = '', category = '', page = 1, pageSize = 10 } = query;
  
  let filtered = [...inventoryState.products];
  
  // Search filter (by product name or SKU)
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(product =>
      product.product.toLowerCase().includes(searchLower) ||
      product.sku.toLowerCase().includes(searchLower)
    );
  }
  
  // Status filter
  if (status) {
    filtered = filtered.filter(product => product.status === status);
  }
  
  // Category filter
  if (category) {
    filtered = filtered.filter(product => product.category === category);
  }
  
  // Sort by stock status (out of stock first, then low stock, then in stock)
  const statusOrder = { 'Out of Stock': 0, 'Low Stock': 1, 'In Stock': 2 };
  filtered.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  
  // Pagination
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedProducts = filtered.slice(startIndex, endIndex);
  
  return {
    products: paginatedProducts,
    pagination: {
      currentPage: parseInt(page),
      pageSize: parseInt(pageSize),
      totalItems,
      totalPages
    }
  };
}

function getProductById(productId) {
  return inventoryState.products.find(product => product.id === parseInt(productId));
}

function adjustStock(productId, adjustmentData) {
  const product = inventoryState.products.find(p => p.id === parseInt(productId));
  if (!product) return null;

  const { actionType, quantity, reason, notes = '' } = adjustmentData;
  const oldStock = product.stock;
  let change = 0;

  if (actionType === 'add') {
    product.stock += quantity;
    change = quantity;
  } else if (actionType === 'reduce') {
    product.stock = Math.max(0, product.stock - quantity);
    change = -(oldStock - product.stock);
  } else if (actionType === 'set') {
    product.stock = quantity;
    change = quantity - oldStock;
  }

  updateProductStatus(product);

  // Add to history
  inventoryState.restockHistory.unshift({
    id: inventoryState.restockHistory.length + 1,
    product: product.product,
    sku: product.sku,
    oldQty: oldStock,
    newQty: product.stock,
    change: change,
    reason: reason,
    notes: notes,
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0, 5),
    user: 'Current User',
    warehouse: product.warehouse
  });

  return {
    product: product,
    oldStock: oldStock,
    newStock: product.stock,
    change: change
  };
}

function getRestockHistory(query = {}) {
  const { page = 1, pageSize = 10, productId = null } = query;
  
  let history = [...inventoryState.restockHistory];
  
  // Filter by product ID if provided
  if (productId) {
    const product = getProductById(productId);
    if (product) {
      history = history.filter(h => h.sku === product.sku);
    }
  }
  
  // Pagination
  const totalItems = history.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedHistory = history.slice(startIndex, endIndex);
  
  return {
    history: paginatedHistory,
    pagination: {
      currentPage: parseInt(page),
      pageSize: parseInt(pageSize),
      totalItems,
      totalPages
    }
  };
}

function getLowStockAlerts() {
  const alerts = inventoryState.products.filter(p => p.status === 'Low Stock' || p.status === 'Out of Stock');
  
  return {
    alerts: alerts,
    count: alerts.length
  };
}

function bulkRestock(restockData) {
  const results = {
    success: 0,
    failed: 0,
    details: []
  };

  restockData.forEach(item => {
    const product = inventoryState.products.find(p => p.sku === item.sku);
    
    if (product) {
      const oldStock = product.stock;
      product.stock += parseInt(item.quantity) || 0;
      updateProductStatus(product);
      
      // Add to history
      inventoryState.restockHistory.unshift({
        id: inventoryState.restockHistory.length + 1,
        product: product.product,
        sku: product.sku,
        oldQty: oldStock,
        newQty: product.stock,
        change: parseInt(item.quantity) || 0,
        reason: 'Bulk Restock',
        notes: item.notes || 'Bulk upload',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().slice(0, 5),
        user: 'Bulk Upload',
        warehouse: item.warehouse || product.warehouse
      });
      
      results.success++;
      results.details.push({ sku: item.sku, status: 'success', message: `Updated ${product.product}` });
    } else {
      results.failed++;
      results.details.push({ sku: item.sku, status: 'failed', message: 'Product not found' });
    }
  });

  return results;
}

function updateThreshold(productId, newThreshold) {
  const product = inventoryState.products.find(p => p.id === parseInt(productId));
  if (!product) return null;

  const oldThreshold = product.threshold;
  product.threshold = newThreshold;
  
  // Update status based on new threshold
  updateProductStatus(product);

  return {
    product: product,
    oldThreshold: oldThreshold,
    newThreshold: newThreshold
  };
}

function exportInventoryCSV() {
  let csv = 'Product Name,SKU,Category,Current Stock,Threshold,Status,Warehouse,Price\n';
  
  inventoryState.products.forEach(item => {
    csv += `"${item.product}","${item.sku}","${item.category}",${item.stock},${item.threshold},"${item.status}","${item.warehouse}",${item.price}\n`;
  });

  return csv;
}

function getCategories() {
  const categories = [...new Set(inventoryState.products.map(p => p.category))];
  return categories.sort();
}

function getWarehouses() {
  const warehouses = [...new Set(inventoryState.products.map(p => p.warehouse))];
  return warehouses.sort();
}

module.exports = {
  inventoryState,
  getOverview,
  filterProducts,
  getProductById,
  adjustStock,
  getRestockHistory,
  getLowStockAlerts,
  bulkRestock,
  updateThreshold,
  exportInventoryCSV,
  getCategories,
  getWarehouses
};
