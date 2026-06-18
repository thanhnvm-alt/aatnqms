
import fs from 'fs';
import path from 'path';
import { query } from "../lib/db.js";

export async function runMigrations() {
  const schema = process.env.DB_SCHEMA || 'appQAQC';
  console.log(`🚀 ISO-DB: Starting migrations in schema ${schema}...`);
  
  try {
    // 1. Database environment setup (Assume schema/extensions exist externally)
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
    await addColumn('users', 'phong_ban', 'TEXT');
    await addColumn('users', 'bo_phan', 'TEXT');
    await addColumn('users', 'allowed_modules', 'TEXT');
    await addColumn('users', 'to_qc', 'TEXT');
    await addColumn('users', 'la_to_truong', 'BOOLEAN DEFAULT FALSE');
    await addColumn('users', 'department_id', 'TEXT');
    await addColumn('users', 'division_id', 'TEXT');
    await addColumn('users', 'team_id', 'TEXT');
    await addColumn('users', 'user_permissions', 'TEXT');

    // Seed default users if table is empty
    try {
      const usersCheck = await query(`SELECT COUNT(*) FROM "${schema}"."users"`);
      if (parseInt(usersCheck.rows[0].count || '0') === 0) {
        const defaultUsers = [
          {
            id: '1',
            username: 'admin',
            password: '123',
            name: 'Administrator',
            role: 'ADMIN',
            avatar: 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff',
            allowed_modules: '["IQC", "SQC_MAT", "SQC_BTP", "PQC", "FSR", "STEP", "FQC", "SPR", "SITE", "PROJECTS", "OEM", "SETTINGS", "CONVERT_3D"]',
            msnv: 'MS-001',
            position: 'Giám đốc hệ thống',
            work_location: 'Trụ sở chính',
            status: 'Đang làm việc',
            join_date: '2020-01-01',
            education: 'Thạc sĩ'
          },
          {
            id: '2',
            username: 'manager',
            password: '123',
            name: 'Trần Văn Quản Lý',
            role: 'MANAGER',
            avatar: 'https://ui-avatars.com/api/?name=Manager&background=6366f1&color=fff',
            allowed_modules: '["IQC", "PQC", "FQC", "SITE", "PROJECTS", "CONVERT_3D"]',
            msnv: 'MS-002',
            position: 'Quản lý QC',
            work_location: 'Nhà máy 1',
            status: 'Đang làm việc',
            join_date: '2021-05-15',
            education: 'Đại học'
          },
          {
            id: '3',
            username: 'qc',
            password: '123',
            name: 'Nguyễn Văn QC',
            role: 'QC',
            avatar: 'https://ui-avatars.com/api/?name=QC&background=10b981&color=fff',
            allowed_modules: '["PQC", "SITE", "IQC", "SQC_MAT", "SQC_BTP", "FSR"]',
            msnv: 'MS-003',
            position: 'Nhân viên QC',
            work_location: 'Nhà máy 1',
            status: 'Đang làm việc',
            join_date: '2022-10-01',
            education: 'Cao đẳng'
          }
        ];

        for (const u of defaultUsers) {
          await query(
            `INSERT INTO "${schema}"."users" (id, username, password, name, role, avatar, allowed_modules, msnv, position, work_location, status, join_date, education, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT) 
             ON CONFLICT (id) DO NOTHING`,
            [u.id, u.username, u.password, u.name, u.role, u.avatar, u.allowed_modules, u.msnv, u.position, u.work_location, u.status, u.join_date, u.education]
          );
        }
        migrationLogs.push(`🌱 Seeded default users in ${schema}`);
      }
    } catch (errUserSeed: any) {
      console.warn(`⚠️ Could not seed users:`, errUserSeed.message);
      migrationLogs.push(`⚠️ Could not seed users: ${errUserSeed.message}`);
    }

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
        await addColumn(table, 'signature_qc', 'TEXT');
        await addColumn(table, 'signature_manager', 'TEXT');
        await addColumn(table, 'name_manager', 'TEXT');
        await addColumn(table, 'signature_production', 'TEXT');
        await addColumn(table, 'name_production', 'TEXT');
        await addColumn(table, 'comment_production', 'TEXT');
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
        await addColumn(table, 'floor_plan_id', 'TEXT');
        await addColumn(table, 'coord_x', 'NUMERIC');
        await addColumn(table, 'coord_y', 'NUMERIC');
        await addColumn(table, 'po_number', 'TEXT');
        await addColumn(table, 'supplier', 'TEXT');
        await addColumn(table, 'inspector', 'TEXT');
        await addColumn(table, 'score', 'TEXT');
        await addColumn(table, 'summary', 'TEXT');
        await addColumn(table, 'materials_json', 'TEXT');
        await addColumn(table, 'delivery_images_json', 'TEXT');
        await addColumn(table, 'report_images_json', 'TEXT');
        await addColumn(table, 'date', 'TEXT');
        await addColumn(table, 'supporting_docs_json', 'TEXT');
    }

    // 7.5 Centralized inspections table
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."inspections" (
            "id" TEXT PRIMARY KEY,
            "type" TEXT,
            "ma_ct" TEXT,
            "ten_ct" TEXT,
            "ma_nha_may" TEXT,
            "ten_hang_muc" TEXT,
            "workshop" TEXT,
            "status" TEXT,
            "score" DOUBLE PRECISION DEFAULT 0,
            "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "created_by" TEXT,
            "headcode" TEXT,
            "stage" TEXT,
            "inspected_qty" NUMERIC,
            "passed_qty" NUMERIC,
            "failed_qty" NUMERIC,
            "so_luong_ipo" NUMERIC
        );
      `);
      migrationLogs.push(`✅ Ensured table inspections exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create inspections:`, e.message);
      migrationLogs.push(`⚠️ Could not create inspections: ${e.message}`);
    }
    await addColumn('inspections', 'stage', 'TEXT');
    await addColumn('inspections', 'inspected_qty', 'NUMERIC');
    await addColumn('inspections', 'passed_qty', 'NUMERIC');
    await addColumn('inspections', 'failed_qty', 'NUMERIC');
    await addColumn('inspections', 'so_luong_ipo', 'NUMERIC');

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
            "label" TEXT,
            "status" TEXT,
            "type" TEXT,
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
        );
      `);
      migrationLogs.push(`✅ Ensured table layout_pins exists in ${schema}`);
      await addColumn('layout_pins', 'label', 'TEXT');
      await addColumn('layout_pins', 'inspection_id', 'TEXT');
      await addColumn('layout_pins', 'status', 'TEXT');
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

    // 11. Roles (QMS App Specific Roles Table to avoid colliding with platform roles)
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."qms_roles" (
            "id" TEXT PRIMARY KEY,
            "name" TEXT UNIQUE NOT NULL,
            "permissions" TEXT,
            "description" TEXT,
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "data" TEXT
        );
      `);
      migrationLogs.push(`✅ Ensured table qms_roles exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create qms_roles:`, e.message);
      migrationLogs.push(`⚠️ Could not create qms_roles: ${e.message}`);
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
            "start_date" TEXT,
            "end_date" TEXT,
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
    await addColumn('projects', 'start_date', 'TEXT');
    await addColumn('projects', 'end_date', 'TEXT');
    await addColumn('projects', 'startDate', 'TEXT');
    await addColumn('projects', 'endDate', 'TEXT');

    // 13.5 Project Documents
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."project_documents" (
            "id" TEXT PRIMARY KEY,
            "project_id" TEXT,
            "ma_ct" TEXT,
            "name" TEXT,
            "version" TEXT,
            "issue_date" TEXT,
            "update_date" TEXT,
            "file_url" TEXT,
            "description" TEXT,
            "created_by" TEXT,
            "created_at" BIGINT,
            "updated_at" BIGINT,
            "deleted_at" BIGINT,
            "data" TEXT
        );
      `);
      migrationLogs.push(`✅ Ensured table project_documents exists in ${schema}`);
    } catch (e: any) {
      console.warn(`⚠️ Could not create project_documents:`, e.message);
      migrationLogs.push(`⚠️ Could not create project_documents: ${e.message}`);
    }

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

    // Tối ưu hóa Database: Giải pháp 2 (Sử dụng Materialized View cho projects)
    try {
      await query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS "${schema}"."ipo_projects_mv" AS
        SELECT 
            "Ma_Tender" as ma_ct,
            MAX("Project_name") as name
        FROM "${schema}"."ipo"
        WHERE "Ma_Tender" IS NOT NULL AND "Ma_Tender" != ''
        GROUP BY "Ma_Tender";
      `);
      await query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ipo_projects_mv_ma_ct_uidx" ON "${schema}"."ipo_projects_mv" ("ma_ct");
      `);
      migrationLogs.push(`✅ Ensured Materialized View ipo_projects_mv exists in ${schema}`);
    } catch (mvErr: any) {
      console.warn(`⚠️ Could not create ipo_projects_mv Materialized View:`, mvErr.message);
      migrationLogs.push(`⚠️ Could not create ipo_projects_mv Materialized View: ${mvErr.message}`);
    }

    // --- DEPARTMENTS TABLE ---
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."departments" (
            "id" TEXT PRIMARY KEY,
            "name" TEXT UNIQUE NOT NULL,
            "divisions" TEXT NOT NULL DEFAULT '[]',
            "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
        );
      `);
      migrationLogs.push(`✅ Ensured table departments exists in ${schema}`);

      const deptsCount = await query(`SELECT COUNT(*) FROM "${schema}"."departments"`);
      if (parseInt(deptsCount.rows[0].count || '0') === 0) {
        const defaultDepts = [
          { id: 'dept_qaqc', name: 'Phòng QAQC', divisions: JSON.stringify(['QA', 'QC']) },
          { id: 'dept_sx', name: 'Phòng Sản xuất', divisions: JSON.stringify(['Xưởng Mộc', 'Xưởng Sơn', 'Xưởng Lắp Ráp']) },
          { id: 'dept_vt', name: 'Phòng Vật tư', divisions: JSON.stringify(['Thu Mua', 'Quản Lý Kho']) },
          { id: 'dept_sd', name: 'Phòng SD', divisions: JSON.stringify(['Shop Drawing', 'Thiết Kế']) },
          { id: 'dept_kh', name: 'Phòng Kế hoạch', divisions: JSON.stringify(['BP PC', 'BP PM']) }
        ];

        for (const d of defaultDepts) {
          await query(
            `INSERT INTO "${schema}"."departments" (id, name, divisions) VALUES ($1, $2, $3)`,
            [d.id, d.name, d.divisions]
          );
        }
        migrationLogs.push(`🌱 Seeded default departments in ${schema}`);
      }
    } catch (deptErr: any) {
      console.warn(`⚠️ Could not create departments table:`, deptErr.message);
      migrationLogs.push(`⚠️ Could not create departments table: ${deptErr.message}`);
    }

    // --- DIVISIONS TABLE ---
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."divisions" (
            "id" TEXT PRIMARY KEY,
            "name" TEXT NOT NULL,
            "department_id" TEXT NOT NULL,
            "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
        );
      `);
      migrationLogs.push(`✅ Ensured table divisions exists in ${schema}`);
    } catch (divErr: any) {
      console.warn(`⚠️ Could not create divisions table:`, divErr.message);
      migrationLogs.push(`⚠️ Could not create divisions table: ${divErr.message}`);
    }

    // --- TEAMS TABLE ---
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."teams" (
            "id" TEXT PRIMARY KEY,
            "name" TEXT NOT NULL,
            "division_id" TEXT NOT NULL,
            "leader_id" TEXT,
            "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
        );
      `);
      migrationLogs.push(`✅ Ensured table teams exists in ${schema}`);
    } catch (teamErr: any) {
      console.warn(`⚠️ Could not create teams table:`, teamErr.message);
      migrationLogs.push(`⚠️ Could not create teams table: ${teamErr.message}`);
    }

    try {
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."tool_catalogs" (
            "id" TEXT PRIMARY KEY,
            "code" TEXT UNIQUE NOT NULL,
            "name" TEXT NOT NULL,
            "type" TEXT,
            "specifications" TEXT,
            "manual_markdown" TEXT,
            "manual_pdf_url" TEXT,
            "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "created_by" TEXT
        );
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."tool_assets" (
            "id" TEXT PRIMARY KEY,
            "catalog_id" TEXT NOT NULL,
            "asset_code" TEXT UNIQUE NOT NULL,
            "serial_number" TEXT,
            "current_user_id" TEXT,
            "next_calibration_date" BIGINT,
            "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
            "created_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "updated_at" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "created_by" TEXT
        );
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."tool_transfers" (
            "id" TEXT PRIMARY KEY,
            "tool_asset_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
            "from_user_id" TEXT,
            "to_user_id" TEXT NOT NULL,
            "status" TEXT NOT NULL DEFAULT 'PENDING',
            "request_date" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "receiver_confirm_date" BIGINT,
            "receiver_signature" TEXT,
            "receiver_image" TEXT,
            "manager_approve_date" BIGINT,
            "manager_signature" TEXT,
            "notes" TEXT
        );
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."tool_calibrations" (
            "id" TEXT PRIMARY KEY,
            "tool_asset_id" TEXT NOT NULL,
            "request_date" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
            "requested_by" TEXT NOT NULL,
            "status" TEXT NOT NULL DEFAULT 'PENDING',
            "calibration_date" BIGINT,
            "next_calibration_date" BIGINT,
            "certificate_url" TEXT,
            "approved_by" TEXT,
            "notes" TEXT
        );
      `);
      migrationLogs.push(`✅ Ensured table tools exists in ${schema}`);

      try {
        await query(`ALTER TABLE "${schema}"."tool_transfers" RENAME COLUMN "tool_id" TO "tool_asset_id"`);
      } catch(e) {}
      
      try {
        await query(`ALTER TABLE "${schema}"."tool_calibrations" RENAME COLUMN "tool_id" TO "tool_asset_id"`);
      } catch (alterError) {
        try {
            await query(`ALTER TABLE "${schema}"."tool_calibrations" ADD COLUMN IF NOT EXISTS "tool_asset_id" TEXT`);
        } catch(e) {}
      }

      // Convert tool_asset_id to tool_asset_ids JSONB array for multiple assets
      try {
        const transCols = await getExistingColumns('tool_transfers');
        if (!transCols.includes('tool_asset_ids')) {
          await query(`ALTER TABLE "${schema}"."tool_transfers" ADD COLUMN "tool_asset_ids" JSONB NOT NULL DEFAULT '[]'::jsonb`);
          await query(`UPDATE "${schema}"."tool_transfers" SET "tool_asset_ids" = jsonb_build_array("tool_asset_id") WHERE "tool_asset_id" IS NOT NULL`);
          if (transCols.includes('tool_asset_id')) {
            await query(`ALTER TABLE "${schema}"."tool_transfers" DROP COLUMN "tool_asset_id"`);
          }
        }
      } catch (e) {}

      const toolsCount = await query(`SELECT COUNT(*) FROM "${schema}"."tool_catalogs"`);
      if (parseInt(toolsCount.rows[0].count || '0') === 0) {
        const defaultTools = [
          { id: 'CAT_001', code: 'TC-35M', name: 'Thước cuộn 3.5m', type: 'Đo lường', specifications: 'Thước cuộn loại 3.5m' },
          { id: 'CAT_002', code: 'TC-50M', name: 'Thước cuộn 5.0m', type: 'Đo lường', specifications: 'Thước cuộn loại 5.0m' },
          { id: 'CAT_003', code: 'TK-200MM', name: 'Thước kẹp điện tử 200mm', type: 'Đo lường', specifications: 'Thước kẹp điện tử, độ chính xác cao' },
          { id: 'CAT_004', code: 'MDAM-01', name: 'Máy đo độ ẩm gỗ có kim', type: 'Đo lường', specifications: 'Đo độ ẩm gỗ chuyên sâu' }
        ];

        for (const t of defaultTools) {
          await query(
            `INSERT INTO "${schema}"."tool_catalogs" (id, code, name, type, specifications, created_by) VALUES ($1, $2, $3, $4, $5, 'SYSTEM') ON CONFLICT (id) DO NOTHING`,
            [t.id, t.code, t.name, t.type, t.specifications]
          );
        }
        migrationLogs.push(`🌱 Seeded default tool catalogs in ${schema}`);
      }
    } catch (toolErr: any) {
      console.warn(`⚠️ Could not create tools tables:`, toolErr.message);
      migrationLogs.push(`⚠️ Could not create tools tables: ${toolErr.message}`);
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
