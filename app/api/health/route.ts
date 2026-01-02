
import { NextResponse } from 'next/server';
import { createClient } from '@libsql/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const url = process.env.TURSO_DATABASE_URL;
    const token = process.env.TURSO_AUTH_TOKEN;

    if (!url || !token) {
      return NextResponse.json({ status: 'error', message: 'Missing env vars' }, { status: 500 });
    }

    const client = createClient({
      url: url.startsWith('libsql://') ? url.replace('libsql://', 'https://') : url,
      authToken: token,
      intMode: 'number'
    });

    const start = Date.now();
    await client.execute('SELECT 1');
    const latency = Date.now() - start;

    return NextResponse.json({ 
      status: 'ok', 
      database: 'connected', 
      latency,
      env: process.env.NODE_ENV 
    });
  } catch (error: any) {
    return NextResponse.json({ 
      status: 'error', 
      message: error.message 
    }, { status: 500 });
  }
}
