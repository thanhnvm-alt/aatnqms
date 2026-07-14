import fs from 'fs';

const p = 'services/dbService.ts';
let content = fs.readFileSync(p, 'utf-8');

content = content.replace(
    /workshop, stage, dvt,/g,
    'workshop, stage, dvt, sub_stage,'
);

content = content.replace(
    /inspection\.ma_nha_may, inspection\.workshop, inspection\.inspectionStage, inspection\.dvt,/g,
    'inspection.ma_nha_may, inspection.workshop, inspection.inspectionStage, inspection.dvt, inspection.subStage,'
);

content = content.replace(
    /ma_nha_may, workshop, stage, headcode, production_comment,/g,
    'ma_nha_may, workshop, stage, headcode, production_comment, sub_stage,'
);

content = content.replace(
    /stage = EXCLUDED\.stage,/g,
    'stage = EXCLUDED.stage,\n          sub_stage = EXCLUDED.sub_stage,'
);

fs.writeFileSync(p, content);
console.log("Success save dbService!");
