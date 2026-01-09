
import { NextRequest } from 'next/server';
import { getNcrById } from '@/lib/db/queries';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(request);
  if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
  const data = await getNcrById(params.id);
  if (!data) return buildErrorResponse('Not Found', 'NOT_FOUND', null, 404);
  return buildSuccessResponse(data);
}
