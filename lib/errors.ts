
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(message: string, code: string, statusCode: number, details?: any) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Lỗi kết nối cơ sở dữ liệu', details?: any) {
    super(message, 'DATABASE_ERROR', 503, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Dữ liệu không hợp lệ', details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Không tìm thấy tài nguyên', details?: any) {
    super(message, 'NOT_FOUND_ERROR', 404, details);
  }
}

export class NetworkError extends AppError {
  constructor(message: string = 'Lỗi kết nối mạng', details?: any) {
    super(message, 'NETWORK_ERROR', 502, details);
  }
}
