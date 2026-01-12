
import { turso, isTursoConfigured } from "./tursoConfig";
import { NCR, Inspection, PlanItem, User, Workshop, CheckItem, Project, Role, Defect, DefectLibraryItem, NCRComment } from "../types";
import { withRetry } from "../lib/retry";

const cleanArgs = (args: any[]): any[] => {
  return args.map(arg => {
    if (arg === undefined) return null;
    return arg;
  });
};

export const initDatabase = async () => {
  if (!isTursoConfigured) {
    console.warn("⚠️ Turso is not configured. Database will not be initialized.");
    return;
  }

  try {
    await withRetry(() => turso.execute("SELECT 1"), { maxRetries: 5, initialDelay: 500 });
    
    // Core Tables
    await turso.execute(`CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, stt INTEGER, ma_nha_may TEXT, headcode TEXT, ma_ct TEXT, ten_ct TEXT, ten_hang_muc TEXT, dvt TEXT, so_luong_ipo INTEGER, plannedDate TEXT, assignee TEXT, status TEXT, pthsp TEXT, created_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS inspections (id TEXT PRIMARY KEY, data TEXT, created_at INTEGER, updated_at INTEGER, created_by TEXT, ma_ct TEXT, ten_ct TEXT, ma_nha_may TEXT, ten_hang_muc TEXT, workshop TEXT, status TEXT, type TEXT, score INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS projects (ma_ct TEXT PRIMARY KEY, data TEXT, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS defect_library (id TEXT PRIMARY KEY, defect_code TEXT UNIQUE, name TEXT, stage TEXT, category TEXT, description TEXT, severity TEXT, suggested_action TEXT, correct_image TEXT, incorrect_image TEXT, created_by TEXT, created_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS ncrs (id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL, item_id TEXT NOT NULL, defect_code TEXT, severity TEXT, status TEXT, description TEXT, root_cause TEXT, corrective_action TEXT, preventive_action TEXT, responsible_person TEXT, deadline TEXT, images_before_json TEXT, images_after_json TEXT, comments_json TEXT, created_by TEXT, created_at INTEGER, updated_at INTEGER, closed_at INTEGER, deleted_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT, username TEXT UNIQUE, role TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS workshops (id TEXT PRIMARY KEY, data TEXT, code TEXT UNIQUE, name TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, data TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS templates (moduleId TEXT PRIMARY KEY, data TEXT, updated_at INTEGER)`);

    // Form-Specific Tables (Normalized Data for Reporting)
    await turso.execute(`CREATE TABLE IF NOT EXISTS forms_iqc (id TEXT PRIMARY KEY, po_number TEXT, supplier TEXT, material_count INTEGER, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS forms_pqc (id TEXT PRIMARY KEY, workshop TEXT, stage TEXT, qty_total REAL, qty_pass REAL, qty_fail REAL, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS forms_sqc (id TEXT PRIMARY KEY, partner_code TEXT, type TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS forms_site (id TEXT PRIMARY KEY, location TEXT, created_at INTEGER, updated_at INTEGER)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS forms_qa (id TEXT PRIMARY KEY, type TEXT, stage TEXT, created_at INTEGER, updated_at INTEGER)`); // FQC, FSR, SPR

    // Migration: Ensure 'code' column exists in workshops table
    try {
      await turso.execute("ALTER TABLE workshops ADD COLUMN code TEXT");
      // Optionally add unique index if needed, though ALTER TABLE ADD COLUMN does not support adding constraints directly easily in older SQLite
      // We'll rely on the app logic or subsequent CREATE INDEX
      await turso.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_workshops_code ON workshops(code)");
    } catch (e: any) {
      // Ignore error if column already exists (duplicate column name error)
      if (!e.message.includes("duplicate column name")) {
         // Log real errors if they aren't just "column exists"
         console.log("Migration check (workshops.code):", e.message);
      }
    }

    console.log("✅ QMS Database initialized and verified.");
  } catch (e) {
    console.error("❌ Turso initialization error:", e);
    throw e; 
  }
};

export const testConnection = async () => {
  try {
    await withRetry(() => turso.execute("SELECT 1"));
    return true;
  } catch (e) {
    return false;
  }
};

