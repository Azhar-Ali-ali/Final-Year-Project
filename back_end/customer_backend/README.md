# Customer Backend - LUMINA Marketplace

Customer-facing backend API for product browsing, filtering, search, and product details.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server runs on `http://localhost:5000`

## API Endpoints

### Products

#### 1. Get All Products (with filtering, sorting, pagination)
**GET** `/api/products`

Query Parameters:
- `search` (string): Search products by name, description, brand
- `brands` (string): Comma-separated brand names (e.g., "e.l.f.,L'Oreal Paris")
- `categories` (string): Comma-separated categories
- `minRating` (number): Minimum product rating (0-5)
- `minPrice` (number): Minimum price
- `maxPrice` (number): Maximum price
- `forms` (string): Comma-separated forms (e.g., "Liquid,Cream,Powder")
- `finishes` (string): Comma-separated finishes (e.g., "Matte,Natural,Dewy")
- `skinTones` (string): Comma-separated skin tones (e.g., "Light,Medium,Deep")
- `skinTypes` (string): Comma-separated skin types (e.g., "Dry,Oily,Normal")
- `inStock` (boolean): Filter by stock availability
- `limitedDeal` (boolean): Filter limited time deals
- `sponsored` (boolean): Filter sponsored products
- `sortBy` (string): Sort order - `relevance`, `price-asc`, `price-desc`, `rating`, `newest`, `popularity`
- `page` (number): Page number (default: 1)
- `limit` (number): Products per page (default: 24)

Example Request:
```javascript
fetch('http://localhost:5000/api/products?brands=e.l.f.,NYX PROFESSIONAL MAKEUP&minRating=4&sortBy=price-asc&page=1&limit=12')
  .then(res => res.json())
  .then(data => console.log(data));
```

Example Response:
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": 1,
        "name": "Original Beauty Makeup Sponge For Foundation",
        "brand": "e.l.f.",
        "category": "Makeup Brushes & Tools",
        "price": 5.82,
        "originalPrice": 7.29,
        "discount": 20,
        "rating": 4.8,
        "reviewCount": 28781,
        "image": "https://...",
        "inStock": true,
        "sponsored": true,
        "limitedDeal": true,
        "freeDeliveryDate": "2026-03-04"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalProducts": 72,
      "productsPerPage": 24,
      "hasNextPage": true,
      "hasPrevPage": false
    },
    "appliedFilters": {
      "brands": ["e.l.f.", "NYX PROFESSIONAL MAKEUP"],
      "minRating": 4,
      "sortBy": "price-asc"
    }
  }
}
```

#### 2. Get Filter Options
**GET** `/api/products/filters`

Returns available filter values for all filter types.

Example Response:
```json
{
  "success": true,
  "data": {
    "brands": ["e.l.f.", "L'Oreal Paris", "NYX PROFESSIONAL MAKEUP", "MAYBELLINE", "..."],
    "categories": ["Makeup", "Makeup Brushes & Tools", "Beauty & Personal Care", "..."],
    "forms": ["Cream", "Liquid", "Powder", "Pencil", "Sponge", "Stick"],
    "finishes": ["Natural", "Matte", "Dewy", "Satin", "Shimmer"],
    "skinTones": ["All", "Light", "Medium", "Deep"],
    "skinTypes": ["All", "Normal", "Dry", "Oily", "Combination", "Sensitive"],
    "ratings": [4, 3, 2, 1],
    "deals": ["All Discounts", "Today's Deals", "Limited Time Deals"],
    "priceRanges": [
      {"label": "Under $5", "min": 0, "max": 5},
      {"label": "$5 to $10", "min": 5, "max": 10}
    ]
  }
}
```

#### 3. Get Trending Products
**GET** `/api/products/trending?limit=10`

Returns popular/trending products based on views.

#### 4. Get Deals of the Day
**GET** `/api/products/deals?limit=12`

Returns products with active deals and discounts.

#### 5. Get Sponsored Products
**GET** `/api/products/sponsored?limit=5`

Returns sponsored products.

#### 6. Search Products
**GET** `/api/products/search?q=lipstick&limit=10`

Search products by keyword. Searches in product name, description, brand, and tags.

Example Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 9,
      "name": "L'Oreal Paris Colour Riche Original Satin Lipstick",
      "price": 9.48,
      "rating": 4.7,
      "reviewCount": 23541,
      "image": "https://..."
    }
  ],
  "query": "lipstick"
}
```

