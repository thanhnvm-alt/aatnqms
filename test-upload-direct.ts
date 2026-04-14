import fs from 'fs';

async function test() {
    try {
        const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        const buffer = Buffer.from(base64, 'base64');
        const blob = new Blob([buffer], { type: 'image/png' });
        
        const formData = new FormData();
        formData.append('image', blob, 'test.png');
        
        const response = await fetch('http://localhost:3000/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const text = await response.text();
        console.log("Status:", response.status);
        console.log("Response:", text);
    } catch (e: any) {
        console.error("Upload failed:", e.message);
    }
}
test();
