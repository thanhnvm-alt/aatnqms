
import { turso, isTursoConfigured } from "./tursoConfig";
import { NCR, Inspection, PlanItem, User, Workshop, CheckItem, QMSImage, Project, Role, Defect, DefectLibraryItem, Notification, NCRComment, InspectionStatus, MaterialIQC, CheckStatus, ModuleId, Supplier, FloorPlan, LayoutPin } from "../types";

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
    if (t === 'sqc_mat' || t === 'sqc_vt') return 'forms_sqc_vt';
    return MODULE_TABLES.includes(t) ? `forms_${t}` : `forms_pqc`;
};

/**
 * Initialize database tables if they don't exist
 */
export const initDatabase = async () => {
  if (!isTursoConfigured) return;
  try {
    const baseColumns = `
        id TEXT PRIMARY KEY, type TEXT, ma_ct TEXT, ten_ct TEXT, ten_hang_muc TEXT, 
        po_number TEXT, supplier TEXT, inspector TEXT, status TEXT, date TEXT, 
        score REAL, summary TEXT, items_json TEXT, materials_json TEXT, 
        signature_qc TEXT, pm_signature TEXT, pm_name TEXT, pm_comment TEXT, 
        production_signature TEXT, production_name TEXT, production_comment TEXT,
        images_json TEXT, delivery_images_json TEXT, report_images_json TEXT,
        comments_json TEXT DEFAULT '[]', so_luong_ipo REAL, inspected_qty REAL, 
        passed_qty REAL, failed_qty REAL, dvt TEXT, updated_at TEXT, created_at TEXT,
        floor_plan_id TEXT, coord_x REAL, coord_y REAL
    `;

    await turso.batch([
      "CREATE TABLE IF NOT EXISTS floor_plans (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, image_url TEXT NOT NULL, version TEXT, status TEXT DEFAULT 'ACTIVE', file_name TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS layout_pins (id TEXT PRIMARY KEY, floor_plan_id TEXT NOT NULL, inspection_id TEXT, x REAL, y REAL, label TEXT, status TEXT)",
      "CREATE TABLE IF NOT EXISTS qms_images (id TEXT PRIMARY KEY, parent_entity_id TEXT NOT NULL, related_item_id TEXT, entity_type TEXT NOT NULL, image_role TEXT NOT NULL, url_hd TEXT, url_thumbnail TEXT, created_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS ncrs (id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL, item_id TEXT NOT NULL, defect_code TEXT, severity TEXT DEFAULT 'MINOR', status TEXT DEFAULT 'OPEN', description TEXT NOT NULL, root_cause TEXT, corrective_action TEXT, preventive_action TEXT, responsible_person TEXT, deadline TEXT, images_before_json TEXT, images_after_json TEXT, created_by TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()), comments_json TEXT DEFAULT ( '[]' ))",
      `CREATE TABLE IF NOT EXISTS forms_pqc (id TEXT PRIMARY KEY, ma_ct TEXT, ten_ct TEXT, ten_hang_muc TEXT, ma_nha_may TEXT, workshop TEXT, stage TEXT, dvt TEXT, sl_ipo REAL DEFAULT 0, qty_total REAL DEFAULT 0, qty_pass REAL DEFAULT 0, qty_fail REAL DEFAULT 0, created_by TEXT, created_at TEXT, inspector TEXT, status TEXT, data TEXT, updated_at TEXT, items_json TEXT, images_json TEXT, headcode TEXT, date TEXT, qty_ipo REAL, score REAL, summary TEXT, signature_qc TEXT, signature_prod TEXT, signature_mgr TEXT, name_prod TEXT, name_mgr TEXT, item_images_json TEXT, comments_json TEXT DEFAULT '[]', type TEXT DEFAULT 'PQC', production_comment TEXT, floor_plan_id TEXT, coord_x REAL, coord_y REAL)`,
      `CREATE TABLE IF NOT EXISTS forms_iqc (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_sqc_vt (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_sqc_btp (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_fsr (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_step (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_fqc (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_spr (${baseColumns})`,
      `CREATE TABLE IF NOT EXISTS forms_site (${baseColumns})`,
      "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE, password TEXT, name TEXT, role TEXT, avatar TEXT, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS projects (ma_ct TEXT PRIMARY KEY, name TEXT, status TEXT, pm TEXT, pc TEXT, qa TEXT, progress REAL DEFAULT 0, start_date TEXT, end_date TEXT, location TEXT, description TEXT, thumbnail TEXT, data TEXT, updated_at INTEGER, created_at INTEGER DEFAULT (unixepoch()))",
      "CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT, is_read INTEGER DEFAULT 0, created_at INTEGER, data TEXT, title TEXT, message TEXT, type TEXT)",
      "CREATE TABLE IF NOT EXISTS defect_library (id TEXT PRIMARY KEY, defect_code TEXT, name TEXT, stage TEXT, category TEXT, description TEXT, severity TEXT, suggested_action TEXT, created_by TEXT, created_at INTEGER, updated_at INTEGER, data TEXT)",
      "CREATE TABLE IF NOT EXISTS templates (module_id TEXT PRIMARY KEY, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, headcode TEXT, ma_ct TEXT, ten_ct TEXT, ten_hang_muc TEXT, dvt TEXT, so_luong_ipo REAL, ma_nha_may TEXT, created_at INTEGER, assignee TEXT, status TEXT, pthsp TEXT)",
      "CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS workshops (id TEXT PRIMARY KEY, code TEXT, name TEXT, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL, address TEXT, contact_person TEXT, phone TEXT, email TEXT, category TEXT, status TEXT DEFAULT 'ACTIVE', data TEXT, updated_at INTEGER)"
    ]);
  } catch (error) {
    console.error("Database initialization failed", error);
  }
};

