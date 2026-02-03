# AA Tracking API

Hệ thống REST API quản lý chất lượng (QMS) và theo dõi dữ liệu sản xuất, kết nối với PostgreSQL Database.

## Quick Start

1. **Cài đặt dependencies**:
   ```bash
   npm install
   ```

2. **Cấu hình môi trường**:
   Sao chép tệp `.env.example` thành `.env` và cập nhật thông tin kết nối (mặc định đã được điền sẵn trong `.env`).

3. **Chạy ở chế độ Development**:
   ```bash
   npm run dev
   ```

4. **Build và chạy Production**:
   ```bash
   npm run build
   ```

## API Endpoints

### Core (Generic CRUD)
Áp dụng cho mọi bảng trong Database (ví dụ: `inspections`, `projects`...)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:table` | Lấy danh sách bản ghi (Query: `page`, `pageSize`) |
| GET | `/:table/:id` | Lấy chi tiết bản ghi theo ID |
| POST | `/:table` | Thêm mới một bản ghi |
| PUT | `/:table/:id` | Cập nhật bản ghi theo ID |
| DELETE | `/:table/:id` | Xóa bản ghi theo ID |

### Health & Auth
- `GET /health`: Kiểm tra trạng thái server và kết nối DB.

### Users Management
- `GET /api/users`: Danh sách người dùng (Filter: `email`, `role`).
- `POST /api/users`: Tạo người dùng mới (Validation: name, email bắt buộc).

### Event Tracking
- `POST /api/tracking`: Ghi nhận một sự kiện tracking.
- `GET /api/tracking/:userId`: Lấy lịch sử sự kiện của người dùng.

## Ví dụ Curl

### Tạo User mới
```bash
curl -X POST http://localhost:3001/api/users \
     -H "Content-Type: application/json" \
     -d '{"name": "Admin Test", "email": "admin@aatn.vn", "role": "ADMIN"}'
```

### Ghi nhận Tracking
```bash
curl -X POST http://localhost:3001/api/tracking \
     -H "Content-Type: application/json" \
     -d '{"user_id": "1", "event_type": "PAGE_VIEW", "event_data": {"page": "Dashboard"}}'
```

## Định dạng phản hồi (Response Format)

**Thành công (200/201):**
```json
{
  "success": true,
  "data": { ... },
  "total": 100,
  "page": 1,
  "pageSize": 10,
  "totalPages": 10
}
```

**Lỗi (400/404/500):**
```json
{
  "success": false,
  "message": "Chi tiết lỗi",
  "error": "Mô tả lỗi kỹ thuật"
}
```
