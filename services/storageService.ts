import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { query } from '../lib/db.js';

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const STORAGE_SIGNING_SECRET =
  process.env.STORAGE_SIGNING_SECRET ||
  process.env.JWT_SECRET ||
  'aa-qms-v3-1-0-storage-signing-secret';

export const MAX_STORAGE_FILE_BYTES = 25 * 1024 * 1024; // 25MB

export const MIME_EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'text/csv': '.csv',
  'application/csv': '.csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/acad': '.dwg',
  'image/vnd.dwg': '.dwg',
  'application/dxf': '.dxf',
  'image/vnd.dxf': '.dxf',
};

export const ALLOWED_UPLOAD_MIMES = new Set([
  ...Object.keys(MIME_EXT_MAP),
  'application/octet-stream',
]);

export interface SignedUploadGrant {
  storageKey: string;
  uploadUrl: string;
  method: 'PUT';
  accessUrl: string;
  signedDownloadUrl: string;
  expiresAt: number;
  maxBytes: number;
}

export function isAllowedMimeType(mime?: string): boolean {
  const normalized = String(mime || '').toLowerCase().split(';')[0].trim();
  if (!normalized) return true; // allow fallback extension check when client omits contentType
  return normalized.startsWith('image/') || normalized === 'text/plain' || normalized === 'text/csv' || ALLOWED_UPLOAD_MIMES.has(normalized);
}

export function sanitizeStorageKey(rawKey: string): string {
  const cleaned = String(rawKey || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, '_'))
    .join('/');
  if (!cleaned) {
    throw Object.assign(new Error('Invalid storage key'), { statusCode: 400 });
  }
  return cleaned;
}

export function resolveStorageFilePath(storageKey: string): string {
  const safeKey = sanitizeStorageKey(storageKey);
  const resolved = path.resolve(UPLOAD_DIR, safeKey);
  if (resolved !== UPLOAD_DIR && !resolved.startsWith(UPLOAD_DIR + path.sep)) {
    throw Object.assign(new Error('Forbidden storage path'), { statusCode: 403 });
  }
  return resolved;
}

