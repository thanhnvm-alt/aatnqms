
import React, { useState, useEffect, useMemo } from 'react';
import { Defect, User } from '../types';
import { fetchDefects } from '../services/apiService';
import { 
    AlertTriangle, Search, Filter, Clock, CheckCircle2, 
    ArrowRight, Loader2, Calendar, User as UserIcon, 
    FileText, ShieldAlert, Hash, Hammer, Tag, ChevronRight,
    Camera
} from 'lucide-react';

interface DefectListProps {
  currentUser: User;
  onSelectDefect: (defect: Defect) => void;
}

export const DefectList: React.FC<DefectListProps> = ({ currentUser, onSelectDefect }) => {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'>('ALL');

  useEffect(() => {
    loadDefects();
  }, [statusFilter]);

  const loadDefects = async () => {
    setIsLoading(true);
    try {
        const result = await fetchDefects({ status: statusFilter });
        setDefects(result.items);
    } catch (e) {
        console.error("Load Defects failed:", e);
    } finally {
        setIsLoading(false);
    }
  };

  const filteredDefects = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    return defects.filter(d => 
        String(d.id || '').toLowerCase().includes(term) || 
        String(d.description || '').toLowerCase().includes(term) ||
        String(d.defectCode || '').toLowerCase().includes(term) ||
        String(d.ma_ct || '').toLowerCase().includes(term)
    );
  }, [defects, searchTerm]);

  const getSeverityStyle = (severity: string) => {
    switch (severity?.toUpperCase()) {
        case 'CRITICAL': return 'bg-red-600 text-white border-red-700';
        case 'MAJOR': return 'bg-orange-500 text-white border-orange-600';
        default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status?.toUpperCase()) {
        case 'CLOSED': return 'bg-green-50 text-green-700 border-green-200';
        case 'IN_PROGRESS': return 'bg-blue-50 text-blue-700 border-blue-200';
        default: return 'bg-red-50 text-red-700 border-red-200';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white p-4 md:p-6 border-b border-slate-200 shadow-sm shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                  <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                      <Hammer className="w-8 h-8 text-orange-600" />
                      DANH SÁCH LỖI (DEFECTS)
                  </h1>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Hệ thống giám sát sai lỗi kỹ thuật • Real-time</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                  <div className="relative group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500" />
                      <input 
                        type="text" placeholder="Tìm mã lỗi, dự án, mô tả..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium w-full md:w-80 focus:bg-white focus:ring-4 focus:ring-blue-100 outline-none transition-all shadow-inner"
                      />
                  </div>
                  <select 
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as any)}
                    className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-tight outline-none cursor-pointer hover:border-blue-300 transition-all shadow-sm"
                  >
                      <option value="ALL">Tất cả lỗi</option>
                      <option value="OPEN">Mới phát hiện</option>
                      <option value="IN_PROGRESS">Đang sửa chữa</option>
                      <option value="CLOSED">Đã khắc phục</option>
                  </select>
              </div>
          </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-auto p-4 md:p-6 no-scrollbar">
          {isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
                  <p className="font-black uppercase tracking-widest text-xs">Đang truy xuất dữ liệu lỗi...</p>
              </div>
          ) : filteredDefects.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300">
                  <div className="p-16 bg-white rounded-[4rem] border-2 border-dashed border-slate-200 shadow-inner flex flex-col items-center">
                      <CheckCircle2 className="w-24 h-24 opacity-10 mb-4 text-green-500" />
                      <p className="font-black uppercase tracking-[0.3em] text-sm">Không ghi nhận sai lỗi nào</p>
                      <p className="text-xs font-medium text-slate-400 mt-2">Hệ thống đang hoạt động ổn định</p>
                  </div>
              </div>
          ) : (
              <div className="max-w-7xl mx-auto bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[1000px]">
                          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-black uppercase tracking-widest text-[10px]">
                              <tr>
                                  <th className="px-6 py-4 w-48">Mã Lỗi / Code</th>
                                  <th className="px-6 py-4 w-44">Dự án</th>
                                  <th className="px-6 py-4">Mô tả chi tiết & Hình ảnh</th>
                                  <th className="px-6 py-4 w-32 text-center">Ngày ghi nhận</th>
                                  <th className="px-6 py-4 w-32 text-center">Mức độ</th>
                                  <th className="px-6 py-4 w-32 text-center">Trạng thái</th>
                                  <th className="px-6 py-4 w-16"></th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {filteredDefects.map((defect) => (
                                  <tr 
                                      key={defect.id} 
                                      onClick={() => onSelectDefect(defect)}
                                      className="hover:bg-orange-50/30 transition-colors cursor-pointer group animate-in fade-in duration-300"
                                  >
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-3">
                                              <div className="p-2 bg-orange-100 text-orange-600 rounded-lg group-hover:bg-orange-600 group-hover:text-white transition-all">
                                                  <Tag className="w-4 h-4" />
                                              </div>
                                              <div>
                                                  <span className="font-black text-slate-900 text-xs tracking-tight block">{defect.defectCode}</span>
                                                  <span className="text-[9px] font-mono text-slate-400">#{defect.id.substring(0,8)}</span>
                                              </div>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-1.5 font-black text-[10px] text-blue-700 bg-blue-50 px-2 py-1 rounded-md border border-blue-100 w-fit uppercase">
                                              <Hash className="w-3 h-3" />
                                              {defect.ma_ct}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-3 overflow-hidden">
                                              {defect.images && defect.images.length > 0 ? (
                                                  <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                                      <img src={defect.images[0]} className="w-full h-full object-cover" />
                                                  </div>
                                              ) : (
                                                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300 shrink-0">
                                                      <Camera className="w-4 h-4" />
                                                  </div>
                                              )}
                                              <p className="text-xs font-bold text-slate-700 leading-tight line-clamp-1 italic max-w-md">
                                                  {defect.description}
                                              </p>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <span className="text-[10px] font-bold text-slate-500 font-mono">{defect.date}</span>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border shadow-sm ${getSeverityStyle(defect.severity)}`}>
                                              {defect.severity || 'MINOR'}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border shadow-sm ${getStatusStyle(defect.status)}`}>
                                              {defect.status}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <div className="p-2 text-slate-300 group-hover:text-orange-600 transition-colors group-hover:translate-x-1 transition-transform">
                                              <ChevronRight className="w-5 h-5" />
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                  {/* Summary Footer */}
                  <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Ghi nhận {filteredDefects.length} sự vụ sai lỗi kỹ thuật
                      </p>
                      <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
                          <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                              <span className="text-slate-500">Tổng lỗi: {defects.length}</span>
                          </div>
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};
