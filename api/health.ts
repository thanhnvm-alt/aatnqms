
import { query } from '../lib/db-postgres/db';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  try {
    // Attempt a simple query to verify PostgreSQL connection
    await query('SELECT 1');
    return res.status(200).json({ status: 'ok', database: 'connected (postgres)' });
  } catch (error: any) {
    console.error("Health check failed:", error);
    return res.status(503).json({ status: 'error', database: 'disconnected', details: error.message });
  }
}
