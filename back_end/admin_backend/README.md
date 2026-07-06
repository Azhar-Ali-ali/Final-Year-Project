# Admin Backend (Lumina)

Backend APIs for `Front_End/Admin/pages/admin_dashboard.html`.

## Setup

```bash
cd back_end/admin_backend
npm install
npm run dev
```

Server starts at `http://localhost:5000` by default.

## Endpoints

- `GET /api/health`
- `GET /api/admin/dashboard/summary`
- `GET /api/admin/dashboard/charts?period=daily|weekly|monthly`
- `GET /api/admin/dashboard/orders?status=pending&search=ayesha&limit=5`
- `GET /api/admin/dashboard/notifications`
- `GET /api/admin/dashboard/notifications?unread=true`

### CMS Endpoints (for `Front_End/Admin/pages/cms.html`)

- `GET /api/admin/cms/overview`
- `GET /api/admin/cms/banners?search=&status=&location=`
- `POST /api/admin/cms/banners`
- `PUT /api/admin/cms/banners/:id`
- `DELETE /api/admin/cms/banners/:id`
- `GET /api/admin/cms/landing-pages?status=published`
- `GET /api/admin/cms/blog-posts?status=published&category=news`
- `GET /api/admin/cms/faqs?category=shipping&featured=true`
- `GET /api/admin/cms/legal-pages`
- `GET /api/admin/cms/media?type=image`
- `GET /api/admin/cms/announcements?status=active`
- `GET /api/admin/cms/audit-log?limit=20`

### Dispute & Support Endpoints (for `Front_End/Admin/pages/Dispute_Support_System.html`)

- `GET /api/admin/disputes/overview`
- `GET /api/admin/disputes/disputes?search=&status=&type=&priority=`
- `GET /api/admin/disputes/disputes/:id`
- `POST /api/admin/disputes/disputes/:id/resolve`
- `GET /api/admin/disputes/chats?search=&status=&flags=`
- `POST /api/admin/disputes/chats/:orderId/join`
- `GET /api/admin/disputes/analytics`
- `GET /api/admin/disputes/enforcement?search=&type=&status=`
- `POST /api/admin/disputes/enforcement/fine`
- `POST /api/admin/disputes/enforcement/deactivate-seller`
- `POST /api/admin/disputes/enforcement/block-buyer`
- `GET /api/admin/disputes/audit-log?limit=50`

### Logistics & Courier Endpoints (for `Front_End/Admin/pages/Logistics_Courier_Management.html`)

- `GET /api/admin/logistics/overview`
- `GET /api/admin/logistics/couriers?search=`
- `GET /api/admin/logistics/couriers/active`
- `POST /api/admin/logistics/couriers`
- `PUT /api/admin/logistics/couriers/:id`
- `PATCH /api/admin/logistics/couriers/:id/toggle`
- `DELETE /api/admin/logistics/couriers/:id`
- `GET /api/admin/logistics/orders/ready`
- `POST /api/admin/logistics/shipments/create`
- `GET /api/admin/logistics/shipments`
- `PATCH /api/admin/logistics/shipments/:id/status`
- `GET /api/admin/logistics/shipping-rules`
- `PUT /api/admin/logistics/shipping-rules`
- `GET /api/admin/logistics/cod/delivered`
- `GET /api/admin/logistics/cod/settlements`
- `POST /api/admin/logistics/cod/settle-seller`
- `POST /api/admin/logistics/sync/webhooks`

### Order Management Endpoints (for `Front_End/Admin/pages/Order_Management.html`)

