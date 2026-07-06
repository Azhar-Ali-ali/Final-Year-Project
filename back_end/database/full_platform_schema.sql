
-- LUMINA Full Platform Database Schema (PostgreSQL)
-- Converted from MySQL

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

BEGIN;

-- =========================
-- Enums
-- =========================
CREATE TYPE user_role AS ENUM ('customer','seller','admin');
CREATE TYPE user_status AS ENUM ('active','suspended','banned','pending');
CREATE TYPE kyc_status AS ENUM ('active','suspended','banned','pending');
CREATE TYPE product_status AS ENUM ('draft','active','inactive','archived');
CREATE TYPE order_status AS ENUM ('pending','confirmed','processing','shipped','delivered','cancelled','refunded','returned');
CREATE TYPE payment_status AS ENUM ('pending','authorized','paid','failed','refunded','partially_refunded');
CREATE TYPE shipment_status AS ENUM ('pending','packed','in_transit','out_for_delivery','delivered','failed','returned');
CREATE TYPE coupon_discount_type AS ENUM ('flat', 'percent');
CREATE TYPE return_status AS ENUM ('requested','approved','rejected','in_transit','received','refunded','closed');
CREATE TYPE ticket_type AS ENUM ('customer','seller');
CREATE TYPE ticket_status AS ENUM ('open','in_progress','resolved','closed');
CREATE TYPE sender_role AS ENUM ('customer','seller','admin');
CREATE TYPE payout_status AS ENUM ('pending','processing','paid','failed');
CREATE TYPE verification_status AS ENUM ('active','suspended','banned','pending');

-- =========================
-- Auth and users
-- =========================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role user_role NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(30),
    password_hash TEXT NOT NULL,
    reset_token TEXT,
    reset_token_expiry TIMESTAMP,
    status user_status NOT NULL DEFAULT 'active',
    email_verified_at TIMESTAMP,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Compatibility alias for customer-only access using requested naming.
-- Note: password is mapped to password_hash (hashed value), not plain text.

CREATE OR REPLACE VIEW customers AS
SELECT
    id,
    full_name AS name,
    email,
    password_hash AS password,
    created_at
FROM users
WHERE role = 'customer';


CREATE TABLE IF NOT EXISTS customer_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    date_of_birth DATE,
    gender VARCHAR(20),
    loyalty_points INTEGER NOT NULL DEFAULT 0,
    preferred_language VARCHAR(20) DEFAULT 'en',
    profile_image_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS seller_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    store_name VARCHAR(180) NOT NULL,
    store_slug VARCHAR(180) NOT NULL UNIQUE,
    business_email VARCHAR(255),
    business_phone VARCHAR(30),
    tax_number VARCHAR(60),
    kyc_status kyc_status NOT NULL DEFAULT 'pending',
    rating NUMERIC(3,2) NOT NULL DEFAULT 0,
    total_reviews INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS admin_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    admin_title VARCHAR(80) DEFAULT 'Admin',
    can_manage_users BOOLEAN NOT NULL DEFAULT TRUE,
    can_manage_sellers BOOLEAN NOT NULL DEFAULT TRUE,
    can_manage_finance BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS user_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(60),
    receiver_name VARCHAR(120) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    line1 VARCHAR(255) NOT NULL,
    line2 VARCHAR(255),
    city VARCHAR(80) NOT NULL,
    state VARCHAR(80),
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(80) NOT NULL DEFAULT 'Bangladesh',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_addresses_user_id ON user_addresses(user_id);

-- =========================
-- Catalog
-- =========================

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(140) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL UNIQUE,
    slug VARCHAR(140) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(300) NOT NULL UNIQUE,
    description TEXT,
    base_price NUMERIC(12,2) NOT NULL CHECK (base_price >= 0),
    compare_price NUMERIC(12,2) CHECK (compare_price >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'BDT',
    sku VARCHAR(80),
    status product_status NOT NULL DEFAULT 'draft',
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    color VARCHAR(120),
    size VARCHAR(120),
    fit_type VARCHAR(120),
    material VARCHAR(120),
    occasion VARCHAR(120),
    style VARCHAR(120),
    discount_percent NUMERIC(7,2) NOT NULL DEFAULT 0,
    average_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
    total_reviews INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_seller_id ON products(seller_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_status ON products(status);


CREATE TABLE IF NOT EXISTS product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    alt_text VARCHAR(255),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) UNIQUE,
    variant_name VARCHAR(180),
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);

-- =========================
-- Cart and wishlist
-- =========================

CREATE TABLE IF NOT EXISTS carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (cart_id, product_id, variant_id)
);


CREATE TABLE IF NOT EXISTS wishlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, product_id)
);

-- =========================
-- Orders, payments, shipping
-- =========================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(30) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    shipping_address_id UUID REFERENCES user_addresses(id) ON DELETE SET NULL,
    billing_address_id UUID REFERENCES user_addresses(id) ON DELETE SET NULL,
    status order_status NOT NULL DEFAULT 'pending',
    payment_status payment_status NOT NULL DEFAULT 'pending',
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    shipping_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'BDT',
    note TEXT,
    placed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);

ALTER TABLE IF EXISTS orders
ADD COLUMN IF NOT EXISTS payment_status ENUM('pending','authorized','paid','failed','refunded','partially_refunded') NOT NULL DEFAULT 'pending';


CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_seller_id ON order_items(seller_id);


CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    method VARCHAR(40) NOT NULL,
    provider VARCHAR(50),
    transaction_ref VARCHAR(120) UNIQUE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'BDT',
    status payment_status NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_order_id ON payments(order_id);


CREATE TABLE IF NOT EXISTS shipments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    courier_name VARCHAR(120),
    tracking_number VARCHAR(120),
    status shipment_status NOT NULL DEFAULT 'pending',
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shipments_order_id ON shipments(order_id);

-- =========================
-- Reviews and rating
-- =========================

CREATE TABLE IF NOT EXISTS product_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(160),
    body TEXT,
    is_verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, customer_id, order_item_id)
);

CREATE INDEX idx_product_reviews_product_id ON product_reviews(product_id);

-- =========================
-- Promotions
-- =========================

CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(60) NOT NULL UNIQUE,
    description TEXT,
    discount_type coupon_discount_type NOT NULL,
    discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value >= 0),
    max_discount NUMERIC(12,2),
    min_order_amount NUMERIC(12,2) DEFAULT 0,
    usage_limit INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS order_coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id, coupon_id)
);

