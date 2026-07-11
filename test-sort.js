import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const SCHEMA = '"appQAQC"';
async function test() {
    let sql = `
        WITH supplier_reports AS (
            SELECT supplier, COUNT(id) as total_reports FROM (
                SELECT id, supplier FROM ${SCHEMA}."forms_iqc" UNION ALL
                SELECT id, supplier FROM ${SCHEMA}."forms_sqc_vt" UNION ALL
                SELECT id, supplier FROM ${SCHEMA}."forms_sqc_btp" UNION ALL
                SELECT id, supplier FROM ${SCHEMA}."forms_fsr" UNION ALL
                SELECT id, supplier FROM ${SCHEMA}."forms_step" UNION ALL
                SELECT id, supplier FROM ${SCHEMA}."forms_fqc" UNION ALL
                SELECT id, supplier FROM ${SCHEMA}."forms_spr" UNION ALL
                SELECT id, supplier FROM ${SCHEMA}."forms_site"
            ) as all_forms
            WHERE supplier IS NOT NULL AND supplier != ''
            GROUP BY supplier
        )
        SELECT 
            m."supplierName" as name,
            COALESCE(MAX(s.id), 'SUP-' || m."supplierName") as id,
            COALESCE(MAX(s.code), 'NCC-' || UPPER(SUBSTRING(m."supplierName", 1, 3))) as code,
            MAX(s.address) as address,
            MAX(s.contact_person) as contact_person,
            MAX(s.phone) as phone,
            MAX(s.email) as email,
            COALESCE(MAX(s.category), 'Raw Materials') as category,
            COALESCE(MAX(s.status), 'ACTIVE') as status,
            MAX(s.updated_at) as updated_at,
            COALESCE(MAX(sr.total_reports), 0) as total_reports
        FROM ${SCHEMA}.material m
        LEFT JOIN ${SCHEMA}.suppliers s ON m."supplierName" = s.name
        LEFT JOIN supplier_reports sr ON m."supplierName" = sr.supplier
        WHERE m."supplierName" IS NOT NULL AND m."supplierName" != ''
        AND (s.deleted_at IS NULL OR s.id IS NULL)
        GROUP BY m."supplierName"
        ORDER BY total_reports DESC NULLS LAST, name ASC
        LIMIT 5
    `;
    const res = await pool.query(sql);
    console.log(res.rows);
    process.exit(0);
}
test();
