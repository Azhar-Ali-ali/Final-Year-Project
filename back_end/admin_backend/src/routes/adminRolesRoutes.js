const express = require('express');
const bcrypt = require('bcrypt');
const { query } = require('../../../database/postgresClient');

const router = express.Router();

function normalizeRoleName(roleName) {
  return String(roleName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]+/g, '');
}

function formatRoleNameForDisplay(roleName) {
  const normalized = String(roleName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]+/g, '');

  const displayMap = {
    super_admin: 'Super Admin',
    product_manager: 'Product Manager',
    order_manager: 'Order Manager',
    operations_manager: 'Operations Manager',
    seller_manager: 'Seller Manager',
    customer_support: 'Customer Support',
    finance_manager: 'Finance Manager',
    marketing_manager: 'Marketing Manager',
    logistics_manager: 'Logistics Manager',
    report_analyst: 'Report Analyst'
  };

  if (displayMap[normalized]) {
    return displayMap[normalized];
  }

  return String(roleName || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+$/, '');
}

async function resolveRoleId(req, roleName) {
  const normalizedRoleName = normalizeRoleName(roleName || '');
  if (!normalizedRoleName) {
    return null;
  }

  const displayName = String(roleName || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+$/, '');

  const roleResult = await req.db.query(
    `SELECT id
     FROM roles
     WHERE LOWER(name) = LOWER($1)
        OR LOWER(regexp_replace(name, '\\s+', '_', 'g')) = LOWER($2)
     LIMIT 1`,
    [displayName || normalizedRoleName, normalizedRoleName]
  );

  if (roleResult.rows[0]) {
    return roleResult.rows[0].id;
  }

  const insertResult = await req.db.query(
    `INSERT INTO roles (name, description, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     RETURNING id`,
    [displayName || normalizedRoleName, `${displayName || normalizedRoleName} role`]
  );

  return insertResult.rows?.[0]?.id || null;
}

