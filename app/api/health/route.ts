
import { NextResponse } from 'next/server';
import { query } from '../../../lib/db-postgres/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Attempt a simple query to verify PostgreSQL connection
    await query('SELECT 1');
    return NextResponse.json({ status: 'ok', database: 'connected (postgres)' });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json({ status: 'error', database: 'disconnected', details: (error as Error).message }, { status: 503 });
  }
}
