
import ExcelJS from 'exceljs';
import fs from 'fs';

/**
 * SERVICE XỬ LÝ EXCEL (EXCELJS)
 * ----------------------------
 * 1. Chống mất số 0 đầu: Sử dụng cell.value hoặc ép kiểu trong template.
 * 2. Streaming: Sử dụng WorkbookReader/WorkbookWriter cho file lớn.
 * 3. Múi giờ & Ngày tháng: Định dạng chuẩn ISO hoặc Custom Format.
 * 4. Validation & Protect: Tạo dropdown và khóa header.
 * 5. Xử lý lỗi dòng: Try-catch từng row và ghi nhận lỗi.
 */

export class ExcelService {

  /**
   * 1. EXPORT STREAMING (XỬ LÝ FILE HÀNG TRĂM NGHÌN DÒNG)
   * Sử dụng stream để ghi trực tiếp xuống file/response, không tốn RAM.
   */
  static async exportLargeFile(outputPath: string) {
    // 2. Khởi tạo WorkbookWriter (Streaming)
    const options = {
      filename: outputPath,
      useStyles: true, // Cho phép sử dụng format/Style
      useSharedStrings: true
    };
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter(options);
    
    // Tạo sheet
    const sheet = workbook.addWorksheet('DataSheet', {
      views: [{ state: 'frozen', ySplit: 1 }], // Cố định Header
      properties: { tabColor: { argb: 'FFC0000' } }
    });

    // 4.2 Cấu hình Header & Protect
    sheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Họ và Tên', key: 'name', width: 25 },
      { header: 'Số Điện Thoại (String)', key: 'phone', width: 20 }, // Số 0 đầu
      { header: 'Trạng Thái (Dropdown)', key: 'status', width: 15 }, // Validation
      { header: 'Ngày Tạo (Timezone)', key: 'createdAt', width: 20 }  // Dates
    ];

    // Khóa Header: 
    // Mặc định tất cả cell là locked: true. 
    // Chúng ta sẽ protect sheet và chỉ cho phép edit vùng dữ liệu.
    await sheet.protect('password123', {
      selectLockedCells: true,
      selectUnlockedCells: true
    });

    // Thêm dữ liệu mẫu (Giả sử 100,000 dòng)
    for (let i = 1; i <= 100; i++) {
        const row = sheet.addRow({
          id: i,
          name: `User ${i}`,
          phone: `0908123${i.toString().padStart(3, '0')}`, // 1. Bảo toàn số 0 bằng cách truyền String
          status: 'ACTIVE',
          createdAt: new Date() // 3. ExcelJS tự động xử lý Date đối tượng theo múi giờ hệ thống
        });

        // 4.1 Data Validation (Dropdown) cho cột D (status)
        row.getCell('status').dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"ACTIVE,INACTIVE,PENDING"'] // Danh sách cố định
        };

        // Mở khóa các cell trong hàng này để user có thể nhập/sửa (trừ header đã bị khóa bởi protect sheet)
        row.eachCell((cell, colNumber) => {
          cell.protection = {
            locked: false // Cho phép sửa dòng dữ liệu
          };
          
          // 3. Định dạng ngày tháng cố định format để tránh hiển thị sai tùy máy
          if (colNumber === 5) {
            cell.numFmt = 'yyyy-mm-dd hh:mm:ss';
          }
        });

        await row.commit(); // Giải phóng bộ nhớ cho mỗi dòng (Quan trọng trong Streaming)
    }

    // Kết thúc ghi file
    await workbook.commit();
    console.log('Export hoàn tất!');
  }

  /**
   * 2. IMPORT STREAMING & XỬ LÝ LỖI DÒNG
   * Đọc file theo Stream để tránh Memory Leak.
   */
  static async importLargeFile(inputPath: string) {
    const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(inputPath, {});
    
    let rowIndex = 0;
    const results = [];
    const errors = [];

    // Đọc từng row theo stream
    for await (const worksheetReader of workbookReader) {
      for await (const row of worksheetReader) {
        rowIndex = row.number;
        
        // Bỏ qua dòng Header
        if (rowIndex === 1) continue;

        try {
          // 5. Xử lý Logic Validation từng dòng
          const data = {
            id: row.getCell(1).value,
            name: row.getCell(2).value,
            // 1. CHỐNG MẤT SỐ 0 ĐẦU: 
            // Luôn đọc dưới dạng String bằng .text hoặc kiểm tra kiểu
            phone: row.getCell(3).text?.trim(), 
            status: row.getCell(4).value,
            date: row.getCell(5).value
          };

          // Ví dụ validate:
          if (!data.phone || data.phone.length < 10) {
            throw new Error('Số điện thoại không hợp lệ (Phải >= 10 số)');
          }

          results.push(data);
        } catch (err: any) {
          // 5. Ghi nhận lỗi nhưng không dừng tiến trình
          errors.push({
            row_index: rowIndex,
            error_message: err.message
          });
        }
      }
    }

    return { total: results.length, data: results, errors };
  }

  /**
   * 3. MẸO XỬ LÝ DATE & TIMEZONE
   * Khi ghi Date vào Excel, Excel lưu dưới dạng số thực (Serial Number).
   * Để đảm bảo không bị lệch ngày:
   * A. Sử dụng ISO String nếu chỉ cần text.
   * B. Sử dụng Date object + numFmt 'yyyy-mm-dd'.
   */
}

// Ví dụ thực thi:
// ExcelService.exportLargeFile('./template_export.xlsx');
