async function main() {
    try {
        const testId = "SQC-TP-1787726120574-2";
        const url = `http://localhost:3000/api/inspections/${testId}`;
        console.log(`Sending GET request to: ${url}`);
        const res = await fetch(url);
        console.log(`Response Status: ${res.status} ${res.statusText}`);
        const bodyText = await res.text();
        console.log("Response Body (truncated if long):", bodyText.substring(0, 1000));
    } catch (e) {
        console.error("❌ HTTP request failed:", e);
    }
}

main();
