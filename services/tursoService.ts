
import { turso, isTursoConfigured } from "./tursoConfig";
import { NCR, Inspection, PlanItem, User, Workshop, CheckItem, QMSImage, Project, Role, Defect, DefectLibraryItem, Notification, NCRComment, InspectionStatus, MaterialIQC, CheckStatus } from "../types";
import { withRetry } from "../lib/retry";

const cleanArgs = (args: any[]): any[] => {
  return args.map(arg => (arg === undefined ? null : arg));
};

const safeJsonParse = <T>(jsonString: any, defaultValue: T): T => {
  if (!jsonString || jsonString === "undefined" || jsonString === "null") return defaultValue;
  try {
    if (typeof jsonString === 'object') return jsonString as T;
    return JSON.parse(jsonString) as T;
  } catch (e) {
    console.error("ISO-INTERNAL: JSON Parse failed", e);
    return defaultValue;
  }
};

const MODULE_TABLES = ['iqc', 'pqc', 'sqc_mat', 'sqc_vt', 'sqc_btp', 'fsr', 'step', 'fqc', 'spr', 'site'];

const getTableName = (type: string = 'PQC'): string => {
    const t = type.toLowerCase();
    if (t === 'sqc_mat' || t === 'sqc_vt') return 'forms_sqc_vt';
    return MODULE_TABLES.includes(t) ? `forms_${t}` : `forms_pqc`;
};

async function ensureColumnExists(tableName: string, columnName: string, columnDef: string) {
    try {
        const res = await turso.execute(`PRAGMA table_info(${tableName})`);
        const columns = res.rows.map(r => String(r.name).toLowerCase());
        if (!columns.includes(columnName.toLowerCase())) {
            console.log(`[ISO-DB-AUTO-MIGRATION] Adding column '${columnName}' to '${tableName}'`);
            await turso.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
            return true;
        }
    } catch (e: any) {
        if (!e.message.includes("no such table")) {
            console.warn(`[ISO-DB-WARNING] Sync for ${tableName}.${columnName} failed:`, e.message);
        }
    }
    return false;
}

/**
 * ISO-MAINTENANCE: Phục hồi dữ liệu phẳng từ JSON
 * Tự động điền ID và các trường thông tin dự án từ cột data
 */
export async function repairProjectData() {
    try {
        const res = await turso.execute("SELECT * FROM projects");
        for (const row of res.rows) {
            const maCt = String(row.ma_ct || '');
            if (!maCt) continue;

            const jsonData = safeJsonParse<any>(row.data, {});
            
            // Map dữ liệu từ JSON sang các cột phẳng nếu cột phẳng đang trống
            const updates = {
                id: row.id || jsonData.id || `PROJ-${maCt}`,
                name: row.name || jsonData.name || jsonData.ten_ct || maCt,
                status: row.status || jsonData.status || 'Planning',
                pm: row.pm || jsonData.pm || 'Chưa phân công',
                pc: row.pc || jsonData.pc || 'Chưa phân công',
                qa: row.qa || jsonData.qa || 'Chưa phân công',
                progress: row.progress !== null ? row.progress : (jsonData.progress || 0),
                start_date: row.start_date || jsonData.startDate || '',
                end_date: row.end_date || jsonData.endDate || '',
                location: row.location || jsonData.location || '',
                description: row.description || jsonData.description || '',
                thumbnail: row.thumbnail || jsonData.thumbnail || ''
            };

            await turso.execute({
                sql: `UPDATE projects SET 
                        id = ?, name = ?, status = ?, pm = ?, pc = ?, qa = ?, 
                        progress = ?, start_date = ?, end_date = ?, 
                        location = ?, description = ?, thumbnail = ? 
                      WHERE ma_ct = ?`,
                args: [
                    updates.id, updates.name, updates.status, updates.pm, updates.pc, updates.qa,
                    updates.progress, updates.start_date, updates.end_date,
                    updates.location, updates.description, updates.thumbnail,
                    maCt
                ]
            });
        }
        console.log("✔ ISO-REPAIR: Project flat columns hydrated from JSON.");
    } catch (e) {
        console.error("[ISO-REPAIR] Project data recovery failed", e);
    }
}

