import fs from 'fs';

const p = 'services/migrationService.ts';
let content = fs.readFileSync(p, 'utf-8');

const target1 = `await addColumn(table, 'supporting_docs_json', 'TEXT');`;
const replace1 = `await addColumn(table, 'supporting_docs_json', 'TEXT');
        await addColumn(table, 'sub_stage', 'TEXT');`;

if (content.includes(target1)) {
    content = content.replace(target1, replace1);
    fs.writeFileSync(p, content);
    console.log("Success mig1");
}

const target2 = `await addColumn('inspections', 'date', 'BIGINT');`;
const replace2 = `await addColumn('inspections', 'date', 'BIGINT');
    await addColumn('inspections', 'sub_stage', 'TEXT');`;

if (content.includes(target2)) {
    content = content.replace(target2, replace2);
    fs.writeFileSync(p, content);
    console.log("Success mig2");
}

