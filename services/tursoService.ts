
import { turso, isTursoConfigured } from "./tursoConfig";
import { CreatePlanInput, PlanFilter, PlanEntity, Inspection, User, Workshop, PlanItem } from "../types";

export const initDatabase = async () => {
  if (!isTursoConfigured) return;
  try {
    // 1. Create tables if not exist (Base schema)
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
    
    // 2. Schema Migration: Ensure Columns Exist
    // This fixes "no such column" errors if the table was created with different column names or is missing fields
    const ensureColumn = async (table: string, column: string, type: string, sourceCol?: string, defaultValue?: string) => {
        try {
            await turso.execute(`SELECT ${column} FROM ${table} LIMIT 1`);
        } catch (e: any) {
            if (String(e).includes("no such column")) {
                console.log(`⚠️ Migrating ${table}: Adding missing column '${column}'...`);
                try {
                    let alterSql = `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`;
                    if (defaultValue !== undefined) {
                        alterSql += ` DEFAULT ${defaultValue}`;
                    }
                    await turso.execute(alterSql);
                    
                    if (sourceCol) {
                        // Sync data from source column if available
                        await turso.execute(`UPDATE ${table} SET ${column} = ${sourceCol} WHERE ${column} IS NULL AND ${sourceCol} IS NOT NULL`);
                    }
                } catch (alterErr) {
                    console.error(`Failed to add column ${column}:`, alterErr);
                }
            }
        }
    };

    // Run migrations for mapping columns
    await ensureColumn('plans', 'ma_nm_id', 'TEXT', 'ma_nha_may');
    await ensureColumn('plans', 'ten_sp', 'TEXT', 'ten_hang_muc');
    await ensureColumn('plans', 'sl_dh', 'REAL', 'so_luong_ipo');
    await ensureColumn('plans', 'don_vi', 'TEXT', 'dvt');
    
    await ensureColumn('plans', 'ma_nha_may', 'TEXT', 'ma_nm_id');
    await ensureColumn('plans', 'ten_hang_muc', 'TEXT', 'ten_sp');
    await ensureColumn('plans', 'so_luong_ipo', 'REAL', 'sl_dh');
    await ensureColumn('plans', 'dvt', 'TEXT', 'don_vi');

    // Run migrations for metadata columns (Fixing 'no such column: ngay_kh' error)
    await ensureColumn('plans', 'ngay_kh', 'TEXT');
    await ensureColumn('plans', 'assignee', 'TEXT');
    await ensureColumn('plans', 'status', 'TEXT', undefined, "'PENDING'");
    await ensureColumn('plans', 'pthsp', 'TEXT');

    // Create inspections table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS inspections (
        id TEXT PRIMARY KEY,
        data TEXT,
        created_at INTEGER,
        updated_at INTEGER
      )
    `);
    
    // Ensure columns for inspections table
    await ensureColumn('inspections', 'data', 'TEXT');
    await ensureColumn('inspections', 'created_at', 'INTEGER');
    await ensureColumn('inspections', 'updated_at', 'INTEGER');

    // Create users table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `);
    await ensureColumn('users', 'data', 'TEXT');

    // Create workshops table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS workshops (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `);
    await ensureColumn('workshops', 'data', 'TEXT');

    console.log("✅ Database tables verified & migrated");
  } catch (e) {
    console.error("❌ Database initialization failed:", e);
  }
};

