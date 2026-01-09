
import { NextResponse } from 'next/server';
import { turso } from '@/lib/db/turso';
import { initializeDatabase } from '@/lib/db/init';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Check basic connection
    await turso.execute('SELECT 1');
    
    // 2. Ensure Schema & Seed Data (Critical for first run/deploy)
    const initSuccess = await initializeDatabase();

    if (!initSuccess) {
        return NextResponse.json({ status: 'warning', database: 'connected', schema: 'sync_failed' }, { status: 200 });
    }

    return NextResponse.json({ status: 'ok', database: 'connected', schema: 'synced' });
  } catch (error: any) {
    console.error("Health Check Failed:", error);
    return NextResponse.json({ status: 'error', database: 'disconnected', details: error.message }, { status: 503 });
  }
}
