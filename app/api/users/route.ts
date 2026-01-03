
import { NextRequest } from 'next/server';
import { getUsers, saveUser, importUsers } from '@/services/tursoService';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const users = await getUsers();
    return buildSuccessResponse(users, 'Users retrieved successfully');
  } catch (error: any) {
    return buildErrorResponse('Failed to fetch users', 'SERVER_ERROR', error.message);
  }
}

export async function POST(request: NextRequest) {
  try {
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
