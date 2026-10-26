# Sửa Lỗi Đăng Nhập Tài Khoản Mới & Khôi Phục Mật Khẩu Mặc Định 123456

Tự động gán và mã hóa Bcrypt cho mật khẩu mặc định `123456` đối với tất cả người dùng mới được tạo hoặc import, đồng thời khôi phục mật khẩu mặc định cho các tài khoản đã tạo trước đây chưa đăng nhập được.

### User Review & Critical Decisions

> [!IMPORTANT] Các quyết định đã được xác nhận thông qua câu hỏi làm rõ (Phase 1):

- **Tạo người dùng mới**: Hệ thống tự động gán mật khẩu mặc định `123456`, mã hóa Bcrypt và bật cờ `require_password_change = true` ép người dùng đổi mật khẩu lần đầu.
- **Tài khoản đã tạo từ trước**: Tự động quy chuẩn và khôi phục mật khẩu `123456` (đã mã hóa Bcrypt) cho toàn bộ tài khoản chưa đăng nhập/chưa đổi mật khẩu trong Database.

---

### 1. Overview & Core Concept

- **Mục tiêu**: Đảm bảo 100% người dùng mới (được thêm từ giao diện Quản lý người dùng hoặc Import Excel) có thể đăng nhập ngay lần đầu bằng mật khẩu mặc định `123456`, sau đó được chuyển tiếp mượt mà sang Modal đổi mật khẩu khẩn cấp trước khi vào hệ thống.
- **Nguyên nhân cốt lõi**:
  1. Trong hàm `saveUser`, khi tạo user mà không truyền chuỗi password, mật khẩu `123456` bị gán ở dạng chuỗi thuần (Plain Text) mà bỏ qua bước mã hóa `bcrypt.hash()`, khiến quá trình so sánh hash Bcrypt lúc đăng nhập thất bại.
  2. Một số tài khoản import từ file Excel chưa có hash Bcrypt chuẩn hoặc cờ `require_password_change` bị thiếu.

---

### 2. User Experience & Visual Design

- **Luồng Đăng Nhập Lần Đầu (First-Time Login Flow)**:
  1. Người dùng nhập Mã nhân viên / Username và mật khẩu mặc định `123456`.
  2. Hệ thống xác thực hash Bcrypt thành công và kiểm tra thấy cờ `requirePasswordChange = true`.
  3. Màn hình tự động bật **Modal Ép Đổi Mật Khẩu Lần Đầu** (có kiểm tra độ phức tạp: tối thiểu 6 ký tự, gồm cả chữ hoa và chữ thường).
  4. Sau khi đổi mật khẩu thành công, cờ `requirePasswordChange` tự động chuyển thành `false` và đăng nhập trực tiếp vào hệ thống QMS.

---

### 3. Key Product Decisions & Trade-Offs

- **Quyết định 1: Chuẩn hóa logic băm mật khẩu trong `saveUser`**:
  - *Phương án chọn*: Dù người dùng mới được khởi tạo từ form lẻ hay import hàng loạt, nếu mật khẩu chưa ở dạng băm Bcrypt (`$2b$` hoặc `$2a$`), backend tự động băm `bcrypt.hash(password, 10)` trước khi lưu vào database PostgreSQL.
  - *Lý do*: Đảm bảo an toàn bảo mật ISO QMS và đồng bộ tuyệt đối với logic xác thực của `/api/auth/login`.

- **Quyết định 2: Script tự động Migration / Tái tạo Hash cho User cũ**:
  - *Phương án chọn*: Khi Server khởi động, kiểm tra và cập nhật lại hash Bcrypt của `123456` cho tất cả tài khoản chưa có hash hợp lệ hoặc chưa đăng nhập.
  - *Lý do*: Giúp tất cả người dùng hiện tại bị lỗi có thể ngay lập tức dùng `123456` đăng nhập mà không cần xóa database hay tạo lại từ đầu.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────┐          ┌───────────────────────────┐          ┌───────────────────────────┐
│   LoginPage Component   │ ────────>│   /api/auth/login (JWT)   │ ────────>│    dbService / PostgreSQL │
│                         │          │                           │          │                           │
│ - Input: User & 123456  │          │ - bcrypt.compare()        │          │ - Check username & hash   │
│ - Force Change Modal    │          │ - Verify requireChange    │          │ - Update password on reset│
└─────────────────────────┘          └───────────────────────────┘          └───────────────────────────┘
```

- **Sửa đổi chính trên Codebase**:
  1. `services/dbService.ts` (`saveUser` & `batchImportUsers`): Đảm bảo mã hóa Bcrypt 100% trường hợp mật khẩu mặc định `123456`.
  2. `server.ts`: Thêm tự động script sửa lỗi mật khẩu người dùng chưa đăng nhập khi server startup.
