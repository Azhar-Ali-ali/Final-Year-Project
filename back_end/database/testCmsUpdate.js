const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ connectionString: 'postgres://postgres:1234@localhost:5432/lumina' });
  try {
    const assetRes = await pool.query('SELECT id, file_name, file_url, mime_type, file_size FROM cms_assets LIMIT 1');
    if (!assetRes.rows.length) {
      console.log('No CMS assets found to test.');
      process.exit(0);
    }
    const asset = assetRes.rows[0];
    console.log('Found asset:', asset);
    const updateSql = 'UPDATE cms_assets SET file_name = $1, file_url = $2, mime_type = $3, file_size = $4 WHERE id = $5 RETURNING id, asset_type, file_name, file_url, mime_type, file_size, created_at';
    console.log('Executing SQL:', updateSql);
    const result = await pool.query(updateSql, [
      asset.file_name + ' TEST',
      asset.file_url,
      asset.mime_type,
      asset.file_size,
      asset.id
    ]);
    console.log('Update result:', result.rows[0]);
  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
