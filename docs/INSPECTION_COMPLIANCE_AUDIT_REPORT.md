# BÁO CÁO KIỂM TOÁN TUÂN THỦ QUY TRÌNH INSPECTION (PQC, FQC, SQC) — QMS v3.1.0

- **Đối tượng kiểm toán:** Hệ thống QMS v3.1.0 của AA Corporation — Các phân hệ Inspection (`InspectionList`, `PQC`, `FQC`, `SQC_VT`, `SQC_BTP`, `SQC_TP`, `TwoTierApproval`, `SignaturePad` cùng tầng Backend API/DB liên quan)
- **Tài liệu chuẩn đối chiếu:** `/AGENTS.md` (v3.1.0 — Ràng buộc tối thượng, Mục 1 Kiến trúc & Chiến lược dữ liệu, Mục 2 State Machine ISO, Mục 3 Quy chuẩn UX/UI & Hệ thống Component, Mục 4 Đặc tả Module M05 / M08 / M10 / M12)
- **Phạm vi thực hiện:** Kiểm toán chỉ đọc (Read-only Audit) toàn bộ chuỗi Full-stack và đề xuất lộ trình khắc phục 4 giai đoạn (không chỉnh sửa mã nguồn ứng dụng)
- **Ngày lập báo cáo:** `2026-11-17`

---

## 1. Tóm tắt điều hành & Bảng điểm tuân thủ (Executive Summary & Scorecard)

Phân hệ Inspection hiện tuân thủ tốt **ràng buộc Read-Only đối với hai bảng ERP nguồn (`ipo` và `material`)**, đồng thời đã cải thiện tốt **kích thước vùng chạm trên thiết bị di động (`min-h-[44px]`)** và **khai báo font chuẩn (`Inter` & `JetBrains Mono`)**. Tuy nhiên, hệ thống vẫn tồn tại các **lỗ hổng nghiêm trọng** về **xác thực/phân quyền RBAC phía Backend**, **tính toàn vẹn State Machine chuẩn ISO**, **khóa bất biến (`LOCKED`) và khóa lạc quan (`version`)**, **rò rỉ dữ liệu Base64 vào Database**, và **chưa áp dụng bộ Component chuẩn `/src/components/qms/`**.

### Bảng tổng hợp mức độ vi phạm

| Mức độ nghiêm trọng | Tóm tắt tình trạng | Số lượng | Nhóm rủi ro trọng yếu |
| :--- | :--- | :---: | :--- |
| **[CRITICAL] Nghiêm trọng** | Vi phạm bảo mật / RBAC / Quy trình ISO cốt lõi | **4** | API Inspection thiếu xác thực & RBAC; Backend thiếu kiểm soát chuyển trạng thái ISO và cho phép ghi đè bản ghi `LOCKED`; Đảo ngược thứ tự duyệt L1/L2 & cho phép sếp/Admin nhảy cóc; `ADMIN` vượt rào `LOCKED` trong `types.ts` |
| **[HIGH] Cao** | Vi phạm toàn vẹn dữ liệu / Kiến trúc / Điều hướng | **7** | Thiếu Optimistic Locking (`version`); Khóa chính không dùng `UUID` (`TYPE-timestamp`); Lỗi stale-closure gửi Base64 vào DB tại FQC/SQC & PQC lưu thẳng chữ ký Base64 + upload lưu ổ đĩa cục bộ thay vì Signed URL; Lỗ hổng truy vấn fallback bản ghi đã xóa mềm & thiếu đồng bộ bảng `ncrs`; Log Audit JSONB thiếu snapshot đầy đủ; Cờ `splitRequired` tại SQC-TP bị bỏ qua; Lồng `<NCRDetail>` và xếp chồng Modal |
| **[MEDIUM] Trung bình** | Chưa dùng UI Kit chuẩn / Design Tokens / Hiệu năng | **5** | Tỷ lệ dùng `/src/components/qms/` (`<Combobox>`, `<SearchInput>`, `<ConfirmDialog>`, `<PageActions>`, `<Pagination>`) là **0%**; Dùng `<select>` thô và `alert`/`confirm`/`prompt`; Dùng inline `Times New Roman` & `style={{}}`; Tải 1.000–5.000 dòng về client lọc thay vì phân trang server 50 dòng/trang; Thiếu Table Density (`px-3 py-2.5`) và `ErrorBoundary` |
| **[LOW] Thấp** | Chuẩn hóa bảng phụ & Token chữ nhỏ | **2** | Bảng phụ `ipo_sample_history` dùng Hard Delete (`DELETE`); Trôi chuẩn token trạng thái (`PENDING`, `FLAGGED`, `COMPLETED`) và kích thước chữ (`text-[6px]`, `text-[9px]`, `font-black`) |

### Đánh giá theo từng nhóm tiêu chuẩn của `AGENTS.md`

