import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

async function testList() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const parentFolderId = "15X82uMuF1V1NuTsl7Bw_6FDMd-6pSD9h";

  console.log("=== TEST 1: Original Parameters (supportsAllDrives & includeItemsFromAllDrives, but no corpora) ===");
  try {
    const res1 = await drive.files.list({
      q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      spaces: 'drive',
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    console.log(`Found ${res1.data.files?.length || 0} folders.`);
    res1.data.files?.slice(0, 5).forEach(f => console.log(` - ${f.name} (${f.id})`));
  } catch (err: any) {
    console.error("Test 1 failed:", err.message);
  }

  console.log("\n=== TEST 2: With corpora: 'allDrives' ===");
  try {
    const res2 = await drive.files.list({
      q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      spaces: 'drive',
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    });
    console.log(`Found ${res2.data.files?.length || 0} folders.`);
    res2.data.files?.slice(0, 5).forEach(f => console.log(` - ${f.name} (${f.id})`));
  } catch (err: any) {
    console.error("Test 2 failed:", err.message);
  }
}

testList();
