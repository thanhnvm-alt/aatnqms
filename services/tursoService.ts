
import { turso, isTursoConfigured } from "./tursoConfig";
import { NCR, Inspection, PlanItem, User, Workshop, CheckItem, Project, Role, Defect, DefectLibraryItem } from "../types";

/**
 * Initialize all database tables and perform migrations.
 */
export const initDatabase = async () => {
  if (!isTursoConfigured) return;
  try {
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

    // 2. Inspections Table (Enhanced with metadata columns for fast listing)
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

    // MIGRATION: Đảm bảo bảng inspections có các cột metadata mới
    try {
        const tableInfo = await turso.execute("PRAGMA table_info(inspections)");
        const columns = tableInfo.rows.map(row => String(row.name).toLowerCase());
        const missing = [
            { name: 'ten_ct', type: 'TEXT' },
            { name: 'ten_hang_muc', type: 'TEXT' },
            { name: 'workshop', type: 'TEXT' }
        ];
        for (const col of missing) {
            if (!columns.includes(col.name)) {
                await turso.execute(`ALTER TABLE inspections ADD COLUMN ${col.name} ${col.type}`);
            }
        }
    } catch (e) { console.warn("Migration warning:", e); }

    // 3. Projects Metadata Table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        ma_ct TEXT PRIMARY KEY,
        data TEXT,
        updated_at INTEGER
      )`);

    // 4. Defect Library Table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS defect_library (
        id TEXT PRIMARY KEY,
        defect_code TEXT UNIQUE NOT NULL,
        name TEXT,
        stage TEXT,
        category TEXT,
        description TEXT,
        severity TEXT,
        suggested_action TEXT,
        correct_image TEXT,
        incorrect_image TEXT,
        created_by TEXT,
        created_at INTEGER
      )`);
    
    // 5. Create NCR Table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS ncrs (
        id TEXT PRIMARY KEY,
        inspection_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        defect_code TEXT,
        severity TEXT DEFAULT 'MINOR',
        status TEXT DEFAULT 'OPEN',
        description TEXT NOT NULL,
        root_cause TEXT,
        corrective_action TEXT,
        preventive_action TEXT,
        responsible_person TEXT,
        deadline TEXT,
        images_before_json TEXT,
        images_after_json TEXT,
        comments_json TEXT,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        closed_at INTEGER,
        deleted_at INTEGER
      )`);

    // Các bảng hệ thống khác
    await turso.execute(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT, username TEXT UNIQUE, role TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS workshops (id TEXT PRIMARY KEY, data TEXT, code TEXT UNIQUE, name TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS templates (moduleId TEXT PRIMARY KEY, data TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, data TEXT, created_at INTEGER, updated_at INTEGER)`);

    console.log("✅ Optimized Database initialized.");
  } catch (e) {
    console.error("❌ Database initialization failed:", e);
    throw e;
  }
};

/**
 * TỐI ƯU: Lấy danh sách kiểm tra rút gọn (Summary)
 */
export const getInspectionsPaginated = async (params: { page?: number, limit?: number, search?: string, status?: string, type?: string }) => {
    const { page = 1, limit = 50, search = '', status = '', type = '' } = params;
    const offset = (page - 1) * limit;
    
    // Chỉ chọn các trường metadata cần thiết để hiển thị list, KHÔNG lấy cột 'data' (JSON)
    let sql = `
        SELECT 
            id, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, workshop, 
            created_by as inspectorName, 
            strftime('%Y-%m-%d', datetime(created_at, 'unixepoch')) as date, 
            status, type, score 
        FROM inspections 
        WHERE 1=1
    `;
    let args: any[] = [];
    
    if (search) {
        sql += " AND (ma_ct LIKE ? OR ma_nha_may LIKE ? OR ten_ct LIKE ? OR ten_hang_muc LIKE ?)";
        const term = `%${search}%`;
        args.push(term, term, term, term);
    }
    if (status && status !== 'ALL') {
        sql += " AND status = ?";
        args.push(status);
    }
    if (type && type !== 'ALL') {
        sql += " AND type = ?";
        args.push(type);
    }
    
    const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    
    const [dataRes, countRes] = await Promise.all([
        turso.execute({ sql, args: [...args, limit, offset] }),
        turso.execute({ sql: countSql, args })
    ]);
    
    return {
        items: dataRes.rows as unknown as Inspection[],
        total: Number(countRes.rows[0]?.total || 0)
    };
};

