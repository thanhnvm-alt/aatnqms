
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Inspection, InspectionStatus, Priority, ModuleId, User as UserType } from '../types';
import { 
  Building2, Calendar, AlertCircle, CheckCircle2, Search, Filter, X, 
  ChevronDown, ArrowUp, LayoutGrid, Clock, ChevronRight, Layers, Zap,
  Plus, FileDown, SlidersHorizontal, MapPin, Hash, FolderOpen, 
  ChevronLeft, Briefcase, Loader2, Upload, ArrowRight, RefreshCw,
  User, UserCircle, LogOut, Settings as SettingsIcon, ShieldCheck
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

const HighlightedText: React.FC<{ text: string; highlight: string; className?: string }> = ({ text, highlight, className = "" }) => {
  if (!highlight.trim()) return <span className={className}>{text}</span>;
  try {
    const keywords = highlight.trim().split(/\s+/).filter(k => k.length > 0);
    const escapedKeywords = keywords.map(str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');
    const parts = String(text).split(regex);
    return (
      <span className={className}>
        {parts.map((part, i) => regex.test(part) ? <mark key={i} className="bg-yellow-300 text-slate-900 rounded-sm px-0.5 font-bold shadow-sm">{part}</mark> : <span key={i}>{part}</span>)}
      </span>
    );
  } catch (e) { return <span className={className}>{text}</span>; }
};

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
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showQCAvatarMenu, setShowQCAvatarMenu] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isQC = userRole === 'QC';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) setShowExportMenu(false);
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) setShowFilterMenu(false);
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(event.target as Node)) setShowQCAvatarMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredInspections = useMemo(() => {
    return inspections
      .filter(item => {
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
  }, [inspections, searchTerm, filter, startDate, endDate, currentUserName]);

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

  const totalPages = Math.ceil(sortedProjectCodes.length / PROJECTS_PER_PAGE);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* QC Dedicated Avatar Menu (Mobile Bottom Sheet / Web Dropdown) */}
      {showQCAvatarMenu && isQC && currentUser && (
        <div className="fixed inset-0 z-[100] lg:flex lg:items-start lg:justify-end lg:p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setShowQCAvatarMenu(false)}></div>
          
          {/* Menu Panel */}
          <div 
            ref={avatarMenuRef}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] shadow-2xl animate-in slide-in-from-bottom duration-300 lg:relative lg:bottom-auto lg:left-auto lg:right-auto lg:w-72 lg:rounded-3xl lg:animate-in lg:zoom-in-95 lg:slide-in-from-top-2"
          >
            <div className="p-6 border-b border-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-200">
                  {currentUser.avatar ? <img src={currentUser.avatar} className="w-full h-full object-cover rounded-2xl" /> : currentUser.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-black text-slate-900 uppercase tracking-tight leading-none">{currentUser.name}</h4>
                  <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 border border-blue-100 rounded-full">
                    <ShieldCheck className="w-3 h-3 text-blue-500" />
                    <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">QC Inspector</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-2 space-y-1">
              <button 
                onClick={() => { setShowQCAvatarMenu(false); onNavigateSettings?.('PROFILE'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                  <UserCircle className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-slate-700 uppercase tracking-tight">Thông tin tài khoản</p>
                  <p className="text-[10px] text-slate-400 font-medium">Chỉnh sửa hồ sơ cá nhân</p>
                </div>
              </button>

              <button 
                onClick={() => { setShowQCAvatarMenu(false); onNavigateSettings?.('PROFILE'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                  <SettingsIcon className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-slate-700 uppercase tracking-tight">Cài đặt hệ thống</p>
                  <p className="text-[10px] text-slate-400 font-medium">Tùy chỉnh giao diện & thông báo</p>
                </div>
              </button>

              <div className="h-px bg-slate-100 my-1 mx-4"></div>

              <button 
                onClick={() => { setShowQCAvatarMenu(false); onLogout?.(); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-red-50 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500 group-hover:bg-red-600 group-hover:text-white transition-all shadow-sm">
                  <LogOut className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-red-600 uppercase tracking-tight">Đăng xuất ngay</p>
                  <p className="text-[10px] text-red-400 font-medium">Kết thúc phiên làm việc</p>
                </div>
              </button>
            </div>
            {/* Safe area spacer for mobile */}
            <div className="h-8 lg:hidden"></div>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-white px-3 py-2 border-b border-slate-200 shadow-sm z-30 shrink-0">
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 w-full">
              <div className="relative group flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                  type="text" placeholder="Tìm mã, sản phẩm..." value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 h-10 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-500 transition-all"
                />
                {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-3.5 h-3.5"/></button>}
              </div>

              {/* QC Avatar Trigger */}
              {isQC && currentUser && (
                <button 
                  onClick={() => setShowQCAvatarMenu(true)}
                  className="h-10 w-10 rounded-xl border-2 border-blue-100 bg-white shadow-sm flex items-center justify-center overflow-hidden active:scale-90 transition-transform relative"
                >
                  {currentUser.avatar ? (
                    <img src={currentUser.avatar} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-blue-600 font-black text-xs uppercase">{currentUser.name.charAt(0)}</span>
                  )}
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></div>
                </button>
              )}

              <button onClick={onRefresh} className="h-10 w-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-blue-600 shadow-sm active:scale-95"><RefreshCw className="w-4 h-4" /></button>
            </div>
            
            <div className="flex items-center gap-2">
               <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 h-10 flex-1">
                   <Calendar className="w-3.5 h-3.5 text-slate-400 mr-2" />
                   <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-[11px] font-bold text-slate-600 outline-none w-full" />
                   <span className="text-slate-300 mx-2">-</span>
                   <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-[11px] font-bold text-slate-600 outline-none w-full text-right" />
               </div>
               <button onClick={() => setShowFilterMenu(!showFilterMenu)} className={`h-10 px-3 rounded-xl border font-bold text-xs flex items-center gap-2 shadow-sm ${filter !== 'ALL' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}><Filter className="w-3.5 h-3.5" /> Bộ lọc</button>
            </div>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto space-y-3 p-3 no-scrollbar pb-24">
        {pagedProjectCodes.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center text-slate-400 bg-white/50 rounded-[2rem] border border-dashed border-slate-200 mx-1">
            <Briefcase className="w-12 h-12 text-slate-300 mb-4" />
            <p className="font-black uppercase text-slate-600">Không tìm thấy dữ liệu</p>
          </div>
        ) : (
          pagedProjectCodes.map(projectCode => {
            const groupItems = groupedItems[projectCode];
            const isExpanded = expandedGroups.has(projectCode);
            return (
              <div key={projectCode} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div onClick={() => setExpandedGroups(prev => {const next = new Set(prev); if (next.has(projectCode)) next.delete(projectCode); else next.add(projectCode); return next;})} className={`p-4 cursor-pointer flex items-center justify-between ${isExpanded ? 'bg-blue-50/30' : 'bg-white'}`}>
                  <div className="flex items-center gap-3">
                    <FolderOpen className={`w-5 h-5 ${isExpanded ? 'text-blue-600' : 'text-slate-400'}`} />
                    <div>
                      <h3 className="font-black text-sm text-slate-900 uppercase tracking-tight truncate max-w-[200px]">{projectCode}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{groupItems.length} Phiếu</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
                {isExpanded && (
                  <div className="p-2 space-y-2 bg-slate-50/50">
                    {groupItems.map(item => (
                      <div key={item.id} onClick={() => onSelect(item.id)} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between active:scale-[0.98] transition-all">
                        <div className="flex-1 overflow-hidden">
                          <h4 className="font-bold text-slate-800 text-sm truncate uppercase tracking-tight">{item.ten_hang_muc}</h4>
                          <div className="flex items-center gap-3 mt-1.5">
                             <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3"/> {item.date}</span>
                             <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${item.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{item.status}</span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 ml-2" />
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
