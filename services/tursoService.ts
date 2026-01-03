import { turso, isTursoConfigured } from "./tursoConfig";
import { 
  PlanFilter, 
  Inspection, 
  User, 
  Workshop, 
  PlanItem, 
  Project, 
  CheckItem,
  InspectionStatus
} from "../types";

/**
 * INITIALIZE DATABASE TABLES
 */
export const initDatabase = async () => {
  if (!isTursoConfigured) return;
  try {
    // Plans Table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        headcode TEXT,
        ma_ct TEXT NOT NULL,
        ten_ct TEXT NOT NULL,
        ma_nha_may TEXT,
        ten_hang_muc TEXT,
        dvt TEXT,
        so_luong_ipo REAL DEFAULT 0,
        ngay_kh TEXT,
        assignee TEXT,
        status TEXT DEFAULT 'PENDING',
        pthsp TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);
    
    // Inspections Table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS inspections (
        id TEXT PRIMARY KEY, 
        data TEXT, 
        created_at INTEGER, 
        updated_at INTEGER, 
        created_by TEXT,
        ma_ct TEXT,
        ma_nha_may TEXT,
        status TEXT
      )
    `);

    // Users Table
    await turso.execute(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT)`);
    
    // Workshops Table
    await turso.execute(`CREATE TABLE IF NOT EXISTS workshops (id TEXT PRIMARY KEY, data TEXT)`);
    
    // Templates Table
    await turso.execute(`CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, data TEXT)`);

    // Projects Table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE,
        name TEXT,
        ma_ct TEXT,
        ten_ct TEXT,
        manager TEXT,
        pc TEXT,
        qa TEXT,
        location TEXT,
        start_date TEXT,
        end_date TEXT,
        status TEXT,
        progress INTEGER,
        description TEXT,
        thumbnail TEXT,
        images TEXT
      )
    `);

    console.log("✅ Database tables verified and ready.");
  } catch (e) {
    console.error("❌ Database initialization failed:", e);
  }
};

export const testConnection = async (): Promise<boolean> => {
    if (!isTursoConfigured) return false;
    try {
        await turso.execute("SELECT 1");
        return true;
    } catch (e) {
        return false;
    }
};

/**
 * PLANS LOGIC
 */
export const getPlans = async (filter: PlanFilter) => {
    if (!isTursoConfigured) return { items: [], total: 0 };
    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const offset = (page - 1) * limit;
    
    let whereClauses: string[] = [];
    let args: any[] = [];
    
    if (filter.search) {
      whereClauses.push(`(ma_ct LIKE ? OR ten_hang_muc LIKE ? OR headcode LIKE ? OR ma_nha_may LIKE ?)`);
      const term = `%${filter.search}%`;
      args.push(term, term, term, term);
    }
    
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    const countResult = await turso.execute({ sql: `SELECT COUNT(*) as total FROM plans ${whereSql}`, args });
    const total = Number(countResult.rows[0]?.total || 0);
    
    const sql = `SELECT * FROM plans ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const result = await turso.execute({ sql, args: [...args, limit, offset] });
    
    return { 
        items: result.rows.map((row: any) => ({
            id: row.id,
            headcode: row.headcode,
            ma_ct: row.ma_ct,
            ten_ct: row.ten_ct,
            ma_nha_may: row.ma_nha_may,
            ten_hang_muc: row.ten_hang_muc,
            dvt: row.dvt,
            so_luong_ipo: Number(row.so_luong_ipo),
            plannedDate: row.ngay_kh,
            status: row.status,
            assignee: row.assignee
        })), 
        total 
    };
};

