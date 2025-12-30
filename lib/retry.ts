
import { logger } from './logger';
import { DatabaseError } from './errors';

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  factor?: number;
}

const isTransientError = (error: any): boolean => {
  const msg = error?.message?.toLowerCase() || '';
  // List of common transient Turso/LibSQL/Network errors
  return (
    msg.includes('connection refused') ||
    msg.includes('network error') ||
    msg.includes('fetch failed') ||
    msg.includes('database is locked') ||
    msg.includes('too many requests') ||
    msg.includes('timeout')
  );
};

export const withRetry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const { maxRetries = 3, initialDelay = 200, factor = 2 } = options;
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      attempt++;
      
      if (attempt > maxRetries || !isTransientError(error)) {
        if (isTransientError(error)) {
           throw new DatabaseError(`Database unavailable after ${maxRetries} attempts`, error);
        }
        throw error;
      }

      const delay = initialDelay * Math.pow(factor, attempt - 1);
      
      logger.warn(`Transient error detected. Retrying attempt ${attempt}/${maxRetries} in ${delay}ms...`, {
        error: error.message
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};
