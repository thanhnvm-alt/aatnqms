import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "./lib/db.js";
// @ts-ignore
import { runMigrations } from "./services/migrationService.js";
import * as db from "./services/dbService.js";
const { logAudit, logStatusChange } = db;
import multer from 'multer';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { v2 as cloudinary } from 'cloudinary';
import { google } from 'googleapis';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure Google Drive
let drive: any = null;

const driveConfig = {
  clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
  clientEmail: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
  privateKey: process.env.GOOGLE_DRIVE_PRIVATE_KEY
};

if (driveConfig.clientId && driveConfig.clientSecret && driveConfig.refreshToken) {
  // Method 1: OAuth2 Refresh Token (Uses User's Quota - Recommended for Personal/Company Drive)
  try {
    const oauth2Client = new google.auth.OAuth2(
      driveConfig.clientId,
      driveConfig.clientSecret,
      'https://developers.google.com/oauthplayground'
    );
    oauth2Client.setCredentials({ refresh_token: driveConfig.refreshToken });
    drive = google.drive({ version: 'v3', auth: oauth2Client });
    console.log("Google Drive storage configured via OAuth2 (User Quota).");
  } catch (err) {
    console.error("Error configuring Google Drive OAuth2:", err);
  }
} else if (driveConfig.clientEmail && driveConfig.privateKey) {
  // Method 2: Service Account (Current method - 0GB quota limit)
  try {
    const auth = new google.auth.JWT({
      email: driveConfig.clientEmail,
      key: driveConfig.privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    drive = google.drive({ version: 'v3', auth });
    console.log("Google Drive storage configured via Service Account.");
  } catch (err) {
    console.error("Error configuring Google Drive Service Account:", err);
  }
}

// Configure Cloudinary
if (process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

// Ensure upload directory exists (only if not on Vercel)
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!process.env.VERCEL) {
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  } catch (err) {
    console.warn("Could not create upload directory:", err);
  }
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });
const memoryUpload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// RBAC Middleware (Placeholder - should be replaced with JWT verification)
const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const userId = req.headers['x-user-id'] as string || 'SYSTEM';
  const userRole = req.headers['x-user-role'] as string || 'GUEST';
  (req as any).user = { id: userId, role: userRole };
  next();
};

const schema = process.env.DB_SCHEMA || 'appQAQC';

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV });
});