#### 7. Get Products by Category
**GET** `/api/products/category/Makeup?limit=24`

Returns products in a specific category.

#### 8. Get Products by Brand
**GET** `/api/products/brand/e.l.f.?limit=24`

Returns products from a specific brand.

#### 9. Get Product Details
**GET** `/api/products/:id`

Returns detailed information for a specific product.

Example Request:
```javascript
fetch('http://localhost:5000/api/products/1')
  .then(res => res.json())
  .then(data => console.log(data));
```

Example Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Original Beauty Makeup Sponge For Foundation",
    "description": "Original Beauty Makeup Sponge For Foundation, 2 Ct | Blender For Buildable Coverage",
    "brand": "e.l.f.",
    "category": "Makeup Brushes & Tools",
    "subcategory": "Makeup Sponges",
    "price": 5.82,
    "originalPrice": 7.29,
    "discount": 20,
    "rating": 4.8,
    "reviewCount": 28781,
    "image": "https://...",
    "inStock": true,
    "quantity": 150,
    "sponsored": true,
    "limitedDeal": true,
    "couponDiscount": 5,
    "freeDeliveryDate": "2026-03-04",
    "freeDeliveryMinOrder": 0,
    "form": "Sponge",
    "finish": "Natural",
    "skinTone": ["All"],
    "skinType": ["All", "Normal", "Dry", "Oily"],
    "tags": ["best-seller", "new-arrival"],
    "sellerId": 1,
    "sellerName": "Beauty Direct Store",
    "views": 15420
  }
}
```

#### 10. Get Related Products
**GET** `/api/products/:id/related?limit=6`

Returns related products based on category and brand.

---
### Homepage

#### 1. Get Complete Homepage Data
**GET** `/api/homepage?userId=user_1&sectionLimit=8&flashDealLimit=6`

Returns a complete payload for `homepage.html`, including:
- Top summary (cart count, cart total)
- Hero slider data
- Category tile rows
- Product strip rows (featured, trending, deals, top rated)
- Flash deal block with timer range
- Testimonials and trust highlights

Example Request:
```javascript
fetch('http://localhost:5000/api/homepage?userId=user_1&sectionLimit=8')
  .then(res => res.json())
  .then(data => console.log(data));