-- =========================
-- Returns and refunds
-- =========================

CREATE TABLE IF NOT EXISTS return_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_number VARCHAR(30) NOT NULL UNIQUE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status return_status NOT NULL DEFAULT 'requested',
    reason TEXT NOT NULL,
    admin_note TEXT,
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS return_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_request_id UUID NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    item_reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_request_id UUID REFERENCES return_requests(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    status payment_status NOT NULL DEFAULT 'pending',
    transaction_ref VARCHAR(120),
    processed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Support and dispute
-- =========================

CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number VARCHAR(30) NOT NULL UNIQUE,
    ticket_type ticket_type NOT NULL,
    status ticket_status NOT NULL DEFAULT 'open',
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    subject VARCHAR(255) NOT NULL,
    issue_type VARCHAR(80),
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    closed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (ticket_type = 'customer' AND customer_id IS NOT NULL AND seller_id IS NULL) OR
        (ticket_type = 'seller' AND seller_id IS NOT NULL AND customer_id IS NULL)
    )
);

CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_assigned_admin ON support_tickets(assigned_admin_id);


CREATE TABLE IF NOT EXISTS support_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sender_role sender_role NOT NULL,
    message TEXT NOT NULL,
    attachment_url TEXT,
    is_internal_note BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_support_messages_ticket_id ON support_messages(ticket_id);


CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_number VARCHAR(30) NOT NULL UNIQUE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    opener_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    against_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status ticket_status NOT NULL DEFAULT 'open',
    assigned_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_note TEXT,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Seller finance
-- =========================

CREATE TABLE IF NOT EXISTS seller_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
    entry_type VARCHAR(30) NOT NULL CHECK (entry_type IN ('sale_credit', 'commission_debit', 'refund_debit', 'adjustment')),
    amount NUMERIC(12,2) NOT NULL,
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_seller_ledger_seller_id ON seller_ledger(seller_id);
CREATE UNIQUE INDEX uq_seller_ledger_order_item_entry_type
ON seller_ledger(order_item_id, entry_type);


CREATE TABLE IF NOT EXISTS seller_payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start DATE,
    period_end DATE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    status payout_status NOT NULL DEFAULT 'pending',
    payout_reference VARCHAR(120),
    paid_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Notifications and audit logs
-- =========================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(180) NOT NULL,
    body TEXT,
    type VARCHAR(40),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id_read ON notifications(user_id, is_read);


CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id UUID,
    before_data JSONB,
    after_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Customer / Seller Messaging
-- =========================

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic VARCHAR(255),
    conversation_type VARCHAR(30) NOT NULL DEFAULT 'direct' CHECK (conversation_type IN ('direct', 'support', 'order', 'dispute')),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    support_ticket_id UUID REFERENCES support_tickets(id) ON DELETE SET NULL,
    dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_in_conversation VARCHAR(30),
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id)
);


CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    message TEXT NOT NULL,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX idx_conversation_participants_user_id ON conversation_participants(user_id);

-- =========================
-- Account Security and Profile Settings
-- =========================

CREATE TABLE IF NOT EXISTS user_security_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    two_factor_method VARCHAR(20) CHECK (two_factor_method IN ('app', 'sms', 'email')),
    backup_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    password_changed_at TIMESTAMP,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);


CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    currency CHAR(3) DEFAULT 'BDT',
    language VARCHAR(20) DEFAULT 'en',
    timezone VARCHAR(60) DEFAULT 'Asia/Dhaka',
    marketing_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
    email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    push_notifications BOOLEAN NOT NULL DEFAULT FALSE,
    sms_notifications BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Seller Operations
-- =========================

CREATE TABLE IF NOT EXISTS seller_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type VARCHAR(60) NOT NULL,
    document_url TEXT NOT NULL,
    verification_status verification_status NOT NULL DEFAULT 'pending',
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_seller_documents_seller_id ON seller_documents(seller_id);


CREATE TABLE IF NOT EXISTS seller_bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_holder_name VARCHAR(120) NOT NULL,
    bank_name VARCHAR(120) NOT NULL,
    branch_name VARCHAR(120),
    account_number_masked VARCHAR(40) NOT NULL,
    routing_number VARCHAR(40),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    verification_status verification_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS seller_store_settings (
    seller_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    support_email VARCHAR(255),
    support_phone VARCHAR(30),
    return_policy TEXT,
    shipping_policy TEXT,
    store_banner_url TEXT,
    store_logo_url TEXT,
    vacation_mode BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Logistics and Courier
-- =========================

CREATE TABLE IF NOT EXISTS couriers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL UNIQUE,
    code VARCHAR(40) NOT NULL UNIQUE,
    api_base_url TEXT,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS shipment_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    event_code VARCHAR(50),
    event_label VARCHAR(180) NOT NULL,
    event_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    location_text VARCHAR(255),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shipment_events_shipment_id ON shipment_events(shipment_id);

-- =========================
-- Reporting
-- =========================

CREATE TABLE IF NOT EXISTS report_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(180) NOT NULL,
    report_type VARCHAR(60) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS report_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_definition_id UUID NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    output_url TEXT,
    error_message TEXT,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- CMS (All Admin CMS Pages)
-- =========================

CREATE TABLE IF NOT EXISTS cms_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(160) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    meta_title VARCHAR(255),
    meta_description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    published_at TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS cms_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
    section_key VARCHAR(160) NOT NULL,
    section_type VARCHAR(60) NOT NULL DEFAULT 'content',
    heading VARCHAR(255),
    body TEXT,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(page_id, section_key)
);


CREATE TABLE IF NOT EXISTS cms_navigation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label VARCHAR(120) NOT NULL,
    href VARCHAR(255) NOT NULL,
    nav_group VARCHAR(40) NOT NULL DEFAULT 'header' CHECK (nav_group IN ('header', 'footer', 'sidebar')),
    parent_id UUID REFERENCES cms_navigation(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS cms_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_type VARCHAR(30) NOT NULL CHECK (asset_type IN ('image', 'video', 'document', 'icon', 'other')),
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    mime_type VARCHAR(120),
    file_size BIGINT,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS cms_announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    audience VARCHAR(30) NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'customers', 'sellers', 'admins')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Compatibility Schema for Route Modules (*)
-- Keeps one database file while supporting existing route queries.
-- =========================
-- Removed PostgreSQL compatibility schema/views during MySQL conversion.


