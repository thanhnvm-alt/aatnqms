
import { NextRequest, NextResponse } from 'next/server';
import { getDefectLibrary } from '@/services/tursoService';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

/**
 * EXPORT EXCEL - ISO 9001:2026 AUDIT READY
 * Khắc phục lỗi "file format or extension is not valid"
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Lấy dữ liệu từ Turso
    const data = await getDefectLibrary();
    
    // 2. Khởi tạo Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QMS AATN System';
    workbook.lastModifiedBy = 'QMS AATN System';
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet('Defect Library');

    // 3. Cấu hình Cột
    worksheet.columns = [
      { header: 'Mã Lỗi', key: 'defect_code', width: 20 },
      { header: 'Tên Lỗi', key: 'defect_name', width: 35 },
      { header: 'Nhóm', key: 'defect_group', width: 20 },
      { header: 'Loại', key: 'defect_type', width: 20 },
      { header: 'Mức Độ', key: 'severity', width: 15 },
      { header: 'Mô Tả', key: 'description', width: 50 },
      { header: 'Quy Trình', key: 'applicable_process', width: 20 },
      { header: 'Trạng Thái', key: 'status', width: 15 },
      { header: 'Ngày Tạo', key: 'created_at', width: 25 },
      { header: 'Cập Nhật', key: 'updated_at', width: 25 }
    ];

    // 4. Đổ dữ liệu
    data.forEach(item => {
      worksheet.addRow({
        defect_code: item.defect_code,
        defect_name: item.defect_name,
        defect_group: item.defect_group,
        defect_type: item.defect_type,
        severity: item.severity,
        description: item.description,
        applicable_process: item.applicable_process,
        status: item.status,
        created_at: item.created_at ? new Date(item.created_at * 1000).toLocaleString('vi-VN') : '---',
        updated_at: item.updated_at ? new Date(item.updated_at * 1000).toLocaleString('vi-VN') : '---'
      });
    });

    // Định dạng Header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { horizontal: 'center' };

    // 5. Tạo Binary Buffer sạch (Dùng Uint8Array để tránh lỗi encoding trên trình duyệt)
    const buffer = await workbook.xlsx.writeBuffer();
    const uint8Array = new Uint8Array(buffer);

    // 6. Ghi log Audit ISO
    console.info(`[ISO-AUDIT] [EXPORT] Success - Rows: ${data.length} - Time: ${new Date().toISOString()}`);

    // 7. Trả về Response
    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Defect_Library_${Date.now()}.xlsx"`,
        'Content-Length': uint8Array.length.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
  } catch (error: any) {
    console.error(`[CRITICAL-EXPORT-ERROR]`, error);
    // Trả về JSON lỗi nếu thất bại, frontend sẽ hiển thị thông báo cụ thể
    return NextResponse.json({ 
      success: false, 
      message: `Lỗi hệ thống: ${error.message || 'Không thể tạo file Excel.'}`
    }, { status: 500 });
  }
}
