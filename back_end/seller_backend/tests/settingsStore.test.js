const test = require('node:test');
const assert = require('node:assert/strict');
const settingsData = require('../src/data/settingsData');

test('updateStoreSettings updates an existing store address record and persists category when available', async () => {
  const calls = [];
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql: String(sql), params });

      if (String(sql).includes('FROM pg_class') && String(sql).includes('seller_profiles')) {
        return { rows: [{ schema_name: 'public', table_name: 'seller_profiles' }] };
      }

      if (String(sql).includes('FROM pg_class') && String(sql).includes('users')) {
        return { rows: [{ schema_name: 'public', table_name: 'users' }] };
      }

      if (String(sql).includes('information_schema.columns')) {
        return { rows: [{ exists: true }] };
      }

      if (String(sql).includes('SELECT') && String(sql).includes('FROM public.users') && String(sql).includes('LEFT JOIN public.seller_profiles')) {
        return {
          rows: [{
            id: 'seller-1',
            full_name: 'Store Owner',
            email: 'owner@example.com',
            phone: '1234567890',
            status: 'active',
            last_login_at: null,
            created_at: null,
            store_name: 'Old Store',
            business_email: 'store@example.com',
            business_phone: '1111111111',
            tax_number: null,
            kyc_status: 'verified',
            rating: 0,
            total_reviews: 0,
            support_email: 'store@example.com',
            support_phone: '1111111111',
            return_policy: 'Old policy',
            shipping_policy: 'Old shipping',
            store_banner_url: null,
            store_logo_url: null,
            vacation_mode: false,
            line1: 'Old Address',
            line2: null,
            city: 'Dhaka',
            state: 'Dhaka',
            postal_code: '1212',
            country: 'Bangladesh',
            receiver_name: null,
            address_phone: null,
            is_default: true,
            category_name: 'Accessories'
          }]
        };
      }

      if (String(sql).includes('SELECT') && String(sql).includes('FROM lumina.user_addresses')) {
        return { rows: [{ id: 'address-1' }] };
      }

      if (String(sql).includes('SELECT') && String(sql).includes('FROM lumina.seller_bank_accounts')) {
        return { rows: [] };
      }

      return { rows: [] };
    }
  };

  await settingsData.updateStoreSettings(fakeDb, 'seller-1', {
    businessName: 'Fresh Store',
    category: 'Men',
    description: 'Updated description',
    address: 'New Address',
    city: 'Chittagong',
    state: 'Chattogram',
    postalCode: '4000',
    country: 'Bangladesh',
    storePhone: '01700000000',
    storeEmail: 'fresh@example.com'
  });

  const addressUpdate = calls.find((call) => String(call.sql).includes('UPDATE lumina.user_addresses'));
  const categoryUpdate = calls.find((call) => String(call.sql).includes('business_category') || String(call.sql).includes('category'));

  assert.ok(addressUpdate, 'Expected a store address update query for existing address records');
  assert.ok(categoryUpdate, 'Expected the store update flow to persist category information');
});
