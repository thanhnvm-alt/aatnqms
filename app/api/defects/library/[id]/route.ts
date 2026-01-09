
import { NextRequest } from 'next/server';
import { deleteDefectLibraryItem } from '@/lib/db/queries';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(request);
  if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
  await deleteDefectLibraryItem(params.id);
  return buildSuccessResponse(null, 'Deleted');
}
