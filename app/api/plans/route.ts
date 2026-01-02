
import { NextResponse } from 'next/server';
import { createClient } from '@libsql/client';
import { z } from 'zod';

// Ensure we use HTTPS for better compatibility in serverless envs
const getClient = () => {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not defined");
  
  return createClient({
    url: url.startsWith('libsql://') ? url.replace('libsql://', 'https://') : url,
    authToken: process.env.TURSO_AUTH_TOKEN,
    intMode: 'number', // CRITICAL: Prevent BigInt crashes
  });
};

const PlanSchema = z.object({
  headcode: z.string().min(1),
  ma_ct: z.string().min(1),
  ten_ct: z.string().min(1),
  ma_nha_may: z.string().optional(),
  ten_hang_muc: z.string().min(1),
  dvt: z.string().default('PCS'),
  so_luong_ipo: z.number().default(0),
});

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const offset = (page - 1) * limit;

    const client = getClient();
    
    let sql = `SELECT * FROM searchPlans`;
    let countSql = `SELECT COUNT(*) as total FROM searchPlans`;
    const args: any[] = [];

    if (search) {
      const whereClause = ` WHERE ma_ct LIKE ? OR headcode LIKE ? OR ten_hang_muc LIKE ? OR ma_nha_may LIKE ?`;
      const term = `%${search}%`;
      sql += whereClause;
      countSql += whereClause;
      args.push(term, term, term, term);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    
    const [dataResult, countResult] = await Promise.all([
      client.execute({ sql, args: [...args, limit, offset] }),
      client.execute({ sql: countSql, args })
    ]);

    return NextResponse.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        total: countResult.rows[0].total,
        page,
        limit
      }
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = PlanSchema.parse(body);
    const client = getClient();

    const result = await client.execute({
      sql: `INSERT INTO searchPlans (headcode, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, dvt, so_luong_ipo, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch()) RETURNING *`,
      args: [
        validated.headcode,
        validated.ma_ct,
        validated.ten_ct,
        validated.ma_nha_may || null,
        validated.ten_hang_muc,
        validated.dvt,
        validated.so_luong_ipo
      ]
    });

    return NextResponse.json({ success: true, data: result.rows[0] });

  } catch (error: any) {
    console.error('API Post Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
