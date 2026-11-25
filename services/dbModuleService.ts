import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../lib/db.js';
import { assertNoNewBase64DataUri } from './storageService.js';
import {
  syncInspectionTraceabilityIndex,
  markTraceabilityIndexDeleted,
  restoreTraceabilityIndex,
  purgeTraceabilityIndex,
} from './traceabilityIndexService.js';
import { collectBookingAllPoTokens, splitPoTokens } from '../src/utils/poTokens.js';
import { sendPasswordResetEmail } from './emailService.js';

const SCHEMA = '"appQAQC"';
const JWT_SECRET = process.env.JWT_SECRET || 'aa-qms-v3-1-0-jwt-secret-key';

const safeJsonParse = <T>(raw: any, fallback: T): T => {
  if (raw === undefined || raw === null || raw === '' || raw === 'undefined' || raw === 'null') {
    return fallback;
  }
  try {
    if (typeof raw === 'object') return raw as T;
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
};

// --- MODULE TAXONOMY (QMS v3.1.0 - M00 to M12) ---
export interface QmsModuleInfo {
  moduleId: string;
  moduleName: string;
}

export const QMS_MODULES: QmsModuleInfo[] = [
  { moduleId: 'M00', moduleName: 'App Shell & Auth' },
  { moduleId: 'M01', moduleName: 'Báo Cáo Tổng Hợp (Dashboard)' },
  { moduleId: 'M02', moduleName: 'Quản Lý Dự Án' },
  { moduleId: 'M03', moduleName: 'Lịch Nghiệm Thu GCN' },
  { moduleId: 'M04', moduleName: 'Nhà Cung Cấp' },
  { moduleId: 'M05', moduleName: 'Danh Sách Phiếu (Inspection/SQC)' },
  { moduleId: 'M06', moduleName: 'Danh Sách NCR & Sự Cố' },
  { moduleId: 'M07', moduleName: 'Thư Viện Lỗi' },
  { moduleId: 'M08', moduleName: 'Quản Lý Vật Liệu (Read-Only)' },
  { moduleId: 'M09', moduleName: 'Quản Lý CCDC' },
  { moduleId: 'M10', moduleName: 'IPO Data (Read-Only)' },
  { moduleId: 'M11', moduleName: 'Cài Đặt & Phân Quyền RBAC' },
  { moduleId: 'M12', moduleName: 'Thùng Rác & Kiểm Toán Lỗi' },
];

export function resolveModuleFromPath(reqPath: string): QmsModuleInfo {
  const p = (reqPath || '').toLowerCase();
  if (p.startsWith('/api/auth') || p === '/api/health') return QMS_MODULES[0];
  if (p.startsWith('/api/dashboard')) return QMS_MODULES[1];
  if (p.startsWith('/api/projects') || p.startsWith('/api/floor-plans') || p.startsWith('/api/layout-pins')) return QMS_MODULES[2];
  if (p.startsWith('/api/subcontractor') || p.startsWith('/api/po-materials')) return QMS_MODULES[3];
  if (p.startsWith('/api/suppliers') || p.startsWith('/api/import/suppliers') || p.startsWith('/api/export/suppliers')) return QMS_MODULES[4];
  if (p.startsWith('/api/inspections/deleted') || p.includes('/restore') || p.includes('/permanent') || p.startsWith('/api/system')) return QMS_MODULES[12];
  if (p.startsWith('/api/inspections') || p.startsWith('/api/import/inspections') || p.startsWith('/api/export/inspections') || p.startsWith('/api/upload') || p.startsWith('/api/proxy-image') || p.startsWith('/api/images/proxy')) return QMS_MODULES[5];
  if (p.startsWith('/api/ncrs') || p.startsWith('/api/defects') || p.startsWith('/api/import/ncrs') || p.startsWith('/api/export/ncrs')) return QMS_MODULES[6];
  if (p.startsWith('/api/defect-library') || p.startsWith('/api/import/defects') || p.startsWith('/api/export/defects')) return QMS_MODULES[7];
  if (p.startsWith('/api/materials') || p.startsWith('/api/import/materials') || p.startsWith('/api/export/materials')) return QMS_MODULES[8];
  if (p.startsWith('/api/tool-')) return QMS_MODULES[9];
  if (p.startsWith('/api/ipo') || p.startsWith('/api/plans') || p.startsWith('/api/import/ipo') || p.startsWith('/api/export/ipo')) return QMS_MODULES[10];
  if (
    p.startsWith('/api/users') ||
    p.startsWith('/api/roles') ||
    p.startsWith('/api/workshops') ||
    p.startsWith('/api/templates') ||
    p.startsWith('/api/departments') ||
    p.startsWith('/api/divisions') ||
    p.startsWith('/api/teams') ||
    p.startsWith('/api/admin') ||
    p.startsWith('/api/notifications')
  ) {
    return QMS_MODULES[11];
  }
  return QMS_MODULES[0];
}

// --- AUDIT TRAIL (ISO APPEND-ONLY) ---
export async function writeAuditLog(params: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  try {
    const id = crypto.randomUUID();
    const ts = Math.floor(Date.now() / 1000);
    await query(
      `INSERT INTO ${SCHEMA}.audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, timestamp, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)`,
      [
        id,
        params.userId || 'system',
        params.action,
        params.entityType,
        String(params.entityId || 'na'),
        params.oldValue !== undefined && params.oldValue !== null ? JSON.stringify(params.oldValue) : null,
        params.newValue !== undefined && params.newValue !== null ? JSON.stringify(params.newValue) : null,
        ts,
        params.ipAddress || null,
        params.userAgent || null,
      ]
    );
  } catch (err) {
    console.warn('[AuditLog] Failed to write audit log:', (err as any)?.message);
  }
}

// --- SYSTEM AUDIT / API ERROR CAPTURE (LAST 50+ ACROSS 12 MODULES) ---
export interface ApiErrorLogEntry {
  id: string;
  moduleId: string;
  moduleName: string;
  method: string;
  path: string;
  statusCode: number;
  errorMessage: string;
  userId?: string | null;
  durationMs: number;
  timestamp: number;
  details?: any;
}

const apiErrorRingBuffer: ApiErrorLogEntry[] = [];
let apiErrorTableReady = false;

async function ensureApiErrorLogsTable() {
  if (apiErrorTableReady) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.api_error_logs (
        id VARCHAR(64) PRIMARY KEY,
        module_id VARCHAR(16) NOT NULL,
        module_name VARCHAR(128) NOT NULL,
        method VARCHAR(16) NOT NULL,
        path TEXT NOT NULL,
        status_code INT NOT NULL,
        error_message TEXT NOT NULL,
        user_id VARCHAR(128),
        duration_ms INT DEFAULT 0,
        timestamp BIGINT NOT NULL,
        details JSONB
      )
    `);
    apiErrorTableReady = true;
  } catch (err) {
    console.warn('[SystemAudit] ensureApiErrorLogsTable warning:', (err as any)?.message);
  }
}

export async function recordApiErrorLog(entry: Omit<ApiErrorLogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: number }) {
  const fullEntry: ApiErrorLogEntry = {
    id: entry.id || `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    moduleId: entry.moduleId,
    moduleName: entry.moduleName,
    method: entry.method,
    path: entry.path,
    statusCode: entry.statusCode,
    errorMessage: entry.errorMessage || `HTTP ${entry.statusCode}`,
    userId: entry.userId || null,
    durationMs: entry.durationMs || 0,
    timestamp: entry.timestamp || Math.floor(Date.now() / 1000),
    details: entry.details || null,
  };

  apiErrorRingBuffer.unshift(fullEntry);
  if (apiErrorRingBuffer.length > 200) {
    apiErrorRingBuffer.length = 200;
  }

  try {
    await ensureApiErrorLogsTable();
    await query(
      `INSERT INTO ${SCHEMA}.api_error_logs
        (id, module_id, module_name, method, path, status_code, error_message, user_id, duration_ms, timestamp, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        fullEntry.id,
        fullEntry.moduleId,
        fullEntry.moduleName,
        fullEntry.method,
        fullEntry.path,
        fullEntry.statusCode,
        fullEntry.errorMessage,
        fullEntry.userId || null,
        fullEntry.durationMs,
        fullEntry.timestamp,
        fullEntry.details ? JSON.stringify(fullEntry.details) : null,
      ]
    );
  } catch (err) {
    console.warn('[SystemAudit] Failed persisting API error log:', (err as any)?.message);
  }
}

export async function getApiErrorLogs(filters: {
  limit?: number;
  moduleId?: string;
  statusGroup?: string;
  search?: string;
} = {}) {
  const safeLimit = Math.max(1, Math.min(Number(filters.limit) || 50, 200));
  try {
    await ensureApiErrorLogsTable();
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    let idx = 1;

    if (filters.moduleId && filters.moduleId !== 'ALL') {
      clauses.push(`module_id = $${idx++}`);
      params.push(filters.moduleId);
    }
    if (filters.statusGroup === '4xx') {
      clauses.push(`status_code >= 400 AND status_code < 500`);
    } else if (filters.statusGroup === '5xx') {
      clauses.push(`status_code >= 500`);
    } else if (filters.statusGroup && /^\d{3}$/.test(filters.statusGroup)) {
      clauses.push(`status_code = $${idx++}`);
      params.push(Number(filters.statusGroup));
    }
    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      clauses.push(`(path ILIKE $${idx} OR error_message ILIKE $${idx} OR module_name ILIKE $${idx} OR method ILIKE $${idx})`);
      params.push(term);
      idx++;
    }

    const whereSql = `WHERE ${clauses.join(' AND ')}`;
    const [rowsRes, summaryRes] = await Promise.all([
      query(
        `SELECT id, module_id, module_name, method, path, status_code, error_message, user_id, duration_ms, timestamp, details
         FROM ${SCHEMA}.api_error_logs
         ${whereSql}
         ORDER BY timestamp DESC
         LIMIT $${idx}`,
        [...params, safeLimit]
      ),
      query(`
        SELECT module_id, status_code, COUNT(*)::int AS cnt
        FROM (
          SELECT module_id, status_code
          FROM ${SCHEMA}.api_error_logs
          ORDER BY timestamp DESC
          LIMIT 50
        ) recent
        GROUP BY module_id, status_code
      `),
    ]);

    const items: ApiErrorLogEntry[] = rowsRes.rows.map((r: any) => ({
      id: r.id,
      moduleId: r.module_id,
      moduleName: r.module_name,
      method: r.method,
      path: r.path,
      statusCode: Number(r.status_code),
      errorMessage: r.error_message,
      userId: r.user_id,
      durationMs: Number(r.duration_ms || 0),
      timestamp: Number(r.timestamp),
      details: r.details || null,
    }));

    return {
      items,
      total: items.length,
      summary: summaryRes.rows,
      modules: QMS_MODULES,
    };
  } catch (err) {
    let list = [...apiErrorRingBuffer];
    if (filters.moduleId && filters.moduleId !== 'ALL') {
      list = list.filter((i) => i.moduleId === filters.moduleId);
    }
    if (filters.statusGroup === '4xx') {
      list = list.filter((i) => i.statusCode >= 400 && i.statusCode < 500);
    } else if (filters.statusGroup === '5xx') {
      list = list.filter((i) => i.statusCode >= 500);
    }
    return {
      items: list.slice(0, safeLimit),
      total: Math.min(list.length, safeLimit),
      summary: [],
      modules: QMS_MODULES,
    };
  }
}

export async function clearApiErrorLogs(actorId?: string | null) {
  apiErrorRingBuffer.length = 0;
  try {
    await ensureApiErrorLogsTable();
    await query(`DELETE FROM ${SCHEMA}.api_error_logs`);
    await writeAuditLog({
      userId: actorId,
      action: 'CLEAR_API_ERROR_LOGS',
      entityType: 'system_audit',
      entityId: 'api_error_logs',
      newValue: { clearedAt: Math.floor(Date.now() / 1000) },
    });
  } catch (err) {
    console.warn('[SystemAudit] Failed clearing api_error_logs:', (err as any)?.message);
  }
  return { success: true };
}

export async function probeAll12Modules() {
  const probes: Array<{
    moduleId: string;
    moduleName: string;
    endpoint: string;
    table: string;
    sql: string;
  }> = [
    { moduleId: 'M00', moduleName: 'App Shell & Auth', endpoint: '/api/health', table: 'users', sql: `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.users WHERE deleted_at IS NULL` },
    { moduleId: 'M01', moduleName: 'Báo Cáo Tổng Hợp (Dashboard)', endpoint: '/api/dashboard/stats', table: 'inspections', sql: `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.inspections WHERE COALESCE(UPPER(status),'') <> 'DELETED'` },
    { moduleId: 'M02', moduleName: 'Quản Lý Dự Án', endpoint: '/api/projects', table: 'projects', sql: `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.projects WHERE deleted_at IS NULL` },
    { moduleId: 'M03', moduleName: 'Lịch Nghiệm Thu GCN', endpoint: '/api/subcontractor-bookings', table: 'subcontractor_bookings', sql: `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.subcontractor_bookings WHERE deleted_at IS NULL` },
    { moduleId: 'M04', moduleName: 'Nhà Cung Cấp', endpoint: '/api/suppliers', table: 'suppliers', sql: `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.suppliers WHERE deleted_at IS NULL` },
    { moduleId: 'M05', moduleName: 'Danh Sách Phiếu (Inspection)', endpoint: '/api/inspections', table: 'inspections', sql: `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.inspections WHERE COALESCE(UPPER(status),'') <> 'DELETED'` },
    { moduleId: 'M06', moduleName: 'Danh Sách NCR & Sự Cố', endpoint: '/api/ncrs', table: 'ncrs', sql: `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.ncrs WHERE deleted_at IS NULL` },
    { moduleId: 'M07', moduleName: 'Thư Viện Lỗi', endpoint: '/api/defect-library', table: 'defect_library', sql: `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.defect_library WHERE COALESCE(is_deleted, 0) = 0` },
    { moduleId: 'M08', moduleName: 'Quản Lý Vật Liệu (Read-Only)', endpoint: '/api/materials', table: 'material', sql: `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.material` },
    { moduleId: 'M09', moduleName: 'Quản Lý CCDC', endpoint: '/api/tool-catalogs', table: 'tool_catalogs', sql: `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.tool_catalogs` },
    { moduleId: 'M10', moduleName: 'IPO Data (Read-Only)', endpoint: '/api/ipo', table: 'ipo', sql: `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.ipo` },
    { moduleId: 'M11', moduleName: 'Cài Đặt & Phân Quyền RBAC', endpoint: '/api/users', table: 'qms_roles', sql: `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.qms_roles WHERE deleted_at IS NULL` },
    { moduleId: 'M12', moduleName: 'Thùng Rác & Kiểm Toán Lỗi', endpoint: '/api/inspections/deleted', table: 'audit_logs', sql: `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.audit_logs` },
  ];

  const results = await Promise.all(
    probes.map(async (p) => {
      const start = Date.now();
      try {
        const r = await query(p.sql);
        const latencyMs = Date.now() - start;
        return {
          moduleId: p.moduleId,
          moduleName: p.moduleName,
          endpoint: p.endpoint,
          table: p.table,
          status: 'OK' as const,
          httpStatus: 200,
          rowCount: Number(r.rows[0]?.cnt || 0),
          latencyMs,
          message: 'Kết nối PostgreSQL ổn định (Read Verified)',
        };
      } catch (err: any) {
        const latencyMs = Date.now() - start;
        return {
          moduleId: p.moduleId,
          moduleName: p.moduleName,
          endpoint: p.endpoint,
          table: p.table,
          status: 'ERROR' as const,
          httpStatus: 500,
          rowCount: 0,
          latencyMs,
          message: err?.message || 'Lỗi truy vấn bảng dữ liệu',
        };
      }
    })
  );

  return {
    checkedAt: Math.floor(Date.now() / 1000),
    results,
  };
}

// --- JWT & AUTHENTICATION & USERS (M00 & M11) ---
export function verifyJwtToken(authHeader?: string): { id?: string; username?: string; role?: string; name?: string } | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return null;
  }
}

export async function getAuthenticatedUserContext(userIdOrUsername?: string | null) {
  if (!userIdOrUsername) return null;
  const res = await query(
    `SELECT * FROM ${SCHEMA}.users WHERE deleted_at IS NULL AND (id = $1 OR LOWER(username) = LOWER($1)) LIMIT 1`,
    [String(userIdOrUsername)]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  const st = String(row.status || 'ACTIVE').toUpperCase();
  if (st === 'INACTIVE' || st === 'LOCKED') return null;
  const mapped = mapUserRow(row, { stripHeavyMedia: true });

  // Nạp quyền từ bảng qms_roles cho cả vai trò (role) và chức vụ (position)
  let rolePermissions: any[] = [];
  try {
    const rolesRes = await query(
      `SELECT id, name, permissions, data FROM ${SCHEMA}.qms_roles WHERE deleted_at IS NULL`
    );
    const roleUpper = String(mapped.role || '').toUpperCase().trim();
    const posUpper = String(mapped.position || '').toUpperCase().trim();
    const userPerms: any[] = Array.isArray(mapped.userPermissions) ? mapped.userPermissions : [];

    for (const rRow of rolesRes.rows) {
      const extra = safeJsonParse<Record<string, any>>(rRow.data, {});
      const isPos = Boolean(extra.isPosition);
      const rIdUpper = String(rRow.id || '').toUpperCase().trim();
      const rNameUpper = String(rRow.name || '').toUpperCase().trim();
      const matchesRole = !isPos && roleUpper && (rIdUpper === roleUpper || rNameUpper === roleUpper);
      const matchesPos = isPos && posUpper && (rIdUpper === posUpper || rNameUpper === posUpper);
      if (!matchesRole && !matchesPos) continue;

      const rPerms = safeJsonParse<any[]>(rRow.permissions, extra.permissions || []);
      if (Array.isArray(rPerms)) {
        for (const rp of rPerms) {
          const rpMod = String(rp?.moduleId || '').toUpperCase().trim();
          if (!rpMod) continue;
          const hasExplicitModule = userPerms.some((up: any) => String(up?.moduleId || '').toUpperCase().trim() === rpMod);
          if (userPerms.length === 0 || !hasExplicitModule) {
            rolePermissions.push(rp);
          }
        }
      }
    }
  } catch (roleErr: any) {
    console.warn('[AuthContext] Failed loading qms_roles permissions:', roleErr?.message);
  }

  return {
    ...mapped,
    roleUpper: String(mapped.role || '').toUpperCase(),
    rolePermissions,
  };
}

export function isServerAdmin(userCtx: any): boolean {
  return String(userCtx?.role || userCtx?.roleUpper || '').toUpperCase() === 'ADMIN';
}

function serverActionMatches(actions: any[], reqAct: string): boolean {
  const upper = actions.map((a: any) => String(a || '').toUpperCase().trim());
  if (upper.includes(reqAct)) return true;
  if (reqAct === 'VIEW' && upper.includes('VIEW_ALL')) return true;
  if (reqAct === 'EDIT' && (upper.includes('EDIT_OWN') || upper.includes('EDIT_ALL'))) return true;
  if (reqAct === 'EDIT_OWN' && (upper.includes('EDIT_ALL') || upper.includes('EDIT'))) return true;
  if (reqAct === 'DELETE' && (upper.includes('DELETE_OWN') || upper.includes('DELETE_ALL'))) return true;
  if (reqAct === 'DELETE_OWN' && (upper.includes('DELETE_ALL') || upper.includes('DELETE'))) return true;
  return false;
}

export function hasServerPermission(userCtx: any, moduleId: string, action: string = 'VIEW'): boolean {
  if (!userCtx) return false;
  if (isServerAdmin(userCtx)) return true;

  const act = String(action || 'VIEW').toUpperCase().trim();
  const mod = String(moduleId || '').toUpperCase().trim();
  const roleUpper = String(userCtx.role || userCtx.roleUpper || '').toUpperCase().trim();
  if (roleUpper === 'GUEST') return false;

  const userPerms: any[] = Array.isArray(userCtx.userPermissions) ? userCtx.userPermissions : [];
  const rolePerms: any[] = Array.isArray(userCtx.rolePermissions) ? userCtx.rolePermissions : [];
  const combinedPerms: any[] = [...userPerms, ...rolePerms];

  const sysAdmin = combinedPerms.find((p) => String(p?.moduleId || '').toUpperCase() === 'SYSTEM_ADMIN');
  if (sysAdmin && Array.isArray(sysAdmin.actions) && serverActionMatches(sysAdmin.actions, act)) {
    return true;
  }

  const matched = combinedPerms.filter((p) => String(p?.moduleId || '').toUpperCase() === mod);
  if (matched.length > 0) {
    return matched.some((p) => Array.isArray(p?.actions) && serverActionMatches(p.actions, act));
  }

  const allowedModules: string[] = Array.isArray(userCtx.allowedModules) ? userCtx.allowedModules : [];
  if (allowedModules.map((m) => String(m).toUpperCase().trim()).includes(mod)) {
    if (act === 'VIEW' || act === 'CREATE' || act === 'EDIT' || act === 'EDIT_OWN') return true;
    if ((userCtx.la_to_truong || roleUpper === 'MANAGER' || roleUpper === 'QA' || roleUpper === 'QC_LEAD' || roleUpper === 'QUẢN LÝ') && act === 'SIGN1') return true;
    if ((roleUpper === 'MANAGER' || roleUpper === 'QA' || roleUpper === 'QUẢN LÝ') && act === 'SIGN2') return true;
  }

  if ([
    'INSPECTIONS', 'LIST', 'IQC', 'PQC', 'FQC', 'FSR', 'STEP', 'SPR', 'SITE',
    'SQC', 'SQC_MAT', 'SQC_VT', 'SQC_BTP', 'SQC_TP',
  ].includes(mod)) {
    if ((act === 'SIGN1' || act === 'APPROVE') && (roleUpper === 'QC_LEAD' || roleUpper === 'MANAGER' || roleUpper === 'QA' || roleUpper === 'QUẢN LÝ' || Boolean(userCtx.la_to_truong))) return true;
    if ((act === 'SIGN2' || act === 'VERIFY' || act === 'LOCK') && (roleUpper === 'MANAGER' || roleUpper === 'QA' || roleUpper === 'QUẢN LÝ')) return true;
  }

  return false;
}

export function hasServerInspectionApprovalPermission(
  userCtx: any,
  inspectionType: string | null | undefined,
  action: 'SIGN1' | 'SIGN2'
): boolean {
  if (!userCtx) return false;
  if (isServerAdmin(userCtx)) return true;

  const roleUpper = String(userCtx.role || userCtx.roleUpper || '').toUpperCase().trim();
  if (roleUpper === 'GUEST') return false;

  const act = String(action || 'SIGN1').toUpperCase().trim() as 'SIGN1' | 'SIGN2';
  if (act === 'SIGN2' && (roleUpper === 'MANAGER' || roleUpper === 'QA' || roleUpper === 'QUẢN LÝ')) {
    return true;
  }
  if (
    act === 'SIGN1' &&
    (roleUpper === 'MANAGER' || roleUpper === 'QA' || roleUpper === 'QC_LEAD' || roleUpper === 'QUẢN LÝ' || Boolean(userCtx.la_to_truong))
  ) {
    return true;
  }

  const t = String(inspectionType || 'PQC').toUpperCase().trim();
  const candidates = new Set<string>([t]);
  if (t === 'SQC_VT') candidates.add('SQC_MAT');
  if (t === 'SQC_MAT') candidates.add('SQC_VT');
  candidates.add('INSPECTIONS');
  candidates.add('LIST');

  for (const mod of candidates) {
    if (hasServerPermission(userCtx, mod, act)) return true;
    if (act === 'SIGN1' && hasServerPermission(userCtx, mod, 'APPROVE')) return true;
  }

  return false;
}

export function mapUserRow(row: any, options?: { stripHeavyMedia?: boolean }) {
  const extra = safeJsonParse<Record<string, any>>(row.data, {});
  const { password: _pw, data: _nestedData, ...cleanExtra } = extra || {};
  const allowedModules = safeJsonParse<string[]>(
    row.allowed_modules,
    Array.isArray(cleanExtra.allowedModules) ? cleanExtra.allowedModules : []
  );
  const userPermissions = safeJsonParse<any[]>(
    row.user_permissions,
    Array.isArray(cleanExtra.userPermissions) ? cleanExtra.userPermissions : []
  );
  const rawAvatar = String(row.avatar || extra.avatar || '');
  const rawSigTemplate = String(cleanExtra.signature_template || cleanExtra.signatureTemplate || '');
  const stripMedia = Boolean(options?.stripHeavyMedia);
  const isHeavyAvatar = stripMedia && rawAvatar.startsWith('data:') && rawAvatar.length > 512;
  const isHeavySig = stripMedia && rawSigTemplate.startsWith('data:') && rawSigTemplate.length > 1024;
  const avatar = isHeavyAvatar ? '' : rawAvatar;
  const sigTemplate = isHeavySig ? '' : rawSigTemplate;

  return {
    ...cleanExtra,
    id: row.id,
    username: row.username || extra.username || '',
    name: row.name || extra.name || row.username || '',
    role: row.role || extra.role || 'QC',
    avatar,
    hasAvatar: Boolean(rawAvatar),
    msnv: row.msnv || extra.msnv || '',
    position: row.position || extra.position || '',
    workLocation: row.work_location || extra.workLocation || '',
    work_location: row.work_location || extra.workLocation || '',
    joinDate: row.join_date || extra.joinDate || '',
    join_date: row.join_date || extra.joinDate || '',
    education: row.education || extra.education || '',
    notes: row.notes || extra.notes || '',
    email: row.email || extra.email || '',
    status: row.status || extra.status || 'ACTIVE',
    phong_ban: row.phong_ban || extra.phong_ban || extra.phongBan || '',
    bo_phan: row.bo_phan || extra.bo_phan || extra.boPhan || '',
    to_qc: row.to_qc || extra.to_qc || extra.toQC || '',
    la_to_truong: Boolean(row.la_to_truong ?? extra.la_to_truong),
    department_id: row.department_id || extra.department_id || '',
    division_id: row.division_id || extra.division_id || '',
    team_id: row.team_id || extra.team_id || '',
    allowedModules,
    allowed_modules: allowedModules,
    userPermissions,
    user_permissions: userPermissions,
    signature_template: sigTemplate,
    signatureTemplate: sigTemplate,
    hasSignature: Boolean(rawSigTemplate),
    requirePasswordChange: Boolean(row.require_password_change ?? extra.requirePasswordChange),
    require_password_change: Boolean(row.require_password_change ?? extra.requirePasswordChange),
    updated_at: row.updated_at ? Number(row.updated_at) : undefined,
  };
}

export async function authenticateUser(
  usernameInput: string,
  passwordInput: string,
  reqMeta?: { ip?: string; userAgent?: string }
) {
  const uname = String(usernameInput || '').trim();
  const pwd = String(passwordInput || '');
  if (!uname || !pwd) {
    throw Object.assign(new Error('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu'), { statusCode: 400 });
  }

  const res = await query(
    `SELECT * FROM ${SCHEMA}.users
     WHERE deleted_at IS NULL
       AND (LOWER(TRIM(username)) = LOWER($1) OR LOWER(TRIM(COALESCE(email,''))) = LOWER($1) OR LOWER(TRIM(COALESCE(msnv,''))) = LOWER($1))
     LIMIT 1`,
    [uname]
  );

  if (res.rows.length === 0) {
    throw Object.assign(new Error('Tên đăng nhập hoặc mật khẩu không đúng'), { statusCode: 401 });
  }

  const row = res.rows[0];
  const storedPw = String(row.password || '');
  let valid = false;
  if (storedPw.startsWith('$2a$') || storedPw.startsWith('$2b$') || storedPw.startsWith('$2y$')) {
    valid = await bcrypt.compare(pwd, storedPw);
  } else {
    valid = storedPw === pwd;
  }

  if (!valid) {
    throw Object.assign(new Error('Tên đăng nhập hoặc mật khẩu không đúng'), { statusCode: 401 });
  }

  if (String(row.status || 'ACTIVE').toUpperCase() === 'INACTIVE' || String(row.status || '').toUpperCase() === 'LOCKED') {
    throw Object.assign(new Error('Tài khoản đang bị khóa hoặc ngừng hoạt động'), { statusCode: 403 });
  }

  const safeUser = mapUserRow(row);
  const token = jwt.sign(
    { id: safeUser.id, username: safeUser.username, role: safeUser.role, name: safeUser.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  await writeAuditLog({
    userId: safeUser.id,
    action: 'LOGIN',
    entityType: 'user',
    entityId: safeUser.id,
    newValue: { username: safeUser.username, ip: reqMeta?.ip || '127.0.0.1', userAgent: reqMeta?.userAgent || 'WebApp' },
    ipAddress: reqMeta?.ip || null,
    userAgent: reqMeta?.userAgent || null,
  });

  return { token, user: safeUser };
}

const passwordResetCodes = new Map<string, { code: string; userId: string; expiresAt: number }>();

export async function changeUserPassword(userId: string, currentPassword: string, newPassword: string) {
  if (!currentPassword || !String(currentPassword).trim()) {
    throw Object.assign(new Error('Vui lòng nhập mật khẩu hiện tại để xác thực'), { statusCode: 400 });
  }
  if (!newPassword || newPassword.length < 6) {
    throw Object.assign(new Error('Mật khẩu mới phải có tối thiểu 6 ký tự'), { statusCode: 400 });
  }
  if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword)) {
    throw Object.assign(new Error('Mật khẩu mới bắt buộc phải chứa cả ký tự viết hoa (A-Z) và viết thường (a-z)'), { statusCode: 400 });
  }

  const res = await query(`SELECT * FROM ${SCHEMA}.users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [userId]);
  if (res.rows.length === 0) {
    throw Object.assign(new Error('Không tìm thấy tài khoản người dùng'), { statusCode: 404 });
  }

  const row = res.rows[0];
  const storedPw = String(row.password || '');
  const match = storedPw.startsWith('$2') ? await bcrypt.compare(currentPassword, storedPw) : storedPw === currentPassword;
  if (!match) {
    throw Object.assign(new Error('Mật khẩu hiện tại không chính xác'), { statusCode: 400 });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  const nowTs = Math.floor(Date.now() / 1000);
  await query(
    `UPDATE ${SCHEMA}.users SET password = $1, require_password_change = false, updated_at = $2 WHERE id = $3`,
    [hashed, nowTs, userId]
  );

  const updatedRes = await query(`SELECT * FROM ${SCHEMA}.users WHERE id = $1 LIMIT 1`, [userId]);
  const safeUser = updatedRes.rows[0] ? mapUserRow(updatedRes.rows[0]) : null;

  await writeAuditLog({
    userId,
    action: 'CHANGE_PASSWORD',
    entityType: 'user',
    entityId: userId,
    newValue: { require_password_change: false },
  });

  return { success: true, user: safeUser };
}

export async function requestPasswordReset(email: string) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) {
    throw Object.assign(new Error('Vui lòng nhập địa chỉ email hợp lệ'), { statusCode: 400 });
  }

  const res = await query(
    `SELECT id, username, name, email FROM ${SCHEMA}.users WHERE LOWER(TRIM(COALESCE(email,''))) = $1 AND deleted_at IS NULL LIMIT 1`,
    [cleanEmail]
  );
  if (res.rows.length === 0) {
    throw Object.assign(new Error('Không tìm thấy tài khoản với email này trong hệ thống QMS'), { statusCode: 404 });
  }

  const user = res.rows[0];
  const code = String(crypto.randomInt(100000, 999999));
  const nowTs = Math.floor(Date.now() / 1000);
  const expiresAt = nowTs + 15 * 60; // 15 phút

  // Lưu mã OTP vào bảng PostgreSQL password_resets
  try {
    // Vô hiệu hóa các mã OTP trước đó của email này
    await query(
      `UPDATE ${SCHEMA}.password_resets SET used_at = $1 WHERE email = $2 AND used_at IS NULL`,
      [nowTs, cleanEmail]
    );

    // Ghi mã mới
    await query(
      `INSERT INTO ${SCHEMA}.password_resets (id, email, code, expires_at, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [cleanEmail, code, expiresAt, nowTs]
    );
  } catch (dbErr: any) {
    console.warn('[requestPasswordReset] DB persist error, falling back to memory map:', dbErr?.message);
  }

  // Dự phòng trong bộ nhớ
  passwordResetCodes.set(cleanEmail, { code, userId: user.id, expiresAt: Date.now() + 15 * 60 * 1000 });

  // Gửi email qua SMTP
  const emailRes = await sendPasswordResetEmail(cleanEmail, user.name || user.username, code);

  await writeAuditLog({
    userId: user.id,
    action: 'REQUEST_PASSWORD_RESET',
    entityType: 'user',
    entityId: user.id,
    newValue: { email: cleanEmail, emailSent: emailRes.sent, error: emailRes.error },
  });

  if (!emailRes.success) {
    throw Object.assign(
      new Error(`Không thể gửi email xác thực tới ${cleanEmail}: ${emailRes.error || 'Lỗi kết nối máy chủ SMTP'}`),
      { statusCode: 502 }
    );
  }

  const msg = emailRes.sent
    ? `Mã xác thực đã được gửi tới email ${cleanEmail}. Vui lòng kiểm tra hòm thư của bạn.`
    : `Mã xác thực đã được khởi tạo thành công (máy chủ chưa cấu hình SMTP gửi mail tự động). Vui lòng liên hệ Quản trị viên để nhận mã hoặc cấu hình SMTP.`;

  return { success: true, message: msg, sent: emailRes.sent };
}

export async function confirmPasswordReset(email: string, code: string, newPassword: string) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanCode = String(code || '').trim();

  if (!cleanEmail || !cleanCode) {
    throw Object.assign(new Error('Vui lòng cung cấp email và mã xác thực'), { statusCode: 400 });
  }

  if (!newPassword || newPassword.length < 6) {
    throw Object.assign(new Error('Mật khẩu mới phải có tối thiểu 6 ký tự'), { statusCode: 400 });
  }

  if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword)) {
    throw Object.assign(new Error('Mật khẩu mới bắt buộc phải chứa cả ký tự viết hoa (A-Z) và viết thường (a-z)'), { statusCode: 400 });
  }

  const nowTs = Math.floor(Date.now() / 1000);
  let isValid = false;

  // 1. Kiểm tra đối chiếu trong bảng PostgreSQL password_resets
  try {
    const prRes = await query(
      `SELECT * FROM ${SCHEMA}.password_resets 
       WHERE email = $1 AND code = $2 AND used_at IS NULL AND expires_at > $3 
       ORDER BY created_at DESC LIMIT 1`,
      [cleanEmail, cleanCode, nowTs]
    );

    if (prRes.rows.length > 0) {
      isValid = true;
      const record = prRes.rows[0];
      await query(
        `UPDATE ${SCHEMA}.password_resets SET used_at = $1 WHERE id = $2`,
        [nowTs, record.id]
      );
    }
  } catch (dbErr: any) {
    console.warn('[confirmPasswordReset] DB check warning, falling back to memory map:', dbErr?.message);
  }

  // 2. Dự phòng trong memory map nếu bảng DB chưa khớp
  if (!isValid) {
    const memRecord = passwordResetCodes.get(cleanEmail);
    if (memRecord && memRecord.code === cleanCode && Date.now() <= memRecord.expiresAt) {
      isValid = true;
      passwordResetCodes.delete(cleanEmail);
    }
  }

  if (!isValid) {
    throw Object.assign(new Error('Mã xác thực không hợp lệ hoặc đã hết hạn (hiệu lực 15 phút)'), { statusCode: 400 });
  }

  const userRes = await query(
    `SELECT id, username FROM ${SCHEMA}.users WHERE LOWER(TRIM(COALESCE(email,''))) = $1 AND deleted_at IS NULL LIMIT 1`,
    [cleanEmail]
  );
  if (userRes.rows.length === 0) {
    throw Object.assign(new Error('Không tìm thấy tài khoản người dùng tương ứng với email này'), { statusCode: 404 });
  }
  const userId = userRes.rows[0].id;

  const hashed = await bcrypt.hash(newPassword, 10);
  await query(
    `UPDATE ${SCHEMA}.users SET password = $1, require_password_change = false, updated_at = $2 WHERE id = $3`,
    [hashed, nowTs, userId]
  );

  passwordResetCodes.delete(cleanEmail);

  await writeAuditLog({
    userId,
    action: 'RESET_PASSWORD',
    entityType: 'user',
    entityId: userId,
    newValue: { email: cleanEmail, method: 'OTP' },
  });

  return { success: true, message: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới.' };
}

export async function getUsersList(options?: { includeMedia?: boolean }) {
  const res = await query(
    `SELECT * FROM ${SCHEMA}.users WHERE deleted_at IS NULL ORDER BY updated_at DESC NULLS LAST, name ASC`
  );
  const stripHeavyMedia = !options?.includeMedia;
  return res.rows.map((row: any) => mapUserRow(row, { stripHeavyMedia }));
}

export async function getUserById(id: string) {
  const res = await query(
    `SELECT * FROM ${SCHEMA}.users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  if (res.rows.length === 0) return null;
  return mapUserRow(res.rows[0], { stripHeavyMedia: false });
}

export async function upsertUserRecord(payload: any, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  const id = payload.id || crypto.randomUUID();

  const existingRes = await query(`SELECT * FROM ${SCHEMA}.users WHERE id = $1 LIMIT 1`, [id]);
  const existing = existingRes.rows[0] || null;
  const existingExtra = existing ? safeJsonParse<Record<string, any>>(existing.data, {}) : {};

  if (existing && payload.version !== undefined && payload.version !== null && existing.version !== undefined && existing.version !== null) {
    if (Number(payload.version) !== Number(existing.version)) {
      throw Object.assign(
        new Error('Xung đột dữ liệu (Optimistic Lock): Tài khoản đã bị cập nhật bởi người khác, vui lòng tải lại.'),
        { statusCode: 409 }
      );
    }
  }

  assertNoNewBase64DataUri(
    {
      avatar: payload.avatar,
      signature_template: payload.signature_template,
      signatureTemplate: payload.signatureTemplate,
    },
    existing
      ? {
          avatar: existing.avatar,
          signature_template: existingExtra.signature_template,
          signatureTemplate: existingExtra.signatureTemplate,
        }
      : undefined,
    'Hồ sơ người dùng'
  );

  let passwordToSave = existing?.password || '$2b$10$defaulthashplaceholder';
  if (payload.password && String(payload.password).trim() !== '') {
    const rawPw = String(payload.password);
    passwordToSave = rawPw.startsWith('$2') ? rawPw : await bcrypt.hash(rawPw, 10);
  } else if (!existing) {
    passwordToSave = await bcrypt.hash('123456', 10);
  }

  const allowedModules = payload.allowedModules ?? payload.allowed_modules ?? safeJsonParse(existing?.allowed_modules, []);
  const userPermissions = payload.userPermissions ?? payload.user_permissions ?? safeJsonParse(existing?.user_permissions, []);
  const incomingSig = payload.signature_template ?? payload.signatureTemplate;
  const sigTemplate = (incomingSig && String(incomingSig).trim() !== '')
    ? incomingSig
    : (payload.clearSignature ? '' : (existingExtra.signature_template || existingExtra.signatureTemplate || ''));
  const incomingAvatar = payload.avatar;
  const resolvedAvatar = (incomingAvatar && String(incomingAvatar).trim() !== '')
    ? incomingAvatar
    : (payload.clearAvatar ? '' : (existing?.avatar || existingExtra.avatar || ''));

  const mergedData = {
    ...existingExtra,
    ...payload,
    id,
    avatar: resolvedAvatar,
    allowedModules,
    userPermissions,
    signature_template: sigTemplate,
    signatureTemplate: sigTemplate,
  };
  delete mergedData.password;

  const username = payload.username ?? existing?.username ?? id;
  const name = payload.name ?? existing?.name ?? username;
  const role = payload.role ?? existing?.role ?? 'QC';
  const avatar = resolvedAvatar;
  const msnv = payload.msnv ?? existing?.msnv ?? '';
  const position = payload.position ?? existing?.position ?? '';
  const workLocation = payload.workLocation ?? payload.work_location ?? existing?.work_location ?? '';
  const joinDate = payload.joinDate ?? payload.join_date ?? existing?.join_date ?? '';
  const education = payload.education ?? existing?.education ?? '';
  const notes = payload.notes ?? existing?.notes ?? '';
  const email = payload.email ?? existing?.email ?? '';
  const status = payload.status ?? existing?.status ?? 'ACTIVE';
  const phongBan = payload.phong_ban ?? payload.phongBan ?? existing?.phong_ban ?? '';
  const boPhan = payload.bo_phan ?? payload.boPhan ?? existing?.bo_phan ?? '';
  const toQc = payload.to_qc ?? payload.toQC ?? existing?.to_qc ?? '';
  const laToTruong = Boolean(payload.la_to_truong ?? existing?.la_to_truong ?? false);
  const deptId = payload.department_id ?? existing?.department_id ?? null;
  const divId = payload.division_id ?? existing?.division_id ?? null;
  const teamId = payload.team_id ?? existing?.team_id ?? null;
  const reqPwChange = Boolean(payload.requirePasswordChange ?? payload.require_password_change ?? existing?.require_password_change ?? false);

  const nextVersion = existing?.version ? Number(existing.version) + 1 : 1;

  await query(
    `INSERT INTO ${SCHEMA}.users (
      id, username, name, role, avatar, msnv, position, work_location, join_date,
      education, notes, password, email, status, phong_ban, bo_phan, allowed_modules,
      to_qc, la_to_truong, department_id, division_id, team_id, user_permissions,
      require_password_change, data, updated_at, version, deleted_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,
      $10,$11,$12,$13,$14,$15,$16,$17,
      $18,$19,$20,$21,$22,$23,
      $24,$25,$26,$27,NULL
    )
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      avatar = EXCLUDED.avatar,
      msnv = EXCLUDED.msnv,
      position = EXCLUDED.position,
      work_location = EXCLUDED.work_location,
      join_date = EXCLUDED.join_date,
      education = EXCLUDED.education,
      notes = EXCLUDED.notes,
      password = EXCLUDED.password,
      email = EXCLUDED.email,
      status = EXCLUDED.status,
      phong_ban = EXCLUDED.phong_ban,
      bo_phan = EXCLUDED.bo_phan,
      allowed_modules = EXCLUDED.allowed_modules,
      to_qc = EXCLUDED.to_qc,
      la_to_truong = EXCLUDED.la_to_truong,
      department_id = EXCLUDED.department_id,
      division_id = EXCLUDED.division_id,
      team_id = EXCLUDED.team_id,
      user_permissions = EXCLUDED.user_permissions,
      require_password_change = EXCLUDED.require_password_change,
      data = EXCLUDED.data,
      updated_at = EXCLUDED.updated_at,
      version = EXCLUDED.version,
      deleted_at = NULL`,
    [
      id, username, name, role, avatar, msnv, position, workLocation, joinDate,
      education, notes, passwordToSave, email, status, phongBan, boPhan, JSON.stringify(allowedModules),
      toQc, laToTruong, deptId, divId, teamId, JSON.stringify(userPermissions),
      reqPwChange, JSON.stringify(mergedData), nowTs, nextVersion
    ]
  );

  const savedRes = await query(`SELECT * FROM ${SCHEMA}.users WHERE id = $1`, [id]);
  const safeUser = mapUserRow(savedRes.rows[0]);

  await writeAuditLog({
    userId: actorId || id,
    action: existing ? 'UPDATE_USER' : 'CREATE_USER',
    entityType: 'user',
    entityId: id,
    oldValue: existing ? mapUserRow(existing) : null,
    newValue: safeUser,
  });

  return { success: true, user: safeUser };
}

export async function importUsersBatchRecords(usersArr: any[], actorId?: string | null) {
  let inserted = 0;
  let updated = 0;
  for (const rawUser of usersArr || []) {
    const cleanUsername = String(rawUser?.username || '').trim();
    const cleanMsnv = String(rawUser?.msnv || '').trim();
    const cleanEmail = String(rawUser?.email || '').trim();
    if (!cleanUsername && !cleanEmail && !cleanMsnv) continue;

    // Match existing non-deleted user by id, username, msnv, or email to avoid duplicates
    const matchRes = await query(
      `SELECT * FROM ${SCHEMA}.users
       WHERE deleted_at IS NULL
         AND (
           ($1 <> '' AND id = $1)
           OR ($2 <> '' AND LOWER(TRIM(COALESCE(username,''))) = LOWER($2))
           OR ($3 <> '' AND LOWER(TRIM(COALESCE(msnv,''))) = LOWER($3))
           OR ($4 <> '' AND LOWER(TRIM(COALESCE(email,''))) = LOWER($4))
         )
       LIMIT 1`,
      [String(rawUser?.id || ''), cleanUsername, cleanMsnv, cleanEmail]
    );

    const existingRow = matchRes.rows[0] || null;
    if (existingRow) {
      const existingMapped = mapUserRow(existingRow);
      // Preserve existing credentials, role, and granted permissions; update profile info only
      await upsertUserRecord(
        {
          ...existingMapped,
          id: existingMapped.id,
          username: existingMapped.username || cleanUsername,
          name: rawUser?.name || existingMapped.name,
          msnv: cleanMsnv || existingMapped.msnv,
          email: cleanEmail || existingMapped.email,
          position: rawUser?.position || existingMapped.position,
          phong_ban: rawUser?.phong_ban || rawUser?.phongBan || existingMapped.phong_ban,
          bo_phan: rawUser?.bo_phan || rawUser?.boPhan || existingMapped.bo_phan,
          workLocation: rawUser?.workLocation || existingMapped.workLocation,
          joinDate: rawUser?.joinDate || existingMapped.joinDate,
          notes: rawUser?.notes || existingMapped.notes,
          avatar: existingMapped.avatar || rawUser?.avatar || '',
          // Preserve sensitive auth & RBAC fields
          role: existingMapped.role,
          allowedModules: existingMapped.allowedModules,
          userPermissions: existingMapped.userPermissions,
          la_to_truong: existingMapped.la_to_truong,
          requirePasswordChange: existingMapped.requirePasswordChange,
          password: '',
          version: existingRow.version,
        },
        actorId
      );
      updated++;
    } else {
      await upsertUserRecord(
        {
          ...rawUser,
          username: cleanUsername || cleanEmail || cleanMsnv,
          password: rawUser?.password && String(rawUser.password).trim() !== '' ? rawUser.password : '123456',
          requirePasswordChange: rawUser?.requirePasswordChange ?? true,
        },
        actorId
      );
      inserted++;
    }
  }
  return { count: inserted + updated, inserted, updated };
}

export async function softDeleteUserRecord(id: string, actorId?: string | null) {
  if (!id) {
    throw Object.assign(new Error('Thiếu mã người dùng cần xóa.'), { statusCode: 400 });
  }
  if (actorId && String(actorId) === String(id)) {
    throw Object.assign(new Error('Không thể tự xóa tài khoản đang đăng nhập.'), { statusCode: 403 });
  }
  const existingRes = await query(`SELECT id, username FROM ${SCHEMA}.users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [id]);
  if (existingRes.rows.length === 0) {
    throw Object.assign(new Error('Không tìm thấy tài khoản người dùng.'), { statusCode: 404 });
  }
  if (String(existingRes.rows[0].username || '').trim().toLowerCase() === 'admin') {
    throw Object.assign(new Error('Không thể xóa tài khoản quản trị hệ thống gốc (admin).'), { statusCode: 403 });
  }
  const nowTs = Math.floor(Date.now() / 1000);
  await query(`UPDATE ${SCHEMA}.users SET deleted_at = $1, updated_at = $1 WHERE id = $2`, [nowTs, id]);
  await writeAuditLog({
    userId: actorId,
    action: 'DELETE_USER',
    entityType: 'user',
    entityId: id,
    newValue: { deleted_at: nowTs },
  });
  return { success: true };
}

export async function getUserActivityLogs(userId: string) {
  const userRes = await query(`SELECT id, username FROM ${SCHEMA}.users WHERE id = $1 LIMIT 1`, [userId]).catch(() => ({ rows: [] as any[] }));
  const username = userRes.rows[0]?.username;
  const identifiers = [userId, username].filter(Boolean);

  const res = await query(
    `SELECT id, user_id, action, entity_type, entity_id, old_value, new_value, timestamp, ip_address, user_agent
     FROM ${SCHEMA}.audit_logs
     WHERE user_id = ANY($1)
     ORDER BY timestamp DESC
     LIMIT 100`,
    [identifiers]
  );

  const mapRow = (r: any) => ({
    id: String(r.id),
    user_id: r.user_id,
    action: r.action,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    old_value: typeof r.old_value === 'string' ? r.old_value : JSON.stringify(r.old_value ?? ''),
    new_value: typeof r.new_value === 'string' ? r.new_value : JSON.stringify(r.new_value ?? ''),
    timestamp: r.timestamp ? Number(r.timestamp) : 0,
    ip_address: r.ip_address || undefined,
    user_agent: r.user_agent || undefined,
  });

  const all = res.rows.map(mapRow);
  const logins = all.filter((l) => String(l.action || '').toUpperCase() === 'LOGIN');
  const operations = all.filter((l) => String(l.action || '').toUpperCase() !== 'LOGIN');

  return {
    totalLogins: logins.length,
    lastLogin: all[0]?.timestamp || null,
    operations,
    logins,
  };
}

// --- ROLES (qms_roles) ---
export async function getRolesList() {
  const res = await query(`SELECT id, name, permissions, description, updated_at, data FROM ${SCHEMA}.qms_roles WHERE deleted_at IS NULL ORDER BY name ASC`);
  return res.rows.map((r: any) => {
    const extra = safeJsonParse<Record<string, any>>(r.data, {});
    const permissions = safeJsonParse<any[]>(r.permissions, extra.permissions || []);
    return {
      ...extra,
      id: r.id,
      name: r.name || extra.name || '',
      description: r.description ?? extra.description ?? '',
      permissions,
      allowedModules: extra.allowedModules || [],
      updated_at: r.updated_at ? Number(r.updated_at) : undefined,
    };
  });
}

export async function saveRoleRecord(role: any, actorId?: string | null) {
  const cleanName = String(role?.name || '').trim();
  if (!cleanName) {
    throw Object.assign(new Error('Tên vai trò không được để trống.'), { statusCode: 400 });
  }
  const nowTs = Math.floor(Date.now() / 1000);
  const id = String(role?.id || '').trim() || `role_${cleanName.toUpperCase().replace(/[^A-Z0-9_]+/g, '_')}_${Date.now()}`;
  const existingRes = await query(`SELECT * FROM ${SCHEMA}.qms_roles WHERE id = $1 LIMIT 1`, [id]);
  const existing = existingRes.rows[0] || null;

  // Enforce Read-Only constraint on MATERIALS & IPO inside role permission matrices
  const sanitizedPermissions = (Array.isArray(role?.permissions) ? role.permissions : [])
    .filter((p: any) => p && p.moduleId)
    .map((p: any) => {
      const mod = String(p.moduleId).toUpperCase().trim();
      const rawActs = Array.isArray(p.actions) ? p.actions.map((a: any) => String(a).toUpperCase().trim()) : [];
      const allowedActs = (mod === 'MATERIALS' || mod === 'IPO')
        ? rawActs.filter((a: string) => a === 'VIEW' || a === 'VIEW_ALL' || a === 'EXPORT')
        : rawActs;
      return { moduleId: p.moduleId, actions: Array.from(new Set(allowedActs)) };
    })
    .filter((p: any) => p.actions.length > 0);

  const normalizedRole = {
    ...role,
    id,
    name: cleanName,
    description: String(role?.description || '').trim(),
    permissions: sanitizedPermissions,
  };
  const permsJson = JSON.stringify(sanitizedPermissions);
  const dataJson = JSON.stringify(normalizedRole);
  await query(
    `INSERT INTO ${SCHEMA}.qms_roles (id, name, permissions, description, updated_at, deleted_at, data)
     VALUES ($1, $2, $3, $4, $5, NULL, $6)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       permissions = EXCLUDED.permissions,
       description = EXCLUDED.description,
       updated_at = EXCLUDED.updated_at,
       deleted_at = NULL,
       data = EXCLUDED.data`,
    [id, cleanName, permsJson, normalizedRole.description, nowTs, dataJson]
  );
  await writeAuditLog({
    userId: actorId,
    action: 'SAVE_ROLE',
    entityType: 'role',
    entityId: id,
    oldValue: existing ? { id: existing.id, name: existing.name, description: existing.description } : null,
    newValue: normalizedRole,
  });
  return normalizedRole;
}

export async function deleteRoleRecord(id: string, actorId?: string | null) {
  const cleanId = String(id || '').trim();
  if (!cleanId) {
    throw Object.assign(new Error('Thiếu mã vai trò cần xóa.'), { statusCode: 400 });
  }
  const existingRes = await query(`SELECT id, name FROM ${SCHEMA}.qms_roles WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [cleanId]);
  const roleRow = existingRes.rows[0];
  if (
    cleanId.toUpperCase() === 'ADMIN' ||
    String(roleRow?.name || '').trim().toUpperCase() === 'ADMIN' ||
    String(roleRow?.name || '').trim().toUpperCase() === 'SYSTEM ADMIN'
  ) {
    throw Object.assign(new Error('Không thể xóa vai trò quản trị hệ thống lõi (ADMIN).'), { statusCode: 403 });
  }

  const assignedRes = await query(
    `SELECT COUNT(*)::int AS cnt FROM ${SCHEMA}.users
     WHERE deleted_at IS NULL
       AND (UPPER(TRIM(COALESCE(role,''))) = UPPER($1) OR ($2 <> '' AND UPPER(TRIM(COALESCE(role,''))) = UPPER($2)))`,
    [cleanId, String(roleRow?.name || '').trim()]
  );
  const assignedCount = Number(assignedRes.rows[0]?.cnt || 0);
  if (assignedCount > 0) {
    throw Object.assign(
      new Error(`Vai trò đang được gán cho ${assignedCount} nhân sự hoạt động. Vui lòng chuyển vai trò cho các nhân sự này trước khi xóa.`),
      { statusCode: 409 }
    );
  }

  const nowTs = Math.floor(Date.now() / 1000);
  await query(`UPDATE ${SCHEMA}.qms_roles SET deleted_at = $1, updated_at = $1 WHERE id = $2`, [nowTs, cleanId]);
  await writeAuditLog({ userId: actorId, action: 'SOFT_DELETE_ROLE', entityType: 'role', entityId: cleanId, newValue: { deleted_at: nowTs } });
  return { success: true };
}

// --- WORKSHOPS & TEMPLATES & ORG SYNC (M11) ---
export async function getWorkshopsList() {
  const res = await query(`SELECT id, code, name, data, data_json, updated_at FROM ${SCHEMA}.workshops WHERE deleted_at IS NULL ORDER BY name ASC`);
  return res.rows.map((r: any) => {
    const d1 = safeJsonParse<Record<string, any>>(r.data, {});
    const d2 = safeJsonParse<Record<string, any>>(r.data_json, {});
    return {
      ...d1,
      ...d2,
      id: r.id,
      code: r.code || d1.code || d2.code || '',
      name: r.name || d1.name || d2.name || '',
    };
  });
}

export async function saveWorkshopRecord(ws: any, actorId?: string | null) {
  const cleanCode = String(ws?.code || '').trim();
  const cleanName = String(ws?.name || '').trim();
  if (!cleanCode || !cleanName) {
    throw Object.assign(new Error('Mã xưởng và tên xưởng không được để trống.'), { statusCode: 400 });
  }
  const nowTs = Math.floor(Date.now() / 1000);
  const id = ws.id || crypto.randomUUID();
  const dupRes = await query(
    `SELECT id FROM ${SCHEMA}.workshops WHERE deleted_at IS NULL AND LOWER(TRIM(COALESCE(code,''))) = LOWER($1) AND id <> $2 LIMIT 1`,
    [cleanCode, id]
  );
  if (dupRes.rows.length > 0) {
    throw Object.assign(new Error(`Mã xưởng "${cleanCode}" đã tồn tại trong hệ thống.`), { statusCode: 409 });
  }
  const existingWs = ws.id
    ? (await query(`SELECT data, data_json FROM ${SCHEMA}.workshops WHERE id = $1 LIMIT 1`, [id])).rows[0]
    : null;
  const existingPayload = existingWs ? { ...safeJsonParse(existingWs.data, {}), ...safeJsonParse(existingWs.data_json, {}) } : undefined;
  assertNoNewBase64DataUri(ws, existingPayload, 'Xưởng sản xuất');

  const payload = { ...ws, id, code: cleanCode, name: cleanName };
  const json = JSON.stringify(payload);
  await query(
    `INSERT INTO ${SCHEMA}.workshops (id, code, name, data, data_json, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $4, $5, $5, NULL)
     ON CONFLICT (id) DO UPDATE SET
       code = EXCLUDED.code,
       name = EXCLUDED.name,
       data = EXCLUDED.data,
       data_json = EXCLUDED.data_json,
       updated_at = EXCLUDED.updated_at,
       deleted_at = NULL`,
    [id, cleanCode, cleanName, json, nowTs]
  );
  await writeAuditLog({ userId: actorId, action: 'SAVE_WORKSHOP', entityType: 'workshop', entityId: id, oldValue: existingPayload || null, newValue: payload });
  return payload;
}

export async function deleteWorkshopRecord(id: string, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  await query(`UPDATE ${SCHEMA}.workshops SET deleted_at = $1, updated_at = $1 WHERE id = $2`, [nowTs, id]);
  await writeAuditLog({ userId: actorId, action: 'SOFT_DELETE_WORKSHOP', entityType: 'workshop', entityId: id, newValue: { deleted_at: nowTs } });
  return { success: true };
}

export async function getTemplatesMap() {
  const res = await query(`SELECT module_id, data FROM ${SCHEMA}.templates`);
  const map: Record<string, any[]> = {};
  for (const r of res.rows) {
    if (r.module_id) {
      map[r.module_id] = safeJsonParse<any[]>(r.data, []);
    }
  }
  return map;
}

export async function saveTemplateRecord(moduleId: string, items: any[], actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  await query(
    `INSERT INTO ${SCHEMA}.templates (module_id, data, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (module_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [moduleId, JSON.stringify(items || []), nowTs]
  );
  await writeAuditLog({ userId: actorId, action: 'SAVE_TEMPLATE', entityType: 'template', entityId: moduleId, newValue: { count: (items || []).length } });
  return { success: true };
}

export async function syncDepartmentsForUsers() {
  const [usersRes, deptsRes, divsRes, teamsRes] = await Promise.all([
    query(`SELECT id, phong_ban, bo_phan, to_qc, department_id, division_id, team_id FROM ${SCHEMA}.users WHERE deleted_at IS NULL`),
    query(`SELECT id, name FROM ${SCHEMA}.departments WHERE deleted_at IS NULL`),
    query(`SELECT id, name, department_id FROM ${SCHEMA}.divisions WHERE deleted_at IS NULL`),
    query(`SELECT id, name, division_id FROM ${SCHEMA}.teams WHERE deleted_at IS NULL`),
  ]);

  const deptByName = new Map<string, string>(deptsRes.rows.map((d: any) => [String(d.name || '').trim().toLowerCase(), d.id]));
  const deptById = new Map<string, string>(deptsRes.rows.map((d: any) => [d.id, d.name]));
  const divByName = new Map<string, string>(divsRes.rows.map((d: any) => [String(d.name || '').trim().toLowerCase(), d.id]));
  const divById = new Map<string, string>(divsRes.rows.map((d: any) => [d.id, d.name]));
  const teamByName = new Map<string, string>(teamsRes.rows.map((t: any) => [String(t.name || '').trim().toLowerCase(), t.id]));
  const teamById = new Map<string, string>(teamsRes.rows.map((t: any) => [t.id, t.name]));

  let updatedCount = 0;
  for (const u of usersRes.rows) {
    let deptId = u.department_id;
    let divId = u.division_id;
    let teamId = u.team_id;
    let phongBan = u.phong_ban || '';
    let boPhan = u.bo_phan || '';
    let toQc = u.to_qc || '';

    if (!deptId && phongBan) deptId = deptByName.get(phongBan.trim().toLowerCase()) || null;
    if (deptId && !phongBan) phongBan = deptById.get(deptId) || '';

    if (!divId && boPhan) divId = divByName.get(boPhan.trim().toLowerCase()) || null;
    if (divId && !boPhan) boPhan = divById.get(divId) || '';

    if (!teamId && toQc) teamId = teamByName.get(toQc.trim().toLowerCase()) || null;
    if (teamId && !toQc) toQc = teamById.get(teamId) || '';

    if (deptId !== u.department_id || divId !== u.division_id || teamId !== u.team_id || phongBan !== u.phong_ban || boPhan !== u.bo_phan || toQc !== u.to_qc) {
      await query(
        `UPDATE ${SCHEMA}.users SET department_id=$1, division_id=$2, team_id=$3, phong_ban=$4, bo_phan=$5, to_qc=$6 WHERE id=$7`,
        [deptId, divId, teamId, phongBan, boPhan, toQc, u.id]
      );
      updatedCount++;
    }
  }

  return {
    totalChecked: usersRes.rows.length,
    createdDepts: 0,
    createdDivs: 0,
    createdTeams: 0,
    updatedCount,
  };
}

// --- PROJECTS, DOCUMENTS, FLOOR PLANS & PINS (M02) ---
function mapProjectRow(r: any) {
  const extra = safeJsonParse<Record<string, any>>(r.data, {});
  const imgs = safeJsonParse<any[]>(r.images, extra.images || []);
  return {
    ...extra,
    id: r.id || r.ma_ct,
    ma_ct: r.ma_ct || extra.ma_ct || '',
    ten_ct: r.name || extra.ten_ct || extra.name || r.ma_ct || '',
    name: r.name || extra.name || extra.ten_ct || r.ma_ct || '',
    status: r.status || extra.status || 'In Progress',
    pm: r.pm || extra.pm || '',
    pc: r.pc || extra.pc || '',
    qa: r.qa || extra.qa || '',
    progress: r.progress !== null && r.progress !== undefined ? Number(r.progress) : (extra.progress || 0),
    start_date: r.start_date || r.startDate || extra.start_date || extra.startDate || '',
    end_date: r.end_date || r.endDate || extra.end_date || extra.endDate || '',
    startDate: r.startDate || r.start_date || extra.startDate || '',
    endDate: r.endDate || r.end_date || extra.endDate || '',
    location: r.location || extra.location || '',
    description: r.description || extra.description || '',
    thumbnail: r.thumbnail || extra.thumbnail || (imgs[0] || ''),
    images: imgs,
    updated_at: r.updated_at ? Number(r.updated_at) : undefined,
  };
}

export async function getProjectsList(search: string = '', page: number = 1, limit: number = 200) {
  const clauses: string[] = ['deleted_at IS NULL'];
  const params: any[] = [];
  let idx = 1;

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    clauses.push(`(ma_ct ILIKE $${idx} OR name ILIKE $${idx} OR location ILIKE $${idx} OR pm ILIKE $${idx} OR pc ILIKE $${idx} OR qa ILIKE $${idx})`);
    params.push(term);
    idx++;
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 10000));
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  const [countRes, listRes] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM ${SCHEMA}.projects ${whereSql}`, params),
    query(
      `SELECT * FROM ${SCHEMA}.projects ${whereSql} ORDER BY updated_at DESC NULLS LAST, ma_ct ASC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, safeLimit, offset]
    ),
  ]);

  return {
    items: listRes.rows.map(mapProjectRow),
    total: Number(countRes.rows[0]?.total || 0),
  };
}

export async function getProjectByCode(code: string) {
  const res = await query(
    `SELECT * FROM ${SCHEMA}.projects WHERE deleted_at IS NULL AND (UPPER(ma_ct) = UPPER($1) OR id = $1) LIMIT 1`,
    [code]
  );
  if (res.rows.length === 0) return null;
  return mapProjectRow(res.rows[0]);
}

export async function updateProjectRecord(idOrCode: string, payload: any, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  const existingRes = await query(
    `SELECT * FROM ${SCHEMA}.projects WHERE deleted_at IS NULL AND (id = $1 OR ma_ct = $1) LIMIT 1`,
    [idOrCode]
  );
  if (existingRes.rows.length === 0) {
    throw Object.assign(new Error('Không tìm thấy dự án'), { statusCode: 404 });
  }
  const existing = existingRes.rows[0];
  if (payload.version !== undefined && payload.version !== null && existing.version !== undefined && existing.version !== null) {
    if (Number(payload.version) !== Number(existing.version)) {
      throw Object.assign(
        new Error('Xung đột dữ liệu (Optimistic Lock): Dự án đã được cập nhật bởi người dùng khác.'),
        { statusCode: 409 }
      );
    }
  }
  const existingImgs = safeJsonParse(existing.images, []);
  assertNoNewBase64DataUri(
    { thumbnail: payload.thumbnail, images: payload.images },
    { thumbnail: existing.thumbnail, images: existingImgs },
    'Dự án'
  );

  const nextVersion = existing.version ? Number(existing.version) + 1 : 1;
  const merged = { ...safeJsonParse(existing.data, {}), ...payload, version: nextVersion };
  const updatedRes = await query(
    `UPDATE ${SCHEMA}.projects
     SET name = $1, status = $2, pm = $3, pc = $4, qa = $5, progress = $6,
         start_date = $7, end_date = $8, location = $9, description = $10,
         thumbnail = $11, images = $12, data = $13, updated_at = $14, version = $15
     WHERE id = $16
     RETURNING *`,
    [
      payload.name ?? payload.ten_ct ?? existing.name,
      payload.status ?? existing.status,
      payload.pm ?? existing.pm,
      payload.pc ?? existing.pc,
      payload.qa ?? existing.qa,
      payload.progress !== undefined ? Number(payload.progress) : existing.progress,
      payload.start_date ?? payload.startDate ?? existing.start_date,
      payload.end_date ?? payload.endDate ?? existing.end_date,
      payload.location ?? existing.location,
      payload.description ?? existing.description,
      payload.thumbnail ?? existing.thumbnail,
      JSON.stringify(payload.images ?? existingImgs),
      JSON.stringify(merged),
      nowTs,
      nextVersion,
      existing.id,
    ]
  );
  const mapped = mapProjectRow(updatedRes.rows[0]);
  await writeAuditLog({
    userId: actorId,
    action: 'UPDATE_PROJECT',
    entityType: 'project',
    entityId: existing.id,
    oldValue: mapProjectRow(existing),
    newValue: mapped,
  });
  return mapped;
}

export async function getProjectDocuments(projectId: string) {
  const res = await query(
    `SELECT * FROM ${SCHEMA}.project_documents WHERE deleted_at IS NULL AND (project_id = $1 OR ma_ct = $1) ORDER BY updated_at DESC NULLS LAST`,
    [projectId]
  );
  return res.rows.map((r: any) => {
    const extra = safeJsonParse<Record<string, any>>(r.data, {});
    return {
      ...extra,
      id: r.id,
      project_id: r.project_id,
      projectId: r.project_id,
      ma_ct: r.ma_ct,
      name: r.name,
      title: r.name,
      version: r.version || '1.0',
      issueDate: r.issue_date || '',
      issue_date: r.issue_date || '',
      updateDate: r.update_date || '',
      update_date: r.update_date || '',
      fileUrl: r.file_url || '',
      file_url: r.file_url || '',
      url: r.file_url || '',
      description: r.description || '',
      createdBy: r.created_by || '',
      createdAt: r.created_at ? Number(r.created_at) : undefined,
    };
  });
}

export async function saveProjectDocument(doc: any, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  const id = doc.id || crypto.randomUUID();
  assertNoNewBase64DataUri(doc, undefined, 'Tài liệu dự án');
  const fileUrl = doc.fileUrl || doc.file_url || doc.url || '';
  const name = doc.name || doc.title || 'Tài liệu dự án';
  await query(
    `INSERT INTO ${SCHEMA}.project_documents
      (id, project_id, ma_ct, name, version, issue_date, update_date, file_url, description, created_by, created_at, updated_at, deleted_at, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,NULL,$12)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       version = EXCLUDED.version,
       issue_date = EXCLUDED.issue_date,
       update_date = EXCLUDED.update_date,
       file_url = EXCLUDED.file_url,
       description = EXCLUDED.description,
       updated_at = EXCLUDED.updated_at,
       data = EXCLUDED.data`,
    [
      id,
      doc.project_id || doc.projectId || doc.ma_ct || '',
      doc.ma_ct || '',
      name,
      doc.version || '1.0',
      doc.issueDate || doc.issue_date || '',
      doc.updateDate || doc.update_date || '',
      fileUrl,
      doc.description || '',
      doc.createdBy || doc.created_by || actorId || '',
      nowTs,
      JSON.stringify({ ...doc, id, name, fileUrl }),
    ]
  );
  await writeAuditLog({ userId: actorId, action: 'SAVE_PROJECT_DOC', entityType: 'project_document', entityId: id, newValue: { name, fileUrl } });
  return { ...doc, id, name, title: name, fileUrl, url: fileUrl };
}

export async function deleteProjectDocument(id: string, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  await query(`UPDATE ${SCHEMA}.project_documents SET deleted_at = $1, updated_at = $1 WHERE id = $2`, [nowTs, id]);
  await writeAuditLog({ userId: actorId, action: 'DELETE_PROJECT_DOC', entityType: 'project_document', entityId: id });
  return { success: true };
}

export async function getFloorPlans(projectId: string) {
  const res = await query(
    `SELECT * FROM ${SCHEMA}.floor_plans WHERE project_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC NULLS LAST`,
    [projectId]
  );
  return res.rows.map((r: any) => ({
    id: r.id,
    project_id: r.project_id,
    projectId: r.project_id,
    name: r.name,
    image_url: r.image_url,
    imageUrl: r.image_url,
    version: r.version || '1.0',
    status: r.status || 'ACTIVE',
    file_name: r.file_name || '',
    updated_at: r.updated_at ? Number(r.updated_at) : undefined,
  }));
}

export async function saveFloorPlan(plan: any, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  const id = plan.id || crypto.randomUUID();
  const existingRes = plan.id
    ? await query(`SELECT image_url FROM ${SCHEMA}.floor_plans WHERE id = $1 LIMIT 1`, [id])
    : { rows: [] as any[] };
  assertNoNewBase64DataUri(plan, existingRes.rows[0] || undefined, 'Mặt bằng dự án');

  const imgUrl = plan.image_url || plan.imageUrl || '';
  await query(
    `INSERT INTO ${SCHEMA}.floor_plans (id, project_id, name, image_url, version, status, file_name, updated_at, deleted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       image_url = EXCLUDED.image_url,
       version = EXCLUDED.version,
       status = EXCLUDED.status,
       file_name = EXCLUDED.file_name,
       updated_at = EXCLUDED.updated_at,
       deleted_at = NULL`,
    [id, plan.project_id || plan.projectId || '', plan.name || '', imgUrl, plan.version || '1.0', plan.status || 'ACTIVE', plan.file_name || '', nowTs]
  );
  await writeAuditLog({ userId: actorId, action: 'SAVE_FLOOR_PLAN', entityType: 'floor_plan', entityId: id, newValue: plan });
  return { ...plan, id, image_url: imgUrl };
}

export async function deleteFloorPlan(id: string, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  await query(`UPDATE ${SCHEMA}.floor_plans SET deleted_at = $1, updated_at = $1 WHERE id = $2`, [nowTs, id]);
  await writeAuditLog({ userId: actorId, action: 'SOFT_DELETE_FLOOR_PLAN', entityType: 'floor_plan', entityId: id, newValue: { deleted_at: nowTs } });
  return { success: true };
}

export async function getLayoutPins(floorPlanId: string) {
  const res = await query(`SELECT * FROM ${SCHEMA}.layout_pins WHERE floor_plan_id = $1`, [floorPlanId]);
  return res.rows;
}

export async function saveLayoutPin(pin: any, actorId?: string | null) {
  const id = pin.id || `pin_${Date.now()}`;
  await query(
    `INSERT INTO ${SCHEMA}.layout_pins (id, floor_plan_id, inspection_id, x, y, label, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET x=EXCLUDED.x, y=EXCLUDED.y, label=EXCLUDED.label, status=EXCLUDED.status`,
    [id, pin.floor_plan_id || pin.floorPlanId || '', pin.inspection_id || pin.inspectionId || '', Number(pin.x || 0), Number(pin.y || 0), pin.label || '', pin.status || 'OPEN']
  );
  await writeAuditLog({ userId: actorId, action: 'SAVE_LAYOUT_PIN', entityType: 'layout_pin', entityId: id, newValue: pin });
  return { ...pin, id };
}

// --- SUPPLIER DELETE (M04) ---
export async function softDeleteSupplierRecord(id: string, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  await query(`UPDATE ${SCHEMA}.suppliers SET deleted_at = $1, updated_at = $1 WHERE id = $2`, [nowTs, id]);
  await writeAuditLog({ userId: actorId, action: 'DELETE_SUPPLIER', entityType: 'supplier', entityId: id });
  return { success: true };
}

// --- INSPECTIONS SAVE / SOFT DELETE / TRASH / RESTORE (M05 & M12) ---
const FORM_TABLE_COLUMN_CACHE = new Map<string, Set<string>>();

async function getTableColumns(tableName: string): Promise<Set<string>> {
  const cached = FORM_TABLE_COLUMN_CACHE.get(tableName);
  if (cached) return cached;
  const res = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'appQAQC' AND table_name = $1`,
    [tableName]
  );
  const cols = new Set<string>(res.rows.map((r: any) => String(r.column_name)));
  FORM_TABLE_COLUMN_CACHE.set(tableName, cols);
  return cols;
}

function resolveFormTableForType(type?: string): string {
  const t = String(type || 'PQC').toUpperCase();
  if (t === 'IQC') return 'forms_iqc';
  if (t === 'SQC_VT') return 'forms_sqc_vt';
  if (t === 'SQC_MAT') return 'forms_sqc_mat';
  if (t === 'SQC_BTP') return 'forms_sqc_btp';
  if (t === 'SQC_TP') return 'forms_sqc_tp';
  if (t === 'FSR') return 'forms_fsr';
  if (t === 'STEP') return 'forms_step';
  if (t === 'FQC') return 'forms_fqc';
  if (t === 'SPR') return 'forms_spr';
  if (t === 'SITE') return 'forms_site';
  return 'forms_pqc';
}

const ALL_FORM_TABLES = [
  'forms_sqc_vt',
  'forms_sqc_btp',
  'forms_sqc_tp',
  'forms_sqc_mat',
  'forms_iqc',
  'forms_pqc',
  'forms_fsr',
  'forms_step',
  'forms_fqc',
  'forms_spr',
  'forms_site',
] as const;

type CanonicalInspectionState = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'VERIFIED' | 'LOCKED';

export function normalizeInspectionStatus(raw: any): CanonicalInspectionState {
  const s = String(raw || 'DRAFT').trim().toUpperCase();
  if (s === 'DRAFT') return 'DRAFT';
  if (s === 'SUBMITTED' || s === 'PENDING' || s === 'FLAGGED' || s === 'IN_PROGRESS') return 'SUBMITTED';
  if (s === 'APPROVED') return 'APPROVED';
  if (s === 'REJECTED') return 'REJECTED';
  if (s === 'VERIFIED' || s === 'COMPLETED') return 'VERIFIED';
  if (s === 'LOCKED') return 'LOCKED';
  return 'SUBMITTED';
}

const ALLOWED_INSPECTION_TRANSITIONS: Record<CanonicalInspectionState, CanonicalInspectionState[]> = {
  DRAFT: ['DRAFT', 'SUBMITTED'],
  SUBMITTED: ['SUBMITTED', 'DRAFT', 'APPROVED', 'REJECTED'],
  APPROVED: ['APPROVED', 'VERIFIED', 'REJECTED'],
  REJECTED: ['REJECTED', 'DRAFT', 'SUBMITTED'],
  VERIFIED: ['VERIFIED', 'LOCKED'],
  LOCKED: [],
};

export async function upsertInspectionRecord(payload: any, actorId?: string | null, actorUser?: any) {
  const nowTs = Math.floor(Date.now() / 1000);
  const typeUpper = String(payload.type || 'PQC').toUpperCase();
  const id = payload.id || crypto.randomUUID();
  const tableName = resolveFormTableForType(typeUpper);

  // Check existing state for ISO State Machine, Soft-Delete guard & Optimistic Locking protection
  const inspCols = await getTableColumns('inspections');
  const hasInspVersion = inspCols.has('version');
  const selectSql = hasInspVersion
    ? `SELECT status, created_at, version FROM ${SCHEMA}.inspections WHERE id = $1 LIMIT 1`
    : `SELECT status, created_at FROM ${SCHEMA}.inspections WHERE id = $1 LIMIT 1`;
  const existingIdxRes = await query(selectSql, [id]);
  const existingRow = existingIdxRes.rows[0] || null;

  const existingFormRes = await query(`SELECT * FROM ${SCHEMA}."${tableName}" WHERE id = $1 LIMIT 1`, [id]).catch(() => ({ rows: [] as any[] }));
  const existingFormRow = existingFormRes.rows[0] || null;
  const existingFormExtra = existingFormRow ? safeJsonParse<Record<string, any>>(existingFormRow.data, {}) : null;

  if (
    (existingRow && String(existingRow.status || '').trim().toUpperCase() === 'DELETED') ||
    (existingFormRow && existingFormRow.deleted_at !== null && existingFormRow.deleted_at !== undefined)
  ) {
    throw Object.assign(
      new Error('Phiếu kiểm tra đang nằm trong Thùng rác (đã xóa mềm). Vui lòng khôi phục từ Thùng rác trước khi chỉnh sửa.'),
      { statusCode: 410 }
    );
  }

  const existingMediaSnapshot = existingFormRow
    ? {
        ...existingFormExtra,
        signature: existingFormRow.signature_qc || existingFormExtra?.signature,
        managerSignature: existingFormRow.signature_manager || existingFormExtra?.managerSignature,
        teamLeadSignature: existingFormRow.signature_teamlead || existingFormExtra?.teamLeadSignature,
        productionSignature: existingFormRow.signature_production || existingFormExtra?.productionSignature,
        pmSignature: existingFormRow.pm_signature || existingFormExtra?.pmSignature,
        images: safeJsonParse(existingFormRow.images_json, existingFormExtra?.images || []),
        deliveryNoteImages: safeJsonParse(existingFormRow.delivery_images_json, existingFormExtra?.deliveryNoteImages || []),
        reportImages: safeJsonParse(existingFormRow.report_images_json, existingFormExtra?.reportImages || []),
        items: safeJsonParse(existingFormRow.items_json, existingFormExtra?.items || []),
        materials: safeJsonParse(existingFormRow.materials_json, existingFormExtra?.materials || []),
      }
    : undefined;

  assertNoNewBase64DataUri(payload, existingMediaSnapshot, 'Phiếu kiểm tra');

  const requestedStatus = normalizeInspectionStatus(payload.status || (existingRow ? existingRow.status : 'DRAFT'));

  if (existingRow) {
    const rawCur = String(existingRow.status || '').trim().toUpperCase();
    const curCanonical = normalizeInspectionStatus(rawCur);

    // 1. Absolute ISO Immutability: LOCKED (and legacy LOCKED) cannot be mutated at all — even by ADMIN or to LOCKED
    if (curCanonical === 'LOCKED') {
      throw Object.assign(
        new Error('Phiếu kiểm tra đã ở trạng thái KHÓA (LOCKED - Immutable), tuyệt đối không thể chỉnh sửa theo quy trình ISO.'),
        { statusCode: 403 }
      );
    }

    // 2. Enforce strict ISO State Machine transition allow-list
    const allowedNext = ALLOWED_INSPECTION_TRANSITIONS[curCanonical] || [];
    if (!allowedNext.includes(requestedStatus)) {
      throw Object.assign(
        new Error(`Vi phạm quy trình ISO State Machine: Không thể chuyển trạng thái từ ${curCanonical} sang ${requestedStatus}.`),
        { statusCode: 400 }
      );
    }

    // 3. Optimistic Locking check when version is present
    const currentFormVer =
      existingFormRow?.version !== undefined && existingFormRow?.version !== null
        ? Number(existingFormRow.version)
        : existingFormExtra?.version !== undefined && existingFormExtra?.version !== null
        ? Number(existingFormExtra.version)
        : null;
    const currentIdxVer =
      hasInspVersion && existingRow.version !== undefined && existingRow.version !== null
        ? Number(existingRow.version)
        : null;
    const expectedVersion = currentFormVer ?? currentIdxVer;

    if (expectedVersion !== null && payload.version !== undefined && payload.version !== null) {
      const providedVer = Number(payload.version);
      const matchesExpected =
        providedVer === expectedVersion ||
        (currentIdxVer !== null && currentFormVer !== null && currentIdxVer !== currentFormVer && providedVer === currentIdxVer);
      if (!matchesExpected) {
        throw Object.assign(
          new Error('Xung đột dữ liệu (Optimistic Lock): Hồ sơ đã được cập nhật bởi người dùng khác, vui lòng tải lại trang.'),
          { statusCode: 409 }
        );
      }
    }

    // 4. Server-authoritative RBAC check for status transitions & signature mutations
    if (actorUser) {
      const canSign1 = hasServerInspectionApprovalPermission(actorUser, typeUpper, 'SIGN1');
      const canSign2 = hasServerInspectionApprovalPermission(actorUser, typeUpper, 'SIGN2');

      if (curCanonical !== requestedStatus) {
        if (requestedStatus === 'APPROVED' && !canSign1 && !canSign2) {
          throw Object.assign(new Error('Không đủ thẩm quyền RBAC để phê duyệt phiếu (APPROVED).'), { statusCode: 403 });
        }
        if ((requestedStatus === 'VERIFIED' || requestedStatus === 'LOCKED') && !canSign2 && !isServerAdmin(actorUser)) {
          throw Object.assign(new Error(`Không đủ thẩm quyền RBAC (Cấp L2 / Manager / QA / Admin) để chuyển phiếu sang ${requestedStatus}.`), { statusCode: 403 });
        }
        if (requestedStatus === 'REJECTED' && !canSign1 && !canSign2 && !isServerAdmin(actorUser)) {
          throw Object.assign(new Error('Không đủ thẩm quyền RBAC để từ chối phiếu (REJECTED).'), { statusCode: 403 });
        }
      }

      const prevManagerSig = String(existingFormRow?.signature_manager || existingFormExtra?.managerSignature || '').trim();
      const nextManagerSig = String(payload.managerSignature || '').trim();
      if (nextManagerSig && nextManagerSig !== prevManagerSig && !canSign2 && !isServerAdmin(actorUser)) {
        throw Object.assign(new Error('Không đủ thẩm quyền RBAC (Cấp L2 / SIGN2) để ký phê duyệt L2.'), { statusCode: 403 });
      }

      const prevTeamSig = String(existingFormRow?.signature_teamlead || existingFormExtra?.teamLeadSignature || '').trim();
      const nextTeamSig = String(payload.teamLeadSignature || '').trim();
      if (nextTeamSig && nextTeamSig !== prevTeamSig && !canSign1 && !canSign2 && !isServerAdmin(actorUser)) {
        throw Object.assign(new Error('Không đủ thẩm quyền RBAC (Cấp L1 / SIGN1) để ký xác nhận L1.'), { statusCode: 403 });
      }
    }

    // 5. L2 Signature prerequisite before LOCKED (ISO Two-Tier Enforcement)
    if (requestedStatus === 'LOCKED') {
      const resolvedManagerSig = String(
        payload.managerSignature || existingFormRow?.signature_manager || existingFormExtra?.managerSignature || ''
      ).trim();
      if (!resolvedManagerSig) {
        throw Object.assign(
          new Error('Không thể khóa hồ sơ ISO (LOCKED) khi chưa có chữ ký phê duyệt cấp L2.'),
          { statusCode: 400 }
        );
      }
    }
  } else {
    // New inspection records may only start in DRAFT or SUBMITTED
    if (requestedStatus !== 'DRAFT' && requestedStatus !== 'SUBMITTED') {
      throw Object.assign(
        new Error(`Vi phạm quy trình ISO State Machine: Phiếu tạo mới chỉ được phép ở trạng thái DRAFT hoặc SUBMITTED (nhận được ${requestedStatus}).`),
        { statusCode: 400 }
      );
    }
  }

  // Normalize Unix timestamp for `date`
  let dateTs = nowTs;
  if (typeof payload.date === 'number') {
    dateTs = payload.date > 1e12 ? Math.floor(payload.date / 1000) : payload.date;
  } else if (typeof payload.date === 'string' && payload.date.trim()) {
    const s = payload.date.trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [dd, mm, yyyy] = s.split('/');
      const parsed = Date.parse(`${yyyy}-${mm}-${dd}T00:00:00+07:00`);
      if (!isNaN(parsed)) dateTs = Math.floor(parsed / 1000);
    } else {
      const parsed = Date.parse(s);
      if (!isNaN(parsed)) dateTs = Math.floor(parsed / 1000);
    }
  }

  const createdTs = existingRow?.created_at ? Number(existingRow.created_at) : (typeof payload.created_at === 'number' ? payload.created_at : nowTs);
  const statusVal = requestedStatus;
  const maxExistingVersion = Math.max(
    existingFormRow?.version !== undefined && existingFormRow?.version !== null ? Number(existingFormRow.version) : 0,
    existingFormExtra?.version !== undefined && existingFormExtra?.version !== null ? Number(existingFormExtra.version) : 0,
    existingRow?.version !== undefined && existingRow?.version !== null ? Number(existingRow.version) : 0
  );
  const nextVersion = existingRow ? (maxExistingVersion > 0 ? maxExistingVersion + 1 : 2) : 1;
  const inspectorName = payload.inspectorName || payload.inspector || payload.created_by || '';

  // 1. Upsert into corresponding forms_* table dynamically matching exact table columns
  const cols = await getTableColumns(tableName);
  const fullData = { ...payload, id, type: typeUpper, status: statusVal, version: nextVersion, updated_at: nowTs };
  const candidateValues: Record<string, any> = {
    id,
    type: typeUpper,
    ma_ct: payload.ma_ct || '',
    ten_ct: payload.ten_ct || '',
    ten_hang_muc: payload.ten_hang_muc || '',
    po_number: payload.po_number || payload.poNumber || null,
    ma_nha_may: payload.ma_nha_may || payload.supplier || '',
    supplier: payload.supplier || payload.ma_nha_may || '',
    supplier_address: payload.supplierAddress || '',
    workshop: payload.workshop || '',
    location: payload.location || '',
    inspector: inspectorName,
    inspector_name: inspectorName,
    status: statusVal,
    date: dateTs,
    score: payload.score !== undefined ? Number(payload.score) : null,
    summary: payload.summary || '',
    headcode: payload.headcode || '',
    stage: payload.stage || '',
    sub_stage: payload.subStage || payload.sub_stage || '',
    dvt: payload.dvt || '',
    so_luong_ipo: payload.so_luong_ipo ?? null,
    inspected_qty: payload.inspectedQuantity ?? null,
    passed_qty: payload.passedQuantity ?? null,
    failed_qty: payload.failedQuantity ?? null,
    floor_plan_id: payload.floor_plan_id || null,
    coord_x: payload.coord_x ?? null,
    coord_y: payload.coord_y ?? null,
    responsible_person: payload.responsiblePerson || '',
    signature_qc: payload.signature || '',
    signature_manager: payload.managerSignature || '',
    signature_mgr: payload.managerSignature || '',
    name_manager: payload.managerName || '',
    name_mgr: payload.managerName || '',
    signature_teamlead: payload.teamLeadSignature || '',
    name_teamlead: payload.teamLeadName || '',
    signature_production: payload.productionSignature || '',
    name_production: payload.productionName || '',
    comment_production: payload.productionComment || '',
    pm_signature: payload.pmSignature || '',
    pm_name: payload.pmName || '',
    pm_comment: payload.pmComment || '',
    items_json: JSON.stringify(payload.items || []),
    materials_json: JSON.stringify(payload.materials || []),
    images_json: JSON.stringify(payload.images || []),
    delivery_images_json: JSON.stringify(payload.deliveryNoteImages || []),
    report_images_json: JSON.stringify(payload.reportImages || []),
    comments_json: JSON.stringify(payload.comments || []),
    supporting_docs_json: JSON.stringify(payload.supportingDocs || []),
    reference_docs_json: JSON.stringify(payload.referenceDocs || []),
    booking_id: payload.booking_id || payload.bookingId || null,
    booking_code: payload.booking_code || payload.bookingCode || null,
    data: JSON.stringify(fullData),
    created_by: inspectorName,
    created_at: createdTs,
    updated_at: nowTs,
    version: nextVersion,
    deleted_at: null,
  };

  const activeCols = Object.keys(candidateValues).filter((c) => cols.has(c));
  if (activeCols.length > 0) {
    const placeholders = activeCols.map((_, idx) => `$${idx + 1}`).join(', ');
    const updates = activeCols.filter((c) => c !== 'id' && c !== 'created_at').map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
    await query(
      `INSERT INTO ${SCHEMA}."${tableName}" (${activeCols.map((c) => `"${c}"`).join(', ')})
       VALUES (${placeholders})
       ON CONFLICT (id) DO UPDATE SET ${updates}`,
      activeCols.map((c) => candidateValues[c])
    );
  }

  // 2. Sync summary row in `inspections` index table (including `version` when column exists)
  const inspIdxCols = [
    'id', 'created_at', 'updated_at', 'created_by', 'ma_ct', 'ten_ct', 'ma_nha_may', 'ten_hang_muc',
    'workshop', 'status', 'type', 'score', 'headcode', 'stage', 'sub_stage',
    'inspected_qty', 'passed_qty', 'failed_qty', 'so_luong_ipo', 'priority', 'date', 'po_number',
    ...(hasInspVersion ? ['version'] : []),
  ];
  const inspIdxVals: any[] = [
    id,
    createdTs,
    nowTs,
    inspectorName,
    payload.ma_ct || '',
    payload.ten_ct || '',
    payload.ma_nha_may || payload.supplier || '',
    payload.ten_hang_muc || '',
    payload.workshop || '',
    statusVal,
    typeUpper,
    payload.score !== undefined ? Number(payload.score) : null,
    payload.headcode || '',
    payload.stage || '',
    payload.subStage || payload.sub_stage || '',
    payload.inspectedQuantity ?? null,
    payload.passedQuantity ?? null,
    payload.failedQuantity ?? null,
    payload.so_luong_ipo ?? null,
    payload.priority || null,
    dateTs,
    payload.po_number || payload.poNumber || null,
    ...(hasInspVersion ? [nextVersion] : []),
  ];
  const inspIdxPlaceholders = inspIdxVals.map((_, idx) => `$${idx + 1}`).join(', ');
  const inspIdxUpdates = inspIdxCols
    .filter((c) => c !== 'id' && c !== 'created_at')
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(',\n      ');
  await query(
    `INSERT INTO ${SCHEMA}.inspections (${inspIdxCols.join(', ')})
     VALUES (${inspIdxPlaceholders})
     ON CONFLICT (id) DO UPDATE SET
      ${inspIdxUpdates}`,
    inspIdxVals
  );

  // 3. Write permanent ISO Audit Trail with rich JSONB snapshot
  const statusUpper = String(statusVal).toUpperCase();
  const action = !existingRow
    ? 'CREATE_INSPECTION'
    : statusUpper === 'LOCKED'
    ? 'LOCK_INSPECTION'
    : statusUpper === 'APPROVED'
    ? 'APPROVE_INSPECTION'
    : statusUpper === 'REJECTED'
    ? 'REJECT_INSPECTION'
    : statusUpper === 'VERIFIED'
    ? 'VERIFY_INSPECTION'
    : statusUpper === 'SUBMITTED'
    ? 'SUBMIT_INSPECTION'
    : 'UPDATE_INSPECTION';

  const buildAuditSnapshot = (src: any, fallbackRow?: any) => ({
    status: src?.status ?? fallbackRow?.status ?? null,
    version: src?.version ?? fallbackRow?.version ?? null,
    type: src?.type ?? typeUpper,
    ma_ct: src?.ma_ct ?? fallbackRow?.ma_ct ?? '',
    ten_ct: src?.ten_ct ?? fallbackRow?.ten_ct ?? '',
    ten_hang_muc: src?.ten_hang_muc ?? fallbackRow?.ten_hang_muc ?? '',
    po_number: src?.po_number ?? src?.poNumber ?? fallbackRow?.po_number ?? null,
    workshop: src?.workshop ?? fallbackRow?.workshop ?? '',
    score: src?.score ?? fallbackRow?.score ?? null,
    inspectedQuantity: src?.inspectedQuantity ?? fallbackRow?.inspected_qty ?? null,
    passedQuantity: src?.passedQuantity ?? fallbackRow?.passed_qty ?? null,
    failedQuantity: src?.failedQuantity ?? fallbackRow?.failed_qty ?? null,
    summary: src?.summary ?? fallbackRow?.summary ?? '',
    items: Array.isArray(src?.items) ? src.items : safeJsonParse(fallbackRow?.items_json, []),
    materials: Array.isArray(src?.materials) ? src.materials : safeJsonParse(fallbackRow?.materials_json, []),
    images: Array.isArray(src?.images) ? src.images : safeJsonParse(fallbackRow?.images_json, []),
    signature: src?.signature ?? fallbackRow?.signature_qc ?? '',
    managerSignature: src?.managerSignature ?? fallbackRow?.signature_manager ?? '',
    teamLeadSignature: src?.teamLeadSignature ?? fallbackRow?.signature_teamlead ?? '',
    productionSignature: src?.productionSignature ?? fallbackRow?.signature_production ?? '',
  });

  await writeAuditLog({
    userId: actorId || inspectorName || 'system',
    action,
    entityType: 'inspection',
    entityId: id,
    oldValue: existingRow ? buildAuditSnapshot(existingFormExtra, existingFormRow || existingRow) : null,
    newValue: buildAuditSnapshot(fullData),
  });

  // 4. Auto-sync embedded NCRs inside checklist items / materials to M06 `ncrs` table
  const embeddedEntries: Array<{ parentId: string; ncr: any }> = [];
  for (const it of Array.isArray(payload.items) ? payload.items : []) {
    if (it?.ncr && (it.ncr.description || it.ncr.issueDescription || it.ncr.defectCode || it.ncr.defect_code)) {
      embeddedEntries.push({ parentId: String(it.id || ''), ncr: it.ncr });
    }
  }
  for (const mat of Array.isArray(payload.materials) ? payload.materials : []) {
    if (mat?.ncr && (mat.ncr.description || mat.ncr.issueDescription || mat.ncr.defectCode || mat.ncr.defect_code)) {
      embeddedEntries.push({ parentId: String(mat.id || mat.materialCode || ''), ncr: mat.ncr });
    }
  }

  for (const entry of embeddedEntries) {
    try {
      const rawNcr = entry.ncr;
      const ncrId = rawNcr.id || crypto.randomUUID();
      const existNcrRes = await query(
        `SELECT id, status FROM ${SCHEMA}.ncrs WHERE id = $1 OR (inspection_id = $2 AND item_id = $3 AND $3 <> '') LIMIT 1`,
        [ncrId, id, entry.parentId]
      );
      const existNcr = existNcrRes.rows[0] || null;
      if (existNcr && String(existNcr.status || '').toUpperCase() === 'CLOSED') {
        continue; // Keep closed NCR immutable
      }
      const resolvedNcrId = existNcr?.id || ncrId;
      const ncrStatus = existNcr?.status || rawNcr.status || 'OPEN';
      const ncrSeverity = rawNcr.severity || 'MINOR';
      const ncrDefect = rawNcr.defectCode || rawNcr.defect_code || '';
      const ncrDesc = rawNcr.description || rawNcr.issueDescription || '';
      const ncrRoot = rawNcr.rootCause || rawNcr.root_cause || '';
      const ncrCorrect = rawNcr.correctiveAction || rawNcr.solution || rawNcr.corrective_action || '';
      const ncrPrevent = rawNcr.preventiveAction || rawNcr.preventive_action || '';
      const ncrResp = rawNcr.responsiblePerson || rawNcr.responsible_person || payload.responsiblePerson || '';
      const ncrDeadline = rawNcr.deadline || '';
      const ncrBefore = JSON.stringify(Array.isArray(rawNcr.imagesBefore) ? rawNcr.imagesBefore : []);
      const ncrAfter = JSON.stringify(Array.isArray(rawNcr.imagesAfter) ? rawNcr.imagesAfter : []);

      await query(
        `INSERT INTO ${SCHEMA}.ncrs (
          id, inspection_id, item_id, defect_code, severity, status, description, root_cause,
          corrective_action, preventive_action, responsible_person, deadline,
          images_before_json, images_after_json, created_by, data, created_at, updated_at, version
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,1)
        ON CONFLICT (id) DO UPDATE SET
          defect_code = EXCLUDED.defect_code,
          severity = EXCLUDED.severity,
          description = EXCLUDED.description,
          root_cause = EXCLUDED.root_cause,
          corrective_action = EXCLUDED.corrective_action,
          preventive_action = EXCLUDED.preventive_action,
          responsible_person = EXCLUDED.responsible_person,
          deadline = EXCLUDED.deadline,
          images_before_json = EXCLUDED.images_before_json,
          images_after_json = EXCLUDED.images_after_json,
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at`,
        [
          resolvedNcrId,
          id,
          entry.parentId,
          ncrDefect,
          ncrSeverity,
          ncrStatus,
          ncrDesc,
          ncrRoot,
          ncrCorrect,
          ncrPrevent,
          ncrResp,
          ncrDeadline,
          ncrBefore,
          ncrAfter,
          inspectorName || actorId || '',
          JSON.stringify({ ...rawNcr, id: resolvedNcrId, inspection_id: id, item_id: entry.parentId, status: ncrStatus }),
          nowTs,
        ]
      );

      if (!existNcr) {
        await writeAuditLog({
          userId: actorId || inspectorName || 'system',
          action: 'SYNC_NCR_FROM_INSPECTION',
          entityType: 'ncr',
          entityId: resolvedNcrId,
          newValue: { inspection_id: id, item_id: entry.parentId, defect_code: ncrDefect, severity: ncrSeverity, status: ncrStatus },
        });
      }
    } catch (syncErr) {
      console.warn('[NCR Auto-Sync] Warning:', (syncErr as any)?.message);
    }
  }

  // 4b. Pre-fetch linked M03 Subcontractor Booking so all multi-PO/PR codes of the Book QC are indexed together
  const linkedBookingId = String(payload.booking_id || payload.bookingId || '').trim();
  const linkedBookingCode = String(payload.booking_code || payload.bookingCode || '').trim();
  let linkedBkRow: any = null;
  if (typeUpper.startsWith('SQC') && (linkedBookingId || linkedBookingCode)) {
    try {
      const bkRes = await query(
        `SELECT id, booking_code, po_number, status, requester_id, items_json, data
         FROM ${SCHEMA}.subcontractor_bookings
         WHERE deleted_at IS NULL
           AND UPPER(COALESCE(status, '')) <> 'CANCELLED'
           AND (($1 <> '' AND id = $1) OR ($2 <> '' AND LOWER(booking_code) = LOWER($2)))
         LIMIT 1`,
        [linkedBookingId, linkedBookingCode]
      );
      linkedBkRow = bkRes.rows[0] || null;
    } catch (bkErr: any) {
      console.warn('[Booking Pre-Lookup] Warning:', bkErr?.message);
    }
  }

  let tracePoNumber = fullData.po_number;
  if (linkedBkRow) {
    const bkExtra = safeJsonParse(linkedBkRow.data, {}) as any;
    const bkItems = safeJsonParse(linkedBkRow.items_json, []);
    const bkAllPos = collectBookingAllPoTokens({
      poNumber: linkedBkRow.po_number,
      poNumbers: bkExtra?.poNumbers,
      prNumber: bkExtra?.prNumber,
      items: Array.isArray(bkItems) ? bkItems : [],
    });
    const combinedPos = splitPoTokens([tracePoNumber, ...bkAllPos]);
    if (combinedPos.length > 0) {
      tracePoNumber = combinedPos.join(', ');
    }
  }

  await syncInspectionTraceabilityIndex({
    ...fullData,
    po_number: tracePoNumber,
    id,
    type: typeUpper,
    status: statusVal,
    created_at: createdTs,
    updated_at: nowTs,
  });

  // 5. Auto-sync linked M03 Subcontractor Booking lifecycle (each booking batch stays isolated)
  if (linkedBkRow) {
    try {
      const bkRow = linkedBkRow;
      {
        const curBkStatus = String(bkRow.status || '').toUpperCase().trim();
        const bkExtraData = safeJsonParse(bkRow.data, {}) as any;
        const prevSqcResult = bkExtraData?.sqcResult || null;

        const failedQty = Number(payload.failedQuantity ?? 0);
        const materialsArr = Array.isArray(payload.materials) ? payload.materials : [];
        const itemsArr = Array.isArray(payload.items) ? payload.items : [];
        const hasMaterialFail = materialsArr.some((mat: any) => {
          if (Number(mat?.failQty || 0) > 0) return true;
          const subItems = Array.isArray(mat?.items) ? mat.items : [];
          return subItems.some((sub: any) => String(sub?.status || '').toUpperCase() === 'FAIL');
        });
        const hasItemFail = itemsArr.some(
          (it: any) => String(it?.status || '').toUpperCase() === 'FAIL'
        );
        const isReportRejected = ['REJECTED', 'FAILED', 'FLAGGED', 'REJECT'].includes(statusUpper);
        const isReportSubmittedOrReviewed = [
          'PENDING',
          'SUBMITTED',
          'APPROVED',
          'VERIFIED',
          'LOCKED',
          'COMPLETED',
          'PASSED',
          'PASS',
        ].includes(statusUpper);

        let nextBkStatus: string | null = null;
        let nextSqcResult: 'PASS' | 'FAIL' | null = null;

        if (isReportRejected) {
          nextBkStatus = 'RETURNED_FOR_SUPPLEMENT';
          nextSqcResult = 'FAIL';
        } else if (isReportSubmittedOrReviewed) {
          const hasAnyFail = failedQty > 0 || hasMaterialFail || hasItemFail;
          if (hasAnyFail) {
            nextBkStatus = 'RETURNED_FOR_SUPPLEMENT';
            nextSqcResult = 'FAIL';
          } else {
            nextBkStatus = 'COMPLETED';
            nextSqcResult = 'PASS';
          }
        } else if (
          statusUpper === 'DRAFT' &&
          ['PENDING', 'ASSIGNED', 'RETURNED_FOR_SUPPLEMENT'].includes(curBkStatus)
        ) {
          nextBkStatus = 'IN_PROGRESS';
        }

        const wasManualOverride = Boolean(bkExtraData?.manualStatusOverride);

        if (
          nextBkStatus &&
          (wasManualOverride ||
            nextBkStatus !== curBkStatus ||
            (nextSqcResult && nextSqcResult !== prevSqcResult))
        ) {
          const overrideClearPatch = wasManualOverride
            ? { manualStatusOverride: false, manualClearedAt: nowTs, manualClearedBySqcId: id }
            : {};

          if (nextBkStatus === 'RETURNED_FOR_SUPPLEMENT') {
            const failNote = failedQty > 0
              ? `Báo cáo SQC (${id}) kết luận KHÔNG ĐẠT / FAIL (SL lỗi: ${failedQty}). Cần kiểm tra lại.`
              : `Báo cáo SQC (${id}) kết luận KHÔNG ĐẠT / FAIL. Cần kiểm tra lại.`;
            const dataPatch = JSON.stringify({
              ...overrideClearPatch,
              sqcResult: 'FAIL',
              lastSqcId: id,
              lastSqcStatus: statusUpper,
              lastSqcUpdatedAt: nowTs,
              rejectionReason: failNote,
              rejectedAt: nowTs,
              rejectedByName: inspectorName || actorUser?.name || actorId || 'QC',
            });
            await query(
              `UPDATE ${SCHEMA}.subcontractor_bookings
               SET status = $1,
                   version = COALESCE(version, 1) + 1,
                   updated_at = $2,
                   data = COALESCE(data, '{}'::jsonb) || $3::jsonb
               WHERE id = $4 AND deleted_at IS NULL`,
              [nextBkStatus, nowTs, dataPatch, bkRow.id]
            );

            if (bkRow.requester_id) {
              const notifId = `notif_${nowTs}_${crypto.randomUUID().slice(0, 8)}`;
              const notifLink = JSON.stringify({ view: 'SUBCONTRACTOR_BOOKING', id: bkRow.id });
              const notifData = JSON.stringify({ link: { view: 'SUBCONTRACTOR_BOOKING', id: bkRow.id } });
              await query(
                `INSERT INTO ${SCHEMA}.notifications (id, user_id, type, title, message, data, link_json, is_read, created_at)
                 VALUES ($1, $2, 'ALERT', $3, $4, $5, $6, 0, $7)`,
                [
                  notifId,
                  bkRow.requester_id,
                  `⚠️ Đã nghiệm thu (FAIL) - Cần kiểm lại: ${bkRow.booking_code}`,
                  `PO: ${bkRow.po_number || '---'} | ${failNote}`,
                  notifData,
                  notifLink,
                  nowTs,
                ]
              ).catch(() => {});
            }
          } else if (nextBkStatus === 'COMPLETED') {
            const dataPatch = JSON.stringify({
              ...overrideClearPatch,
              sqcResult: 'PASS',
              lastSqcId: id,
              lastSqcStatus: statusUpper,
              lastSqcUpdatedAt: nowTs,
              rejectionReason: '',
            });
            await query(
              `UPDATE ${SCHEMA}.subcontractor_bookings
               SET status = $1,
                   version = COALESCE(version, 1) + 1,
                   updated_at = $2,
                   data = COALESCE(data, '{}'::jsonb) || $3::jsonb
               WHERE id = $4 AND deleted_at IS NULL`,
              [nextBkStatus, nowTs, dataPatch, bkRow.id]
            );

            if (bkRow.requester_id && curBkStatus !== 'COMPLETED') {
              const notifId = `notif_${nowTs}_${crypto.randomUUID().slice(0, 8)}`;
              const notifLink = JSON.stringify({ view: 'SUBCONTRACTOR_BOOKING', id: bkRow.id });
              const notifData = JSON.stringify({ link: { view: 'SUBCONTRACTOR_BOOKING', id: bkRow.id } });
              await query(
                `INSERT INTO ${SCHEMA}.notifications (id, user_id, type, title, message, data, link_json, is_read, created_at)
                 VALUES ($1, $2, 'INFO', $3, $4, $5, $6, 0, $7)`,
                [
                  notifId,
                  bkRow.requester_id,
                  `✅ Đã nghiệm thu (PASS): ${bkRow.booking_code}`,
                  `PO: ${bkRow.po_number || '---'} | QC ${inspectorName || 'phụ trách'} đã hoàn tất báo cáo SQC (${id}) đạt yêu cầu.`,
                  notifData,
                  notifLink,
                  nowTs,
                ]
              ).catch(() => {});
            }
          } else {
            const dataPatch = JSON.stringify({
              ...overrideClearPatch,
              lastSqcId: id,
              lastSqcStatus: statusUpper,
              lastSqcUpdatedAt: nowTs,
            });
            await query(
              `UPDATE ${SCHEMA}.subcontractor_bookings
               SET status = $1,
                   version = COALESCE(version, 1) + 1,
                   updated_at = $2,
                   data = COALESCE(data, '{}'::jsonb) || $3::jsonb
               WHERE id = $4 AND deleted_at IS NULL`,
              [nextBkStatus, nowTs, dataPatch, bkRow.id]
            );
          }

          await writeAuditLog({
            userId: actorId || inspectorName || 'system',
            action: 'AUTO_SYNC_BOOKING_FROM_SQC',
            entityType: 'subcontractor_booking',
            entityId: bkRow.id,
            oldValue: { status: curBkStatus, sqc_result: prevSqcResult },
            newValue: {
              status: nextBkStatus,
              sqc_result: nextSqcResult,
              booking_code: bkRow.booking_code,
              inspection_id: id,
              inspection_status: statusUpper,
              failed_qty: failedQty,
            },
          });
        }
      }
    } catch (bkSyncErr: any) {
      console.warn('[Booking Auto-Sync] Warning:', bkSyncErr?.message);
    }
  }

  return { success: true, inspection: { ...payload, id, type: typeUpper, status: statusVal, version: nextVersion, updatedAt: nowTs } };
}

export async function softDeleteInspectionRecord(id: string, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  const existing = await query(`SELECT status FROM ${SCHEMA}.inspections WHERE id = $1 LIMIT 1`, [id]);
  const existingUpper = String(existing.rows[0]?.status || '').toUpperCase();
  if (existingUpper === 'LOCKED' || existingUpper === 'COMPLETED' || existingUpper === 'VERIFIED') {
    throw Object.assign(new Error(`Phiếu kiểm tra đang ở trạng thái ${existingUpper}, không thể xóa theo quy tắc ISO.`), { statusCode: 403 });
  }

  for (const tbl of ALL_FORM_TABLES) {
    await query(`UPDATE ${SCHEMA}."${tbl}" SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL`, [nowTs, id]).catch(() => {});
  }
  await query(`UPDATE ${SCHEMA}.inspections SET status = 'DELETED', updated_at = $1 WHERE id = $2`, [nowTs, id]);
  await markTraceabilityIndexDeleted(id, nowTs);

  await writeAuditLog({
    userId: actorId,
    action: 'SOFT_DELETE_INSPECTION',
    entityType: 'inspection',
    entityId: id,
    oldValue: existing.rows[0] || null,
    newValue: { status: 'DELETED', deleted_at: nowTs },
  });

  return { success: true };
}

export async function getDeletedInspectionsList() {
  const results: any[] = [];
  for (const tbl of ALL_FORM_TABLES) {
    try {
      const res = await query(
        `SELECT id, ma_ct, ten_ct, ten_hang_muc, workshop, status, type, date, created_at, deleted_at, data
         FROM ${SCHEMA}."${tbl}"
         WHERE deleted_at IS NOT NULL
         ORDER BY deleted_at DESC
         LIMIT 50`
      );
      for (const r of res.rows) {
        const extra = safeJsonParse<Record<string, any>>(r.data, {});
        results.push({
          ...extra,
          id: r.id,
          type: r.type || tbl.replace('forms_', '').toUpperCase(),
          ma_ct: r.ma_ct || extra.ma_ct || '',
          ten_ct: r.ten_ct || extra.ten_ct || '',
          ten_hang_muc: r.ten_hang_muc || extra.ten_hang_muc || '',
          workshop: r.workshop || extra.workshop || '',
          status: r.status || extra.status || 'DRAFT',
          inspectorName: extra.inspectorName || extra.inspector || '',
          date: extra.date || (r.date ? String(r.date) : ''),
          deleted_at: r.deleted_at ? Number(r.deleted_at) : undefined,
          deletedAt: r.deleted_at ? Number(r.deleted_at) : undefined,
          sourceTable: tbl,
        });
      }
    } catch {
      // Table may not support column
    }
  }
  results.sort((a, b) => (b.deleted_at || 0) - (a.deleted_at || 0));
  return results.slice(0, 200);
}

export async function restoreInspectionRecord(id: string, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  let restoredStatus = 'DRAFT';

  for (const tbl of ALL_FORM_TABLES) {
    try {
      const r = await query(
        `UPDATE ${SCHEMA}."${tbl}" SET deleted_at = NULL, updated_at = $1 WHERE id = $2 AND deleted_at IS NOT NULL RETURNING status`,
        [nowTs, id]
      );
      if (r.rows.length > 0 && r.rows[0].status) {
        restoredStatus = r.rows[0].status;
      }
    } catch {
      // ignore
    }
  }

  await query(`UPDATE ${SCHEMA}.inspections SET status = $1, updated_at = $2 WHERE id = $3`, [restoredStatus, nowTs, id]);
  await restoreTraceabilityIndex(id, restoredStatus);

  // Mandatory RESTORE_ACTION audit log per M12 AGENTS.md spec
  await writeAuditLog({
    userId: actorId,
    action: 'RESTORE_ACTION',
    entityType: 'inspection',
    entityId: id,
    oldValue: { status: 'DELETED' },
    newValue: { status: restoredStatus, restoredAt: nowTs },
  });

  return { success: true };
}

export async function permanentDeleteInspectionRecord(id: string, actorId?: string | null) {
  for (const tbl of ALL_FORM_TABLES) {
    await query(`DELETE FROM ${SCHEMA}."${tbl}" WHERE id = $1 AND deleted_at IS NOT NULL`, [id]).catch(() => {});
  }
  await query(`DELETE FROM ${SCHEMA}.inspections WHERE id = $1 AND UPPER(COALESCE(status, '')) = 'DELETED'`, [id]);
  await purgeTraceabilityIndex(id);

  await writeAuditLog({
    userId: actorId,
    action: 'PERMANENT_DELETE_INSPECTION',
    entityType: 'inspection',
    entityId: id,
  });

  return { success: true };
}

// --- DEFECTS (M06) & DEFECT LIBRARY (M07) ---
export async function getDefectsList(filters: { status?: string } = {}) {
  const clauses: string[] = ['n.deleted_at IS NULL'];
  const params: any[] = [];
  let idx = 1;
  if (filters.status && filters.status !== 'ALL') {
    clauses.push(`UPPER(COALESCE(n.status, '')) = UPPER($${idx++})`);
    params.push(filters.status);
  }
  const res = await query(
    `SELECT n.*, i.ma_ct AS ins_ma_ct, i.ten_ct AS ins_ten_ct, i.workshop AS ins_workshop, i.created_by AS ins_created_by
     FROM ${SCHEMA}.ncrs n
     LEFT JOIN ${SCHEMA}.inspections i ON n.inspection_id = i.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY n.updated_at DESC NULLS LAST, n.created_at DESC NULLS LAST
     LIMIT 200`,
    params
  );

  const items = res.rows.map((r: any) => {
    const extra = safeJsonParse<Record<string, any>>(r.data, {});
    const images = safeJsonParse<any[]>(r.images_before_json, extra.imagesBefore || []);
    return {
      id: r.id,
      code: r.defect_code || r.id,
      defectCode: r.defect_code || '',
      inspectionId: r.inspection_id || '',
      description: r.description || extra.description || '',
      severity: r.severity || 'MINOR',
      status: r.status || 'OPEN',
      ma_ct: extra.ma_ct || r.ins_ma_ct || '',
      ten_ct: extra.ten_ct || r.ins_ten_ct || '',
      workshop: extra.workshop || r.ins_workshop || '',
      inspectorName: r.created_by || r.ins_created_by || '',
      date: extra.createdDate || '',
      rootCause: r.root_cause || '',
      correctiveAction: r.corrective_action || '',
      images,
    };
  });

  return { items, total: items.length };
}

export async function getDefectLibraryList() {
  const res = await query(
    `SELECT * FROM ${SCHEMA}.defect_library WHERE COALESCE(is_deleted, 0) = 0 AND deleted_at IS NULL ORDER BY updated_at DESC NULLS LAST, name ASC`
  );
  return res.rows.map((r: any) => {
    const extra = safeJsonParse<Record<string, any>>(r.data, {});
    return {
      ...extra,
      id: r.id,
      code: r.defect_code || r.code || r.id,
      defect_code: r.defect_code || r.code || r.id,
      name: r.name || r.defect_name || '',
      defect_name: r.defect_name || r.name || '',
      stage: r.stage || r.process_stage || r.applicable_process || 'Chung',
      process_stage: r.process_stage || r.stage || 'Chung',
      category: r.category || r.defect_group || 'Ngoại quan',
      severity: r.severity || 'MINOR',
      status: r.status || 'ACTIVE',
      description: r.description || '',
      suggestedAction: r.suggested_action || extra.suggestedAction || '',
      suggested_action: r.suggested_action || extra.suggestedAction || '',
      correctImage: r.correct_image || extra.correctImage || '',
      correct_image: r.correct_image || '',
      incorrectImage: r.incorrect_image || extra.incorrectImage || '',
      incorrect_image: r.incorrect_image || '',
    };
  });
}

export async function saveDefectLibraryRecord(item: any, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  const id = item.id || crypto.randomUUID();
  assertNoNewBase64DataUri(item, undefined, 'Thư viện lỗi');
  const code = item.code || item.defect_code || id;
  const name = item.name || item.defect_name || '';
  const stage = item.stage || item.process_stage || 'Chung';
  const suggested = item.suggestedAction || item.suggested_action || '';

  await query(
    `INSERT INTO ${SCHEMA}.defect_library (
      id, defect_code, code, name, defect_name, stage, process_stage, category,
      defect_group, severity, status, description, suggested_action, correct_image,
      incorrect_image, created_by, created_at, updated_at, is_deleted, deleted_at, data
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,0,NULL,$18
    )
    ON CONFLICT (id) DO UPDATE SET
      defect_code = EXCLUDED.defect_code,
      code = EXCLUDED.code,
      name = EXCLUDED.name,
      defect_name = EXCLUDED.defect_name,
      stage = EXCLUDED.stage,
      process_stage = EXCLUDED.process_stage,
      category = EXCLUDED.category,
      defect_group = EXCLUDED.defect_group,
      severity = EXCLUDED.severity,
      status = EXCLUDED.status,
      description = EXCLUDED.description,
      suggested_action = EXCLUDED.suggested_action,
      correct_image = EXCLUDED.correct_image,
      incorrect_image = EXCLUDED.incorrect_image,
      updated_at = EXCLUDED.updated_at,
      is_deleted = 0,
      deleted_at = NULL,
      data = EXCLUDED.data`,
    [
      id, code, code, name, name, stage, stage, item.category || 'Ngoại quan',
      item.category || '', item.severity || 'MINOR', item.status || 'ACTIVE', item.description || '',
      suggested, item.correctImage || item.correct_image || '', item.incorrectImage || item.incorrect_image || '',
      actorId || '', nowTs, JSON.stringify({ ...item, id, code, name })
    ]
  );

  await writeAuditLog({ userId: actorId, action: 'SAVE_DEFECT_LIBRARY', entityType: 'defect_library', entityId: id, newValue: { code, name } });
  return { ...item, id, code, name };
}

export async function softDeleteDefectLibraryRecord(id: string, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  await query(`UPDATE ${SCHEMA}.defect_library SET is_deleted = 1, deleted_at = $1, updated_at = $1 WHERE id = $2`, [nowTs, id]);
  await writeAuditLog({ userId: actorId, action: 'DELETE_DEFECT_LIBRARY', entityType: 'defect_library', entityId: id, newValue: { deleted_at: nowTs } });
  return { success: true };
}

// --- MATERIALS (M08 - STRICTLY READ-ONLY) ---
export async function getMaterialsReadOnly(search: string = '', page: number = 1, limit: number = 50) {
  const clauses: string[] = ['1=1'];
  const params: any[] = [];
  let idx = 1;

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    clauses.push(`(
      "material" ILIKE $${idx} OR
      "shortText" ILIKE $${idx} OR
      "supplierName" ILIKE $${idx} OR
      "purchaseDocument" ILIKE $${idx} OR
      "Factory_Order" ILIKE $${idx} OR
      "Ma_Tender" ILIKE $${idx} OR
      "projectName" ILIKE $${idx}
    )`);
    params.push(term);
    idx++;
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  const [countRes, listRes] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM ${SCHEMA}.material ${whereSql}`, params),
    query(
      `SELECT id, "material", "shortText", "orderUnit", "orderQuantity", "supplierName", "projectName",
              "purchaseDocument", "deliveryDate", "Ma_Tender", "Factory_Order", "materialGroupDesc"
       FROM ${SCHEMA}.material
       ${whereSql}
       ORDER BY id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, safeLimit, offset]
    ),
  ]);

  const items = listRes.rows.map((r: any) => ({
    ...r,
    id: String(r.id),
    code: r.material || '',
    name: r.shortText || '',
  }));

  return { items, total: Number(countRes.rows[0]?.total || 0) };
}

