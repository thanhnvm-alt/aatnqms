import fs from 'fs';
let content = fs.readFileSync('components/inspectiondetailSITE.tsx', 'utf-8');

const target = `<p className="text-sm text-slate-800 dark:text-slate-200 tracking-tight font-mono">{inspection.date ? (inspection.date.includes("-") ? inspection.date.split("-").reverse().join("/") : inspection.date) : "---"}</p>`;

const replacement = `<p className="text-sm text-slate-800 dark:text-slate-200 tracking-tight font-mono">
{(() => {
    if (!inspection.date) return '---';
    const strVal = String(inspection.date);
    if (/^\\d{10}$/.test(strVal)) return new Date(Number(strVal) * 1000).toLocaleDateString('vi-VN');
    if (/^\\d{13}$/.test(strVal)) return new Date(Number(strVal)).toLocaleDateString('vi-VN');
    if (strVal.includes('-')) return strVal.split('-').reverse().join('/');
    return strVal;
})()}
</p>`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('components/inspectiondetailSITE.tsx', content);
    console.log("Successfully replaced date display");
} else {
    console.error("Target not found");
}
