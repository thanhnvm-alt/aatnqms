
import { query } from '../lib/db-postgres/db';
import { IPO } from '../types';
import { getAuthUser } from '../lib/auth';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
      return res.status(405).json({
          success: false,
          code: 'METHOD_NOT_ALLOWED',
          message: 'Method Not Allowed'
      });
  }

  try {
    const user = getAuthUser(req);
    if (!user) {
        return res.status(401).json({
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Unauthorized'
        });
    }
    
    // In Vercel Node functions, req.query is already parsed
    const search = req.query.search as string;

    let ipos: IPO[];

    if (search) {
        const term = `%${search.toUpperCase()}%`;
        const sql = `
          SELECT * FROM "aapQAQC"."ipo" 
          WHERE UPPER(ma_ct) LIKE $1 
          OR UPPER(ten_ct) LIKE $1 
          OR UPPER(ten_hang_muc) LIKE $1 
          OR UPPER(id) LIKE $1
          ORDER BY created_at DESC LIMIT 200`;
        ipos = await query<IPO>(sql, [term]);
    } else {
        const sql = `SELECT * FROM "aapQAQC"."ipo" ORDER BY created_at DESC LIMIT 200`;
        ipos = await query<IPO>(sql);
    }
    
    return res.status(200).json({
        success: true,
        code: 'SUCCESS',
        message: 'Success',
        data: {
            items: ipos,
            count: ipos.length
        }
    });

  } catch (error: any) {
    console.error("API Error /api/ipos:", error);
    return res.status(500).json({
        success: false,
        code: 'SERVER_ERROR',
        message: error.message || 'Internal Server Error'
    });
  }
}
