# BÁO CÁO KIỂM TOÁN TUÂN THỦ INSTRUCTION HỆ THỐNG, QUY TRÌNH & 13 MODULE — QMS v3.1.0

- **Tài liệu chuẩn đối chiếu:** `/AGENTS.md` (Bản nâng cấp: Bộ lệnh điều hướng tối cao, 3 Nguyên tắc cốt lõi, Kiến trúc & Chiến lược dữ liệu, State Machine, Quy chuẩn UX/UI, Đặc tả 13 Module `M00–M12`, Quy trình TDD Dual-Gate 5 Giai đoạn)
- **Phạm vi kiểm toán:** Chỉ đọc (Read-only Audit) toàn bộ tài liệu chỉ dẫn, tầng Backend API/PostgreSQL, tầng Frontend App Shell và cả **13 Module (`M00` – `M12`)**
- **Giới hạn thực thi:** Báo cáo đánh giá bằng văn bản + Lộ trình khắc phục 4 giai đoạn (không sửa đổi mã nguồn, database hay giao diện)
- **Ngày lập báo cáo:** `2026-11-17`

---

## 1. Tóm tắt điều hành & Bảng điểm toàn hệ thống

Sau khi đối chiếu phiên bản `AGENTS.md` mới nhất với toàn bộ hệ thống QMS v3.1.0 đang vận hành:
- **Điểm sáng nổi bật:** Ràng buộc tối thượng **Read-Only trên 2 bảng `ipo` và `material`** được bảo vệ triệt để ở Backend; phân hệ **M03 (`SubcontractorBookingManagement.tsx`)** là hình mẫu duy nhất áp dụng đủ cả **5 Component chuẩn (`/src/components/qms/`)** và **Optimistic Locking (`version`)**; `index.html` nạp đúng `Inter` & `JetBrains Mono` và các biểu mẫu mới đã chuẩn hóa kích thước vùng chạm `min-h-[44px]`.
- **Rủi ro hệ thống trọng yếu:** Hạ tầng xác thực **JWT & RBAC Server-Authoritative bị hở trên diện rộng** (chỉ 1 route Auth kiểm tra đăng nhập nhưng lại cho phép truyền `userId` qua body để đổi mật khẩu hộ); nhiều bảng nghiệp vụ vẫn dùng **Hard Delete (`DELETE FROM`)**; **Optimistic Locking (`version`)** mới có ở 1/13 module; **State Machine** chưa được khóa chặt ở Backend cho cả `Inspection` lẫn `NCR`; tỷ lệ áp dụng bộ UI Kit `/src/components/qms/` trên 12 module còn lại là **0%**.

### Bảng tổng hợp mức độ tuân thủ theo Lĩnh vực

| Nhóm tiêu chuẩn (`AGENTS.md`) | Kết luận | Tỷ lệ / Mức độ | Điểm nghẽn chính |
| :--- | :---: | :---: | :--- |
| **Instruction & Quy trình TDD Dual-Gate (`AGENTS.md`)** | **ĐẠT MỘT PHẦN** | Nhất quán nội bộ ~90% | Tài liệu `docs/API.md` lỗi thời (ghi Turso thay vì PostgreSQL); danh sách Role trong `M11` thiếu `QC`, `QA`, `GUEST`; Gate 1/Gate 2 chưa có script kiểm chứng tự động |
| **Ràng buộc Read-Only (`ipo`, `material`)** | **ĐẠT** *(Backend)* | 100% SQL Read-Only | 0 câu lệnh ghi lên `ipo`/`material`; **nhưng** UI `MaterialManagement` & `IPOPage` vẫn hiển thị nút Thêm/Sửa/Xóa/Import gây lỗi `403` |
| **Bảo mật JWT & RBAC Server-Authoritative** | **KHÔNG ĐẠT** | **[CRITICAL]** | Middleware `/api` không chặn request thiếu JWT; `change-password` nhận `req.body.userId` không cần token; `forgot-password` trả `devCode` ra HTTP response |
| **PostgreSQL (`UUID`, `BIGINT`, `version`, Soft Delete)** | **KHÔNG ĐẠT** | **[CRITICAL]** | Chỉ `subcontractor_bookings` có `version`; Hard Delete xuất hiện tại `M02` (`floor_plans`), `M03` (`subcontractor_bookings`), `M09` (`tool_*`), `M10` (`ipo_sample_history`), `M11` (`roles`/`workshops`/`departments`); đa số PK chưa dùng `UUID` |
| **Audit Trail (`JSONB`) & File Storage (Signed URL)** | **KHÔNG ĐẠT** | **[HIGH]** | `M06` (NCR) và `M09` (CCDC) thiếu `writeAuditLog`; `M05` ghi thiếu snapshot; `/api/upload` lưu đĩa cục bộ và các form còn rò rỉ chữ ký/ảnh Base64 |
| **State Machine (`Inspection` & `NCR`)** | **KHÔNG ĐẠT** | **[CRITICAL]** | `Inspection` cho phép nhảy cóc, đảo L1/L2, `ADMIN` vượt rào `LOCKED` và ghi đè khi `LOCKED->LOCKED`; `NCR` chưa có backend state machine |
| **UX/UI Design Tokens & 5 Component chuẩn** | **KHÔNG ĐẠT** | 1/13 Module (`~8%`) | Chỉ `M03` dùng `/src/components/qms/`; 12 module còn lại dùng `<select>` thô, `alert`/`confirm`/`prompt`, tải 1.000–50.000 dòng về client lọc |

