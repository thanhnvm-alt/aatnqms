

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, Workshop, ModuleId } from '../types';
import { 
  Search, RefreshCw, FolderOpen, Clock, 
  Loader2, X, ChevronDown, ChevronRight,
  Filter, Building2, SlidersHorizontal,
  PackageCheck, Factory, Truck, Box, ShieldCheck, MapPin,
  Calendar, RotateCcw, CheckCircle2, AlertOctagon, UserCheck, LayoutGrid,
  ClipboardList, AlertTriangle, Info, User as UserIcon, CheckCircle,
  CalendarDays, ArrowRight, Check, FileText
} from 'lucide-react';

interface InspectionListProps {
  inspections: Inspection[];
  onSelect: (id: string) => void;
  isLoading?: boolean;
  workshops?: Workshop[];
  onRefresh?: () => void;
}

const MODULE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    'IQC': { label: 'IQC', color: 'text-blue-600', bg: 'bg-blue-50', icon: PackageCheck },
    'PQC': { label: 'PQC', color: 'text-purple-600', bg: 'bg-purple-50', icon: Factory },
    'SQC_MAT': { label: 'SQC-VT', color: 'text-teal-600', bg: 'bg-teal-50', icon: Truck },
    'SQC_VT': { label: 'SQC-VT', color: 'text-teal-600', bg: 'bg-teal-50', icon: Truck },
    'SQC_BTP': { label: 'SQC-BTP', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: Box },
    'FQC': { label: 'FQC', color: 'text-indigo-600', bg: 'bg-indigo-50', icon: ShieldCheck },
    'SITE': { label: 'SITE', color: 'text-amber-600', bg: 'bg-amber-50', icon: MapPin },
    'SPR': { label: 'SPR', color: 'text-slate-600', bg: 'bg-slate-50', icon: Filter },
    'STEP': { label: 'STEP', color: 'text-rose-600', bg: 'bg-rose-50', icon: SlidersHorizontal },
    'FSR': { label: 'FSR', color: 'text-orange-600', bg: 'bg-orange-50', icon: FolderOpen }
};

