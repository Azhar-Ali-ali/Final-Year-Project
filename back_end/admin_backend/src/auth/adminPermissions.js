const { query } = require('../../../database/postgresClient');

const ROLE_PERMISSION_MAP = {
  super_admin: ['*'],
  operations_manager: [
    'dashboard.view',
    'orders.view',
    'orders.edit',
    'orders.approve',
    'orders.export',
    'support.view',
    'support.edit',
    'notifications.view',
    'notifications.manage'
  ],
  product_manager: [
    'dashboard.view',
    'products.view',
    'products.create',
    'products.edit',
    'products.delete',
    'products.approve',
    'categories.view',
    'categories.create',
    'categories.edit',
    'brands.view',
    'brands.create',
    'brands.edit'
  ],
  seller_manager: [
    'dashboard.view',
    'sellers.view',
    'sellers.approve',
    'sellers.export',
    'reviews.view',
    'reviews.approve'
  ],
  order_manager: [
    'dashboard.view',
    'orders.view',
    'orders.edit',
    'orders.approve',
    'orders.export',
    'shipping.view',
    'shipping.edit',
    'logistics.view',
    'logistics.edit',
    'logistics.export'
  ],
  customer_support: [
    'dashboard.view',
    'customers.view',
    'customers.export',
    'support.view',
    'support.edit',
    'support.approve'
  ],
  user_manager: [
    'dashboard.view',
    'customers.view',
    'customers.export'
  ],
  user_management: [
    'dashboard.view',
    'customers.view',
    'customers.export'
  ],
  seller_manager: [
    'dashboard.view',
    'sellers.view',
    'sellers.approve',
    'sellers.export'
  ],
  seller_management: [
    'dashboard.view',
    'sellers.view',
    'sellers.approve',
    'sellers.export'
  ],
  product_catalog_manager: [
    'dashboard.view',
    'products.view',
    'products.create',
    'products.edit',
    'products.delete',
    'products.approve',
    'categories.view',
    'categories.create',
    'categories.edit',
    'brands.view',
    'brands.create',
    'brands.edit'
  ],
  review_manager: [
    'dashboard.view',
    'reviews.view',
    'reviews.approve'
  ],
  reviews_manager: [
    'dashboard.view',
    'reviews.view',
    'reviews.approve'
  ],
  support_manager: [
    'dashboard.view',
    'support.view',
    'support.edit',
    'support.approve'
  ],
  dispute_support_manager: [
    'dashboard.view',
    'support.view',
    'support.edit',
    'support.approve'
  ],
  payment_manager: [
    'dashboard.view',
    'payments.view',
    'payments.approve',
    'payments.export'
  ],
  payments_manager: [
    'dashboard.view',
    'payments.view',
    'payments.approve',
    'payments.export'
  ],
  finance_manager: [
    'dashboard.view',
    'payments.view',
    'payments.approve',
    'payments.export',
    'withdraws.view',
    'withdraws.approve',
    'reports.view',
    'reports.export'
  ],
  marketing_manager: [
    'dashboard.view',
    'promotions.view',
    'promotions.create',
    'promotions.edit',
    'notifications.view',
    'notifications.manage',
    'cms.view',
    'cms.create',
    'cms.edit'
  ],
  logistics_manager: [
    'dashboard.view',
    'shipping.view',
    'shipping.edit',
    'logistics.view',
    'logistics.edit',
    'logistics.export'
  ],
  report_analyst: [
    'dashboard.view',
    'reports.view',
    'reports.export'
  ],
  co_admin: [
    'dashboard.view',
    'settings.view'
  ],
  custom_role: []
};

function normalizeRoleName(roleName) {
  if (!roleName) return 'co_admin';
  return String(roleName)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]+/g, '');
}

function getPermissionsForRole(roleName) {
  const normalized = normalizeRoleName(roleName);
  return ROLE_PERMISSION_MAP[normalized] || [];
}

