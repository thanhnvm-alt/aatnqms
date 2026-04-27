
import { query } from "../lib/db.js";
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { NCR, Inspection, IPOItem, User, Workshop, CheckItem, QMSImage, Project, Role, Defect, DefectLibraryItem, Notification, NCRComment, InspectionStatus, MaterialIQC, CheckStatus, ModuleId, Supplier, FloorPlan, LayoutPin, Material } from "../types.js";

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

const parseTS = (val: any): number => {
    if (!val) return Math.floor(Date.now() / 1000);
    const parsed = typeof val === 'string' ? Date.parse(val) : val;
    // If it's milliseconds (length > 11), convert to seconds
    if (!isNaN(parsed) && parsed > 100000000000) {
        return Math.floor(parsed / 1000);
    }
    return isNaN(parsed) ? Math.floor(Date.now() / 1000) : parsed;
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

export const MODULE_TABLES = ['iqc', 'pqc', 'sqc_mat', 'sqc_vt', 'sqc_btp', 'fsr', 'step', 'fqc', 'spr', 'site'];

/**
 * Get the table name based on inspection type
 */
const getTableName = (type: string = 'PQC'): string => {
    const t = type.toLowerCase();
    if (t === 'sqc_mat' || t === 'sqc_vt') return `${SCHEMA}.forms_sqc_vt`;
    return MODULE_TABLES.includes(t) ? `${SCHEMA}.forms_${t}` : `${SCHEMA}.forms_pqc`;
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
    const res = await query(`SELECT * FROM ${SCHEMA}.floor_plans WHERE project_id = $1 ORDER BY updated_at DESC`, [projectId]);
    return res.rows as unknown as FloorPlan[];
}

export async function saveFloorPlan(fp: FloorPlan) {
    await query(`
        INSERT INTO ${SCHEMA}.floor_plans (id, project_id, name, image_url, version, status, file_name, updated_at) 
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
    await query(`DELETE FROM ${SCHEMA}.floor_plans WHERE id = $1`, [id]);
    await query(`DELETE FROM ${SCHEMA}.layout_pins WHERE floor_plan_id = $1`, [id]);
}

export async function getLayoutPins(floorPlanId: string): Promise<LayoutPin[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.layout_pins WHERE floor_plan_id = $1`, [floorPlanId]);
    return res.rows as unknown as LayoutPin[];
}

export async function saveLayoutPin(pin: LayoutPin) {
    await query(`
        INSERT INTO ${SCHEMA}.layout_pins (id, floor_plan_id, inspection_id, x, y, label, status) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) 
        ON CONFLICT(id) DO UPDATE SET 
            inspection_id = EXCLUDED.inspection_id, 
            status = EXCLUDED.status
    `, sanitizeArgs([pin.id, pin.floor_plan_id, pin.inspection_id, pin.x, pin.y, pin.label, pin.status]));
}

// --- INSPECTIONS ---

export async function saveInspection(inspection: Inspection) {
  const table = getTableName(inspection.type);
  const existing = await getInspectionById(inspection.id);
  const oldValue = existing ? { ...existing } : null;

  // Ensure dates are parsed as BIGINT epochs for DB (seconds)
  const updatedAt = Math.floor(Date.now() / 1000);
  const inspection_date = parseTS(inspection.date);

    if (inspection.type === 'PQC') {
      await query(`
        INSERT INTO ${SCHEMA}.forms_pqc (
          id, ma_ct, ten_ct, ten_hang_muc, ma_nha_may, workshop, stage, dvt, sl_ipo, qty_total, qty_pass, qty_fail, 
          inspector, status, data, updated_at, items_json, images_json, headcode, date, score, summary, type, 
          production_comment, floor_plan_id, coord_x, coord_y, responsible_person,
          signature_qc, signature_manager, name_manager, signature_production, name_production, comment_production,
          comments_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)
        ON CONFLICT(id) DO UPDATE SET 
          status = EXCLUDED.status, 
          updated_at = EXCLUDED.updated_at, 
          score = EXCLUDED.score, 
          items_json = EXCLUDED.items_json,
          images_json = EXCLUDED.images_json,
          summary = EXCLUDED.summary,
          data = EXCLUDED.data,
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
          comments_json = EXCLUDED.comments_json,
          sl_ipo = EXCLUDED.sl_ipo,
          qty_total = EXCLUDED.qty_total,
          qty_pass = EXCLUDED.qty_pass,
          qty_fail = EXCLUDED.qty_fail,
          workshop = EXCLUDED.workshop,
          stage = EXCLUDED.stage
      `, sanitizeArgs([
          inspection.id, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc, 
          inspection.ma_nha_may, inspection.workshop, inspection.inspectionStage, inspection.dvt,
          inspection.so_luong_ipo, inspection.inspectedQuantity, inspection.passedQuantity, inspection.failedQuantity,
          inspection.inspectorName, inspection.status, inspection, updatedAt,
          inspection.items, inspection.images, inspection.headcode, inspection_date, inspection.score, 
          inspection.summary, inspection.type, inspection.productionComment,
          inspection.floor_plan_id, inspection.coord_x, inspection.coord_y,
          inspection.responsiblePerson,
          inspection.signature, inspection.managerSignature, inspection.managerName,
          inspection.productionSignature, inspection.productionName, inspection.productionComment,
          inspection.comments
      ]));
    } else {
    // ISO Standard mapping cho các module: SITE, IQC, SQC, FQC...
    await query(`
      INSERT INTO ${table} (
        id, type, ma_ct, ten_ct, ten_hang_muc, po_number, supplier, inspector, status, date, 
        score, summary, items_json, materials_json, signature_qc, signature_manager, name_manager,
        signature_production, name_production, comment_production, images_json, delivery_images_json, 
        report_images_json, comments_json, so_luong_ipo, inspected_qty, passed_qty, failed_qty, 
        dvt, updated_at, floor_plan_id, coord_x, coord_y, location, supplier_address, supporting_docs_json,
        responsible_person
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37)
      ON CONFLICT(id) DO UPDATE SET 
        status = EXCLUDED.status, 
        score = EXCLUDED.score, 
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
        location = EXCLUDED.location,
        comments_json = EXCLUDED.comments_json,
        responsible_person = EXCLUDED.responsible_person,
        so_luong_ipo = EXCLUDED.so_luong_ipo,
        inspected_qty = EXCLUDED.inspected_qty,
        passed_qty = EXCLUDED.passed_qty,
        failed_qty = EXCLUDED.failed_qty,
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
        dvt = EXCLUDED.dvt
    `, sanitizeArgs([
        inspection.id, inspection.type, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc,
        inspection.po_number, inspection.supplier, inspection.inspectorName, inspection.status, inspection.date,
        inspection.score, inspection.summary, inspection.items, inspection.materials,
        inspection.signature, inspection.managerSignature, inspection.managerName,
        inspection.productionSignature, inspection.productionName, inspection.productionComment,
        inspection.images, inspection.deliveryNoteImages, inspection.reportImages, inspection.comments,
        inspection.so_luong_ipo, inspection.inspectedQuantity, inspection.passedQuantity, inspection.failedQuantity,
        inspection.dvt, updatedAt, 
        inspection.floor_plan_id, inspection.coord_x, inspection.coord_y,
        inspection.location, inspection.supplierAddress, inspection.supportingDocs,
        inspection.responsiblePerson
      ]));
    }

  // Log Audit & Status Change
  const inspectorName = inspection.inspectorName || 'SYSTEM';

  // --- SAVE NCRs FROM INSPECTION ITEMS ---
  if (Array.isArray(inspection.items)) {
    for (const item of inspection.items) {
      if (item.ncr && typeof item.ncr === 'object' && item.ncr.id) {
        await saveNcrMapped(inspection.id, item.ncr, inspectorName);
      }
    }
  }

  // --- SAVE NCRs FROM MATERIAL ITEMS (IQC/SQC-VT) ---
  if (Array.isArray(inspection.materials)) {
    for (const mat of inspection.materials) {
      if (Array.isArray(mat.items)) {
        for (const item of mat.items) {
          if (item.ncr && typeof item.ncr === 'object' && item.ncr.id) {
            await saveNcrMapped(inspection.id, item.ncr, inspectorName);
          }
        }
      }
    }
  }

  await logAudit(inspection.inspectorName || 'SYSTEM', oldValue ? 'UPDATE_INSPECTION' : 'CREATE_INSPECTION', 'inspection', inspection.id, oldValue, inspection);
  if (oldValue && oldValue.status !== inspection.status) {
    await logStatusChange('inspection', inspection.id, oldValue.status, inspection.status, inspection.inspectorName || 'SYSTEM');
    
    if (inspection.status === InspectionStatus.SUBMITTED) {
        const project = await getProjectByCode(inspection.ma_ct);
        if (project) {
            if (project.pm) await addNotification(project.pm, 'INSPECTION_SUBMITTED', 'New Inspection Submitted', `Inspection ${inspection.id} is awaiting review.`, { inspectionId: inspection.id });
            if (project.qa) await addNotification(project.qa, 'INSPECTION_SUBMITTED', 'New Inspection Submitted', `Inspection ${inspection.id} is awaiting review.`, { inspectionId: inspection.id });
        }
    }
  } else if (!oldValue) {
    await logStatusChange('inspection', inspection.id, null, inspection.status, inspection.inspectorName || 'SYSTEM');
    
    if (inspection.status === InspectionStatus.SUBMITTED) {
        const project = await getProjectByCode(inspection.ma_ct);
        if (project) {
            if (project.pm) await addNotification(project.pm, 'INSPECTION_SUBMITTED', 'New Inspection Submitted', `Inspection ${inspection.id} is awaiting review.`, { inspectionId: inspection.id });
            if (project.qa) await addNotification(project.qa, 'INSPECTION_SUBMITTED', 'New Inspection Submitted', `Inspection ${inspection.id} is awaiting review.`, { inspectionId: inspection.id });
        }
    }
  }
}

/**
 * Aggregates inspections from all module tables with pagination.
 */
export async function getInspectionsList(filters: any = {}, page: number = 1, limit: number = 20): Promise<{ items: Inspection[], total: number }> {
    const offset = (page - 1) * limit;
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    
    // Build a UNION ALL query to fetch from all tables efficiently
    // We select only the fields needed for the list view to improve performance
    const selectFields = `
        id, 
        COALESCE(type, REPLACE(table_name, 'forms_', '')) as type, 
        ma_ct, 
        ten_ct, 
        ten_hang_muc, 
        inspector as "inspectorName", 
        status, 
        date, 
        score, 
        summary, 
        workshop, 
        updated_at,
        responsible_person as "responsiblePerson",
        ma_nha_may,
        headcode,
        stage as "inspectionStage",
        po_number,
        materials_json as "materials",
        so_luong_ipo,
        inspected_qty as "inspectedQuantity",
        passed_qty as "passedQuantity",
        failed_qty as "failedQuantity",
        images_json as "images",                
        dvt
    `;

    const tableQueries = tables.map(table => {
        const workshopCol = table === 'forms_pqc' ? 'workshop::text' : 'NULL::text as workshop';
        const maNhaMayCol = table === 'forms_pqc' ? 'ma_nha_may::text' : 'NULL::text as ma_nha_may';
        const headcodeCol = table === 'forms_pqc' ? 'headcode::text' : 'NULL::text as headcode';
        const stageCol = table === 'forms_pqc' ? 'stage::text' : 'NULL::text as stage';
        const poCol = ['forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp'].includes(table) ? 'po_number::text' : 'NULL::text as po_number';
        const matCol = ['forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp'].includes(table) ? 'materials_json::text' : 'NULL::text as materials_json';
        
        const slIpoCol = table === 'forms_pqc' ? 'sl_ipo::numeric as so_luong_ipo' : (['forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp'].includes(table) ? 'so_luong_ipo::numeric as so_luong_ipo' : '0::numeric as so_luong_ipo');
        const insQtyCol = table === 'forms_pqc' ? 'qty_total::numeric as inspected_qty' : (['forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp'].includes(table) ? 'inspected_qty::numeric as inspected_qty' : '0::numeric as inspected_qty');
        const passQtyCol = table === 'forms_pqc' ? 'qty_pass::numeric as passed_qty' : (['forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp'].includes(table) ? 'passed_qty::numeric as passed_qty' : '0::numeric as passed_qty');
        const failQtyCol = table === 'forms_pqc' ? 'qty_fail::numeric as failed_qty' : (['forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp'].includes(table) ? 'failed_qty::numeric as failed_qty' : '0::numeric as failed_qty');
        const imagesCol = 'images_json::text as images_json';

        return `SELECT id::text, type::text, ma_ct::text, ten_ct::text, ten_hang_muc::text, inspector::text, status::text, date::text, score::text, summary::text, ${workshopCol}, updated_at::text, "responsible_person"::text, ${maNhaMayCol}, ${headcodeCol}, ${stageCol}, ${poCol}, ${matCol}, ${slIpoCol}, ${insQtyCol}, ${passQtyCol}, ${failQtyCol}, ${imagesCol}, dvt::text, '${table}'::text as table_name FROM ${SCHEMA}."${table}" WHERE "deleted_at" IS NULL`;
    });

    const unionQuery = tableQueries.join(' UNION ALL ');
    
    let whereClause = '';
    const args: any[] = [];
    if (filters.status && filters.status !== 'ALL') {
        const statuses = filters.status.split(',').map((s: string) => s.trim());
        const placeholders = statuses.map((_: any, i: number) => `$${args.length + 1 + i}`).join(', ');
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += `status IN (${placeholders})`;
        args.push(...statuses);
    }
    if (filters.search) {
        const searchPattern = `%${filters.search}%`;
        const searchIndex = args.length + 1;
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += `(ma_ct LIKE $${searchIndex} OR ten_ct LIKE $${searchIndex} OR ten_hang_muc LIKE $${searchIndex} OR inspector LIKE $${searchIndex})`;
        args.push(searchPattern);
    }
    if (filters.qc && filters.qc !== 'ALL') {
        const qcs = filters.qc.split(',').map((s: string) => s.trim());
        const placeholders = qcs.map((_: any, i: number) => `$${args.length + 1 + i}`).join(', ');
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += `inspector IN (${placeholders})`;
        args.push(...qcs);
    }
    if (filters.workshop && filters.workshop !== 'ALL') {
        const workshops = filters.workshop.split(',').map((s: string) => s.trim());
        const placeholders = workshops.map((_: any, i: number) => `$${args.length + 1 + i}`).join(', ');
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += `workshop IN (${placeholders})`;
        args.push(...workshops);
    }
    if (filters.project && filters.project !== 'ALL') {
        const projects = filters.project.split(',').map((s: string) => s.trim());
        const placeholders = projects.map((_: any, i: number) => `$${args.length + 1 + i}`).join(', ');
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += `ma_ct IN (${placeholders})`;
        args.push(...projects);
    }
    if (filters.type && filters.type !== 'ALL') {
        const types = filters.type.split(',').map((s: string) => s.trim());
        const placeholders = types.map((_: any, i: number) => `$${args.length + 1 + i}`).join(', ');
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += `COALESCE(type, REPLACE(table_name, 'forms_', '')) IN (${placeholders})`;
        args.push(...types);
    }
    if (filters.startDate) {
        const idx = args.length + 1;
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += `date >= $${idx}`;
        args.push(filters.startDate);
    }
    if (filters.endDate) {
        const idx = args.length + 1;
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += `date <= $${idx}`;
        args.push(filters.endDate);
    }

    const finalQuery = `
        SELECT ${selectFields} FROM (${unionQuery}) as combined 
        ${whereClause} 
        ORDER BY (CASE 
            WHEN updated_at ~ '^[0-9]+$' THEN 
                CASE WHEN CAST(updated_at AS BIGINT) > 100000000000 THEN CAST(updated_at AS BIGINT) / 1000 
                ELSE CAST(updated_at AS BIGINT) 
                END 
            ELSE 0 
        END) DESC 
        LIMIT $${args.length + 1} OFFSET $${args.length + 2}
    `;

    const countQuery = `SELECT COUNT(*) as total FROM (${unionQuery}) as combined ${whereClause}`;

    try {
        const [res, countRes] = await Promise.all([
            query(finalQuery, [...args, limit, offset]),
            query(countQuery, args)
        ]);

        const items = res.rows.map((row: any) => {
            let parsedMaterials = row.materials;
            if (typeof parsedMaterials === 'string') {
                try { parsedMaterials = JSON.parse(parsedMaterials); } catch(e) {}
            }
            let parsedImages = row.images;
            if (typeof parsedImages === 'string') {
                try { parsedImages = JSON.parse(parsedImages); } catch(e) {}
            }
            return {
                ...row,
                updatedAt: row.updated_at,
                materials: parsedMaterials,
                images: parsedImages,
                so_luong_ipo: Number(row.so_luong_ipo || 0),
                inspectedQuantity: Number(row.inspectedQuantity || 0),
                passedQuantity: Number(row.passedQuantity || 0),
                failedQuantity: Number(row.failedQuantity || 0),
                isAllPass: row.status === 'COMPLETED' || row.status === 'APPROVED',
                hasNcr: row.status === 'FLAGGED',
                isCond: row.status === 'CONDITIONAL',
                dvt: row.dvt || ''
            };
        }) as unknown as Inspection[];

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
 * Locates an inspection across all module tables.
 */
export async function getInspectionById(id: string): Promise<Inspection | null> {
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    for (const table of tables) {
        try {
            const res = await query(`SELECT * FROM ${SCHEMA}.${table} WHERE id = $1`, [id]);
            if (res.rows.length > 0) {
                const row = res.rows[0];
                return {
                    id: row.id as string,
                    type: (row.type || table.replace('forms_', '').toUpperCase()) as ModuleId,
                    ma_ct: row.ma_ct as string,
                    ten_ct: row.ten_ct as string,
                    ten_hang_muc: row.ten_hang_muc as string,
                    inspectorName: row.inspector as string,
                    status: row.status as InspectionStatus,
                    date: row.date as string,
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
                    so_luong_ipo: Number(row.so_luong_ipo ?? row.sl_ipo ?? 0),
                    inspectedQuantity: Number(row.inspected_qty ?? row.qty_total ?? 0),
                    passedQuantity: Number(row.passed_qty ?? row.qty_pass ?? 0),
                    failedQuantity: Number(row.failed_qty ?? row.qty_fail ?? 0),
                    signature: row.signature_qc as string,
                    managerSignature: row.signature_manager as string,
                    managerName: row.name_manager as string,
                    productionSignature: row.signature_production as string,
                    productionName: row.name_production as string,
                    productionComment: row.comment_production as string,
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
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    const inspection = await getInspectionById(id);
    if (!inspection) return;

    for (const table of tables) {
        try {
            await query(`UPDATE ${SCHEMA}.${table} SET deleted_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $1`, [id]);
        } catch (e) {}
    }
    await logAudit(inspection.inspectorName || 'SYSTEM', 'DELETE_INSPECTION', 'inspection', id, inspection, null);
}

// --- PLANS (IPO) ---

export async function getPlansPaginated(searchTerm: string = '', page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;
    let sql = `SELECT "ID_Factory_Order" as id, "ID_Factory_Order" as ma_nha_may, "Ma_Tender" as ma_ct, "Project_name" as ten_ct, "Material_description" as ten_hang_muc, "Quantity_IPO" as so_luong_ipo, "Base_Unit" as dvt FROM ${SCHEMA}.ipo`;
    let args: any[] = [];
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
    const unionQuery = tables.map(t => `SELECT id, score FROM ${SCHEMA}.${t} WHERE supplier = $1`).join(' UNION ALL ');
    
    const res = await query(`
        SELECT 
            COUNT(id) as total_pos, 
            AVG(score::numeric) as pass_rate 
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

export async function getNcrs(filters: any = {}, page: number = 1, limit: number = 20): Promise<{ items: NCR[], total: number }> {
    const offset = (page - 1) * limit;
    
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

    const [res, countRes] = await Promise.all([
        query(sql + where + ` ORDER BY n.created_at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, [...args, limit, offset]),
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
    const res = await query(`SELECT * FROM ${SCHEMA}.ncrs WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
        id: r.id, inspection_id: r.inspection_id, itemId: r.item_id, defect_code: r.defect_code,
        severity: r.severity, status: r.status, issueDescription: r.description, rootCause: r.root_cause,
        solution: r.corrective_action, preventiveAction: r.preventive_action, responsiblePerson: r.responsible_person,
        deadline: r.deadline, imagesBefore: safeJsonParse(r.images_before_json, []), imagesAfter: safeJsonParse(r.images_after_json, []),
        createdBy: r.created_by, comments: safeJsonParse(r.comments_json, [])
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

export async function getUserByUsername(username: string): Promise<User | null> {
    const res = await query(`SELECT * FROM ${SCHEMA}.users WHERE username = $1 AND deleted_at IS NULL`, [username]);
    if (res.rows.length === 0) return null;
    return { ...res.rows[0], ...safeJsonParse((res.rows[0] as any).data, {}) } as unknown as User;
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

export async function getProjectsPaginated(search: string = '', page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;
    
    // Group by Ma_Tender from ipo table and join with projects table for details
    let sql = `
        SELECT 
            i."Ma_Tender" as ma_ct, 
            MAX(i."Project_name") as name,
            MAX(i."Project_name") as ten_ct,
            i."Ma_Tender" as id,
            COALESCE(MAX(p.status), 'Planning') as status,
            MAX(p.pm) as pm,
            MAX(p.pc) as pc,
            MAX(p.qa) as qa,
            COALESCE(MAX(p.progress), 0) as progress,
            MAX(p.start_date) as start_date,
            MAX(p.end_date) as end_date,
            MAX(p.location) as location,
            MAX(p.thumbnail) as thumbnail,
            COALESCE(MAX(p.updated_at), 0) as updated_at
        FROM ${SCHEMA}.ipo i
        LEFT JOIN ${SCHEMA}.projects p ON i."Ma_Tender" = p.ma_ct
        WHERE i."Ma_Tender" IS NOT NULL AND i."Ma_Tender" != ''
        AND (p.deleted_at IS NULL OR p.id IS NULL)
    `;
    
    const args: any[] = [];
    if (search) {
        sql += ` AND (i."Ma_Tender" ILIKE $1 OR i."Project_name" ILIKE $1)`;
        args.push(`%${search}%`);
    }
    
    sql += ` GROUP BY i."Ma_Tender"`;
    
    const countSql = `SELECT COUNT(DISTINCT "Ma_Tender") as total FROM ${SCHEMA}.ipo WHERE "Ma_Tender" IS NOT NULL AND "Ma_Tender" != '' ${search ? 'AND ("Ma_Tender" ILIKE $1 OR "Project_name" ILIKE $1)' : ''}`;
    
    const [res, countRes] = await Promise.all([
        query(sql + ` ORDER BY updated_at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, [...args, limit, offset]),
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
            i."Ma_Tender" as ma_ct, 
            MAX(i."Project_name") as name,
            MAX(i."Project_name") as ten_ct,
            i."Ma_Tender" as id,
            i."Ma_Tender" as code,
            COALESCE(MAX(p.status), 'Planning') as status,
            MAX(p.pm) as pm,
            MAX(p.pc) as pc,
            MAX(p.qa) as qa,
            COALESCE(MAX(p.progress), 0) as progress,
            MAX(p.start_date) as start_date,
            MAX(p.end_date) as end_date,
            MAX(p.location) as location,
            MAX(p.description) as description,
            MAX(p.thumbnail) as thumbnail,
            MAX(p.data) as data,
            COALESCE(MAX(p.updated_at), 0) as updated_at
        FROM ${SCHEMA}.ipo i
        LEFT JOIN ${SCHEMA}.projects p ON i."Ma_Tender" = p.ma_ct
        WHERE i."Ma_Tender" = $1
        GROUP BY i."Ma_Tender"
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
    const res = await query(`SELECT * FROM ${SCHEMA}.notifications WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
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
    return res.rows.map((r: any) => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as User[];
}

export async function saveUser(u: User) {
    const existing = await query(`SELECT * FROM ${SCHEMA}.users WHERE id = $1`, [u.id]);
    const oldValue = existing.rows.length > 0 ? { ...existing.rows[0], ...safeJsonParse(existing.rows[0].data, {}) } : null;
    
    let password = u.password || '123456';
    // Only hash if it's not already a bcrypt hash (starts with $2b$)
    if (!password.startsWith('$2b$')) {
        password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    await query(`
        INSERT INTO ${SCHEMA}.users (id, username, password, name, role, avatar, msnv, email, position, work_location, status, join_date, education, notes, data, updated_at) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, EXTRACT(EPOCH FROM NOW())::BIGINT) 
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
            data = EXCLUDED.data, 
            updated_at = EXCLUDED.updated_at
    `, sanitizeArgs([u.id, u.username, password, u.name, u.role, u.avatar, u.msnv, u.email, u.position, u.workLocation, u.status, u.joinDate, u.education, u.notes, u]));

    // Log Audit
    if (u.id) {
        await logAudit('SYSTEM', oldValue ? 'UPDATE_USER' : 'CREATE_USER', 'user', u.id, oldValue, u);
    }
}

export async function deleteUser(id: string) {
    const existing = await query(`SELECT * FROM ${SCHEMA}.users WHERE id = $1`, [id]);
    if (existing.rows.length > 0) {
        await query(`UPDATE ${SCHEMA}.users SET deleted_at = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id = $1`, [id]);
        await logAudit('SYSTEM', 'DELETE_USER', 'user', id, existing.rows[0], null);
    }
}

// --- MATERIALS ---

export async function getMaterialsPaginated(search: string = '', page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;
    let sql = `SELECT id, material, "shortText", "orderUnit", "orderQuantity", "supplierName", "projectName", "purchaseDocument", "deliveryDate", "Ma_Tender", "Factory_Order", "createdAt" FROM ${SCHEMA}.material`;
    let args: any[] = [];
    let where = '';
    if (search) {
        where = ` WHERE material LIKE $1 OR "shortText" LIKE $1 OR "projectName" LIKE $1 OR "Ma_Tender" LIKE $1`;
        args.push(`%${search}%`);
    }
    
    const [res, countRes] = await Promise.all([
        query(sql + where + ` ORDER BY "createdAt" DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, [...args, limit, offset]),
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
    const created_at = typeof item.createdAt === 'string' ? Date.parse(item.createdAt) : (item.createdAt || Math.floor(Date.now() / 1000));
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
    const res = await query(`SELECT * FROM ${SCHEMA}.roles ORDER BY name ASC`);
    return res.rows.map((r: any) => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as Role[];
}

export async function saveRole(role: Role) {
    await query(`
        INSERT INTO ${SCHEMA}.roles (id, name, permissions, data, updated_at) 
        VALUES ($1, $2, $3, $4, EXTRACT(EPOCH FROM NOW())::BIGINT) 
        ON CONFLICT(id) DO UPDATE SET 
            name = EXCLUDED.name, 
            permissions = EXCLUDED.permissions, 
            data = EXCLUDED.data, 
            updated_at = EXCLUDED.updated_at
    `, sanitizeArgs([role.id, role.name, role.permissions, role]));
}

export async function deleteRole(id: string) {
    await query(`DELETE FROM ${SCHEMA}.roles WHERE id = $1`, [id]);
}

/**
 * Fetches all deleted inspections across all modules.
 */
export async function getDeletedInspections(): Promise<any[]> {
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    let allDeleted: any[] = [];
    
    for (const table of tables) {
        try {
            const res = await query(`SELECT id, ma_ct, ten_ct, ten_hang_muc, inspector as "inspectorName", status as status, date, deleted_at, '${table}' as table_name FROM ${SCHEMA}.${table} WHERE deleted_at IS NOT NULL`);
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
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    for (const table of tables) {
        await query(`UPDATE ${SCHEMA}.${table} SET deleted_at = NULL WHERE id = $1`, [id]);
    }
}

/**
 * Permanently deletes an inspection from the database.
 */
export async function hardDeleteInspection(id: string) {
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    for (const table of tables) {
        await query(`DELETE FROM ${SCHEMA}.${table} WHERE id = $1`, [id]);
    }
}

/**
 * Health check for database connection.
 */
export async function testConnection(): Promise<boolean> {
    try { await query("SELECT 1"); return true; } catch (e) { return false; }
}