export function buildStorageKey(params: {
  filename?: string;
  contentType?: string;
  entityType?: string;
  entityId?: string;
  role?: string;
}): string {
  const entityType = String(params.entityType || 'GENERAL')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 32) || 'general';
  const rawName = String(params.filename || 'file.png');
  const rawExt = path.extname(rawName).toLowerCase();
  const mappedExt = MIME_EXT_MAP[String(params.contentType || '').toLowerCase().split(';')[0].trim()] || '';
  const ext = rawExt && rawExt !== '.bin' ? rawExt : (mappedExt || '.png');
  const base = path
    .basename(rawName, rawExt)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40) || 'asset';
  const roleTag = String(params.role || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 20);
  const prefix = roleTag ? `${roleTag}_` : '';
  const uniqueName = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${prefix}${base}${ext}`;
  return sanitizeStorageKey(`qms/${entityType}/${uniqueName}`);
}

function computeSignature(action: 'upload' | 'download', storageKey: string, expiresAt: number): string {
  const payload = `${action}:${storageKey}:${expiresAt}`;
  return crypto
    .createHmac('sha256', STORAGE_SIGNING_SECRET)
    .update(payload)
    .digest('hex');
}

export function createSignedUploadUrl(params: {
  filename?: string;
  contentType?: string;
  entityType?: string;
  entityId?: string;
  role?: string;
  ttlSeconds?: number;
}): SignedUploadGrant {
  if (!isAllowedMimeType(params.contentType)) {
    throw Object.assign(
      new Error(`Định dạng tệp không được hỗ trợ: ${params.contentType}`),
      { statusCode: 400 }
    );
  }
  const storageKey = buildStorageKey(params);
  const ttl = Math.max(30, Math.min(Number(params.ttlSeconds) || 300, 3600));
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;
  const sig = computeSignature('upload', storageKey, expiresAt);
  const encodedKey = encodeURIComponent(storageKey);

  return {
    storageKey,
    uploadUrl: `/api/storage/upload?key=${encodedKey}&expires=${expiresAt}&sig=${sig}`,
    method: 'PUT',
    accessUrl: `/api/storage/files/${storageKey}`,
    signedDownloadUrl: createSignedDownloadUrl(storageKey, 3600),
    expiresAt,
    maxBytes: MAX_STORAGE_FILE_BYTES,
  };
}

export function createSignedDownloadUrl(storageKeyOrUrl: string, ttlSeconds: number = 3600): string {
  const raw = String(storageKeyOrUrl || '').trim();
  if (!raw) return '';

  let key = raw;
  if (key.startsWith('/api/storage/files/')) {
    key = key.slice('/api/storage/files/'.length).split('?')[0];
  } else if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('/uploads/') || key.startsWith('data:')) {
    return raw;
  }

  const safeKey = sanitizeStorageKey(decodeURIComponent(key));
  const ttl = Math.max(30, Math.min(Number(ttlSeconds) || 3600, 86400));
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;
  const sig = computeSignature('download', safeKey, expiresAt);
  return `/api/storage/files/${safeKey}?expires=${expiresAt}&sig=${sig}`;
}

export function verifySignedStorageRequest(params: {
  action: 'upload' | 'download';
  key: string;
  expires: string | number | undefined;
  sig: string | undefined;
}): { ok: true; storageKey: string } | { ok: false; statusCode: number; error: string } {
  try {
    const storageKey = sanitizeStorageKey(decodeURIComponent(String(params.key || '')));
    const expiresNum = Number(params.expires);
    const sigStr = String(params.sig || '').trim();

    if (!expiresNum || !Number.isFinite(expiresNum) || !sigStr) {
      return { ok: false, statusCode: 403, error: 'Thiếu chữ ký xác thực Signed URL.' };
    }
    const nowTs = Math.floor(Date.now() / 1000);
    if (nowTs > expiresNum) {
      return { ok: false, statusCode: 403, error: 'Signed URL đã hết hạn. Vui lòng tạo phiên tải mới.' };
    }

    const expected = computeSignature(params.action, storageKey, expiresNum);
    const a = Buffer.from(sigStr, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, statusCode: 403, error: 'Chữ ký Signed URL không hợp lệ.' };
    }
    return { ok: true, storageKey };
  } catch (err: any) {
    return { ok: false, statusCode: err?.statusCode || 400, error: err?.message || 'Signed URL không hợp lệ.' };
  }
}

export async function writeStorageBuffer(storageKey: string, buffer: Buffer): Promise<{ storageKey: string; accessUrl: string; size: number }> {
  if (buffer.length > MAX_STORAGE_FILE_BYTES) {
    throw Object.assign(new Error('Kích thước tệp vượt quá giới hạn 25MB.'), { statusCode: 413 });
  }
  const destPath = resolveStorageFilePath(storageKey);
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await fs.promises.writeFile(destPath, buffer);
  return {
    storageKey: sanitizeStorageKey(storageKey),
    accessUrl: `/api/storage/files/${sanitizeStorageKey(storageKey)}`,
    size: buffer.length,
  };
}

export function stripTransientMediaUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return rawUrl;

  if (trimmed.includes('/api/storage/files/')) {
    const qIdx = trimmed.indexOf('?');
    if (qIdx === -1) return trimmed;
    const base = trimmed.slice(0, qIdx);
    const params = new URLSearchParams(trimmed.slice(qIdx + 1));
    params.delete('expires');
    params.delete('sig');
    params.delete('token');
    params.delete('_r');
    const rest = params.toString();
    return rest ? `${base}?${rest}` : base;
  }

  if (
    trimmed.includes('/api/media/image/') ||
    trimmed.includes('/api/image/') ||
    trimmed.includes('/display-image/') ||
    trimmed.includes('/media/stream/')
  ) {
    const qIdx = trimmed.indexOf('?');
    if (qIdx === -1) return trimmed;
    const base = trimmed.slice(0, qIdx);
    const params = new URLSearchParams(trimmed.slice(qIdx + 1));
    params.delete('google_token');
    params.delete('token');
    params.delete('_r');
    const rest = params.toString();
    return rest ? `${base}?${rest}` : base;
  }

  return rawUrl;
}

export function stripTransientMediaUrlParams<T>(input: T, depth: number = 0): T {
  if (depth > 8 || input === null || input === undefined) return input;
  if (typeof input === 'string') {
    return stripTransientMediaUrl(input) as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => stripTransientMediaUrlParams(item, depth + 1)) as unknown as T;
  }
  if (typeof input === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input as Record<string, any>)) {
      out[k] = stripTransientMediaUrlParams(v, depth + 1);
    }
    return out as T;
  }
  return input;
}

export function signPublicMediaUrls<T>(input: T, ttlSeconds: number = 3600): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    const clean = stripTransientMediaUrl(input);
    if (clean.startsWith('/api/storage/files/')) {
      return createSignedDownloadUrl(clean, ttlSeconds) as unknown as T;
    }
    return clean as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => signPublicMediaUrls(item, ttlSeconds)) as unknown as T;
  }
  if (typeof input === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input as Record<string, any>)) {
      out[k] = signPublicMediaUrls(v, ttlSeconds);
    }
    return out as T;
  }
  return input;
}

// --- ANTI-BASE64 GUARD (ISO COMPLIANCE: NO RAW BASE64 DATA URI IN DATABASE) ---
const BASE64_DATA_URI_REGEX = /^data:(?:image|application|video|audio|text)\/[a-z0-9.+-]+(?:;[a-z0-9=_-]+)*;base64,/i;

function collectBase64Entries(
  value: any,
  currentPath: string = 'payload',
  out: Array<{ path: string; value: string }> = [],
  depth: number = 0
): Array<{ path: string; value: string }> {
  if (depth > 8 || value === null || value === undefined) return out;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (BASE64_DATA_URI_REGEX.test(trimmed)) {
      out.push({ path: currentPath, value: trimmed });
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectBase64Entries(value[i], `${currentPath}[${i}]`, out, depth + 1);
    }
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      collectBase64Entries(val, `${currentPath}.${key}`, out, depth + 1);
    }
  }
  return out;
}

/**
 * Rejects any newly submitted `data:*;base64,...` URI before writing to PostgreSQL.
 * If `existingRecord` is provided (legacy row update), untouched pre-existing Base64 strings
 * from prior versions are tolerated while any new/modified Base64 payload is strictly blocked (HTTP 400).
 */
export function assertNoNewBase64DataUri(
  incomingPayload: any,
  existingRecord?: any,
  entityLabel: string = 'dữ liệu'
): void {
  const incomingEntries = collectBase64Entries(incomingPayload);
  if (incomingEntries.length === 0) return;

  const existingValues = new Set<string>();
  if (existingRecord) {
    for (const entry of collectBase64Entries(existingRecord)) {
      existingValues.add(entry.value);
    }
  }

  const violating = incomingEntries.find((entry) => !existingValues.has(entry.value));
  if (violating) {
    throw Object.assign(
      new Error(
        `Vi phạm quy tắc ISO (${entityLabel} - ${violating.path}): Cấm lưu trực tiếp chuỗi Base64 vào cơ sở dữ liệu. Vui lòng tải tệp qua Signed URL trước khi lưu.`
      ),
      { statusCode: 400 }
    );
  }
}

// --- LEGACY TEMPORARY ASSET RECOVERY HELPERS (Shared App -> System Drive) ---
const DB_SCHEMA_NAME = process.env.DB_SCHEMA || 'appQAQC';
const DEFAULT_SHARED_APP_ORIGIN = 'https://ais-pre-e6ynktw6fbldrpiouvfick-129161440033.asia-southeast1.run.app';
const POSITIVE_DRIVE_MAP_CACHE = new Map<string, string>();
const NEGATIVE_SHARED_PULL_CACHE = new Map<string, number>();
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0' || h.endsWith('.local')) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function getAllowedSharedAppOrigin(): string | null {
  const raw = String(process.env.SHARED_APP_ORIGIN || DEFAULT_SHARED_APP_ORIGIN).trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return null;
    if (isPrivateOrLoopbackHost(parsed.hostname)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export async function getMigratedDriveFileId(storageKey: string): Promise<string | null> {
  const cleanKey = sanitizeStorageKey(storageKey);
  const cached = POSITIVE_DRIVE_MAP_CACHE.get(cleanKey);
  if (cached) return cached;

  try {
    const res = await query(
      `SELECT drive_file_id FROM "${DB_SCHEMA_NAME}"."storage_drive_map" WHERE storage_key = $1 LIMIT 1`,
      [cleanKey]
    );
    const fileId = res.rows?.[0]?.drive_file_id ? String(res.rows[0].drive_file_id).trim() : '';
    if (fileId) {
      POSITIVE_DRIVE_MAP_CACHE.set(cleanKey, fileId);
      return fileId;
    }
  } catch {
    // Table may not exist yet during early boot; fail safely
  }
  return null;
}

export async function saveMigratedDriveFileId(params: {
  storageKey: string;
  driveFileId: string;
  mimeType?: string;
  sourceOrigin?: string;
}): Promise<void> {
  const cleanKey = sanitizeStorageKey(params.storageKey);
  const cleanFileId = String(params.driveFileId || '').trim();
  if (!cleanFileId) return;
  POSITIVE_DRIVE_MAP_CACHE.set(cleanKey, cleanFileId);
  NEGATIVE_SHARED_PULL_CACHE.delete(cleanKey);

  try {
    await query(
      `INSERT INTO "${DB_SCHEMA_NAME}"."storage_drive_map" (storage_key, drive_file_id, mime_type, source_origin, migrated_at)
       VALUES ($1, $2, $3, $4, EXTRACT(EPOCH FROM NOW())::BIGINT)
       ON CONFLICT (storage_key) DO UPDATE SET
         drive_file_id = EXCLUDED.drive_file_id,
         mime_type = COALESCE(EXCLUDED.mime_type, "${DB_SCHEMA_NAME}"."storage_drive_map".mime_type),
         source_origin = COALESCE(EXCLUDED.source_origin, "${DB_SCHEMA_NAME}"."storage_drive_map".source_origin),
         migrated_at = EXCLUDED.migrated_at`,
      [cleanKey, cleanFileId, params.mimeType || null, params.sourceOrigin || null]
    );
  } catch (err: any) {
    console.warn('[storageService] Could not persist storage_drive_map:', err?.message || err);
  }
}

export function isSharedPullNegativelyCached(storageKey: string): boolean {
  const cleanKey = sanitizeStorageKey(storageKey);
  const ts = NEGATIVE_SHARED_PULL_CACHE.get(cleanKey);
  if (!ts) return false;
  if (Date.now() - ts > NEGATIVE_CACHE_TTL_MS) {
    NEGATIVE_SHARED_PULL_CACHE.delete(cleanKey);
    return false;
  }
  return true;
}

export function markSharedPullNotFound(storageKey: string): void {
  const cleanKey = sanitizeStorageKey(storageKey);
  NEGATIVE_SHARED_PULL_CACHE.set(cleanKey, Date.now());
}

