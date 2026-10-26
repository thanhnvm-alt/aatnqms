# Tích Hợp 3 Loại Kiểm Tra SQC Vào Quy Trình Book QC & Nghiệm Thu Gia Công

Quy hoạch và bổ sung 3 phân loại SQC chuẩn hóa: **SQC - Vật tư ngoài (`SQC_VT`)**, **SQC - Bán Thành Phẩm (`SQC_BTP`)**, và **SQC - Thành phẩm (`SQC_TP`)** vào quy trình tạo yêu cầu Book QC, hiển thị trực quan trong sổ theo dõi và tự động điều hướng sang biểu mẫu kiểm tra chuyên sâu tương ứng khi QC thực hiện nghiệm thu.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Dựa trên phản hồi làm rõ từ người dùng:
> - **Hình thức lựa chọn**: Sử dụng nhóm nút chọn Radio nổi bật kèm nhãn và mô tả rõ ràng trực tiếp trên Modal Tạo/Sửa phiếu Book QC.
> - **Kích hoạt biểu mẫu khi QC kiểm tra**: Khi nhân viên QC bấm thực hiện kiểm tra từ danh sách, hệ thống sẽ mở trực tiếp biểu mẫu kiểm tra SQC chuyên sâu tương ứng (`InspectionFormSQC_VT`, `InspectionFormSQC_BTP`, `InspectionFormSQC_TP`) được điền sẵn đầy đủ dữ liệu PO, xưởng vệ tinh, địa chỉ, tài liệu kỹ thuật và danh sách hạng mục.
> - **Dữ liệu hiện có**: Các đơn đặt lịch đã có từ trước sẽ được gán mặc định là **SQC - Bán Thành Phẩm (`SQC_BTP`)**.

---

### 1. Tổng Quan & Mục Tiêu Nghiệp Vụ

- **Đối tượng sử dụng**: Chuyên viên Mua hàng/Quản lý thầu phụ (tạo yêu cầu book lịch) và Nhân viên QC phụ trách gia công ngoài (tiếp nhận lịch, tới xưởng vệ tinh nghiệm thu chất lượng).
- **Vấn đề giải quyết**: Trước đây quy trình book QC chưa phân định rõ tính chất hàng gia công (vật tư thô, phôi mộc/bán thành phẩm hay thành phẩm hoàn thiện), dẫn đến biểu mẫu kiểm tra chưa bám sát tiêu chí checklist ISO đặc thù của từng loại sản phẩm.
- **Giá trị mang lại**: 
  1. Chuẩn hóa phân loại ngay từ khâu đặt lịch.
  2. Kích hoạt đúng biểu mẫu kỹ thuật tương ứng với đầy đủ tiêu chí checklist:
     - **SQC - Vật tư ngoài (`SQC_VT`)**: Kiểm tra quy cách vật tư, chứng chỉ xuất xưởng, độ ẩm, độ dày, bề mặt nguyên vật liệu đầu vào.
     - **SQC - Bán Thành Phẩm (`SQC_BTP`)**: Kiểm tra mộng ghép, dán cạnh, chà nhám, kết cấu khung thô, kích thước hình học trước khi sơn/hoàn thiện.
     - **SQC - Thành phẩm (`SQC_TP`)**: Kiểm tra màng sơn, phụ kiện lắp đặt, độ bóng, màu sắc theo mẫu duyệt, bao che đóng gói giao hàng.
  3. Đồng bộ dữ liệu xuyên suốt từ Book QC $\rightarrow$ Phiếu Kiểm Tra $\rightarrow$ Biên bản nghiệm thu và Báo cáo kiểm định.

---

### 2. Trải Nghiệm Người Dùng (UX) & Thiết Kế Giao Diện

