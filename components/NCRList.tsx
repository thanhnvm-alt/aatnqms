import React, { useState, useEffect, useMemo } from 'react';
import { NCR, User } from '../types';
import { fetchNcrs, fetchNcrById } from '../services/apiService';
import { 
    AlertTriangle, Search, Clock, CheckCircle2, 
    ArrowRight, Loader2, Calendar, User as UserIcon, 
    FileText, ChevronRight, ShieldAlert,
    Hash, AlertCircle, Maximize2
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
        setNcrs(result);
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

      {/* Fixed Header Content (The GlobalHeader already provides the title, this is local toolbar) */}
      <div className="bg-white border-b border-slate-200 shadow-sm shrink-0 z-40 sticky top-0 px-4 py-4">
          <div className="max-w-7xl mx-auto space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" placeholder="Tìm theo mã, lỗi, người phụ trách..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-blue-100/50 transition-all shadow-inner"
                      />
                  </div>
                  <select 
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as any)}
                    className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-tight outline-none cursor-pointer hover:border-blue-300 transition-all shadow-sm"
                  >
                      <option value="ALL">Tất cả trạng thái</option>
                      <option value="OPEN">Mới (OPEN)</option>
                      <option value="IN_PROGRESS">Đang xử lý</option>
                      <option value="CLOSED">Đã đóng (CLOSED)</option>
                  </select>
              </div>
          </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
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
                  {/* DESKTOP TABLE VIEW (>= 1024px) */}
                  <div className="hidden lg:block bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                      <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-black uppercase tracking-widest text-[10px] sticky top-0 z-10">
                              <tr>
                                  <th className="px-6 py-4">NCR Code</th>
                                  <th className="px-6 py-4">Mô tả lỗi</th>
                                  <th className="px-6 py-4">Mức độ</th>
                                  <th className="px-6 py-4">Người phụ trách</th>
                                  <th className="px-6 py-4">Hạn xử lý</th>
                                  <th className="px-6 py-4">Trạng thái</th>
                                  <th className="px-6 py-4 text-right">Action</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {filteredNcrs.map((ncr) => (
                                  <tr 
                                      key={ncr.id} 
                                      onClick={() => handleSelectNcrItem(ncr.id)}
                                      className="hover:bg-blue-50/30 transition-all cursor-pointer group"
                                  >
                                      <td className="px-6 py-5">
                                          <div className="flex flex-col">
                                              <span className="font-black text-slate-900 text-xs tracking-tight uppercase">{ncr.id}</span>
                                              <span className="text-[9px] font-bold text-slate-400 font-mono tracking-tighter uppercase">ID: {ncr.inspection_id || 'LOCAL'}</span>
                                          </div>
                                      </td>
                                      <td className="px-6 py-5">
                                          <p className="text-xs font-bold text-slate-700 leading-relaxed italic max-w-md line-clamp-2">
                                              "{ncr.issueDescription}"
                                          </p>
                                      </td>
                                      <td className="px-6 py-5">
                                          <span className={`px-2 py-1 rounded text-[9px] font-black uppercase border shadow-sm ${getSeverityStyle(ncr.severity || 'MINOR')}`}>
                                              {ncr.severity || 'MINOR'}
                                          </span>
                                      </td>
                                      <td className="px-6 py-5">
                                          <div className="flex items-center gap-2">
                                              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                                  <UserIcon className="w-3 h-3 text-slate-400" />
                                              </div>
                                              <span className="text-[11px] font-black text-slate-600 uppercase truncate max-w-[120px]">
                                                  {ncr.responsiblePerson || '---'}
                                              </span>
                                          </div>
                                      </td>
                                      <td className="px-6 py-5">
                                          <span className={`text-[10px] font-black font-mono ${ncr.deadline && new Date(ncr.deadline) < new Date() && ncr.status !== 'CLOSED' ? 'text-red-600' : 'text-slate-500'}`}>
                                              {ncr.deadline || '---'}
                                          </span>
                                      </td>
                                      <td className="px-6 py-5">
                                          <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm ${getStatusStyle(ncr.status)}`}>
                                              {ncr.status}
                                          </span>
                                      </td>
                                      <td className="px-6 py-5 text-right">
                                          <button 
                                              className="bg-white border border-slate-200 text-blue-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tighter hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm active:scale-95 flex items-center gap-1 ml-auto"
                                          >
                                              Chi tiết <ChevronRight className="w-3 h-3" />
                                          </button>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  {/* MOBILE/TABLET CARD VIEW (< 1024px) */}
                  <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredNcrs.map((ncr) => (
                          <div 
                              key={ncr.id} 
                              onClick={() => handleSelectNcrItem(ncr.id)}
                              className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col active:scale-[0.98] transition-all hover:shadow-md hover:border-blue-300 group"
                          >
                              <div className="p-4 flex-1 space-y-3">
                                  <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-center gap-2">
                                          <div className="p-2 bg-red-50 text-red-600 rounded-lg group-hover:bg-red-600 group-hover:text-white transition-all">
                                              <AlertTriangle className="w-4 h-4" />
                                          </div>
                                          <div>
                                              <span className="font-black text-slate-900 text-xs tracking-tight block">NCR: {ncr.id}</span>
                                              <span className="text-[9px] font-bold text-slate-400 font-mono tracking-tighter uppercase">ID: {ncr.inspection_id || 'LOCAL'}</span>
                                          </div>
                                      </div>
                                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border shadow-sm ${getSeverityStyle(ncr.severity || 'MINOR')}`}>
                                          {ncr.severity || 'MINOR'}
                                      </span>
                                  </div>

                                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                      <p className="text-[11px] font-bold text-slate-700 leading-relaxed italic line-clamp-3">
                                          "{ncr.issueDescription}"
                                      </p>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3 pt-1">
                                      <div className="flex items-center gap-2">
                                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                              <UserIcon className="w-3 h-3 text-slate-400" />
                                          </div>
                                          <div className="overflow-hidden">
                                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-1">Phụ trách</p>
                                              <p className="text-[10px] font-black text-slate-600 uppercase truncate">{ncr.responsiblePerson || '---'}</p>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                          <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                              <Calendar className="w-3 h-3 text-blue-500" />
                                          </div>
                                          <div className="overflow-hidden">
                                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-1">Hạn xử lý</p>
                                              <p className={`text-[10px] font-black truncate font-mono ${ncr.deadline && new Date(ncr.deadline) < new Date() && ncr.status !== 'CLOSED' ? 'text-red-600' : 'text-slate-600'}`}>
                                                  {ncr.deadline || '---'}
                                              </p>
                                          </div>
                                      </div>
                                  </div>
                              </div>

                              <div className={`px-4 py-3 border-t flex items-center justify-between transition-colors ${ncr.status === 'CLOSED' ? 'bg-green-50/50 border-green-100' : 'bg-slate-50/50 border-slate-100'}`}>
                                  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm ${getStatusStyle(ncr.status)}`}>
                                      {ncr.status}
                                  </span>
                                  <div className="flex items-center gap-1.5 text-blue-600 text-[10px] font-black uppercase tracking-tighter hover:underline">
                                      Chi tiết <ChevronRight className="w-3.5 h-3.5" />
                                  </div>
                              </div>
                          </div>
                      ))}
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