// --- IPO DATA (M10 - CORE `ipo` TABLE STRICTLY READ-ONLY) ---
export async function getIpoReadOnly(filters: { page?: number; limit?: number; factoryOrder?: string; maTender?: string } = {}) {
  const clauses: string[] = ['1=1'];
  const params: any[] = [];
  let idx = 1;

  if (filters.factoryOrder && filters.factoryOrder.trim()) {
    const term = `%${filters.factoryOrder.trim()}%`;
    clauses.push(`("ID_Factory_Order" ILIKE $${idx} OR "IPO_Number" ILIKE $${idx} OR "Material_description" ILIKE $${idx})`);
    params.push(term);
    idx++;
  }
  if (filters.maTender && filters.maTender.trim()) {
    const term = `%${filters.maTender.trim()}%`;
    clauses.push(`("Ma_Tender" ILIKE $${idx} OR "Project_name" ILIKE $${idx})`);
    params.push(term);
    idx++;
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const safeLimit = Math.max(1, Math.min(Number(filters.limit) || 50, 200));
  const safePage = Math.max(1, Number(filters.page) || 1);
  const offset = (safePage - 1) * safeLimit;

  const [countRes, listRes] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM ${SCHEMA}.ipo ${whereSql}`, params),
    query(
      `SELECT id, "ID_Project", "Project_name", "Material_description", "Base_Unit",
              "Quantity_IPO", "ID_Factory_Order", "IPO_Number", "Ma_Tender",
              "ID_Material", "Delivery_date", "salesOrder", "Source"
       FROM ${SCHEMA}.ipo
       ${whereSql}
       ORDER BY id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, safeLimit, offset]
    ),
  ]);

  const items = listRes.rows.map((r: any) => ({
    ...r,
    id: String(r.id),
    ma_nha_may: r.ID_Factory_Order || '',
    ma_ct: r.Ma_Tender || '',
    ten_ct: r.Project_name || '',
    ten_hang_muc: r.Material_description || '',
    so_luong_ipo: r.Quantity_IPO || 0,
    dvt: r.Base_Unit || '',
  }));

  return { items, total: Number(countRes.rows[0]?.total || 0) };
}

