import fs from 'fs';
let content = fs.readFileSync('components/Dashboard.tsx', 'utf-8');

const tableHeaderStart = `<th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Ngày tạo</th>`;
const newTableHeader = `<th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Công trình / Xưởng</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Ngày tạo</th>`;
content = content.replace(tableHeaderStart, newTableHeader);

const tableBodyStart = `<td className="px-3 py-2 text-xs font-medium text-slate-500">
                                {ncr.createdDate ? new Date(ncr.createdDate).toLocaleDateString('vi-VN') : (ncr.createdAt ? new Date(ncr.createdAt * 1000).toLocaleDateString('vi-VN') : '')}
                              </td>`;
const newTableBody = `<td className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                                {ncr.ma_ct || '---'}
                                {ncr.workshop && <span className="block text-[10px] text-slate-400">{ncr.workshop}</span>}
                              </td>
                              <td className="px-3 py-2 text-xs font-medium text-slate-500">
                                {ncr.createdDate ? new Date(ncr.createdDate).toLocaleDateString('vi-VN') : (ncr.createdAt ? new Date(ncr.createdAt * 1000).toLocaleDateString('vi-VN') : '')}
                              </td>`;
content = content.replace(tableBodyStart, newTableBody);

const colspanStart = `colSpan={4}`;
const newColspan = `colSpan={5}`;
content = content.replace(colspanStart, newColspan);

fs.writeFileSync('components/Dashboard.tsx', content);
