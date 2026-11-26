import { google } from 'googleapis';
import { Readable } from 'stream';
import path from 'path';

export interface SystemDriveConfigStatus {
  configured: boolean;
  missing: string[];
  hasFolderId: boolean;
}

interface FolderCacheEntry {
  folderId: string;
  cachedAt: number;
}

const FOLDER_CACHE_TTL_MS = 30 * 60 * 1000;
const folderCache = new Map<string, FolderCacheEntry>();
const inflightFolderLookups = new Map<string, Promise<string>>();

let cachedOAuthKey = '';
let cachedOAuthClient: any = null;

function readDriveEnv() {
  const clientId = String(process.env.GOOGLE_DRIVE_CLIENT_ID || '').trim();
  const clientSecret = String(
    process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_DRIVE_SECRET || ''
  ).trim();
  const refreshToken = String(process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '').trim();
  const folderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
  const redirectUri = String(
    process.env.GOOGLE_DRIVE_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
  ).trim();
  return { clientId, clientSecret, refreshToken, folderId, redirectUri };
}

export function getSystemDriveConfigStatus(): SystemDriveConfigStatus {
  const env = readDriveEnv();
  const missing: string[] = [];
  if (!env.clientId) missing.push('GOOGLE_DRIVE_CLIENT_ID');
  if (!env.clientSecret) missing.push('GOOGLE_DRIVE_CLIENT_SECRET');
  if (!env.refreshToken) missing.push('GOOGLE_DRIVE_REFRESH_TOKEN');
  return {
    configured: missing.length === 0,
    missing,
    hasFolderId: Boolean(env.folderId),
  };
}

export function assertSystemDriveConfigured(): void {
  const status = getSystemDriveConfigStatus();
  if (!status.configured) {
    throw Object.assign(
      new Error(
        `Chưa cấu hình đầy đủ Google Drive OAuth hệ thống (thiếu: ${status.missing.join(', ')}). Không thể tải tệp lên Google Drive.`
      ),
      { statusCode: 503, missingEnv: status.missing }
    );
  }
}

function getSystemOAuth2Client() {
  assertSystemDriveConfigured();
  const env = readDriveEnv();
  const fingerprint = `${env.clientId}:${env.redirectUri}:${env.refreshToken.slice(-8)}`;
  if (!cachedOAuthClient || cachedOAuthKey !== fingerprint) {
    const oauth2Client = new google.auth.OAuth2(
      env.clientId,
      env.clientSecret,
      env.redirectUri
    );
    oauth2Client.setCredentials({ refresh_token: env.refreshToken });
    cachedOAuthClient = oauth2Client;
    cachedOAuthKey = fingerprint;
  }
  return cachedOAuthClient;
}

export async function getSystemDriveAccessToken(): Promise<string | null> {
  const status = getSystemDriveConfigStatus();
  if (!status.configured) return null;
  try {
    const authClient = getSystemOAuth2Client();
    const tokenResp = await authClient.getAccessToken();
    const token = typeof tokenResp === 'string' ? tokenResp : tokenResp?.token;
    return token ? String(token).trim() : null;
  } catch (err: any) {
    console.warn('[SystemDriveOAuth] Failed getting access token:', err?.message || err);
    return null;
  }
}

