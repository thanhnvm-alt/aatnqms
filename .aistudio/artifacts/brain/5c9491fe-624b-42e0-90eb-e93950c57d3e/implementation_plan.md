# Bổ Sung Cột & Dữ Liệu Cho Chức Năng "Xuất CSV Stream"

Bổ sung đầy đủ các cột và dữ liệu còn thiếu trong luồng xuất file "Xuất CSV Stream" (`/api/export/inspections?format=csv`), bao gồm: cột **Hình ảnh hiện trường** chèn ngay trước cột **ĐVT/Unit**, đồng thời truy xuất dữ liệu thực tế cho cột **Kết luận/Ghi chú**, **Hình ảnh hiện trường**, và **ĐVT/Unit**.

## User Review & Critical Decisions

> [!NOTE] 
> Yêu cầu xuất dữ liệu đã được xác định rõ ràng từ hình ảnh minh họa và mô tả người dùng gửi.

- **Vị trí cột**: Cột "Hình ảnh hiện trường" nằm giữa cột "Kết luận/Ghi chú" (Cột S) và cột "ĐVT/Unit" (Cột U), khớp hoàn toàn với cấu trúc hiển thị file Excel.
- **Xử lý liên kết ảnh**: Các mã ảnh trong cơ sở dữ liệu sẽ được chuyển đổi thành đường dẫn xem công khai Google Drive (`https://drive.google.com/open?id=...` hoặc proxy URL), nối với nhau bằng dấu cách/dấu phẩy để tương thích định dạng CSV.
- **Tối ưu hiệu năng Streaming**: Tiếp tục sử dụng cơ chế streaming theo từng chunk (chunked HTTP response) kết hợp truy vấn gộp chi tiết (batch detail fetch) để đảm bảo không bị nghẽn bộ nhớ khi xuất hàng ngàn hồ sơ.

---

## 1. Overview & Core Concept

- **Mục tiêu**: Đảm bảo file CSV được xuất từ nút **"Xuất CSV Stream"** có đầy đủ 21 cột dữ liệu tiêu chuẩn theo ISO QAQC, không bị bỏ sót thông tin ghi chú, hình ảnh hiện trường hay đơn vị tính.
- **Đối tượng sử dụng**: Bộ phận QA/QC, SCM, Ban Giám đốc và cán bộ quản lý dữ liệu xuất báo cáo tổng hợp.

---

## 2. User Experience & Visual Design

- **Trải nghiệm người dùng**:
  1. Người dùng truy cập trang danh sách/báo cáo hồ sơ kiểm tra.
  2. Bấm nút **"Xuất CSV Stream"** (nút màu xanh lá).
  3. Trình duyệt tải xuống file `.csv` mã hóa UTF-8 (BOM `\uFEFF` chống lỗi font tiếng Việt trong Excel).
  4. Mở file CSV trong Excel / WPS Office, các cột xuất hiện đầy đủ:
     - Cột `Kết luận/Ghi chú` hiển thị nội dung tóm tắt kết quả kiểm tra.
     - Cột `Hình ảnh hiện trường` hiển thị danh sách các link ảnh Google Drive.
     - Cột `ĐVT/Unit` hiển thị đơn vị tính (SET, PCS, M,...).

---

## 3. Key Product Decisions & Trade-Offs

- **Truy vấn bổ sung trường chi tiết (`summary`, `dvt`, `images`)**:
  - *Phương án chọn*: Cập nhật hàm `getInspectionsList` trong `dbService.ts` để SELECT trực tiếp các trường `summary`, `dvt` và chi tiết hình ảnh, đồng thời thực hiện batch lookup chi tiết từ các bảng `forms_*` trong endpoint `/api/export/inspections`.
  - *Lý do*: Tránh tình trạng cột bị bỏ trống (undefined) khi xuất file CSV, đồng bộ dữ liệu giữa xuất file Excel `.xlsx` và xuất file CSV `.csv`.

---

## 4. Technical Architecture & Data Strategy

### System Flow Diagram

```
┌─────────────────────────┐       GET /api/export/inspections?format=csv
│   Front-end App / UI    │ ───────────────────────────────────────────────► ┌───────────────────────────┐
└─────────────────────────┘                                                  │   Express Server Route    │
                                                                             └─────────────┬─────────────┘
                                                                                           │
                                                                                           ▼
┌─────────────────────────┐                                                  ┌───────────────────────────┐
│   CSV Stream Output     │ ◄─────────────────────────────────────────────── │   db.getInspectionsList   │
│   (UTF-8 + BOM Header)  │    Write formatted CSV rows in chunks (5000)     │   + Batch Detail Fetch    │
└─────────────────────────┘                                                  └───────────────────────────┘
```

### Cấu trúc cột File CSV Stream mới:
1. Mã hồ sơ
2. Loại phiếu
3. Mã dự án
4. Tên dự án
5. Hạng mục/Mô tả
6. Mã nhà máy
7. Headcode
8. QC kiểm tra
9. Xưởng
10. Công đoạn sản xuất
11. Ngày thực hiện
12. Trạng thái
13. SL ĐĐH
14. SLkiem
15. SLDat
16. TLDat
17. SLLoi
18. TLLoi
19. **Kết luận/Ghi chú** (`summary`)
20. **Hình ảnh hiện trường** (`siteImages` - Link Drive)
21. **ĐVT/Unit** (`dvt`)
