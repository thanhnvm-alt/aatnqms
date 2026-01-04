
import { NextRequest } from 'next/server';
import { turso } from '@/services/tursoConfig';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Xác thực người dùng
    const user = getAuthUser(request);
    if (!user) {
      return buildErrorResponse('Unauthorized: Vui lòng đăng nhập', 'UNAUTHORIZED', null, 401);
    }

    const body = await request.json();
    const { id, data } = body;

    // 2. Validation
    if (!id || !data) {
      return buildErrorResponse(
        'Thiếu thông tin bắt buộc: id hoặc data',
        'INVALID_PARAMS',
        { required: ['id', 'data'] },
        400
      );
    }

    // 3. Prepare Data
    const now = Math.floor(Date.now() / 1000);
    const jsonString = JSON.stringify(data);

    // 4. Execute DB
    // Lưu vết người tạo dựa trên thông tin xác thực
    await turso.execute({
      sql: `
        INSERT INTO inspections (id, data, created_at, updated_at, created_by, ma_ct, ma_nha_may, status, type, score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id, 
        jsonString, 
        now, 
        now, 
        user.name || 'Unknown', 
        data.ma_ct || '', 
        data.ma_nha_may || '', 
        data.status || 'DRAFT', 
        data.type || 'SITE', 
        data.score || 0
      ]
    });

    return buildSuccessResponse(
      {
        id,
        created_at: now,
        updated_at: now
      },
      'Inspection created successfully',
      'SUCCESS',
      201
    );

  } catch (error: any) {
    console.error('POST /api/inspections error:', error);
    
    if (error?.message?.includes('UNIQUE constraint failed')) {
      return buildErrorResponse('Mã phiếu kiểm tra đã tồn tại', 'DUPLICATE_ENTRY', null, 409);
    }

    return buildErrorResponse(
      'Internal Server Error',
      'SERVER_ERROR',
      process.env.NODE_ENV === 'development' ? error.message : null,
      500
    );
  }
}