---

## 2. Đánh giá Instruction Hệ thống & Quy trình TDD Dual-Gate

### 2.1 Cấu trúc Instruction trong `AGENTS.md`
Bản `AGENTS.md` mới đã nâng cấp rõ rệt về kỷ luật kỹ thuật:
1. **3 Nguyên tắc cốt lõi (Mục 1):** *Memory First*, *No Assumption*, *Read-Only Mandate* (`ipo`, `material`, Soft Delete `deleted_at`).
2. **Kiến trúc & Dữ liệu (Mục 2):** Quy định rành mạch Server-Authoritative, Hydration API, `UUID`, `BIGINT`, `snake_case`, `version`, `JSONB` Audit Gate, Route + `returnView` (cấm lồng Modal), Signed URL (cấm Base64).
3. **13 Module Registry (Mục 5):** Bổ sung `M00. App Shell & Layout` bên cạnh `M01`–`M12`, giúp bao phủ toàn bộ vòng đời giao diện và xác thực.
4. **Quy trình TDD Dual-Gate 5 Giai đoạn (Mục 6):** Thiết lập 2 chốt chặn cứng (**Gate 1** duyệt kế hoạch trước khi code, **Gate 2** nghiệm thu trước khi ghi Changelog vào `AGENTS.md`).

### 2.2 Các điểm chưa khớp hoặc cần làm rõ trong hệ thống Instruction & Tài liệu

| Mã | Vấn đề phát hiện | Vị trí đối chiếu | Mức độ | Khuyến nghị chuẩn hóa |
| :--- | :--- | :--- | :---: | :--- |
| **[INS-01]** | **Tài liệu API bị lệch công nghệ (Stale Doc):** Mô tả hệ thống dùng *Turso (LibSQL)* và `/api/plans`, trái ngược hoàn toàn với PostgreSQL (`schema qms`) và 13 module thực tế | `docs/API.md:1-133` vs `AGENTS.md` §2 | **[MEDIUM]** | Cập nhật hoặc thay thế `docs/API.md` theo đúng kiến trúc PostgreSQL + JWT + 13 Module hiện hành |
| **[INS-02]** | **Số lượng Module & Tên Role chưa đồng nhất:** `M00` ghi *"Sidebar (12 modules)"* (đúng về số item sau đăng nhập nhưng dễ nhầm với 13 module); `M11` liệt kê 6 role (`ADMIN, QC_LEAD, QC_INSPECTOR, PURCHASING, VENDOR, MANAGER`) nhưng code đang dùng thêm `QC`, `QA`, `GUEST` | `AGENTS.md:73, 138` vs `types.ts:1`, `App.tsx:232`, `NCRDetail.tsx:66` | **[LOW]** | Chuẩn hóa bảng Role chính thức trong `M11` (ghi rõ trạng thái deprecated nếu loại bỏ `QC`/`QA` hoặc bổ sung `GUEST` cho link QR) |
| **[INS-03]** | **Ràng buộc "Đơn nhất" khi chạy song song Dual-Gate & AI Studio Planning:** `AGENTS.md` quy định dừng tại Gate 1 & Gate 2; khi kết hợp với `planning-mode`, cần giữ nguyên nguyên tắc chỉ xuất kế hoạch ở Gate 1 và kiểm toán chéo ở Giai đoạn 4 | `AGENTS.md` §6 | **[LOW]** | Giữ nguyên quy chuẩn hiện tại, bổ sung checklist kiểm tra tự động cho Giai đoạn 4 (`grep` cấm write `ipo`/`material`, cấm Hard `DELETE FROM`, cấm Base64) |
| **[INS-04]** | **Rác thư mục gốc & Tệp rule mồ côi:** Thư mục gốc `/` chứa hơn 60 script vá/kiểm tra tạm (`fix-*.js`, `patch-*.cjs`, `check-*.ts`, `test_*.js`) và mục `QMS SYSTEM POLICIES & RULES.md` không thể truy cập trực tiếp | Thư mục gốc `/` | **[LOW]** | Dọn dẹp hoặc gom script lịch sử vào `scripts/archive/` để tránh AI Agent đọc nhầm ngữ cảnh cũ |

---

## 3. Kiểm toán Các Ràng buộc Xuyên suốt (Cross-Cutting Gates)

