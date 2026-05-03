import pg from 'pg';

async function test() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }});
    const result = await pool.query('SELECT images_json FROM "appQAQC".forms_pqc WHERE images_json IS NOT NULL AND images_json != \'\' LIMIT 2');
    console.log(result.rows);
    process.exit(0);
}

test();
