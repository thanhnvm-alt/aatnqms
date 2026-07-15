import fs from 'fs';

const p = 'components/inspectionformPQC.tsx';
let content = fs.readFileSync(p, 'utf-8');

content = content.replace(/let val = parseFloat\(String\(value\)\) \|\| 0;/g, `let val = value;
              let parsedVal = parseFloat(String(val));
              if (isNaN(parsedVal)) parsedVal = 0;`);

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

fs.writeFileSync(p, content);
console.log("Patched PQC");