| Nhóm quy tắc (`AGENTS.md`) | Kết luận | Nhận xét chi tiết |
| :--- | :---: | :--- |
| **Ràng buộc 1: Read-Only `ipo` & `material`** | **ĐẠT** *(Lưu ý phụ)* | Không có lệnh ghi nào lên `ipo` hoặc `material`; các route `/api/materials*`, `/api/import/materials`, `/api/import/ipo` đều chặn HTTP `403`. *Lưu ý nhỏ:* bảng phụ `ipo_sample_history` đang dùng Hard Delete. |
| **Ràng buộc 2: Cấm nhảy cóc quy trình ISO** | **KHÔNG ĐẠT** | Backend cho phép nhảy `DRAFT -> APPROVED`, `SUBMITTED -> LOCKED`, lùi trạng thái, và ghi đè khi đã `LOCKED`; Frontend đảo ngược `verified`/`approved` và cho phép `isBoss`/`ADMIN` bỏ qua bước. |
| **§1 Server-Authoritative & JWT RBAC** | **KHÔNG ĐẠT** | Middleware `/api` chỉ giải mã JWT tùy chọn (không trả `401`); toàn bộ API `/api/inspections*` không kiểm tra quyền RBAC; `InspectionList` tải tới 5.000 dòng về trình duyệt để tự lọc. |
| **§1 Hydration API** | **ĐẠT MỘT PHẦN** | `GET /api/inspections/:id` (`getInspectionById`) hydrate đủ JSON từ `forms_*`, nhưng `POST /api/inspections` chưa trả về `version` chuẩn hóa hay dữ liệu tách con từ `SQC_TP`. |
| **§1 PostgreSQL (`UUID`, `BIGINT`, `snake_case`, `version`)** | **KHÔNG ĐẠT** | Đã dùng `BIGINT` Unix timestamp và `snake_case`, **nhưng** khóa chính là chuỗi timestamp (`PQC-17...`) thay vì `UUID`, và thiếu cột `version` chống ghi đè đồng thời. |
| **§1 Xóa mềm (`deleted_at IS NULL`, cấm Hard Delete)** | **ĐẠT MỘT PHẦN** | `softDeleteInspectionRecord` cập nhật `deleted_at` trên `forms_*`, **nhưng** nhánh fallback bảng `inspections` trong `getInspectionById` thiếu điều kiện `status <> 'DELETED'`, và API xóa vĩnh viễn không có kiểm tra quyền Admin. |
| **§1 ISO Traceability & Audit Gate (`JSONB` cũ/mới)** | **ĐẠT MỘT PHẦN** | Có ghi `audit_logs` khi tạo/sửa/xóa, **nhưng** `oldValue`/`newValue` chỉ lưu tóm tắt `{ status, type, ma_ct, score }` thay vì toàn bộ snapshot, và NCR lồng trong phiếu chưa đồng bộ sang bảng `ncrs`. |
| **§1 Điều hướng (Cấm lồng Modal, Route + `returnView`)** | **KHÔNG ĐẠT** | `inspectiondetailPQC.tsx` và `inspectiondetailSQC_VT.tsx` nhúng thẳng `<NCRDetail>` bên trong view chi tiết; các form xếp chồng nhiều lớp Modal (`NCRModal`, `ImageEditorModal`, v.v.). |
| **§1 Xử lý File (Signed URL, CẤM Base64 vào DB)** | **KHÔNG ĐẠT** | `/api/upload` lưu file vào ổ đĩa server (`/uploads/...`); `PQC` lưu thẳng chữ ký Base64; `FQC`, `SQC_VT`, `SQC_BTP`, `SQC_TP` mắc lỗi stale-closure nên vẫn gửi chuỗi Base64 vào DB. |
| **§2 Workflow State Machine** | **KHÔNG ĐẠT** | Chuẩn bắt buộc: `draft -> submitted -> approved/rejected -> verified -> locked`. Thực tế dùng lẫn `PENDING`, `FLAGGED`, `COMPLETED`, đảo `verified`/`approved`, và chưa có luồng chuyển sang `locked`. |
| **§3 UX/UI Design Tokens & Hệ thống Component** | **KHÔNG ĐẠT** | Còn inline `Times New Roman` và `style={{}}`; không dùng bộ `/src/components/qms/`; dùng phổ biến `<select>` thô và `window.alert`/`confirm`/`prompt`. |
| **§3.5 Responsive & Vùng chạm thao tác** | **ĐẠT** *(Cần lưu ý)* | Các form và detail đã đặt `min-h-[44px]`/`min-w-[44px]` (`lg:min-h-[38px]`); cần kiểm thử lại thanh kéo 4 cột ở `InspectionList` sau khi chuẩn hóa giao diện. |

---

## 2. Phạm vi & Phương pháp kiểm toán

### Các tệp đã rà soát (Chỉ đọc)

- **Chuẩn đối chiếu & Kiểu dữ liệu:** `/AGENTS.md`, `/types.ts`, `/index.html`, `/src/components/qms/index.ts`
- **Backend API & Tầng dữ liệu:** `/server.ts`, `/services/dbModuleService.ts`, `/services/dbService.ts`
- **Danh sách phiếu & Bộ máy phê duyệt:** `/components/InspectionList.tsx`, `/components/TwoTierApproval.tsx`, `/components/SignaturePad.tsx`, `/components/SearchableSelect.tsx`
- **Biểu mẫu tạo/sửa phiếu (Forms):** `/components/inspectionformPQC.tsx`, `/components/inspectionformFQC.tsx`, `/components/inspectionformSQC_VT.tsx`, `/components/inspectionformSQC_BTP.tsx`, `/components/inspectionformSQC_TP.tsx`
- **Màn hình chi tiết & Duyệt phiếu (Details):** `/components/inspectiondetailPQC.tsx`, `/components/inspectiondetailFQC.tsx`, `/components/inspectiondetailSQC_VT.tsx`, `/components/inspectiondetailSQC_BTP.tsx`, `/components/inspectiondetailSQC_TP.tsx`

### Thang phân loại mức độ (Severity Rubric)

- **CRITICAL (Nghiêm trọng):** Thiếu xác thực/RBAC, phá vỡ quy tắc Read-Only, nhảy cóc State Machine ISO, hoặc cho phép sửa đổi bản ghi đã `LOCKED`.
- **HIGH (Cao):** Thiếu Optimistic Locking, thiếu tính toàn vẹn Audit/Soft-Delete/Hydration, lưu Base64 vào DB / thiếu Signed URL, cờ nghiệp vụ chết, hoặc lồng Modal sai quy tắc điều hướng.
- **MEDIUM (Trung bình):** Chưa sử dụng bộ component chuẩn `/src/components/qms/`, dùng `<select>` thô hoặc `alert`/`confirm`/`prompt`, dùng inline style / font không chuẩn, tải dữ liệu quá lớn về client, thiếu chuẩn bảng `px-3 py-2.5` hoặc `ErrorBoundary`.
- **LOW (Thấp):** Sai lệch nhỏ về typography token hoặc bảng phụ.

---

## 3. Ma trận so sánh tuân thủ theo từng phân hệ

