import fs from 'fs';

let content = fs.readFileSync('components/SupplierManagement.tsx', 'utf-8');

// 1. Add sortBy state and update loadSuppliers
content = content.replace(
    /const \[searchTerm, setSearchTerm\] = useState\(''\);/,
    `const [searchTerm, setSearchTerm] = useState('');\n  const [sortBy, setSortBy] = useState('reports');`
);

content = content.replace(
    /useEffect\(\(\) => \{\n\s*loadSuppliers\(searchTerm, page\);\n\s*\}, \[searchTerm, page\]\);/,
    `useEffect(() => {\n    loadSuppliers(searchTerm, page, sortBy);\n  }, [searchTerm, page, sortBy]);`
);

content = content.replace(
    /const loadSuppliers = async \(search = '', currentPage = 1\) => \{/,
    `const loadSuppliers = async (search = '', currentPage = 1, currentSort = sortBy) => {`
);

content = content.replace(
    /await fetchSuppliers\(search, currentPage, 20\);/,
    `await fetchSuppliers(search, currentPage, 20, currentSort);`
);

// 2. Add SortBy dropdown to the header
const headerPattern = /<Search className="absolute left-3 top-1\/2 -translate-y-1\/2 w-4 h-4 text-slate-400 dark:text-slate-500" \/>/;
const headerReplacement = `<select 
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 outline-none hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <option value="reports">Số lượng báo cáo</option>
              <option value="name">Tên Nhà Cung Cấp</option>
              <option value="updated_at">Cập nhật mới nhất</option>
            </select>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />`;
            
content = content.replace(headerPattern, headerReplacement);

// 3. Replace the grid with a table
const gridStart = `<div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">`;
const gridEnd = `))}
            </div>`;
            
const tableReplacement = `<div className="w-full overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest w-1/3">Nhà cung cấp</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest w-1/4">Ngành hàng & Liên hệ</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center w-32">Pass Rate</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center w-32">Tổng PO</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center w-32">Trạng thái</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-right w-24">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {suppliers.map(s => (
                    <tr 
                      key={s.id} 
                      onClick={() => onSelectSupplier(s)} 
                      className="group hover:bg-blue-50/50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{s.name}</span>
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1.5">
                            #{s.code}
                            {s.address && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3"/> {s.address}</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">{s.category || 'Vật tư tổng hợp'}</span>
                          {s.contact_person && <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1"><UserIcon className="w-3 h-3"/> {s.contact_person} {s.phone && \` - \${s.phone}\`}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-black text-green-600 dark:text-green-500">{Math.round(s.stats?.pass_rate || 0)}%</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-black text-slate-700 dark:text-slate-300">{s.stats?.total_pos || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={\`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border \${s.status === 'ACTIVE' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 border-green-200 dark:border-green-800' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'}\`}>{s.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                         <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); handleOpenModal(s); }} className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800"><Edit3 className="w-4 h-4" /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-slate-800"><Trash2 className="w-4 h-4" /></button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>`;

let startIndex = content.indexOf(gridStart);
let endIndex = content.indexOf(gridEnd) + gridEnd.length;

if (startIndex !== -1 && endIndex !== -1) {
    content = content.slice(0, startIndex) + tableReplacement + content.slice(endIndex);
}

// 4. Update the save and delete load calls
content = content.replace(/await loadSuppliers\(searchTerm, page\);/g, 'await loadSuppliers(searchTerm, page, sortBy);');

fs.writeFileSync('components/SupplierManagement.tsx', content);
