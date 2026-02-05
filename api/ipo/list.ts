
import { query } from '../../lib/db-postgres/db';
import { getAuthUser } from '../../lib/auth';
import { IpoEntity } from '../../types/ipo.types';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const user = getAuthUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const search = (req.query.q as string) || '';
    
    let sql = `
      SELECT 
        id, 
        ma_ct, 
        ten_ct, 
        ten_hang_muc, 
        so_luong_ipo, 
        dvt, 
        ma_nha_may,
        status, 
        created_at 
      FROM "aapQAQC"."ipo"
    `;

    const params: any[] = [];
    
    if (search) {
      sql += ` 
        WHERE 
          UPPER(ma_ct) LIKE $1 OR 
          UPPER(ten_hang_muc) LIKE $1 OR 
          UPPER(ma_nha_may) LIKE $1
      `;
      params.push(`%${search.toUpperCase()}%`);
    }

    sql += ` ORDER BY created_at DESC LIMIT 100`;

    const ipos = await query<IpoEntity>(sql, params);

    return res.status(200).json({
      success: true,
      data: {
          data: ipos
      },
      meta: {
        total: ipos.length,
        timestamp: Date.now()
      }
    });

  } catch (error: any) {
    console.error("API Error /api/ipo/list:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
