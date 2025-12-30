
# Turso API Integration Documentation

## Overview
The application uses **Turso (LibSQL)** as the primary database. Interactions are handled via the `plansService` which abstracts SQL queries, validation, and error handling.

## Base URL
`/api`

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
| `search` | `string` | - | Search term (matches `ma_ct`, `headcode`, `ten_hang_muc`) |

**Response (Success 200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "headcode": "HC001",
      "maCongTrinh": "CT001",
      ...
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

#### 2. Create Plan
**POST** `/api/plans`

**Body (JSON):**
```json
{
  "headcode": "HC005",
  "ma_ct": "CT-NEW",
  "ten_ct": "New Project",
  "ten_hang_muc": "Steel Beam",
  "so_luong_ipo": 100,
  "dvt": "PCS"
}
```

#### 3. Update Plan
**PUT** `/api/plans/:id`

Partial updates allowed. Only provide fields to update.

#### 4. Delete Plan
**DELETE** `/api/plans/:id`

---

## Error Handling

The API returns standardized error responses.

**Format:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "requestId": "req_..."
  }
}
```

**Common Error Codes:**
- `VALIDATION_ERROR` (400): Invalid input (Zod check failed).
- `NOT_FOUND_ERROR` (404): Resource ID not found.
- `DATABASE_ERROR` (503): DB unavailable (automatic retry triggered before this).
- `INTERNAL_SERVER_ERROR` (500): Unexpected crash.

---

## Database Schema (`searchPlans`)

```sql
CREATE TABLE searchPlans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  headcode TEXT NOT NULL,
  ma_ct TEXT NOT NULL,
  ten_ct TEXT NOT NULL,
  ma_nha_may TEXT,
  ten_hang_muc TEXT NOT NULL,
  dvt TEXT DEFAULT 'PCS',
  so_luong_ipo REAL DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);
```

## Troubleshooting

### 1. "SQLite error: no such table: searchPlans"
**Cause:** The database is fresh and tables haven't been initialized.
**Fix:** 
- Restart the app. The `tursoService` attempts to auto-create tables on connection test.
- Or check `initDatabase()` in `services/tursoService.ts`.

### 2. "Network Error" / "Fetch Failed"
**Cause:** 
- Incorrect `TURSO_DATABASE_URL` or `TURSO_AUTH_TOKEN`.
- Corporate firewall blocking WebSocket/HTTP connection to Turso.
**Fix:**
- Verify `.env` or Vercel Environment Variables.
- Ensure URL starts with `libsql://` or `https://`.

### 3. API Returns Mock Data
**Cause:** `isTursoConfigured` check failed.
**Fix:** Ensure environment variables are loaded correctly by `vite.config.ts`.
