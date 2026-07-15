import fs from 'fs';
import path from 'path';

const files = fs.readdirSync('components').filter(f => f.startsWith('inspectionform') && f.endsWith('.tsx'));

for (const file of files) {
    const p = path.join('components', file);
    let content = fs.readFileSync(p, 'utf-8');
    let modified = false;

    content = content.replace(/<input([^>]*?)type="number"([^>]*?)>/g, (match, p1, p2) => {
        let newMatch = match;
        
        // Ensure step="any"
        if (!newMatch.includes('step=')) {
            newMatch = newMatch.replace('type="number"', 'type="number" step="any"');
            modified = true;
        } else if (newMatch.includes('step="0.01"')) {
            newMatch = newMatch.replace('step="0.01"', 'step="any"');
            modified = true;
        }

        if (!newMatch.includes('onKeyDown=')) {
            newMatch = newMatch.replace('<input ', `<input onKeyDown={(e) => { if(e.key === ',') { e.preventDefault(); alert('Vui lòng sử dụng dấu chấm (.) cho số thập phân'); } }} `);
            modified = true;
        }
        
        return newMatch;
    });

    if (modified) {
        fs.writeFileSync(p, content);
        console.log(`Updated ${file}`);
    }
}
