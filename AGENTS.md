# 🎯 BỘ LỆNH ĐIỀU HƯỚNG TỐI CAO (MASTER SYSTEM DIRECTIVE)
Bạn là AI Chuyên gia Kỹ sư Phần mềm (Fullstack) & Kiến trúc sư Hệ thống phục vụ cho dự án QMS v3.1.0 của AA Corporation. Bạn là một tác nhân (Agent) tuân thủ kỷ luật khắt khe, đề cao tính toàn vẹn dữ liệu, bảo mật và trải nghiệm UI/UX nhất quán.

## 1. NGUYÊN TẮC HOẠT ĐỘNG CỐT LÕI (CORE DIRECTIVES)
1. **MEMORY FIRST:** Trước khi thực hiện BẤT KỲ yêu cầu viết code, sửa lỗi, hay thiết kế kiến trúc nào từ User, bạn **BẮT BUỘC PHẢI ĐỌC VÀ THAM CHIẾU** nội dung của file này (`AGENTS.md` - Nguồn chân lý duy nhất chứa 13 Module và Ràng buộc hệ thống). 
2. **NO ASSUMPTION:** Tuyệt đối không tự bịa ra các quy tắc UI/UX, bảng Database hay luồng ISO nếu nó đi ngược lại với `AGENTS.md`. Nếu User yêu cầu điều gì trái quy tắc, hãy cảnh báo ngay lập tức.
3. **READ-ONLY MANDATE:** Bảng `ipo` và `material` là Read-only tuyệt đối. Mọi bảng nghiệp vụ khác đều phải dùng Soft Delete (`deleted_at`).

---

# 2. KIẾN TRÚC HỆ THỐNG & CHIẾN LƯỢC DỮ LIỆU
- **Tài liệu tham chiếu chi tiết:** Đặc tả đầy đủ nghiệp vụ, sơ đồ Mermaid/ASCII, RBAC và danh sách API/DB chi tiết được lưu tại `docs/SYSTEM_MODULES_AND_WORKFLOWS.md`.
- **Server-Authoritative:** Backend kiểm soát 100% logic, đối chiếu đa tầng và phân quyền RBAC. Middleware `/api/*` xác thực JWT và nạp **live user context** (`req.authUser` từ `appQAQC.users`), ngoại trừ tối thiểu `isPublicApiRoute` (`/api/health`, `/api/auth/login|forgot-password|reset-password`, `/api/public/inspections/:id`, proxy/stream ảnh, `/api/storage/*`, `POST /api/system/audit-errors`). Frontend KHÔNG tự xử lý logic filter tập dữ liệu lớn.
- **Hydration API:** Backend cung cấp endpoint trả về toàn vẹn dữ liệu (`GET /api/inspections/:id`, `/api/ncrs/:id`, `/api/subcontractor-bookings/:id` gồm nested `items`, `materials`, `images`, `signatures`, `comments`, `relatedSqcSummary`) để Frontend mở Form Chi tiết trong 1 lần gọi.
- **Cơ sở dữ liệu (PostgreSQL — schema `"appQAQC"`):** Khóa chính dùng `UUID`/`TEXT`. Ngày tháng lưu Unix Timestamp (`BIGINT`) và chuẩn hóa hiển thị múi giờ **GMT+7 (`Asia/Ho_Chi_Minh`)**. Tên bảng/cột dạng `snake_case`. Xử lý xung đột bằng Optimistic Locking (cột `version`, trả HTTP `409 Conflict`, Server Wins).
- **Xóa mềm (Soft Delete):** Mọi bảng nghiệp vụ dùng cột `deleted_at`. Truy vấn danh sách chính luôn kèm `deleted_at IS NULL`. CẤM Hard Delete ngoài quyền hạn `ADMIN` tại M12; chặn xóa mềm phiếu đã `LOCKED`/`VERIFIED`/`COMPLETED` (`403`).
- **ISO Traceability & Audit Gate:** Mọi biến động dữ liệu nghiệp vụ ghi log vĩnh viễn vào `audit_logs` / `status_history` (lưu `old_value`/`new_value` dạng `JSONB`). Mọi response lỗi HTTP `>= 400` trên `/api/*` tự động ghi vào `api_error_logs`. Tính năng mới không được release nếu thiếu logic ghi log Audit.
- **Điều hướng (Routing):** TUYỆT ĐỐI KHÔNG lồng Modal chồng chéo (Zero Modal Nesting). Khi chuyển giữa Modal (ví dụ `BookingDetailModal` → `QCAssignmentModal`) hoặc mở Form chi tiết từ Modal, phải đóng Modal hiện tại và chuyển view bằng Route (truyền kèm state `returnView`).
- **Xử lý File & Ảnh Google Drive:** Upload/Download qua Signed URL (`/api/storage/signed-upload-url` → `/api/storage/upload` → `/api/storage/files/*`), CẤM lưu Base64 vào DB. Ảnh Drive đi qua bộ đệm Proxy đa tầng CDN (`/api/proxy-image`, `/api/images/proxy`, `/api/media/image*`) kết hợp Google Workspace OAuth (`drive.readonly`).
- **Bất biến hệ thống:** Bảng `material` (M08) và `ipo` (M10) bị khóa ghi (`403 Forbidden`); trạng thái cuối `LOCKED` (M05) và `CLOSED` (M06) là bất biến (`403 Forbidden`).

---

# 3. QUY TRÌNH TRẠNG THÁI (STATE MACHINE) & PHÂN QUYỀN RBAC
Backend ép buộc chặn luồng theo đúng thứ tự sau. Khi đạt trạng thái cuối (`LOCKED`/`CLOSED` = Immutable), cấm mọi hành vi chỉnh sửa (`403`):
- **Inspection Workflow (M05):** `DRAFT` / `SUBMITTED` → `SUBMITTED` → `APPROVED` / `REJECTED` *(yêu cầu `SIGN1` hoặc `APPROVE`)*; `REJECTED` → `SUBMITTED` / `DRAFT`; `APPROVED` → `VERIFIED` → `LOCKED` *(yêu cầu `SIGN2` hoặc `ADMIN`; `LOCKED` = Immutable `403`)*.
- **NCR Workflow (M06):** `OPEN` → `ASSIGNED` / `CORRECTED`; `ASSIGNED` → `CORRECTED`; `CORRECTED` → `VERIFIED` / `ASSIGNED`; `VERIFIED` → `CLOSED` / `ASSIGNED` *(`VERIFIED`/`CLOSED` chỉ dành cho `ADMIN`, `MANAGER`, `QC_LEAD`, `QA` hoặc `la_to_truong`; `CLOSED` = Immutable `403`)*.
- **Subcontractor Booking Workflow (M03):** `PENDING` → `ASSIGNED` *(xác nhận phân công QC)* / `RETURNED_FOR_SUPPLEMENT` *(trả lại yêu cầu bổ sung kèm `rejectionReason`, `suggestedDate`)*; `RETURNED_FOR_SUPPLEMENT` → `ASSIGNED`; `ASSIGNED` → `IN_PROGRESS` *(bấm Nghiệm thu tạo SQC)* / `COMPLETED`; `IN_PROGRESS` → `COMPLETED` *(SQC PASS/APPROVED)* / `RETURNED_FOR_SUPPLEMENT` *(SQC FAIL → Nghiệm thu lại)*; `PENDING`/`ASSIGNED` → `CANCELLED`. Áp dụng quy tắc cutoff **15:00** (trước 15:00 đặt sớm nhất T+1, sau 15:00 sớm nhất T+2).

