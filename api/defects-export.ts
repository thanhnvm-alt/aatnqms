
import { createClient } from '@libsql/client';
import * as XLSX from 'xlsx';

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL || 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA',
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const result = await turso.execute("SELECT * FROM defect_library ORDER BY defect_code ASC");
    const rows = result.rows;

    const exportData = rows.map((item: any) => ({
      'Mã Lỗi': item.defect_code,
      'Tên Lỗi': item.defect_name,
      'Nhóm Lỗi': item.defect_group,
      'Loại Lỗi': item.defect_type,
      'Mức Độ': item.severity,
      'Mô Tả Chi Tiết': item.description,
      'Quy Trình Áp Dụng': item.applicable_process,
      'Trạng Thái': item.status,
      'Gợi Ý Khắc Phục': item.suggested_action
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Defect Library");

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=AATN_Defect_Library_${Date.now()}.xlsx`);
    
    return res.send(excelBuffer);
  } catch (error: any) {
    console.error("Export Defects Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
