import fs from 'fs';
import path from 'path';

const forms = fs.readdirSync('components').filter(f => f.startsWith('inspectionform') && f.endsWith('.tsx'));

for (const form of forms) {
    const p = path.join('components', form);
    let content = fs.readFileSync(p, 'utf-8');

    if (content.includes('setFormData(finalForm => {')) {
        let newContent = content.replace(/setFormData\(finalForm => \{/g, 'const finalForm = formData;');
        
        // Find onSave and add await
        newContent = newContent.replace(/onSave\(\{/g, 'await onSave({');
        // Handle inline onSave like in FQC and FRS
        newContent = newContent.replace(/onSave\(\{\s*\.\.\.finalForm/g, 'await onSave({ ...finalForm');

        // Remove the return finalForm; }); part
        newContent = newContent.replace(/return finalForm;\s*\n\s*\}\);/g, '');

        if (content !== newContent) {
            fs.writeFileSync(p, newContent);
            console.log(`Fixed ${form}`);
        } else {
            console.log(`Failed to fix ${form} completely?`);
        }
    }
}
