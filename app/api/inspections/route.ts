import { NextRequest } from 'next/server';
import { saveInspection } from '@/lib/db/queries';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);

    const body = await request.json();
    const { id, data } = body;

    if (!id || !data) return buildErrorResponse('Missing fields', 'INVALID_PARAMS', null, 400);

    // Sử dụng service logic đã được chuẩn hóa (tự động tách NCR sang table riêng)
    const inspectionToSave = { ...data, id };
    await saveInspection(inspectionToSave);

    return buildSuccessResponse({ id }, 'Inspection saved & NCR decoupled');
  } catch (error: any) {
    return buildErrorResponse(error.message, 'SERVER_ERROR', null, 500);
  }
}