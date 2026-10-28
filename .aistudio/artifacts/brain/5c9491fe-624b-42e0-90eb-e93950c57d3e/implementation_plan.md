# Kế hoạch Thực hiện: Thông Báo Phân Công QC & Tự Động Điền Form Nghiệm Thu SQC

## 🎯 Mục tiêu
1. **Gửi Thông Báo & Popup Nhắc Nhở Phân Công QC**:
   - Khi Admin / Quản lý thực hiện **Phân Công QC** cho phiếu Booking:
     - Tạo thông báo mới trong Notification Center cho QC được chỉ định.
     - Hiển thị Popup thông báo nhắc nhở phân công trực tiếp ngay khi tài khoản QC đăng nhập vào hệ thống.
2. **Tự Động Điền Dữ Liệu vào Form Nghiệm Thu SQC**:
   - Khi người dùng bấm nút **Nghiệm Thu** trên phiếu Book QC:
     - Tự động trích xuất thông tin Booking và điền đầy đủ các ô tương ứng trong Form kiểm tra SQC (`inspectionformSQC_VT.tsx`, `inspectionformSQC_BTP.tsx`, `inspectionformSQC_TP.tsx`):
       - **Mã PO / PR / Chứng từ**: `b.poNumber`
       - **Nhà thầu / Cung cấp**: `b.supplierName`
       - **Địa chỉ xưởng khảo sát**: `b.locationAddress`
       - **Ngày kiểm tra**: Ngày hiện tại hoặc `b.requestedDate`
       - **Bảng danh sách hạng mục cần kiểm**: Tự động điền danh sách sản phẩm/hạng mục (`itemName`, `quantity`, `unit`, `specifications`) từ Booking sang bảng chi tiết kiểm tra hạng mục trong Form.
       - **Hồ sơ kỹ thuật**: Ánh xạ link Spec vật tư, Mẫu duyệt, Shopdrawing, Biên bản thống nhất.

---

## 📋 Chi tiết Các Bước Thực Hiện

### 1. Xử lý Phân Công & Gửi Thông Báo QC (`SubcontractorBookingManagement.tsx` & `dbService.ts`)
- Khi bấm **Xác Nhận Phân Công**:
  - Gửi yêu cầu lưu thông báo vào database: `createNotification({ userId, title, message, type: 'ASSIGNMENT' })`.
  - Thiết lập cờ `showQcAssignmentPopup` cho tài khoản QC để kích hoạt Popup nhắc nhở công việc phân công mới khi QC đăng nhập.

### 2. Xử lý Tự Động Điền Form Nghiệm Thu SQC
- Cập nhật hàm `onStartInspection(b)` / `handleStartInspection`:
  - Trích xuất dữ liệu phiếu Booking `b`.
  - Ánh xạ sang cấu hình khởi tạo của Form Nghiệm thu SQC:
    ```typescript
    initialData = {
      poNumber: b.poNumber,
      supplierName: b.supplierName,
      supplierAddress: b.locationAddress,
      inspectionDate: new Date().toISOString().slice(0, 10),
      items: b.items.map(item => ({
        itemName: item.itemName,
        quantity: item.quantity,
        unit: item.unit,
        specifications: item.specifications,
        checkStatus: 'PASS'
      })),
      documents: b.documents
    }
    ```
  - Chuyển hướng người dùng thẳng tới Form nghiệm thu SQC tương ứng với dữ liệu đã được điền sẵn 100%.

---

## 🔍 Kiểm tra & Xác minh (Verification)
1. Thử phân công một phiếu Book QC cho chuyên viên QC -> Mở Notification Center thấy thông báo mới và đăng nhập lại tài khoản QC để kiểm tra Popup nhắc nhở.
2. Bấm nút **Nghiệm Thu** trên phiếu Book QC -> Mở Form kiểm tra SQC và kiểm tra Mã PO, Nhà thầu, Địa chỉ và Danh sách hạng mục đã được tự động điền sẵn đầy đủ.
3. Chạy `compile_applet` và `lint_applet` để xác minh không có lỗi biên dịch.