- `GET /api/admin/orders/meta`
- `GET /api/admin/orders/stats`
- `GET /api/admin/orders/orders?search=&startDate=&endDate=&seller=&status=&payment=&courier=&city=&highValue=high&codOnly=cod&returnedOnly=returned`
- `GET /api/admin/orders/orders/:orderId`
- `PATCH /api/admin/orders/orders/:orderId/status`
- `PATCH /api/admin/orders/orders/:orderId/courier`
- `PATCH /api/admin/orders/orders/:orderId/shipment`
- `PATCH /api/admin/orders/orders/:orderId/address`
- `POST /api/admin/orders/orders/:orderId/notes`
- `POST /api/admin/orders/orders/:orderId/actions/cod-received`
- `POST /api/admin/orders/orders/:orderId/actions/settlement`
- `POST /api/admin/orders/orders/:orderId/actions/refund`
- `POST /api/admin/orders/orders/:orderId/actions/reverse-earnings`
- `POST /api/admin/orders/orders/:orderId/actions/adjust-inventory`

### Payment & Payout Endpoints (for `Front_End/Admin/pages/Payment_Payout_Management.html`)

- `GET /api/admin/payments/overview`
- `GET /api/admin/payments/online-payments?search=&paymentStatus=&escrowStatus=`
- `GET /api/admin/payments/online-payments/:id`
- `POST /api/admin/payments/online-payments/:id/refund`
- `POST /api/admin/payments/online-payments/:id/dispute`
- `GET /api/admin/payments/cod-tracking?search=&deliveryStatus=&depositStatus=`
- `POST /api/admin/payments/cod-tracking/:id/confirm-deposit`
- `POST /api/admin/payments/cod-tracking/:id/flag-mismatch`
- `GET /api/admin/payments/sellers?search=&kycStatus=&bankStatus=&riskStatus=`
- `POST /api/admin/payments/sellers/:id/payout/approve`
- `POST /api/admin/payments/sellers/:id/payout/reject`
- `POST /api/admin/payments/sellers/:id/bank/approve`
- `POST /api/admin/payments/sellers/:id/bank/reject`
- `POST /api/admin/payments/sellers/:id/kyc/approve`
- `POST /api/admin/payments/sellers/:id/kyc/reject`
- `POST /api/admin/payments/sellers/:id/kyc/request-resubmission`
- `GET /api/admin/payments/failed-payments?search=&failureType=`
- `POST /api/admin/payments/failed-payments/:id/retry`
- `POST /api/admin/payments/failed-payments/:id/mark-fraud`
- `GET /api/admin/payments/audit-log?limit=100`

### Product Catalog Endpoints (for `Front_End/Admin/pages/Product_Catalog_Management.html`)

- `GET /api/admin/catalog/overview`
- `GET /api/admin/catalog/meta`
- `GET /api/admin/catalog/products?search=&category=&brand=&status=&stock=&tab=&sortKey=&sortDir=&page=&pageSize=`
- `GET /api/admin/catalog/products/export?search=&category=&brand=&status=&stock=&tab=&sortKey=&sortDir=`
- `GET /api/admin/catalog/products/:id`
- `POST /api/admin/catalog/products`
- `PUT /api/admin/catalog/products/:id`
- `POST /api/admin/catalog/products/:id/approve`
- `POST /api/admin/catalog/products/:id/reject`
- `POST /api/admin/catalog/products/:id/disable`
- `POST /api/admin/catalog/products/:id/toggle-visibility`
- `DELETE /api/admin/catalog/products/:id`
- `POST /api/admin/catalog/products/bulk`
- `GET /api/admin/catalog/categories`
- `POST /api/admin/catalog/categories`
- `PUT /api/admin/catalog/categories/:id`
- `DELETE /api/admin/catalog/categories/:id`
- `GET /api/admin/catalog/brands?search=&status=`
- `POST /api/admin/catalog/brands`
- `POST /api/admin/catalog/brands/:id/approve`
- `PUT /api/admin/catalog/brands/:id`
- `DELETE /api/admin/catalog/brands/:id`
- `GET /api/admin/catalog/attributes?active=true|false`
- `POST /api/admin/catalog/attributes`
- `PUT /api/admin/catalog/attributes/:id`
- `DELETE /api/admin/catalog/attributes/:id`
- `GET /api/admin/catalog/analytics/top-products?limit=10`
- `GET /api/admin/catalog/analytics/stock-alerts`
- `GET /api/admin/catalog/audit-log?limit=100`

