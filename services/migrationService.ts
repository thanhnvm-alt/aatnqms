
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
    } catch (e: any) {
      console.warn(`⚠️ Could not create audit_logs:`, e.message);
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
    } catch (e: any) {
      console.warn(`⚠️ Could not create status_history:`, e.message);
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
    } catch (e: any) {
      console.warn(`⚠️ Could not create ncrs:`, e.message);
    }
    await addColumn('ncrs', 'deleted_at', 'BIGINT');

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
    } catch (e: any) {
      console.warn(`⚠️ Could not create notifications:`, e.message);
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
            "position" TEXT,
            "work_location" TEXT,
            "status" TEXT DEFAULT 'ACTIVE',
            "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "deleted_at" BIGINT,
            "data" TEXT
        );
      `);
    } catch (e: any) {
      console.warn(`⚠️ Could not create users:`, e.message);
    }
    await addColumn('users', 'deleted_at', 'BIGINT');

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
        } catch (e: any) {
          console.warn(`⚠️ Could not create ${table}:`, e.message);
        }
        await addColumn(table, 'deleted_at', 'BIGINT');
    }

    // 8. Other Core Tables
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."material" (
            "id" TEXT PRIMARY KEY,
            "material" TEXT,
            "shortText" TEXT,
            "orderUnit" TEXT,
            "orderQuantity" NUMERIC,
            "supplierName" TEXT,
            "projectName" TEXT,
            "purchaseDocument" TEXT,
            "deliveryDate" TEXT,
            "Ma_Tender" TEXT,
            "Factory_Order" TEXT,
            "createdAt" TEXT,
            "updatedAt" TEXT,
            "deleted_at" BIGINT
        );
      `);
    } catch (e: any) {
      console.warn(`⚠️ Could not create material:`, e.message);
    }
    await addColumn('material', 'deleted_at', 'BIGINT');

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
    } catch (e: any) {
      console.warn(`⚠️ Could not create suppliers:`, e.message);
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
    } catch (e: any) {
      console.warn(`⚠️ Could not create projects:`, e.message);
    }
    await addColumn('projects', 'deleted_at', 'BIGINT');

    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."ipo" (
            "id" TEXT PRIMARY KEY,
            "headcode" TEXT,
            "ma_nha_may" TEXT,
            "ma_ct" TEXT,
            "ten_ct" TEXT,
            "ten_hang_muc" TEXT,
            "so_luong_ipo" NUMERIC,
            "dvt" TEXT,
            "drawing_url" TEXT,
            "description" TEXT,
            "materials_text" TEXT,
            "samples_json" TEXT,
            "simulations_json" TEXT,
            "created_at" BIGINT,
            "Ma_Tender" TEXT,
            "Project_name" TEXT,
            "deleted_at" BIGINT
        );
      `);
    } catch (e: any) {
      console.warn(`⚠️ Could not create ipo:`, e.message);
    }
    await addColumn('ipo', 'deleted_at', 'BIGINT');

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
