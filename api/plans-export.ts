
import { createClient } from '@libsql/client';
import * as XLSX from 'xlsx';

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL || 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA',
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const result = await turso.execute("SELECT * FROM plans ORDER BY id DESC");
    const rows = result.rows;

    // Ánh xạ dữ liệu sang định dạng người dùng mong muốn (giống code cũ)
    const exportData = rows.map((row: any) => ({
      'STT': row.stt || '',
      'Mã Nhà Máy': row.ma_nha_may || '',
      'Headcode': row.headcode || '',
      'Mã CT': row.ma_ct || '',
      'Tên Công Trình': row.ten_ct || '',
      'Tên Sản Phẩm': row.ten_hang_muc || '',
      'Số lượng (IPO)': row.so_luong_ipo || 0,
      'ĐVT': row.dvt || 'PCS',
      'Ngày Kế Hoạch': row.plannedDate || '',
      'Người Phụ Trách': row.assignee || '',
      'Trạng Thái': row.status || 'PENDING'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Kế hoạch");

    // Tạo Buffer binary
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=AATN_Plans_${Date.now()}.xlsx`);
    
    return res.send(excelBuffer);
  } catch (error: any) {
    console.error("Export Plans Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
