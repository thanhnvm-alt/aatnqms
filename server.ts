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
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import multer from 'multer';
import * as pdfParse from 'pdf-parse';
import { GoogleGenAI } from "@google/genai";

const JWT_SECRET = 'aatn_qms_secret_key_2026_fixed';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure Google Drive safely
let drive: any = null;
const driveConfig = {
  clientId: process.env.GOOGLE_DRIVE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || '',
  refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '',
  clientEmail: process.env.GOOGLE_DRIVE_CLIENT_EMAIL || '',
  privateKey: process.env.GOOGLE_DRIVE_PRIVATE_KEY || ''
};

if (driveConfig.clientId && driveConfig.clientSecret && driveConfig.refreshToken) {
    // ... logic ...
}
// ... rest of logic check ...

// Configure Cloudinary safely
if (process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
} else {
  console.log("Cloudinary configuration skipped: credentials missing.");
}

// Update upload directory to use /tmp which is writable on Google Cloud Run and Vercel environments
const uploadDir = path.join('/tmp', 'qms_uploads');
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  console.warn("Could not create upload directory:", err);
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

// Request logging for debugging
app.use((req, res, next) => {
  if (!req.url.startsWith('/_vite') && !req.url.startsWith('/@')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  }
  next();
});

// RBAC Middleware (JWT Verification)
const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    (req as any).user = decoded;
    next();
  } catch (err) {
    console.error('JWT Verification Error:', err);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

const schema = process.env.DB_SCHEMA || 'appQAQC';

// Serve uploads directory statically if not using cloud storage
app.use('/uploads', express.static('/tmp/qms_uploads'));

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV });
});

// --- PDF Upload for Procedures ---
app.post("/api/procedures/upload", memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file || req.file.mimetype !== 'application/pdf') {
            return res.status(400).json({ error: 'Please upload a PDF file' });
        }
        
        // pdfParse is the default export if imported as `import pdfParse from 'pdf-parse'`, 
        // but if imported as `import * as pdfParse`, it might be `pdfParse.default`
        const data = await pdfParse.default(req.file.buffer);
        const title = req.file.originalname.replace('.pdf', '');
        
        await query(`INSERT INTO "${process.env.DB_SCHEMA || 'appQAQC'}"."procedures" (title, content, category, version) VALUES ($1, $2, 'ISO', '1.0')`, 
            [title, data.text]);
        
        res.json({ message: 'Procedural document uploaded and indexed successfully' });
    } catch (error) {
        console.error("PDF upload error:", error);
        res.status(500).json({ error: 'Failed to process PDF' });
    }
});

