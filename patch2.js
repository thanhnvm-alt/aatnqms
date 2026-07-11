import fs from 'fs';
let content = fs.readFileSync('services/dbService.ts', 'utf-8');
const oldCode = `    if (filters.search) {
        const p = \`%\${filters.search}%\`;`;
const newCode = `    if (filters.unixStart && filters.unixStart !== 'NaN' && filters.unixStart !== 'undefined') {
        const ts = parseInt(filters.unixStart, 10);
        if (!isNaN(ts)) {
            where += " AND n.created_at >= $" + (args.length + 1);
            args.push(ts);
        }
    }
    if (filters.unixEnd && filters.unixEnd !== 'NaN' && filters.unixEnd !== 'undefined') {
        const ts = parseInt(filters.unixEnd, 10);
        if (!isNaN(ts)) {
            where += " AND n.created_at <= $" + (args.length + 1);
            args.push(ts);
        }
    }
    
    if (filters.search) {
        const p = \`%\${filters.search}%\`;`;

const index = content.lastIndexOf(oldCode); // There might be multiple, we want the one in getNcrs
if (index !== -1) {
    content = content.slice(0, index) + newCode + content.slice(index + oldCode.length);
    fs.writeFileSync('services/dbService.ts', content);
} else {
    console.log("NOT FOUND");
}
