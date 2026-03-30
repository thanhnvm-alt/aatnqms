import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "appQAQC"."ncrs" (
          "id" TEXT PRIMARY KEY,
          "inspection_id" TEXT,
          "item_id" TEXT,
          "defect_code" TEXT,
          "severity" TEXT DEFAULT 'MINOR',
          "status" TEXT DEFAULT 'OPEN',
          "description" TEXT,
          "root_cause" TEXT,
          "corrective_action" TEXT,
          "preventive_action" TEXT,
          "responsible_person" TEXT,
          "deadline" TEXT,
          "images_before_json" TEXT,
          "images_after_json" TEXT,
          "created_by" TEXT,
          "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
          "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
          "comments_json" TEXT DEFAULT '[]'
      );
    `);
    console.log('Table NCRs created successfully in schema appQAQC');
  } catch (err) {
    console.error('Failed to create table NCR', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
