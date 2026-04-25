
import 'dotenv/config';
import { runMigrations } from '../services/migrationService.js';

async function main() {
    try {
        console.log("Starting manual migration...");
        await runMigrations();
        console.log("Manual migration finished.");
    } catch (err) {
        console.error("Manual migration failed:", err);
    }
    process.exit(0);
}

main();