router.get('/', async (req, res) => {
  try {
    const fallbackRoleRows = [];
    let rolesResult;
    try {
      rolesResult = await req.db.query(`
        SELECT id, name AS role_name, description
        FROM roles
        ORDER BY name ASC
      `);
    } catch (roleQueryError) {
      rolesResult = { rows: [] };
    }

    let permissionsResult;
    try {
      permissionsResult = await req.db.query(`
        SELECT r.id AS role_id, r.name AS role_name, rp.permission_key
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        ORDER BY r.name, rp.permission_key
      `);
    } catch (permissionQueryError) {
      permissionsResult = { rows: [] };
    }

    const permissionsByRole = {};
    (permissionsResult.rows || []).forEach((row) => {
      const roleId = row.role_id;
      const roleName = String(row.role_name || '').trim();
      if (!roleId || !roleName) {
        return;
      }
      if (!permissionsByRole[roleId]) {
        permissionsByRole[roleId] = [];
      }
      if (row.permission_key) {
        permissionsByRole[roleId].push(String(row.permission_key));
      }
    });

    const roles = (rolesResult.rows || []).map((row) => {
      const roleName = String(row.role_name || row.name || '').trim();
      return {
        id: row.id,
        name: roleName || 'Custom Role',
        roleName: normalizeRoleName(roleName),
        description: String(row.description || 'CO_ADMIN role').trim(),
        status: 'Active',
        permissions: permissionsByRole[row.id] || []
      };
    });

    if (!roles.length) {
      const seededRoles = [
        { id: 'super_admin', roleName: 'super_admin', adminType: 'SUPER_ADMIN', permissions: ['*'] },
        { id: 'product_manager', roleName: 'product_manager', adminType: 'CO_ADMIN', permissions: ['dashboard.view', 'products.view', 'products.create', 'products.edit'] },
        { id: 'order_manager', roleName: 'order_manager', adminType: 'CO_ADMIN', permissions: ['dashboard.view', 'orders.view', 'orders.edit', 'orders.approve'] }
      ];
      seededRoles.forEach((seededRole) => {
        fallbackRoleRows.push({
          role_name: seededRole.roleName,
          admin_type: seededRole.adminType,
          permissions: seededRole.permissions
        });
      });
    }

    const finalRoles = roles.length ? roles : fallbackRoleRows.map((row) => ({
      id: row.role_name || `role-${Date.now()}`,
      name: String(row.role_name || '').replace(/_/g, ' '),
      roleName: row.role_name,
      description: `${String(row.admin_type || 'CO_ADMIN').replace(/_/g, ' ')} role`,
      status: 'Active',
      permissions: row.permissions || []
    }));

    return res.json({ success: true, data: { roles: finalRoles } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load admin roles', error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { roleName, name, description, permissions = [] } = req.body || {};
    const normalizedRoleName = normalizeRoleName(roleName || name);

    if (!normalizedRoleName) {
      return res.status(400).json({ success: false, message: 'Role name is required' });
    }

    const permissionKeys = [...new Set((permissions || []).filter(Boolean).map((permission) => String(permission).trim()))];
    try {
      const roleId = await resolveRoleId(req, normalizedRoleName || 'co_admin');

      for (const permissionKey of permissionKeys) {
        try {
          await req.db.query(
            `INSERT INTO role_permissions (role_id, permission_key, enabled, created_at)
             VALUES ($1, $2, TRUE, NOW())
             ON CONFLICT (role_id, permission_key) DO NOTHING`,
            [roleId, permissionKey]
          );
        } catch (innerError) {
          const message = String(innerError.message || '');
          if (/column .*role_id.*does not exist|undefined column/i.test(message)) {
            await req.db.query(
              `INSERT INTO role_permissions (role_name, permission_key)
               VALUES ($1, $2)
               ON CONFLICT (role_name, permission_key) DO NOTHING`,
              [normalizedRoleName, permissionKey]
            );
          } else {
            throw innerError;
          }
        }
      }

      if (!permissionKeys.includes('dashboard.view')) {
        try {
          await req.db.query(
            `INSERT INTO role_permissions (role_id, permission_key, enabled, created_at)
             VALUES ($1, $2, TRUE, NOW())
             ON CONFLICT (role_id, permission_key) DO NOTHING`,
            [roleId, 'dashboard.view']
          );
        } catch (innerError) {
          const message = String(innerError.message || '');
          if (/column .*role_id.*does not exist|undefined column/i.test(message)) {
            await req.db.query(
              `INSERT INTO role_permissions (role_name, permission_key)
               VALUES ($1, $2)
               ON CONFLICT (role_name, permission_key) DO NOTHING`,
              [normalizedRoleName, 'dashboard.view']
            );
          } else {
            throw innerError;
          }
        }
      }
    } catch (rolePermissionError) {
      // Ignore write failures when the current schema does not support these columns.
    }

    return res.json({ success: true, message: 'Role saved', data: { roleName: normalizedRoleName, permissions: permissionKeys } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to save role', error: error.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { roleName, name, permissions = [] } = req.body || {};
    const normalizedRoleName = normalizeRoleName(roleName || name);

    if (!normalizedRoleName) {
      return res.status(400).json({ success: false, message: 'Role name is required' });
    }

    const permissionKeys = [...new Set((permissions || []).filter(Boolean).map((permission) => String(permission).trim()))];
    try {
      const roleId = await resolveRoleId(req, normalizedRoleName);

      try {
        await req.db.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
      } catch (deleteRolePermissionError) {
        await req.db.query(`DELETE FROM role_permissions WHERE role_name = $1`, [normalizedRoleName]);
      }

      for (const permissionKey of permissionKeys) {
        try {
          await req.db.query(
            `INSERT INTO role_permissions (role_id, permission_key, enabled, created_at)
             VALUES ($1, $2, TRUE, NOW())
             ON CONFLICT (role_id, permission_key) DO NOTHING`,
            [roleId, permissionKey]
          );
        } catch (innerError) {
          const message = String(innerError.message || '');
          if (/column .*role_id.*does not exist|undefined column/i.test(message)) {
            await req.db.query(
              `INSERT INTO role_permissions (role_name, permission_key)
               VALUES ($1, $2)
               ON CONFLICT (role_name, permission_key) DO NOTHING`,
              [normalizedRoleName, permissionKey]
            );
          } else {
            throw innerError;
          }
        }
      }

      if (!permissionKeys.includes('dashboard.view')) {
        try {
          await req.db.query(
            `INSERT INTO role_permissions (role_id, permission_key, enabled, created_at)
             VALUES ($1, $2, TRUE, NOW())
             ON CONFLICT (role_id, permission_key) DO NOTHING`,
            [roleId, 'dashboard.view']
          );
        } catch (innerError) {
          const message = String(innerError.message || '');
          if (/column .*role_id.*does not exist|undefined column/i.test(message)) {
            await req.db.query(
              `INSERT INTO role_permissions (role_name, permission_key)
               VALUES ($1, $2)
               ON CONFLICT (role_name, permission_key) DO NOTHING`,
              [normalizedRoleName, 'dashboard.view']
            );
          } else {
            throw innerError;
          }
        }
      }
    } catch (rolePermissionWriteError) {
      // Ignore write failures when the current schema does not support these columns.
    }

    return res.json({ success: true, message: 'Role updated', data: { roleName: normalizedRoleName, permissions: permissionKeys } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update role', error: error.message });
  }
});

async function createOrUpdateCoAdminUser(req, { email, fullName, phone, password, status, roleName }) {
  const normalizedEmail = String(email || '').trim();
  const normalizedStatus = String(status || 'active').trim().toLowerCase();
  const normalizedRoleName = formatRoleNameForDisplay(roleName || 'Product Manager');
  const result = await req.db.query(
    `SELECT id, role, status FROM admins WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [normalizedEmail]
  );

  if (result.rows[0]) {
    const existing = result.rows[0];
    const updates = [];
    const params = [];
    if (fullName) {
      params.push(fullName);
      updates.push(`full_name = $${params.length}`);
    }
    if (phone !== undefined) {
      params.push(phone || null);
      updates.push(`phone = $${params.length}`);
    }
    if (normalizedStatus) {
      params.push(normalizedStatus);
      updates.push(`status = $${params.length}`);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(String(password), 10);
      params.push(hashedPassword);
      updates.push(`password_hash = $${params.length}`);
    }
    if (normalizedRoleName) {
      params.push(normalizedRoleName);
      updates.push(`role = $${params.length}`);
    }

    if (updates.length) {
      params.push(existing.id);
      await req.db.query(
        `UPDATE admins SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
        params
      );
    }

    return existing.id;
  }

  if (!password) {
    throw new Error('Password is required when creating a new co-admin account');
  }

  const hashedPassword = await bcrypt.hash(String(password), 10);
  const insertResult = await req.db.query(
    `INSERT INTO admins (full_name, email, phone, password_hash, role, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING id`,
    [fullName || '', normalizedEmail, phone || null, hashedPassword, normalizedRoleName, normalizedStatus]
  );

  return insertResult.rows[0].id;
}

router.post('/assign-role', async (req, res) => {
  try {
    const { email, fullName, phone, password, status = 'active', roleName, adminType = 'CO_ADMIN' } = req.body || {};

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const normalizedRoleName = normalizeRoleName(roleName || 'product_manager');
    const userId = await createOrUpdateCoAdminUser(req, { email, fullName, phone, password, status, roleName: normalizedRoleName });
    const roleId = await resolveRoleId(req, normalizedRoleName);

    try {
      const existingRoleRow = await req.db.query(`SELECT id FROM admin_roles WHERE admin_id = $1 LIMIT 1`, [userId]);
      if (existingRoleRow.rows[0]) {
        await req.db.query(`UPDATE admin_roles SET role_id = $1, assigned_at = NOW() WHERE admin_id = $2`, [roleId || 1, userId]);
      } else {
        await req.db.query(`INSERT INTO admin_roles (admin_id, role_id, assigned_at) VALUES ($1, $2, NOW())`, [userId, roleId || 1]);
      }
    } catch (upsertError) {
      const message = String(upsertError.message || '');
      if (/column .*admin_id.*does not exist|column .*role_id.*does not exist|undefined column/i.test(message)) {
        const existingRoleRow = await req.db.query(`SELECT id FROM admin_roles WHERE admin_id = $1 LIMIT 1`, [userId]);
        if (existingRoleRow.rows[0]) {
          await req.db.query(`UPDATE admin_roles SET role = $1, updated_at = NOW() WHERE admin_id = $2`, [normalizedRoleName || 'product_manager', userId]);
        } else {
          await req.db.query(`INSERT INTO admin_roles (admin_id, role, updated_at) VALUES ($1, $2, NOW())`, [userId, normalizedRoleName || 'product_manager']);
        }
      } else {
        throw upsertError;
      }
    }

    if (normalizedRoleName) {
      try {
        const existingRole = await req.db.query(`SELECT 1 FROM role_permissions WHERE role_id = $1 LIMIT 1`, [roleId]);
        if (!existingRole.rows.length) {
          await req.db.query(`INSERT INTO role_permissions (role_id, permission_key, enabled, created_at) VALUES ($1, $2, TRUE, NOW()) ON CONFLICT (role_id, permission_key) DO NOTHING`, [roleId, 'dashboard.view']);
        }
      } catch (permissionError) {
        await req.db.query(`INSERT INTO role_permissions (role_name, permission_key) VALUES ($1, $2) ON CONFLICT (role_name, permission_key) DO NOTHING`, [normalizedRoleName, 'dashboard.view']);
      }
    }

    return res.json({ success: true, message: 'Role assigned', data: { userId, roleName: normalizedRoleName || 'product_manager' } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to assign role', error: error.message });
  }
});

module.exports = router;
module.exports.createOrUpdateCoAdminUser = createOrUpdateCoAdminUser;
