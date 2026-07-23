import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const LOG_DIR = './logs';
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const REPORT_FILE = path.join(LOG_DIR, `drive-cleanup-report-${Date.now()}.log`);

function logMessage(msg: string) {
  const formatted = `[${new Date().toISOString()}] ${msg}`;
  console.log(formatted);
  fs.appendFileSync(REPORT_FILE, formatted + '\n', 'utf-8');
}

// Retry wrapper with exponential backoff for Google Drive API
async function callDriveWithRetry<T>(fn: () => Promise<T>, retries = 5, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimit = error.status === 403 || error.status === 429 || 
                        (error.message && (error.message.includes('rateLimitExceeded') || error.message.includes('userRateLimitExceeded')));
    
    if (isRateLimit && retries > 0) {
      const backoffDelay = delay * (6 - retries) + Math.random() * 500;
      logMessage(`[Google Drive Rate Limit] Retrying in ${Math.round(backoffDelay)}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return callDriveWithRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

async function startCleanup() {
  const isDryRun = process.argv.includes('--dry-run');
  const doExecute = process.argv.includes('--execute');

  logMessage(`===========================================================`);
  logMessage(`🧹 GOOGLE DRIVE DUPLICATE FOLDER CLEANUP & MERGING`);
  logMessage(`Mode: ${isDryRun || !doExecute ? 'DRY-RUN (Preview Mode)' : 'EXECUTE (Actual Merge & Delete)'}`);
  logMessage(`Report File: ${REPORT_FILE}`);
  logMessage(`===========================================================`);

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

  const rootFolderId = "15X82uMuF1V1NuTsl7Bw_6FDMd-6pSD9h";

  // 1. Fetch all subfolders in the root directory
  logMessage(`Scanning folders in root Google Drive folder [ID: ${rootFolderId}]...`);
  
  let folders: any[] = [];
  let nextPageToken: string | undefined = undefined;

  do {
    const res = await callDriveWithRetry(async () => {
      return await drive.files.list({
        q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        spaces: 'drive',
        fields: 'nextPageToken, files(id, name, createdTime)',
        pageSize: 100,
        pageToken: nextPageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
    });

    if (res.data.files) {
      folders.push(...res.data.files);
    }
    nextPageToken = res.data.nextPageToken || undefined;
  } while (nextPageToken);

  logMessage(`Found ${folders.length} folders in total.`);

  // 2. Group folders by name (case-insensitive, trimmed)
  const groupMap = new Map<string, any[]>();
  for (const folder of folders) {
    if (!folder.name) continue;
    const normalizedName = folder.name.trim().toLowerCase();
    const list = groupMap.get(normalizedName) || [];
    list.push(folder);
    groupMap.set(normalizedName, list);
  }

  let totalDuplicatesResolved = 0;
  let totalFilesMoved = 0;
  let totalFoldersDeleted = 0;

  // 3. Process each group
  for (const [name, folderList] of groupMap.entries()) {
    if (folderList.length <= 1) continue;

    // We have duplicates! Sort by creation time to keep the oldest one as canonical
    // If createdTime is missing, sort by ID string length or fallback to first
    folderList.sort((a, b) => {
      const timeA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
      const timeB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
      return timeA - timeB;
    });

    const canonical = folderList[0];
    const duplicates = folderList.slice(1);

    logMessage(`\n📁 Duplicate group detected for project: "${canonical.name}"`);
    logMessage(`   ✅ Canonical folder: ${canonical.name} (ID: ${canonical.id}, Created: ${canonical.createdTime || 'Unknown'})`);
    logMessage(`   ❌ Duplicates to merge (${duplicates.length}):`);
    duplicates.forEach(d => logMessage(`      - ID: ${d.id}, Created: ${d.createdTime || 'Unknown'}`));

    totalDuplicatesResolved += duplicates.length;

    // For each duplicate folder, we want to list and move its items into canonical
    for (const duplicate of duplicates) {
      logMessage(`      Merging duplicate [ID: ${duplicate.id}]...`);

      // List all items in this duplicate folder
      let items: any[] = [];
      let itemPageToken: string | undefined = undefined;

      do {
        const itemRes = await callDriveWithRetry(async () => {
          return await drive.files.list({
            q: `'${duplicate.id}' in parents and trashed = false`,
            spaces: 'drive',
            fields: 'nextPageToken, files(id, name, mimeType)',
            pageSize: 100,
            pageToken: itemPageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });
        });

        if (itemRes.data.files) {
          items.push(...itemRes.data.files);
        }
        itemPageToken = itemRes.data.nextPageToken || undefined;
      } while (itemPageToken);

      logMessage(`         Found ${items.length} item(s) inside this duplicate folder.`);

      for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          // This is a subfolder (usually a date folder like YYYY-MM-DD)
          logMessage(`         Processing subfolder: "${item.name}" (ID: ${item.id})`);

          // Find or create a corresponding folder with the exact same name inside the canonical folder
          let targetSubfolderId: string | null = null;

          // Search inside the canonical folder
          const searchRes = await callDriveWithRetry(async () => {
            return await drive.files.list({
              q: `'${canonical.id}' in parents and name = '${item.name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
              spaces: 'drive',
              fields: 'files(id)',
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
            });
          });

          const foundFolders = searchRes.data.files || [];
          if (foundFolders.length > 0 && foundFolders[0].id) {
            targetSubfolderId = foundFolders[0].id;
            logMessage(`            Found matching subfolder in canonical: "${item.name}" (ID: ${targetSubfolderId})`);
          } else {
            // Not found, create it inside the canonical folder
            if (isDryRun || !doExecute) {
              targetSubfolderId = `MOCK_SUBFOLDER_OF_${canonical.id}`;
              logMessage(`            [DRY-RUN] Would create subfolder "${item.name}" inside canonical folder.`);
            } else {
              const createRes = await callDriveWithRetry(async () => {
                return await drive.files.create({
                  requestBody: {
                    name: item.name,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [canonical.id]
                  },
                  fields: 'id',
                  supportsAllDrives: true,
                });
              });
              targetSubfolderId = createRes.data.id || null;
              logMessage(`            Created subfolder "${item.name}" inside canonical folder (ID: ${targetSubfolderId})`);
            }
          }

          if (targetSubfolderId) {
            // List files inside the duplicate subfolder and move them into the canonical subfolder
            let subfiles: any[] = [];
            let subfilePageToken: string | undefined = undefined;

            do {
              const subRes = await callDriveWithRetry(async () => {
                return await drive.files.list({
                  q: `'${item.id}' in parents and trashed = false`,
                  spaces: 'drive',
                  fields: 'nextPageToken, files(id, name)',
                  pageSize: 100,
                  pageToken: subfilePageToken,
                  supportsAllDrives: true,
                  includeItemsFromAllDrives: true,
                });
              });

              if (subRes.data.files) {
                subfiles.push(...subRes.data.files);
              }
              subfilePageToken = subRes.data.nextPageToken || undefined;
            } while (subfilePageToken);

            logMessage(`            Moving ${subfiles.length} file(s) from "${item.name}" into canonical's "${item.name}"...`);

            for (const subfile of subfiles) {
              if (isDryRun || !doExecute) {
                logMessage(`               [DRY-RUN] Would move file "${subfile.name}" (ID: ${subfile.id}) into canonical subfolder.`);
                totalFilesMoved++;
              } else {
                try {
                  await callDriveWithRetry(async () => {
                    await drive.files.update({
                      fileId: subfile.id,
                      addParents: targetSubfolderId!,
                      removeParents: item.id,
                      fields: 'id, parents',
                      supportsAllDrives: true,
                      enforceSingleParent: true,
                    });
                  });
                  logMessage(`               [SUCCESS] Moved file "${subfile.name}" (ID: ${subfile.id})`);
                  totalFilesMoved++;
                } catch (mvErr: any) {
                  logMessage(`               ❌ [ERROR] Failed to move file "${subfile.name}" (ID: ${subfile.id}): ${mvErr.message}`);
                }
              }
            }

            // Trash/delete the empty duplicate subfolder
            if (isDryRun || !doExecute) {
              logMessage(`            [DRY-RUN] Would delete empty duplicate subfolder "${item.name}" (ID: ${item.id})`);
            } else {
              try {
                await callDriveWithRetry(async () => {
                  await drive.files.update({
                    fileId: item.id,
                    requestBody: { trashed: true },
                    supportsAllDrives: true,
                  });
                });
                logMessage(`            [SUCCESS] Trashed old duplicate subfolder "${item.name}" (ID: ${item.id})`);
              } catch (delErr: any) {
                logMessage(`            ❌ [ERROR] Failed to trash subfolder "${item.name}": ${delErr.message}`);
              }
            }
          }
        } else {
          // This is a file direct inside the duplicate project folder
          if (isDryRun || !doExecute) {
            logMessage(`         [DRY-RUN] Would move direct file "${item.name}" (ID: ${item.id}) to canonical folder.`);
            totalFilesMoved++;
          } else {
            try {
              await callDriveWithRetry(async () => {
                await drive.files.update({
                  fileId: item.id,
                  addParents: canonical.id,
                  removeParents: duplicate.id,
                  fields: 'id, parents',
                  supportsAllDrives: true,
                  enforceSingleParent: true,
                });
              });
              logMessage(`         [SUCCESS] Moved direct file "${item.name}" (ID: ${item.id}) to canonical folder.`);
              totalFilesMoved++;
            } catch (mvErr: any) {
              logMessage(`         ❌ [ERROR] Failed to move direct file "${item.name}": ${mvErr.message}`);
            }
          }
        }
      }

      // Finally, trash/delete the duplicate project folder
      if (isDryRun || !doExecute) {
        logMessage(`         [DRY-RUN] Would delete empty duplicate project folder "${duplicate.name}" (ID: ${duplicate.id})`);
        totalFoldersDeleted++;
      } else {
        try {
          await callDriveWithRetry(async () => {
            await drive.files.update({
              fileId: duplicate.id,
              requestBody: { trashed: true },
              supportsAllDrives: true,
            });
          });
          logMessage(`         [SUCCESS] Trashed duplicate project folder "${duplicate.name}" (ID: ${duplicate.id})`);
          totalFoldersDeleted++;
        } catch (delErr: any) {
          logMessage(`         ❌ [ERROR] Failed to trash duplicate project folder "${duplicate.name}": ${delErr.message}`);
        }
      }
    }
  }

  logMessage(`===========================================================`);
  logMessage(`🏆 CLEANUP COMPLETED SUMMARY`);
  logMessage(`Mode: ${isDryRun || !doExecute ? 'DRY-RUN' : 'EXECUTE'}`);
  logMessage(`Total Duplicate Folders Resolved: ${totalDuplicatesResolved}`);
  logMessage(`Total Files Relocated / Moved: ${totalFilesMoved}`);
  logMessage(`Total Duplicate Folders Trashed: ${totalFoldersDeleted}`);
  logMessage(`===========================================================`);
}

startCleanup();
