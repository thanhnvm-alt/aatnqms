let pool: any = null;

/**
 * Polymorphic query function that works on both server and client.
 */
export const query = async (text: string, params?: any[]): Promise<any> => {
  if (typeof window === 'undefined') {
    // Server-side logic
    if (!pool) {
      const pkg = await import('pg');
      const { Pool } = pkg.default;
      
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is missing');
      }

      console.log('Initializing database pool...');
      pool = new Pool({
        connectionString,
        // Vercel/Serverless best practice: use SSL if required by cloud providers
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: 1, // Limit connections in serverless environment
        idleTimeoutMillis: 10000, // Reduced from 30s to 10s for faster recycling
        connectionTimeoutMillis: 10000, // Increased to 10s to handle cold starts
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
      console.error('Database query error details:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        where: error.where
      });
      // If the connection is terminated or timed out, reset the pool so the next request starts fresh
      if (error.message.includes('terminated') || error.message.includes('timeout') || error.message.includes('Connection')) {
        console.log('Resetting pool due to connection error');
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
