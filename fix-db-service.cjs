const fs = require('fs');
let code = fs.readFileSync('services/dbService.ts', 'utf8');

code = code.replace(
    "if (t === 'SQC_BTP', 'SQC_TP' || t === 'SQC-BTP' || t === 'BÁN THÀNH PHẨM' || t === 'BAN THANH PHAM')",
    "if (t === 'SQC_BTP' || t === 'SQC-BTP' || t === 'BÁN THÀNH PHẨM' || t === 'BAN THANH PHAM')"
);

code = code.replace(
    "} else if (tUpper === 'SQC_BTP', 'SQC_TP' || tUpper === 'SQC_TP') {",
    "} else if (tUpper === 'SQC_BTP' || tUpper === 'SQC_TP') {"
);

fs.writeFileSync('services/dbService.ts', code);
