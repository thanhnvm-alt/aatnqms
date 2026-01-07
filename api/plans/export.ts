import { createClient } from '@libsql/client';
import ExcelJS from 'exceljs';

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL || 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA',
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).send('ISO: Method Not Allowed');

  try {
    // Audit-Log: Export request detected
    const result = await turso.execute("SELECT * FROM plans ORDER BY id DESC");
    const rows = result.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Kế hoạch sản xuất');

    // Header bắt buộc phải trùng khớp tuyệt đối với logic Import để đảm bảo tính hệ thống
    worksheet.columns = [
      { header: 'Mã Nhà Máy', key: 'ma_nha_may', width: 20 },
      { header: 'Headcode', key: 'headcode', width: 20 },
      { header: 'Mã Công Trình', key: 'ma_ct', width: 20 },
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
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    const buffer = await workbook.xlsx.writeBuffer();
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Hồ_sơ_Kế_hoạch_AATN_${Date.now()}.xlsx`);
    
    // Fixed: Replaced Buffer.from with Uint8Array to resolve "Cannot find name 'Buffer'" error
    return res.status(200).send(new Uint8Array(buffer as ArrayBuffer));
  } catch (error: any) {
    console.error("[ISO-CRITICAL] Export Plans Error:", error);
    return res.status(500).json({ message: "Lỗi hệ thống khi trích xuất dữ liệu ISO." });
  }
}