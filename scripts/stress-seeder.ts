
import { query } from "../lib/db.js";
import { v4 as uuidv4 } from 'uuid';

async function seedStressTest() {
    console.log("🚀 Starting Stress Test Seeding (5000 records)...");
    const tables = ['forms_pqc', 'forms_iqc', 'forms_sqc_vt'];
    const statuses = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];
    
    for (let i = 0; i < 5000; i++) {
        const table = tables[i % tables.length];
        const id = `STRESS-${uuidv4()}`;
        const date = Math.floor((Date.now() - (Math.random() * 90 * 24 * 60 * 60 * 1000)) / 1000); // Random within last 90 days
        const ma_ct = `PROJ-${Math.floor(Math.random() * 100)}`;
        
        try {
            await query(`
                INSERT INTO "appQAQC"."${table}" (id, ma_ct, status, date, updated_at, inspector)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [id, ma_ct, statuses[i % statuses.length], date.toString(), date.toString(), 'STRESS_TESTER']);
            
            if (i % 500 === 0) console.log(`✅ Seeded ${i} records...`);
        } catch (e) {
            console.error("Error seeding:", e.message);
        }
    }
    console.log("🏁 Seeding completed!");
}

seedStressTest();
