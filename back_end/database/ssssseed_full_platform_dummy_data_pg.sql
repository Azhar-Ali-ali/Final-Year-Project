-- LUMINA seed data (PostgreSQL)
-- Run after full_platform_schema.sql

BEGIN;

-- Stable UUIDs for predictable local development
-- admin: 11111111-1111-4111-8111-111111111111
-- seller: 22222222-2222-4222-8222-222222222222
-- customer: 33333333-3333-4333-8333-333333333333

INSERT INTO users (
    id, role, full_name, email, phone, password_hash, status, email_verified_at, created_at, updated_at
) VALUES
    ('11111111-1111-4111-8111-111111111111', 'admin', 'Admin One', 'admin1@lumina.com', '01710000001', crypt('admin@123', gen_salt('bf')), 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('22222222-2222-4222-8222-222222222222', 'seller', 'Seller One', 'seller1@lumina.com', '01710000002', crypt('seller@123', gen_salt('bf')), 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('33333333-3333-4333-8333-333333333333', 'customer', 'Customer One', 'customer1@lumina.com', '01710000003', crypt('pass123', gen_salt('bf')), 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    password_hash = EXCLUDED.password_hash,
    status = EXCLUDED.status,
    email_verified_at = EXCLUDED.email_verified_at,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO seller_profiles (
    user_id, store_name, store_slug, business_email, business_phone, tax_number, kyc_status, rating, total_reviews, created_at, updated_at
) VALUES (
    '22222222-2222-4222-8222-222222222222',
    'Lumina Seller Store',
    'lumina-seller-store',
    'seller1@lumina.com',
    '01710000002',
    'TIN-SELLER-001',
    'active',
    4.60,
    120,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (user_id) DO UPDATE SET
    store_name = EXCLUDED.store_name,
    store_slug = EXCLUDED.store_slug,
    business_email = EXCLUDED.business_email,
    business_phone = EXCLUDED.business_phone,
    tax_number = EXCLUDED.tax_number,
    kyc_status = EXCLUDED.kyc_status,
    rating = EXCLUDED.rating,
    total_reviews = EXCLUDED.total_reviews,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO customer_profiles (
    user_id, date_of_birth, gender, loyalty_points, preferred_language, created_at, updated_at
) VALUES (
    '33333333-3333-4333-8333-333333333333',
    '1997-01-01',
    'F',
    100,
    'en',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (user_id) DO UPDATE SET
    date_of_birth = EXCLUDED.date_of_birth,
    gender = EXCLUDED.gender,
    loyalty_points = EXCLUDED.loyalty_points,
    preferred_language = EXCLUDED.preferred_language,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO user_addresses (
    id, user_id, label, receiver_name, phone, line1, city, state, postal_code, country, is_default, created_at, updated_at
) VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '33333333-3333-4333-8333-333333333333',
    'Home',
    'Customer One',
    '01710000003',
    'House 10, Road 5',
    'Dhaka',
    'Dhaka',
    '1207',
    'Bangladesh',
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    receiver_name = EXCLUDED.receiver_name,
    phone = EXCLUDED.phone,
    line1 = EXCLUDED.line1,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    postal_code = EXCLUDED.postal_code,
    country = EXCLUDED.country,
    is_default = EXCLUDED.is_default,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO categories (id, name, slug, description, is_active, created_at, updated_at) VALUES
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Electronics', 'electronics', 'Electronics and gadgets', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO brands (id, name, slug, created_at, updated_at) VALUES
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Lumina Tech', 'lumina-tech', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO products (
    id, seller_id, category_id, brand_id, name, slug, description, base_price, compare_price, currency, sku, status, is_featured, average_rating, total_reviews, created_at, updated_at
) VALUES
    (
        '44444444-4444-4444-8444-444444444444',
        '22222222-2222-4222-8222-222222222222',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'Wireless Headphones Pro',
        'wireless-headphones-pro',
        'Noise-cancelling wireless headphones',
        5500,
        6200,
        'BDT',
        'LUM-HP-001',
        'active',
        TRUE,
        4.70,
        84,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        '55555555-5555-4555-8555-555555555555',
        '22222222-2222-4222-8222-222222222222',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'USB-C Fast Charger',
        'usb-c-fast-charger',
        '35W fast charger adapter',
        1200,
        1490,
        'BDT',
        'LUM-CH-001',
        'active',
        FALSE,
        4.50,
        39,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
ON CONFLICT (id) DO UPDATE SET
    seller_id = EXCLUDED.seller_id,
    category_id = EXCLUDED.category_id,
    brand_id = EXCLUDED.brand_id,
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    base_price = EXCLUDED.base_price,
    compare_price = EXCLUDED.compare_price,
    currency = EXCLUDED.currency,
    sku = EXCLUDED.sku,
    status = EXCLUDED.status,
    is_featured = EXCLUDED.is_featured,
    average_rating = EXCLUDED.average_rating,
    total_reviews = EXCLUDED.total_reviews,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO product_variants (
    id, product_id, sku, variant_name, price, stock_quantity, attributes, is_active, created_at, updated_at
) VALUES
    (
        '66666666-6666-4666-8666-666666666666',
        '44444444-4444-4444-8444-444444444444',
        'LUM-HP-001-BLK',
        'Black',
        5500,
        12,
        jsonb_build_object('color', 'Black'),
        TRUE,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        '77777777-7777-4777-8777-777777777777',
        '55555555-5555-4555-8555-555555555555',
        'LUM-CH-001-WHT',
        'White',
        1200,
        4,
        jsonb_build_object('color', 'White'),
        TRUE,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
ON CONFLICT (id) DO UPDATE SET
    product_id = EXCLUDED.product_id,
    sku = EXCLUDED.sku,
    variant_name = EXCLUDED.variant_name,
    price = EXCLUDED.price,
    stock_quantity = EXCLUDED.stock_quantity,
    attributes = EXCLUDED.attributes,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO orders (
    id, order_number, customer_id, shipping_address_id, billing_address_id, status,
    payment_status, subtotal, discount_total, shipping_fee, tax_total, grand_total, currency,
    note, placed_at, created_at, updated_at
) VALUES
    (
        '88888888-8888-4888-8888-888888888888',
        'ORD-1001',
        '33333333-3333-4333-8333-333333333333',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'delivered',
        'paid',
        5500,
        0,
        60,
        0,
        5560,
        'BDT',
        'Delivered order',
        CURRENT_TIMESTAMP - INTERVAL '3 day',
        CURRENT_TIMESTAMP - INTERVAL '3 day',
        CURRENT_TIMESTAMP - INTERVAL '2 day'
    ),
    (
        '99999999-9999-4999-8999-999999999999',
        'ORD-1002',
        '33333333-3333-4333-8333-333333333333',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'pending',
        'pending',
        1200,
        0,
        60,
        0,
        1260,
        'BDT',
        'Pending order',
        CURRENT_TIMESTAMP - INTERVAL '1 day',
        CURRENT_TIMESTAMP - INTERVAL '1 day',
        CURRENT_TIMESTAMP - INTERVAL '1 day'
    )
ON CONFLICT (id) DO UPDATE SET
    order_number = EXCLUDED.order_number,
    customer_id = EXCLUDED.customer_id,
    shipping_address_id = EXCLUDED.shipping_address_id,
    billing_address_id = EXCLUDED.billing_address_id,
    status = EXCLUDED.status,
    payment_status = EXCLUDED.payment_status,
    subtotal = EXCLUDED.subtotal,
    discount_total = EXCLUDED.discount_total,
    shipping_fee = EXCLUDED.shipping_fee,
    tax_total = EXCLUDED.tax_total,
    grand_total = EXCLUDED.grand_total,
    currency = EXCLUDED.currency,
    note = EXCLUDED.note,
    placed_at = EXCLUDED.placed_at,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO order_items (
    id, order_id, product_id, variant_id, seller_id, product_name, sku,
    quantity, unit_price, discount_amount, line_total, created_at, updated_at
) VALUES
    (
        '12121212-1212-4121-8121-121212121212',
        '88888888-8888-4888-8888-888888888888',
        '44444444-4444-4444-8444-444444444444',
        '66666666-6666-4666-8666-666666666666',
        '22222222-2222-4222-8222-222222222222',
        'Wireless Headphones Pro',
        'LUM-HP-001-BLK',
        1,
        5500,
        0,
        5500,
        CURRENT_TIMESTAMP - INTERVAL '3 day',
        CURRENT_TIMESTAMP - INTERVAL '2 day'
    ),
    (
        '13131313-1313-4131-8131-131313131313',
        '99999999-9999-4999-8999-999999999999',
        '55555555-5555-4555-8555-555555555555',
        '77777777-7777-4777-8777-777777777777',
        '22222222-2222-4222-8222-222222222222',
        'USB-C Fast Charger',
        'LUM-CH-001-WHT',
        1,
        1200,
        0,
        1200,
        CURRENT_TIMESTAMP - INTERVAL '1 day',
        CURRENT_TIMESTAMP - INTERVAL '1 day'
    )
ON CONFLICT (id) DO UPDATE SET
    order_id = EXCLUDED.order_id,
    product_id = EXCLUDED.product_id,
    variant_id = EXCLUDED.variant_id,
    seller_id = EXCLUDED.seller_id,
    product_name = EXCLUDED.product_name,
    sku = EXCLUDED.sku,
    quantity = EXCLUDED.quantity,
    unit_price = EXCLUDED.unit_price,
    discount_amount = EXCLUDED.discount_amount,
    line_total = EXCLUDED.line_total,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO return_requests (
    id, return_number, order_id, customer_id, status, reason, requested_at, created_at, updated_at
) VALUES
    (
        '14141414-1414-4141-8141-141414141414',
        'RET-1001',
        '88888888-8888-4888-8888-888888888888',
        '33333333-3333-4333-8333-333333333333',
        'requested',
        'Received damaged packaging',
        CURRENT_TIMESTAMP - INTERVAL '12 hour',
        CURRENT_TIMESTAMP - INTERVAL '12 hour',
        CURRENT_TIMESTAMP - INTERVAL '12 hour'
    )
ON CONFLICT (id) DO UPDATE SET
    return_number = EXCLUDED.return_number,
    order_id = EXCLUDED.order_id,
    customer_id = EXCLUDED.customer_id,
    status = EXCLUDED.status,
    reason = EXCLUDED.reason,
    requested_at = EXCLUDED.requested_at,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO return_items (
    id, return_request_id, order_item_id, quantity, item_reason, created_at, updated_at
) VALUES
    (
        '15151515-1515-4151-8151-151515151515',
        '14141414-1414-4141-8141-141414141414',
        '12121212-1212-4121-8121-121212121212',
        1,
        'Damaged package',
        CURRENT_TIMESTAMP - INTERVAL '12 hour',
        CURRENT_TIMESTAMP - INTERVAL '12 hour'
    )
ON CONFLICT (id) DO UPDATE SET
    return_request_id = EXCLUDED.return_request_id,
    order_item_id = EXCLUDED.order_item_id,
    quantity = EXCLUDED.quantity,
    item_reason = EXCLUDED.item_reason,
    updated_at = CURRENT_TIMESTAMP;

COMMIT;