import { uploadFileToStorage } from './services/apiService';

async function test() {
    try {
        // Create a dummy image file
        const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        const res = await fetch(`data:image/png;base64,${base64}`);
        const blob = await res.blob();
        const file = new File([blob], "test.png", { type: "image/png" });
        
        const url = await uploadFileToStorage(file, "test_upload.png");
        console.log("Upload successful:", url);
    } catch (e: any) {
        console.error("Upload failed:", e.message);
    }
}
test();