// --- FLOOR PLANS & PINS ---

export async function getFloorPlans(projectId: string): Promise<FloorPlan[]> {
    const res = await turso.execute({
        sql: "SELECT * FROM floor_plans WHERE project_id = ? ORDER BY updated_at DESC",
        args: [projectId]
    });
    return res.rows as unknown as FloorPlan[];
}

export async function saveFloorPlan(fp: FloorPlan) {
    await turso.execute({
        sql: "INSERT INTO floor_plans (id, project_id, name, image_url, version, status, file_name, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET name = excluded.name, image_url = excluded.image_url, version = excluded.version, status = excluded.status, updated_at = excluded.updated_at",
        args: [fp.id, fp.project_id, fp.name, fp.image_url, fp.version, fp.status, fp.file_name]
    });
}

export async function deleteFloorPlan(id: string) {
    await turso.execute({ sql: "DELETE FROM floor_plans WHERE id = ?", args: [id] });
    await turso.execute({ sql: "DELETE FROM layout_pins WHERE floor_plan_id = ?", args: [id] });
}

export async function getLayoutPins(floorPlanId: string): Promise<LayoutPin[]> {
    const res = await turso.execute({
        sql: "SELECT * FROM layout_pins WHERE floor_plan_id = ?",
        args: [floorPlanId]
    });
    return res.rows as unknown as LayoutPin[];
}

export async function saveLayoutPin(pin: LayoutPin) {
    await turso.execute({
        sql: "INSERT INTO layout_pins (id, floor_plan_id, inspection_id, x, y, label, status) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET inspection_id = excluded.inspection_id, status = excluded.status",
        args: [pin.id, pin.floor_plan_id, pin.inspection_id, pin.x, pin.y, pin.label, pin.status]
    });
}

// --- INSPECTIONS ---

/**
 * Fix: Implemented saveInspection to correctly route data to module-specific tables with full column mapping
 */
