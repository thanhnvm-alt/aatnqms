import { query } from './lib/db.js';

async function checkFormsRaw() {
  const ids = [
    'IQC-1778140388596', 'IQC-1778144382376', 'IQC-1778143791070', 
    'IQC-1778136989865', 'IQC-1778144060316', 'SQC-VT-1778143483245'
  ];
  
  try {
    for (const id of ids) {
      let table = id.startsWith('IQC') ? 'forms_iqc' : 'forms_sqc_mat';
      const res = await query(`SELECT * FROM "appQAQC".${table} WHERE id = $1`, [id]);
      console.log(`Full record for ${id} from ${table}:`);
      console.log(JSON.stringify(res.rows[0], null, 2));
    }
  } catch (e) {
    console.error(e);
  }
}

checkFormsRaw();
