# Project Instructions
# 📜 QMS SYSTEM POLICIES & RULES (OFFICIAL)

> **Phiên bản**: 3.1.0 (Bổ sung quy tắc Read-only)
> **Dự án**: QMS Webapp
> **Single Source of Truth**: Backend & PostgreSQL

---

## 1. NGUYÊN TẮC HỆ THỐNG (SYSTEM PRINCIPLES)

* **Server-Authoritative**: Backend kiểm soát 100% logic, workflow và phân quyền.
* **ISO Traceability**: Mọi biến động dữ liệu nghiệp vụ phải được ghi log vĩnh viễn.
* **Stateless API**: Sử dụng JWT Bearer. Không lưu session cục bộ trên Server.

---

## 2. CHÍNH SÁCH DỮ LIỆU & DB (DATABASE POLICIES)

### 2.1 Quản lý hạ tầng (Externalized Management)

* **KHÔNG** kiểm tra/tạo schema hoặc extension (`pgcrypto`). Hạ tầng được quản lý độc lập.
* **UUID**: Bắt buộc cho mọi Primary Key.
* **Unix Timestamp (BIGINT)**: Dùng cho mọi trường ngày tháng để đồng bộ hóa.

### 2.2 Quy tắc bảng Read-only (MANDATORY)

* **Bảng `ipo` (Đơn hàng sản xuất) & `material` (Nguyên vật liệu)**:
* **Trạng thái**: **READ-ONLY** tuyệt đối.
* **Hành vi**: KHÔNG được phép `INSERT`, `UPDATE`, `DELETE` hoặc tác động làm thay đổi dữ liệu trong 2 bảng này từ ứng dụng QMS.
* **Mục đích**: Chỉ sử dụng để **liên kết dữ liệu** (Join) và tham chiếu thông tin khi lập phiếu Inspection, NCR hoặc CAPA.
* **Ràng buộc**: Mọi chỉnh sửa trên 2 bảng này phải được thực hiện từ hệ thống nguồn (ERP/External Source) và đồng bộ về theo luồng riêng.



### 2.3 Nhật ký & Xóa mềm

* **Audit Trail**: Nhật ký truy vết là bất biến (Append-only).
* **Soft Delete**: Sử dụng cột `deleted_at` cho các bảng nghiệp vụ (`inspections`, `ncr`, `capa`).

---

## 3. TYPOGRAPHY & DESIGN TOKENS (UI/UX STANDARD)

| Loại | Token/Giá trị | Mô tả |
| --- | --- | --- |
| **Font Sans** | **Inter** | Dùng cho văn bản thường, label, paragraph. |
| **Font Mono** | **JetBrains Mono** | Dùng cho mã code, UUID, số tabular, log. |
| **Baseline Size** | `text-sm` (14px) | Baseline cho body, form, sidebar. |
| **H1 Title** | `text-2xl` (24px) | Uppercase, font-bold, tracking-tight. |
| **Weight** | 400, 500, 600, 700 | KHÔNG dùng font-light (300). |

**Màu sắc nghiệp vụ (Semantic Colors):**

* `brand` (#2563EB), `success` (#16A34A), `warning` (#F97316), `danger` (#DC2626), `info` (#0891B2).
* **Neutral**: Slate scale (50-900).

---

## 4. QUY TRÌNH TRẠNG THÁI (STATE MACHINE)

Hệ thống ép buộc workflow qua Backend:

* **Inspection**: `draft` → `submitted` → `approved/rejected` → `verified` → `locked`
* **NCR**: `open` → `assigned` → `corrected` → `verified` → `closed`
* **Locked = Immutable**: Khi đạt trạng thái cuối, cấm mọi hành vi chỉnh sửa.

---

## 5. BỘ COMPONENT & API (DEVELOPMENT RULES)

* **Backend**:
* **Signed URL Flow**: Cấm lưu Base64. Upload ảnh qua Signed URL lên Storage.
* **Optimistic Locking**: Dùng cột `version` để xử lý xung đột (Server Wins).


* **Frontend (Bắt buộc dùng Component chuẩn)**:
* `<Combobox>` (Filter/Dropdown), `<ConfirmDialog>` (Xác nhận hành động), `<PageActions>` (Header trang), `<Pagination>` (Phân trang).
* **Table Density**: Mặc định `Comfortable`. Padding `px-3 py-2.5`.



---

## 6. QUY TẮC ĐẶT TÊN (NAMING)

* **Database**: `snake_case`.
* **Entity Codes**: `QMS-INS-...`, `QMS-NCR-...`, `QMS-CPA-...`.
* **Audit Log**: Snapshot dữ liệu cũ/mới lưu trong trường `JSONB`.

---

## 7. AN NINH (SECURITY)

* **RBAC**: Kiểm tra quyền tại Middleware của Backend.
* **Audit Gate**: Tính năng mới không được release nếu thiếu logic ghi log Audit.
* **No Bypass**: Không nhảy cóc quy trình ISO.

---

> **Lưu ý cuối cho các Agent**: Quy tắc về bảng **Read-only (IPO, Material)** là tối thượng. Bất kỳ đoạn mã nào cố gắng thực hiện hành vi ghi (Write) vào hai bảng này sẽ bị coi là lỗi bảo mật nghiêm trọng và phải được loại bỏ ngay lập tức.

---
