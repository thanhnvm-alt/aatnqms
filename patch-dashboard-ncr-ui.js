import fs from 'fs';
let content = fs.readFileSync('components/Dashboard.tsx', 'utf-8');

const ncrUI = `            {/* NCR Quality Chart */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
               <div className="flex items-center justify-between mb-4 border-b border-slate-50 dark:border-slate-800 pb-2">
                 <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                    BIỂU ĐỒ LỖI (NCR)
                 </h3>
                 <select
                   value={ncrGroupRange}
                   onChange={(e) => {
                     setNcrGroupRange(e.target.value as any);
                     setSelectedNcrDateKey(null);
                   }}
                   className="text-[10px] font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 outline-none text-slate-700 dark:text-slate-300"
                 >
                   <option value="DAY">Theo Ngày</option>
                   <option value="WEEK">Theo Tuần</option>
                   <option value="MONTH">Theo Tháng</option>
                   <option value="YEAR">Theo Năm</option>
                 </select>
               </div>
               
               <div className="h-64 w-full min-h-[256px]">
                  {isLoadingNcrs ? (
                     <div className="h-full flex items-center justify-center text-slate-400">Đang tải dữ liệu...</div>
                  ) : ncrChartData.length === 0 ? (
                     <div className="h-full flex items-center justify-center text-slate-400 font-medium text-xs">Không có dữ liệu lỗi</div>
                  ) : (
                     <ResponsiveContainer width="99%" height={256}>
                       <BarChart 
                         data={ncrChartData} 
                         margin={{ top: 20, right: 0, left: -20, bottom: 20 }}
                         onClick={(data) => {
                           if (data && data.activePayload && data.activePayload.length > 0) {
                             const key = data.activePayload[0].payload.key;
                             setSelectedNcrDateKey(key === selectedNcrDateKey ? null : key);
                           }
                         }}
                       >
                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                         <XAxis 
                           dataKey="name" 
                           axisLine={false} 
                           tickLine={false} 
                           tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}}
                           angle={ncrGroupRange === 'DAY' ? -45 : 0}
                           textAnchor={ncrGroupRange === 'DAY' ? 'end' : 'middle'}
                         />
                         <YAxis 
                           domain={[0, 'auto']} 
                           axisLine={false} 
                           tickLine={false} 
                           tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}} 
                         />
                         <Tooltip 
                           cursor={{fill: 'rgba(0,0,0,0.05)'}}
                           contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                           itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                           labelStyle={{ fontSize: '11px', fontWeight: '900', color: '#1e293b', marginBottom: '4px' }}
                         />
                         <Bar dataKey="count" name="Số lượng NCR" fill="#f59e0b" barSize={32} radius={[4, 4, 0, 0]}>
                           {ncrChartData.map((entry, index) => (
                             <Cell 
                               key={\`cell-\${index}\`} 
                               fill={entry.key === selectedNcrDateKey ? "#d97706" : "#f59e0b"} 
                               className="cursor-pointer transition-colors duration-200"
                             />
                           ))}
                           <LabelList dataKey="count" position="top" style={{ fill: '#b45309', fontSize: 9, fontWeight: '900' }} />
                         </Bar>
                       </BarChart>
                     </ResponsiveContainer>
                  )}
               </div>
            </div>

            {/* NCR List Details */}
            {ncrList.length > 0 && (
                <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                   <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-50 dark:border-slate-800 pb-2 flex items-center justify-between">
                      DANH SÁCH CHI TIẾT
                      {selectedNcrDateKey && (
                        <button 
                          onClick={() => setSelectedNcrDateKey(null)}
                          className="text-blue-500 hover:text-blue-600 flex items-center gap-1 font-bold lowercase"
                        >
                          <X className="w-3 h-3" /> Bỏ lọc
                        </button>
                      )}
                   </h3>
                   <div className="overflow-x-auto w-full no-scrollbar rounded-xl border border-slate-100 dark:border-slate-800">
                      <table className="w-full text-left min-w-[600px] border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/50">
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Mã lỗi</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Mô tả</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Ngày tạo</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredNcrList.map(ncr => (
                            <tr key={ncr.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                              <td className="px-3 py-2 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                                {ncr.defect_code || 'N/A'}
                              </td>
                              <td className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                                {ncr.issueDescription}
                              </td>
                              <td className="px-3 py-2 text-xs font-medium text-slate-500">
                                {ncr.createdDate ? new Date(ncr.createdDate).toLocaleDateString('vi-VN') : (ncr.createdAt ? new Date(ncr.createdAt * 1000).toLocaleDateString('vi-VN') : '')}
                              </td>
                              <td className="px-3 py-2">
                                <span className={\`px-2 py-0.5 rounded text-[9px] font-black uppercase \${ncr.status === 'CLOSED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}\`}>
                                  {ncr.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {filteredNcrList.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-6 text-center text-xs font-medium text-slate-400">
                                Không có dữ liệu phù hợp
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                   </div>
                </div>
            )}`;

const insertMarker = `             </div>\n            )}\n\n            {/* Monthly Quality Chart */}`;
const insertIndex = content.indexOf(`             </div>\n            )}\n\n            {/* Monthly Quality Chart */}`);

if (insertIndex !== -1) {
    // Find the end of the monthly chart div
    // It's the next \n            </div>\n          </div> below the monthly chart. Let's just find the exact text.
    const monthlyEndMarker = `                    </ResponsiveContainer>\n                 </div>\n              </div>\n            )}`;
    const endIdx = content.indexOf(monthlyEndMarker);
    if (endIdx !== -1) {
        const exactEnd = endIdx + monthlyEndMarker.length;
        content = content.slice(0, exactEnd) + "\n\n" + ncrUI + content.slice(exactEnd);
        fs.writeFileSync('components/Dashboard.tsx', content);
    } else {
        console.error("End marker not found");
    }
} else {
    console.error("Start marker not found");
}

