
import { query } from "../lib/db.js";
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { NCR, Inspection, IPOItem, User, Workshop, CheckItem, QMSImage, Project, Role, Defect, DefectLibraryItem, Notification, NCRComment, InspectionStatus, MaterialIQC, CheckStatus, ModuleId, Supplier, FloorPlan, LayoutPin, Material, ProjectDocument } from "../types.js";

const SALT_ROUNDS = 10;

// Use environment variable for schema if available, otherwise default to "appQAQC"
// Note: In client-side, process.env.DB_SCHEMA might not be available unless prefixed with VITE_
// but since we proxy queries to the server, the server's DB_SCHEMA will be used if we just pass the name.
// However, for consistency in SQL generation, we'll use a constant that can be overridden.
const SCHEMA_NAME = (typeof process !== 'undefined' && process.env.DB_SCHEMA) || 'appQAQC';
const SCHEMA = `"${SCHEMA_NAME}"`;

/**
 * Helper to safely parse JSON strings from the database
 */
const safeJsonParse = <T>(jsonString: any, defaultValue: T): T => {
  if (!jsonString || jsonString === "undefined" || jsonString === "null") return defaultValue;
  try {
    if (typeof jsonString === 'object' && jsonString !== null) return jsonString as T;
    return JSON.parse(jsonString) as T;
  } catch (e) {
    return defaultValue;
  }
};

// --- HELPERS ---

/**
 * Syncs common inspection data to the centralized 'inspections' table
 */
async function syncToInspectionsTable(inspection: Inspection) {
    try {
        const updatedAt = parseTS(inspection.updatedAt);
        const createdAt = parseTS(inspection.createdAt || inspection.date || Date.now());
        
        await query(`
            INSERT INTO ${SCHEMA}."inspections" (
                id, type, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, 
                workshop, status, score, created_at, updated_at, created_by, headcode,
                stage, inspected_qty, passed_qty, failed_qty, so_luong_ipo, priority
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, 
                $9::double precision, $10::bigint, $11::bigint, $12, $13,
                $14, $15::numeric, $16::numeric, $17::numeric, $18::numeric, $19
            )
            ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status,
                score = EXCLUDED.score,
                updated_at = EXCLUDED.updated_at,
                ma_ct = EXCLUDED.ma_ct,
                ten_ct = EXCLUDED.ten_ct,
                ma_nha_may = EXCLUDED.ma_nha_may,
                ten_hang_muc = EXCLUDED.ten_hang_muc,
                workshop = EXCLUDED.workshop,
                headcode = EXCLUDED.headcode,
                stage = EXCLUDED.stage,
                inspected_qty = EXCLUDED.inspected_qty,
                passed_qty = EXCLUDED.passed_qty,
                failed_qty = EXCLUDED.failed_qty,
                so_luong_ipo = EXCLUDED.so_luong_ipo,
                priority = EXCLUDED.priority,
                created_by = COALESCE(${SCHEMA}."inspections".created_by, EXCLUDED.created_by),
                created_at = CASE WHEN ${SCHEMA}."inspections".created_at = 0 THEN EXCLUDED.created_at ELSE ${SCHEMA}."inspections".created_at END
        `, sanitizeArgs([
            inspection.id, 
            inspection.type, 
            inspection.ma_ct, 
            inspection.ten_ct, 
            inspection.ma_nha_may, 
            inspection.ten_hang_muc,
            inspection.workshop, 
            inspection.status, 
            inspection.score || 0,
            createdAt,
            updatedAt,
            inspection.inspectorName || 'SYSTEM',
            inspection.headcode,
            inspection.inspectionStage || (inspection as any).stage,
            inspection.inspectedQuantity || 0,
            inspection.passedQuantity || 0,
            inspection.failedQuantity || 0,
            inspection.so_luong_ipo || 0,
            inspection.priority || null
        ]));
    } catch (e) {
        console.error(`❌ ISO-DB: Sync to inspections table failed for ${inspection.id}:`, e);
    }
}

const parseTS = (val: any): number => {
    if (!val) return Math.floor(Date.now() / 1000);
    if (typeof val === 'number') {
        if (isNaN(val) || val <= 0) return Math.floor(Date.now() / 1000);
        // If it's milliseconds (length > 11), convert to seconds
        if (val > 100000000000) return Math.floor(val / 1000);
        return Math.floor(val);
    }
    const strVal = String(val).trim();
    if (!strVal || strVal === "0" || strVal === "undefined" || strVal === "null") return Math.floor(Date.now() / 1000);
    
    if (/^\d+$/.test(strVal)) {
        const n = parseInt(strVal, 10);
        if (isNaN(n) || n <= 0) return Math.floor(Date.now() / 1000);
        if (n > 100000000000) return Math.floor(n / 1000);
        return n;
    }
    
    // Handle DD/MM/YYYY
    const ddmmmyyyy = strVal.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (ddmmmyyyy) {
        const [, d, m, y, h, min, s] = ddmmmyyyy;
        const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), h ? parseInt(h, 10) : 0, min ? parseInt(min, 10) : 0, s ? parseInt(s, 10) : 0);
        if (!isNaN(date.getTime())) return Math.floor(date.getTime() / 1000);
    }

    const parsed = Date.parse(strVal);
    if (!isNaN(parsed)) {
        return Math.floor(parsed / 1000);
    }
    return Math.floor(Date.now() / 1000);
};

/**
 * Helper to sanitize database arguments
 */
const sanitizeArgs = (args: any[]): any[] => {
    return args.map(arg => {
        if (arg === undefined) return null;
        if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg);
        if (typeof arg === 'number' && isNaN(arg)) return null;
        return arg;
    });
};

export const MODULE_TABLES = ['iqc', 'pqc', 'sqc_mat', 'sqc_vt', 'sqc_btp', 'sqc', 'fsr', 'step', 'fqc', 'spr', 'site'];

/**
 * Get the table name based on inspection type
 */
export const getTableName = (type: string = 'PQC'): string => {
    const t = String(type || 'PQC').trim().toUpperCase();
    
    if (t === 'SQC' || t === 'SQC_VT' || t === 'SQC-VT' || t === 'VẬT TƯ' || t === 'VAT TU') return `${SCHEMA}."forms_sqc_vt"`;
    if (t === 'SQC_BTP' || t === 'SQC-BTP' || t === 'BÁN THÀNH PHẨM' || t === 'BAN THANH PHAM') return `${SCHEMA}."forms_sqc_btp"`;
    if (t === 'SQC_MAT' || t === 'SQC-MAT') return `${SCHEMA}."forms_sqc_mat"`;
    if (t === 'PQC') return `${SCHEMA}."forms_pqc"`;
    if (t === 'IQC') return `${SCHEMA}."forms_iqc"`;
    if (t === 'SITE') return `${SCHEMA}."forms_site"`;
    if (t === 'FSR') return `${SCHEMA}."forms_fsr"`;
    if (t === 'FQC') return `${SCHEMA}."forms_fqc"`;
    if (t === 'SPR') return `${SCHEMA}."forms_spr"`;
    if (t === 'STEP') return `${SCHEMA}."forms_step"`;
    
    // Fallback search in MODULE_TABLES
    const lowerT = t.toLowerCase();
    if (MODULE_TABLES.includes(lowerT)) return `${SCHEMA}."forms_${lowerT}"`;
    
    return `${SCHEMA}."forms_pqc"`;
};

/**
 * Tự động thêm cột nếu chưa tồn tại (ISO Schema Evolution)
 */
async function ensureTableColumns(tableName: string, expectedColumns: Record<string, string>) {
    try {
        // PostgreSQL query to check for columns
        const res = await query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = $1 
            AND table_name = $2
        `, [SCHEMA_NAME, tableName.replace(`${SCHEMA}.`, '').replace(/"/g, '')]);
        
        const existingCols = res.rows.map((r: any) => r.column_name);
        
        for (const [colName, colType] of Object.entries(expectedColumns)) {
            if (!existingCols.includes(colName)) {
                console.log(`📡 ISO-DB: Adding missing column ${colName} to ${tableName}`);
                await query(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colType}`);
            }
        }
    } catch (e) {
        console.error(`Lỗi khi kiểm tra schema cho bảng ${tableName}:`, e);
    }
}

/**
 * Initialize database tables (Disabled as per request)
 */
export const initDatabase = async () => {
  console.log("Database initialization (table creation/checks) skipped as per configuration.");
};

// --- FLOOR PLANS & PINS ---

export async function getFloorPlans(projectId: string): Promise<FloorPlan[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}."floor_plans" WHERE project_id = $1 ORDER BY updated_at DESC`, [projectId]);
    return res.rows as unknown as FloorPlan[];
}

export async function saveFloorPlan(fp: FloorPlan) {
    await query(`
        INSERT INTO ${SCHEMA}."floor_plans" (id, project_id, name, image_url, version, status, file_name, updated_at) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, EXTRACT(EPOCH FROM NOW())::BIGINT) 
        ON CONFLICT(id) DO UPDATE SET 
            name = EXCLUDED.name, 
            image_url = EXCLUDED.image_url, 
            version = EXCLUDED.version, 
            status = EXCLUDED.status, 
            updated_at = EXCLUDED.updated_at
    `, sanitizeArgs([fp.id, fp.project_id, fp.name, fp.image_url, fp.version, fp.status, fp.file_name]));
}

export async function deleteFloorPlan(id: string) {
    await query(`DELETE FROM ${SCHEMA}."floor_plans" WHERE id = $1`, [id]);
    await query(`DELETE FROM ${SCHEMA}."layout_pins" WHERE floor_plan_id = $1`, [id]);
}

export async function getLayoutPins(floorPlanId: string): Promise<LayoutPin[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}."layout_pins" WHERE floor_plan_id = $1`, [floorPlanId]);
    const pins = res.rows as any[];
    for (const pin of pins) {
        if (pin.inspection_id) {
            const tables = ['forms_site', 'forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_sqc_mat', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr'];
            for (const table of tables) {
                try {
                    const rowRes = await query(`SELECT headcode, type, status FROM ${SCHEMA}."${table}" WHERE id = $1`, [pin.inspection_id]);
                    if (rowRes.rows.length > 0) {
                        pin.headcode = rowRes.rows[0].headcode || '';
                        pin.type = rowRes.rows[0].type || '';
                        if (rowRes.rows[0].status) {
                            pin.status = rowRes.rows[0].status;
                        }
                        break;
                    }
                } catch (e) {}
            }
        }
    }
    return pins as LayoutPin[];
}

export async function saveLayoutPin(pin: LayoutPin) {
    await query(`
        INSERT INTO ${SCHEMA}."layout_pins" (id, floor_plan_id, inspection_id, x, y, label, status) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) 
        ON CONFLICT(id) DO UPDATE SET 
            inspection_id = EXCLUDED.inspection_id, 
            status = EXCLUDED.status,
            x = EXCLUDED.x,
            y = EXCLUDED.y,
            label = EXCLUDED.label
    `, sanitizeArgs([pin.id, pin.floor_plan_id, pin.inspection_id, pin.x, pin.y, pin.label, pin.status]));
}

// --- INSPECTIONS ---

