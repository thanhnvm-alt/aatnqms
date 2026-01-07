import { createClient } from '@libsql/client';
import ExcelJS from 'exceljs';

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL || 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA',
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const result = await turso.execute("SELECT * FROM defect_library ORDER BY defect_code ASC");
    const rows = result.rows;

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

    rows.forEach((item: any) => {
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
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=AATN_Defect_Library_${Date.now()}.xlsx`);
    
    // Fixed: Replaced Buffer.from with new Uint8Array to resolve "Cannot find name 'Buffer'" error
    return res.status(200).send(new Uint8Array(buffer as ArrayBuffer));
  } catch (error: any) {
    console.error("Export Defects Error:", error);
    return res.status(500).json({ message: error.message });
  }
}