```
┌────────────────────────────────────────────────────────────────────────┐
│ MODAL: TẠO YÊU CẦU BOOK QC NGHIỆM THU GIA CÔNG                         │
├────────────────────────────────────────────────────────────────────────┤
│ [LOẠI HÌNH NGHIỆM THU SQC (*)]                                         │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐ │
│ │ (•) SQC - VẬT TƯ     │ │ ( ) SQC - BÁN TP     │ │ ( ) SQC - TP     │ │
│ │     NGOÀI            │ │     Bán thành phẩm,  │ │     Thành phẩm   │ │
│ │     Gỗ thô, ván,     │ │     khung thô, phôi  │ │     hoàn thiện,  │ │
│ │     ngũ kim, phụ kiện│ │     kết cấu gỗ/sắt   │ │     sơn, bọc nệm │ │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────┘ │
│                                                                        │
│ [PO / HỢP ĐỒNG ERP]             [XƯỞNG VỆ TINH / NHÀ CUNG CẤP]         │
│ PO-2026-0891                     Xưởng Gỗ Hoàng Gia Bình Dương         │
│                                                                        │
│ [HẠNG MỤC GIA CÔNG]             [NGÀY NGHIỆM THU (THEO MỐC 15:00)]     │
│ Tủ âm tường MFC Melamine - 10 Bộ Ngày mốt (25/10/2026)                 │
│                                                                        │
│ [HỒ SƠ KỸ THUẬT: SPEC, MẪU DUYỆT, BẢN VẼ, MOU]                         │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Khâu Tạo / Sửa Yêu Cầu Book QC**:
   - Thêm bộ chọn Radio 3 cột nổi bật ngay đầu form với visual token màu sắc chuyên nghiệp:
     - `SQC_VT`: Tông màu lục bảo / Emerald (`border-emerald-500`, icon vật liệu).
     - `SQC_BTP`: Tông màu xanh lam / Indigo (`border-blue-500`, icon khung kết cấu).
     - `SQC_TP`: Tông màu tím violet / Purple (`border-purple-500`, icon hộp thành phẩm).
   - Hiển thị mô tả phụ ngắn gọn bên dưới mỗi loại giúp chuyên viên Mua hàng chọn đúng ngay lập tức.
   - Khi chỉnh sửa phiếu Book QC, cho phép điều chỉnh lại loại SQC đã chọn.

2. **Khâu Quản Lý Danh Sách & Bảng Sổ Lịch**:
   - Thêm cột / nhãn hiển thị loại SQC rõ ràng trên từng dòng booking.
   - Thêm bộ lọc danh sách theo Loại SQC (Tất cả / Vật tư ngoài / Bán thành phẩm / Thành phẩm).

3. **Khâu Kích Hoạt Form Kiểm Tra (QC Action)**:
   - Nút hành động **"Nghiệm Thu Tại Xưởng"** trên dòng booking:
     - Tự động nhận diện `sqcType` của booking.
     - Chuyển hướng trực tiếp sang biểu mẫu:
       - `SQC_VT` $\rightarrow$ `InspectionFormSQC_VT`
       - `SQC_BTP` $\rightarrow$ `InspectionFormSQC_BTP`
       - `SQC_TP` $\rightarrow$ `InspectionFormSQC_TP`
     - Tự động điền đầy đủ dữ liệu gốc: PO, tên xưởng vệ tinh, địa chỉ, người liên hệ, SĐT, danh sách hạng mục, liên kết hồ sơ kỹ thuật (Spec, Mẫu duyệt, Bản vẽ).
     - Nút "Hủy bỏ / Quay lại" trên form kiểm tra sẽ điều hướng mượt mà trở lại Sổ Book QC (`SUBCONTRACTOR_BOOKING`).
     - Khi QC lưu phiếu kiểm tra thành công, cập nhật trạng thái Booking sang `COMPLETED` hoặc `IN_PROGRESS`.

---

### 3. Kiến Trúc Kỹ Thuật & Luồng Dữ Liệu

```
┌─────────────────────────────────┐
│     SubcontractorBooking        │
│  - id, bookingCode              │
│  - sqcType: 'SQC_VT' |          │
│             'SQC_BTP' |         │
│             'SQC_TP'            │
│  - poNumber, supplierName       │
│  - items, documents             │
└───────────────┬─────────────────┘
                │
                │ QC clicks "Nghiệm Thu Tại Xưởng"
                ▼
┌─────────────────────────────────┐
│     App.tsx Router Bridge       │
│  - Maps booking to initialData  │
│  - Sets active inspection type  │
│  - Sets view = 'FORM'           │
└───────────────┬─────────────────┘
                │
       ┌────────┼────────┐
       ▼        ▼        ▼
┌────────────┐ ┌────────────┐ ┌────────────┐
│ FormSQC_VT │ │FormSQC_BTP │ │ FormSQC_TP │
│ Vật tư     │ │ Bán TP     │ │ Thành phẩm │
└────────────┘ └────────────┘ └────────────┘
```

#### Chi tiết thay đổi:
1. **`types.ts`**:
   - Mở rộng interface `SubcontractorBooking`: bổ sung thuộc tính `sqcType?: 'SQC_VT' | 'SQC_BTP' | 'SQC_TP'`.
   - Bổ sung helper metadata: tên hiển thị tiếng Việt, mô tả phụ, màu sắc và icon tương ứng.

2. **`components/SubcontractorBookingManagement.tsx`**:
   - Thêm `sqcType` vào state `newBooking` và `editBooking` (mặc định `'SQC_BTP'`).
   - Cung cấp component nhóm Radio 3 lựa chọn trực quan trong Create Modal và Edit Modal.
   - Thêm cột và nhãn hiển thị loại SQC trên bảng Bookings.
   - Thêm callback `onStartInspection: (booking: SubcontractorBooking) => void` vào props của `SubcontractorBookingManagement`.
   - Kết nối nút "Nghiệm Thu Tại Xưởng" để gọi `onStartInspection(booking)`.

3. **`App.tsx`**:
   - Truyền handler `onStartInspection` vào `<SubcontractorBookingManagement currentUser={user} />`.
   - Handler chuẩn bị `initialFormState` với dữ liệu lấy từ `booking` và thiết lập `type: booking.sqcType || 'SQC_BTP'`.
   - Đảm bảo khi lưu hoặc hủy trên form SQC, người dùng được quay về màn hình `SUBCONTRACTOR_BOOKING` nếu phiên kiểm tra bắt nguồn từ booking.

4. **Kiểm tra và biên dịch**:
   - Chạy `compile_applet` và `lint_applet` để đảm bảo không có lỗi type hoặc runtime.
