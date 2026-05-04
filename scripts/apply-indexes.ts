
import { query } from "../lib/db.js";

const SCHEMA_NAME = process.env.DB_SCHEMA || 'appQAQC';
const SCHEMA = `"${SCHEMA_NAME}"`;

const TABLES = [
    'forms_pqc', 'forms_iqc', 'forms_sqc_vt', 'forms_sqc_btp', 
    'forms_sqc_mat', 'forms_fsr', 'forms_step', 'forms_fqc', 
    'forms_spr', 'forms_site'
];

async function applyIndexes() {
    console.log(`🚀 Starting index migration for schema: ${SCHEMA_NAME}`);
    
    for (const table of TABLES) {
        console.log(`\n📦 Processing table: ${table}`);
        
        const indexes = [
            { name: `idx_${table}_date`, column: 'date' },
            { name: `idx_${table}_status`, column: 'status' },
            { name: `idx_${table}_ma_ct`, column: 'ma_ct' },
            { name: `idx_${table}_inspector`, column: 'inspector' },
            { name: `idx_${table}_updated_at`, column: 'updated_at' },
            { name: `idx_${table}_deleted_at`, column: 'deleted_at' }
        ];

        for (const idx of indexes) {
            try {
                // We use BIGINT for these columns usually in our system, but let's ensure they exist
                // and are indexed. We'll use the concurrent-safe IF NOT EXISTS
                console.log(`  - Creating index ${idx.name} on ${idx.column}...`);
                await query(`CREATE INDEX IF NOT EXISTS "${idx.name}" ON ${SCHEMA}."${table}" ("${idx.column}")`);
            } catch (err: any) {
                console.error(`  ❌ Failed to create index ${idx.name}:`, err.message);
            }
        }
    }
    
    console.log("\n✅ Index migration completed.");
}

applyIndexes().catch(console.error);