### Reports & Analytics Endpoints (for `Front_End/Admin/pages/Reports_Analytics.html`)

- `GET /api/admin/reports/overview?period=7d&region=` - KPI dashboard metrics
- `GET /api/admin/reports/revenue?period=30d&region=&category=` - Revenue analysis
- `GET /api/admin/reports/revenue/trends?granularity=daily&period=30d` - Revenue time series
- `GET /api/admin/reports/sales?startDate=&endDate=&period=30d&region=&category=&page=1&pageSize=20` - Sales report
- `GET /api/admin/reports/sales/export?format=csv&period=30d` - Export sales data
- `GET /api/admin/reports/orders?status=&payment=&region=&period=7d&page=1&pageSize=20` - Orders report
- `GET /api/admin/reports/users/growth?period=7d` - User growth metrics
- `GET /api/admin/reports/users/distribution` - User segmentation
- `GET /api/admin/reports/products/top?limit=20&sortBy=revenue&category=` - Top performing products
- `GET /api/admin/reports/products/category-analysis` - Category performance
- `GET /api/admin/reports/sellers/leaderboard?sortBy=revenue&limit=10` - Seller rankings
- `GET /api/admin/reports/sellers/risk-assessment` - Seller risk analysis
- `GET /api/admin/reports/risk/refunds?status=&period=30d` - Refund analytics
- `GET /api/admin/reports/risk/disputes?status=` - Dispute metrics
- `GET /api/admin/reports/risk/payment-methods` - COD vs Prepaid comparison
- `GET /api/admin/reports/insights` - AI-generated business insights
- `GET /api/admin/reports/custom` - List saved custom reports
- `POST /api/admin/reports/custom` - Create custom report
- `POST /api/admin/reports/custom/:id/run` - Execute custom report
- `PUT /api/admin/reports/custom/:id` - Update custom report
- `DELETE /api/admin/reports/custom/:id` - Delete custom report
- `GET /api/admin/reports/schedules` - List scheduled reports
- `POST /api/admin/reports/schedules` - Create report schedule
- `PUT /api/admin/reports/schedules/:id` - Update schedule
- `DELETE /api/admin/reports/schedules/:id` - Delete schedule
- `POST /api/admin/reports/export` - Export any report type
- `GET /api/admin/reports/audit-log?limit=50&page=1` - Audit log

### Reviews & Ratings Endpoints (for `Front_End/Admin/pages/Reviews_Ratings_Management.html`)

- `GET /api/admin/reviews/overview` - Overview stats (total, pending, approved, flagged, suspicious, etc.)
- `GET /api/admin/reviews/reviews?search=&status=&rating=&verified=&riskLevel=&reportCount=&sortBy=submissionDate&sortDir=desc&page=1&pageSize=20` - Moderation queue with filters
- `GET /api/admin/reviews/reviews/:id` - Get single review with buyer/seller/product profiles
- `POST /api/admin/reviews/reviews/:id/approve` - Approve review and publish
- `POST /api/admin/reviews/reviews/:id/deny` - Deny review (body: reason, notes, notifyBuyer)
- `POST /api/admin/reviews/reviews/:id/flag` - Flag review for investigation
- `DELETE /api/admin/reviews/reviews/:id` - Delete review permanently (body: reason)
- `POST /api/admin/reviews/reviews/bulk/approve` - Bulk approve reviews (body: reviewIds[])
- `POST /api/admin/reviews/reviews/bulk/deny` - Bulk deny reviews (body: reviewIds[], reason)
- `POST /api/admin/reviews/reviews/:id/seller-response` - Add seller response (body: response, sellerId)
- `GET /api/admin/reviews/reported?search=&reason=&minReports=1&page=1&pageSize=20` - Reported reviews
- `POST /api/admin/reviews/reviews/:id/clear-reports` - Clear reports on a review
- `GET /api/admin/reviews/suspicious?search=&riskLevel=&type=&page=1&pageSize=20` - Suspicious reviews with fake detection
- `POST /api/admin/reviews/users/:buyerId/shadowban` - Shadowban user (body: reason)
- `DELETE /api/admin/reviews/users/:buyerId/shadowban` - Remove shadowban
- `GET /api/admin/reviews/shadowbanned-users` - List shadowbanned users
- `GET /api/admin/reviews/analytics/rating-distribution` - Rating distribution (1-5 stars)
- `GET /api/admin/reviews/analytics/sentiment` - Sentiment analysis (positive/neutral/negative)
- `GET /api/admin/reviews/analytics/buyers` - Buyer analysis (top reviewers, trust scores)
- `GET /api/admin/reviews/analytics/sellers` - Seller analysis (ratings breakdown, sentiment)
- `GET /api/admin/reviews/analytics/products` - Product analysis (ratings, sentiment by product)
- `GET /api/admin/reviews/settings` - Get moderation settings
- `PUT /api/admin/reviews/settings` - Update moderation settings (body: requireApprovalBeforePublish, autoDenyOneStar, etc.)
- `GET /api/admin/reviews/audit-log?limit=50&page=1` - Audit log

