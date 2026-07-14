import fs from 'fs';

const p = 'services/dbService.ts';
let content = fs.readFileSync(p, 'utf-8');

// For PQC
content = content.replace(
    /comments_json, data\n        \)/,
    'comments_json, data, sub_stage\n        )'
);
content = content.replace(
    /\$42::bigint,\n          \$43::jsonb, \$44::jsonb/,
    '$42::bigint,\n          $43::jsonb, $44::jsonb, $45::text'
);
content = content.replace(
    /inspection\.comments, inspection/,
    'inspection.comments, inspection, inspection.subStage'
);

// For PQC update
content = content.replace(
    /stage = EXCLUDED\.stage,\n          data = EXCLUDED\.data/,
    'stage = EXCLUDED.stage,\n          sub_stage = EXCLUDED.sub_stage,\n          data = EXCLUDED.data'
);


// For General
content = content.replace(
    /date_teamlead, date_manager, date_qc, data\n      \)/,
    'date_teamlead, date_manager, date_qc, data, sub_stage\n      )'
);
content = content.replace(
    /\$43::text, \$44::text, \$45::bigint, \$46::bigint, \$47::bigint, \$48::jsonb\n      \)/,
    '$43::text, $44::text, $45::bigint, $46::bigint, $47::bigint, $48::jsonb, $49::text\n      )'
);
content = content.replace(
    /teamLeadDateTS, managerDateTS, qcDateTS,\n        JSON\.stringify\(inspection\)/,
    'teamLeadDateTS, managerDateTS, qcDateTS,\n        JSON.stringify(inspection),\n        inspection.subStage'
);

// For General update
content = content.replace(
    /dvt = EXCLUDED\.dvt,\n        data = EXCLUDED\.data/,
    'dvt = EXCLUDED.dvt,\n        sub_stage = EXCLUDED.sub_stage,\n        data = EXCLUDED.data'
);

fs.writeFileSync(p, content);
console.log("Success safe dbService!");