| Tiêu chí kiểm toán | `InspectionList` | `PQC` (Form/Detail) | `FQC` (Form/Detail) | `SQC_VT` (Form/Detail) | `SQC_BTP` (Form/Detail) | `SQC_TP` (Form/Detail) | `TwoTierApproval` | `Backend API / DB` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Read-Only `ipo` & `material`** | N/A | **ĐẠT** | **ĐẠT** | **ĐẠT** | **ĐẠT** | **ĐẠT** | N/A | **ĐẠT** |
| **Xác thực JWT & RBAC** | Một phần (UI) | Một phần (UI) | Một phần (UI) | Một phần (UI) | Một phần (UI) | Một phần (UI) | **LỖI** (Sếp vượt cấp) | **LỖI** (Không chặn API) |
| **ISO State Machine (`draft->submitted->approved/rejected->verified->locked`)** | Một phần | **LỖI** (`PENDING`/`FLAGGED`) | **LỖI** (`PENDING`/`FLAGGED`) | **LỖI** (`PENDING`/`COMPLETED`) | **LỖI** (`PENDING`/`COMPLETED`) | **LỖI** (`PENDING`/`COMPLETED`) | **LỖI** (Đảo `verified` <-> `approved`) | **LỖI** (Cho phép nhảy cóc & ghi đè `LOCKED`) |
| **Khóa bất biến (`LOCKED`)** | N/A | **LỖI** (ADMIN/Mgr sửa được) | **LỖI** (Khóa theo `APPROVED`) | **LỖI** (Khóa theo `COMPLETED`) | **LỖI** (Khóa theo `COMPLETED`) | **LỖI** (Khóa theo `COMPLETED`) | **LỖI** (Khóa tại `APPROVED`) | **LỖI** (`LOCKED->LOCKED` vẫn UPDATE) |
| **Optimistic Locking (`version`)** | N/A | **LỖI** | **LỖI** | **LỖI** | **LỖI** | **LỖI** | **LỖI** | **LỖI** |
| **Khóa chính `UUID`** | N/A | **LỖI** (`PQC-ts`) | **LỖI** (`FQC-ts`) | **LỖI** (`SQC-VT-ts`) | **LỖI** (`SQC-BTP-ts`) | **LỖI** (`SQC-TP-ts`) | N/A | **LỖI** |
| **Cấm Base64 vào DB / Signed URL** | N/A | **LỖI** (Chữ ký Base64) | **LỖI** (Stale closure) | **LỖI** (Stale closure) | **LỖI** (Stale closure) | **LỖI** (Stale closure) | **LỖI** (Chữ ký Base64) | **LỖI** (Lưu ổ đĩa `/uploads`) |
| **Không lồng Modal / View con** | **ĐẠT** | **LỖI** (`NCRDetail` + Modal chồng) | **LỖI** (Modal chồng) | **LỖI** (`NCRDetail` + Modal chồng) | **LỖI** (Modal chồng) | **LỖI** (Modal chồng) | Modal ký duyệt | N/A |
| **Bộ Component `/src/components/qms/`** | **LỖI** (0%) | **LỖI** (0%) | **LỖI** (0%) | **LỖI** (0%) | **LỖI** (0%) | **LỖI** (0%) | **LỖI** (0%) | N/A |
| **Cấm `<select>` thô & `alert/confirm/prompt`** | **LỖI** (`confirm`/`alert`) | **LỖI** (`<select>` + `alert`/`prompt`) | **LỖI** (`<select>` + `alert`/`prompt`) | **LỖI** (`<select>` + `alert`/`confirm`) | **LỖI** (`alert`/`confirm`) | **LỖI** (`<select>` + `alert`/`confirm`) | **LỖI** (`alert`/`prompt`) | N/A |
| **Cấm Inline `style={{}}` / `Times New Roman`** | **LỖI** (`Inter` + width inline) | **LỖI** (`Times New Roman`) | **LỖI** (`Times New Roman`) | **LỖI** (`Times New Roman`) | **LỖI** (`Times New Roman`) | **LỖI** (`Times New Roman`) | **ĐẠT** | N/A |
| **Responsive & Vùng chạm (`>= 44px`)** | Một phần | **ĐẠT** | **ĐẠT** | **ĐẠT** | **ĐẠT** | **ĐẠT** | **ĐẠT** | N/A |

---

## 4. Chi tiết các phát hiện kiểm toán theo từng lĩnh vực

### Nhóm A: Ràng buộc tối thượng (`AGENTS.md` §0)

#### [F-A01] Tuân thủ Read-Only đối với bảng `ipo` và `material` — **ĐẠT** *(Lưu ý phụ mức Thấp)*
- **Quy tắc (`AGENTS.md` Ràng buộc 1, M08, M10):** Hai bảng `ipo` và `material` là Read-Only tuyệt đối (`SELECT`/`JOIN` only); nghiêm cấm `INSERT`, `UPDATE`, `DELETE` từ ứng dụng QMS.
- **Hiện trạng ghi nhận:**
  - `server.ts:660-681` và `server.ts:766-783` chặn các route `POST /api/materials`, `PUT /api/materials/:id`, `DELETE /api/materials/:id`, `POST /api/import/materials`, và `POST /api/import/ipo` bằng mã lỗi HTTP `403`.
  - `services/dbModuleService.ts:1670-1768` (`getMaterialsReadOnly`, `getIpoReadOnly`) chỉ thực thi lệnh `SELECT`. Kiểm tra toàn bộ `server.ts`, `services/`, `components/`, và `src/` cho thấy **0 câu lệnh ghi** lên `ipo` hoặc `material`.
- **Lưu ý phụ (`[LOW]`):** Bảng mở rộng phụ `ipo_sample_history` đang thực hiện Hard Delete tại `services/dbModuleService.ts:1887-1890` (`deleteIpoSampleHistoryRecord`) thay vì xóa mềm `deleted_at`.
- **Khuyến nghị:** Duy trì lớp chặn 403 hiện tại, bổ sung test tự động cấm ghi vào `ipo`/`material` trong CI, và chuyển `ipo_sample_history` sang cơ chế xóa mềm.

---

### Nhóm B: Bảo mật Backend, Kiến trúc & Toàn vẹn dữ liệu (`AGENTS.md` §1, §2)

#### [F-B01] API Inspection thiếu Middleware Xác thực JWT & Phân quyền RBAC — **[CRITICAL]**
- **Quy tắc (`AGENTS.md` §1, M11):** Backend phải kiểm soát 100% logic và phân quyền RBAC bằng API Stateless dùng JWT.
- **Hiện trạng ghi nhận:**
  - `server.ts:74-124` chỉ giải mã JWT nếu header tồn tại (`verifyJwtToken`) để gán `req.user`, sau đó luôn gọi `next()` mà không trả về `401 Unauthorized` khi thiếu hoặc sai token.
  - Toàn bộ endpoint của M05 trong `server.ts:470-581` (`GET /api/inspections`, `/dates`, `/projects`, `/deleted`, `POST /api/inspections/sync`, `POST /api/inspections`, `GET /api/inspections/:id`, `DELETE /api/inspections/:id`, `POST /api/inspections/:id/restore`, `DELETE /api/inspections/:id/permanent`, `GET /api/inspections/:id/audit-logs`) hoàn toàn **không có middleware `requireAuth` hay `requirePermission`**.
  - Bất kỳ client ẩn danh nào đều có thể gọi trực tiếp API để ghi đè dữ liệu (`POST /api/inspections`), xóa mềm, khôi phục, hoặc **xóa vĩnh viễn dữ liệu kiểm toán** (`DELETE /api/inspections/:id/permanent`) với `actorId = null`.
