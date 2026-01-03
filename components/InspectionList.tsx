
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Inspection, InspectionStatus, Priority, ModuleId, User as UserType } from '../types';
import { ALL_MODULES } from '../constants';
import { 
  Building2, Calendar, AlertCircle, CheckCircle2, Search, Filter, X, 
  ChevronDown, ArrowUp, LayoutGrid, Clock, ChevronRight, Layers, Zap,
  Plus, FileDown, SlidersHorizontal, MapPin, Hash, FolderOpen, 
  ChevronLeft, Briefcase, Loader2, Upload, ArrowRight, RefreshCw,
  User, UserCircle, LogOut, Settings as SettingsIcon, ShieldCheck,
  ListFilter
} from 'lucide-react';

interface InspectionListProps {
  inspections: Inspection[];
  allInspections?: Inspection[];
  onSelect: (id: string) => void;
  currentModuleLabel?: string;
  userRole?: string;
  selectedModule?: string;
  onModuleChange?: (module: string) => void;
  visibleModules?: { id: string; label: string }[];
  onImportInspections?: (inspections: Inspection[]) => Promise<void>;
  onRefresh?: () => void;
  currentUserName?: string;
  currentUser?: UserType;
  onLogout?: () => void;
  onNavigateSettings?: (tab: 'PROFILE' | 'TEMPLATE' | 'USERS' | 'WORKSHOPS') => void;
}

const PROJECTS_PER_PAGE = 10;

