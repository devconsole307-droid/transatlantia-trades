const { Pool } = require('pg');

// dotenv is loaded once in server.js — do NOT load it here
// In production (Fly.io) env vars are injected by the platform

// Log which DB we are connecting to (helps debug connection issues)
if (process.env.DATABASE_URL) {
  const preview = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@');
  console.log('[DB] Using DATABASE_URL:', preview.substring(0, 60) + '...');
} else {
  console.log('[DB] No DATABASE_URL found — using local config (localhost:5432)');
}

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },  // Required for Neon/Railway/Render
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'investment_platform',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: false,
    };

const pool = new Pool({
  ...poolConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DB] New client connected');
  }
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('[DB]', { query: text.substring(0, 60), duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error('[DB] Query error:', err.message, '| Query:', text.substring(0, 80));
    throw err;
  }
};

const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