## 3.1 Ma Trận Phân Quyền RBAC Tóm Tắt (`V`=View, `C`=Create, `E`=Edit, `D`=Delete, `I/X`=Import/Export, `S1/S2`=Sign1/Sign2)
| Module | `ADMIN` | `MANAGER`/`QA` | `QC_LEAD` (`la_to_truong`) | `QC_INSPECTOR` | `PURCHASING` | `VENDOR` | `GUEST` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **M00. App Shell & Auth** | Toàn quyền | Cá nhân | Cá nhân | Cá nhân | Cá nhân | Cá nhân | Chỉ QR Share |
| **M01. Dashboard** | `V` (toàn cục) | `V` (toàn cục) | `V` | `V` | `V` (nếu cấp) | Không | Không |
| **M02. Dự Án & Layout** | `V,C,E,D` | `V,C,E` | `V,E` | `V` + Pin | `V` | Không | Không |
| **M03. Lịch GCN** | `V,C,E,D`+Giao | `V,C,E`+Giao | `V,C,E`+Giao | `V`+Nghiệm thu | `V,C,E` | `V,C` (xưởng mình) | Không |
| **M04. Nhà Cung Cấp** | `V,C,E,D,I,X` | `V,C,E,I,X` | `V,X` | `V` | `V,C,E,X` | Hồ sơ mình | Không |
| **M05. Danh Sách Phiếu** | `V,C,E,D,I,X,S1,S2` | `V,C,E,X,S1,S2` | `V,C,E,X,S1` | `V,C,E,X` | `V` | `V` (nếu cấp) | `V` (QR Public) |
| **M06. Danh Sách NCR** | `V,C,E,D,I,X`+Đóng | `V,C,E,I,X`+Đóng | `V,C,E,X`+Đóng | `V,C,E` | `V` | `V,E` (nếu cấp) | Không |
| **M07. Thư Viện Lỗi** | `V,C,E,D,I,X` | `V,C,E,I,X` | `V,X` | `V` | `V` | Không | Không |
| **M08. Vật Liệu (RO)** | `V,X` (Cấm ghi) | `V,X` (Cấm ghi) | `V,X` | `V` | `V,X` | Không | Không |
| **M09. Quản Lý CCDC** | `V,C,E,D` | `V,C,E` | `V,E` | `V` (`MY_TOOLS`) | Không | Không | Không |
| **M10. IPO Data (RO)** | `V,X` + Phụ trợ | `V,X` + Phụ trợ | `V,X` + Phụ trợ | `V` + Phụ trợ | `V,X` | Không | Không |
| **M11. Cài Đặt & RBAC** | 7 Tab + Audit | `PROFILE` (+cấp) | `PROFILE` (+cấp) | `PROFILE` | `PROFILE` | `PROFILE` | Không |
| **M12. Thùng Rác** | `V`+Restore+**Xóa vĩnh viễn** | `V`+Restore *(nếu cấp)* | `V`+Restore *(nếu cấp)* | Chặn `403` | Không | Không | Không |

> **Backend Guards (`server.ts`):** `requireAdmin` (Users import/delete, Roles, Workshops, Templates, Tổ chức, Permanent Delete, `system/audit-errors`, `probe-modules`); `requireTrashAccess` (`ADMIN`, `INSPECTIONS:DELETE` hoặc `TRASH:VIEW`); `POST /api/users` chặn tự nâng quyền.

---

# 4. QUY CHUẨN UX/UI & THIẾT KẾ (DESIGN TOKENS)
Tuân thủ nghiêm ngặt hệ thống Design Tokens. Cấm inline style.

## 4.1 Typography (Phông chữ & Kích thước)
- **Font Family:** `Inter` (Sans - văn bản/label), `JetBrains Mono` (Mono - mã code, UUID, số liệu tabular). Cấm dùng `font-light` (300).
| Token Chuẩn | Kích thước | Trọng lượng | Ứng dụng Bắt buộc |
| :--- | :--- | :--- | :--- |
| `text-2xl` | 24px | `font-bold` | **Page Title (H1)**. Luôn kèm `uppercase tracking-tight`. |
| `text-sm` | 14px | `font-normal` | **Baseline mặc định**: Text body, sidebar, form, text nút. |
| `text-xs` | 12px | `font-semibold` | Header của bảng dữ liệu, caption. Luôn kèm `uppercase`. |
| `text-2xs` | 10px | `font-medium` | Chip, badge trạng thái mini. |

## 4.2 Màu sắc (Semantic Colors)
Sử dụng thang màu Slate (`slate-50` đến `slate-900`).
- **Brand/Primary:** `#2563EB` (`blue-600`) - Mã thực thể, link, nút chính, trạng thái Active Sidebar.
- **Success:** `#16A34A` (`green-600`) - Hoàn thành/Đã duyệt. Row background: `bg-green-50`.
- **Warning:** `#F97316` (`orange-500`) - Chờ xử lý/Pending. Row background: `bg-yellow-50`.
- **Danger:** `#DC2626` (`red-600`) - Hủy/Không đạt/Thùng rác. Row background: `bg-red-50`.
- **Info:** `#0891B2` (`cyan-600`) - Dữ liệu đối chiếu, nhãn liên kết.

## 4.3 Tiêu chuẩn Bảng Dữ Liệu (Table Density)
- **Mật độ:** `Comfortable`. Padding ô BẮT BUỘC là `px-3 py-2.5`.
- **Căn chỉnh:** Dùng `tabular-nums` cho cột chứa Mã số, Số lượng, Tiền tệ, Ngày tháng.
- **Header Bảng:** Dùng `bg-slate-100 text-xs font-semibold uppercase text-slate-700`. Gộp chung trên 1 dòng.
- **State chờ:** Có Skeleton khi load API, Empty state, và Error Boundary kèm nút "Thử lại".
- **Hover:** Hàng có `hover:bg-slate-50` và `cursor-pointer` nếu click được.

## 4.4 Hệ thống Component (Bắt buộc dùng)
1. **`<Combobox>`:** Mọi bộ lọc lựa chọn. CẤM dùng `<select>` thô. Dùng `value={null}` thay vì Option giả "Tất cả".
2. **`<SearchInput>`:** Tìm kiếm text.
3. **`<ConfirmDialog>`:** 3 variant `info`, `warning`, `danger`. CẤM dùng `window.confirm()`.
4. **`<PageActions>`:** Header chứa nút chức năng và tổng số dòng.
5. **`<Pagination>`:** Phân trang (mặc định 50 dòng/trang).

## 4.5 Khả năng đáp ứng & Tương tác (Responsive & Interaction)
- **Responsive Design:** Giao diện bắt buộc phải co giãn linh hoạt và hiển thị đầy đủ thông tin trên mọi kích thước màn hình (Desktop, Tablet, Mobile).
- **Kích thước thao tác (Touch/Click Targets):** Kích thước hiển thị của các thành phần tương tác (nút bấm, input, hàng trong bảng, icon action) luôn luôn phải thuận tiện cho thao tác. Tuyệt đối không để các phần tử bị co rúm, quá nhỏ khó bấm, đè lên nhau hoặc che khuất dữ liệu khi thay đổi kích thước màn hình.

---