-- Legacy support_tickets table converted for PostgreSQL
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number VARCHAR(30) NOT NULL UNIQUE,
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(80) NOT NULL DEFAULT 'general',
    source VARCHAR(40) NOT NULL DEFAULT 'web',
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status ticket_status NOT NULL DEFAULT 'open',
    assigned_admin UUID REFERENCES users(id) ON DELETE SET NULL,
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    closed_reason TEXT,
    last_reply_at TIMESTAMP,
    last_reply_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reopened_count INTEGER NOT NULL DEFAULT 0,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lumina_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_lumina_support_tickets_requester ON support_tickets(requester_id);


CREATE TABLE IF NOT EXISTS support_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    message TEXT NOT NULL,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lumina_support_messages_ticket ON support_messages(ticket_id);


CREATE TABLE IF NOT EXISTS return_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_code VARCHAR(40) NOT NULL UNIQUE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'refunded')),
    selected_reason VARCHAR(160),
    customer_description TEXT,
    seller_message TEXT,
    seller_decision VARCHAR(100),
    courier_name VARCHAR(120),
    pickup_schedule VARCHAR(120),
    return_address TEXT,
    refund_amount NUMERIC(12,2) DEFAULT 0,
    refund_method VARCHAR(60),
    transaction_id VARCHAR(120),
    refund_step INTEGER DEFAULT 1,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lumina_return_requests_status ON return_requests(status);

-- =========================
-- Cross-table data sync links
-- =========================
-- Keep payment and order status consistent.

-- PostgreSQL trigger function for payments/orders sync
CREATE OR REPLACE FUNCTION trg_payments_sync_order() RETURNS TRIGGER AS $$
BEGIN
    UPDATE orders
    SET
        payment_status = NEW.status,
        status = CASE
            WHEN LOWER(COALESCE(NEW.method, '')) = 'cod' AND NEW.status = 'pending' THEN 'confirmed'
            WHEN LOWER(COALESCE(NEW.method, '')) = 'cod' AND NEW.status = 'paid' THEN 'delivered'
            WHEN NEW.status IN ('authorized', 'paid') THEN 'processing'
            WHEN NEW.status IN ('refunded', 'partially_refunded') THEN 'refunded'
            WHEN NEW.status = 'failed' THEN 'pending'
            ELSE status
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.order_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_sync_order_after_insert ON payments;
CREATE TRIGGER trg_payments_sync_order_after_insert
AFTER INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION trg_payments_sync_order();

DROP TRIGGER IF EXISTS trg_payments_sync_order_after_update ON payments;
CREATE TRIGGER trg_payments_sync_order_after_update
AFTER UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION trg_payments_sync_order();

-- Keep seller ledger linked with order items.

-- PostgreSQL trigger function for seller_ledger/order_items sync
CREATE OR REPLACE FUNCTION trg_order_items_ledger_upsert() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO seller_ledger (id, seller_id, order_item_id, entry_type, amount, note, created_at)
    VALUES (uuid_generate_v4(), NEW.seller_id, NEW.id, 'sale_credit', NEW.line_total, 'Auto credit for order item ' || NEW.id, CURRENT_TIMESTAMP)
    ON CONFLICT (order_item_id, entry_type) DO UPDATE
    SET seller_id = EXCLUDED.seller_id,
        amount = EXCLUDED.amount,
        note = EXCLUDED.note;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_order_items_ledger_delete() RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM seller_ledger
    WHERE order_item_id = OLD.id AND entry_type = 'sale_credit';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_items_ledger_after_insert ON order_items;
CREATE TRIGGER trg_order_items_ledger_after_insert
AFTER INSERT ON order_items
FOR EACH ROW EXECUTE FUNCTION trg_order_items_ledger_upsert();

DROP TRIGGER IF EXISTS trg_order_items_ledger_after_update ON order_items;
CREATE TRIGGER trg_order_items_ledger_after_update
AFTER UPDATE ON order_items
FOR EACH ROW EXECUTE FUNCTION trg_order_items_ledger_upsert();

DROP TRIGGER IF EXISTS trg_order_items_ledger_after_delete ON order_items;
CREATE TRIGGER trg_order_items_ledger_after_delete
AFTER DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION trg_order_items_ledger_delete();

