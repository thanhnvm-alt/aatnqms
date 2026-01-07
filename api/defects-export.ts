
import { createClient } from '@libsql/client';
import ExcelJS from 'exceljs';

// Khởi tạo Turso Client trực tiếp tại backend để đảm bảo an toàn bí mật
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL || 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA',
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // 1. Lấy dữ liệu từ Turso
    const result = await turso.execute("SELECT * FROM defect_library ORDER BY defect_code ASC");
    const data = result.rows;

    // 2. Khởi tạo Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QMS AATN System';
    const worksheet = workbook.addWorksheet('Defect Library');

    // 3. Mapping cột
    worksheet.columns = [
      { header: 'Mã Lỗi', key: 'defect_code', width: 15 },
      { header: 'Tên Lỗi', key: 'defect_name', width: 30 },
      { header: 'Nhóm Lỗi', key: 'defect_group', width: 20 },
      { header: 'Loại Lỗi', key: 'defect_type', width: 20 },
      { header: 'Mức Độ', key: 'severity', width: 15 },
      { header: 'Mô Tả', key: 'description', width: 50 },
      { header: 'Quy Trình', key: 'applicable_process', width: 20 },
      { header: 'Trạng Thái', key: 'status', width: 15 },
      { header: 'Gợi Ý Khắc Phục', key: 'suggested_action', width: 40 }
    ];

    // 4. Đổ dữ liệu
    data.forEach((item: any) => {
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

    // Định dạng Header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

    // 5. Tạo Buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // 6. Trả về phản hồi binary
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=AATN_Defects_${Date.now()}.xlsx`);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Fix: Use Uint8Array instead of Buffer.from to resolve "Cannot find name 'Buffer'" error
    return res.send(new Uint8Array(buffer as any));

  } catch (error: any) {
    console.error('Export Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
