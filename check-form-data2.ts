import { query } from './lib/db.js';

async function check() {
    try {
        const ids = ['SQC-VT-1778228811028', 'SQC-VT-1778212927836'];
        for (const id of ids) {
            const table = `"appQAQC"."forms_sqc_mat"`;
            let res = await query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
            if (res.rows.length > 0) {
                const r = res.rows[0];
                console.log(`\nFound in ${table} for ${id}: ma_ct: ${r.ma_ct}, ten_ct: ${r.ten_ct}`);
            } else {
                console.log(`\nNot found in ${table} for ${id}`);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

check();
