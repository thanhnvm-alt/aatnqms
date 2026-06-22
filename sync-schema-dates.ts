import { query } from './lib/db.js';

async function syncSchema() {
    const modules = ['pqc', 'iqc', 'site', 'fsr', 'fqc', 'spr', 'step', 'sqc_vt', 'sqc_btp', 'sqc_mat'];
    const tables = modules.map(m => `forms_${m}`);
    tables.push('inspections');

    try {
        for (const table of tables) {
            console.log(`Checking table appQAQC.${table}...`);
            const res = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'appQAQC' 
                AND table_name = $1
                AND column_name IN ('date_manager', 'date_qc')
            `, [table]);

            const existingCols = res.rows.map(r => r.column_name);

            if (!existingCols.includes('date_manager')) {
                console.log(`Adding date_manager to appQAQC.${table}...`);
                await query(`ALTER TABLE "appQAQC"."${table}" ADD COLUMN date_manager BIGINT`);
            }
            if (!existingCols.includes('date_qc')) {
                console.log(`Adding date_qc to appQAQC.${table}...`);
                await query(`ALTER TABLE "appQAQC"."${table}" ADD COLUMN date_qc BIGINT`);
            }
        }
        console.log("Schema sync completed successfully.");
    } catch (e) {
        console.error("Schema sync failed:", e);
    } finally {
        process.exit(0);
    }
}

syncSchema();
