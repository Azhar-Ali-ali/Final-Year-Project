const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyAdminPassword, listAdminAccounts } = require('../src/routes/adminAuthRoutes');
const { createOrUpdateCoAdminUser } = require('../src/routes/adminRolesRoutes');
const { buildAdminPermissions } = require('../src/auth/adminPermissions');

test('verifyAdminPassword accepts bcrypt hashes from the database', async () => {
  const req = {
    db: {
      query: async (sql, params) => {
        if (String(sql).includes('SELECT password_hash')) {
          return { rows: [{ password_hash: '$2a$06$OB7poDuBgZgsLKiMx.C8F.u/L7j7tX45BHYcc14ZntoRz2kjq0sqS' }] };
        }
        throw new Error('unexpected query');
      }
    }
  };

  const admin = {
    id: 'user-1',
    source: 'users',
    password_hash: '$2a$06$OB7poDuBgZgsLKiMx.C8F.u/L7j7tX45BHYcc14ZntoRz2kjq0sqS'
  };

  const result = await verifyAdminPassword(req, admin, 'Admin@123');
  assert.equal(result, true);
});

test('createOrUpdateCoAdminUser stores co-admins as admin users with a role assignment', async () => {
  const inserts = [];
  const req = {
    db: {
      query: async (sql, params) => {
        if (String(sql).includes('SELECT id, role, status FROM admins')) {
          return { rows: [] };
        }
        if (String(sql).includes('INSERT INTO admins')) {
          inserts.push({ sql, params });
          return { rows: [{ id: 3 }] };
        }
        if (String(sql).includes('INSERT INTO admin_roles')) {
          inserts.push({ sql, params });
          return { rows: [] };
        }
        throw new Error(`unexpected query: ${sql}`);
      }
    }
  };

  const userId = await createOrUpdateCoAdminUser(req, {
    email: 'coadmin@lumina.com',
    fullName: 'Co Admin User',
    phone: '1234567890',
    password: 'Admin@123',
    status: 'active'
  });

  assert.equal(userId, 3);
  assert.match(inserts[0].sql, /INSERT INTO admins/i);
  assert.match(inserts[0].sql, /password_hash/i);
});

test('findAdminByEmail returns co-admin users by role', async () => {
  const req = {
    db: {
      query: async (sql, params) => {
        if (String(sql).includes('FROM admins')) {
          return { rows: [] };
        }
        if (String(sql).includes('FROM users') && !String(sql).includes('FROM role_permissions')) {
          return {
            rows: [{
              id: 'user-2',
              full_name: 'Co Admin User',
              email: 'coadmin@lumina.com',
              role: 'admin',
              status: 'active',
              password_hash: 'plaintext',
              last_login_at: null,
              source: 'users'
            }]
          };
        }
        if (String(sql).includes('FROM admin_roles')) {
          return { rows: [] };
        }
        throw new Error(`unexpected query: ${sql}`);
      }
    }
  };

  const { findAdminByEmail } = require('../src/routes/adminAuthRoutes');
  const admin = await findAdminByEmail(req, 'coadmin@lumina.com');
  assert.equal(admin?.role, 'admin');
  assert.equal(admin?.email, 'coadmin@lumina.com');
});

test('findAdminByEmail returns co-admin users with assigned role_name from admin_roles', async () => {
  const req = {
    db: {
      query: async (sql, params) => {
        if (String(sql).includes('FROM admins')) {
          return { rows: [] };
        }
        if (String(sql).includes('FROM users') && !String(sql).includes('FROM role_permissions')) {
          return {
            rows: [{
              id: '1',
              full_name: 'Co Admin User',
              email: 'coadmin@lumina.com',
              role: 'admin',
              status: 'active',
              password_hash: 'plaintext',
              last_login_at: null,
              source: 'users'
            }]
          };
        }
        if (String(sql).includes('FROM admin_roles')) {
          return {
            rows: [{
              role_name: 'operations_manager',
              resolved_role_name: 'operations_manager',
              role_id: 2,
              admin_type: 'CO_ADMIN'
            }]
          };
        }
        throw new Error(`unexpected query: ${sql}`);
      }
    }
  };

  const { findAdminByEmail } = require('../src/routes/adminAuthRoutes');
  const admin = await findAdminByEmail(req, 'coadmin@lumina.com');
  assert.equal(admin?.role_name, 'operations_manager');
});

test('buildAdminPermissions falls back when admin_roles lacks role_name', async () => {
  const req = {
    db: {
      query: async (sql, params) => {
        if (String(sql).includes('FROM admin_roles')) {
          throw new Error('column "role_name" does not exist');
        }
        if (String(sql).includes('FROM users')) {
          return { rows: [{ id: 1 }] };
        }
        if (String(sql).includes('FROM role_permissions')) {
          return { rows: [{ permission_key: 'dashboard.view' }] };
        }
        throw new Error(`unexpected query: ${sql}`);
      }
    }
  };

  const permissions = await buildAdminPermissions({ id: 1, roleName: 'operations_manager', email: 'coadmin@lumina.com' }, req.db);
  assert.ok(permissions.includes('dashboard.view'));
});

test('listAdminAccounts returns sanitized admin records for the settings page', async () => {
  const req = {
    db: {
      query: async (sql, params) => {
        if (String(sql).includes('FROM admins')) {
          return {
            rows: [{
              id: 1,
              full_name: 'Co Admin User',
              email: 'coadmin@lumina.com',
              role: 'Product Manager',
              status: 'active',
              last_login_at: '2026-07-18T00:00:00.000Z',
              created_at: '2026-07-17T00:00:00.000Z'
            }]
          };
        }
        throw new Error(`unexpected query: ${sql}`);
      }
    }
  };

  const admins = await listAdminAccounts(req);
  assert.equal(admins[0].email, 'coadmin@lumina.com');
  assert.equal(admins[0].fullName, 'Co Admin User');
  assert.equal(admins[0].role, 'Product Manager');
});
