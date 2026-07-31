const { query } = require('../../database/postgresClient');

async function seedPermissions() {
  const permissions = [
    { key: 'dashboard.view', action_name: 'view', module_name: 'Dashboard' },
    { key: 'products.view', action_name: 'view', module_name: 'Products' },
    { key: 'products.create', action_name: 'create', module_name: 'Products' },
    { key: 'products.edit', action_name: 'edit', module_name: 'Products' },
    { key: 'products.delete', action_name: 'delete', module_name: 'Products' },
    { key: 'products.approve', action_name: 'approve', module_name: 'Products' },
    { key: 'categories.view', action_name: 'view', module_name: 'Categories' },
    { key: 'categories.create', action_name: 'create', module_name: 'Categories' },
    { key: 'categories.edit', action_name: 'edit', module_name: 'Categories' },
    { key: 'sellers.view', action_name: 'view', module_name: 'Sellers' },
    { key: 'sellers.approve', action_name: 'approve', module_name: 'Sellers' },
    { key: 'customers.view', action_name: 'view', module_name: 'Customers' },
    { key: 'orders.view', action_name: 'view', module_name: 'Orders' },
    { key: 'orders.edit', action_name: 'edit', module_name: 'Orders' },
    { key: 'orders.approve', action_name: 'approve', module_name: 'Orders' },
    { key: 'orders.export', action_name: 'export', module_name: 'Orders' },
    { key: 'payments.view', action_name: 'view', module_name: 'Payments' },
    { key: 'payments.approve', action_name: 'approve', module_name: 'Payments' },
    { key: 'payments.export', action_name: 'export', module_name: 'Payments' },
    { key: 'reports.view', action_name: 'view', module_name: 'Reports' },
    { key: 'reports.export', action_name: 'export', module_name: 'Reports' },
    { key: 'settings.view', action_name: 'view', module_name: 'Settings' },
    { key: 'settings.manage', action_name: 'manage', module_name: 'Settings' },
    { key: 'support.view', action_name: 'view', module_name: 'Support' },
    { key: 'support.edit', action_name: 'edit', module_name: 'Support' },
    { key: 'reviews.view', action_name: 'view', module_name: 'Reviews' },
    { key: 'reviews.approve', action_name: 'approve', module_name: 'Reviews' },
    { key: 'cms.view', action_name: 'view', module_name: 'CMS' },
    { key: 'cms.create', action_name: 'create', module_name: 'CMS' },
    { key: 'cms.edit', action_name: 'edit', module_name: 'CMS' },
    { key: 'notifications.view', action_name: 'view', module_name: 'Notifications' },
    { key: 'notifications.manage', action_name: 'manage', module_name: 'Notifications' },
    { key: 'shipping.view', action_name: 'view', module_name: 'Shipping' },
    { key: 'shipping.edit', action_name: 'edit', module_name: 'Shipping' },
    { key: 'logistics.view', action_name: 'view', module_name: 'Logistics' },
    { key: 'logistics.edit', action_name: 'edit', module_name: 'Logistics' },
    { key: 'logistics.export', action_name: 'export', module_name: 'Logistics' },
    { key: 'withdraws.view', action_name: 'view', module_name: 'Withdraws' },
    { key: 'withdraws.approve', action_name: 'approve', module_name: 'Withdraws' },
    { key: 'promotions.view', action_name: 'view', module_name: 'Promotions' },
    { key: 'promotions.create', action_name: 'create', module_name: 'Promotions' },
    { key: 'promotions.edit', action_name: 'edit', module_name: 'Promotions' }
  ];

  for (const permission of permissions) {
    await query(
      `INSERT INTO permissions (permission_key, action_name, module_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (permission_key) DO NOTHING`,
      [permission.key, permission.action_name, permission.module_name]
    );
  }

  const adminUser = await query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND role::text = 'admin' LIMIT 1`,
    ['admin@lumina.com']
  );

  if (adminUser.rows[0]) {
    const roleRow = await query(
      `SELECT id FROM admin_roles WHERE admin_id = $1 LIMIT 1`,
      [adminUser.rows[0].id]
    );

    if (roleRow.rows[0]) {
      await query(
        `UPDATE admin_roles SET role_id = $2, assigned_at = NOW() WHERE id = $1`,
        [roleRow.rows[0].id, 'super-admin-role']
      );
    } else {
      await query(
        `INSERT INTO admin_roles (admin_id, role_id, assigned_at)
         VALUES ($1, $2, NOW())`,
        [adminUser.rows[0].id, 'super-admin-role']
      );
    }
  }

  const rolePermissions = {
    super_admin: ['*'],
    product_manager: ['dashboard.view','products.view','products.create','products.edit','products.delete','products.approve','categories.view','categories.create','categories.edit','sellers.view','customers.view','orders.view','orders.edit','orders.approve','orders.export','reports.view','reports.export','settings.view','settings.manage'],
    order_manager: ['dashboard.view','orders.view','orders.edit','orders.approve','orders.export','shipping.view','shipping.edit','logistics.view','logistics.edit','logistics.export'],
    finance_manager: ['dashboard.view','payments.view','payments.approve','payments.export','withdraws.view','withdraws.approve','reports.view','reports.export'],
    customer_support: ['dashboard.view','customers.view','support.view','support.edit','reviews.view','reviews.approve'],
    marketing_manager: ['dashboard.view','promotions.view','promotions.create','promotions.edit','notifications.view','notifications.manage','cms.view','cms.create','cms.edit'],
    operations_manager: ['dashboard.view','orders.view','orders.edit','orders.approve','orders.export','support.view','support.edit','notifications.view','notifications.manage'],
    seller_manager: ['dashboard.view','sellers.view','sellers.approve','reviews.view','reviews.approve'],
    logistics_manager: ['dashboard.view','shipping.view','shipping.edit','logistics.view','logistics.edit','logistics.export'],
    report_analyst: ['dashboard.view','reports.view','reports.export']
  };

  for (const [roleName, perms] of Object.entries(rolePermissions)) {
    for (const permissionKey of perms) {
      if (permissionKey === '*') {
        continue;
      }
      await query(
        `INSERT INTO role_permissions (role_name, permission_key)
         VALUES ($1, $2)
         ON CONFLICT (role_name, permission_key) DO NOTHING`,
        [roleName, permissionKey]
      );
    }
  }
}

seedPermissions().then(() => {
  console.log('Admin permissions seeded');
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
