
import { NextRequest } from 'next/server';
import { getDefectLibrary, saveDefectLibraryItem } from '@/lib/db/queries';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
  return buildSuccessResponse(await getDefectLibrary());
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
  await saveDefectLibraryItem(await request.json());
  return buildSuccessResponse(null, 'Saved');
}
