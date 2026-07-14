import fs from 'fs';

const p = 'components/inspectiondetailStepVecni.tsx';
let content = fs.readFileSync(p, 'utf-8');

const target = `<p>Xưởng: {inspection.workshop || 'N/A'}</p>
            </div>`;
const replace = `<p>Xưởng: {inspection.workshop || 'N/A'}</p>
                {inspection.inspectionStage && <p>Công đoạn: {inspection.inspectionStage}</p>}
                {inspection.subStage && <p>Công đoạn con: {inspection.subStage}</p>}
            </div>`;

if (content.includes(target)) {
    content = content.replace(target, replace);
    fs.writeFileSync(p, content);
    console.log("Success detail!");
} else {
    console.error("Target detail not found");
}