export const getProjects = async (): Promise<Project[]> => {
    if (!isTursoConfigured) return [];
    try {
        return await withRetry(async () => {
            const derivedRes = await turso.execute(`SELECT ma_ct, MAX(ten_ct) as ten_ct FROM (SELECT ma_ct, ten_ct FROM plans WHERE ma_ct IS NOT NULL AND ma_ct != '' UNION ALL SELECT ma_ct, ten_ct FROM inspections WHERE ma_ct IS NOT NULL AND ma_ct != '') GROUP BY ma_ct`);
            const metaRes = await turso.execute("SELECT ma_ct, data FROM projects");
            const metaMap: Record<string, Project> = {};
            metaRes.rows.forEach(row => {
                try { if (row.data) metaMap[row.ma_ct as string] = JSON.parse(row.data as string); } catch(e) {}
            });
            return derivedRes.rows.map(row => {
                const ma_ct = String(row.ma_ct);
                const ten_ct = String(row.ten_ct || ma_ct);
                if (metaMap[ma_ct]) return { ...metaMap[ma_ct], ma_ct }; 
                return { id: `proj_${ma_ct}`, code: ma_ct, ma_ct, name: ten_ct, ten_ct, status: 'Planning', pm: 'Chưa phân công', progress: 0, thumbnail: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=400', startDate: new Date().toISOString().split('T')[0], images: [] } as Project;
            });
        });
    } catch (err) { return []; }
};

export const getProjectByCode = async (maCt: string): Promise<Project | null> => {
    if (!isTursoConfigured) return null;
    return await withRetry(async () => {
        const res = await turso.execute({ sql: "SELECT data FROM projects WHERE ma_ct = ?", args: cleanArgs([maCt]) });
        if (res.rows.length > 0) return JSON.parse(res.rows[0].data as string);
        return null;
    });
};

export const saveProjectMetadata = async (project: Project) => {
  if (!isTursoConfigured) return;
  const now = Math.floor(Date.now() / 1000);
  await withRetry(() => turso.execute({
    sql: `INSERT INTO projects (ma_ct, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(ma_ct) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: cleanArgs([project.ma_ct, JSON.stringify(project), now])
  }));
};

export const getPlans = async (options: { search?: string, page?: number, limit?: number }) => {
    const { search = '', page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;
    const term = `%${search}%`;
    const res = await turso.execute({
        sql: `SELECT * FROM plans WHERE ma_ct LIKE ? OR ma_nha_may LIKE ? OR ten_hang_muc LIKE ? OR headcode LIKE ? LIMIT ? OFFSET ?`,
        args: cleanArgs([term, term, term, term, limit, offset])
    });
    const totalRes = await turso.execute({
        sql: `SELECT COUNT(*) as total FROM plans WHERE ma_ct LIKE ? OR ma_nha_may LIKE ? OR ten_hang_muc LIKE ? OR headcode LIKE ?`,
        args: cleanArgs([term, term, term, term])
    });
    return { items: res.rows as unknown as PlanItem[], total: Number(totalRes.rows[0].total) };
};

export const importPlansBatch = async (plans: PlanItem[]) => {
    for (const plan of plans) {
        await turso.execute({
            sql: `INSERT INTO plans (stt, ma_nha_may, headcode, ma_ct, ten_ct, ten_hang_muc, dvt, so_luong_ipo, plannedDate, assignee, status, pthsp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: cleanArgs([plan.stt, plan.ma_nha_may, plan.headcode, plan.ma_ct, plan.ten_ct, plan.ten_hang_muc, plan.dvt, plan.so_luong_ipo, plan.plannedDate, plan.assignee, plan.status, plan.pthsp, Math.floor(Date.now()/1000)])
        });
    }
};

export const getInspectionsPaginated = async (filters: any) => {
    const { page = 1, limit = 20, status, type, ma_ct } = filters;
    const offset = (page - 1) * limit;
    let sql = `SELECT * FROM inspections WHERE 1=1`;
    const args: any[] = [];
    
    if (status && status !== 'ALL') { sql += ` AND status = ?`; args.push(status); }
    if (type && type !== 'ALL') { sql += ` AND type = ?`; args.push(type); }
    if (ma_ct) { sql += ` AND ma_ct = ?`; args.push(ma_ct); }
    
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    
    const res = await turso.execute({ sql, args: cleanArgs([...args, limit, offset]) });
    const countRes = await turso.execute({ sql: countSql, args: cleanArgs(args) });
    
    return {
        items: res.rows.map(r => JSON.parse(r.data as string)),
        total: Number(countRes.rows[0].total)
    };
};

export const getInspectionById = async (id: string): Promise<Inspection | null> => {
    const res = await turso.execute({ sql: `SELECT data FROM inspections WHERE id = ?`, args: cleanArgs([id]) });
    if (res.rows.length === 0) return null;
    
    const inspection: Inspection = JSON.parse(res.rows[0].data as string);
    
    // ISO RE-HYDRATION: Lấy dữ liệu NCR từ table riêng để map vào checklist items
    const ncrs = await getNcrs({ inspection_id: id });
    if (ncrs.length > 0) {
        inspection.items = inspection.items.map(item => {
            const relatedNcr = ncrs.find(n => n.itemId === item.id || n.id === item.ncr?.id);
            if (relatedNcr) {
                return { ...item, ncr: relatedNcr, ncrId: relatedNcr.id };
            }
            return item;
        });
    }
    
    return inspection;
};

// Helper to save specific forms
const saveSpecificForm = async (inspection: Inspection, now: number) => {
    const { id, type } = inspection;
    
    if (type === 'IQC') {
        await turso.execute({
            sql: `INSERT INTO forms_iqc (id, po_number, supplier, material_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) 
                  ON CONFLICT(id) DO UPDATE SET po_number = excluded.po_number, supplier = excluded.supplier, material_count = excluded.material_count, updated_at = excluded.updated_at`,
            args: cleanArgs([id, inspection.po_number, inspection.supplier, inspection.materials?.length || 0, now, now])
        });
    } 
    else if (type === 'PQC' || type === 'STEP') {
        await turso.execute({
            sql: `INSERT INTO forms_pqc (id, workshop, stage, qty_total, qty_pass, qty_fail, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET workshop = excluded.workshop, stage = excluded.stage, qty_total = excluded.qty_total, qty_pass = excluded.qty_pass, qty_fail = excluded.qty_fail, updated_at = excluded.updated_at`,
            args: cleanArgs([id, inspection.workshop || inspection.ma_nha_may, inspection.inspectionStage, inspection.inspectedQuantity || 0, inspection.passedQuantity || 0, inspection.failedQuantity || 0, now, now])
        });
    }
    else if (type === 'SQC_MAT' || type === 'SQC_BTP') {
        await turso.execute({
            sql: `INSERT INTO forms_sqc (id, partner_code, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET partner_code = excluded.partner_code, type = excluded.type, updated_at = excluded.updated_at`,
            args: cleanArgs([id, inspection.ma_nha_may, type, now, now])
        });
    }
    else if (type === 'SITE') {
        await turso.execute({
            sql: `INSERT INTO forms_site (id, location, created_at, updated_at) VALUES (?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET location = excluded.location, updated_at = excluded.updated_at`,
            args: cleanArgs([id, inspection.ma_nha_may || inspection.ma_ct, now, now]) // Fallback to project code if location code missing
        });
    }
    else if (['FQC', 'FSR', 'SPR'].includes(type || '')) {
        await turso.execute({
            sql: `INSERT INTO forms_qa (id, type, stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET type = excluded.type, stage = excluded.stage, updated_at = excluded.updated_at`,
            args: cleanArgs([id, type, inspection.inspectionStage || 'N/A', now, now])
        });
    }
};

export const saveInspection = async (inspection: Inspection) => {
    const now = Math.floor(Date.now() / 1000);
    
    // 1. Tách và lưu NCR vào table ncrs
    for (const item of inspection.items) {
        if (item.ncr) {
            await saveNcrMapped(inspection.id, item.ncr, inspection.inspectorName);
        }
    }

    // 2. Lưu vào bảng chi tiết theo loại (Normalization Layer)
    await saveSpecificForm(inspection, now);

    // 3. Tạo bản sao rút gọn để lưu vào column data (Main JSON Storage)
    const slimInspection = JSON.parse(JSON.stringify(inspection));
    slimInspection.items = slimInspection.items.map((item: any) => {
        if (item.ncr) {
            return { 
                ...item, 
                ncrId: item.ncr.id, 
                ncr: { id: item.ncr.id, status: item.ncr.status } // Chỉ giữ lại ID link
            };
        }
        return item;
    });

    await turso.execute({
        sql: `INSERT INTO inspections (id, data, created_at, updated_at, created_by, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, workshop, status, type, score) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
              ON CONFLICT(id) DO UPDATE SET 
                data = excluded.data, 
                updated_at = excluded.updated_at, 
                status = excluded.status, 
                score = excluded.score`,
        args: cleanArgs([
            inspection.id, 
            JSON.stringify(slimInspection), 
            now, 
            now, 
            inspection.inspectorName, 
            inspection.ma_ct, 
            inspection.ten_ct, 
            inspection.ma_nha_may, 
            inspection.ten_hang_muc, 
            inspection.workshop, 
            inspection.status, 
            inspection.type, 
            inspection.score
        ])
    });
};

export const deleteInspection = async (id: string) => {
    await turso.execute({ sql: `DELETE FROM inspections WHERE id = ?`, args: cleanArgs([id]) });
    await turso.execute({ sql: `DELETE FROM ncrs WHERE inspection_id = ?`, args: cleanArgs([id]) });
    // Also cleanup specific tables to maintain referential integrity (manual)
    await turso.execute({ sql: `DELETE FROM forms_iqc WHERE id = ?`, args: cleanArgs([id]) });
    await turso.execute({ sql: `DELETE FROM forms_pqc WHERE id = ?`, args: cleanArgs([id]) });
    await turso.execute({ sql: `DELETE FROM forms_sqc WHERE id = ?`, args: cleanArgs([id]) });
    await turso.execute({ sql: `DELETE FROM forms_site WHERE id = ?`, args: cleanArgs([id]) });
    await turso.execute({ sql: `DELETE FROM forms_qa WHERE id = ?`, args: cleanArgs([id]) });
};

export const getNcrs = async (options: { inspection_id?: string, status?: string, page?: number, limit?: number }) => {
    const { inspection_id, status, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;
    let sql = `SELECT * FROM ncrs WHERE deleted_at IS NULL`;
    const args: any[] = [];
    
    if (inspection_id) { sql += ` AND inspection_id = ?`; args.push(inspection_id); }
    if (status && status !== 'ALL') { sql += ` AND status = ?`; args.push(status); }
    
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const res = await turso.execute({ sql, args: cleanArgs([...args, limit, offset]) });
    
    return res.rows.map(r => ({
        id: r.id,
        inspection_id: r.inspection_id,
        itemId: r.item_id,
        defect_code: r.defect_code,
        severity: r.severity,
        status: r.status,
        issueDescription: r.description,
        rootCause: r.root_cause,
        solution: r.corrective_action,
        responsiblePerson: r.responsible_person,
        deadline: r.deadline,
        imagesBefore: JSON.parse(r.images_before_json as string || '[]'),
        imagesAfter: JSON.parse(r.images_after_json as string || '[]'),
        comments: JSON.parse(r.comments_json as string || '[]'),
        createdDate: new Date(Number(r.created_at) * 1000).toISOString()
    } as NCR));
};

export const getNcrById = async (id: string): Promise<NCR | null> => {
    const res = await turso.execute({ sql: `SELECT * FROM ncrs WHERE id = ?`, args: cleanArgs([id]) });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
        id: r.id,
        inspection_id: r.inspection_id,
        itemId: r.item_id,
        defect_code: r.defect_code,
        severity: r.severity,
        status: r.status,
        issueDescription: r.description,
        rootCause: r.root_cause,
        solution: r.corrective_action,
        responsiblePerson: r.responsible_person,
        deadline: r.deadline,
        imagesBefore: JSON.parse(r.images_before_json as string || '[]'),
        imagesAfter: JSON.parse(r.images_after_json as string || '[]'),
        comments: JSON.parse(r.comments_json as string || '[]'),
        createdDate: new Date(Number(r.created_at) * 1000).toISOString()
    } as NCR;
};

export const saveNcrMapped = async (inspection_id: string, ncr: NCR, createdBy: string) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO ncrs (id, inspection_id, item_id, defect_code, severity, status, description, root_cause, corrective_action, responsible_person, deadline, images_before_json, images_after_json, comments_json, created_by, created_at, updated_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
              ON CONFLICT(id) DO UPDATE SET 
                severity = excluded.severity,
                status = excluded.status,
                description = excluded.description,
                root_cause = excluded.root_cause,
                corrective_action = excluded.corrective_action,
                responsible_person = excluded.responsible_person,
                deadline = excluded.deadline,
                images_before_json = excluded.images_before_json,
                images_after_json = excluded.images_after_json,
                comments_json = excluded.comments_json,
                updated_at = excluded.updated_at`,
        args: cleanArgs([
            ncr.id, 
            inspection_id, 
            ncr.itemId || '', 
            ncr.defect_code || '', 
            ncr.severity || 'MINOR', 
            ncr.status || 'OPEN', 
            ncr.issueDescription, 
            ncr.rootCause || '', 
            ncr.solution || '', 
            ncr.responsiblePerson || '', 
            ncr.deadline || '', 
            JSON.stringify(ncr.imagesBefore || []), 
            JSON.stringify(ncr.imagesAfter || []), 
            JSON.stringify(ncr.comments || []), 
            createdBy, 
            now, 
            now
        ])
    });
    return ncr.id;
};

export const getDefects = async (params: { status?: string }) => {
    const ncrs = await getNcrs({ status: params.status });
    return ncrs.map(n => ({
        id: n.id,
        inspectionId: n.inspection_id || '',
        itemId: n.itemId || '',
        defectCode: n.defect_code || 'N/A',
        category: 'Quality',
        description: n.issueDescription,
        status: n.status,
        severity: n.severity || 'MINOR',
        inspectorName: n.responsiblePerson || 'QA/QC',
        date: n.createdDate.split('T')[0],
        ma_ct: 'Dự án', 
        ten_ct: 'Dự án',
        images: n.imagesBefore || []
    } as unknown as Defect));
};

export const getDefectLibrary = async (): Promise<DefectLibraryItem[]> => {
    const res = await turso.execute("SELECT * FROM defect_library ORDER BY defect_code ASC");
    return res.rows.map(r => ({
        id: r.id,
        code: r.defect_code,
        name: r.name,
        stage: r.stage,
        category: r.category,
        description: r.description,
        severity: r.severity,
        suggestedAction: r.suggested_action,
        correctImage: r.correct_image,
        incorrectImage: r.incorrect_image,
        createdBy: r.created_by,
        createdAt: r.created_at
    } as unknown as DefectLibraryItem));
};

export const saveDefectLibraryItem = async (item: DefectLibraryItem) => {
    await turso.execute({
        sql: `INSERT INTO defect_library (id, defect_code, name, stage, category, description, severity, suggested_action, correct_image, incorrect_image, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(defect_code) DO UPDATE SET 
                name = excluded.name, stage = excluded.stage, category = excluded.category, 
                description = excluded.description, severity = excluded.severity, 
                suggested_action = excluded.suggested_action, correct_image = excluded.correct_image, 
                incorrect_image = excluded.incorrect_image`,
        args: cleanArgs([item.id, item.code, item.name, item.stage, item.category, item.description, item.severity, item.suggestedAction, item.correctImage, item.incorrectImage, item.createdBy, item.createdAt])
    });
};

export const deleteDefectLibraryItem = async (id: string) => {
    await turso.execute({ sql: "DELETE FROM defect_library WHERE id = ?", args: cleanArgs([id]) });
};

export const getUsers = async (): Promise<User[]> => {
    const res = await turso.execute("SELECT data FROM users");
    return res.rows.map(r => JSON.parse(r.data as string));
};

export const saveUser = async (user: User) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO users (id, data, username, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, role = excluded.role, updated_at = excluded.updated_at`,
        args: cleanArgs([user.id, JSON.stringify(user), user.username, user.role, now, now])
    });
};

export const importUsers = async (users: User[]) => {
    for (const user of users) {
        await saveUser(user);
    }
};

export const deleteUser = async (id: string) => {
    await turso.execute({ sql: `DELETE FROM users WHERE id = ?`, args: cleanArgs([id]) });
};

export const getWorkshops = async (): Promise<Workshop[]> => {
    const res = await turso.execute("SELECT data FROM workshops");
    return res.rows.map(r => JSON.parse(r.data as string));
};

export const saveWorkshop = async (ws: Workshop) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO workshops (id, data, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, code = excluded.code, name = excluded.name, updated_at = excluded.updated_at`,
        args: cleanArgs([ws.id, JSON.stringify(ws), ws.code, ws.name, now, now])
    });
};

export const deleteWorkshop = async (id: string) => {
    await turso.execute({ sql: `DELETE FROM workshops WHERE id = ?`, args: cleanArgs([id]) });
};

export const getTemplates = async (): Promise<Record<string, CheckItem[]>> => {
    const res = await turso.execute("SELECT moduleId, data FROM templates");
    const result: Record<string, CheckItem[]> = {};
    res.rows.forEach(r => { result[r.moduleId as string] = JSON.parse(r.data as string); });
    return result;
};

export const saveTemplate = async (moduleId: string, data: CheckItem[]) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO templates (moduleId, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(moduleId) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        args: cleanArgs([moduleId, JSON.stringify(data), now])
    });
};

export const getRoles = async (): Promise<Role[]> => {
    const res = await turso.execute("SELECT data FROM roles");
    return res.rows.map(r => JSON.parse(r.data as string));
};

export const saveRole = async (role: Role) => {
    const now = Math.floor(Date.now() / 1000);
    await turso.execute({
        sql: `INSERT INTO roles (id, data, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        args: cleanArgs([role.id, JSON.stringify(role), now, now])
    });
};

export const deleteRole = async (id: string) => {
    await turso.execute({ sql: `DELETE FROM roles WHERE id = ?`, args: cleanArgs([id]) });
};
