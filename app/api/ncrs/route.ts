
import { NextRequest } from 'next/server';
import { getNcrs, saveNcrMapped } from '@/lib/db/queries';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
  const { searchParams } = new URL(request.url);
  const data = await getNcrs({
      status: searchParams.get('status') || undefined,
      inspection_id: searchParams.get('inspection_id') || undefined
  });
  return buildSuccessResponse({ items: data });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
  const body = await request.json();
  // If posted as bulk or single, adapter logic here. Assuming direct NCR object save wrapped in logic
  // The service expects mapped call.
  // For simplicity in this refactor, if body has inspection_id and ncr data:
  if (body.inspection_id && body.issueDescription) {
      await saveNcrMapped(body.inspection_id, body, user.name || 'User');
      return buildSuccessResponse(null, 'Saved');
  }
  return buildErrorResponse('Invalid format');
}
