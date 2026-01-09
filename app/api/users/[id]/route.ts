
import { NextRequest } from 'next/server';
import { deleteUser } from '@/lib/db/queries';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
    if (user.role !== 'ADMIN') return buildErrorResponse('Forbidden', 'FORBIDDEN', null, 403);

    await deleteUser(params.id);
    return buildSuccessResponse(null, 'User deleted');
  } catch (error: any) {
    return buildErrorResponse(error.message, 'SERVER_ERROR', null, 500);
  }
}
