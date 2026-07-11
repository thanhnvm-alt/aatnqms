import fs from 'fs';
let content = fs.readFileSync('components/Dashboard.tsx', 'utf-8');

const ncrChartStart = `            {/* NCR Quality Chart */}`;
const ncrChartEnd = `            {/* NCR List Details */}`;

const startIdx = content.indexOf(ncrChartStart);
const endIdx = content.indexOf(ncrChartEnd);

if (startIdx !== -1 && endIdx !== -1) {
    const ncrChartBlock = content.slice(startIdx, endIdx);
    
    // remove it from original location
    content = content.slice(0, startIdx) + content.slice(endIdx);
    
    // insert after Monthly chart
    // We need to find where the monthly chart ends
    const monthlyEndMarker = `                    </ResponsiveContainer>
                 </div>
              </div>
            )}`;
            
    const targetIdx = content.indexOf(monthlyEndMarker);
    if (targetIdx !== -1) {
        const exactEnd = targetIdx + monthlyEndMarker.length;
        content = content.slice(0, exactEnd) + "\n\n" + ncrChartBlock + content.slice(exactEnd);
        fs.writeFileSync('components/Dashboard.tsx', content);
        console.log("Moved successfully.");
    } else {
        console.error("Target index not found");
    }
} else {
    console.error("NCR block not found");
}