/**
 * Lấy chi tiết đầy đủ của 1 phiếu (Bao gồm JSON data và NCRs)
 */
export const getInspectionById = async (id: string): Promise<Inspection | null> => {
    const res = await turso.execute({ sql: "SELECT data FROM inspections WHERE id = ?", args: [id] });
    if (res.rows.length === 0) return null;
    
    const inspection = JSON.parse(res.rows[0].data as string) as Inspection;
    
    const associatedNcrs = await getNcrsByInspectionId(id);
    if (associatedNcrs.length > 0) {
        inspection.items = inspection.items.map(item => {
            const foundNcr = associatedNcrs.find((n: any) => n.itemId === item.id);
            if (foundNcr) return { ...item, ncr: foundNcr };
            return item;
        });
    }
    
    return inspection;
};

export const saveInspection = async (inspection: Inspection) => {
    const now = Math.floor(Date.now() / 1000);
    const userId = inspection.inspectorName || 'Unknown';
    
    const itemsToSave = JSON.parse(JSON.stringify(inspection.items));
    if (itemsToSave && Array.isArray(itemsToSave)) {
        for (const item of itemsToSave) {
            if (item.ncr) {
                await upsertNcr(inspection.id, item.id, item.ncr, userId);
                delete item.ncr;
            }
        }
    }

    const inspectionDataOnly = { ...inspection, items: itemsToSave };

    await turso.execute({
        sql: `INSERT INTO inspections (id, data, created_at, updated_at, created_by, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, workshop, status, type, score)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET 
                data = excluded.data, 
                updated_at = excluded.updated_at, 
                status = excluded.status, 
                score = excluded.score,
                ten_ct = excluded.ten_ct,
                ten_hang_muc = excluded.ten_hang_muc,
                workshop = excluded.workshop`,
        args: [
            inspection.id, JSON.stringify(inspectionDataOnly), now, now, userId, 
            inspection.ma_ct, inspection.ten_ct, inspection.ma_nha_may, inspection.ten_hang_muc, 
            inspection.workshop, inspection.status, inspection.type, inspection.score
        ]
    });
};

export const getNcrsByInspectionId = async (inspectionId: string): Promise<NCR[]> => {
    const res = await turso.execute({
        sql: `SELECT * FROM ncrs WHERE inspection_id = ? AND deleted_at IS NULL`,
        args: [inspectionId]
    });
    return res.rows.map(row => ({
        id: row.id as string,
        inspection_id: row.inspection_id as string,
        createdDate: new Date((row.created_at as number) * 1000).toISOString().split('T')[0],
        issueDescription: row.description as string,
        rootCause: (row.root_cause as string) || '',
        solution: (row.corrective_action as string) || '',
        responsiblePerson: (row.responsible_person as string) || '',
        deadline: (row.deadline as string) || '',
        status: row.status as string,
        severity: row.severity as any,
        imagesBefore: JSON.parse((row.images_before_json as string) || '[]'),
        imagesAfter: JSON.parse((row.images_after_json as string) || '[]'),
        comments: JSON.parse((row.comments_json as string) || '[]'),
        itemId: row.item_id as string 
    } as any));
};

