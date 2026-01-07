import { NextRequest } from 'next/server';
import { getDefectLibrary } from '@/services/tursoService';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

/**
 * EXPORT EXCEL - ISO 9001:2026 AUDIT READY
 * Khắc phục triệt để lỗi định dạng file không hợp lệ bằng Standard Web Response
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Truy vấn dữ liệu từ Turso (Read-only)
    const data = await getDefectLibrary();
    
    // 2. Khởi tạo Workbook với Metadata chuẩn ISO
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QMS AATN System';
    workbook.lastModifiedBy = 'QMS AATN System';
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet('Defect Library');

    // 3. Mapping cột theo cấu trúc hồ sơ chất lượng
    worksheet.columns = [
      { header: 'Mã Lỗi (Code)', key: 'defect_code', width: 20 },
      { header: 'Tên Lỗi (Name)', key: 'defect_name', width: 35 },
      { header: 'Nhóm Lỗi (Group)', key: 'defect_group', width: 20 },
      { header: 'Loại Lỗi (Type)', key: 'defect_type', width: 20 },
      { header: 'Mức Độ (Severity)', key: 'severity', width: 15 },
      { header: 'Mô Tả (Description)', key: 'description', width: 50 },
      { header: 'Quy Trình (Process)', key: 'applicable_process', width: 20 },
      { header: 'Trạng Thái (Status)', key: 'status', width: 15 },
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

    // Định dạng Header chuyên nghiệp
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.alignment = { horizontal: 'center' };
    });

    // 5. Tạo Buffer và chuyển đổi sang ArrayBuffer chuẩn Web
    const buffer = await workbook.xlsx.writeBuffer();
    
    /* 
       CRITICAL: Sử dụng Response constructor thay vì NextResponse.json 
       để ép buộc Content-Type binary không bị framework can thiệp.
    */
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="AATN_Defect_Library_${Date.now()}.xlsx"`,
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff'
      }
    });

  } catch (error: any) {
    console.error(`[ISO-CRITICAL] Export failed: ${error.message}`);
    // Trả về lỗi JSON chuẩn nếu thất bại
    return new Response(JSON.stringify({ 
      success: false, 
      message: `Lỗi hệ thống khi tạo hồ sơ ISO: ${error.message}` 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}