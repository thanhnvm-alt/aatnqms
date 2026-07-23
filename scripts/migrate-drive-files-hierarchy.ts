import pg from 'pg';
const { Client } = pg;
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Ensure output directory exists for reports
const LOG_DIR = './logs';
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const REPORT_FILE = path.join(LOG_DIR, `drive-migration-report-${Date.now()}.log`);
const SUMMARY_FILE = path.join(LOG_DIR, `drive-migration-summary-${Date.now()}.json`);

function logMessage(msg: string, writeToFile = true) {
  const formatted = `[${new Date().toISOString()}] ${msg}`;
  console.log(formatted);
  if (writeToFile) {
    fs.appendFileSync(REPORT_FILE, formatted + '\n', 'utf-8');
  }
}

// 1. Google Drive ID Extraction Helper
function extractDriveFileId(str: any): string | null {
  if (!str || typeof str !== 'string') return null;
  
  // Decodes proxied URLs
  if (str.includes('/api/proxy-image?url=')) {
    try {
      const decoded = decodeURIComponent(str.split('/api/proxy-image?url=')[1]);
      return extractDriveFileId(decoded);
    } catch (e) {}
  }
  
  // Match standard /file/d/FILE_ID
  const fileDMatch = str.match(/\/file\/d\/([a-zA-Z0-9_-]{25,50})/);
  if (fileDMatch) return fileDMatch[1];
  
  // Match ?id=FILE_ID or &id=FILE_ID
  const ucIdMatch = str.match(/[?&]id=([a-zA-Z0-9_-]{25,50})/);
  if (ucIdMatch) return ucIdMatch[1];
  
  // Match raw ID pattern
  const rawIdMatch = str.match(/^([a-zA-Z0-9_-]{28,45})$/);
  if (rawIdMatch) return rawIdMatch[1];
  
  return null;
}

function extractDriveFileIds(data: any): string[] {
  const ids: string[] = [];
  
  function recurse(val: any) {
    if (val === null || val === undefined) return;
    if (typeof val === 'string') {
      const fileId = extractDriveFileId(val);
      if (fileId) ids.push(fileId);
      
      // Try to parse as double-encoded JSON
      if (val.startsWith('{') || val.startsWith('[')) {
        try {
          const parsed = JSON.parse(val);
          recurse(parsed);
        } catch (e) {}
      }
    } else if (Array.isArray(val)) {
      for (const item of val) {
        recurse(item);
      }
    } else if (typeof val === 'object') {
      for (const key in val) {
        recurse((val as any)[key]);
      }
    }
  }
  
  recurse(data);
  return Array.from(new Set(ids));
}

