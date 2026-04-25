import pg from 'pg';
import "dotenv/config";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }});
pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`).catch(e => console.log("Ext err:", e.message));