function resolveAdminType(admin) {
  const normalizedType = String(admin?.type || admin?.adminType || admin?.admin_type || '').trim().toUpperCase();
  if (normalizedType === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  if (normalizedType === 'CO_ADMIN') return 'CO_ADMIN';

  const normalizedRole = String(admin?.role || admin?.roleName || admin?.role_name || '').trim().toLowerCase();
  if (normalizedRole === 'super admin' || normalizedRole === 'super_admin' || normalizedRole === 'super-admin') {
    return 'SUPER_ADMIN';
  }

  const normalizedEmail = String(admin?.email || '').trim().toLowerCase();
  if (normalizedEmail === 'admin@lumina.com' || normalizedEmail === 'azhar@store.com' || normalizedEmail === 'super@lumina.com') {
    return 'SUPER_ADMIN';
  }

  return 'CO_ADMIN';
}

async function getPermissionsFromDatabase(db, admin) {
  const adminType = String(admin?.type || admin?.adminType || admin?.admin_type || '').trim().toUpperCase();
  const roleName = String(admin?.roleName || admin?.role || '').trim();
  const adminId = admin?.id || admin?.userId || admin?.user_id;
  const email = String(admin?.email || '').trim().toLowerCase();

  if (adminType === 'SUPER_ADMIN' || roleName.toLowerCase() === 'super_admin') {
    return ['*'];
  }

  const roleQuery = db?.query || query;
  let roleRow = null;
  let roleId = null;
  let resolvedRoleName = roleName;

  function isIntegerId(value) {
    const raw = String(value || '').trim();
    return /^[0-9]+$/.test(raw);
  }

  const schemaErrorPattern = /column .*role_name.*does not exist|column .*role_id.*does not exist|column .*admin_id.*does not exist|column .*user_id.*does not exist|invalid input syntax for type integer|undefined column/i;

  async function fetchRoleAssignmentById(id) {
    try {
      const result = await roleQuery(
        `SELECT r.id AS role_id, r.name AS resolved_role_name
         FROM admin_roles ar
         JOIN roles r ON ar.role_id = r.id
         WHERE ar.admin_id::text = $1 OR ar.user_id::text = $1
         LIMIT 1`,
        [id]
      );
      return result?.rows?.[0] || null;
    } catch (error) {
      const message = String(error.message || '');
      if (schemaErrorPattern.test(message)) {
        try {
          const fallbackResult = await roleQuery(
            `SELECT role_name AS resolved_role_name, role_id
             FROM admin_roles
             WHERE user_id::text = $1 OR admin_id::text = $1
             LIMIT 1`,
            [id]
          );
          return fallbackResult?.rows?.[0] || null;
        } catch (fallbackError) {
          const fallbackMessage = String(fallbackError.message || '');
          if (schemaErrorPattern.test(fallbackMessage)) {
            return null;
          }
          throw fallbackError;
        }
      }
      throw error;
    }
  }

  if (adminId) {
    roleRow = await fetchRoleAssignmentById(adminId);
  }

  if (!roleRow && email) {
    const userResult = await roleQuery(
      `SELECT id
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );
    const userRow = userResult?.rows?.[0];

    if (userRow?.id) {
      roleRow = await fetchRoleAssignmentById(userRow.id);
    }
  }

  if (roleRow) {
    roleId = roleRow.role_id || null;
    resolvedRoleName = String(roleRow.resolved_role_name || roleRow.role_name || roleRow.role || resolvedRoleName || '').trim();
  }

  if (!roleId && resolvedRoleName) {
    try {
      const normalizedRole = String(resolvedRoleName).trim().toLowerCase();
      const roleLookupResult = await roleQuery(
        `SELECT id AS role_id, name AS resolved_role_name
         FROM roles
         WHERE LOWER(name) = LOWER($1)
            OR LOWER(regexp_replace(name, '\\s+', '_', 'g')) = LOWER($2)
         LIMIT 1`,
        [resolvedRoleName, normalizedRole]
      );
      const roleLookup = roleLookupResult?.rows?.[0];
      if (roleLookup?.role_id) {
        roleId = roleLookup.role_id;
        resolvedRoleName = String(roleLookup.resolved_role_name || resolvedRoleName).trim();
      }
    } catch (error) {
      // Ignore role lookup failures and fall back to legacy permission name lookups.
    }
  }

  let permissionsResult = null;
  if (roleId) {
    permissionsResult = await roleQuery(
      `SELECT permission_key
       FROM role_permissions
       WHERE role_id = $1 AND permission_key IS NOT NULL
       ORDER BY permission_key`,
      [roleId]
    ).catch(async (error) => {
      const message = String(error.message || '');
      if (/column .*role_id.*does not exist|undefined column/i.test(message)) {
        return roleQuery(
          `SELECT permission_key
           FROM role_permissions
           WHERE role_name = $1 AND permission_key IS NOT NULL
           ORDER BY permission_key`,
          [resolvedRoleName]
        );
      }
      throw error;
    });
  } else if (resolvedRoleName) {
    permissionsResult = await roleQuery(
      `SELECT permission_key
       FROM role_permissions
       WHERE role_name = $1 AND permission_key IS NOT NULL
       ORDER BY permission_key`,
      [resolvedRoleName]
    ).catch(() => null);
  }

  return (permissionsResult?.rows || [])
    .map((row) => row.permission_key)
    .filter(Boolean);
}

async function buildAdminPermissions(admin, db = null) {
  const adminType = resolveAdminType(admin);
  if (adminType === 'SUPER_ADMIN') {
    return ['*'];
  }

  const roleName = String(admin?.roleName || admin?.role || '').trim();
  const explicitPermissions = Array.isArray(admin?.permissions) ? admin.permissions : [];
  if (explicitPermissions.length) {
    return explicitPermissions;
  }

  const databasePermissions = await getPermissionsFromDatabase(db, admin);
  if (Array.isArray(databasePermissions) && databasePermissions.length) {
    return databasePermissions;
  }

  return getPermissionsForRole(roleName);
}

function hasPermission(userPermissions = [], permission) {
  if (!permission) return true;
  if (!Array.isArray(userPermissions)) return false;
  const normalizedPermission = String(permission).trim().toLowerCase();
  return userPermissions.some((entry) => {
    if (!entry) return false;
    const normalizedEntry = String(entry).trim().toLowerCase();
    return normalizedEntry === '*' || normalizedEntry === normalizedPermission;
  });
}

function hasAnyPermission(userPermissions = [], permissions = []) {
  return Array.isArray(permissions) && permissions.some((permission) => hasPermission(userPermissions, permission));
}

module.exports = {
  ROLE_PERMISSION_MAP,
  normalizeRoleName,
  getPermissionsForRole,
  resolveAdminType,
  buildAdminPermissions,
  hasPermission,
  hasAnyPermission
};
