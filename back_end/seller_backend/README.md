# Seller Backend (Lumina)

Backend APIs for seller pages: `Dashboard.html`, `Dispute-Management.html`, `Inventory-management.html`, `Order-management.html`, `Payments.html`, `Product-Management.html`, `Refunds-Returns.html`, `Seller-Performance.html`, and `Settings.html`.

## Setup

```bash
cd back_end/seller_backend
npm install
npm start
```

Server starts at `http://localhost:5000` by default.

## Endpoints

### Dashboard Endpoints

- `GET /api/health` - Health check endpoint
- `GET /api/seller/dashboard/metrics` - Get dashboard metrics/statistics
- `GET /api/seller/dashboard/orders?search=&status=&page=1&pageSize=10` - Get orders with filtering and pagination
- `GET /api/seller/dashboard/orders/:orderId` - Get single order details by ID
- `GET /api/seller/dashboard/notifications?unreadOnly=false` - Get all notifications
- `POST /api/seller/dashboard/notifications/:notifId/read` - Mark specific notification as read
- `POST /api/seller/dashboard/notifications/read-all` - Mark all notifications as read
- `GET /api/seller/dashboard/charts/:chartType?period=daily` - Get chart data (chartType: sales|earnings, period: daily|weekly|monthly)
- `GET /api/seller/dashboard/seller-info` - Get seller account information

## Example Response (Metrics)

```json
{
  "success": true,
  "data": {
    "totalRevenue": "45680.50",
    "revenueGrowth": "+18.8%",
    "revenueGrowthPositive": true,
    "totalOrders": 1287,
    "ordersGrowth": "+12.5%",
    "ordersGrowthPositive": true,
    "activeProducts": 42,
    "totalProducts": 45,
    "productsGrowth": "+3.2%",
    "productsGrowthPositive": true,
    "balance": "12345.75",
    "pendingBalance": "2890.50",
    "balanceGrowth": "+8.7%",
    "balanceGrowthPositive": true,
    "pendingOrders": 3,
    "shippedOrders": 3,
    "deliveredOrders": 6,
    "cancelledOrders": 2,
    "completedOrders": 1156,
    "rating": 4.8
  }
}
```

### Dispute Management Endpoints

- `GET /api/seller/disputes/overview` - Get dispute statistics (total, pending, under review, resolved, rejected, total compensation)
- `GET /api/seller/disputes?search=&type=&status=&page=1&pageSize=10` - Get disputes list with filters and pagination
- `GET /api/seller/disputes/:disputeId` - Get single dispute details by ID
- `POST /api/seller/disputes` - Create new dispute (body: {type, orderId, customer, amount, description, evidence, priority})
- `GET /api/seller/disputes/notifications/list?unreadOnly=false` - Get dispute notifications
- `POST /api/seller/disputes/notifications/:notifId/read` - Mark notification as read

## Example Response (Dispute Overview)

```json
{
  "success": true,
  "data": {
    "total": 8,
    "pending": 2,
    "underReview": 2,
    "resolved": 3,
    "rejected": 1,
    "totalCompensation": "332.98"
  }
}
```

## Example Response (Single Dispute)

```json
{
  "success": true,
  "data": {
    "id": "DSP-001",
    "type": "Return issue",
    "orderId": "ORD-1287",
    "customer": "Ayesha Khan",
    "dateRaised": "2026-03-05",
    "dateOrdered": "2026-03-01",
    "status": "Pending",
    "amount": 89.99,
    "description": "Customer refuses to accept the returned item...",
    "evidence": ["url1", "url2"],
    "reviewer": "Admin - John Smith",
    "timeline": [
      {"action": "Raised", "date": "2026-03-05T10:30:00Z", "by": "Seller"}
    ],
    "adminDecision": null,
    "priority": "Medium"
  }
}
```

### Inventory Management Endpoints

