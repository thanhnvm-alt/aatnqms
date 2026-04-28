
import fs from 'fs';
import path from 'path';
import { query } from "../lib/db.js";

export async function runMigrations() {
  const schema = process.env.DB_SCHEMA || 'appQAQC';
  console.log(`🚀 ISO-DB: Starting migrations in schema ${schema}...`);
  
  try {
    // 1. Ensure Schema and Extensions exist (Try but don't fail if permission denied)
    try {
      const checkSchema = await query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`, [schema]);
      if (checkSchema.rows.length === 0) {
          try {
              await query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
          } catch (e: any) {
              console.warn(`⚠️ Could not ensure schema exists (might already exist or permission denied):`, e.message);
          }
      }

      const checkExt = await query(`SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'`);
      if (checkExt.rows.length === 0) {
          try {
              await query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
          } catch (e: any) {
              console.warn(`⚠️ Could not ensure pgcrypto extension (might already exist or permission denied):`, e.message);
          }
      }
    } catch (e: any) {
      console.warn(`⚠️ Error checking schema/extension:`, e.message);
    }

    // Helper for adding columns
    const migrationLogs: string[] = [];
    
    // Cache for existing columns to avoid redundant queries
    const existingColumnsCache: Record<string, string[]> = {};
    
    const getExistingColumns = async (tableName: string) => {
        if (existingColumnsCache[tableName]) return existingColumnsCache[tableName];
        try {
            const res = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = $1 AND table_name = $2
            `, [schema, tableName]);
            existingColumnsCache[tableName] = res.rows.map((r: any) => r.column_name);
            return existingColumnsCache[tableName];
        } catch (e) {
            return [];
        }
    };

    const addColumn = async (table: string, column: string, type: string) => {
      try {
        const existingCols = await getExistingColumns(table);
        if (existingCols.includes(column)) {
            return; // Column already exists, skip
        }

        await query(`ALTER TABLE "${schema}"."${table}" ADD COLUMN "${column}" ${type}`);
        const msg = `✅ Added column ${column} to ${schema}.${table}`;
        console.log(msg);
        migrationLogs.push(msg);
        
        // Update cache
        if (existingColumnsCache[table]) {
            existingColumnsCache[table].push(column);
        }
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
    const inspectionTables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_sqc_mat', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
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
        await addColumn(table, 'images_json', 'TEXT');
        await addColumn(table, 'items_json', 'TEXT');
        await addColumn(table, 'comments_json', 'TEXT');
        await addColumn(table, 'so_luong_ipo', 'NUMERIC');
        await addColumn(table, 'inspected_qty', 'NUMERIC');
        await addColumn(table, 'passed_qty', 'NUMERIC');
        await addColumn(table, 'failed_qty', 'NUMERIC');
        await addColumn(table, 'dvt', 'TEXT');
        await addColumn(table, 'headcode', 'TEXT');
        await addColumn(table, 'responsible_person', 'TEXT');
        await addColumn(table, 'workshop', 'TEXT');
        await addColumn(table, 'stage', 'TEXT');
        await addColumn(table, 'ma_nha_may', 'TEXT');
        await addColumn(table, 'qty_total', 'NUMERIC');
        await addColumn(table, 'qty_pass', 'NUMERIC');
        await addColumn(table, 'qty_fail', 'NUMERIC');
        await addColumn(table, 'type', 'TEXT');
        await addColumn(table, 'sl_ipo', 'NUMERIC');
        await addColumn(table, 'production_comment', 'TEXT');
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

    // 14. IPO Drawing List & Details
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."ipo_details" (
            "id" TEXT PRIMARY KEY,
            "id_factory_order" TEXT UNIQUE NOT NULL,
            "history_summary" TEXT,
            "material_history" TEXT,
            "sample_history" TEXT,
            "last_analysis_at" BIGINT,
            "data" TEXT
        );
      `);
      migrationLogs.push(`✅ Ensured table ipo_details exists in ${schema}`);
      
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."ipo_drawing_list" (
            "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "id_factory_order" TEXT NOT NULL,
            "drawing_name" TEXT,
            "version" TEXT,
            "file_url" TEXT,
            "revision_notes" TEXT,
            "page_count" INTEGER,
            "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "created_by" TEXT,
            "data" TEXT
        );
      `);
      migrationLogs.push(`✅ Ensured table ipo_drawing_list exists in ${schema}`);

      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."ipo_material_history" (
            "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "id_factory_order" TEXT NOT NULL,
            "material_name" TEXT,
            "specification" TEXT,
            "version" TEXT,
            "drawing_ref" TEXT,
            "file_url" TEXT,
            "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "created_by" TEXT,
            "data" TEXT
        );
      `);
      migrationLogs.push(`✅ Ensured table ipo_material_history exists in ${schema}`);
      await addColumn('ipo_material_history', 'file_url', 'TEXT');

      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."ipo_sample_history" (
            "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "id_factory_order" TEXT NOT NULL,
            "sample_name" TEXT,
            "status" TEXT,
            "version" TEXT,
            "file_url" TEXT,
            "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "created_by" TEXT,
            "data" TEXT
        );
      `);
      migrationLogs.push(`✅ Ensured table ipo_sample_history exists in ${schema}`);
      await addColumn('ipo_sample_history', 'file_url', 'TEXT');
    } catch (e: any) {
      console.warn(`⚠️ Could not create ipo tables:`, e.message);
      migrationLogs.push(`⚠️ Could not create ipo tables: ${e.message}`);
    }

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