export const initDatabase = async () => {
  if (!isTursoConfigured) return;
  try {
    await withRetry(() => turso.execute("SELECT 1"), { maxRetries: 5, initialDelay: 1000 });
    
    // 1. Khởi tạo/Cập nhật bảng PROJECTS với đầy đủ các cột phẳng theo yêu cầu
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        ma_ct TEXT PRIMARY KEY,
        id TEXT,
        name TEXT,
        status TEXT,
        pm TEXT,
        pc TEXT,
        qa TEXT,
        progress REAL DEFAULT 0,
        start_date TEXT,
        end_date TEXT,
        location TEXT,
        description TEXT,
        thumbnail TEXT,
        data TEXT,
        updated_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);
    
    // Đảm bảo các cột mới tồn tại trong các DB cũ (Auto-Migration)
    const projectColumns = [
        { n: 'id', d: 'TEXT' }, { n: 'name', d: 'TEXT' }, { n: 'status', d: 'TEXT' },
        { n: 'pm', d: 'TEXT' }, { n: 'pc', d: 'TEXT' }, { n: 'qa', d: 'TEXT' },
        { n: 'progress', d: 'REAL' }, { n: 'start_date', d: 'TEXT' }, { n: 'end_date', d: 'TEXT' },
        { n: 'location', d: 'TEXT' }, { n: 'description', d: 'TEXT' }, { n: 'thumbnail', d: 'TEXT' },
        { n: 'data', d: 'TEXT' }, { n: 'updated_at', d: 'INTEGER' }
    ];
    for (const col of projectColumns) {
        await ensureColumnExists('projects', col.n, col.d);
    }

    // Tự động phục hồi dữ liệu ngay sau khi cập nhật Schema
    await repairProjectData();

    // 2. Các bảng quản trị khác
    await turso.execute(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT, avatar TEXT, data TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS workshops (id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT, data TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS templates (moduleId TEXT PRIMARY KEY, data TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS inspections_master (id TEXT PRIMARY KEY, type TEXT NOT NULL, created_at TEXT, updated_at TEXT)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS qms_images (id TEXT PRIMARY KEY, parent_entity_id TEXT NOT NULL, related_item_id TEXT, entity_type TEXT NOT NULL, image_role TEXT NOT NULL, url_hd TEXT, url_thumbnail TEXT, created_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS ncrs (id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL, defect_code TEXT, severity TEXT DEFAULT 'MINOR', status TEXT DEFAULT 'OPEN', description TEXT NOT NULL, root_cause TEXT, corrective_action TEXT, preventive_action TEXT, responsible_person TEXT, deadline TEXT, images_before_json TEXT, images_after_json TEXT, created_by TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()), item_id TEXT NOT NULL DEFAULT 'unknown', comments_json TEXT DEFAULT '[]')`);
    
    // Fix: Added missing core tables initialization
    await turso.execute(`CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, headcode TEXT, ma_ct TEXT, ten_ct TEXT, ten_hang_muc TEXT, dvt TEXT, so_luong_ipo REAL, ma_nha_may TEXT, created_at INTEGER, assignee TEXT, status TEXT)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT, is_read INTEGER DEFAULT 0, created_at INTEGER, data TEXT)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT, data TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS defect_library (id TEXT PRIMARY KEY, defect_code TEXT, name TEXT, stage TEXT, category TEXT, description TEXT, severity TEXT, suggested_action TEXT, created_by TEXT, created_at INTEGER, updated_at INTEGER, data TEXT)`);

    // 3. Khởi tạo các bảng form kiểm tra
    for (const moduleCode of MODULE_TABLES) {
        const tableName = (moduleCode === 'sqc_vt' || moduleCode === 'sqc_mat') ? 'forms_sqc_vt' : `forms_${moduleCode}`;
        await turso.execute(`CREATE TABLE IF NOT EXISTS ${tableName} (id TEXT PRIMARY KEY, created_at TEXT, updated_at TEXT)`);
        const commonCols = [
            { name: 'type', def: 'TEXT' }, { name: 'ma_ct', def: 'TEXT' }, { name: 'ten_ct', def: 'TEXT' },
            { name: 'ten_hang_muc', def: 'TEXT' }, { name: 'inspector', def: 'TEXT' }, { name: 'status', def: 'TEXT' },
            { name: 'date', def: 'TEXT' }, { name: 'score', def: 'INTEGER DEFAULT 0' }, { name: 'summary', def: 'TEXT' },
            { name: 'items_json', def: 'TEXT' }, { name: 'signature_qc', def: 'TEXT' }
        ];
        for (const col of commonCols) await ensureColumnExists(tableName, col.name, col.def);
    }

    console.log("✔ ISO-DB: Database architecture verified and synchronized.");
  } catch (e: any) {
    console.error("❌ ISO-DB: Init failure:", e.message);
  }
};

/**
 * ISO-AUTHORITATIVE: Đồng bộ dự án
 * Nguyên tắc: Ưu tiên load bảng projects, sau đó mới bù đắp mã còn thiếu từ plans
 */
export const syncProjectsWithPlans = async () => {
    try {
        // 1. Lấy tất cả ma_ct duy nhất từ bảng plans
        const planRes = await turso.execute(`
            SELECT DISTINCT ma_ct, ten_ct 
            FROM plans 
            WHERE ma_ct IS NOT NULL AND ma_ct != ''
        `);
        
        if (planRes.rows.length === 0) return false;

        // 2. Lấy các ma_ct đã có trong projects
        const projRes = await turso.execute(`SELECT ma_ct FROM projects`);
        const existingCodes = new Set(projRes.rows.map(r => String(r.ma_ct).toUpperCase()));

        // 3. Chỉ thêm những mã còn thiếu
        for (const row of planRes.rows) {
            const maCt = String(row.ma_ct);
            if (!existingCodes.has(maCt.toUpperCase())) {
                const id = `PROJ-${maCt}`;
                const name = String(row.ten_ct || maCt);
                const now = Math.floor(Date.now()/1000);
                
                const initialProject: Project = {
                    id,
                    code: maCt,
                    ma_ct: maCt,
                    name: name,
                    ten_ct: name,
                    status: 'Planning',
                    startDate: new Date().toISOString().split('T')[0],
                    endDate: '',
                    progress: 0,
                    pm: 'Chưa phân công',
                    qa: 'Chưa phân công',
                    pc: 'Chưa phân công',
                    description: 'Tự động tạo từ Kế hoạch.'
                };

                await turso.execute({
                    sql: `INSERT INTO projects (
                            ma_ct, id, name, status, pm, pc, qa, progress, 
                            start_date, data, updated_at
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        maCt, id, name, 'Planning', 'Chưa phân công', 'Chưa phân công', 'Chưa phân công', 0,
                        initialProject.startDate, JSON.stringify(initialProject), now
                    ]
                });
            }
        }
        return true;
    } catch (e) {
        console.error("ISO-SYNC: Project synchronization failed", e);
        return false;
    }
};