export async function saveInspection(inspection: Inspection) {
  const table = getTableName(inspection.type);
  
  // Auto-fill project info if missing, especially for "Dùng Chung" cases
  if (!inspection.ma_ct || !inspection.ten_ct) {
    let source: any[] = [];
    if (Array.isArray(inspection.materials) && inspection.materials.length > 0) {
        source = inspection.materials;
    } else if (Array.isArray(inspection.items) && inspection.items.length > 0) {
        source = inspection.items;
    }

    if (source && source.length > 0) {
        const first = source[0];
        if (!inspection.ma_ct) inspection.ma_ct = first.projectCode || first.Ma_Tender || first.ma_ct || '';
        if (!inspection.ten_ct) inspection.ten_ct = first.projectName || first.ten_ct || '';
    }
  }

  // Final forced check for Shared materials (Vật tư dùng chung)
  const tUpper = String(inspection.type || '').trim().toUpperCase();
  
  // Set accurate workshop values automatically based on type/id
  if (tUpper === 'IQC' || tUpper === 'SQC_MAT') {
      inspection.workshop = 'VẬT TƯ';
  } else if (tUpper === 'SQC_BTP') {
      inspection.workshop = 'GCN';
  } else if (tUpper === 'SITE') {
      inspection.workshop = 'LẮP ĐẶT';
  } else if (tUpper === 'SQC') {
      if (String(inspection.id || '').toUpperCase().startsWith('SQC-VT-')) {
          inspection.workshop = 'VẬT TƯ';
      } else if (String(inspection.id || '').toUpperCase().startsWith('SQC-BTP-')) {
          inspection.workshop = 'GCN';
      }
  }

  const isSharedType = tUpper === 'IQC' || tUpper.includes('SQC_VT') || tUpper.includes('SQC_MAT') || tUpper.includes('SQC-VT') || tUpper.includes('SQC-MAT');
  
  if (isSharedType) {
      const maCtClean = String(inspection.ma_ct || '').trim().toUpperCase();
      const isActuallyShared = !maCtClean || 
                              maCtClean === 'DÙNG CHUNG' || 
                              maCtClean === 'DUNG CHUNG' || 
                              maCtClean === 'SHARED' || 
                              maCtClean === 'DC' ||
                              maCtClean === 'VẬT TƯ DÙNG CHUNG' ||
                              maCtClean === 'VAT TU DUNG CHUNG';

      if (isActuallyShared) {
          inspection.ma_ct = 'DÙNG CHUNG';
          inspection.ten_ct = 'VẬT TƯ KHO DÙNG CHUNG';
      }
  }

  const existing = await getInspectionById(inspection.id);
  const oldValue = existing ? { ...existing } : null;

  // Ensure dates are parsed as BIGINT epochs for DB (seconds)
  const updatedAt = parseTS(inspection.updatedAt);
  const inspection_date = parseTS(inspection.date);

    if (inspection.type === 'PQC') {
      await query(`
        INSERT INTO ${SCHEMA}."forms_pqc" (
          id, ma_ct, ten_ct, ten_hang_muc, ma_nha_may, workshop, stage, dvt, 
          sl_ipo, qty_total, qty_pass, qty_fail,
          so_luong_ipo, inspected_qty, passed_qty, failed_qty,
          inspector, status, updated_at, items_json, images_json, headcode, date, score, summary, type, 
          production_comment, floor_plan_id, coord_x, coord_y, responsible_person,
          signature_qc, signature_manager, name_manager, signature_production, name_production, comment_production,
          signature_teamlead, name_teamlead, date_teamlead,
          comments_json, data
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, 
          $9::numeric, $10::numeric, $11::numeric, $12::numeric, 
          $9::numeric, $10::numeric, $11::numeric, $12::numeric, 
          $13, $14, $15::bigint, $16::jsonb, $17::jsonb, $18, $19::bigint, $20::numeric, $21, $22, 
          $23, $24, $25::numeric, $26::numeric, $27, $28::text, $29::text, $30::text, $31::text, $32::text, $33::text, 
          $34::text, $35::text, $36::text,
          $37::jsonb, $38::jsonb
        )
        ON CONFLICT(id) DO UPDATE SET 
          status = EXCLUDED.status, 
          updated_at = EXCLUDED.updated_at, 
          date = COALESCE(${table}.date, EXCLUDED.date),
          score = EXCLUDED.score, 
          items_json = EXCLUDED.items_json,
          images_json = EXCLUDED.images_json,
          summary = EXCLUDED.summary,
          floor_plan_id = EXCLUDED.floor_plan_id, 
          coord_x = EXCLUDED.coord_x, 
          coord_y = EXCLUDED.coord_y, 
          responsible_person = EXCLUDED.responsible_person,
          signature_qc = EXCLUDED.signature_qc,
          signature_manager = EXCLUDED.signature_manager,
          name_manager = EXCLUDED.name_manager,
          signature_production = EXCLUDED.signature_production,
          name_production = EXCLUDED.name_production,
          comment_production = EXCLUDED.comment_production,
          signature_teamlead = EXCLUDED.signature_teamlead,
          name_teamlead = EXCLUDED.name_teamlead,
          date_teamlead = COALESCE(${table}.date_teamlead, EXCLUDED.date_teamlead),
          comments_json = EXCLUDED.comments_json,
          sl_ipo = EXCLUDED.sl_ipo,
          qty_total = EXCLUDED.qty_total,
          qty_pass = EXCLUDED.qty_pass,
          qty_fail = EXCLUDED.qty_fail,
          so_luong_ipo = EXCLUDED.so_luong_ipo,
          inspected_qty = EXCLUDED.inspected_qty,
          passed_qty = EXCLUDED.passed_qty,
          failed_qty = EXCLUDED.failed_qty,
          workshop = EXCLUDED.workshop,
          stage = EXCLUDED.stage,
          data = EXCLUDED.data
      `, sanitizeArgs([
          inspection.id, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc, 
          inspection.ma_nha_may, inspection.workshop, inspection.inspectionStage, inspection.dvt,
          inspection.so_luong_ipo || 0, inspection.inspectedQuantity || 0, inspection.passedQuantity || 0, inspection.failedQuantity || 0,
          inspection.inspectorName, inspection.status, updatedAt,
          inspection.items, inspection.images, inspection.headcode, inspection_date, inspection.score, 
          inspection.summary, inspection.type, inspection.productionComment,
          inspection.floor_plan_id, inspection.coord_x, inspection.coord_y,
          inspection.responsiblePerson,
          inspection.signature, inspection.managerSignature, inspection.managerName,
          inspection.productionSignature, inspection.productionName, inspection.productionComment,
          inspection.teamLeadSignature, inspection.teamLeadName, inspection.teamLeadDate,
          inspection.comments, inspection
      ]));
    } else {
    // ISO Standard mapping cho các module: SITE, IQC, SQC, FQC...
    await query(`
      INSERT INTO ${table} (
        id, type, ma_ct, ten_ct, ten_hang_muc, po_number, supplier, inspector, status, date, 
        score, summary, items_json, materials_json, signature_qc, signature_manager, name_manager,
        signature_production, name_production, comment_production, images_json, delivery_images_json, 
        report_images_json, comments_json, 
        so_luong_ipo, inspected_qty, passed_qty, failed_qty,
        sl_ipo, qty_total, qty_pass, qty_fail,
        dvt, updated_at, floor_plan_id, coord_x, coord_y, location, supplier_address, supporting_docs_json,
        responsible_person, ma_nha_may, workshop, stage, headcode, production_comment,
        signature_teamlead, name_teamlead, date_teamlead, data
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
        $11::numeric, $12, $13::jsonb, $14::jsonb, $15::text, $16::text, $17::text, $18::text, $19::text, $20::text, 
        $21::jsonb, $22::jsonb, $23::jsonb, $24::jsonb, 
        $25::numeric, $26::numeric, $27::numeric, $28::numeric, 
        $25::numeric, $26::numeric, $27::numeric, $28::numeric, 
        $29, $30::bigint, $31, $32::numeric, $33::numeric, $34, $35, $36::jsonb, $37, $38, $39, $40, $41, $42,
        $43::text, $44::text, $45::text, $46::jsonb
      )
      ON CONFLICT(id) DO UPDATE SET 
        status = EXCLUDED.status, 
        score = EXCLUDED.score, 
        date = COALESCE(${table}.date, EXCLUDED.date),
        summary = EXCLUDED.summary,
        items_json = EXCLUDED.items_json,
        images_json = EXCLUDED.images_json,
        updated_at = EXCLUDED.updated_at, 
        floor_plan_id = EXCLUDED.floor_plan_id, 
        coord_x = EXCLUDED.coord_x, 
        coord_y = EXCLUDED.coord_y,
        signature_qc = EXCLUDED.signature_qc,
        signature_manager = EXCLUDED.signature_manager,
        name_manager = EXCLUDED.name_manager,
        signature_production = EXCLUDED.signature_production,
        name_production = EXCLUDED.name_production,
        comment_production = EXCLUDED.comment_production,
        signature_teamlead = EXCLUDED.signature_teamlead,
        name_teamlead = EXCLUDED.name_teamlead,
        date_teamlead = COALESCE(${table}.date_teamlead, EXCLUDED.date_teamlead),
        production_comment = EXCLUDED.production_comment,
        location = EXCLUDED.location,
        comments_json = EXCLUDED.comments_json,
        responsible_person = EXCLUDED.responsible_person,
        so_luong_ipo = EXCLUDED.so_luong_ipo,
        inspected_qty = EXCLUDED.inspected_qty,
        passed_qty = EXCLUDED.passed_qty,
        failed_qty = EXCLUDED.failed_qty,
        sl_ipo = EXCLUDED.sl_ipo,
        qty_total = EXCLUDED.qty_total,
        qty_pass = EXCLUDED.qty_pass,
        qty_fail = EXCLUDED.qty_fail,
        materials_json = EXCLUDED.materials_json,
        delivery_images_json = EXCLUDED.delivery_images_json,
        report_images_json = EXCLUDED.report_images_json,
        supplier_address = EXCLUDED.supplier_address,
        supporting_docs_json = EXCLUDED.supporting_docs_json,
        po_number = EXCLUDED.po_number,
        supplier = EXCLUDED.supplier,
        ma_ct = EXCLUDED.ma_ct,
        ten_ct = EXCLUDED.ten_ct,
        ten_hang_muc = EXCLUDED.ten_hang_muc,
        ma_nha_may = EXCLUDED.ma_nha_may,
        workshop = EXCLUDED.workshop,
        stage = EXCLUDED.stage,
        headcode = EXCLUDED.headcode,
        dvt = EXCLUDED.dvt,
        data = EXCLUDED.data
    `, sanitizeArgs([
        inspection.id, inspection.type, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc,
        inspection.po_number, inspection.supplier, inspection.inspectorName, inspection.status, inspection_date,
        inspection.score, inspection.summary, inspection.items, inspection.materials,
        inspection.signature, inspection.managerSignature, inspection.managerName,
        inspection.productionSignature, inspection.productionName, inspection.productionComment,
        inspection.images, inspection.deliveryNoteImages, inspection.reportImages, inspection.comments,
        inspection.so_luong_ipo || 0, inspection.inspectedQuantity || 0, inspection.passedQuantity || 0, inspection.failedQuantity || 0,
        inspection.dvt, updatedAt, 
        inspection.floor_plan_id, inspection.coord_x, inspection.coord_y,
        inspection.location, inspection.supplierAddress, inspection.supportingDocs,
        inspection.responsiblePerson,
        inspection.ma_nha_may, inspection.workshop, inspection.inspectionStage, inspection.headcode,
        inspection.productionComment,
        inspection.teamLeadSignature, inspection.teamLeadName, inspection.teamLeadDate,
        JSON.stringify(inspection)
      ]));
    }

  // --- PREPARE SIDE TASKS ---
  const sideTasks: Promise<any>[] = [];
  
  // Save NCRs (Parallelized)
  const ncrTasks: Promise<any>[] = [];
  const inspectorName = inspection.inspectorName || 'SYSTEM';

  if (Array.isArray(inspection.items)) {
    for (const item of inspection.items) {
      if (item.ncr && typeof item.ncr === 'object' && item.ncr.id) {
        ncrTasks.push(saveNcrMapped(inspection.id, item.ncr, inspectorName));
      }
    }
  }

  if (Array.isArray(inspection.materials)) {
    for (const mat of inspection.materials) {
      if (Array.isArray(mat.items)) {
        for (const item of mat.items) {
          if (item.ncr && typeof item.ncr === 'object' && item.ncr.id) {
            ncrTasks.push(saveNcrMapped(inspection.id, item.ncr, inspectorName));
          }
        }
      }
    }
  }

  sideTasks.push(Promise.all(ncrTasks));
  sideTasks.push(logAudit(inspection.inspectorName || 'SYSTEM', oldValue ? 'UPDATE_INSPECTION' : 'CREATE_INSPECTION', 'inspection', inspection.id, oldValue, inspection));
  sideTasks.push(syncToInspectionsTable(inspection));

  // Run initial side tasks in parallel
  await Promise.all(sideTasks);

  // Background Tasks (Don't wait for these to respond to UI)
  (async () => {
    try {
        await refreshDailyStatsMV();

        if (oldValue && oldValue.status !== inspection.status) {
            await logStatusChange('inspection', inspection.id, oldValue.status, inspection.status, inspection.inspectorName || 'SYSTEM');
            
            if (inspection.status === InspectionStatus.SUBMITTED) {
                const project = await getProjectByCode(inspection.ma_ct);
                if (project) {
                    const notifyPromises = [];
                    if (project.pm) notifyPromises.push(addNotification(project.pm, 'INSPECTION_SUBMITTED', 'New Inspection Submitted', `Inspection ${inspection.id} is awaiting review.`, { inspectionId: inspection.id }));
                    if (project.qa) notifyPromises.push(addNotification(project.qa, 'INSPECTION_SUBMITTED', 'New Inspection Submitted', `Inspection ${inspection.id} is awaiting review.`, { inspectionId: inspection.id }));
                    await Promise.all(notifyPromises);
                }
            }
        } else if (!oldValue) {
            await logStatusChange('inspection', inspection.id, null, inspection.status, inspection.inspectorName || 'SYSTEM');
            
            if (inspection.status === InspectionStatus.SUBMITTED) {
                const project = await getProjectByCode(inspection.ma_ct);
                if (project) {
                    const notifyPromises = [];
                    if (project.pm) notifyPromises.push(addNotification(project.pm, 'INSPECTION_SUBMITTED', 'New Inspection Submitted', `Inspection ${inspection.id} is awaiting review.`, { inspectionId: inspection.id }));
                    if (project.qa) notifyPromises.push(addNotification(project.qa, 'INSPECTION_SUBMITTED', 'New Inspection Submitted', `Inspection ${inspection.id} is awaiting review.`, { inspectionId: inspection.id }));
                    await Promise.all(notifyPromises);
                }
            }
        }
    } catch (bgError) {
        console.error("❌ ISO-DB: Background task error:", bgError);
    }
  })();
}

function buildBaseWhere(filters: any, user?: User) {
    let whereClause = 'WHERE 1=1';
    const subArgs: any[] = [];

    // Enforcement: If user is not Admin/Manager and has a specific workshop (Tổ), restrict them to it.
    // Removed as per user request to allow broader workshop search for team leads.
    /*
    if (user && user.role !== 'ADMIN' && user.role !== 'MANAGER' && (user.to_qc || user.toQC)) {
        filters.workshop = user.to_qc || user.toQC;
    }
    */
    
    if (filters.status && filters.status !== 'ALL') {
        const statuses = filters.status.split(',').map((s: string) => s.trim());
        const placeholders = statuses.map((_: any, i: number) => `$${subArgs.length + 1 + i}`).join(', ');
        whereClause += ` AND status IN (${placeholders})`;
        subArgs.push(...statuses);
    }

    if (filters.search) {
        const searchPattern = `%${filters.search}%`;
        const searchIdx = subArgs.length + 1;
        whereClause += ` AND (ma_ct ILIKE $${searchIdx} OR ten_ct ILIKE $${searchIdx} OR ten_hang_muc ILIKE $${searchIdx} OR created_by ILIKE $${searchIdx} OR id ILIKE $${searchIdx} OR ma_nha_may ILIKE $${searchIdx} OR headcode ILIKE $${searchIdx})`;
        subArgs.push(searchPattern);
    }

    if (filters.type && filters.type !== 'ALL') {
        const types = filters.type.split(',').map((s: string) => s.trim().toUpperCase());
        const placeholders = types.map((_: any, i: number) => `$${subArgs.length + 1 + i}`).join(', ');
        whereClause += ` AND type IN (${placeholders})`;
        subArgs.push(...types);
    }

    if (filters.qc && filters.qc !== 'ALL') {
        const qcs = filters.qc.split(',').map((s: string) => s.trim());
        const placeholders = qcs.map((_: any, i: number) => `$${subArgs.length + 1 + i}`).join(', ');
        whereClause += ` AND created_by IN (${placeholders})`;
        subArgs.push(...qcs);
    }

    if (filters.workshop && filters.workshop !== 'ALL') {
        const workshops = filters.workshop.split(',').map((s: string) => s.trim());
        const placeholders = workshops.map((_: any, i: number) => `$${subArgs.length + 1 + i}`).join(', ');
        whereClause += ` AND workshop IN (${placeholders})`;
        subArgs.push(...workshops);
    }

    if (filters.project && filters.project !== 'ALL') {
        const projects = filters.project.split(',').map((s: string) => s.trim());
        const placeholders = projects.map((_: any, i: number) => `$${subArgs.length + 1 + i}`).join(', ');
        whereClause += ` AND ma_ct IN (${placeholders})`;
        subArgs.push(...projects);
    }

    if (filters.startDate && filters.startDate !== 'undefined') {
        const ts = Math.floor(new Date(filters.startDate).getTime() / 1000);
        if (!isNaN(ts)) {
            const idx = subArgs.length + 1;
            whereClause += ` AND created_at >= $${idx}`;
            subArgs.push(ts);
        }
    }

    if (filters.endDate && filters.endDate !== 'undefined') {
        const d = new Date(filters.endDate);
        d.setHours(23, 59, 59, 999);
        const ts = Math.floor(d.getTime() / 1000);
        if (!isNaN(ts)) {
            const idx = subArgs.length + 1;
            whereClause += ` AND created_at <= $${idx}`;
            subArgs.push(ts);
        }
    }

    if (filters.unixStart && filters.unixStart !== 'NaN' && filters.unixStart !== 'undefined') {
        const ts = parseInt(filters.unixStart, 10);
        if (!isNaN(ts)) {
            const idx = subArgs.length + 1;
            whereClause += ` AND created_at >= $${idx}`;
            subArgs.push(ts);
        }
    }
    
    if (filters.unixEnd && filters.unixEnd !== 'NaN' && filters.unixEnd !== 'undefined') {
        const ts = parseInt(filters.unixEnd, 10);
        if (!isNaN(ts)) {
            const idx = subArgs.length + 1;
            whereClause += ` AND created_at <= $${idx}`;
            subArgs.push(ts);
        }
    }

    return { whereClause, subArgs };
}

