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

// Health Check Handler
const healthHandler = async (req: Request, res: Response) => {
  try {
    await db.query('SELECT 1');
    res.json({ success: true, status: "ok", database: "connected" });
  } catch (error) {
    res.status(503).json({ success: false, status: "error", error: (error as Error).message });
  }
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler); // Alias for proxy access

/**
 * ISO QMS API: Plans (Bảng IPO)
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
      whereClause = `WHERE "ma_ct" ILIKE $${paramIndex} OR "ten_ct" ILIKE $${paramIndex} OR "headcode" ILIKE $${paramIndex} OR "ma_nha_may" ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const offset = (page - 1) * limit;
    const dataSql = `
      SELECT id, ma_nha_may, headcode, ma_ct, ten_ct, ten_hang_muc, dvt, so_luong_ipo, planned_date as "plannedDate", assignee, status,
             drawing_url, description, materials_text, samples_json, simulations_json
      FROM "IPO" 
      ${whereClause} 
      ORDER BY id DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countSql = `SELECT COUNT(*) as total FROM "IPO" ${whereClause}`;
    
    const [data, countRes] = await Promise.all([
      db.query(dataSql, [...params, limit, offset]),
      db.query(countSql, params)
    ]);

    const total = parseInt(countRes.rows[0].total);

    res.json({
      success: true,
      items: data.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/plans', async (req: Request, res: Response) => {
  try {
    const data: PlanInput = req.body;
    if (!data.headcode || !data.ma_ct || !data.ten_ct || !data.ten_hang_muc || !data.so_luong_ipo) {
      return res.status(400).json({ success: false, error: "Missing required plan fields" });
    }

    const newPlan = await dbHelpers.insert('IPO', {
      headcode: data.headcode,
      ma_ct: data.ma_ct,
      ten_ct: data.ten_ct,
      ten_hang_muc: data.ten_hang_muc,
      dvt: data.dvt,
      so_luong_ipo: data.so_luong_ipo,
      ma_nha_may: data.ma_nha_may || null,
      created_at: Math.floor(Date.now() / 1000)
    });
    res.status(201).json({ success: true, data: newPlan });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.put('/api/plans/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data: Partial<PlanInput> = req.body;
    const updatedPlan = await dbHelpers.update('IPO', parseInt(id), data);
    res.json({ success: true, data: updatedPlan });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/plans/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await dbHelpers.deleteById('IPO', parseInt(id));
    if (!deleted) return res.status(404).json({ success: false, message: "Plan not found" });
    res.json({ success: true, message: "Plan deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ISO QMS API: Inspections
 */
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
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
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
    if (!deleted) return res.status(404).json({ success: false, message: "Inspection not found" });
    res.json({ success: true, message: "Inspection deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ISO QMS API: Users
 */
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
    if (!deleted) return res.status(404).json({ success: false, message: "User not found" });
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

/**
 * ISO QMS API: Workshops
 */
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
    if (!deleted) return res.status(404).json({ success: false, message: "Workshop not found" });
    res.json({ success: true, message: "Workshop deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * ISO QMS API: Projects
 */
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

/**
 * ISO QMS API: Floor Plans
 */
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
    if (!deleted) return res.status(404).json({ success: false, message: "Floor plan not found" });
    res.json({ success: true, message: "Floor plan deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * ISO QMS API: Layout Pins
 */
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
    if (!deleted) return res.status(404).json({ success: false, message: "Layout pin not found" });
    res.json({ success: true, message: "Layout pin deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Catch-all 404 handler for API routes to prevent HTML response
app.get('*', (req: Request, res: Response) => {
  res.status(404).json({ error: "API Endpoint Not Found" });
});

// Run server only if executed directly
// @ts-ignore
if (typeof require !== 'undefined' && require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 QMS PostgreSQL API running on port ${PORT}`);
  });
}

// Export app for Vercel
export default app;
