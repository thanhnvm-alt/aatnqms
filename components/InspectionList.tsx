
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Inspection, InspectionStatus, Priority, ModuleId, User as UserType } from '../types';
import { ALL_MODULES } from '../constants';
import { 
  Building2, Calendar, AlertCircle, CheckCircle2, Search, Filter, X, 
  ChevronDown, ArrowUp, LayoutGrid, Clock, ChevronRight, Layers, Zap,
  Plus, FileDown, SlidersHorizontal, MapPin, Hash, FolderOpen, 
  ChevronLeft, Briefcase, Loader2, Upload, ArrowRight, RefreshCw,
  User, UserCircle, LogOut, Settings as SettingsIcon, ShieldCheck,
  ListFilter, QrCode
} from 'lucide-react';
// @ts-ignore
import jsQR from 'jsqr';

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
  
  // QR Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
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

  // --- QR Scanner Logic ---
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (showScanner) {
      const startCamera = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (videoRef.current && stream) {
              videoRef.current.srcObject = stream;
              videoRef.current.setAttribute('playsinline', 'true');
              videoRef.current.play();
              requestRef.current = requestAnimationFrame(tick);
          }
        } catch (err) {
          alert('Không thể truy cập camera. Vui lòng cấp quyền.');
          setShowScanner(false);
        }
      };
      startCamera();
    }
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [showScanner]);

  const tick = () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
             const scannedData = code.data.trim();
             setSearchTerm(scannedData);
             setShowScanner(false);
             return;
          }
        }
      }
    }
    if (showScanner) requestRef.current = requestAnimationFrame(tick);
  };

  // Calculate counts for each filter option (within current module)
  const filterCounts = useMemo(() => {
    const moduleInspections = selectedModule && selectedModule !== 'ALL' 
        ? inspections.filter(i => i.type === selectedModule)
        : inspections;

    return {
      ALL: moduleInspections.length,
      FLAGGED: moduleInspections.filter(i => i.status === InspectionStatus.FLAGGED).length,
      HIGH_PRIORITY: moduleInspections.filter(i => i.priority === Priority.HIGH).length,
      DRAFT: moduleInspections.filter(i => i.status === InspectionStatus.DRAFT).length,
      MY_REPORTS: moduleInspections.filter(i => i.inspectorName === currentUserName).length
    };
  }, [inspections, selectedModule, currentUserName]);

  // Calculate counts for each module
  const moduleStats = useMemo(() => {
    const stats: Record<string, number> = { 'ALL': inspections.length };
    ALL_MODULES.forEach(m => stats[m.id] = 0);
    inspections.forEach(item => {
        if (item.type && stats.hasOwnProperty(item.type)) {
            stats[item.type]++;
        }
    });
    return stats;
  }, [inspections]);

  const filteredInspections = useMemo(() => {
    return inspections
      .filter(item => {
        if (selectedModule && selectedModule !== 'ALL' && item.type !== selectedModule) return false;
        const term = searchTerm.toLowerCase();
        const matchesSearch = String(item.ma_ct || '').toLowerCase().includes(term) ||
          String(item.ten_ct || '').toLowerCase().includes(term) ||
          String(item.inspectorName || '').toLowerCase().includes(term) ||
          String(item.ten_hang_muc || '').toLowerCase().includes(term) ||
          String(item.ma_nha_may || '').toLowerCase().includes(term) ||
          String(item.headcode || '').toLowerCase().includes(term);
        
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
    { key: 'ALL', label: 'Tất cả', count: filterCounts.ALL, icon: undefined },
    { key: 'FLAGGED', label: 'Cần xử lý', count: filterCounts.FLAGGED, icon: <AlertCircle className="w-3 h-3 text-red-500" /> },
    { key: 'HIGH_PRIORITY', label: 'Khẩn cấp', count: filterCounts.HIGH_PRIORITY, icon: <Zap className="w-3 h-3 text-orange-500" /> },
    { key: 'DRAFT', label: 'Bản nháp', count: filterCounts.DRAFT, icon: <FileDown className="w-3 h-3 text-slate-400" /> },
    { key: 'MY_REPORTS', label: 'Của tôi', count: filterCounts.MY_REPORTS, icon: <User className="w-3 h-3 text-blue-500" /> },
  ] as const;

  const activeFilterLabel = filterOptions.find(o => o.key === filter)?.label || 'Tất cả';
  const activeFilterCount = filterOptions.find(o => o.key === filter)?.count || 0;

  const currentModuleStats = moduleStats[selectedModule || 'ALL'] || 0;
  const currentModuleName = selectedModule === 'ALL' || !selectedModule 
    ? 'TẤT CẢ' 
    : ALL_MODULES.find(m => m.id === selectedModule)?.label || selectedModule;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {showScanner && (
        <div className="fixed inset-0 z-[120] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
            <button onClick={() => setShowScanner(false)} className="absolute top-6 right-6 text-white p-3 bg-white/10 rounded-full active:scale-90 transition-transform"><X className="w-8 h-8"/></button>
            <div className="text-center mb-8">
                <h3 className="text-white font-black text-lg uppercase tracking-widest mb-1">Tìm kiếm bằng QR</h3>
                <p className="text-slate-400 text-xs">Di chuyển camera đến mã QR trên sản phẩm</p>
            </div>
            <div className="w-full max-w-sm aspect-square bg-slate-800 rounded-[2.5rem] overflow-hidden relative border-4 border-blue-500/50 shadow-[0_0_50px_rgba(37,99,235,0.4)]">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-0 border-2 border-white/20 pointer-events-none">
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)] animate-scan-line"></div>
                </div>
            </div>
            <p className="text-blue-400 mt-10 font-black text-[10px] uppercase tracking-[0.3em] animate-pulse">Scanning...</p>
        </div>
      )}

      {/* Header Bar - Refined for visual match and mobile optimization */}
      <div className="bg-white px-3 py-3 border-b border-slate-200 shadow-sm z-30 shrink-0 lg:px-6">
        <div className="flex flex-wrap items-center gap-2 lg:gap-3 w-full">
            
            {/* 1. Module Filter Dropdown */}
            <div className="relative shrink-0" ref={moduleMenuRef}>
                <button 
                    onClick={() => setShowModuleMenu(!showModuleMenu)}
                    className="h-10 px-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-sm min-w-[100px] active:scale-95 transition-all"
                >
                    <span className="text-[11px] font-black text-slate-800 uppercase truncate max-w-[80px]">{currentModuleName}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-bold">{currentModuleStats}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
                    </div>
                </button>

                {showModuleMenu && (
                    <div className="absolute left-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 origin-top-left max-h-[60vh] overflow-y-auto no-scrollbar">
                        <button onClick={() => { onModuleChange?.('ALL'); setShowModuleMenu(false); }} className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-slate-50 border-b border-slate-50 ${selectedModule === 'ALL' ? 'bg-blue-50' : ''}`}><span className={`text-xs font-black uppercase ${selectedModule === 'ALL' ? 'text-blue-600' : 'text-slate-700'}`}>TẤT CẢ</span><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold">{moduleStats['ALL']}</span></button>
                        {ALL_MODULES.map((mod) => (
                            <button key={mod.id} onClick={() => { onModuleChange?.(mod.id); setShowModuleMenu(false); }} className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-slate-50 ${selectedModule === mod.id ? 'bg-blue-50' : ''}`}><span className={`text-xs font-bold uppercase truncate pr-2 ${selectedModule === mod.id ? 'text-blue-600' : 'text-slate-600'}`}>{mod.label}</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${moduleStats[mod.id] > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{moduleStats[mod.id] || 0}</span></button>
                        ))}
                    </div>
                )}
            </div>

            {/* 2. Status Filter Dropdown */}
            <div className="relative shrink-0" ref={filterMenuRef}>
                 <button 
                    onClick={() => setShowFilterMenu(!showFilterMenu)} 
                    className={`h-10 px-3 flex items-center justify-between gap-3 rounded-xl border shadow-sm transition-all active:scale-95 min-w-[110px] ${filter !== 'ALL' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white text-slate-700 border-slate-200'}`}
                 >
                    <div className="flex items-center gap-2 overflow-hidden">
                        <ListFilter className="w-4 h-4 shrink-0 opacity-40" />
                        <span className="text-[11px] font-black uppercase truncate max-w-[80px]">{activeFilterLabel}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${filter !== 'ALL' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{activeFilterCount}</span>
                        <ChevronDown className="w-3.5 h-3.5 opacity-30" />
                    </div>
                 </button>
                 
                 {showFilterMenu && (
                    <div className="absolute left-0 lg:left-auto lg:right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 origin-top-left lg:origin-top-right">
                        {filterOptions.map((opt) => (
                            <button
                                key={opt.key}
                                onClick={() => { setFilter(opt.key); setShowFilterMenu(false); }}
                                className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center justify-between ${filter === opt.key ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center gap-3">
                                    {opt.icon || <div className="w-4 h-4" />}
                                    <span className="uppercase">{opt.label}</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${filter === opt.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                    {opt.count}
                                </span>
                            </button>
                        ))}
                    </div>
                 )}
            </div>

            {/* 3. Search Input */}
            <div className="relative group flex-1 min-w-[200px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" placeholder="Mã NM, Headcode, Sản phẩm..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-20 h-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchTerm && <button onClick={() => setSearchTerm('')} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"><X className="w-4 h-4"/></button>}
                <button onClick={() => setShowScanner(true)} className="p-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 active:scale-90 transition-all"><QrCode className="w-4 h-4" /></button>
              </div>
            </div>
            
            {/* 4. Date Filter - Compact design as shown in image */}
            <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 h-10 w-full lg:w-auto min-w-[280px] group hover:border-blue-300 transition-colors shrink-0">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-[11px] font-bold text-slate-600 outline-none w-full cursor-pointer py-1" />
                <div className="flex items-center px-1 shrink-0">
                    <Calendar className="w-4 h-4 text-slate-300" />
                    <span className="text-slate-200 mx-2 font-light">|</span>
                </div>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-[11px] font-bold text-slate-600 outline-none w-full text-right cursor-pointer py-1" />
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
                             {item.ma_nha_may && <span className="text-[9px] font-mono font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{item.ma_nha_may}</span>}
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
