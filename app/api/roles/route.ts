
import { NextRequest } from 'next/server';
import { getRoles, saveRole } from '@/lib/db/queries';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
  return buildSuccessResponse(await getRoles());
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user || user.role !== 'ADMIN') return buildErrorResponse('Forbidden', 'FORBIDDEN', null, 403);
  await saveRole(await request.json());
  return buildSuccessResponse(null, 'Saved');
}
