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
    "splitRequired: (formData.id || '').split('-').length <= 3,",
    "splitRequired: targetStatus !== InspectionStatus.DRAFT && (formData.id || '').split('-').length <= 3,"
);

code = code.replace(
    "<button onClick={onCancel} className=\"h-[44px] px-6 text-slate-500 dark:text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 text-[10px]\" type=\"button\">HỦY BỎ</button>\n<button onClick={handleSubmit}",
    "<button onClick={onCancel} className=\"h-[44px] px-6 text-slate-500 dark:text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 text-[10px]\" type=\"button\">HỦY BỎ</button>\n<button onClick={() => handleSubmit(InspectionStatus.DRAFT)} disabled={isSaving} className=\"h-[44px] px-6 text-blue-600 border border-blue-600 bg-blue-50 dark:bg-slate-800 font-bold uppercase tracking-widest rounded-xl shadow-sm text-[10px]\" type=\"button\">LƯU NHÁP</button>\n<button onClick={() => handleSubmit(InspectionStatus.PENDING)}"
);

fs.writeFileSync('components/inspectionformSQC_TP.tsx', code);
