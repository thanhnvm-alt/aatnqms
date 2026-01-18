
import { turso, isTursoConfigured } from "./tursoConfig";
import { NCR, Inspection, PlanItem, User, Workshop, CheckItem, QMSImage, Project, Role, Defect, DefectLibraryItem, Notification, NCRComment, InspectionStatus, MaterialIQC, CheckStatus } from "../types";

const safeJsonParse = <T>(jsonString: any, defaultValue: T): T => {
  if (!jsonString || jsonString === "undefined" || jsonString === "null") return defaultValue;
  try {
    if (typeof jsonString === 'object') return jsonString as T;
    return JSON.parse(jsonString) as T;
  } catch (e) {
    return defaultValue;
  }
};

/**
 * ISO-DB Helper: Đảm bảo các tham số truyền vào SQL là kiểu dữ liệu được hỗ trợ.
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

const getTableName = (type: string = 'PQC'): string => {
    const t = type.toLowerCase();
    if (t === 'sqc_mat' || t === 'sqc_vt') return 'forms_sqc_vt';
    return MODULE_TABLES.includes(t) ? `forms_${t}` : `forms_pqc`;
};

/**
 * ISO-MIGRATION-OPTIMIZED: Kiểm tra schema thông minh.
 * Thay vì thử ALTER cho mọi cột (gây ra 130+ requests), chúng ta fetch schema 1 lần/bảng.
 */
