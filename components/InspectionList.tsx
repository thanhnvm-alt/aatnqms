
import React, { useState, useMemo } from 'react';
import { Inspection, InspectionStatus, CheckStatus } from '../types';
import { 
  Search, RefreshCw, FolderOpen, Clock, Tag, 
  UserCheck, Loader2, X, ChevronDown, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle, SlidersHorizontal, Box, FileText,
  CheckSquare, XCircle, AlertTriangle
} from 'lucide-react';

interface InspectionListProps {
  inspections: Inspection[];
  onSelect: (id: string) => void;
  userRole?: string;
  selectedModule?: string;
  onModuleChange?: (module: string) => void;
  onRefresh?: () => void;
  currentUserName?: string;
  isLoading?: boolean;
}

export const InspectionList: React.FC<InspectionListProps> = ({ 
  inspections, onSelect, userRole, selectedModule, onModuleChange, 
  onRefresh, currentUserName, isLoading
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  // Removed page state as we want to show all
  // const [currentPage, setCurrentPage] = useState(1);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const filteredInspections = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    return inspections.filter(item => {
      if (!item) return false;
      const matchesSearch = !term || (
        (item.ma_ct || '').toLowerCase().includes(term) ||
        (item.ten_ct || '').toLowerCase().includes(term) ||
        (item.ten_hang_muc || '').toLowerCase().includes(term) ||
        (item.inspectorName || '').toLowerCase().includes(term) ||
        (item.ma_nha_may || '').toLowerCase().includes(term)
      );
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [inspections, searchTerm, statusFilter]);

  const projectsData = useMemo(() => {
    const projects: Record<string, { 
      ten_ct: string, 
      factories: Record<string, Inspection[]>,
      stats: { total: number, pass: number, ncr: number }
    }> = {};

    filteredInspections.forEach(item => {
      const pKey = item.ma_ct || 'DÙNG CHUNG';
      if (!projects[pKey]) {
        projects[pKey] = { 
          ten_ct: item.ten_ct || 'Dự án khác', 
          factories: {},
          stats: { total: 0, pass: 0, ncr: 0 }
        };
      }
      
      const fKey = item.ma_nha_may || 'SITE';
      if (!projects[pKey].factories[fKey]) projects[pKey].factories[fKey] = [];
      projects[pKey].factories[fKey].push(item);
      
      projects[pKey].stats.total++;
      
      // Determine if it counts as NCR or Pass for stats
      const hasNCR = item.items?.some(i => i.status === CheckStatus.FAIL) || item.status === InspectionStatus.FLAGGED;
      
      if (hasNCR) {
        projects[pKey].stats.ncr++;
      } else if (item.status === InspectionStatus.APPROVED || item.status === InspectionStatus.COMPLETED) {
        projects[pKey].stats.pass++;
      }
    });
    return projects;
  }, [filteredInspections]);

  // Sort projects but no slicing (no pagination)
  const sortedProjectKeys = Object.keys(projectsData).sort((a, b) => projectsData[b].stats.total - projectsData[a].stats.total);

  const toggleProject = (key: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const getInspectionDisplayInfo = (item: Inspection) => {
      const total = item.inspectedQuantity || 0;
      const passRate = total > 0 ? ((item.passedQuantity || 0) / total * 100).toFixed(0) : '0';
      const failRate = total > 0 ? ((item.failedQuantity || 0) / total * 100).toFixed(0) : '0';
      
      const hasNCR = item.items?.some(i => i.status === CheckStatus.FAIL) || item.status === InspectionStatus.FLAGGED;
      const displayStatus = hasNCR ? InspectionStatus.FLAGGED : item.status;
      
      return { passRate, failRate, displayStatus, hasNCR };
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 no-scroll-x relative">
      {/* Header Toolbar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 px-3 py-3 shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" placeholder="Mã CT, Sản phẩm, QC..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-blue-100/50 transition-all shadow-inner"
              />
              {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400"><X className="w-3.5 h-3.5" /></button>}
            </div>
            <button onClick={() => setShowFiltersPanel(!showFiltersPanel)} className={`p-2 rounded-xl border transition-all ${showFiltersPanel ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}><SlidersHorizontal className="w-4 h-4" /></button>
            <button onClick={onRefresh} className="p-2 text-slate-500 bg-slate-100 rounded-xl active:scale-90 transition-all"><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /></button>
          </div>
          {showFiltersPanel && (
            <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 animate-in slide-in-from-top-2 duration-300">
                <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Bộ lọc trạng thái</label>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-bold outline-none">
                        <option value="ALL">Tất cả trạng thái</option>
                        <option value={InspectionStatus.APPROVED}>APPROVED</option>
                        <option value={InspectionStatus.FLAGGED}>FLAGGED</option>
                        <option value={InspectionStatus.COMPLETED}>COMPLETED</option>
                        <option value={InspectionStatus.DRAFT}>DRAFT</option>
                    </select>
                </div>
            </div>
          )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 no-scrollbar pb-24">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400"><Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" /><p className="font-black uppercase tracking-widest text-[8px]">Đang tải dữ liệu...</p></div>
        ) : sortedProjectKeys.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-[2rem] border border-dashed border-slate-200 flex flex-col items-center justify-center"><Box className="w-10 h-10 text-slate-200 mb-3" /><p className="font-black uppercase text-slate-400 text-[9px] tracking-widest">Không có báo cáo nào</p></div>
        ) : (
          <div className="space-y-4">
            {sortedProjectKeys.map(maCt => {
              const project = projectsData[maCt];
              const isExpanded = expandedProjects.has(maCt);
              return (
                <div key={maCt} className="space-y-3">
                  <div 
                    onClick={() => toggleProject(maCt)} 
                    className={`bg-white rounded-[1.5rem] border transition-all active:scale-[0.99] shadow-sm ${isExpanded ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200'}`}
                  >
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`p-2.5 rounded-xl shrink-0 ${isExpanded ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}>
                          <FolderOpen className="w-4 h-4" />
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="font-black text-xs text-slate-900 uppercase truncate leading-none mb-1">{maCt}</h3>
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight truncate">{project.ten_ct}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100" title="Tổng phiếu">
                           <span className="text-[8px] font-black text-slate-600">{project.stats.total}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded-lg border border-green-100" title="Phiếu đạt">
                           <span className="text-[8px] font-black text-green-600">{project.stats.pass}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-red-50 px-2 py-1 rounded-lg border border-red-100" title="Phiếu lỗi (NCR)">
                           <span className="text-[8px] font-black text-red-600">{project.stats.ncr}</span>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform ${isExpanded ? 'rotate-180 text-blue-600' : ''} ml-1`} />
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="ml-3 space-y-2 animate-in slide-in-from-top-2 duration-300">
                      {Object.entries(project.factories).map(([maNm, items]) => (
                        <div key={maNm} className="space-y-2">
                           <div className="flex items-center gap-2 px-2">
                              <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest">HẠNG MỤC: <span className="text-slate-800">{maNm}</span></h4>
                              <div className="h-px bg-slate-200 flex-1"></div>
                           </div>
                           <div className="grid grid-cols-1 gap-2">
                              {(items as Inspection[]).map(item => {
                                const { passRate, failRate, displayStatus, hasNCR } = getInspectionDisplayInfo(item);
                                return (
                                <div key={item.id} onClick={() => onSelect(item.id)} className="bg-white p-4 rounded-2xl border border-slate-200 active:bg-blue-50 transition-all flex items-center justify-between shadow-sm group">
                                  <div className="flex-1 min-w-0 pr-3">
                                    <h4 className="font-black text-slate-800 text-[11px] truncate uppercase tracking-tight mb-2 leading-tight">
                                        {item.ten_hang_muc}
                                    </h4>
                                    <div className="flex flex-wrap items-center gap-2">
                                       <span className={`px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest border ${
                                           displayStatus === InspectionStatus.APPROVED ? 'bg-green-600 text-white border-green-600' : 
                                           displayStatus === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-700 border-red-200' : 
                                           'bg-orange-50 text-orange-700 border-orange-200'
                                       }`}>
                                           {displayStatus}
                                       </span>
                                       
                                       {/* Type & Stage */}
                                       <div className="flex items-center gap-1 text-[8px] font-black text-indigo-600 uppercase bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                           <FileText className="w-2.5 h-2.5" /> 
                                           {item.type} {item.inspectionStage ? `- ${item.inspectionStage}` : ''}
                                       </div>

                                       {/* Date */}
                                       <div className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                                           <Clock className="w-3 h-3 text-slate-300"/> {item.date}
                                       </div>
                                       
                                       {/* Pass/Fail Rate */}
                                       <div className="flex items-center gap-1 text-[8px] font-black">
                                            <span className="text-green-600">{passRate}%</span>
                                            <span className="text-slate-300">-</span>
                                            <span className="text-red-600">{failRate}%</span>
                                       </div>
                                    </div>
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-slate-300 group-active:text-blue-600 transition-colors" />
                                </div>
                              )})}
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        <div className="text-center py-6 text-[9px] font-black text-slate-300 uppercase tracking-widest">
            {sortedProjectKeys.length > 0 ? 'Đã tải toàn bộ dự án' : ''}
        </div>
      </div>
    </div>
  );
};
