import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

async function test() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const res = await pool.query('SELECT * FROM "appQAQC"."forms_pqc" LIMIT 1');
    console.log(`Success`);
  } catch (err) {
    console.error(`Failed:`, err);
  } finally {
    await pool.end();
  }
}

test();