-- =========================
-- Phase 1: Core Users
-- =========================
INSERT INTO users (email, password_hash, role, status, is_email_verified, created_at, updated_at) VALUES
('admin1@com', 'admin@123', 'admin', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('admin2@com', 'admin@123', 'admin', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('customer1@com', 'pass123', 'customer', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('customer2@com', 'pass123', 'customer', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('customer3@com', 'pass123', 'customer', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('customer4@com', 'pass123', 'customer', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('customer5@com', 'pass123', 'customer', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('customer6@com', 'pass123', 'customer', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('customer7@com', 'pass123', 'customer', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('customer8@com', 'pass123', 'customer', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('seller1@com', 'seller@123', 'seller', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('seller2@com', 'seller@123', 'seller', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('seller3@com', 'seller@123', 'seller', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('seller4@com', 'seller@123', 'seller', 'pending', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
;

-- Extra demo users for quick UI/API verification
INSERT INTO users (email, password_hash, role, status, is_email_verified, created_at, updated_at) VALUES
('admin3@com', 'admin@123', 'admin', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('seller5@com', 'seller@123', 'seller', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('customer9@com', 'pass123', 'customer', 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
;

-- =========================
-- Phase 2: Customer Profiles
-- =========================
INSERT INTO customer_profiles (user_id, first_name, last_name, phone, gender, date_of_birth, average_rating, total_reviews)
SELECT id, 'Customer', 'One', '01711111111', 'M', '1990-01-01', 4.5, 15
FROM users WHERE email = 'customer1@com'
;

INSERT INTO customer_profiles (user_id, first_name, last_name, phone, gender, date_of_birth, average_rating, total_reviews)
SELECT id, 'Customer', 'Two', '01712222222', 'F', '1992-05-15', 4.3, 8
FROM users WHERE email = 'customer2@com'
;

INSERT INTO customer_profiles (user_id, first_name, last_name, phone, gender, date_of_birth, average_rating, total_reviews)
SELECT id, 'Customer', 'Three', '01713333333', 'M', '1995-03-20', 4.8, 22
FROM users WHERE email = 'customer3@com'
;

INSERT INTO customer_profiles (user_id, first_name, last_name, phone, gender, date_of_birth, average_rating, total_reviews)
SELECT id, 'Customer', 'Four', '01714444444', 'F', '1988-07-10', 3.9, 5
FROM users WHERE email = 'customer4@com'
;

INSERT INTO customer_profiles (user_id, first_name, last_name, phone, gender, date_of_birth, average_rating, total_reviews)
SELECT id, 'Customer', 'Five', '01715555555', 'M', '1993-11-25', 4.6, 18
FROM users WHERE email = 'customer5@com'
;

INSERT INTO customer_profiles (user_id, first_name, last_name, phone, gender, date_of_birth, average_rating, total_reviews)
SELECT id, 'Customer', 'Six', '01716666666', 'F', '1997-02-14', 4.2, 12
FROM users WHERE email = 'customer6@com'
;

INSERT INTO customer_profiles (user_id, first_name, last_name, phone, gender, date_of_birth, average_rating, total_reviews)
SELECT id, 'Customer', 'Seven', '01717777777', 'M', '1991-08-30', 4.7, 25
FROM users WHERE email = 'customer7@com'
;

INSERT INTO customer_profiles (user_id, first_name, last_name, phone, gender, date_of_birth, average_rating, total_reviews)
SELECT id, 'Customer', 'Eight', '01718888888', 'F', '1994-06-12', 4.4, 14
FROM users WHERE email = 'customer8@com'
;

-- =========================
-- Phase 3: Seller Profiles
-- =========================
INSERT INTO seller_profiles (user_id, shop_name, shop_description, shop_logo, seller_rating, total_sales, is_verified, verification_status)
SELECT id, 'Tech World', 'Premium electronics and gadgets seller', '/uploads/seller1_logo.png', 4.6, 1250, true, 'verified'
FROM users WHERE email = 'seller1@com'
;

INSERT INTO seller_profiles (user_id, shop_name, shop_description, shop_logo, seller_rating, total_sales, is_verified, verification_status)
SELECT id, 'Fashion Hub', 'Latest fashion trends and clothing', '/uploads/seller2_logo.png', 4.4, 980, true, 'verified'
FROM users WHERE email = 'seller2@com'
;

INSERT INTO seller_profiles (user_id, shop_name, shop_description, shop_logo, seller_rating, total_sales, is_verified, verification_status)
SELECT id, 'Home Essentials', 'Home decor and appliances', '/uploads/seller3_logo.png', 4.7, 1580, true, 'verified'
FROM users WHERE email = 'seller3@com'
;

INSERT INTO seller_profiles (user_id, shop_name, shop_description, shop_logo, seller_rating, total_sales, is_verified, verification_status)
SELECT id, 'New Store', 'Pending verification', '/uploads/seller4_logo.png', 0, 0, false, 'pending'
FROM users WHERE email = 'seller4@com'
;

INSERT INTO seller_profiles (user_id, shop_name, shop_description, shop_logo, seller_rating, total_sales, is_verified, verification_status)
SELECT id, 'Gadget Point', 'Accessories and daily-use gadgets', '/uploads/seller5_logo.png', 4.1, 210, true, 'verified'
FROM users WHERE email = 'seller5@com'
;

INSERT INTO customer_profiles (user_id, first_name, last_name, phone, gender, date_of_birth, average_rating, total_reviews)
SELECT id, 'Customer', 'Nine', '01719999999', 'F', '1996-09-09', 4.5, 10
FROM users WHERE email = 'customer9@com'
;

-- =========================
-- Phase 4: Customer Addresses
-- =========================
INSERT INTO customer_addresses (user_id, first_name, last_name, phone, email, street_address, city, state, postal_code, country, is_default, is_billing, is_shipping)
SELECT id, 'Customer', 'One', '01711111111', 'customer1@com', '123 Main Street', 'Dhaka', 'Dhaka', '1207', 'Bangladesh', true, true, true
FROM users WHERE email = 'customer1@com'
;

INSERT INTO customer_addresses (user_id, first_name, last_name, phone, email, street_address, city, state, postal_code, country, is_default, is_billing, is_shipping)
SELECT id, 'Customer', 'Two', '01712222222', 'customer2@com', '456 Oak Avenue', 'Chittagong', 'Chittagong', '4100', 'Bangladesh', true, true, true
FROM users WHERE email = 'customer2@com'
;

INSERT INTO customer_addresses (user_id, first_name, last_name, phone, email, street_address, city, state, postal_code, country, is_default, is_billing, is_shipping)
SELECT id, 'Customer', 'Three', '01713333333', 'customer3@com', '789 Pine Road', 'Sylhet', 'Sylhet', '3100', 'Bangladesh', true, true, true
FROM users WHERE email = 'customer3@com'
;

-- =========================
-- Phase 5: Categories & Brands
-- =========================
INSERT INTO categories (name, slug, description, image_url, parent_category_id, commission_percentage) VALUES
('Electronics', 'electronics', 'Electronic devices and gadgets', '/uploads/electronics.jpg', NULL, 5.0),
('Fashion', 'fashion', 'Clothing, shoes, and accessories', '/uploads/fashion.jpg', NULL, 4.5),
('Home & Garden', 'home-garden', 'Home decor and furniture', '/uploads/home.jpg', NULL, 4.0),
('Books', 'books', 'Books and e-books', '/uploads/books.jpg', NULL, 3.0),
('Sports', 'sports', 'Sports equipment and apparel', '/uploads/sports.jpg', NULL, 4.5),
('Beauty', 'beauty', 'Beauty and personal care products', '/uploads/beauty.jpg', NULL, 5.5)
;

INSERT INTO brands (name, slug, description, logo_url) VALUES
('Samsung', 'samsung', 'Samsung Electronics', '/uploads/samsung.png'),
('Apple', 'apple', 'Apple Inc.', '/uploads/apple.png'),
('Nike', 'nike', 'Nike Inc.', '/uploads/nike.png'),
('IKEA', 'ikea', 'IKEA Furniture', '/uploads/ikea.png'),
('Penguin', 'penguin', 'Penguin Books', '/uploads/penguin.png'),
('L\'Oreal', 'loreal', 'L\'Oreal Beauty', '/uploads/loreal.png')
;

-- =========================
-- Phase 6: Products & Variants
-- =========================
INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, stock_quantity, status, is_returnable, return_days_limit)
SELECT s.id, c.id, b.id, 'Samsung Galaxy S23', 'samsung-galaxy-s23', 'Latest Samsung flagship smartphone', 85000, 50, 'active', true, 14
FROM users s, categories c, brands b
WHERE s.email = 'seller1@com' AND c.name = 'Electronics' AND b.name = 'Samsung'
;

INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, stock_quantity, status, is_returnable, return_days_limit)
SELECT s.id, c.id, b.id, 'Apple iPhone 15', 'apple-iphone-15', 'Premium Apple smartphone', 120000, 30, 'active', true, 14
FROM users s, categories c, brands b
WHERE s.email = 'seller1@com' AND c.name = 'Electronics' AND b.name = 'Apple'
;

INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, stock_quantity, status, is_returnable, return_days_limit)
SELECT s.id, c.id, b.id, 'Nike Air Max 90', 'nike-air-max-90', 'Iconic Nike sneakers', 12000, 100, 'active', true, 30
FROM users s, categories c, brands b
WHERE s.email = 'seller2@com' AND c.name = 'Fashion' AND b.name = 'Nike'
;

INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, stock_quantity, status, is_returnable, return_days_limit)
SELECT s.id, c.id, b.id, 'IKEA Minimalist Chair', 'ikea-minimalist-chair', 'Modern Scandinavian design chair', 8500, 75, 'active', true, 30
FROM users s, categories c, brands b
WHERE s.email = 'seller3@com' AND c.name = 'Home & Garden' AND b.name = 'IKEA'
;

INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, stock_quantity, status, is_returnable, return_days_limit)
SELECT s.id, c.id, b.id, 'The Great Gatsby', 'the-great-gatsby', 'Classic American novel', 450, 200, 'active', true, 30
FROM users s, categories c, brands b
WHERE s.email = 'seller1@com' AND c.name = 'Books' AND b.name = 'Penguin'
;

INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, stock_quantity, status, is_returnable, return_days_limit)
SELECT s.id, c.id, b.id, 'L\'Oreal Paris Shampoo', 'loreal-paris-shampoo', 'Premium hair care product', 1200, 150, 'active', true, 30
FROM users s, categories c, brands b
WHERE s.email = 'seller2@com' AND c.name = 'Beauty' AND b.name = 'L\'Oreal'
;

-- =========================
-- Phase 7: Product Variants
-- =========================
INSERT INTO product_variants (product_id, sku, variant_name, color, size, stock_quantity, price, created_at, updated_at)
SELECT p.id, 'DMY-SKU-001', 'Black 256GB', 'Black', '256GB', 25, 85000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM products p WHERE p.name = 'Samsung Galaxy S23' LIMIT 1
;

INSERT INTO product_variants (product_id, sku, variant_name, color, size, stock_quantity, price, created_at, updated_at)
SELECT p.id, 'DMY-SKU-002', 'Silver 512GB', 'Silver', '512GB', 25, 95000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM products p WHERE p.name = 'Samsung Galaxy S23' LIMIT 1
;

INSERT INTO product_variants (product_id, sku, variant_name, color, size, stock_quantity, price, created_at, updated_at)
SELECT p.id, 'DMY-SKU-003', 'Gold 128GB', 'Gold', '128GB', 30, 120000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM products p WHERE p.name = 'Apple iPhone 15' LIMIT 1
;

INSERT INTO product_variants (product_id, sku, variant_name, color, size, stock_quantity, price, created_at, updated_at)
SELECT p.id, 'DMY-SKU-004', 'Red Size 10', 'Red', '10', 50, 12000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM products p WHERE p.name = 'Nike Air Max 90' LIMIT 1
;

INSERT INTO product_variants (product_id, sku, variant_name, color, size, stock_quantity, price, created_at, updated_at)
SELECT p.id, 'DMY-SKU-005', 'White Size 8', 'White', '8', 50, 12000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM products p WHERE p.name = 'Nike Air Max 90' LIMIT 1
;

INSERT INTO product_variants (product_id, sku, variant_name, color, size, stock_quantity, price, created_at, updated_at)
SELECT p.id, 'DMY-SKU-006', 'Black Wood', 'Black', 'Standard', 40, 8500, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM products p WHERE p.name = 'IKEA Minimalist Chair' LIMIT 1
;

-- =========================
-- Phase 8: Product Images
-- =========================
INSERT INTO product_images (product_id, image_url, alt_text, is_primary, display_order)
SELECT id, '/uploads/products/samsung-galaxy-s23-1.jpg', 'Samsung Galaxy S23 Front View', true, 1 FROM products WHERE name = 'Samsung Galaxy S23'
;

INSERT INTO product_images (product_id, image_url, alt_text, is_primary, display_order)
SELECT id, '/uploads/products/apple-iphone-15-1.jpg', 'Apple iPhone 15 Front View', true, 1 FROM products WHERE name = 'Apple iPhone 15'
;

INSERT INTO product_images (product_id, image_url, alt_text, is_primary, display_order)
SELECT id, '/uploads/products/nike-air-max-90-1.jpg', 'Nike Air Max 90 Side View', true, 1 FROM products WHERE name = 'Nike Air Max 90'
;

-- =========================
-- Homepage Clothing Catalog Seeds
-- =========================
INSERT INTO categories (name, slug, description, parent_id, is_active) VALUES
('Men', 'men', 'Clothing for men', NULL, true),
('Women', 'women', 'Clothing for women', NULL, true),
('Kids', 'kids', 'Clothing for kids', NULL, true),
('Accessories', 'accessories', 'Clothing accessories and finishing pieces', NULL, true)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description),
    is_active = VALUES(is_active);

INSERT INTO brands (name, slug) VALUES
('Lumina Basics', 'lumina-basics'),
('Aurora Wear', 'aurora-wear'),
('Tiny Thread', 'tiny-thread'),
('Accessory Lane', 'accessory-lane')
ON DUPLICATE KEY UPDATE
    name = VALUES(name);

INSERT INTO seller_profiles (user_id, store_name, store_slug, business_email, business_phone, tax_number, kyc_status, rating, total_reviews)
SELECT id, 'Lumina Fashion House', 'lumina-fashion-house', 'seller2@com', '01720000002', 'TIN-FASHION-02', 'verified', 4.7, 142
FROM users WHERE email = 'seller2@com'
ON DUPLICATE KEY UPDATE
    store_name = VALUES(store_name),
    store_slug = VALUES(store_slug),
    business_email = VALUES(business_email),
    business_phone = VALUES(business_phone),
    tax_number = VALUES(tax_number),
    kyc_status = VALUES(kyc_status),
    rating = VALUES(rating),
    total_reviews = VALUES(total_reviews);

INSERT INTO seller_profiles (user_id, store_name, store_slug, business_email, business_phone, tax_number, kyc_status, rating, total_reviews)
SELECT id, 'Urban Wear Studio', 'urban-wear-studio', 'seller3@com', '01720000003', 'TIN-FASHION-03', 'verified', 4.6, 118
FROM users WHERE email = 'seller3@com'
ON DUPLICATE KEY UPDATE
    store_name = VALUES(store_name),
    store_slug = VALUES(store_slug),
    business_email = VALUES(business_email),
    business_phone = VALUES(business_phone),
    tax_number = VALUES(tax_number),
    kyc_status = VALUES(kyc_status),
    rating = VALUES(rating),
    total_reviews = VALUES(total_reviews);

INSERT INTO seller_profiles (user_id, store_name, store_slug, business_email, business_phone, tax_number, kyc_status, rating, total_reviews)
SELECT id, 'Accessory Lane', 'accessory-lane-store', 'seller5@com', '01720000005', 'TIN-FASHION-05', 'verified', 4.5, 96
FROM users WHERE email = 'seller5@com'
ON DUPLICATE KEY UPDATE
    store_name = VALUES(store_name),
    store_slug = VALUES(store_slug),
    business_email = VALUES(business_email),
    business_phone = VALUES(business_phone),
    tax_number = VALUES(tax_number),
    kyc_status = VALUES(kyc_status),
    rating = VALUES(rating),
    total_reviews = VALUES(total_reviews);

INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, compare_price, currency, sku, status, is_featured, average_rating, total_reviews)
SELECT s.id, c.id, b.id, 'Men Essential Tee', 'men-essential-tee', 'Soft everyday tee with a clean fit', 899, 1299, 'BDT', 'FASH-MEN-001', 'active', true, 4.8, 320
FROM users s
JOIN categories c ON c.slug = 'men'
JOIN brands b ON b.slug = 'lumina-basics'
WHERE s.email = 'seller2@com'
ON DUPLICATE KEY UPDATE
    seller_id = VALUES(seller_id),
    category_id = VALUES(category_id),
    brand_id = VALUES(brand_id),
    description = VALUES(description),
    base_price = VALUES(base_price),
    compare_price = VALUES(compare_price),
    currency = VALUES(currency),
    sku = VALUES(sku),
    status = VALUES(status),
    is_featured = VALUES(is_featured),
    average_rating = VALUES(average_rating),
    total_reviews = VALUES(total_reviews);

INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, compare_price, currency, sku, status, is_featured, average_rating, total_reviews)
SELECT s.id, c.id, b.id, 'Relaxed Denim Jacket', 'relaxed-denim-jacket', 'Lightweight denim jacket for layered looks', 2599, 3499, 'BDT', 'FASH-MEN-002', 'active', true, 4.7, 258
FROM users s
JOIN categories c ON c.slug = 'men'
JOIN brands b ON b.slug = 'aurora-wear'
WHERE s.email = 'seller2@com'
ON DUPLICATE KEY UPDATE
    seller_id = VALUES(seller_id),
    category_id = VALUES(category_id),
    brand_id = VALUES(brand_id),
    description = VALUES(description),
    base_price = VALUES(base_price),
    compare_price = VALUES(compare_price),
    currency = VALUES(currency),
    sku = VALUES(sku),
    status = VALUES(status),
    is_featured = VALUES(is_featured),
    average_rating = VALUES(average_rating),
    total_reviews = VALUES(total_reviews);

INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, compare_price, currency, sku, status, is_featured, average_rating, total_reviews)
SELECT s.id, c.id, b.id, 'Women Summer Dress', 'women-summer-dress', 'Flowy summer dress with a soft finish', 1899, 2799, 'BDT', 'FASH-WOM-001', 'active', true, 4.9, 412
FROM users s
JOIN categories c ON c.slug = 'women'
JOIN brands b ON b.slug = 'aurora-wear'
WHERE s.email = 'seller2@com'
ON DUPLICATE KEY UPDATE
    seller_id = VALUES(seller_id),
    category_id = VALUES(category_id),
    brand_id = VALUES(brand_id),
    description = VALUES(description),
    base_price = VALUES(base_price),
    compare_price = VALUES(compare_price),
    currency = VALUES(currency),
    sku = VALUES(sku),
    status = VALUES(status),
    is_featured = VALUES(is_featured),
    average_rating = VALUES(average_rating),
    total_reviews = VALUES(total_reviews);

INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, compare_price, currency, sku, status, is_featured, average_rating, total_reviews)
SELECT s.id, c.id, b.id, 'Women Satin Blouse', 'women-satin-blouse', 'Elegant satin blouse for work and evenings', 1499, 2199, 'BDT', 'FASH-WOM-002', 'active', false, 4.6, 187
FROM users s
JOIN categories c ON c.slug = 'women'
JOIN brands b ON b.slug = 'lumina-basics'
WHERE s.email = 'seller2@com'
ON DUPLICATE KEY UPDATE
    seller_id = VALUES(seller_id),
    category_id = VALUES(category_id),
    brand_id = VALUES(brand_id),
    description = VALUES(description),
    base_price = VALUES(base_price),
    compare_price = VALUES(compare_price),
    currency = VALUES(currency),
    sku = VALUES(sku),
    status = VALUES(status),
    is_featured = VALUES(is_featured),
    average_rating = VALUES(average_rating),
    total_reviews = VALUES(total_reviews);

INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, compare_price, currency, sku, status, is_featured, average_rating, total_reviews)
SELECT s.id, c.id, b.id, 'Kids Graphic Hoodie', 'kids-graphic-hoodie', 'Warm hoodie with playful everyday graphics', 1399, 1999, 'BDT', 'FASH-KID-001', 'active', true, 4.8, 221
FROM users s
JOIN categories c ON c.slug = 'kids'
JOIN brands b ON b.slug = 'tiny-thread'
WHERE s.email = 'seller3@com'
ON DUPLICATE KEY UPDATE
    seller_id = VALUES(seller_id),
    category_id = VALUES(category_id),
    brand_id = VALUES(brand_id),
    description = VALUES(description),
    base_price = VALUES(base_price),
    compare_price = VALUES(compare_price),
    currency = VALUES(currency),
    sku = VALUES(sku),
    status = VALUES(status),
    is_featured = VALUES(is_featured),
    average_rating = VALUES(average_rating),
    total_reviews = VALUES(total_reviews);

INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, compare_price, currency, sku, status, is_featured, average_rating, total_reviews)
SELECT s.id, c.id, b.id, 'Kids Jogger Set', 'kids-jogger-set', 'Coordinated jogger set for daily wear', 1699, 2399, 'BDT', 'FASH-KID-002', 'active', false, 4.7, 165
FROM users s
JOIN categories c ON c.slug = 'kids'
JOIN brands b ON b.slug = 'tiny-thread'
WHERE s.email = 'seller3@com'
ON DUPLICATE KEY UPDATE
    seller_id = VALUES(seller_id),
    category_id = VALUES(category_id),
    brand_id = VALUES(brand_id),
    description = VALUES(description),
    base_price = VALUES(base_price),
    compare_price = VALUES(compare_price),
    currency = VALUES(currency),
    sku = VALUES(sku),
    status = VALUES(status),
    is_featured = VALUES(is_featured),
    average_rating = VALUES(average_rating),
    total_reviews = VALUES(total_reviews);

INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, compare_price, currency, sku, status, is_featured, average_rating, total_reviews)
SELECT s.id, c.id, b.id, 'Classic Leather Belt', 'classic-leather-belt', 'Polished leather belt for everyday styling', 799, 1199, 'BDT', 'FASH-ACC-001', 'active', true, 4.6, 144
FROM users s
JOIN categories c ON c.slug = 'accessories'
JOIN brands b ON b.slug = 'accessory-lane'
WHERE s.email = 'seller5@com'
ON DUPLICATE KEY UPDATE
    seller_id = VALUES(seller_id),
    category_id = VALUES(category_id),
    brand_id = VALUES(brand_id),
    description = VALUES(description),
    base_price = VALUES(base_price),
    compare_price = VALUES(compare_price),
    currency = VALUES(currency),
    sku = VALUES(sku),
    status = VALUES(status),
    is_featured = VALUES(is_featured),
    average_rating = VALUES(average_rating),
    total_reviews = VALUES(total_reviews);

INSERT INTO products (seller_id, category_id, brand_id, name, slug, description, base_price, compare_price, currency, sku, status, is_featured, average_rating, total_reviews)
SELECT s.id, c.id, b.id, 'Canvas Tote Bag', 'canvas-tote-bag', 'Spacious tote bag for daily use and travel', 999, 1499, 'BDT', 'FASH-ACC-002', 'active', false, 4.5, 128
FROM users s
JOIN categories c ON c.slug = 'accessories'
JOIN brands b ON b.slug = 'accessory-lane'
WHERE s.email = 'seller5@com'
ON DUPLICATE KEY UPDATE
    seller_id = VALUES(seller_id),
    category_id = VALUES(category_id),
    brand_id = VALUES(brand_id),
    description = VALUES(description),
    base_price = VALUES(base_price),
    compare_price = VALUES(compare_price),
    currency = VALUES(currency),
    sku = VALUES(sku),
    status = VALUES(status),
    is_featured = VALUES(is_featured),
    average_rating = VALUES(average_rating),
    total_reviews = VALUES(total_reviews);

INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order)
SELECT id, 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&q=80&w=1200', 'Men Essential Tee', true, 1 FROM products WHERE slug = 'men-essential-tee'
;

INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order)
SELECT id, 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=1200', 'Relaxed Denim Jacket', true, 1 FROM products WHERE slug = 'relaxed-denim-jacket'
;

INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order)
SELECT id, 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=1200', 'Women Summer Dress', true, 1 FROM products WHERE slug = 'women-summer-dress'
;

INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order)
SELECT id, 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=1200', 'Women Satin Blouse', true, 1 FROM products WHERE slug = 'women-satin-blouse'
;

INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order)
SELECT id, 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=1200', 'Kids Graphic Hoodie', true, 1 FROM products WHERE slug = 'kids-graphic-hoodie'
;

INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order)
SELECT id, 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&q=80&w=1200', 'Kids Jogger Set', true, 1 FROM products WHERE slug = 'kids-jogger-set'
;

INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order)
SELECT id, 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&q=80&w=1200', 'Classic Leather Belt', true, 1 FROM products WHERE slug = 'classic-leather-belt'
;

INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order)
SELECT id, 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=1200', 'Canvas Tote Bag', true, 1 FROM products WHERE slug = 'canvas-tote-bag'
;

-- Ensure every product has at least one image record.
INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary, created_at)
SELECT
    p.id,
    'https://via.placeholder.com/1200x1200?text=Product',
    COALESCE(NULLIF(p.name, ''), 'Product Image'),
    999,
    FALSE,
    CURRENT_TIMESTAMP
FROM products p
WHERE NOT EXISTS (
    SELECT 1
    FROM product_images pi
    WHERE pi.product_id = p.id
);

-- =========================
-- Phase 9: Carts & Cart Items
-- =========================
INSERT INTO carts (user_id, total_items, total_price)
SELECT id, 0, 0 FROM users WHERE role = 'customer'
;

