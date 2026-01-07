import { NextRequest } from 'next/server';
import { getPlans } from '../../../../services/tursoService';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || 'anonymous';
    console.info(`[ISO-AUDIT] [PLAN-EXPORT] Request by: ${authHeader}`);

    // Lấy toàn bộ kế hoạch để xuất
    const result = await getPlans({ page: 1, limit: 10000 });
    const data = result.items;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Production Plans');

    worksheet.columns = [
      { header: 'STT', key: 'stt', width: 5 },
      { header: 'Mã Nhà Máy', key: 'ma_nha_may', width: 20 },
      { header: 'Headcode', key: 'headcode', width: 15 },
      { header: 'Mã Công Trình', key: 'ma_ct', width: 15 },
      { header: 'Tên Công Trình', key: 'ten_ct', width: 30 },
      { header: 'Tên Hạng Mục', key: 'ten_hang_muc', width: 40 },
      { header: 'DVT', key: 'dvt', width: 10 },
      { header: 'Số Lượng IPO', key: 'so_luong_ipo', width: 15 },
      { header: 'Ngày Kế Hoạch', key: 'plannedDate', width: 15 },
      { header: 'Người Phụ Trách', key: 'assignee', width: 20 },
      { header: 'Trạng Thái', key: 'status', width: 15 }
    ];

    data.forEach(item => {
      worksheet.addRow({
        stt: item.stt,
        ma_nha_may: item.ma_nha_may,
        headcode: item.headcode,
        ma_ct: item.ma_ct,
        ten_ct: item.ten_ct,
        ten_hang_muc: item.ten_hang_muc,
        dvt: item.dvt,
        so_luong_ipo: item.so_luong_ipo,
        plannedDate: item.plannedDate,
        assignee: item.assignee,
        status: item.status
      });
    });

    // Formatting
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

    const buffer = await workbook.xlsx.writeBuffer();
    
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=AATN_Production_Plans.xlsx`,
      },
    });
  } catch (error: any) {
    console.error("[ISO-CRITICAL] Plan Export Failed:", error);
    return new Response(JSON.stringify({ message: error.message }), { status: 500 });
  }
}