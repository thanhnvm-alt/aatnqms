import { query } from './lib/db.js';

async function checkTodayProjectStats() {
  try {
    const res = await query(`
      SELECT ma_ct, ten_ct, count(*) 
      FROM "appQAQC"."inspections" 
      WHERE to_char(to_timestamp(created_at), 'YYYY-MM-DD') = '2026-05-07'
      GROUP BY ma_ct, ten_ct
    `, []);
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  }
}

checkTodayProjectStats();
