import { NextResponse } from 'next/server';

// Standard API Response Structure
export interface ApiResponse<T = any> {
  success: boolean;
  code: string;
  message: string;
  data: T | null;
  meta: any | null;
  error: {
    type: string;
    details: any;
  } | null;
}

export const generateRequestId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

/**
 * Build a success response
 * @param data - The payload
 * @param message - Short description
 * @param code - Internal logic code
 * @param status - HTTP status code
 * @param meta - Metadata (pagination, requestId, etc.)
 */
export function buildSuccessResponse<T>(
  data: T,
  message: string = 'Success',
  code: string = 'SUCCESS',
  status: number = 200,
  meta: any = null
) {
  const response: ApiResponse<T> = {
    success: true,
    code,
    message,
    data,
    meta,
    error: null,
  };
  return NextResponse.json(response, { status });
}

/**
 * Simplified success response adapter
 */
export function successResponse<T>(data: T, status: number = 200, meta: any = null) {
  return buildSuccessResponse(data, 'Success', 'SUCCESS', status, meta);
}

/**
 * Build an error response
 * @param message - User facing message
 * @param code - Internal error code (INVALID_PARAMS, NOT_FOUND, etc.)
 * @param details - Technical details (optional)
 * @param status - HTTP status code
 */
export function buildErrorResponse(
  message: string,
  code: string = 'SERVER_ERROR',
  details: any = null,
  status: number = 500
) {
  const response: ApiResponse = {
    success: false,
    code,
    message,
    data: null,
    meta: null,
    error: {
      type: code,
      details,
    },
  };
  return NextResponse.json(response, { status });
}

/**
 * Error response adapter handling Error objects
 */
export function errorResponse(error: any, requestId?: string) {
  const message = error?.message || 'Internal Server Error';
  const code = error?.code || 'SERVER_ERROR';
  const status = error?.statusCode || 500;
  const details = error?.details || null;

  const response: ApiResponse = {
    success: false,
    code,
    message,
    data: null,
    meta: requestId ? { requestId } : null,
    error: {
      type: code,
      details,
    },
  };

  if (status >= 500) {
    console.error(`[API Error] ${requestId || 'No-ID'}:`, error);
  }

  return NextResponse.json(response, { status });
}
