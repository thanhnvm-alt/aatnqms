const fs = require('fs');
const glob = require('glob');

const replacements = [
  { match: /\bbg-slate-200\b(?! dark:bg-)/g, replace: 'bg-slate-200 dark:bg-slate-700' },
  { match: /\bbg-slate-300\b(?! dark:bg-)/g, replace: 'bg-slate-300 dark:bg-slate-600' },
  { match: /\bborder-slate-300\b(?! dark:border-)/g, replace: 'border-slate-300 dark:border-slate-600' },
  { match: /\btext-blue-500\b(?! dark:text-)/g, replace: 'text-blue-500 dark:text-blue-400' },
  { match: /\bbg-blue-100\b(?! dark:bg-)/g, replace: 'bg-blue-100 dark:bg-blue-900/30' },
  { match: /\bbg-blue-50\b(?! dark:bg-)/g, replace: 'bg-blue-50 dark:bg-blue-900/20' },
  { match: /\bbg-slate-[#0f172a]\b/g, replace: 'bg-slate-900' }, // fix if any
  { match: /\btext-green-500\b(?! dark:text-)/g, replace: 'text-green-500 dark:text-green-400' },
  { match: /\btext-green-600\b(?! dark:text-)/g, replace: 'text-green-600 dark:text-green-500' },
  { match: /\bbg-green-50\b(?! dark:bg-)/g, replace: 'bg-green-50 dark:bg-green-900/20' },
  { match: /\bbg-green-100\b(?! dark:bg-)/g, replace: 'bg-green-100 dark:bg-green-900/30' },
  { match: /\bborder-green-200\b(?! dark:border-)/g, replace: 'border-green-200 dark:border-green-800' },
  { match: /\btext-yellow-500\b(?! dark:text-)/g, replace: 'text-yellow-500 dark:text-yellow-400' },
  { match: /\btext-yellow-600\b(?! dark:text-)/g, replace: 'text-yellow-600 dark:text-yellow-500' },
  { match: /\bbg-yellow-50\b(?! dark:bg-)/g, replace: 'bg-yellow-50 dark:bg-yellow-900/20' },
  { match: /\bbg-yellow-100\b(?! dark:bg-)/g, replace: 'bg-yellow-100 dark:bg-yellow-900/30' },
];

const files = glob.sync('components/**/*.tsx');
files.push('App.tsx');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  
  replacements.forEach(({ match, replace }) => {
    content = content.replace(match, replace);
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Modified: ${file}`);
  }
});
