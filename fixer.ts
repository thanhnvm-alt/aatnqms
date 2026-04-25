import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

// Replace WorkbookWriter
content = content.replace(/const workbook = new ExcelJS\.stream\.xlsx\.WorkbookWriter\(\{\s*stream: res,\s*useStyles: true,\s*useSharedStrings: true\s*\}\);/g, 'const workbook = new ExcelJS.Workbook();');

// Fix row.commit
content = content.replace(/await row\.commit\(\);/g, '');

// Fix workbook.commit
content = content.replace(/await workbook\.commit\(\);/g, 'await workbook.xlsx.write(res);\n        res.end();');

// Fix date parsing in exports
content = content.replace(/created_at: r\.created_at \? new Date\(Number\(r\.created_at\) \* 1000\) : null/g, 
  'created_at: r.created_at ? new Date(Number(r.created_at) > 100000000000 ? Number(r.created_at) : Number(r.created_at) * 1000) : null');

fs.writeFileSync('server.ts', content);
console.log('Fixed server.ts');
