const fs = require('fs');
let code = fs.readFileSync('components/inspectionformSQC_TP.tsx', 'utf8');

code = code.replace(
    "const handleSubmit = async () => {",
    "const handleSubmit = async (targetStatus: InspectionStatus = InspectionStatus.PENDING) => {"
);

code = code.replace(
    "status: InspectionStatus.PENDING,",
    "status: targetStatus,"
);

code = code.replace(
    "splitRequired: (formData.id || '').split('-').length <= 3, // Split only if it's the base ID",
    "splitRequired: targetStatus !== InspectionStatus.DRAFT && (formData.id || '').split('-').length <= 3, // Split only if it's the base ID and not DRAFT"
);

code = code.replace(
    "HỦY BỎ</button><button onClick={handleSubmit}",
    "HỦY BỎ</button><button onClick={() => handleSubmit(InspectionStatus.DRAFT)} disabled={isSaving} className=\"h-[44px] px-6 text-blue-600 border border-blue-600 bg-blue-50 dark:bg-slate-800 font-bold uppercase tracking-widest rounded-xl shadow-sm text-[10px] whitespace-nowrap\" type=\"button\">LƯU NHÁP</button><button onClick={() => handleSubmit(InspectionStatus.PENDING)}"
);

fs.writeFileSync('components/inspectionformSQC_TP.tsx', code);
