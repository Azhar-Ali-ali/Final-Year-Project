// PostgreSQL Client Configuration
// Connection pooling for admin backend

const path = require('path');
const { Pool } = require('pg');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../admin_backend/.env');
dotenv.config({ path: envPath });
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:1234@localhost:5432/lumina';

function formatDbError(error) {
  if (!error) return 'Unknown database error';

  if (error.message && String(error.message).trim()) {
    return String(error.message).trim();
  }

  if (Array.isArray(error.errors) && error.errors.length) {
    const nestedMessages = error.errors
      .map((entry) => {
        const code = entry?.code ? `[${entry.code}] ` : '';
        const message = entry?.message || entry?.stack || '';
        return `${code}${String(message).trim()}`.trim();
      })
      .filter(Boolean)
      .join(' | ');

    if (nestedMessages) return nestedMessages;
  }

  if (error.code) {
    return `Database error code: ${error.code}`;
  }

  return String(error);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS) || 30000,
  connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS) || 5000,
  ssl: process.env.DB_SSL === 'true'
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

async function query(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result;
  } catch (error) {
    console.error('Database query error:', formatDbError(error));
    throw error;
  }
}

async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() as serverTime, current_database() as db');
    const row = result.rows[0];
    return {
      connected: true,
      db: row.db,
      serverTime: row.serverTime
    };
  } catch (error) {
    throw new Error(`Database connection failed: ${formatDbError(error)}`);
  }
}

async function closePool() {
  await pool.end();
}

module.exports = {
  query,
  testConnection,
  closePool,
  pool
};