export async function getInspectionsDatesList(filters: any = {}, user?: User): Promise<{ date: string, count: number }[]> {
    const { whereClause, subArgs } = buildBaseWhere(filters, user);
    
    // If no specific filters, use the optimized materialized view
    if (whereClause === 'WHERE 1=1' || Object.keys(filters).length === 0) {
        try {
            const res = await query(`SELECT date_str as date, total_count as count FROM ${SCHEMA}."inspections_daily_stats_mv"`);
            return res.rows.map((r: any) => ({
                date: r.date,
                count: Number(r.count)
            }));
        } catch (e) {
            console.warn("Materialized view fallback:", e);
            // Fallback to real table if view fails
        }
    }

    const q = `
        SELECT 
            to_char(to_timestamp(created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS date_str,
            COUNT(*) as total_count
        FROM ${SCHEMA}."inspections" ${whereClause}
        GROUP BY 1
    `;
    try {
        const res = await query(q, subArgs);
        return res.rows.map((r: any) => ({
            date: r.date_str,
            count: Number(r.total_count)
        }));
    } catch (e) {
        console.error("ISO-DB: getInspectionsDatesList failed", e);
        return [];
    }
}

export async function getInspectionsProjectsList(filters: any = {}, user?: User): Promise<{ ma_ct: string, ten_ct: string, count: number }[]> {
    const { whereClause, subArgs } = buildBaseWhere(filters, user);
    // Group by to get unique projects and their count
    const q = `SELECT ma_ct, MAX(ten_ct) as ten_ct, COUNT(*) as count FROM ${SCHEMA}."inspections" ${whereClause} GROUP BY ma_ct`;
    try {
        const res = await query(q, subArgs);
        return res.rows.map((r: any) => ({ ...r, count: Number(r.count) }));
    } catch (e) {
        console.error("ISO-DB: getInspectionsProjectsList failed", e);
        return [];
    }
}

/**
 * Aggregates inspections from the centralized 'inspections' table.
 */
