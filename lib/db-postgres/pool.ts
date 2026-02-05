
import { Pool, PoolConfig } from 'pg';
import * as dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

const SCHEMA = process.env.DB_SCHEMA || 'appQAQC';

// STRICT REMOTE CONFIGURATION
const poolConfig: PoolConfig = {
  host: process.env.DB_HOST || 'dbtracking.apps.zuehjcybfdiyc7j.aacorporation.vn',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'aaTrackingApps',
  user: process.env.DB_USER || 'edbqaqc',
  password: process.env.DB_PASSWORD || 'Oe71zNGcnaS6hzra', // Fallback to provided password
  // FORCE SSL: Required for remote connections to this server
  ssl: { rejectUnauthorized: false },
  max: parseInt(process.env.DB_MAX_POOL || '20'),
  min: parseInt(process.env.DB_MIN_POOL || '5'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // Increased for remote latency
};

console.log(`[DB] Initializing REMOTE pool to ${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`);

// Create the pool instance
export const pool = new Pool(poolConfig);

// Event listeners for pool health
pool.on('error', (err, client) => {
  console.error('[DB-ERROR] Unexpected error on idle client', err);
});

pool.on('connect', (client) => {
  // console.log('[DB] New client connected');
  // Set schema search path
  client.query(`SET search_path TO "${SCHEMA}", public`)
    .catch(err => console.error(`[DB] Failed to set search_path to ${SCHEMA}`, err));
});

export const closePool = async () => {
  await pool.end();
};
