import fs from 'fs';
const p = 'components/inspectionformPQC.tsx';
let content = fs.readFileSync(p, 'utf-8');
const lines = content.split('\n');
lines[988] = "                {((Number(formData.passedQuantity) || 0) + (Number(formData.failedQuantity) || 0)) > (Number(formData.inspectedQuantity) || 0) && (";
fs.writeFileSync(p, lines.join('\n'));
