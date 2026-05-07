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
        const poNumbers = ['4100022270', '4100020296', '4100020236', '4100019366', '4100022137'];
        for (const po of poNumbers) {
            const res = await pool.query(`
                SELECT id, ma_ct, ten_ct, po_number, data, materials_json
                FROM "${schema}"."forms_iqc" 
                WHERE po_number = $1
            `, [po]);
            if (res.rows.length > 0) {
                console.log(`PO: ${po}`);
                console.log(JSON.stringify(res.rows[0], null, 2));
            } else {
                console.log(`PO: ${po} NOT FOUND in forms_iqc`);
            }
        }
    } catch(e) {
        console.log(`Error: ${e.message}`);
    }
    process.exit(0);
}
main();
