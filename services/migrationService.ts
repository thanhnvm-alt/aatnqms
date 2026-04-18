
import fs from 'fs';
import path from 'path';
import { query } from "../lib/db.js";

export async function runMigrations() {
  const schema = process.env.DB_SCHEMA || 'appQAQC';
  console.log(`🚀 ISO-DB: Starting migrations in schema ${schema}...`);
  
  try {
    // 1. Ensure Schema and Extensions exist (Try but don't fail if permission denied)
    try {
      await query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    } catch (e: any) {
      console.warn(`⚠️ Could not ensure schema or extension (might already exist or permission denied):`, e.message);
    }

    // Helper for adding columns
    const migrationLogs: string[] = [];
    const addColumn = async (table: string, column: string, type: string) => {
      try {
        // Use IF NOT EXISTS directly in ALTER TABLE for better reliability
        await query(`ALTER TABLE "${schema}"."${table}" ADD COLUMN IF NOT EXISTS "${column}" ${type}`);
        const msg = `✅ Ensured column ${column} exists in ${schema}.${table}`;
        console.log(msg);
        migrationLogs.push(msg);
      } catch (err: any) {
        const msg = `⚠️ Could not add column ${column} to ${schema}.${table}: ${err.message}`;
        console.warn(msg);
        migrationLogs.push(msg);
      }
    };

    // 2. Audit Logs
    try {
      await query(`
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
      migrationLogs.push(`✅ Ensured table audit_logs exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create audit_logs:`, e.message);
      migrationLogs.push(`⚠️ Could not create audit_logs: ${e.message}`);
    }

    // 3. Status History
    try {
      await query(`
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
      migrationLogs.push(`✅ Ensured table status_history exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create status_history:`, e.message);
      migrationLogs.push(`⚠️ Could not create status_history: ${e.message}`);
    }

    // 4. NCRs
    try {
      await query(`
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
      migrationLogs.push(`✅ Ensured table ncrs exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create ncrs:`, e.message);
      migrationLogs.push(`⚠️ Could not create ncrs: ${e.message}`);
    }
    await addColumn('ncrs', 'deleted_at', 'BIGINT');
    await addColumn('ncrs', 'closed_at', 'BIGINT');
    await addColumn('ncrs', 'closed_by', 'TEXT');
    await addColumn('ncrs', 'closed_date', 'TEXT');
    await addColumn('ncrs', 'data', 'TEXT');
    await addColumn('ncrs', 'comments_json', 'TEXT');

    // 5. Notifications
    try {
      await query(`
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
      migrationLogs.push(`✅ Ensured table notifications exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create notifications:`, e.message);
      migrationLogs.push(`⚠️ Could not create notifications: ${e.message}`);
    }
    await addColumn('notifications', 'deleted_at', 'BIGINT');

    // 6. Users
    try {
      await query(`
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
      migrationLogs.push(`✅ Ensured table users exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create users:`, e.message);
      migrationLogs.push(`⚠️ Could not create users: ${e.message}`);
    }
    await addColumn('users', 'deleted_at', 'BIGINT');
    await addColumn('users', 'email', 'TEXT');
    await addColumn('users', 'status', "TEXT DEFAULT 'ACTIVE'");
    await addColumn('users', 'msnv', 'TEXT');
    await addColumn('users', 'position', 'TEXT');
    await addColumn('users', 'work_location', 'TEXT');
    await addColumn('users', 'avatar', 'TEXT');
    await addColumn('users', 'join_date', 'TEXT');
    await addColumn('users', 'education', 'TEXT');
    await addColumn('users', 'notes', 'TEXT');
    await addColumn('users', 'data', 'TEXT');

    // 7. Inspection Tables
    const inspectionTables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    for (const table of inspectionTables) {
        try {
          await query(`
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
          migrationLogs.push(`✅ Ensured table ${table} exists in ${schema}`);
        } catch (e: any) {
          console.warn(`⚠️ Could not create ${table}:`, e.message);
          migrationLogs.push(`⚠️ Could not create ${table}: ${e.message}`);
        }
        await addColumn(table, 'deleted_at', 'BIGINT');
        await addColumn(table, 'data', 'TEXT');
        await addColumn(table, 'workshop', 'TEXT');
        await addColumn(table, 'stage', 'TEXT');
        await addColumn(table, 'ma_nha_may', 'TEXT');
        await addColumn(table, 'qty_total', 'NUMERIC');
        await addColumn(table, 'qty_pass', 'NUMERIC');
        await addColumn(table, 'qty_fail', 'NUMERIC');
        await addColumn(table, 'headcode', 'TEXT');
        await addColumn(table, 'production_comment', 'TEXT');
        await addColumn(table, 'responsible_person', 'TEXT');
    }

    // 8. Defect Library
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."defect_library" (
            "id" TEXT PRIMARY KEY,
            "defect_code" TEXT UNIQUE,
            "name" TEXT NOT NULL,
            "stage" TEXT,
            "category" TEXT,
            "description" TEXT,
            "severity" TEXT DEFAULT 'MINOR',
            "suggested_action" TEXT,
            "created_by" TEXT,
            "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "data" TEXT
        );
      `);
      migrationLogs.push(`✅ Ensured table defect_library exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create defect_library:`, e.message);
      migrationLogs.push(`⚠️ Could not create defect_library: ${e.message}`);
    }

    // 9. Floor Plans & Pins
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."floor_plans" (
            "id" TEXT PRIMARY KEY,
            "project_id" TEXT NOT NULL,
            "name" TEXT NOT NULL,
            "image_url" TEXT,
            "version" TEXT,
            "status" TEXT,
            "file_name" TEXT,
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
        );
      `);
      migrationLogs.push(`✅ Ensured table floor_plans exists in ${schema}`);
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."layout_pins" (
            "id" TEXT PRIMARY KEY,
            "floor_plan_id" TEXT NOT NULL,
            "inspection_id" TEXT,
            "x" NUMERIC,
            "y" NUMERIC,
            "status" TEXT,
            "type" TEXT,
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
        );
      `);
      migrationLogs.push(`✅ Ensured table layout_pins exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create floor_plans/pins:`, e.message);
      migrationLogs.push(`⚠️ Could not create floor_plans/pins: ${e.message}`);
    }

    // 10. Workshops & Templates
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."workshops" (
            "id" TEXT PRIMARY KEY,
            "name" TEXT NOT NULL,
            "location" TEXT,
            "manager" TEXT,
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
        );
      `);
      migrationLogs.push(`✅ Ensured table workshops exists in ${schema}`);
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."templates" (
            "id" TEXT PRIMARY KEY,
            "items_json" TEXT,
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
        );
      `);
      migrationLogs.push(`✅ Ensured table templates exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create workshops/templates:`, e.message);
      migrationLogs.push(`⚠️ Could not create workshops/templates: ${e.message}`);
    }

    // 11. Roles
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."roles" (
            "id" TEXT PRIMARY KEY,
            "name" TEXT UNIQUE NOT NULL,
            "permissions_json" TEXT,
            "description" TEXT,
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "data" TEXT
        );
      `);
      migrationLogs.push(`✅ Ensured table roles exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create roles:`, e.message);
      migrationLogs.push(`⚠️ Could not create roles: ${e.message}`);
    }

    // 12. Procedures (ISO)
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."procedures" (
            "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "title" TEXT NOT NULL,
            "content" TEXT,
            "category" TEXT,
            "version" TEXT,
            "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
        );
      `);
      migrationLogs.push(`✅ Ensured table procedures exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create procedures:`, e.message);
      migrationLogs.push(`⚠️ Could not create procedures: ${e.message}`);
    }

    // 13. Other Core Tables
    try {
      await query(`
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
      migrationLogs.push(`✅ Ensured table suppliers exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create suppliers:`, e.message);
      migrationLogs.push(`⚠️ Could not create suppliers: ${e.message}`);
    }
    await addColumn('suppliers', 'deleted_at', 'BIGINT');

    try {
      await query(`
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
      migrationLogs.push(`✅ Ensured table projects exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create projects:`, e.message);
      migrationLogs.push(`⚠️ Could not create projects: ${e.message}`);
    }
    await addColumn('projects', 'deleted_at', 'BIGINT');

    console.log(`📡 ISO-DB: Migrations completed successfully in schema ${schema}`);
    try {
      fs.writeFileSync(path.join(process.cwd(), 'diag_migration.json'), JSON.stringify({
        schema,
        timestamp: new Date().toISOString(),
        logs: migrationLogs
      }, null, 2));
    } catch (e) {}
  } catch (err: any) {
    console.error('❌ ISO-DB: Migration failed', err.message);
    try {
      fs.writeFileSync(path.join(process.cwd(), 'diag_migration_error.json'), JSON.stringify({
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      }, null, 2));
    } catch (e) {}
    // Don't re-throw, let the app start even if migrations fail
  }
}
