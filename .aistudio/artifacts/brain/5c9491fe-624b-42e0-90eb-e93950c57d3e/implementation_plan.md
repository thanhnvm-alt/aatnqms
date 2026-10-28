# Kế Hoạch Sửa Lỗi Phân Quyền Tổ Trưởng Khống Duyệt Được Báo Cáo Của Nhóm

Khắc phục triệt để sự cố Tổ trưởng (`la_to_truong = true`) bị chặn không duyệt được báo cáo của các nhân viên thuộc nhóm mình do lỗi khớp chuỗi dữ liệu Tổ/Nhóm (`team_id` / `to_qc`) và tìm kiếm tài khoản người lập phiếu (`inspectorName` / `created_by`).

### User Review & Critical Decisions

> [!IMPORTANT] Xác nhận từ câu hỏi làm rõ (Phase 1):

- **Phạm vi duyệt**: Tổ trưởng chỉ có quyền ký duyệt Level 1 (`SIGN1`) đối với các phiếu do nhân viên thuộc cùng Tổ/Nhóm (`team_id` hoặc `to_qc`) tạo ra.
- **Cơ chế cấp quyền**: Quản trị viên (Admin) sẽ chủ động phân quyền hành động `SIGN1` cho Tổ trưởng trong ma trận phân quyền người dùng (User Permissions Matrix).

---

### 1. Overview & Core Concept

- **Mục tiêu**: Giúp các Tổ trưởng sau khi được cấp cờ `la_to_truong = true` và quyền `SIGN1` có thể thấy nút ký duyệt Level 1 và ký duyệt thành công tất cả phiếu báo cáo do thành viên trong cùng Tổ/Nhóm lập.
- **Nguyên nhân cốt lõi**:
  1. Trong component `TwoTierApproval.tsx`, logic khớp người tạo phiếu `users.find(u => u.name === inspection.inspectorName)` chỉ so sánh khớp tuyệt đối theo `u.name`. Khi phiếu lưu `username`, `msnv` hoặc mã định danh khác, hệ thống không tìm thấy `creatorUser` và lập tức trả về `isAuthorizedTeam = false`.
  2. Việc so sánh `team_id` và tên Tổ `to_qc` chưa xử lý làm sạch chuỗi (trims, lowercase, bỏ dấu Tiếng Việt), làm mất hiệu lực xác thực nếu người lập phiếu và Tổ trưởng ghi tên Tổ lệch nhau (ví dụ: "Tổ PQC 1" vs "Tổ 1 PQC").
  3. Cần bổ sung tra cứu người tạo phiếu mở rộng theo `inspection.created_by`, `inspection.inspectorName`, `inspection.inspector` qua `id`, `username`, `msnv`, hoặc `name`.

---

### 2. User Experience & Visual Design

- **Giao diện Tổ Trưởng khi xem báo cáo của Nhóm**:
  - Khi Tổ trưởng vào chi tiết phiếu của nhân viên cùng Tổ, nút **"Ký duyệt (Cấp 1 - Tổ trưởng)"** hiển thị rõ ràng, không bị mờ hay ẩn.
  - Trường hợp không đúng Tổ/Nhóm, hiển thị cảnh báo giải thích rõ lý do: *"Chỉ Tổ trưởng của [Tên Tổ QC] mới có quyền ký duyệt phiếu này"*.

---

### 3. Key Product Decisions & Trade-Offs

- **Quyết định 1: Chuẩn hóa hàm kiểm tra thẩm quyền Tổ/Nhóm (`isAuthorizedTeam`)**:
  - *Phương án chọn*: Tra cứu linh hoạt người tạo phiếu theo `id`, `username`, `msnv`, `name` đối chiếu với `inspection.inspectorName`, `inspection.created_by`, `inspection.inspector`. So sánh `team_id` và tên `to_qc` có chuẩn hóa bỏ dấu & viết thường.
  - *Lý do*: Tránh lỗi sai lệch do định dạng dữ liệu tạo phiếu khác nhau giữa các module QC.

- **Quyết định 2: Hỗ trợ Admin dễ dàng gán quyền `SIGN1` trong Ma trận Phân Quyền**:
  - *Phương án chọn*: Trong giao diện `UserManagement.tsx`, đảm bảo khi chỉnh sửa quyền người dùng, các nút checkbox hành động `SIGN1` (Duyệt L1) cho từng module QC hiển thị trực quan, dễ thao tác.

---

### 4. Technical Architecture & Data Strategy

```
┌───────────────────────────────────┐
│     TwoTierApproval Component     │
│                                   │
│  - resolveCreatorUser()           │ (Khớp id/username/msnv/name)
│  - normalizeTeamString()          │ (Chuẩn hóa "Tổ PQC 1" -> "to pqc 1")
│  - isAuthorizedTeam (Boolean)     │ (Đúng Tổ -> Mở nút Ký duyệt L1)
└───────────────────────────────────┘
```

- **Sửa đổi chính trên Codebase**:
  1. `/components/TwoTierApproval.tsx`: Tối ưu logic `isAuthorizedTeam` và `hasSignPermission('SIGN1')`.
  2. `/components/UserManagement.tsx`: Đảm bảo gán quyền `SIGN1` lưu chuẩn vào `user_permissions` JSON trong DB PostgreSQL.
