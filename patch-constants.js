const fs = require('fs');
let code = fs.readFileSync('constants.ts', 'utf8');

code = code.replace(
  "{ id: 'SQC_BTP', label: 'SQC - Bán Thành Phẩm', group: 'KIỂM TRA CHẤT LƯỢNG' },",
  "{ id: 'SQC_BTP', label: 'SQC - Bán Thành Phẩm', group: 'KIỂM TRA CHẤT LƯỢNG' },\n  { id: 'SQC_TP', label: 'SQC - Thành Phẩm', group: 'KIỂM TRA CHẤT LƯỢNG' },"
);

code = code.replace(/allowedModules: \['IQC', 'SQC_MAT', 'SQC_BTP', 'PQC'/g, "allowedModules: ['IQC', 'SQC_MAT', 'SQC_BTP', 'SQC_TP', 'PQC'");
code = code.replace(/allowedModules: \['IQC', 'PQC', 'FQC'/g, "allowedModules: ['IQC', 'PQC', 'SQC_BTP', 'SQC_TP', 'FQC'");
code = code.replace(/allowedModules: \['PQC', 'SITE', 'IQC', 'SQC_MAT', 'SQC_BTP', 'FSR'\]/g, "allowedModules: ['PQC', 'SITE', 'IQC', 'SQC_MAT', 'SQC_BTP', 'SQC_TP', 'FSR']");

fs.writeFileSync('constants.ts', code);
