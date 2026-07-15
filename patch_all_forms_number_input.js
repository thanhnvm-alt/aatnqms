import fs from 'fs';
import path from 'path';

const files = fs.readdirSync('components').filter(f => f.startsWith('inspectionform') && f.endsWith('.tsx'));

for (const file of files) {
    const p = path.join('components', file);
    let content = fs.readFileSync(p, 'utf-8');
    let original = content;

    // 1. Remove parseFloat inside handleInputChange / updateMaterial that forces integers or strips decimals
    
    // For IQC & SQC_VT (they use updateMaterial and a specific line)
    // if (['orderQty', 'deliveryQty', 'inspectQty', 'passQty', 'failQty'].includes(field)) { val = parseFloat(String(value)) || 0; }
    content = content.replace(
        /if \(\['orderQty', 'deliveryQty', 'inspectQty', 'passQty', 'failQty'\]\.includes\(field\)\) \{ val = parseFloat\(String\(value\)\) \|\| 0; \}/g,
        `if (['orderQty', 'deliveryQty', 'inspectQty', 'passQty', 'failQty'].includes(field)) { val = value; }`
    );

    // For SQC_BTP
    // val = parseFloat(String(value)) || 0; inside updateMaterial
    // Need to be careful. Let's just find the block for SQC_BTP updateMaterial
    if (file === 'inspectionformSQC_BTP.tsx') {
        content = content.replace(
            /let val = value;\s*if \(\['orderQty', 'deliveryQty', 'inspectQty', 'passQty', 'failQty'\]\.includes\(field\)\) \{\s*val = parseFloat\(String\(value\)\) \|\| 0;\s*\}/g,
            `let val = value;`
        );
    }
    
    // For FQC, FRS, SPR, StepVecni, PQC, etc.
    // They have handleInputChange with:
    // let val = parseFloat(String(value)) || 0;
    // We already patched PQC, but let's do a more robust patch for all forms that have this pattern:
    
    // Pattern: if (field === 'inspectedQuantity') { let val = parseFloat(String(value)) || 0; ...
    // We want to replace parseFloat(String(value)) || 0 with just `value` inside these specific blocks, 
    // BUT we need `parsedVal` for the math. 
    // Since we already patched PQC, we should patch the others (FQC, FRS, SPR, StepVecni) similarly.
    
    if (['inspectionformFQC.tsx', 'inspectionformFRS.tsx', 'inspectionformSPR.tsx', 'inspectionformStepVecni.tsx'].includes(file)) {
        content = content.replace(/let val = parseFloat\(String\(value\)\) \|\| 0;/g, `let val = value;
              let parsedVal = parseFloat(String(val));
              if (isNaN(parsedVal)) parsedVal = 0;`);

        // InspectedQuantity block
        content = content.replace(/if \(val > ipo\) val = ipo;\s*if \(val < 0\) val = 0;\s*next.inspectedQuantity = val;\s*next.passedQuantity = val;\s*next.failedQuantity = 0;/g,
            `if (parsedVal > ipo) {
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

        // PassedQuantity block (where fail is calculated)
        content = content.replace(/if \(val > ins\) val = ins;\s*if \(val < 0\) val = 0;\s*next.passedQuantity = val;\s*next.failedQuantity = Number\(\(ins - val\).toFixed\(2\)\);/g,
            `if (parsedVal > ins) {
                  next.passedQuantity = ins;
                  next.failedQuantity = 0;
              } else if (parsedVal < 0) {
                  next.passedQuantity = 0;
                  next.failedQuantity = ins;
              } else {
                  next.passedQuantity = val;
                  next.failedQuantity = Number((ins - parsedVal).toFixed(2));
              }`);

        // FailedQuantity block (where pass is calculated)
        content = content.replace(/if \(val > ins\) val = ins;\s*if \(val < 0\) val = 0;\s*next.failedQuantity = val;\s*next.passedQuantity = Number\(\(ins - val\).toFixed\(2\)\);/g,
            `if (parsedVal > ins) {
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
    
    // For IQC math logic:
    if (file === 'inspectionformIQC.tsx') {
        content = content.replace(/mat.inspectQty = val; mat.passQty = val; mat.failQty = 0;/g, 'mat.inspectQty = value; mat.passQty = value; mat.failQty = 0;');
        content = content.replace(/mat.passQty = val; mat.failQty = Number\(\(mat.inspectQty - val\).toFixed\(2\)\);/g, 'mat.passQty = value; mat.failQty = Number((mat.inspectQty - parseFloat(String(value)||0)).toFixed(2));');
        content = content.replace(/mat.failQty = val; mat.passQty = Number\(\(mat.inspectQty - val\).toFixed\(2\)\);/g, 'mat.failQty = value; mat.passQty = Number((mat.inspectQty - parseFloat(String(value)||0)).toFixed(2));');
        
        // Fix the bounding checks
        content = content.replace(/if \(val > mat.deliveryQty\) val = mat.deliveryQty;/g, 'if (parseFloat(String(value)||0) > mat.deliveryQty) value = mat.deliveryQty;');
        content = content.replace(/if \(val > mat.inspectQty\) val = mat.inspectQty;/g, 'if (parseFloat(String(value)||0) > mat.inspectQty) value = mat.inspectQty;');
        content = content.replace(/if \(val < 0\) val = 0;/g, 'if (parseFloat(String(value)||0) < 0) value = 0;');
    }
    
    // 2. Ensure NO type="number" remains for inputs that deal with decimal quantities.
    // They were mostly converted to type="text" inputMode="decimal" but we will double check.
    // Wait, earlier I did a broad replace of type="number" step="any".
    // Just to be absolutely sure no other type="number" fields are messing things up (like orderQty, deliveryQty which might not have step="any")
    
    // We can replace any remaining `<input type="number"` where it corresponds to a quantity.
    // We already replaced the ones with step="any".
    // I will use regex to find `<input ... type="number" ... >` that are bound to quantities.
    // Specifically `formData.inspectedQuantity`, `passedQuantity`, `failedQuantity`, `mat.inspectQty`, `mat.passQty`, `mat.failQty`, `mat.deliveryQty`, `mat.orderQty`, `so_luong_ipo`
    
    const quantityFields = ['inspectedQuantity', 'passedQuantity', 'failedQuantity', 'inspectQty', 'passQty', 'failQty', 'deliveryQty', 'orderQty', 'so_luong_ipo'];
    
    // Let's just blindly replace type="number" with type="text" inputMode="decimal" for all inputs, because all number inputs in these forms are quantities/measurements.
    content = content.replace(/type="number"/g, 'type="text" inputMode="decimal"');
    
    if (content !== original) {
        fs.writeFileSync(p, content);
        console.log(`Updated ${file}`);
    }
}
