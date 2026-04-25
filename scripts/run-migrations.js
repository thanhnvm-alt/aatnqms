import pg from 'pg';
const { Pool } = pg;

const rawConnectionString = process.env.DATABASE_URL;
const useSSL = process.env.DB_SSL === 'true' || 
               (rawConnectionString && (
                 rawConnectionString.includes('sslmode=require') || 
                 rawConnectionString.includes('sslmode=verify-full') ||
                 rawConnectionString.includes('ssl=true')
               ));

let connectionString = rawConnectionString;
if (rawConnectionString) {
  try {
    const url = new URL(rawConnectionString);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('ssl');
    connectionString = url.toString();
  } catch (e) {
    // ignore
  }
}

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

export async function runMigrations() {
  console.log('🚀 ISO-DB: Starting migrations...');
  const client = await pool.connect();
  const schema = process.env.DB_SCHEMA || 'appQAQC';
  try {
    // 1. Ensure Schema and Extensions exist
    console.log(`📡 ISO-DB: Using schema ${schema}`);
    
    try {
        await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    } catch (e) {
        console.warn(`⚠️ Could not create pgcrypto extension (might already exist or permission denied):`, e.message);
    }

    // 2. Audit Logs (Append-Only)
    console.log('📡 ISO-DB: Ensuring audit_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."audit_logs" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "user_id" TEXT NOT NULL,
          "action" TEXT NOT NULL,
          "entity_type" TEXT NOT NULL,
          "entity_id" TEXT NOT NULL,
          "old_value" JSONB,
          "new_value" JSONB,
          "timestamp" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
          "ip_address" TEXT,
          "user_agent" TEXT
      );
    `);

    // 3. Status History (Traceability)
    console.log('📡 ISO-DB: Ensuring status_history table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."status_history" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "entity_type" TEXT NOT NULL,
          "entity_id" TEXT NOT NULL,
          "status_from" TEXT,
          "status_to" TEXT NOT NULL,
          "changed_by" TEXT NOT NULL,
          "timestamp" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
          "comment" TEXT
      );
    `);

    // 4. NCRs (Updated with Soft Delete & UUID)
    console.log('📡 ISO-DB: Ensuring ncrs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."ncrs" (
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
          "deleted_at" BIGINT,
          "comments_json" TEXT DEFAULT '[]'
      );
    `);
    await addColumnIfNotExists(client, schema, 'ncrs', 'deleted_at', 'BIGINT');

    // 5. Notifications
    console.log('📡 ISO-DB: Ensuring notifications table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."notifications" (
          "id" TEXT PRIMARY KEY,
          "user_id" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "message" TEXT NOT NULL,
          "is_read" SMALLINT DEFAULT 0,
          "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
          "data" TEXT,
          "deleted_at" BIGINT
      );
    `);
    await addColumnIfNotExists(client, schema, 'notifications', 'deleted_at', 'BIGINT');

    // 6. Users (RBAC)
    console.log('📡 ISO-DB: Ensuring users table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."users" (
          "id" TEXT PRIMARY KEY,
          "username" TEXT UNIQUE NOT NULL,
          "password" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "role" TEXT NOT NULL,
          "avatar" TEXT,
          "msnv" TEXT,
          "email" TEXT,
          "position" TEXT,
          "work_location" TEXT,
          "status" TEXT DEFAULT 'ACTIVE',
          "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
          "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
          "deleted_at" BIGINT,
          "data" TEXT
      );
    `);
    await addColumnIfNotExists(client, schema, 'users', 'deleted_at', 'BIGINT');
    await addColumnIfNotExists(client, schema, 'users', 'email', 'TEXT');
    await addColumnIfNotExists(client, schema, 'users', 'status', "TEXT DEFAULT 'ACTIVE'");
    await addColumnIfNotExists(client, schema, 'users', 'msnv', 'TEXT');
    await addColumnIfNotExists(client, schema, 'users', 'position', 'TEXT');
    await addColumnIfNotExists(client, schema, 'users', 'work_location', 'TEXT');
    await addColumnIfNotExists(client, schema, 'users', 'avatar', 'TEXT');
    await addColumnIfNotExists(client, schema, 'users', 'data', 'TEXT');

    // 7. Inspection Tables (ISO Standard)
    const inspectionTables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    for (const table of inspectionTables) {
        console.log(`📡 ISO-DB: Ensuring ${table} table...`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS "${schema}"."${table}" (
                "id" TEXT PRIMARY KEY,
                "type" TEXT,
                "ma_ct" TEXT,
                "ten_ct" TEXT,
                "ten_hang_muc" TEXT,
                "po_number" TEXT,
                "supplier" TEXT,
                "inspector" TEXT,
                "status" TEXT,
                "date" TEXT,
                "score" TEXT,
                "summary" TEXT,
                "items_json" TEXT,
                "materials_json" TEXT,
                "signature_qc" TEXT,
                "signature_manager" TEXT,
                "name_manager" TEXT,
                "signature_production" TEXT,
                "name_production" TEXT,
                "comment_production" TEXT,
                "images_json" TEXT,
                "delivery_images_json" TEXT,
                "report_images_json" TEXT,
                "comments_json" TEXT,
                "so_luong_ipo" NUMERIC,
                "inspected_qty" NUMERIC,
                "passed_qty" NUMERIC,
                "failed_qty" NUMERIC,
                "dvt" TEXT,
                "updated_at" TEXT,
                "floor_plan_id" TEXT,
                "coord_x" NUMERIC,
                "coord_y" NUMERIC,
                "location" TEXT,
                "supplier_address" TEXT,
                "supporting_docs_json" TEXT,
                "responsible_person" TEXT,
                "deleted_at" BIGINT,
                "data" TEXT,
                "workshop" TEXT,
                "stage" TEXT,
                "ma_nha_may" TEXT,
                "qty_total" NUMERIC,
                "qty_pass" NUMERIC,
                "qty_fail" NUMERIC,
                "headcode" TEXT,
                "production_comment" TEXT
            );
        `);
        
        // Ensure deleted_at exists for existing tables
        await addColumnIfNotExists(client, schema, table, 'deleted_at', 'BIGINT');
    }


    console.log('📡 ISO-DB: Ensuring suppliers table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."suppliers" (
          "id" TEXT PRIMARY KEY,
          "code" TEXT UNIQUE,
          "name" TEXT,
          "address" TEXT,
          "contact_person" TEXT,
          "phone" TEXT,
          "email" TEXT,
          "category" TEXT,
          "status" TEXT DEFAULT 'ACTIVE',
          "data" TEXT,
          "updated_at" BIGINT,
          "deleted_at" BIGINT
      );
    `);
    await addColumnIfNotExists(client, schema, 'suppliers', 'deleted_at', 'BIGINT');

    console.log('📡 ISO-DB: Ensuring projects table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."projects" (
          "id" TEXT PRIMARY KEY,
          "code" TEXT UNIQUE,
          "name" TEXT,
          "ma_ct" TEXT,
          "ten_ct" TEXT,
          "status" TEXT,
          "startDate" TEXT,
          "endDate" TEXT,
          "pm" TEXT,
          "pc" TEXT,
          "qa" TEXT,
          "progress" NUMERIC,
          "thumbnail" TEXT,
          "description" TEXT,
          "location" TEXT,
          "images_json" TEXT,
          "deleted_at" BIGINT
      );
    `);
    await addColumnIfNotExists(client, schema, 'projects', 'deleted_at', 'BIGINT');


    console.log(`📡 ISO-DB: Migrations completed successfully in schema ${schema}`);
  } catch (err) {
    console.error('❌ ISO-DB: Migration failed', err);
    throw err; // Re-throw to ensure server startup fails if migrations fail
  } finally {
    client.release();
    await pool.end();
  }
}

async function addColumnIfNotExists(client, schema, table, column, type) {
  try {
    // Using ADD COLUMN IF NOT EXISTS is more robust in modern Postgres
    await client.query(`ALTER TABLE "${schema}"."${table}" ADD COLUMN IF NOT EXISTS "${column}" ${type}`);
    console.log(`✅ Checked/Added column ${column} to ${schema}.${table}`);
  } catch (err) {
    console.warn(`⚠️ Could not add column ${column} to ${schema}.${table} (it might already exist):`, err.message);
  }
}

// Run migrations if this script is executed directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
