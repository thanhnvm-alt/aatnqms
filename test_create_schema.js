import pg from 'pg';
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query('CREATE SCHEMA IF NOT EXISTS "appQAQC"').then(console.log).catch(err => {
    console.error("Schema error:", err);
});
