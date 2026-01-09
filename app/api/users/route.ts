
import { NextRequest } from 'next/server';
import { getUsers, saveUser, importUsers } from '@/lib/db/queries';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);

    const users = await getUsers();
    return buildSuccessResponse(users, 'Users retrieved');
  } catch (error: any) {
    return buildErrorResponse(error.message, 'SERVER_ERROR', null, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER') return buildErrorResponse('Forbidden', 'FORBIDDEN', null, 403);

    const body = await request.json();
    
    if (request.nextUrl.pathname.endsWith('/import')) {
        await importUsers(body);
        return buildSuccessResponse(null, 'Imported');
    }

    await saveUser(body);
    return buildSuccessResponse(null, 'User saved');
  } catch (error: any) {
    return buildErrorResponse(error.message, 'SERVER_ERROR', null, 500);
  }
}
