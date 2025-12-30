
import { NextResponse } from 'next/server';
import { createClient } from '@libsql/client';

// 1. Khởi tạo Turso Client (Server-side Only)
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    const filterType = searchParams.get('filterType'); // 'ma_ct' | 'ma_nm'
    const filterValue = searchParams.get('filterValue');
    
    let limit = parseInt(searchParams.get('limit') || '50', 10);
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 100) limit = 100;

    if (!filterType || !filterValue) {
      return NextResponse.json(
        { error: 'Bad Request: filterType and filterValue are required' },
        { status: 400 }
      );
    }

    const allowedFilters = ['ma_ct', 'ma_nha_may', 'ma_nm']; 
    if (!allowedFilters.includes(filterType)) {
      return NextResponse.json(
        { error: "Invalid filterType. Allowed: 'ma_ct', 'ma_nm'" },
        { status: 400 }
      );
    }

    const columnMap = {
      'ma_ct': 'ma_ct',
      'ma_nm': 'ma_nm_id',
      'ma_nha_may': 'ma_nm_id'
    };
    const dbColumn = columnMap[filterType];

    // SQL Alias Strategy for consistent Data Mapping
    // Explicitly mapping DB columns (sl_dh, ten_sp) to App fields (so_luong_ipo, ten_hang_muc)
    const sql = `
      SELECT 
        stt,
        ma_nm_id AS ma_nha_may,
        headcode,
        ten_ct,
        ten_sp AS ten_hang_muc,
        ma_ct,
        sl_dh AS so_luong_ipo,
        don_vi AS dvt,
        ngay_kh AS plannedDate,
        assignee,
        status,
        pthsp
      FROM plans
      WHERE ${dbColumn} = ?
      LIMIT ?
    `;

    const result = await turso.execute({
      sql: sql,
      args: [filterValue, limit]
    });

    return NextResponse.json({
      data: result.rows, // Rows now contain aliased keys directly
      meta: {
        count: result.rows.length,
        limit: limit,
        filter: { type: filterType, value: filterValue }
      }
    });

  } catch (error) {
    console.error('API Error /api/plans:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