- `GET /api/seller/inventory/overview` - Get inventory statistics (total, in stock, low stock, out of stock, stock value)
- `GET /api/seller/inventory/products?search=&status=&category=&page=1&pageSize=10` - Get products list with filters and pagination
- `GET /api/seller/inventory/products/:productId` - Get single product details with variants
- `POST /api/seller/inventory/products/:productId/adjust` - Adjust stock (body: {actionType: add|reduce|set, quantity, reason, notes})
- `GET /api/seller/inventory/restock-history?page=1&pageSize=10&productId=` - Get restock history with pagination
- `GET /api/seller/inventory/low-stock-alerts` - Get products with low stock or out of stock
- `POST /api/seller/inventory/bulk-restock` - Bulk update stock (body: {data: [{sku, quantity, warehouse, notes}]})
- `PUT /api/seller/inventory/products/:productId/threshold` - Update low stock threshold (body: {threshold})
- `GET /api/seller/inventory/export` - Export inventory as CSV file
- `GET /api/seller/inventory/categories` - Get list of all product categories
- `GET /api/seller/inventory/warehouses` - Get list of all warehouses

## Example Response (Inventory Overview)

```json
{
  "success": true,
  "data": {
    "totalProducts": 12,
    "inStockProducts": 7,
    "lowStockProducts": 3,
    "outOfStockProducts": 2,
    "totalStockValue": "7249.88",
    "alertCount": 5
  }
}
```

## Example Response (Product with Variants)

```json
{
  "success": true,
  "data": {
    "id": 1,
    "product": "Wireless Headphones",
    "sku": "SKU-001",
    "category": "Electronics",
    "stock": 45,
    "threshold": 20,
    "status": "In Stock",
    "warehouse": "Main Warehouse",
    "price": 79.99,
    "variants": [
      {"name": "Black", "sku": "SKU-001-BK", "qty": 25},
      {"name": "White", "sku": "SKU-001-WH", "qty": 20}
    ]
  }
}
```

## Example Response (Stock Adjustment)

```json
{
  "success": true,
  "message": "Stock adjusted successfully",
  "data": {
    "product": {"id": 1, "product": "Wireless Headphones", "stock": 50, "status": "In Stock"},
    "oldStock": 45,
    "newStock": 50,
    "change": 5
  }
}
```

### Order Management Endpoints

- `GET /api/seller/orders/overview` - Get order statistics (pending, confirmed, packed, ready, total orders, revenue, earnings)
- `GET /api/seller/orders?search=&status=&payment=&city=&page=1&pageSize=10` - Get orders list with filters and pagination
- `GET /api/seller/orders/:orderId` - Get single order details
- `PUT /api/seller/orders/:orderId/status` - Update order status (body: {status: Pending|Confirmed|Packed|Ready for Pickup})
- `GET /api/seller/orders/filter/cities` - Get list of all cities
- `GET /api/seller/orders/filter/by-status/:status` - Get orders by specific status
- `GET /api/seller/orders/stats/detailed` - Get detailed order statistics (by status, city, payment type)

## Example Response (Order Overview)

```json
{
  "success": true,
  "data": {
    "pendingCount": 3,
    "confirmedCount": 3,
    "packedCount": 2,
    "readyCount": 2,
    "totalOrders": 10,
    "totalRevenue": "18700.00",
    "totalEarnings": "16830.00",
    "totalCommission": "1870.00"
  }
}
```

## Example Response (Single Order)

```json
{
  "success": true,
  "data": {
    "id": "ORD-001",
    "customer": "Ahmed Hassan",
    "phone": "+92 300 1234567",
    "email": "ahmed@email.com",
    "address": "House #42, Street 5, Phase 2, DHA",
    "city": "Karachi",
    "postal": "74000",
    "paymentType": "COD",
    "paymentStatus": "Pending",
    "status": "Pending",
    "date": "2026-03-06",
    "products": [
      {"name": "Wireless Headphones", "sku": "WH-001", "qty": 1, "price": 2500}
    ],
    "subtotal": 2500,
    "commission": 250,
    "earnings": 2250,
    "courier": null,
    "tracking": null,
    "deliveryStatus": null
  }
}
```

## Example Response (Status Update)

```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": {...order object...},
  "oldStatus": "Pending",
  "newStatus": "Confirmed"
}
```

### Payments Endpoints

