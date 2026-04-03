
import { query } from "../lib/db";
import { NCR, Inspection, IPOItem, User, Workshop, CheckItem, QMSImage, Project, Role, Defect, DefectLibraryItem, Notification, NCRComment, InspectionStatus, MaterialIQC, CheckStatus, ModuleId, Supplier, FloorPlan, LayoutPin } from "../types";

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

const MODULE_TABLES = ['iqc', 'pqc', 'sqc_mat', 'sqc_vt', 'sqc_btp', 'fsr', 'step', 'fqc', 'spr', 'site'];

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
  
  if (inspection.type === 'PQC') {
    await query(`
      INSERT INTO ${SCHEMA}.forms_pqc (
        id, ma_ct, ten_ct, ten_hang_muc, ma_nha_may, workshop, stage, dvt, sl_ipo, qty_total, qty_pass, qty_fail, 
        inspector, status, data, updated_at, items_json, images_json, headcode, date, score, summary, type, 
        production_comment, floor_plan_id, coord_x, coord_y, responsible_person
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
      ON CONFLICT(id) DO UPDATE SET 
        status = EXCLUDED.status, 
        updated_at = EXCLUDED.updated_at, 
        score = EXCLUDED.score, 
        floor_plan_id = EXCLUDED.floor_plan_id, 
        coord_x = EXCLUDED.coord_x, 
        coord_y = EXCLUDED.coord_y, 
        responsible_person = EXCLUDED.responsible_person
    `, sanitizeArgs([
        inspection.id, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc, 
        inspection.ma_nha_may, inspection.workshop, inspection.inspectionStage, inspection.dvt,
        inspection.so_luong_ipo, inspection.inspectedQuantity, inspection.passedQuantity, inspection.failedQuantity,
        inspection.inspectorName, inspection.status, inspection, new Date().toISOString(),
        inspection.items, inspection.images, inspection.headcode, inspection.date, inspection.score, 
        inspection.summary, inspection.type, inspection.productionComment,
        inspection.floor_plan_id, inspection.coord_x, inspection.coord_y,
        inspection.responsiblePerson
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
        location = EXCLUDED.location,
        comments_json = EXCLUDED.comments_json,
        responsible_person = EXCLUDED.responsible_person
    `, sanitizeArgs([
        inspection.id, inspection.type, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc,
        inspection.po_number, inspection.supplier, inspection.inspectorName, inspection.status, inspection.date,
        inspection.score, inspection.summary, inspection.items, inspection.materials,
        inspection.signature, inspection.managerSignature, inspection.managerName,
        inspection.productionSignature, inspection.productionName, inspection.productionComment,
        inspection.images, inspection.deliveryNoteImages, inspection.reportImages, inspection.comments,
        inspection.so_luong_ipo, inspection.inspectedQuantity, inspection.passedQuantity, inspection.failedQuantity,
        inspection.dvt, new Date().toISOString(), 
        inspection.floor_plan_id, inspection.coord_x, inspection.coord_y,
        inspection.location, inspection.supplierAddress, inspection.supportingDocs,
        inspection.responsiblePerson
      ]));
  }
}

/**
 * Aggregates inspections from all module tables.
 */
export async function getInspectionsList(filters: any = {}): Promise<{ items: Inspection[], total: number }> {
    const results: any[] = [];
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    
    for (const table of tables) {
        try {
            const res = await query(`SELECT * FROM ${SCHEMA}.${table} ORDER BY updated_at DESC LIMIT 100`);
            res.rows.forEach((row: any) => {
                results.push({
                    id: row.id,
                    type: row.type || table.replace('forms_', '').toUpperCase(),
                    ma_ct: row.ma_ct,
                    ten_ct: row.ten_ct,
                    ten_hang_muc: row.ten_hang_muc,
                    inspectorName: row.inspector,
                    status: row.status,
                    date: row.date,
                    score: row.score,
                    summary: row.summary,
                    workshop: row.workshop,
                    isAllPass: row.status === 'COMPLETED' || row.status === 'APPROVED',
                    hasNcr: row.status === 'FLAGGED',
                    isCond: row.status === 'CONDITIONAL',
                    responsiblePerson: row.responsible_person
                });
            });
        } catch (e) {
            console.warn(`Error querying table ${table}:`, e);
        }
    }
    
    return { 
        items: results.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()), 
        total: results.length 
    };
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
                    po_number: row.po_number as string,
                    supplier: row.supplier as string,
                    workshop: row.workshop as string,
                    inspectionStage: row.stage as string,
                    dvt: row.dvt as string,
                    so_luong_ipo: row.so_luong_ipo as number,
                    inspectedQuantity: row.inspected_qty as number,
                    passedQuantity: row.passed_qty as number,
                    failedQuantity: row.failed_qty as number,
                    signature: row.signature_qc as string,
                    managerSignature: row.signature_manager as string,
                    managerName: row.name_manager as string,
                    productionSignature: row.signature_production as string,
                    productionName: row.name_production as string,
                    productionComment: row.comment_production as string,
                    comments: safeJsonParse(row.comments_json, []),
                    floor_plan_id: row.floor_plan_id as string,
                    coord_x: row.coord_x as number,
                    coord_y: row.coord_y as number,
                    location: row.location as string,
                    supplierAddress: row.supplier_address as string,
                    supportingDocs: safeJsonParse(row.supporting_docs_json, []),
                    deliveryNoteImages: safeJsonParse(row.delivery_images_json, []),
                    reportImages: safeJsonParse(row.report_images_json, []),
                    responsiblePerson: row.responsible_person as string
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
    for (const table of tables) {
        try {
            await query(`DELETE FROM ${SCHEMA}.${table} WHERE id = $1`, [id]);
        } catch (e) {}
    }
}

// --- PLANS (IPO) ---

export async function getPlansPaginated(searchTerm: string = '', page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;
    let sql = `SELECT "ID_Factory_Order" as ma_nha_may, "Ma_Tender" as ma_ct, "Project_name" as ten_ct, "Material_description" as ten_hang_muc, "Quantity_IPO" as so_luong_ipo, "Base_Unit" as dvt FROM ${SCHEMA}.ipo`;
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
    let sql = `SELECT "ID_Factory_Order" as ma_nha_may, "Ma_Tender" as ma_ct, "Project_name" as ten_ct, "Material_description" as ten_hang_muc, "Quantity_IPO" as so_luong_ipo, "Base_Unit" as dvt FROM ${SCHEMA}.ipo WHERE "Ma_Tender" = $1 OR "Project_name" = $2`;
    let args: any[] = [maCt, maCt];
    
    if (limit) {
        sql += " LIMIT $3";
        args.push(limit);
    }
    
    const res = await query(sql, args);
    return res.rows as unknown as IPOItem[];
}


// --- SUPPLIERS ---

export async function getSuppliers(): Promise<Supplier[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.suppliers ORDER BY name ASC`);
    return res.rows.map((r: any) => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as Supplier[];
}

export async function saveSupplier(s: Supplier) {
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
}

export async function deleteSupplier(id: string) {
    await query(`DELETE FROM ${SCHEMA}.suppliers WHERE id = $1`, [id]);
}

export async function getSupplierStats(name: string) {
    const res = await query(`SELECT COUNT(id) as total_pos, AVG(score) as pass_rate FROM ${SCHEMA}.forms_iqc WHERE supplier = $1`, [name]);
    return {
        total_pos: Number(res.rows[0].total_pos || 0),
        pass_rate: Number(res.rows[0].pass_rate || 0),
        defect_rate: 100 - Number(res.rows[0].pass_rate || 0)
    };
}

export async function getSupplierInspections(name: string): Promise<Inspection[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.forms_iqc WHERE supplier = $1 ORDER BY date DESC`, [name]);
    return res.rows as unknown as Inspection[];
}

// --- NCR ---

export async function saveNcrMapped(inspection_id: string, ncr: NCR, createdBy: string) {
    await query(`
        INSERT INTO ${SCHEMA}.ncrs (id, inspection_id, item_id, defect_code, severity, status, description, root_cause, corrective_action, preventive_action, responsible_person, deadline, images_before_json, images_after_json, created_by, created_at, updated_at, comments_json) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT, $16) 
        ON CONFLICT(id) DO UPDATE SET 
            status = EXCLUDED.status, 
            root_cause = EXCLUDED.root_cause, 
            corrective_action = EXCLUDED.corrective_action, 
            updated_at = EXCLUDED.updated_at, 
            comments_json = EXCLUDED.comments_json
    `, sanitizeArgs([ncr.id, inspection_id, ncr.itemId, ncr.defect_code, ncr.severity, ncr.status, ncr.issueDescription, ncr.rootCause, ncr.solution, ncr.preventiveAction, ncr.responsiblePerson, ncr.deadline, ncr.imagesBefore, ncr.imagesAfter, createdBy, ncr.comments]));
    return ncr.id;
}

export async function getNcrs(filters: any = {}): Promise<{ items: NCR[], total: number }> {
    let sql = `SELECT * FROM ${SCHEMA}.ncrs`;
    let args: any[] = [];
    if (filters.status && filters.status !== 'ALL') { 
        sql += " WHERE status = $1"; 
        args.push(filters.status); 
    }
    const res = await query(sql + " ORDER BY created_at DESC", args);
    return { items: res.rows.map((r: any) => ({
        id: r.id, inspection_id: r.inspection_id, itemId: r.item_id, defect_code: r.defect_code,
        severity: r.severity, status: r.status, issueDescription: r.description, rootCause: r.root_cause,
        solution: r.corrective_action, preventiveAction: r.preventive_action, responsiblePerson: r.responsible_person,
        deadline: r.deadline, imagesBefore: safeJsonParse(r.images_before_json, []), imagesAfter: safeJsonParse(r.images_after_json, []),
        createdBy: r.created_by, comments: safeJsonParse(r.comments_json, [])
    })) as unknown as NCR[], total: res.rows.length };
}

export async function getNcrById(id: string): Promise<NCR | null> {
    const res = await query(`SELECT * FROM ${SCHEMA}.ncrs WHERE id = $1`, [id]);
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

// --- USERS ---

export async function getUsers(): Promise<User[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.users`);
    return res.rows.map((r: any) => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as User[];
}

export async function getUserByUsername(username: string): Promise<User | null> {
    const res = await query(`SELECT * FROM ${SCHEMA}.users WHERE username = $1`, [username]);
    if (res.rows.length === 0) return null;
    return { ...res.rows[0], ...safeJsonParse((res.rows[0] as any).data, {}) } as unknown as User;
}

export async function saveUser(u: User) {
    await query(`
        INSERT INTO ${SCHEMA}.users (id, username, password, name, role, avatar, data, updated_at) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, EXTRACT(EPOCH FROM NOW())::BIGINT) 
        ON CONFLICT(id) DO UPDATE SET 
            password = EXCLUDED.password, 
            name = EXCLUDED.name, 
            role = EXCLUDED.role, 
            avatar = EXCLUDED.avatar, 
            data = EXCLUDED.data, 
            updated_at = EXCLUDED.updated_at
    `, sanitizeArgs([u.id, u.username, u.password, u.name, u.role, u.avatar, u]));
}

export async function deleteUser(id: string) {
    await query(`DELETE FROM ${SCHEMA}.users WHERE id = $1`, [id]);
}

export async function importUsers(users: User[]) {
    for (const u of users) {
        await query(`
            INSERT INTO ${SCHEMA}.users (id, username, password, name, role, avatar, data, updated_at) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, EXTRACT(EPOCH FROM NOW())::BIGINT) 
            ON CONFLICT(username) DO UPDATE SET 
                name = EXCLUDED.name, 
                role = EXCLUDED.role, 
                avatar = EXCLUDED.avatar, 
                data = EXCLUDED.data, 
                updated_at = EXCLUDED.updated_at
        `, sanitizeArgs([u.id, u.username, u.password || '123', u.name, u.role, u.avatar, u]));
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

export async function getProjectsPaginated(search: string = '', limit: number = 20) {
    let sql = `SELECT * FROM ${SCHEMA}.projects`;
    let args: any[] = [];
    if (search) { 
        sql += " WHERE ma_ct LIKE $1 OR name LIKE $2"; 
        const p = `%${search}%`; 
        args = [p, p]; 
    }
    const res = await query(sql + ` LIMIT $${args.length + 1}`, [...args, limit]);
    return res.rows.map((r: any) => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as Project[];
}

export async function getProjectByCode(code: string): Promise<Project | null> {
    const res = await query(`SELECT * FROM ${SCHEMA}.projects WHERE ma_ct = $1`, [code]);
    if (res.rows.length === 0) return null;
    return { ...res.rows[0], ...safeJsonParse((res.rows[0] as any).data, {}) } as unknown as Project;
}

export async function updateProject(p: Project) {
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
            updated_at = EXCLUDED.updated_at, 
            data = EXCLUDED.data
    `, sanitizeArgs([p.ma_ct, p.name, p.status, p.pm, p.pc, p.qa, p.progress, p.startDate, p.endDate, p.location, p.description, p.thumbnail, p]));
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

// --- ROLES ---

export async function getRoles(): Promise<Role[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.roles`);
    return res.rows.map((r: any) => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as Role[];
}

export async function saveRole(role: Role) {
    await query(`
        INSERT INTO ${SCHEMA}.roles (id, name, data, updated_at) 
        VALUES ($1, $2, $3, EXTRACT(EPOCH FROM NOW())::BIGINT) 
        ON CONFLICT(id) DO UPDATE SET 
            name = EXCLUDED.name, 
            data = EXCLUDED.data, 
            updated_at = EXCLUDED.updated_at
    `, sanitizeArgs([role.id, role.name, role]));
}

export async function deleteRole(id: string) {
    await query(`DELETE FROM ${SCHEMA}.roles WHERE id = $1`, [id]);
}

// --- DEFECT LIBRARY ---

export async function getDefectLibrary(): Promise<DefectLibraryItem[]> {
    const res = await query(`SELECT * FROM ${SCHEMA}.defect_library ORDER BY defect_code ASC`);
    return res.rows.map((r: any) => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as DefectLibraryItem[];
}

export async function saveDefectLibraryItem(item: DefectLibraryItem) {
    await query(`
        INSERT INTO ${SCHEMA}.defect_library (id, defect_code, name, stage, category, description, severity, suggested_action, created_by, created_at, updated_at, data) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, EXTRACT(EPOCH FROM NOW())::BIGINT, $11) 
        ON CONFLICT(id) DO UPDATE SET 
            defect_code = EXCLUDED.defect_code, 
            name = EXCLUDED.name, 
            data = EXCLUDED.data, 
            updated_at = EXCLUDED.updated_at
    `, sanitizeArgs([item.id, item.code, item.name, item.stage, item.category, item.description, item.severity, item.suggestedAction, item.createdBy, item.createdAt, item]));
}

export async function deleteDefectLibraryItem(id: string) {
    await query(`DELETE FROM ${SCHEMA}.defect_library WHERE id = $1`, [id]);
}

/**
 * Health check for database connection.
 */
export async function testConnection(): Promise<boolean> {
    try { await query("SELECT 1"); return true; } catch (e) { return false; }
}
