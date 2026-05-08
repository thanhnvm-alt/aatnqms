import dotenv from 'dotenv';
dotenv.config();
let pool: any = null;
let poolPromise: Promise<any> | null = null;

/**
 * Ensures the database pool is initialized only once.
 */
const getPool = async (): Promise<any> => {
  if (pool) return pool;
  if (poolPromise) return poolPromise;

  poolPromise = (async () => {
    try {
      const pgModule = await import('pg');
      const Pool = pgModule.Pool || (pgModule.default && pgModule.default.Pool);
      
      if (!Pool) {
        throw new Error('Could not find Pool constructor in pg module');
      }
      
      const rawConnectionString = process.env.DATABASE_URL;
      if (!rawConnectionString) {
        throw new Error('DATABASE_URL environment variable is missing');
      }

      const useSSL = process.env.DB_SSL === 'true' || 
                     rawConnectionString.includes('sslmode=require') || 
                     rawConnectionString.includes('sslmode=verify-full') ||
                     rawConnectionString.includes('ssl=true');

      let connectionString = rawConnectionString;
      try {
        const url = new URL(rawConnectionString);
        url.searchParams.delete('sslmode');
        url.searchParams.delete('ssl');
        connectionString = url.toString();
      } catch (e) {
        console.warn('Could not parse DATABASE_URL as URL, using raw string');
      }

      console.log('Initializing database pool...', { useSSL });
      const newPool = new Pool({
        connectionString,
        ssl: useSSL ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 60000,
        query_timeout: 60000,
      });

      newPool.on('error', (err: any) => {
        console.error('Unexpected error on idle database client', err);
        pool = null;
        poolPromise = null;
      });

      pool = newPool;
      return pool;
    } catch (error) {
      poolPromise = null;
      throw error;
    }
  })();

  return poolPromise;
};

/**
 * Polymorphic query function that works on both server and client.
 */
export const query = async (text: string, params?: any[]): Promise<any> => {
  if (typeof window === 'undefined') {
    // Server-side logic
    const currentPool = await getPool();

    const executeQuery = async () => {
      const start = Date.now();
      console.log(`Executing query: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
      const res = await currentPool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query successfully', { duration, rows: res.rowCount });
      return res;
    };

    try {
      return await executeQuery();
    } catch (error: any) {
      const position = parseInt(error.position, 10);
      let queryContext = '';
      if (!isNaN(position) && position > 0) {
        const startPos = Math.max(0, position - 50);
        const endPos = Math.min(text.length, position + 50);
        const context = text.substring(startPos, endPos);
        const pointer = ' '.repeat(position - startPos - 1) + '^';
        queryContext = `\nContext around position ${position}:\n${context}\n${pointer}`;
      }

      const errorDetails = {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        position: error.position,
        where: error.where,
        query: text.substring(0, 500) + (text.length > 500 ? '...' : '')
      };
      
      console.error(`Database query error details:${queryContext}`, errorDetails);
      console.error('Full error object:', error);

      // If the connection is terminated or timed out, reset the pool so the next request starts fresh
      if (error.message.includes('terminated') || error.message.includes('timeout') || error.message.includes('Connection') || error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
        console.log('Resetting pool due to connection or SSL error');
        pool = null;
        poolPromise = null;
      }
      
      // Auto-retry once for transient connection issues
      if (error.message.includes('timeout') || error.message.includes('Connection failed')) {
        console.log('Retrying query due to timeout...');
        const retryPool = await getPool();
        return await retryPool.query(text, params);
      }

      throw error;
    }
  } else {
    // Client-side logic: Proxy to server API
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: text, args: params }),
    });

    if (!response.ok) {
      const responseClone = response.clone();
      try {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Database query failed via API');
      } catch (e) {
        const errorText = await responseClone.text();
        throw new Error('Database query failed via API (non-JSON response): ' + errorText);
      }
    }

    return await response.json();
  }
};

export default pool;
