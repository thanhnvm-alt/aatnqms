import { NextRequest, NextResponse } from 'next/server';
import { saveDefectLibraryItem } from '@/services/tursoService';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ message: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return NextResponse.json({ message: 'File is empty' }, { status: 400 });
    }

    const results = {
      total: data.length,
      success: 0,
      failed: 0,
      errors: [] as any[]
    };

    const severityEnum = ['MINOR', 'MAJOR', 'CRITICAL'];
    const statusEnum = ['ACTIVE', 'INACTIVE'];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // Adjust for header and 0-index

      try {
        // Validation logic
        if (!row.defect_code) throw new Error('Missing defect_code');
        if (!row.defect_name) throw new Error('Missing defect_name');
        if (!severityEnum.includes(String(row.severity).toUpperCase())) throw new Error('Invalid severity value');
        if (row.status && !statusEnum.includes(String(row.status).toUpperCase())) throw new Error('Invalid status value');

        const now = Math.floor(Date.now() / 1000);

        const item = {
          id: row.defect_code,
          defect_code: row.defect_code,
          defect_name: row.defect_name,
          defect_group: row.defect_group || 'Chung',
          defect_type: row.defect_type || 'Ngoại quan',
          severity: String(row.severity).toUpperCase() as any,
          description: row.description || '',
          applicable_process: row.applicable_process || 'Chung',
          status: (row.status ? String(row.status).toUpperCase() : 'ACTIVE') as any,
          suggested_action: row.suggested_action || '',
          created_at: row.created_at || now,
          updated_at: now
        };

        await saveDefectLibraryItem(item as any);
        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push({
          row: rowNum,
          field: err.message.split(' ').pop(),
          message: err.message
        });
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ message: 'Import failed: ' + error.message }, { status: 500 });
  }
}
