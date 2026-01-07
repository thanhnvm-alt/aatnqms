
import { createClient } from '@libsql/client';
import ExcelJS from 'exceljs';

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL || 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA',
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const result = await turso.execute("SELECT * FROM plans ORDER BY id DESC");
    const data = result.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Kế hoạch Sản xuất');

    worksheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Mã Nhà Máy', key: 'ma_nha_may', width: 20 },
      { header: 'Headcode', key: 'headcode', width: 15 },
      { header: 'Mã CT', key: 'ma_ct', width: 15 },
      { header: 'Tên Công Trình', key: 'ten_ct', width: 35 },
      { header: 'Tên Sản Phẩm', key: 'ten_hang_muc', width: 35 },
      { header: 'Số lượng (IPO)', key: 'so_luong_ipo', width: 15 },
      { header: 'ĐVT', key: 'dvt', width: 10 },
      { header: 'Ngày Kế Hoạch', key: 'plannedDate', width: 15 },
      { header: 'Người Phụ Trách', key: 'assignee', width: 20 },
      { header: 'Trạng Thái', key: 'status', width: 15 }
    ];

    data.forEach((item: any) => {
      worksheet.addRow(item);
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=AATN_Plans_${Date.now()}.xlsx`);
    return res.send(new Uint8Array(buffer as any));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
