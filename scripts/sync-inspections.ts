
import { query } from "../lib/db.js";

const SCHEMA_NAME = process.env.DB_SCHEMA || 'appQAQC';
const SCHEMA = `"${SCHEMA_NAME}"`;

const MODULE_TABLES = [
    'forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 
    'forms_sqc_mat', 'forms_fsr', 'forms_step', 'forms_fqc', 
    'forms_spr', 'forms_site'
];

async function runMigration() {
    console.log(`🚀 Starting Migration for schema: ${SCHEMA_NAME}`);

    try {
        // Step 1: Update Inspections Table Schema
        console.log("🛠 Updating 'inspections' table schema...");
        
        // Remove 'data' column if it exists
        await query(`
            DO $$ 
            BEGIN 
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${SCHEMA_NAME}' AND table_name = 'inspections' AND column_name = 'data') THEN
                    ALTER TABLE ${SCHEMA}."inspections" DROP COLUMN "data";
                END IF;
            END $$;
        `);

        // Ensure all required columns exist
        const columns = [
            { name: 'type', type: 'text' },
            { name: 'ma_ct', type: 'text' },
            { name: 'ten_ct', type: 'text' },
            { name: 'ma_nha_may', type: 'text' },
            { name: 'ten_hang_muc', type: 'text' },
            { name: 'workshop', type: 'text' },
            { name: 'status', type: 'text' },
            { name: 'score', type: 'double precision' },
            { name: 'created_at', type: 'bigint' },
            { name: 'updated_at', type: 'bigint' },
            { name: 'created_by', type: 'text' }
        ];

        for (const col of columns) {
            await query(`
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${SCHEMA_NAME}' AND table_name = 'inspections' AND column_name = '${col.name}') THEN
                        ALTER TABLE ${SCHEMA}."inspections" ADD COLUMN "${col.name}" ${col.type};
                    END IF;
                END $$;
            `);
        }

        // Step 2: Sync Data from Module Tables
        console.log("🔄 Syncing data from module tables...");
        
        // Clear existing data to avoid duplicates during initial sync
        await query(`TRUNCATE TABLE ${SCHEMA}."inspections"`);

        for (const table of MODULE_TABLES) {
            console.log(`   - Processing ${table}...`);
            
            // Map columns for each table (some tables might have slight variations, we'll use COALESCE and casting)
            const insertSql = `
                INSERT INTO ${SCHEMA}."inspections" (
                    id, type, ma_ct, ten_ct, ma_nha_may, ten_hang_muc, 
                    workshop, status, score, created_at, updated_at, created_by
                )
                SELECT 
                    id::text, 
                    COALESCE(type::text, '${table.replace('forms_', '').toUpperCase()}'), 
                    ma_ct::text, 
                    ten_ct::text, 
                    ma_nha_may::text, 
                    ten_hang_muc::text, 
                    workshop::text, 
                    status::text, 
                    COALESCE(score::text, '0')::double precision,
                    COALESCE(
                        CASE 
                            WHEN created_at::text ~ '^[0-9]+$' AND created_at::bigint > 1000000000 THEN created_at::text::bigint 
                            WHEN updated_at::text ~ '^[0-9]+$' AND updated_at::bigint > 1000000000 THEN updated_at::text::bigint
                            WHEN date::text ~ '^[0-9]+$' AND date::bigint > 1000000000 THEN date::text::bigint
                            ELSE EXTRACT(EPOCH FROM NOW())::bigint
                        END,
                        EXTRACT(EPOCH FROM NOW())::bigint
                    ),
                    COALESCE(
                        CASE 
                            WHEN updated_at::text ~ '^[0-9]+$' AND updated_at::bigint > 1000000000 THEN updated_at::text::bigint 
                            WHEN created_at::text ~ '^[0-9]+$' AND created_at::bigint > 1000000000 THEN created_at::text::bigint
                            ELSE EXTRACT(EPOCH FROM NOW())::bigint
                        END,
                        EXTRACT(EPOCH FROM NOW())::bigint
                    ),
                    inspector::text
                FROM ${SCHEMA}."${table}"
                WHERE deleted_at IS NULL
                ON CONFLICT (id) DO UPDATE SET
                    status = EXCLUDED.status,
                    score = EXCLUDED.score,
                    updated_at = EXCLUDED.updated_at;
            `;
            
            await query(insertSql);
        }

        console.log("✅ Migration & Sync completed successfully!");

    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    }
}

runMigration();