export async function getInspectionsList(filters: any = {}, page: number = 1, limit?: number, user?: User): Promise<{ items: Inspection[], total: number }> {
    const offsetLimit = limit || 50;
    const offset = (page - 1) * offsetLimit;
    
    const { whereClause, subArgs } = buildBaseWhere(filters, user);

    const limitIdx = subArgs.length + 1;
    const offsetIdx = subArgs.length + 2;

    const finalQuery = `
        SELECT 
            id, type, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, 
            workshop, status, score, created_at, updated_at, created_by as "inspectorName",
            stage as "inspectionStage", inspected_qty as "inspectedQuantity",
            passed_qty as "passedQuantity", failed_qty as "failedQuantity",
            so_luong_ipo
        FROM ${SCHEMA}."inspections"
        ${whereClause}
        ORDER BY updated_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countQuery = `SELECT COUNT(*) as total FROM ${SCHEMA}."inspections" ${whereClause}`;

    try {
        const queryArgs = [...subArgs, offsetLimit, offset];
        const [res, countRes] = await Promise.all([
            query(finalQuery, queryArgs),
            query(countQuery, subArgs)
        ]);

        const items = res.rows.map((row: any) => ({
            ...row,
            inspectorName: row.inspectorName || row.created_by,
            created_by: row.created_by || row.inspectorName,
            date: (row.created_at && Number(row.created_at) > 1000000000) ? row.created_at : 
                  (row.updated_at && Number(row.updated_at) > 1000000000) ? row.updated_at : 
                  row.created_at,
            updatedAt: row.updated_at,
            isAllPass: row.status === 'COMPLETED' || row.status === 'APPROVED',
            hasNcr: row.status === 'FLAGGED',
            isCond: row.status === 'CONDITIONAL',
            inspectionStage: row.inspectionStage,
            inspectedQuantity: row.inspectedQuantity !== null ? Number(row.inspectedQuantity) : undefined,
            passedQuantity: row.passedQuantity !== null ? Number(row.passedQuantity) : undefined,
            failedQuantity: row.failedQuantity !== null ? Number(row.failedQuantity) : undefined,
            so_luong_ipo: row.so_luong_ipo !== null ? Number(row.so_luong_ipo) : 0
        })) as unknown as Inspection[];

        return { 
            items, 
            total: parseInt(countRes.rows[0].total, 10) 
        };
    } catch (e) {
        console.error("ISO-DB: getInspectionsList failed", e);
        return { items: [], total: 0 };
    }
}

/**
 * Chuyên biệt hóa lấy toàn bộ inspections cho module Báo Cáo Tổng Hợp (không phân trang).
 * Tuyệt đối không query bất kỳ cột JSON hoặc cột chứa dữ liệu lớn như "data" để tránh quá tải băng thông.
 */
export async function getDashboardInspectionsList(filters: any = {}, user?: User): Promise<{ items: Inspection[], total: number }> {
    const { whereClause, subArgs } = buildBaseWhere(filters, user);

    const finalQuery = `
        SELECT 
            id, type, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, 
            workshop, status, score, created_at, updated_at, created_by as "inspectorName",
            stage as "inspectionStage", inspected_qty as "inspectedQuantity",
            passed_qty as "passedQuantity", failed_qty as "failedQuantity",
            so_luong_ipo
        FROM ${SCHEMA}."inspections"
        ${whereClause}
        ORDER BY updated_at DESC
    `;

    const countQuery = `SELECT COUNT(*) as total FROM ${SCHEMA}."inspections" ${whereClause}`;

    try {
        const [res, countRes] = await Promise.all([
            query(finalQuery, subArgs),
            query(countQuery, subArgs)
        ]);

        const items = res.rows.map((row: any) => ({
            ...row,
            inspectorName: row.inspectorName || row.created_by,
            created_by: row.created_by || row.inspectorName,
            date: (row.created_at && Number(row.created_at) > 1000000000) ? row.created_at : 
                  (row.updated_at && Number(row.updated_at) > 1000000000) ? row.updated_at : 
                  row.created_at,
            updatedAt: row.updated_at,
            isAllPass: row.status === 'COMPLETED' || row.status === 'APPROVED',
            hasNcr: row.status === 'FLAGGED',
            isCond: row.status === 'CONDITIONAL',
            inspectionStage: row.inspectionStage,
            inspectedQuantity: row.inspectedQuantity !== null ? Number(row.inspectedQuantity) : undefined,
            passedQuantity: row.passedQuantity !== null ? Number(row.passedQuantity) : undefined,
            failedQuantity: row.failedQuantity !== null ? Number(row.failedQuantity) : undefined,
            so_luong_ipo: row.so_luong_ipo !== null ? Number(row.so_luong_ipo) : 0
        })) as unknown as Inspection[];

        return { 
            items, 
            total: parseInt(countRes.rows[0].total, 10) 
        };
    } catch (e) {
        console.error("ISO-DB: getDashboardInspectionsList failed", e);
        return { items: [], total: 0 };
    }
}

export async function getDashboardStats(filters: any = {}, user?: User): Promise<any> {
    const { whereClause, subArgs } = buildBaseWhere(filters, user);

    // 1. Stats query (aggregate calculations over entire filtered set)
    const statsQuery = `
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) as drafts,
            COUNT(CASE WHEN status != 'DRAFT' THEN 1 END) as non_draft_count,
            COUNT(CASE WHEN priority = 'HIGH' THEN 1 END) as high_priority,
            SUM(CASE WHEN status != 'DRAFT' AND COALESCE(inspected_qty, 0) > 0 THEN COALESCE(inspected_qty, 0) ELSE 0 END) as total_inspected,
            SUM(CASE WHEN status != 'DRAFT' AND COALESCE(inspected_qty, 0) > 0 THEN COALESCE(passed_qty, 0) ELSE 0 END) as total_passed,
            SUM(CASE WHEN status != 'DRAFT' AND COALESCE(inspected_qty, 0) > 0 THEN COALESCE(failed_qty, 0) ELSE 0 END) as total_failed,
            SUM(CASE WHEN status != 'DRAFT' THEN COALESCE(score, 0) ELSE 0 END) as fallback_score_sum
        FROM ${SCHEMA}."inspections"
        ${whereClause}
    `;

    // 2. Workshop Aggregation query
    const workshopQuery = `
        SELECT 
            COALESCE(workshop, '') as workshop,
            SUM(CASE WHEN COALESCE(inspected_qty, 0) > 0 THEN COALESCE(inspected_qty, 0) ELSE 0 END) as inspected,
            SUM(CASE WHEN COALESCE(inspected_qty, 0) > 0 THEN COALESCE(passed_qty, 0) ELSE 0 END) as passed,
            SUM(COALESCE(score, 0)) as fallback_score,
            COUNT(*) as count
        FROM ${SCHEMA}."inspections"
        ${whereClause} AND status != 'DRAFT'
        GROUP BY COALESCE(workshop, '')
    `;

    // 3. Stage Aggregation query (for type = 'PQC')
    const stageQuery = `
        SELECT 
            COALESCE(stage, '') as stage,
            SUM(CASE WHEN COALESCE(inspected_qty, 0) > 0 THEN COALESCE(inspected_qty, 0) ELSE 0 END) as inspected,
            SUM(CASE WHEN COALESCE(inspected_qty, 0) > 0 THEN COALESCE(passed_qty, 0) ELSE 0 END) as passed,
            COUNT(*) as count
        FROM ${SCHEMA}."inspections"
        ${whereClause} AND status != 'DRAFT' AND type = 'PQC' AND COALESCE(stage, '') != ''
        GROUP BY COALESCE(stage, '')
    `;

    // 4. Project Aggregation query
    const projectQuery = `
        SELECT 
            COALESCE(ma_ct, 'Không xác định') as name,
            SUM(CASE WHEN COALESCE(inspected_qty, 0) > 0 THEN COALESCE(inspected_qty, 0) ELSE 0 END) as inspected,
            SUM(CASE WHEN COALESCE(inspected_qty, 0) > 0 THEN COALESCE(passed_qty, 0) ELSE 0 END) as passed,
            SUM(COALESCE(score, 0)) as fallback_score,
            COUNT(*) as count
        FROM ${SCHEMA}."inspections"
        ${whereClause} AND status != 'DRAFT'
        GROUP BY COALESCE(ma_ct, 'Không xác định')
    `;

    // 5. Recent Critical query (max 5 FLAGGED rows)
    const criticalQuery = `
        SELECT 
            id, score, ten_hang_muc, ma_ct, created_at, updated_at
        FROM ${SCHEMA}."inspections"
        ${whereClause} AND status = 'FLAGGED'
        ORDER BY created_at DESC, updated_at DESC
        LIMIT 5
    `;

    try {
        const [statsRes, workshopRes, stageRes, projectRes, criticalRes] = await Promise.all([
            query(statsQuery, subArgs),
            query(workshopQuery, subArgs),
            query(stageQuery, subArgs),
            query(projectQuery, subArgs),
            query(criticalQuery, subArgs)
        ]);

        const statsRow = statsRes.rows[0] || {};
        const total = parseInt(statsRow.total || 0, 10);
        const drafts = parseInt(statsRow.drafts || 0, 10);
        const nonDraftCount = parseInt(statsRow.non_draft_count || 0, 10);
        const highPriority = parseInt(statsRow.high_priority || 0, 10);
        const totalInspected = Number(statsRow.total_inspected || 0);
        const totalPassed = Number(statsRow.total_passed || 0);
        const totalFailed = Number(statsRow.total_failed || 0);
        const fallbackScoreSum = Number(statsRow.fallback_score_sum || 0);

        let avgSuccessRate = 0;
        let avgErrorRate = 0;

        if (totalInspected > 0) {
            avgSuccessRate = parseFloat(((totalPassed / totalInspected) * 100).toFixed(2));
            avgErrorRate = parseFloat(((totalFailed / totalInspected) * 100).toFixed(2));
        } else if (nonDraftCount > 0) {
            avgSuccessRate = parseFloat((fallbackScoreSum / nonDraftCount).toFixed(2));
            avgErrorRate = parseFloat((100 - avgSuccessRate).toFixed(2));
        }

        const mappedWorkshops = workshopRes.rows.map((r: any) => ({
            code: r.workshop || '',
            inspected: Number(r.inspected || 0),
            passed: Number(r.passed || 0),
            fallbackScore: Number(r.fallback_score || 0),
            count: parseInt(r.count || 0, 10)
        }));

        const mappedStages = stageRes.rows.map((r: any) => ({
            stageName: r.stage || '',
            inspected: Number(r.inspected || 0),
            passed: Number(r.passed || 0),
            count: parseInt(r.count || 0, 10)
        }));

        const mappedProjects = projectRes.rows.map((r: any) => ({
            name: r.name || '',
            inspected: Number(r.inspected || 0),
            passed: Number(r.passed || 0),
            fallbackScore: Number(r.fallback_score || 0),
            count: parseInt(r.count || 0, 10)
        }));

        const mappedCritical = criticalRes.rows.map((row: any) => {
            const rowDate = (row.created_at && Number(row.created_at) > 1000000000) ? 
                          new Date(Number(row.created_at) * 1000).toLocaleDateString('vi-VN') : 
                          (row.updated_at && Number(row.updated_at) > 1000000000) ? 
                          new Date(Number(row.updated_at) * 1000).toLocaleDateString('vi-VN') : 
                          '';
            return {
                id: row.id,
                score: Number(row.score || 0),
                ten_hang_muc: row.ten_hang_muc || '',
                ma_ct: row.ma_ct || '',
                status: 'FLAGGED',
                date: rowDate
            };
        });

        return {
            stats: {
                total,
                drafts,
                highPriority,
                avgSuccessRate,
                avgErrorRate,
                nonDraftCount
            },
            workshopData: mappedWorkshops,
            stageData: mappedStages,
            projectData: mappedProjects,
            recentCritical: mappedCritical
        };
    } catch (e) {
        console.error("ISO-DB: getDashboardStats failed", e);
        return {
            stats: { total: 0, drafts: 0, highPriority: 0, avgSuccessRate: 0, avgErrorRate: 0, nonDraftCount: 0 },
            workshopData: [],
            stageData: [],
            projectData: [],
            recentCritical: []
        };
    }
}

/**
 * Fetches the year/month structure of inspections for hierarchical loading.
 */
export async function getInspectionsHierarchy(filters: any = {}, user?: User) {
    let { whereClause, subArgs } = buildBaseWhere(filters, user);

    if (filters.project && filters.project !== 'ALL') {
        const projects = filters.project.split(',').map((s: string) => s.trim());
        const placeholders = projects.map((_: any, i: number) => `$${subArgs.length + 1 + i}`).join(', ');
        whereClause += ` AND ma_ct IN (${placeholders})`;
        subArgs.push(...projects);
    }

    const queryStr = `
        SELECT 
            EXTRACT(YEAR FROM TO_TIMESTAMP(created_at)) as year,
            EXTRACT(MONTH FROM TO_TIMESTAMP(created_at)) as month,
            COUNT(*) as count
        FROM ${SCHEMA}."inspections"
        ${whereClause}
        GROUP BY year, month
        ORDER BY year DESC, month DESC
    `;
    
    try {
        const res = await query(queryStr, subArgs);
        return res.rows.map((row: any) => ({
            year: parseInt(row.year, 10),
            month: parseInt(row.month, 10),
            count: parseInt(row.count, 10)
        }));
    } catch (e) {
        console.error("ISO-DB: getInspectionsHierarchy failed", e);
        return [];
    }
}

/**
 * Fetches projects and their inspection counts for a specific month.
 */
export async function getInspectionsProjectsByMonth(year: number, month: number, filters: any = {}) {
    let whereClause = ' WHERE 1=1';
    const subArgs: any[] = [year, month];

    whereClause += ` AND EXTRACT(YEAR FROM TO_TIMESTAMP(created_at)) = $1`;
    whereClause += ` AND EXTRACT(MONTH FROM TO_TIMESTAMP(created_at)) = $2`;

    if (filters.search) {
        const idx = subArgs.length + 1;
        whereClause += ` AND (ten_hang_muc ILIKE $${idx} OR ma_ct ILIKE $${idx} OR ten_ct ILIKE $${idx})`;
        subArgs.push(`%${filters.search}%`);
    }

    if (filters.type && filters.type !== 'ALL') {
        const types = filters.type.split(',').map((s: string) => s.trim());
        const placeholders = types.map((_: any, i: number) => `$${subArgs.length + 1 + i}`).join(', ');
        whereClause += ` AND type IN (${placeholders})`;
        subArgs.push(...types);
    }

    const queryStr = `
        SELECT 
            ma_ct, 
            ten_ct,
            COUNT(*) as count
        FROM ${SCHEMA}."inspections"
        ${whereClause}
        GROUP BY ma_ct, ten_ct
        ORDER BY count DESC
    `;
    
    try {
        const res = await query(queryStr, subArgs);
        return res.rows.map((row: any) => ({
            ma_ct: row.ma_ct,
            ten_ct: row.ten_ct,
            count: parseInt(row.count, 10)
        }));
    } catch (e) {
        console.error("ISO-DB: getInspectionsProjectsByMonth failed", e);
        return [];
    }
}

/**
 * Locates an inspection across all module tables.
 */
export async function getInspectionById(id: string): Promise<Inspection | null> {
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_sqc_mat', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    for (const table of tables) {
        try {
            const res = await query(`SELECT * FROM ${SCHEMA}."${table}" WHERE id = $1`, [id]);
            if (res.rows.length > 0) {
                const row = res.rows[0];
                const parsedData = row.data ? safeJsonParse(row.data, {}) : {};
                return {
                    ...parsedData,
                    id: row.id as string,
                    type: (row.type || table.replace('forms_', '').toUpperCase()) as ModuleId,
                    ma_ct: row.ma_ct as string,
                    ten_ct: row.ten_ct as string,
                    ten_hang_muc: row.ten_hang_muc as string,
                    inspectorName: row.inspector as string,
                    status: row.status as InspectionStatus,
                    date: (row.created_at && Number(row.created_at) > 1000000000) ? String(row.created_at) : 
                          (row.updated_at && Number(row.updated_at) > 1000000000) ? String(row.updated_at) : 
                          (row.date as string),
                    score: row.score as number,
                    summary: row.summary as string,
                    items: safeJsonParse(row.items_json, []),
                    images: safeJsonParse(row.images_json, []),
                    comments: safeJsonParse(row.comments_json, []),
                    po_number: row.po_number as string,
                    supplier: row.supplier as string,
                    workshop: row.workshop as string,
                    inspectionStage: row.stage as string,
                    dvt: row.dvt as string,
                    so_luong_ipo: Number(row.so_luong_ipo ?? row.sl_ipo ?? row.qty_ipo ?? 0),
                    inspectedQuantity: Number(row.inspected_qty ?? row.qty_total ?? 0),
                    passedQuantity: Number(row.passed_qty ?? row.qty_pass ?? 0),
                    failedQuantity: Number(row.failed_qty ?? row.qty_fail ?? 0),
                    signature: row.signature_qc as string,
                    managerSignature: row.signature_manager as string,
                    managerName: row.name_manager as string,
                    productionSignature: row.signature_production as string,
                    productionName: row.name_production as string,
                    productionComment: row.comment_production as string,
                    teamLeadSignature: row.signature_teamlead as string,
                    teamLeadName: row.name_teamlead as string,
                    teamLeadDate: row.date_teamlead as string,
                    floor_plan_id: row.floor_plan_id as string,
                    coord_x: row.coord_x as number,
                    coord_y: row.coord_y as number,
                    location: row.location as string,
                    materials: safeJsonParse(row.materials_json, []),
                    supplierAddress: row.supplier_address as string,
                    supportingDocs: safeJsonParse(row.supporting_docs_json, []),
                    deliveryNoteImages: safeJsonParse(row.delivery_images_json, []),
                    reportImages: safeJsonParse(row.report_images_json, []),
                    responsiblePerson: row.responsible_person as string,
                    ma_nha_may: row.ma_nha_may as string,
                    headcode: row.headcode as string,
                    createdAt: row.created_at ? String(row.created_at) : undefined,
                    updatedAt: row.updated_at ? String(row.updated_at) : undefined
                } as Inspection;
            }
        } catch (e) {
            console.warn(`Error searching table ${table} for id ${id}:`, e);
        }
    }
    return null;
}

/**
 * Removes an inspection from all module tables.
 */
export async function deleteInspection(id: string) {
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_sqc_mat', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    const inspection = await getInspectionById(id);
    if (!inspection) return;

    for (const table of tables) {
        try {
            await query(`UPDATE ${SCHEMA}."${table}" SET deleted_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $1`, [id]);
        } catch (e) {}
    }
    
    // Also remove from centralized inspections table
    try {
        await query(`DELETE FROM ${SCHEMA}."inspections" WHERE id = $1`, [id]);
        await refreshDailyStatsMV();
    } catch (e) {}

    await logAudit(inspection.inspectorName || 'SYSTEM', 'DELETE_INSPECTION', 'inspection', id, inspection, null);
}

// --- PLANS (IPO) ---

export async function getPlansPaginated(searchTerm: string = '', page: number = 1, limit: number = 20, user?: User) {
    const offset = (page - 1) * limit;
    let sql = `SELECT "ID_Factory_Order" as id, "ID_Factory_Order" as ma_nha_may, "Ma_Tender" as ma_ct, "Project_name" as ten_ct, "Material_description" as ten_hang_muc, "Quantity_IPO" as so_luong_ipo, "Base_Unit" as dvt FROM ${SCHEMA}.ipo`;
    let args: any[] = [];
    
    // Enforcement: If user is not Admin/Manager and has a specific workshop (Tổ), restrict them to it.
    // However, IPO table might not have a workshop column yet. 
    // If it did, we would handle it here. 
    
    if (searchTerm) {
        sql += ` WHERE "Ma_Tender" LIKE $1 OR "Project_name" LIKE $2 OR "Material_description" LIKE $3 OR "ID_Factory_Order" LIKE $4`;
        const p = `%${searchTerm}%`;
        args = [p, p, p, p];
    }
    sql += ` LIMIT $${args.length + 1} OFFSET $${args.length + 2}`;
    const res = await query(sql, [...args, limit, offset]);
    const countRes = await query(`SELECT COUNT(*) as total FROM ${SCHEMA}.ipo`);
    return { items: res.rows as unknown as IPOItem[], total: Number(countRes.rows[0].total) };
}

export async function updatePlan(id: number | string, plan: Partial<IPOItem>) {
    const updates: string[] = [];
    const args: any[] = [];

    const mapping: Record<string, string> = {
        ma_nha_may: '"ID_Factory_Order"',
        ma_ct: '"Ma_Tender"',
        ten_ct: '"Project_name"',
        ten_hang_muc: '"Material_description"',
        so_luong_ipo: '"Quantity_IPO"',
        dvt: '"Base_Unit"'
    };

    Object.entries(plan).forEach(([key, value], index) => {
        if (key === 'id' || !mapping[key]) return;
        updates.push(`${mapping[key]} = $${updates.length + 1}`);
        args.push(typeof value === 'object' ? JSON.stringify(value) : value);
    });

    if (updates.length === 0) return;

    args.push(id);
    try {
        await query(`UPDATE ${SCHEMA}.ipo SET ${updates.join(', ')} WHERE "ID_Factory_Order" = $${args.length}`, sanitizeArgs(args));
    } catch (error) {
        console.error("ISO-DB: Update IPO failed", error);
        throw error;
    }
}

/**
 * Lấy danh sách IPO cho một dự án cụ thể
 */
export async function getPlansByProject(maCt: string, limit?: number): Promise<IPOItem[]> {
    let sql = `SELECT "ID_Factory_Order" as id, "ID_Factory_Order" as ma_nha_may, "Ma_Tender" as ma_ct, "Project_name" as ten_ct, "Material_description" as ten_hang_muc, "Quantity_IPO" as so_luong_ipo, "Base_Unit" as dvt FROM ${SCHEMA}.ipo WHERE "Ma_Tender" = $1 OR "Project_name" = $2`;
    let args: any[] = [maCt, maCt];
    
    if (limit) {
        sql += " LIMIT $3";
        args.push(limit);
    }
    
    const res = await query(sql, args);
    return res.rows as unknown as IPOItem[];
}

// --- IPO DETAILS & DRAWINGS ---

export async function getIpoDetailById(idFactoryOrder: string) {
    const res = await query(`
        SELECT * FROM ${SCHEMA}.ipo_details WHERE id_factory_order = $1
    `, [idFactoryOrder]);
    
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
        ...row,
        data: safeJsonParse(row.data, {})
    };
}

export async function saveIpoDetail(detail: any) {
    const updatedAt = Math.floor(Date.now() / 1000);
    await query(`
        INSERT INTO ${SCHEMA}.ipo_details (id, id_factory_order, history_summary, material_history, sample_history, last_analysis_at, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT(id_factory_order) DO UPDATE SET
            history_summary = EXCLUDED.history_summary,
            material_history = EXCLUDED.material_history,
            sample_history = EXCLUDED.sample_history,
            last_analysis_at = EXCLUDED.last_analysis_at,
            data = EXCLUDED.data
    `, sanitizeArgs([
        detail.id || `DET-${detail.id_factory_order}`,
        detail.id_factory_order,
        detail.history_summary,
        detail.material_history,
        detail.sample_history,
        updatedAt,
        detail.data || {}
    ]));
}

export async function getIpoDrawings(idFactoryOrder: string) {
    const res = await query(`
        SELECT * FROM ${SCHEMA}.ipo_drawing_list WHERE id_factory_order = $1 ORDER BY created_at DESC
    `, [idFactoryOrder]);
    return res.rows.map((r: any) => ({ ...r, data: safeJsonParse(r.data, {}) }));
}

export async function saveIpoDrawingRecord(drawing: any) {
    await query(`
        INSERT INTO ${SCHEMA}.ipo_drawing_list (drawing_name, version, file_url, revision_notes, page_count, id_factory_order, created_by, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, sanitizeArgs([
        drawing.drawing_name,
        drawing.version,
        drawing.file_url,
        drawing.revision_notes,
        drawing.page_count,
        drawing.id_factory_order,
        drawing.created_by,
        drawing.data || {}
    ]));
}

export async function getIpoMaterials(idFactoryOrder: string) {
    const res = await query(`
        SELECT * FROM ${SCHEMA}.ipo_material_history WHERE id_factory_order = $1 ORDER BY created_at DESC
    `, [idFactoryOrder]);
    return res.rows.map((r: any) => ({ ...r, data: safeJsonParse(r.data, {}) }));
}

