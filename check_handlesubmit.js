import fs from 'fs';
import path from 'path';

const forms = fs.readdirSync('components').filter(f => f.startsWith('inspectionform') && f.endsWith('.tsx'));
for (const form of forms) {
    const p = path.join('components', form);
    const content = fs.readFileSync(p, 'utf-8');
    if (content.includes('setFormData(finalForm => {') && content.includes('onSave(')) {
        console.log(`Needs fix: ${form}`);
    }
}