### 3.1 Xác thực JWT & Phân quyền RBAC (`AGENTS.md` §2 & M11) — **[CRITICAL]**
- **Middleware `/api` thả lỏng (`server.ts:74-124`):** Hàm `app.use('/api', ...)` gọi `dbMod.verifyJwtToken(req.headers?.authorization)` nhưng nếu không có token hoặc token không hợp lệ, middleware **vẫn gọi `next()`** mà không chặn `401`. Trong toàn bộ `server.ts`, chỉ duy nhất `POST /api/auth/change-password` (`server.ts:153`) có kiểm tra `401`.
- **Lỗ hổng chiếm quyền đổi mật khẩu (`server.ts:152`, `dbModuleService.ts:510`):**
  ```ts
  const userId = getActorId(req) || req.body?.userId;
  ```
  Nếu kẻ tấn công không gửi JWT mà truyền `userId` trong body và bỏ trống `currentPassword`, hàm `changeUserPassword` bỏ qua kiểm tra mật khẩu cũ (`if (currentPassword)`) và **đặt lại mật khẩu cho bất kỳ tài khoản nào (kể cả ADMIN)**.
- **Lộ mã OTP đặt lại mật khẩu (`dbModuleService.ts:548`):** `POST /api/auth/forgot-password` trả thẳng `{ devCode: code }` trong JSON response thay vì chỉ gửi qua kênh email/SMS bảo mật.
- **Không có RBAC Server-Side:** Toàn bộ API nghiệp vụ (`M01`–`M12`) không kiểm tra vai trò hay `allowedModules` trên server.

### 3.2 Cơ sở dữ liệu: Read-Only, Soft Delete, UUID & Optimistic Locking — **[CRITICAL]** / **[HIGH]**
- **Read-Only `ipo` & `material` (PASS Backend):** `getMaterialsReadOnly` và `getIpoReadOnly` chỉ dùng `SELECT`, các endpoint ghi/import bị chặn `403` (`server.ts:673-681, 779-783`). Không phát hiện lệnh `INSERT`/`UPDATE`/`DELETE` nào tác động lên 2 bảng này.
- **Vi phạm CẤM Hard Delete (`DELETE FROM`):** Phát hiện 9 điểm xóa cứng trực tiếp khỏi Database:
  - `M02`: `DELETE FROM floor_plans` (`dbModuleService.ts:1162`)
  - `M03`: `DELETE FROM subcontractor_bookings` (`dbService.ts:1967`)
  - `M09`: `DELETE FROM tool_catalogs` và `DELETE FROM tool_assets` (`dbService.ts:2647, 2731`)
  - `M10`: `DELETE FROM ipo_sample_history` (`dbModuleService.ts:1888`)
  - `M11`: `DELETE FROM qms_roles`, `workshops`, `departments`, `divisions`, `teams` (`dbModuleService.ts:812, 854`; `dbService.ts:2512, 2536, 2561`)
  - `M12`: `permanentDeleteInspectionRecord` (`dbModuleService.ts:1530-1532`) chạy xóa vĩnh viễn nhưng endpoint không có xác thực Admin.
- **Optimistic Locking (`version`):** Chỉ mới triển khai tại `subcontractor_bookings` (`dbService.ts:314-316, 401`). Các thực thể trọng yếu khác (`inspections`, `forms_*`, `ncrs`, `projects`, `suppliers`, `users`) đều thiếu cơ chế chống ghi đè đồng thời (`409 Conflict`).
- **Khóa chính `UUID`:** Chỉ `audit_logs` và `ipo_*` dùng `crypto.randomUUID()`. Các bảng `inspections`/`forms_*` (`TYPE-timestamp`), `ncrs` (`NCR-timestamp`), `users` (`user_timestamp`), `roles`, `workshops`, `defect_library`, `tool_*` đều tự sinh chuỗi timestamp.

### 3.3 Chuẩn UX/UI, Điều hướng & Bộ Component Chuẩn (`AGENTS.md` §4) — **[HIGH]** / **[MEDIUM]**
- **Áp dụng `/src/components/qms/` (`<Combobox>`, `<SearchInput>`, `<ConfirmDialog>`, `<PageActions>`, `<Pagination>`):** Chỉ có `M03` (`SubcontractorBookingManagement.tsx`) sử dụng đầy đủ. Tất cả 12 module còn lại dùng `<select>` HTML thô, `window.confirm()`, `window.prompt()`, `alert()`, và ô input tìm kiếm tự chế.
- **Lồng Modal & Điều hướng (`returnView`):** `App.tsx` quản lý view bằng `useState<ViewState>` thay vì URL Route; nhiều form/detail vẫn mở chồng modal hoặc nhúng component con (`NCRDetail` trong `PQC`/`SQC_VT`, modal sửa/chi tiết trong `MaterialManagement`, `ToolsManagement`, `Trash`).
- **Tải dư dữ liệu về Client:** `NCRList.tsx:181` tải `limit = 50000`; `App.tsx:316` (`Projects`) tải `limit = 10000`; `InspectionList.tsx:573` tải `1000–5000`; `Dashboard.tsx:84` tải `1000`.

---

## 4. Ma trận Tuân thủ 13 Module (`M00` – `M12`)

