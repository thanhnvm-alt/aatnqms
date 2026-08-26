import { query } from './lib/db.js';

async function main() {
    try {
        console.log("Fetching user info...");
        const res = await query(`
            SELECT id, username, email, role, msnv, position, allowed_modules 
            FROM "appQAQC"."users" 
            WHERE email = $1 OR username = $2
        `, ['thanhnvm@aacorporation.com', 'thanhnvm']);
        console.log("User in DB:", res.rows);
    } catch (e) {
        console.error("Exception:", e);
    } finally {
        process.exit(0);
    }
}

main();
