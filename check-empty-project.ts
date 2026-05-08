import { query } from './lib/db.js';

async function check() {
    try {
        const res = await query(`
            SELECT id, type, ma_ct, ten_ct, ten_hang_muc, created_at, created_by 
            FROM "appQAQC".inspections 
            WHERE ma_ct IS NULL OR ma_ct = '' OR ten_ct IS NULL OR ten_ct = ''
            ORDER BY created_at DESC
        `);
        console.log(`Found ${res.rows.length} inspections with missing project info:`);
        for (const row of res.rows) {
            console.log(JSON.stringify(row, null, 2));
        }
    } catch (e) {
        console.error(e);
    }
}

check();