export async function saveIpoMaterialRecord(material: any) {
    await query(`
        INSERT INTO ${SCHEMA}.ipo_material_history (material_name, specification, version, drawing_ref, file_url, id_factory_order, created_by, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, sanitizeArgs([
        material.material_name,
        material.specification,
        material.version,
        material.drawing_ref,
        material.file_url,
        material.id_factory_order,
        material.created_by,
        material.data || {}
    ]));
}

export async function getIpoSamples(idFactoryOrder: string) {
    const res = await query(`
        SELECT * FROM ${SCHEMA}.ipo_sample_history WHERE id_factory_order = $1 ORDER BY created_at DESC
    `, [idFactoryOrder]);
    return res.rows.map((r: any) => ({ ...r, data: safeJsonParse(r.data, {}) }));
}

export async function saveIpoSampleRecord(sample: any) {
    await query(`
        INSERT INTO ${SCHEMA}.ipo_sample_history (sample_name, status, version, file_url, id_factory_order, created_by, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, sanitizeArgs([
        sample.sample_name,
        sample.status,
        sample.version,
        sample.file_url,
        sample.id_factory_order,
        sample.created_by,
        sample.data || {}
    ]));
}

export async function updateIpoSampleRecord(id: string, sample: any) {
    await query(`
        UPDATE ${SCHEMA}.ipo_sample_history 
        SET sample_name = $1, status = $2, file_url = COALESCE($3, file_url)
        WHERE id = $4
    `, sanitizeArgs([
        sample.sample_name,
        sample.status,
        sample.file_url,
        id
    ]));
}

export async function deleteIpoSampleRecord(id: string) {
    await query(`
        DELETE FROM ${SCHEMA}.ipo_sample_history WHERE id = $1
    `, sanitizeArgs([id]));
}



// --- SUPPLIERS ---

export async function getSuppliersPaginated(search: string = '', page: number = 1, limit: number = 20): Promise<{ items: Supplier[], total: number }> {
    const offset = (page - 1) * limit;
    
    // Group by supplierName from material table and join with suppliers table for details
    let sql = `
        SELECT 
            m."supplierName" as name,
            COALESCE(MAX(s.id), 'SUP-' || m."supplierName") as id,
            COALESCE(MAX(s.code), 'NCC-' || UPPER(SUBSTRING(m."supplierName", 1, 3))) as code,
            MAX(s.address) as address,
            MAX(s.contact_person) as contact_person,
            MAX(s.phone) as phone,
            MAX(s.email) as email,
            COALESCE(MAX(s.category), 'Raw Materials') as category,
            COALESCE(MAX(s.status), 'ACTIVE') as status,
            MAX(s.updated_at) as updated_at
        FROM ${SCHEMA}.material m
        LEFT JOIN ${SCHEMA}.suppliers s ON m."supplierName" = s.name
        WHERE m."supplierName" IS NOT NULL AND m."supplierName" != ''
        AND (s.deleted_at IS NULL OR s.id IS NULL)
    `;
    
    const args: any[] = [];
    if (search) {
        sql += ` AND (m."supplierName" ILIKE $1 OR m."purchaseDocument" ILIKE $1 OR s.code ILIKE $1 OR s.category ILIKE $1)`;
        args.push(`%${search}%`);
    }
    
    sql += ` GROUP BY m."supplierName"`;
    
    const countSql = `SELECT COUNT(DISTINCT m."supplierName") as total FROM ${SCHEMA}.material m LEFT JOIN ${SCHEMA}.suppliers s ON m."supplierName" = s.name WHERE m."supplierName" IS NOT NULL AND m."supplierName" != '' ${search ? 'AND (m."supplierName" ILIKE $1 OR m."purchaseDocument" ILIKE $1 OR s.code ILIKE $1 OR s.category ILIKE $1)' : ''}`;
    
    const [res, countRes] = await Promise.all([
        query(sql + ` ORDER BY name ASC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, [...args, limit, offset]),
        query(countSql, args)
    ]);
    
    return { 
        items: res.rows as unknown as Supplier[], 
        total: parseInt(countRes.rows[0].total, 10) 
    };
}

export async function getSuppliers(): Promise<Supplier[]> {
    const res = await query(`
        SELECT 
            m."supplierName" as name,
            COALESCE(MAX(s.id), 'SUP-' || m."supplierName") as id,
            COALESCE(MAX(s.code), 'NCC-' || UPPER(SUBSTRING(m."supplierName", 1, 3))) as code,
            MAX(s.address) as address,
            MAX(s.contact_person) as contact_person,
            MAX(s.phone) as phone,
            MAX(s.email) as email,
            COALESCE(MAX(s.category), 'Raw Materials') as category,
            COALESCE(MAX(s.status), 'ACTIVE') as status,
            MAX(s.updated_at) as updated_at
        FROM ${SCHEMA}.material m
        LEFT JOIN ${SCHEMA}.suppliers s ON m."supplierName" = s.name
        WHERE m."supplierName" IS NOT NULL AND m."supplierName" != ''
        GROUP BY m."supplierName"
        ORDER BY name ASC
    `);
    return res.rows.map((r: any) => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as Supplier[];
}

export async function saveSupplier(s: Supplier, userId: string = 'SYSTEM') {
    const existing = await query(`SELECT * FROM ${SCHEMA}.suppliers WHERE id = $1`, [s.id]);
    const oldValue = existing.rows.length > 0 ? { ...existing.rows[0] } : null;

    await query(`
        INSERT INTO ${SCHEMA}.suppliers (id, code, name, address, contact_person, phone, email, category, status, data, updated_at) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, EXTRACT(EPOCH FROM NOW())::BIGINT) 
        ON CONFLICT(id) DO UPDATE SET 
            code = EXCLUDED.code, 
            name = EXCLUDED.name, 
            address = EXCLUDED.address, 
            status = EXCLUDED.status, 
            data = EXCLUDED.data, 
            updated_at = EXCLUDED.updated_at
    `, sanitizeArgs([s.id, s.code, s.name, s.address, s.contact_person, s.phone, s.email, s.category, s.status, s]));

    await logAudit(userId, oldValue ? 'UPDATE_SUPPLIER' : 'CREATE_SUPPLIER', 'supplier', s.id, oldValue, s);
}

export async function deleteSupplier(id: string, userId: string = 'SYSTEM') {
    const existing = await query(`SELECT * FROM ${SCHEMA}.suppliers WHERE id = $1`, [id]);
    if (existing.rows.length > 0) {
        await query(`UPDATE ${SCHEMA}.suppliers SET deleted_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $1`, [id]);
        await logAudit(userId, 'DELETE_SUPPLIER', 'supplier', id, existing.rows[0], null);
    }
}

export async function getSupplierStats(name: string) {
    const tables = ['forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    const unionQuery = tables.map(t => `SELECT id, score FROM ${SCHEMA}."${t}" WHERE supplier = $1`).join(' UNION ALL ');
    
    const res = await query(`
        SELECT 
            COUNT(id) as total_pos, 
            AVG(CASE WHEN CAST(score AS TEXT) ~ '^[0-9.]+$' THEN CAST(score AS numeric) ELSE 0 END) as pass_rate 
        FROM (${unionQuery}) as combined
    `, [name]);
    
    return {
        total_pos: Number(res.rows[0].total_pos || 0),
        pass_rate: Number(res.rows[0].pass_rate || 0),
        defect_rate: 100 - Number(res.rows[0].pass_rate || 0)
    };
}

export async function getSupplierInspections(name: string): Promise<Inspection[]> {
    const tables = ['forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    const unionQuery = tables.map(t => `SELECT id, type, ma_ct, ten_ct, ten_hang_muc, inspector as "inspectorName", status, date, score, summary, updated_at FROM ${SCHEMA}.${t} WHERE supplier = $1`).join(' UNION ALL ');
    
    const res = await query(`
        SELECT * FROM (${unionQuery}) as combined 
        ORDER BY date DESC
    `, [name]);
    return res.rows as unknown as Inspection[];
}

export async function getSupplierMaterials(name: string): Promise<Material[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.material WHERE "supplierName" = $1 ORDER BY "createdAt" DESC`, [name]);
    return res.rows as unknown as Material[];
}

// --- NCR ---

export async function saveNcrMapped(inspection_id: string, ncr: NCR, createdBy: string) {
    const existing = await getNcrById(ncr.id);
    const oldValue = existing ? { ...existing } : null;

    await query(`
        INSERT INTO ${SCHEMA}.ncrs (id, inspection_id, item_id, defect_code, severity, status, description, root_cause, corrective_action, preventive_action, responsible_person, deadline, images_before_json, images_after_json, created_by, created_at, updated_at, comments_json) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT, $16) 
        ON CONFLICT(id) DO UPDATE SET 
            status = EXCLUDED.status, 
            severity = EXCLUDED.severity,
            description = EXCLUDED.description,
            root_cause = EXCLUDED.root_cause, 
            corrective_action = EXCLUDED.corrective_action, 
            preventive_action = EXCLUDED.preventive_action,
            responsible_person = EXCLUDED.responsible_person,
            deadline = EXCLUDED.deadline,
            images_before_json = EXCLUDED.images_before_json,
            images_after_json = EXCLUDED.images_after_json,
            updated_at = EXCLUDED.updated_at, 
            comments_json = EXCLUDED.comments_json
    `, sanitizeArgs([ncr.id, inspection_id, ncr.itemId, ncr.defect_code, ncr.severity, ncr.status, ncr.issueDescription, ncr.rootCause, ncr.solution, ncr.preventiveAction, ncr.responsiblePerson, ncr.deadline, ncr.imagesBefore, ncr.imagesAfter, createdBy, ncr.comments]));

    // Log Audit & Status Change
    await logAudit(createdBy || 'SYSTEM', oldValue ? 'UPDATE_NCR' : 'CREATE_NCR', 'ncr', ncr.id, oldValue, ncr);
    if (oldValue && oldValue.status !== ncr.status) {
        await logStatusChange('ncr', ncr.id, oldValue.status, ncr.status, createdBy || 'SYSTEM');
        
        // Notify responsible person on status change
        if (ncr.responsiblePerson) {
            await addNotification(
                ncr.responsiblePerson, 
                'NCR_UPDATE', 
                `NCR ${ncr.id} Status Updated`, 
                `NCR status changed to ${ncr.status}`, 
                { ncrId: ncr.id }
            );
        }
    } else if (!oldValue) {
        await logStatusChange('ncr', ncr.id, null, ncr.status, createdBy || 'SYSTEM');
        
        // Notify responsible person on new NCR
        if (ncr.responsiblePerson) {
            await addNotification(
                ncr.responsiblePerson, 
                'NCR_ISSUED', 
                `New NCR Issued: ${ncr.id}`, 
                `You have been assigned to a new NCR: ${ncr.issueDescription}`, 
                { ncrId: ncr.id }
            );
        }
    }
    return ncr.id;
}

export async function getNcrs(filters: any = {}, page: number = 1, limit?: number): Promise<{ items: NCR[], total: number }> {
    const offsetLimit = limit || 1000000;
    const offset = (page - 1) * offsetLimit;
    
    // Union of all inspection tables to get project info
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    const tableQueries = tables.map(t => {
        const workshopCol = (t === 'forms_pqc') ? 'workshop::text' : 'NULL::text as workshop';
        return `SELECT id::text, ma_ct::text, ten_ct::text, ten_hang_muc::text, ${workshopCol}, inspector::text as "inspectorName" FROM ${SCHEMA}."${t}"`;
    });
    const inspectionUnion = tableQueries.join(' UNION ALL ');

    let sql = `
        SELECT 
            n.id, n.inspection_id, n.item_id, n.defect_code, n.severity, n.status, n.description, 
            n.responsible_person, n.deadline, n.created_by, n.created_at,
            n.images_before_json as "imagesBeforeJson", n.images_after_json as "imagesAfterJson",
            i.ma_ct as "maCt", i.ten_ct as "tenCt", i.ten_hang_muc as "tenHangMuc", i.workshop as "workshop", i."inspectorName" as "inspectorName"
        FROM ${SCHEMA}.ncrs n
        LEFT JOIN (${inspectionUnion}) i ON n.inspection_id = i.id
        WHERE n.deleted_at IS NULL
    `;
    
    let args: any[] = [];
    let where = '';
    
    if (filters.status && filters.status !== 'ALL') { 
        where += " AND n.status = $" + (args.length + 1); 
        args.push(filters.status); 
    }
    
    if (filters.qc && filters.qc !== 'ALL') {
        where += ` AND i."inspectorName" = $${args.length + 1}`;
        args.push(filters.qc);
    }

    if (filters.workshop && filters.workshop !== 'ALL') {
        where += ` AND i.workshop = $${args.length + 1}`;
        args.push(filters.workshop);
    }
    
    if (filters.search) {
        const p = `%${filters.search}%`;
        const searchIndex = args.length + 1;
        where += ` AND (n.description LIKE $${searchIndex} OR n.defect_code LIKE $${searchIndex} OR n.responsible_person LIKE $${searchIndex} OR i.ma_ct LIKE $${searchIndex})`;
        args.push(p);
    }

    const finalSql = sql + where + (limit ? ` ORDER BY n.created_at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}` : ` ORDER BY n.created_at DESC`);
    const finalArgs = limit ? [...args, limit, offset] : args;

    const [res, countRes] = await Promise.all([
        query(finalSql, finalArgs),
        query(`SELECT COUNT(*) as total FROM ${SCHEMA}.ncrs n LEFT JOIN (${inspectionUnion}) i ON n.inspection_id = i.id WHERE n.deleted_at IS NULL` + where, args)
    ]);

    return { 
        items: res.rows.map((r: any) => ({
            id: r.id, 
            inspection_id: r.inspection_id, 
            itemId: r.item_id, 
            defect_code: r.defect_code,
            severity: r.severity, 
            status: r.status, 
            issueDescription: r.description,
            responsiblePerson: r.responsible_person, 
            deadline: r.deadline,
            createdBy: r.created_by, 
            createdAt: r.created_at,
            createdDate: r.created_at ? (typeof r.created_at === 'number' ? new Date(r.created_at * 1000).toISOString() : new Date(Number(r.created_at) * 1000).toISOString()) : new Date().toISOString(),
            imagesBefore: safeJsonParse(r.imagesBeforeJson, []),
            imagesAfter: safeJsonParse(r.imagesAfterJson, []),
            ma_ct: r.maCt,
            ten_ct: r.tenCt,
            ten_hang_muc: r.tenHangMuc,
            workshop: r.workshop,
            inspectorName: r.inspectorName
        })) as unknown as NCR[], 
        total: parseInt(countRes.rows[0].total, 10) 
    };
}

export async function getNcrById(id: string): Promise<NCR | null> {
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    const tableQueries = tables.map(t => {
        const workshopCol = (t === 'forms_pqc') ? 'workshop::text' : 'NULL::text as workshop';
        return `SELECT id::text, ma_ct::text, ten_ct::text, ten_hang_muc::text, ${workshopCol}, inspector::text as "inspectorName" FROM ${SCHEMA}."${t}"`;
    });
    const inspectionUnion = tableQueries.join(' UNION ALL ');

    const res = await query(`
        SELECT 
            n.*,
            i.ma_ct as "maCt", i.ten_ct as "tenCt", i.ten_hang_muc as "tenHangMuc", i.workshop as "workshop", i."inspectorName" as "inspectorName"
        FROM ${SCHEMA}.ncrs n
        LEFT JOIN (${inspectionUnion}) i ON n.inspection_id = i.id
        WHERE n.id = $1 AND n.deleted_at IS NULL
    `, [id]);

    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
        id: r.id, inspection_id: r.inspection_id, itemId: r.item_id, defect_code: r.defect_code,
        severity: r.severity, status: r.status, issueDescription: r.description, rootCause: r.root_cause,
        solution: r.corrective_action, preventiveAction: r.preventive_action, responsiblePerson: r.responsible_person,
        deadline: r.deadline, imagesBefore: safeJsonParse(r.images_before_json, []), imagesAfter: safeJsonParse(r.images_after_json, []),
        createdBy: r.created_by, 
        createdDate: r.created_at ? (typeof r.created_at === 'number' ? new Date(r.created_at * 1000).toISOString() : new Date(Number(r.created_at) * 1000).toISOString()) : new Date().toISOString(),
        comments: safeJsonParse(r.comments_json, []),
        ma_ct: r.maCt,
        ten_ct: r.tenCt,
        ten_hang_muc: r.tenHangMuc,
        workshop: r.workshop,
        inspectorName: r.inspectorName
    } as unknown as NCR;
}

export async function deleteNcr(id: string, userId: string) {
    const existing = await getNcrById(id);
    if (existing) {
        await query(`UPDATE ${SCHEMA}.ncrs SET deleted_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $1`, [id]);
        await logAudit(userId, 'DELETE_NCR', 'ncr', id, existing, null);
    }
}

// --- USERS ---

export function getAdvisoryModules(phong_ban: string, bo_phan: string): string[] {
    const pb = (phong_ban || '').trim().toLowerCase();
    const bp = (bo_phan || '').trim().toLowerCase();

    if (pb.includes('qaqc') || pb.includes('qa/qc') || pb.includes('qa qc')) {
        if (bp.includes('qa')) {
            return ['FQC', 'SPR', 'SITE'];
        }
        if (bp.includes('qc')) {
            return ['IQC', 'SQC_MAT', 'SQC_BTP', 'PQC', 'FSR', 'STEP'];
        }
    } else if (pb.includes('sản xuất') || pb.includes('san xuat')) {
        return ['PQC', 'SQC_BTP', 'STEP'];
    } else if (pb.includes('vật tư') || pb.includes('vat tu')) {
        return ['IQC', 'SQC_MAT'];
    } else if (pb.includes('sd') || pb.includes('drawing') || pb.includes('thiết kế') || pb.includes('thiet ke')) {
        return ['CONVERT_3D', 'FSR', 'SPR'];
    } else if (pb.includes('kế hoạch') || pb.includes('ke hoach') || pb.includes('planning')) {
        return ['IQC', 'PQC', 'SITE'];
    }
    return [];
}

export function mapUserRow(r: any): any {
    if (!r) return null;
    const dataExtra: any = safeJsonParse(r.data, {});
    
    let allowedModules: any[] = [];
    if (r.allowed_modules) {
        allowedModules = safeJsonParse(r.allowed_modules, []);
    } else if (dataExtra.allowedModules) {
        allowedModules = dataExtra.allowedModules;
    } else if (dataExtra.allowed_modules) {
        allowedModules = typeof dataExtra.allowed_modules === 'string' 
            ? safeJsonParse(dataExtra.allowed_modules, []) 
            : dataExtra.allowed_modules;
    }

    return {
        ...r,
        ...dataExtra,
        phong_ban: r.phong_ban || dataExtra.phong_ban || dataExtra.phongBan || '',
        phongBan: r.phong_ban || dataExtra.phong_ban || dataExtra.phongBan || '',
        bo_phan: r.bo_phan || dataExtra.bo_phan || dataExtra.boPhan || '',
        boPhan: r.bo_phan || dataExtra.bo_phan || dataExtra.boPhan || '',
        workLocation: r.work_location || dataExtra.workLocation || dataExtra.work_location || '',
        work_location: r.work_location || dataExtra.workLocation || dataExtra.work_location || '',
        joinDate: r.join_date || dataExtra.joinDate || dataExtra.join_date || '',
        join_date: r.join_date || dataExtra.joinDate || dataExtra.join_date || '',
        to_qc: r.to_qc || dataExtra.to_qc || dataExtra.toQC || '',
        toQC: r.to_qc || dataExtra.to_qc || dataExtra.toQC || '',
        la_to_truong: r.la_to_truong !== undefined ? !!r.la_to_truong : !!(dataExtra.la_to_truong || dataExtra.laToTruong),
        laToTruong: r.la_to_truong !== undefined ? !!r.la_to_truong : !!(dataExtra.la_to_truong || dataExtra.laToTruong),
        allowed_modules: r.allowed_modules || (allowedModules ? JSON.stringify(allowedModules) : '[]'),
        allowedModules: allowedModules,
        department_id: r.department_id || dataExtra.department_id || dataExtra.departmentId || '',
        departmentId: r.department_id || dataExtra.department_id || dataExtra.departmentId || '',
        division_id: r.division_id || dataExtra.division_id || dataExtra.divisionId || '',
        divisionId: r.division_id || dataExtra.division_id || dataExtra.divisionId || '',
        team_id: r.team_id || dataExtra.team_id || dataExtra.teamId || '',
        teamId: r.team_id || dataExtra.team_id || dataExtra.teamId || '',
        user_permissions: r.user_permissions || dataExtra.user_permissions || dataExtra.userPermissions || null,
        userPermissions: typeof r.user_permissions === 'string' ? safeJsonParse(r.user_permissions, null) : (r.user_permissions || dataExtra.userPermissions || null),
        signatureTemplate: r.signature_template || dataExtra.signature_template || dataExtra.signatureTemplate || '',
        signature_template: r.signature_template || dataExtra.signature_template || dataExtra.signatureTemplate || '',
        require_password_change: r.require_password_change !== undefined ? !!r.require_password_change : (dataExtra.require_password_change !== undefined ? !!dataExtra.require_password_change : false),
        requirePasswordChange: r.require_password_change !== undefined ? !!r.require_password_change : (dataExtra.require_password_change !== undefined ? !!dataExtra.require_password_change : false),
    };
}

export async function getUserByUsername(username: string): Promise<User | null> {
    const res = await query(`SELECT * FROM ${SCHEMA}.users WHERE username = $1 AND deleted_at IS NULL`, [username]);
    if (res.rows.length === 0) return null;
    return mapUserRow(res.rows[0]) as unknown as User;
}

export async function getUserById(id: string): Promise<User | null> {
    const res = await query(`SELECT * FROM ${SCHEMA}.users WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (res.rows.length === 0) return null;
    return mapUserRow(res.rows[0]) as unknown as User;
}

export async function importUsers(users: User[]) {
    for (const u of users) {
        await saveUser(u);
    }
}

// --- WORKSHOPS ---

export async function getWorkshops(): Promise<Workshop[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.workshops`);
    return res.rows.map((r: any) => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as Workshop[];
}

export async function saveWorkshop(ws: Workshop) {
    await query(`
        INSERT INTO ${SCHEMA}.workshops (id, code, name, data, updated_at) 
        VALUES ($1, $2, $3, $4, EXTRACT(EPOCH FROM NOW())::BIGINT) 
        ON CONFLICT(id) DO UPDATE SET 
            code = EXCLUDED.code, 
            name = EXCLUDED.name, 
            data = EXCLUDED.data, 
            updated_at = EXCLUDED.updated_at
    `, sanitizeArgs([ws.id, ws.code, ws.name, ws]));
}

export async function deleteWorkshop(id: string) {
    await query(`DELETE FROM ${SCHEMA}.workshops WHERE id = $1`, [id]);
}

// --- TOOLS EQUIPMENT ---

export async function getToolCatalogs(): Promise<any[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.tool_catalogs ORDER BY created_at DESC`);
    return res.rows;
}

export async function saveToolCatalog(catalog: any) {
    await query(`
        INSERT INTO ${SCHEMA}.tool_catalogs (
            id, code, name, type, specifications, manual_markdown, manual_pdf_url, created_by, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT(id) DO UPDATE SET 
            code = EXCLUDED.code, name = EXCLUDED.name, type = EXCLUDED.type,
            specifications = EXCLUDED.specifications, manual_markdown = EXCLUDED.manual_markdown, manual_pdf_url = EXCLUDED.manual_pdf_url,
            updated_at = EXCLUDED.updated_at
    `, [
        catalog.id, catalog.code, catalog.name, catalog.type, catalog.specifications, catalog.manual_markdown, catalog.manual_pdf_url, catalog.created_by
    ]);
}

export async function deleteToolCatalog(id: string) {
    await query(`DELETE FROM ${SCHEMA}.tool_catalogs WHERE id = $1`, [id]);
}

export async function getToolAssets(): Promise<any[]> {
    const res = await query(`
        SELECT a.*, c.code as catalog_code, c.name as catalog_name, c.type as catalog_type, c.specifications as catalog_specifications, c.manual_markdown, c.manual_pdf_url
        FROM ${SCHEMA}.tool_assets a
        JOIN ${SCHEMA}.tool_catalogs c ON a.catalog_id = c.id
        ORDER BY a.created_at DESC
    `);
    return res.rows;
}

export async function getToolAssetsByCatalog(catalogId: string): Promise<any[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.tool_assets WHERE catalog_id = $1 ORDER BY created_at DESC`, [catalogId]);
    return res.rows;
}

export async function getToolAssetById(id: string): Promise<any> {
    const res = await query(`
        SELECT a.*, c.code as catalog_code, c.name as catalog_name, c.type as catalog_type, c.specifications as catalog_specifications, c.manual_markdown, c.manual_pdf_url
        FROM ${SCHEMA}.tool_assets a
        JOIN ${SCHEMA}.tool_catalogs c ON a.catalog_id = c.id
        WHERE a.id = $1
    `, [id]);
    return res.rows[0];
}

export async function saveToolAsset(asset: any) {
    await query(`
        INSERT INTO ${SCHEMA}.tool_assets (
            id, catalog_id, asset_code, serial_number, current_user_id, next_calibration_date, status, created_by, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, EXTRACT(EPOCH FROM NOW())::BIGINT)
        ON CONFLICT(id) DO UPDATE SET 
            catalog_id = EXCLUDED.catalog_id, asset_code = EXCLUDED.asset_code, serial_number = EXCLUDED.serial_number,
            current_user_id = EXCLUDED.current_user_id, next_calibration_date = EXCLUDED.next_calibration_date, 
            status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
    `, [
        asset.id, asset.catalog_id, asset.asset_code, asset.serial_number, asset.current_user_id, asset.next_calibration_date, asset.status, asset.created_by
    ]);
}

export async function deleteToolAsset(id: string) {
    await query(`DELETE FROM ${SCHEMA}.tool_assets WHERE id = $1`, [id]);
}

export async function getToolTransfers(toolAssetId: string): Promise<any[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.tool_transfers WHERE tool_asset_ids @> $1::jsonb ORDER BY request_date DESC`, [JSON.stringify([toolAssetId])]);
    return res.rows;
}

export async function saveToolTransfer(transfer: any) {
    const status = transfer.status || 'PENDING';
    await query(`
        INSERT INTO ${SCHEMA}.tool_transfers (
            id, tool_asset_ids, from_user_id, to_user_id, status, request_date, receiver_confirm_date, receiver_signature, receiver_image, manager_approve_date, manager_signature, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT(id) DO UPDATE SET 
            tool_asset_ids = EXCLUDED.tool_asset_ids, status = EXCLUDED.status, receiver_confirm_date = EXCLUDED.receiver_confirm_date, receiver_signature = EXCLUDED.receiver_signature, receiver_image = EXCLUDED.receiver_image,
            manager_approve_date = EXCLUDED.manager_approve_date, manager_signature = EXCLUDED.manager_signature, notes = EXCLUDED.notes
    `, [
        transfer.id, JSON.stringify(transfer.tool_asset_ids || []), transfer.from_user_id, transfer.to_user_id, status, transfer.request_date, transfer.receiver_confirm_date,
        transfer.receiver_signature, transfer.receiver_image, transfer.manager_approve_date, transfer.manager_signature, transfer.notes
    ]);
}

export async function getToolCalibrations(toolAssetId: string): Promise<any[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.tool_calibrations WHERE tool_asset_id = $1 ORDER BY request_date DESC`, [toolAssetId]);
    return res.rows;
}

export async function saveToolCalibration(calib: any) {
    const status = calib.status || 'PENDING';
    await query(`
        INSERT INTO ${SCHEMA}.tool_calibrations (
            id, tool_asset_id, request_date, requested_by, status, calibration_date, next_calibration_date, certificate_url, approved_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT(id) DO UPDATE SET 
            status = EXCLUDED.status, calibration_date = EXCLUDED.calibration_date, next_calibration_date = EXCLUDED.next_calibration_date,
            certificate_url = EXCLUDED.certificate_url, approved_by = EXCLUDED.approved_by, notes = EXCLUDED.notes
    `, [
        calib.id, calib.tool_asset_id, calib.request_date, calib.requested_by, status, calib.calibration_date, calib.next_calibration_date, calib.certificate_url, calib.approved_by, calib.notes
    ]);
}

// --- TEMPLATES ---

export async function getTemplates() {
    const res = await query(`SELECT * FROM ${SCHEMA}.templates`);
    const templates: Record<string, CheckItem[]> = {};
    res.rows.forEach((r: any) => { templates[(r as any).module_id] = safeJsonParse((r as any).data, []); });
    return templates;
}

export async function saveTemplate(moduleId: string, items: CheckItem[]) {
    await query(`
        INSERT INTO ${SCHEMA}.templates (module_id, data, updated_at) 
        VALUES ($1, $2, EXTRACT(EPOCH FROM NOW())::BIGINT) 
        ON CONFLICT(module_id) DO UPDATE SET 
            data = EXCLUDED.data, 
            updated_at = EXCLUDED.updated_at
    `, sanitizeArgs([moduleId, items]));
}

// --- PROJECTS ---

export async function refreshProjectsMV() {
    try {
        await query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${SCHEMA}.ipo_projects_mv`);
        console.log("✅ Successfully refreshed ipo_projects_mv materialized view");
    } catch (err: any) {
        console.warn("⚠️ Failed to refresh concurrently, trying default refresh:", err.message);
        try {
            await query(`REFRESH MATERIALIZED VIEW ${SCHEMA}.ipo_projects_mv`);
            console.log("✅ Successfully refreshed ipo_projects_mv materialized view (non-concurrent)");
        } catch (err2: any) {
            console.error("❌ Failed to refresh ipo_projects_mv materialized view", err2);
        }
    }
}

export async function getProjectsPaginated(search: string = '', page: number = 1, limit?: number) {
    const offsetLimit = limit || 1000000;
    const offset = (page - 1) * offsetLimit;
    
    // Query directly from materialized view and left join with projects table
    let sql = `
        SELECT 
            i.ma_ct, 
            i.name as name,
            i.name as ten_ct,
            i.ma_ct as id,
            COALESCE(p.status, 'Planning') as status,
            p.pm as pm,
            p.pc as pc,
            p.qa as qa,
            COALESCE(p.progress, 0) as progress,
            p.start_date as start_date,
            p.end_date as end_date,
            p.location as location,
            p.thumbnail as thumbnail,
            COALESCE(p.updated_at, 0) as updated_at
        FROM ${SCHEMA}.ipo_projects_mv i
        LEFT JOIN ${SCHEMA}.projects p ON i.ma_ct = p.ma_ct
        WHERE i.ma_ct IS NOT NULL AND i.ma_ct != ''
        AND (p.deleted_at IS NULL OR p.id IS NULL)
    `;
    
    const args: any[] = [];
    if (search) {
        sql += ` AND (i.ma_ct ILIKE $1 OR i.name ILIKE $1)`;
        args.push(`%${search}%`);
    }
    
    const countSql = `SELECT COUNT(*) as total FROM ${SCHEMA}.ipo_projects_mv i ${search ? 'WHERE (i.ma_ct ILIKE $1 OR i.name ILIKE $1)' : ''}`;
    
    const finalSql = sql + (limit ? ` ORDER BY updated_at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}` : ` ORDER BY updated_at DESC`);
    const finalArgs = limit ? [...args, limit, offset] : args;

    const [res, countRes] = await Promise.all([
        query(finalSql, finalArgs),
        query(countSql, args)
    ]);
    
    return { 
        items: res.rows.map((r: any) => ({
            ...r,
            code: r.ma_ct,
            startDate: r.start_date,
            endDate: r.end_date
        })) as unknown as Project[], 
        total: parseInt(countRes.rows[0].total, 10) 
    };
}

export async function getProjectByCode(code: string): Promise<Project | null> {
    const res = await query(`
        SELECT 
            i.ma_ct, 
            i.name as name,
            i.name as ten_ct,
            i.ma_ct as id,
            i.ma_ct as code,
            COALESCE(p.status, 'Planning') as status,
            p.pm as pm,
            p.pc as pc,
            p.qa as qa,
            COALESCE(p.progress, 0) as progress,
            p.start_date as start_date,
            p.end_date as end_date,
            p.location as location,
            p.description as description,
            p.thumbnail as thumbnail,
            p.data as data,
            COALESCE(p.updated_at, 0) as updated_at
        FROM ${SCHEMA}.ipo_projects_mv i
        LEFT JOIN ${SCHEMA}.projects p ON i.ma_ct = p.ma_ct
        WHERE i.ma_ct = $1
    `, [code]);
    
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return { 
        ...row, 
        startDate: row.start_date,
        endDate: row.end_date,
        ...safeJsonParse((row as any).data, {}) 
    } as unknown as Project;
}

export async function updateProject(p: Project, userId: string = 'SYSTEM') {
    const existing = await getProjectByCode(p.ma_ct);
    const oldValue = existing ? { ...existing } : null;

    await query(`
        INSERT INTO ${SCHEMA}.projects (ma_ct, name, status, pm, pc, qa, progress, start_date, end_date, location, description, thumbnail, data, updated_at) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, EXTRACT(EPOCH FROM NOW())::BIGINT) 
        ON CONFLICT(ma_ct) DO UPDATE SET 
            name = EXCLUDED.name, 
            status = EXCLUDED.status, 
            pm = EXCLUDED.pm, 
            pc = EXCLUDED.pc, 
            qa = EXCLUDED.qa, 
            progress = EXCLUDED.progress, 
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            location = EXCLUDED.location,
            description = EXCLUDED.description,
            thumbnail = EXCLUDED.thumbnail,
            updated_at = EXCLUDED.updated_at, 
            data = EXCLUDED.data
    `, sanitizeArgs([
        p.ma_ct, p.name, p.status, p.pm, p.pc, p.qa, p.progress, 
        parseTS(p.startDate), parseTS(p.endDate), 
        p.location, p.description, p.thumbnail, p
    ]));

    await logAudit(userId, oldValue ? 'UPDATE_PROJECT' : 'CREATE_PROJECT', 'project', p.ma_ct, oldValue, p);
    if (oldValue && oldValue.status !== p.status) {
        await logStatusChange('project', p.ma_ct, oldValue.status, p.status, userId);
    }
}

// --- NOTIFICATIONS ---

export async function addNotification(userId: string, type: string, title: string, message: string, link: any) {
    await query(`
        INSERT INTO ${SCHEMA}.notifications (id, user_id, type, title, message, is_read, created_at, data) 
        VALUES ($1, $2, $3, $4, $5, 0, EXTRACT(EPOCH FROM NOW())::BIGINT, $6)
    `, sanitizeArgs([`notif_${Date.now()}`, userId, type, title, message, { link }]));
}

export async function getNotifications(userId: string): Promise<Notification[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [userId]);
    return res.rows.map((r: any) => ({
        id: r.id as string,
        userId: r.user_id as string,
        type: r.type as any,
        title: r.title as string,
        message: r.message as string,
        isRead: Boolean(r.is_read),
        createdAt: Number(r.created_at),
        link: (safeJsonParse((r as any).data, {}) as any).link
    })) as unknown as Notification[];
}

export async function markNotificationRead(id: string) {
    await query(`UPDATE ${SCHEMA}.notifications SET is_read = 1 WHERE id = $1`, [id]);
}

export async function markAllNotificationsRead(userId: string) {
    await query(`UPDATE ${SCHEMA}.notifications SET is_read = 1 WHERE user_id = $1`, [userId]);
}

// --- AUDIT & HISTORY ---

export async function logAudit(userId: string, action: string, entityType: string, entityId: string, oldValue: any, newValue: any) {
    const id = crypto.randomUUID();
    await query(`
        INSERT INTO ${SCHEMA}.audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, timestamp) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, EXTRACT(EPOCH FROM NOW())::BIGINT)
    `, [id, userId, action, entityType, entityId, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null]);
}

export async function logStatusChange(entityType: string, entityId: string, statusFrom: string | null, statusTo: string, changedBy: string, comment?: string) {
    const id = crypto.randomUUID();
    await query(`
        INSERT INTO ${SCHEMA}.status_history (id, entity_type, entity_id, status_from, status_to, changed_by, timestamp, comment) 
        VALUES ($1, $2, $3, $4, $5, $6, EXTRACT(EPOCH FROM NOW())::BIGINT, $7)
    `, [id, entityType, entityId, statusFrom, statusTo, changedBy, comment]);
}

// --- USERS ---

export async function getUsers(): Promise<User[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.users WHERE deleted_at IS NULL ORDER BY name ASC`);
    return res.rows.map((r: any) => mapUserRow(r));
}

