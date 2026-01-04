
import { turso, isTursoConfigured } from "./tursoConfig";
import { 
  Inspection, 
  User, 
  Workshop, 
  PlanItem, 
  Project, 
  CheckItem,
  UserRole,
  UserRoleName
} from "../types";

/**
 * Khởi tạo toàn bộ cấu trúc Database.
 * Sử dụng CREATE TABLE IF NOT EXISTS để đảm bảo tính ổn định.
 */
export const initDatabase = async () => {
  if (!isTursoConfigured) return;
  try {
    // 1. Bảng Kế hoạch (plans)
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
      )`);
    
    // 2. Bảng Kiểm tra (inspections)
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS inspections (
        id TEXT PRIMARY KEY, 
        data TEXT, 
        created_at INTEGER DEFAULT (unixepoch()), 
        updated_at INTEGER DEFAULT (unixepoch()), 
        created_by TEXT, 
        ma_ct TEXT, 
        ma_nha_may TEXT, 
        status TEXT,
        type TEXT,
        score INTEGER DEFAULT 0
      )`);
    
    // 3. Các bảng bổ trợ
    await turso.execute(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS workshops (id TEXT PRIMARY KEY, data TEXT)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, data TEXT)`);
    
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, 
        code TEXT UNIQUE, 
        name TEXT, 
        ma_ct TEXT, 
        ten_ct TEXT, 
        pm TEXT, 
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
      )`);

    // Migrations & Indexes
    try { await turso.execute(`ALTER TABLE inspections ADD COLUMN type TEXT`); } catch (e) {}
    try { await turso.execute(`ALTER TABLE inspections ADD COLUMN score INTEGER DEFAULT 0`); } catch (e) {}
    
    await turso.execute(`CREATE INDEX IF NOT EXISTS idx_inspections_ma_ct ON inspections(ma_ct)`);
    await turso.execute(`CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status)`);
    await turso.execute(`CREATE INDEX IF NOT EXISTS idx_plans_ma_ct ON plans(ma_ct)`);
    await turso.execute(`CREATE INDEX IF NOT EXISTS idx_plans_ma_nm ON plans(ma_nha_may)`);
    
    console.log("✅ Database tables and indexes verified.");
  } catch (e) {
    console.error("❌ Database initialization failed:", e);
    throw e; // Ném lỗi để App xử lý overlay nếu cần
  }
};

export const getProjects = async (): Promise<Project[]> => {
  if (!isTursoConfigured) return [];
  const res = await turso.execute("SELECT * FROM projects");
  return res.rows.map(r => ({
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    ma_ct: r.ma_ct as string,
    ten_ct: r.ten_ct as string,
    pm: r.pm as string || '',
    pc: r.pc as string || '',
    qa: r.qa as string || '',
    location: r.location as string || '',
    startDate: r.start_date as string || '',
    endDate: r.end_date as string || '',
    status: (r.status as any) || 'Planning',
    progress: Number(r.progress || 0),
    description: r.description as string || '',
    thumbnail: r.thumbnail as string || '',
    images: r.images ? JSON.parse(r.images as string) : []
  }));
};

export const saveProjectMetadata = async (p: Project) => {
  if (!isTursoConfigured) return;
  await turso.execute({
    sql: `INSERT INTO projects (id, code, name, ma_ct, ten_ct, pm, pc, qa, location, start_date, end_date, status, progress, description, thumbnail, images) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET 
            pm = excluded.pm, pc = excluded.pc, qa = excluded.qa, location = excluded.location,
            start_date = excluded.start_date, end_date = excluded.end_date, status = excluded.status,
            progress = excluded.progress, description = excluded.description, thumbnail = excluded.thumbnail, images = excluded.images`,
    args: [p.id, p.code, p.name, p.ma_ct, p.ten_ct, p.pm, p.pc || '', p.qa || '', p.location || '', p.startDate, p.endDate, p.status, p.progress, p.description || '', p.thumbnail, JSON.stringify(p.images || [])]
  });
};

