import { NextRequest } from 'next/server';
import { createClient } from '@libsql/client/web';
import ExcelJS from 'exceljs';

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL || 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA',
});

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || 'anonymous';
    console.info(`[ISO-AUDIT] [EXPORT] Defect Library request by: ${authHeader}`);

    const result = await turso.execute("SELECT * FROM defect_library ORDER BY defect_code ASC");
    const rows = result.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Defect Library');

    worksheet.columns = [
      { header: 'Mã Lỗi', key: 'defect_code', width: 15 },
      { header: 'Tên Lỗi', key: 'name', width: 30 },
      { header: 'Nhóm Lỗi', key: 'category', width: 20 },
      { header: 'Công Đoạn', key: 'stage', width: 20 },
      { header: 'Mức Độ', key: 'severity', width: 15 },
      { header: 'Mô Tả Lỗi', key: 'description', width: 50 },
      { header: 'Biện Pháp Khắc Phục', key: 'suggested_action', width: 40 }
    ];

    rows.forEach((item: any) => {
      worksheet.addRow({
        defect_code: item.defect_code || item.id,
        name: item.name || '',
        category: item.category || 'Ngoại quan',
        stage: item.stage || 'Chung',
        severity: item.severity || 'MINOR',
        description: item.description || '',
        suggested_action: item.suggested_action || ''
      });
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

    const buffer = await workbook.xlsx.writeBuffer();
    
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=AATN_Defect_Library_${Date.now()}.xlsx`,
        'Cache-Control': 'no-store'
      },
    });
  } catch (error: any) {
    console.error("[ISO-CRITICAL] Defect Library Export Failed:", error);
    return new Response(JSON.stringify({ message: error.message }), { status: 500 });
  }
}