- `GET /api/seller/payments/overview` - Get wallet overview and payment totals
- `GET /api/seller/payments/transactions?search=&status=&page=1&pageSize=5` - Get transactions with filtering and pagination
- `GET /api/seller/payments/transactions/:transactionId` - Get single transaction details
- `GET /api/seller/payments/chart?period=monthly&series=totalEarnings` - Get earnings chart data
- `GET /api/seller/payments/bank-accounts?activeOnly=true` - Get seller bank accounts
- `POST /api/seller/payments/withdrawals` - Create withdrawal request (body: `{ amount, bankAccountId }`)
- `GET /api/seller/payments/withdrawals?status=processing` - Get withdrawal request history
- `GET /api/seller/payments/export?search=&status=` - Export transactions CSV

## Example Response (Payments Overview)

```json
{
  "success": true,
  "data": {
    "totalEarnings": 3280,
    "availableBalance": 1820,
    "pendingWithdrawals": 500,
    "totalDeductions": 564,
    "processingFee": 2.5,
    "minimumWithdrawal": 100,
    "transactionCount": 8,
    "processingWithdrawalCount": 1,
    "receivedTotal": "635.49",
    "deductionsTotal": "564.00"
  }
}
```

## Example Response (Create Withdrawal)

```json
{
  "success": true,
  "message": "Withdrawal requested successfully",
  "data": {
    "id": "WD-20260307-002",
    "requestedAt": "2026-03-07T10:00:00.000Z",
    "amount": 150,
    "fee": 2.5,
    "netAmount": 147.5,
    "bankAccountId": "BA-001",
    "bankLabel": "HBL - ****1234",
    "status": "processing"
  }
}
```

### Product Management Endpoints

- `GET /api/seller/products/overview` - Get product summary cards (total, in stock, low stock, out of stock, inventory value)
- `GET /api/seller/products/meta` - Get metadata (categories, statuses, stock filters)
- `GET /api/seller/products?search=&status=&stock=&page=1&pageSize=10` - Get products with search/filter/pagination
- `GET /api/seller/products/:productId` - Get full product detail (variants, images, reviews)
- `POST /api/seller/products` - Create product
- `PUT /api/seller/products/:productId` - Update product
- `DELETE /api/seller/products/:productId` - Delete product
- `POST /api/seller/products/:productId/reviews/:reviewId/reply` - Submit seller reply on review

## Example Response (Products Overview)

```json
{
  "success": true,
  "data": {
    "totalProducts": 8,
    "inStockProducts": 5,
    "lowStockProducts": 2,
    "outOfStockProducts": 2,
    "totalInventoryValue": "14570.88"
  }
}
```

## Example Response (Product List Item)

```json
{
  "id": "prod-001",
  "name": "Wireless Headphones Pro",
  "brand": "Sony",
  "sku": "SKU-001",
  "category": "Electronics",
  "price": 199.99,
  "discountPrice": 149.99,
  "stock": 45,
  "status": "Active",
  "variants": [
    { "id": "var-001", "type": "Color", "value": "Black", "price": null, "stock": 25 }
  ]
}
```

### Refunds and Returns Endpoints

- `GET /api/seller/refunds-returns/overview` - Get refund summary cards (pending, approved, rejected, completed, total refunded)
- `GET /api/seller/refunds-returns/meta` - Get statuses and timeline steps
- `GET /api/seller/refunds-returns/requests?search=&status=&page=1&pageSize=10` - Get return requests with search/filter/pagination
- `GET /api/seller/refunds-returns/requests/:returnId` - Get return request details
- `PUT /api/seller/refunds-returns/requests/:returnId/status` - Update return status with notes
- `POST /api/seller/refunds-returns/requests/:returnId/approve` - Approve a return request
- `POST /api/seller/refunds-returns/requests/:returnId/reject` - Reject a return request
- `POST /api/seller/refunds-returns/requests/:returnId/complete` - Mark return as completed
- `POST /api/seller/refunds-returns/calculate` - Refund calculation helper

## Example Response (Refunds Overview)

```json
{
  "success": true,
  "data": {
    "pendingCount": 3,
    "approvedCount": 2,
    "rejectedCount": 1,
    "completedCount": 2,
    "totalRequests": 8,
    "totalRefunded": "37.98"
  }
}
```

## Example Response (Update Return Status)

