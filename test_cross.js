import pg from 'pg';
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT * FROM "aaTrackingApps"."public"."users"').then(console.log).catch(err => {
    console.error("3-part error:", err.message);
});

pool.query('SELECT * FROM "aaTrackingApps"."users"').then(console.log).catch(err => {
    console.error("2-part schema error:", err.message);
});
