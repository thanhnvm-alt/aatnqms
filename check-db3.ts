import { query } from './lib/db';

async function run() {
  try {
    const res = await query('SELECT id, ma_ct, inspector, updated_at, date, status, deleted_at FROM "appQAQC".forms_pqc ORDER BY created_at DESC LIMIT 5', []);
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  }
}
run();
