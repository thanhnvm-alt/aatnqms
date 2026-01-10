
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, ModuleId } from '../types';
import { ALL_MODULES } from '../constants';
import { QRScannerModal } from './QRScannerModal';
import { 
  Search, RefreshCw, QrCode, FolderOpen, Clock, Tag, 
  UserCheck, Briefcase, Loader2, Calendar, FileText, Camera,
  Factory, SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight, X,
  CheckCircle2, AlertCircle, FileEdit, Filter, Building2, Layers,
  CheckSquare, XCircle, AlertTriangle, Box
} from 'lucide-react';
import { fetchInspectionById, saveInspectionToSheet } from '../services/apiService';

interface InspectionListProps {
  inspections: Inspection[];
  onSelect: (id: string) => void;
  userRole?: string;
  selectedModule?: string;
  onModuleChange?: (module: string) => void;
  onImportInspections?: (inspections: Inspection[]) => Promise<void>;
  onRefresh?: () => void;
  currentUserName?: string;
  isLoading?: boolean;
}

const PROJECTS_PER_PAGE = 10;

export const InspectionList: React.FC<InspectionListProps> = ({ 
  inspections, onSelect, userRole, selectedModule, onModuleChange, 
  onRefresh, currentUserName, isLoading
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pending Filter States
  const [status, setStatus] = useState<string>('ALL');
  const [type, setType] = useState<string>('ALL');
  const [inspector, setInspector] = useState<string>('ALL');
  const [workshop, setWorkshop] = useState<string>('ALL');
  const [datePreset, setDatePreset] = useState<string>('ALL');

  // Applied Filter States
  const [appliedFilters, setAppliedFilters] = useState({
    status: 'ALL',
    type: 'ALL',
    inspector: 'ALL',
    workshop: 'ALL',
    datePreset: 'ALL'
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Derive unique values for dropdowns
  const inspectorsList = useMemo(() => {
    const unique = new Set(inspections.filter(i => i?.inspectorName).map(i => i.inspectorName));
    return Array.from(unique).sort();
  }, [inspections]);

  const workshopsList = useMemo(() => {
    const unique = new Set(inspections.filter(i => i?.workshop).map(i => i.workshop!));
    return Array.from(unique).sort();
  }, [inspections]);

  const handleApplyFilters = () => {
    setAppliedFilters({ status, type, inspector, workshop, datePreset });
    setCurrentPage(1);
    setShowFiltersPanel(false);
    if (onModuleChange) onModuleChange(type);
  };

  const clearFilters = () => {
    setStatus('ALL'); setType('ALL'); setInspector('ALL'); setWorkshop('ALL'); setDatePreset('ALL');
    setAppliedFilters({ status: 'ALL', type: 'ALL', inspector: 'ALL', workshop: 'ALL', datePreset: 'ALL' });
    setSearchTerm('');
    setCurrentPage(1);
    if (onModuleChange) onModuleChange('ALL');
  };

  const filteredInspections = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const term = (searchTerm || '').toLowerCase();
    
    return inspections.filter(item => {
      if (!item) return false;
      if (term && !(
        (item.ma_ct || '').toLowerCase().includes(term) ||
        (item.ten_ct || '').toLowerCase().includes(term) ||
        (item.ma_nha_may || '').toLowerCase().includes(term) ||
        (item.ten_hang_muc || '').toLowerCase().includes(term) ||
        (item.inspectorName || '').toLowerCase().includes(term)
      )) return false;

      if (appliedFilters.status !== 'ALL' && item.status !== appliedFilters.status) return false;
      if (appliedFilters.type !== 'ALL' && (item.type || '').toUpperCase() !== appliedFilters.type.toUpperCase()) return false;
      if (appliedFilters.inspector !== 'ALL' && item.inspectorName !== appliedFilters.inspector) return false;
      if (appliedFilters.workshop !== 'ALL' && item.workshop !== appliedFilters.workshop) return false;

      if (appliedFilters.datePreset !== 'ALL') {
        const itemDate = new Date(item.date || '');
        if (appliedFilters.datePreset === 'Today' && item.date !== todayStr) return false;
        if (appliedFilters.datePreset === 'Last 7 days') {
          const limit = new Date(); limit.setDate(now.getDate() - 7);
          if (itemDate < limit) return false;
        }
      }
      return true;
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [inspections, searchTerm, appliedFilters]);

  // LOGIC: Nested Grouping (ma_ct -> ma_nha_may) with Stats
  const projectsData = useMemo(() => {
    const projects: Record<string, { 
      ten_ct: string, 
      factories: Record<string, Inspection[]>,
      stats: { total: number, pass: number, fail: number, cond: number }
    }> = {};

    filteredInspections.forEach(item => {
      const pKey = item.ma_ct || 'DÙNG CHUNG';
      if (!projects[pKey]) {
        projects[pKey] = { 
          ten_ct: item.ten_ct || 'Chưa cập nhật tên dự án', 
          factories: {},
          stats: { total: 0, pass: 0, fail: 0, cond: 0 }
        };
      }
      
      const fKey = item.ma_nha_may || 'SITE';
      if (!projects[pKey].factories[fKey]) {
        projects[pKey].factories[fKey] = [];
      }
      
      projects[pKey].factories[fKey].push(item);
      
      // Update Stats for Project
      projects[pKey].stats.total++;
      if (item.status === InspectionStatus.APPROVED || item.status === InspectionStatus.COMPLETED) {
        projects[pKey].stats.pass++;
      } else if (item.status === InspectionStatus.FLAGGED) {
        projects[pKey].stats.fail++;
      }
      
      // Check if any item in this inspection is "Conditional"
      const hasConditional = item.items?.some(it => it.status === CheckStatus.CONDITIONAL);
      if (hasConditional) {
        projects[pKey].stats.cond++;
      }
    });
    return projects;
  }, [filteredInspections]);

  const sortedProjectKeys = useMemo(() => Object.keys(projectsData).sort((a, b) => projectsData[b].stats.total - projectsData[a].stats.total), [projectsData]);
  const pagedProjectKeys = useMemo(() => sortedProjectKeys.slice((currentPage - 1) * PROJECTS_PER_PAGE, currentPage * PROJECTS_PER_PAGE), [sortedProjectKeys, currentPage]);

  const toggleProject = (key: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isFilterActive = appliedFilters.status !== 'ALL' || appliedFilters.type !== 'ALL' || appliedFilters.inspector !== 'ALL' || appliedFilters.workshop !== 'ALL' || appliedFilters.datePreset !== 'ALL';

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
      {/* Header Toolbar */}
      <div className="bg-white border-b border-slate-200 z-40 sticky top-0 shadow-sm px-4 py-3 shrink-0">
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" placeholder="Tìm Mã CT, Tên Dự Án, QC..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-10 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-blue-100/50 transition-all shadow-inner"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button onClick={() => setShowFiltersPanel(!showFiltersPanel)} className={`p-2.5 rounded-xl border transition-all ${showFiltersPanel || isFilterActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}><SlidersHorizontal className="w-5 h-5" /></button>
            <button onClick={onRefresh} className="p-2.5 text-slate-500 bg-slate-100 rounded-xl hover:text-blue-600 transition-all shadow-sm"><RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} /></button>
          </div>
          {showFiltersPanel && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 animate-in slide-in-from-top duration-300 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Trạng thái</label><select value={status} onChange={e => setStatus(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"><option value="ALL">Tất cả</option><option value={InspectionStatus.APPROVED}>APPROVED</option><option value={InspectionStatus.FLAGGED}>FLAGGED</option><option value={InspectionStatus.COMPLETED}>COMPLETED</option></select></div>
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Loại phiếu</label><select value={type} onChange={e => setType(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"><option value="ALL">Tất cả</option><option value="IQC">IQC</option><option value="PQC">PQC</option><option value="FQC">FQC</option><option value="SITE">SITE</option></select></div>
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">QC/QA</label><select value={inspector} onChange={e => setInspector(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"><option value="ALL">Tất cả</option>{inspectorsList.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                <div className="col-span-1 sm:col-span-2 lg:col-span-2 flex items-end gap-2"><button onClick={handleApplyFilters} className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-xs font-black uppercase tracking-widest">Lọc dữ liệu</button><button onClick={clearFilters} className="px-4 py-2 text-slate-500 text-xs font-bold">Xóa bộ lọc</button></div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar bg-slate-50">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400"><Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" /><p className="font-black uppercase tracking-widest text-[10px]">Đang tải dữ liệu...</p></div>
        ) : pagedProjectKeys.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-[2rem] border border-dashed border-slate-200 mx-1 flex flex-col items-center justify-center"><Briefcase className="w-12 h-12 text-slate-300 mb-4 opacity-50" /><p className="font-black uppercase text-slate-400 text-xs tracking-widest">Không có báo cáo nào</p></div>
        ) : (
          <div className="max-w-7xl mx-auto space-y-8 pb-20">
            {pagedProjectKeys.map(maCt => {
              const project = projectsData[maCt];
              const isExpanded = expandedProjects.has(maCt);
              
              return (
                <div key={maCt} className="space-y-4">
                  {/* PROJECT HEADER (LEVEL 1) */}
                  <div 
                    onClick={() => toggleProject(maCt)} 
                    className={`bg-white rounded-[2rem] border transition-all cursor-pointer shadow-sm hover:shadow-md ${isExpanded ? 'border-blue-300 ring-4 ring-blue-50' : 'border-slate-200'}`}
                  >
                    <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`p-4 rounded-[1.5rem] shrink-0 ${isExpanded ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
                          <FolderOpen className="w-6 h-6" />
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="font-black text-base text-slate-900 uppercase tracking-tighter truncate leading-tight">{maCt}</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">{project.ten_ct}</p>
                        </div>
                      </div>
                      
                      {/* Thống kê Dự án */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                           <FileText className="w-3 h-3 text-slate-400" />
                           <span className="text-[10px] font-black text-slate-600">{project.stats.total} PHIẾU</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-green-50 px-3 py-1.5 rounded-xl border border-green-100">
                           <CheckSquare className="w-3 h-3 text-green-600" />
                           <span className="text-[10px] font-black text-green-700">{project.stats.pass} ĐẠT</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-xl border border-red-100">
                           <XCircle className="w-3 h-3 text-red-600" />
                           <span className="text-[10px] font-black text-red-700">{project.stats.fail} HỎNG</span>
                        </div>
                        {project.stats.cond > 0 && (
                          <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-100">
                             <AlertTriangle className="w-3 h-3 text-orange-600" />
                             <span className="text-[10px] font-black text-orange-700">{project.stats.cond} CÓ ĐIỀU KIỆN</span>
                          </div>
                        )}
                        <ChevronDown className={`w-6 h-6 text-slate-300 ml-2 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                      </div>
                    </div>
                  </div>

                  {/* FACTORY GROUPS (LEVEL 2) */}
                  {isExpanded && (
                    <div className="ml-4 md:ml-10 space-y-6 animate-in slide-in-from-top-4 duration-300">
                      {Object.entries(project.factories).map(([maNm, items]) => (
                        <div key={maNm} className="space-y-3">
                           <div className="flex items-center gap-3 px-2">
                              <Box className="w-4 h-4 text-blue-500" />
                              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">MÃ HẠNG MỤC: <span className="text-slate-800">{maNm}</span></h4>
                              <div className="h-px bg-slate-200 flex-1"></div>
                              <span className="text-[9px] font-bold text-slate-400">{items.length} PHIẾU</span>
                           </div>
                           
                           <div className="grid grid-cols-1 gap-3">
                              {items.map(item => (
                                <div key={item.id} onClick={() => onSelect(item.id)} className="bg-white p-4 rounded-2xl border border-slate-200 active:bg-blue-50 transition-all cursor-pointer flex items-center justify-between group shadow-sm hover:border-blue-200">
                                  <div className="flex-1 min-w-0 pr-4">
                                    <h4 className="font-black text-slate-800 text-sm truncate uppercase tracking-tight mb-2 leading-tight">
                                        {item.ten_hang_muc || 'Hạng mục QC'}
                                    </h4>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                                       <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border shadow-sm ${
                                           item.status === InspectionStatus.APPROVED ? 'bg-green-50 text-green-700 border-green-200' : 
                                           item.status === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-700 border-red-200' : 
                                           'bg-orange-50 text-orange-700 border-orange-200'
                                       }`}>
                                           {item.status}
                                       </div>
                                       <div className="flex items-center gap-1 text-[9px] font-black text-indigo-600 uppercase tracking-tighter bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                           <FileText className="w-3 h-3" /> {item.type || 'QC'} {item.inspectionStage ? `- ${item.inspectionStage}` : ''}
                                       </div>
                                       <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                                           <Clock className="w-3.5 h-3.5 text-slate-300"/> {item.date}
                                       </div>
                                       <div className="text-[10px] font-black text-blue-500 uppercase flex items-center gap-1.5">
                                           <UserCheck className="w-3.5 h-3.5" />
                                           {item.inspectorName}
                                       </div>
                                    </div>
                                  </div>
                                  <div className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-300 group-hover:text-blue-600 group-hover:border-blue-200 group-hover:bg-blue-50 transition-all">
                                     <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                                  </div>
                                </div>
                              ))}
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

        {sortedProjectKeys.length > PROJECTS_PER_PAGE && (
          <div className="flex justify-center gap-4 py-8">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl shadow-sm disabled:opacity-30 active:scale-90 transition-all"><ChevronLeft className="w-6 h-6" /></button>
              <div className="flex items-center px-8 bg-white border border-slate-200 rounded-2xl text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Trang {currentPage} / {Math.ceil(sortedProjectKeys.length / PROJECTS_PER_PAGE)}</div>
              <button disabled={currentPage >= Math.ceil(sortedProjectKeys.length / PROJECTS_PER_PAGE)} onClick={() => setCurrentPage(p => p + 1)} className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl shadow-sm disabled:opacity-30 active:scale-90 transition-all"><ChevronRight className="w-6 h-6" /></button>
          </div>
        )}
      </div>
    </div>
  );
};
