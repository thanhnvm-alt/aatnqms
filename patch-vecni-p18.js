import fs from 'fs';

const p = 'components/inspectionformStepVecni.tsx';
let content = fs.readFileSync(p, 'utf-8');

// We want to find the exact P18 stage in availableStages if possible, else fallback to a hardcoded string.
// Actually, we can just replace the onChange of workshop:

const targetWorkshop = `onChange={e => {
                        handleInputChange('workshop', e.target.value);
                        handleInputChange('inspectionStage', 'P18 - sơn - vecni - PVD - UPH - Đan mây');
                        handleInputChange('subStage', '');
                    }}`;

const replaceWorkshop = `onChange={e => {
                        handleInputChange('workshop', e.target.value);
                        const wsCode = e.target.value;
                        const selectedWorkshop = workshops.find(ws => ws.code === wsCode);
                        const stages = selectedWorkshop?.stages || [];
                        const p18 = stages.find(s => s.toLowerCase().includes('p18')) || 'P18 - Sơn - Vecni - PVD - UPH - Đan Mây';
                        handleInputChange('inspectionStage', p18);
                        handleInputChange('subStage', '');
                    }}`;

content = content.replace(targetWorkshop, replaceWorkshop);


const targetStage = `onChange={e => {
                        handleInputChange('inspectionStage', e.target.value);
                        if (e.target.value !== 'P18 - sơn - vecni - PVD - UPH - Đan mây') handleInputChange('subStage', '');
                    }}`;
const replaceStage = `onChange={e => {
                        handleInputChange('inspectionStage', e.target.value);
                        if (!e.target.value.toLowerCase().includes('p18')) handleInputChange('subStage', '');
                    }}`;
content = content.replace(targetStage, replaceStage);

const targetSubStageCond = `{formData.inspectionStage === 'P18 - sơn - vecni - PVD - UPH - Đan mây' && (`
const replaceSubStageCond = `{formData.inspectionStage?.toLowerCase().includes('p18') && (`
content = content.replace(targetSubStageCond, replaceSubStageCond);

fs.writeFileSync(p, content);
console.log("Success p18 patch");
