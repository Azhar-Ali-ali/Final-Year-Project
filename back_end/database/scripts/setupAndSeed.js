const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../seller_backend/.env') });
dotenv.config();

const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/lumina';
const DATABASE_URL = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;

function toAdminDatabaseUrl(connectionString) {
  const url = new URL(connectionString);
  url.pathname = '/postgres';
  return url.toString();
}

function stripLegacySeedSection(schemaSql) {
  const legacySeedRegex = /-- =========================\s*-- Phase 1: Core Users[\s\S]*?COMMIT;/m;
  if (legacySeedRegex.test(schemaSql)) {
    return schemaSql.replace(legacySeedRegex, 'COMMIT;\n');
  }
  return schemaSql;
}

async function ensureDatabaseExists() {
  const adminClient = new Client({ connectionString: toAdminDatabaseUrl(DATABASE_URL) });
  const dbName = new URL(DATABASE_URL).pathname.replace('/', '') || 'lumina';

  await adminClient.connect();
  try {
    const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Created database: ${dbName}`);
    } else {
      console.log(`Database already exists: ${dbName}`);
    }
  } finally {
    await adminClient.end();
  }
}

async function runSqlFile(client, filePath, transform) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const sql = transform ? transform(raw) : raw;
  await client.query(sql);
  console.log(`Executed: ${path.basename(filePath)}`);
}

async function main() {
  const schemaPath = path.resolve(__dirname, '../full_platform_schema.sql');
  const seedPath = path.resolve(__dirname, '../seed_full_platform_dummy_data_pg.sql');

  await ensureDatabaseExists();

  const dbClient = new Client({ connectionString: DATABASE_URL });
  await dbClient.connect();

  try {
    await runSqlFile(dbClient, schemaPath, stripLegacySeedSection);
    await runSqlFile(dbClient, seedPath);
    console.log('Database setup and seed completed successfully.');
  } finally {
    await dbClient.end();
  }
}

main().catch((error) => {
  console.error('Setup/seed failed:', error.message || error);
  process.exit(1);
});
