
import { Pool, PoolConfig } from 'pg';
import * as dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

const SCHEMA = process.env.DB_SCHEMA || 'appQAQC';

const poolConfig: PoolConfig = {
  host: process.env.DB_HOST || 'dbtracking.apps.zuehjcybfdiyc7j.aacorporation.vn',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'aaTrackingApps',
  user: process.env.DB_USER || 'edbqaqc',
  password: process.env.DB_PASSWORD,
  // SSL Configuration: rejectUnauthorized false allows self-signed certs often used in internal apps
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: parseInt(process.env.DB_MAX_POOL || '20'),
  min: parseInt(process.env.DB_MIN_POOL || '5'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT || '10000'),
};

console.log(`[DB] Initializing pool for ${poolConfig.host}:${poolConfig.port}/${poolConfig.database} (Schema: ${SCHEMA})`);

// Create the pool instance
export const pool = new Pool(poolConfig);

// Event listeners for pool health
pool.on('error', (err, client) => {
  console.error('[DB] Unexpected error on idle client', err);
  // Don't exit process in web app, just log
});

pool.on('connect', (client) => {
  // Set the search path to the specific schema upon connection
  client.query(`SET search_path TO "${SCHEMA}", public`)
    .catch(err => console.error(`[DB] Failed to set search_path to ${SCHEMA}`, err));
});

export const closePool = async () => {
  await pool.end();
};
