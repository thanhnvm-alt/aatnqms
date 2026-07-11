import fs from 'fs';

let content = fs.readFileSync('services/dbService.ts', 'utf-8');

const ncrFiltersStart = `if (filters.search) {`;
const newFilters = `if (filters.unixStart) {
        where += " AND n.created_at >= $" + (args.length + 1);
        args.push(filters.unixStart);
    }
    if (filters.unixEnd) {
        where += " AND n.created_at <= $" + (args.length + 1);
        args.push(filters.unixEnd);
    }
    
    if (filters.search) {`;

content = content.replace(ncrFiltersStart, newFilters);
fs.writeFileSync('services/dbService.ts', content);
