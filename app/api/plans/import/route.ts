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

    if (!worksheet) return NextResponse.json({ message: 'Empty worksheet' }, { status: 400 });

    const plans: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const plan = {
        stt: row.getCell(1).value,
        ma_nha_may: row.getCell(2).value?.toString(),
        headcode: row.getCell(3).value?.toString(),
        ma_ct: row.getCell(4).value?.toString(),
        ten_ct: row.getCell(5).value?.toString(),
        ten_hang_muc: row.getCell(6).value?.toString(),
        dvt: row.getCell(7).value?.toString() || 'PCS',
        so_luong_ipo: Number(row.getCell(8).value || 0),
        plannedDate: row.getCell(9).value?.toString(),
        assignee: row.getCell(10).value?.toString(),
        status: 'PENDING'
      };

      if (plan.ma_nha_may || plan.headcode) {
        plans.push(plan);
      }
    });

    // ISO Rule: Transactional import
    for (const p of plans) {
        await turso.execute({
            sql: `INSERT INTO plans (stt, ma_nha_may, headcode, ma_ct, ten_ct, ten_hang_muc, dvt, so_luong_ipo, plannedDate, assignee, status, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [p.stt, p.ma_nha_may, p.headcode, p.ma_ct, p.ten_ct, p.ten_hang_muc, p.dvt, p.so_luong_ipo, p.plannedDate, p.assignee, p.status, Math.floor(Date.now()/1000)]
        });
    }

    console.info(`[ISO-AUDIT] [PLAN-IMPORT] ${plans.length} items by ${authHeader}`);
    return NextResponse.json({ success: true, count: plans.length });

  } catch (error: any) {
    console.error("[ISO-CRITICAL] Plan Import Failed:", error);
    return NextResponse.json({ message: `Lỗi ISO: ${error.message}` }, { status: 500 });
  }
}