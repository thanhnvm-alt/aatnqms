import fs from 'fs';
import path from 'path';

const files = fs.readdirSync('components').filter(f => f.startsWith('inspectionform') && f.endsWith('.tsx'));

for (const file of files) {
    const p = path.join('components', file);
    let content = fs.readFileSync(p, 'utf-8');
    let modified = false;

    // We will replace type="number" step="any" with type="text" inputMode="decimal"
    content = content.replace(/type="number" step="any"/g, 'type="text" inputMode="decimal"');

    if (content !== fs.readFileSync(p, 'utf-8')) {
        fs.writeFileSync(p, content);
        console.log(`Updated ${file}`);
    }
}
