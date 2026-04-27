import { query } from './lib/db';

async function run() {
  try {
    const res = await query(`SELECT * FROM "appQAQC".users WHERE email = 'thanhnvm@aacorporation.com'`, []);
    console.log(res.rows[0]);
  } catch (e) {
    console.error(e);
  }
}
run();