- **Tác động rủi ro:** Vô hiệu hóa toàn bộ phân quyền RBAC phía server, nguy cơ giả mạo và phá hủy dữ liệu kiểm tra chất lượng.
- **Khuyến nghị:** Bổ sung `requireAuth` (`401`) và `requirePermission` (`403`) cho tất cả route ghi/đồng bộ/thùng rác/audit dưới `/api/inspections*`. Nếu cần chia sẻ link QR công khai (`/?share=<id>`), tách thành một endpoint riêng chỉ đọc (`GET /api/public/inspections/:id`) với dữ liệu đã được lọc an toàn.

#### [F-B02] Kiểm soát State Machine ISO chưa chặt & Lỗ hổng ghi đè bản ghi `LOCKED` — **[CRITICAL]**
- **Quy tắc (`AGENTS.md` Ràng buộc 2 & §2):** Ép buộc chuyển trạng thái một chiều `draft -> submitted -> approved/rejected -> verified -> locked`. Khi đã đạt `locked`, cấm mọi hành vi chỉnh sửa.
- **Hiện trạng ghi nhận (`services/dbModuleService.ts:1242-1255`):**
  - Hiện chỉ có 2 kiểm tra rời rạc:
    1. `if (curStatus === 'LOCKED' && nextStatus !== 'LOCKED')` trả về `403`.
    2. `if (curStatus === 'DRAFT' && (nextStatus === 'VERIFIED' || nextStatus === 'LOCKED'))` trả về `400`.
  - **Lỗ hổng 1 (Ghi đè bản ghi `LOCKED`):** Nếu bản ghi đang ở `LOCKED` và payload gửi lên `status: 'LOCKED'` (hoặc bỏ trống `status`, khi đó `nextStatus` mặc định bằng `curStatus` tại dòng 1247), điều kiện `nextStatus !== 'LOCKED'` trả về `false`. Hàm `upsertInspectionRecord` tiếp tục chạy `ON CONFLICT (id) DO UPDATE` lên bảng `forms_*` (dòng 1342) và `inspections` (dòng 1351), **âm thầm ghi đè toàn bộ nội dung và chữ ký của phiếu đã khóa ISO**.
  - **Lỗ hổng 2 (Nhảy cóc bước):** Không chặn `DRAFT -> APPROVED` và không chặn `SUBMITTED -> LOCKED`.
  - **Lỗ hổng 3 (Lùi trạng thái):** Không chặn `APPROVED -> DRAFT`, `VERIFIED -> DRAFT`, `APPROVED -> SUBMITTED`, `REJECTED -> LOCKED`.
  - **Lỗ hổng 4 (Thiếu kiểm tra vai trò theo bước):** `upsertInspectionRecord` không đối chiếu quyền `SIGN1`/`SIGN2`/Verify/Lock của `actorId` tương ứng với bước chuyển trạng thái.
- **Khuyến nghị:** Thay thế bằng bảng ánh xạ chuyển trạng thái hợp lệ (`ALLOWED_TRANSITIONS`) kèm kiểm tra RBAC theo từng bước; từ chối **mọi** yêu cầu cập nhật khi `curStatus === 'LOCKED'` (kể cả khi `nextStatus === 'LOCKED'`).

```text
LUỒNG CHUẨN MỤC TIÊU (AGENTS.md §2)
  [draft] ──► [submitted] ──► [approved / rejected] ──► [verified] ──► [locked (Bất biến)]

THỰC TẾ BACKEND HIỆN TẠI (dbModuleService.ts:1245-1255)
  [DRAFT] ──► [APPROVED]           (CHO PHÉP - bỏ qua bước submitted!)
  [SUBMITTED] ──► [LOCKED]         (CHO PHÉP - bỏ qua bước approved & verified!)
  [APPROVED/VERIFIED] ──► [DRAFT]  (CHO PHÉP - tụt lùi trạng thái!)
  [LOCKED] ──► [LOCKED]            (CHO PHÉP - ghi đè toàn bộ dữ liệu phiếu đã khóa!)

THỰC TẾ FRONTEND FORMS & TwoTierApproval.tsx
  Forms gửi lưu dưới trạng thái: [PENDING / FLAGGED] (không phải SUBMITTED)
  L1 (không phải sếp): gán [verified] TRƯỚC khi L2 gán [approved] (ĐẢO NGƯỢC THỨ TỰ!)
  L1 (isBoss):         nhảy thẳng lên [approved]                  (NHẢY CÓC CẤP DUYỆT!)
  L2 (Manager):        gán [approved] và coi như khóa             (KHÔNG BAO GIỜ chuyển sang [verified] -> [locked]!)
```

#### [F-B03] Thiếu Optimistic Locking (`version`) cho bảng `inspections` & `forms_*` — **[HIGH]**
- **Quy tắc (`AGENTS.md` §1):** Xử lý xung đột ghi đồng thời bằng PostgreSQL Optimistic Locking (cột `version`, Server Wins).
- **Hiện trạng ghi nhận:** `services/dbModuleService.ts` đã triển khai cột `version` cho `subcontractor_bookings` (dòng 233, 297, 314–316, 401), **nhưng `upsertInspectionRecord` (dòng 1236–1432) hoàn toàn không kiểm tra hay tăng `version`**.
- **Tác động rủi ro:** Khi QC và Quản lý hoặc Xưởng cùng thao tác trên một phiếu, bản lưu sau sẽ âm thầm ghi đè mất dữ liệu bản lưu trước.
- **Khuyến nghị:** Thêm cột `version INTEGER NOT NULL DEFAULT 1` cho `inspections` và các bảng `forms_*`, kiểm tra `WHERE id = $1 AND version = $2` khi cập nhật và trả về HTTP `409 Conflict` khi xảy ra xung đột.

