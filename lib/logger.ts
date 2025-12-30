
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  data?: any;
  error?: any;
}

export const logger = {
  log: (level: LogLevel, message: string, data?: any, requestId?: string) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId,
      data,
    };

    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  },

  info: (message: string, data?: any, requestId?: string) => logger.log('info', message, data, requestId),
  warn: (message: string, data?: any, requestId?: string) => logger.log('warn', message, data, requestId),
  error: (message: string, error?: any, requestId?: string) => 
    logger.log('error', message, { error: error instanceof Error ? error.stack : error }, requestId),
  debug: (message: string, data?: any, requestId?: string) => logger.log('debug', message, data, requestId),
};
