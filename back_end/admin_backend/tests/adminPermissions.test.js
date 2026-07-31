const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAdminPermissions } = require('../src/auth/adminPermissions');

test('buildAdminPermissions reads role permissions from the current admin_roles schema', async () => {
  const fakeDb = {
    query: async (sql, params = []) => {
      if (sql.includes('FROM admin_roles') && sql.includes('user_id')) {
        return {
          rows: [{ role_name: 'operations_manager' }]
        };
      }

      if (sql.includes('FROM role_permissions') && sql.includes('role_name')) {
        return {
          rows: [
            { permission_key: 'dashboard.view' },
            { permission_key: 'orders.view' },
            { permission_key: 'orders.approve' }
          ]
        };
      }

      return { rows: [] };
    }
  };

  const permissions = await buildAdminPermissions({ id: 'user-1', type: 'CO_ADMIN', roleName: 'operations_manager' }, fakeDb);

  assert.deepEqual(permissions, ['dashboard.view', 'orders.view', 'orders.approve']);
});

test('buildAdminPermissions exposes review-only permissions for review manager roles', async () => {
  const permissions = await buildAdminPermissions({ id: 'user-2', type: 'CO_ADMIN', roleName: 'review_manager' });

  assert.deepEqual(permissions, ['dashboard.view', 'reviews.view', 'reviews.approve']);
});
