
import { NextRequest } from 'next/server';
import { getNcrs, saveNcrMapped } from '@/services/tursoService';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);

  const { searchParams } = new URL(request.url);
  const inspection_id = searchParams.get('inspection_id') || undefined;
  const status = searchParams.get('status') || undefined;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');

  try {
    const data = await getNcrs({ inspection_id, status, page, limit });
    return buildSuccessResponse(data, 'NCR list retrieved', 'SUCCESS', 200, {
        pagination: { page, limit }
    });
  } catch (error: any) {
    return buildErrorResponse(error.message, 'SERVER_ERROR', null, 500);
  }
}

export async function POST(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);

  try {
    const body = await request.json();
    const { inspection_id, ncr_data } = body;

    if (!inspection_id || !ncr_data) {
      return buildErrorResponse('Missing required fields', 'INVALID_PARAMS', null, 400);
    }

    const ncrId = await saveNcrMapped(inspection_id, ncr_data, user.name || 'Unknown');
    return buildSuccessResponse({ ncr_id: ncrId }, 'NCR saved successfully', 'SUCCESS', 201);
  } catch (error: any) {
    return buildErrorResponse(error.message, 'SERVER_ERROR', null, 500);
  }
}
