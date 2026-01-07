
import { NextRequest, NextResponse } from 'next/server';
import { getDefectLibrary } from '@/services/tursoService';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

/**
 * EXPORT EXCEL - ISO 9001:2026 AUDIT READY
 * Tuân thủ quy tắc Server-Authoritative & Binary Stream
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Truy vấn dữ liệu từ Turso (Read-only)
    const data = await getDefectLibrary();
    const timestamp = new Date().toISOString();
    
    // 2. Khởi tạo ExcelJS Workbook
    const workbook = new ExcelJS.Workbook();
    
    // ISO Audit Properties: Truy vết nguồn gốc Documented Information
    workbook.creator = 'QMS AATN System';
    workbook.lastModifiedBy = 'QMS AATN System';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.title = 'Defect Library Report';
    workbook.subject = 'Quality Documentation';

    const worksheet = workbook.addWorksheet('Defect Library', {
      views: [{ state: 'frozen', ySplit: 1 }], // Cố định Header row
      properties: { tabColor: { argb: 'FF0000FF' } }
    });

    // 3. Định nghĩa cấu trúc cột (Mapping 1-1 với Database Schema)
    worksheet.columns = [
      { header: 'Mã Lỗi (defect_code)', key: 'defect_code', width: 20 },
      { header: 'Tên Lỗi (defect_name)', key: 'defect_name', width: 35 },
      { header: 'Nhóm Lỗi (defect_group)', key: 'defect_group', width: 20 },
      { header: 'Loại Lỗi (defect_type)', key: 'defect_type', width: 20 },
      { header: 'Mức Độ (severity)', key: 'severity', width: 15 },
      { header: 'Mô Tả (description)', key: 'description', width: 50 },
      { header: 'Quy Trình (applicable_process)', key: 'applicable_process', width: 20 },
      { header: 'Trạng Thái (status)', key: 'status', width: 15 },
      { header: 'Ngày Tạo (created_at)', key: 'created_at', width: 25 },
      { header: 'Cập Nhật (updated_at)', key: 'updated_at', width: 25 }
    ];

    // 4. Styling Header (Chuyên nghiệp - Audit Ready)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' } // AA Corporation Blue
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    headerRow.height = 25;

    // 5. Thêm dữ liệu
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

    // Căn chỉnh nội dung
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', wrapText: true };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      }
    });

    // 6. Tạo Buffer (ArrayBuffer/Uint8Array)
    const buffer = await workbook.xlsx.writeBuffer();

    // 7. Audit Logging (Backend Trail)
    console.info(`[ISO-AUDIT] Export: DefectLibrary | Rows: ${data.length} | Time: ${timestamp}`);

    // 8. Trả về Binary Response với Header chuẩn Microsoft Excel
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Defect_Library_Report_${Date.now()}.xlsx"`,
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error: any) {
    console.error(`[CRITICAL-EXPORT-ERROR]`, error);
    // Trả về JSON lỗi nếu thất bại, tuyệt đối không trả file sai format
    return NextResponse.json({ 
      success: false, 
      message: 'Không thể khởi tạo tệp Excel. Vui lòng kiểm tra quyền truy cập hoặc kết nối database.',
      error_code: 'EXCEL_GEN_FAILED'
    }, { status: 500 });
  }
}
