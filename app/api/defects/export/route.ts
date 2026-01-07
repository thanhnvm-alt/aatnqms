import { NextRequest, NextResponse } from 'next/server';
import { getDefectLibrary } from '@/services/tursoService';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

/**
 * EXPORT EXCEL - ISO 9001:2026 Standard
 * Đảm bảo dữ liệu binary thuần túy, không chèn log hoặc HTML.
 */
export async function GET(request: NextRequest) {
  try {
    const data = await getDefectLibrary();
    
    // Mapping 1-1 với yêu cầu cấu trúc database/excel
    // Thứ tự cột phải được giữ cố định cho hệ thống audit
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
    
    // Tạo binary buffer dưới dạng Uint8Array (chuẩn OpenXML)
    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Server-Authoritative: Log audit trail tại backend
    console.info(`[AUDIT] Export Defect Library triggered. Records: ${data.length}, Time: ${new Date().toISOString()}`);

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Defect_Library_${Date.now()}.xlsx"`,
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error: any) {
    console.error(`[CRITICAL] Export failed:`, error);
    return NextResponse.json({ 
      success: false, 
      message: 'Lỗi hệ thống khi tạo file Excel. Vui lòng liên hệ IT.' 
    }, { status: 500 });
  }
}