# 5. TỔNG HỢP LOGIC NGHIỆP VỤ & ĐẶC TẢ 13 MODULE QMS v3.1.0 (MODULE REGISTRY)
Mọi tính năng, thiết kế UI/UX hay luồng API khi được tạo ra/chỉnh sửa đều phải tuân thủ nghiêm ngặt đặc tả của App Shell và 12 Module dưới đây:

### M00. App Shell & Layout
- **Nhiệm vụ:** Quản lý Header, Sidebar (12 modules lọc động theo `hasPermission`), MobileBottomBar/HomeMenu, JWT Auth, `qms-auth-expired`, Profile User, `NotificationCenter` (chống IDOR), `ChangePasswordModal` (chỉ đổi cho `req.authUser`), QR Scanner & QR Public View (`/api/public/inspections/:id`).
- **Bảng & Endpoint chính:** `users`, `notifications`, `qms_roles`; `/api/auth/*`, `/api/notifications*`, `/api/storage/*`, `/api/proxy-image`, `/api/public/inspections/:id`.
- **Changelog:**
  - `[Init]` - Khởi tạo bộ khung App Shell với JWT.
  - `[2026-11-17]` - Bắt buộc xác thực JWT & nạp live user context trên `/api`, đồng bộ `qms-auth-expired` khi gặp `401` hoặc thiếu token khi khởi động, khóa IDOR đổi mật khẩu, bỏ `devCode` reset password, bổ sung endpoint công khai `/api/public/inspections/:id` cho QR share.
  - `[2026-11-18]` - Ban hành tài liệu đặc tả chức năng, workflow Mermaid/ASCII, ma trận RBAC và điểm tích hợp PostgreSQL/API cho toàn bộ 13 module (M00–M12) tại `docs/SYSTEM_MODULES_AND_WORKFLOWS.md`; đồng bộ hóa tinh gọn vào `AGENTS.md`.
  - `[2026-11-19]` - Bổ sung endpoint `/api/public/inspections/:id/traceability` cho luồng quét QR báo cáo PDF chế độ chỉ đọc và chuẩn hóa quét QR đối chiếu mã `Mã NM` / `PO / PR`.
  - `[2026-11-20]` - Chuẩn hóa UX/UI responsive toàn App Shell (`ChatAI` auto-hide trên mobile Form/Detail và nút đóng đặt ở `z-[90]` khi thu gọn / `z-[350]` khi mở, `lg:pr-24` tránh che nút sticky bottom bar); chuẩn hóa phân tầng `z-[220]`–`z-[300]` cho toàn bộ modal/drawer (`ChangePasswordModal` portal `z-[240]`, `ConfirmDialog` portal `z-[1200]`) vượt trên `GlobalHeader`/`MobileBottomBar` (`z-[100]`) kèm co giãn `max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]`, `safe-area-inset`, `shrink-0` header/footer và `min-h-0 overflow-y-auto` body; chuyển 100% `<select>` sang `<Combobox>` và `window.confirm()` sang `<ConfirmDialog>`, vùng chạm `>= 44×44px`.
  - `[2026-11-20]` - Thu gọn đồng bộ padding header (`px-4 py-2 sm:py-2.5`), body (`p-3.5 sm:p-5`) và footer (`px-4 py-2 sm:py-2.5`) cho toàn bộ modal/drawer/lightbox hệ thống QMS (M00–M12), đặt bù âm `-my-1.5 sm:-my-0.5 -mr-1.5` để bảo toàn vùng chạm mobile `>= 44×44px` (`min-h-[44px] sm:min-h-[36px]`) sát gọn chữ và nút thao tác.
  - `[2026-11-20]` - Đồng bộ phân cấp hành động RBAC trong `hasPermission` (`types.ts`) & `hasServerPermission` (`services/dbModuleService.ts`) (`VIEW_ALL->VIEW`, `EDIT_ALL->EDIT/EDIT_OWN`, `DELETE_ALL->DELETE/DELETE_OWN`, `ADMIN` toàn quyền, `GUEST` từ chối, hỗ trợ `QA`/`QC_LEAD` cho `SIGN1`/`SIGN2`) và bỏ bypass mở `SUBCONTRACTOR_BOOKING` trong `Sidebar.tsx`.
  - `[2026-11-20]` - Bổ sung `lazyWithRetry` trong `App.tsx` tự động thử lại và tải lại trang an toàn một lần khi gặp lỗi `Failed to fetch dynamically imported module` (như nạp `Settings.tsx` sau cập nhật Vite), đồng thời chuẩn hóa thông báo khôi phục trên `ErrorBoundary.tsx`.
  - `[2026-11-25]` - Khắc phục triệt để luồng Đổi mật khẩu & Khôi phục mật khẩu (M00): trả về đối tượng `user` đã cập nhật từ `changeUserPassword`, chuyển đổi sang tự động đăng xuất & yêu cầu đăng nhập lại bằng mật khẩu mới khi đổi mật khẩu bắt buộc (`LoginPage`/`ChangePasswordModal`), loại bỏ `window.alert()`, bổ sung bảng PostgreSQL `appQAQC.password_resets` lưu OTP bền vững 15 phút và tích hợp dịch vụ gửi email SMTP qua `services/emailService.ts` (`nodemailer`).

### M01. Báo Cáo Tổng Hợp (Dashboard)
- **Chức năng chính:** Thống kê KPI chất lượng, biểu đồ tỷ lệ Đạt/Không đạt/Chờ duyệt/Nháp, lọc đa chiều (Thời gian, QC, Xưởng, Loại phiếu, Dự án, Công đoạn, Trạng thái), biểu đồ NCR gom nhóm linh hoạt theo Ngày/Tuần/Tháng/Năm (`DAY`/`WEEK`/`MONTH`/`YEAR`) kèm Drill-down sang chi tiết phiếu (M05).
- **Luồng dữ liệu & Quy tắc ISO:** Truy vấn `/api/dashboard/stats`, `/api/inspections/projects`, `/api/ncrs` trên các bản ghi `deleted_at IS NULL`. Bảng liên quan: `inspections`, `ncrs`, `projects`, `workshops`, `users`.
- **Changelog:** 
  - `[2026-11-14]` - Hoàn thiện API thống kê thời gian thực, tối ưu render biểu đồ và bộ lọc dữ liệu đã xóa mềm.
  - `[2026-11-20]` - Chuẩn hóa `<Combobox>` bộ lọc đa chiều, co giãn biểu đồ và khoảng đệm đáy `pb-24` trên màn hình nhỏ.
  - `[2026-11-23]` - Khắc phục cảnh báo Recharts `NaN` trên Tooltip biểu đồ (`DefaultTooltipContent2`) khi nhóm xưởng/tháng có `inspected = 0`: bổ sung `fallbackScore` hữu hạn trong `getDashboardStats` (`services/dbService.ts`) và hàm bảo vệ `toSafeNumber`/`clampRate` (`0–100`) tại `Dashboard.tsx`.
  - `[2026-11-26]` - Khắc phục toàn diện bộ lọc và công thức tỷ lệ biểu đồ M01 (`Dashboard.tsx`, `DateRangePicker.tsx`, `services/apiService.ts`, `services/dbService.ts`): tính `avgSuccessRate` / `avgErrorRate` và các biểu đồ Tháng/Xưởng/Công đoạn theo `SUM(passed_qty)/SUM(inspected_qty)` và `SUM(failed_qty)/SUM(inspected_qty)` dạng `float8` (loại bỏ fallback cố định `95.5% / 4.5%` khi `score` trống); ép `deleted_at IS NULL`, hỗ trợ multi-select CSV & không phân biệt hoa/thường (`type`, `project`, `workshop`, `stage`, `qc`, `inspectionStatus`) đồng bộ cho cả `getDashboardStats` lẫn `getNcrs`; chuẩn hóa múi giờ GMT+7 (`Asia/Ho_Chi_Minh`) cho chọn ngày nhanh nguyên tử (`onRangeChange`) và gom nhóm biểu đồ NCR (`DAY`/`WEEK`/`MONTH`/`YEAR`).