| Module | Auth / RBAC Server | Read-Only / Soft Delete | `UUID` & `version` Lock | Audit Trail (`JSONB`) | State Machine / Logic | UI Kit Chuẩn & Không lồng Modal | Mức đánh giá chung |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **M00. App Shell & Layout** | **LỖI** (Lỗ hổng `/api` & `change-password`) | N/A | N/A | Login log có | Quản lý state view (chưa dùng Route) | **LỖI** (`alert`/`confirm` trong `App.tsx`) | **[CRITICAL]** |
| **M01. Dashboard** | **LỖI** (Không Auth) | **ĐẠT MỘT PHẦN** (Chặn `DELETED` trừ khi truyền param) | N/A | N/A | Filter GMT+7 tốt | **LỖI** (Fetch 1.000 NCR, `<select>`) | **[MEDIUM]** |
| **M02. Quản Lý Dự Án** | **LỖI** (Không Auth) | **LỖI** (`floor_plans` Hard Delete) | **LỖI** (Không `version`) | Có cho Project/Doc/Plan/Pin | Mã `ma_ct` chuẩn | **LỖI** (Fetch 10.000 dự án, 4 `<select>`) | **[HIGH]** |
| **M03. Lịch Nghiệm Thu GCN** | **LỖI** (Không Auth) | **LỖI** (`subcontractor_bookings` Hard Delete, thiếu `deleted_at`) | **ĐẠT MỘT PHẦN** (Có `version`, PK chưa UUID) | Có | Reconcile SQC tự động | **ĐẠT** (Duy nhất dùng đủ 5 QMS Components) | **[HIGH]** |
| **M04. Nhà Cung Cấp** | **LỖI** (Không Auth) | **ĐẠT** (`deleted_at IS NULL`) | **LỖI** (Không `version`) | Có khi xóa | Sync từ Booking hoạt động | **LỖI** (Page size `20` != `50`, `<select>`) | **[MEDIUM]** |
| **M05. Danh Sách Phiếu** | **LỖI** (Không Auth) | **ĐẠT MỘT PHẦN** (Fallback `getInspectionById` rò `DELETED`) | **LỖI** (Thiếu `version` & UUID) | **MỘT PHẦN** (Thiếu full snapshot) | **LỖI** (Bypass + `LOCKED` ghi đè + đảo L1/L2) | **LỖI** (Base64 stale closure, `Times New Roman`, `<NCRDetail>` lồng) | **[CRITICAL]** |
| **M06. Danh Sách NCR** | **LỖI** (Không Auth) | **ĐẠT** (`deleted_at IS NULL`) | **LỖI** (Thiếu `version` & UUID) | **LỖI** (`upsertNcr` không ghi Audit) | **LỖI** (Không ép `open->assigned->corrected->verified->closed`) | **LỖI** (Fetch `50000` dòng, `confirm`/`alert`, stale save) | **[CRITICAL]** |
| **M07. Thư Viện Lỗi** | **LỖI** (Không Auth) | **MỘT PHẦN** (Dùng `is_deleted=1` thay vì `deleted_at`) | **LỖI** (`DEF_ts`, không `version`) | Có | Chuẩn hóa nhóm lỗi | **LỖI** (3 `<select>`, `window.confirm`/`alert`) | **[MEDIUM]** |
| **M08. Quản Lý Vật Liệu** | **LỖI** (GET không Auth) | **ĐẠT** (Backend khóa `403` Read-Only) | N/A (ERP) | N/A (ERP) | Backend chuẩn | **LỖI** (UI vẫn hiện nút Thêm/Sửa/Xóa/Import) | **[MEDIUM]** |
| **M09. Quản Lý CCDC** | **LỖI** (Không Auth) | **LỖI** (Hard Delete `tool_catalogs`, `tool_assets`) | **LỖI** (`tc-`/`ta-`, không `version`) | **LỖI** (0 log Audit) | Luân chuyển & hiệu chuẩn có bảng riêng | **LỖI** (`<select>`, `window.confirm`/`alert`) | **[HIGH]** |
| **M10. IPO Data** | **LỖI** (GET không Auth) | **MỘT PHẦN** (`ipo` Read-Only OK; `ipo_sample_history` Hard Delete) | **MỘT PHẦN** (Bảng con dùng UUID, không `version`) | Thiếu ở bảng con sample/material/drawing | Backend chặn import `403` | **LỖI** (UI còn nút Import Excel gây 403) | **[MEDIUM]** |
| **M11. Cài Đặt & RBAC** | **LỖI** (Không Auth `ADMIN`) | **LỖI** (Hard Delete `roles`, `workshops`, `departments`/`divisions`/`teams`) | **LỖI** (`user_`/`role_` ts, không `version`) | Có cho User/Role/Workshop/Template | Danh sách Role chưa đồng nhất với `AGENTS.md` | **LỖI** (`<select>`, `alert`) | **[CRITICAL]** |
| **M12. Thùng Rác** | **LỖI** (Không Auth `ADMIN`) | **MỘT PHẦN** (Chỉ hỗ trợ `forms_*`, bỏ qua NCR/Project/Supplier/User) | N/A | **ĐẠT** (`RESTORE_ACTION` + `PERMANENT_DELETE`) | Thiếu cảnh báo chuẩn `<ConfirmDialog variant="danger">` | **LỖI** (`window.confirm`/`alert`, không phân trang) | **[HIGH]** |

