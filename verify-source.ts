import { query } from './lib/db.js';

async function verifySourceData() {
  const ids = [
    'IQC-1778144382376', 
    'IQC-1778144060316', 
    'SQC-VT-1778143483245',
    'IQC-1778140388596',
    'SQC-BTP-1778053661524'
  ];
  
  try {
    for (const id of ids) {
      let table = '';
      if (id.startsWith('IQC')) table = 'forms_iqc';
      else if (id.startsWith('SQC-VT')) table = 'forms_sqc_mat';
      else if (id.startsWith('SQC-BTP')) table = 'forms_sqc_btp';
      
      const res = await query(`SELECT id, ma_ct, ten_ct FROM "appQAQC".${table} WHERE id = $1`, [id]);
      console.log(`Source ${table} for ${id}:`, res.rows[0]);
    }
  } catch (e) {
    console.error(e);
  }
}

verifySourceData();