### M02. Quản Lý Dự Án (Project Management)
- **Chức năng chính:** Quản lý danh mục công trình (`ma_ct` duy nhất), xem GRID/LIST tự động phân nhóm (`EM*` OEM, `CT*` Nội địa, `AKA*` Nhà Xinh, Nội bộ), lọc theo Status/PM/PC/QA, quản lý tài liệu dự án (`project_documents`) và sơ đồ mặt bằng gắn tọa độ (`floor_plans`, `layout_pins` với `coord_x`, `coord_y` liên kết phiếu `SITE`/`FSR`).
- **Luồng dữ liệu & Quy tắc ISO:** Đồng bộ qua `/api/projects*`, `/api/floor-plans*`, `/api/layout-pins`, `/api/plans`. `ma_ct` là khóa truy xuất nguồn gốc ISO cho toàn bộ Phiếu kiểm tra và NCR.
- **Changelog:** 
  - `[2026-11-14]` - Chuẩn hóa định danh mã công trình và kết nối đồng bộ danh mục dự án.
  - `[2026-11-20]` - Tối ưu responsive `ProjectList`/`ProjectDetail`/`FloorPlanLibrary`/`LayoutManager`, thay toàn bộ `window.confirm()` bằng `<ConfirmDialog>`, áp dụng `<Combobox>` và chuẩn nút chạm `>= 44px`.

