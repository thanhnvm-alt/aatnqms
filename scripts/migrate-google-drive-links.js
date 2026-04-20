import pg from 'pg';
const { Client } = pg;
import dotenv from 'dotenv';

dotenv.config();

/**
 * MIGRATION SCRIPT: Complete Image Proxy Migration
 * Converts legacy Google Drive URLs across all main tables and JSON structures to
 * the new Proxy Route: /api/proxy-image?url=...
 */

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const getProxyImageUrl = (url) => {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/api/')) return url;
    if (url.startsWith('http') && (url.includes('drive.google.com') || url.includes('googleusercontent.com') || url.includes('google.com/uc'))) {
        return `/api/proxy-image?url=${encodeURIComponent(url)}`;
    }
    return url;
};

// Deep clone and transform JSON structures recursively
function processJsonStructure(data) {
  if (Array.isArray(data)) {
    let changed = false;
    const newData = data.map(item => {
      const { updated, changed: childChanged } = processJsonStructure(item);
      if (childChanged) changed = true;
      return updated;
    });
    return { updated: newData, changed };
  } else if (data !== null && typeof data === 'object') {
    let changed = false;
    const newData = { ...data };
    for (const key in newData) {
      if (key === 'userAvatar' || key.includes('image') || key === 'thumbnail' || key === 'signature' || key === 'attachments') {
        if (typeof newData[key] === 'string') {
          const proxied = getProxyImageUrl(newData[key]);
          if (proxied !== newData[key]) {
             newData[key] = proxied;
             changed = true;
          }
        } else if (Array.isArray(newData[key])) {
            let arrChanged = false;
            newData[key] = newData[key].map(item => {
                if (typeof item === 'string') {
                    const proxied = getProxyImageUrl(item);
                    if (proxied !== item) { arrChanged = true; return proxied; }
                    return item;
                } else if (typeof item === 'object') {
                    const { updated, changed: c } = processJsonStructure(item);
                    if (c) arrChanged = true;
                    return updated;
                }
                return item;
            });
            if (arrChanged) changed = true;
        }
      } else {
        const { updated, changed: c } = processJsonStructure(newData[key]);
        if (c) {
          newData[key] = updated;
          changed = true;
        }
      }
    }
    return { updated: newData, changed };
  } else if (typeof data === 'string') { // standalone string parsing for simple JSON wrappers
      if (data.startsWith('[') && data.endsWith(']')) {
          try {
              const parsed = JSON.parse(data);
              const { updated, changed } = processJsonStructure(parsed);
              if (changed) return { updated: JSON.stringify(updated), changed: true };
          } catch(e) {}
      }
  }
  return { updated: data, changed: false };
}

async function migrate() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL for migration...");

    const schema = process.env.DB_SCHEMA || 'appQAQC';
    
    // 1. Migrate NCRs table
    console.log("Migrating NCRs table...");
    const ncrs = await client.query(`SELECT id, images_before_json, images_after_json, comments_json FROM "${schema}"."ncrs"`);
    let ncrUpdates = 0;
    for (const row of ncrs.rows) {
        let changed = false;
        let imagesBeforeData = row.images_before_json;
        let imagesAfterData = row.images_after_json;
        let commentsData = row.comments_json;

        ['imagesBeforeData', 'imagesAfterData', 'commentsData'].forEach(field => {
            let val = eval(field);
            if (val && typeof val === 'string') {
                try {
                    const parsed = JSON.parse(val);
                    const res = processJsonStructure(parsed);
                    if (res.changed) {
                        changed = true;
                        eval(`${field} = JSON.stringify(res.updated)`);
                    }
                } catch(e) {}
            }
        });

        if (changed) {
            await client.query(`UPDATE "${schema}"."ncrs" SET images_before_json=$1, images_after_json=$2, comments_json=$3 WHERE id=$4`, 
                [imagesBeforeData, imagesAfterData, commentsData, row.id]);
            ncrUpdates++;
        }
    }
    console.log(`Updated ${ncrUpdates} NCR records.`);

    // 2. Migrate Projects table
    console.log("Migrating Projects table...");
    try {
        const projects = await client.query(`SELECT id, thumbnail FROM "${schema}"."projects"`);
        let projectUpdates = 0;
        for (const row of projects.rows) {
            let changed = false;
            let pThumb = row.thumbnail;

            if (pThumb && typeof pThumb === 'string') {
                const proxied = getProxyImageUrl(pThumb);
                if (proxied !== pThumb) { pThumb = proxied; changed = true; }
            }

            if (changed) {
                await client.query(`UPDATE "${schema}"."projects" SET thumbnail=$1 WHERE id=$2`, [pThumb, row.id]);
                projectUpdates++;
            }
        }
        console.log(`Updated ${projectUpdates} Project records.`);
    } catch(e) {
        console.error("Skipping projects or error:", e.message);
    }

    // 3. Migrate Inspection Tables
    const inspectionTables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'];
    for (const table of inspectionTables) {
        console.log(`Migrating ${table}...`);
        try {
            const resData = await client.query(`
                SELECT id, images_json, delivery_images_json, report_images_json, comments_json, signature_qc, signature_manager, signature_production, items_json, materials_json 
                FROM "${schema}"."${table}"
            `);
            let count = 0;
            for (const row of resData.rows) {
                let changed = false;
                const updateParams = [row.id];
                const setClauses = [];
                let paramIdx = 2;

                const textFields = ['signature_qc', 'signature_manager', 'signature_production'];
                for (const tf of textFields) {
                    if (row[tf] && typeof row[tf] === 'string') {
                        const proxied = getProxyImageUrl(row[tf]);
                        if (proxied !== row[tf]) {
                            changed = true;
                            setClauses.push(`${tf}=$${paramIdx}`);
                            updateParams.push(proxied);
                            paramIdx++;
                        }
                    }
                }

                const jsonFields = ['images_json', 'delivery_images_json', 'report_images_json', 'comments_json', 'items_json', 'materials_json'];
                for (const jf of jsonFields) {
                    if (row[jf] && typeof row[jf] === 'string') {
                        try {
                            const parsed = JSON.parse(row[jf]);
                            const r = processJsonStructure(parsed);
                            if (r.changed) {
                                changed = true;
                                setClauses.push(`${jf}=$${paramIdx}`);
                                updateParams.push(JSON.stringify(r.updated));
                                paramIdx++;
                            }
                        } catch(e){}
                    }
                }

                if (changed && setClauses.length > 0) {
                    await client.query(`UPDATE "${schema}"."${table}" SET ${setClauses.join(', ')} WHERE id=$1`, updateParams);
                    count++;
                }
            }
            console.log(`Updated ${count} records in ${table}.`);
        } catch(e) {
            console.log(`Skipped ${table} or error: ${e.message}`);
        }
    }

    console.log(`Migration complete. All Google Drive images proxied!`);
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

migrate();
