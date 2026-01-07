import { NextRequest, NextResponse } from 'next/server';
import { saveDefectLibraryItem } from '@/services/tursoService';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ message: 'Không tìm thấy file tải lên.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Đọc raw data để validate header trước khi convert sang JSON
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (rows.length === 0) {
      return NextResponse.json({ message: 'File Excel trống.' }, { status: 400 });
    }

    // 1. VALIDATE HEADERS (ISO 9001 Traceability)
    const expectedHeaders = ['defect_code', 'defect_name', 'defect_group', 'defect_type', 'severity', 'description', 'applicable_process', 'status'];
    const actualHeaders = rows[0].map((h: any) => String(h).trim().toLowerCase());
    
    const missingHeaders = expectedHeaders.filter(h => !actualHeaders.includes(h));
    if (missingHeaders.length > 0) {
      return NextResponse.json({ 
        success: false,
        message: `Sai cấu trúc file. Thiếu các cột bắt buộc: ${missingHeaders.join(', ')}` 
      }, { status: 400 });
    }

    // Convert sang JSON để xử lý business logic
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

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
      const rowNum = i + 2; //Header là dòng 1

      try {
        // 2. DATA VALIDATION
        if (!row.defect_code) throw new Error('Thiếu mã lỗi (defect_code)');
        if (!row.defect_name) throw new Error('Thiếu tên lỗi (defect_name)');
        
        const severity = String(row.severity || 'MINOR').toUpperCase();
        if (!severityEnum.includes(severity)) throw new Error(`Mức độ lỗi '${severity}' không hợp lệ. Chỉ chấp nhận: ${severityEnum.join(', ')}`);
        
        const status = String(row.status || 'ACTIVE').toUpperCase();
        if (!statusEnum.includes(status)) throw new Error(`Trạng thái '${status}' không hợp lệ. Chỉ chấp nhận: ${statusEnum.join(', ')}`);

        const now = Math.floor(Date.now() / 1000);

        // Mapping dữ liệu sạch vào database entity
        const item = {
          id: row.defect_code, // defect_code là Unique ID
          defect_code: row.defect_code,
          defect_name: row.defect_name,
          defect_group: row.defect_group || 'Chung',
          defect_type: row.defect_type || 'Ngoại quan',
          severity: severity as any,
          description: row.description || '',
          applicable_process: row.applicable_process || 'Chung',
          status: status as any,
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
          message: err.message
        });
      }
    }

    // 3. AUDIT LOGGING
    console.info(`[AUDIT] Import Defect Library completed. Success: ${results.success}, Failed: ${results.failed}`);

    return NextResponse.json(results);
  } catch (error: any) {
    console.error(`[CRITICAL] Import error:`, error);
    return NextResponse.json({ 
      success: false,
      message: 'Không thể đọc file Excel. Vui lòng kiểm tra định dạng .xlsx.' 
    }, { status: 500 });
  }
}
