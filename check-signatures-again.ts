import { query } from './lib/db';

async function check() {
  try {
    const res = await query(`SELECT id, type, signature_qc, signature_manager, signature_production FROM "appQAQC"."forms_pqc" WHERE signature_qc IS NOT NULL OR signature_manager IS NOT NULL OR signature_production IS NOT NULL LIMIT 5`);
    console.log("PQC Signatures:", res.rows);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
  process.exit(0);
}
check();