export const upsertNcr = async (inspectionId: string, itemId: string, ncr: NCR, userId: string) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO ncrs (
                id, inspection_id, item_id, description, root_cause, corrective_action, 
                responsible_person, deadline, status, severity, images_before_json, 
                images_after_json, comments_json, created_by, updated_at, defect_code
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET 
                description = excluded.description,
                root_cause = excluded.root_cause,
                corrective_action = excluded.corrective_action,
                status = excluded.status,
                severity = excluded.severity,
                images_after_json = excluded.images_after_json,
                comments_json = excluded.comments_json,
                updated_at = excluded.updated_at,
                defect_code = excluded.defect_code`,
        args: [
            ncr.id, inspectionId, itemId, ncr.issueDescription, ncr.rootCause || null, 
            ncr.solution || null, ncr.responsiblePerson || null, ncr.deadline || null, 
            ncr.status || 'OPEN', ncr.severity || 'MINOR', JSON.stringify(ncr.imagesBefore || []), 
            JSON.stringify(ncr.imagesAfter || []), JSON.stringify(ncr.comments || []),
            userId, now, ncr.defect_code || null
        ]
    });
};

export const getDefects = async (params: { search?: string, status?: string } = {}): Promise<Defect[]> => {
    const { search = '', status = 'ALL' } = params;
    let sql = `SELECT n.id, n.inspection_id, n.item_id, n.defect_code, n.severity, n.status, n.description, n.root_cause, n.corrective_action, n.responsible_person, n.deadline, n.images_before_json, n.images_after_json, i.ma_ct, i.created_by as inspector_name, i.created_at as inspection_date FROM ncrs n JOIN inspections i ON n.inspection_id = i.id WHERE n.deleted_at IS NULL`;
    let args: any[] = [];
    if (status !== 'ALL') { sql += ` AND n.status = ?`; args.push(status); }
    if (search) { sql += ` AND (n.description LIKE ? OR n.defect_code LIKE ? OR i.ma_ct LIKE ?)`; const term = `%${search}%`; args.push(term, term, term); }
    sql += ` ORDER BY n.created_at DESC`;
    const res = await turso.execute({ sql, args });
    return res.rows.map(row => ({ id: row.id as string, inspectionId: row.inspection_id as string, itemId: row.item_id as string, defectCode: (row.defect_code as string) || 'N/A', category: 'Defect', description: row.description as string, status: row.status as string, severity: row.severity as string, inspectorName: row.inspector_name as string, date: new Date((row.inspection_date as number) * 1000).toISOString().split('T')[0], ma_ct: row.ma_ct as string, ten_ct: 'Project Name Unavailable', images: JSON.parse((row.images_before_json as string) || '[]'), rootCause: (row.root_cause as string) || '', solution: (row.corrective_action as string) || '', responsiblePerson: (row.responsible_person as string) || '', deadline: (row.deadline as string) || '' }));
};

export const testConnection = async () => { try { await turso.execute("SELECT 1"); return true; } catch (e) { return false; } };
export const getRoles = async (): Promise<Role[]> => { const res = await turso.execute("SELECT data FROM roles"); return res.rows.map(r => JSON.parse(r.data as string)); };
export const saveRole = async (role: Role) => { const now = Math.floor(Date.now() / 1000); await turso.execute({ sql: `INSERT INTO roles (id, data, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, args: [role.id, JSON.stringify(role), now, now] }); };
export const deleteRole = async (id: string) => { await turso.execute({ sql: "DELETE FROM roles WHERE id = ?", args: [id] }); };
export const getPlans = async (params: { search?: string, page?: number, limit?: number }) => { const { search = '', page = 1, limit = 100 } = params; const offset = (page - 1) * limit; let sql = "SELECT * FROM plans"; let args: any[] = []; if (search) { sql += " WHERE ma_ct LIKE ? OR ma_nha_may LIKE ? OR headcode LIKE ? OR ten_hang_muc LIKE ?"; const term = `%${search}%`; args = [term, term, term, term]; } const countSql = `SELECT COUNT(*) as total FROM (${sql})`; sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"; const [dataRes, countRes] = await Promise.all([turso.execute({ sql, args: [...args, limit, offset] }), turso.execute({ sql: countSql, args })]); return { items: dataRes.rows as unknown as PlanItem[], total: Number(countRes.rows[0]?.total || 0) }; };
export const importPlansBatch = async (plans: PlanItem[]) => { for (const p of plans) { await turso.execute({ sql: `INSERT INTO plans (stt, ma_nha_may, headcode, ma_ct, ten_ct, ten_hang_muc, dvt, so_luong_ipo, plannedDate, assignee, status, pthsp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [p.stt, p.ma_nha_may, p.headcode, p.ma_ct, p.ten_ct, p.ten_hang_muc, p.dvt, p.so_luong_ipo, p.plannedDate, p.assignee, p.status, p.pthsp, Math.floor(Date.now()/1000)] }); } };
export const deleteInspection = async (id: string) => { await turso.execute({ sql: "DELETE FROM inspections WHERE id = ?", args: [id] }); };
export const getUsers = async (): Promise<User[]> => { const res = await turso.execute("SELECT data FROM users"); return res.rows.map(r => JSON.parse(r.data as string)); };
export const saveUser = async (user: User) => { const now = Math.floor(Date.now() / 1000); await turso.execute({ sql: `INSERT INTO users (id, data, username, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, username = excluded.username, role = excluded.role, updated_at = excluded.updated_at`, args: [user.id, JSON.stringify(user), user.username, user.role, now, now] }); };
export const deleteUser = async (id: string) => { await turso.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] }); };
export const importUsers = async (users: User[]) => { for (const u of users) { await saveUser(u); } };
export const getWorkshops = async (): Promise<Workshop[]> => { const res = await turso.execute("SELECT data FROM workshops"); return res.rows.map(r => JSON.parse(r.data as string)); };
export const saveWorkshop = async (ws: Workshop) => { const now = Math.floor(Date.now() / 1000); await turso.execute({ sql: `INSERT INTO workshops (id, data, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, code = excluded.code, name = excluded.name, updated_at = excluded.updated_at`, args: [ws.id, JSON.stringify(ws), ws.code, ws.name, now, now] }); };
export const deleteWorkshop = async (id: string) => { await turso.execute({ sql: "DELETE FROM workshops WHERE id = ?", args: [id] }); };
export const getTemplates = async (): Promise<Record<string, CheckItem[]>> => { const res = await turso.execute("SELECT moduleId, data FROM templates"); const result: Record<string, CheckItem[]> = {}; res.rows.forEach(r => { result[r.moduleId as string] = JSON.parse(r.data as string); }); return result; };
export const saveTemplate = async (moduleId: string, items: CheckItem[]) => { const now = Math.floor(Date.now() / 1000); await turso.execute({ sql: `INSERT INTO templates (moduleId, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(moduleId) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, args: [moduleId, JSON.stringify(items), now] }); };
export const getNcrs = async (params: { inspection_id?: string, status?: string, page?: number, limit?: number }): Promise<NCR[]> => { const { inspection_id, status, page = 1, limit = 50 } = params; const offset = (page - 1) * limit; let sql = `SELECT * FROM ncrs WHERE deleted_at IS NULL`; let args: any[] = []; if (inspection_id) { sql += ` AND inspection_id = ?`; args.push(inspection_id); } if (status && status !== 'ALL') { sql += ` AND status = ?`; args.push(status); } sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`; args.push(limit, offset); const res = await turso.execute({ sql, args }); return res.rows.map(row => ({ id: row.id as string, inspection_id: row.inspection_id as string, createdDate: new Date((row.created_at as number) * 1000).toISOString().split('T')[0], issueDescription: row.description as string, rootCause: (row.root_cause as string) || '', solution: (row.corrective_action as string) || '', responsiblePerson: (row.responsible_person as string) || '', deadline: (row.deadline as string) || '', status: row.status as string, severity: row.severity as any, imagesBefore: JSON.parse((row.images_before_json as string) || '[]'), imagesAfter: JSON.parse((row.images_after_json as string) || '[]'), comments: JSON.parse((row.comments_json as string) || '[]'), itemId: row.item_id as string })); };
export const saveNcrMapped = async (inspectionId: string, ncrData: any, userId: string) => { const id = ncrData.id || `NCR-${Date.now()}`; const itemId = ncrData.itemId || 'unknown-item'; const ncrObject: NCR = { id, issueDescription: ncrData.issueDescription, rootCause: ncrData.rootCause, solution: ncrData.solution, responsiblePerson: ncrData.responsiblePerson, deadline: ncrData.deadline, status: ncrData.status, severity: ncrData.severity, imagesBefore: ncrData.imagesBefore, imagesAfter: ncrData.imagesAfter, comments: ncrData.comments, createdDate: new Date().toISOString() }; await upsertNcr(inspectionId, itemId, ncrObject, userId); return id; };
export const getDefectLibrary = async (): Promise<DefectLibraryItem[]> => { const res = await turso.execute("SELECT * FROM defect_library ORDER BY COALESCE(defect_code, id) ASC"); return res.rows.map(row => ({ id: row.id as string, code: (row.defect_code as string) || (row.code as string) || (row.id as string), name: (row.name as string) || '', stage: (row.stage as string) || 'Chung', category: (row.category as string) || 'Khác', description: (row.description as string) || '', severity: (row.severity as any) || 'MINOR', suggestedAction: (row.suggested_action as string) || '', correctImage: (row.correct_image as string) || '', incorrectImage: (row.incorrect_image as string) || '', createdBy: (row.created_by as string) || 'System', createdAt: (row.created_at as number) || Math.floor(Date.now() / 1000) })); };
export const saveDefectLibraryItem = async (item: DefectLibraryItem) => { const now = Math.floor(Date.now() / 1000); await turso.execute({ sql: `INSERT INTO defect_library (id, defect_code, name, stage, category, description, severity, suggested_action, correct_image, incorrect_image, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET defect_code = excluded.defect_code, name = excluded.name, stage = excluded.stage, category = excluded.category, description = excluded.description, severity = excluded.severity, suggested_action = excluded.suggested_action, correct_image = excluded.correct_image, incorrect_image = excluded.incorrect_image`, args: [item.id, item.code, item.name || '', item.stage, item.category, item.description, item.severity, item.suggestedAction || '', item.correctImage || '', item.incorrectImage || '', item.createdBy || 'System', item.createdAt || now] }); };
export const deleteDefectLibraryItem = async (id: string) => { await turso.execute({ sql: "DELETE FROM defect_library WHERE id = ?", args: [id] }); };

/**
 * Lấy danh sách dự án đầy đủ từ bảng projects
 */
export const getProjects = async (): Promise<Project[]> => {
  const res = await turso.execute("SELECT data FROM projects");
  return res.rows.map(r => JSON.parse(r.data as string));
};

/**
 * Lưu metadata dự án (tên, mô tả, hình ảnh, tiến độ...)
 */
export const saveProjectMetadata = async (project: Project) => {
  const now = Math.floor(Date.now() / 1000);
  await turso.execute({
    sql: `INSERT INTO projects (ma_ct, data, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(ma_ct) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: [project.ma_ct, JSON.stringify(project), now]
  });
};

export const getProjectsSummary = async (search: string = ""): Promise<Project[]> => {
    let sql = "SELECT ma_ct, ten_ct FROM inspections";
    let args: any[] = [];
    if (search) {
        sql += " WHERE ma_ct LIKE ? OR ten_ct LIKE ?";
        const term = `%${search}%`;
        args = [term, term];
    }
    sql += " GROUP BY ma_ct";
    
    try {
        const res = await turso.execute({ sql, args });
        return res.rows.map(row => ({
            id: `proj_${row.ma_ct}`,
            code: String(row.ma_ct),
            ma_ct: String(row.ma_ct),
            name: (row.ten_ct as string) || String(row.ma_ct),
            ten_ct: (row.ten_ct as string) || String(row.ma_ct),
            status: 'In Progress',
            pm: 'Unassigned',
            progress: 0,
            thumbnail: '',
            startDate: '',
            endDate: ''
        } as Project));
    } catch (err) {
        console.error("Error fetching projects summary:", err);
        return [];
    }
};