```

#### 2. Get Homepage Summary
**GET** `/api/homepage/summary?userId=user_1`

Returns compact header-level info such as cart badge count and cart total.

#### 3. Get Hero Slides
**GET** `/api/homepage/hero`

Returns hero slider cards (title, subtitle, CTA, image).

#### 4. Get Category Rows
**GET** `/api/homepage/categories`

Returns category tile rows used in homepage category sections.

#### 5. Get Homepage Product Rows
**GET** `/api/homepage/product-rows?limit=8`

Returns horizontal product rows for featured and trending-style sections.

#### 6. Get Flash Deals
**GET** `/api/homepage/flash-deals?limit=6`

Returns flash deal products plus `startsAt` and `endsAt` timestamps for timer logic.

#### 7. Get Testimonials
**GET** `/api/homepage/testimonials`

Returns customer review cards.

#### 8. Get Trust Highlights
**GET** `/api/homepage/trust-highlights`

Returns trust badges such as secure payment and fast delivery.

---
### Authentication

#### 1. Customer Registration
**POST** `/api/auth/register/customer`

Request Body:
```json
{
  "fullName": "Ahmed Khan",
  "emailPhone": "ahmed@example.com",
  "password": "Password123",
  "confirmPassword": "Password123"
}
```

Creates a customer account and returns a session token.

#### 2. Seller Registration
**POST** `/api/auth/register/seller`

Request Body:
```json
{
  "fullName": "Hira Malik",
  "email": "seller@example.com",
  "phone": "03111234567",
  "password": "Password123",
  "confirmPassword": "Password123",
  "storeName": "Hira Beauty Hub",
  "storeDescription": "At least 50 characters description...",
  "storeCategory": "beauty",
  "city": "Lahore",
  "address": "Shop 21, Main Boulevard",
  "postalCode": "54000",
  "bankName": "HBL",
  "accountTitle": "Hira Malik",
  "accountNumber": "0012345678901",
  "iban": "PK36HABB0000000012345678901",
  "agreeTerms": true,
  "agreePrivacy": true,
  "agreeCommission": true
}
```

Creates a seller account in `pending` verification state and returns a session token.

#### 3. Login
**POST** `/api/auth/login`

Request Body:
```json
{
  "identifier": "ahmed@example.com",
  "password": "Password123",
  "role": "customer"
}
```

`identifier` supports email or Pakistani phone (`03XXXXXXXXX`).

#### 4. Current User Session
**GET** `/api/auth/me`

Send token as:
- `Authorization: Bearer <token>`
- or `x-session-token` header
- or query/body `token`

Returns current authenticated user details.

#### 5. Logout
**POST** `/api/auth/logout`

Removes current session token.

#### 6. Identifier Availability
**GET** `/api/auth/check-availability?identifier=ahmed@example.com`

Checks if email/phone is available for registration.

#### 7. Demo Accounts
**GET** `/api/auth/demo-accounts`

Returns seeded test accounts for local development.

---
### Product Details

#### 1. Get Product Details Page Payload
**GET** `/api/product-details/:productId?city=Lahore`

Returns aggregated data for `products_details.html`, including:
- Breadcrumb and core product info
- Gallery images
- Color and pack variants
- Seller info
- Delivery/trust blocks
- Description/specification/review summary tab data

#### 2. Get Specifications
**GET** `/api/product-details/:productId/specifications`

Returns product specification key/value pairs.

#### 3. Get Reviews
**GET** `/api/product-details/:productId/reviews?page=1&limit=10&rating=5&sortBy=newest`

Query parameters:
- `page` (default 1)
- `limit` (default 10)
- `rating` (optional 1-5)
- `sortBy` (`newest`, `helpful`, `rating-desc`, `rating-asc`)

Includes rating summary + paginated review list.

#### 4. Submit Review
**POST** `/api/product-details/:productId/reviews`

Request Body:
```json
{
  "userName": "Sarah Martinez",
  "rating": 5,
  "comment": "Amazing product quality and blending performance.",
  "verifiedPurchase": true
}
```

#### 5. Get Related Products
**GET** `/api/product-details/:productId/related?limit=8`

Returns related products for recommendation cards.

---
### Checkout & Orders

#### 1. Get Checkout Summary
**GET** `/api/checkout/summary?userId=user_1`

Get checkout page data including cart, addresses, and payment methods.

Response:
```json
{
  "success": true,
  "data": {
    "cart": {
      "items": [...],
      "totals": {...}
    },
    "defaultAddress": {
      "id": 1,
      "name": "Ahmed Khan",
      "phone": "+92 300 1234567",
      "street": "House #123, Street 5",
      "city": "Islamabad",
      "postalCode": "44000",
      "isDefault": true
    },
    "availableAddresses": [...],
    "paymentMethods": [
      {"id": "cod", "name": "Cash on Delivery", "available": true},
      {"id": "card", "name": "Credit/Debit Card", "available": true}
    ]
  }
}
```

#### 2. Get Addresses
**GET** `/api/checkout/addresses?userId=user_1`

Get all delivery addresses for a user.

#### 3. Add New Address
**POST** `/api/checkout/addresses?userId=user_1`

Request Body:
```json
{
  "name": "Ahmed Khan",
  "phone": "+92 300 1234567",
  "street": "House #123, Street 5",
  "city": "Islamabad",
  "postalCode": "44000",
  "type": "home",
  "isDefault": false
}
```

#### 4. Update Address
**PUT** `/api/checkout/addresses/:id?userId=user_1`

#### 5. Delete Address
**DELETE** `/api/checkout/addresses/:id?userId=user_1`

#### 6. Set Default Address
**PUT** `/api/checkout/addresses/:id/default?userId=user_1`

#### 7. Validate Payment Method
**POST** `/api/checkout/validate-payment`

Validate payment method details before placing order.

#### 8. Place Order
**POST** `/api/checkout/place-order?userId=user_1`

Request Body:
```json
{
  "addressId": 1,
  "paymentMethod": "cod",
  "paymentDetails": {},
  "orderNotes": "Please call before delivery"
}
```

Response:
```json
{
  "success": true,
  "message": "Order placed successfully",
  "data": {
    "id": 1001,
    "orderId": "LUM12345678",
    "status": "pending",
    "total": 7596.00
  }
}
```

#### 9. Get Order Details
**GET** `/api/checkout/orders/:orderId?userId=user_1`

#### 10. Get User Orders
**GET** `/api/checkout/orders?userId=user_1&status=pending&limit=10`

---


### Shopping Cart

#### 1. Get Cart
**GET** `/api/cart?userId=user_1`

Get user's shopping cart with items grouped by seller and calculated totals.

Example Response:
```json
{
  "success": true,
  "data": {
    "userId": "user_1",
    "items": [...],
    "itemsBySeller": [
      {
        "sellerId": 1,
        "sellerName": "BeautyHub Store",
        "sellerAvatar": "B",
        "items": [
          {
            "id": 1,
            "productId": 1,
            "productName": "Premium Makeup Sponge Set",
            "price": 12.99,
            "quantity": 1,
            "attributes": {"color": "Pink", "size": "2 Pack"}
          }
        ],
        "subtotal": 50.97,
        "shipping": 0,
        "freeShippingThreshold": 50,
        "shippingMessage": "FREE shipping on orders over $50"
      }
    ],
    "totalItems": 4,
    "appliedCoupon": {
      "code": "SAVE10",
      "type": "fixed",
      "value": 10
    },
    "totals": {
      "subtotal": 75.96,
      "shipping": 5.00,
      "discount": 10.00,
      "total": 70.96,
      "itemCount": 4
    }
  }
}
```

#### 2. Add Item to Cart
**POST** `/api/cart/items?userId=user_1`

Add a product to the cart. If the item already exists with same attributes, quantity is increased.

Request Body:
```json
{
  "productId": 1,
  "productName": "Premium Makeup Sponge Set",
  "productImage": "https://...",
  "price": 12.99,
  "originalPrice": 12.99,
  "quantity": 1,
  "attributes": {
    "color": "Pink",
    "size": "2 Pack"
  },
  "sellerId": 1,
  "sellerName": "BeautyHub Store",
  "shippingInfo": {
    "freeShippingThreshold": 50,
    "standardShipping": 5
  }
}
```

#### 3. Update Item Quantity
**PUT** `/api/cart/items/:itemId?userId=user_1`

Update the quantity of a cart item (1-99).

Request Body:
```json
{
  "quantity": 3
}
```

#### 4. Remove Item from Cart
**DELETE** `/api/cart/items/:itemId?userId=user_1`

Remove an item from the cart.

#### 5. Clear Cart
**DELETE** `/api/cart?userId=user_1`

Remove all items from the cart.

#### 6. Apply Coupon
**POST** `/api/cart/coupon?userId=user_1`

Apply a discount coupon to the cart.

Request Body:
```json
{
  "couponCode": "SAVE10"
}
```

Response:
```json
{
  "success": true,
  "message": "Coupon applied successfully!",
  "data": {
    "discount": 10.00,
    "cart": {...}
  }
}
```

#### 7. Remove Coupon
**DELETE** `/api/cart/coupon?userId=user_1`

Remove the applied coupon from the cart.

#### 8. Validate Coupon
**GET** `/api/cart/coupons/validate/:code`

Check if a coupon code is valid before applying it.

Response (valid):
```json
{
  "success": true,
  "valid": true,
  "data": {
    "code": "SAVE10",
    "type": "fixed",
    "value": 10,
    "minOrderValue": 0,
    "maxDiscount": null
  }
}
```

Response (invalid):
```json
{
  "success": false,
  "valid": false,
  "message": "Invalid coupon code"
}
```

#### 9. Get Available Coupons
**GET** `/api/cart/coupons`

Get all currently active and non-expired coupons.

Response:
```json
{
  "success": true,
  "data": [
    {
      "code": "SAVE10",
      "type": "fixed",
      "value": 10,
      "minOrderValue": 0,
      "description": "$10 off"
    },
    {
      "code": "SAVE20",
      "type": "fixed",
      "value": 20,
      "minOrderValue": 50,
      "description": "$20 off"
    }
  ]
}
```

---

## Frontend Integration

### Example: Load Products on Page Load

```javascript
// Load products with default filters
async function loadProducts() {
  try {
    const response = await fetch('http://localhost:5000/api/products?page=1&limit=24&sortBy=relevance');
    const result = await response.json();
    
    if (result.success) {
      const { products, pagination } = result.data;
      displayProducts(products);
      updatePagination(pagination);
    }
  } catch (error) {
    console.error('Failed to load products:', error);
  }
}

