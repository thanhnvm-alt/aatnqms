import dotenv from 'dotenv';
dotenv.config();
import express from "express";
import cookieParser from "cookie-parser";
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
import ExcelJS from 'exceljs';
import { v2 as cloudinary } from 'cloudinary';
import { google } from 'googleapis';
import { Readable, pipeline } from 'stream';
import { promisify } from 'util';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import * as pdfParse from 'pdf-parse';
import { GoogleGenAI } from "@google/genai";

const pipelineAsync = promisify(pipeline);
const JWT_SECRET = 'aatn_qms_secret_key_2026_fixed';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Khởi tạo Gemini SDK dựa trên biến môi trường
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not defined in environment variables");
}

const genAI = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Configure Google Drive safely
let drive: any = null;

try {
  if (process.env.GOOGLE_DRIVE_CLIENT_EMAIL && process.env.GOOGLE_DRIVE_PRIVATE_KEY) {
    console.log("Configuring Google Drive with Service Account...");
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    drive = google.drive({ version: 'v3', auth });
    console.log("Google Drive Service Account initialized.");
  } else if (process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_CLIENT_ID,
      process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      process.env.GOOGLE_DRIVE_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    
    // Log new tokens to potentially update in DB or environment
    oauth2Client.on('tokens', (tokens) => {
      console.log('Google OAuth2 emitted new tokens.');
      if (tokens.refresh_token) {
        console.log('NEW REFRESH TOKEN (Please save this securely):', tokens.refresh_token);
      }
      console.log('NEW ACCESS TOKEN (Expires in ms):', tokens.expiry_date);
    });

    drive = google.drive({ version: 'v3', auth: oauth2Client });
    
  } else {
    console.log("Google Drive configuration skipped: credentials missing.");
  }
} catch (err) {
  console.error("Error configuring Google Drive:", err);
}

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
app.use(cookieParser());

// Request logging for debugging
app.use((req, res, next) => {
  // Check for malformed URI
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    decodeURIComponent(url.pathname);
  } catch (e) {
    console.warn(`[Malformed URI] Rejecting request: ${req.url}`);
    return res.status(400).json({ error: 'Malformed URI' });
  }

  if (!req.url.startsWith('/_vite') && !req.url.startsWith('/@')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  }
  next();
});

// RBAC Middleware (JWT Verification)
const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  let token = '';

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token as string;
  } else if (req.cookies && req.cookies['aatn_qms_token']) {
    token = req.cookies['aatn_qms_token'];
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

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
        const data = await (pdfParse as any).default(req.file.buffer);
        const title = req.file.originalname.replace('.pdf', '');
        
        await query(`INSERT INTO "${process.env.DB_SCHEMA || 'appQAQC'}"."procedures" (title, content, category, version) VALUES ($1, $2, 'ISO', '1.0')`, 
            [title, data.text]);
        
        res.json({ message: 'Procedural document uploaded and indexed successfully' });
    } catch (error) {
        console.error("PDF upload error:", error);
        res.status(500).json({ error: 'Failed to process PDF' });
    }
});

// --- Optimized Google Drive Image Streaming Handler ---
const streamGoogleDriveImage = async (req: express.Request, res: express.Response) => {
  const { fileId } = req.params;
  
  if (!drive) {
    return res.status(503).json({ error: "Google Drive service not configured" });
  }

  try {
    // Single API call: Fetch the file content as a stream directly
    const response = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    // Forward the Content-Type precisely natively from Google API
    const contentType = response.headers['content-type'] || 'image/jpeg';
    
    // Set headers (NO redirects, NO google locations)
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Cache-Control', 'private, max-age=604800'); // 7 Days Cache 
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Efficiently pipe using native Node.js stream pipeline (prevents memory leaks on interrupt)
    await pipelineAsync(response.data, res);

  } catch (error: any) {
    // If it's a stream error post-header, pipeline destroys it safely.
    if (!res.headersSent) {
      const status = error.response?.status || error.code || 500;
      console.warn(`[Drive Stream Proxy Error] File ${fileId}: ${status} - ${error.message}`);
      
      if (status === 404) {
        res.status(404).json({ error: 'Image not found' });
      } else if (status === 401 || status === 403) {
        // Token revoked or expired
        res.status(401).json({ error: 'Upstream OAuth access denied' });
      } else {
        res.status(500).json({ error: 'Error streaming image from upstream' });
      }
    }
  }
};

