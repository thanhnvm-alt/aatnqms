import React, { useState, useEffect, useMemo } from 'react';
import { NCR, User } from '../types';
import { fetchNcrs, fetchNcrById } from '../services/apiService';
import { 
    AlertTriangle, Search, Clock, CheckCircle2, 
    ArrowRight, Loader2, Calendar, User as UserIcon, 
    FileText, ChevronRight, ShieldAlert,
    Hash, AlertCircle, Maximize2, X, ChevronDown
} from 'lucide-react';
import { NCRDetail } from './NCRDetail';

interface NCRListProps {
  currentUser: User;
  onSelectNcr: (inspectionId: string) => void;
}

export const NCRList: React.FC<NCRListProps> = ({ currentUser, onSelectNcr }) => {
  const [ncrs, setNcrs] = useState<NCR[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'>('ALL');
  const [selectedNcr, setSelectedNcr] = useState<NCR | null>(null);

  useEffect(() => {
    loadNcrs();
  }, [statusFilter]);

  const loadNcrs = async () => {
    setIsLoading(true);
    try {
        const result = await fetchNcrs({ status: statusFilter });
        setNcrs(result.items);
    } catch (e) {
        console.error("Load NCRs failed:", e);
    } finally {
        setIsLoading(false);
    }
  };

  const handleSelectNcrItem = async (ncrId: string) => {
    setIsDetailLoading(true);
    try {
        const fullNcr = await fetchNcrById(ncrId);
        if (fullNcr) {
            setSelectedNcr(fullNcr);
        } else {
            alert("Không tìm thấy thông tin chi tiết lỗi.");
        }
    } catch (error) {
        console.error("Load NCR detail failed:", error);
        alert("Lỗi khi tải chi tiết NCR.");
    } finally {
        setIsDetailLoading(false);
    }
  };

  const filteredNcrs = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    return ncrs.filter(n => 
        String(n.id || '').toLowerCase().includes(term) || 
        String(n.issueDescription || '').toLowerCase().includes(term) ||
        (n.responsiblePerson && String(n.responsiblePerson).toLowerCase().includes(term)) ||
        String(n.inspection_id || '').toLowerCase().includes(term)
    );
  }, [ncrs, searchTerm]);

  const getSeverityStyle = (severity: string) => {
    switch (severity?.toUpperCase()) {
        case 'CRITICAL': return 'bg-red-600 text-white border-red-700';
        case 'MAJOR': return 'bg-orange-100 text-orange-700 border-orange-200';
        case 'MINOR': return 'bg-blue-50 text-blue-700 border-blue-100';
        default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status?.toUpperCase()) {
        case 'CLOSED': return 'bg-green-50 text-green-700 border-green-200';
        case 'IN_PROGRESS': return 'bg-blue-50 text-blue-700 border-blue-200';
        case 'OPEN': return 'bg-red-50 text-red-700 border-red-200';
        default: return 'bg-orange-50 text-orange-700 border-orange-200';
    }
  };

  if (selectedNcr) {
      return (
          <NCRDetail 
            ncr={selectedNcr} 
            user={currentUser} 
            onBack={() => setSelectedNcr(null)} 
            onViewInspection={onSelectNcr}
            onUpdate={loadNcrs}
          />
      );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
      {/* Detail Loader Overlay */}
      {isDetailLoading && (
        <div className="absolute inset-0 z-[200] bg-slate-900/20 backdrop-blur-[2px] flex flex-col items-center justify-center">
            <div className="bg-white p-6 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-200">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Đang tải chi tiết...</p>
            </div>
        </div>
      )}

      {/* Optimized Unified Toolbar (Single Row) */}
      <div className="bg-white border-b border-slate-200 shadow-sm shrink-0 z-40 sticky top-0 px-3 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-2">
              <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" placeholder="Mã, lỗi, người phụ trách..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-blue-100/50 transition-all shadow-inner placeholder:text-slate-400"
                  />
                  {searchTerm && (
                      <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-600 transition-colors">
                          <X className="w-4 h-4" />
                      </button>
                  )}
              </div>
              <div className="relative shrink-0 min-w-[140px] md:min-w-[180px]">
                  <select 
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as any)}
                    className="w-full pl-3 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-tighter outline-none cursor-pointer hover:border-blue-300 transition-all shadow-sm appearance-none"
                  >
                      <option value="ALL">TẤT CẢ TRẠNG THÁI</option>
                      <option value="OPEN">MỚI (OPEN)</option>
                      <option value="IN_PROGRESS">ĐANG XỬ LÝ</option>
                      <option value="CLOSED">ĐÃ ĐÓNG (CLOSED)</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
          </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2 md:p-4 no-scrollbar">
          {isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                  <p className="font-black uppercase tracking-widest text-[9px]">Đang tải danh sách lỗi...</p>
              </div>
          ) : filteredNcrs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-20 text-slate-300 space-y-4">
                  <div className="p-12 bg-white rounded-[3rem] border-2 border-dashed border-slate-200 shadow-inner flex flex-col items-center">
                      <CheckCircle2 className="w-16 h-16 opacity-10 mb-4" />
                      <p className="font-black uppercase tracking-[0.2em] text-[10px] text-slate-400">Không có bản ghi NCR nào</p>
                  </div>
              </div>
          ) : (
              <div className="max-w-7xl mx-auto pb-20">
                  {/* UNIFIED TABLE VIEW (Desktop, Tablet, and Mobile Row List) */}
                  <div className="bg-white rounded-2xl md:rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                      <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-black uppercase tracking-widest text-[9px] md:text-[10px] sticky top-0 z-10">
                              <tr>
                                  <th className="px-4 md:px-6 py-3 md:py-4">Thông tin NCR</th>
                                  <th className="px-4 md:px-6 py-3 md:py-4 hidden sm:table-cell">Mức độ</th>
                                  <th className="px-4 md:px-6 py-3 md:py-4 hidden lg:table-cell">Người phụ trách</th>
                                  <th className="px-4 md:px-6 py-3 md:py-4 hidden md:table-cell">Hạn xử lý</th>
                                  <th className="px-4 md:px-6 py-3 md:py-4 text-right">Trạng thái</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {filteredNcrs.map((ncr) => (
                                  <tr 
                                      key={ncr.id} 
                                      onClick={() => handleSelectNcrItem(ncr.id)}
                                      className="hover:bg-blue-50/30 transition-all cursor-pointer group"
                                  >
                                      <td className="px-4 md:px-6 py-4 md:py-5">
                                          <div className="flex flex-col gap-1">
                                              <div className="flex items-center gap-2">
                                                  <span className="font-black text-slate-900 text-xs tracking-tight uppercase">{ncr.id}</span>
                                                  <span className={`sm:hidden px-1.5 py-0.5 rounded text-[7px] font-black uppercase border ${getSeverityStyle(ncr.severity || 'MINOR')}`}>
                                                      {ncr.severity || 'MIN'}
                                                  </span>
                                              </div>
                                              <p className="text-[10px] md:text-xs font-bold text-slate-600 leading-snug italic line-clamp-1">
                                                  "{ncr.issueDescription}"
                                              </p>
                                              <div className="flex items-center gap-2 mt-0.5 md:hidden">
                                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Deadline: {ncr.deadline || '---'}</span>
                                              </div>
                                          </div>
                                      </td>
                                      <td className="px-4 md:px-6 py-4 md:py-5 hidden sm:table-cell">
                                          <span className={`px-2 py-1 rounded text-[9px] font-black uppercase border shadow-sm ${getSeverityStyle(ncr.severity || 'MINOR')}`}>
                                              {ncr.severity || 'MINOR'}
                                          </span>
                                      </td>
                                      <td className="px-4 md:px-6 py-4 md:py-5 hidden lg:table-cell">
                                          <div className="flex items-center gap-2">
                                              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                                  <UserIcon className="w-3 h-3 text-slate-400" />
                                              </div>
                                              <span className="text-[11px] font-black text-slate-600 uppercase truncate max-w-[120px]">
                                                  {ncr.responsiblePerson || '---'}
                                              </span>
                                          </div>
                                      </td>
                                      <td className="px-4 md:px-6 py-4 md:py-5 hidden md:table-cell">
                                          <span className={`text-[10px] font-black font-mono ${ncr.deadline && new Date(ncr.deadline) < new Date() && ncr.status !== 'CLOSED' ? 'text-red-600' : 'text-slate-500'}`}>
                                              {ncr.deadline || '---'}
                                          </span>
                                      </td>
                                      <td className="px-4 md:px-6 py-4 md:py-5 text-right">
                                          <div className="flex items-center justify-end gap-2">
                                              <span className={`px-2 py-1 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-tighter border shadow-sm ${getStatusStyle(ncr.status)}`}>
                                                  {ncr.status}
                                              </span>
                                              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}
      </div>

      {/* Pagination Summary Footer */}
      <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-[0_-5px_15px_rgba(0,0,0,0.02)] hidden md:flex">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Hiển thị {filteredNcrs.length} bản ghi NCR
          </p>
          <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest">
              <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span className="text-slate-500">Mới: {ncrs.filter(n => n.status !== 'CLOSED').length}</span>
              </div>
              <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-slate-500">Đã đóng: {ncrs.filter(n => n.status === 'CLOSED').length}</span>
              </div>
          </div>
      </div>
    </div>
  );
};