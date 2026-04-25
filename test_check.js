import pg from 'pg';
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function test() {
  const check = await pool.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'appQAQC'`);
  console.log("Schema check:", check.rows);
  
  const ext = await pool.query(`SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'`);
  console.log("Extension check:", ext.rows);
  
  pool.end();
}

test();
