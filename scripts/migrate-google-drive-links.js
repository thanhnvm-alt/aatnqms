import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config();

/**
 * MIGRATION SCRIPT: Google Drive URL to Proxy URL
 * Converts legacy Google Drive URLs in the 'products' table to the new Proxy Route.
 * Link format: https://myapp.com/display-image/[FILE_ID]
 */

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function migrate() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL for migration...");

    const schema = process.env.DB_SCHEMA || 'appQAQC';
    
    // 1. Fetch all products with Google Drive links
    const res = await client.query(`
      SELECT id, image_url 
      FROM "${schema}"."products" 
      WHERE image_url LIKE '%drive.google.com%' OR image_url LIKE '%google.com/uc%'
    `);

    console.log(`Found ${res.rows.length} products to migrate.`);

    let updatedCount = 0;

    for (const row of res.rows) {
      const oldUrl = row.image_url;
      
      // Extraction Regex for Google Drive File IDs
      // Supports /d/FILE_ID/ and ?id=FILE_ID patterns
      const match = oldUrl.match(/(?:d\/|id=)([a-zA-Z0-9_-]{25,})/);
      
      if (match && match[1]) {
        const fileId = match[1];
        const newUrl = `https://myapp.com/display-image/${fileId}`;

        await client.query(`
          UPDATE "${schema}"."products" 
          SET image_url = $1 
          WHERE id = $2
        `, [newUrl, row.id]);

        updatedCount++;
      }
    }

    console.log(`Migration complete. Successfully updated ${updatedCount} links.`);
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

migrate();
