
/**
 * Database Type Definitions
 */

export interface SelectOptions {
  columns?: string[];
  where?: WhereCondition;
  orderBy?: string; // e.g., "created_at DESC"
  limit?: number;
  offset?: number;
}

export type WhereCondition = Record<string, any>;

export class DatabaseError extends Error {
  public readonly context?: any;
  public readonly code?: string;

  constructor(message: string, context?: any, code?: string) {
    super(message);
    this.name = 'DatabaseError';
    this.context = context;
    this.code = code;
    
    // Ensure stack trace is captured correctly
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, DatabaseError);
    }
  }
}

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}