
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("❌ Error: Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables.");
  console.error("Usage: export TURSO_DATABASE_URL=... && export TURSO_AUTH_TOKEN=... && npx tsx scripts/recreateTable.ts");
  process.exit(1);
}

const client = createClient({
  url: url,
  authToken: authToken,
});

async function recreateTable() {
  console.log('⚠️  WARNING: This operation will DELETE ALL DATA in the "searchPlans" table.');
  console.log('⏳ Starting table recreation...');

  try {
    // 1. Drop existing table
    console.log('🗑️  Dropping table "searchPlans"...');
    await client.execute(`DROP TABLE IF EXISTS searchPlans`);

    // 2. Create new table
    console.log('🏗️  Creating table "searchPlans"...');
    await client.execute(`
      CREATE TABLE searchPlans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        headcode TEXT NOT NULL,
        ma_ct TEXT NOT NULL,
        ten_ct TEXT NOT NULL,
        ma_nha_may TEXT,
        ten_hang_muc TEXT NOT NULL,
        dvt TEXT,
        so_luong_ipo REAL DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);

    // 3. Add Indexes
    console.log('📇 Creating indexes...');
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_ma_ct ON searchPlans(ma_ct)`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_created_at ON searchPlans(created_at)`);

    console.log('✅ Table "searchPlans" recreated successfully!');

  } catch (error) {
    console.error('❌ Error during recreation:', error);
  }
}

recreateTable();
