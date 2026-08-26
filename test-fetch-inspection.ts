import { getInspectionById } from './services/dbService.js';

async function main() {
    try {
        const testId = "SQC-TP-1787726120574-2";
        console.log(`\nTesting getInspectionById JSON serialization with ID: "${testId}"...`);
        const item = await getInspectionById(testId);
        console.log("Retrieved item successfully:", item ? "YES" : "NO");
        if (item) {
            const jsonStr = JSON.stringify(item);
            console.log("Serialized successfully! Length:", jsonStr.length);
        }
    } catch (e) {
        console.error("❌ Exception during test:", e);
    } finally {
        process.exit(0);
    }
}

main();
