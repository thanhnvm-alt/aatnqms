# Kế hoạch triển khai (Đã cập nhật): Nạp danh sách người dùng từ file Excel/CSV vào hệ thống QMS

## 1. Mục tiêu & Yêu cầu nghiệp vụ (Đã điều chỉnh theo phản hồi)
Hệ thống cho phép Quản trị viên tải file Excel/CSV (chứa thông tin nhân sự thực tế từ tệp bảng tính của công ty) trực tiếp từ giao diện **Cài đặt > Nhân sự hệ thống**.

### Các nguyên tắc xử lý dữ liệu:
1. **Hình thức nhập**: Tải file Excel trực tiếp qua nút "Nhập từ Excel" trong module Quản lý người dùng.
2. **Quy tắc Tên đăng nhập (Username)**: Sử dụng toàn bộ địa chỉ Email (ví dụ: `thanhnvm@aacorporation.com`). Trường hợp dòng không có Email, sử dụng Mã nhân viên (`UserID`, ví dụ: `AAF12122`).
3. **Quy tắc Vai trò & Ma trận phân quyền (ĐIỀU CHỈNH CHÍNH)**:
   - **KHÔNG** tự động phân loại vai trò dựa trên chức vụ hay phòng ban.
   - **Quyền mặc định**: Thiết lập ma trận phân quyền tối thiểu an toàn:
     - `role`: `'QC'` (hoặc vai trò nhân sự tiêu chuẩn)
     - `allowedModules`: `['LIST']`
     - `user_permissions` (Ma trận phân quyền chi tiết): `[{ moduleId: 'LIST', actions: ['VIEW'] }]` (Chỉ được phép **XEM** module Danh sách phiếu).
   - Sau khi nạp thành công, Quản trị viên sẽ sử dụng bảng **Ma trận phân quyền hệ thống** để phân bổ quyền tác vụ chuyên sâu cho từng cá nhân hoặc bộ phận.
4. **Ánh xạ cột theo biểu mẫu Excel công ty**:
   - `Employee` / `First and last names` ➔ Họ và tên (`name`)
   - `UserID` ➔ Mã nhân viên (`msnv`)
   - `Email` ➔ Email (`email`) & Tên đăng nhập (`username`)
   - `Position` ➔ Chức vụ lưu trữ (`position`)
   - `Department` ➔ Chuỗi phòng ban phân cấp (`phong_ban`, tách bộ phận `bo_phan`)
   - `Mobile` / `Work phone` ➔ Số điện thoại ghi chú (`phone` / `notes`)
   - `Date registered` ➔ Ngày nhận việc (`joinDate`)
   - `City` ➔ Nơi làm việc (`workLocation`)
   - Mật khẩu khởi tạo: mặc định `123456` kèm cờ `requirePasswordChange: true`.

---

## 2. Các bước triển khai chi tiết

### Bước 1: Bổ sung API Batch Import trên Backend (`server.ts` & `services/dbService.ts`)
- Thêm route `POST /api/users/batch-import` có kiểm tra quyền quản trị (`SYSTEM_ADMIN`).
- Xử lý nạp hàng loạt (Batch upsert) nhanh chóng, ghi nhận Audit Log ISO cho hành động `IMPORT_USERS`.

### Bước 2: Nâng cấp bộ phân tích Excel trong `components/UserManagement.tsx`
- Hỗ trợ đầy đủ các tiêu đề cột tiếng Anh và tiếng Việt trong file thực tế (`Employee`, `UserID`, `Department`, `Position`, `Date registered`, `Mobile`, `City`, `Email`, v.v.).
- Thiết lập cứng ma trận quyền mặc định cho mọi tài khoản nhập mới: chỉ có quyền `VIEW` trên module `LIST`.
- Định dạng ngày tháng, chuẩn hóa email chữ thường và lọc bỏ dòng trống.

### Bước 3: Modal Xem trước & Xác nhận (Preview Modal)
- Hiển thị bảng xem trước các nhân sự tìm thấy trước khi ghi vào CSDL.
- Báo rõ trạng thái phân quyền ban đầu: *"Mặc định: Chỉ xem danh sách phiếu (LIST: VIEW)"*.
- Hiển thị nút xác nhận nạp và thanh tiến trình trong lúc xử lý.

### Bước 4: Kiểm tra & Xác nhận hoàn tất
- Biên dịch ứng dụng (`compile_applet`), kiểm tra không có lỗi lint/types.
