
import { NextResponse } from 'next/server';
import { AppError } from './errors';
import { logger } from './logger';

interface SuccessResponse<T> {
  success: true;
  data: T;
  metadata: {
    timestamp: string;
    requestId: string;
    [key: string]: any;
  };
}

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    requestId: string;
  };
}

export const generateRequestId = () => `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export function successResponse<T>(data: T, statusCode = 200, meta: Record<string, any> = {}) {
  const requestId = meta.requestId || generateRequestId();
  const response: SuccessResponse<T> = {
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      requestId,
      ...meta,
    },
  };
  return NextResponse.json(response, { status: statusCode });
}

export function errorResponse(error: unknown, requestId: string = generateRequestId()) {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'Đã xảy ra lỗi không mong muốn';
  let details = undefined;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof Error) {
    message = error.message;
  }

  // Log critical errors (500s)
  if (statusCode >= 500) {
    logger.error('API Error', error, requestId);
  } else {
    logger.warn('API Client Error', { message, code }, requestId);
  }

  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details,
      requestId,
    },
  };

  return NextResponse.json(response, { status: statusCode });
}
