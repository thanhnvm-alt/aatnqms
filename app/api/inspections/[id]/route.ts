import { NextRequest } from 'next/server';
import { turso } from '@/services/tursoConfig';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser, canModifyInspection } from '@/lib/auth';

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);

    const result = await turso.execute({
      sql: 'SELECT id, data, created_by FROM inspections WHERE id = ?',
      args: [params.id]
    });

    if (result.rows.length === 0) return buildErrorResponse('Not Found', 'NOT_FOUND', null, 404);
    
    const row = result.rows[0];
    if (user.role === 'QC' && row.created_by !== user.userId) {
        return buildErrorResponse('Access Denied', 'FORBIDDEN', null, 403);
    }

    return buildSuccessResponse(JSON.parse(row.data as string));
  } catch (error) {
    return buildErrorResponse('Server Error', 'SERVER_ERROR', null, 500);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);

    const { data } = await request.json();
    
    // 1. Fetch current state to check status (ISO Locking)
    const current = await turso.execute({
      sql: 'SELECT data, created_by FROM inspections WHERE id = ?',
      args: [params.id]
    });

    if (current.rows.length === 0) return buildErrorResponse('Not Found', 'NOT_FOUND', null, 404);
    
    const currentData = JSON.parse(current.rows[0].data as string);
    const ownerId = current.rows[0].created_by as string;

    // 2. ISO Rule: Prevent editing of APPROVED/LOCKED records
    if (currentData.status === 'APPROVED' && user.role !== 'ADMIN') {
        return buildErrorResponse(
            'Bản ghi đã được phê duyệt và khóa. Vui lòng liên hệ Admin để thay đổi.',
            'ISO_LOCK_VIOLATION',
            null,
            409
        );
    }

    // 3. Ownership check
    if (!canModifyInspection(user, ownerId)) {
        return buildErrorResponse('Bạn không có quyền sửa bản ghi này', 'FORBIDDEN', null, 403);
    }

    // 4. Update
    await turso.execute({
      sql: 'UPDATE inspections SET data = ?, updated_at = unixepoch() WHERE id = ?',
      args: [JSON.stringify(data), params.id]
    });

    return buildSuccessResponse({ id: params.id }, 'Cập nhật thành công');
  } catch (error: any) {
    return buildErrorResponse(error.message, 'SERVER_ERROR', null, 500);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const user = await getAuthUser(request);
    if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
        return buildErrorResponse('Chỉ Quản lý mới có quyền xóa dữ liệu kiểm tra', 'FORBIDDEN', null, 403);
    }

    await turso.execute({
        sql: 'DELETE FROM inspections WHERE id = ?',
        args: [params.id]
    });

    return buildSuccessResponse(null, 'Đã xóa bản ghi (Audit Logged)');
}