export const testConnection = async (): Promise<boolean> => {
    if (!isTursoConfigured) return false;
    try {
        await turso.execute("SELECT 1");
        await initDatabase(); // Run init/migration on connection test
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

    // Sử dụng tên cột chuẩn (ma_nha_may, ten_hang_muc,...) để tránh lỗi 'no such column'
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

      // Select query sử dụng alias trực tiếp cho các cột chuẩn của ứng dụng
      const sql = `
        SELECT 
          id,
          headcode,
          ma_ct,
          ten_ct,
          ma_nha_may, 
          ten_hang_muc,
          dvt,
          so_luong_ipo,
          ngay_kh as plannedDate,
          assignee,
          status,
          pthsp,
          created_at
        FROM plans
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      
      const result = await turso.execute({
        sql,
        args: [...args, limit, offset]
      });

      // Map DB Entity to Application Item
      const items: PlanItem[] = result.rows.map((row: any) => ({
          id: row.id,
          headcode: row.headcode || '',
          ma_ct: row.ma_ct || '',
          ten_ct: row.ten_ct || '',
          ma_nha_may: row.ma_nha_may || '',
          ten_hang_muc: row.ten_hang_muc || '',
          dvt: row.dvt || 'PCS',
          so_luong_ipo: Number(row.so_luong_ipo || 0),
          plannedDate: row.plannedDate || '',
          status: row.status || 'PENDING',
          assignee: row.assignee || 'QC',
          pthsp: row.pthsp,
          created_at: row.created_at
      }));

      return { items, total };

    } catch (error: any) {
      // Auto-recover if table/columns missing by re-running init
      if (String(error).includes("no such table") || String(error).includes("no such column")) {
          console.warn("Database schema issue detected, attempting repair...", error.message);
          await initDatabase();
          // We can't easily retry recursively without risk of infinite loop, 
          // but the UI 'Refresh' button will work on next click.
          // Or return empty to avoid crash
          return { items: [], total: 0 }; 
      }
      console.error("getPlans Error:", error);
      throw error;
    }
};

export const getPlanById = async (id: number): Promise<PlanEntity | null> => {
    if (!isTursoConfigured) return null;
    try {
        const result = await turso.execute({
          sql: `SELECT 
            id, headcode, ma_ct, ten_ct, 
            ma_nha_may, 
            ten_hang_muc, 
            dvt, 
            so_luong_ipo, 
            ngay_kh, assignee, status, pthsp,
            created_at 
            FROM plans WHERE id = ?`,
          args: [id]
        });
        return (result.rows[0] as unknown as PlanEntity) || null;
    } catch (e) { return null; }
};

export const createPlan = async (data: CreatePlanInput): Promise<PlanEntity> => {
    if (!isTursoConfigured) throw new Error("Database not connected");
    
    // Ensure both columns are populated to maintain compatibility
    const sql = `
      INSERT INTO plans (
        headcode, ma_ct, ten_ct, 
        ma_nha_may, ma_nm_id, 
        ten_hang_muc, ten_sp, 
        dvt, don_vi, 
        so_luong_ipo, sl_dh, 
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      RETURNING id, headcode, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, dvt, so_luong_ipo, created_at
    `;
    const args = [
      data.headcode, 
      data.ma_ct, 
      data.ten_ct, 
      data.ma_nha_may || null, data.ma_nha_may || null, // Fill both
      data.ten_hang_muc, data.ten_hang_muc, // Fill both
      data.dvt || 'PCS', data.dvt || 'PCS', // Fill both
      data.so_luong_ipo || 0, data.so_luong_ipo || 0 // Fill both
    ];
    const result = await turso.execute({ sql, args });
    return result.rows[0] as unknown as PlanEntity;
};

export const updatePlan = async (id: number, data: Partial<CreatePlanInput>): Promise<PlanEntity | null> => {
    if (!isTursoConfigured) return null;
    const updates: string[] = [];
    const args: any[] = [];
    
    // Map fields to ALL DB columns to keep them in sync
    const fieldMapping: Record<string, string[]> = {
        ma_nha_may: ['ma_nha_may', 'ma_nm_id'],
        ten_hang_muc: ['ten_hang_muc', 'ten_sp'],
        dvt: ['dvt', 'don_vi'],
        so_luong_ipo: ['so_luong_ipo', 'sl_dh']
    };

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        // If field has mapped columns, update all of them
        const dbCols = fieldMapping[key] || [key];
        dbCols.forEach(col => {
            updates.push(`${col} = ?`);
            args.push(value);
        });
      }
    });
    
    if (updates.length === 0) return await getPlanById(id);
    args.push(id);
    
    const sql = `UPDATE plans SET ${updates.join(', ')} WHERE id = ? RETURNING *`;
    const result = await turso.execute({ sql, args });
    
    // Normalize return
    const row = result.rows[0] as any;
    if (!row) return null;
    
    return {
        id: row.id,
        headcode: row.headcode,
        ma_ct: row.ma_ct,
        ten_ct: row.ten_ct,
        ma_nha_may: row.ma_nha_may || row.ma_nm_id,
        ten_hang_muc: row.ten_hang_muc || row.ten_sp,
        dvt: row.dvt || row.don_vi,
        so_luong_ipo: row.so_luong_ipo || row.sl_dh,
        created_at: row.created_at
    } as PlanEntity;
};

export const deletePlan = async (id: number): Promise<boolean> => {
    if (!isTursoConfigured) return false;
    const result = await turso.execute({
        sql: "DELETE FROM plans WHERE id = ?",
        args: [id]
    });
    return result.rowsAffected > 0;
};

export const importPlans = async (plans: PlanItem[]): Promise<void> => {
   if (!isTursoConfigured) return;
   
   await initDatabase();

   for (const p of plans) {
       try {
         // Create raw SQL to insert into legacy columns too
         // We reuse createPlan logic but ensure metadata is passed if available
         
         const sql = `
            INSERT INTO plans (
                headcode, ma_ct, ten_ct, 
                ma_nha_may, ma_nm_id, 
                ten_hang_muc, ten_sp, 
                dvt, don_vi, 
                so_luong_ipo, sl_dh,
                ngay_kh, assignee, status, pthsp,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
         `;
         const args = [
             p.headcode || '',
             p.ma_ct,
             p.ten_ct,
             p.ma_nha_may, p.ma_nha_may,
             p.ten_hang_muc, p.ten_hang_muc,
             p.dvt || 'PCS', p.dvt || 'PCS',
             p.so_luong_ipo, p.so_luong_ipo,
             p.plannedDate || null,
             p.assignee || 'QC',
             'PENDING',
             p.pthsp || null
         ];
         await turso.execute({ sql, args });

       } catch (e) {
           console.error("Failed to import plan", p, e);
       }
   }
};

// --- INSPECTIONS (Stored as JSON for flexibility) ---

export const getAllInspections = async (): Promise<Inspection[]> => {
    if (!isTursoConfigured) return [];
    try {
        const result = await turso.execute("SELECT data FROM inspections ORDER BY created_at DESC");
        // Ensure we filter out any null results from bad JSON parsing
        return result.rows
            .map(row => {
                try {
                    return JSON.parse(row.data as string);
                } catch (e) {
                    return null;
                }
            })
            .filter(item => item !== null) as Inspection[];
    } catch (e) {
        console.warn("Could not fetch inspections (table might be missing)");
        await initDatabase();
        return [];
    }
};

export const saveInspection = async (inspection: Inspection): Promise<void> => {
    if (!isTursoConfigured) return;
    try {
        const exists = await turso.execute({sql: "SELECT 1 FROM inspections WHERE id = ?", args: [inspection.id]});
        if (exists.rows.length > 0) {
             await turso.execute({
                sql: "UPDATE inspections SET data = ?, updated_at = unixepoch() WHERE id = ?",
                args: [JSON.stringify(inspection), inspection.id]
             });
        } else {
             await turso.execute({
                sql: "INSERT INTO inspections (id, data, created_at) VALUES (?, ?, unixepoch())",
                args: [inspection.id, JSON.stringify(inspection)]
             });
        }
    } catch(e) { console.error("Error saving inspection", e); }
};

export const deleteInspection = async (id: string): Promise<void> => {
     if (!isTursoConfigured) return;
     try {
         await turso.execute({sql: "DELETE FROM inspections WHERE id = ?", args: [id]});
     } catch(e) { console.error(e); }
};

// --- USERS (Stored as JSON) ---

export const getUsers = async (): Promise<User[]> => {
    if (!isTursoConfigured) return [];
    try {
        const result = await turso.execute("SELECT data FROM users");
        return result.rows
            .map(row => {
                try { return JSON.parse(row.data as string); } catch(e) { return null; }
            })
            .filter(item => item !== null) as User[];
    } catch (e) { return []; }
};

export const saveUser = async (user: User): Promise<void> => {
    if (!isTursoConfigured) return;
    try {
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
    } catch(e) { console.error("Error saving user", e); }
};

export const deleteUser = async (id: string): Promise<void> => {
     if (!isTursoConfigured) return;
     try {
         await turso.execute({sql: "DELETE FROM users WHERE id = ?", args: [id]});
     } catch(e) { console.error(e); }
};

// --- WORKSHOPS (Stored as JSON) ---

export const getWorkshops = async (): Promise<Workshop[]> => {
    if (!isTursoConfigured) return [];
    try {
        const result = await turso.execute("SELECT data FROM workshops");
        return result.rows
            .map(row => {
                try { return JSON.parse(row.data as string); } catch(e) { return null; }
            })
            .filter(item => item !== null) as Workshop[];
    } catch (e) { return []; }
};

export const saveWorkshop = async (workshop: Workshop): Promise<void> => {
    if (!isTursoConfigured) return;
    try {
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
    } catch(e) { console.error("Error saving workshop", e); }
};

export const deleteWorkshop = async (id: string): Promise<void> => {
     if (!isTursoConfigured) return;
     try {
         await turso.execute({sql: "DELETE FROM workshops WHERE id = ?", args: [id]});
     } catch(e) { console.error(e); }
};
