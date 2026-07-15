import fs from 'fs';

const p = 'components/inspectionformPQC.tsx';
let content = fs.readFileSync(p, 'utf-8');

const target1 = `<input value={formData.ma_ct || ''} readOnly className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-400 dark:text-slate-500 font-bold shadow-inner text-[11px]"/>`;
const replace1 = `<input value={formData.ma_ct || ''} onChange={e => handleInputChange('ma_ct', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-400 dark:text-slate-500 font-bold shadow-inner text-[11px]"/>`;

const target2 = `<input value={formData.ten_ct || ''} readOnly className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-400 dark:text-slate-500 font-bold shadow-inner text-[11px]"/>`;
const replace2 = `<input value={formData.ten_ct || ''} onChange={e => handleInputChange('ten_ct', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-400 dark:text-slate-500 font-bold shadow-inner text-[11px]"/>`;

const target3 = `<input value={formData.ten_hang_muc || ''} readOnly className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-400 dark:text-slate-500 font-bold shadow-inner text-[11px]"/>`;
const replace3 = `<input value={formData.ten_hang_muc || ''} onChange={e => handleInputChange('ten_hang_muc', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-400 dark:text-slate-500 font-bold shadow-inner text-[11px]"/>`;

content = content.replace(target1, replace1);
content = content.replace(target2, replace2);
content = content.replace(target3, replace3);

fs.writeFileSync(p, content);
console.log("Success patch-pqc-inputs");
