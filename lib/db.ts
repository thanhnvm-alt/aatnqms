
import { createRequire } from 'module';
import dotenv from 'dotenv';

dotenv.config();

// Sử dụng createRequire để import pg an toàn trong môi trường Vite SSR
// Điều này ngăn chặn lỗi crash module dẫn đến 404
const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '5432'),
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000, // Tăng timeout để tránh lỗi mạng chập chờn
};

console.log(`[Postgres] Initializing Pool... Host: ${dbConfig.host}`);

export const pool = new Pool(dbConfig);

// CẤU HÌNH SCHEMA: Tự động set search_path khi kết nối
// Khắc phục lỗi "relation does not exist" khi bảng nằm trong schema riêng (appQAQC)
pool.on('connect', (client: any) => {
  const schema = process.env.DB_SCHEMA || 'public';
  client.query(`SET search_path TO "${schema}", public`)
    .catch((err: any) => console.error('[Postgres] Failed to set search_path', err));
});

pool.on('error', (err: any) => {
  console.error('[Postgres] Unexpected error on idle client', err);
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
  pool
};
