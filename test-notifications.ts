import { query } from './lib/db.js';

async function main() {
    try {
        console.log("Fetching notifications from database...");
        const res = await query(`
            SELECT id, type, title, message, data 
            FROM "appQAQC"."notifications" 
            ORDER BY created_at DESC 
            LIMIT 10
        `);
        console.log("Recent Notifications:");
        for (const row of res.rows) {
            console.log(`- ID: ${row.id}`);
            console.log(`  Type: ${row.type}`);
            console.log(`  Title: ${row.title}`);
            console.log(`  Message: ${row.message}`);
            console.log(`  Data: ${row.data}`);
            console.log(`-------------------------------------`);
        }
    } catch (e) {
        console.error("❌ Exception:", e);
    } finally {
        process.exit(0);
    }
}

main();