### Seller Management Endpoints (for `Front_End/Admin/pages/seller_management.html`)

- `GET /api/admin/sellers/overview` - Overview stats (total, approved, pending, active, frozen, suspended, flagged, revenue, payouts, etc.)
- `GET /api/admin/sellers/sellers?search=&kycStatus=&status=&riskLevel=&subscription=&payoutStatus=&tab=all&sortBy=registeredDate&sortDir=desc&page=1&pageSize=10` - Get sellers with filters and pagination
- `GET /api/admin/sellers/sellers/:id` - Get single seller details with performance score, payouts, and subscription plan
- `POST /api/admin/sellers/sellers/:id/kyc/approve` - Approve KYC (body: admin, notes, activateAccount)
- `POST /api/admin/sellers/sellers/:id/kyc/reject` - Reject KYC (body: admin, reason, notes)
- `POST /api/admin/sellers/sellers/:id/strikes/issue` - Issue strike to seller (body: admin, reason, notes)
- `POST /api/admin/sellers/sellers/:id/strikes/clear` - Clear all strikes (body: admin, notes)
- `POST /api/admin/sellers/sellers/:id/status` - Update seller status to active/frozen/suspended (body: admin, status, reason, notes)
- `POST /api/admin/sellers/sellers/:id/subscription` - Update subscription plan (body: admin, subscription, notes)
- `POST /api/admin/sellers/sellers/:id/payout/process` - Process payout (body: admin, amount, method)
- `PUT /api/admin/sellers/sellers/:id` - Update seller information (body: admin, businessName, owner, email, phone, businessAddress, taxId, riskLevel)
- `POST /api/admin/sellers/sellers/:id/notes` - Update admin notes (body: admin, notes)
- `POST /api/admin/sellers/sellers/bulk/approve` - Bulk approve sellers KYC (body: sellerIds[], admin)
- `POST /api/admin/sellers/sellers/bulk/freeze` - Bulk freeze seller accounts (body: sellerIds[], admin, reason)
- `POST /api/admin/sellers/sellers/bulk/terminate` - Bulk terminate/suspend sellers (body: sellerIds[], admin, reason)
- `GET /api/admin/sellers/subscription-plans` - Get all subscription plans
- `GET /api/admin/sellers/payouts?sellerId=&status=&page=1&pageSize=20` - Get payout history with filters
- `GET /api/admin/sellers/audit-log?sellerId=&action=&admin=&limit=50` - Get audit log
- `GET /api/admin/sellers/analytics/top-performers?metric=revenue&limit=10` - Top performing sellers
- `GET /api/admin/sellers/analytics/risk-assessment` - Risk assessment (high/medium/low distribution, sellers with strikes)
- `GET /api/admin/sellers/export/csv?search=&kycStatus=&status=&riskLevel=` - Export sellers to CSV
### User Management Endpoints (for `Front_End/Admin/pages/user_management.html`)

