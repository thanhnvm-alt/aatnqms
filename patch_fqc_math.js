import fs from 'fs';
import path from 'path';

// For FQC, FRS, SPR, StepVecni, there is NO logic calculating passedQuantity or failedQuantity inside handleInputChange!
// They only set it directly and then rely on user input. Oh I see! 
// Let's check what handleInputChange looks like. FQC is very simple.
// Let's check IQC, it has updateMaterial. We fixed it.
// Let's check SQC_BTP, it has updateMaterial. We fixed it.
// Let's check SQC_VT, it has updateMaterial. We fixed it.
// Let's check PQC, it has handleInputChange with full logic. We fixed it.

// Are there any `parseFloat(String(value)) || 0` left?
const files = fs.readdirSync('components').filter(f => f.startsWith('inspectionform') && f.endsWith('.tsx'));
let hasParseFloat = false;
for (const file of files) {
    const content = fs.readFileSync(path.join('components', file), 'utf-8');
    if (content.includes('parseFloat(String(value)) || 0')) {
        console.log(`Still found in ${file}`);
        hasParseFloat = true;
    }
}
if (!hasParseFloat) console.log("All parseFloat(String(value)) || 0 removed from handleInputChange/updateMaterial.");