INSERT INTO cart_items (cart_id, product_id, variant_id, quantity, price_per_unit, subtotal)
SELECT c.id, p.id, pv.id, 1, 85000, 85000
FROM carts c
JOIN users u ON c.user_id = u.id
JOIN products p ON p.name = 'Samsung Galaxy S23'
JOIN product_variants pv ON pv.product_id = p.id AND pv.color = 'Black'
WHERE u.email = 'customer1@com' LIMIT 1
;

-- =========================
-- Phase 10: Orders & Order Items
-- =========================
INSERT INTO orders (user_id, seller_id, order_number, total_amount, tax_amount, shipping_cost, discount_amount, status, shipping_address, created_at, updated_at)
SELECT c.id, s.id, 'DMY-ORD-' || LPAD(ROW_NUMBER() OVER (ORDER BY c.id), 6, '0'), 85000, 8500, 500, 0, 'delivered', '123 Main Street, Dhaka', CURRENT_TIMESTAMP - INTERVAL 30 DAY, CURRENT_TIMESTAMP
FROM users c, users s
WHERE c.email = 'customer1@com' AND s.email = 'seller1@com' LIMIT 1
;

INSERT INTO orders (user_id, seller_id, order_number, total_amount, tax_amount, shipping_cost, discount_amount, status, shipping_address, created_at, updated_at)
SELECT c.id, s.id, 'DMY-ORD-' || LPAD(ROW_NUMBER() OVER (ORDER BY c.id), 6, '0'), 12000, 1200, 300, 0, 'shipped', '456 Oak Avenue, Chittagong', CURRENT_TIMESTAMP - INTERVAL 7 DAY, CURRENT_TIMESTAMP
FROM users c, users s
WHERE c.email = 'customer2@com' AND s.email = 'seller2@com' LIMIT 1
;

