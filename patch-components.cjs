const fs = require('fs');

function patchFile(file, patcher) {
    if (!fs.existsSync(file)) return;
    let code = fs.readFileSync(file, 'utf8');
    code = patcher(code);
    fs.writeFileSync(file, code);
}

patchFile('components/Dashboard.tsx', code => {
    code = code.replace("'SQC_BTP': { label: 'SQC-BTP' },", "'SQC_BTP': { label: 'SQC-BTP' },\n    'SQC_TP': { label: 'SQC-TP' },");
    code = code.replace("map['GCN'] = 'GCN (Gia Công Ngoài)';", "map['GCN'] = 'GCN (Gia Công Ngoài)';\n    map['SQC_TP'] = 'SQC - Thành Phẩm';");
    return code;
});

patchFile('components/InspectionList.tsx', code => {
    code = code.replace("'SQC_BTP': { label: 'SQC-BTP', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: Box },", "'SQC_BTP': { label: 'SQC-BTP', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: Box },\n    'SQC_TP': { label: 'SQC-TP', color: 'text-teal-600', bg: 'bg-teal-50', icon: Package },");
    code = code.replace("map['GCN'] = 'GCN (Gia Công Ngoài)';", "map['GCN'] = 'GCN (Gia Công Ngoài)';\n    map['SQC_TP'] = 'SQC - Thành Phẩm';");
    code = code.replace(/item\.type === 'SQC_BTP'/g, "item.type === 'SQC_BTP' || item.type === 'SQC_TP'");
    return code;
});

patchFile('components/GlobalHeader.tsx', code => {
    code = code.replace("case 'SQC_BTP': return 'SQC Semi-Product';", "case 'SQC_BTP': return 'SQC Semi-Product';\n        case 'SQC_TP': return 'SQC Final Product';");
    code = code.replace("case 'SQC_BTP': return 'Gia công ngoài - Bán thành phẩm';", "case 'SQC_BTP': return 'Gia công ngoài - Bán thành phẩm';\n        case 'SQC_TP': return 'Gia công ngoài - Thành phẩm';");
    return code;
});

patchFile('components/ProjectDetail.tsx', code => {
    code = code.replace("import { InspectionDetailSQC_BTP } from './inspectiondetailSQC_BTP';", "import { InspectionDetailSQC_BTP } from './inspectiondetailSQC_BTP';\nimport { InspectionDetailSQC_TP } from './inspectiondetailSQC_TP';");
    code = code.replace("'SQC_BTP': InspectionDetailSQC_BTP,", "'SQC_BTP': InspectionDetailSQC_BTP, 'SQC_TP': InspectionDetailSQC_TP,");
    return code;
});

patchFile('components/HomeMenu.tsx', code => {
    code = code.replace("'SQC_BTP': <Package className=\"w-6 h-6\"/>,", "'SQC_BTP': <Package className=\"w-6 h-6\"/>,\n    'SQC_TP': <PackageCheck className=\"w-6 h-6\"/>,");
    code = code.replace("'SQC_BTP': \"text-teal-600\",", "'SQC_BTP': \"text-teal-600\",\n    'SQC_TP': \"text-emerald-600\",");
    
    if(!code.includes("PackageCheck")) {
        code = code.replace("import {", "import { PackageCheck,");
    }
    return code;
});
