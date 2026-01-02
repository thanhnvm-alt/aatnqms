
import { turso, isTursoConfigured } from "./tursoConfig";
import { CreatePlanInput, PlanFilter, PlanEntity, Inspection, User, Workshop, PlanItem, Project } from "../types";

export const initDatabase = async () => {
  if (!isTursoConfigured) return;
  try {
    // 1. Create tables if not exist
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
        created_at INTEGER DEFAULT 0
      )
    `);
    
    // Create inspections table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS inspections (
        id TEXT PRIMARY KEY,
        data TEXT,
        created_at INTEGER,
        updated_at INTEGER
      )
    `);

    // Create users table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `);

    // Create workshops table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS workshops (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `);

    // Create projects table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        code TEXT PRIMARY KEY,
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

    console.log("✅ Database tables verified");
  } catch (e) {
    console.error("❌ Database initialization failed:", e);
  }
};

export const testConnection = async (): Promise<boolean> => {
    if (!isTursoConfigured) return false;
    try {
        await turso.execute("SELECT 1");
        await initDatabase(); 
        return true;
    } catch (e) {
        console.error("Turso connection failed:", e);
        return false;
    }
};

// --- PLANS ---

export const getPlans = async (filter: PlanFilter): Promise<{ items: PlanItem[], total: number }> => {
    if (!isTursoConfigured) throw new Error("Database connection not configured");

    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;
    
    let whereClauses: string[] = [];
    let args: (string | number)[] = [];

    if (filter.search) {
      whereClauses.push(`(ma_ct LIKE ? OR ten_hang_muc LIKE ? OR headcode LIKE ? OR ma_nha_may LIKE ?)`);
      const term = `%${filter.search}%`;
      args.push(term, term, term, term);
    }
    if (filter.ma_ct) {
      whereClauses.push(`ma_ct = ?`);
      args.push(filter.ma_ct);
    }
    if (filter.ma_nha_may) {
      whereClauses.push(`ma_nha_may = ?`);
      args.push(filter.ma_nha_may);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    try {
      const countResult = await turso.execute({
        sql: `SELECT COUNT(*) as total FROM plans ${whereSql}`,
        args
      });
      const total = Number(countResult.rows[0]?.total || 0);

      const sql = `
        SELECT *
        FROM plans
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      
      const result = await turso.execute({
        sql,
        args: [...args, limit, offset]
      });

      const items: PlanItem[] = result.rows.map((row: any) => ({
          id: row.id,
          headcode: row.headcode || '',
          ma_ct: row.ma_ct || '',
          ten_ct: row.ten_ct || '',
          ma_nha_may: row.ma_nha_may || '',
          ten_hang_muc: row.ten_hang_muc || '',
          dvt: row.dvt || 'PCS',
          so_luong_ipo: Number(row.so_luong_ipo || 0),
          plannedDate: row.ngay_kh || '',
          status: row.status || 'PENDING',
          assignee: row.assignee || 'QC',
          pthsp: row.pthsp,
          created_at: row.created_at
      }));

      return { items, total };

    } catch (error: any) {
      if (String(error).includes("no such table") || String(error).includes("no such column")) {
          console.warn("Schema issue, attempting repair...", error.message);
          await initDatabase();
          return { items: [], total: 0 }; 
      }
      throw error;
    }
};

// --- INSPECTIONS ---

export const getAllInspections = async (): Promise<Inspection[]> => {
    if (!isTursoConfigured) return [];
    // Propagate error to let caller handle fallback
    const result = await turso.execute("SELECT data FROM inspections ORDER BY created_at DESC");
    return result.rows
        .map(row => {
            try {
                return JSON.parse(row.data as string);
            } catch (e) {
                return null;
            }
        })
        .filter(item => item !== null) as Inspection[];
};

export const saveInspection = async (inspection: Inspection): Promise<void> => {
    if (!isTursoConfigured) throw new Error("Database not connected");
    const now = Math.floor(Date.now() / 1000);
    
    // Removed try-catch to allow error propagation to apiService
    const exists = await turso.execute({sql: "SELECT 1 FROM inspections WHERE id = ?", args: [inspection.id]});
    
    if (exists.rows.length > 0) {
            await turso.execute({
            sql: "UPDATE inspections SET data = ?, updated_at = ? WHERE id = ?",
            args: [JSON.stringify(inspection), now, inspection.id]
            });
    } else {
            await turso.execute({
            sql: "INSERT INTO inspections (id, data, created_at) VALUES (?, ?, ?)",
            args: [inspection.id, JSON.stringify(inspection), now]
            });
    }
};

export const deleteInspection = async (id: string): Promise<void> => {
     if (!isTursoConfigured) return;
     await turso.execute({sql: "DELETE FROM inspections WHERE id = ?", args: [id]});
};

// --- USERS ---

export const getUsers = async (): Promise<User[]> => {
    if (!isTursoConfigured) return [];
    const result = await turso.execute("SELECT data FROM users");
    return result.rows
        .map(row => {
            try { return JSON.parse(row.data as string); } catch(e) { return null; }
        })
        .filter(item => item !== null) as User[];
};

export const saveUser = async (user: User): Promise<void> => {
    if (!isTursoConfigured) return;
    const exists = await turso.execute({sql: "SELECT 1 FROM users WHERE id = ?", args: [user.id]});
    if (exists.rows.length > 0) {
            await turso.execute({
            sql: "UPDATE users SET data = ? WHERE id = ?",
            args: [JSON.stringify(user), user.id]
            });
    } else {
            await turso.execute({
            sql: "INSERT INTO users (id, data) VALUES (?, ?)",
            args: [user.id, JSON.stringify(user)]
            });
    }
};

export const deleteUser = async (id: string): Promise<void> => {
     if (!isTursoConfigured) return;
     await turso.execute({sql: "DELETE FROM users WHERE id = ?", args: [id]});
};

// --- WORKSHOPS ---

export const getWorkshops = async (): Promise<Workshop[]> => {
    if (!isTursoConfigured) return [];
    const result = await turso.execute("SELECT data FROM workshops");
    return result.rows
        .map(row => {
            try { return JSON.parse(row.data as string); } catch(e) { return null; }
        })
        .filter(item => item !== null) as Workshop[];
};

export const saveWorkshop = async (workshop: Workshop): Promise<void> => {
    if (!isTursoConfigured) return;
    const exists = await turso.execute({sql: "SELECT 1 FROM workshops WHERE id = ?", args: [workshop.id]});
    if (exists.rows.length > 0) {
            await turso.execute({
            sql: "UPDATE workshops SET data = ? WHERE id = ?",
            args: [JSON.stringify(workshop), workshop.id]
            });
    } else {
            await turso.execute({
            sql: "INSERT INTO workshops (id, data) VALUES (?, ?)",
            args: [workshop.id, JSON.stringify(workshop)]
            });
    }
};

export const deleteWorkshop = async (id: string): Promise<void> => {
     if (!isTursoConfigured) return;
     await turso.execute({sql: "DELETE FROM workshops WHERE id = ?", args: [id]});
};

// --- PROJECTS ---

export const getProjects = async (): Promise<Project[]> => {
    if (!isTursoConfigured) return [];
    const result = await turso.execute("SELECT * FROM projects");
    
    // Also fetch distinct projects from plans to merge
    const planProjects = await turso.execute("SELECT DISTINCT ma_ct, ten_ct FROM plans WHERE ma_ct IS NOT NULL");
    
    const dbProjects = result.rows.map((row: any) => ({
        id: row.code,
        code: row.code,
        name: row.code, // Placeholder if no name column in projects table, logic handled in merge
        ma_ct: row.code,
        ten_ct: '',
        manager: row.manager,
        pc: row.pc,
        qa: row.qa,
        location: row.location,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
        progress: row.progress,
        description: row.description,
        thumbnail: row.thumbnail,
        images: row.images ? JSON.parse(row.images) : []
    }));

    // Merge logic... simplified for now to return DB projects or mock if empty
    return dbProjects as unknown as Project[];
};

export const saveProjectMetadata = async (project: Project): Promise<void> => {
    if (!isTursoConfigured) return;
    await turso.execute({
        sql: `
            INSERT INTO projects (code, manager, pc, qa, location, start_date, end_date, status, progress, description, thumbnail, images)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET
                manager=excluded.manager,
                pc=excluded.pc,
                qa=excluded.qa,
                location=excluded.location,
                start_date=excluded.start_date,
                end_date=excluded.end_date,
                status=excluded.status,
                progress=excluded.progress,
                description=excluded.description,
                thumbnail=excluded.thumbnail,
                images=excluded.images
        `,
        args: [
            project.ma_ct,
            project.manager,
            project.pc || '',
            project.qa || '',
            project.location || '',
            project.startDate,
            project.endDate,
            project.status,
            project.progress,
            project.description || '',
            project.thumbnail,
            JSON.stringify(project.images || [])
        ]
    });
};

export const importPlans = async (plans: PlanItem[]): Promise<void> => {
   if (!isTursoConfigured) return;
   
   await initDatabase();
   const now = Math.floor(Date.now() / 1000);

   const batchSize = 50;
   for (let i = 0; i < plans.length; i += batchSize) {
       const batch = plans.slice(i, i + batchSize);
       // Simple sequential insert to avoid huge transaction logs
       for (const p of batch) {
           try {
             await turso.execute({
                sql: `
                    INSERT INTO plans (
                        headcode, ma_ct, ten_ct, 
                        ma_nha_may, 
                        ten_hang_muc, 
                        dvt, 
                        so_luong_ipo, 
                        ngay_kh, assignee, status, pthsp,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                args: [
                    p.headcode || '',
                    p.ma_ct,
                    p.ten_ct,
                    p.ma_nha_may, 
                    p.ten_hang_muc,
                    p.dvt || 'PCS',
                    p.so_luong_ipo,
                    p.plannedDate || null,
                    p.assignee || 'QC',
                    'PENDING',
                    p.pthsp || null,
                    now
                ]
             });
           } catch(e) {
               console.error("Insert failed for plan", p, e);
           }
       }
   }
};