- `GET /api/admin/users/overview` - Overview stats (total, customers, sellers, active, suspended, banned, KYC stats, orders, value, refunds, commission)
- `GET /api/admin/users/users?search=&role=&status=&kyc=&risk=&tab=all&sortBy=registered&sortDir=desc&page=1&pageSize=10` - Get users with filters and pagination
- `GET /api/admin/users/users/:id` - Get single user details
- `POST /api/admin/users/users/:id/status` - Update user status to active/suspended/banned (body: admin, status, reason, notes)
- `POST /api/admin/users/users/:id/role` - Update user role (body: admin, role, notes)
- `POST /api/admin/users/users/:id/reset-password` - Reset user password (body: admin, sendEmail)
- `POST /api/admin/users/users/:id/kyc/approve` - Approve KYC for seller (body: admin, notes)
- `POST /api/admin/users/users/:id/kyc/reject` - Reject KYC for seller (body: admin, reason, notes)
- `PUT /api/admin/users/users/:id` - Update user information (body: admin, name, email, phone, risk)
- `POST /api/admin/users/users/:id/notes` - Update admin notes (body: admin, notes)
- `PUT /api/admin/users/users/:id/preferences` - Update user preferences (body: newsletter, smsNotifications, emailNotifications)
- `POST /api/admin/users/users/:id/two-factor` - Toggle two-factor authentication (body: admin, enabled)
- `POST /api/admin/users/users/:id/verify-email` - Verify user email (body: admin)
- `POST /api/admin/users/users/:id/verify-phone` - Verify user phone (body: admin)
- `POST /api/admin/users/users/bulk/activate` - Bulk activate users (body: userIds[], admin)
- `POST /api/admin/users/users/bulk/suspend` - Bulk suspend users (body: userIds[], admin, reason)
- `POST /api/admin/users/users/bulk/ban` - Bulk ban users (body: userIds[], admin, reason)
- `GET /api/admin/users/users/:id/activity?limit=50` - Get user activity log
- `GET /api/admin/users/audit-log?userId=&action=&admin=&limit=50` - Get audit log
- `GET /api/admin/users/analytics/growth?period=30d` - User growth analytics
- `GET /api/admin/users/analytics/active-users?period=7d` - Active users analytics
- `GET /api/admin/users/analytics/top-customers?limit=10` - Top customers by value
- `GET /api/admin/users/analytics/top-sellers?limit=10` - Top sellers by sales
- `GET /api/admin/users/roles` - Get all user roles
- `GET /api/admin/users/export/csv?search=&role=&status=&kyc=&risk=` - Export users to CSV

### Admin Login/Auth Endpoints (for `Front_End/Admin/pages/admin_login.html`)

- `POST /api/admin/auth/login` - Admin login (body: email, password, rememberMe)
- `GET /api/admin/auth/session` - Validate current session (Bearer token or `?token=`)
- `POST /api/admin/auth/logout` - Logout and revoke session (body: token or Bearer token)
- `POST /api/admin/auth/forgot-password` - Request password reset (body: email)
- `POST /api/admin/auth/reset-password` - Reset password using token (body: token, newPassword)
- `POST /api/admin/auth/login/google` - Mock Google login for UI social button
- `GET /api/admin/auth/overview` - Auth module overview (admins, active sessions, recent logins)
- `GET /api/admin/auth/audit-log?adminId=&action=&limit=50` - Auth audit log


## Example Response (Summary)

```json
{
  "success": true,
  "data": [
    {
      "title": "Total Users",
      "icon": "group",
      "value": 12450,
      "growth": "+12%",
      "compare": "vs last week",
      "positive": true
    }
  ]
}
```

## Frontend Integration Hint

In `Front_End/Admin/js/dashboard.js`, replace local dummy arrays with API calls like:

```js
const response = await fetch('http://localhost:5000/api/admin/dashboard/summary');
const { data } = await response.json();
```
