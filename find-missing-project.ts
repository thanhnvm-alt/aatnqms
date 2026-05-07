import { query } from './lib/db.js';

async function findMissingProjectInfo() {
  try {
    const res = await query(`
      SELECT id, type, ma_ct, ten_ct, created_at 
      FROM "appQAQC"."inspections" 
      WHERE (ma_ct IS NULL OR ma_ct = '' OR ten_ct IS NULL OR ten_ct = '')
      ORDER BY created_at DESC
      LIMIT 20
    `, []);
    
    console.log("Records missing project info:");
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  }
}

findMissingProjectInfo();
