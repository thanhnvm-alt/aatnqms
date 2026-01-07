import { NextRequest, NextResponse } from 'next/server';
import { saveDefectLibraryItem } from '@/services/tursoService';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

/**
 * IMPORT EXCEL - ISO 9001:2026 RISK-BASED VALIDATION
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ message: 'Lỗi ISO: Không tìm thấy file dữ liệu.' }, { status: 400 });
    }

    // Kiểm tra extension sơ bộ
    if (!file.name.endsWith('.xlsx')) {
        return NextResponse.json({ message: 'Lỗi ISO: Định dạng file không hợp lệ. Yêu cầu .xlsx OpenXML.' }, { status: 422 });
    }

    const arrayBuffer = await file.arrayBuffer();
    
    // Kiểm tra Magic Number để xác thực là file ZIP (XLSX là định dạng nén)
    const view = new Uint8Array(arrayBuffer);
    if (view[0] !== 0x50 || view[1] !== 0x4B) { // 'PK' header
        return NextResponse.json({ message: 'Lỗi ISO: File bị hỏng hoặc không đúng chuẩn OpenXML.' }, { status: 422 });
    }

    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Trích xuất header để validate cấu trúc (ISO Traceability)
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (rows.length < 2) {
      return NextResponse.json({ message: 'Lỗi ISO: File Excel không chứa dữ liệu hợp lệ.' }, { status: 400 });
    }

    const expectedHeaders = ['defect_code', 'defect_name', 'defect_group', 'defect_type', 'severity', 'description', 'applicable_process', 'status'];
    const actualHeaders = rows[0].map((h: any) => String(h).trim().toLowerCase());
    
    const missingHeaders = expectedHeaders.filter(h => !actualHeaders.includes(h));
    if (missingHeaders.length > 0) {
      return NextResponse.json({ 
        success: false,
        message: `Sai cấu trúc hồ sơ ISO. Thiếu cột: ${missingHeaders.join(', ')}` 
      }, { status: 400 });
    }

    const data: any[] = XLSX.utils.sheet_to_json(worksheet);
    const results = {
      total: data.length,
      success: 0,
      failed: 0,
      errors: [] as any[]
    };

    const ENUMS = {
      severity: ['MINOR', 'MAJOR', 'CRITICAL'],
      status: ['ACTIVE', 'INACTIVE']
    };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2;

      try {
        // Business Logic Validation (Server-Authoritative)
        if (!row.defect_code) throw new Error('Thiếu định danh defect_code');
        if (!row.defect_name) throw new Error('Thiếu tên lỗi defect_name');
        
        const severity = String(row.severity || 'MINOR').toUpperCase();
        if (!ENUMS.severity.includes(severity)) throw new Error(`Mức độ '${severity}' sai quy định ISO`);
        
        const status = String(row.status || 'ACTIVE').toUpperCase();
        if (!ENUMS.status.includes(status)) throw new Error(`Trạng thái '${status}' sai quy định ISO`);

        const now = Math.floor(Date.now() / 1000);

        const item = {
          id: row.defect_code,
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
        results.errors.push({ row: rowNum, message: err.message });
      }
    }

    console.info(`[ISO-AUDIT] [IMPORT] Success: ${results.success}, Failed: ${results.failed}`);
    return NextResponse.json(results);

  } catch (error: any) {
    console.error(`[ISO-CRITICAL] Import failed: ${error.message}`);
    return NextResponse.json({ 
      success: false,
      message: 'Hệ thống không thể xử lý file Excel. Vui lòng kiểm tra định dạng dữ liệu.' 
    }, { status: 500 });
  }
}