// Map all secure proxy endpoints to the optimized streaming handler
app.get("/api/media/image/:fileId", authenticate, streamGoogleDriveImage);
app.get("/media/stream/:fileId", authenticate, streamGoogleDriveImage);
app.get("/display-image/:fileId", authenticate, streamGoogleDriveImage);
app.get("/api/image/:fileId", authenticate, streamGoogleDriveImage);

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

  app.get("/api/ipo/detail/:id", authenticate, async (req, res) => {
    try {
      const id = String(req.params.id);
      const detail = await db.getIpoDetailById(id);
      const drawings = await db.getIpoDrawings(id);
      const materials = await db.getIpoMaterials(id);
      const samples = await db.getIpoSamples(id);
      res.json({ detail, drawings, materials, samples });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch IPO details' });
    }
  });

  app.post("/api/ipo/detail", authenticate, async (req, res) => {
    try {
      await db.saveIpoDetail(req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save IPO detail' });
    }
  });

  app.post("/api/ipo/drawings", authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      await db.saveIpoDrawingRecord({ ...req.body, created_by: user.name });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save drawing record' });
    }
  });

  app.post("/api/ipo/materials", authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      await db.saveIpoMaterialRecord({ ...req.body, created_by: user.name });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save material record' });
    }
  });

  app.post("/api/ipo/samples", authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      await db.saveIpoSampleRecord({ ...req.body, created_by: user.name });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save sample record' });
    }
  });

  app.put("/api/ipo/samples/:id", authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      await db.updateIpoSampleRecord(req.params.id as string, { ...req.body, updated_by: user.name });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update sample record' });
    }
  });

  app.delete("/api/ipo/samples/:id", authenticate, async (req, res) => {
    try {
      await db.deleteIpoSampleRecord(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete sample record' });
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
        // Create JWT - Increased to 30 days for better UX
        const token = jwt.sign(
          { id: user.id, username: user.username, role: user.role, name: user.name },
          JWT_SECRET,
          { expiresIn: '30d' }
        );
        
        // Set secure HTTP cookie for images and API streaming
        res.cookie('aatn_qms_token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });

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
    
    if (!genAI) {
        console.error("DEBUG: genAI is not initialized (GEMINI_API_KEY missing)");
        return res.status(500).json({ error: "Server API Key not configured" });
    }
    
    try {
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
        const models = ['gemini-2.5-flash', 'gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview'];
        let response;
        
        for (const modelName of models) {
            try {
                const result = await genAI.models.generateContent({
                    model: modelName,
                    contents: [{ role: 'user', parts: [{ text: message }] }],
                    config: {
                        temperature: 0.1,
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
                    },
                });
                response = result;
                break; // If successful, break the loop
            } catch (err: any) {
                console.warn(`Model ${modelName} failed, trying next...`, err.message);
                if (modelName === models[models.length - 1]) throw err; // If last model failed, throw
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
    } catch (error: any) {
      console.error("Layout Pins Error:", error);
      res.status(500).json({ error: error.message || 'Failed to save layout pin' });
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
  app.get("/api/inspections/timeline", authenticate, async (req, res) => {
    try {
      const result = await db.getTimelineHierarchy();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch timeline hierarchy' });
    }
  });

  app.get("/api/inspections/projects-by-date", authenticate, async (req, res) => {
    try {
      const date = req.query.date as string;
      if (!date) return res.status(400).json({ error: 'Date is required' });
      const result = await db.getProjectsByTimelineDate(date);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch projects for date' });
    }
  });

  app.get("/api/inspections", authenticate, async (req, res) => {
    try {
      const filters = {
        status: req.query.status as string,
        search: req.query.search as string,
        qc: req.query.qc as string,
        workshop: req.query.workshop as string,
        project: req.query.project as string,
        type: req.query.type as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string
      };
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const result = await db.getInspectionsList(filters, page, limit);
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

  app.get("/api/inspections/light", authenticate, async (req, res) => {
    try {
      const result = await db.getInspectionsLight();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch light inspections' });
    }
  });

  app.post("/api/inspections", authenticate, async (req, res) => {
    try {
      await db.saveInspection(req.body);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Inspections Save Error:", error);
      res.status(500).json({ error: error.message || 'Failed to save inspection' });
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

  // --- ADMIN / TRASH ---
  app.get("/api/admin/deleted-inspections", authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
        return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
      }
      const result = await db.getDeletedInspections();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch deleted inspections' });
    }
  });

  app.post("/api/admin/restore-inspection/:id", authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
        return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
      }
      await db.restoreInspection(String(req.params.id));
      await logAudit(user.id, 'RESTORE_INSPECTION', 'inspection', String(req.params.id), null, { restoredBy: user.name });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to restore inspection' });
    }
  });

  app.delete("/api/admin/permanent-delete/:id", authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
        return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
      }
      await db.hardDeleteInspection(String(req.params.id));
      await logAudit(user.id, 'PERMANENT_DELETE', 'inspection', String(req.params.id), null, { deletedBy: user.name });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to permanently delete inspection' });
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
        where = ` AND (material ILIKE $1 OR "shortText" ILIKE $1 OR "projectName" ILIKE $1 OR "Ma_Tender" ILIKE $1 OR "purchaseDocument" ILIKE $1)`;
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

  app.get("/api/export/ncrs", async (req, res) => {
    try {
        const schema = process.env.DB_SCHEMA || 'appQAQC';
        const result = await query(`
            SELECT 
                n.id, n.inspection_id, n.defect_code, n.severity, n.status, n.description, 
                n.responsible_person, n.deadline, n.created_by, n.created_at,
                i.ma_ct, i.ten_ct
            FROM "${schema}"."ncrs" n
            LEFT JOIN "${schema}"."forms_pqc" i ON n.inspection_id = i.id
            WHERE n.deleted_at IS NULL
            ORDER BY n.created_at DESC
        `);

        const filename = `AATN_NCR_List_${Date.now()}.xlsx`;
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        // Use streaming writer for large files
        const workbook = new ExcelJS.Workbook();

        const sheet = workbook.addWorksheet('NCRs', {
          views: [{ state: 'frozen', ySplit: 1 }]
        });

        // 4.2 Locked Headers
        await sheet.protect('aatn_protect', {
          selectLockedCells: true,
          selectUnlockedCells: true
        });

        sheet.columns = [
            { header: 'Mã NCR', key: 'id', width: 20 },
            { header: 'Mã hồ sơ gốc', key: 'inspection_id', width: 25 },
            { header: 'Mã dự án', key: 'ma_ct', width: 15 },
            { header: 'Tên dự án', key: 'ten_ct', width: 30 },
            { header: 'Mã lỗi', key: 'defect_code', width: 20 },
            { header: 'Mức độ', key: 'severity', width: 15 },
            { header: 'Trạng thái', key: 'status', width: 15 },
            { header: 'Mô tả lỗi', key: 'description', width: 40 },
            { header: 'Người phụ trách', key: 'responsible_person', width: 25 },
            { header: 'Hạn xử lý', key: 'deadline', width: 15 },
            { header: 'Người tạo', key: 'created_by', width: 25 },
            { header: 'Ngày tạo', key: 'created_at', width: 20 }
        ];

        for (const r of result.rows) {
            const row = sheet.addRow({
                id: String(r.id), // 1. Preserve leading zeros
                inspection_id: String(r.inspection_id),
                ma_ct: r.ma_ct,
                ten_ct: r.ten_ct,
                defect_code: r.defect_code,
                severity: r.severity || 'MINOR',
                status: r.status || 'OPEN',
                description: r.description,
                responsible_person: r.responsible_person,
                deadline: r.deadline,
                created_by: r.created_by,
                created_at: r.created_at ? new Date(Number(r.created_at) > 100000000000 ? Number(r.created_at) : Number(r.created_at) * 1000) : null // 3. Date object
            });

            // 4.2 Unlock data cells
            row.eachCell((cell, colNumber) => {
              cell.protection = { locked: false };
              
              // 3. Constant Date Format
              if (colNumber === 12 && cell.value instanceof Date) {
                 cell.numFmt = 'yyyy-mm-dd hh:mm:ss';
              }
              
              // 4.1 Data Validation for Status
              if (colNumber === 7) {
                cell.dataValidation = {
                  type: 'list',
                  allowBlank: true,
                  formulae: ['"OPEN,IN_PROGRESS,CLOSED"']
                };
              }

              // 4.1 Data Validation for Severity
              if (colNumber === 6) {
                cell.dataValidation = {
                  type: 'list',
                  allowBlank: true,
                  formulae: ['"MINOR,MAJOR,CRITICAL"']
                };
              }
            });

            
        }

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting NCRs:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to export NCRs' });
        }
    }
  });

  // Image Proxy API
  app.get("/api/proxy-image", authenticate, async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      if (!imageUrl) return res.status(400).send('Missing url');
      
      let fileId = '';

      // Pattern 1: lh3.googleusercontent.com/u/0/d/FILE_ID or /d/FILE_ID
      if (imageUrl.includes('googleusercontent.com/u/0/d/') || imageUrl.includes('googleusercontent.com/d/')) {
          const splitPart = imageUrl.includes('/u/0/d/') ? '/u/0/d/' : '/d/';
          fileId = imageUrl.split(splitPart)[1]?.split('=')[0]?.split('?')[0]?.split('&')[0]?.split('/')[0];
      } 
      // Pattern 2: drive.google.com/file/d/FILE_ID/view
      else if (imageUrl.includes('drive.google.com/file/d/')) {
          fileId = imageUrl.split('/d/')[1]?.split('/')[0]?.split('?')[0]?.split('&')[0];
      }
      // Pattern 3: drive.google.com/open?id=FILE_ID or uc?id=FILE_ID
      else if (imageUrl.includes('id=')) {
          const urlParams = new URLSearchParams(imageUrl.split('?')[1]?.split('&token')[0]); // try to isolate params if malformed
          // fallback string parsing if URLSearchParams fails
          const idMatch = imageUrl.match(/id=([^&?]+)/);
          fileId = idMatch ? idMatch[1] : (urlParams.get('id') || '');
      }

      if (fileId && fileId.length > 20) {
          // Attempt 1: Using configured Google Drive client (Auth access)
          if (drive) {
            try {
              const response = await drive.files.get({
                  fileId: fileId,
                  alt: 'media',
                  supportsAllDrives: true
              }, { responseType: 'stream', timeout: 5000 });
              
              const contentType = response.headers['content-type'] || 'image/jpeg';
              res.set('Content-Type', contentType);
              res.set('Access-Control-Allow-Origin', '*');
              res.set('Cache-Control', 'public, max-age=31536000');
              res.set('X-Content-Type-Options', 'nosniff');
              
              await pipelineAsync(response.data, res);
              return;
            } catch (driveErr: any) {
              // Extract a clean status and message from the Google API error response
              const status = driveErr.response?.status || driveErr.code || 500;
              let msg = '';
              
              if (driveErr.response?.data?.error?.message) {
                  msg = driveErr.response.data.error.message;
              } else if (typeof driveErr.message === 'string') {
                  msg = driveErr.message;
              } else {
                  msg = 'Upstream Error';
              }
              
              // Ensure message is a single line and truncated
              msg = msg.replace(/[\r\n]+/g, ' ').trim();
              if (msg.length > 200) {
                 msg = msg.substring(0, 150) + '...';
              }
              
              const isNotFound = status === 404;
              const logMsg = `[Drive Proxy] Auth fetch ${isNotFound ? 'rejected (404 Not Found)' : `failed: ${status}`} for ${fileId}${isNotFound ? '' : ` - ${msg}`}. Trying public fallback...`;
              console.warn(logMsg);
            }
          }

          // Attempt 2: Public fallback (for files shared as "Anyone with link")
          const fallbacks = [
            `https://drive.google.com/uc?export=view&id=${fileId}`,
            `https://drive.google.com/uc?export=download&id=${fileId}`,
            `https://lh3.googleusercontent.com/u/0/d/${fileId}`
          ];

          for (const publicUrl of fallbacks) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              const response = await fetch(publicUrl, { signal: controller.signal });
              clearTimeout(timeoutId);
              
              if (response.ok) {
                  const contentType = response.headers.get('content-type') || 'image/jpeg';
                  // Ignore common "rejection" contents like HTML sign-in pages
                  if (contentType.includes('text/html')) {
                      continue;
                  }

                  const buffer = await response.arrayBuffer();
                  res.set('Content-Type', contentType);
                  res.set('Access-Control-Allow-Origin', '*');
                  res.set('Cache-Control', 'public, max-age=31536000');
                  res.send(Buffer.from(buffer));
                  return;
              }
            } catch (pubErr) {
              console.warn(`[Drive Proxy] Fallback fetch error for ${publicUrl}:`, pubErr);
            }
          }

          // Attempt 3: Final fallback to redirect to the original URL if proxy fails entirely.
          console.warn(`[Drive Proxy] All proxied fetches failed for ${fileId}, redirecting to original URL.`);
          return res.redirect(imageUrl);
      }

      // Fallback for non-drive URLs
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`Failed to fetch fallback: ${response.status} - ${response.statusText}`);
      
      const buffer = await response.arrayBuffer();
      res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'public, max-age=31536000');
      res.send(Buffer.from(buffer));
    } catch (error: any) {
      if (!res.headersSent) {
        console.error('Proxy error:', error.message || error);
        res.status(500).send('Error proxying image');
      }
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
        
        // Native proxy URL from the backend
        const driveUrl = `https://lh3.googleusercontent.com/u/0/d/${fileId}`;
        fileUrl = `/api/proxy-image?url=${encodeURIComponent(driveUrl)}`;
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

  app.post("/api/import/ncrs", memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        
        const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];
        if (!worksheet) return res.status(400).json({ error: 'No worksheet found' });

        const validResults = [];
        const errorLogs = [];
        const schema = process.env.DB_SCHEMA || 'appQAQC';

        for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
            const row = worksheet.getRow(rowIndex);
            if (!row || !row.values || (Array.isArray(row.values) && row.values.length <= 1)) continue;

            try {
              const id = row.getCell(1).text?.trim(); 
              const defectCode = row.getCell(5).text?.trim();
              const description = row.getCell(8).text?.trim();
              const status = row.getCell(7).text?.trim()?.toUpperCase() || 'OPEN';
              const severity = row.getCell(6).text?.trim()?.toUpperCase() || 'MEDIUM';
              const responsiblePerson = row.getCell(9).text?.trim();

              if (!defectCode) continue;
              
              if (id && id.startsWith('NCR-')) {
                  await query(`
                      UPDATE "${schema}"."ncrs" 
                      SET "defect_code" = $1, "description" = $2, "status" = $3, "severity" = $4, "responsible_person" = $5, "updated_at" = (EXTRACT(epoch FROM now()))::bigint
                      WHERE "id" = $6
                  `, [defectCode, description, status, severity, responsiblePerson, id]);
              } else {
                  const newId = `NCR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                  await query(`
                      INSERT INTO "${schema}"."ncrs" ("id", "defect_code", "description", "status", "severity", "responsible_person", "created_at", "updated_at") 
                      VALUES ($1, $2, $3, $4, $5, $6, (EXTRACT(epoch FROM now()))::bigint, (EXTRACT(epoch FROM now()))::bigint)
                  `, [newId, defectCode, description, status, severity, responsiblePerson]);
              }
              validResults.push(id || 'NEW');
            } catch (err: any) {
              errorLogs.push({ row_index: rowIndex, error_message: err.message });
            }
        }

        res.json({ 
          success: true, 
          imported_count: validResults.length,
          errors: errorLogs 
        });
    } catch (error) {
        console.error('Error importing NCRs:', error);
        res.status(500).json({ error: 'Failed to import NCRs' });
    }
  });

  // --- DEFECT LIBRARY EXPORT/IMPORT ---
  app.get("/api/export/defects", async (req, res) => {
    try {
        const schema = process.env.DB_SCHEMA || 'appQAQC';
        const result = await query(`SELECT * FROM "${schema}"."defect_library" ORDER BY "defect_code" ASC`);
        
        const filename = `AATN_Defect_Library_${Date.now()}.xlsx`;
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        const workbook = new ExcelJS.Workbook();

        const sheet = workbook.addWorksheet('DefectLibrary', { views: [{ state: 'frozen', ySplit: 1 }] });

        sheet.columns = [
            { header: 'ID', key: 'id', width: 25 },
            { header: 'Mã lỗi', key: 'defect_code', width: 20 },
            { header: 'Tên lỗi (VN)', key: 'name', width: 30 },
            { header: 'Tên lỗi (EN)', key: 'name_en', width: 30 },
            { header: 'Công đoạn', key: 'stage', width: 20 },
            { header: 'Phân loại', key: 'category', width: 20 },
            { header: 'Mức độ mặc định', key: 'severity', width: 15 },
            { header: 'Mô tả chi tiết', key: 'description', width: 40 }
        ];

        for (const r of result.rows) {
            const row = sheet.addRow({
                id: String(r.id),
                defect_code: String(r.defect_code),
                name: r.name,
                name_en: r.name_en,
                stage: r.stage,
                category: r.category,
                severity: r.severity || 'MINOR',
                description: r.description
            });
            
        }

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting defect library:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to export defect library' });
    }
  });

  app.post("/api/import/defects", memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        
        const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];
        if (!worksheet) return res.status(400).json({ error: 'No worksheet found' });

        const validResults = [];
        const errorLogs = [];
        const schema = process.env.DB_SCHEMA || 'appQAQC';

        for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
            const row = worksheet.getRow(rowIndex);
            if (!row || !row.values || (Array.isArray(row.values) && row.values.length <= 1)) continue;

            try {
              const id = row.getCell(1).text?.trim() || `DEF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
              const defect_code = row.getCell(2).text?.trim();
              const name = row.getCell(3).text?.trim();
              
              if (!defect_code || !name) continue;

              await query(`
                  INSERT INTO "${schema}"."defect_library" (id, defect_code, name, stage, category, description, severity, suggested_action, updated_at) 
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (EXTRACT(epoch FROM now()))::bigint)
                  ON CONFLICT(id) DO UPDATE SET 
                      defect_code = EXCLUDED.defect_code, name = EXCLUDED.name, stage = EXCLUDED.stage,
                      category = EXCLUDED.category, description = EXCLUDED.description, severity = EXCLUDED.severity,
                      suggested_action = EXCLUDED.suggested_action, updated_at = EXCLUDED.updated_at
              `, [id, defect_code, name, row.getCell(5).text?.trim(), row.getCell(6).text?.trim(), row.getCell(8).text?.trim(), row.getCell(7).text?.trim()?.toUpperCase() || 'MINOR', '']);
              
              validResults.push(id);
            } catch (err: any) {
              errorLogs.push({ row_index: rowIndex, error_message: err.message });
            }
        }
        res.json({ success: true, count: validResults.length, errors: errorLogs });
    } catch (error) {
        console.error('Error importing defect library:', error);
        res.status(500).json({ error: 'Failed to import defect library' });
    }
  });

  // --- MATERIALS EXPORT/IMPORT ---
  app.get("/api/export/materials", async (req, res) => {
    try {
        const schema = process.env.DB_SCHEMA || 'appQAQC';
        const result = await query(`SELECT * FROM "${schema}"."material" ORDER BY "material" ASC`);
        
        const filename = `AATN_Materials_${Date.now()}.xlsx`;
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        const workbook = new ExcelJS.Workbook();

        const sheet = workbook.addWorksheet('Materials', { views: [{ state: 'frozen', ySplit: 1 }] });

        sheet.columns = [
            { header: 'Mã vật tư', key: 'material', width: 20 },
            { header: 'Tên vật tư', key: 'shortText', width: 30 },
            { header: 'Đơn vị tính', key: 'orderUnit', width: 15 },
            { header: 'Số lượng', key: 'orderQuantity', width: 15 },
            { header: 'Nhà cung cấp', key: 'supplierName', width: 30 },
            { header: 'Tên dự án', key: 'projectName', width: 30 },
            { header: 'Chứng từ mua hàng', key: 'purchaseDocument', width: 25 },
            { header: 'Ngày giao hàng', key: 'deliveryDate', width: 15 },
            { header: 'Mã Tender', key: 'Ma_Tender', width: 15 },
            { header: 'Mã nhà máy (Factory Order)', key: 'Factory_Order', width: 20 },
            { header: 'ID', key: 'id', width: 25 }
        ];

        for (const r of result.rows) {
            const row = sheet.addRow({
                material: String(r.material || ''),
                shortText: r.shortText,
                orderUnit: r.orderUnit,
                orderQuantity: Number(r.orderQuantity || 0),
                supplierName: r.supplierName,
                projectName: r.projectName,
                purchaseDocument: r.purchaseDocument,
                deliveryDate: r.deliveryDate,
                Ma_Tender: String(r.Ma_Tender || ''),
                Factory_Order: String(r.Factory_Order || ''),
                id: String(r.id)
            });
            
        }

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting materials:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to export materials' });
    }
  });

  app.post("/api/import/materials", memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        
        const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];
        if (!worksheet) return res.status(400).json({ error: 'No worksheet found' });

        const validResults = [];
        const errorLogs = [];
        const schema = process.env.DB_SCHEMA || 'appQAQC';

        for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
            const row = worksheet.getRow(rowIndex);
            if (!row || !row.values || (Array.isArray(row.values) && row.values.length <= 1)) continue;

            try {
              const material = row.getCell(1).text?.trim();
              const shortText = row.getCell(2).text?.trim();
              const id = row.getCell(11).text?.trim() || `MAT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

              if (!material || !shortText) continue;

              await query(`
                  INSERT INTO "${schema}"."material" (id, material, "shortText", "orderUnit", "orderQuantity", "supplierName", "projectName", "purchaseDocument", "deliveryDate", "Ma_Tender", "Factory_Order", "updatedAt") 
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, (EXTRACT(epoch FROM now()))::bigint)
                  ON CONFLICT(id) DO UPDATE SET 
                      material = EXCLUDED.material, "shortText" = EXCLUDED."shortText", "orderUnit" = EXCLUDED."orderUnit",
                      "orderQuantity" = EXCLUDED."orderQuantity", "supplierName" = EXCLUDED."supplierName",
                      "projectName" = EXCLUDED."projectName", "purchaseDocument" = EXCLUDED."purchaseDocument",
                      "deliveryDate" = EXCLUDED."deliveryDate", "Ma_Tender" = EXCLUDED."Ma_Tender",
                      "Factory_Order" = EXCLUDED."Factory_Order", "updatedAt" = EXCLUDED."updatedAt"
              `, [id, material, shortText, row.getCell(3).text?.trim(), Number(row.getCell(4).value || 0), row.getCell(5).text?.trim(), row.getCell(6).text?.trim(), row.getCell(7).text?.trim(), row.getCell(8).text?.trim(), row.getCell(9).text?.trim(), row.getCell(10).text?.trim()]);
              
              validResults.push(id);
            } catch (err: any) {
              errorLogs.push({ row_index: rowIndex, error_message: err.message });
            }
        }
        res.json({ success: true, count: validResults.length, errors: errorLogs });
    } catch (error) {
        console.error('Error importing materials:', error);
        res.status(500).json({ error: 'Failed to import materials' });
    }
  });

  // --- SUPPLIERS EXPORT/IMPORT ---
  app.get("/api/export/suppliers", async (req, res) => {
    try {
        const schema = process.env.DB_SCHEMA || 'appQAQC';
        const result = await query(`SELECT * FROM "${schema}"."suppliers" WHERE "deleted_at" IS NULL ORDER BY "name" ASC`);
        
        const filename = `AATN_Suppliers_${Date.now()}.xlsx`;
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        const workbook = new ExcelJS.Workbook();

        const sheet = workbook.addWorksheet('Suppliers', {
          views: [{ state: 'frozen', ySplit: 1 }]
        });

        await sheet.protect('aatn_sup_protect', {
          selectLockedCells: true,
          selectUnlockedCells: true
        });

        sheet.columns = [
            { header: 'ID', key: 'id', width: 25 },
            { header: 'Mã NCC', key: 'code', width: 15 },
            { header: 'Tên nhà cung cấp', key: 'name', width: 30 },
            { header: 'Địa chỉ', key: 'address', width: 40 },
            { header: 'Người liên hệ', key: 'contact_person', width: 25 },
            { header: 'SĐT', key: 'phone', width: 20 },
            { header: 'Email', key: 'email', width: 25 },
            { header: 'Phân loại', key: 'category', width: 20 },
            { header: 'Trạng thái', key: 'status', width: 15 }
        ];

        for (const r of result.rows) {
            const row = sheet.addRow({
                id: String(r.id), // 1. Preserve zeros
                code: String(r.code || ''),
                name: r.name,
                address: r.address,
                contact_person: r.contact_person,
                phone: String(r.phone || ''), // 1. Preserve zeros
                email: r.email,
                category: r.category,
                status: r.status || 'ACTIVE'
            });

            row.eachCell((cell, colNumber) => {
              cell.protection = { locked: false };
              if (colNumber === 9) { // Status dropdown
                cell.dataValidation = {
                  type: 'list',
                  allowBlank: true,
                  formulae: ['"ACTIVE,INACTIVE"']
                };
              }
            });

            
        }

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting suppliers:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to export suppliers' });
    }
  });

  app.post("/api/import/suppliers", memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        
        const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];
        if (!worksheet) return res.status(400).json({ error: 'No worksheet found' });

        const validResults = [];
        const errorLogs = [];
        const schema = process.env.DB_SCHEMA || 'appQAQC';

        for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
            const row = worksheet.getRow(rowIndex);
            if (!row || !row.values || (Array.isArray(row.values) && row.values.length <= 1)) continue;

            try {
              const id = row.getCell(1).text?.trim() || `SUP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
              const code = row.getCell(2).text?.trim();
              const name = row.getCell(3).text?.trim();
              
              if (!code || !name) continue;

              await query(`
                  INSERT INTO "${schema}"."suppliers" (id, code, name, address, contact_person, phone, email, category, status, updated_at) 
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (EXTRACT(epoch FROM now()))::bigint)
                  ON CONFLICT(id) DO UPDATE SET 
                      code = EXCLUDED.code, name = EXCLUDED.name, address = EXCLUDED.address,
                      contact_person = EXCLUDED.contact_person, phone = EXCLUDED.phone, email = EXCLUDED.email,
                      category = EXCLUDED.category, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
              `, [id, code, name, row.getCell(4).text?.trim(), row.getCell(5).text?.trim(), row.getCell(6).text?.trim(), row.getCell(7).text?.trim(), row.getCell(8).text?.trim(), row.getCell(9).text?.trim()?.toUpperCase() || 'ACTIVE']);
              
              validResults.push(id);
            } catch (err: any) {
              errorLogs.push({ row_index: rowIndex, error_message: err.message });
            }
        }
        res.json({ success: true, count: validResults.length, errors: errorLogs });
    } catch (error) {
        console.error('Error importing suppliers:', error);
        res.status(500).json({ error: 'Failed to import suppliers' });
    }
  });

  // --- IPO EXPORT ---
  app.get("/api/export/ipo", async (req, res) => {
    try {
        const schema = process.env.DB_SCHEMA || 'appQAQC';
        const result = await query(`SELECT * FROM "${schema}"."ipo" ORDER BY "id" ASC LIMIT 50000`);
        
        const filename = `AATN_IPO_Data_${Date.now()}.xlsx`;
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        const workbook = new ExcelJS.Workbook();

        const sheet = workbook.addWorksheet('IPO_Data', { views: [{ state: 'frozen', ySplit: 1 }] });

        sheet.columns = [
            { header: 'ID', key: 'id', width: 25 },
            { header: 'ID Factory Order', key: 'ID_Factory_Order', width: 20 },
            { header: 'Mã Tender', key: 'Ma_Tender', width: 15 },
            { header: 'Tên dự án', key: 'Project_name', width: 30 },
            { header: 'Mô tả vật tư', key: 'Material_description', width: 40 },
            { header: 'Số lượng IPO', key: 'Quantity_IPO', width: 15 },
            { header: 'Đơn vị tính', key: 'Base_Unit', width: 15 }
        ];

        for (const r of result.rows) {
            const row = sheet.addRow({
                id: String(r.id),
                ID_Factory_Order: String(r.ID_Factory_Order || ''),
                Ma_Tender: String(r.Ma_Tender || ''),
                Project_name: r.Project_name,
                Material_description: r.Material_description,
                Quantity_IPO: Number(r.Quantity_IPO || 0),
                Base_Unit: r.Base_Unit
            });
            
        }

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting IPO data:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to export IPO data' });
    }
  });
  app.post("/api/import/ipo", memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        
        const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];
        if (!worksheet) return res.status(400).json({ error: 'No worksheet found' });

        const validResults = [];
        const errorLogs = [];
        const schema = process.env.DB_SCHEMA || 'appQAQC';

        for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
            const row = worksheet.getRow(rowIndex);
            if (!row || !row.values || (Array.isArray(row.values) && row.values.length <= 1)) continue;

            try {
              const idText = row.getCell(1).text?.trim();
              const factoryOrder = row.getCell(2).text?.trim();
              const maTender = row.getCell(3).text?.trim();
              const projectName = row.getCell(4).text?.trim();
              const materialDesc = row.getCell(5).text?.trim();
              const qty = Number(row.getCell(6).value || 0);
              const unit = row.getCell(7).text?.trim();

              if (!factoryOrder) continue;

              // If id exists, try update, else insert
              if (idText && !isNaN(Number(idText))) {
                  await query(`
                      UPDATE "${schema}"."ipo" 
                      SET "ID_Factory_Order" = $1, "Ma_Tender" = $2, "Project_name" = $3, "Material_description" = $4, "Quantity_IPO" = $5, "Base_Unit" = $6, "updatedAt" = now()
                      WHERE "id" = $7
                  `, [factoryOrder, maTender, projectName, materialDesc, qty, unit, Number(idText)]);
                  validResults.push(idText);
              } else {
                  const result = await query(`
                      INSERT INTO "${schema}"."ipo" ("ID_Factory_Order", "Ma_Tender", "Project_name", "Material_description", "Quantity_IPO", "Base_Unit", "createdAt", "updatedAt") 
                      VALUES ($1, $2, $3, $4, $5, $6, now(), now())
                      RETURNING "id"
                  `, [factoryOrder, maTender, projectName, materialDesc, qty, unit]);
                  validResults.push(result.rows[0].id);
              }
            } catch (err: any) {
              errorLogs.push({ row_index: rowIndex, error_message: err.message });
            }
        }
        res.json({ success: true, count: validResults.length, errors: errorLogs });
    } catch (error) {
        console.error('Error importing IPO data:', error);
        res.status(500).json({ error: 'Failed to import IPO data' });
    }
  });

  app.get("/api/export/inspections", async (req, res) => {
    try {
        const filters = {
            status: req.query.status as string,
            search: req.query.search as string,
            qc: req.query.qc as string,
            workshop: req.query.workshop as string,
            project: req.query.project as string,
            type: req.query.type as string,
            startDate: req.query.startDate as string,
            endDate: req.query.endDate as string
        };

        const result = await db.getInspectionsList(filters, 1, 50000);
        
        const filename = `AATN_Inspections_${Date.now()}.xlsx`;
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Inspections', {
          views: [{ state: 'frozen', ySplit: 1 }]
        });

        await sheet.protect('aatn_ins_protect', {
          selectLockedCells: true,
          selectUnlockedCells: true
        });

        sheet.columns = [
            { header: 'Mã hồ sơ', key: 'id', width: 20 },
            { header: 'Loại phiếu', key: 'type', width: 15 },
            { header: 'Mã dự án', key: 'ma_ct', width: 15 },
            { header: 'Tên dự án', key: 'ten_ct', width: 30 },
            { header: 'Hạng mục/Mô tả', key: 'ten_hang_muc', width: 30 },
            { header: 'Mã nhà máy', key: 'ma_nha_may', width: 15 },
            { header: 'Headcode', key: 'headcode', width: 15 },
            { header: 'QC kiểm tra', key: 'inspectorName', width: 25 },
            { header: 'Xưởng', key: 'workshop', width: 20 },
            { header: 'Công đoạn sản xuất', key: 'inspectionStage', width: 20 },
            { header: 'Ngày thực hiện', key: 'date', width: 15 },
            { header: 'Trạng thái', key: 'status', width: 15 },
            { header: 'SL ĐĐH', key: 'so_luong_ipo', width: 10 },
            { header: 'SLkiem', key: 'inspectedQuantity', width: 10 },
            { header: 'SLDat', key: 'passedQuantity', width: 10 },
            { header: 'TLDat', key: 'passedPercentage', width: 10 },
            { header: 'SLLoi', key: 'failedQuantity', width: 10 },
            { header: 'TLLoi', key: 'failedPercentage', width: 10 },
            { header: 'Kết luận/Ghi chú', key: 'summary', width: 40 },
            { header: 'Hình ảnh hiện trường', key: 'siteImages', width: 50 },
            { header: 'ĐVT/Unit', key: 'dvt', width: 15 }
        ];

        for (const item of result.items) {
            let rowDate = null;
            if (item.date) {
                // Handle DD/MM/YYYY
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(item.date)) {
                    const [d, m, y] = item.date.split('/');
                    rowDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
                } else if (!isNaN(Number(item.date)) && Number(item.date) > 100000000) {
                    const ts = Number(item.date);
                    rowDate = new Date(ts > 100000000000 ? ts : ts * 1000);
                } else {
                    rowDate = new Date(item.date);
                }
                if (rowDate && isNaN(rowDate.getTime())) rowDate = null;
            }
            
            let rowUpdated = null;
            if (item.updatedAt) {
                const ts = Number(item.updatedAt);
                // If it's in seconds (like normally stored) multiply by 1000, 
                // if it's already in ms (very large), keep as is.
                rowUpdated = new Date(ts > 100000000000 ? ts : ts * 1000);
                if (isNaN(rowUpdated.getTime())) rowUpdated = null;
            }

            // Extract images joining with new lines or commas
            const siteImages = (item.images && Array.isArray(item.images)) 
                ? item.images.join(', ') 
                : '';

            const so_luong_ipo = Number(item.so_luong_ipo || 0);
            const inspectedQuantity = Number(item.inspectedQuantity || 0);
            const passedQuantity = Number(item.passedQuantity || 0);
            const failedQuantity = Number(item.failedQuantity || 0);
            
            let passedPercentage = '';
            let failedPercentage = '';
            if (inspectedQuantity > 0) {
                passedPercentage = ((passedQuantity / inspectedQuantity) * 100).toFixed(2) + '%';
                failedPercentage = ((failedQuantity / inspectedQuantity) * 100).toFixed(2) + '%';
            }

            const row = sheet.addRow({
                id: String(item.id || ''),
                type: item.type || '',
                ma_ct: item.ma_ct || '',
                ten_ct: item.ten_ct || '',
                ten_hang_muc: item.ten_hang_muc || '',
                ma_nha_may: item.ma_nha_may || '',
                headcode: item.headcode || '',
                inspectorName: item.inspectorName || '',
                workshop: item.workshop || '',
                inspectionStage: item.inspectionStage || '',
                date: rowDate,
                status: item.status || '',
                so_luong_ipo: so_luong_ipo,
                inspectedQuantity: inspectedQuantity,
                passedQuantity: passedQuantity,
                passedPercentage: passedPercentage,
                failedQuantity: failedQuantity,
                failedPercentage: failedPercentage,
                summary: item.summary || '',
                siteImages: siteImages,
                dvt: item.dvt || ''
            });

            row.eachCell((cell, colNumber) => {
              cell.protection = { locked: false };
              // date is col index 11, updatedAt is 21
              if ((colNumber === 11 || colNumber === 21) && cell.value instanceof Date) {
                 cell.numFmt = 'yyyy-mm-dd hh:mm:ss';
              }
              if (colNumber === 12) { // Status dropdown
                cell.dataValidation = {
                  type: 'list',
                  allowBlank: true,
                  formulae: ['"DRAFT,SUBMITTED,APPROVED,REJECTED,VERIFIED,LOCKED"']
                };
              }
            });
        }

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting inspections:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to export inspections' });
    }
  });

  // --- INSPECTIONS IMPORT ---
  app.post("/api/import/inspections", authenticate, memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        
        const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];
        if (!worksheet) return res.status(400).json({ error: 'No worksheet found in Excel file' });

        const validResults = [];
        const errorLogs = [];
        let colMap: Record<string, number> = {};

        // Map headers from the first row
        const firstRow = worksheet.getRow(1);
        firstRow.eachCell((cell, colNumber) => {
            const headerText = cell.text?.trim()?.toLowerCase();
            if (headerText) colMap[headerText] = colNumber;
        });

        // Use standard for loop for async/await support
        for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
            const row = worksheet.getRow(rowIndex);
            if (!row || !row.values || (Array.isArray(row.values) && row.values.length <= 1)) continue;

            try {
                const getCol = (names: string[]) => {
                    for (const name of names) {
                        const idx = colMap[name.toLowerCase()];
                        if (idx) return row.getCell(idx).text?.trim();
                    }
                    return '';
                };

                const getVal = (names: string[]) => {
                    for (const name of names) {
                        const idx = colMap[name.toLowerCase()];
                        if (idx) return row.getCell(idx).value;
                    }
                    return 0;
                };

                const cleanNumber = (val: any) => {
                    if (typeof val === 'number') return val;
                    if (!val) return 0;
                    const cleaned = String(val).replace(/[^\d.-]/g, '');
                    const num = parseFloat(cleaned);
                    return isNaN(num) ? 0 : num;
                };

                const id = getCol(['mã hồ sơ', 'id', 'mã']);
                const ma_ct = getCol(['mã dự án', 'ma_ct', 'mã công trình', 'project code', 'ma_du_an']);
                if (!ma_ct) continue; // Skip empty rows silently or log if needed

                const inspection_date_raw = getVal(['ngày thực hiện', 'ngày thực', 'date']);
                let updatedAt = Math.floor(Date.now() / 1000);

                if (inspection_date_raw) {
                    if (inspection_date_raw instanceof Date) {
                        updatedAt = Math.floor(inspection_date_raw.getTime() / 1000);
                    } else {
                        const dateStr = String(inspection_date_raw).trim();
                        // Try DD/MM/YYYY
                        const parts = dateStr.split('/');
                        if (parts.length === 3) {
                            const day = parseInt(parts[0], 10);
                            const month = parseInt(parts[1], 10) - 1;
                            const year = parseInt(parts[2], 10);
                            const d = new Date(year, month, day);
                            if (!isNaN(d.getTime())) updatedAt = Math.floor(d.getTime() / 1000);
                        } else {
                            const d = new Date(dateStr);
                            if (!isNaN(d.getTime())) updatedAt = Math.floor(d.getTime() / 1000);
                        }
                    }
                }

                // Mapping specific columns
                const getValFromHeaders = (headers: string[]) => {
                    const found = Object.keys(colMap).find(h => headers.some(req => h.toLowerCase().includes(req.toLowerCase())));
                    return found ? row.getCell(colMap[found]).text?.trim() || String(row.getCell(colMap[found]).value || '').trim() : null;
                };

                const convertDriveIdToProxy = (val: string) => {
                    if (!val || val === '0' || val === 'false') return [];
                    const items = val.split(/[,;\n]/).map(u => u.trim()).filter(u => u);
                    return items.map(u => {
                        if (u.length >= 25 && u.length <= 50 && !u.includes('/') && !u.includes(':')) {
                            const driveUrl = `https://lh3.googleusercontent.com/u/0/d/${u}`;
                            return `/api/proxy-image?url=${encodeURIComponent(driveUrl)}`;
                        }
                        if (u.includes('drive.google.com') && !u.includes('/api/proxy-image')) {
                            return `/api/proxy-image?url=${encodeURIComponent(u)}`;
                        }
                        return u;
                    });
                };

                const hinh_anh_val = getValFromHeaders(['hình ảnh hiện trường', 'ảnh hiện trường', 'hình ảnh', 'images', 'image', 'ảnh', 'hình ảnh hiện trường tổng quát']);
                const images = convertDriveIdToProxy(hinh_anh_val || '');

                const chu_ky_qc_val = getValFromHeaders(['chữ ký qc', 'qc signature', 'chu ky qc', 'ký qc']);
                const qcSignatures = convertDriveIdToProxy(chu_ky_qc_val || '');
                const qcSignature = qcSignatures.length > 0 ? qcSignatures[0] : null;

                const inspectorNameRaw = getValFromHeaders(['qc kiểm tra', 'qc thẩm định', 'qc', 'qc_name', 'inspector', 'inspectorname']);

                const inspection: any = {
                    id: id || `INS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    type: getCol(['loại phiếu', 'type', 'module', 'loại', 'loai phieu', 'loai_phieu', 'form type', 'form_type']) || 'PQC',
                    ma_ct,
                    ten_ct: getCol(['tên dự án', 'ten_ct', 'tên công trình', 'project name']),
                    ten_hang_muc: getCol(['hạng mục', 'hạng mục/mô tả', 'ten_hang_muc', 'item name', 'hang_muc', 'ten_hang_muc']),
                    ma_nha_may: getCol(['mã nhà máy', 'ma_nha_may', 'factory code', 'ma_nm']),
                    headcode: getCol(['headcode']),
                    inspectorName: inspectorNameRaw || (req as any).user?.name,
                    workshop: getCol(['xưởng', 'workshop']),
                    inspectionStage: getCol(['công đoạn', 'công đoạn sản xuất', 'stage']),
                    date: getCol(['ngày thực hiện', 'ngày thực', 'date']),
                    status: getCol(['trạng thái', 'status'])?.toUpperCase() || 'DRAFT',
                    so_luong_ipo: cleanNumber(getVal(['sl đđh', 'sl ipo', 'so_luong_ipo'])),
                    inspectedQuantity: cleanNumber(getVal(['slkiem', 'sl kiểm', 'inspected quantity', 'inspected_qty', 'inspectedquantity'])),
                    passedQuantity: cleanNumber(getVal(['sldat', 'sl đạt', 'passed quantity', 'passed_qty', 'passedquantity'])),
                    failedQuantity: cleanNumber(getVal(['slloi', 'sl lỗi', 'sl hồng', 'failed quantity', 'failed_qty', 'failedquantity'])),
                    summary: getCol(['kết luận/ghi chú', 'kết luận', 'summary']),
                    responsiblePerson: getCol(['phụ trách', 'người phụ trách', 'responsibleperson']), 
                    dvt: getCol(['đvt/unit', 'dvt', 'unit']),
                    items: [],
                    images,
                    signature: qcSignature,
                    comments: [],
                    updatedAt
                };

                // Fallback for numbers
                if (inspection.so_luong_ipo === 0) inspection.so_luong_ipo = cleanNumber(getCol(['sl đđh', 'sl ipo', 'so_luong_ipo']));
                if (inspection.inspectedQuantity === 0) inspection.inspectedQuantity = cleanNumber(getCol(['slkiem', 'sl kiểm', 'inspectedquantity']));
                if (inspection.passedQuantity === 0) inspection.passedQuantity = cleanNumber(getCol(['sldat', 'sl đạt', 'passedquantity']));
                if (inspection.failedQuantity === 0) inspection.failedQuantity = cleanNumber(getCol(['slloi', 'sl lỗi', 'sl hồng', 'failedquantity']));

                await db.saveInspection(inspection);
                validResults.push(inspection.id);
            } catch (err: any) {
                console.error(`❌ Error importing row ${rowIndex}:`, err.message);
                errorLogs.push({ row_index: rowIndex, error_message: err.message });
            }
        }

        res.json({ success: true, count: validResults.length, errors: errorLogs });
    } catch (error) {
        console.error('Error importing inspections:', error);
        res.status(500).json({ error: 'Failed to import inspections' });
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
  console.error('SERVER ERROR:', err);
  
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    return res.status(400).send({ error: 'Bad JSON' });
  }

  // If it's an API request, always return JSON
  if (req.url.startsWith('/api/')) {
    return res.status(err.status || 500).json({ 
      error: err.message || 'Internal Server Error',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
  
  next(err);
});

// Run migrations before starting the server
(async () => {
  try {
    await runMigrations();
  } catch (err) {
    console.error("Critical error during startup migrations:", err);
  }
})();

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
console.log(`🚀 Starting server in ${process.env.NODE_ENV || 'development'} mode...`);
console.log(`📡 Database Schema: ${process.env.DB_SCHEMA || 'appQAQC'}`);
console.log(`🔧 PORT: ${PORT}`);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

export default app;

