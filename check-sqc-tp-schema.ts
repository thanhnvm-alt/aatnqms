import { query } from './lib/db.js';

async function main() {
    try {
        console.log("Checking columns of forms_sqc_tp...");
        const res = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'appQAQC' AND table_name = 'forms_sqc_tp'
        `);
        console.log("Columns of forms_sqc_tp:");
        for (const r of res.rows) {
            console.log(`- ${r.column_name} (${r.data_type})`);
        }
    } catch (e) {
        console.error("Exception:", e);
    } finally {
        process.exit(0);
    }
}

main();