// API routes
  app.get("/api/ipo", async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appqaqc';
      const { factoryOrder, maTender, page = 1, limit = 50 } = req.query;
      const p = parseInt(page as string, 10);
      const l = parseInt(limit as string, 10);
      const offset = (p - 1) * l;
      
      let sql = `SELECT "ID_Factory_Order" as id, "ID_Factory_Order", "Ma_Tender", "Project_name", "Material_description", "Quantity_IPO", "Base_Unit" FROM "${schema}"."ipo" WHERE 1=1`;
      const params: any[] = [];
      
      if (factoryOrder) {
        sql += ` AND "ID_Factory_Order" = $${params.length + 1}`;
        params.push(factoryOrder);
      }
      if (maTender) {
        sql += ` AND "Ma_Tender" = $${params.length + 1}`;
        params.push(maTender);
      }
      
      const countSql = `SELECT COUNT(*) as total FROM "${schema}"."ipo" WHERE 1=1 ${factoryOrder ? `AND "ID_Factory_Order" = $1` : ''} ${maTender ? `AND "Ma_Tender" = $${factoryOrder ? 2 : 1}` : ''}`;
      
      const [result, countResult] = await Promise.all([
        query(sql + ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, l, offset]),
        query(countSql, params)
      ]);

      res.json({
        items: result.rows,
        total: parseInt(countResult.rows[0].total, 10),
        page: p,
        limit: l
      });
    } catch (error) {
      console.error('Error fetching IPO data:', error);
      res.status(500).json({ error: 'Failed to fetch IPO data' });
    }
  });

  // --- AUTH ---
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await db.getUserByUsername(username);
      if (user && user.password === password) {
        res.json(user);
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  // --- PLANS ---
  app.get("/api/plans", async (req, res) => {
    try {
      const { search, page = 1, limit = 20 } = req.query;
      const result = await db.getPlansPaginated(String(search || ''), Number(page), Number(limit));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch plans' });
    }
  });

  app.put("/api/plans/:id", authenticate, async (req, res) => {
    try {
      await db.updatePlan(String(req.params.id), req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update plan' });
    }
  });

  app.get("/api/plans/by-project", async (req, res) => {
    try {
      const { maCt, limit } = req.query;
      const result = await db.getPlansByProject(String(maCt || ''), limit ? Number(limit) : undefined);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch plans by project' });
    }
  });

  // --- WORKSHOPS ---
  app.get("/api/workshops", async (req, res) => {
    try {
      const result = await db.getWorkshops();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch workshops' });
    }
  });

  app.post("/api/workshops", authenticate, async (req, res) => {
    try {
      await db.saveWorkshop(req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save workshop' });
    }
  });

  app.delete("/api/workshops/:id", authenticate, async (req, res) => {
    try {
      await db.deleteWorkshop(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete workshop' });
    }
  });

  // --- TEMPLATES ---
  app.get("/api/templates", async (req, res) => {
    try {
      const result = await db.getTemplates();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  });

  app.post("/api/templates", authenticate, async (req, res) => {
    try {
      const { moduleId, items } = req.body;
      await db.saveTemplate(moduleId, items);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save template' });
    }
  });

  // --- FLOOR PLANS ---
  app.get("/api/floor-plans", async (req, res) => {
    try {
      const { projectId } = req.query;
      const result = await db.getFloorPlans(String(projectId || ''));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch floor plans' });
    }
  });

  app.post("/api/floor-plans", authenticate, async (req, res) => {
    try {
      await db.saveFloorPlan(req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save floor plan' });
    }
  });

  app.delete("/api/floor-plans/:id", authenticate, async (req, res) => {
    try {
      await db.deleteFloorPlan(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete floor plan' });
    }
  });

  // --- LAYOUT PINS ---
  app.get("/api/layout-pins", async (req, res) => {
    try {
      const { fpId } = req.query;
      const result = await db.getLayoutPins(String(fpId || ''));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch layout pins' });
    }
  });

  app.post("/api/layout-pins", authenticate, async (req, res) => {
    try {
      await db.saveLayoutPin(req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save layout pin' });
    }
  });

  // --- DEFECTS (NCRs) ---
  app.get("/api/defects", async (req, res) => {
    try {
      const result = await db.getNcrs(req.query as any);
      res.json({ items: result.items, total: result.total });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch defects' });
    }
  });
  app.get("/api/inspections", async (req, res) => {
    try {
      const { status, search, page = 1, limit = 20 } = req.query;
      const result = await db.getInspectionsList({ status: String(status || ''), search: String(search || '') }, Number(page), Number(limit));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch inspections' });
    }
  });

  app.get("/api/inspections/:id", async (req, res) => {
    try {
      const result = await db.getInspectionById(req.params.id);
      if (!result) return res.status(404).json({ error: 'Inspection not found' });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch inspection' });
    }
  });

  app.post("/api/inspections", authenticate, async (req, res) => {
    try {
      await db.saveInspection(req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save inspection' });
    }
  });

  app.delete("/api/inspections/:id", authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      await db.deleteInspection(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete inspection' });
    }
  });

  // --- NCRs ---
  app.get("/api/ncrs", authenticate, async (req, res) => {
    try {
      const filters = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await db.getNcrs(filters, page, limit);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch NCRs' });
    }
  });

  app.get("/api/ncrs/:id", authenticate, async (req, res) => {
    try {
      const result = await db.getNcrById(String(req.params.id));
      if (result) {
        res.json(result);
      } else {
        res.status(404).json({ error: 'NCR not found' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch NCR detail' });
    }
  });

  app.post("/api/ncrs", authenticate, async (req, res) => {
    try {
      const { inspection_id, ncr, createdBy } = req.body;
      const id = await db.saveNcrMapped(inspection_id, ncr, createdBy);
      res.json({ id });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save NCR' });
    }
  });

  app.delete("/api/ncrs/:id", authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      await db.deleteNcr(String(req.params.id), String(user.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete NCR' });
    }
  });

  // --- USERS ---
  app.get("/api/users", async (req, res) => {
    try {
      const result = await db.getUsers();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.post("/api/users", authenticate, async (req, res) => {
    try {
      await db.saveUser(req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save user' });
    }
  });

  app.delete("/api/users/:id", authenticate, async (req, res) => {
    try {
      await db.deleteUser(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // --- SUPPLIERS ---
  app.get("/api/suppliers", async (req, res) => {
    try {
      const { search, page = 1, limit = 20 } = req.query;
      const result = await db.getSuppliersPaginated(String(search || ''), Number(page), Number(limit));
      res.json(result);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      res.status(500).json({ error: 'Failed to fetch suppliers' });
    }
  });

  app.get("/api/suppliers/stats", async (req, res) => {
    try {
      const { name } = req.query;
      const result = await db.getSupplierStats(String(name || ''));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch supplier stats' });
    }
  });

  app.get("/api/suppliers/inspections", async (req, res) => {
    try {
      const { name } = req.query;
      const result = await db.getSupplierInspections(String(name || ''));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch supplier inspections' });
    }
  });

  app.get("/api/suppliers/materials", async (req, res) => {
    try {
      const { name } = req.query;
      const result = await db.getSupplierMaterials(String(name || ''));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch supplier materials' });
    }
  });

  app.post("/api/suppliers", authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      await db.saveSupplier(req.body, user.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save supplier' });
    }
  });

  app.delete("/api/suppliers/:id", authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      await db.deleteSupplier(String(req.params.id), String(user.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete supplier' });
    }
  });

  // --- PROJECTS ---
  app.post("/api/projects", authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      await db.updateProject(req.body, user.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save project' });
    }
  });

  app.get("/api/projects", async (req, res) => {
    try {
      const { search, page = 1, limit = 20 } = req.query;
      const result = await db.getProjectsPaginated(String(search || ''), Number(page), Number(limit));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  app.get("/api/projects/:code", async (req, res) => {
    try {
      const result = await db.getProjectByCode(req.params.code);
      if (!result) return res.status(404).json({ error: 'Project not found' });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  });

  // --- NOTIFICATIONS ---
  app.get("/api/notifications/:userId", async (req, res) => {
    try {
      const result = await db.getNotifications(req.params.userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  app.post("/api/notifications", authenticate, async (req, res) => {
    try {
      const { userId, type, title, message, link } = req.body;
      await db.addNotification(userId, type, title, message, link);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create notification' });
    }
  });

  app.put("/api/notifications/:id/read", authenticate, async (req, res) => {
    try {
      await db.markNotificationRead(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  });

  app.put("/api/notifications/read-all/:userId", authenticate, async (req, res) => {
    try {
      await db.markAllNotificationsRead(String(req.params.userId));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
  });

  // --- ROLES ---
  app.get("/api/roles", async (req, res) => {
    try {
      const result = await db.getRoles();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch roles' });
    }
  });

  app.post("/api/roles", authenticate, async (req, res) => {
    try {
      await db.saveRole(req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save role' });
    }
  });

  app.delete("/api/roles/:id", authenticate, async (req, res) => {
    try {
      await db.deleteRole(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete role' });
    }
  });

  // --- DEFECT LIBRARY ---
  app.get("/api/defect-library", async (req, res) => {
    try {
      const result = await db.getDefectLibrary();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch defect library' });
    }
  });

  app.post("/api/defect-library", authenticate, async (req, res) => {
    try {
      await db.saveDefectLibraryItem(req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save defect library item' });
    }
  });

  app.delete("/api/defect-library/:id", authenticate, async (req, res) => {
    try {
      await db.deleteDefectLibraryItem(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete defect library item' });
    }
  });

  // Material API
  app.get("/api/materials", async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appQAQC';
      const { page = 1, limit = 50, search = '' } = req.query;
      const p = parseInt(page as string, 10);
      const l = parseInt(limit as string, 10);
      const offset = (p - 1) * l;

      let sql = `SELECT id, material, "shortText", "orderUnit", "orderQuantity", "supplierName", "projectName", "purchaseDocument", "deliveryDate", "Ma_Tender", "Factory_Order", "createdAt" FROM "${schema}"."material" WHERE 1=1`;
      const params: any[] = [];
      let where = '';
      if (search) {
        where = ` AND (material LIKE $1 OR "shortText" LIKE $1 OR "projectName" LIKE $1 OR "Ma_Tender" LIKE $1)`;
        params.push(`%${search}%`);
      }

      const countSql = `SELECT COUNT(*) as total FROM "${schema}"."material" WHERE 1=1 ${where}`;
      
      const [result, countResult] = await Promise.all([
        query(sql + where + ` ORDER BY "createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, l, offset]),
        query(countSql, params)
      ]);

      res.json({
        items: result.rows,
        total: parseInt(countResult.rows[0].total, 10),
        page: p,
        limit: l
      });
    } catch (error) {
      console.error('Error fetching materials:', error);
      res.status(500).json({ error: 'Failed to fetch materials' });
    }
  });

  app.post("/api/materials", authenticate, express.json(), async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appQAQC';
      const { material, shortText, orderUnit, orderQuantity, supplierName, projectName, purchaseDocument, deliveryDate, Ma_Tender, Factory_Order } = req.body;
      const result = await query(
        `INSERT INTO "${schema}"."material" ("id", "material", "shortText", "orderUnit", "orderQuantity", "supplierName", "projectName", "purchaseDocument", "deliveryDate", "Ma_Tender", "Factory_Order", "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING *`,
        [material, shortText, orderUnit, orderQuantity || 0, supplierName, projectName, purchaseDocument, deliveryDate, Ma_Tender, Factory_Order]
      );
      
      const user = (req as any).user;
      await logAudit(String(user.id), 'CREATE_MATERIAL', 'material', String(result.rows[0].id), null, result.rows[0]);
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating material:', error);
      res.status(500).json({ error: 'Failed to create material' });
    }
  });

  app.put("/api/materials/:id", authenticate, express.json(), async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appQAQC';
      const { id } = req.params;
      const { material, shortText, orderUnit, orderQuantity, supplierName, projectName, purchaseDocument, deliveryDate, Ma_Tender, Factory_Order } = req.body;
      
      const existing = await query(`SELECT * FROM "${schema}"."material" WHERE id = $1`, [id]);
      const oldValue = existing.rows[0];

      const result = await query(
        `UPDATE "${schema}"."material" SET "material" = $1, "shortText" = $2, "orderUnit" = $3, "orderQuantity" = $4, "supplierName" = $5, "projectName" = $6, "purchaseDocument" = $7, "deliveryDate" = $8, "Ma_Tender" = $9, "Factory_Order" = $10, "updatedAt" = NOW() WHERE "id" = $11 RETURNING *`,
        [material, shortText, orderUnit, orderQuantity || 0, supplierName, projectName, purchaseDocument, deliveryDate, Ma_Tender, Factory_Order, id]
      );

      const user = (req as any).user;
      await logAudit(String(user.id), 'UPDATE_MATERIAL', 'material', String(id), oldValue, result.rows[0]);

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating material:', error);
      res.status(500).json({ error: 'Failed to update material' });
    }
  });

  app.delete("/api/materials/:id", authenticate, async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appQAQC';
      const { id } = req.params;
      
      const existing = await query(`SELECT * FROM "${schema}"."material" WHERE id = $1`, [id]);
      if (existing.rows.length > 0) {
        // Only try to set deleted_at if the column exists (which we know it doesn't for material, but we'll try to be safe)
        try {
          await query(`UPDATE "${schema}"."material" SET "deleted_at" = EXTRACT(EPOCH FROM NOW())::BIGINT WHERE "id" = $1`, [id]);
        } catch (e) {
          // Fallback: hard delete if soft delete fails due to missing column
          await query(`DELETE FROM "${schema}"."material" WHERE "id" = $1`, [id]);
        }
        const user = (req as any).user;
        await logAudit(String(user.id), 'DELETE_MATERIAL', 'material', String(id), existing.rows[0], null);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting material:', error);
      res.status(500).json({ error: 'Failed to delete material' });
    }
  });

  app.get("/api/ncrs/export", async (req, res) => {
    try {
        const schema = process.env.DB_SCHEMA || 'appQAQC';
        const result = await query(`SELECT * FROM "${schema}"."ncrs" ORDER BY "created_at" DESC`);
        const ws = XLSX.utils.json_to_sheet(result.rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "NCRs");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Disposition", "attachment; filename=NCRs.xlsx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(buf);
    } catch (error) {
        console.error('Error exporting NCRs:', error);
        res.status(500).json({ error: 'Failed to export NCRs' });
    }
  });

  // Image Upload API
  app.post("/api/upload", (req, res, next) => {
    // Use memory storage if cloud storage is configured or if on Vercel
    const useCloud = !!(process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) || drive);
    const uploader = (process.env.VERCEL || useCloud) ? memoryUpload : upload;
    
    uploader.single('image')(req, res, (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(500).json({ error: `Multer error: ${err.message}` });
      }
      next();
    });
  }, async (req, res) => {
    console.log("Received upload request. File:", req.file?.originalname, "Size:", req.file?.size);
    try {
      if (!req.file) {
        console.log("No file in request");
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      let fileUrl = "";
      let filename = "";

      const useCloudinary = !!(process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET));

      if (useCloudinary) {
        console.log("Uploading to Cloudinary...");
        const b64 = Buffer.from(req.file.buffer).toString("base64");
        const dataURI = "data:" + req.file.mimetype + ";base64," + b64;
        const result = await cloudinary.uploader.upload(dataURI, {
          folder: "qms_uploads",
        });
        fileUrl = result.secure_url;
        filename = result.public_id;
      } else if (drive) {
        console.log("Uploading to Google Drive...");
        const bufferStream = new Readable();
        bufferStream.push(req.file.buffer);
        bufferStream.push(null);

        const driveResponse = await drive.files.create({
          requestBody: {
            name: `qms_${Date.now()}_${req.file.originalname}`,
            parents: process.env.GOOGLE_DRIVE_FOLDER_ID ? [process.env.GOOGLE_DRIVE_FOLDER_ID] : [],
          },
          media: {
            mimeType: req.file.mimetype,
            body: bufferStream,
          },
          fields: 'id, webViewLink, webContentLink',
          supportsAllDrives: true,
        });

        const fileId = driveResponse.data.id;
        console.log("File uploaded to Drive. ID:", fileId);
        
        // Make file publicly readable
        try {
          await drive.permissions.create({
            fileId: fileId,
            requestBody: {
              role: 'reader',
              type: 'anyone',
            },
            supportsAllDrives: true,
          });
        } catch (permErr) {
          console.warn("Could not set public permissions on Drive file:", permErr);
        }

        // Google Drive direct link format
        fileUrl = `https://lh3.googleusercontent.com/u/0/d/${fileId}`;
        filename = fileId;
      } else if (process.env.VERCEL) {
        // Fallback if on Vercel but no cloud keys: return a data URI (warning: limited size)
        console.warn("No cloud storage configured on Vercel. Falling back to Data URI.");
        const b64 = Buffer.from(req.file.buffer).toString("base64");
        fileUrl = `data:${req.file.mimetype};base64,${b64}`;
        filename = `temp-${Date.now()}`;
      } else {
        // Local storage (only if not on Vercel and no cloud storage)
        console.log("File received locally:", req.file.filename);
        fileUrl = `/uploads/${req.file.filename}`;
        filename = req.file.filename;
      }

      console.log("Upload successful. URL:", fileUrl);
      res.json({ 
        url: fileUrl,
        url_hd: fileUrl,
        url_thumbnail: fileUrl,
        filename: filename,
        size: req.file.size,
        mime: req.file.mimetype
      });
    } catch (error: any) {
      console.error('Error uploading image:', error);
      res.status(500).json({ error: `Upload failed: ${error.message || 'Unknown error'}` });
    }
  });

  app.post("/api/ncrs/import", memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const schema = process.env.DB_SCHEMA || 'appQAQC';
        for (const row of data as any[]) {
            if (row.id) {
                await query(`
                    UPDATE "${schema}"."ncrs" 
                    SET "defect_code" = $1, "description" = $2, "status" = $3, "severity" = $4, "responsible_person" = $5, "updated_at" = (EXTRACT(epoch FROM now()))::bigint
                    WHERE "id" = $6
                `, [row.defect_code, row.description || row.issue_description, row.status, row.severity, row.responsible_person, row.id]);
            } else {
                const newId = `NCR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                await query(`
                    INSERT INTO "${schema}"."ncrs" ("id", "defect_code", "description", "status", "severity", "responsible_person", "created_at", "updated_at") 
                    VALUES ($1, $2, $3, $4, $5, $6, (EXTRACT(epoch FROM now()))::bigint, (EXTRACT(epoch FROM now()))::bigint)
                `, [newId, row.defect_code, row.description || row.issue_description, row.status, row.severity, row.responsible_person]);
            }
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error importing NCRs:', error);
        res.status(500).json({ error: 'Failed to import NCRs' });
    }
  });

  app.use((req, res, next) => {
    console.log("Received request:", req.method, req.url);
    next();
  });

  app.post("/api/query", authenticate, async (req, res) => {
    console.log("Received query request:", req.body, "Content-Type:", req.headers['content-type']);
    try {
      if (!req.body || !req.body.sql) {
        console.error("Invalid request body for /api/query:", req.body, "Content-Type:", req.headers['content-type']);
        return res.status(400).json({ error: 'Request body or SQL query is missing' });
      }
      const schema = process.env.DB_SCHEMA || 'appQAQC';
      let { sql, args } = req.body;
      
      const user = (req as any).user;
      
      // Basic SQLite to PostgreSQL syntax conversion
      let pgSql = sql as string;
      
      // Replace ? with $1, $2, etc.
      let paramIndex = 1;
      pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
      
      // Replace AUTOINCREMENT with SERIAL or just remove it if it's in CREATE TABLE (we don't need to create tables here)
      pgSql = pgSql.replace(/AUTOINCREMENT/gi, '');
      
      // Replace unixepoch() with EXTRACT(epoch FROM now())
      pgSql = pgSql.replace(/unixepoch\(\)/gi, 'EXTRACT(epoch FROM now())');
      
      // Handle PRAGMA table_info
      if (pgSql.toUpperCase().startsWith('PRAGMA TABLE_INFO')) {
        const match = pgSql.match(/PRAGMA table_info\((['"]?)(.*?)\1\)/i);
        if (match) {
          const tableName = match[2];
          pgSql = `SELECT column_name as name, data_type as type FROM information_schema.columns WHERE table_schema = $2 AND table_name = $1`;
          args = [tableName, schema];
        }
      }
      
      // Set search path
      await query(`SET search_path TO "${schema}"`);
      
      // Log mutation queries
      const isMutation = pgSql.toUpperCase().match(/INSERT|UPDATE|DELETE|ALTER|DROP/);
      if (isMutation) {
        await logAudit(String(user.id), 'RAW_SQL_MUTATION', 'database', 'raw', { sql: pgSql, args }, null);
      }
      
      const result = await query(pgSql, args || []);
      res.json({ rows: result.rows, rowCount: result.rowCount });
    } catch (error: any) {
      console.error('Error executing query:', error.message, req.body ? req.body.sql : 'No SQL');
      res.status(500).json({ error: error.message || 'Unknown error' });
    }
  });

  app.post("/api/batch", authenticate, express.json(), async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appQAQC';
      const { queries } = req.body; // Array of { sql, args } or strings
      const user = (req as any).user;
      
      await query(`SET search_path TO "${schema}"`);
      await query('BEGIN');
      
      const results = [];
      for (let q of queries) {
        let sql = typeof q === 'string' ? q : q.sql;
        let args = typeof q === 'string' ? [] : (q.args || []);
        
        let paramIndex = 1;
        sql = sql.replace(/\?/g, () => `$${paramIndex++}`);
        sql = sql.replace(/AUTOINCREMENT/gi, '');
        sql = sql.replace(/unixepoch\(\)/gi, 'EXTRACT(epoch FROM now())');
        
        const isMutation = sql.toUpperCase().match(/INSERT|UPDATE|DELETE|ALTER|DROP/);
        if (isMutation) {
          await logAudit(String(user.id), 'BATCH_SQL_MUTATION', 'database', 'batch', { sql, args }, null);
        }

        const result = await query(sql, args);
        results.push({ rows: result.rows, rowCount: result.rowCount });
      }
      
      await query('COMMIT');
      res.json(results);
    } catch (error: any) {
      await query('ROLLBACK');
      console.error('Error executing batch:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    console.error('Bad JSON');
    return res.status(400).send({ error: 'Bad JSON' });
  }
  next(err);
});

// Run migrations before starting the server
(async () => {
  try {
    await runMigrations();
    
    // Diagnostic logic to verify schema
    const schema = process.env.DB_SCHEMA || 'appQAQC';
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site', 'ncrs', 'users', 'material', 'suppliers', 'projects', 'ipo'];
    const results: any = {};
    
    let dbContext = {};
    try {
      const [schemaRes, userRes, dbRes] = await Promise.all([
        query('SELECT current_schema()'),
        query('SELECT current_user'),
        query('SELECT current_database()')
      ]);
      dbContext = {
        current_schema: schemaRes.rows[0].current_schema,
        current_user: userRes.rows[0].current_user,
        current_database: dbRes.rows[0].current_database
      };
    } catch (e: any) {
      dbContext = { error: e.message };
    }

    const tablesForCheck = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    let unionTest = {};
    try {
      const SCHEMA_QUOTED = `"${schema}"`;
      const tableQueries = tablesForCheck.map(table => {
        return `SELECT id::text, '${table}'::text as table_name FROM ${SCHEMA_QUOTED}."${table}" WHERE "deleted_at" IS NULL`;
      });
      const unionQuery = `(${tableQueries.join(') UNION ALL (')}) LIMIT 1`;
      const res = await query(unionQuery);
      unionTest = { success: true, rowCount: res.rowCount };
      
      // Trigger dbService.getInspectionsList
      try {
        await db.getInspectionsList();
      } catch (e) {}
    } catch (e: any) {
      unionTest = { success: false, error: e.message };
      
      // If union fails, test each table individually to find the culprit
      const individualTests: any = {};
      const SCHEMA_QUOTED = `"${schema}"`;
      for (const table of tablesForCheck) {
        try {
          await query(`SELECT "deleted_at" FROM ${SCHEMA_QUOTED}."${table}" LIMIT 1`);
          individualTests[table] = "OK";
        } catch (err: any) {
          individualTests[table] = err.message;
        }
      }
      unionTest = { ...unionTest, individualTests };
    }

    for (const table of tables) {
      try {
        const colCheck = await query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE LOWER(table_schema) = LOWER($1) AND LOWER(table_name) = LOWER($2)
        `, [schema, table]);
        results[table] = {
          exists: colCheck.rowCount > 0,
          columns: colCheck.rows.map((r: any) => `${r.column_name} (${r.data_type})`),
          has_deleted_at: colCheck.rows.some((r: any) => r.column_name === 'deleted_at')
        };
      } catch (e: any) {
        results[table] = { error: e.message };
      }
    }
    fs.writeFileSync(path.join(__dirname, 'diag_db.json'), JSON.stringify({ schema, dbContext, unionTest, timestamp: new Date().toISOString(), tables: results }, null, 2));
    console.log("✅ Diagnostic info written to diag_db.json");
  } catch (err: any) {
    console.error("❌ Failed to run migrations or diagnostics:", err.message);
    try {
      fs.writeFileSync(path.join(__dirname, 'diag_error.json'), JSON.stringify({ error: err.message, stack: err.stack, timestamp: new Date().toISOString() }, null, 2));
    } catch (e) {}
  }
})();

// Diagnostic endpoint for database schema
app.get('/api/diag/db', async (req, res) => {
  try {
    const schema = process.env.DB_SCHEMA || 'appQAQC';
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site', 'ncrs', 'users', 'material', 'suppliers', 'projects', 'ipo'];
    
    const results: any = {};
    
    for (const table of tables) {
      const colCheck = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE LOWER(table_schema) = LOWER($1) AND LOWER(table_name) = LOWER($2)
      `, [schema, table]);
      
      results[table] = {
        exists: colCheck.rowCount > 0,
        columns: colCheck.rows.map((r: any) => `${r.column_name} (${r.data_type})`),
        has_deleted_at: colCheck.rows.some((r: any) => r.column_name === 'deleted_at')
      };
    }
    
    res.json({
      schema,
      database_url_set: !!process.env.DATABASE_URL,
      tables: results
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  (async () => {
    try {
      const vitePkg = "vite";
      const { createServer: createViteServer } = await import(vitePkg);
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn("Vite dev server failed to load (expected in production):", e);
    }
  })();
  
  app.listen(3000, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:3000`);
  });
} else {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*all', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

export default app;

