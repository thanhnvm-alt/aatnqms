import fs from 'fs';
import path from 'path';

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      const regex1 = /opacity-0 group-hover:opacity-100/g;
      if (regex1.test(content)) {
         content = content.replace(regex1, 'md:opacity-0 group-hover:opacity-100');
         fs.writeFileSync(fullPath, content);
         console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDir(process.cwd() + '/components');
