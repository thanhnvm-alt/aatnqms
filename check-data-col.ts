import 'dotenv/config';
import { query } from './lib/db.js';

async function check() {
  const res = await query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1', ['forms_pqc']);
  console.log(res.rows);
  process.exit(0);
}

check();
