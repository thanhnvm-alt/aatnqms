import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

async function test() {
  const rawConnectionString = process.env.DATABASE_URL;
  console.log("Raw:", rawConnectionString);
  const useSSL = process.env.DB_SSL === 'true' || 
                 rawConnectionString.includes('sslmode=require');
  
  let connectionString = rawConnectionString;
  try {
    const url = new URL(rawConnectionString);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('ssl');
    connectionString = url.toString();
  } catch (e) {}

  console.log("Using string:", connectionString);

  const pool = new Pool({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  });

  try {
    const res = await pool.query('SELECT current_database(), current_user');
    console.log(`Success:`, res.rows[0]);
  } catch (err) {
    console.error(`Failed:`, err);
  } finally {
    await pool.end();
  }
}

test();