export const getProjects = async (): Promise<Project[]> => {
    // Luôn ưu tiên dữ liệu từ bảng projects
    const res = await turso.execute("SELECT * FROM projects ORDER BY ma_ct ASC");
    return res.rows.map(r => {
        // Ưu tiên các cột phẳng, nếu NULL thì fallback sang JSON data
        const jsonData = safeJsonParse<any>(r.data, {});
        return {
            ma_ct: String(r.ma_ct),
            id: String(r.id || jsonData.id || `PROJ-${r.ma_ct}`),
            name: String(r.name || jsonData.name || r.ma_ct),
            status: (r.status || jsonData.status || 'Planning') as any,
            pm: String(r.pm || jsonData.pm || 'Chưa phân công'),
            pc: String(r.pc || jsonData.pc || 'Chưa phân công'),
            qa: String(r.qa || jsonData.qa || 'Chưa phân công'),
            progress: Number(r.progress !== null ? r.progress : (jsonData.progress || 0)),
            startDate: String(r.start_date || jsonData.startDate || ''),
            endDate: String(r.end_date || jsonData.endDate || ''),
            location: String(r.location || jsonData.location || ''),
            description: String(r.description || jsonData.description || ''),
            thumbnail: String(r.thumbnail || jsonData.thumbnail || '')
        } as Project;
    });
};

