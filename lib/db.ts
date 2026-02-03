import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const config: PoolConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://edbqaqc:Oe71zNGcnaS6hzra@dbtracking.apps.zuehjcybfdjyc7j.aacorporation.vn:5432/aaTrackingApps?sslmode=prefer',
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // Thiết lập search_path ngay khi kết nối được khởi tạo
  options: '-c search_path=appQAQC,public'
};

export const db = new Pool(config);

// Kiểm tra kết nối khi khởi động
db.query('SELECT 1')
  .then(() => {
    console.log('✅ Connected to PostgreSQL (Schema: appQAQC)');
  })
  .catch((err) => {
    console.error('❌ Failed to connect to PostgreSQL:', err.message);
  });

// Xử lý đóng kết nối khi server tắt
const gracefulShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Closing database pool...`);
  try {
    await db.end();
    console.log('✅ Database pool closed.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during pool shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