export async function saveInspection(inspection: Inspection) {
  const table = getTableName(inspection.type);
  const data = JSON.stringify(inspection);
  
  const spatialArgs = [inspection.floor_plan_id || null, inspection.coord_x || null, inspection.coord_y || null];

  if (inspection.type === 'PQC') {
    await turso.execute({
      sql: `INSERT INTO forms_pqc (id, ma_ct, ten_ct, ten_hang_muc, ma_nha_may, workshop, stage, dvt, sl_ipo, qty_total, qty_pass, qty_fail, inspector, status, data, updated_at, items_json, headcode, date, score, summary, type, production_comment, floor_plan_id, coord_x, coord_y)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, status = excluded.status, updated_at = excluded.updated_at, score = excluded.score, floor_plan_id = excluded.floor_plan_id, coord_x = excluded.coord_x, coord_y = excluded.coord_y`,
      args: sanitizeArgs([
        inspection.id, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc, 
        inspection.ma_nha_may, inspection.workshop, inspection.inspectionStage, inspection.dvt,
        inspection.so_luong_ipo, inspection.inspectedQuantity, inspection.passedQuantity, inspection.failedQuantity,
        inspection.inspectorName, inspection.status, data, new Date().toISOString(),
        JSON.stringify(inspection.items), inspection.headcode, inspection.date, inspection.score, 
        inspection.summary, inspection.type, inspection.productionComment, ...spatialArgs
      ])
    });
  } else {
    await turso.execute({
      sql: `INSERT INTO ${table} (id, type, ma_ct, ten_ct, ten_hang_muc, po_number, supplier, inspector, status, date, score, summary, items_json, materials_json, so_luong_ipo, inspected_qty, passed_qty, failed_qty, dvt, updated_at, floor_plan_id, coord_x, coord_y)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET status = excluded.status, score = excluded.score, updated_at = excluded.updated_at, floor_plan_id = excluded.floor_plan_id, coord_x = excluded.coord_x, coord_y = excluded.coord_y`,
      args: sanitizeArgs([
        inspection.id, inspection.type, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc,
        inspection.po_number, inspection.supplier, inspection.inspectorName, inspection.status, inspection.date,
        inspection.score, inspection.summary, JSON.stringify(inspection.items), JSON.stringify(inspection.materials),
        inspection.so_luong_ipo, inspection.inspectedQuantity, inspection.passedQuantity, inspection.failedQuantity,
        inspection.dvt, new Date().toISOString(), ...spatialArgs
      ])
    });
  }
}

/**
 * Fix: Implemented getInspectionsList to aggregate inspections from all module tables
 */
