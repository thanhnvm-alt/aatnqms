
import express, { Request, Response } from 'express';
import cors from 'cors';
import { db } from '../lib/db';

const app = express();

app.use(cors());
app.use(express.json());

// Logger middleware để debug request
app.use((req, res, next) => {
  console.log(`[API Request] ${req.method} ${req.url}`);
  next();
});

const router = express.Router();

// Health Check
router.get('/health', async (req: Request, res: Response) => {
  try {
    const result = await db.query('SELECT NOW() as now');
    res.json({ 
      success: true,
      status: 'ok', 
      database: 'connected',
      schema: process.env.DB_SCHEMA,
      serverTime: result.rows[0].now 
    });
  } catch (error: any) {
    console.error('[API Health Error]:', error);
    res.status(500).json({ success: false, status: 'error', message: error.message });
  }
});

// IPOs Endpoint
router.get('/ipos', async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    console.log(`[API] Fetching IPOs. Search term: "${search || ''}"`);
    
    // Câu query đơn giản, tên bảng trong ngoặc kép để giữ case-sensitive nếu cần
    // search_path đã được xử lý trong lib/db.ts
    let query = `SELECT * FROM "ipo"`; 
    let params: any[] = [];

    if (search && String(search).trim() !== '') {
      const term = `%${search}%`;
      query += ` WHERE 
                 "Project_name" ILIKE $1 OR 
                 "ID_Project" ILIKE $1 OR 
                 "Material_description" ILIKE $1 OR 
                 "ID_Factory_Order" ILIKE $1 OR
                 "IPO_Number" ILIKE $1`;
      params.push(term);
    }

    query += ` ORDER BY "Created_on" DESC NULLS LAST LIMIT 100`;

    const result = await db.query(query, params);
    
    res.json({ 
      success: true, 
      count: result.rowCount,
      items: result.rows 
    });
  } catch (error: any) {
    console.error('[API IPOs Error]:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Database Query Failed', 
      details: error.message,
      hint: 'Check DB_SCHEMA configuration if table not found'
    });
  }
});

// Mount router cho cả root và /api để tránh lỗi 404 do Vite rewrite
app.use('/', router);
app.use('/api', router);

// Fallback 404 Handler trả về JSON thay vì HTML
app.use((req, res) => {
  console.warn(`[API 404] Route not found: ${req.originalUrl}`);
  res.status(404).json({ 
    success: false, 
    error: `API endpoint not found: ${req.originalUrl}` 
  });
});

export default app;