#### [F-B04] Khóa chính không sử dụng `UUID` — **[HIGH]**
- **Quy tắc (`AGENTS.md` §1):** Khóa chính trong PostgreSQL bắt buộc dùng `UUID`.
- **Hiện trạng ghi nhận:** `dbModuleService.ts:1239` sinh ID dạng `${typeUpper.replace('_', '-')}-${Date.now()}`, và các form Frontend tự sinh `PQC-${Date.now()}`, `FQC-${Date.now()}`, `SQC-VT-${Date.now()}`, `SQC-BTP-${Date.now()}`, `SQC-TP-${Date.now()}`.
- **Tác động rủi ro:** Nguy cơ trùng ID ở mức mili-giây khi nhiều người lập phiếu đồng thời và sai chuẩn cấu trúc schema (`audit_logs` và `ipo_*` đã dùng `crypto.randomUUID()`).
- **Khuyến nghị:** Dùng `crypto.randomUUID()` ở Backend làm khóa chính `id` và tách mã phiếu hiển thị (ví dụ `QMS-PQC-...`) sang một cột mã nghiệp vụ riêng.

#### [F-B05] Lỗ hổng truy vấn xóa mềm, thiếu đồng bộ bảng `ncrs` & Log Audit `JSONB` không đầy đủ — **[HIGH]**
- **Quy tắc (`AGENTS.md` §1, M05, M06, M12):** Mọi truy vấn module chính phải kèm `deleted_at IS NULL`; mọi biến động dữ liệu phải ghi Audit `JSONB` cũ/mới đầy đủ; dữ liệu NCR phải truy xuất đồng nhất.
- **Hiện trạng ghi nhận:**
  1. **Rò rỉ bản ghi đã xóa mềm (`services/dbService.ts:972-979`):** Hàm `getInspectionById` lọc `deleted_at IS NULL` ở các bảng `forms_*`, **nhưng câu lệnh fallback sang bảng `inspections` (`SELECT * FROM inspections WHERE id = $1 LIMIT 1`) không loại trừ `COALESCE(UPPER(status), '') <> 'DELETED'`** (và không kiểm tra `deleted_at IS NULL`). Ngoài ra, `upsertInspectionRecord` (dòng 1335) gán cứng `deleted_at: null` khi conflict nên có thể vô tình khôi phục phiếu đã xóa mà không qua luồng `/restore` + `RESTORE_ACTION`.
  2. **Log Audit thiếu snapshot (`dbModuleService.ts:1422-1429`):** `writeAuditLog` chỉ lưu `{ status }` cho `oldValue` và `{ status, type, ma_ct, score }` cho `newValue`, bỏ sót `items`, `materials`, số lượng và chữ ký. Trong khi đó `TwoTierApproval.tsx:41-99` thiết kế logic so sánh diff chi tiết toàn bộ object (`po_number`, `ten_hang_muc`, `items`, `materials`, `score`, `summary`).
  3. **Thiếu đồng bộ `items[].ncr` vào bảng `ncrs` (`dbModuleService.ts:1236-1432`):** Các NCR nhúng trong `items`/`materials` khi lưu phiếu kiểm tra chỉ nằm trong cột JSON của `forms_*`, không được tự động đồng bộ sang bảng `ncrs` của Module M06.
- **Khuyến nghị:** Bổ sung điều kiện loại trừ bản ghi đã xóa tại fallback `getInspectionById`, chặn upsert ghi đè lên bản ghi đang `DELETED`, ghi full snapshot `JSONB` (trước/sau) vào `audit_logs`, và đồng bộ các NCR nhúng sang bảng `ncrs` trong cùng một PostgreSQL transaction.

#### [F-B06] Lỗi lưu Base64 vào Database & Upload cục bộ thay vì Signed URL — **[HIGH]**
- **Quy tắc (`AGENTS.md` §1):** Upload/Download qua luồng Signed URL lên Storage; **CẤM lưu Base64 vào Database**.
- **Hiện trạng ghi nhận:**
  1. **Lưu file trực tiếp lên ổ đĩa server (`server.ts:1093-1118`):** `POST /api/upload` lưu file multipart vào thư mục `/uploads/...` cục bộ thay vì cấp phát Signed URL tới Object Storage.
  2. **`SignaturePad` xuất trực tiếp chuỗi Base64 (`SignaturePad.tsx:134, 183`):** Trả về `canvas.toDataURL('image/png')` trực tiếp vào state của form.
  3. **`PQC` không upload chữ ký khi gửi (`inspectionformPQC.tsx:582-620, 990-993`):** Hàm `handleSubmit` gửi thẳng `formData` cho `onSave(...)` mà không upload `formData.signature`, khiến chuỗi `data:image/png;base64,...` đi thẳng vào cột `signature_qc` và `data` trong PostgreSQL.
  4. **Lỗi Stale Closure tại `FQC`, `SQC_VT`, `SQC_BTP`, `SQC_TP` (`inspectionformFQC.tsx:267-301`, `inspectionformSQC_VT.tsx:502-555`, `inspectionformSQC_BTP.tsx:467-519`, `inspectionformSQC_TP.tsx:476-528`):** Các form này gọi `uploadQMSImage`, cập nhật URL vào React state thông qua hàm bất đồng bộ `setFormData(...)`, rồi ngay lập tức đọc `const finalForm = formData;` trước khi React re-render — dẫn đến **các URL vừa upload bị bỏ qua và chuỗi Base64 gốc vẫn bị gửi xuống `onSave`**.
- **Khuyến nghị:** Clone `formData` cục bộ và gán trực tiếp URL trả về vào bản clone trước khi gọi `onSave`; xử lý upload chữ ký ở cả `PQC` và `TwoTierApproval`; chặn mọi chuỗi `data:` tại `POST /api/inspections` (`400 Bad Request`); chuyển `/api/upload` sang luồng Signed URL.

#### [F-B07] Cờ `splitRequired` tại `SQC_TP` không được Backend xử lý — **[HIGH]**
- **Quy tắc (`AGENTS.md` §1 Server-Authoritative & M05):** Logic nghiệp vụ tách phiếu phải được thực thi nhất quán ở tầng Backend.
- **Hiện trạng ghi nhận:** `components/inspectionformSQC_TP.tsx:526` truyền thuộc tính `splitRequired: targetStatus !== InspectionStatus.DRAFT && (formData.id || '').split('-').length <= 3`, nhưng `server.ts:517-524` và `dbModuleService.ts:1236-1432` hoàn toàn không đọc hoặc xử lý `payload.splitRequired`.
- **Khuyến nghị:** Triển khai logic tách phiếu theo transaction ở Backend (sinh `UUID` cho các phiếu con kèm Audit Log) hoặc gỡ bỏ cờ nếu nghiệp vụ thực tế chỉ quản lý một phiếu đa vật tư.

