
import React, { useState, useEffect, useMemo } from 'react';
import { IPOItem } from '../types';
import { fetchIPOs } from '../services/apiService';
import { Search, RefreshCw, Loader2, Database, List, ArrowLeft, ArrowRight, Table, Hash, Package } from 'lucide-react';

interface IPOListProps {
  onRefresh: () => void;
}

export const IPOList: React.FC<IPOListProps> = ({ onRefresh }) => {
  const [ipos, setIpos] = useState<IPOItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    loadData();
  }, [page, limit, searchTerm]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const result = await fetchIPOs(searchTerm, page, limit);
      if (result && result.data) {
        setIpos(result.data);
        setTotal(result.total || 0);
      }
    } catch (e) {
      console.error("Load IPOs failed:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    setPage(1); // Reset to first page on new search
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header Toolbar */}
      <div className="bg-white px-4 py-4 border-b border-slate-200 sticky top-0 z-20 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Dữ liệu IPO (Plans/Orders)</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Database Record View</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm ID Project, Tên dự án, Mã..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchTerm)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all"
            />
          </div>
          <button 
            onClick={() => loadData()}
            className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all shadow-sm"
            title="Làm mới"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-auto p-4 md:p-6 no-scrollbar">
        {isLoading && ipos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
            <p className="font-black uppercase tracking-widest text-[9px]">Đang tải dữ liệu IPO...</p>
          </div>
        ) : ipos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-20 text-slate-300">
            <Table className="w-16 h-16 opacity-10 mb-4" />
            <p className="font-black uppercase tracking-[0.2em] text-[10px]">Không tìm thấy dữ liệu</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500 font-black uppercase tracking-widest text-[9px] sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-center w-16">ID</th>
                    <th className="px-4 py-3 w-32">Mã Dự Án</th>
                    <th className="px-4 py-3 min-w-[200px]">Tên Dự Án</th>
                    <th className="px-4 py-3 min-w-[250px]">Mô Tả Vật Tư / Hạng Mục</th>
                    <th className="px-4 py-3 w-24 text-center">ĐVT</th>
                    <th className="px-4 py-3 w-28 text-right">SL IPO</th>
                    <th className="px-4 py-3 w-32">Mã Nhà Máy</th>
                    <th className="px-4 py-3 w-32">Ngày tạo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ipos.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-blue-50/30 transition-colors group">
                      <td className="px-4 py-3 text-center text-[10px] font-mono text-slate-400">{item.id}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Hash className="w-3 h-3 text-blue-400" />
                          <span className="font-bold text-[11px] text-blue-700">{item.ID_Project}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-[11px] text-slate-700 uppercase">{item.Project_name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <Package className="w-3 h-3 text-slate-400 mt-0.5" />
                          <span className="text-[11px] font-medium text-slate-600 line-clamp-2" title={item.Material_description}>{item.Material_description}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 bg-slate-50/50">{item.Base_Unit}</td>
                      <td className="px-4 py-3 text-right font-mono text-[11px] font-bold text-slate-800">{item.Quantity_IPO}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-slate-500">{item.ID_Factory_Order}</td>
                      <td className="px-4 py-3 text-[10px] text-slate-400 font-mono">{item.Created_on}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="bg-white border-t border-slate-200 px-4 py-3 flex justify-between items-center shrink-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Hiển thị {ipos.length} / {total} bản ghi
        </p>
        <div className="flex gap-2">
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
            className="p-2 border rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="px-4 py-2 bg-slate-100 rounded-lg text-[10px] font-black text-slate-600 flex items-center">
            Trang {page} / {totalPages || 1}
          </span>
          <button 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
            className="p-2 border rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-all"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
