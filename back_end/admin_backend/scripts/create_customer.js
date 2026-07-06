const { query } = require('../../database/postgresClient');
(async () => {
  try {
    const res = await query(
      "INSERT INTO public.users (full_name,email,password_hash,role,status,created_at,updated_at) VALUES ($1,$2,crypt($3, gen_salt('bf')),$4,$5,NOW(),NOW()) RETURNING id,email",
      ['Customer Seller100', 'seller100@gmail.com', '12345678', 'customer', 'active']
    );

    console.log('CREATED:', res.rows[0]);
    process.exit(0);
  } catch (e) {
    console.error('ERROR', e.stack || e.message);
    process.exit(1);
  }
})();