export const importPlansBatch = async (plans: PlanItem[]) => {
    if (!isTursoConfigured) return;
    for (const p of plans) {
        await turso.execute({
            sql: `INSERT INTO plans (headcode, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, dvt, so_luong_ipo, ngay_kh, assignee, status) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [p.headcode || '', p.ma_ct, p.ten_ct, p.ma_nha_may || '', p.ten_hang_muc, p.dvt || 'PCS', p.so_luong_ipo, p.plannedDate || '', p.assignee || '', p.status || 'PENDING']
        });
    }
};

/**
 * INSPECTIONS LOGIC
 */
export const getAllInspections = async (filters: any = {}) => {
    if (!isTursoConfigured) return [];
    let sql = `SELECT data FROM inspections`;
    let where: string[] = [];
    let args: any[] = [];

    if (filters.status) {
        where.push("status = ?");
        args.push(filters.status);
    }

    if (where.length > 0) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY updated_at DESC";

    const res = await turso.execute({ sql, args });
    return res.rows.map(r => JSON.parse(r.data as string)) as Inspection[];
};

export const saveInspection = async (i: Inspection) => {
    if (!isTursoConfigured) return;
    await turso.execute({
        sql: `INSERT INTO inspections (id, data, created_at, updated_at, created_by, ma_ct, ma_nha_may, status) 
              VALUES (?, ?, unixepoch(), unixepoch(), ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET 
                data = excluded.data, 
                updated_at = unixepoch(),
                status = excluded.status`,
        args: [i.id, JSON.stringify(i), i.inspectorName, i.ma_ct, i.ma_nha_may || '', i.status]
    });
};

export const deleteInspection = async (id: string) => {
    if (!isTursoConfigured) return;
    await turso.execute({ sql: "DELETE FROM inspections WHERE id = ?", args: [id] });
};

/**
 * USERS LOGIC
 */
export const getUsers = async (): Promise<User[]> => {
    if (!isTursoConfigured) return [];
    try {
        const result = await turso.execute("SELECT data FROM users");
        return result.rows.map(row => JSON.parse(row.data as string));
    } catch (e) { return []; }
};

export const saveUser = async (user: User): Promise<void> => {
    if (!isTursoConfigured) return;
    await turso.execute({
        sql: "INSERT INTO users (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
        args: [user.id, JSON.stringify(user)]
    });
};

export const deleteUser = async (id: string): Promise<void> => {
    if (!isTursoConfigured) return;
    await turso.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
};

export const importUsers = async (users: User[]): Promise<void> => {
    if (!isTursoConfigured) return;
    for (const user of users) {
        await saveUser(user);
    }
};

/**
 * WORKSHOPS LOGIC
 */
export const getWorkshops = async (): Promise<Workshop[]> => {
    if (!isTursoConfigured) return [];
    const res = await turso.execute("SELECT data FROM workshops");
    return res.rows.map(r => JSON.parse(r.data as string));
};

export const saveWorkshop = async (w: Workshop) => {
    if (!isTursoConfigured) return;
    await turso.execute({
        sql: "INSERT INTO workshops (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
        args: [w.id, JSON.stringify(w)]
    });
};

export const deleteWorkshop = async (id: string) => {
    if (!isTursoConfigured) return;
    await turso.execute({ sql: "DELETE FROM workshops WHERE id = ?", args: [id] });
};

/**
 * TEMPLATES LOGIC
 */
export const getTemplates = async (): Promise<Record<string, CheckItem[]>> => {
    if (!isTursoConfigured) return {};
    const res = await turso.execute("SELECT id, data FROM templates");
    const templates: Record<string, CheckItem[]> = {};
    res.rows.forEach(r => {
        templates[r.id as string] = JSON.parse(r.data as string);
    });
    return templates;
};

export const saveTemplate = async (id: string, items: CheckItem[]) => {
    if (!isTursoConfigured) return;
    await turso.execute({
        sql: "INSERT INTO templates (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
        args: [id, JSON.stringify(items)]
    });
};

/**
 * PROJECTS LOGIC
 */
export const getProjects = async (): Promise<Project[]> => {
    if (!isTursoConfigured) return [];
    const res = await turso.execute("SELECT * FROM projects");
    return res.rows.map(r => ({
        id: r.id as string,
        code: r.code as string,
        name: r.name as string,
        ma_ct: r.ma_ct as string,
        ten_ct: r.ten_ct as string,
        manager: r.manager as string,
        pc: r.pc as string,
        qa: r.qa as string,
        location: r.location as string,
        startDate: r.start_date as string,
        endDate: r.end_date as string,
        status: r.status as any,
        progress: Number(r.progress || 0),
        description: r.description as string,
        thumbnail: r.thumbnail as string,
        images: r.images ? JSON.parse(r.images as string) : []
    }));
};

export const saveProjectMetadata = async (p: Project) => {
    if (!isTursoConfigured) return;
    await turso.execute({
        sql: `INSERT INTO projects (id, code, name, ma_ct, ten_ct, manager, pc, qa, location, start_date, end_date, status, progress, description, thumbnail, images) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET 
                manager = excluded.manager,
                pc = excluded.pc,
                qa = excluded.qa,
                location = excluded.location,
                start_date = excluded.start_date,
                end_date = excluded.end_date,
                status = excluded.status,
                progress = excluded.progress,
                description = excluded.description,
                thumbnail = excluded.thumbnail,
                images = excluded.images`,
        args: [p.id, p.code, p.name, p.ma_ct, p.ten_ct, p.manager, p.pc || '', p.qa || '', p.location || '', p.startDate, p.endDate, p.status, p.progress, p.description || '', p.thumbnail, JSON.stringify(p.images || [])]
    });
};
