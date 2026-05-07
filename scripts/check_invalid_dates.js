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
        console.log("Searching for records with years 58264 and 58262...");
        const res = await pool.query(`
            SELECT id, type, created_at, ma_ct, ten_ct 
            FROM "${schema}"."inspections" 
            WHERE TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY') IN ('58264', '58262')
        `);
        console.table(res.rows);
        
    } catch(e) {
        console.log(`Error: ${e.message}`);
    }
    process.exit(0);
}
main();