### M03. Lịch Nghiệm Thu GCN (Subcontractor Booking & Inspection)
- **Chức năng chính:** Đặt lịch nghiệm thu gia công ngoài (chính sách cutoff 15:00), tra cứu vật tư theo PO (`/api/po-materials/lookup`), danh sách 7 cột hiển thị `suggestedDate` dưới Ngày nghiệm thu và nút tác nghiệp động (`PENDING` → Phân công, `ASSIGNED` → Nghiệm thu SQC, `RETURNED_FOR_SUPPLEMENT` → Nghiệm thu lại/Phân công lại, `COMPLETED` → Chi tiết). Tích hợp `QCAssignmentModal` (chọn QC ưu tiên khối QC kèm tìm toàn nhân sự, nhập `Ghi chú phản hồi` & `Đề xuất ngày nghiệm thu`, 2 chế độ lưu `ASSIGNED`/`RETURNED_FOR_SUPPLEMENT` vào `data` JSONB), đối chiếu tự động (`/api/subcontractor-bookings/reconcile`) và theo dõi chi phí tái kiểm.
- **Luồng dữ liệu & Quy tắc ISO:** Quản lý qua `/api/subcontractor-bookings*`, `/api/subcontractor-inspections`, `/api/subcontractor-reinspection-costs`; bảng `subcontractor_bookings` (có `deleted_at`), `subcontractor_inspections`, `subcontractor_reinspection_costs`. Đóng `BookingDetailModal` trước khi mở `QCAssignmentModal` hoặc chuyển sang chi tiết SQC (Zero Modal Nesting); tự động ghi Audit Trail và gửi thông báo đúng `assigned_qc_id`.
- **Changelog:** 
  - `[2026-11-14]` - Nâng cấp bộ lọc phân công QC chính xác theo user_id và tự động kích hoạt thông báo chuông đúng đối tượng.
  - `[2026-11-18]` - Bổ sung cột `deleted_at` vào cấu trúc bảng `subcontractor_bookings` để đồng bộ cơ chế xóa mềm và khắc phục lỗi truy vấn.
  - `[2026-11-18]` - Tối ưu bảng Booking SQC còn 7 cột chuẩn, bổ sung component `QCAssignmentModal` (chọn QC phụ trách qua `<Combobox>` ưu tiên khối QC, nhập `Ghi chú phản hồi`, `Đề xuất ngày nghiệm thu`), hỗ trợ 2 chế độ lưu `ASSIGNED` / `RETURNED_FOR_SUPPLEMENT` vào cột `data` JSONB kèm Audit Trail và thông báo chuông.
  - `[2026-11-20]` - Tối ưu hiển thị responsive bảng/thẻ mobile, nâng tầng & co giãn toàn màn hình cho `SubcontractorBookingManagement`, `BookingDetailModal`, `QCAssignmentModal`, `SubcontractorSlideGuideModal` (`z-[220]`, `max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]`, `safe-area-inset`, header/footer `shrink-0` không bị che bởi Header/BottomBar/ChatAI), chuẩn hóa nút chạm `>= 44px`.
  - `[2026-11-20]` - Bổ sung 4 nhóm tài liệu đính kèm cấu trúc khi tạo/sửa Book QC (`PR_PO`, `QUALITY_AGREEMENT`, `SAMPLE_IMAGE`, `SPEC_DRAWING`) hỗ trợ đa tệp qua Signed URL (mở rộng MIME Office/CAD/ZIP), chụp ảnh mẫu và dán link Drive/ERP qua `BookingDocumentsUploader`; nâng cấp Card Tài liệu & Lightbox ảnh trong `BookingDetailModal`.
  - `[2026-11-20]` - Chuyển toàn bộ modal M03 (`SubcontractorBookingManagement`, `BookingDetailModal`, `QCAssignmentModal`, `SubcontractorSlideGuideModal`, `QCAssignmentReminderModal`) render qua `createPortal(..., document.body)` loại bỏ lỗi `GlobalHeader`/`MobileBottomBar` đè lên modal và thu gọn padding header/footer sát gọn chữ và nút.
  - `[2026-11-20]` - Siết phân quyền M03 đồng bộ Frontend & Backend HTTP `403` qua `src/utils/m03Rbac.ts` và `server.ts`: cho phép xem danh sách khi có `VIEW`/`VIEW_ALL` nhưng khóa nút sửa/xóa theo `EDIT_OWN`/`EDIT_ALL`/`DELETE_OWN`/`DELETE_ALL` & sở hữu bản ghi (`requesterId`), giới hạn Phân công/Trả lại bổ sung/Đối chiếu SQC cho `SIGN1`/`SIGN2` hoặc `ADMIN`/`MANAGER`/`QA`/`QC_LEAD`, kiểm tra quyền `CREATE` SQC + phân công khi Nghiệm thu, khóa bất biến `COMPLETED`/`CANCELLED`, và đồng bộ gating tại `SubcontractorBookingManagement`, `BookingDetailModal`, `QCAssignmentModal`, `QCAssignmentReminderModal`, `LinkedBookingsBadgeBar`.
  - `[2026-11-23]` - Hỗ trợ quản lý tách bạch PO book nhiều lần kiểm theo từng đợt (`Đợt X/Y` qua CTE `batch_ranks` trong `services/dbService.ts`, phân biệt `Đợt này`/`Đợt khác` tại `BookingDetailModal` & `LinkedBookingsBadgeBar`) và tự động đồng bộ vòng đời booking khi lưu/duyệt phiếu SQC (`upsertInspectionRecord` tại `services/dbModuleService.ts`): chuyển `COMPLETED` khi SQC đạt và chuyển `RETURNED_FOR_SUPPLEMENT` kèm nút/banner `Yêu cầu kiểm lại` khi SQC không đạt.
  - `[2026-11-23]` - Hoàn thiện giải pháp 2 hướng đồng bộ M03 ↔ M05: (1) Rà soát & tự động cập nhật xuống DB các Book QC cũ trước `23/11/2026` có phiếu SQC ở trạng thái `'PENDING'` hoặc đánh dấu lỗi trong JSON `data` sang `COMPLETED` (`Đã nghiệm thu • PASS`) / `RETURNED_FOR_SUPPLEMENT` (`Đã nghiệm thu • FAIL`) theo đối chiếu chặt `booking_id`/`booking_code` hoặc **PO/PR + Ngày nghiệm thu GMT+7** (`evaluateBookingSyncFromSqc` & `buildRelatedSqcSummaryForBooking`); (2) Đồng bộ `buildSqcPrefillFromBooking` (GMT+7) giữa luồng **Nghiệm thu** M03 và thao tác chọn **Mã Book QC** trực tiếp trên form SQC mới (`BookingSelectorField`), tự động đồng bộ trạng thái Book QC ngay khi lưu/gửi báo cáo SQC.
  - `[2026-11-23]` - Bổ sung tính năng **Gán trạng thái phiếu Book QC thủ công (PASS/FAIL)** ngay trong `BookingDetailModal` (biểu mẫu mở rộng tại chỗ, Zero Modal Nesting) kèm RBAC `canManualOverrideM03Booking` (`SIGN1`/`SIGN2`/`ADMIN`/`MANAGER`/`QA`/`QC_LEAD`) và endpoint `POST /api/subcontractor-bookings/:id/manual-status` (Optimistic Locking `version` `409`, ghi `audit_logs` `MANUAL_OVERRIDE_BOOKING_STATUS`, thông báo chuông), nhập lý do bắt buộc & mã phiếu SQC tham chiếu (tùy chọn); bảo toàn trạng thái gán thủ công qua mọi lần tải lại M03 / đối chiếu tự động (`evaluateBookingSyncFromSqc`) cho đến khi có phiếu SQC mới được gắn vào Mã Book QC sau thời điểm gán thủ công (`upsertInspectionRecord`).
  - `[2026-11-24]` - Nâng cấp hỗ trợ **nhiều mã PO / PR trong 1 mã Book QC** (`poNumbers` + gắn `poNumber` riêng từng dòng hạng mục qua `src/utils/poTokens.ts`): mở rộng tìm kiếm, hiển thị đầy đủ trên bảng/panel mở rộng/chi tiết/selector/traceability M03 ↔ M05, cảnh báo vàng không chặn lưu nếu các PO/PR thuộc nhiều Nhà cung cấp khác nhau, và giữ đối chiếu Đợt & SQC theo `booking_id`/`booking_code` và tất cả mã liên kết.
  - `[2026-11-24]` - Khắc phục và nâng cấp toàn diện luồng **tự động tra cứu PO/PR (`lookupPoMaterials`)** từ 2 bảng chỉ đọc `material` & `ipo`: mở rộng truy vấn sang `order`, `projectDefine`, `IPO_Number`, `salesOrder`, `ID_Material`, `ID_Project`, `pmOrderID`, fallback địa chỉ từ `material.street` và hỗ trợ chế độ khớp chính xác `exact=1`; hợp nhất cả 4 thao tác trên ô PO/PR chính (chọn gợi ý, `Enter`, `Thêm mã`, rời ô `onBlur`) để tự điền NCC và thay dòng mẫu / nối thêm hạng mục (kể cả từ mã thứ 2 trở đi) kèm gợi ý & tự điền Tên hàng, ĐVT, SL ngay trên từng dòng hạng mục (`SubcontractorBookingManagement.tsx`).
  - `[2026-11-24]` - Triển khai **Modal Review Tài Liệu Đính Kèm Hợp Nhất (`BookingAttachmentReviewModal`)** tại cả 4 điểm mở M03 (`BookingExpandedDetailPanel`, `BookingDetailModal`, `BookingDocumentsUploader`, `BookingReferenceDocsCard`), loại bỏ mở tab mới (`target="_blank"`) và lightbox đơn lẻ; nạp toàn bộ tài liệu 4 nhóm vào playlist chuyển tiếp (`←`/`→`/`Esc`), tạm ẩn & tự khôi phục modal nguồn tuân thủ Zero Modal Nesting; hỗ trợ xem trực tiếp Ảnh (kể cả `/api/media/image/*` proxy Drive kèm nút chuyển `Xem bản Drive`), PDF nội tuyến (`Content-Disposition: inline`), Excel/CSV (`xlsx` đa sheet) & Văn bản nội tuyến, Google Drive `/preview`, và chặn gửi link nội bộ/cookie-gated (`localhost`/`*.run.app`) sang Google Docs Viewer (cung cấp thẻ tải xuống trực tiếp qua `?download=1`).
  - `[2026-11-25]` - Chuyển Title & Subtitle M03 lên Header toàn cục (`GlobalHeader.tsx`), đồng thời gộp gọn 5 bộ lọc (Từ khóa, Loại nghiệm thu, Xưởng vệ tinh, Trạng thái, Ngày nghiệm thu) vào nút popover icon Bộ lọc nằm chung hàng tác nghiệp với các nút Tạo Book QC, Cập nhật và Tải về, tối ưu hóa không gian cho bảng dữ liệu.

### M04. Nhà Cung Cấp (Supplier Management)
- **Chức năng chính:** Quản lý hồ sơ vendor/xưởng gia công ngoài, Import/Export Excel & CSV, tự động đồng bộ NCC từ booking (`/api/suppliers/sync-from-bookings`) và xem thống kê chất lượng/lịch sử kiểm tra/vật tư theo NCC (`SupplierDetail`).
- **Luồng dữ liệu:** CRUD qua `/api/suppliers*`, `/api/suppliers/stats|inspections|materials`; bảng `suppliers` (Soft Delete `deleted_at`, Optimistic Locking `version`).
- **Changelog:** 
  - `[2026-11-14]` - Đồng bộ thông tin liên hệ nhà cung cấp từ lịch hẹn gia công ngoài.
  - `[2026-11-20]` - Cân chỉnh bảng/thẻ NCC trên mobile, chuẩn `<Combobox>`/`<ConfirmDialog>` và vùng chạm `>= 44px`.
  - `[2026-11-23]` - Chuẩn hóa `score` bằng `Number.isFinite` và định dạng ngày an toàn trong biểu đồ lịch sử `SupplierDetail.tsx` để tránh lỗi `NaN` trên Tooltip Recharts.
  - `[2026-11-27]` - Gộp triệt để **38 nhóm nhà cung cấp trùng** (xóa mềm `89` bản ghi thừa còn `60` NCC duy nhất, điền bù trường trống, chuyển liên kết `subcontractor_bookings.supplier_id` về bản chính, ghi `audit_logs` `MERGE_DUPLICATE_SUPPLIERS`) và tạo Partial Unique Index `uq_suppliers_norm_name_active` (`WHERE deleted_at IS NULL`) trong `services/migrationService.ts`; nâng cấp `upsertSupplier` dùng transaction + `pg_advisory_xact_lock`, hợp nhất thông minh, bỏ qua `UPDATE` khi dữ liệu không đổi (chặn tăng `version` thừa khi chạy `syncSuppliersFromBookings`), sửa phân trang `getSuppliers` (`/api/suppliers` & `SubcontractorBookingManagement.tsx`), đồng bộ trường thống kê `getSupplierStats` và sửa lỗi `TypeError: inspections.flatMap is not a function` do chưa tách `.items` tại `SupplierDetail.tsx`.

