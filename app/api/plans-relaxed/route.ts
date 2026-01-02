
import { createClient } from '@libsql/client';
import { NextRequest, NextResponse } from 'next/server';

const serverClient = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // Minimal validation - chỉ check required fields có value
    if (!data.headcode || !data.ma_ct || !data.ten_ct || !data.ten_hang_muc) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Direct insert without extra validation
    const result = await serverClient.execute({
      sql: `INSERT INTO searchPlans (headcode, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, dvt, so_luong_ipo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())`,
      args: [
        data.headcode,
        data.ma_ct,
        data.ten_ct,
        data.ma_nha_may || null,
        data.ten_hang_muc,
        data.dvt || null,
        data.so_luong_ipo || 0
      ]
    });

    return NextResponse.json({
      success: true,
      data: { id: String(result.lastInsertRowid) }
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
