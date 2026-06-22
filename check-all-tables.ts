import { query } from './lib/db.js';

async function checkAllInspectionTables() {
    const modules = ['pqc', 'iqc', 'site', 'fsr', 'fqc', 'spr', 'step', 'sqc_vt', 'sqc_btp', 'sqc_mat'];
    const tables = modules.map(m => `forms_${m}`);

    try {
        for (const table of tables) {
            const res = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'appQAQC' 
                AND table_name = $1
            `, [table]);
            
            if (res.rows.length === 0) {
                console.log(`Table ${table} NOT FOUND`);
                continue;
            }

            const cols = res.rows.map(r => r.column_name);
            console.log(`Table: ${table}`);
            console.log(`  Has date_teamlead: ${cols.includes('date_teamlead')}`);
            console.log(`  Has date_manager: ${cols.includes('date_manager')}`);
            console.log(`  Has signature_qc: ${cols.includes('signature_qc')}`);
            console.log(`  Has signature_teamlead: ${cols.includes('signature_teamlead')}`);
            console.log(`  Has signature_manager: ${cols.includes('signature_manager')}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkAllInspectionTables();