---

## 5. Phân tích chi tiết theo từng Module (`M00` – `M12`)

### M00. App Shell & Layout (`App.tsx`, `Sidebar.tsx`, `GlobalHeader.tsx`, `server.ts`)
- **Điểm đạt:** `Sidebar.tsx:37-49` hiển thị đủ 12 module nghiệp vụ, tích hợp Profile User & nút Đăng xuất (`handleLogout` xóa storage/token), bọc `<ErrorBoundary>` ở vùng `<main>` (`App.tsx:644`), đồng thời `index.html` nạp đúng `Inter` và `JetBrains Mono`.
- **Sai lệch chính:**
  1. **`[CRITICAL]` Thiếu cổng Auth/RBAC tại API:** `server.ts:74-124` không từ chối request thiếu JWT; `POST /api/auth/change-password` (`server.ts:152`) cho phép truyền `req.body.userId` không cần đăng nhập và bỏ qua `currentPassword` khi để trống.
  2. **`[MEDIUM]` Thông báo & Cảnh báo sai chuẩn:** `App.tsx:408, 424, 440, 706, 709, 759` dùng `alert`/`window.confirm`; đặc biệt dòng `709` ghi *"Dữ liệu sẽ bị xóa vĩnh viễn khỏi audit log"* dù hành động thực tế là xóa mềm.
  3. **`[MEDIUM]` Mất `returnView` khi Hủy Form:** `App.tsx:688-697` gắn cứng `onCancel={() => setView('LIST')}` nên nếu mở Form từ `SUBCONTRACTOR_BOOKING` hay `PROJECT_DETAIL`, bấm Hủy sẽ mất ngữ cảnh quay lại.

### M01. Báo Cáo Tổng Hợp (`Dashboard.tsx`, `services/dbService.ts:1971-2085`)
- **Điểm đạt:** Truy vấn `/api/dashboard/stats` sử dụng `buildInspectionsWhereClause` với múi giờ `Asia/Ho_Chi_Minh` (GMT+7) và mặc định loại trừ `status <> 'DELETED'` (`dbService.ts:508`).
- **Sai lệch chính:**
  1. **`[HIGH]` Lọc `DELETED` bị vô hiệu hóa nếu truyền `filters.status`:** Nhánh `if (statuses.length > 0)` tại `dbService.ts:504-506` không ép kèm `UPPER(status) <> 'DELETED'`, và bảng `inspections` dùng cờ `status = 'DELETED'` thay vì cột `deleted_at IS NULL`.
  2. **`[MEDIUM]` Client over-fetching & UI thô:** `Dashboard.tsx:84` gọi `fetchNcrs(ncrFilters, 1, 1000)` để tự tổng hợp tại client; dòng `669` dùng `<select>` thô.

### M02. Quản Lý Dự Án (`ProjectList.tsx`, `ProjectDetail.tsx`, `services/dbModuleService.ts:934-1182`)
- **Điểm đạt:** `getProjectsList` và `getProjectDocuments` đều có `deleted_at IS NULL` (`dbModuleService.ts:961, 1050`); thao tác tài liệu dự án có xóa mềm và ghi `audit_logs` (`1111, 1117, 1118`).
- **Sai lệch chính:**
  1. **`[HIGH]` Hard Delete bảng `floor_plans`:** `deleteFloorPlanRecord` (`dbModuleService.ts:1162`) chạy `DELETE FROM floor_plans WHERE id = $1`.
  2. **`[MEDIUM]` Tải 10.000 bản ghi & Dùng `<select>` thô:** `App.tsx:316` gọi `fetchProjects(search, 1, 10000)`; `ProjectList.tsx:228, 244, 257, 270` dùng 4 thẻ `<select>`.

### M03. Lịch Nghiệm Thu GCN (`SubcontractorBookingManagement.tsx`, `services/dbService.ts:148-420, 1967`)
- **Điểm đạt:** Là module **duy nhất** triển khai chuẩn cả 5 Component (`/src/components/qms/` tại dòng `22`) và Optimistic Locking (`version` tại `dbService.ts:314-316, 401`). Hỗ trợ lọc QC phụ trách và đối chiếu SQC.
- **Sai lệch chính:**
  1. **`[HIGH]` Hard Delete `subcontractor_bookings`:** `deleteSubcontractorBooking` (`dbService.ts:1967`) chạy `DELETE FROM subcontractor_bookings` thay vì soft delete `deleted_at`; `getSubcontractorBookings` (`154`) không lọc `deleted_at IS NULL`.

### M04. Nhà Cung Cấp (`SupplierManagement.tsx`, `SupplierDetail.tsx`, `services/dbModuleService.ts:1187`, `dbService.ts:1655, 2087`)
- **Điểm đạt:** Dùng `deleted_at IS NULL` khi đọc (`dbService.ts:1655`), soft delete khi xóa (`dbModuleService.ts:1187`), và có đồng bộ từ lịch hẹn Booking qua `/api/suppliers/sync-from-bookings`.
- **Sai lệch chính:**
  1. **`[MEDIUM]` Sai chuẩn phân trang & Component:** `SupplierManagement.tsx:66` đặt page size = `20` (chuẩn là `50`), dùng `<select>` tại các dòng `179, 426, 435` và chưa dùng UI Kit chuẩn.

