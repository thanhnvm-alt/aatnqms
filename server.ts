import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "./lib/db.js";
import multer from 'multer';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { v2 as cloudinary } from 'cloudinary';
import { google } from 'googleapis';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure Google Drive
let drive: any = null;
if (process.env.GOOGLE_DRIVE_CLIENT_EMAIL && process.env.GOOGLE_DRIVE_PRIVATE_KEY) {
  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      undefined,
      process.env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/drive.file']
    );
    drive = google.drive({ version: 'v3', auth });
    console.log("Google Drive storage configured.");
  } catch (err) {
    console.error("Error configuring Google Drive:", err);
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
const schema = process.env.DB_SCHEMA || 'appQAQC';

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV });
});

// API routes
  app.get("/api/ipo", async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appqaqc';
      const { factoryOrder, maTender } = req.query;
      
      let sql = `SELECT * FROM "${schema}"."ipo" WHERE 1=1`;
      const params: any[] = [];
      
      if (factoryOrder) {
        sql += ` AND "ID_Factory_Order" = $${params.length + 1}`;
        params.push(factoryOrder);
      }
      if (maTender) {
        sql += ` AND "Ma_Tender" = $${params.length + 1}`;
        params.push(maTender);
      }
      
      sql += " LIMIT 100";
      
      const result = await query(sql, params);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching IPO data:', error);
      res.status(500).json({ error: 'Failed to fetch IPO data' });
    }
  });

  app.get("/api/ncrs", async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appQAQC';
      const result = await query(`SELECT * FROM "${schema}"."ncrs" ORDER BY "created_at" DESC`);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching NCRs:', error);
      res.status(500).json({ error: 'Failed to fetch NCRs' });
    }
  });

  // Material API
  app.get("/api/materials", async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appQAQC';
      const result = await query(`SELECT * FROM "${schema}"."material" ORDER BY "createdAt" DESC LIMIT 500`);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching materials:', error);
      res.status(500).json({ error: 'Failed to fetch materials' });
    }
  });

  app.post("/api/materials", express.json(), async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appQAQC';
      const { material, shortText, orderUnit, orderQuantity, supplierName, projectName, purchaseDocument, deliveryDate, Ma_Tender, Factory_Order } = req.body;
      const result = await query(
        `INSERT INTO "${schema}"."material" ("id", "material", "shortText", "orderUnit", "orderQuantity", "supplierName", "projectName", "purchaseDocument", "deliveryDate", "Ma_Tender", "Factory_Order", "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING *`,
        [material, shortText, orderUnit, orderQuantity || 0, supplierName, projectName, purchaseDocument, deliveryDate, Ma_Tender, Factory_Order]
      );
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating material:', error);
      res.status(500).json({ error: 'Failed to create material' });
    }
  });

  app.put("/api/materials/:id", express.json(), async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appQAQC';
      const { id } = req.params;
      const { material, shortText, orderUnit, orderQuantity, supplierName, projectName, purchaseDocument, deliveryDate, Ma_Tender, Factory_Order } = req.body;
      const result = await query(
        `UPDATE "${schema}"."material" SET "material" = $1, "shortText" = $2, "orderUnit" = $3, "orderQuantity" = $4, "supplierName" = $5, "projectName" = $6, "purchaseDocument" = $7, "deliveryDate" = $8, "Ma_Tender" = $9, "Factory_Order" = $10, "updatedAt" = NOW() WHERE "id" = $11 RETURNING *`,
        [material, shortText, orderUnit, orderQuantity || 0, supplierName, projectName, purchaseDocument, deliveryDate, Ma_Tender, Factory_Order, id]
      );
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating material:', error);
      res.status(500).json({ error: 'Failed to update material' });
    }
  });

  app.delete("/api/materials/:id", async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appQAQC';
      const { id } = req.params;
      await query(`DELETE FROM "${schema}"."material" WHERE "id" = $1`, [id]);
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
    // Use memory storage on Vercel, disk storage elsewhere
    const uploader = process.env.VERCEL ? memoryUpload : upload;
    uploader.single('image')(req, res, (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(500).json({ error: err.message });
      }
      next();
    });
  }, async (req, res) => {
    console.log("Received upload request");
    try {
      if (!req.file) {
        console.log("No file in request");
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      let fileUrl = "";
      let filename = "";

      if (process.env.VERCEL || process.env.CLOUDINARY_URL || drive) {
        // Upload to Cloudinary or Google Drive if on Vercel or if configured
        if (process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) {
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
          });

          const fileId = driveResponse.data.id;
          // Make file publicly readable
          await drive.permissions.create({
            fileId: fileId,
            requestBody: {
              role: 'reader',
              type: 'anyone',
            },
          });

          // Google Drive direct link format
          fileUrl = `https://lh3.googleusercontent.com/u/0/d/${fileId}`;
          // Fallback if the above doesn't work for some reason
          // fileUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
          filename = fileId;
        } else {
          // Fallback if no Cloudinary or Google Drive keys: return a data URI (warning: limited size)
          console.warn("No cloud storage configured on Vercel. Falling back to Data URI.");
          const b64 = Buffer.from(req.file.buffer).toString("base64");
          fileUrl = `data:${req.file.mimetype};base64,${b64}`;
          filename = `temp-${Date.now()}`;
        }
      } else {
        // Local storage
        console.log("File received locally:", req.file.filename);
        fileUrl = `/uploads/${req.file.filename}`;
        filename = req.file.filename;
      }

      res.json({ 
        url: fileUrl,
        url_hd: fileUrl,
        url_thumbnail: fileUrl,
        filename: filename,
        size: req.file.size,
        mime: req.file.mimetype
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      res.status(500).json({ error: 'Failed to upload image' });
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

  app.post("/api/query", async (req, res) => {
    console.log("Received query request:", req.body, "Content-Type:", req.headers['content-type']);
    try {
      if (!req.body || !req.body.sql) {
        console.error("Invalid request body for /api/query:", req.body, "Content-Type:", req.headers['content-type']);
        return res.status(400).json({ error: 'Request body or SQL query is missing' });
      }
      const schema = process.env.DB_SCHEMA || 'appQAQC';
      let { sql, args } = req.body;
      
      // Basic SQLite to PostgreSQL syntax conversion
      let pgSql = sql;
      
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
      
      const result = await query(pgSql, args || []);
      res.json({ rows: result.rows, rowCount: result.rowCount });
    } catch (error: any) {
      console.error('Error executing query:', error.message, req.body ? req.body.sql : 'No SQL');
      res.status(500).json({ error: error.message || 'Unknown error' });
    }
  });

  app.post("/api/batch", express.json(), async (req, res) => {
    try {
      const schema = process.env.DB_SCHEMA || 'appQAQC';
      const { queries } = req.body; // Array of { sql, args } or strings
      
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