function getGmt7DateString(): string {
  const gmt7Ms = Date.now() + 7 * 60 * 60 * 1000;
  const d = new Date(gmt7Ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function sanitizeFolderSegment(raw?: string, fallback: string = 'GENERAL'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[\\/:*?"<>|']/g, '_')
    .slice(0, 64);
  return cleaned || fallback;
}

async function findOrCreateDriveFolder(
  drive: any,
  folderName: string,
  parentId?: string
): Promise<string> {
  const safeName = sanitizeFolderSegment(folderName, 'QMS_FOLDER');
  const cacheKey = `${parentId || 'root'}::${safeName}`;
  const existingCached = folderCache.get(cacheKey);
  if (existingCached && Date.now() - existingCached.cachedAt < FOLDER_CACHE_TTL_MS) {
    return existingCached.folderId;
  }

  const inflight = inflightFolderLookups.get(cacheKey);
  if (inflight) return inflight;

  const lookupPromise = (async () => {
    const escapedName = safeName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const parentClause = parentId ? `'${parentId.replace(/'/g, '')}' in parents and ` : `'root' in parents and `;
    const listRes = await drive.files.list({
      q: `${parentClause}name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      spaces: 'drive',
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: parentId ? undefined : 'user',
      pageSize: 5,
    });

    const foundId = listRes.data?.files?.[0]?.id;
    if (foundId) {
      folderCache.set(cacheKey, { folderId: foundId, cachedAt: Date.now() });
      return foundId;
    }

    const createRes = await drive.files.create({
      requestBody: {
        name: safeName,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    const createdId = createRes.data?.id;
    if (!createdId) {
      throw new Error(`Không thể tạo thư mục "${safeName}" trên Google Drive.`);
    }
    folderCache.set(cacheKey, { folderId: createdId, cachedAt: Date.now() });
    return createdId;
  })().finally(() => {
    inflightFolderLookups.delete(cacheKey);
  });

  inflightFolderLookups.set(cacheKey, lookupPromise);
  return lookupPromise;
}

export interface DriveUploadResult {
  fileId: string;
  name: string;
  storageKey: string;
  url: string;
  accessUrl: string;
  folderId: string;
  size: number;
  mimetype: string;
}

export async function uploadBufferToSystemDrive(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  entityType?: string;
  ma_ct?: string;
  role?: string;
}): Promise<DriveUploadResult> {
  assertSystemDriveConfigured();
  const env = readDriveEnv();
  const authClient = getSystemOAuth2Client();
  const drive = google.drive({ version: 'v3', auth: authClient });

  try {
    const rootFolderId = env.folderId || (await findOrCreateDriveFolder(drive, 'AA_QMS_Uploads'));
    const primaryBucket = sanitizeFolderSegment(
      params.ma_ct || params.entityType || 'GENERAL',
      'GENERAL'
    );
    const dateBucket = getGmt7DateString();

    const bucketFolderId = await findOrCreateDriveFolder(drive, primaryBucket, rootFolderId);
    const targetFolderId = await findOrCreateDriveFolder(drive, dateBucket, bucketFolderId);

    const ext = path.extname(params.filename || '') || '';
    const base = path
      .basename(params.filename || 'file', ext)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 60) || 'asset';
    const roleTag = params.role
      ? `${String(params.role).toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 20)}_`
      : '';
    const driveFilename = `${Date.now()}_${roleTag}${base}${ext}`;
    const resolvedMime = String(params.mimeType || 'application/octet-stream').split(';')[0].trim();

    const uploadRes = await drive.files.create({
      requestBody: {
        name: driveFilename,
        parents: [targetFolderId],
        mimeType: resolvedMime,
      },
      media: {
        mimeType: resolvedMime,
        body: Readable.from(params.buffer),
      },
      fields: 'id, name, mimeType, size',
      supportsAllDrives: true,
    });

    const fileId = uploadRes.data?.id;
    if (!fileId) {
      throw new Error('Google Drive API không trả về File ID sau khi tải lên.');
    }

    const mediaUrl = `/api/media/image/${fileId}`;
    return {
      fileId,
      name: uploadRes.data?.name || driveFilename,
      storageKey: `gdrive/${fileId}`,
      url: mediaUrl,
      accessUrl: mediaUrl,
      folderId: targetFolderId,
      size: params.buffer.length,
      mimetype: resolvedMime,
    };
  } catch (err: any) {
    if (err?.statusCode === 503) throw err;
    const apiMsg =
      err?.response?.data?.error?.message ||
      err?.errors?.[0]?.message ||
      err?.message ||
      'Lỗi kết nối Google Drive API';
    console.error('[SystemDriveOAuth] Upload failed:', apiMsg);
    throw Object.assign(
      new Error(`Không thể tải tệp lên Google Drive OAuth hệ thống: ${apiMsg}`),
      { statusCode: 502 }
    );
  }
}

export async function downloadDriveFileWithSystemOAuth(
  fileId: string
): Promise<{ ok: boolean; status: number; contentType: string; buf?: Buffer; error?: string }> {
  const cleanId = String(fileId || '').trim();
  if (!/^[a-zA-Z0-9_-]{10,120}$/.test(cleanId)) {
    return { ok: false, status: 400, contentType: '', error: 'Invalid Google Drive fileId' };
  }

  const token = await getSystemDriveAccessToken();
  if (!token) {
    return { ok: false, status: 503, contentType: '', error: 'System Google Drive OAuth unavailable' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cleanId)}?alt=media&supportsAllDrives=true`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
        signal: controller.signal,
      }
    );

    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        contentType: resp.headers.get('content-type') || '',
        error: `Google Drive API returned ${resp.status}`,
      };
    }

    const contentType = (resp.headers.get('content-type') || 'application/octet-stream').toLowerCase();
    if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
      return { ok: false, status: 502, contentType, error: 'Google Drive returned HTML instead of binary' };
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    return { ok: true, status: 200, contentType, buf };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, status: 504, contentType: '', error: 'Google Drive download timed out' };
    }
    return { ok: false, status: 502, contentType: '', error: err?.message || 'Google Drive download failed' };
  } finally {
    clearTimeout(timeoutId);
  }
}