export async function getIpoDetailExtended(idFactoryOrder: string) {
  const [detailRes, drawingsRes, materialsRes, samplesRes] = await Promise.all([
    query(`SELECT * FROM ${SCHEMA}.ipo_details WHERE id_factory_order = $1 LIMIT 1`, [idFactoryOrder]).catch(() => ({ rows: [] })),
    query(`SELECT * FROM ${SCHEMA}.ipo_drawing_list WHERE id_factory_order = $1 ORDER BY created_at DESC`, [idFactoryOrder]).catch(() => ({ rows: [] })),
    query(`SELECT * FROM ${SCHEMA}.ipo_material_history WHERE id_factory_order = $1 ORDER BY created_at DESC`, [idFactoryOrder]).catch(() => ({ rows: [] })),
    query(`SELECT * FROM ${SCHEMA}.ipo_sample_history WHERE id_factory_order = $1 AND deleted_at IS NULL ORDER BY created_at DESC`, [idFactoryOrder]).catch(() => ({ rows: [] })),
  ]);

  return {
    detail: detailRes.rows[0] || null,
    drawings: drawingsRes.rows,
    materials: materialsRes.rows,
    samples: samplesRes.rows,
  };
}

export async function saveIpoDetailExtendedRecord(detail: any, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  const id = detail.id || `ipodet_${detail.id_factory_order || Date.now()}`;
  await query(
    `INSERT INTO ${SCHEMA}.ipo_details (id, id_factory_order, history_summary, material_history, sample_history, last_analysis_at, data, implementation_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET
       history_summary = EXCLUDED.history_summary,
       material_history = EXCLUDED.material_history,
       sample_history = EXCLUDED.sample_history,
       last_analysis_at = EXCLUDED.last_analysis_at,
       data = EXCLUDED.data,
       implementation_date = EXCLUDED.implementation_date`,
    [
      id,
      detail.id_factory_order || '',
      detail.history_summary || '',
      detail.material_history || '',
      detail.sample_history || '',
      nowTs,
      JSON.stringify(detail),
      detail.implementation_date ? Number(detail.implementation_date) : null,
    ]
  );
  await writeAuditLog({ userId: actorId, action: 'SAVE_IPO_DETAIL', entityType: 'ipo_detail', entityId: id, newValue: detail });
  return { ...detail, id };
}