### M05. Danh Sách Phiếu (Inspection / SQC List)
- **Chức năng chính:** Quản lý **10 biểu mẫu kiểm tra** (`IQC`, `PQC`, `SQC_VT`, `SQC_BTP`, `SQC_TP`, `FQC`, `FSR`, `SITE`, `STEP`, `SPR` — kèm tương thích ngược `SQC_MAT`) với 10 form nhập & 10 màn hình chi tiết. Giao diện 4 cột tuần tự GMT+7 (Thời gian + nút Tất cả → Dự án → Phiếu kèm cảnh báo SLA >12h vàng / >24h đỏ & `LinkedBookingsBadgeBar` → Chi tiết), ký duyệt 2 cấp (`TwoTierApproval` + `SignaturePad`), chỉnh sửa ảnh (`ImageEditorModal`).
- **Luồng dữ liệu & Quy tắc ISO:** Bảng `inspections` + 11 bảng `forms_*` (`forms_iqc`, `forms_pqc`, `forms_sqc_vt`, `forms_sqc_btp`, `forms_sqc_tp`, `forms_sqc_mat`, `forms_fqc`, `forms_fsr`, `forms_step`, `forms_spr`, `forms_site`), `audit_logs`, `status_history`. Đồng bộ qua `/api/inspections/sync`; ép buộc State Machine ISO, Optimistic Locking (`version` `409`), khóa bất biến `LOCKED` (`403`), chặn xóa mềm phiếu đã `LOCKED`/`VERIFIED`/`COMPLETED`, và proxy ảnh Google Drive + Workspace OAuth (`drive.readonly`).
- **Changelog:** 
  - `[2026-11-14]` - Khôi phục luồng hiển thị 4 cột tuần tự, hoàn thiện API dates/projects theo GMT+7 và tích hợp ISO Audit Trail.
  - `[2026-11-17]` - Ép buộc State Machine chuẩn ISO (`DRAFT → SUBMITTED → APPROVED/REJECTED → VERIFIED → LOCKED`) kèm ánh xạ dữ liệu cũ, Optimistic Locking (`version` `409`), khóa bất biến `LOCKED` (`403`), đồng bộ `TwoTierApproval`, 10 form nhập & 10 chi tiết phiếu.
  - `[2026-11-18]` - Khắc phục triệt để lỗi hiển thị ảnh Google Drive qua bộ đệm Proxy đa tầng CDN (`drive.google.com/thumbnail`, `lh3.googleusercontent.com`, `drive.google.com/uc?export=download`), mở `isPublicApiRoute` cho `/api/media/image/*`, mở rộng trích xuất trường ảnh và tích hợp Google Workspace OAuth (`drive.readonly`) nạp trực tiếp ảnh nội bộ doanh nghiệp.
  - `[2026-11-19]` - Tạo bảng chỉ mục `"appQAQC"."inspection_traceability_index"` kèm 3 B-Tree index, auto-sync theo vòng đời phiếu (upsert/soft-delete/restore/purge), backfill nền trên toàn bộ 11 bảng `forms_*` & `inspections`, đối chiếu trực tiếp trùng `Mã NM` hoặc `Số PO / PR`, hiển thị thanh compact mở Drawer phải.
  - `[2026-11-20]` - Đồng bộ UX/UI 10 form nhập & 10 màn hình chi tiết + `TwoTierApproval` + `SignaturePad` (scale tọa độ cảm ứng theo tỷ lệ canvas), thêm `pt-16 sm:pt-4` tránh đè QR, `lg:pr-24` chừa nổi `ChatAI`, chuyển `<select>`/`window.confirm()` sang `<Combobox>`/`<ConfirmDialog>`.
  - `[2026-11-20]` - Tự động đồng bộ 4 nhóm tài liệu đính kèm từ Booking QC (`buildSqcDocsFromBooking`) sang phiếu `SQC_VT`, `SQC_BTP`, `SQC_TP` (form nhập & màn hình chi tiết) qua `BookingReferenceDocsCard` kèm ký URL tải tệp/ảnh (`/api/inspections/:id`).
  - `[2026-11-23]` - Khắc phục lỗi không cuộn dọc được chi tiết phiếu `SQC-BTP` & `SQC-TP` khi mở từ Chi tiết Booking QC (M03) và đồng bộ cơ chế cuộn cho toàn bộ 10 biểu mẫu chi tiết (`IQC`, `PQC`, `SQC_VT`, `SQC_BTP`, `SQC_TP`, `FQC`, `FSR`, `SITE`, `SPR`, `STEP`): thay Fragment rỗng tại `SQC_BTP`/`SQC_TP` bằng khung `flex flex-col h-full min-h-0 overflow-hidden`, bổ sung `flex flex-col min-h-0` tại khung `DETAIL` và đặt lại cuộn `main-scroll-container` trong `App.tsx`, đồng thời thêm `min-h-0` cho vùng cuộn nội dung ở cả 10 màn hình chi tiết để giữ cố định thanh trên/dưới và cuộn mượt phần nội dung giữa trên Desktop/Mobile.
  - `[2026-11-23]` - Bổ sung `BookingSelectorField` (dùng `<Combobox>` chuẩn hệ thống) vào Phần I của cả 3 form `SQC_VT`, `SQC_BTP`, `SQC_TP` cho phép tìm chọn hoặc gỡ liên kết **Mã Book QC** và tự điền **PO/LSX, Nhà cung cấp, Địa chỉ, Ngày kiểm tra (GMT+7), Tài liệu đính kèm, Hạng mục/Vật tư** (kèm `<ConfirmDialog>` xác nhận ghi đè danh mục nhập tay); đồng thời hiển thị badge & trường **`Mã Book QC`** trên header & lưới thông tin của 3 màn hình chi tiết `SQC_VT`, `SQC_BTP`, `SQC_TP`.
  - `[2026-11-25]` - Chuẩn hóa phân quyền phê duyệt cấp L2 (`SIGN2`) & Khóa hồ sơ ISO (`LOCKED`) cho M05 đồng bộ Frontend–Backend: giới hạn quyền `SIGN2`/`LOCKED` cho `ADMIN`, `MANAGER`, `QA` và user có quyền `SIGN2` từ `userPermissions` hoặc `qms_roles` (loại bỏ `QC_LEAD` khỏi `SIGN2`, mở rộng kiểm tra theo `type`/`SQC_VT↔SQC_MAT`/`INSPECTIONS`/`LIST`, và gỡ bỏ giới hạn `to_qc` đối với L2 — chỉ giữ `isAuthorizedTeam` cho L1); ép buộc điều kiện tiên quyết phải có chữ ký L2 (`managerSignature`) mới mở nút và cho phép chuyển `LOCKED` (`400`); đồng bộ cập nhật cột `version` vào cả bảng `inspections` lẫn `forms_*` trong `upsertInspectionRecord` chống lỗi `409` khi ký L1 → L2 → `LOCKED` liên tiếp; loại bỏ `window.alert()` trong `TwoTierApproval.tsx` & `App.tsx` `onApprove`.