INSERT INTO orders (user_id, seller_id, order_number, total_amount, tax_amount, shipping_cost, discount_amount, status, shipping_address, created_at, updated_at)
SELECT c.id, s.id, 'DMY-ORD-' || LPAD(ROW_NUMBER() OVER (ORDER BY c.id), 6, '0'), 8500, 850, 400, 1000, 'pending', '789 Pine Road, Sylhet', CURRENT_TIMESTAMP - INTERVAL 1 DAY, CURRENT_TIMESTAMP
FROM users c, users s
WHERE c.email = 'customer3@com' AND s.email = 'seller3@com' LIMIT 1
;

INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, subtotal, seller_id)
SELECT o.id, p.id, pv.id, 1, 85000, 85000, s.id
FROM orders o
JOIN users c ON o.user_id = c.id
JOIN users s ON o.seller_id = s.id
JOIN products p ON p.name = 'Samsung Galaxy S23'
JOIN product_variants pv ON pv.product_id = p.id AND pv.color = 'Black'
WHERE c.email = 'customer1@com' LIMIT 1
;

-- =========================
-- Phase 11: Payments
-- =========================
INSERT INTO payments (order_id, payment_method, amount, status, transaction_id, created_at, updated_at)
SELECT o.id, 'credit_card', 85000 + 8500 + 500, 'paid', 'TRANS-' || SUBSTR(MD5(RAND()), 1, 16), CURRENT_TIMESTAMP - INTERVAL 30 DAY, CURRENT_TIMESTAMP
FROM orders o
JOIN users c ON o.user_id = c.id
WHERE c.email = 'customer1@com' LIMIT 1
;

