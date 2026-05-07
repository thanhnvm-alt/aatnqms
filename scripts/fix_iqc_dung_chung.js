import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const schema = process.env.DB_SCHEMA || 'appQAQC';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
    try {
        console.log("Fixing missing ma_ct/ten_ct in forms_iqc from materials_json...");
        
        const res = await pool.query(`
            SELECT id, materials_json 
            FROM "${schema}"."forms_iqc" 
            WHERE (ma_ct = '' OR ma_ct IS NULL OR ten_ct = '' OR ten_ct IS NULL)
              AND materials_json IS NOT NULL AND materials_json != '[]'
        `);
        
        let fixCount = 0;
        for (const row of res.rows) {
            try {
                const materials = JSON.parse(row.materials_json);
                if (materials && materials.length > 0) {
                    const first = materials[0];
                    const projectCode = first.projectCode || first.ma_ct;
                    const projectName = first.projectName || first.ten_ct;
                    const itemName = first.name || first.ten_hang_muc;
                    
                    if (projectCode || projectName || itemName) {
                        await pool.query(`
                            UPDATE "${schema}"."forms_iqc"
                            SET ma_ct = COALESCE(NULLIF(ma_ct, ''), $1),
                                ten_ct = COALESCE(ten_ct, $2),
                                ten_hang_muc = COALESCE(ten_hang_muc, $3)
                            WHERE id = $4
                        `, [projectCode || '', projectName || '', itemName || '', row.id]);
                        fixCount++;
                    }
                }
            } catch (e) {
                // skip invalid json
            }
        }
        
        console.log(`Successfully fixed ${fixCount} records in forms_iqc.`);
        
        // Also check if we should do this for other tables?
        // Let's stick to IQC for now as requested.
        
    } catch(e) {
        console.log(`Error: ${e.message}`);
    }
    process.exit(0);
}
main();
