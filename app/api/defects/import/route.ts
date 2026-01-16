
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@libsql/client/web';
import ExcelJS from 'exceljs';

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL || 'libsql://aatnqaqc-thanhnvm-alt.aws-ap-northeast-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjY5OTIyMTEsImlkIjoiY2IxYmZmOGYtYzVhNS00NTNhLTk1N2EtYjdhMWU5NzIwZTUzIiwicmlkIjoiZDcxNjFjNGYtNDQyOC00ZmIyLTgzZDEtN2JkOGUzZjcyYzFmIn0.u8k5EJwCPv1uopKKDbaJ3AiDkmZFoAI3SlvgT_Hk8HSwLiO16IegBSUc5Hg4Lca7VPU_3quNqyvxzTPNPYd3DA',
});

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || 'anonymous';
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) return NextResponse.json({ message: 'No file uploaded' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet(1);

    if (!worksheet) return NextResponse.json({ message: 'Empty worksheet' }, { status: 400 });

    const defects: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Bỏ qua header

      const defect = {
        code: row.getCell(1).value?.toString() || '',
        name: row.getCell(2).value?.toString() || '',
        category: row.getCell(3).value?.toString() || 'Ngoại quan',
        stage: row.getCell(4).value?.toString() || 'Chung',
        severity: row.getCell(5).value?.toString() || 'MINOR',
        description: row.getCell(6).value?.toString() || '',
        suggested_action: row.getCell(7).value?.toString() || ''
      };

      if (defect.code && defect.name) {
        defects.push(defect);
      }
    });

    // Thực hiện nhập dữ liệu theo lô (Batch insert/upsert)
    for (const d of defects) {
        const itemJson = JSON.stringify({
            id: d.code,
            code: d.code,
            name: d.name,
            category: d.category,
            stage: d.stage,
            severity: d.severity,
            description: d.description,
            suggestedAction: d.suggested_action
        });

        await turso.execute({
            sql: `INSERT INTO defect_library (
                    id, defect_code, name, stage, category, description, severity, 
                    suggested_action, created_by, created_at, updated_at, data
                  )
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET 
                    defect_code = excluded.defect_code,
                    name = excluded.name,
                    stage = excluded.stage,
                    category = excluded.category,
                    description = excluded.description,
                    severity = excluded.severity,
                    suggested_action = excluded.suggested_action,
                    updated_at = excluded.updated_at,
                    data = excluded.data`,
            args: [
                d.code, d.code, d.name, d.stage, d.category, d.description, d.severity, 
                d.suggested_action, 'System Import', Math.floor(Date.now()/1000), 
                Math.floor(Date.now()/1000), itemJson
            ]
        });
    }

    console.info(`[ISO-AUDIT] [DEFECT-IMPORT] ${defects.length} items by ${authHeader}`);
    return NextResponse.json({ success: true, count: defects.length });

  } catch (error: any) {
    console.error("[ISO-CRITICAL] Defect Import Failed:", error);
    return NextResponse.json({ message: `Lỗi ISO: ${error.message}` }, { status: 500 });
  }
}
