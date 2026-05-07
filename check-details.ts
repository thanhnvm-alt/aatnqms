import { query } from './lib/db.js';

async function checkDetails() {
  try {
    const res = await query(`
      SELECT id, type, ma_ct, ten_ct FROM "appQAQC"."inspections" 
      WHERE to_char(to_timestamp(created_at), 'YYYY-MM-DD') = '2026-05-07'
      AND (ma_ct = '' OR ma_ct IS NULL)
    `, []);
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  }
}

checkDetails();
