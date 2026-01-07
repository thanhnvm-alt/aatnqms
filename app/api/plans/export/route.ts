
import { NextRequest } from 'next/server';
import { createClient } from '@libsql/client';
import ExcelJS from 'exceljs';

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL || 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA',
});

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const result = await turso.execute("SELECT * FROM plans ORDER BY id DESC");
    const rows = result.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Kế hoạch sản xuất');

    worksheet.columns = [
      { header: 'STT', key: 'stt', width: 10 },
      { header: 'Mã Nhà Máy', key: 'ma_nha_may', width: 20 },
      { header: 'Headcode', key: 'headcode', width: 20 },
      { header: 'Mã CT', key: 'ma_ct', width: 20 },
      { header: 'Tên Công Trình', key: 'ten_ct', width: 30 },
      { header: 'Tên Sản Phẩm', key: 'ten_hang_muc', width: 35 },
      { header: 'Số lượng (IPO)', key: 'so_luong_ipo', width: 15 },
      { header: 'ĐVT', key: 'dvt', width: 10 },
      { header: 'Ngày Kế Hoạch', key: 'plannedDate', width: 15 },
      { header: 'Người Phụ Trách', key: 'assignee', width: 20 },
      { header: 'Trạng Thái', key: 'status', width: 15 }
    ];

    rows.forEach((row: any) => {
      worksheet.addRow({
        stt: row.stt || '',
        ma_nha_may: row.ma_nha_may || '',
        headcode: row.headcode || '',
        ma_ct: row.ma_ct || '',
        ten_ct: row.ten_ct || '',
        ten_hang_muc: row.ten_hang_muc || '',
        so_luong_ipo: row.so_luong_ipo || 0,
        dvt: row.dvt || 'PCS',
        plannedDate: row.plannedDate || '',
        assignee: row.assignee || '',
        status: row.status || 'PENDING'
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
        'Content-Disposition': `attachment; filename=AATN_Plans_${Date.now()}.xlsx`,
      },
    });
  } catch (error: any) {
    console.error("Export Plans Error:", error);
    return new Response(JSON.stringify({ message: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