export async function saveIpoDrawingRecord(drawing: any, actorId?: string | null) {
  const id = crypto.randomUUID();
  const nowTs = Math.floor(Date.now() / 1000);
  assertNoNewBase64DataUri(drawing, undefined, 'Bản vẽ IPO');
  await query(
    `INSERT INTO ${SCHEMA}.ipo_drawing_list (id, id_factory_order, drawing_name, version, file_url, revision_notes, page_count, created_at, created_by, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      drawing.id_factory_order || '',
      drawing.drawing_name || '',
      drawing.version || '1.0',
      drawing.file_url || '',
      drawing.revision_notes || '',
      Number(drawing.page_count || 0),
      nowTs,
      actorId || '',
      JSON.stringify(drawing),
    ]
  );
  await writeAuditLog({ userId: actorId, action: 'SAVE_IPO_DRAWING', entityType: 'ipo_drawing', entityId: id, newValue: drawing });
  return { ...drawing, id };
}

export async function saveIpoMaterialHistoryRecord(mat: any, actorId?: string | null) {
  const id = crypto.randomUUID();
  const nowTs = Math.floor(Date.now() / 1000);
  assertNoNewBase64DataUri(mat, undefined, 'Lịch sử vật liệu IPO');
  await query(
    `INSERT INTO ${SCHEMA}.ipo_material_history (id, id_factory_order, material_name, specification, version, drawing_ref, created_at, created_by, data, file_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      mat.id_factory_order || '',
      mat.material_name || '',
      mat.specification || '',
      mat.version || '1.0',
      mat.drawing_ref || '',
      nowTs,
      actorId || '',
      JSON.stringify(mat),
      mat.file_url || '',
    ]
  );
  await writeAuditLog({ userId: actorId, action: 'SAVE_IPO_MATERIAL_HISTORY', entityType: 'ipo_material_history', entityId: id, newValue: mat });
  return { ...mat, id };
}

