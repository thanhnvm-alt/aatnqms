const fs = require('fs');
const glob = require('glob');

const replacements = [
  { match: /\bbg-white\b(?! dark:bg-)/g, replace: 'bg-white dark:bg-slate-900' },
  { match: /\bbg-slate-50\b(?! dark:bg-)/g, replace: 'bg-slate-50 dark:bg-slate-800/50' },
  { match: /\bbg-slate-100\b(?! dark:bg-)/g, replace: 'bg-slate-100 dark:bg-slate-800' },
  { match: /\bborder-slate-200\b(?! dark:border-)/g, replace: 'border-slate-200 dark:border-slate-700' },
  { match: /\bborder-slate-100\b(?! dark:border-)/g, replace: 'border-slate-100 dark:border-slate-800' },
  { match: /\btext-slate-900\b(?! dark:text-)/g, replace: 'text-slate-900 dark:text-slate-100' },
  { match: /\btext-slate-800\b(?! dark:text-)/g, replace: 'text-slate-800 dark:text-slate-200' },
  { match: /\btext-slate-700\b(?! dark:text-)/g, replace: 'text-slate-700 dark:text-slate-300' },
  { match: /\btext-slate-600\b(?! dark:text-)/g, replace: 'text-slate-600 dark:text-slate-400' },
  { match: /\btext-slate-500\b(?! dark:text-)/g, replace: 'text-slate-500 dark:text-slate-400' },
  { match: /\btext-slate-400\b(?! dark:text-)/g, replace: 'text-slate-400 dark:text-slate-500' },
  { match: /\bbg-blue-50\b(?!.*dark:bg-)/g, replace: 'bg-blue-50 dark:bg-slate-800/80' },
  { match: /\bbg-blue-50\/50\b(?!.*dark:bg-)/g, replace: 'bg-blue-50/50 dark:bg-slate-800/80' },
  { match: /\btext-blue-600\b(?! dark:text-)/g, replace: 'text-blue-600 dark:text-blue-400' },
  { match: /\bborder-blue-100\b(?! dark:border-)/g, replace: 'border-blue-100 dark:border-slate-700' },
  { match: /\bborder-blue-200\b(?! dark:border-)/g, replace: 'border-blue-200 dark:border-slate-700' },
  { match: /\bhover:bg-slate-50\b(?! dark:hover:bg-)/g, replace: 'hover:bg-slate-50 dark:hover:bg-slate-800/50' },
  { match: /\bhover:bg-slate-100\b(?! dark:hover:bg-)/g, replace: 'hover:bg-slate-100 dark:hover:bg-slate-800' },
  { match: /\bdivide-slate-200\b(?! dark:divide-)/g, replace: 'divide-slate-200 dark:divide-slate-800' },
  { match: /\bdivide-slate-100\b(?! dark:divide-)/g, replace: 'divide-slate-100 dark:divide-slate-800' },
  { match: /\bdivide-slate-50\b(?! dark:divide-)/g, replace: 'divide-slate-50 dark:divide-slate-800/50' },
  { match: /\bplaceholder-slate-400\b(?! dark:placeholder-)/g, replace: 'placeholder-slate-400 dark:placeholder-slate-500' },
  { match: /\btext-red-500\b(?! dark:text-)/g, replace: 'text-red-500 dark:text-red-400' },
  { match: /\btext-red-600\b(?! dark:text-)/g, replace: 'text-red-600 dark:text-red-400' },
  { match: /\bbg-red-50\b(?! dark:bg-)/g, replace: 'bg-red-50 dark:bg-red-900/20' },
  { match: /\bbg-\[#f1f5f9\]\b(?! dark:bg-)/g, replace: 'bg-[#f1f5f9] dark:bg-slate-800/50' },
  { match: /\bbg-white\/50\b(?! dark:bg-)/g, replace: 'bg-white/50 dark:bg-slate-900/50' }
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