// API routes
  app.get("/api/ipo", async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appQAQC';
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
    console.log("Login attempt for username:", req.body?.username);
    try {
      const { username, password } = req.body;
      const user = await db.getUserByUsername(username);
      
      let isMatch = false;
      if (user && user.password) {
        if (user.password.startsWith('$2b$') || user.password.startsWith('$2a$')) {
          isMatch = await bcrypt.compare(password, user.password);
        } else {
          // Fallback for plain text passwords in DB
          isMatch = password === user.password;
        }
      }

      if (user && isMatch) {
        // Create JWT
        const token = jwt.sign(
          { id: user.id, username: user.username, role: user.role, name: user.name },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        
        // Don't send password back
        const { password: _, ...userWithoutPassword } = user;
        res.json({ user: userWithoutPassword, token });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  app.post("/api/chat", express.json(), async (req, res) => {
    const { message, context } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
        console.error("DEBUG: GEMINI_API_KEY is not defined in process.env");
        return res.status(500).json({ error: "Server API Key not configured" });
    }
    console.log("DEBUG: GEMINI_API_KEY is defined, length:", process.env.GEMINI_API_KEY.length);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        // --- RAG: Fetch relevant history (NCRs) and Procedures (ISO) ---
        let ragContext = "";
        try {
            // Basic extraction of ID/Code from message for lookup
            const match = message.match(/[A-Z0-9-]{3,}/i);
            
            // Fetch NCRs
            if (match) {
                const results = await db.getNcrs({ search: match[0] }, 1, 3);
                if (results.items && results.items.length > 0) {
                    ragContext += "\nLỊCH SỬ XỬ LÝ SỰ CỐ (NCRs) LIÊN QUAN:\n" + 
                        results.items.map((ncr: any) => `- ID: ${ncr.id}, Mô tả: ${ncr.issueDescription}, Trạng thái: ${ncr.status}`).join('\n');
                }
            }

            // Fetch Procedures
            const procResults = await query(`SELECT title, content FROM "${process.env.DB_SCHEMA || 'appQAQC'}"."procedures" LIMIT 5`);
            if (procResults.rows && procResults.rows.length > 0) {
                ragContext += "\nQUY TRÌNH & QUY CHUẨN ISO LIEN QUAN:\n" + 
                    procResults.rows.map((p: any) => `- ${p.title}: ${p.content.substring(0, 200)}...`).join('\n');
            }
        } catch (e) {
            console.error("RAG Context fetch failed:", e);
        }

        // Define fallback models
        const models = ['gemini-3.1-flash-lite-preview', 'gemini-1.5-flash'];
        let response;
        
        for (const model of models) {
            try {
                response = await ai.models.generateContent({
                    model: model,
                    contents: message,
                    config: {
                        systemInstruction: `Bạn là trợ lý dữ liệu QA/QC chuyên nghiệp cho hệ thống AATN.
                        
                        NGỮ CẢNH DỮ LIỆU:
                        ${context}
                        ${ragContext}

                        HƯỚNG DẪN TRẢ LỜI:
                        1. Trả lời cực kỳ ngắn gọn và chính xác dựa trên DỮ LIỆU và LỊCH SỬ SỰ CỐ.
                        2. Nếu tìm thấy mã dự án/nhà máy, liệt kê tiến độ theo danh sách.
                        3. Sử dụng **in đậm** cho các mã số và trạng thái quan trọng.
                        4. Dựa vào LỊCH SỬ SỰ CỐ (NCR) để đưa ra lời khuyên xử lý nếu có.
                        5. Nếu không thấy, hãy trả lời tổng quát.`,
                        temperature: 0.1,
                    },
                });
                break; // If successful, break the loop
            } catch (err: any) {
                console.warn(`Model ${model} failed, trying next...`, err.message);
                if (model === models[models.length - 1]) throw err; // If last model failed, throw
            }
        }
        res.json({ text: response!.text });
    } catch (error) {
        console.error("AI Proxy Error:", error);
        res.status(500).json({ error: "AI Service Error, please try again in a few moments." });
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
    } catch (error: any) {
      console.error('Error saving user:', error);
      res.status(500).json({ error: 'Failed to save user', details: error.message });
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
        where = ` AND (material LIKE $1 OR "shortText" LIKE $1 OR "projectName" LIKE $1 OR "Ma_Tender" LIKE $1 OR "purchaseDocument" LIKE $1)`;
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
        `INSERT INTO "${schema}"."material" ("id", "material", "shortText", "orderUnit", "orderQuantity", "supplierName", "projectName", "purchaseDocument", "deliveryDate", "Ma_Tender", "Factory_Order", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()) RETURNING *`,
        [crypto.randomUUID(), material, shortText, orderUnit, orderQuantity || 0, supplierName, projectName, purchaseDocument, deliveryDate, Ma_Tender, Factory_Order]
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

  // Image Proxy API
  app.get("/api/proxy-image", async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      if (!imageUrl) return res.status(400).send('Missing url');
      
      if (imageUrl.includes('lh3.googleusercontent.com/u/0/d/')) {
          // Extract fileId
          const fileId = imageUrl.split('/d/')[1];
          if (!fileId) throw new Error('Invalid Google Drive URL');
          
          if (!drive) throw new Error('Google Drive not configured');

          const response = await drive.files.get({
              fileId: fileId,
              alt: 'media'
          }, { responseType: 'stream' });
          
          res.set('Content-Type', 'image/jpeg');
          res.set('Access-Control-Allow-Origin', '*');
          res.set('Cache-Control', 'public, max-age=31536000');
          response.data.pipe(res);
          return;
      }

      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
      
      const buffer = await response.arrayBuffer();
      res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'public, max-age=31536000');
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error('Proxy error:', error);
      res.status(500).send('Error proxying image');
    }
  });

  // Image Upload API
  app.post("/api/upload", (req, res, next) => {
    console.log("--- API UPLOAD REQUEST START ---");
    console.log("Headers:", req.headers);
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
        
        // REMOVED: Public permission for security (NC-04)
        // Only authorized users via server proxy should access these files
        
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

  // --- DEFECT LIBRARY EXPORT/IMPORT ---
  app.get("/api/defects/export", async (req, res) => {
    try {
        const schema = process.env.DB_SCHEMA || 'appQAQC';
        const result = await query(`SELECT * FROM "${schema}"."defect_library" ORDER BY "defect_code" ASC`);
        const ws = XLSX.utils.json_to_sheet(result.rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "DefectLibrary");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Disposition", "attachment; filename=DefectLibrary.xlsx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(buf);
    } catch (error) {
        console.error('Error exporting defect library:', error);
        res.status(500).json({ error: 'Failed to export defect library' });
    }
  });

  app.post("/api/defects/import", memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const schema = process.env.DB_SCHEMA || 'appQAQC';
        let count = 0;
        for (const row of data as any[]) {
            const id = row.id || `DEF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const defect_code = row.defect_code || row['Mã lỗi'] || '';
            const name = row.name || row['Tên lỗi'] || '';
            if (!defect_code || !name) continue;

            await query(`
                INSERT INTO "${schema}"."defect_library" (id, defect_code, name, stage, category, description, severity, suggested_action, updated_at) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (EXTRACT(epoch FROM now()))::bigint)
                ON CONFLICT(id) DO UPDATE SET 
                    defect_code = EXCLUDED.defect_code, 
                    name = EXCLUDED.name, 
                    stage = EXCLUDED.stage,
                    category = EXCLUDED.category,
                    description = EXCLUDED.description,
                    severity = EXCLUDED.severity,
                    suggested_action = EXCLUDED.suggested_action,
                    updated_at = EXCLUDED.updated_at
            `, [id, defect_code, name, row.stage || row['Công đoạn'] || '', row.category || row['Phân loại'] || 'Ngoại quan', row.description || row['Mô tả'] || '', row.severity || row['Mức độ'] || 'MINOR', row.suggested_action || row['Biện pháp'] || '']);
            count++;
        }
        res.json({ success: true, count });
    } catch (error) {
        console.error('Error importing defect library:', error);
        res.status(500).json({ error: 'Failed to import defect library' });
    }
  });

  // --- MATERIALS EXPORT/IMPORT ---
  app.get("/api/materials/export", async (req, res) => {
    try {
        const schema = process.env.DB_SCHEMA || 'appQAQC';
        const result = await query(`SELECT * FROM "${schema}"."material" WHERE "deleted_at" IS NULL ORDER BY "material" ASC`);
        const ws = XLSX.utils.json_to_sheet(result.rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Materials");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Disposition", "attachment; filename=Materials.xlsx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(buf);
    } catch (error) {
        console.error('Error exporting materials:', error);
        res.status(500).json({ error: 'Failed to export materials' });
    }
  });

  app.post("/api/materials/import", memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const schema = process.env.DB_SCHEMA || 'appQAQC';
        let count = 0;
        for (const row of data as any[]) {
            const id = row.id || `MAT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const material = row.material || row['Mã vật tư'] || '';
            const shortText = row.shortText || row['Tên vật tư'] || '';
            if (!material || !shortText) continue;

            await query(`
                INSERT INTO "${schema}"."material" (id, material, "shortText", "orderUnit", "orderQuantity", "supplierName", "projectName", "purchaseDocument", "deliveryDate", "Ma_Tender", "Factory_Order", "updatedAt") 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, (EXTRACT(epoch FROM now()))::bigint)
                ON CONFLICT(id) DO UPDATE SET 
                    material = EXCLUDED.material, 
                    "shortText" = EXCLUDED."shortText", 
                    "orderUnit" = EXCLUDED."orderUnit",
                    "orderQuantity" = EXCLUDED."orderQuantity",
                    "supplierName" = EXCLUDED."supplierName",
                    "projectName" = EXCLUDED."projectName",
                    "purchaseDocument" = EXCLUDED."purchaseDocument",
                    "deliveryDate" = EXCLUDED."deliveryDate",
                    "Ma_Tender" = EXCLUDED."Ma_Tender",
                    "Factory_Order" = EXCLUDED."Factory_Order",
                    "updatedAt" = EXCLUDED."updatedAt"
            `, [id, material, shortText, row.orderUnit || row['Đơn vị'] || '', row.orderQuantity || row['Số lượng'] || 0, row.supplierName || row['Nhà cung cấp'] || '', row.projectName || row['Dự án'] || '', row.purchaseDocument || row['Mã PO'] || '', row.deliveryDate || row['Ngày giao'] || '', row.Ma_Tender || row['Mã Tender'] || '', row.Factory_Order || row['Factory Order'] || '']);
            count++;
        }
        res.json({ success: true, count });
    } catch (error) {
        console.error('Error importing materials:', error);
        res.status(500).json({ error: 'Failed to import materials' });
    }
  });

  // --- SUPPLIERS EXPORT/IMPORT ---
  app.get("/api/suppliers/export", async (req, res) => {
    try {
        const schema = process.env.DB_SCHEMA || 'appQAQC';
        const result = await query(`SELECT * FROM "${schema}"."suppliers" WHERE "deleted_at" IS NULL ORDER BY "name" ASC`);
        const ws = XLSX.utils.json_to_sheet(result.rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Disposition", "attachment; filename=Suppliers.xlsx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(buf);
    } catch (error) {
        console.error('Error exporting suppliers:', error);
        res.status(500).json({ error: 'Failed to export suppliers' });
    }
  });

  app.post("/api/suppliers/import", memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const schema = process.env.DB_SCHEMA || 'appQAQC';
        let count = 0;
        for (const row of data as any[]) {
            const id = row.id || `SUP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const code = row.code || row['Mã NCC'] || '';
            const name = row.name || row['Tên nhà cung cấp'] || '';
            if (!code || !name) continue;

            await query(`
                INSERT INTO "${schema}"."suppliers" (id, code, name, address, contact_person, phone, email, category, status, updated_at) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (EXTRACT(epoch FROM now()))::bigint)
                ON CONFLICT(id) DO UPDATE SET 
                    code = EXCLUDED.code, 
                    name = EXCLUDED.name, 
                    address = EXCLUDED.address,
                    contact_person = EXCLUDED.contact_person,
                    phone = EXCLUDED.phone,
                    email = EXCLUDED.email,
                    category = EXCLUDED.category,
                    status = EXCLUDED.status,
                    updated_at = EXCLUDED.updated_at
            `, [id, code, name, row.address || row['Địa chỉ'] || '', row.contact_person || row['Người liên hệ'] || '', row.phone || row['Số điện thoại'] || '', row.email || row['Email'] || '', row.category || row['Ngành hàng'] || '', row.status || row['Trạng thái'] || 'ACTIVE']);
            count++;
        }
        res.json({ success: true, count });
    } catch (error) {
        console.error('Error importing suppliers:', error);
        res.status(500).json({ error: 'Failed to import suppliers' });
    }
  });

  // --- INSPECTIONS EXPORT ---
  app.get("/api/inspections/export", async (req, res) => {
    try {
        const result = await db.getInspectionsList({}, 1, 10000);
        const ws = XLSX.utils.json_to_sheet(result.items);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Inspections");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Disposition", "attachment; filename=Inspections.xlsx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(buf);
    } catch (error) {
        console.error('Error exporting inspections:', error);
        res.status(500).json({ error: 'Failed to export inspections' });
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

// Run migrations before starting the server (disabled, run manually via script)
// (async () => {
//   try {
//     await runMigrations();
// ...
// })();

// Diagnostic endpoint for database schema
app.get('/api/diag/db', async (req, res) => {
  try {
    const schema = process.env.DB_SCHEMA || 'appQAQC';
    const tables = [
      'forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site', 
      'ncrs', 'users', 'material', 'suppliers', 'projects', 'ipo',
      'defect_library', 'floor_plans', 'layout_pins', 'workshops', 'templates', 'roles', 'audit_logs', 'status_history'
    ];
    
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

// API Catch-all for debugging
app.all("/api/*all", (req, res) => {
  console.warn(`API Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: "API Route not found", 
    method: req.method, 
    url: req.url,
    hint: "Check if the route is defined in server.ts and if the request path is correct."
  });
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  (async () => {
    try {
      const vitePkg = "vite";
      const { createServer: createViteServer } = await import(vitePkg);
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: false
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn("Vite dev server failed to load (expected in production):", e);
    }
  })();
} else {
  const distPath = path.join(__dirname, 'dist');
  
  if (!fs.existsSync(distPath)) {
    console.error("CRITICAL ERROR: 'dist' directory not found!");
    console.error("Please run 'npm run build' before starting the server in production mode.");
    
    app.get("*all", (req, res) => {
      if (req.url.startsWith('/api/')) return;
      res.status(500).send(`
        <div style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e11d48;">Production Build Missing</h1>
          <p>The <code>dist</code> directory was not found on the server.</p>
          <p>Please run <code>npm run build</code> to generate the frontend assets before starting the server.</p>
          <hr style="margin: 20px auto; width: 100px; border: 0; border-top: 1px solid #e2e8f0;">
          <p style="color: #64748b; font-size: 0.875rem;">Domain: ${req.hostname}</p>
        </div>
      `);
    });
  } else {
    console.log("Serving static files from:", distPath);
    app.use(express.static(distPath));
    
    // Standard SPA fallback for Express 5
    app.get("*all", (req, res) => {
      if (req.url.startsWith('/api/')) return; // Should have been caught by API catch-all
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;