```json
{
  "success": true,
  "message": "Return status updated successfully",
  "oldStatus": "Pending",
  "newStatus": "Under Review",
  "data": {
    "id": "RET-001",
    "status": "Under Review",
    "timeline": ["Requested", "Under Review"]
  }
}
```

### Seller Performance Endpoints

- `GET /api/seller/performance/overview` - Get top-level analytics summary
- `GET /api/seller/performance/meta` - Get available periods, categories, and chart series
- `GET /api/seller/performance/metrics` - Get metric cards (daily/weekly/monthly sales, conversion)
- `GET /api/seller/performance/sales?period=monthly` - Get sales chart data by period (daily|weekly|monthly)
- `GET /api/seller/performance/views?limit=5` - Get most viewed products list
- `GET /api/seller/performance/best-selling?limit=5&category=Electronics` - Get best-selling products with revenue share
- `GET /api/seller/performance/refunds` - Get refunds analytics table and aggregate rate
- `GET /api/seller/performance/traffic` - Get traffic source chart/list data

## Example Response (Performance Metrics)

```json
{
  "success": true,
  "data": [
    {
      "label": "Daily Sales",
      "value": 1280,
      "change": 6.5,
      "positive": true,
      "color": "#28a745",
      "icon": "trending_up"
    }
  ]
}
```

## Example Response (Performance Sales)

```json
{
  "success": true,
  "data": {
    "period": "monthly",
    "labels": ["Week1", "Week2", "Week3", "Week4"],
    "data": [7200, 8800, 9400, 9500]
  }
}
```

### Settings Endpoints

**Overview**
- `GET /api/seller/settings` - Get all settings overview (profile, security, store, payment, verification, integrations summary)

**Profile Management**
- `GET /api/seller/settings/profile` - Get profile information
- `PUT /api/seller/settings/profile` - Update profile (sellerName, storeName, email, phone)

**Security Management**
- `GET /api/seller/settings/security` - Get security settings and stats
- `POST /api/seller/settings/security/change-email` - Change email address (requires currentEmail, newEmail)
- `POST /api/seller/settings/security/change-password` - Change password (requires currentPassword, newPassword)
- `POST /api/seller/settings/security/2fa` - Toggle 2FA (requires enabled: boolean)
- `GET /api/seller/settings/security/sessions` - Get all login sessions
- `DELETE /api/seller/settings/security/sessions/:sessionId` - Revoke a specific session

**Store Branding**
- `GET /api/seller/settings/store` - Get store settings (branding & business info)
- `PUT /api/seller/settings/store` - Update store settings (businessName, category, description, address, etc.)
- `POST /api/seller/settings/store/logo` - Upload store logo
- `POST /api/seller/settings/store/banner` - Upload store banner
- `DELETE /api/seller/settings/store/logo` - Remove store logo
- `DELETE /api/seller/settings/store/banner` - Remove store banner
- `GET /api/seller/settings/store/categories` - Get available business categories

**Payment Settings**
- `GET /api/seller/settings/payment` - Get payment settings (bank account, digital wallets)
- `PUT /api/seller/settings/payment` - Update payment settings (bankName, accountNumber, iban, jazzcash, easypaisa)
- `POST /api/seller/settings/payment/verify` - Initiate payment account verification

**Notification Preferences**
- `GET /api/seller/settings/notifications` - Get notification preferences
- `PUT /api/seller/settings/notifications` - Update notification preferences (orderAlerts, paymentAlerts, chatNotifications, promotions, reviews)

**Privacy Settings**
- `GET /api/seller/settings/privacy` - Get privacy settings
- `PUT /api/seller/settings/privacy` - Update privacy settings (showEmailPublicly, showPhonePublicly, allowMessages)
- `POST /api/seller/settings/privacy/download-data` - Request data export
- `POST /api/seller/settings/privacy/delete-account` - Request account deletion (requires reason)

**Verification (KYC)**
- `GET /api/seller/settings/verification` - Get verification status and document upload status
- `POST /api/seller/settings/verification/upload` - Upload verification document (requires docType: 'cnicFront'|'cnicBack'|'selfie'|'bankStatement', fileData)
- `POST /api/seller/settings/verification/submit` - Submit documents for verification review
- `DELETE /api/seller/settings/verification/documents` - Clear all uploaded documents

