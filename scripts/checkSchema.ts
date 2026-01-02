
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("❌ Error: Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables.");
  console.error("Usage: export TURSO_DATABASE_URL=... && export TURSO_AUTH_TOKEN=... && npx tsx scripts/checkSchema.ts");
  process.exit(1);
}

const client = createClient({
  url: url,
  authToken: authToken,
});

async function checkSchema() {
  try {
    console.log('🔍 Checking schema for table: searchPlans...');

    // Get table info
    const result = await client.execute(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='searchPlans'
    `);

    console.log('\n📋 Table schema:');
    if (result.rows.length > 0) {
        console.log(result.rows[0]?.sql);
    } else {
        console.log('❌ Table "searchPlans" not found.');
    }

    // Get indexes
    const indexes = await client.execute(`
      SELECT * FROM sqlite_master 
      WHERE type='index' AND tbl_name='searchPlans'
    `);

    console.log('\n📌 Indexes:');
    console.table(indexes.rows);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkSchema();
