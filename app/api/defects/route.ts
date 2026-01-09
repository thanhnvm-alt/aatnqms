
import { NextRequest } from 'next/server';
import { getDefects } from '@/lib/db/queries';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
  const { searchParams } = new URL(request.url);
  const data = await getDefects({ status: searchParams.get('status') || undefined, search: searchParams.get('search') || undefined });
  return buildSuccessResponse({ items: data });
}