**Integrations**
- `GET /api/seller/settings/integrations` - Get all connected integrations (google, facebook, shopify)
- `POST /api/seller/settings/integrations/:platform/connect` - Connect integration (platform: google|facebook|shopify)
- `POST /api/seller/settings/integrations/:platform/disconnect` - Disconnect integration

## Example Response (Settings Overview)

```json
{
  "success": true,
  "data": {
    "profile": {
      "sellerName": "John's Electronics Store",
      "email": "john@store.com",
      "phone": "+92 300 1234567"
    },
    "security": {
      "twoFactorEnabled": false,
      "activeSessions": 1
    },
    "store": {
      "businessName": "John's Electronics Store",
      "category": "Electronics & Gadgets",
      "hasLogo": false,
      "hasBanner": false
    },
    "payment": {
      "verified": true,
      "bankAccount": "Connected"
    },
    "verification": {
      "status": "pending",
      "completeness": 100
    },
    "integrations": {
      "connected": 1,
      "total": 3
    }
  }
}
```

## Example Response (Profile)

```json
{
  "success": true,
  "data": {
    "sellerId": "S123",
    "sellerName": "John's Electronics Store",
    "storeName": "John's Electronics Hub",
    "email": "john@store.com",
    "phone": "+92 300 1234567",
    "updatedAt": "2025-12-05T00:00:00.000Z"
  }
}
```

## Example Response (Security Login Sessions)

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "id": "sess1",
      "date": "2025-12-07",
      "time": "10:30 AM",
      "device": "Chrome - Windows",
      "location": "Karachi, Pakistan",
      "ipAddress": "192.168.1.100",
      "status": "active"
    }
  ]
}
```

## Example Response (Store Settings)

```json
{
  "success": true,
  "data": {
    "logo": null,
    "banner": null,
    "businessName": "John's Electronics Store",
    "category": "Electronics & Gadgets",
    "description": "Premium electronics and gadgets with authentic warranty",
    "address": "Warehouse Street, Karachi, Pakistan",
    "city": "Karachi",
    "state": "Sindh",
    "postalCode": "75500",
    "country": "Pakistan",
    "storePhone": "+92 300 1234567",
    "storeEmail": "store@johns.com"
  }
}
```

## Example Response (Verification Status)

```json
{
  "success": true,
  "data": {
    "status": "pending",
    "submittedAt": "2025-12-01T00:00:00.000Z",
    "expectedBy": "2025-12-04T00:00:00.000Z",
    "verifiedAt": null,
    "rejectionReason": null,
    "documentsUploaded": {
      "cnicFront": false,
      "cnicBack": false,
      "selfie": false,
      "bankStatement": false
    }
  }
}
```

## Frontend Integration Hint

In seller JavaScript files (`Front_End/Seller/js/`), replace local dummy arrays with API calls like:

```js
// Dashboard
const response = await fetch('http://localhost:5000/api/seller/dashboard/metrics');
const { data } = await response.json();

// Disputes
const response = await fetch('http://localhost:5000/api/seller/disputes/overview');
const { data } = await response.json();

// Inventory
const response = await fetch('http://localhost:5000/api/seller/inventory/products?page=1&pageSize=10');
const { data, pagination } = await response.json();

// Orders
const response = await fetch('http://localhost:5000/api/seller/orders?page=1&pageSize=10');
const { data, pagination } = await response.json();

// Payments
const response = await fetch('http://localhost:5000/api/seller/payments/transactions?page=1&pageSize=5');
const { data, pagination } = await response.json();

// Product Management
const response = await fetch('http://localhost:5000/api/seller/products?search=&status=&stock=&page=1&pageSize=10');
const { data, pagination } = await response.json();

// Refunds and Returns
const response = await fetch('http://localhost:5000/api/seller/refunds-returns/requests?search=&status=&page=1&pageSize=10');
const { data, pagination } = await response.json();

// Seller Performance
const response = await fetch('http://localhost:5000/api/seller/performance/metrics');
const { data } = await response.json();

// Settings
const response = await fetch('http://localhost:5000/api/seller/settings/profile');
const { data } = await response.json();
```