export const getProjectByCode = async (code: string): Promise<Project | null> => {
    const res = await turso.execute({ sql: "SELECT * FROM projects WHERE ma_ct = ?", args: [code] });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    const jsonData = safeJsonParse<any>(r.data, {});
    return {
        ma_ct: String(r.ma_ct),
        id: String(r.id || jsonData.id || `PROJ-${r.ma_ct}`),
        name: String(r.name || jsonData.name || r.ma_ct),
        status: (r.status || jsonData.status || 'Planning') as any,
        pm: String(r.pm || jsonData.pm || 'Chưa phân công'),
        pc: String(r.pc || jsonData.pc || 'Chưa phân công'),
        qa: String(r.qa || jsonData.qa || 'Chưa phân công'),
        progress: Number(r.progress !== null ? r.progress : (jsonData.progress || 0)),
        startDate: String(r.start_date || jsonData.startDate || ''),
        endDate: String(r.end_date || jsonData.endDate || ''),
        location: String(r.location || jsonData.location || ''),
        description: String(r.description || jsonData.description || ''),
        thumbnail: String(r.thumbnail || jsonData.thumbnail || '')
    } as Project;
};

/**
 * ISO-AUTHORITATIVE: Lưu thông tin dự án vào cả cột phẳng và JSON
 */
export const updateProject = async (proj: Project) => {
    const id = proj.id || `PROJ-${proj.ma_ct}`;
    const now = Math.floor(Date.now()/1000);
    await turso.execute({
        sql: `INSERT INTO projects (
                ma_ct, id, name, status, pm, pc, qa, progress, 
                start_date, end_date, location, description, thumbnail, 
                data, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
              ON CONFLICT(ma_ct) DO UPDATE SET 
                id=excluded.id,
                name=excluded.name, 
                status=excluded.status,
                pm=excluded.pm,
                pc=excluded.pc,
                qa=excluded.qa,
                progress=excluded.progress,
                start_date=excluded.start_date,
                end_date=excluded.end_date,
                location=excluded.location,
                description=excluded.description,
                thumbnail=excluded.thumbnail,
                data=excluded.data, 
                updated_at=excluded.updated_at`,
        args: [
            proj.ma_ct, id, proj.name, proj.status, proj.pm, proj.pc, proj.qa, proj.progress,
            proj.startDate, proj.endDate, proj.location, proj.description, proj.thumbnail,
            JSON.stringify(proj), now
        ]
    });
};

export const getInspectionsList = async (filters: any = {}) => {
    const unionParts = MODULE_TABLES.map(t => {
        const tableName = (t === 'sqc_vt' || t === 'sqc_mat') ? 'forms_sqc_vt' : `forms_${t}`;
        const titleExpr = t === 'iqc' || t === 'sqc_vt' || t === 'sqc_mat' ? "COALESCE(ten_hang_muc, 'PO: ' || COALESCE(po_number, 'N/A'))" : "ten_hang_muc";
        return `SELECT id, type, ma_ct, ten_ct, ${titleExpr} AS ten_hang_muc, inspector, status, date, updated_at FROM ${tableName}`;
    });
    const sql = `SELECT DISTINCT * FROM (${unionParts.join(' UNION ALL ')}) ORDER BY updated_at DESC`;
    const res = await turso.execute(sql);
    return { items: res.rows.map(r => ({ id: String(r.id), type: String(r.type || 'PQC'), ma_ct: String(r.ma_ct || ''), ten_ct: String(r.ten_ct || ''), ten_hang_muc: String(r.ten_hang_muc || ''), inspectorName: String(r.inspector || ''), status: r.status as any, date: String(r.date || ''), updatedAt: String(r.updated_at || '') })), total: res.rows.length };
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
    const imagesRes = await turso.execute({ sql: "SELECT id, related_item_id, image_role, url_hd FROM qms_images WHERE parent_entity_id = ?", args: [id] });
    const allImages = imagesRes.rows;
    const mainImages = allImages.filter(img => img.image_role === 'EVIDENCE' && !img.related_item_id).map(img => String(img.url_hd));
    const items = safeJsonParse(r.items_json, []);
    const itemsWithImages = items.map((item: any) => ({ ...item, images: allImages.filter(img => img.related_item_id === item.id).map(img => String(img.url_hd)) }));
    const base: any = { id: String(r.id), type: String(r.type || type), ma_ct: String(r.ma_ct || ''), ten_ct: String(r.ten_ct || ''), ten_hang_muc: String(r.ten_hang_muc || ''), inspectorName: String(r.inspector || ''), status: r.status as any, date: String(r.date || ''), score: Number((r as any).score || 0), summary: String(r.summary || ''), items: itemsWithImages, images: mainImages, signature: String(r.signature_qc || ''), createdAt: String(r.created_at || ''), updatedAt: String(r.updated_at || '') };
    return base as Inspection;
  } catch (e) { console.error("ISO-DB: Get Detail failed", e); return null; }
};