export const getInspectionsPaginated = async (options: { 
    page?: number; 
    limit?: number; 
    search?: string; 
    status?: string;
    type?: string;
}) => {
  if (!isTursoConfigured) return { items: [], total: 0 };
  
  const { page, limit, search = '', status = '', type = '' } = options;

  let whereClauses = [];
  let filterArgs: any[] = [];

  if (search) {
    whereClauses.push("(ma_ct LIKE ? OR ma_nha_may LIKE ? OR created_by LIKE ?)");
    const t = `%${search}%`;
    filterArgs.push(t, t, t);
  }
  if (status && status !== 'ALL') {
    whereClauses.push("status = ?");
    filterArgs.push(status);
  }
  if (type && type !== 'ALL') {
    whereClauses.push("type = ?");
    filterArgs.push(type);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // 1. Lấy dữ liệu phân trang
  let dataSql = `SELECT id, data, status, type, score, created_at FROM inspections ${whereSql} ORDER BY created_at DESC`;
  let dataArgs = [...filterArgs];

  if (limit !== undefined && page !== undefined) {
    const offset = (page - 1) * limit;
    dataSql += ` LIMIT ? OFFSET ?`;
    dataArgs.push(limit, offset);
  }

  const dataRes = await turso.execute({ sql: dataSql, args: dataArgs });

  // 2. Lấy tổng số bản ghi
  const countRes = await turso.execute({
    sql: `SELECT COUNT(*) as total FROM inspections ${whereSql}`,
    args: filterArgs
  });

  const items = dataRes.rows.map(r => {
      const fullData = JSON.parse(r.data as string);
      return {
          ...fullData,
          id: r.id,
          status: r.status,
          type: r.type,
          score: r.score || 0,
          date: fullData.date || new Date(Number(r.created_at || Date.now() / 1000) * 1000).toISOString().split('T')[0]
      } as Inspection;
  });

  return { items, total: Number(countRes.rows[0].total) };
};

export const getInspectionById = async (id: string): Promise<Inspection | null> => {
    if (!isTursoConfigured) return null;
    const res = await turso.execute({
        sql: "SELECT data FROM inspections WHERE id = ?",
        args: [id]
    });
    if (res.rows.length === 0) return null;
    return JSON.parse(res.rows[0].data as string);
};

export const saveInspection = async (i: Inspection) => {
  if (!isTursoConfigured) return;
  await turso.execute({
    sql: `INSERT INTO inspections (id, data, created_at, updated_at, created_by, ma_ct, ma_nha_may, status, type, score) 
          VALUES (?, ?, unixepoch(), unixepoch(), ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET 
            data = excluded.data, 
            updated_at = unixepoch(), 
            status = excluded.status,
            score = excluded.score`,
    args: [i.id, JSON.stringify(i), i.inspectorName, i.ma_ct, i.ma_nha_may || '', i.status, i.type || 'SITE', i.score || 0]
  });
};

export const getInspectionStatsSummary = async () => {
    if (!isTursoConfigured) return { total: 0, completed: 0, flagged: 0, highPriority: 0 };
    const res = await turso.execute(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status IN ('COMPLETED', 'APPROVED') THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'FLAGGED' THEN 1 ELSE 0 END) as flagged
        FROM inspections
    `);
    const row = res.rows[0];
    return {
        total: Number(row.total),
        completed: Number(row.completed),
        flagged: Number(row.flagged)
    };
};

export const getUsers = async (): Promise<User[]> => {
  if (!isTursoConfigured) return [];
  const usersRes = await turso.execute("SELECT data FROM users");
  return usersRes.rows.map(r => JSON.parse(r.data as string));
};
export const saveUser = async (user: User) => {
  if (!isTursoConfigured) return;
  await turso.execute({
    sql: "INSERT INTO users (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    args: [user.id, JSON.stringify(user)]
  });
};
export const importUsers = async (users: User[]) => {
  if (!isTursoConfigured) return;
  for (const user of users) {
    await turso.execute({
      sql: "INSERT INTO users (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      args: [user.id, JSON.stringify(user)]
    });
  }
};
export const deleteUser = async (id: string) => {
  if (!isTursoConfigured) return;
  await turso.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
};
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
export const getAllInspections = async () => {
  if (!isTursoConfigured) return [];
  const res = await turso.execute(`SELECT data FROM inspections ORDER BY created_at DESC`);
  return res.rows.map(r => JSON.parse(r.data as string)) as Inspection[];
};
export const deleteInspection = async (id: string) => {
  if (!isTursoConfigured) return;
  await turso.execute({ sql: "DELETE FROM inspections WHERE id = ?", args: [id] });
};
export const getTemplates = async (): Promise<Record<string, CheckItem[]>> => {
  if (!isTursoConfigured) return {};
  const res = await turso.execute("SELECT id, data FROM templates");
  const templates: Record<string, CheckItem[]> = {};
  res.rows.forEach(r => { templates[r.id as string] = JSON.parse(r.data as string); });
  return templates;
};
export const saveTemplate = async (moduleId: string, items: CheckItem[]) => {
  if (!isTursoConfigured) return;
  await turso.execute({
    sql: "INSERT INTO templates (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    args: [moduleId, JSON.stringify(items)]
  });
};
export const getPlans = async (filter: { search?: string; page?: number; limit?: number }) => {
  if (!isTursoConfigured) return { items: [], total: 0 };
  const { search = '', page, limit } = filter;
  
  let sql = `SELECT * FROM plans`;
  let args: any[] = [];
  if (search) {
    sql += ` WHERE ma_ct LIKE ? OR ten_hang_muc LIKE ? OR headcode LIKE ? OR ma_nha_may LIKE ?`;
    const t = `%${search}%`;
    args = [t, t, t, t];
  }
  
  sql += ` ORDER BY created_at DESC`;
  
  if (limit !== undefined && page !== undefined) {
    const offset = (page - 1) * limit;
    sql += ` LIMIT ? OFFSET ?`;
    args.push(limit, offset);
  }

  const countRes = await turso.execute({ 
    sql: `SELECT COUNT(*) as total FROM plans ${search ? 'WHERE ma_ct LIKE ? OR ten_hang_muc LIKE ? OR headcode LIKE ? OR ma_nha_may LIKE ?' : ''}`, 
    args: search ? args.slice(0, 4) : [] 
  });
  const dataRes = await turso.execute({ sql, args });
  return { items: dataRes.rows as unknown as PlanItem[], total: Number(countRes.rows[0].total) };
};
export const importPlansBatch = async (plans: PlanItem[]) => {
  if (!isTursoConfigured) return;
  for (const p of plans) {
    await turso.execute({
      sql: `INSERT INTO plans (headcode, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, dvt, so_luong_ipo, ngay_kh, assignee, status) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [p.headcode || '', p.ma_ct, p.ten_ct, p.ma_nha_may || '', p.ten_hang_muc, p.dvt || 'PCS', p.so_luong_ipo, p.plannedDate || '', p.assignee || '', p.status || 'PENDING']
    });
  }
};
export const testConnection = async () => {
  if (!isTursoConfigured) return false;
  try { await turso.execute("SELECT 1"); return true; } catch (e) { return false; }
};