async function ensureSchemaUpToDate() {
    const tables = Array.from(new Set(MODULE_TABLES.map(m => (m === 'sqc_vt' || m === 'sqc_mat') ? 'forms_sqc_vt' : `forms_${m}`)));
    const requiredColumns = [
        'po_number', 'supplier', 'materials_json', 'signature_qc',
        'pm_signature', 'pm_name', 'pm_comment',
        'production_signature', 'production_name', 'production_comment',
        'images_json', 'delivery_images_json', 'report_images_json'
    ];

    // Chạy song song việc kiểm tra từng bảng
    await Promise.all(tables.map(async (table) => {
        try {
            // Lấy danh sách cột hiện có của bảng (1 request)
            const info = await turso.execute(`PRAGMA table_info(${table})`);
            const existingCols = info.rows.map(r => String(r.name).toLowerCase());
            
            // Tìm các cột còn thiếu
            const missingCols = requiredColumns.filter(c => !existingCols.includes(c.toLowerCase()));
            
            // Chỉ chạy ALTER nếu thực sự thiếu cột
            for (const col of missingCols) {
                await turso.execute(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`);
                console.log(`[ISO-DB] Added missing column ${col} to ${table}`);
            }
        } catch (e) {
            // Bảng có thể chưa tồn tại, sẽ được tạo bởi CREATE TABLE ở bước trước
        }
    }));
}

export async function repairProjectData() {
    try {
        await turso.batch([
            { sql: "UPDATE projects SET id = 'PROJ-' || ma_ct WHERE (id IS NULL OR id = '' OR id = 'null') AND ma_ct IS NOT NULL", args: [] },
            { sql: "UPDATE projects SET name = ma_ct WHERE (name IS NULL OR name = '' OR name = 'null') AND ma_ct IS NOT NULL", args: [] }
        ]);
    } catch (e) {
        // Silently fail for repair
    }
}

export const initDatabase = async () => {
  if (!isTursoConfigured) return;
  try {
    console.time("ISO-DB-INIT");
    
    // 1. Tạo các bảng core (Batch duy nhất)
    await turso.batch([
      "CREATE TABLE IF NOT EXISTS projects (ma_ct TEXT PRIMARY KEY, id TEXT, name TEXT, status TEXT, pm TEXT, pc TEXT, qa TEXT, progress REAL DEFAULT 0, start_date TEXT, end_date TEXT, location TEXT, description TEXT, thumbnail TEXT, data TEXT, updated_at INTEGER, created_at INTEGER DEFAULT (unixepoch()))",
      "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT, avatar TEXT, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS workshops (id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS templates (moduleId TEXT PRIMARY KEY, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS inspections_master (id TEXT PRIMARY KEY, type TEXT NOT NULL, created_at TEXT, updated_at TEXT)",
      "CREATE TABLE IF NOT EXISTS qms_images (id TEXT PRIMARY KEY, parent_entity_id TEXT NOT NULL, related_item_id TEXT, entity_type TEXT NOT NULL, image_role TEXT NOT NULL, url_hd TEXT, url_thumbnail TEXT, created_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS ncrs (id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL, defect_code TEXT, severity TEXT DEFAULT 'MINOR', status TEXT DEFAULT 'OPEN', description TEXT NOT NULL, root_cause TEXT, corrective_action TEXT, preventive_action TEXT, responsible_person TEXT, deadline TEXT, images_before_json TEXT, images_after_json TEXT, created_by TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()), item_id TEXT NOT NULL DEFAULT ( 'unknown' ), comments_json TEXT DEFAULT ( '[]' ))",
      "CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, headcode TEXT, ma_ct TEXT, ten_ct TEXT, ten_hang_muc TEXT, dvt TEXT, so_luong_ipo REAL, ma_nha_may TEXT, created_at INTEGER, assignee TEXT, status TEXT)",
      "CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT, is_read INTEGER DEFAULT 0, created_at INTEGER, data TEXT)",
      "CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT, data TEXT, updated_at INTEGER)",
      "CREATE TABLE IF NOT EXISTS defect_library (id TEXT PRIMARY KEY, defect_code TEXT, name TEXT, stage TEXT, category TEXT, description TEXT, severity TEXT, suggested_action TEXT, created_by TEXT, created_at INTEGER, updated_at INTEGER, data TEXT)"
    ]);

    // 2. Tạo các bảng module (Batch duy nhất)
    const createModuleQueries = Array.from(new Set(MODULE_TABLES.map(m => {
        const tableName = (m === 'sqc_vt' || m === 'sqc_mat') ? 'forms_sqc_vt' : `forms_${m}`;
        return `CREATE TABLE IF NOT EXISTS ${tableName} (id TEXT PRIMARY KEY, type TEXT, created_at TEXT, updated_at TEXT)`;
    })));
    await turso.batch(createModuleQueries);

    // 3. Migration thông minh (Tối ưu số lượng request)
    await ensureSchemaUpToDate();

    // 4. Sửa lỗi dữ liệu chạy ngầm, không đợi
    repairProjectData();

    console.timeEnd("ISO-DB-INIT");
    console.log("✔ ISO-DB: Database initialized rapidly.");
  } catch (e: any) {
    console.error("❌ ISO-DB: Startup failure:", e.message);
  }
};

export const saveInspection = async (inspection: Inspection) => {
  const now = new Date().toISOString();
  const type = inspection.type || 'PQC';
  const tableName = getTableName(type);
  
  const rawArgs = [
    inspection.id, type, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc, 
    inspection.po_number, inspection.supplier, inspection.inspectorName, 
    inspection.status, inspection.date, inspection.score || 0, inspection.summary, 
    JSON.stringify(inspection.items || []), JSON.stringify(inspection.materials || []),
    inspection.signature, inspection.pmSignature, inspection.pmName, inspection.pmComment, 
    inspection.productionSignature, inspection.productionName, inspection.productionComment,
    JSON.stringify(inspection.images || []), JSON.stringify(inspection.deliveryNoteImages || []), JSON.stringify(inspection.reportImages || []),
    now, inspection.createdAt || now
  ];

  const sql = `
    INSERT INTO ${tableName} (
        id, type, ma_ct, ten_ct, ten_hang_muc, po_number, supplier, 
        inspector, status, date, score, summary, items_json, materials_json, 
        signature_qc, pm_signature, pm_name, pm_comment, 
        production_signature, production_name, production_comment,
        images_json, delivery_images_json, report_images_json,
        updated_at, created_at
    ) 
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) 
    ON CONFLICT(id) DO UPDATE SET 
        status=excluded.status, 
        score=excluded.score, 
        summary=excluded.summary, 
        items_json=excluded.items_json, 
        materials_json=excluded.materials_json,
        pm_signature=excluded.pm_signature,
        pm_name=excluded.pm_name,
        pm_comment=excluded.pm_comment,
        production_signature=excluded.production_signature,
        production_name=excluded.production_name,
        production_comment=excluded.production_comment,
        images_json=excluded.images_json,
        delivery_images_json=excluded.delivery_images_json,
        report_images_json=excluded.report_images_json,
        updated_at=excluded.updated_at
  `;

  await turso.batch([
    { sql: `INSERT INTO inspections_master (id, type, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`, args: sanitizeArgs([inspection.id, type, inspection.createdAt || now, now]) },
    { sql, args: sanitizeArgs(rawArgs) }
  ]);
};

export const getInspectionById = async (id: string): Promise<Inspection | null> => {
  try {
    const masterRes = await turso.execute({ sql: "SELECT type FROM inspections_master WHERE id = ?", args: [id] });
    if (masterRes.rows.length === 0) return null;
    const type = String(masterRes.rows[0].type);
    const tableName = getTableName(type);
    const res = await turso.execute({ sql: `SELECT * FROM ${tableName} WHERE id = ?`, args: [id] });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    
    return { 
        id: String(r.id), 
        type: String(r.type || type), 
        ma_ct: String(r.ma_ct || ''), 
        ten_ct: String(r.ten_ct || ''), 
        ten_hang_muc: String(r.ten_hang_muc || ''), 
        po_number: String(r.po_number || ''),
        supplier: String(r.supplier || ''),
        inspectorName: String(r.inspector || ''), 
        status: r.status as any, 
        date: String(r.date || ''), 
        score: Number(r.score || 0), 
        summary: String(r.summary || ''), 
        items: safeJsonParse(r.items_json, []), 
        materials: safeJsonParse(r.materials_json, []),
        images: safeJsonParse(r.images_json, []), 
        deliveryNoteImages: safeJsonParse(r.delivery_images_json, []),
        reportImages: safeJsonParse(r.report_images_json, []),
        signature: String(r.signature_qc || ''), 
        pmSignature: String(r.pm_signature || ''),
        pmName: String(r.pm_name || ''),
        pmComment: String(r.pm_comment || ''),
        productionSignature: String(r.production_signature || ''),
        productionName: String(r.production_name || ''),
        productionComment: String(r.production_comment || ''),
        createdAt: String(r.created_at || ''), 
        updatedAt: String(r.updated_at || '') 
    } as any;
  } catch (e) { 
      return null; 
  }
};

export const syncProjectsWithPlans = async () => {
    try {
        const syncSql = `
            INSERT INTO projects (ma_ct, id, name, status, pm, pc, qa, progress, start_date, updated_at)
            SELECT DISTINCT p.ma_ct, 'PROJ-' || p.ma_ct, p.ten_ct, 'Planning', 'Chưa phân công', 'Chưa phân công', 'Chưa phân công', 0, date('now'), unixepoch()
            FROM plans p
            WHERE p.ma_ct IS NOT NULL AND p.ma_ct != '' AND p.ma_ct NOT IN (SELECT ma_ct FROM projects)
        `;
        await turso.execute(syncSql);
        return true;
    } catch (e) {
        return false;
    }
};

export const getProjectsPaginated = async (search: string = '', limit: number = 10): Promise<Project[]> => {
    let sql = "SELECT * FROM projects";
    const args: any[] = [];
    if (search) {
        sql += " WHERE (name LIKE ? OR ma_ct LIKE ?)";
        args.push(`%${search}%`, `%${search}%`);
    }
    sql += " ORDER BY updated_at DESC LIMIT ?";
    args.push(limit);
    const res = await turso.execute({ sql, args: sanitizeArgs(args) });
    return res.rows.map(r => {
        const jsonData = safeJsonParse<any>(r.data, {});
        return { ...jsonData, ma_ct: String(r.ma_ct), id: String(r.id || `PROJ-${r.ma_ct}`), name: String(r.name || r.ma_ct), status: (r.status || 'Planning') as any, pm: String(r.pm || 'Chưa phân công'), pc: String(r.pc || 'Chưa phân công'), qa: String(r.qa || 'Chưa phân công'), progress: Number(r.progress || 0), startDate: String(r.start_date || ''), endDate: String(r.end_date || ''), location: String(r.location || ''), description: String(r.description || ''), thumbnail: String(r.thumbnail || '') } as Project;
    });
};

export const getProjectByCode = async (code: string): Promise<Project | null> => {
    try {
        const res = await turso.execute({ sql: "SELECT * FROM projects WHERE ma_ct = ?", args: sanitizeArgs([code]) });
        if (res.rows.length === 0) return null;
        const r = res.rows[0];
        const jsonData = safeJsonParse<any>(r.data, {});
        return { ...jsonData, ma_ct: String(r.ma_ct), id: String(r.id || `PROJ-${r.ma_ct}`), name: String(r.name || r.ma_ct), status: (r.status || 'Planning') as any, pm: String(r.pm || 'Chưa phân công'), pc: String(r.pc || 'Chưa phân công'), qa: String(r.qa || 'Chưa phân công'), progress: Number(r.progress || 0), startDate: String(r.start_date || ''), endDate: String(r.end_date || ''), location: String(r.location || ''), description: String(r.description || ''), thumbnail: String(r.thumbnail || '') } as Project;
    } catch (e) { return null; }
};

export const updateProject = async (proj: Project) => {
    const { ma_ct, id, name, status, pm, pc, qa, progress, startDate, endDate, location, description, thumbnail, ...rest } = proj;
    await turso.execute({
        sql: `UPDATE projects SET id=?, name=?, status=?, pm=?, pc=?, qa=?, progress=?, start_date=?, end_date=?, location=?, description=?, thumbnail=?, data=?, updated_at=unixepoch() WHERE ma_ct=?`,
        args: sanitizeArgs([id, name, status, pm, pc, qa, progress, startDate, endDate, location, description, thumbnail, JSON.stringify(rest), ma_ct])
    });
};

export const getInspectionsList = async (filters: any = {}) => {
    const unionParts = MODULE_TABLES.map(t => {
        const tableName = (t === 'sqc_vt' || t === 'sqc_mat') ? 'forms_sqc_vt' : `forms_${t}`;
        return `SELECT id, type, ma_ct, ten_ct, ten_hang_muc, inspector, status, date, updated_at FROM ${tableName}`;
    });
    const sql = `SELECT * FROM (${unionParts.join(' UNION ALL ')}) ORDER BY updated_at DESC LIMIT 200`;
    const res = await turso.execute(sql);
    return { items: res.rows.map(r => ({ id: String(r.id), type: String(r.type || 'PQC'), ma_ct: String(r.ma_ct || ''), ten_ct: String(r.ten_ct || ''), ten_hang_muc: String(r.ten_hang_muc || ''), inspectorName: String(r.inspector || ''), status: r.status as any, date: String(r.date || ''), updatedAt: String(r.updated_at || '') })), total: res.rows.length };
};

export const deleteInspection = async (id: string) => {
    // Fixed: Renamed sanitize_args to sanitizeArgs to resolve error on line 279
    const res = await turso.execute({ sql: "SELECT type FROM inspections_master WHERE id = ?", args: sanitizeArgs([id]) });
    if (res.rows.length > 0) {
        const type = String(res.rows[0].type);
        const tableName = getTableName(type);
        await turso.batch([
            { sql: `DELETE FROM ${tableName} WHERE id = ?`, args: sanitizeArgs([id]) },
            { sql: "DELETE FROM inspections_master WHERE id = ?", args: sanitizeArgs([id]) },
            { sql: "DELETE FROM qms_images WHERE parent_entity_id = ?", args: sanitizeArgs([id]) }
        ]);
    }
    return true;
};

export const getUsers = async (): Promise<User[]> => {
    const res = await turso.execute("SELECT * FROM users");
    return res.rows.map(r => ({ id: String(r.id), username: String(r.username), name: String(r.name), role: String(r.role), avatar: String(r.avatar), ...safeJsonParse(r.data, {}) }));
};

export const getUserByUsername = async (username: string): Promise<User | null> => {
    const res = await turso.execute({ sql: "SELECT * FROM users WHERE username = ?", args: sanitizeArgs([username.toLowerCase()]) });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return { id: String(r.id), username: String(r.username), name: String(r.name), role: String(r.role), avatar: String(r.avatar), ...safeJsonParse(r.data, {}) } as any;
};

export const saveUser = async (user: User) => {
    const { id, username, name, role, avatar, ...rest } = user;
    await turso.execute({ sql: "INSERT INTO users (id, username, name, role, avatar, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, data=excluded.data", args: sanitizeArgs([id, username, name, role, avatar, JSON.stringify(rest), Math.floor(Date.now()/1000)]) });
};

export const deleteUser = async (id: string) => { await turso.execute({ sql: "DELETE FROM users WHERE id = ?", args: sanitizeArgs([id]) }); };

export const importUsers = async (users: User[]) => {
    for (const user of users) { await saveUser(user); }
};

export const getWorkshops = async (): Promise<Workshop[]> => {
    const res = await turso.execute("SELECT * FROM workshops");
    return res.rows.map(r => {
        const jsonData = safeJsonParse(r.data, {} as any);
        return { id: String(r.id), code: String(r.code), name: String(r.name), ...jsonData };
    });
};

export const saveWorkshop = async (ws: Workshop) => {
    await turso.execute({ sql: "INSERT INTO workshops (id, code, name, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, name=excluded.name, code=excluded.code", args: sanitizeArgs([ws.id, ws.code, ws.name, JSON.stringify(ws), Math.floor(Date.now()/1000)]) });
};

export const deleteWorkshop = async (id: string) => { await turso.execute({ sql: "DELETE FROM workshops WHERE id = ?", args: sanitizeArgs([id]) }); };

export const getTemplates = async () => {
    const res = await turso.execute("SELECT * FROM templates");
    const dict: Record<string, CheckItem[]> = {};
    res.rows.forEach(r => { dict[String(r.moduleId)] = safeJsonParse(r.data, []); });
    return dict;
};

export const saveTemplate = async (moduleId: string, items: CheckItem[]) => {
    await turso.execute({ sql: "INSERT INTO templates (moduleId, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(moduleId) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at", args: sanitizeArgs([moduleId, JSON.stringify(items), Math.floor(Date.now()/1000)]) });
};

export const getNotifications = async (userId: string) => {
    const res = await turso.execute({ sql: "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", args: sanitizeArgs([userId]) });
    return res.rows.map(r => ({ id: String(r.id), userId: String(r.user_id), isRead: Boolean(r.is_read), createdAt: Number(r.created_at), ...safeJsonParse(r.data, {}) })) as Notification[];
};

export const markNotificationRead = async (id: string) => { await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE id = ?", args: sanitizeArgs([id]) }); };
export const markAllNotificationsRead = async (userId: string) => { await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE user_id = ?", args: sanitizeArgs([userId]) }); };

export const getRoles = async (): Promise<Role[]> => {
    const res = await turso.execute("SELECT * FROM roles");
    return res.rows.map(r => {
        const jsonData = safeJsonParse(r.data, {} as any);
        return { id: String(r.id), name: String(r.name), ...jsonData };
    });
};

export const saveRole = async (role: Role) => {
    await turso.execute({ sql: "INSERT INTO roles (id, name, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, name=excluded.name", args: sanitizeArgs([role.id, role.name, JSON.stringify(role), Math.floor(Date.now()/1000)]) });
};

export const deleteRole = async (id: string) => { await turso.execute({ sql: "DELETE FROM roles WHERE id = ?", args: sanitizeArgs([id]) }); };

export const saveNcrMapped = async (inspection_id: string, ncr: NCR, createdBy: string) => {
    const now = Math.floor(Date.now() / 1000);
    const ncrId = ncr.id || `NCR-${Date.now()}`;
    const { imagesBefore, imagesAfter, comments, ...rest } = ncr;
    await turso.execute({
        sql: `INSERT INTO ncrs (id, inspection_id, defect_code, severity, status, description, root_cause, corrective_action, preventive_action, responsible_person, deadline, images_before_json, images_after_json, comments_json, created_by, created_at, updated_at, item_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET severity=excluded.severity, status=excluded.status, description=excluded.description, root_cause=excluded.root_cause, corrective_action=excluded.corrective_action, preventive_action=excluded.preventive_action, responsible_person=excluded.responsible_person, deadline=excluded.deadline, images_before_json=excluded.images_before_json, images_after_json=excluded.images_after_json, comments_json=excluded.comments_json, updated_at=excluded.updated_at`,
        args: sanitizeArgs([ncrId, inspection_id, ncr.defect_code || null, ncr.severity || 'MINOR', ncr.status || 'OPEN', ncr.issueDescription, ncr.rootCause || null, ncr.solution || null, ncr.preventiveAction || null, ncr.responsiblePerson || null, ncr.deadline || null, JSON.stringify(imagesBefore || []), JSON.stringify(imagesAfter || []), JSON.stringify(comments || []), createdBy, ncr.createdDate ? Math.floor(new Date(ncr.createdDate).getTime() / 1000) : now, now, ncr.itemId || 'unknown'])
    });
    return ncrId;
};

export const getNcrs = async (filters: any = {}) => {
    let sql = "SELECT * FROM ncrs";
    const args: any[] = [];
    const where: string[] = [];
    if (filters.inspection_id) { where.push("inspection_id = ?"); args.push(filters.inspection_id); }
    if (filters.status && filters.status !== 'ALL') { where.push("status = ?"); args.push(filters.status); }
    if (where.length > 0) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY updated_at DESC";
    if (filters.page && filters.limit) { const offset = (filters.page - 1) * filters.limit; sql += ` LIMIT ${filters.limit} OFFSET ${offset}`; }
    const res = await turso.execute({ sql, args: sanitizeArgs(args) });
    const items = res.rows.map(r => ({ id: String(r.id), inspection_id: String(r.inspection_id), defect_code: String(r.defect_code || ''), severity: r.severity as any, status: String(r.status), issueDescription: String(r.description), rootCause: String(r.root_cause || ''), solution: String(r.corrective_action || ''), preventiveAction: String(r.preventive_action || ''), responsiblePerson: String(r.responsible_person || ''), deadline: String(r.deadline || ''), imagesBefore: safeJsonParse(r.images_before_json, []), imagesAfter: safeJsonParse(r.images_after_json, []), comments: safeJsonParse(r.comments_json, []), createdBy: String(r.created_by), createdDate: new Date(Number(r.created_at) * 1000).toISOString() }));
    return { items, total: items.length };
};

export const getNcrById = async (id: string): Promise<NCR | null> => {
    const res = await turso.execute({ sql: "SELECT * FROM ncrs WHERE id = ?", args: sanitizeArgs([id]) });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return { id: String(r.id), inspection_id: String(r.inspection_id), defect_code: String(r.defect_code || ''), severity: r.severity as any, status: String(r.status), issueDescription: String(r.description), rootCause: String(r.root_cause || ''), solution: String(r.corrective_action || ''), preventiveAction: String(r.preventive_action || ''), responsiblePerson: String(r.responsible_person || ''), deadline: String(r.deadline || ''), imagesBefore: safeJsonParse(r.images_before_json, []), imagesAfter: safeJsonParse(r.images_after_json, []), comments: safeJsonParse(r.comments_json, []), createdBy: String(r.created_by), createdDate: new Date(Number(r.created_at) * 1000).toISOString() } as NCR;
};

export const getDefectLibrary = async (): Promise<DefectLibraryItem[]> => {
    const res = await turso.execute("SELECT * FROM defect_library ORDER BY defect_code ASC");
    return res.rows.map(r => {
        const jsonData = safeJsonParse(r.data, {} as any);
        return { id: String(r.id), code: String(r.defect_code || r.id), name: String(r.name || ''), stage: String(r.stage || 'Chung'), category: String(r.category || 'Ngoại quan'), description: String(r.description || ''), severity: String(r.severity || 'MINOR'), suggestedAction: String(r.suggested_action || ''), ...jsonData };
    });
};

export const saveDefectLibraryItem = async (item: DefectLibraryItem) => {
    await turso.execute({
        sql: `INSERT INTO defect_library (id, defect_code, name, stage, category, description, severity, suggested_action, data, updated_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET defect_code=excluded.defect_code, name=excluded.name, data=excluded.data, updated_at=excluded.updated_at`,
        args: sanitizeArgs([item.id, item.code, item.name, item.stage, item.category, item.description, item.severity, item.suggestedAction, JSON.stringify(item), Math.floor(Date.now()/1000)])
    });
};

export const deleteDefectLibraryItem = async (id: string) => { await turso.execute({ sql: "DELETE FROM defect_library WHERE id = ?", args: sanitizeArgs([id]) }); };

export const getPlansPaginated = async (search: string, page: number, limit: number = 10) => {
    const offset = (page - 1) * limit;
    let sql = `SELECT * FROM plans`;
    const args: any[] = [];
    if (search) { 
        // ISO-MAPPING: Mở rộng tìm kiếm sang cả ma_nha_may và headcode để lookup chính xác
        sql += ` WHERE (ma_ct LIKE ? OR ten_ct LIKE ? OR ten_hang_muc LIKE ? OR ma_nha_may LIKE ? OR headcode LIKE ?)`; 
        const term = `%${search}%`;
        args.push(term, term, term, term, term); 
    }
    sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
    const res = await turso.execute({ sql, args: sanitizeArgs([...args, limit, offset]) });
    return { items: res.rows as any[], total: res.rows.length };
};

export const testConnection = async () => { try { await turso.execute("SELECT 1"); return true; } catch (e) { return false; } };
