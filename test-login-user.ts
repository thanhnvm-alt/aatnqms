import { getUserByUsername } from './services/dbService.js';

async function main() {
    try {
        const username = "aaf12122";
        console.log(`Fetching user by username: "${username}"...`);
        const user = await getUserByUsername(username);
        console.log("Returned user:", user);
    } catch (e) {
        console.error("Exception:", e);
    } finally {
        process.exit(0);
    }
}

main();
