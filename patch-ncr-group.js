import fs from 'fs';
let content = fs.readFileSync('components/Dashboard.tsx', 'utf-8');

const useMemoInsert = `  const filteredInspectionNcrList = useMemo(() => {
    const map = new Map();
    filteredNcrList.forEach(ncr => {
        if (!map.has(ncr.inspection_id)) {
            map.set(ncr.inspection_id, {
                inspection_id: ncr.inspection_id,
                ma_ct: ncr.ma_ct,
                ten_hang_muc: ncr.ten_hang_muc,
                workshop: ncr.workshop,
                createdDate: ncr.createdDate,
                createdAt: ncr.createdAt,
                inspectorName: ncr.inspectorName,
                ncrCount: 1,
            });
        } else {
            map.get(ncr.inspection_id).ncrCount += 1;
        }
    });
    return Array.from(map.values());
  }, [filteredNcrList]);`;

// Insert the useMemo right after filteredNcrList useMemo
const filterListEndIdx = content.indexOf('  }, [ncrList, selectedNcrDateKey, ncrGroupRange]);');
if (filterListEndIdx !== -1) {
    const exactEnd = filterListEndIdx + '  }, [ncrList, selectedNcrDateKey, ncrGroupRange]);'.length;
    content = content.slice(0, exactEnd) + '\n\n' + useMemoInsert + content.slice(exactEnd);
}

const colorReplace1 = `<Bar dataKey="count" name="Số lượng NCR" fill="#f59e0b" barSize={32} radius={[4, 4, 0, 0]}>`;
const newColor1 = `<Bar dataKey="count" name="Số lượng NCR" fill="#ef4444" barSize={32} radius={[4, 4, 0, 0]}>`;
content = content.replace(colorReplace1, newColor1);

const colorReplace2 = `fill={entry.key === selectedNcrDateKey ? "#d97706" : "#f59e0b"}`;
const newColor2 = `fill={entry.key === selectedNcrDateKey ? "#dc2626" : "#ef4444"}`;
content = content.replace(colorReplace2, newColor2);

const colorReplace3 = `style={{ fill: '#b45309', fontSize: 9, fontWeight: '900' }}`;
const newColor3 = `style={{ fill: '#b91c1c', fontSize: 9, fontWeight: '900' }}`;
content = content.replace(colorReplace3, newColor3);

// Replace the table
const tableStart = `DANH SÁCH CHI TIẾT`;
const tableEnd = `                        </tbody>\n                      </table>\n                   </div>\n                </div>\n            )}`;

const startIdx = content.indexOf(tableStart);
const endIdx = content.indexOf(tableEnd) + tableEnd.length;

const newTable = `DANH SÁCH PHIẾU KIỂM TRA CÓ LỖI (NCR)
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
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Mã phiếu</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Hạng mục / Công trình</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase text-center">Số lỗi (NCR)</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase text-right">Ngày tạo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredInspectionNcrList.map(item => (
                            <tr 
                              key={item.inspection_id} 
                              onClick={() => onViewInspection && onViewInspection(item.inspection_id)}
                              className="hover:bg-blue-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer group"
                            >
                              <td className="px-3 py-2 text-xs font-mono font-bold text-slate-700 dark:text-slate-300 group-hover:text-blue-600 transition-colors">
                                #{item.inspection_id.substring(0, 8).toUpperCase()}
                              </td>
                              <td className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                                {item.ten_hang_muc || '---'}
                                <span className="block text-[10px] text-slate-400">
                                  {item.ma_ct || '---'} {item.workshop ? \` - \${item.workshop}\` : ''}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs font-black text-red-500 text-center">
                                {item.ncrCount}
                              </td>
                              <td className="px-3 py-2 text-xs font-medium text-slate-500 text-right">
                                {item.createdDate ? new Date(item.createdDate).toLocaleDateString('vi-VN') : (item.createdAt ? new Date(item.createdAt * 1000).toLocaleDateString('vi-VN') : '')}
                              </td>
                            </tr>
                          ))}
                          {filteredInspectionNcrList.length === 0 && (
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

if (startIdx !== -1 && endIdx !== -1) {
    content = content.slice(0, startIdx) + newTable + content.slice(endIdx);
    fs.writeFileSync('components/Dashboard.tsx', content);
} else {
    console.error("Not found");
}