export async function getInspectionsList(filters: any = {}): Promise<{ items: Inspection[], total: number }> {
    const results: any[] = [];
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    
    for (const table of tables) {
        try {
            const res = await turso.execute(`SELECT * FROM ${table} ORDER BY updated_at DESC LIMIT 100`);
            res.rows.forEach((row: any) => {
                const data = row.data ? safeJsonParse(row.data, {}) : {};
                results.push({
                    ...data,
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
                    inspectionStage: row.stage,
                    isAllPass: row.status === 'COMPLETED' || row.status === 'APPROVED',
                    hasNcr: row.status === 'FLAGGED',
                    isCond: row.status === 'CONDITIONAL'
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
 * Fix: Implemented getInspectionById to locate inspection across multiple potential tables
 */
export async function getInspectionById(id: string): Promise<Inspection | null> {
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    for (const table of tables) {
        try {
            const res = await turso.execute({ sql: `SELECT * FROM ${table} WHERE id = ?`, args: [id] });
            if (res.rows.length > 0) {
                const row = res.rows[0];
                if (row.data) return safeJsonParse(row.data, null);
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
                    managerSignature: row.signature_mgr as string,
                    managerName: row.name_mgr as string,
                    productionSignature: row.signature_prod as string,
                    productionName: row.name_prod as string,
                    comments: safeJsonParse(row.comments_json, []),
                    floor_plan_id: row.floor_plan_id as string,
                    coord_x: row.coord_x as number,
                    coord_y: row.coord_y as number
                } as Inspection;
            }
        } catch (e) {
            console.warn(`Error searching table ${table} for id ${id}:`, e);
        }
    }
    return null;
}

/**
 * Fix: Implemented deleteInspection to clear record from all potential module tables
 */
export async function deleteInspection(id: string) {
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    for (const table of tables) {
        try {
            await turso.execute({ sql: `DELETE FROM ${table} WHERE id = ?`, args: [id] });
        } catch (e) {}
    }
}

// --- PLANS ---

/**
 * Fix: Implemented getPlansPaginated for server-authoritative plan listing
 */
export async function getPlansPaginated(searchTerm: string = '', page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;
    let sql = "SELECT * FROM plans";
    let args: any[] = [];
    if (searchTerm) {
        sql += " WHERE ma_ct LIKE ? OR ten_ct LIKE ? OR ten_hang_muc LIKE ? OR headcode LIKE ? OR ma_nha_may LIKE ?";
        const p = `%${searchTerm}%`;
        args = [p, p, p, p, p];
    }
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    const res = await turso.execute({ sql, args: [...args, limit, offset] });
    const countRes = await turso.execute("SELECT COUNT(*) as total FROM plans");
    return { items: res.rows as unknown as PlanItem[], total: Number(countRes.rows[0].total) };
}

// --- SUPPLIERS ---

/**
 * Fix: Implemented getSuppliers
 */
export async function getSuppliers(): Promise<Supplier[]> {
    const res = await turso.execute("SELECT * FROM suppliers ORDER BY name ASC");
    return res.rows.map(r => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as Supplier[];
}

/**
 * Fix: Implemented saveSupplier
 */
export async function saveSupplier(s: Supplier) {
    await turso.execute({
        sql: "INSERT INTO suppliers (id, code, name, address, contact_person, phone, email, category, status, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name, address = excluded.address, status = excluded.status, data = excluded.data, updated_at = excluded.updated_at",
        args: sanitizeArgs([s.id, s.code, s.name, s.address, s.contact_person, s.phone, s.email, s.category, s.status, s])
    });
}

/**
 * Fix: Implemented deleteSupplier
 */
export async function deleteSupplier(id: string) {
    await turso.execute({ sql: "DELETE FROM suppliers WHERE id = ?", args: [id] });
}

/**
 * Fix: Implemented getSupplierStats
 */
export async function getSupplierStats(name: string) {
    const res = await turso.execute({ sql: "SELECT COUNT(id) as total_pos, AVG(score) as pass_rate FROM forms_iqc WHERE supplier = ?", args: [name] });
    return {
        total_pos: Number(res.rows[0].total_pos || 0),
        pass_rate: Number(res.rows[0].pass_rate || 0),
        defect_rate: 100 - Number(res.rows[0].pass_rate || 0)
    };
}

/**
 * Fix: Implemented getSupplierInspections
 */
export async function getSupplierInspections(name: string): Promise<Inspection[]> {
    const res = await turso.execute({ sql: "SELECT * FROM forms_iqc WHERE supplier = ? ORDER BY date DESC", args: [name] });
    return res.rows as unknown as Inspection[];
}

// --- NCR ---

/**
 * Fix: Implemented saveNcrMapped
 */
export async function saveNcrMapped(inspection_id: string, ncr: NCR, createdBy: string) {
    await turso.execute({
        sql: "INSERT INTO ncrs (id, inspection_id, item_id, defect_code, severity, status, description, root_cause, corrective_action, preventive_action, responsible_person, deadline, images_before_json, images_after_json, created_by, updated_at, comments_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, root_cause = excluded.root_cause, corrective_action = excluded.corrective_action, updated_at = excluded.updated_at, comments_json = excluded.comments_json",
        args: sanitizeArgs([ncr.id, inspection_id, ncr.itemId, ncr.defect_code, ncr.severity, ncr.status, ncr.issueDescription, ncr.rootCause, ncr.solution, ncr.preventiveAction, ncr.responsiblePerson, ncr.deadline, ncr.imagesBefore, ncr.imagesAfter, createdBy, ncr.comments])
    });
    return ncr.id;
}

/**
 * Fix: Implemented getNcrs
 */
export async function getNcrs(filters: any = {}): Promise<{ items: NCR[], total: number }> {
    let sql = "SELECT * FROM ncrs";
    let args: any[] = [];
    if (filters.status && filters.status !== 'ALL') { sql += " WHERE status = ?"; args.push(filters.status); }
    const res = await turso.execute({ sql: sql + " ORDER BY created_at DESC", args });
    return { items: res.rows.map(r => ({
        id: r.id, inspection_id: r.inspection_id, itemId: r.item_id, defect_code: r.defect_code,
        severity: r.severity, status: r.status, issueDescription: r.description, rootCause: r.root_cause,
        solution: r.corrective_action, preventiveAction: r.preventive_action, responsiblePerson: r.responsible_person,
        deadline: r.deadline, imagesBefore: safeJsonParse(r.images_before_json, []), imagesAfter: safeJsonParse(r.images_after_json, []),
        createdBy: r.created_by, comments: safeJsonParse(r.comments_json, [])
    })) as unknown as NCR[], total: res.rows.length };
}

/**
 * Fix: Implemented getNcrById
 */
export async function getNcrById(id: string): Promise<NCR | null> {
    const res = await turso.execute({ sql: "SELECT * FROM ncrs WHERE id = ?", args: [id] });
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

/**
 * Fix: Implemented getUsers
 */
export async function getUsers(): Promise<User[]> {
    const res = await turso.execute("SELECT * FROM users");
    return res.rows.map(r => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as User[];
}

/**
 * Fix: Implemented getUserByUsername
 */
export async function getUserByUsername(username: string): Promise<User | null> {
    const res = await turso.execute({ sql: "SELECT * FROM users WHERE username = ?", args: [username] });
    if (res.rows.length === 0) return null;
    return { ...res.rows[0], ...safeJsonParse((res.rows[0] as any).data, {}) } as unknown as User;
}

/**
 * Fix: Implemented saveUser
 */
export async function saveUser(u: User) {
    await turso.execute({
        sql: "INSERT INTO users (id, username, password, name, role, avatar, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET password = excluded.password, name = excluded.name, role = excluded.role, avatar = excluded.avatar, data = excluded.data, updated_at = excluded.updated_at",
        args: sanitizeArgs([u.id, u.username, u.password, u.name, u.role, u.avatar, u])
    });
}

/**
 * Fix: Implemented deleteUser
 */
export async function deleteUser(id: string) {
    await turso.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
}

/**
 * Fix: Implemented importUsers
 */
export async function importUsers(users: User[]) {
    const batches = users.map(u => ({
        sql: "INSERT INTO users (id, username, password, name, role, avatar, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch()) ON CONFLICT(username) DO UPDATE SET name = excluded.name, role = excluded.role, avatar = excluded.avatar, data = excluded.data, updated_at = excluded.updated_at",
        args: sanitizeArgs([u.id, u.username, u.password || '123', u.name, u.role, u.avatar, u])
    }));
    await turso.batch(batches);
}

// --- WORKSHOPS ---

/**
 * Fix: Implemented getWorkshops
 */
export async function getWorkshops(): Promise<Workshop[]> {
    const res = await turso.execute("SELECT * FROM workshops");
    return res.rows.map(r => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as Workshop[];
}

/**
 * Fix: Implemented saveWorkshop
 */
export async function saveWorkshop(ws: Workshop) {
    await turso.execute({
        sql: "INSERT INTO workshops (id, code, name, data, updated_at) VALUES (?, ?, ?, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name, data = excluded.data, updated_at = excluded.updated_at",
        args: sanitizeArgs([ws.id, ws.code, ws.name, ws])
    });
}

/**
 * Fix: Implemented deleteWorkshop
 */
export async function deleteWorkshop(id: string) {
    await turso.execute({ sql: "DELETE FROM workshops WHERE id = ?", args: [id] });
}

// --- TEMPLATES ---

/**
 * Fix: Implemented getTemplates
 */
export async function getTemplates() {
    const res = await turso.execute("SELECT * FROM templates");
    const templates: Record<string, CheckItem[]> = {};
    res.rows.forEach(r => { templates[(r as any).module_id] = safeJsonParse((r as any).data, []); });
    return templates;
}

/**
 * Fix: Implemented saveTemplate
 */
export async function saveTemplate(moduleId: string, items: CheckItem[]) {
    await turso.execute({
        sql: "INSERT INTO templates (module_id, data, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(module_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        args: sanitizeArgs([moduleId, items])
    });
}

// --- PROJECTS ---

/**
 * Fix: Implemented getProjectsPaginated
 */
export async function getProjectsPaginated(search: string = '', limit: number = 20) {
    let sql = "SELECT * FROM projects";
    let args: any[] = [];
    if (search) { sql += " WHERE ma_ct LIKE ? OR name LIKE ?"; const p = `%${search}%`; args = [p, p]; }
    const res = await turso.execute({ sql: sql + " LIMIT ?", args: [...args, limit] });
    return res.rows.map(r => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as Project[];
}

/**
 * Fix: Implemented getProjectByCode
 */
export async function getProjectByCode(code: string): Promise<Project | null> {
    const res = await turso.execute({ sql: "SELECT * FROM projects WHERE ma_ct = ?", args: [code] });
    if (res.rows.length === 0) return null;
    return { ...res.rows[0], ...safeJsonParse((res.rows[0] as any).data, {}) } as unknown as Project;
}

/**
 * Fix: Implemented updateProject
 */
export async function updateProject(p: Project) {
    await turso.execute({
        sql: "INSERT INTO projects (ma_ct, name, status, pm, pc, qa, progress, start_date, end_date, location, description, thumbnail, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch()) ON CONFLICT(ma_ct) DO UPDATE SET name = excluded.name, status = excluded.status, pm = excluded.pm, pc = excluded.pc, qa = excluded.qa, progress = excluded.progress, updated_at = excluded.updated_at, data = excluded.data",
        args: sanitizeArgs([p.ma_ct, p.name, p.status, p.pm, p.pc, p.qa, p.progress, p.startDate, p.endDate, p.location, p.description, p.thumbnail, p])
    });
}

// --- NOTIFICATIONS ---

/**
 * Fix: Implemented addNotification
 */
export async function addNotification(userId: string, type: string, title: string, message: string, link: any) {
    await turso.execute({
        sql: "INSERT INTO notifications (id, user_id, type, title, message, is_read, created_at, data) VALUES (?, ?, ?, ?, ?, 0, unixepoch(), ?)",
        args: sanitizeArgs([`notif_${Date.now()}`, userId, type, title, message, { link }])
    });
}

/**
 * Fix: Implemented getNotifications
 */
export async function getNotifications(userId: string): Promise<Notification[]> {
    const res = await turso.execute({ sql: "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC", args: [userId] });
    return res.rows.map(r => ({
        id: r.id as string,
        userId: r.user_id as string,
        type: r.type as any,
        title: r.title as string,
        message: r.message as string,
        isRead: Boolean(r.is_read),
        createdAt: Number(r.created_at),
        link: safeJsonParse((r as any).data, {}).link
    })) as unknown as Notification[];
}

/**
 * Fix: Implemented markNotificationRead
 */
export async function markNotificationRead(id: string) {
    await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE id = ?", args: [id] });
}

/**
 * Fix: Implemented markAllNotificationsRead
 */
export async function markAllNotificationsRead(userId: string) {
    await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE user_id = ?", args: [userId] });
}

// --- ROLES ---

/**
 * Fix: Implemented getRoles
 */
export async function getRoles(): Promise<Role[]> {
    const res = await turso.execute("SELECT * FROM roles");
    return res.rows.map(r => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as Role[];
}

/**
 * Fix: Implemented saveRole
 */
export async function saveRole(role: Role) {
    await turso.execute({
        sql: "INSERT INTO roles (id, name, data, updated_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at",
        args: sanitizeArgs([role.id, role.name, role])
    });
}

/**
 * Fix: Implemented deleteRole
 */
export async function deleteRole(id: string) {
    await turso.execute({ sql: "DELETE FROM roles WHERE id = ?", args: [id] });
}

// --- DEFECT LIBRARY ---

/**
 * Fix: Implemented getDefectLibrary
 */
export async function getDefectLibrary(): Promise<DefectLibraryItem[]> {
    const res = await turso.execute("SELECT * FROM defect_library ORDER BY defect_code ASC");
    return res.rows.map(r => ({ ...r, ...safeJsonParse((r as any).data, {}) })) as unknown as DefectLibraryItem[];
}

/**
 * Fix: Implemented saveDefectLibraryItem
 */
export async function saveDefectLibraryItem(item: DefectLibraryItem) {
    await turso.execute({
        sql: "INSERT INTO defect_library (id, defect_code, name, stage, category, description, severity, suggested_action, created_by, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), ?) ON CONFLICT(id) DO UPDATE SET defect_code = excluded.defect_code, name = excluded.name, data = excluded.data, updated_at = excluded.updated_at",
        args: sanitizeArgs([item.id, item.code, item.name, item.stage, item.category, item.description, item.severity, item.suggestedAction, item.createdBy, item.createdAt, Math.floor(Date.now()/1000), item])
    });
}

/**
 * Fix: Implemented deleteDefectLibraryItem
 */
export async function deleteDefectLibraryItem(id: string) {
    await turso.execute({ sql: "DELETE FROM defect_library WHERE id = ?", args: [id] });
}

/**
 * Fix: Implemented testConnection for health checks
 */
export async function testConnection(): Promise<boolean> {
    try { await turso.execute("SELECT 1"); return true; } catch (e) { return false; }
}
