import fs from 'fs';

const p = 'services/dbService.ts';
let content = fs.readFileSync(p, 'utf-8');

content = content.replace(
    /\$39::jsonb, \$40::jsonb\n        \)/,
    '$39::jsonb, $40::jsonb, $41::text\n        )'
);

fs.writeFileSync(p, content);
console.log("Success pqc values!");
