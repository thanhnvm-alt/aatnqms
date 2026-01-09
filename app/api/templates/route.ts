
import { NextRequest } from 'next/server';
import { getTemplates, saveTemplate } from '@/lib/db/queries';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
  const data = await getTemplates();
  return buildSuccessResponse(data);
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) return buildErrorResponse('Forbidden', 'FORBIDDEN', null, 403);
  const body = await request.json();
  await saveTemplate(body.moduleId, body.items);
  return buildSuccessResponse(null, 'Saved');
}
