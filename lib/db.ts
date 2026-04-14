import dotenv from 'dotenv';
dotenv.config();

let pool: any = null;

/**
 * Polymorphic query function that works on both server and client.
 */
export const query = async (text: string, params?: any[]): Promise<any> => {
  if (typeof window === 'undefined') {
    // Server-side logic
    if (!pool) {
      const pgModule = await import('pg');
      const Pool = pgModule.Pool || (pgModule.default && pgModule.default.Pool);
      
      if (!Pool) {
        throw new Error('Could not find Pool constructor in pg module');
      }
      
      const rawConnectionString = process.env.DATABASE_URL;
      if (!rawConnectionString) {
        throw new Error('DATABASE_URL environment variable is missing');
      }

      // Detect if SSL is needed
      const useSSL = process.env.DB_SSL === 'true' || 
                     rawConnectionString.includes('sslmode=require') || 
                     rawConnectionString.includes('sslmode=verify-full') ||
                     rawConnectionString.includes('ssl=true');

      // Strip SSL parameters from connection string to prevent them from overriding the ssl object
      // This is crucial because 'sslmode=verify-full' in the URL can override rejectUnauthorized: false
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
      pool = new Pool({
        connectionString,
        // Force rejectUnauthorized: false for cloud DBs with self-signed certs
        ssl: useSSL ? { rejectUnauthorized: false } : false,
        max: 1,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000,
      });

      pool.on('error', (err: any) => {
        console.error('Unexpected error on idle database client', err);
        pool = null; // Reset pool on fatal error
      });
    }

    try {
      const start = Date.now();
      console.log(`Executing query: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query successfully', { duration, rows: res.rowCount });
      return res;
    } catch (error: any) {
      const errorDetails = {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        where: error.where,
        query: text.substring(0, 500)
      };
      console.error('Database query error details:', errorDetails);
      console.error('Full error object:', error);
      // If the connection is terminated or timed out, reset the pool so the next request starts fresh
      if (error.message.includes('terminated') || error.message.includes('timeout') || error.message.includes('Connection') || error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
        console.log('Resetting pool due to connection or SSL error');
        if (error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
          console.warn('SSL Certificate error detected. Ensure DB_SSL=true or sslmode=require is in DATABASE_URL.');
        }
        pool = null;
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
