
import { NextRequest } from 'next/server';
import { turso } from '@/services/tursoConfig';
import { buildSuccessResponse, buildErrorResponse } from '@/lib/api-response';

interface RouteParams {
  params: { id: string };
}

// --- GET: Detail ---
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;

    const result = await turso.execute({
      sql: 'SELECT id, created_at, updated_at, data FROM inspections WHERE id = ?',
      args: [id]
    });

    if (result.rows.length === 0) {
      return buildErrorResponse('Inspection not found', 'NOT_FOUND', { id }, 404);
    }

    const row = result.rows[0];
    
    // Data Parsing: Convert JSON string back to Object for the client
    let parsedPayload = null;
    try {
      parsedPayload = JSON.parse(row.data as string);
    } catch (e) {
      console.error('JSON Parse Error for ID:', id, e);
      parsedPayload = {}; // Fallback empty object
    }

    const responseData = {
      id: row.id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      payload: parsedPayload // Rename 'data' column to 'payload' to avoid confusion with API 'data' field
    };

    return buildSuccessResponse(responseData, 'Inspection loaded');

  } catch (error: any) {
    console.error(`GET /api/inspections/${params.id} error:`, error);
    return buildErrorResponse('Internal Server Error', 'SERVER_ERROR');
  }
}

// --- PUT: Update ---
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const body = await request.json();
    const { data } = body;

    if (!data) {
      return buildErrorResponse('Missing data payload', 'INVALID_PARAMS', null, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    const jsonString = JSON.stringify(data);

    const result = await turso.execute({
      sql: `
        UPDATE inspections 
        SET data = ?, updated_at = ? 
        WHERE id = ?
      `,
      args: [jsonString, now, id]
    });

    if (result.rowsAffected === 0) {
      return buildErrorResponse('Inspection not found or not updated', 'NOT_FOUND', null, 404);
    }

    return buildSuccessResponse(
      { id, updated_at: now },
      'Inspection updated successfully'
    );

  } catch (error: any) {
    console.error(`PUT /api/inspections/${params.id} error:`, error);
    return buildErrorResponse('Internal Server Error', 'SERVER_ERROR');
  }
}

// --- DELETE: Remove ---
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;

    const result = await turso.execute({
      sql: 'DELETE FROM inspections WHERE id = ?',
      args: [id]
    });

    if (result.rowsAffected === 0) {
      return buildErrorResponse('Inspection not found', 'NOT_FOUND', null, 404);
    }

    return buildSuccessResponse(
      { id },
      'Inspection deleted successfully'
    );

  } catch (error: any) {
    console.error(`DELETE /api/inspections/${params.id} error:`, error);
    return buildErrorResponse('Internal Server Error', 'SERVER_ERROR');
  }
}
