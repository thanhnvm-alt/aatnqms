
import { createClient } from '@libsql/client';
import { NextRequest, NextResponse } from 'next/server';

const serverClient = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

export async function POST(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  
  console.log('📥 API POST from:', { userAgent, isIOS });

  try {
    const body = await request.text();
    console.log('📦 Raw body:', body);

    let data;
    try {
      data = JSON.parse(body);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid JSON format',
          details: parseError instanceof Error ? parseError.message : 'Unknown parse error'
        },
        { status: 400 }
      );
    }

    console.log('📦 Parsed data:', data);

    // Validation
    const requiredFields = ['headcode', 'ma_ct', 'ten_ct', 'ten_hang_muc'];
    const missingFields = requiredFields.filter(field => !data[field]);
    
    if (missingFields.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Thiếu thông tin bắt buộc',
          missingFields
        },
        { status: 400 }
      );
    }

    // Clean and validate data
    const cleanData = {
      headcode: String(data.headcode).trim(),
      ma_ct: String(data.ma_ct).trim(),
      ten_ct: String(data.ten_ct).trim(),
      ma_nha_may: data.ma_nha_may ? String(data.ma_nha_may).trim() : null,
      ten_hang_muc: String(data.ten_hang_muc).trim(),
      dvt: data.dvt ? String(data.dvt).trim() : null,
      so_luong_ipo: typeof data.so_luong_ipo === 'number' ? data.so_luong_ipo : parseFloat(data.so_luong_ipo) || 0
    };

    console.log('🧹 Cleaned data:', cleanData);

    // Insert into Turso
    const result = await serverClient.execute({
      sql: `
        INSERT INTO searchPlans (
          headcode, 
          ma_ct, 
          ten_ct, 
          ma_nha_may,
          ten_hang_muc, 
          dvt,
          so_luong_ipo,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
      `,
      args: [
        cleanData.headcode,
        cleanData.ma_ct,
        cleanData.ten_ct,
        cleanData.ma_nha_may,
        cleanData.ten_hang_muc,
        cleanData.dvt,
        cleanData.so_luong_ipo
      ]
    });

    console.log('✅ Insert result:', {
      lastInsertRowid: result.lastInsertRowid,
      rowsAffected: result.rowsAffected
    });

    // Convert BigInt to string for JSON serialization
    const responseData = {
      id: result.lastInsertRowid ? String(result.lastInsertRowid) : null,
      rowsAffected: result.rowsAffected
    };

    return NextResponse.json({
      success: true,
      data: responseData,
      message: 'Lưu thành công!',
      platform: isIOS ? 'iOS' : 'other'
    });

  } catch (error) {
    console.error('❌ API error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Check for specific error types
    let errorMessage = 'Lỗi không xác định';
    let errorCode = 'UNKNOWN_ERROR';

    if (error instanceof Error) {
      if (error.message.includes('pattern')) {
        errorMessage = 'Dữ liệu không đúng định dạng';
        errorCode = 'VALIDATION_ERROR';
      } else if (error.message.includes('UNIQUE')) {
        errorMessage = 'Dữ liệu đã tồn tại';
        errorCode = 'DUPLICATE_ERROR';
      } else if (error.message.includes('quota')) {
        errorMessage = 'Hết dung lượng lưu trữ';
        errorCode = 'QUOTA_ERROR';
      } else if (error.message.includes('connection') || error.message.includes('network')) {
        errorMessage = 'Lỗi kết nối database';
        errorCode = 'CONNECTION_ERROR';
      } else {
        errorMessage = error.message;
      }
    }
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        code: errorCode,
        details: process.env.NODE_ENV === 'development' && error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : undefined
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const ma_ct = searchParams.get('ma_ct');

    let sql = `
      SELECT 
        id,
        headcode,
        ma_ct,
        ten_ct,
        ma_nha_may,
        ten_hang_muc,
        dvt,
        so_luong_ipo,
        created_at
      FROM searchPlans
    `;
    
    const args: any[] = [];

    if (ma_ct) {
      sql += ' WHERE ma_ct = ?';
      args.push(ma_ct);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    args.push(limit, offset);

    const result = await serverClient.execute({ sql, args });

    // Convert BigInt to string for JSON serialization
    const rows = result.rows.map(row => ({
      ...row,
      id: row.id ? String(row.id) : null,
      created_at: row.created_at ? String(row.created_at) : null
    }));

    // Count total
    const countSql = ma_ct 
      ? 'SELECT COUNT(*) as total FROM searchPlans WHERE ma_ct = ?'
      : 'SELECT COUNT(*) as total FROM searchPlans';
    const countArgs = ma_ct ? [ma_ct] : [];
    const countResult = await serverClient.execute({ sql: countSql, args: countArgs });
    const total = Number(countResult.rows[0]?.total) || 0;

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total
      }
    });

  } catch (error) {
    console.error('❌ GET error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Không thể tải dữ liệu' 
      },
      { status: 500 }
    );
  }
}
