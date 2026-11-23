import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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

export function signPublicMediaUrls<T>(input: T, ttlSeconds: number = 3600): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    if (input.startsWith('/api/storage/files/')) {
      return createSignedDownloadUrl(input, ttlSeconds) as unknown as T;
    }
    return input;
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