function displayProducts(products) {
  const container = document.getElementById('products-container');
  container.innerHTML = products.map(product => `
    <div class="product-card">
      <img src="${product.image}" alt="${product.name}">
      <h3>${product.name}</h3>
      <div class="price">
        <span class="current">$${product.price.toFixed(2)}</span>
        ${product.discount > 0 ? `<span class="original">$${product.originalPrice.toFixed(2)}</span>` : ''}
      </div>
      <div class="rating">
        ${'★'.repeat(Math.floor(product.rating))}${'☆'.repeat(5 - Math.floor(product.rating))}
        (${product.reviewCount})
      </div>
      <button onclick="addToCart(${product.id})">Add to Cart</button>
    </div>
  `).join('');
}
```

### Example: Apply Filters

```javascript
async function applyFilters() {
  const brands = Array.from(document.querySelectorAll('input[name="brand"]:checked'))
    .map(cb => cb.value)
    .join(',');
  
  const minRating = document.getElementById('minRating').value;
  const sortBy = document.getElementById('sortBy').value;
  
  const queryParams = new URLSearchParams({
    brands,
    minRating,
    sortBy,
    page: 1,
    limit: 24
  });
  
  try {
    const response = await fetch(`http://localhost:5000/api/products?${queryParams}`);
    const result = await response.json();
    
    if (result.success) {
      displayProducts(result.data.products);
    }
  } catch (error) {
    console.error('Filter failed:', error);
  }
}

