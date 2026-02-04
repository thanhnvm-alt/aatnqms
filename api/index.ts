
import express, { Request, Response, RequestHandler } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as dbHelpers from '../lib/db-helpers';
import { db } from '../lib/db';
import { PlanInput } from '../lib/validations';
import { User, ModuleId, UserRole } from '../types';
import { QueryResultRow } from 'pg';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors() as RequestHandler);
app.use(express.json() as RequestHandler);

// Request Logger Middleware
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

// Deep Health Check Handler
const healthHandler = async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    // 1. Basic Connection Check
    await db.query('SELECT 1');
    
    // 2. Schema Verification
    // Check exactly which schema we are connected to
    const schemaRes = await db.query('SELECT current_schema()');
    const currentSchema = schemaRes.rows[0].current_schema;

    // 3. Table Access Check
    // Attempt to count rows in 'ipo' table to verify table visibility within the schema
    // Note: If table names are also mixed case (e.g. "IPO"), you might need quotes here too.
    // We try a safe query first.
    let tableCheck = "ipo";
    let rowCount = 0;
    try {
        const countRes = await db.query('SELECT COUNT(*) as total FROM ipo');
        rowCount = parseInt(countRes.rows[0].total);
    } catch (e) {
        tableCheck = "failed (check table name casing)";
        console.error("Health check table query failed:", e);
    }
    
    const duration = Date.now() - start;

    res.json({ 
      success: true, 
      status: "ok", 
      database: "aaTrackingApps",
      active_schema: currentSchema, // Should be 'appQAQC'
      expected_schema: "appQAQC",
      schema_match: currentSchema === "appQAQC",
      table_check: tableCheck,
      row_count: rowCount,
      latency_ms: duration,
      server_time: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Health Check Failed:", error);
    res.status(503).json({ 
      success: false, 
      status: "error", 
      error: error.message,
      details: "Database connection failed or schema configuration is incorrect."
    });
  }
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler); // Alias for proxy access

/**
 * ISO QMS API: IPOs (Production Orders)
 * Endpoint updated to /api/production/ipos to avoid routing conflicts
 */