// 2. Date Formatting
function getLocalDateString(date: Date): string {
  const tzOffset = 7 * 60 * 60 * 1000; // ICT (UTC+7)
  const localTime = new Date(date.getTime() + tzOffset);
  const year = localTime.getUTCFullYear();
  const month = String(localTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateFromEpoch(epoch: any): string {
  if (!epoch) return getLocalDateString(new Date());
  let epochNum = Number(epoch);
  if (isNaN(epochNum) || epochNum <= 0) return getLocalDateString(new Date());
  
  if (epochNum > 100000000000) {
    epochNum = Math.floor(epochNum / 1000);
  }
  
  const date = new Date(epochNum * 1000);
  return getLocalDateString(date);
}

function getTableNameForSearch(type: string): string | null {
  const t = String(type).trim().toUpperCase();
  if (t === 'PQC') return 'forms_pqc';
  if (t === 'IQC') return 'forms_iqc';
  if (t === 'SITE') return 'forms_site';
  if (t === 'FSR') return 'forms_fsr';
  if (t === 'FQC') return 'forms_fqc';
  if (t === 'SPR') return 'forms_spr';
  if (t === 'STEP') return 'forms_step';
  if (t === 'SQC_VT' || t === 'SQC-VT') return 'forms_sqc_vt';
  if (t === 'SQC_BTP' || t === 'SQC-BTP') return 'forms_sqc_btp';
  if (t === 'SQC_MAT' || t === 'SQC-MAT') return 'forms_sqc_mat';
  return null;
}

// Fallback search based on filename qms_[type]_[entityId]_[timestamp].jpg
async function searchDbForFileFallback(client: any, schema: string, filename: string): Promise<{ ma_ct: string, date: string } | null> {
  const match = filename.match(/qms_([a-zA-Z0-9_-]+)_([a-f0-9-]{36})_\d+/i);
  if (match) {
    const type = match[1].toUpperCase();
    const entityId = match[2];
    
    try {
      if (type === 'NCR') {
        const res = await client.query(`
          SELECT COALESCE(i.ma_ct, 'CHUA_PHAN_LOAI') as ma_ct, COALESCE(n.created_at, i.created_at) as created_at
          FROM "${schema}"."ncrs" n
          LEFT JOIN "${schema}"."inspections" i ON n.inspection_id = i.id
          WHERE n.id = $1
        `, [entityId]);
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return { ma_ct: row.ma_ct || 'CHUA_PHAN_LOAI', date: formatDateFromEpoch(row.created_at) };
        }
      } else {
        const table = getTableNameForSearch(type);
        if (table) {
          const res = await client.query(`
            SELECT ma_ct, created_at, date
            FROM "${schema}"."${table}"
            WHERE id = $1
          `, [entityId]);
          if (res.rows.length > 0) {
            const row = res.rows[0];
            return { ma_ct: row.ma_ct || 'CHUA_PHAN_LOAI', date: formatDateFromEpoch(row.date || row.created_at) };
          }
        }
      }
    } catch (e: any) {
      logMessage(`[DB Fallback Error] ${e.message}`);
    }
  }
  return null;
}

// 3. Retry wrapper with exponential backoff for Google Drive API
async function callDriveWithRetry<T>(fn: () => Promise<T>, retries = 5, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimit = error.status === 403 || error.status === 429 || 
                        (error.message && (error.message.includes('rateLimitExceeded') || error.message.includes('userRateLimitExceeded')));
    
    if (isRateLimit && retries > 0) {
      const backoffDelay = delay * (6 - retries) + Math.random() * 500;
      logMessage(`[Google Drive Rate Limit Detected] Retrying in ${Math.round(backoffDelay)}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return callDriveWithRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

// 4. Main Migration Runner
async function startMigration() {
  const isDryRun = process.argv.includes('--dry-run');
  
  logMessage(`===========================================================`);
  logMessage(`🚀 STARTING GOOGLE DRIVE HIERARCHICAL MIGRATION`);
  logMessage(`Mode: ${isDryRun ? 'DRY-RUN (Preview Mode)' : 'PRODUCTION (Actual Move)'}`);
  logMessage(`Report File: ${REPORT_FILE}`);
  logMessage(`===========================================================`);

  // Initialize PostgreSQL Client
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  // Initialize Google Drive API
  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    logMessage("❌ Error: Google Drive variables are missing in env");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const schema = process.env.DB_SCHEMA || 'appQAQC';
  const legacyFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const targetRootFolderId = "15X82uMuF1V1NuTsl7Bw_6FDMd-6pSD9h";

  if (!legacyFolderId) {
    logMessage("❌ Error: GOOGLE_DRIVE_FOLDER_ID is missing");
    process.exit(1);
  }

  // File ID -> metadata lookup table
  const fileIdMap = new Map<string, { ma_ct: string; date: string }>();

  try {
    // A. CONNECT DB & SCAN FILES
    await client.connect();
    logMessage("✅ Connected to PostgreSQL database...");

    // 1. Scan Projects
    logMessage("Scanning Projects table...");
    try {
      const res = await client.query(`SELECT id, thumbnail FROM "${schema}"."projects"`);
      for (const row of res.rows) {
        if (row.thumbnail) {
          const ids = extractDriveFileIds(row.thumbnail);
          ids.forEach(id => {
            fileIdMap.set(id, { ma_ct: row.id || 'CHUA_PHAN_LOAI', date: getLocalDateString(new Date()) });
          });
        }
      }
    } catch (e: any) {
      logMessage(`Skipping projects scanning or error: ${e.message}`);
    }

    // 2. Scan NCRs
    logMessage("Scanning NCRs table...");
    try {
      const ncrs = await client.query(`
        SELECT n.id, n.images_before_json, n.images_after_json, n.comments_json, COALESCE(i.ma_ct, 'CHUA_PHAN_LOAI') as ma_ct, COALESCE(n.created_at, i.created_at) as created_at
        FROM "${schema}"."ncrs" n
        LEFT JOIN "${schema}"."inspections" i ON n.inspection_id = i.id
      `);
      for (const row of ncrs.rows) {
        const dateStr = formatDateFromEpoch(row.created_at);
        const textFields = [row.images_before_json, row.images_after_json, row.comments_json];
        for (const f of textFields) {
          if (f) {
            const ids = extractDriveFileIds(f);
            ids.forEach(id => {
              fileIdMap.set(id, { ma_ct: row.ma_ct || 'CHUA_PHAN_LOAI', date: dateStr });
            });
          }
        }
      }
    } catch (e: any) {
      logMessage(`Skipping NCRs scanning or error: ${e.message}`);
    }

    // 3. Scan all individual Inspection tables
    const inspectionTables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site', 'forms_sqc_mat'];
    for (const table of inspectionTables) {
      logMessage(`Scanning ${table}...`);
      try {
        const resData = await client.query(`
          SELECT id, ma_ct, date, created_at, updated_at,
                 images_json, delivery_images_json, report_images_json, comments_json, signature_qc, signature_manager, signature_production, items_json, materials_json, supporting_docs_json
          FROM "${schema}"."${table}"
        `);
        for (const row of resData.rows) {
          const rowDate = row.date || row.created_at || row.updated_at;
          const dateStr = formatDateFromEpoch(rowDate);
          const ma_ct = row.ma_ct || 'CHUA_PHAN_LOAI';

          // Collect from signature text fields
          const textFields = [row.signature_qc, row.signature_manager, row.signature_production];
          for (const tf of textFields) {
            if (tf) {
              const fileId = extractDriveFileId(tf);
              if (fileId) fileIdMap.set(fileId, { ma_ct, date: dateStr });
            }
          }

          // Collect from JSON fields
          const jsonFields = [row.images_json, row.delivery_images_json, row.report_images_json, row.comments_json, row.items_json, row.materials_json, row.supporting_docs_json];
          for (const jf of jsonFields) {
            if (jf) {
              const ids = extractDriveFileIds(jf);
              ids.forEach(id => {
                fileIdMap.set(id, { ma_ct, date: dateStr });
              });
            }
          }
        }
      } catch (e: any) {
        logMessage(`Skipped ${table} or error during scanning: ${e.message}`);
      }
    }

    logMessage(`===========================================================`);
    logMessage(`Database Scan Complete. Unique Google Drive File IDs mapped: ${fileIdMap.size}`);
    logMessage(`===========================================================`);

    // B. COMMENCE GOOGLE DRIVE FILES LISTING AND CO-LOCATION
    logMessage("Scanning files in legacy Google Drive folder...");
    
    let nextPageToken: string | undefined = undefined;
    let totalScanned = 0;
    let totalMoved = 0;
    let totalUnclassified = 0;
    let totalErrors = 0;
    
    // Cached resolved folders to prevent duplicate create/list folder requests
    // key: ma_ct/YYYY-MM-DD, value: Folder ID
    const folderCache = new Map<string, string>();

    // Fast helper to resolve or create hierarchical folder structure
    async function resolveTargetFolder(ma_ct: string, dateStr: string): Promise<string> {
      const cacheKey = `${ma_ct}/${dateStr}`;
      if (folderCache.has(cacheKey)) {
        return folderCache.get(cacheKey)!;
      }

      // Check or create Project Folder
      const projectFolderName = ma_ct.trim() ? ma_ct.trim() : "CHUA_PHAN_LOAI";
      const projectFolderCacheKey = `project:${projectFolderName}`;
      let projectFolderId = folderCache.get(projectFolderCacheKey);

      if (!projectFolderId) {
        projectFolderId = await callDriveWithRetry(async () => {
          // List to find existing
          const listRes = await drive.files.list({
            q: `name = '${projectFolderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${targetRootFolderId}' in parents and trashed = false`,
            spaces: 'drive',
            fields: 'files(id, name)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });
          const files = listRes.data.files || [];
          if (files.length > 0 && files[0].id) {
            return files[0].id;
          }

          // Create new project folder
          if (isDryRun) {
            return `MOCK_PROJECT_FOLDER_${projectFolderName}`;
          }

          const createRes = await drive.files.create({
            requestBody: {
              name: projectFolderName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [targetRootFolderId]
            },
            fields: 'id',
            supportsAllDrives: true,
          });
          return createRes.data.id!;
        });
        folderCache.set(projectFolderCacheKey, projectFolderId!);
      }

      // Check or create Date Folder inside project folder
      let dateFolderId = await callDriveWithRetry(async () => {
        const listRes = await drive.files.list({
          q: `name = '${dateStr}' and mimeType = 'application/vnd.google-apps.folder' and '${projectFolderId}' in parents and trashed = false`,
          spaces: 'drive',
          fields: 'files(id, name)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
        const files = listRes.data.files || [];
        if (files.length > 0 && files[0].id) {
          return files[0].id;
        }

        // Create new date folder
        if (isDryRun) {
          return `MOCK_DATE_FOLDER_${dateStr}`;
        }

        const createRes = await drive.files.create({
          requestBody: {
            name: dateStr,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [projectFolderId!]
          },
          fields: 'id',
          supportsAllDrives: true,
        });
        return createRes.data.id!;
      });

      folderCache.set(cacheKey, dateFolderId!);
      return dateFolderId!;
    }

    // Fetch and process files page by page
    do {
      const response = await callDriveWithRetry(async () => {
        return await drive.files.list({
          q: `'${legacyFolderId}' in parents and trashed = false`,
          spaces: 'drive',
          fields: 'nextPageToken, files(id, name, createdTime, size)',
          pageSize: 100, // Process in batches of 100
          pageToken: nextPageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
      });

      const files = response.data.files || [];
      nextPageToken = response.data.nextPageToken || undefined;

      for (const file of files) {
        if (!file.id) continue;
        totalScanned++;
        
        let meta = fileIdMap.get(file.id);
        let fallbackSource = 'DB_LOOKUP';

        // Fallback 1: Guess from filename pattern
        if (!meta && file.name) {
          const dbFallback = await searchDbForFileFallback(client, schema, file.name);
          if (dbFallback) {
            meta = dbFallback;
            fallbackSource = 'FILENAME_REGEX';
          }
        }

        // Fallback 2: Default to "CHUA_PHAN_LOAI" with creation date from file
        if (!meta) {
          const fileDateStr = file.createdTime ? getLocalDateString(new Date(file.createdTime)) : getLocalDateString(new Date());
          meta = {
            ma_ct: 'CHUA_PHAN_LOAI',
            date: fileDateStr
          };
          fallbackSource = 'ORPHANED_DEFAULT';
          totalUnclassified++;
        }

        const targetFolderId = await resolveTargetFolder(meta.ma_ct, meta.date);

        if (isDryRun) {
          logMessage(`[DRY-RUN] Would move: ${file.name} (ID: ${file.id}, Size: ${(Number(file.size || 0)/(1024*1024)).toFixed(2)} MB) -> [Project: ${meta.ma_ct}] / [Date: ${meta.date}] (Source: ${fallbackSource})`);
          totalMoved++;
        } else {
          try {
            // Standard Drive API move operation
            await callDriveWithRetry(async () => {
              await drive.files.update({
                fileId: file.id!,
                addParents: targetFolderId,
                removeParents: legacyFolderId,
                fields: 'id, parents',
                supportsAllDrives: true,
                enforceSingleParent: true,
              });
            });
            logMessage(`[SUCCESS] Moved: ${file.name} (ID: ${file.id}) -> [Project: ${meta.ma_ct}] / [Date: ${meta.date}] (Source: ${fallbackSource})`);
            totalMoved++;
          } catch (mErr: any) {
            logMessage(`❌ [ERROR] Failed to move: ${file.name} (ID: ${file.id}). Reason: ${mErr.message}`);
            totalErrors++;
          }
        }
      }

      logMessage(`--- Progress update: Scanned ${totalScanned} files. Successfully relocated ${totalMoved}. ---`);

    } while (nextPageToken);

    // C. SAVE SUMMARY REPORT
    const summary = {
      timestamp: new Date().toISOString(),
      mode: isDryRun ? 'DRY_RUN' : 'PRODUCTION',
      total_mapped_ids_in_db: fileIdMap.size,
      total_scanned_files_on_drive: totalScanned,
      successfully_relocated: totalMoved,
      orphaned_unclassified: totalUnclassified,
      errors_encountered: totalErrors
    };

    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), 'utf-8');

    logMessage(`===========================================================`);
    logMessage(`🏆 MIGRATION SUMMARY REPORT`);
    logMessage(`Mode: ${isDryRun ? 'DRY-RUN' : 'PRODUCTION'}`);
    logMessage(`Total Scanned on Drive: ${totalScanned}`);
    logMessage(`Successfully Relocated: ${totalMoved}`);
    logMessage(`Orphaned (No mapping, placed in CHUA_PHAN_LOAI): ${totalUnclassified}`);
    logMessage(`Errors Encountered: ${totalErrors}`);
    logMessage(`Summary JSON written to: ${SUMMARY_FILE}`);
    logMessage(`===========================================================`);

  } catch (err: any) {
    logMessage(`❌ Fatal migration failure: ${err.message}`);
  } finally {
    await client.end();
  }
}

startMigration();
