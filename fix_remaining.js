import fs from 'fs';
import path from 'path';

// 1. Fix PQC nested upload
const pqcPath = 'components/inspectionformPQC.tsx';
let pqc = fs.readFileSync(pqcPath, 'utf-8');
pqc = pqc.replace(/const compressed = await compressImage\(reader\.result as string\);\s*const compressedFile = await fetch\(compressed\)\.then\(r => r\.blob\(\)\)\.then\(b => new File\(\[b\], file\.name, \{ type: 'image\/jpeg' \}\)\);\s*const url = await uploadQMSImage\(compressedFile, \{ entityId: ncrData\.id \|\| 'new', type: 'NCR', role: uploadTarget \}\);\s*resolve\(url\);/g, "const url = await uploadQMSImage(file, { entityId: ncrData.id || 'new', type: 'NCR', role: uploadTarget }); resolve(url);");
pqc = pqc.replace(/catch \(e\) \{\s*uploadQMSImage\(file, \{ entityId: ncrData\.id \|\| 'new', type: 'NCR', role: uploadTarget \}\)\.then\(resolve\)\.catch\(reject\);\s*\}/g, 'catch(e) { reject(e); }');
pqc = pqc.replace(/, compressImage /g, ' ');
fs.writeFileSync(pqcPath, pqc);

// 2. Fix SITE detail
const sitePath = 'components/inspectiondetailSITE.tsx';
let site = fs.readFileSync(sitePath, 'utf-8');
site = site.replace(/const compressedBase64 = await compressImage\(f, 500\);\s*const result = await uploadQMSImage\(compressedBase64,/g, "const result = await uploadQMSImage(f,");
site = site.replace(/compressedUrl: compressedBase64/g, "compressedUrl: result");
site = site.replace(/, compressImage /g, ' ');
fs.writeFileSync(sitePath, site);

console.log("Done fixing remaining compressImage usages.");