// Event listeners
document.querySelectorAll('input[name="brand"]').forEach(checkbox => {
  checkbox.addEventListener('change', applyFilters);
});

document.getElementById('sortBy').addEventListener('change', applyFilters);
```

### Example: Search Functionality

```javascript
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');

async function searchProducts() {
  const query = searchInput.value.trim();
  if (!query) return;
  
  try {
    const response = await fetch(`http://localhost:5000/api/products/search?q=${encodeURIComponent(query)}&limit=10`);
    const result = await response.json();
    
    if (result.success) {
      displaySearchResults(result.data);
    }
  } catch (error) {
    console.error('Search failed:', error);
  }
}

searchButton.addEventListener('click', searchProducts);
searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') searchProducts();
});
```

### Example: Load Product Details

```javascript
async function loadProductDetails(productId) {
  try {
    const response = await fetch(`http://localhost:5000/api/products/${productId}`);
    const result = await response.json();
    
    if (result.success) {
      const product = result.data;
      document.getElementById('productName').textContent = product.name;
      document.getElementById('productPrice').textContent = `$${product.price.toFixed(2)}`;
      document.getElementById('productImage').src = product.image;
      document.getElementById('productDescription').textContent = product.description;
      
      // Load related products
      loadRelatedProducts(productId);
    }
  } catch (error) {
    console.error('Failed to load product:', error);
  }
}

async function loadRelatedProducts(productId) {
  try {
    const response = await fetch(`http://localhost:5000/api/products/${productId}/related?limit=6`);
    const result = await response.json();
    
    if (result.success) {
      displayProducts(result.data);
    }
  } catch (error) {
    console.error('Failed to load related products:', error);
  }
}
```

### Example: Load Filter Options Dynamically

```javascript
async function loadFilterOptions() {
  try {
    const response = await fetch('http://localhost:5000/api/products/filters');
    const result = await response.json();
    
    if (result.success) {
      const { brands, categories, forms, finishes } = result.data;
      
      // Populate brand checkboxes
      const brandsContainer = document.getElementById('brandsFilter');
      brandsContainer.innerHTML = brands.map(brand => `
        <label>
          <input type="checkbox" name="brand" value="${brand}">
          ${brand}
        </label>
      `).join('');
      
      // Populate other filters similarly
    }
  } catch (error) {
    console.error('Failed to load filters:', error);
  }
}

