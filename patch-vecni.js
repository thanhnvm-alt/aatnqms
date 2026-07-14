import fs from 'fs';

const p = 'components/inspectionformStepVecni.tsx';
let content = fs.readFileSync(p, 'utf-8');

// Update workshop change handler to default inspectionStage
const targetWorkshopSelect = `onChange={e => handleInputChange('workshop', e.target.value)}`;
const replaceWorkshopSelect = `onChange={e => {
                        handleInputChange('workshop', e.target.value);
                        handleInputChange('inspectionStage', 'P18 - sơn - vecni - PVD - UPH - Đan mây');
                    }}`;
content = content.replace(targetWorkshopSelect, replaceWorkshopSelect);

// Now the grid layout for the 3 dropdowns
// originally: <div className="grid grid-cols-2 gap-2">
// Let's find it.
const targetGrid = `<div className="grid grid-cols-2 gap-2">
                 <div className="space-y-0.5"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Xưởng sản xuất</label><select value={formData.workshop || ''} onChange={e => {
                        handleInputChange('workshop', e.target.value);
                        handleInputChange('inspectionStage', 'P18 - sơn - vecni - PVD - UPH - Đan mây');
                    }} className="w-full px-2 py-1.5 border border-slate-200 rounded-md bg-white font-bold outline-none text-[11px]"><option value="">-- Chọn xưởng --</option>{workshops.map(ws => <option key={ws.code} value={ws.code}>{ws.name}</option>)}</select></div>
                 <div className="space-y-0.5"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Công đoạn *</label><select value={formData.inspectionStage || ''} onChange={e => handleInputChange('inspectionStage', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded-md bg-white font-bold outline-none text-[11px]"><option value="">-- Chọn giai đoạn --</option>{availableStages.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            </div>`;

const replaceGrid = `<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                 <div className="space-y-0.5"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Xưởng sản xuất</label><select value={formData.workshop || ''} onChange={e => {
                        handleInputChange('workshop', e.target.value);
                        handleInputChange('inspectionStage', 'P18 - sơn - vecni - PVD - UPH - Đan mây');
                        handleInputChange('subStage', '');
                    }} className="w-full px-2 py-1.5 border border-slate-200 rounded-md bg-white font-bold outline-none text-[11px]"><option value="">-- Chọn xưởng --</option>{workshops.map(ws => <option key={ws.code} value={ws.code}>{ws.name}</option>)}</select></div>
                 <div className="space-y-0.5"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Công đoạn *</label><select value={formData.inspectionStage || ''} onChange={e => {
                        handleInputChange('inspectionStage', e.target.value);
                        if (e.target.value !== 'P18 - sơn - vecni - PVD - UPH - Đan mây') handleInputChange('subStage', '');
                    }} className="w-full px-2 py-1.5 border border-slate-200 rounded-md bg-white font-bold outline-none text-[11px]"><option value="">-- Chọn giai đoạn --</option>{availableStages.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                 {formData.inspectionStage === 'P18 - sơn - vecni - PVD - UPH - Đan mây' && (
                     <div className="space-y-0.5"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Công đoạn con</label><select value={formData.subStage || ''} onChange={e => handleInputChange('subStage', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded-md bg-white font-bold outline-none text-[11px]"><option value="">-- Chọn công đoạn con --</option>{['Lót 1', 'Lót 2', 'Lót 3', 'Bóng 1', 'Bóng 2'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                 )}
            </div>`;

if (content.includes(targetGrid)) {
    content = content.replace(targetGrid, replaceGrid);
    fs.writeFileSync(p, content);
    console.log("Success!");
} else {
    console.error("Target Grid not found");
}

