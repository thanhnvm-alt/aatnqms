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
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      pool.on('error', (err: any) => {
        console.error('Unexpected error on idle database client', err);
        pool = null; // Reset pool on fatal error
      });
    }

    try {
      const start = Date.now();
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { duration, rows: res.rowCount });
      return res;
    } catch (error) {
      console.error('Database query error:', error);
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