export const InspectionList: React.FC<InspectionListProps> = ({ 
  inspections, onSelect, isLoading, workshops = [], onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const [filterQC, setFilterQC] = useState<string[]>([]);
  const [filterWorkshop, setFilterWorkshop] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filterOptions = useMemo(() => ({
      inspectors: Array.from(new Set(inspections.map(i => i.inspectorName).filter(Boolean))).sort(),
      workshops: Array.from(new Set(inspections.map(i => i.workshop).filter(Boolean))).sort(),
      statuses: [InspectionStatus.DRAFT, InspectionStatus.PENDING, InspectionStatus.COMPLETED, InspectionStatus.APPROVED, InspectionStatus.FLAGGED]
  }), [inspections]);

  const isFilterActive = filterQC.length > 0 || filterWorkshop.length > 0 || filterStatus.length > 0 || startDate !== '' || endDate !== '';

  const groupedData = useMemo(() => {
    const projects: Record<string, { 
        projectName: string, 
        items: Inspection[]
    }> = {};

    const filtered = (inspections || []).filter(item => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = !term || 
               item.ma_ct?.toLowerCase().includes(term) ||
               item.ten_ct?.toLowerCase().includes(term) ||
               item.ten_hang_muc?.toLowerCase().includes(term) ||
               item.ma_nha_may?.toLowerCase().includes(term);
        if (!matchesSearch) return false;
        if (filterQC.length > 0 && !filterQC.includes(item.inspectorName)) return false;
        if (filterWorkshop.length > 0 && !filterWorkshop.includes(item.workshop || '')) return false;
        if (filterStatus.length > 0 && !filterStatus.includes(item.status)) return false;
        if (startDate && item.date < startDate) return false;
        if (endDate && item.date > endDate) return false;
        return true;
    });

    filtered.forEach(item => {
        const pKey = item.ma_ct || 'DÙNG CHUNG';
        if (!projects[pKey]) {
            projects[pKey] = { 
                projectName: item.ten_ct || (pKey === 'DÙNG CHUNG' ? 'DANH MỤC DÙNG CHUNG' : 'DỰ ÁN KHÁC'), 
                items: [] 
            };
        }
        projects[pKey].items.push(item);
    });

    return projects;
  }, [inspections, searchTerm, filterQC, filterWorkshop, filterStatus, startDate, endDate]);

  const toggleProject = (key: string) => {
    setExpandedProjects(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] no-scroll-x" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* COMPACT TOOLBAR */}
      <div className="shrink-0 bg-white px-4 py-3 border-b border-slate-200 z-30 shadow-sm">
          <div className="max-w-7xl mx-auto space-y-3">
              <div className="flex gap-2">
                  <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" placeholder="Tìm Dự án, Sản phẩm..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      />
                  </div>
                  <button 
                    onClick={() => setIsFilterOpen(!isFilterOpen)} 
                    className={`p-2.5 rounded-xl border transition-all active:scale-95 ${isFilterOpen || isFilterActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-400 border-slate-200'}`}
                  >
                    <Filter className="w-5 h-5" />
                  </button>
              </div>
              
              {isFilterOpen && (
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 animate-in slide-in-from-top duration-200 grid grid-cols-2 gap-2">
                      <select value={filterStatus[0] || 'ALL'} onChange={e => setFilterStatus(e.target.value === 'ALL' ? [] : [e.target.value])} className="p-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase">
                          <option value="ALL">TRẠNG THÁI</option>
                          {filterOptions.statuses.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button onClick={() => { setFilterStatus([]); setSearchTerm(''); setIsFilterOpen(false); }} className="p-2 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase">XÓA BỘ LỌC</button>
                  </div>
              )}
          </div>
      </div>

      {/* COMPACT LIST CONTENT */}
      <div className="flex-1 overflow-y-auto p-3 no-scrollbar pb-24">
        <div className="max-w-7xl mx-auto space-y-2">
            {Object.keys(groupedData).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                    <FolderOpen className="w-16 h-16 opacity-10 mb-2" />
                    <p className="font-black uppercase tracking-widest text-[10px]">Không tìm thấy dữ liệu</p>
                </div>
            ) : (
                Object.keys(groupedData).map(pKey => {
                    const project = groupedData[pKey];
                    const isExpanded = expandedProjects.has(pKey) || searchTerm.length > 0;
                    
                    return (
                        <div key={pKey} className="space-y-1">
                            {/* PROJECT HEADER */}
                            <div 
                                onClick={() => toggleProject(pKey)}
                                className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all ${isExpanded ? 'bg-blue-600 text-white shadow-lg' : 'bg-white border border-slate-100 shadow-sm'}`}
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className={`p-2 rounded-xl shrink-0 ${isExpanded ? 'bg-white/20' : 'bg-blue-50 text-blue-600'}`}>
                                        <Building2 className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-black text-[11px] uppercase tracking-tight truncate">{pKey}</h3>
                                        <p className={`text-[8px] font-bold uppercase truncate ${isExpanded ? 'text-blue-100' : 'text-slate-400'}`}>{project.projectName}</p>
                                    </div>
                                </div>
                                <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>

                            {/* PROJECT ITEMS */}
                            {isExpanded && (
                                <div className="space-y-1.5 pl-2 py-1">
                                    {project.items.map(item => {
                                        const cfg = MODULE_CONFIG[item.type || 'PQC'] || MODULE_CONFIG['PQC'];
                                        const StatusIcon = item.status === InspectionStatus.APPROVED ? CheckCircle2 : item.status === InspectionStatus.FLAGGED ? AlertTriangle : FileText;
                                        
                                        return (
                                            <div 
                                                key={item.id} 
                                                onClick={() => onSelect(item.id)}
                                                className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-all hover:border-blue-300 group"
                                            >
                                                {/* Left Icon (Screenshot Style) */}
                                                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100 text-blue-600 shrink-0 shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                                    <FileText className="w-6 h-6" />
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-black text-[12px] text-slate-800 uppercase tracking-tight truncate group-hover:text-blue-700">
                                                        {item.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ'}
                                                    </h4>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{cfg.label}</span>
                                                        <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                                                        <span className="text-[9px] font-mono text-slate-400 uppercase">#{item.id.split('-').pop()}</span>
                                                    </div>
                                                </div>

                                                {/* Status Pill */}
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase border tracking-tighter ${
                                                        item.status === InspectionStatus.APPROVED ? 'bg-green-50 text-green-700 border-green-200' :
                                                        item.status === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-700 border-red-200' :
                                                        'bg-slate-50 text-slate-500 border-slate-100'
                                                    }`}>
                                                        {item.status}
                                                    </span>
                                                    <p className="text-[8px] font-bold text-slate-300 font-mono">{item.date}</p>
                                                </div>
                                                
                                                <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-blue-400 transition-colors" />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
      </div>
    </div>
  );
};