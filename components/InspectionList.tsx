
import React, { useState, useMemo } from 'react';
import { Inspection, InspectionStatus, CheckStatus, Workshop } from '../types';
import { 
  Search, RefreshCw, FolderOpen, Clock, Tag, 
  UserCheck, Loader2, X, ChevronDown, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle, SlidersHorizontal, Box, FileText,
  CheckSquare, XCircle, AlertTriangle, Filter, Building2, Layers, User
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
  workshops?: Workshop[];
}

export const InspectionList: React.FC<InspectionListProps> = ({ 
  inspections, onSelect, userRole, selectedModule, onModuleChange, 
  onRefresh, currentUserName, isLoading, workshops
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [inspectorFilter, setInspectorFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [workshopFilter, setWorkshopFilter] = useState<string>('ALL');
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // Derive unique values for filters
  const uniqueInspectors = useMemo(() => Array.from(new Set(inspections.map(i => i.inspectorName).filter(Boolean))).sort(), [inspections]);
  const uniqueTypes = useMemo(() => Array.from(new Set(inspections.map(i => i.type).filter(Boolean))).sort(), [inspections]);
  
  // Update: Prioritize 'workshop' column, fallback to 'ma_nha_may'
  const uniqueWorkshops = useMemo(() => {
    // Get unique values from workshop column first, then ma_nha_may
    const rawValues = Array.from(new Set(inspections.map(i => i.workshop || i.ma_nha_may).filter(Boolean)));
    
    return rawValues.map(val => {
        // Try to map code to name
        const found = workshops?.find(w => w.code === val);
        return {
            code: val,
            label: found ? found.name : val // Display Name if found, otherwise show the raw value (code)
        };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [inspections, workshops]);

  const filteredInspections = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    return inspections.filter(item => {
      if (!item) return false;
      const matchesSearch = !term || (
        (item.ma_ct || '').toLowerCase().includes(term) ||
        (item.ten_ct || '').toLowerCase().includes(term) ||
        (item.ten_hang_muc || '').toLowerCase().includes(term) ||
        (item.inspectorName || '').toLowerCase().includes(term) ||
        (item.ma_nha_may || '').toLowerCase().includes(term) ||
        (item.workshop || '').toLowerCase().includes(term)
      );
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesInspector = inspectorFilter === 'ALL' || item.inspectorName === inspectorFilter;
      const matchesType = typeFilter === 'ALL' || item.type === typeFilter;
      
      // Update: Filter based on prioritized workshop value
      const itemWorkshop = item.workshop || item.ma_nha_may;
      const matchesWorkshop = workshopFilter === 'ALL' || itemWorkshop === workshopFilter;

      return matchesSearch && matchesStatus && matchesInspector && matchesType && matchesWorkshop;
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [inspections, searchTerm, statusFilter, inspectorFilter, typeFilter, workshopFilter]);

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
      
      // Update: Group by Workshop Name for clearer display
      const wsCode = item.workshop || item.ma_nha_may || 'SITE';
      const wsName = workshops?.find(w => w.code === wsCode)?.name || wsCode;
      
      const fKey = wsName;
      if (!projects[pKey].factories[fKey]) projects[pKey].factories[fKey] = [];
      projects[pKey].factories[fKey].push(item);
      
      projects[pKey].stats.total++;
      
      const hasNCR = item.items?.some(i => i.status === CheckStatus.FAIL) || item.status === InspectionStatus.FLAGGED;
      
      if (hasNCR) {
        projects[pKey].stats.ncr++;
      } else if (item.status === InspectionStatus.APPROVED || item.status === InspectionStatus.COMPLETED) {
        projects[pKey].stats.pass++;
      }
    });
    return projects;
  }, [filteredInspections, workshops]);

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

  const activeFiltersCount = [
      statusFilter !== 'ALL',
      inspectorFilter !== 'ALL',
      typeFilter !== 'ALL',
      workshopFilter !== 'ALL'
  ].filter(Boolean).length;

  const clearFilters = () => {
      setStatusFilter('ALL');
      setInspectorFilter('ALL');
      setTypeFilter('ALL');
      setWorkshopFilter('ALL');
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
            <button 
                onClick={() => setShowFiltersPanel(!showFiltersPanel)} 
                className={`p-2 rounded-xl border transition-all relative ${showFiltersPanel || activeFiltersCount > 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}
            >
                <SlidersHorizontal className="w-4 h-4" />
                {activeFiltersCount > 0 && !showFiltersPanel && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
                )}
            </button>
            <button onClick={onRefresh} className="p-2 text-slate-500 bg-slate-100 rounded-xl active:scale-90 transition-all"><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /></button>
          </div>
          
          {showFiltersPanel && (
            <div className="mt-3 p-4 bg-white rounded-2xl border border-blue-100 shadow-xl animate-in slide-in-from-top-2 duration-300 relative z-50">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                        <Filter className="w-3.5 h-3.5 text-blue-600"/> Bộ lọc nâng cao
                    </h3>
                    {activeFiltersCount > 0 && (
                        <button onClick={clearFilters} className="text-[10px] font-bold text-red-500 hover:underline flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Xóa lọc ({activeFiltersCount})
                        </button>
                    )}
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Trạng thái</label>
                        <div className="relative">
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold outline-none appearance-none focus:ring-2 focus:ring-blue-100">
                                <option value="ALL">Tất cả trạng thái</option>
                                <option value={InspectionStatus.APPROVED}>APPROVED</option>
                                <option value={InspectionStatus.FLAGGED}>FLAGGED</option>
                                <option value={InspectionStatus.COMPLETED}>COMPLETED</option>
                                <option value={InspectionStatus.DRAFT}>DRAFT</option>
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Loại phiếu</label>
                        <div className="relative">
                            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold outline-none appearance-none focus:ring-2 focus:ring-blue-100">
                                <option value="ALL">Tất cả loại</option>
                                {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <Layers className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Người tạo</label>
                        <div className="relative">
                            <select value={inspectorFilter} onChange={e => setInspectorFilter(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold outline-none appearance-none focus:ring-2 focus:ring-blue-100">
                                <option value="ALL">Tất cả QC</option>
                                {uniqueInspectors.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                            <User className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Xưởng / Nhà máy</label>
                        <div className="relative">
                            <select value={workshopFilter} onChange={e => setWorkshopFilter(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold outline-none appearance-none focus:ring-2 focus:ring-blue-100">
                                <option value="ALL">Tất cả xưởng</option>
                                {uniqueWorkshops.map(w => <option key={w.code} value={w.code}>{w.label}</option>)}
                            </select>
                            <Building2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>
          )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 no-scrollbar pb-24">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400"><Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" /><p className="font-black uppercase tracking-widest text-[8px]">Đang tải dữ liệu...</p></div>
        ) : sortedProjectKeys.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-[2rem] border border-dashed border-slate-200 flex flex-col items-center justify-center mx-2 shadow-sm">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                  <Box className="w-8 h-8 text-slate-300" />
              </div>
              <p className="font-black uppercase text-slate-400 text-[10px] tracking-widest mb-1">Không tìm thấy báo cáo</p>
              <p className="text-[9px] text-slate-300">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
              {activeFiltersCount > 0 && (
                  <button onClick={clearFilters} className="mt-4 text-blue-600 text-[10px] font-bold hover:underline">Xóa bộ lọc</button>
              )}
          </div>
        ) : (
          <div className="space-y-4">
            {sortedProjectKeys.map(maCt => {
              const project = projectsData[maCt];
              const isExpanded = expandedProjects.has(maCt);
              return (
                <div key={maCt} className="space-y-3">
                  <div 
                    onClick={() => toggleProject(maCt)} 
                    className={`bg-white rounded-[1.5rem] border transition-all active:scale-[0.99] shadow-sm cursor-pointer group ${isExpanded ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200 hover:border-blue-200'}`}
                  >
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`p-2.5 rounded-xl shrink-0 transition-colors ${isExpanded ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500'}`}>
                          <FolderOpen className="w-4 h-4" />
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="font-black text-xs text-slate-900 uppercase truncate leading-none mb-1 group-hover:text-blue-700 transition-colors">{maCt}</h3>
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight truncate">{project.ten_ct}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 min-w-[32px] justify-center" title="Tổng phiếu">
                           <span className="text-[8px] font-black text-slate-600">{project.stats.total}</span>
                        </div>
                        {project.stats.ncr > 0 && (
                            <div className="flex items-center gap-1 bg-red-50 px-2 py-1 rounded-lg border border-red-100 min-w-[32px] justify-center" title="Phiếu lỗi (NCR)">
                               <span className="text-[8px] font-black text-red-600">{project.stats.ncr}</span>
                            </div>
                        )}
                        <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''} ml-1`} />
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="ml-2 pl-2 border-l-2 border-slate-100 space-y-3 animate-in slide-in-from-top-2 duration-300">
                      {Object.entries(project.factories).map(([wsName, items]) => (
                        <div key={wsName} className="space-y-2">
                           <div className="flex items-center gap-2 px-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                              <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex-1">{wsName}</h4>
                              <span className="text-[8px] font-bold bg-slate-100 text-slate-500 px-1.5 rounded">{items.length}</span>
                           </div>
                           <div className="grid grid-cols-1 gap-2">
                              {(items as Inspection[]).map(item => {
                                const { passRate, failRate, displayStatus, hasNCR } = getInspectionDisplayInfo(item);
                                return (
                                <div key={item.id} onClick={() => onSelect(item.id)} className="bg-white p-3.5 rounded-2xl border border-slate-200 active:bg-blue-50 hover:border-blue-300 transition-all flex items-center justify-between shadow-sm group cursor-pointer relative overflow-hidden">
                                  {hasNCR && <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-bl-lg z-10"></div>}
                                  
                                  <div className="flex-1 min-w-0 pr-3">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest border ${
                                           displayStatus === InspectionStatus.APPROVED ? 'bg-green-600 text-white border-green-600' : 
                                           displayStatus === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-700 border-red-200' : 
                                           'bg-orange-50 text-orange-700 border-orange-200'
                                       }`}>
                                           {displayStatus}
                                       </span>
                                       <span className="text-[8px] font-black text-indigo-600 uppercase bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 truncate max-w-[80px]">
                                           {item.type}
                                       </span>
                                    </div>
                                    
                                    <h4 className="font-bold text-slate-800 text-[10px] truncate uppercase tracking-tight mb-2 leading-tight group-hover:text-blue-700 transition-colors">
                                        {item.ten_hang_muc}
                                    </h4>
                                    
                                    <div className="flex items-center justify-between">
                                       <div className="text-[8px] font-bold text-slate-400 flex items-center gap-1.5">
                                           <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5"/> {item.date}</span>
                                           <span className="w-px h-2 bg-slate-300"></span>
                                           <span className="flex items-center gap-1 uppercase truncate max-w-[80px]"><User className="w-2.5 h-2.5"/> {item.inspectorName}</span>
                                       </div>
                                       
                                       <div className="flex items-center gap-1 text-[8px] font-black bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                            <span className="text-green-600">{passRate}%</span>
                                            <span className="text-slate-300">/</span>
                                            <span className="text-red-600">{failRate}%</span>
                                       </div>
                                    </div>
                                  </div>
                                  <div className="p-1 rounded-full text-slate-300 group-hover:text-blue-500 group-hover:bg-blue-50 transition-all">
                                      <ChevronRight className="w-4 h-4" />
                                  </div>
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
        
        <div className="text-center py-6 text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center justify-center gap-2">
            {sortedProjectKeys.length > 0 && (
                <>
                    <div className="h-px w-8 bg-slate-200"></div>
                    <span>Đã tải toàn bộ dự án</span>
                    <div className="h-px w-8 bg-slate-200"></div>
                </>
            )}
        </div>
      </div>
    </div>
  );
};