export async function saveIpoSampleHistoryRecord(sample: any, actorId?: string | null) {
  const id = crypto.randomUUID();
  const nowTs = Math.floor(Date.now() / 1000);
  assertNoNewBase64DataUri(sample, undefined, 'Mẫu IPO');
  await query(
    `INSERT INTO ${SCHEMA}.ipo_sample_history (id, id_factory_order, sample_name, status, version, file_url, created_at, created_by, deleted_at, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9)`,
    [
      id,
      sample.id_factory_order || '',
      sample.sample_name || '',
      sample.status || 'PENDING',
      sample.version || '1.0',
      sample.file_url || '',
      nowTs,
      actorId || '',
      JSON.stringify(sample),
    ]
  );
  await writeAuditLog({ userId: actorId, action: 'SAVE_IPO_SAMPLE_HISTORY', entityType: 'ipo_sample_history', entityId: id, newValue: sample });
  return { ...sample, id };
}

export async function updateIpoSampleHistoryRecord(id: string, sample: any, actorId?: string | null) {
  assertNoNewBase64DataUri(sample, undefined, 'Mẫu IPO');
  await query(
    `UPDATE ${SCHEMA}.ipo_sample_history SET sample_name=$1, status=$2, version=$3, file_url=$4, data=$5 WHERE id=$6 AND deleted_at IS NULL`,
    [sample.sample_name || '', sample.status || 'PENDING', sample.version || '1.0', sample.file_url || '', JSON.stringify(sample), id]
  );
  await writeAuditLog({ userId: actorId, action: 'UPDATE_IPO_SAMPLE_HISTORY', entityType: 'ipo_sample_history', entityId: id, newValue: sample });
  return { ...sample, id };
}

