
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, Workshop, ModuleId } from '../types';
import { 
  Search, RefreshCw, FolderOpen, Clock, 
  Loader2, X, ChevronDown, ChevronRight,
  Filter, Building2, SlidersHorizontal,
  PackageCheck, Factory, Truck, Box, ShieldCheck, MapPin,
  Calendar, RotateCcw, CheckCircle2, AlertOctagon, UserCheck, LayoutGrid,
  ClipboardList, AlertTriangle, Info, User as UserIcon, CheckCircle,
  CalendarDays, ArrowRight, Check
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

  // Multi-select Filters
  const [filterQC, setFilterQC] = useState<string[]>([]);
  const [filterWorkshop, setFilterWorkshop] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  
  // Date Range Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filterOptions = useMemo(() => ({
      inspectors: Array.from(new Set(inspections.map(i => i.inspectorName).filter(Boolean))).sort(),
      workshops: Array.from(new Set(inspections.map(i => i.workshop).filter(Boolean))).sort(),
      statuses: [InspectionStatus.DRAFT, InspectionStatus.PENDING, InspectionStatus.COMPLETED, InspectionStatus.APPROVED, InspectionStatus.FLAGGED]
  }), [inspections]);

  const isFilterActive = filterQC.length > 0 || filterWorkshop.length > 0 || filterStatus.length > 0 || startDate !== '' || endDate !== '';

  const resetFilters = () => {
    setFilterQC([]); setFilterWorkshop([]); setFilterStatus([]);
    setStartDate(''); setEndDate('');
    setActiveDropdown(null);
  };

  const toggleMultiSelect = (current: string[], value: string, setter: (val: string[]) => void) => {
      if (current.includes(value)) {
          setter(current.filter(v => v !== value));
      } else {
          setter([...current, value]);
      }
  };

  const groupedData = useMemo(() => {
    const projects: Record<string, { 
        projectName: string, 
        passCount: number,
        failCount: number,
        totalCount: number,
        productGroups: Record<string, { productName: string, productCode: string, items: Inspection[] }> 
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
        const prodKey = item.ma_nha_may || item.headcode || item.ten_hang_muc || 'CHƯA PHÂN LOẠI';

        if (!projects[pKey]) {
            projects[pKey] = { 
                projectName: item.ten_ct || (pKey === 'DÙNG CHUNG' ? 'DANH MỤC DÙNG CHUNG' : 'DỰ ÁN KHÁC'), 
                passCount: 0, failCount: 0, totalCount: 0, productGroups: {} 
            };
        }

        if (!projects[pKey].productGroups[prodKey]) {
            projects[pKey].productGroups[prodKey] = { 
                productName: item.ten_hang_muc || prodKey, productCode: prodKey, items: [] 
            };
        }

        projects[pKey].productGroups[prodKey].items.push(item);
        projects[pKey].totalCount++;
        if ((item as any).hasNcr) projects[pKey].failCount++;
        else if ((item as any).isAllPass) projects[pKey].passCount++;
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

  const FilterDropdown = ({ title, options, selected, onToggle, icon: Icon, id }: any) => {
      const isOpen = activeDropdown === id;
      const count = selected.length;
      
      return (
          <div className="relative flex-1 min-w-[140px]">
              <button
                  onClick={() => setActiveDropdown(isOpen ? null : id)}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border text-[11px] font-black uppercase transition-all shadow-sm ${
                      count > 0 
                      ? 'bg-blue-600 text-white border-blue-600' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
              >
                  <div className="flex items-center gap-2 truncate">
                      <Icon className={`w-3.5 h-3.5 ${count > 0 ? 'text-white' : 'text-slate-400'}`} />
                      <span className="truncate">{count > 0 ? `${title} (${count})` : title}</span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                  <>
                      <div className="fixed inset-0 z-40" onClick={() => setActiveDropdown(null)}></div>
                      <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-[1.5rem] shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in zoom-in-95 duration-200 origin-top-left">
                          <div className="p-2 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center px-4">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{title}</span>
                              {count > 0 && <button onClick={() => onToggle([], null, true)} className="text-[9px] font-black text-blue-600 hover:underline uppercase">Xóa</button>}
                          </div>
                          <div className="max-h-60 overflow-y-auto p-2 no-scrollbar">
                              {options.map((opt: string) => {
                                  const isActive = selected.includes(opt);
                                  return (
                                      <div
                                          key={opt}
                                          onClick={() => onToggle(selected, opt)}
                                          className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${isActive ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                                      >
                                          <span className={`text-xs font-bold ${isActive ? 'text-blue-700' : 'text-slate-600'}`}>{opt || 'N/A'}</span>
                                          {isActive && <Check className="w-4 h-4 text-blue-600" />}
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  </>
              )}
          </div>
      );
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 no-scroll-x" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      {/* TOOLBAR & SEARCH */}
      <div className="shrink-0 bg-white px-4 py-4 border-b border-slate-200 z-30 shadow-sm">
          <div className="max-w-7xl mx-auto space-y-4">
              <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" placeholder="Tìm theo Dự án, Mã NM, Sản phẩm..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 focus:ring-4 focus:ring-blue-100 outline-none transition-all shadow-inner"
                      />
                  </div>
                  <div className="flex gap-2">
                      <button 
                        onClick={() => setIsFilterOpen(!isFilterOpen)} 
                        className={`px-6 py-3 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all shadow-sm border relative ${isFilterOpen ? 'bg-slate-900 text-white border-slate-900' : isFilterActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                      >
                          <Filter className="w-4 h-4" />
                          <span className="text-[10px] uppercase tracking-widest">{isFilterOpen ? 'Đóng bộ lọc' : 'Bộ lọc'}</span>
                          {isFilterActive && !isFilterOpen && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-white rounded-full shadow-sm"></div>}
                      </button>
                      <button onClick={onRefresh} className="px-6 py-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-600 font-bold active:scale-95 transition-all shadow-sm">
                          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          <span className="text-[10px] uppercase tracking-widest">Làm mới</span>
                      </button>
                  </div>
              </div>

              {/* INLINE DROPDOWN FILTER BAR */}
              {isFilterOpen && (
                  <div className="bg-slate-50 rounded-[2rem] border border-slate-200 p-4 animate-in slide-in-from-top duration-300 shadow-inner">
                      <div className="flex flex-wrap items-center gap-3">
                          {/* Multi-select Dropdowns */}
                          <FilterDropdown 
                            id="qc" title="QC Thẩm định" 
                            options={filterOptions.inspectors} 
                            selected={filterQC} 
                            onToggle={(s: string[], v: string, clear = false) => clear ? setFilterQC([]) : toggleMultiSelect(s, v, setFilterQC)}
                            icon={UserIcon}
                          />

                          <FilterDropdown 
                            id="ws" title="Xưởng" 
                            options={filterOptions.workshops} 
                            selected={filterWorkshop} 
                            onToggle={(s: string[], v: string, clear = false) => clear ? setFilterWorkshop([]) : toggleMultiSelect(s, v, setFilterWorkshop)}
                            icon={Factory}
                          />

                          <FilterDropdown 
                            id="status" title="Trạng thái" 
                            options={filterOptions.statuses} 
                            selected={filterStatus} 
                            onToggle={(s: string[], v: string, clear = false) => clear ? setFilterStatus([]) : toggleMultiSelect(s, v, setFilterStatus)}
                            icon={ShieldCheck}
                          />

                          {/* Date Range - Integrated in Row */}
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm min-w-[300px]">
                              <CalendarDays className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <input 
                                type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                className="bg-transparent text-[11px] font-bold outline-none w-28"
                              />
                              <ArrowRight className="w-3 h-3 text-slate-300" />
                              <input 
                                type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                                className="bg-transparent text-[11px] font-bold outline-none w-28"
                              />
                          </div>

                          {/* Action Buttons in Row */}
                          <div className="flex items-center gap-2 ml-auto">
                              <button 
                                onClick={resetFilters} 
                                className="p-2.5 bg-white border border-slate-300 text-slate-400 rounded-xl hover:text-red-500 hover:border-red-200 transition-all active:scale-95 shadow-sm"
                                title="Xóa tất cả bộ lọc"
                              >
                                  <RotateCcw className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setIsFilterOpen(false)} 
                                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-200 active:scale-95"
                              >
                                  Áp dụng
                              </button>
                          </div>
                      </div>
                  </div>
              )}
          </div>
      </div>

      {/* LIST CONTENT */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar pb-24">
        <div className="max-w-7xl mx-auto space-y-6">
            {Object.keys(groupedData).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300"><FolderOpen className="w-20 h-20 opacity-10 mb-4" /><p className="font-black uppercase tracking-[0.2em] text-[10px]">Không tìm thấy phiếu</p></div>
            ) : (
                Object.keys(groupedData).sort((a,b) => a === 'DÙNG CHUNG' ? 1 : b === 'DÙNG CHUNG' ? -1 : a.localeCompare(b)).map(pKey => {
                    const project = groupedData[pKey];
                    const isExpanded = expandedProjects.has(pKey) || searchTerm.length > 0;
                    return (
                        <div key={pKey} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300 mb-4">
                            <div onClick={() => toggleProject(pKey)} className={`p-5 flex items-center justify-between cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/40 border-b border-blue-100' : 'hover:bg-slate-50/50'}`}>
                                <div className="flex items-center gap-4 flex-1 overflow-hidden">
                                    <div className={`p-3 rounded-2xl shrink-0 shadow-sm ${isExpanded ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}><Building2 className="w-5 h-5" /></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <h3 className="font-black text-xs uppercase tracking-tight truncate text-slate-800">{pKey}</h3>
                                            <div className="flex gap-1">
                                                <span className="px-2 py-0.5 bg-green-600 text-white rounded-lg text-[8px] font-black border border-green-500 shadow-sm">ĐẠT: {project.passCount}</span>
                                                {project.failCount > 0 && <span className="px-2 py-0.5 bg-red-600 text-white rounded-lg text-[8px] font-black border border-red-500 shadow-sm">LỖI: {project.failCount}</span>}
                                                <span className="px-2 py-0.5 bg-slate-900 text-white rounded-lg text-[8px] font-black border border-slate-700 shadow-sm">TỔNG: {project.totalCount}</span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate">{project.projectName}</p>
                                    </div>
                                </div>
                                <ChevronDown className={`w-5 h-5 text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                            </div>

                            {isExpanded && (
                                <div className="p-2 space-y-4 bg-slate-50/20">
                                    {Object.keys(project.productGroups).map(prodKey => {
                                        const product = project.productGroups[prodKey];
                                        return (
                                            <div key={prodKey} className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden">
                                                <div className="bg-slate-50/50 px-5 py-2.5 border-b border-slate-100 flex items-center gap-2">
                                                    <Box className="w-3.5 h-3.5 text-blue-400" />
                                                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-tight truncate">
                                                        {product.productName} 
                                                        <span className="ml-2 text-slate-400 font-mono">#{product.productCode}</span>
                                                    </span>
                                                </div>
                                                <div className="divide-y divide-slate-50">
                                                    {product.items.map(item => {
                                                        const cfg = MODULE_CONFIG[item.type || 'PQC'] || MODULE_CONFIG['PQC'];
                                                        const ModuleIcon = cfg.icon;
                                                        const wsName = workshops.find(w => w.code === item.workshop)?.name || item.workshop || 'Xưởng';
                                                        const { isAllPass, hasNcr, isCond } = item as any;
                                                        return (
                                                            <div key={item.id} onClick={() => onSelect(item.id)} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-blue-50/30 transition-all cursor-pointer group border-l-4 border-transparent hover:border-blue-500">
                                                                <div className="flex items-start gap-4 flex-1 overflow-hidden">
                                                                    <div className={`p-2.5 rounded-xl border ${cfg.bg} ${cfg.color} border-current/10 shrink-0 shadow-sm`}><ModuleIcon className="w-5 h-5" /></div>
                                                                    <div className="flex-1 min-w-0 space-y-1">
                                                                        <p className="font-black text-slate-800 text-[13px] uppercase tracking-tight truncate group-hover:text-blue-700">{item.ten_hang_muc || 'Không tiêu đề'}</p>
                                                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-black text-slate-400 uppercase">
                                                                            <div className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-400" /> {item.date}</div>
                                                                            <div className="flex items-center gap-1.5 overflow-hidden">
                                                                                <Factory className="w-3.5 h-3.5 text-blue-600 shrink-0" /> 
                                                                                <span className="truncate">{cfg.label} • {wsName} • {item.inspectionStage || 'C.Đoạn'}</span>
                                                                                <span className="mx-1 text-slate-200">|</span>
                                                                                <div className="flex items-center gap-1">
                                                                                  <UserIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                                                                  <span className="text-slate-500">QC: {item.inspectorName}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                                                                    <div className="flex gap-1.5 items-center">
                                                                        {isAllPass && <span className="bg-green-600 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-md flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> ĐẠT</span>}
                                                                        {hasNcr && <span className="bg-red-600 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg shadow-red-100 flex items-center gap-1 animate-pulse"><AlertTriangle className="w-2.5 h-2.5" /> NCR</span>}
                                                                        {isCond && <span className="bg-amber-500 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg shadow-amber-100 flex items-center gap-1"><Info className="w-2.5 h-2.5" /> CĐK</span>}
                                                                        <div className={`px-3 py-1.5 rounded-xl text-[9px] font-black border uppercase tracking-widest shadow-sm ${
                                                                            item.status === InspectionStatus.APPROVED ? 'bg-blue-600 text-white border-blue-600' :
                                                                            item.status === InspectionStatus.COMPLETED ? 'bg-green-600 text-white border-green-600' :
                                                                            item.status === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-600 border-red-200' :
                                                                            'bg-white text-slate-500 border-slate-200'
                                                                        }`}>{item.status}</div>
                                                                    </div>
                                                                    <div className="p-2 bg-white border border-slate-200 text-slate-300 rounded-xl group-hover:text-blue-600 group-hover:border-blue-300 transition-all"><ChevronRight className="w-4 h-4" /></div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
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