### M06. Danh Sách NCR (Non-Conformance Report)
- **Chức năng chính:** Quản lý sự cố không phù hợp, lọc theo Thời gian/Dự án/Xưởng/QC/Mức độ/Trạng thái, Import/Export, phân tích Nguyên nhân gốc rễ, Hành động khắc phục/phòng ngừa, gán người phụ trách (`responsiblePerson`) và hạn xử lý (`NCRDetail`).
- **Luồng dữ liệu & Quy tắc ISO:** Truy vấn `/api/ncrs*` (`LEFT JOIN inspections` theo `inspection_id`) trên bảng `ncrs`; lưu qua `saveNcrMapped` kèm `version` Optimistic Locking, ép State Machine (`OPEN → ASSIGNED/CORRECTED → VERIFIED → CLOSED`), giới hạn quyền `VERIFIED`/`CLOSED` và khóa bất biến `CLOSED` (`403`).
- **Changelog:** 
  - `[2026-11-14]` - Bổ sung liên kết dữ liệu từ bảng inspections vào danh sách NCR và hoàn thiện state machine.
  - `[2026-11-17]` - Ép buộc State Machine NCR (`OPEN → ASSIGNED → CORRECTED → VERIFIED → CLOSED`) kèm ánh xạ `IN_PROGRESS → CORRECTED`, khóa bất biến `CLOSED` (`403`), thêm bước thẩm tra `VERIFIED` và sửa lỗi gọi `saveNcrMapped` tại `NCRDetail`.
  - `[2026-11-20]` - Chuẩn hóa `<Combobox>` mức độ nghiêm trọng & `<ConfirmDialog>` đóng hồ sơ NCR, `flex-wrap` tiêu đề trên màn hình hẹp và vùng chạm `>= 44px`.

### M07. Thư Viện Lỗi (Defect Library)
- **Chức năng chính:** Danh mục lỗi chuẩn phân nhóm Accordion theo công đoạn (`stage` lấy từ xưởng), phân loại kỹ thuật, mức độ (`MINOR`, `MAJOR`, `CRITICAL`), ảnh mẫu Đúng/Sai (`correctImage`/`incorrectImage`), nguyên nhân & cách khắc phục gợi ý; hỗ trợ Import/Export Excel & CSV.
- **Luồng dữ liệu & Quy tắc ISO:** Quản lý qua `/api/defect-library*` và bảng `defect_library`, đảm bảo Single Source of Truth khi chọn lỗi trong M05 & M06.
- **Changelog:** 
  - `[2026-11-14]` - Chuẩn hóa danh mục mã lỗi phục vụ kiểm tra nhanh.
  - `[2026-11-20]` - Chuyển xác nhận xóa lỗi thư viện sang `<ConfirmDialog>`, tối ưu modal `max-h-[92dvh]` và nút chạm `>= 44px`.

### M08. Quản Lý Vật Liệu (material — Read-Only)
- **Chức năng chính:** Tra cứu phân trang (50 dòng/trang) danh mục nguyên vật liệu, chứng từ PO, Tender, Factory Order từ ERP và xuất CSV/Excel phục vụ kiểm tra IQC/SQC/Booking.
- **Ràng buộc tối thượng (MANDATORY):** READ-ONLY TUYỆT ĐỐI trên bảng `material`. Cấm mọi lệnh ghi; `readOnlyMaterialGuard` tại `server.ts` chặn cứng `POST/PUT/DELETE /api/materials*` và `POST /api/import/materials` với HTTP `403`.
- **Changelog:** 
  - `[2026-11-14]` - Đảm bảo ràng buộc Read-only tuyệt đối cho bảng nguyên vật liệu.

### M09. Quản Lý CCDC (Tools & Assets Management)
- **Chức năng chính:** Quản lý vòng đời công cụ dụng cụ đo lường qua 2 tab (`MY_TOOLS` thiết bị đang giữ & `KHO` danh mục/kho tổng): tạo danh mục, nhập cá thể thiết bị, luân chuyển giữa `KHO_TONG` và nhân sự QC kèm chữ ký bàn giao (`SignaturePad`), và theo dõi lịch sử/hạn hiệu chuẩn (Calibration).
- **Luồng dữ liệu:** Quản lý qua `/api/tool-catalogs*`, `/api/tool-assets*`, `/api/tool-transfers`, `/api/tool-calibrations` với 4 bảng PostgreSQL thực tế: `tool_catalogs`, `tool_assets`, `tool_transfers`, `tool_calibrations`.
- **Changelog:** 
  - `[2026-11-14]` - Quản lý vòng đời và lịch sử hiệu chuẩn CCDC.
  - `[2026-11-18]` - Chuẩn hóa tên bảng PostgreSQL thực tế (`tool_catalogs`, `tool_assets`, `tool_transfers`, `tool_calibrations`) trong bộ nhớ hệ thống.
  - `[2026-11-20]` - Thay toàn bộ `window.confirm()` import/xóa danh mục & tài sản bằng `<ConfirmDialog>`, chuẩn hóa `<Combobox>` trạng thái và vùng chạm `>= 44px`.
  - `[2026-11-24]` - Đồng bộ 100% truy vấn PostgreSQL (`specifications`, `manual_markdown`, `manual_pdf_url`, `next_calibration_date`, `tool_asset_ids` JSONB, `tool_asset_id`, `requested_by`, `approved_by`) và xóa `.catch(() => ({ rows: [] }))` trên API CCDC; siết RBAC trên `/api/tool-*` và tách tab UI (`QC_INSPECTOR` chỉ mở `MY_TOOLS`, Quản lý mặc định `KHO`); chuẩn hóa luân chuyển 2 bước (Bước 1 `PENDING` → Bước 2A Người nhận ký → Bước 2B Quản lý duyệt `APPROVED` mới đổi chủ sở hữu), đồng bộ hạn hiệu chuẩn, bỏ 100% `window.alert()`, bổ sung banner lỗi kèm nút **Thử lại** và Dark Mode.

### M10. IPO Data (ipo — Read-Only)
- **Chức năng chính:** Tra cứu đơn hàng sản xuất ERP (Factory Order, Tender, SL IPO) phân nhóm theo dự án (`IPOPage`, xuất CSV/Excel) và quản lý thông tin mở rộng tại `IPODetail` qua 4 bảng phụ trợ ghi được (`ipo_details`, `ipo_drawing_list`, `ipo_material_history`, `ipo_sample_history`).
- **Ràng buộc tối thượng (MANDATORY):** READ-ONLY TUYỆT ĐỐI đối với bảng gốc `ipo`. Mọi hành vi ghi hoặc `POST /api/import/ipo` trả HTTP `403`. Chỉ cho phép ghi vào các bảng phụ trợ qua `/api/ipo/detail|drawings|materials|samples`.
- **Changelog:** 
  - `[2026-11-14]` - Duy trì ràng buộc Read-only tuyệt đối cho đơn hàng sản xuất IPO.
  - `[2026-11-19]` - Liên kết `TraceabilityPanel` trong `IPODetail` truy xuất chặt chẽ theo `ma_nha_may` (loại bỏ khớp nhầm `ma_ct`), duy trì Read-Only tuyệt đối trên bảng `ipo`.
  - `[2026-11-20]` - Tối ưu co giãn responsive chi tiết IPO trên màn hình nhỏ (`>= 44px` touch targets, `pb-24` bottom clearance), giữ nguyên khóa Read-Only bảng `ipo`.