---

### Nhóm C: State Machine Frontend, Điều hướng & Chuẩn UX/UI (`AGENTS.md` §1, §2, §3)

#### [F-C01] `ADMIN` vượt rào khóa `LOCKED` & Đảo ngược thứ tự duyệt L1/L2 — **[CRITICAL]**
- **Quy tắc (`AGENTS.md` Ràng buộc 2 & §2):** Luồng chuẩn `draft -> submitted -> approved/rejected -> verified -> locked`; trạng thái cuối là bất biến với mọi vai trò.
- **Hiện trạng ghi nhận:**
  1. **`ADMIN` vượt rào `LOCKED` (`types.ts:543-556`):** Hai hàm `canUserModifyInspection` và `canUserDeleteInspection` đều đặt `if (user.role === 'ADMIN') return true;` **trước** dòng `if (inspection?.status === 'LOCKED') return false;`. Ngoài ra hàm chỉ so sánh chữ hoa `'LOCKED'` và bỏ sót trạng thái `APPROVED`.
  2. **PQC cho phép Quản lý sửa phiếu đã duyệt (`inspectiondetailPQC.tsx:83`):** `isLockedForUser = isApproved && !isManagerOrAdmin && !isGuest;` vẫn cho phép `ADMIN`/`MANAGER` thao tác sửa/xóa sau khi đã `APPROVED`.
  3. **Forms nộp sai trạng thái chuẩn ISO:** `inspectionformPQC.tsx:611` và `inspectionformFQC.tsx:299` nộp bằng `PENDING`/`FLAGGED`; `SQC_VT.tsx:550` và `SQC_BTP.tsx:514` nộp bằng `PENDING`; `SQC_TP.tsx:406-407` nộp bằng `PENDING`/`FLAGGED` thay vì `SUBMITTED`.
  4. **Đảo ngược L1/L2 & sếp ký tắt (`TwoTierApproval.tsx:500-546, 588`):** L1 (`SIGN1`, non-boss) gán `status = 'verified'` (dòng 516) trước khi L2 (`SIGN2`) gán `status = 'approved'` (dòng 544); L1 (`isBoss`, dòng 500–510) bỏ qua quy trình 2 cấp để chuyển thẳng thành `'approved'`; toàn bộ giao diện coi `APPROVED` (hoặc `COMPLETED || APPROVED` tại `inspectiondetailSQC_VT.tsx:98`, `SQC_BTP.tsx:65`, `SQC_TP.tsx:65`) là trạng thái khóa cuối và thiếu hoàn toàn nút chuyển sang `locked`.
- **Khuyến nghị:** Đưa kiểm tra bất biến `LOCKED` lên đầu tiên trước mọi kiểm tra role (kể cả `ADMIN`), chuẩn hóa submit về `submitted`, sửa thứ tự `TwoTierApproval` thành `submitted -> approved/rejected -> verified -> locked`, và bỏ nhánh nhảy cóc `isBoss`.

#### [F-C02] Lồng ghép Modal / Nhúng view con sai quy tắc điều hướng — **[HIGH]**
- **Quy tắc (`AGENTS.md` §1 Điều hướng):** **TUYỆT ĐỐI KHÔNG lồng Modal chồng chéo.** Khi mở form chi tiết từ một view/modal, phải đóng modal hiện tại và chuyển view bằng Route kèm `returnView`.
- **Hiện trạng ghi nhận:**
  - `components/inspectiondetailPQC.tsx:230` và `components/inspectiondetailSQC_VT.tsx:231` (cùng import tại `inspectiondetailSQC_BTP.tsx:19`, `SQC_TP.tsx:19`) render trực tiếp `<NCRDetail ... />` bên trong màn hình chi tiết phiếu kiểm tra thay vì điều hướng qua Route kèm `returnView`.
  - Tất cả 5 biểu mẫu đều mở chồng các lớp modal (`NCRModal`, `ImageEditorModal`, `QRScannerModal`, modal chọn mẫu) lên trên màn hình thao tác hiện tại (`z-[160]`).
- **Khuyến nghị:** Chuyển luồng xem/tạo NCR từ Inspection Detail/Form sang điều hướng Route (`/ncrs/:id`, `/ncrs/new`) có truyền `returnView`, và tách `ImageEditorModal`/scanner thành route phụ hoặc đóng lớp modal cha trước khi mở.

#### [F-C03] Chưa sử dụng Bộ Component chuẩn `/src/components/qms/` & Còn dùng hộp thoại trình duyệt — **[MEDIUM]**
- **Quy tắc (`AGENTS.md` §3.4):** Bắt buộc dùng `<Combobox>` (cấm `<select>` thô, dùng `value={null}`), `<SearchInput>`, `<ConfirmDialog>` (3 variant `info`/`warning`/`danger`, cấm `window.confirm()`), `<PageActions>`, và `<Pagination>` (50 dòng/trang).
- **Hiện trạng ghi nhận:**
  - Thư mục `/src/components/qms/` đã xuất khẩu đủ 5 component chuẩn (`Combobox`, `SearchInput`, `ConfirmDialog`, `PageActions`, `Pagination`), **nhưng tỷ lệ áp dụng tại `InspectionList`, `TwoTierApproval` và 10 tệp PQC/FQC/SQC là 0%**.
  - **Thẻ `<select>` thô:** Xuất hiện tại `inspectionformPQC.tsx:234, 852, 859`, `inspectionformFQC.tsx:476, 477, 660`, `inspectionformSQC_VT.tsx:815, 881`, `inspectionformSQC_TP.tsx:775` (và `InspectionList.tsx` dùng `SearchableSelect.tsx` thay cho `<Combobox>`).
  - **`window.confirm()`, `window.prompt()`, `alert()`:** Dùng rải rác ở `InspectionList.tsx:237, 242, 245, 369, 386, 391`, `TwoTierApproval.tsx:479, 483, 551, 559, 562, 565, 576, 578`, và toàn bộ các tệp `inspectionform*` / `inspectiondetail*` (`SQC_VT:802`, `SQC_BTP:747`, `SQC_TP:756`, `detailPQC:148`, `detailFQC:117`, v.v.).
  - **`<PageActions>` & `<Pagination>`:** Chưa xuất hiện trong `InspectionList.tsx`.
