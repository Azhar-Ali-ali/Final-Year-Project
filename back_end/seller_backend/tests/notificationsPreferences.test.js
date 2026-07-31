const test = require('node:test');
const assert = require('node:assert/strict');
const paymentsRoutes = require('../src/routes/paymentsRoutes');

test('createSellerNotification skips notifications when the seller disables that channel', async () => {
  const calls = [];
  const req = {
    db: {
      async query(sql, params) {
        calls.push({ sql: String(sql), params });
        if (String(sql).includes('FROM lumina.user_preferences')) {
          return { rows: [{ email_notifications: false, sms_notifications: false, push_notifications: false, marketing_opt_in: true }] };
        }
        return { rows: [] };
      }
    }
  };

  const result = await paymentsRoutes.__testCreateSellerNotification(req, 'seller-1', 'Test', 'Body', 'info', {}, 'orderAlerts');

  assert.equal(result, null);
  assert.equal(calls.filter((call) => String(call.sql).includes('INSERT INTO public.notifications')).length, 0);
});