export const saveInspection = async (inspection: Inspection) => {
  const now = new Date().toISOString();
  const inspectionId = inspection.id;
  const type = inspection.type || 'PQC';
  const tableName = getTableName(type);
  await turso.execute({ sql: `INSERT INTO inspections_master (id, type, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`, args: [inspectionId, type, inspection.createdAt || now, now] });
  await turso.execute({ sql: "DELETE FROM qms_images WHERE parent_entity_id = ?", args: [inspectionId] });
  const sanitizedItems = (inspection.items || []).map(i => ({ ...i, images: [], ncr: undefined }));
  await turso.execute({ sql: `INSERT INTO ${tableName} (id, type, ma_ct, ten_ct, ten_hang_muc, inspector, status, date, items_json, created_at, updated_at, signature_qc) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at, items_json=excluded.items_json, inspector=excluded.inspector`, args: cleanArgs([inspectionId, type, inspection.ma_ct, inspection.ten_ct, inspection.ten_hang_muc, inspection.inspectorName, inspection.status, inspection.date, JSON.stringify(sanitizedItems), inspection.createdAt || now, now, inspection.signature]) });
};

export const deleteInspection = async (id: string) => {
    await turso.execute({ sql: "DELETE FROM inspections_master WHERE id = ?", args: [id] });
    for (const moduleCode of MODULE_TABLES) {
        const tableName = (moduleCode === 'sqc_vt' || moduleCode === 'sqc_mat') ? 'forms_sqc_vt' : `forms_${moduleCode}`;
        await turso.execute({ sql: `DELETE FROM ${tableName} WHERE id = ?`, args: [id] });
    }
    await turso.execute({ sql: "DELETE FROM qms_images WHERE parent_entity_id = ?", args: [id] });
    await turso.execute({ sql: "DELETE FROM ncrs WHERE inspection_id = ?", args: [id] });
};

