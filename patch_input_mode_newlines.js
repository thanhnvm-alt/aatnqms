import fs from 'fs';
import path from 'path';

const files = fs.readdirSync('components').filter(f => f.startsWith('inspectionform') && f.endsWith('.tsx'));

for (const file of files) {
    const p = path.join('components', file);
    let content = fs.readFileSync(p, 'utf-8');
    
    // Using regex to match type="number" with whitespace before step="any"
    let modified = content.replace(/type="number"\s*step="any"/g, 'type="text" inputMode="decimal"');
    
    // Match step="any" type="number"
    modified = modified.replace(/step="any"\s*type="number"/g, 'type="text" inputMode="decimal"');
    
    // Also remove the onKeyDown we injected previously since we can improve it
    modified = modified.replace(/onKeyDown=\{\(e\) => \{ if\(e.key === ','\) \{ e.preventDefault\(\); alert\('Vui lòng sử dụng dấu chấm \(\.\) cho số thập phân'\); \} \}\} /g, 
`onKeyDown={(e) => { 
    if(e.key === ',') { 
        e.preventDefault(); 
        alert('Vui lòng sử dụng dấu chấm (.) cho số thập phân'); 
    }
    // Also prevent invalid characters like 'e', '+', '-' if it's supposed to be positive numbers
    if (['e', 'E', '+', '-'].includes(e.key)) {
        e.preventDefault();
    }
}} `);

    // One edge case: type="number" by itself without step="any"?
    // But we already replaced all single-line ones with step="any".
    // Let's do a catch-all for any remaining type="number" in <input ...> for quantities?
    
    if (modified !== content) {
        fs.writeFileSync(p, modified);
        console.log(`Updated ${file}`);
    }
}
