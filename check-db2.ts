import { query } from './lib/db';

async function run() {
  try {
    const res = await query('SELECT id, ma_ct, inspector, created_at, status FROM "appQAQC".forms_pqc ORDER BY created_at DESC LIMIT 5', []);
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  }
}
run();