// Call on page load
loadFilterOptions();
```

### Example: Shopping Cart Operations

```javascript
// Load cart on page load
async function loadCart() {
  try {
    const response = await fetch('http://localhost:5000/api/cart?userId=user_1');
    const result = await response.json();
    
    if (result.success) {
      const cart = result.data;
      displayCartItems(cart.itemsBySeller);
      updateCartTotals(cart.totals);
      updateCartCount(cart.totalItems);
      
      if (cart.appliedCoupon) {
        displayAppliedCoupon(cart.appliedCoupon);
      }
    }
  } catch (error) {
    console.error('Failed to load cart:', error);
  }
}

// Add product to cart
async function addToCart(product) {
  try {
    const response = await fetch('http://localhost:5000/api/cart/items?userId=user_1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        productId: product.id,
        productName: product.name,
        productImage: product.image,
        price: product.price,
        originalPrice: product.originalPrice,
        quantity: 1,
        attributes: product.selectedAttributes || {},
        sellerId: product.sellerId,
        sellerName: product.sellerName
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showNotification('Product added to cart!');
      updateCartCount(result.data.totalItems);
    }
  } catch (error) {
    console.error('Failed to add to cart:', error);
  }
}

// Update item quantity
async function updateQuantity(itemId, quantity) {
  try {
    const response = await fetch(`http://localhost:5000/api/cart/items/${itemId}?userId=user_1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ quantity })
    });
    
    const result = await response.json();
    
    if (result.success) {
      updateCartTotals(result.data.totals);
    }
  } catch (error) {
    console.error('Failed to update quantity:', error);
  }
}

// Remove item from cart
async function removeItem(itemId) {
  if (!confirm('Remove this item from cart?')) return;
  
  try {
    const response = await fetch(`http://localhost:5000/api/cart/items/${itemId}?userId=user_1`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      loadCart(); // Reload cart
    }
  } catch (error) {
    console.error('Failed to remove item:', error);
  }
}

// Apply coupon
async function applyCoupon() {
  const couponCode = document.getElementById('couponInput').value.trim();
  
  if (!couponCode) {
    showMessage('Please enter a coupon code', 'error');
    return;
  }
  
  try {
    const response = await fetch('http://localhost:5000/api/cart/coupon?userId=user_1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ couponCode })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showMessage(result.message, 'success');
      updateCartTotals(result.data.cart.totals);
      displayAppliedCoupon(result.data.cart.appliedCoupon);
    } else {
      showMessage(result.message, 'error');
    }
  } catch (error) {
    console.error('Failed to apply coupon:', error);
  }
}

// Display cart totals
function updateCartTotals(totals) {
  document.getElementById('subtotal').textContent = `$${totals.subtotal.toFixed(2)}`;
  document.getElementById('shipping').textContent = totals.shipping === 0 ? 'FREE' : `$${totals.shipping.toFixed(2)}`;
  document.getElementById('total').textContent = `$${totals.total.toFixed(2)}`;
  
  if (totals.discount > 0) {
    document.getElementById('discount').textContent = `-$${totals.discount.toFixed(2)}`;
    document.getElementById('discountRow').style.display = 'flex';
  } else {
    document.getElementById('discountRow').style.display = 'none';
  }
}

// Update cart count badge
function updateCartCount(count) {
  const badge = document.querySelector('.cart-badge');
  if (badge) {
    badge.textContent = count;
  }
}
```

---

### Wishlist

#### 1. Get User Wishlist
**GET** `/api/wishlist/:userId`

Get all wishlist items for a user with enriched product data.

Query Parameters:
- `category` (string): Filter by category (optional)
- `availability` (string): 'available' | 'unavailable' | 'all' (default: 'all')
- `sortBy` (string): 'dateAdded' | 'price' | 'name' | 'discount' (default: 'dateAdded')
- `order` (string): 'asc' | 'desc' (default: 'desc')

Example Request:
```javascript
fetch('http://localhost:5000/api/wishlist/user_1?sortBy=price&order=asc')
  .then(res => res.json())
  .then(data => console.log(data));
