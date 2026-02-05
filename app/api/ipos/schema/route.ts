
import { NextResponse } from 'next/server';
import { getTableSchema } from '../../../../lib/db-postgres/schema-detector';
import { getAuthUser } from '../../../../lib/auth';
import { buildErrorResponse } from '../../../../lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = getAuthUser(request);
    if (!user) {
      return buildErrorResponse('Unauthorized', 'UNAUTHORIZED', null, 401);
    }

    const columns = await getTableSchema('ipo');
    
    return NextResponse.json({
      success: true,
      data: columns,
      meta: {
        table: 'ipo',
        schema: 'appQAQC',
        timestamp: Date.now()
      }
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: {
        code: 'SCHEMA_ERROR',
        message: error.message
      }
    }, { status: 500 });
  }
}