- **Khuyến nghị:** Thay toàn bộ `<select>` và `SearchableSelect` bằng `<Combobox>`; thay ô tìm kiếm bằng `<SearchInput>`; thay mọi `alert`/`confirm`/`prompt` bằng `<ConfirmDialog>` và hệ thống Toast; tích hợp `<PageActions>` và `<Pagination>` (50 dòng/trang) cho `InspectionList`.

#### [F-C04] Tải quá nhiều bản ghi về Client, thiếu Table Density chuẩn & thiếu ErrorBoundary — **[MEDIUM]**
- **Quy tắc (`AGENTS.md` §1, §3.3, §3.4):** Backend quản lý lọc & phân trang 50 dòng/trang; bảng dữ liệu dùng mật độ `Comfortable` (`px-3 py-2.5`), `tabular-nums`, header `bg-slate-100 text-xs font-semibold uppercase text-slate-700`, có Skeleton, Empty state và ErrorBoundary kèm nút "Thử lại".
- **Hiện trạng ghi nhận:**
  - `components/InspectionList.tsx:573-604` gọi `fetchInspections(args, 1, fetchLimit)` với `fetchLimit = 1000` hoặc `5000` bản ghi vào `lazyLoadedItems`, sau đó lọc lại bằng `.filter(...)` trên trình duyệt.
  - `InspectionList.tsx` hiện chỉ có giao diện 4 cột explorer, chưa có chế độ bảng chuẩn (`px-3 py-2.5`) với `<Pagination>` 50 dòng/trang và chưa được bọc bởi `ErrorBoundary` có nút "Thử lại".
- **Khuyến nghị:** Chuyển `selectedProjectDesktop` và toàn bộ bộ lọc xuống tham số API `GET /api/inspections?page=...&limit=50`, bổ sung Table View đúng chuẩn mật độ §3.3 và bọc nhánh Inspection bằng `ErrorBoundary`.

#### [F-C05] Inline Style, Font `Times New Roman` và sai lệch Design Tokens — **[MEDIUM]** / **[LOW]**
- **Quy tắc (`AGENTS.md` §3, §3.1):** Cấm inline style; chỉ dùng font `Inter` (Sans) và `JetBrains Mono` (Mono); tuân thủ chuẩn kích thước/trọng lượng `text-2xl font-bold uppercase tracking-tight` (H1), `text-sm` (baseline), `text-xs font-semibold uppercase` (header bảng), `text-2xs font-medium` (chip).
- **Hiện trạng ghi nhận:**
  - **Font `Times New Roman` & Inline Style (`[MEDIUM]`):** Gắn cứng `style={{ fontFamily: '"Times New Roman", Times, serif' }}` tại root container của `inspectionformPQC.tsx:160, 722`, `inspectionformFQC.tsx:395`, `inspectionformSQC_VT.tsx:569`, `inspectionformSQC_BTP.tsx:533`, `inspectionformSQC_TP.tsx:542`, `inspectiondetailPQC.tsx:233`, `inspectiondetailFQC.tsx:156`, và `inspectiondetailSQC_VT.tsx:241`. `SignaturePad.tsx:171` cũng dùng `"Times New Roman"` khi vẽ con dấu chữ ký mẫu. `InspectionList.tsx:612, 869, 1052, 1154, 1173, 1257, 1354` dùng inline `style={{ fontFamily: 'Inter, sans-serif' }}` và inline `width`.
  - **Sai lệch Token nhẹ (`[LOW]`):** `index.html:13` nạp đúng `Inter` và `JetBrains Mono` (400–700, không có `font-light`), nhưng một số tiêu đề H1 đang đặt `text-[14px] font-black` (`inspectiondetailSQC_BTP.tsx:228`, `SQC_TP.tsx:228`) thay vì `text-2xl font-bold uppercase tracking-tight`, và nhiều nhãn nhỏ dùng `text-[6px]`, `text-[9px]`, `text-[10px]`, `font-black` thay vì `text-2xs` / `text-xs`.
- **Khuyến nghị:** Xóa bỏ toàn bộ `Times New Roman` và thuộc tính `style={{}}`; kế thừa `Inter`/`JetBrains Mono` từ hệ thống CSS toàn cục và chuẩn hóa các class chữ theo bảng Token §3.1.

#### [F-C06] Kiểm tra Responsive & Kích thước vùng chạm — **ĐẠT** *(Khuyến nghị hậu kiểm)*
- **Quy tắc (`AGENTS.md` §3.5):** Giao diện co giãn linh hoạt trên Desktop, Tablet, Mobile; nút/input/icon dễ bấm, không đè hay che khuất dữ liệu.
- **Hiện trạng ghi nhận:** Toàn bộ form và detail (`PQC`, `FQC`, `SQC_VT`, `SQC_BTP`, `SQC_TP`, `TwoTierApproval`) đều áp dụng `min-h-[44px] lg:min-h-[38px]` và `min-w-[44px]` cho các thành phần tương tác chính.
- **Khuyến nghị:** Kiểm thử hồi quy lại thanh kéo chia 4 cột (`colSizes`) của `InspectionList` và lưới 2–4 cột trong detail view sau khi thay thế sang `<Combobox>`, `<PageActions>`, và `<Pagination>`.

---

## 5. Lộ trình khắc phục đề xuất (4 Giai đoạn)

Triển khai tuần tự theo thứ tự ưu tiên để đảm bảo bảo mật và tính đúng đắn của quy trình ISO trước khi tinh chỉnh UI/UX.

### Giai đoạn 1: Bảo mật cốt lõi & Tính toàn vẹn State Machine ISO *(Ưu tiên P0)*
1. **Áp dụng xác thực JWT & phân quyền RBAC tại Backend (`server.ts`):**
   - Gắn `requireAuth` (`401`) và `requirePermission('INSPECTIONS', ...)` (`403`) cho toàn bộ route ghi, đồng bộ, thùng rác và audit log dưới `/api/inspections*`.
   - Tách route xem mã QR công khai sang một endpoint riêng chỉ đọc (`GET /api/public/inspections/:id`) đã lọc bỏ dữ liệu nhạy cảm.