export async function saveUser(u: any) {
    const existing = await query(`SELECT * FROM ${SCHEMA}.users WHERE id = $1`, [u.id]);
    const oldValue = existing.rows.length > 0 ? mapUserRow(existing.rows[0]) : null;
    
    // 1. Optimize password hashing & retain old hashed password if unchanged
    let password = u.password;
    let passwordHasChanged = false;

    if (!password) {
        if (oldValue && oldValue.password) {
            password = oldValue.password; // Retain existing hashed password
        } else {
            password = '123456';
            passwordHasChanged = true;
        }
    } else if (oldValue && password === oldValue.password) {
        // Frontend passed the same hashed password (unlikely but safe)
        passwordHasChanged = false;
    } else if (!password.startsWith('$2b$') && !password.startsWith('$2a$')) {
        // Plain text password, hash it
        password = await bcrypt.hash(password, SALT_ROUNDS);
        passwordHasChanged = true;
    }

    // 2. Determine require_password_change flag
    let require_password_change = u.require_password_change;
    if (require_password_change === undefined) {
        if (!oldValue) {
            // New user must change password
            require_password_change = true;
        } else if (passwordHasChanged) {
            // User had their password updated/reset
            require_password_change = true;
        } else {
            require_password_change = oldValue.require_password_change || false;
        }
    }

    const phong_ban = u.phong_ban || u.phongBan || oldValue?.phong_ban || '';
    const bo_phan = u.bo_phan || u.boPhan || oldValue?.bo_phan || '';
    
    let allowedModules = u.allowedModules || u.allowed_modules;
    if (typeof allowedModules === 'string') {
        try { allowedModules = JSON.parse(allowedModules); } catch(e) { allowedModules = []; }
    }
    if (!allowedModules && oldValue?.allowed_modules) {
        allowedModules = typeof oldValue.allowed_modules === 'string' ? safeJsonParse(oldValue.allowed_modules, []) : oldValue.allowed_modules;
    }
    if (!allowedModules && phong_ban && bo_phan) {
        allowedModules = getAdvisoryModules(phong_ban, bo_phan);
    }
    if (!allowedModules) {
        allowedModules = [];
    }

    const allowed_modules_str = JSON.stringify(allowedModules);

    const updatedU = {
        ...oldValue,
        ...u,
        phong_ban,
        phongBan: phong_ban,
        bo_phan,
        boPhan: bo_phan,
        allowedModules,
        allowed_modules: allowed_modules_str,
        to_qc: u.to_qc || u.toQC || oldValue?.to_qc || '',
        toQC: u.to_qc || u.toQC || oldValue?.to_qc || '',
        la_to_truong: !!(u.la_to_truong || u.laToTruong || oldValue?.la_to_truong),
        laToTruong: !!(u.la_to_truong || u.laToTruong || oldValue?.la_to_truong),
        department_id: u.department_id || u.departmentId || oldValue?.department_id || '',
        division_id: u.division_id || u.divisionId || oldValue?.division_id || '',
        team_id: u.team_id || u.teamId || oldValue?.team_id || '',
        signature_template: u.signatureTemplate || u.signature_template || oldValue?.signature_template || '',
        user_permissions: u.user_permissions ? (typeof u.user_permissions === 'string' ? u.user_permissions : JSON.stringify(u.user_permissions)) : (u.userPermissions ? JSON.stringify(u.userPermissions) : (oldValue?.user_permissions ? (typeof oldValue.user_permissions === 'string' ? oldValue.user_permissions : JSON.stringify(oldValue.user_permissions)) : null)),
        require_password_change,
        requirePasswordChange: require_password_change
    };

    await query(`
        INSERT INTO ${SCHEMA}.users (id, username, password, name, role, avatar, msnv, email, position, work_location, status, join_date, education, notes, phong_ban, bo_phan, allowed_modules, to_qc, la_to_truong, department_id, division_id, team_id, user_permissions, data, updated_at, require_password_change) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, EXTRACT(EPOCH FROM NOW())::BIGINT, $25) 
        ON CONFLICT(id) DO UPDATE SET 
            username = EXCLUDED.username, 
            password = EXCLUDED.password,
            name = EXCLUDED.name, 
            role = EXCLUDED.role, 
            avatar = EXCLUDED.avatar, 
            msnv = EXCLUDED.msnv, 
            email = EXCLUDED.email,
            position = EXCLUDED.position, 
            work_location = EXCLUDED.work_location, 
            status = EXCLUDED.status, 
            join_date = EXCLUDED.join_date,
            education = EXCLUDED.education,
            notes = EXCLUDED.notes,
            phong_ban = EXCLUDED.phong_ban,
            bo_phan = EXCLUDED.bo_phan,
            allowed_modules = EXCLUDED.allowed_modules,
            to_qc = EXCLUDED.to_qc,
            la_to_truong = EXCLUDED.la_to_truong,
            department_id = EXCLUDED.department_id,
            division_id = EXCLUDED.division_id,
            team_id = EXCLUDED.team_id,
            user_permissions = EXCLUDED.user_permissions,
            data = EXCLUDED.data, 
            updated_at = EXCLUDED.updated_at,
            require_password_change = EXCLUDED.require_password_change
    `, sanitizeArgs([
        u.id, u.username || oldValue?.username, password, u.name || oldValue?.name, u.role || oldValue?.role, u.avatar || oldValue?.avatar, u.msnv || oldValue?.msnv, u.email || oldValue?.email, u.position || oldValue?.position, 
        u.work_location || u.workLocation || oldValue?.work_location, u.status || oldValue?.status, u.join_date || u.joinDate || oldValue?.join_date, u.education || oldValue?.education, u.notes || oldValue?.notes, 
        phong_ban, bo_phan, allowed_modules_str, updatedU.to_qc, updatedU.la_to_truong, updatedU.department_id, updatedU.division_id, updatedU.team_id, updatedU.user_permissions, updatedU, require_password_change
    ]));

    if (u.id) {
        await logAudit('SYSTEM', oldValue ? 'UPDATE_USER' : 'CREATE_USER', 'user', u.id, oldValue, updatedU);
    }
}