export const saveNcrMapped = async (inspection_id: string, ncr: NCR, createdBy: string) => {
    const id = ncr.id || `NCR-${Date.now()}`;
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO ncrs (id, inspection_id, defect_code, severity, status, description, root_cause, corrective_action, preventive_action, responsible_person, deadline, images_before_json, images_after_json, created_by, created_at, updated_at, item_id, comments_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET 
                status=excluded.status, 
                description=excluded.description, 
                root_cause=excluded.root_cause, 
                corrective_action=excluded.corrective_action, 
                preventive_action=excluded.preventive_action, 
                responsible_person=excluded.responsible_person, 
                deadline=excluded.deadline, 
                images_before_json=excluded.images_before_json, 
                images_after_json=excluded.images_after_json, 
                updated_at=excluded.updated_at,
                comments_json=excluded.comments_json`,
        args: cleanArgs([
            id, inspection_id, ncr.defect_code, ncr.severity, ncr.status, ncr.issueDescription, ncr.rootCause, ncr.solution, ncr.preventiveAction, ncr.responsiblePerson, ncr.deadline, 
            JSON.stringify(ncr.imagesBefore || []), 
            JSON.stringify(ncr.imagesAfter || []), 
            createdBy, now, now, ncr.itemId || 'unknown', 
            JSON.stringify(ncr.comments || [])
        ])
    });
    return id;
};

export const getNcrs = async (filters: any = {}) => {
    let sql = `SELECT * FROM ncrs`;
    const where: string[] = [];
    const args: any[] = [];
    if (filters.inspection_id) { where.push("inspection_id = ?"); args.push(filters.inspection_id); }
    if (filters.status && filters.status !== 'ALL') { where.push("status = ?"); args.push(filters.status); }
    if (where.length > 0) sql += ` WHERE ${where.join(" AND ")}`;
    sql += ` ORDER BY updated_at DESC`;
    const res = await turso.execute({ sql, args });
    return {
        items: res.rows.map(r => ({
            id: String(r.id),
            inspection_id: String(r.inspection_id),
            defect_code: String(r.defect_code || ''),
            severity: r.severity as any,
            status: String(r.status),
            issueDescription: String(r.description),
            rootCause: String(r.root_cause || ''),
            solution: String(r.corrective_action || ''),
            preventiveAction: String(r.preventive_action || ''),
            responsiblePerson: String(r.responsible_person || ''),
            deadline: String(r.deadline || ''),
            createdDate: new Date(Number(r.created_at) * 1000).toISOString(),
            image_refs_before: [], 
            image_refs_after: [],
            imagesBefore: safeJsonParse(r.images_before_json, []),
            imagesAfter: safeJsonParse(r.images_after_json, []),
            createdBy: String(r.created_by),
            itemId: String(r.item_id),
            comments: safeJsonParse(r.comments_json, [])
        } as NCR)),
        total: res.rows.length
    };
};

export const getNcrById = async (id: string): Promise<NCR | null> => {
    const res = await turso.execute({ sql: "SELECT * FROM ncrs WHERE id = ?", args: [id] });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
        id: String(r.id),
        inspection_id: String(r.inspection_id),
        defect_code: String(r.defect_code || ''),
        severity: r.severity as any,
        status: String(r.status),
        issueDescription: String(r.description),
        rootCause: String(r.root_cause || ''),
        solution: String(r.corrective_action || ''),
        preventiveAction: String(r.preventive_action || ''),
        responsiblePerson: String(r.responsible_person || ''),
        deadline: String(r.deadline || ''),
        createdDate: new Date(Number(r.created_at) * 1000).toISOString(),
        image_refs_before: [], 
        image_refs_after: [],
        imagesBefore: safeJsonParse(r.images_before_json, []),
        imagesAfter: safeJsonParse(r.images_after_json, []),
        createdBy: String(r.created_by),
        itemId: String(r.item_id),
        comments: safeJsonParse(r.comments_json, [])
    } as NCR;
};

export const getUsers = async (): Promise<User[]> => {
    const res = await turso.execute("SELECT id, username, name, role, avatar, data FROM users");
    return res.rows.map(r => {
        const extra = safeJsonParse(r.data, {});
        return { id: String(r.id), username: String(r.username), name: String(r.name), role: String(r.role), avatar: String(r.avatar), ...extra };
    });
};

export const getUserByUsername = async (username: string): Promise<User | null> => {
    const res = await turso.execute({ 
        sql: "SELECT id, username, name, role, avatar, data FROM users WHERE username = ?", 
        args: [username.toLowerCase().trim()] 
    });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    const extra = safeJsonParse(r.data, {});
    return { id: String(r.id), username: String(r.username), name: String(r.name), role: String(r.role), avatar: String(r.avatar), ...extra } as User;
};

export const saveUser = async (user: User) => {
    const { id, username, name, role, avatar, ...rest } = user;
    await turso.execute({
        sql: "INSERT INTO users (id, username, name, role, avatar, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET username=excluded.username, name=excluded.name, role=excluded.role, avatar=excluded.avatar, data=excluded.data, updated_at=excluded.updated_at",
        args: [id, username, name, role, avatar, JSON.stringify(rest), Math.floor(Date.now() / 1000)]
    });
};

/**
 * Fix: Added deleteUser
 */
export const deleteUser = async (id: string) => {
    await turso.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
};

/**
 * Fix: Added importUsers
 */
export const importUsers = async (users: User[]) => {
    for (const user of users) {
        await saveUser(user);
    }
};

export const getWorkshops = async (): Promise<Workshop[]> => {
    const res = await turso.execute("SELECT data FROM workshops");
    return res.rows.map(r => safeJsonParse(r.data, {} as any));
};

export const saveWorkshop = async (ws: Workshop) => {
    await turso.execute({
        sql: "INSERT INTO workshops (id, code, name, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code=excluded.code, name=excluded.name, data=excluded.data, updated_at=excluded.updated_at",
        args: [ws.id, ws.code, ws.name, JSON.stringify(ws), Math.floor(Date.now() / 1000)]
    });
};

/**
 * Fix: Added deleteWorkshop
 */
export const deleteWorkshop = async (id: string) => {
    await turso.execute({ sql: "DELETE FROM workshops WHERE id = ?", args: [id] });
};

export const getTemplates = async () => {
    const res = await turso.execute("SELECT moduleId, data FROM templates");
    const templates: Record<string, CheckItem[]> = {};
    res.rows.forEach(r => { templates[String(r.moduleId)] = safeJsonParse(r.data, []); });
    return templates;
};

export const saveTemplate = async (moduleId: string, items: CheckItem[]) => {
    await turso.execute({
        sql: "INSERT INTO templates (moduleId, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(moduleId) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
        args: [moduleId, JSON.stringify(items), Math.floor(Date.now() / 1000)]
    });
};

export const getNotifications = async (userId: string) => {
    const res = await turso.execute({ sql: "SELECT id, data, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", args: [userId] });
    return res.rows.map(r => ({ ...safeJsonParse(r.data, {} as any), id: String(r.id), isRead: Boolean(r.is_read), createdAt: Number(r.created_at) }));
};

/**
 * Fix: Added markNotificationRead
 */
export const markNotificationRead = async (id: string) => {
    await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE id = ?", args: [id] });
};

/**
 * Fix: Added markAllNotificationsRead
 */
export const markAllNotificationsRead = async (userId: string) => {
    await turso.execute({ sql: "UPDATE notifications SET is_read = 1 WHERE user_id = ?", args: [userId] });
};

export const getRoles = async (): Promise<Role[]> => {
    const res = await turso.execute("SELECT data FROM roles");
    return res.rows.map(r => safeJsonParse(r.data, {} as any));
};

export const saveRole = async (role: Role) => {
    await turso.execute({
        sql: "INSERT INTO roles (id, name, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, data=excluded.data, updated_at=excluded.updated_at",
        args: [role.id, role.name, JSON.stringify(role), Math.floor(Date.now() / 1000)]
    });
};

/**
 * Fix: Added deleteRole
 */
export const deleteRole = async (id: string) => {
    await turso.execute({ sql: "DELETE FROM roles WHERE id = ?", args: [id] });
};

export const getDefectLibrary = async (): Promise<DefectLibraryItem[]> => {
    const res = await turso.execute("SELECT data FROM defect_library ORDER BY defect_code ASC");
    return res.rows.map(r => safeJsonParse(r.data, {} as any));
};

export const saveDefectLibraryItem = async (item: DefectLibraryItem) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO defect_library (id, defect_code, name, stage, category, description, severity, suggested_action, created_by, created_at, updated_at, data) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET 
                defect_code=excluded.defect_code, 
                name=excluded.name, 
                stage=excluded.stage, 
                category=excluded.category, 
                description=excluded.description, 
                severity=excluded.severity, 
                suggested_action=excluded.suggested_action, 
                updated_at=excluded.updated_at, 
                data=excluded.data`,
        args: cleanArgs([item.id, item.code, item.name, item.stage, item.category, item.description, item.severity, item.suggestedAction, item.createdBy, item.createdAt || now, now, JSON.stringify(item)])
    });
};

/**
 * Fix: Added deleteDefectLibraryItem
 */
export const deleteDefectLibraryItem = async (id: string) => {
    await turso.execute({ sql: "DELETE FROM defect_library WHERE id = ?", args: [id] });
};

export const getPlansPaginated = async (search: string, page: number, limit: number) => {
    const offset = (page - 1) * limit;
    let sql = `SELECT * FROM plans`;
    const args: any[] = [];
    if (search) {
        sql += ` WHERE ma_ct LIKE ? OR ten_ct LIKE ? OR ten_hang_muc LIKE ?`;
        args.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
    const res = await turso.execute({ sql, args: [...args, limit, offset] });
    return { items: res.rows as any[], total: res.rows.length };
};

export const testConnection = async () => { try { await turso.execute("SELECT 1"); return true; } catch (e) { return false; } };
