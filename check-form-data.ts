import { query } from './lib/db.js';

async function check() {
    try {
        const ids = [
            'IQC-1778228429331',
            'SQC-VT-1778228811028',
            'IQC-1778228568515',
            'SQC-VT-1778212927836',
            'IQC-1777512074462',
            'IQC-1776864236109'
        ];
        
        for (const id of ids) {
            let type = id.startsWith('IQC') ? 'iqc' : 'sqc_mat';
            if (id.startsWith('SQC-VT')) type = 'sqc_vt';
            const table = `"appQAQC"."forms_${type}"`;
            try {
                let res = await query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
                if (res.rows.length > 0) {
                    const r = res.rows[0];
                    console.log(`\nTable ${table} for ${id}:`);
                    console.log(`ma_ct: ${r.ma_ct}, ten_ct: ${r.ten_ct}, project_name: ${r.project_name}, data: ${r.data ? Object.keys(r.data) : 'none'}`);
                    if (r.data?.ten_ct || r.data?.ma_ct || r.data?.ten_du_an || r.data?.du_an) {
                        console.log(`Data payload project info: ma_ct=${r.data?.ma_ct}, ten_ct=${r.data?.ten_ct}, ten_du_an=${r.data?.ten_du_an}, du_an=${r.data?.du_an}`);
                    }
                } else {
                    console.log(`\nNot found in ${table} for ${id}`);
                }
            } catch (e: any) {
                console.log(`Error querying ${table} for ${id}: ${e.message}`);
                // fallback to try other forms table if sqc_vt fails
                if (type === 'sqc_vt') {
                    let res2 = await query(`SELECT * FROM "appQAQC"."forms_sqc_mat" WHERE id = $1`, [id]);
                    if (res2.rows.length > 0) {
                        const r = res2.rows[0];
                        console.log(`\nFound in forms_sqc_mat for ${id}: ma_ct: ${r.ma_ct}, ten_ct: ${r.ten_ct}`);
                    }
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}

check();