export async function deleteIpoSampleHistoryRecord(id: string, actorId?: string | null) {
  const nowTs = Math.floor(Date.now() / 1000);
  await query(`UPDATE ${SCHEMA}.ipo_sample_history SET deleted_at = $1 WHERE id = $2`, [nowTs, id]);
  await writeAuditLog({ userId: actorId, action: 'SOFT_DELETE_IPO_SAMPLE_HISTORY', entityType: 'ipo_sample_history', entityId: id, newValue: { deleted_at: nowTs } });
  return { success: true };
}

export async function getPlansList(filters: { projectId?: string; search?: string; page?: number; limit?: number } | string = {}) {
  const opts = typeof filters === 'string' ? { projectId: filters } : (filters || {});
  const clauses: string[] = ['1=1'];
  const params: any[] = [];
  let idx = 1;

  if (opts.projectId && opts.projectId.trim()) {
    clauses.push(`UPPER(ma_ct) = UPPER($${idx++})`);
    params.push(opts.projectId.trim());
  }
  if (opts.search && opts.search.trim()) {
    const term = `%${opts.search.trim()}%`;
    clauses.push(`(ma_ct ILIKE $${idx} OR ten_ct ILIKE $${idx} OR ma_nha_may ILIKE $${idx} OR ten_hang_muc ILIKE $${idx})`);
    params.push(term);
    idx++;
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const safeLimit = Math.max(1, Math.min(Number(opts.limit) || 200, 500));
  const safePage = Math.max(1, Number(opts.page) || 1);
  const offset = (safePage - 1) * safeLimit;

  const [countRes, listRes] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM ${SCHEMA}.plans ${whereSql}`, params),
    query(
      `SELECT * FROM ${SCHEMA}.plans ${whereSql} ORDER BY id DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, safeLimit, offset]
    ),
  ]);

  const items = listRes.rows.map((r: any) => ({
    ...r,
    id: String(r.id),
  }));

  if (opts.projectId) {
    return items;
  }
  return { items, total: Number(countRes.rows[0]?.total || items.length) };
}
