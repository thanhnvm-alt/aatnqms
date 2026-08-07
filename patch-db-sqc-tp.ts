import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
    console.log("Adding forms_sqc_tp...");
    const schema = process.env.DB_SCHEMA || 'appQAQC';
    await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."forms_sqc_tp" (
            "id" TEXT PRIMARY KEY,
            "type" TEXT,
            "ma_ct" TEXT,
            "ten_ct" TEXT,
            "ten_hang_muc" TEXT,
            "po_number" TEXT,
            "supplier" TEXT,
            "inspector" TEXT,
            "status" TEXT,
            "date" TEXT,
            "score" TEXT,
            "summary" TEXT,
            "items_json" TEXT,
            "materials_json" TEXT,
            "signature_qc" TEXT,
            "signature_manager" TEXT,
            "name_manager" TEXT,
            "signature_production" TEXT,
            "signature_teamlead" TEXT,
            "name_teamlead" TEXT,
            "date_teamlead" TEXT,
            "name_production" TEXT,
            "comment_production" TEXT,
            "images_json" TEXT,
            "delivery_images_json" TEXT,
            "report_images_json" TEXT,
            "created_by" TEXT,
            "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            "workshop" TEXT,
            "inspection_stage" TEXT,
            "sub_stage" TEXT,
            "dvt" TEXT,
            "so_luong_ipo" INTEGER DEFAULT 0,
            "inspected_quantity" INTEGER DEFAULT 0,
            "passed_quantity" INTEGER DEFAULT 0,
            "failed_quantity" INTEGER DEFAULT 0,
            "signature_ref" TEXT,
            "manager_signature_ref" TEXT,
            "qc_date" TIMESTAMP,
            "ma_nha_may" TEXT
        )
    `);
    console.log("Done");
    process.exit(0);
}
run();
