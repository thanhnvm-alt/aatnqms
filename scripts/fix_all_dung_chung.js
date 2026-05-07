import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const schema = process.env.DB_SCHEMA || 'appQAQC';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const tables = [
    'forms_pqc', 'forms_sqc_vt', 'forms_sqc_btp', 'forms_sqc_mat', 
    'forms_fsr', 'forms_step', 'forms_fqc', 'forms_spr', 'forms_site'
];

async function main() {
    try {
        for (const table of tables) {
            console.log(`Checking table: ${table}...`);
            const res = await pool.query(`
                SELECT id, items_json 
                FROM "${schema}"."${table}" 
                WHERE (ma_ct = '' OR ma_ct IS NULL OR ten_ct = '' OR ten_ct IS NULL)
                  AND items_json IS NOT NULL AND items_json != '[]'
            `);
            
            let fixCount = 0;
            for (const row of res.rows) {
                try {
                    const items = JSON.parse(row.items_json);
                    if (items && items.length > 0) {
                        const first = items[0];
                        const projectCode = first.projectCode || first.ma_ct;
                        const projectName = first.projectName || first.ten_ct;
                        
                        if (projectCode || projectName) {
                            await pool.query(`
                                UPDATE "${schema}"."${table}"
                                SET ma_ct = $1, ten_ct = $2
                                WHERE id = $3
                            `, [projectCode || '', projectName || '', row.id]);
                            fixCount++;
                        }
                    }
                } catch (e) {}
            }
            if (fixCount > 0) console.log(`  Fixed ${fixCount} records in ${table}.`);
        }
    } catch(e) {
        console.log(`Error: ${e.message}`);
    }
    process.exit(0);
}
main();
