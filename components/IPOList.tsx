
import React, { useState, useEffect } from 'react';
import { IPO } from '../types';
import { fetchIPOs } from '../services/apiService';
import { 
  Search, RefreshCw, Loader2, Box, 
  ChevronLeft, ChevronRight, FileText, Calendar, AlertTriangle
} from 'lucide-react';

interface IPOListProps {
  onSelect?: (ipo: IPO) => void;
}

export const IPOList: React.FC<IPOListProps> = ({ onSelect }) => {
  const [ipos, setIpos] = useState<IPO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchIPOs(searchTerm);
      if (result.success) {
        setIpos(result.items || []);
      } else {
        setError(result.error || 'Lỗi không xác định khi tải dữ liệu');
        setIpos([]);
      }
    } catch (err: any) {
      console.error("Failed to load IPOs", err);
      setError(err.message || 'Lỗi kết nối');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header / Toolbar */}
      <div className="bg-white border-b border-slate-200 p-4 shadow-sm shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Danh sách IPO</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">PostgreSQL Data Source</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <form onSubmit={handleSearch} className="relative flex-1 md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Tìm IPO, Dự án..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all"
              />
            </form>
            <button 
              onClick={() => loadData()} 
              className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 hover:text-indigo-600 transition-all active:scale-95 shadow-sm"
              title="Làm mới"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="max-w-7xl mx-auto h-full flex flex-col bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
          
          <div className="flex-1 overflow-auto no-scrollbar">
            {error ? (
              <div className="flex flex-col items-center justify-center h-64 text-red-500 space-y-2">
                <AlertTriangle className="w-10 h-10 opacity-50" />
                <p className="font-bold text-sm uppercase">Kết nối thất bại</p>
                <p className="text-xs opacity-70 max-w-md text-center">{error}</p>
                <button onClick={() => loadData()} className="mt-4 px-4 py-2 bg-red-50 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors">Thử lại</button>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest sticky top-0 z-10">
                  <tr>
                    <th className="p-4 w-16 text-center">#</th>
                    <th className="p-4">Thông tin Dự Án</th>
                    <th className="p-4">Hạng mục / Vật tư</th>
                    <th className="p-4">Thông tin Lệnh SX</th>
                    <th className="p-4 text-right">Số lượng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                     <tr><td colSpan={5} className="p-10 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500"/></td></tr>
                  ) : ipos.length === 0 ? (
                     <tr><td colSpan={5} className="p-10 text-center text-slate-400 font-bold text-xs uppercase">Không tìm thấy dữ liệu IPO</td></tr>
                  ) : (
                    ipos.map((ipo, idx) => (
                      <tr key={ipo.id || idx} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="p-4 text-center">
                          <span className="text-[10px] font-mono text-slate-300 font-bold">{idx + 1}</span>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-black text-slate-800 uppercase">{ipo.Project_name || 'N/A'}</span>
                            <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 w-fit mt-1">{ipo.ID_Project}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-medium text-slate-700">{ipo.Material_description}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                             <div className="flex items-center gap-1.5">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-600 font-mono">{ipo.ID_Factory_Order}</span>
                             </div>
                             <div className="flex items-center gap-1.5">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span className="text-[9px] text-slate-500">{ipo.Created_on ? new Date(ipo.Created_on).toLocaleDateString('vi-VN') : '-'}</span>
                             </div>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <span className="text-sm font-black text-slate-800">{ipo.Quantity_IPO}</span>
                          <span className="text-[9px] font-bold text-slate-400 ml-1 uppercase">{ipo.Base_Unit}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {!error && ipos.length > 0 && (
            <div className="p-3 border-t border-slate-100 bg-slate-50 text-center">
               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                 Hiển thị {ipos.length} bản ghi
               </span>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
