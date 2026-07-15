import fs from 'fs';
import path from 'path';

const files = ['inspectionformFQC.tsx', 'inspectionformFRS.tsx', 'inspectionformSPR.tsx', 'inspectionformStepVecni.tsx', 'inspectionformPQC.tsx'];

for (const file of files) {
    const p = path.join('components', file);
    if (!fs.existsSync(p)) continue;
    let content = fs.readFileSync(p, 'utf-8');
    let original = content;

    // Remove any remaining type="number" 
    content = content.replace(/type="number"/g, 'type="text" inputMode="decimal"');
    
    // In FQC/FRS/SPR etc, handleInputChange might look like this:
    // let val = parseFloat(String(value)) || 0;
    // We already tried to patch it but the regex might have failed due to whitespace/newlines. Let's do it more robustly.
    
    const targetParseFloat = /let val = parseFloat\(String\(value\)\) \|\| 0;/g;
    if (targetParseFloat.test(content)) {
        content = content.replace(targetParseFloat, `let val = value;
              let parsedVal = parseFloat(String(val));
              if (isNaN(parsedVal)) parsedVal = 0;`);
    }

    // Try to match the exact if conditions:
    const targetIns = /if \(val > ipo\) val = ipo;\s*if \(val < 0\) val = 0;\s*next\.inspectedQuantity = val;\s*next\.passedQuantity = val;\s*next\.failedQuantity = 0;/g;
    if (targetIns.test(content)) {
        content = content.replace(targetIns, `if (parsedVal > ipo) {
                  next.inspectedQuantity = ipo;
                  next.passedQuantity = ipo;
                  next.failedQuantity = 0;
              } else if (parsedVal < 0) {
                  next.inspectedQuantity = 0;
                  next.passedQuantity = 0;
                  next.failedQuantity = 0;
              } else {
                  next.inspectedQuantity = val;
                  next.passedQuantity = val;
                  next.failedQuantity = 0;
              }`);
    }

    const targetPass = /if \(val > ins\) val = ins;\s*if \(val < 0\) val = 0;\s*next\.passedQuantity = val;\s*next\.failedQuantity = Number\(\(ins - val\)\.toFixed\(2\)\);/g;
    if (targetPass.test(content)) {
        content = content.replace(targetPass, `if (parsedVal > ins) {
                  next.passedQuantity = ins;
                  next.failedQuantity = 0;
              } else if (parsedVal < 0) {
                  next.passedQuantity = 0;
                  next.failedQuantity = ins;
              } else {
                  next.passedQuantity = val;
                  next.failedQuantity = Number((ins - parsedVal).toFixed(2));
              }`);
    }

    const targetFail = /if \(val > ins\) val = ins;\s*if \(val < 0\) val = 0;\s*next\.failedQuantity = val;\s*next\.passedQuantity = Number\(\(ins - val\)\.toFixed\(2\)\);/g;
    if (targetFail.test(content)) {
        content = content.replace(targetFail, `if (parsedVal > ins) {
                  next.failedQuantity = ins;
                  next.passedQuantity = 0;
              } else if (parsedVal < 0) {
                  next.failedQuantity = 0;
                  next.passedQuantity = ins;
              } else {
                  next.failedQuantity = val;
                  next.passedQuantity = Number((ins - parsedVal).toFixed(2));
              }`);
    }


    if (content !== original) {
        fs.writeFileSync(p, content);
        console.log(`Updated ${file}`);
    }
}