export async function deleteUser(id: string) {
    const existing = await query(`SELECT * FROM ${SCHEMA}.users WHERE id = $1`, [id]);
    if (existing.rows.length > 0) {
        await query(`UPDATE ${SCHEMA}.users SET deleted_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $1`, [id]);
        await logAudit('SYSTEM', 'DELETE_USER', 'user', id, existing.rows[0], null);
    }
}

// --- DEPARTMENTS ---

export async function getDepartments() {
    const res = await query(`SELECT * FROM ${SCHEMA}.departments ORDER BY name ASC`);
    return res.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        divisions: r.divisions ? safeJsonParse(r.divisions, []) : []
    }));
}

export async function saveDepartment(dept: { id: string; name: string; divisions: string[] }) {
    await query(`
        INSERT INTO ${SCHEMA}.departments (id, name, divisions, updated_at) 
        VALUES ($1, $2, $3, EXTRACT(EPOCH FROM NOW())::BIGINT) 
        ON CONFLICT (id) DO UPDATE SET 
            name = EXCLUDED.name, 
            divisions = EXCLUDED.divisions, 
            updated_at = EXCLUDED.updated_at
    `, [dept.id, dept.name, JSON.stringify(dept.divisions)]);
}

export async function deleteDepartment(id: string) {
    await query(`DELETE FROM ${SCHEMA}.departments WHERE id = $1`, [id]);
}

