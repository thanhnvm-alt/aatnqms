import { query } from './lib/db.js';

async function check() {
    try {
        let res = await query(`SELECT po_number, supplier, items_json, materials_json, ma_ct, ten_ct FROM "appQAQC"."forms_sqc_mat" WHERE id = 'SQC-VT-1778212927836'`, []);
        console.log("SQC_MAT:", JSON.stringify(res.rows[0], null, 2));

        let res2 = await query(`SELECT items_json, ma_ct, ten_ct FROM "appQAQC"."forms_iqc" WHERE id = 'IQC-1778228429331'`, []);
        console.log("IQC:", JSON.stringify(res2.rows[0], null, 2));
    } catch (e) {
        console.error(e);
    }
}

check();
