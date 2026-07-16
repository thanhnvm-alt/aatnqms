import fs from 'fs';
import path from 'path';

const forms = fs.readdirSync('components').filter(f => f.startsWith('inspectionform') && f.endsWith('.tsx'));

for (const form of forms) {
    const p = path.join('components', form);
    let content = fs.readFileSync(p, 'utf-8');
    
    // Fix ins and ipo parsing in handleSubmit
    content = content.replace(/const ins = formData\.inspectedQuantity \|\| 0;/g, 'const ins = Number(formData.inspectedQuantity || 0);');
    content = content.replace(/const ipo = formData\.so_luong_ipo \|\| 0;/g, 'const ipo = Number(formData.so_luong_ipo || 0);');

    fs.writeFileSync(p, content);
}
console.log("Fixed");
