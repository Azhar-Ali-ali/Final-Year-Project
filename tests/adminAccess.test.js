const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePermissions, hasPermission } = require('../Front_End/Admin/js/adminAccess');

test('normalizePermissions trims and lowercases stored permissions', () => {
  assert.deepStrictEqual(normalizePermissions([' Dashboard.View ', 'orders.edit']), ['dashboard.view', 'orders.edit']);
});

test('hasPermission grants wildcard and exact access', () => {
  assert.equal(hasPermission(['*'], 'orders.view'), true);
  assert.equal(hasPermission(['dashboard.view', 'orders.edit'], 'orders.edit'), true);
  assert.equal(hasPermission(['dashboard.view'], 'orders.edit'), false);
});
