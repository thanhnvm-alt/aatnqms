
import { query } from '../lib/db-postgres/db';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  try {
    // Attempt a query to verify PostgreSQL connection
    const result = await query('SELECT current_database() as db, inet_server_addr() as ip');
    const dbInfo = result[0];

    return res.status(200).json({ 
        status: 'direct-connection', 
        database: dbInfo.db,
        host: process.env.DB_HOST,
        server_ip: dbInfo.ip,
        timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Health check failed:", error);
    return res.status(503).json({ 
        status: 'error', 
        database: 'disconnected', 
        details: error.message 
    });
  }
}
