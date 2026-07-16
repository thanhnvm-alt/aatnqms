import fs from 'fs';
import path from 'path';

const files = fs.readdirSync('components').filter(f => (f.startsWith('inspectiondetail') || f === 'NCRDetail.tsx') && f.endsWith('.tsx'));

for (const f of files) {
    const p = path.join('components', f);
    let content = fs.readFileSync(p, 'utf-8');
    let original = content;

    // Fix handleImageUpload
    content = content.replace(/const compressed = await compressImage\(f, 500\);\s*return await uploadQMSImage\(compressed,/g, 'return await uploadQMSImage(f,');
    
    // For NCRDetail
    content = content.replace(/Array\.from\(files\)\.map\(\(file: File\) => compressImage\(file, 500\)\)/g, 'Array.from(files).map(async (file: File) => await uploadQMSImage(file, { entityId: "new", type: "COMMENT", role: "ATTACHMENT" }))');
    
    // Some places might have `compressImage` import which is now unused
    content = content.replace(/, compressImage /g, ' ');
    content = content.replace(/ compressImage /g, ' ');

    if (content !== original) {
        fs.writeFileSync(p, content);
        console.log(`Updated ${f}`);
    }
}
