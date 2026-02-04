
# PostgreSQL API Integration Documentation

## Overview
The application uses **PostgreSQL** as the primary database. Interactions are handled via services that abstract SQL queries, validation, and error handling.

## Base URL
`/api` (for specific API routes) or root `/` (for generic CRUD)

## Endpoints

### Plans

#### 1. Get Plans List
**GET** `/api/plans`

Retrieves a paginated list of plans.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | `number` | `1` | Page number |
| `limit` | `number` | `20` | Items per page (max 100) |
| `search` | `string` | - | Search term (matches `ma_ct`, `headcode`, `ten_hang_muc`, `ma_nha_may`) |

**Response (Success 200):**
```json
{
  "success": true,
  "items": [
    {
      "id": 1,
      "headcode": "HC001",
      "ma_ct": "CT001",
      "ten_ct": "Test Project",
      "ten_hang_muc": "Test Item",
      "ma_nha_may": "NM001",
      "dvt": "PCS",
      "so_luong_ipo": 100,
      "plannedDate": "2023-11-01",
      "assignee": "Nguyen Van A",
      "status": "PENDING"
    }
  ],
  "total": 50,
  "page": 1,
  "totalPages": 3
}
```

#### 2. Get Plan by ID
**GET** `/api/plans/:id`

Retrieves a single plan by its ID.

**Response (Success 200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "headcode": "HC001",
    "ma_ct": "CT001",
    "ten_ct": "Test Project",
    "ten_hang_muc": "Test Item",
    "ma_nha_may": "NM001",
    "dvt": "PCS",
    "so_luong_ipo": 100,
    "created_at": 1678886400,
    // ... other fields from DB
  }
}
```

#### 3. Create Plan
**POST** `/api/plans`

**Body (JSON):**
```json
{
  "headcode": "HC005",
  "ma_ct": "CT-NEW",
  "ten_ct": "New Project",
  "ten_hang_muc": "Steel Beam",
  "so_luong_ipo": 100,
  "dvt": "PCS",
  "ma_nha_may": "NM005"
}
```

#### 4. Update Plan
**PUT** `/api/plans/:id`

Partial updates allowed. Only provide fields to update.

**Body (JSON):**
```json
{
  "so_luong_ipo": 200,
  "status": "APPROVED"
}
```

#### 5. Delete Plan
**DELETE** `/api/plans/:id`

---

## Error Handling

The API returns standardized error responses.

**Format:**
```json
{
  "success": false,
  "message": "Human readable message",
  "error": "Mô tả lỗi kỹ thuật"
}
```

**Common Error Codes:**
- `VALIDATION_ERROR` (400): Invalid input.
- `NOT_FOUND_ERROR` (404): Resource ID not found.
- `DATABASE_ERROR` (500/503): DB unavailable or query error.
- `INTERNAL_SERVER_ERROR` (500): Unexpected server error.

---

## Database Schema (Example for "IPO" table)

```sql
CREATE TABLE "IPO" (
  id SERIAL PRIMARY KEY,
  headcode TEXT NOT NULL,
  ma_ct TEXT NOT NULL,
  ten_ct TEXT NOT NULL,
  ma_nha_may TEXT,
  ten_hang_muc TEXT NOT NULL,
  dvt TEXT DEFAULT 'PCS',
  so_luong_ipo REAL DEFAULT 0,
  planned_date TEXT, -- New field, if applicable
  assignee TEXT,     -- New field, if applicable
  status TEXT,       -- New field, if applicable
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
);
```