```

Example Response:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "productId": 1,
        "addedAt": "2026-03-01T10:30:00Z",
        "notes": "",
        "productName": "Premium Makeup Sponge Set",
        "price": 12.99,
        "originalPrice": 24.99,
        "discount": 48,
        "image": "https://...",
        "stock": 15,
        "category": "Beauty",
        "brand": "e.l.f.",
        "rating": 4.8,
        "sellerId": 1,
        "sellerName": "BeautyHub Store",
        "sellerRating": 4.9,
        "inStock": true,
        "isAvailable": true
      }
    ],
    "summary": {
      "totalItems": 3,
      "inStockItems": 2,
      "outOfStockItems": 1,
      "totalValue": 56.97,
      "totalSavings": 72.03
    }
  }
}
```

#### 2. Get Wishlist Summary
**GET** `/api/wishlist/:userId/summary`

Get wishlist summary (count, total value, etc.) - useful for navbar badge.

Example Response:
```json
{
  "success": true,
  "data": {
    "totalItems": 3,
    "inStockItems": 2,
    "outOfStockItems": 1,
    "totalValue": 56.97,
    "totalSavings": 72.03
  }
}
```

#### 3. Check Product in Wishlist
**GET** `/api/wishlist/:userId/check/:productId`

Check if a specific product is in user's wishlist.

Example Request:
```javascript
fetch('http://localhost:5000/api/wishlist/user_1/check/1')
  .then(res => res.json())
  .then(data => console.log(data.data.inWishlist));
```

Example Response:
```json
{
  "success": true,
  "data": {
    "inWishlist": true,
    "productId": 1,
    "itemId": 1,
    "addedAt": "2026-03-01T10:30:00Z"
  }
}
```

#### 4. Get Wishlist by Availability
**GET** `/api/wishlist/:userId/availability`

Get wishlist items separated by availability status.

Example Response:
```json
{
  "success": true,
  "data": {
    "available": [...],
    "unavailable": [...],
    "availableCount": 2,
    "unavailableCount": 1
  }
}
```

#### 5. Add to Wishlist
**POST** `/api/wishlist/:userId`

Add a product to user's wishlist.

Request Body:
```json
{
  "productId": 1,
  "notes": "Want this for my makeup kit"
}
```

Example Response:
```json
{
  "success": true,
  "message": "Product added to wishlist",
  "item": {...},
  "wishlistCount": 3
}
```

#### 6. Remove from Wishlist (by item ID)
**DELETE** `/api/wishlist/:userId/item/:itemId`

Remove specific item from wishlist using wishlist item ID.

Example: `DELETE /api/wishlist/user_1/item/1`

#### 7. Remove from Wishlist (by product ID)
**DELETE** `/api/wishlist/:userId/product/:productId`

Remove item from wishlist using product ID.

Example: `DELETE /api/wishlist/user_1/product/1`

#### 8. Clear Wishlist
**DELETE** `/api/wishlist/:userId`

Clear entire wishlist for a user.

Example Response:
```json
{
  "success": true,
  "message": "Wishlist cleared",
  "clearedCount": 3
}
```

#### 9. Move to Cart
**POST** `/api/wishlist/:userId/move-to-cart`

Move selected items from wishlist to cart.

Request Body:
```json
{
  "itemIds": [1, 2, 3],
  "quantities": {
    "1": 2,
    "2": 1,
    "3": 1
  }
}
```

Example Response:
```json
{
  "success": true,
  "message": "3 item(s) moved to cart",
  "addedToCart": [
    {
      "itemId": 1,
      "productId": 1,
      "quantity": 2,
      "cartItemId": 5
    }
  ],
  "failed": [],
  "removed": [1, 2, 3]
}
```

#### 10. Get Wishlist by Category
**GET** `/api/wishlist/:userId/category/:category`

Get wishlist items filtered by specific category.

Example: `GET /api/wishlist/user_1/category/Beauty`

---

### Example: Wishlist Operations