INSERT INTO payments (order_id, payment_method, amount, status, transaction_id, created_at, updated_at)
SELECT o.id, 'debit_card', 12000 + 1200 + 300, 'paid', 'TRANS-' || SUBSTR(MD5(RAND()), 1, 16), CURRENT_TIMESTAMP - INTERVAL 7 DAY, CURRENT_TIMESTAMP
FROM orders o
JOIN users c ON o.user_id = c.id
WHERE c.email = 'customer2@com' LIMIT 1
;

-- =========================
-- Phase 12: Shipments
-- =========================
INSERT INTO shipments (order_id, courier_id, tracking_number, status, shipped_date, estimated_delivery_date, actual_delivery_date, created_at, updated_at)
SELECT o.id, 1, 'TRK-' || SUBSTR(MD5(RAND()), 1, 12), 'delivered', CURRENT_TIMESTAMP - INTERVAL 29 DAY, CURRENT_TIMESTAMP - INTERVAL 25 DAY, CURRENT_TIMESTAMP - INTERVAL 25 DAY, CURRENT_TIMESTAMP - INTERVAL 29 DAY, CURRENT_TIMESTAMP
FROM orders o
JOIN users c ON o.user_id = c.id
WHERE c.email = 'customer1@com' LIMIT 1
;

INSERT INTO shipments (order_id, courier_id, tracking_number, status, shipped_date, estimated_delivery_date, created_at, updated_at)
SELECT o.id, 2, 'TRK-' || SUBSTR(MD5(RAND()), 1, 12), 'in_transit', CURRENT_TIMESTAMP - INTERVAL 5 DAY, CURRENT_TIMESTAMP + INTERVAL 2 DAY, CURRENT_TIMESTAMP - INTERVAL 5 DAY, CURRENT_TIMESTAMP
FROM orders o
JOIN users c ON o.user_id = c.id
WHERE c.email = 'customer2@com' LIMIT 1
;

-- =========================
-- Phase 13: Product Reviews
-- =========================
INSERT INTO product_reviews (product_id, user_id, order_id, rating, review_text, helpful_count, created_at)
SELECT p.id, c.id, o.id, 5, 'Excellent product! Great quality and fast delivery.', 12, CURRENT_TIMESTAMP - INTERVAL 20 DAY
FROM products p, users c, orders o
WHERE p.name = 'Samsung Galaxy S23' AND c.email = 'customer1@com' AND o.user_id = c.id LIMIT 1
;

INSERT INTO product_reviews (product_id, user_id, order_id, rating, review_text, helpful_count, created_at)
SELECT p.id, c.id, o.id, 4, 'Good product. Comfortable and stylish shoes.', 8, CURRENT_TIMESTAMP - INTERVAL 3 DAY
FROM products p, users c, orders o
WHERE p.name = 'Nike Air Max 90' AND c.email = 'customer2@com' AND o.user_id = c.id LIMIT 1
;

-- =========================
-- Phase 14: Support Tickets (public)
-- =========================
INSERT INTO support_tickets (ticket_number, user_id, order_id, ticket_type, category, subject, description, status, priority, assigned_to, created_at, updated_at)
SELECT 'SPT-' || LPAD(ROW_NUMBER() OVER (ORDER BY u.id), 6, '0'), u.id, o.id, 'customer', 'order_issue', 'Product damaged on delivery', 'Received the item with damaged packaging', 'resolved', 'high', NULL, CURRENT_TIMESTAMP - INTERVAL 15 DAY, CURRENT_TIMESTAMP - INTERVAL 10 DAY
FROM users u, orders o
WHERE u.email = 'customer1@com' AND o.user_id = u.id LIMIT 1
;

-- =========================
-- Phase 15: Notifications
-- =========================
INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
SELECT u.id, 'order_shipped', 'Order Shipped', 'Your order has been shipped. Track it now!', false, CURRENT_TIMESTAMP - INTERVAL 5 DAY
FROM users u WHERE u.email = 'customer2@com'
;

INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
SELECT u.id, 'payment_received', 'Payment Received', 'Payment for your order received successfully', true, CURRENT_TIMESTAMP - INTERVAL 30 DAY
FROM users u WHERE u.email = 'customer1@com'
;

COMMIT;


