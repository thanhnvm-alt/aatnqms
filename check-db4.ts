import { query } from './lib/db';

async function run() {
  try {
    const res = await query(`SELECT id, ma_ct, inspector, updated_at, date, status, deleted_at FROM "appQAQC".forms_pqc WHERE id IN ('fdb7ec04', 'c0f16af0', 'be1caa4e')`, []);
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  }
}
run();
