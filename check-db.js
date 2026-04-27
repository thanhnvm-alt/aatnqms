const { query } = require('./db.js');
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const res = await client.query('SELECT id, ma_ct, ten_ct, type FROM "appQAQC".forms_pqc ORDER BY created_at DESC LIMIT 5');
  console.log("DB rows: ", res.rows);
  await client.end();
}
run();
