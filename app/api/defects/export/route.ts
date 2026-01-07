
import { NextRequest } from 'next/server';
import { getDefectLibrary } from '@/services/tursoService';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

/**
 * EXPORT EXCEL - ISO 9001:2026 AUDIT READY
 * Chuẩn hóa phản hồi binary để vượt qua các bộ lọc proxy và browser
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Truy vấn dữ liệu từ Turso
    const data = await getDefectLibrary();
    
    // 2. Khởi tạo Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QMS AATN System';
    workbook.lastModifiedBy = 'QMS AATN System';
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet('Defect Library');

    // 3. Cấu hình Cột (Mapping ISO 9001)
    worksheet.columns = [
      { header: 'Mã Lỗi', key: 'defect_code', width: 15 },
      { header: 'Tên Lỗi', key: 'defect_name', width: 30 },
      { header: 'Nhóm Lỗi', key: 'defect_group', width: 20 },
      { header: 'Loại Lỗi', key: 'defect_type', width: 20 },
      { header: 'Mức Độ', key: 'severity', width: 15 },
      { header: 'Mô Tả Chi Tiết', key: 'description', width: 50 },
      { header: 'Quy Trình Áp Dụng', key: 'applicable_process', width: 20 },
      { header: 'Trạng Thái', key: 'status', width: 15 },
      { header: 'Gợi Ý Khắc Phục', key: 'suggested_action', width: 40 },
      { header: 'Ngày Tạo', key: 'created_at', width: 20 }
    ];

    // 4. Đổ dữ liệu vào hàng
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
        suggested_action: item.suggested_action,
        created_at: item.created_at ? new Date(item.created_at * 1000).toLocaleString('vi-VN') : '---'
      });
    });

    // Định dạng Header Row (Chuyên nghiệp)
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' } // Blue-800
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // 5. Xuất Buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Đảm bảo buffer là Uint8Array sạch để truyền qua mạng
    const binaryData = new Uint8Array(buffer);

    // 6. Trả về Response chuẩn binary (Web Standard)
    return new Response(binaryData, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="AATN_Defect_Library_${Date.now()}.xlsx"`,
        'Content-Length': binaryData.length.toString(),
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      }
    });

  } catch (error: any) {
    console.error(`[ISO-EXPORT-ERROR]`, error);
    // Trả về lỗi JSON để frontend bắt được thay vì trả về HTML 404/500 của server
    const errorBody = JSON.stringify({ 
      success: false, 
      message: `Lỗi hệ thống khi tạo hồ sơ ISO: ${error.message}` 
    });
    return new Response(errorBody, {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