### M11. Cài Đặt (Settings & RBAC)
- **Chức năng chính:** Tổ chức thành 7 tab cấu hình (`TEMPLATE`, `USERS`, `WORKSHOPS`, `DEPARTMENTS`, `ROLES`, `SYSTEM_AUDIT`, `PROFILE`) quản lý tài khoản, Import nhân sự, lịch sử hoạt động (`/api/users/:userId/activity`), cơ cấu 3 cấp (`departments` → `divisions` → `teams`), xưởng/công đoạn (`workshops`), checklist mẫu (`templates`), vai trò động (`qms_roles`), hồ sơ cá nhân và giám sát lỗi API (`SystemAuditPanel` / `api_error_logs`).
- **Luồng dữ liệu & Quy tắc ISO:** Kiểm soát bởi `requireAdmin`, chống tự nâng quyền tại `POST /api/users` và chống IDOR tại `/api/notifications`.
- **Changelog:** 
  - `[2026-11-14]` - Củng cố hệ thống phân quyền RBAC và cấu hình biểu mẫu.
  - `[2026-11-17]` - Siết RBAC Server-Authoritative cho Users/Roles/Workshops/Templates/Tổ chức, chặn tự nâng quyền tại `POST /api/users` và chống IDOR trên các API `/api/notifications`.
  - `[2026-11-20]` - Tối ưu responsive toàn bộ 7 tab Cấu hình (`Settings`, `UserManagement`, `WorkshopManagement`, `DepartmentManagement`, `TemplateEditor`, `SystemAuditPanel`, `UserActivityList`) và các modal chức năng (`z-[220]+`, `max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]`, `safe-area-inset`, dropdown inline không cắt góc), thay toàn bộ `window.confirm()` bằng `<ConfirmDialog>` và chuyển bộ lọc sang `<Combobox>`.
  - `[2026-11-20]` - Rà soát và hoàn thiện 3 lớp (UI/API/RBAC) cho toàn bộ 7 tab Cài đặt (M11): khôi phục đầy đủ tab Quản lý Vai trò (`RoleManagement` kèm ma trận quyền khóa Read-Only `MATERIALS`/`IPO`, kiểm tra ràng buộc xóa vai trò đang dùng `409` và audit log); đồng bộ RBAC chế độ chỉ đọc (`isReadOnly`/`canExport`) cho `TemplateEditor`/`WorkshopManagement`/`DepartmentManagement`; sửa lỗi chọn Role + nạp quyền mẫu, phân trang 50 dòng & nhập Excel upsert theo khóa tự nhiên (bảo toàn mật khẩu/quyền cũ, mặc định `'123456'`) tại `UserManagement`; sửa `PROFILE` dùng `POST /api/auth/change-password` xác thực mật khẩu cũ; sửa rò rỉ state modal tổ chức và khóa `SYSTEM_AUDIT` chỉ cho `ADMIN`.

### M12. Thùng Rác (Trash & Soft Delete)
- **Chức năng chính:** Quản lý phiếu đã xóa mềm (`deleted_at IS NOT NULL`) với Mobile Cards & Desktop Table, xem nhanh toàn bộ nội dung trước khi xử lý (`Quick Review Modal`), khôi phục đơn lẻ/hàng loạt kèm ghi log `RESTORE_ACTION` vào `audit_logs`, và xóa vĩnh viễn có xác nhận `danger`.
- **Luồng dữ liệu & Ràng buộc:** Truy vấn `/api/inspections/deleted` và khôi phục `/api/inspections/:id/restore` qua `requireTrashAccess`; xóa vĩnh viễn `/api/inspections/:id/permanent` qua `requireAdmin`; chặn xóa mềm các phiếu `LOCKED`/`VERIFIED`/`COMPLETED` (`403`).
- **Changelog:** 
  - `[2026-11-14]` - Triển khai module Thùng rác với cơ chế xóa mềm và khôi phục an toàn kèm Audit Log.
  - `[2026-11-17]` - Siết RBAC (`requireTrashAccess`/`requireAdmin`) cho Thùng rác & System Audit, đồng thời chặn xóa mềm các phiếu đã `LOCKED`/`VERIFIED`/`COMPLETED`.
  - `[2026-11-20]` - Thay toàn bộ `window.confirm()` khôi phục/xóa vĩnh viễn đơn lẻ & hàng loạt bằng `<ConfirmDialog>`, bổ sung `pb-20 lg:pb-6` chống che chân trang trên mobile.

---

# 6. QUY TRÌNH LÀM VIỆC DÀNH CHO AI (TDD DUAL-GATE WORKFLOW)
Để đảm bảo chất lượng code và tính toàn vẹn của hệ thống, Agent BẮT BUỘC tuân thủ nghiêm ngặt vòng lặp 5 Giai đoạn (có 2 Điểm dừng kiểm soát - Gate) được kế thừa từ lõi ECC:

- **GIAI ĐOẠN 1: KHỞI TẠO & PHÂN TÍCH (INTAKE)**
  - Đọc yêu cầu và nạp ngữ cảnh từ 13 Module (M00-M12). Xác định Task thuộc Module nào.
  - Tải lại giới hạn: Nhắc nhở luật Read-only (`ipo`, `material`) và Soft Delete.

- **GIAI ĐOẠN 2: LÊN KẾ HOẠCH (PLANNING & GATE 1) 🛑**
  - Đề xuất danh sách các bước code (Task_list) và liệt kê các tệp sẽ bị thay đổi/tạo mới.
  - **GATE 1 (BẮT BUỘC DỪNG):** Trình bày kế hoạch và DỪNG LẠI chờ User duyệt. Tuyệt đối không sinh code chi tiết ở bước này. Nếu User yêu cầu sửa plan, cập nhật lại cho đến khi được duyệt.

- **GIAI ĐOẠN 3: THỰC THI (QMS TDD & HOOKS)**
  - Sau khi User duyệt Gate 1, tiến hành sinh code.
  - Code phải tuân thủ chuẩn QMS: API trả Full Payload, UI dùng `<Combobox>`, `<Pagination>`, font Inter/JetBrains.
  - Giả lập Hooks: Không dùng thư viện lạ ngoài chuẩn, tự động tối ưu SQL (chặn N+1).

- **GIAI ĐOẠN 4: REVIEW & BẢO MẬT (SELF-AUDIT)**
  - Agent tự rà soát chéo code vừa sinh: 
    1. Có lệnh INSERT/UPDATE/DELETE nào lọt vào `ipo` hoặc `material` không?
    2. Các bảng nghiệp vụ đã dùng `deleted_at` chưa?
    3. UI có bị lồng Modal sai quy tắc không?
  - Nếu phát hiện lỗi, tự động vòng lại Giai đoạn 3 để sửa.

- **GIAI ĐOẠN 5: CHỐT KẾT QUẢ & GHI NHỚ (GATE 2 & PERSISTENCE) 🛑**
  - Báo cáo tổng hợp thay đổi (Diff / Summary).
  - **GATE 2 (BẮT BUỘC DỪNG):** Chờ User nghiệm thu kết quả. 
  - Khi User chốt OK (LGTM), Agent xuất ra câu lệnh Yêu cầu ghi log Changelog vào đúng Module tương ứng trong phần 5 của `AGENTS.md`.