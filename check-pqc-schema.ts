import { query } from './lib/db';

async function check() {
  try {
    const res = await query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'appQAQC' AND table_name = 'forms_pqc'`);
    console.log("Columns:", res.rows.map(r => r.column_name).join(', '));
  } catch (e: any) {
    console.error("Error:", e.message);
  }
  process.exit(0);
}
check();
