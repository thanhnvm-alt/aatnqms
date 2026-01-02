
import { NextRequest } from 'next/server';
import { turso } from '@/services/tursoConfig';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, data } = body;

    // 1. Validation
    if (!id || !data) {
      return buildErrorResponse(
        'Missing required fields: id or data',
        'INVALID_PARAMS',
        { required: ['id', 'data'] },
        400
      );
    }

    // 2. Prepare Data
    // Mobile friendly: Use Unix Timestamp (Seconds)
    const now = Math.floor(Date.now() / 1000);
    
    // QAQC Data: Ensure payload is a string for storage
    const jsonString = JSON.stringify(data);

    // 3. Execute DB
    await turso.execute({
      sql: `
        INSERT INTO inspections (id, data, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `,
      args: [id, jsonString, now, now]
    });

    // 4. Response
    return buildSuccessResponse(
      {
        id,
        created_at: now,
        updated_at: now
      },
      'Inspection created successfully',
      'SUCCESS',
      201
    );

  } catch (error: any) {
    console.error('POST /api/inspections error:', error);
    
    // Handle Duplicate Entry
    if (error?.message?.includes('UNIQUE constraint failed')) {
      return buildErrorResponse(
        'Inspection ID already exists',
        'DUPLICATE_ENTRY',
        null,
        409
      );
    }

    return buildErrorResponse(
      'Internal Server Error',
      'SERVER_ERROR',
      process.env.NODE_ENV === 'development' ? error.message : null
    );
  }
}
