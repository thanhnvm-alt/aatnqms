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
        console.log("Refreshing materialized view...");
        await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY "${schema}"."inspections_daily_stats_mv"`);
        console.log("Success!");
    } catch(e) {
        if(e.message.includes('cannot be refreshed concurrently')) {
            console.log("Refreshing normally (not concurrently)...");
            await pool.query(`REFRESH MATERIALIZED VIEW "${schema}"."inspections_daily_stats_mv"`);
            console.log("Success!");
        } else {
            console.log(`Error: ${e.message}`);
        }
    }
    process.exit(0);
}
main();
