import { turso, isTursoConfigured } from "./tursoConfig";
import { NCR, Inspection, PlanItem, User, Workshop, CheckItem, Project, Role, Defect, DefectLibraryItem, NCRComment } from "../types";

/**
 * Initialize all database tables and perform migrations.
 */
export const initDatabase = async () => {
  if (!isTursoConfigured) {
    console.warn("⚠️ Turso is not configured. Database will not be initialized.");
    return;
  }

  try {
    await turso.execute("SELECT 1");
    
    // 1. Plans Table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stt INTEGER,
        ma_nha_may TEXT,
        headcode TEXT,
        ma_ct TEXT,
        ten_ct TEXT,
        ten_hang_muc TEXT,
        dvt TEXT,
        so_luong_ipo INTEGER,
        plannedDate TEXT,
        assignee TEXT,
        status TEXT,
        pthsp TEXT,
        created_at INTEGER
      )`);

    // 2. Inspections Table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS inspections (
        id TEXT PRIMARY KEY,
        data TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        created_by TEXT,
        ma_ct TEXT,
        ten_ct TEXT,
        ma_nha_may TEXT,
        ten_hang_muc TEXT,
        workshop TEXT,
        status TEXT,
        type TEXT,
        score INTEGER
      )`);

    // 3. Projects Metadata Table - Stores detailed project info
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        ma_ct TEXT PRIMARY KEY,
        data TEXT,
        updated_at INTEGER
      )`);

    // 4. Các bảng hệ thống khác
    await turso.execute(`CREATE TABLE IF NOT EXISTS defect_library (id TEXT PRIMARY KEY, defect_code TEXT UNIQUE, name TEXT, stage TEXT, category TEXT, description TEXT, severity TEXT, suggested_action TEXT, correct_image TEXT, incorrect_image TEXT, created_by TEXT, created_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS ncrs (id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL, item_id TEXT NOT NULL, defect_code TEXT, severity TEXT, status TEXT, description TEXT, root_cause TEXT, corrective_action TEXT, preventive_action TEXT, responsible_person TEXT, deadline TEXT, images_before_json TEXT, images_after_json TEXT, comments_json TEXT, created_by TEXT, created_at INTEGER, updated_at INTEGER, closed_at INTEGER, deleted_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT, username TEXT UNIQUE, role TEXT, created_at INTEGER, updated_at INTEGER)`);
    
    // Migrations
    try {
        const tableInfo = await turso.execute("PRAGMA table_info(users)");
        const columns = tableInfo.rows.map(row => String(row.name).toLowerCase());
        const missing = [{ name: 'username', type: 'TEXT' }, { name: 'role', type: 'TEXT' }, { name: 'created_at', type: 'INTEGER' }, { name: 'updated_at', type: 'INTEGER' }];
        for (const col of missing) { if (!columns.includes(col.name)) await turso.execute(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`); }
    } catch (e) {}

    await turso.execute(`CREATE TABLE IF NOT EXISTS workshops (id TEXT PRIMARY KEY, data TEXT, code TEXT UNIQUE, name TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS templates (moduleId TEXT PRIMARY KEY, data TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, data TEXT, created_at INTEGER, updated_at INTEGER)`);

    console.log("✅ QMS Database initialized and verified.");
  } catch (e) {
    console.error("❌ Turso initialization error:", e);
    throw e; 
  }
};

