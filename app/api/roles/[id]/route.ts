
import { NextRequest } from 'next/server';
import { deleteRole } from '@/lib/db/queries';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(request);
  if (!user || user.role !== 'ADMIN') return buildErrorResponse('Forbidden', 'FORBIDDEN', null, 403);
  await deleteRole(params.id);
  return buildSuccessResponse(null, 'Deleted');
}
