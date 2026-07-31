const test = require('node:test');
const assert = require('node:assert/strict');
const settingsData = require('../src/data/settingsData');

test('changePassword verifies the current password and stores a database-hash using crypt', async () => {
  const calls = [];
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params });

      if (String(sql).includes('information_schema.columns')) {
        return { rows: [{ exists: true }] };
      }

      if (String(sql).includes('SELECT') && String(sql).includes('password_hash')) {
        return { rows: [{ id: 'seller-1' }] };
      }

      return { rows: [] };
    }
  };

  await settingsData.changePassword(fakeDb, 'seller-1', 'Current123', 'NewPass123');

  const currentPasswordCheck = calls.find((call) => {
    const sql = String(call.sql || '');
    return sql.includes('SELECT') && sql.includes('password_hash') && call.params && call.params.includes('Current123');
  });

  assert.ok(currentPasswordCheck, 'Expected a current-password verification query before updating the password');

  const passwordUpdate = calls.find((call) => {
    const sql = String(call.sql || '');
    return sql.includes('UPDATE') && sql.includes('password_hash') && sql.includes('crypt(');
  });

  assert.ok(passwordUpdate, 'Expected the password update query to store a crypt-compatible hash');
});
