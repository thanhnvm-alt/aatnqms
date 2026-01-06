
import { NextRequest } from 'next/server';
import { getUsers, saveUser, importUsers } from '@/services/tursoService';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUser(request);
    if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);

    const users = await getUsers();
    return buildSuccessResponse(users, 'Users retrieved successfully');
  } catch (error: any) {
    return buildErrorResponse('Failed to fetch users', 'SERVER_ERROR', error.message);
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Kiểm tra xác thực và phân quyền
    const user = getAuthUser(request);
    if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
    
    // Chỉ Admin và Manager được phép tạo/sửa người dùng
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
      return buildErrorResponse('Forbidden: Bạn không có quyền quản lý người dùng', 'FORBIDDEN', null, 403);
    }

    const body = await request.json();
    
    // Handle bulk import
    if (request.nextUrl.pathname.endsWith('/import')) {
      await importUsers(body);
      return buildSuccessResponse(null, 'Users imported successfully');
    }

    // Handle single user save
    await saveUser(body);
    return buildSuccessResponse(body, 'User saved successfully');
  } catch (error: any) {
    return buildErrorResponse('Failed to save user', 'SERVER_ERROR', error.message);
  }
}