### M05. Danh Sách Phiếu (`InspectionList.tsx`, `TwoTierApproval.tsx`, `PQC`/`FQC`/`SQC_*`)
*(Chi tiết đầy đủ đã được phân tích tại `docs/INSPECTION_COMPLIANCE_AUDIT_REPORT.md`)*
- **Tóm tắt vi phạm trọng yếu:**
  - **`[CRITICAL]`** API không có auth/RBAC; `upsertInspectionRecord` (`dbModuleService.ts:1245-1255`) cho phép nhảy `DRAFT -> APPROVED`, `SUBMITTED -> LOCKED`, lùi trạng thái, và ghi đè khi `curStatus === 'LOCKED' && nextStatus === 'LOCKED'`; `TwoTierApproval.tsx:500-546` đảo ngược `verified` và `approved`, cho phép `isBoss` ký tắt; `types.ts:543-556` cho phép `ADMIN` sửa/xóa cả bản ghi `LOCKED`.
  - **`[HIGH]`** Thiếu `version` Optimistic Locking; PK dạng `TYPE-timestamp`; `PQC` lưu thẳng chữ ký Base64 và `FQC`/`SQC_VT`/`SQC_BTP`/`SQC_TP` mắc lỗi stale-closure gửi Base64 vào DB; `/api/upload` lưu cục bộ thay vì Signed URL; fallback `getInspectionById` (`dbService.ts:974`) rò bản ghi `DELETED`; Audit log thiếu full snapshot `JSONB`; `items[].ncr` không đồng bộ sang `ncrs`; nhúng `<NCRDetail>` và xếp chồng modal.
  - **`[MEDIUM]`** `0%` dùng `/src/components/qms/`; inline `Times New Roman` và `style={{}}`; tải `1.000–5.000` dòng về client.

### M06. Danh Sách NCR (`NCRList.tsx`, `NCRDetail.tsx`, `services/dbService.ts:2204-2386`)
- **Điểm đạt:** Truy vấn `LEFT JOIN inspections` theo `inspection_id` (`dbService.ts:2305`, `dbModuleService.ts:1556`) và xóa mềm qua `deleted_at` (`dbService.ts:2384`).
- **Sai lệch chính:**
  1. **`[CRITICAL]` Thiếu hoàn toàn State Machine & Khóa bất biến ở Backend:** `upsertNcr` (`dbService.ts:2314-2380`) không kiểm tra chuyển trạng thái (`open -> assigned -> corrected -> verified -> closed`), không chặn sửa khi đã `CLOSED`, và Frontend (`NCRDetail.tsx:180-183`) tự đặt trạng thái ngoài chuẩn `'IN_PROGRESS'` / `'OPEN'` / `'CLOSED'`.
  2. **`[HIGH]` Thiếu Audit Log, `version`, UUID & Lỗi stale save:** `upsertNcr` không gọi `writeAuditLog`, không có `version`, PK dùng `NCR-${Date.now()}`; `NCRDetail.tsx:178-194` thực thi lưu bất đồng bộ bên trong callback `setFormData(...)` (anti-pattern); `NCRList.tsx:181` tải `limit = 50000` dòng về client và dùng `confirm`/`alert`.

### M07. Thư Viện Lỗi (`DefectLibrary.tsx`, `services/dbModuleService.ts:1588-1667`)
- **Điểm đạt:** Có ghi `audit_logs` khi lưu và xóa (`1658, 1665`), hỗ trợ phân nhóm lỗi & mức độ `MINOR`/`MAJOR`/`CRITICAL`.
- **Sai lệch chính:**
  1. **`[MEDIUM]`** Bảng `defect_library` dùng cột cờ `is_deleted = 1` thay vì cột timestamp `deleted_at`; PK dạng `DEF_${Date.now()}`; `DefectLibrary.tsx` dùng 3 thẻ `<select>` (`475, 488, 497`) và `window.confirm`/`alert`.

### M08. Quản Lý Vật Liệu (`MaterialManagement.tsx`, `services/dbModuleService.ts:1670-1716`, `server.ts:661-681`)
- **Điểm đạt:** Tầng Backend thực thi **Read-Only 100%** (chỉ `SELECT`, chặn `403` mọi `POST/PUT/DELETE/import`), UI phân trang `50` dòng/trang.
- **Sai lệch chính:**
  1. **`[MEDIUM]` UI mâu thuẫn với ràng buộc Read-Only:** `MaterialManagement.tsx:186-235` vẫn hiển thị nút Nhập Excel, Thêm mới (`+`), Sửa và Xóa hàng loạt; khi người dùng thao tác sẽ bị Backend trả `403` và hiện `alert('Lỗi khi lưu/xóa vật liệu')`. Ngoài ra chưa dùng `<SearchInput>`, `<ConfirmDialog>`, `<PageActions>`, `<Pagination>`.

