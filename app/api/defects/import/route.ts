import { NextRequest, NextResponse } from 'next/server';
import { turso } from '../../../../services/tursoConfig';
import ExcelJS from 'exceljs';

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

    const defects: any[] = [];
    worksheet?.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      
      const defect = {
        code: row.getCell(1).value?.toString(),
        name: row.getCell(2).value?.toString(),
        stage: row.getCell(3).value?.toString(),
        category: row.getCell(4).value?.toString(),
        severity: row.getCell(5).value?.toString(),
        description: row.getCell(6).value?.toString(),
        suggested_action: row.getCell(9).value?.toString()
      };

      if (defect.code && defect.name) {
        defects.push(defect);
      }
    });

    for (const d of defects) {
        await turso.execute({
            sql: `INSERT INTO defect_library (id, defect_code, name, stage, category, description, severity, suggested_action, created_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(defect_code) DO UPDATE SET name=excluded.name, description=excluded.description`,
            args: [d.code, d.code, d.name, d.stage, d.category, d.severity, d.suggested_action, 'System Import', Math.floor(Date.now()/1000)]
        });
    }

    console.info(`[ISO-AUDIT] [DEFECT-IMPORT] ${defects.length} items by ${authHeader}`);
    return NextResponse.json({ success: true, count: defects.length });

  } catch (error: any) {
    console.error("[ISO-CRITICAL] Defect Import Failed:", error);
    return NextResponse.json({ message: `Lỗi hệ thống: ${error.message}` }, { status: 500 });
  }
}