// --- USER OPERATIONS ACTIVITY ---

export async function getUserActivityStats(userId: string) {
    const totalLoginsRes = await query(`
        SELECT COUNT(*) as count 
        FROM ${SCHEMA}.audit_logs 
        WHERE user_id = $1 AND action = 'LOGIN'
    `, [userId]);
    const totalLogins = parseInt(totalLoginsRes.rows[0]?.count || '0');

    const lastLoginRes = await query(`
        SELECT timestamp 
        FROM ${SCHEMA}.audit_logs 
        WHERE user_id = $1 AND action = 'LOGIN' 
        ORDER BY timestamp DESC 
        LIMIT 1
    `, [userId]);
    const lastLogin = lastLoginRes.rows[0]?.timestamp ? parseInt(lastLoginRes.rows[0].timestamp) : null;

    const operationsRes = await query(`
        SELECT * 
        FROM ${SCHEMA}.audit_logs 
        WHERE user_id = $1 AND action != 'LOGIN' 
        ORDER BY timestamp DESC 
        LIMIT 200
    `, [userId]);

    const loginsRes = await query(`
        SELECT * 
        FROM ${SCHEMA}.audit_logs 
        WHERE user_id = $1 AND action = 'LOGIN' 
        ORDER BY timestamp DESC 
        LIMIT 100
    `, [userId]);

    return {
        totalLogins,
        lastLogin,
        operations: operationsRes.rows,
        logins: loginsRes.rows
    };
}

// --- MATERIALS ---

export async function getMaterialsPaginated(search: string = '', page: number = 1, limit?: number) {
    const offsetLimit = limit || 1000000;
    const offset = (page - 1) * offsetLimit;
    let sql = `SELECT id, material, "shortText", "orderUnit", "orderQuantity", "supplierName", "projectName", "purchaseDocument", "deliveryDate", "Ma_Tender", "Factory_Order", "createdAt" FROM ${SCHEMA}.material`;
    let args: any[] = [];
    let where = '';
    if (search) {
        where = ` WHERE material LIKE $1 OR "shortText" LIKE $1 OR "projectName" LIKE $1 OR "Ma_Tender" LIKE $1`;
        args.push(`%${search}%`);
    }
    
    const finalSql = sql + where + (limit ? ` ORDER BY "createdAt" DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}` : ` ORDER BY "createdAt" DESC`);
    const finalArgs = limit ? [...args, limit, offset] : args;

    const [res, countRes] = await Promise.all([
        query(finalSql, finalArgs),
        query(`SELECT COUNT(*) as total FROM ${SCHEMA}.material` + where, args)
    ]);
    
    return {
        items: res.rows as unknown as Material[],
        total: parseInt(countRes.rows[0].total, 10)
    };
}

export async function getDefectLibrary(): Promise<DefectLibraryItem[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.defect_library ORDER BY defect_code ASC`);
    return res.rows.map((r: any) => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as DefectLibraryItem[];
}

export async function saveDefectLibraryItem(item: DefectLibraryItem) {
    const created_at = parseTS(item.createdAt);
    await query(`
        INSERT INTO ${SCHEMA}.defect_library (id, defect_code, name, stage, category, description, severity, suggested_action, created_by, created_at, updated_at, data) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, EXTRACT(EPOCH FROM NOW())::BIGINT, $11) 
        ON CONFLICT(id) DO UPDATE SET 
            defect_code = EXCLUDED.defect_code, 
            name = EXCLUDED.name, 
            data = EXCLUDED.data, 
            updated_at = EXCLUDED.updated_at
    `, sanitizeArgs([item.id, item.code, item.name, item.stage, item.category, item.description, item.severity, item.suggestedAction, item.createdBy, created_at, item]));
}

export async function deleteDefectLibraryItem(id: string) {
    await query(`DELETE FROM ${SCHEMA}.defect_library WHERE id = $1`, [id]);
}

// --- ROLES ---

export async function getRoles(): Promise<Role[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.qms_roles ORDER BY name ASC`);
    return res.rows.map((r: any) => {
        const parsed = safeJsonParse((r as any).data, {}) as any;
        const roleId = r.id || r.name || '';
        const isSystem = r.isSystem || parsed.isSystem || ['admin', 'root', 'member', 'adminQAQC'].includes(roleId.toLowerCase());
        const permissions = typeof r.permissions === 'string' 
            ? safeJsonParse(r.permissions, []) 
            : (Array.isArray(r.permissions) ? r.permissions : (parsed.permissions || []));
        return {
            ...r,
            ...parsed,
            id: roleId,
            name: r.name || parsed.name || roleId,
            isSystem: !!isSystem,
            permissions
        };
    }) as unknown as Role[];
}

export async function saveRole(role: Role) {
    await query(`
        INSERT INTO ${SCHEMA}.qms_roles (id, name, permissions, data, updated_at) 
        VALUES ($1, $2, $3, $4, EXTRACT(EPOCH FROM NOW())::BIGINT) 
        ON CONFLICT(id) DO UPDATE SET 
            name = EXCLUDED.name, 
            permissions = EXCLUDED.permissions, 
            data = EXCLUDED.data, 
            updated_at = EXCLUDED.updated_at
    `, sanitizeArgs([role.id, role.name, role.permissions, role]));
}

export async function deleteRole(id: string) {
    await query(`DELETE FROM ${SCHEMA}.qms_roles WHERE id = $1`, [id]);
}

// --- PROJECT DOCUMENTS ---

export async function getProjectDocuments(projectId: string): Promise<ProjectDocument[]> {
    const res = await query(
        `SELECT * FROM ${SCHEMA}.project_documents WHERE (project_id = $1 OR ma_ct = $1) AND deleted_at IS NULL ORDER BY created_at DESC`,
        [projectId]
    );
    return res.rows.map((r: any) => ({
        id: r.id,
        projectId: r.project_id,
        ma_ct: r.ma_ct,
        name: r.name,
        version: r.version,
        issueDate: r.issue_date,
        updateDate: r.update_date,
        fileUrl: r.file_url,
        description: r.description,
        createdBy: r.created_by,
        createdAt: r.created_at ? Number(r.created_at) : undefined,
        updatedAt: r.updated_at ? Number(r.updated_at) : undefined,
        ...safeJsonParse((r as any).data, {})
    })) as unknown as ProjectDocument[];
}

export async function saveProjectDocument(doc: ProjectDocument): Promise<void> {
    const now = Date.now();
    await query(`
        INSERT INTO ${SCHEMA}.project_documents (
            id, project_id, ma_ct, name, version, issue_date, update_date, file_url, description, created_by, created_at, updated_at, deleted_at, data
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
        ON CONFLICT(id) DO UPDATE SET 
            name = EXCLUDED.name, 
            version = EXCLUDED.version, 
            issue_date = EXCLUDED.issue_date,
            update_date = EXCLUDED.update_date,
            file_url = EXCLUDED.file_url,
            description = EXCLUDED.description,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at,
            data = EXCLUDED.data
    `, sanitizeArgs([
        doc.id, 
        doc.projectId, 
        doc.ma_ct, 
        doc.name, 
        doc.version, 
        doc.issueDate, 
        doc.updateDate, 
        doc.fileUrl || null, 
        doc.description || null, 
        doc.createdBy, 
        doc.createdAt || now, 
        doc.updatedAt || now, 
        doc.deletedAt || null, 
        doc
    ]));
}

export async function deleteProjectDocument(docId: string, deletedAt: number = Date.now()): Promise<void> {
    await query(`
        UPDATE ${SCHEMA}.project_documents 
        SET deleted_at = $1 
        WHERE id = $2
    `, [deletedAt, docId]);
}

/**
 * Fetches all deleted inspections across all modules.
 */
export async function getDeletedInspections(): Promise<any[]> {
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_sqc_mat', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    let allDeleted: any[] = [];
    
    for (const table of tables) {
        try {
            const res = await query(`SELECT id, ma_ct, ten_ct, ten_hang_muc, inspector as "inspectorName", status as status, date, deleted_at, '${table}' as table_name FROM ${SCHEMA}."${table}" WHERE deleted_at IS NOT NULL`);
            allDeleted = [...allDeleted, ...res.rows];
        } catch (e) {
            console.error(`Error fetching deleted from ${table}:`, e);
        }
    }
    
    return allDeleted.sort((a, b) => Number(b.deleted_at) - Number(a.deleted_at));
}

/**
 * Restores a soft-deleted inspection.
 */
export async function restoreInspection(id: string) {
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_sqc_mat', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    for (const table of tables) {
        await query(`UPDATE ${SCHEMA}."${table}" SET deleted_at = NULL WHERE id = $1`, [id]);
    }
}

/**
 * Permanently deletes an inspection from the database.
 */
export async function hardDeleteInspection(id: string) {
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_sqc_mat', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    for (const table of tables) {
        await query(`DELETE FROM ${SCHEMA}."${table}" WHERE id = $1`, [id]);
    }
}

/**
 * Health check for database connection.
 */
export async function testConnection(): Promise<boolean> {
    try { await query("SELECT 1"); return true; } catch (e) { return false; }
}

async function refreshDailyStatsMV() {
    try {
        await query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${SCHEMA}."inspections_daily_stats_mv"`);
    } catch (e) {
        console.warn('Failed to refresh inspections_daily_stats_mv:', e);
    }
}

// --- DIVISIONS & TEAMS OPERATIONS ---

export async function getDivisions() {
    const res = await query(`SELECT * FROM ${SCHEMA}.divisions ORDER BY name ASC`);
    return res.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        departmentId: r.department_id,
        department_id: r.department_id
    }));
}

export async function saveDivision(div: { id: string; name: string; departmentId: string }) {
    await query(`
        INSERT INTO ${SCHEMA}.divisions (id, name, department_id, updated_at) 
        VALUES ($1, $2, $3, EXTRACT(EPOCH FROM NOW())::BIGINT) 
        ON CONFLICT (id) DO UPDATE SET 
            name = EXCLUDED.name, 
            department_id = EXCLUDED.department_id, 
            updated_at = EXCLUDED.updated_at
    `, [div.id, div.name, div.departmentId]);
}

export async function deleteDivision(id: string) {
    await query(`DELETE FROM ${SCHEMA}.divisions WHERE id = $1`, [id]);
}

export async function getTeams() {
    const res = await query(`SELECT * FROM ${SCHEMA}.teams ORDER BY name ASC`);
    return res.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        divisionId: r.division_id,
        division_id: r.division_id,
        leaderId: r.leader_id,
        leader_id: r.leader_id
    }));
}

export async function saveTeam(team: { id: string; name: string; divisionId: string; leaderId?: string | null }) {
    // 1. Save the team
    await query(`
        INSERT INTO ${SCHEMA}.teams (id, name, division_id, leader_id, updated_at) 
        VALUES ($1, $2, $3, $4, EXTRACT(EPOCH FROM NOW())::BIGINT) 
        ON CONFLICT (id) DO UPDATE SET 
            name = EXCLUDED.name, 
            division_id = EXCLUDED.division_id, 
            leader_id = EXCLUDED.leader_id, 
            updated_at = EXCLUDED.updated_at
    `, [team.id, team.name, team.divisionId, team.leaderId || null]);

    // 2. If leaderId is set, update that user to "Tổ trưởng" and la_to_truong = true, and set team_id, division_id, department_id
    if (team.leaderId) {
        // Fetch user first to get division/department if they can be inherited
        const userRes = await query(`SELECT * FROM ${SCHEMA}.users WHERE id = $1`, [team.leaderId]);
        if (userRes.rows.length > 0) {
            const user = userRes.rows[0];
            const dataExtra = safeJsonParse(user.data, {});
            
            // Get division info to set division_id and department_id
            const divRes = await query(`SELECT * FROM ${SCHEMA}.divisions WHERE id = $1`, [team.divisionId]);
            let userDeptId = user.department_id;
            let userDivId = team.divisionId;
            if (divRes.rows.length > 0) {
                userDeptId = divRes.rows[0].department_id;
            }

            const updatedData = {
                ...dataExtra,
                position: 'Tổ trưởng',
                la_to_truong: true,
                laToTruong: true,
                team_id: team.id,
                division_id: userDivId,
                department_id: userDeptId,
                toQC: team.name,
                to_qc: team.name
            };

            await query(`
                UPDATE ${SCHEMA}.users 
                SET position = $1, 
                    la_to_truong = TRUE, 
                    team_id = $2, 
                    division_id = $3, 
                    department_id = $4,
                    to_qc = $5,
                    data = $6,
                    updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
                WHERE id = $7
            `, ['Tổ trưởng', team.id, userDivId, userDeptId, team.name, JSON.stringify(updatedData), team.leaderId]);
        }
    }
}

export async function deleteTeam(id: string) {
    await query(`DELETE FROM ${SCHEMA}.teams WHERE id = $1`, [id]);
}