export const InspectionList: React.FC<InspectionListProps> = ({ 
  inspections, allInspections = [], onSelect, currentModuleLabel = "Module", 
  userRole, selectedModule, onModuleChange, onImportInspections, onRefresh, 
  currentUserName, currentUser, onLogout, onNavigateSettings 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'FLAGGED' | 'HIGH_PRIORITY' | 'DRAFT' | 'MY_REPORTS'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showModuleMenu, setShowModuleMenu] = useState(false);
  
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const moduleMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) setShowFilterMenu(false);
      if (moduleMenuRef.current && !moduleMenuRef.current.contains(event.target as Node)) setShowModuleMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate counts for each module
  const moduleStats = useMemo(() => {
    const stats: Record<string, number> = { 'ALL': 0 };
    // Initialize stats for known modules
    ALL_MODULES.forEach(m => stats[m.id] = 0);
    
    inspections.forEach(item => {
        stats['ALL']++;
        if (item.type && stats.hasOwnProperty(item.type)) {
            stats[item.type]++;
        } else if (item.type) {
            // Handle unexpected types
            stats[item.type] = (stats[item.type] || 0) + 1;
        }
    });
    return stats;
  }, [inspections]);

  const filteredInspections = useMemo(() => {
    return inspections
      .filter(item => {
        // Module Filter
        if (selectedModule && selectedModule !== 'ALL' && item.type !== selectedModule) {
            return false;
        }

        const term = searchTerm.toLowerCase();
        const matchesSearch = String(item.ma_ct || '').toLowerCase().includes(term) ||
          String(item.ten_ct || '').toLowerCase().includes(term) ||
          String(item.inspectorName || '').toLowerCase().includes(term) ||
          String(item.ten_hang_muc || '').toLowerCase().includes(term) ||
          String(item.ma_nha_may || '').toLowerCase().includes(term);
        
        if (!matchesSearch) return false;
        if (filter === 'MY_REPORTS' && (item.inspectorName || '').toLowerCase() !== currentUserName?.toLowerCase()) return false;
        if (filter === 'FLAGGED' && item.status !== InspectionStatus.FLAGGED) return false;
        if (filter === 'HIGH_PRIORITY' && item.priority !== Priority.HIGH) return false;
        if (filter === 'DRAFT' && item.status !== InspectionStatus.DRAFT) return false;
        if (startDate && item.date < startDate) return false;
        if (endDate && item.date > endDate) return false;
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inspections, searchTerm, filter, startDate, endDate, currentUserName, selectedModule]);

  const groupedItems = useMemo(() => {
    const groups: { [key: string]: Inspection[] } = {};
    filteredInspections.forEach(item => {
        const code = item.ma_ct || 'KHÁC';
        if (!groups[code]) groups[code] = [];
        groups[code].push(item);
    });
    return groups;
  }, [filteredInspections]);

  const sortedProjectCodes = useMemo(() => Object.keys(groupedItems).sort((a, b) => groupedItems[b].length - groupedItems[a].length), [groupedItems]);
  const pagedProjectCodes = useMemo(() => sortedProjectCodes.slice((currentPage - 1) * PROJECTS_PER_PAGE, currentPage * PROJECTS_PER_PAGE), [sortedProjectCodes, currentPage]);

  const filterOptions = [
    { key: 'ALL', label: 'Tất cả', icon: undefined },
    { key: 'FLAGGED', label: 'Cần xử lý', icon: <AlertCircle className="w-3 h-3 text-red-500" /> },
    { key: 'HIGH_PRIORITY', label: 'Khẩn cấp', icon: <Zap className="w-3 h-3 text-orange-500" /> },
    { key: 'DRAFT', label: 'Bản nháp', icon: undefined },
    { key: 'MY_REPORTS', label: 'Của tôi', icon: undefined },
  ] as const;

  const currentModuleStats = moduleStats[selectedModule || 'ALL'] || 0;
  const currentModuleName = selectedModule === 'ALL' || !selectedModule 
    ? 'TẤT CẢ' 
    : ALL_MODULES.find(m => m.id === selectedModule)?.label || selectedModule;

  // Display only modules that have counts or are part of the main list
  const displayModules = ['ALL', ...ALL_MODULES.map(m => m.id)];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Header Bar */}
      <div className="bg-white px-3 py-3 border-b border-slate-200 shadow-sm z-30 shrink-0 lg:px-6 lg:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            
            {/* Top Row: Module Dropdown + Search + Filter Button */}
            <div className="flex items-center gap-2 w-full lg:w-auto">
                
                {/* NEW: Module Filter Dropdown (Droplist) */}
                <div className="relative shrink-0" ref={moduleMenuRef}>
                    <button 
                        onClick={() => setShowModuleMenu(!showModuleMenu)}
                        className="h-11 px-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-2 shadow-sm min-w-[120px] max-w-[160px] active:scale-95 transition-all"
                    >
                        <div className="flex flex-col items-start overflow-hidden">
                            <span className="text-[10px] font-black text-slate-900 uppercase truncate w-full">{currentModuleName}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-bold">{currentModuleStats}</span>
                            <ChevronDown className="w-3 h-3 text-slate-400" />
                        </div>
                    </button>

                    {showModuleMenu && (
                        <div className="absolute left-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 origin-top-left max-h-[60vh] overflow-y-auto no-scrollbar">
                            <button
                                onClick={() => { onModuleChange?.('ALL'); setShowModuleMenu(false); }}
                                className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-slate-50 border-b border-slate-50 ${selectedModule === 'ALL' ? 'bg-blue-50' : ''}`}
                            >
                                <span className={`text-xs font-black uppercase ${selectedModule === 'ALL' ? 'text-blue-600' : 'text-slate-700'}`}>TẤT CẢ</span>
                                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold">{moduleStats['ALL']}</span>
                            </button>
                            {ALL_MODULES.map((mod) => (
                                <button
                                    key={mod.id}
                                    onClick={() => { onModuleChange?.(mod.id); setShowModuleMenu(false); }}
                                    className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-slate-50 ${selectedModule === mod.id ? 'bg-blue-50' : ''}`}
                                >
                                    <span className={`text-xs font-bold uppercase truncate pr-2 ${selectedModule === mod.id ? 'text-blue-600' : 'text-slate-600'}`}>{mod.label}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${moduleStats[mod.id] > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                                        {moduleStats[mod.id] || 0}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Search Input */}
                <div className="relative group flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-blue-500 transition-colors" />
                  <input 
                    type="text" placeholder="Tìm mã, sản phẩm, QC..." value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-10 h-11 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner lg:text-sm lg:h-12"
                  />
                  {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4"/></button>}
                </div>

                {/* Status Filter Button (Dropdown) */}
                <div className="relative lg:hidden shrink-0" ref={filterMenuRef}>
                     <button 
                        onClick={() => setShowFilterMenu(!showFilterMenu)} 
                        className={`h-11 w-11 flex items-center justify-center rounded-xl border shadow-sm transition-all active:scale-95 ${filter !== 'ALL' ? 'bg-blue-600 text-white border-blue-600 shadow-blue-200' : 'bg-white text-slate-500 border-slate-200'}`}
                     >
                       <ListFilter className="w-5 h-5" />
                     </button>
                     
                     {showFilterMenu && (
                        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 origin-top-right">
                            {filterOptions.map((opt) => (
                                <button
                                    key={opt.key}
                                    onClick={() => { setFilter(opt.key); setShowFilterMenu(false); }}
                                    className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-3 ${filter === opt.key ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}
                                >
                                    {opt.icon && <span>{opt.icon}</span>}
                                    {opt.label}
                                    {filter === opt.key && <CheckCircle2 className="w-3 h-3 ml-auto" />}
                                </button>
                            ))}
                        </div>
                     )}
                </div>
            </div>
            
            {/* 2. Controls Area (Date + Desktop Filters) */}
            <div className="flex items-center gap-2 lg:gap-4 flex-1 lg:justify-end">
               
               {/* Date Filter */}
               <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 h-10 w-full lg:w-72 lg:h-12 lg:bg-white lg:hover:border-blue-300 transition-colors group">
                   <Calendar className="w-3.5 h-3.5 text-slate-400 mr-2 group-hover:text-blue-500 transition-colors" />
                   <input 
                      type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} 
                      className="bg-transparent text-[10px] lg:text-xs font-bold text-slate-600 outline-none w-full cursor-pointer hover:text-blue-600 transition-colors" 
                   />
                   <span className="text-slate-300 mx-2 font-light">|</span>
                   <input 
                      type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} 
                      className="bg-transparent text-[10px] lg:text-xs font-bold text-slate-600 outline-none w-full text-right cursor-pointer hover:text-blue-600 transition-colors" 
                   />
               </div>

               {/* Desktop Inline Filters */}
               <div className="hidden lg:flex bg-slate-100 p-1 rounded-xl gap-1 shrink-0">
                  {filterOptions.map((opt) => (
                      <button
                          key={opt.key}
                          onClick={() => setFilter(opt.key)}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                              filter === opt.key 
                              ? 'bg-white text-blue-700 shadow-sm ring-1 ring-black/5' 
                              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                          }`}
                      >
                          {opt.icon}
                          {opt.label}
                      </button>
                  ))}
               </div>

            </div>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto space-y-3 p-3 lg:p-6 no-scrollbar pb-24">
        {pagedProjectCodes.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center text-slate-400 bg-white/50 rounded-[2rem] border border-dashed border-slate-200 mx-1">
            <Briefcase className="w-12 h-12 text-slate-300 mb-4" />
            <p className="font-black uppercase text-slate-600">Không tìm thấy dữ liệu</p>
            {selectedModule !== 'ALL' && <p className="text-xs mt-2">Đang lọc theo: {currentModuleName}</p>}
          </div>
        ) : (
          pagedProjectCodes.map(projectCode => {
            const groupItems = groupedItems[projectCode];
            const isExpanded = expandedGroups.has(projectCode);
            return (
              <div key={projectCode} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-shadow hover:shadow-md">
                <div onClick={() => setExpandedGroups(prev => {const next = new Set(prev); if (next.has(projectCode)) next.delete(projectCode); else next.add(projectCode); return next;})} className={`p-4 cursor-pointer flex items-center justify-between transition-colors ${isExpanded ? 'bg-blue-50/30' : 'bg-white hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl transition-colors ${isExpanded ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                        <FolderOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-sm text-slate-900 uppercase tracking-tight truncate max-w-[200px] lg:max-w-md">{projectCode}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{groupItems.length} Phiếu</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                </div>
                {isExpanded && (
                  <div className="p-2 space-y-2 bg-slate-50/50">
                    {groupItems.map(item => (
                      <div key={item.id} onClick={() => onSelect(item.id)} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between active:scale-[0.99] hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group">
                        <div className="flex-1 overflow-hidden">
                          <h4 className="font-bold text-slate-800 text-sm truncate uppercase tracking-tight group-hover:text-blue-700 transition-colors">{item.ten_hang_muc}</h4>
                          <div className="flex items-center gap-3 mt-1.5">
                             <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3"/> {item.date}</span>
                             <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${item.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>{item.status}</span>
                             {item.type && <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase">{item.type}</span>}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 ml-2 group-hover:text-blue-500 transition-colors" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