2. **Khóa chặt State Machine ISO & tính bất biến `LOCKED` (`services/dbModuleService.ts`, `types.ts`, `TwoTierApproval.tsx`, `inspectionform*.tsx`, `inspectiondetail*.tsx`):**
   - Cài đặt bảng chuyển trạng thái bắt buộc (`draft -> submitted -> approved/rejected -> verified -> locked`) kèm đối chiếu quyền của người thực hiện theo từng bước.
   - Chặn **mọi** cập nhật hoặc xóa khi `curStatus === 'LOCKED'` (kể cả khi request gửi `status: 'LOCKED'`).
   - Sửa `types.ts:543-556` (`canUserModifyInspection`, `canUserDeleteInspection`) để kiểm tra `LOCKED` **trước** kiểm tra `user.role === 'ADMIN'`.
   - Chuẩn hóa nút nộp form về `SUBMITTED`; sửa `TwoTierApproval.tsx` theo đúng thứ tự L1 = `approved`/`rejected`, L2 = `verified` -> `locked` (gỡ bỏ cơ chế ký tắt `isBoss`); chuẩn hóa trạng thái cũ `COMPLETED`.
- **Tiêu chí nghiệm thu:** Test API chứng minh trả về `401` khi thiếu token, `403` khi sai quyền hoặc chạm vào phiếu `LOCKED` (kể cả `ADMIN`), và `400` khi nhảy cóc/lùi trạng thái.

### Giai đoạn 2: Chống xung đột, Loại bỏ Base64 & Hoàn thiện Audit Trail *(Ưu tiên P1)*
1. **Triển khai Optimistic Locking (`version`):**
   - Bổ sung cột `version` cho `inspections` và `forms_*`; bắt buộc kiểm tra và tăng `version` trong `upsertInspectionRecord`; trả về `409 Conflict` khi đụng độ ghi đồng thời.
2. **Xử lý triệt để Base64 & Chuyển sang Signed URL Storage:**
   - Sửa lỗi stale closure trong `inspectionformFQC.tsx`, `SQC_VT.tsx`, `SQC_BTP.tsx`, `SQC_TP.tsx` và bổ sung bước upload chữ ký trong `inspectionformPQC.tsx` + `TwoTierApproval.tsx` trước khi gọi `onSave`.
   - Từ chối mọi payload chứa `data:` URI tại `POST /api/inspections` (`400 Bad Request`).
   - Thay thế `/api/upload` lưu ổ đĩa bằng luồng Signed URL lên Storage.
3. **Chuẩn hóa Database & Truy xuất nguồn gốc:**
   - Sinh khóa chính `UUID` (`crypto.randomUUID()`) cho các phiếu mới (giữ mã phiếu hiển thị ở cột riêng).
   - Vá truy vấn fallback tại `services/dbService.ts:974` để loại trừ bản ghi đã xóa (`status <> 'DELETED'`).
   - Lưu đầy đủ snapshot `JSONB` cũ/mới vào `audit_logs`; đồng bộ NCR nhúng từ `items[].ncr` vào bảng `ncrs` trong cùng transaction; chuyển `ipo_sample_history` sang xóa mềm; hoàn thiện hoặc gỡ bỏ cờ `splitRequired` tại `SQC_TP`.
- **Tiêu chí nghiệm thu:** Không còn chuỗi `data:image/` nào được lưu xuống PostgreSQL; kiểm thử `409 Conflict` thành công; `audit_logs` lưu đủ payload phục vụ so sánh lịch sử thay đổi.

### Giai đoạn 3: Chuyển đổi sang QMS UI Kit chuẩn & Design Tokens *(Ưu tiên P2)*
1. **Áp dụng 100% bộ `/src/components/qms/` cho phân hệ Inspection:**
   - Thay toàn bộ `<select>` thô và `SearchableSelect` bằng `<Combobox>` (`value={null}` cho trạng thái chưa lọc).
   - Thay các ô tìm kiếm bằng `<SearchInput>`.
   - Thay toàn bộ `window.confirm()`, `window.prompt()`, `alert()` bằng `<ConfirmDialog>` (`info` / `warning` / `danger`) và Toast thông báo.
   - Tích hợp `<PageActions>` và `<Pagination>` (50 dòng/trang) vào `InspectionList.tsx`.
2. **Xóa bỏ Inline Style & Font `Times New Roman`:**
   - Loại bỏ toàn bộ `style={{ fontFamily: '"Times New Roman"...' }}` và các inline `style={{}}` khỏi toàn bộ form, detail và `InspectionList`.
   - Chuẩn hóa typography theo `Inter` + `JetBrains Mono` (`text-2xl font-bold uppercase tracking-tight` cho H1, `text-xs font-semibold uppercase` cho header bảng, `text-2xs font-medium` cho badge, `tabular-nums` cho mã số/số liệu).
- **Tiêu chí nghiệm thu:** Kết quả `grep` cho 0 kết quả đối với `<select`, `window.confirm`, `window.prompt`, `alert(`, `Times New Roman`, và `style={{` trong phạm vi các tệp Inspection.

### Giai đoạn 4: Refactor Điều hướng, Phân trang Server & Hậu kiểm Responsive *(Ưu tiên P3)*
1. **Loại bỏ Modal lồng & View nhúng:**
   - Gỡ bỏ `<NCRDetail>` nhúng trong `inspectiondetailPQC.tsx` và `inspectiondetailSQC_VT.tsx` (cùng import thừa ở `SQC_BTP`/`SQC_TP`); chuyển sang điều hướng Route (`/ncrs/:id`, `/ncrs/new`) kèm state `returnView`.
   - Tách các modal xếp chồng (`NCRModal`, `ImageEditorModal`) theo luồng điều hướng sạch.
2. **Phân trang Server 50 dòng/trang & ErrorBoundary:**
   - Gỡ bỏ cơ chế tải 1.000–5.000 dòng về client trong `InspectionList.tsx`; chuyển toàn bộ bộ lọc xuống API server với `limit=50` và bổ sung chế độ xem bảng mật độ `Comfortable` (`px-3 py-2.5`).
   - Bọc luồng Inspection bằng `ErrorBoundary` có nút "Thử lại", kèm Skeleton và Empty state đầy đủ.
- **Tiêu chí nghiệm thu:** Kiểm thử toàn luồng trên Desktop, Tablet, Mobile đạt vùng chạm `>= 44px`, phân trang server 50 dòng/trang ổn định, điều hướng `returnView` mượt mà và đáp ứng 100% chuẩn `AGENTS.md`.