app.get('/api/production/ipos', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = (req.query.search as string || '').trim();

    let whereClause = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      // Use quotes for mixed-case columns to ensure PostgreSQL matches correctly
      whereClause = `WHERE "ID_Project" ILIKE $${paramIndex} OR "Project_name" ILIKE $${paramIndex} OR "Material_description" ILIKE $${paramIndex} OR "ID_Factory_Order" ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const offset = (page - 1) * limit;
    
    // Explicitly select mixed-case columns matching the user's DB schema
    const query = `
      SELECT 
        id, 
        "ID_Project", 
        "Project_name", 
        "Material_description", 
        "Base_Unit", 
        "Quantity_IPO", 
        "ID_Factory_Order", 
        "Created_on", 
        "Quantity", 
        "BOQ_type", 
        "IPO_Number", 
        "IPO_Line", 
        "Ma_Tender",
        "createdAt",
        "createdBy"
      FROM ipo
      ${whereClause}
      ORDER BY id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countSql = `SELECT COUNT(*) as total FROM ipo ${whereClause}`;
    
    const [data, countRes] = await Promise.all([
      db.query(query, [...params, limit, offset]),
      db.query(countSql, params)
    ]);

    const total = parseInt(countRes.rows[0]?.total || '0');

    res.json({
      success: true,
      data: data.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error: any) {
    console.error("Error in /api/production/ipos:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ISO QMS API: Plans (Legacy mapping for existing PlanList)
 */
app.get('/api/plans', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string || '').toUpperCase();

    let whereClause = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereClause = `WHERE "ID_Project" ILIKE $${paramIndex} OR "Project_name" ILIKE $${paramIndex} OR "Material_description" ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const offset = (page - 1) * limit;
    
    // Map the new DB columns to the old "Plan" interface expected by PlanList
    const dataSql = `
      SELECT 
        id, 
        "ID_Project" as ma_ct, 
        "Project_name" as ten_ct, 
        "Material_description" as ten_hang_muc, 
        "Base_Unit" as dvt, 
        "Quantity_IPO" as so_luong_ipo, 
        "ID_Factory_Order" as headcode,
        "ID_Factory_Order" as ma_nha_may,
        "Created_on" as planned_date,
        "createdBy" as assignee,
        'PENDING' as status
      FROM ipo 
      ${whereClause} 
      ORDER BY id DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countSql = `SELECT COUNT(*) as total FROM ipo ${whereClause}`;
    
    const [data, countRes] = await Promise.all([
      db.query(dataSql, [...params, limit, offset]),
      db.query(countSql, params)
    ]);

    const total = parseInt(countRes.rows[0]?.total || '0');

    res.json({
      success: true,
      items: data.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error: any) {
    console.error("Error in /api/plans:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ... (Rest of existing endpoints for inspections, users, workshops, projects, floor_plans, layout_pins)

app.get('/api/inspections', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    
    const result = await db.query(`
      SELECT id, type, ma_ct, ten_ct, ten_hang_muc, inspector_name, date, status, score, workshop, ma_nha_may, headcode 
      FROM "inspections" 
      ORDER BY created_at DESC 
      LIMIT $1 OFFSET $2
    `, [limit, (page - 1) * limit]);

    res.json({ success: true, items: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/inspections/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM "inspections" WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Inspection not found" });
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error("API Error fetching inspection:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/inspections', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const result = await dbHelpers.insert('inspections', {
      ...data,
      created_at: Math.floor(Date.now() / 1000)
    });
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.put('/api/inspections/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updatedInspection = await dbHelpers.update('inspections', id, {
      ...data,
      updated_at: Math.floor(Date.now() / 1000)
    });
    res.json({ success: true, data: updatedInspection });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/inspections/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await dbHelpers.deleteById('inspections', id);
    if (!deleted) return res.status(404).json({ success: false, error: "Inspection not found" });
    res.json({ success: true, message: "Inspection deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

interface DbUserRow extends QueryResultRow {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: string;
  allowed_modules?: ModuleId[];
  msnv?: string;
  status?: string;
  position?: string;
  work_location?: string;
  join_date?: string;
  end_date?: string;
  notes?: string;
  created_at: number;
  updated_at?: number;
  avatar?: string;
}

app.get('/api/users', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    
    const users = await dbHelpers.paginate<DbUserRow>('users', page, pageSize);
    const transformedUsers = users.data.map((user: DbUserRow) => {
      const newUser: User = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role as UserRole,
        avatar: user.avatar || '',
        allowedModules: user.allowed_modules,
        msnv: user.msnv,
        position: user.position,
        workLocation: user.work_location,
        status: user.status,
        joinDate: user.join_date,
        endDate: user.end_date,
        notes: user.notes,
      };
      return newUser;
    });
    res.json({ success: true, data: transformedUsers, total: users.total, page: users.page, pageSize: users.pageSize, totalPages: users.totalPages });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/users', async (req: Request, res: Response) => {
  try {
    const { username, password, name, role, allowedModules, msnv, position, workLocation, status, joinDate, education, notes, avatar } = req.body;
    
    if (!username || !password || !name || !role) {
      return res.status(400).json({ success: false, error: "Missing required user fields" });
    }

    const newUser = await dbHelpers.insert('users', {
      username,
      password,
      name,
      role,
      allowed_modules: allowedModules,
      msnv,
      position,
      work_location: workLocation,
      status,
      join_date: joinDate,
      education,
      notes,
      avatar,
      created_at: Math.floor(Date.now() / 1000)
    });
    res.status(201).json({ success: true, data: newUser });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.put('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, password, name, role, allowedModules, msnv, position, workLocation, status, joinDate, education, notes, avatar } = req.body;

    const updateData: Record<string, any> = { updated_at: Math.floor(Date.now() / 1000) };
    if (username) updateData.username = username;
    if (password) updateData.password = password;
    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (allowedModules) updateData.allowed_modules = allowedModules;
    if (msnv) updateData.msnv = msnv;
    if (position) updateData.position = position;
    if (workLocation) updateData.work_location = workLocation;
    if (status) updateData.status = status;
    if (joinDate) updateData.join_date = joinDate;
    if (education) updateData.education = education;
    if (notes) updateData.notes = notes;
    if (avatar) updateData.avatar = avatar;

    const updatedUser = await dbHelpers.update('users', id, updateData);
    res.json({ success: true, data: updatedUser });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await dbHelpers.deleteById('users', id);
    if (!deleted) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, message: "User deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/users/verify', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password are required" });
    }

    const user = await dbHelpers.queryOne<DbUserRow>('SELECT * FROM "users" WHERE username = $1', [username]);
    
    if (user && user.password === password) {
      const transformedUser: User = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role as UserRole,
        avatar: user.avatar || '',
        allowedModules: user.allowed_modules,
        msnv: user.msnv,
        position: user.position,
        workLocation: user.work_location,
        joinDate: user.join_date,
        endDate: user.end_date,
        notes: user.notes,
        password: undefined
      };
      res.json({ success: true, data: transformedUser });
    } else {
      res.status(401).json({ success: false, error: "Invalid credentials" });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/workshops', async (req: Request, res: Response) => {
  try {
    const workshops = await dbHelpers.selectAll('workshops');
    res.json({ success: true, data: workshops });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/workshops', async (req: Request, res: Response) => {
  try {
    const { code, name, location, manager, phone, image, stages } = req.body;
    if (!code || !name) {
      return res.status(400).json({ success: false, error: "Code and name are required for workshop" });
    }
    const newWorkshop = await dbHelpers.insert('workshops', {
      code, name, location, manager, phone, image, stages,
      created_at: Math.floor(Date.now() / 1000)
    });
    res.status(201).json({ success: true, data: newWorkshop });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.put('/api/workshops/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updatedWorkshop = await dbHelpers.update('workshops', id, {
      ...data,
      updated_at: Math.floor(Date.now() / 1000)
    });
    res.json({ success: true, data: updatedWorkshop });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/workshops/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await dbHelpers.deleteById('workshops', id);
    if (!deleted) return res.status(404).json({ success: false, error: "Workshop not found" });
    res.json({ success: true, message: "Workshop deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get('/api/projects', async (req: Request, res: Response) => {
  try {
    const projects = await dbHelpers.selectAll('projects');
    res.json({ success: true, data: projects });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/projects/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updatedProject = await dbHelpers.update('projects', id, {
      ...data,
      updated_at: Math.floor(Date.now() / 1000)
    });
    res.json({ success: true, data: updatedProject });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/floor_plans', async (req: Request, res: Response) => {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ success: false, error: "project_id is required" });
    }
    const plans = await dbHelpers.selectAll('floor_plans', { project_id });
    res.json({ success: true, data: plans });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/floor_plans', async (req: Request, res: Response) => {
  try {
    const { project_id, name, image_url, version, status, file_name } = req.body;
    if (!project_id || !name || !image_url) {
      return res.status(400).json({ success: false, error: "project_id, name, and image_url are required" });
    }
    const newPlan = await dbHelpers.insert('floor_plans', {
      project_id, name, image_url, version, status, file_name,
      created_at: Math.floor(Date.now() / 1000)
    });
    res.status(201).json({ success: true, data: newPlan });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.put('/api/floor_plans/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updatedPlan = await dbHelpers.update('floor_plans', id, {
      ...data,
      updated_at: Math.floor(Date.now() / 1000)
    });
    res.json({ success: true, data: updatedPlan });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/floor_plans/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await dbHelpers.deleteById('floor_plans', id);
    if (!deleted) return res.status(404).json({ success: false, error: "Floor plan not found" });
    res.json({ success: true, message: "Floor plan deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get('/api/layout_pins', async (req: Request, res: Response) => {
  try {
    const { floor_plan_id } = req.query;
    if (!floor_plan_id) {
      return res.status(400).json({ success: false, error: "floor_plan_id is required" });
    }
    const pins = await dbHelpers.selectAll('layout_pins', { floor_plan_id });
    res.json({ success: true, data: pins });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/layout_pins', async (req: Request, res: Response) => {
  try {
    const { floor_plan_id, inspection_id, x, y, label, status } = req.body;
    if (!floor_plan_id || x === undefined || y === undefined) {
      return res.status(400).json({ success: false, error: "floor_plan_id, x, and y are required" });
    }
    const newPin = await dbHelpers.insert('layout_pins', {
      floor_plan_id, inspection_id, x, y, label, status,
      created_at: Math.floor(Date.now() / 1000)
    });
    res.status(201).json({ success: true, data: newPin });
  } catch (error: any) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.put('/api/layout_pins/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updatedPin = await dbHelpers.update('layout_pins', id, {
      ...data,
      updated_at: Math.floor(Date.now() / 1000)
    });
    res.json({ success: true, data: updatedPin });
  } catch (error: any) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.delete('/api/layout_pins/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await dbHelpers.deleteById('layout_pins', id);
    if (!deleted) return res.status(404).json({ success: false, error: "Layout pin not found" });
    res.json({ success: true, message: "Layout pin deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ error: "API Endpoint Not Found", path: req.originalUrl });
});

// Explicitly declare require and module to avoid TS errors if @types/node is missing
declare const require: any;
declare const module: any;

if (typeof require !== 'undefined' && require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 QMS PostgreSQL API running on port ${PORT}`);
  });
}

export default app;