### M09. Quản Lý CCDC (`ToolsManagement.tsx`, `services/dbService.ts:2580-2813`, `server.ts:684-763`)
- **Điểm đạt:** Đã có đủ cấu trúc liên kết `tool_catalogs`, `tool_assets`, `tool_transfers`, `tool_calibrations`.
- **Sai lệch chính:**
  1. **`[HIGH]` Hard Delete, thiếu `deleted_at` & 0 Audit Log:** Cả 4 bảng CCDC đều không có cột `deleted_at`; `deleteToolCatalog` (`dbService.ts:2647`) và `deleteToolAsset` (`2731`) xóa cứng khỏi DB; không có bất kỳ lời gọi `writeAuditLog` nào cho các nghiệp vụ cấp phát/luân chuyển/hiệu chuẩn CCDC.
  2. **`[MEDIUM]`** Dùng PK `tc-`/`ta-`/`tt-`, thẻ `<select>` (`ToolsManagement.tsx:509, 524, 954`) và `window.confirm`/`alert`.

### M10. IPO Data (`IPOPage.tsx`, `IPODetail.tsx`, `services/dbModuleService.ts:1719-1890`, `server.ts:766-850`)
- **Điểm đạt:** Bảng lõi `ipo` giữ **Read-Only tuyệt đối** (`SELECT` only, `POST /api/import/ipo` trả `403`), phân trang `50` dòng/trang.
- **Sai lệch chính:**
  1. **`[MEDIUM]` UI Import dư thừa & Bảng phụ Hard Delete:** `IPOPage.tsx:179-195` vẫn hiển thị nút Import Excel dù server chặn `403`; bảng phụ `ipo_sample_history` dùng Hard Delete tại `dbModuleService.ts:1888`; các bảng phụ `ipo_drawing_list`, `ipo_material_history`, `ipo_sample_history` thiếu `deleted_at` và `writeAuditLog`.

### M11. Cài Đặt & RBAC (`Settings.tsx`, `services/dbModuleService.ts:573-931`, `dbService.ts:2500-2570`)
- **Điểm đạt:** Mật khẩu băm `bcrypt`, `users` dùng xóa mềm `deleted_at` (`dbModuleService.ts:723`) và có ghi `audit_logs` cho User/Role/Workshop/Template.
- **Sai lệch chính:**
  1. **`[CRITICAL]` Mở cửa API Quản trị không cần quyền ADMIN:** Toàn bộ route `/api/users*`, `/api/roles*`, `/api/workshops*`, `/api/templates*`, `/api/departments*`, `/api/divisions*`, `/api/teams*` trong `server.ts:855-1080` không kiểm tra JWT hay quyền `ADMIN`. Kết hợp với lỗ hổng `change-password` (`server.ts:152`) và `devCode` (`dbModuleService.ts:548`), hệ thống có nguy cơ bị chiếm toàn quyền quản trị.
  2. **`[HIGH]` Hard Delete danh mục tổ chức & quyền:** `qms_roles`, `workshops`, `departments`, `divisions`, `teams` đều dùng `DELETE FROM` thay vì `deleted_at`.
  3. **`[MEDIUM]`** `Settings.tsx` dùng `<select>` (`307`) và `alert()`; bảng Role trong `AGENTS.md` chưa đồng bộ hoàn toàn với `types.ts`.

### M12. Thùng Rác (`Trash.tsx`, `services/dbModuleService.ts:1458-1542`, `server.ts:499, 547, 556`)
- **Điểm đạt:** `restoreInspectionRecord` (`dbModuleService.ts:1518`) đã ghi đúng mã hành động `RESTORE_ACTION` theo yêu cầu M12 trong `AGENTS.md`.
- **Sai lệch chính:**
  1. **`[HIGH]` Phạm vi Thùng rác chưa bao phủ các bảng có `deleted_at`:** `Trash.tsx` và API hiện chỉ quản lý riêng bảng phiếu kiểm tra (`forms_*`), bỏ sót các bản ghi đã xóa mềm của **Dự án (`projects`)**, **Tài liệu dự án (`project_documents`)**, **Nhà cung cấp (`suppliers`)**, **NCR (`ncrs`)**, **Thư viện lỗi (`defect_library`)**, và **Người dùng (`users`)**.
  2. **`[CRITICAL]` Thiếu chặn quyền ADMIN ở API Khôi phục & Xóa vĩnh viễn:** `POST /api/inspections/:id/restore` và `DELETE /api/inspections/:id/permanent` không có middleware xác thực.
  3. **`[MEDIUM]`** `Trash.tsx` dùng `window.confirm()`/`alert()` thay vì `<ConfirmDialog variant="danger">`, dùng modal xem chi tiết lồng bên trong thay vì điều hướng, và không có `<Pagination>`.

---

## 6. Lỗ hổng liên kết giữa các Module (End-to-End Traceability)

