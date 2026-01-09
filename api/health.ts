
import { turso } from '../lib/db/turso';
import { initializeDatabase } from '../lib/db/init';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  try {
    // 1. Check basic connection
    await turso.execute('SELECT 1');
    
    // 2. Ensure Schema & Seed Data (Critical for first run/deploy)
    const initSuccess = await initializeDatabase();

    if (!initSuccess) {
        return new Response(JSON.stringify({ status: 'warning', database: 'connected', schema: 'sync_failed' }), { status: 200 });
    }

    return new Response(JSON.stringify({ status: 'ok', database: 'connected', schema: 'synced' }), { status: 200 });
  } catch (error: any) {
    console.error("Health Check Failed:", error);
    return new Response(JSON.stringify({ status: 'error', database: 'disconnected', details: error.message }), { status: 503 });
  }
}
