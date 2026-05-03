import { getDb } from './services/dbService.js';

async function test() {
    const db = getDb();
    const result = await db.query('SELECT images_json FROM public.pqc_inspections WHERE images_json IS NOT NULL LIMIT 1');
    console.log(result.rows[0]);
    process.exit(0);
}

test();