1. **Booking `M03` ↔ Inspection `M05` ↔ Thùng rác `M12`:** Khi xóa Booking (`M03`) bằng Hard Delete (`dbService.ts:1967`), liên kết `booking_id` từ phiếu SQC (`M05`) bị mồ côi vĩnh viễn và không thể khôi phục qua `M12`.
2. **Inspection `M05` ↔ NCR `M06` ↔ Dashboard `M01`:** Các lỗi NCR tạo lồng trong checklist `PQC`/`FQC`/`SQC` chỉ nằm trong JSON của `forms_*` mà không tự động đồng bộ sang bảng `ncrs` (`M06`), khiến báo cáo NCR và Dashboard (`M01`) thiếu số liệu sự cố thực tế.
3. **Material `M08` & IPO `M10` (Read-Only) ↔ Giao diện Quản trị:** Backend đã khóa ghi (`403`) nhưng Frontend vẫn hiển thị nút thao tác ghi (Thêm/Sửa/Xóa/Import), gây trải nghiệm lỗi cho người dùng.

---

## 7. Lộ trình Chuẩn hóa Hệ thống theo 4 Giai đoạn

| Giai đoạn | Ưu tiên | Hạng mục triển khai trọng tâm | Tiêu chí nghiệm thu (Acceptance Gate) |
| :--- | :---: | :--- | :--- |
| **Giai đoạn 1: Khóa Bảo mật & State Machine ISO** | **P0** | 1. Bật middleware `requireAuth` (`401`) và `requirePermission` (`403`) cho toàn bộ route `/api/*` (trừ `/api/health`, `/api/auth/login`, `/api/public/*`).<br>2. Vá lỗ hổng `change-password` (bắt buộc lấy `userId` từ JWT) và bỏ `devCode` khỏi response `forgot-password`.<br>3. Khóa State Machine ISO ở Backend cho cả `M05` (Inspection) và `M06` (NCR); chặn mọi mutation khi `LOCKED`/`CLOSED` (kể cả `ADMIN` trong `types.ts`); sửa thứ tự L1/L2 trong `TwoTierApproval.tsx`. | 100% API ghi/xóa trả `401` khi thiếu JWT và `403` khi sai Role; test State Machine từ chối mọi bước nhảy cóc hoặc sửa phiếu đã `LOCKED`/`CLOSED`. |
| **Giai đoạn 2: Toàn vẹn DB, Base64 & Audit Trail** | **P1** | 1. Thay thế toàn bộ `DELETE FROM` ở `M02`, `M03`, `M09`, `M10`, `M11` sang Soft Delete (`deleted_at`), chuyển `defect_library.is_deleted` sang `deleted_at`.<br>2. Bổ sung `version` Optimistic Locking (`409 Conflict`) cho `M02`, `M05`, `M06`, `M11`; chuẩn hóa PK sang `UUID`.<br>3. Vá lỗi stale-closure Base64 tại `FQC`/`SQC_*`, upload chữ ký tại `PQC`/`TwoTierApproval`, chặn `data:` URI ở API, chuyển `/api/upload` sang Signed URL.<br>4. Ghi đủ snapshot `JSONB` Audit Log cho `M05`, `M06`, `M09` và đồng bộ `items[].ncr` vào bảng `ncrs`. | Không còn `DELETE FROM` trên bảng nghiệp vụ; `0` chuỗi Base64 lưu xuống PostgreSQL; mọi biến động nghiệp vụ có Audit `JSONB` đầy đủ. |
| **Giai đoạn 3: Đồng bộ Liên Module & Chuẩn UI Kit** | **P2** | 1. Gỡ nút Thêm/Sửa/Xóa/Import khỏi UI Read-Only của `M08` và `M10`.<br>2. Mở rộng `M12` (Thùng rác) để xem và khôi phục cả `projects`, `suppliers`, `ncrs`, `defect_library`, `users`.<br>3. Thay toàn bộ `<select>`, `alert()`, `window.confirm()`, `window.prompt()`, `Times New Roman`, inline `style={{}}` trên 12 module còn lại bằng `/src/components/qms/` (`<Combobox>`, `<SearchInput>`, `<ConfirmDialog>`, `<PageActions>`, `<Pagination>`). | `grep` trả về `0` vi phạm `<select>`, `window.confirm`, `alert(`, `Times New Roman`, `style={{` tại các module chính. |
| **Giai đoạn 4: Điều hướng, Phân trang Server & Chuẩn hóa Tài liệu** | **P3** | 1. Thay thế view lồng (`<NCRDetail>` trong `M05`, modal chồng trong `M05`/`M12`) bằng Route + `returnView`.<br>2. Bỏ tải `1.000–50.000` dòng về client ở `M01`, `M02`, `M05`, `M06`; ép phân trang server `50` dòng/trang và bảng mật độ `px-3 py-2.5`.<br>3. Cập nhật `docs/API.md` đúng PostgreSQL, đồng bộ danh sách Role trong `AGENTS.md` M11 và dọn dẹp các script tạm ở thư mục gốc. | Mọi danh sách chạy phân trang server `50` dòng/trang; điều hướng `returnView` sạch không lồng modal; tài liệu đồng nhất 100% với `AGENTS.md`. |
