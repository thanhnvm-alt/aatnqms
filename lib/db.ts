
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
  connectionTimeoutMillis: 5000, // Increased timeout for better debugging
  // Thiết lập search_path ngay khi kết nối được khởi tạo
  // Updated: Added quotes to schema name to handle potential case-sensitivity in PostgreSQL
  options: '-c search_path="appQAQC",public'
};

export const db = new Pool(config);

// Kiểm tra kết nối khi khởi động
db.query('SELECT 1')
  .then(() => {
    console.log('✅ Connected to PostgreSQL (Schema: appQAQC)');
  })
  .catch((err) => {
    console.error('❌ Failed to connect to PostgreSQL:');
    console.error('   Message:', err.message);
    if (err.code) console.error('   Code:', err.code);
    if (err.detail) console.error('   Detail:', err.detail);
    if (err.hint) console.error('   Hint:', err.hint);
  });

// Xử lý đóng kết nối khi server tắt
const gracefulShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Closing database pool...`);
  try {
    await db.end();
    console.log('✅ Database pool closed.');
    // @ts-ignore
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during pool shutdown:', err);
    // @ts-ignore
    process.exit(1);
  }
};

// @ts-ignore
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// @ts-ignore
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
