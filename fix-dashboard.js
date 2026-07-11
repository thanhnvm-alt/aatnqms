import fs from 'fs';
let content = fs.readFileSync('components/Dashboard.tsx', 'utf-8');

// 1. Extract Monthly chart
const monthlyStart = `            {/* Monthly Quality Chart */}`;
const monthlyEndMarker = `              </div>\n            )}`;

const startMonthlyIdx = content.indexOf(monthlyStart);
if (startMonthlyIdx === -1) {
  console.error("monthlyStart not found");
  process.exit(1);
}
// We want to find the NEXT `              </div>\n            )}` after startMonthlyIdx
const endMonthlyIdxRaw = content.indexOf(monthlyEndMarker, startMonthlyIdx);
if (endMonthlyIdxRaw === -1) {
  console.error("monthlyEndMarker not found");
  process.exit(1);
}
const endMonthlyIdx = endMonthlyIdxRaw + monthlyEndMarker.length;
const monthlyBlock = content.slice(startMonthlyIdx, endMonthlyIdx);

// Remove Monthly Chart from original place
content = content.slice(0, startMonthlyIdx) + content.slice(endMonthlyIdx);


// 2. Find NCR Quality Chart position to insert before it
const ncrStart = `            {/* NCR Quality Chart */}`;
const startNcrIdx = content.indexOf(ncrStart);
if (startNcrIdx === -1) {
  console.error("ncrStart not found");
  process.exit(1);
}

// Insert Monthly Chart right before NCR Quality Chart
content = content.slice(0, startNcrIdx) + monthlyBlock + "\n\n" + content.slice(startNcrIdx);

// 3. Add max height to NCR List table
const listDivReplace = `<div className="overflow-x-auto w-full no-scrollbar rounded-xl border border-slate-100 dark:border-slate-800">`;
const newListDiv = `<div className="max-h-[440px] overflow-auto w-full no-scrollbar rounded-xl border border-slate-100 dark:border-slate-800">`;
content = content.replace(listDivReplace, newListDiv);

const theadReplace = `                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/50">
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Mã phiếu</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Hạng mục / Công trình</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase text-center">Số lỗi (NCR)</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase text-right">Ngày tạo</th>
                          </tr>
                        </thead>`;

const newThead = `                        <thead className="sticky top-0 z-10">
                          <tr className="bg-slate-50 dark:bg-slate-800">
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Mã phiếu</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Hạng mục / Công trình</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase text-center border-b border-slate-200 dark:border-slate-700">Số lỗi (NCR)</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase text-right border-b border-slate-200 dark:border-slate-700">Ngày tạo</th>
                          </tr>
                        </thead>`;

content = content.replace(theadReplace, newThead);

fs.writeFileSync('components/Dashboard.tsx', content);
console.log("Successfully fixed dashboard");
