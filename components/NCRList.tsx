
import React, { useState, useEffect, useMemo } from 'react';
import { NCR, User } from '../types';
import { fetchNcrs } from '../services/apiService';
import { 
    AlertTriangle, Search, Filter, Clock, CheckCircle2, 
    ArrowRight, Loader2, Calendar, User as UserIcon, 
    FileText, ChevronRight, MoreHorizontal, ShieldAlert,
    Hash, UserCheck, AlertCircle, ExternalLink
} from 'lucide-react';
import { NCRDetail } from './NCRDetail';

interface NCRListProps {
  currentUser: User;
  onSelectNcr: (inspectionId: string) => void;
}

export const NCRList: React.FC<NCRListProps> = ({ currentUser, onSelectNcr }) => {
  const [ncrs, setNcrs] = useState<NCR[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header & ToolBar */}
      <div className="bg-white p-4 md:p-6 border-b border-slate-200 shadow-sm shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                  <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                      <ShieldAlert className="w-8 h-8 text-red-600" />
                      QUẢN LÝ NCR
                  </h1>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Non-Conformance Reports • ISO 9001:2015</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                  <div className="relative group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500" />
                      <input 
                        type="text" placeholder="Tìm theo mã, mô tả, nhân sự..." 
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
                      <option value="ALL">Tất cả trạng thái</option>
                      <option value="OPEN">Mới (OPEN)</option>
                      <option value="IN_PROGRESS">Đang xử lý</option>
                      <option value="CLOSED">Đã đóng (CLOSED)</option>
                  </select>
              </div>
          </div>
      </div>

      {/* List Content - Table Format */}
      <div className="flex-1 overflow-auto p-4 md:p-6 no-scrollbar">
          {isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
                  <p className="font-black uppercase tracking-widest text-xs">Đang tải danh sách lỗi...</p>
              </div>
          ) : filteredNcrs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                  <div className="p-10 bg-white rounded-[3rem] border-2 border-dashed border-slate-200 shadow-inner">
                      <CheckCircle2 className="w-20 h-20 opacity-10 mx-auto" />
                      <p className="font-black uppercase tracking-[0.2em] text-sm mt-4">Không tìm thấy bản ghi NCR</p>
                  </div>
              </div>
          ) : (
              <div className="max-w-7xl mx-auto bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="overflow-x-auto overflow-y-hidden">
                      <table className="w-full text-left border-collapse min-w-[1000px]">
                          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-black uppercase tracking-widest text-[10px]">
                              <tr>
                                  <th className="px-6 py-4 w-40">Mã NCR</th>
                                  <th className="px-6 py-4 w-44">Phiếu QC Gốc</th>
                                  <th className="px-6 py-4">Mô tả lỗi không phù hợp</th>
                                  <th className="px-6 py-4 w-40">Người phụ trách</th>
                                  <th className="px-6 py-4 w-32 text-center">Hạn xử lý</th>
                                  <th className="px-6 py-4 w-32 text-center">Mức độ</th>
                                  <th className="px-6 py-4 w-32 text-center">Trạng thái</th>
                                  <th className="px-6 py-4 w-16 text-center"></th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {filteredNcrs.map((ncr) => (
                                  <tr 
                                      key={ncr.id} 
                                      onClick={() => setSelectedNcr(ncr)}
                                      className="hover:bg-blue-50/40 transition-colors cursor-pointer group animate-in fade-in duration-300"
                                  >
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-3">
                                              <div className="p-2 bg-red-50 text-red-600 rounded-lg group-hover:bg-red-600 group-hover:text-white transition-all">
                                                  <AlertTriangle className="w-4 h-4" />
                                              </div>
                                              <span className="font-black text-slate-900 text-xs tracking-tight">{ncr.id}</span>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4" onClick={(e) => { e.stopPropagation(); if (ncr.inspection_id) onSelectNcr(ncr.inspection_id); }}>
                                          <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-100 w-fit hover:bg-blue-600 hover:text-white transition-all">
                                              <FileText className="w-3 h-3" />
                                              {ncr.inspection_id}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <p className="text-xs font-bold text-slate-700 leading-relaxed line-clamp-2 italic max-w-md">
                                              "{ncr.issueDescription}"
                                          </p>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-2">
                                              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                                  <UserIcon className="w-3 h-3 text-slate-400" />
                                              </div>
                                              <span className="text-[10px] font-black uppercase text-slate-600 truncate max-w-[120px]">
                                                  {ncr.responsiblePerson || '---'}
                                              </span>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <div className="flex flex-col items-center">
                                              <span className="text-[10px] font-bold text-slate-500 font-mono">{ncr.deadline || '---'}</span>
                                              {ncr.deadline && new Date(ncr.deadline) < new Date() && ncr.status !== 'CLOSED' && (
                                                  <span className="text-[8px] font-black text-red-600 uppercase tracking-tighter mt-0.5">Quá hạn</span>
                                              )}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border shadow-sm ${getSeverityStyle(ncr.severity || 'MINOR')}`}>
                                              {ncr.severity || 'MINOR'}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border shadow-sm ${getStatusStyle(ncr.status)}`}>
                                              {ncr.status}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <div className="p-2 text-slate-300 group-hover:text-blue-600 transition-colors group-hover:translate-x-1 transition-transform">
                                              <ArrowRight className="w-5 h-5" />
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                  {/* Pagination/Summary Footer */}
                  <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Hiển thị {filteredNcrs.length} bản ghi lỗi không phù hợp (Click dòng để review)
                      </p>
                      <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
                          <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-red-500"></div>
                              <span className="text-slate-500">Open: {ncrs.filter(n => n.status !== 'CLOSED').length}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                              <span className="text-slate-500">Closed: {ncrs.filter(n => n.status === 'CLOSED').length}</span>
                          </div>
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};