export const testConnection = async () => {
  try {
    await turso.execute("SELECT 1");
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Lấy danh sách dự án (Master Plan):
 * Kết hợp danh sách mã công trình từ Kế hoạch + Phiếu kiểm tra với Metadata chi tiết.
 */
export const getProjects = async (): Promise<Project[]> => {
    if (!isTursoConfigured) return [];
    
    try {
        // 1. Lấy danh sách các mã công trình duy nhất từ Plans và Inspections
        const derivedRes = await turso.execute(`
            SELECT ma_ct, MAX(ten_ct) as ten_ct 
            FROM (
                SELECT ma_ct, ten_ct FROM plans WHERE ma_ct IS NOT NULL AND ma_ct != ''
                UNION ALL
                SELECT ma_ct, ten_ct FROM inspections WHERE ma_ct IS NOT NULL AND ma_ct != ''
            ) 
            GROUP BY ma_ct
        `);
        
        // 2. Lấy dữ liệu Metadata đã lưu
        const metaRes = await turso.execute("SELECT ma_ct, data FROM projects");
        const metaMap: Record<string, Project> = {};
        metaRes.rows.forEach(row => {
            try {
                if (row.data) metaMap[row.ma_ct as string] = JSON.parse(row.data as string);
            } catch(e) {}
        });
        
        // 3. Trộn dữ liệu: Ưu tiên metadata nếu có, nếu không tạo Project mặc định từ Mã/Tên công trình
        return derivedRes.rows.map(row => {
            const ma_ct = String(row.ma_ct);
            const ten_ct = String(row.ten_ct || ma_ct);
            
            if (metaMap[ma_ct]) {
                return { ...metaMap[ma_ct], ma_ct }; 
            }
            
            return {
                id: `proj_${ma_ct}`,
                code: ma_ct,
                ma_ct: ma_ct,
                name: ten_ct,
                ten_ct: ten_ct,
                status: 'Planning',
                pm: 'Chưa phân công',
                pc: '---',
                qa: '---',
                location: '',
                startDate: new Date().toISOString().split('T')[0],
                endDate: '',
                thumbnail: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=400',
                progress: 0,
                description: '',
                images: []
            } as Project;
        });
    } catch (err) {
        console.error("getProjects error:", err);
        return [];
    }
};

export const getProjectByCode = async (maCt: string): Promise<Project | null> => {
    if (!isTursoConfigured) return null;
    // Tìm trong metadata trước
    const res = await turso.execute({ sql: "SELECT data FROM projects WHERE ma_ct = ?", args: [maCt] });
    if (res.rows.length > 0) return JSON.parse(res.rows[0].data as string);
    
    // Nếu không có metadata, lấy thông tin thô từ plans/inspections
    const rawRes = await turso.execute({ 
        sql: "SELECT ma_ct, MAX(ten_ct) as ten_ct FROM (SELECT ma_ct, ten_ct FROM plans WHERE ma_ct = ? UNION ALL SELECT ma_ct, ten_ct FROM inspections WHERE ma_ct = ?) GROUP BY ma_ct", 
        args: [maCt, maCt] 
    });
    
    if (rawRes.rows.length > 0) {
        const row = rawRes.rows[0];
        return {
            id: `proj_${maCt}`,
            code: maCt,
            ma_ct: maCt,
            name: String(row.ten_ct || maCt),
            ten_ct: String(row.ten_ct || maCt),
            status: 'Planning',
            pm: 'Chưa phân công',
            progress: 0,
            thumbnail: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=400',
            startDate: '',
            endDate: '',
            images: []
        } as Project;
    }
    return null;
};

export const saveProjectMetadata = async (project: Project) => {
  if (!isTursoConfigured) return;
  const now = Math.floor(Date.now() / 1000);
  await turso.execute({
    sql: `INSERT INTO projects (ma_ct, data, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(ma_ct) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: [project.ma_ct, JSON.stringify(project), now]
  });
};

export const deleteProjectMetadata = async (ma_ct: string) => {
    if (!isTursoConfigured) return;
    await turso.execute({ sql: "DELETE FROM projects WHERE ma_ct = ?", args: [ma_ct] });
};

// --- Inspection Services ---

export const saveInspection = async (inspection: Inspection) => {
    if (!isTursoConfigured) return;
    const now = Math.floor(Date.now() / 1000);
    const inspectionData = JSON.parse(JSON.stringify(inspection));
    const ncrPromises: Promise<any>[] = [];

    if (inspectionData.items) {
        for (const item of inspectionData.items) {
            if (item.ncr) {
                const ncr = item.ncr;
                ncr.inspection_id = inspectionData.id;
                ncr.itemId = item.id;
                ncrPromises.push(saveNcrMapped(inspectionData.id, ncr, inspectionData.inspectorName));
                delete item.ncr;
            }
        }
    }
    await Promise.all(ncrPromises);

    await turso.execute({
        sql: `INSERT INTO inspections (id, data, created_at, updated_at, created_by, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, workshop, status, type, score)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, status = excluded.status, score = excluded.score`,
        args: [inspectionData.id, JSON.stringify(inspectionData), now, now, inspection.inspectorName, inspection.ma_ct, inspection.ten_ct, inspection.ma_nha_may, inspection.ten_hang_muc, inspection.workshop, inspection.status, inspection.type, inspection.score]
    });
};

export const getInspectionsPaginated = async (params: { page?: number, limit?: number, search?: string, status?: string, type?: string }) => {
    if (!isTursoConfigured) return { items: [], total: 0 };
    const { page = 1, limit = 50, search = '', status = '', type = '' } = params;
    const offset = (page - 1) * limit;
    let sql = `SELECT id, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, workshop, created_by as inspectorName, strftime('%Y-%m-%d', datetime(created_at, 'unixepoch')) as date, status, type, score FROM inspections WHERE 1=1`;
    let args: any[] = [];
    if (search) {
        sql += " AND (ma_ct LIKE ? OR ma_nha_may LIKE ? OR ten_ct LIKE ? OR ten_hang_muc LIKE ?)";
        const term = `%${search}%`; args.push(term, term, term, term);
    }
    if (status && status !== 'ALL') { sql += " AND status = ?"; args.push(status); }
    if (type && type !== 'ALL') { sql += " AND type = ?"; args.push(type); }
    const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    const [dataRes, countRes] = await Promise.all([turso.execute({ sql, args: [...args, limit, offset] }), turso.execute({ sql: countSql, args })]);
    return { items: dataRes.rows as unknown as Inspection[], total: Number(countRes.rows[0]?.total || 0) };
};

export const getInspectionById = async (id: string): Promise<Inspection | null> => {
    if (!isTursoConfigured) return null;
    const res = await turso.execute({ sql: "SELECT data FROM inspections WHERE id = ?", args: [id] });
    if (res.rows.length === 0) return null;
    const inspection: Inspection = JSON.parse(res.rows[0].data as string);
    const ncrRes = await turso.execute({ sql: "SELECT * FROM ncrs WHERE inspection_id = ? AND deleted_at IS NULL", args: [id] });
    if (ncrRes.rows.length > 0) {
        const ncrsByItem: Record<string, NCR> = {};
        ncrRes.rows.forEach(row => {
            const itemId = row.item_id as string;
            ncrsByItem[itemId] = { id: row.id as string, inspection_id: row.inspection_id as string, itemId: row.item_id as string, createdDate: new Date((row.created_at as number) * 1000).toISOString().split('T')[0], issueDescription: row.description as string, rootCause: (row.root_cause as string) || '', solution: (row.corrective_action as string) || '', responsiblePerson: (row.responsible_person as string) || '', deadline: (row.deadline as string) || '', status: row.status as string, severity: row.severity as any, imagesBefore: JSON.parse((row.images_before_json as string) || '[]'), imagesAfter: JSON.parse((row.images_after_json as string) || '[]'), comments: JSON.parse((row.comments_json as string) || '[]') };
        });
        if (inspection.items) inspection.items = inspection.items.map(item => ncrsByItem[item.id] ? { ...item, ncr: ncrsByItem[item.id] } : item);
    }
    return inspection;
};

// --- Shared Helper Services ---

export const getRoles = async (): Promise<Role[]> => { if (!isTursoConfigured) return []; const res = await turso.execute("SELECT data FROM roles"); return res.rows.map(r => JSON.parse(r.data as string)); };
export const saveRole = async (role: Role) => { if (!isTursoConfigured) return; const now = Math.floor(Date.now() / 1000); await turso.execute({ sql: `INSERT INTO roles (id, data, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, args: [role.id, JSON.stringify(role), now, now] }); };
export const deleteRole = async (id: string) => { if (!isTursoConfigured) return; await turso.execute({ sql: "DELETE FROM roles WHERE id = ?", args: [id] }); };
export const getPlans = async (params: { search?: string, page?: number, limit?: number }) => { if (!isTursoConfigured) return { items: [], total: 0 }; const { search = '', page = 1, limit = 100 } = params; const offset = (page - 1) * limit; let sql = "SELECT * FROM plans"; let args: any[] = []; if (search) { sql += " WHERE ma_ct LIKE ? OR ma_nha_may LIKE ? OR headcode LIKE ? OR ten_hang_muc LIKE ?"; const term = `%${search}%`; args = [term, term, term, term]; } const countSql = `SELECT COUNT(*) as total FROM (${sql})`; sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"; const [dataRes, countRes] = await Promise.all([turso.execute({ sql, args: [...args, limit, offset] }), turso.execute({ sql: countSql, args })]); return { items: dataRes.rows as unknown as PlanItem[], total: Number(countRes.rows[0]?.total || 0) }; };
export const importPlansBatch = async (plans: PlanItem[]) => { if (!isTursoConfigured) return; for (const p of plans) { await turso.execute({ sql: `INSERT INTO plans (stt, ma_nha_may, headcode, ma_ct, ten_ct, ten_hang_muc, dvt, so_luong_ipo, plannedDate, assignee, status, pthsp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [p.stt, p.ma_nha_may, p.headcode, p.ma_ct, p.ten_ct, p.ten_hang_muc, p.dvt, p.so_luong_ipo, p.plannedDate, p.assignee, p.status, p.pthsp, Math.floor(Date.now()/1000)] }); } };
export const deleteInspection = async (id: string) => { if (!isTursoConfigured) return; await turso.execute({ sql: "DELETE FROM inspections WHERE id = ?", args: [id] }); };
export const getUsers = async (): Promise<User[]> => { if (!isTursoConfigured) return []; const res = await turso.execute("SELECT data FROM users"); return res.rows.map(r => JSON.parse(r.data as string)); };
export const saveUser = async (user: User) => { if (!isTursoConfigured) return; const now = Math.floor(Date.now() / 1000); await turso.execute({ sql: `INSERT INTO users (id, data, username, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, username = excluded.username, role = excluded.role, updated_at = excluded.updated_at`, args: [user.id, JSON.stringify(user), user.username, user.role, now, now] }); };
export const deleteUser = async (id: string) => { if (!isTursoConfigured) return; await turso.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] }); };
export const getWorkshops = async (): Promise<Workshop[]> => { if (!isTursoConfigured) return []; const res = await turso.execute("SELECT data FROM workshops"); return res.rows.map(r => JSON.parse(r.data as string)); };
export const saveWorkshop = async (ws: Workshop) => { if (!isTursoConfigured) return; const now = Math.floor(Date.now() / 1000); await turso.execute({ sql: `INSERT INTO workshops (id, data, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, code = excluded.code, name = excluded.name, updated_at = excluded.updated_at`, args: [ws.id, JSON.stringify(ws), ws.code, ws.name, now, now] }); };
export const deleteWorkshop = async (id: string) => { if (!isTursoConfigured) return; await turso.execute({ sql: "DELETE FROM workshops WHERE id = ?", args: [id] }); };
export const getTemplates = async (): Promise<Record<string, CheckItem[]>> => { if (!isTursoConfigured) return {}; const res = await turso.execute("SELECT moduleId, data FROM templates"); const result: Record<string, CheckItem[]> = {}; res.rows.forEach(r => { result[r.moduleId as string] = JSON.parse(r.data as string); }); return result; };
export const saveTemplate = async (moduleId: string, items: CheckItem[]) => { if (!isTursoConfigured) return; const now = Math.floor(Date.now() / 1000); await turso.execute({ sql: `INSERT INTO templates (moduleId, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(moduleId) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, args: [moduleId, JSON.stringify(items), now] }); };

export const getNcrs = async (params: { inspection_id?: string, status?: string, page?: number, limit?: number }): Promise<NCR[]> => { 
    if (!isTursoConfigured) return []; 
    const { inspection_id, status, page = 1, limit = 50 } = params; 
    const offset = (page - 1) * limit; 
    let sql = `SELECT id, inspection_id, item_id, defect_code, severity, status, description, root_cause, corrective_action, responsible_person, deadline, created_by, created_at, updated_at FROM ncrs WHERE deleted_at IS NULL`; 
    let args: any[] = []; 
    if (inspection_id) { sql += ` AND inspection_id = ?`; args.push(inspection_id); } 
    if (status && status !== 'ALL') { sql += ` AND status = ?`; args.push(status); } 
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`; args.push(limit, offset); 
    const res = await turso.execute({ sql, args }); 
    return res.rows.map(row => ({ id: row.id as string, inspection_id: row.inspection_id as string, createdDate: new Date((row.created_at as number) * 1000).toISOString().split('T')[0], issueDescription: row.description as string, rootCause: (row.root_cause as string) || '', solution: (row.corrective_action as string) || '', responsiblePerson: (row.responsible_person as string) || '', deadline: (row.deadline as string) || '', status: row.status as string, severity: row.severity as any, imagesBefore: [], imagesAfter: [], comments: [], itemId: row.item_id as string })); 
};

export const getNcrById = async (id: string): Promise<NCR | null> => {
    if (!isTursoConfigured) return null;
    const res = await turso.execute({ sql: "SELECT * FROM ncrs WHERE id = ?", args: [id] });
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return { id: row.id as string, inspection_id: row.inspection_id as string, createdDate: new Date((row.created_at as number) * 1000).toISOString().split('T')[0], issueDescription: row.description as string, rootCause: (row.root_cause as string) || '', solution: (row.corrective_action as string) || '', responsiblePerson: (row.responsible_person as string) || '', deadline: (row.deadline as string) || '', status: row.status as string, severity: row.severity as any, imagesBefore: JSON.parse((row.images_before_json as string) || '[]'), imagesAfter: JSON.parse((row.images_after_json as string) || '[]'), comments: JSON.parse((row.comments_json as string) || '[]'), itemId: row.item_id as string };
};

export const getDefectLibrary = async (): Promise<DefectLibraryItem[]> => { if (!isTursoConfigured) return []; const res = await turso.execute("SELECT * FROM defect_library ORDER BY COALESCE(defect_code, id) ASC"); return res.rows.map(row => ({ id: row.id as string, code: (row.defect_code as string) || (row.id as string), name: (row.name as string) || '', stage: (row.stage as string) || 'Chung', category: (row.category as string) || 'Khác', description: (row.description as string) || '', severity: (row.severity as any) || 'MINOR', suggestedAction: (row.suggested_action as string) || '', correctImage: (row.correct_image as string) || '', incorrectImage: (row.incorrect_image as string) || '', createdBy: (row.created_by as string) || 'System', createdAt: (row.created_at as number) || Math.floor(Date.now() / 1000) })); };
export const saveDefectLibraryItem = async (item: DefectLibraryItem) => { if (!isTursoConfigured) return; const now = Math.floor(Date.now() / 1000); await turso.execute({ sql: `INSERT INTO defect_library (id, defect_code, name, stage, category, description, severity, suggested_action, correct_image, incorrect_image, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET defect_code = excluded.defect_code, name = excluded.name, stage = excluded.stage, category = excluded.category, description = excluded.description, severity = excluded.severity, suggested_action = excluded.suggested_action, correct_image = excluded.correct_image, incorrect_image = excluded.incorrect_image`, args: [item.id, item.code, item.name || '', item.stage, item.category, item.description, item.severity, item.suggestedAction || '', item.correctImage || '', item.incorrectImage || '', item.createdBy || 'System', item.createdAt || now] }); };
export const deleteDefectLibraryItem = async (id: string) => { if (!isTursoConfigured) return; await turso.execute({ sql: "DELETE FROM defect_library WHERE id = ?", args: [id] }); };

export const getDefects = async (params: { search?: string, status?: string }): Promise<Defect[]> => {
    if (!isTursoConfigured) return [];
    const { search = '', status = '' } = params;
    let sql = `SELECT n.id, n.inspection_id as inspectionId, n.item_id as itemId, n.defect_code as defectCode, n.severity, n.status, n.description, n.root_cause as rootCause, n.corrective_action as solution, n.responsible_person as responsiblePerson, n.deadline, n.created_by as inspectorName, strftime('%Y-%m-%d', datetime(n.created_at, 'unixepoch')) as date, n.images_before_json, i.ma_ct, i.ten_ct FROM ncrs n LEFT JOIN inspections i ON n.inspection_id = i.id WHERE n.deleted_at IS NULL`;
    let args: any[] = [];
    if (search) {
        sql += " AND (n.description LIKE ? OR n.defect_code LIKE ? OR i.ma_ct LIKE ?)";
        const term = `%${search}%`; args.push(term, term, term);
    }
    if (status && status !== 'ALL') { sql += " AND n.status = ?"; args.push(status); }
    sql += " ORDER BY n.created_at DESC";
    const res = await turso.execute({ sql, args });
    return res.rows.map(row => ({ id: row.id as string, inspectionId: row.inspectionId as string, itemId: row.itemId as string, defectCode: row.defectCode as string, category: 'N/A', description: row.description as string, status: row.status as string, severity: row.severity as string, inspectorName: row.inspectorName as string, date: row.date as string, ma_ct: (row.ma_ct as string) || 'Unknown', ten_ct: (row.ten_ct as string) || 'Unknown', images: JSON.parse((row.images_before_json as string) || '[]'), rootCause: (row.rootCause as string) || '', solution: (row.solution as string) || '', responsiblePerson: (row.responsiblePerson as string) || '', deadline: (row.deadline as string) || '' }));
};

export const importUsers = async (users: User[]) => { if (!isTursoConfigured) return; for (const user of users) await saveUser(user); };

export const saveNcrMapped = async (inspection_id: string, ncr: NCR, createdBy: string) => {
    if (!isTursoConfigured) return '';
    const now = Math.floor(Date.now() / 1000);
    const id = ncr.id || `NCR-${Date.now()}`;
    await turso.execute({
        sql: `INSERT INTO ncrs (id, inspection_id, item_id, defect_code, severity, status, description, root_cause, corrective_action, responsible_person, deadline, images_before_json, images_after_json, comments_json, created_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET severity = excluded.severity, status = excluded.status, description = excluded.description, root_cause = excluded.root_cause, corrective_action = excluded.corrective_action, responsible_person = excluded.responsible_person, deadline = excluded.deadline, images_before_json = excluded.images_before_json, images_after_json = excluded.images_after_json, comments_json = excluded.comments_json, updated_at = excluded.updated_at`,
        args: [id, inspection_id, ncr.itemId || '', ncr.defect_code || '', ncr.severity || 'MINOR', ncr.status || 'OPEN', ncr.issueDescription, ncr.rootCause || '', ncr.solution || '', ncr.responsiblePerson || '', ncr.deadline || '', JSON.stringify(ncr.imagesBefore || []), JSON.stringify(ncr.imagesAfter || []), JSON.stringify(ncr.comments || []), createdBy, now, now]
    });
    return id;
};