
import { NextRequest } from 'next/server';
import { getDefectLibrary } from '@/services/tursoService';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const data = await getDefectLibrary();
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Defect Library');

    worksheet.columns = [
      { header: 'Mã Lỗi', key: 'defect_code', width: 15 },
      { header: 'Tên Lỗi', key: 'defect_name', width: 30 },
      { header: 'Nhóm Lỗi', key: 'defect_group', width: 20 },
      { header: 'Loại Lỗi', key: 'defect_type', width: 20 },
      { header: 'Mức Độ', key: 'severity', width: 15 },
      { header: 'Mô Tả Chi Tiết', key: 'description', width: 50 },
      { header: 'Quy Trình Áp Dụng', key: 'applicable_process', width: 20 },
      { header: 'Trạng Thái', key: 'status', width: 15 },
      { header: 'Gợi Ý Khắc Phục', key: 'suggested_action', width: 40 }
    ];

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
        suggested_action: item.suggested_action
      });
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    const buffer = await workbook.xlsx.writeBuffer();
    
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=AATN_Defect_Library_${Date.now()}.xlsx`,
      },
    });
  } catch (error: any) {
    console.error("Export Defects Error:", error);
    return new Response(JSON.stringify({ message: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
