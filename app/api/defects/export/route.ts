import { NextRequest, NextResponse } from 'next/server';
import { getDefectLibrary } from '@/services/tursoService';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

/**
 * EXPORT EXCEL - ISO 9001:2026 COMPLIANT
 * Quy tắc:
 * 1. Dữ liệu binary thuần (Uint8Array)
 * 2. Không BOM, không Log can thiệp vào stream
 * 3. Mapping cột cố định theo schema database
 */
export async function GET(request: NextRequest) {
  try {
    const data = await getDefectLibrary();
    
    // Mapping 1-1 theo cấu trúc yêu cầu của Giám đốc Chất lượng
    const exportRows = data.map(item => ({
      defect_code: item.defect_code,
      defect_name: item.defect_name,
      defect_group: item.defect_group,
      defect_type: item.defect_type,
      severity: item.severity,
      description: item.description,
      applicable_process: item.applicable_process,
      status: item.status,
      created_at: item.created_at,
      updated_at: item.updated_at
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DefectLibrary");
    
    /* 
       CRITICAL FIX: Chuyển đổi sang Uint8Array (chuẩn Web) 
       để tránh lỗi "file format or extension is not valid" trên Excel.
    */
    const buf = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const binaryData = new Uint8Array(buf);

    // Backend logging cho mục đích audit ISO
    const timestamp = new Date().toISOString();
    console.info(`[ISO-AUDIT] [EXPORT] Module: DefectLibrary | Records: ${data.length} | Time: ${timestamp}`);

    return new NextResponse(binaryData, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Defect_Library_${Date.now()}.xlsx"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
  } catch (error: any) {
    console.error(`[ISO-ERROR] [EXPORT] Failed: ${error.message}`);
    // Trả về JSON lỗi nếu export thất bại, frontend sẽ xử lý hiển thị alert
    return NextResponse.json({ 
      success: false, 
      message: 'Không thể tạo file Excel kỹ thuật. Vui lòng liên hệ quản trị viên.' 
    }, { status: 500 });
  }
}
