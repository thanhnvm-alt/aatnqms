import { NextRequest, NextResponse } from 'next/server';
import { getDefectLibrary } from '@/services/tursoService';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const data = await getDefectLibrary();
    
    // Mapping 1-1 with Excel requirement provided in screenshot
    const exportRows = data.map(item => ({
      defect_code: item.defect_code,
      defect_name: item.defect_name,
      defect_group: item.defect_group,
      defect_type: item.defect_type,
      severity: item.severity,
      description: item.description,
      applicable_process: item.applicable_process,
      status: item.status,
      created_at: item.created_at,
      updated_at: item.updated_at
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DefectLibrary");
    
    // Write to buffer
    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="DefectLibrary.xlsx"'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ message: 'Export failed: ' + error.message }, { status: 500 });
  }
}
