
const fs = require('fs');
const content = fs.readFileSync('/components/ToolsManagement.tsx', 'utf8');
const stack = [];
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '{' || char === '(' || char === '[') {
            stack.push({ char, line: i + 1, col: j + 1 });
        } else if (char === '}' || char === ')' || char === ']') {
            const last = stack.pop();
            if (!last) {
                console.log(`Extra ${char} at line ${i + 1}, col ${j + 1}`);
                continue;
            }
            const match = { '}': '{', ')': '(', ']': '[' }[char];
            if (last.char !== match) {
                console.log(`Mismatch: ${last.char} at ${last.line}:${last.col} closed by ${char} at ${i + 1}:${j + 1}`);
            }
        }
    }
}
if (stack.length > 0) {
    console.log('Unclosed items:');
    stack.forEach(item => console.log(`${item.char} at ${item.line}:${item.col}`));
} else {
    console.log('All balanced!');
}
