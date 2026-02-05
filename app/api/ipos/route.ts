
import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../lib/db-postgres/db';
import { IPO } from '../../../types';
import { successResponse, errorResponse, generateRequestId, buildErrorResponse } from '../../../lib/api-response';
import { getAuthUser } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const user = getAuthUser(request);
    if (!user) {
        return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
    }
    
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

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
    
    return successResponse({
        items: ipos,
        count: ipos.length
    }, 200, { requestId });

  } catch (error) {
    return errorResponse(error, requestId);
  }
}
