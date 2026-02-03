import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as dbHelpers from './lib/db-helpers';
import { db } from './lib/db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors() as any);
app.use(express.json() as any);

// Health Check
app.get('/health', async (req: express.Request, res: express.Response) => {
  try {
    await db.query('SELECT 1');
    res.json({ success: true, status: "ok", database: "connected" });
  } catch (error) {
    res.status(503).json({ success: false, status: "error" });
  }
});

/**
 * ISO QMS API: Plans (Bảng IPO)
 * Chỉ SELECT các cột cần thiết, bắt buộc phân trang.
 */
app.get('/api/plans', async (req: express.Request, res: express.Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string || '').toUpperCase();

    let whereClause = '';
    const params: any[] = [];

    if (search) {
      whereClause = 'WHERE "ma_ct" LIKE $1 OR "ten_ct" LIKE $1 OR "headcode" LIKE $1 OR "ma_nha_may" LIKE $1';
      params.push(`%${search}%`);
    }

    const offset = (page - 1) * limit;
    const dataSql = `
      SELECT id, ma_nha_may, headcode, ma_ct, ten_ct, ten_hang_muc, dvt, so_luong_ipo, planned_date as "plannedDate", assignee, status 
      FROM "IPO" 
      ${whereClause} 
      ORDER BY id DESC 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
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

/**
 * ISO QMS API: Inspections
 */
app.get('/api/inspections', async (req: express.Request, res: express.Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    
    // ISO Rule: Không SELECT các trường JSONB nặng trong List API
    const result = await db.query(`
      SELECT id, type, ma_ct, ten_ct, ten_hang_muc, inspector_name as "inspectorName", date, status, score, workshop 
      FROM "inspections" 
      ORDER BY created_at DESC 
      LIMIT $1 OFFSET $2
    `, [limit, (page - 1) * limit]);

    res.json({ success: true, items: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/inspections/:id', async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM "inspections" WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/inspections', async (req: express.Request, res: express.Response) => {
  try {
    const data = req.body;
    // ISO Rule: Sử dụng Transaction cho việc lưu Inspection và tách NCR nếu có
    const result = await dbHelpers.insert('inspections', data);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 QMS PostgreSQL API running on port ${PORT}`);
});
