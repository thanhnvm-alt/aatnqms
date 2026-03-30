import type { Pool, QueryResult } from 'pg';

let pool: Pool | null = null;

/**
 * Polymorphic query function that works on both server and client.
 * Server: Uses pg pool directly.
 * Client: Proxies query to /api/query endpoint.
 */
export const query = async (text: string, params?: any[]): Promise<QueryResult<any>> => {
  if (typeof window === 'undefined') {
    // Server-side logic
    if (!pool) {
      const pg = await import('pg');
      pool = new pg.default.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      });

      pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
      });
    }

    try {
      const start = Date.now();
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      console.error('Database query error', { text, error });
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
      const errorData = await response.json();
      throw new Error(errorData.error || 'Database query failed via API');
    }

    return await response.json();
  }
};

export default pool;
