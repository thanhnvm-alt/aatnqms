
import { NextRequest } from 'next/server';
import { getWorkshops, saveWorkshop } from '@/lib/db/queries';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
    const data = await getWorkshops();
    return buildSuccessResponse(data);
  } catch (e: any) { return buildErrorResponse(e.message); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user || user.role !== 'ADMIN') return buildErrorResponse('Forbidden', 'FORBIDDEN', null, 403);
    const body = await request.json();
    await saveWorkshop(body);
    return buildSuccessResponse(null, 'Saved');
  } catch (e: any) { return buildErrorResponse(e.message); }
}
