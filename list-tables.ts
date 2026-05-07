import { query } from './lib/db.js';

async function listColumns() {
  const tables = ['projects', 'project_store'];
  try {
    for (const table of tables) {
      const res = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'appQAQC' 
        AND table_name = '${table}'
      `, []);
      console.log(`Columns for ${table}:`);
      console.table(res.rows);
    }
  } catch (e) {
    console.error(e);
  }
}

listColumns();
