import React, { useState, useEffect, useMemo } from 'react';
import { Defect, User } from '../types';
import { fetchDefects } from '../services/apiService';
import { 
    Search, Clock, CheckCircle2, Loader2, Calendar, 
    ChevronRight, Tag, Hash, Hammer, Camera, AlertCircle
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
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm shrink-0 z-40 sticky top-0 px-4 py-4">
          <div className="max-w-7xl mx-auto space-y-4">
              <div>
                  <h1 className="text-xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2.5">
                      <Hammer className="w-7 h-7 text-orange-600" />
                      DEFECT TRACKER
                  </h1>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-0.5">Giám sát lỗi kỹ thuật real-time</p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" placeholder="Tìm mã lỗi, dự án, mô tả..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-orange-100/50 transition-all shadow-inner"
                      />
                  </div>
                  <select 
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as any)}
                    className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-tight outline-none cursor-pointer hover:border-orange-300 transition-all shadow-sm"
                  >
                      <option value="ALL">Tất cả trạng thái</option>
                      <option value="OPEN">Mới ghi nhận</option>
                      <option value="IN_PROGRESS">Đang xử lý</option>
                      <option value="CLOSED">Đã hoàn thành</option>
                  </select>
              </div>
          </div>
      </div>

      {/* Main List Area */}
      <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          {isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-10 h-10 animate-spin text-orange-500 mb-4" />
                  <p className="font-black uppercase tracking-widest text-[9px]">Đang đồng bộ dữ liệu...</p>
              </div>
          ) : filteredDefects.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-20 text-slate-300">
                  <div className="p-16 bg-white rounded-[4rem] border-2 border-dashed border-slate-200 shadow-inner flex flex-col items-center">
                      <CheckCircle2 className="w-16 h-16 opacity-10 mb-4 text-green-500" />
                      <p className="font-black uppercase tracking-[0.2em] text-[10px] text-slate-400">Không ghi nhận sai lỗi</p>
                  </div>
              </div>
          ) : (
              <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-20">
                  {filteredDefects.map((defect) => (
                      <div 
                          key={defect.id} 
                          onClick={() => onSelectDefect(defect)}
                          className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col active:scale-[0.98] transition-all hover:shadow-md hover:border-orange-300 group"
                      >
                          <div className="p-4 flex-1 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-2.5">
                                      <div className="p-2 bg-orange-100 text-orange-600 rounded-lg group-hover:bg-orange-600 group-hover:text-white transition-all shadow-sm">
                                          <Tag className="w-4 h-4" />
                                      </div>
                                      <div>
                                          <span className="font-black text-slate-900 text-xs tracking-tight block uppercase">{defect.defectCode}</span>
                                          <span className="text-[9px] font-mono text-slate-400 tracking-tighter">#{defect.id.substring(0,8)}</span>
                                      </div>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border shadow-sm ${getSeverityStyle(defect.severity)}`}>
                                      {defect.severity || 'MINOR'}
                                  </span>
                              </div>

                              <div className="flex gap-3">
                                  {defect.images && defect.images.length > 0 ? (
                                      <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-100 shrink-0 shadow-sm">
                                          <img src={defect.images[0]} className="w-full h-full object-cover" />
                                      </div>
                                  ) : (
                                      <div className="w-16 h-16 rounded-xl bg-slate-50 flex items-center justify-center text-slate-200 shrink-0 border border-slate-100">
                                          <Camera className="w-6 h-6" />
                                      </div>
                                  )}
                                  <div className="flex-1 overflow-hidden">
                                      <p className="text-[11px] font-bold text-slate-700 leading-snug line-clamp-3 italic">
                                          "{defect.description}"
                                      </p>
                                  </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-50 mt-1">
                                  <div className="flex items-center gap-1.5">
                                      <Hash className="w-3 h-3 text-blue-500" />
                                      <span className="text-[9px] font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-tighter truncate max-w-[100px] border border-blue-100">{defect.ma_ct}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 justify-end">
                                      <Calendar className="w-3 h-3 text-slate-400" />
                                      <span className="text-[9px] font-bold text-slate-500 font-mono">{defect.date}</span>
                                  </div>
                              </div>
                          </div>

                          <div className={`px-4 py-2.5 border-t flex items-center justify-between transition-colors ${defect.status === 'CLOSED' ? 'bg-green-50/50 border-green-100' : 'bg-orange-50/50 border-orange-100'}`}>
                              <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border shadow-sm ${getStatusStyle(defect.status)}`}>
                                  {defect.status}
                              </span>
                              <div className="flex items-center gap-1 text-orange-600 text-[9px] font-black uppercase tracking-tighter">
                                  Xem thêm <ChevronRight className="w-3 h-3" />
                              </div>
                          </div>
                      </div>
                  ))}
              </div>
          )}
      </div>
    </div>
  );
};