import { NextRequest } from 'next/server';
import { getProjectByCode, updateProject } from '@/lib/db/queries';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(request);
  if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
  const p = await getProjectByCode(params.id);
  if (!p) return buildErrorResponse('Not found', 'NOT_FOUND', null, 404);
  return buildSuccessResponse(p);
}

export async function PUT(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
  const body = await request.json();
  await updateProject(body);
  return buildSuccessResponse(null, 'Updated');
}