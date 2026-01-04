
import { turso, isTursoConfigured } from "./tursoConfig";
import { 
  Inspection, 
  User, 
  Workshop, 
  PlanItem, 
  Project, 
  CheckItem,
  UserRole,
  UserRoleName,
  Role,
  PermissionAction
} from "../types";

/**
 * Khởi tạo toàn bộ cấu trúc Database.
 */
export const initDatabase = async () => {
  if (!isTursoConfigured) return;
  try {
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
    
    await turso.execute(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS workshops (id TEXT PRIMARY KEY, data TEXT)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, data TEXT)`);
    await turso.execute(`CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, data TEXT)`);
    
    // SỬ DỤNG BẢNG MỚI 'project_store' ĐỂ TRÁNH XUNG ĐỘT SCHEMA CŨ
    // Cấu trúc (id, data) là cách an toàn nhất để handle các trường động (pm, pc, qa, location...)
    await turso.execute(`CREATE TABLE IF NOT EXISTS project_store (id TEXT PRIMARY KEY, data TEXT)`);

    console.log("✅ Database tables verified.");
  } catch (e) {
    console.error("❌ Database initialization failed:", e);
    throw e;
  }
};

const DEFAULT_ACTIONS: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT'];
const ADMIN_ACTIONS: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT'];

export const getRoles = async (): Promise<Role[]> => {
  if (!isTursoConfigured) return [];
  const res = await turso.execute("SELECT data FROM roles");
  if (res.rows.length === 0) {
      const defaultRoles: Role[] = [
          { 
            id: 'ADMIN', 
            name: 'Quản trị viên', 
            description: 'Toàn quyền hệ thống', 
            permissions: [
              { moduleId: 'IQC', actions: ADMIN_ACTIONS },
              { moduleId: 'PQC', actions: ADMIN_ACTIONS },
              { moduleId: 'FQC', actions: ADMIN_ACTIONS },
              { moduleId: 'SITE', actions: ADMIN_ACTIONS },
              { moduleId: 'PROJECTS', actions: ADMIN_ACTIONS },
              { moduleId: 'CONVERT_3D', actions: ADMIN_ACTIONS },
              { moduleId: 'SETTINGS', actions: ADMIN_ACTIONS }
            ],
            isSystem: true 
          },
          { 
            id: 'QC', 
            name: 'Nhân viên QC', 
            description: 'Thực hiện kiểm tra tại xưởng', 
            permissions: [
              { moduleId: 'IQC', actions: DEFAULT_ACTIONS },
              { moduleId: 'PQC', actions: DEFAULT_ACTIONS },
              { moduleId: 'SITE', actions: DEFAULT_ACTIONS }
            ],
            isSystem: true 
          }
      ];
      return defaultRoles;
  }
  return res.rows.map(r => JSON.parse(r.data as string));
};

export const saveRole = async (role: Role) => {
  if (!isTursoConfigured) return;
  await turso.execute({
    sql: "INSERT INTO roles (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    args: [role.id, JSON.stringify(role)]
  });
};

export const deleteRole = async (id: string) => {
  if (!isTursoConfigured) return;
  await turso.execute({ sql: "DELETE FROM roles WHERE id = ?", args: [id] });
};

export const getProjects = async (): Promise<Project[]> => {
  if (!isTursoConfigured) return [];
  try {
    // Luôn lấy từ project_store để đồng nhất cấu trúc id/data
    const res = await turso.execute("SELECT data FROM project_store");
    return res.rows.map(r => JSON.parse(r.data as string));
  } catch (error) {
    console.error("❌ [getProjects] Failed to fetch from project_store:", error);
    return [];
  }
};

export const saveProjectMetadata = async (p: Project) => {
  if (!isTursoConfigured) return;
  try {
    // Dùng ma_ct làm ID duy nhất trong project_store
    await turso.execute({
      sql: "INSERT INTO project_store (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      args: [p.ma_ct, JSON.stringify(p)]
    });
  } catch (error) {
    console.error("❌ [saveProjectMetadata] Database Error:", error);
    throw error;
  }
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
  let dataSql = `SELECT id, data, status, type, score, created_at FROM inspections ${whereSql} ORDER BY created_at DESC`;
  let dataArgs = [...filterArgs];
  if (limit !== undefined && page !== undefined) {
    const offset = (page - 1) * limit;
    dataSql += ` LIMIT ? OFFSET ?`;
    dataArgs.push(limit, offset);
  }
  const dataRes = await turso.execute({ sql: dataSql, args: dataArgs });
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
    const res = await turso.execute({ sql: "SELECT data FROM inspections WHERE id = ?", args: [id] });
    if (res.rows.length === 0) return null;
    return JSON.parse(res.rows[0].data as string);
};

export const saveInspection = async (i: Inspection) => {
  if (!isTursoConfigured) return;
  await turso.execute({
    sql: `INSERT INTO inspections (id, data, created_at, updated_at, created_by, ma_ct, ma_nha_may, status, type, score) 
          VALUES (?, ?, unixepoch(), unixepoch(), ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET 
            data = excluded.data, updated_at = unixepoch(), status = excluded.status, score = excluded.score`,
    args: [i.id, JSON.stringify(i), i.inspectorName, i.ma_ct, i.ma_nha_may || '', i.status, i.type || 'SITE', i.score || 0]
  });
};

export const deleteInspection = async (id: string) => {
  if (!isTursoConfigured) return;
  await turso.execute({ sql: "DELETE FROM inspections WHERE id = ?", args: [id] });
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
export const deleteUser = async (id: string) => {
  if (!isTursoConfigured) return;
  await turso.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
};

export const importUsers = async (users: User[]) => {
  if (!isTursoConfigured) return;
  for (const user of users) {
    await saveUser(user);
  }
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