```javascript
// Load wishlist on page load
async function loadWishlist() {
  try {
    const response = await fetch('http://localhost:5000/api/wishlist/user_1?sortBy=dateAdded&order=desc');
    const result = await response.json();
    
    if (result.success) {
      const { items, summary } = result.data;
      displayWishlistItems(items);
      updateWishlistBadge(summary.totalItems);
      updateWishlistSummary(summary);
    }
  } catch (error) {
    console.error('Failed to load wishlist:', error);
  }
}

// Add to wishlist
async function addToWishlist(productId) {
  try {
    const response = await fetch(`http://localhost:5000/api/wishlist/user_1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ productId })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showMessage('Added to wishlist!', 'success');
      updateWishlistBadge(result.wishlistCount);
    } else {
      showMessage(result.error || 'Failed to add to wishlist', 'error');
    }
  } catch (error) {
    console.error('Failed to add to wishlist:', error);
  }
}

// Remove from wishlist
async function removeFromWishlist(itemId) {
  if (!confirm('Remove this item from your wishlist?')) return;
  
  try {
    const response = await fetch(`http://localhost:5000/api/wishlist/user_1/item/${itemId}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      showMessage('Removed from wishlist', 'success');
      loadWishlist(); // Reload wishlist
    }
  } catch (error) {
    console.error('Failed to remove from wishlist:', error);
  }
}

// Move selected items to cart
async function moveSelectedToCart() {
  const selectedItemIds = Array.from(document.querySelectorAll('.wishlist-checkbox:checked'))
    .map(cb => parseInt(cb.dataset.itemId));
  
  if (selectedItemIds.length === 0) {
    alert('Please select at least one item');
    return;
  }
  
  try {
    const response = await fetch('http://localhost:5000/api/wishlist/user_1/move-to-cart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ itemIds: selectedItemIds })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showMessage(result.message, 'success');
      loadWishlist(); // Reload wishlist
      updateCartBadge(); // Update cart badge
    }
  } catch (error) {
    console.error('Failed to move to cart:', error);
  }
}

// Check if product is in wishlist (for heart icon state)
async function checkInWishlist(productId) {
  try {
    const response = await fetch(`http://localhost:5000/api/wishlist/user_1/check/${productId}`);
    const result = await response.json();
    
    if (result.success) {
      return result.data.inWishlist;
    }
  } catch (error) {
    console.error('Failed to check wishlist:', error);
  }
  return false;
}

// Update wishlist badge in navbar
function updateWishlistBadge(count) {
  const badge = document.getElementById('wishlistBadge');
  if (badge) {
    badge.textContent = count;
  }
}
```

---

## Project Structure

```
customer_backend/
├── src/
│   ├── data/
│   │   ├── productsData.js       # Business logic for products
│   │   ├── cartData.js           # Business logic for shopping cart
│   │   ├── checkoutData.js       # Business logic for checkout and orders
│   │   ├── homepageData.js       # Business logic for homepage sections
│   │   ├── authData.js           # Business logic for auth and registration
│   │   ├── productDetailsData.js # Business logic for product-details page
│   │   └── wishlistData.js       # Business logic for wishlist
│   ├── routes/
│   │   ├── productsRoutes.js     # REST API endpoints for products
│   │   ├── cartRoutes.js         # REST API endpoints for cart
│   │   ├── checkoutRoutes.js     # REST API endpoints for checkout
│   │   ├── homepageRoutes.js     # REST API endpoints for homepage
│   │   ├── authRoutes.js         # REST API endpoints for auth
│   │   ├── productDetailsRoutes.js # REST API endpoints for product-details
│   │   └── wishlistRoutes.js     # REST API endpoints for wishlist
│   └── server.js                 # Express app entry point
├── .env                          # Environment variables
├── package.json                  # Dependencies
└── README.md                     # This file
```

## Notes

- All endpoints return JSON with `{success: boolean, data/message: ...}` format
- Mock data is used for development; replace with database queries for production
- CORS is enabled for all origins (configure FRONTEND_ORIGIN for production)
- Cart is keyed by userId (default: 'user_1' for testing)
- Coupons: SAVE10 ($10 off), SAVE20 ($20 off min $50), WELCOME ($15 off min $30), PERCENT10 (10% off)
- Free shipping thresholds vary by seller
- Server runs on port 5003 (configurable via .env)
