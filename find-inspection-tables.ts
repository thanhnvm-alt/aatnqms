import { query } from './lib/db.js';

async function findInspectionTables() {
  try {
    const res = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'appQAQC' 
      AND (table_name LIKE '%inspections%' OR table_name LIKE 'pqc' OR table_name LIKE 'iqc' OR table_name LIKE 'sqc%')
    `, []);
    
    console.log("Inspection Tables found:");
    const tableNames = res.rows.map((r: any) => r.table_name);
    console.log(tableNames);

    for (const table of tableNames) {
        const columns = await query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'appQAQC' 
            AND table_name = $1
            AND column_name IN ('signature_qc', 'signature_teamlead', 'signature_manager', 'date_teamlead', 'date_manager')
        `, [table]);
        console.log(`Table: ${table}`);
        console.log(columns.rows.map((c: any) => c.column_name));
    }

  } catch (e) {
    console.error(e);
  } finally {
      process.exit(0);
  }
}

findInspectionTables();
