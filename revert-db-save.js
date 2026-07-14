import fs from 'fs';

const p = 'services/dbService.ts';
let content = fs.readFileSync(p, 'utf-8');

content = content.replace(
    /workshop, stage, dvt, sub_stage,/g,
    'workshop, stage, dvt,'
);

content = content.replace(
    /inspection\.ma_nha_may, inspection\.workshop, inspection\.inspectionStage, inspection\.dvt, inspection\.subStage,/g,
    'inspection.ma_nha_may, inspection.workshop, inspection.inspectionStage, inspection.dvt,'
);

content = content.replace(
    /ma_nha_may, workshop, stage, headcode, production_comment, sub_stage,/g,
    'ma_nha_may, workshop, stage, headcode, production_comment,'
);

content = content.replace(
    /stage = EXCLUDED.stage,\n          sub_stage = EXCLUDED.sub_stage,/g,
    'stage = EXCLUDED.stage,'
);

fs.writeFileSync(p, content);
console.log("Success revert dbService!");
