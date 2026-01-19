
import React, { useState, useMemo } from 'react';
import { Inspection, InspectionStatus, CheckStatus, Workshop, ModuleId } from '../types';
import { 
  Search, RefreshCw, FolderOpen, Clock, 
  Loader2, X, ChevronDown, ChevronRight,
  Filter, Building2, SlidersHorizontal,
  PackageCheck, Factory, Truck, Box, ShieldCheck, MapPin,
  Calendar, RotateCcw, CheckCircle2, AlertOctagon, UserCheck, LayoutGrid,
  ClipboardList, AlertTriangle, Info, User as UserIcon, CheckCircle
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
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Filters
  const [filterQC, setFilterQC] = useState('ALL');
  const [filterWorkshop, setFilterWorkshop] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const filterOptions = useMemo(() => ({
      inspectors: Array.from(new Set(inspections.map(i => i.inspectorName).filter(Boolean))).sort(),
      workshops: Array.from(new Set(inspections.map(i => i.workshop).filter(Boolean))).sort()
  }), [inspections]);

  const isFilterActive = filterQC !== 'ALL' || filterWorkshop !== 'ALL' || filterStatus !== 'ALL';

  const resetFilters = () => {
    setFilterQC('ALL'); setFilterWorkshop('ALL'); setFilterStatus('ALL');
  };

  /**
   * ISO-NESTED-GROUPING: Nhóm Dự án -> Nhóm Sản phẩm
   */
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
        if (filterQC !== 'ALL' && item.inspectorName !== filterQC) return false;
        if (filterWorkshop !== 'ALL' && item.workshop !== filterWorkshop) return false;
        if (filterStatus !== 'ALL' && item.status !== filterStatus) return false;
        return true;
    });

    filtered.forEach(item => {
        const pKey = item.ma_ct || 'DÙNG CHUNG';
        const prodKey = item.ma_nha_may || item.headcode || item.ten_hang_muc || 'CHƯA PHÂN LOẠI';

        if (!projects[pKey]) {
            projects[pKey] = { 
                projectName: item.ten_ct || (pKey === 'DÙNG CHUNG' ? 'DANH MỤC DÙNG CHUNG' : 'DỰ ÁN KHÁC'), 
                passCount: 0,
                failCount: 0,
                totalCount: 0,
                productGroups: {} 
            };
        }

        if (!projects[pKey].productGroups[prodKey]) {
            projects[pKey].productGroups[prodKey] = { 
                productName: item.ten_hang_muc || prodKey, 
                productCode: prodKey,
                items: [] 
            };
        }

        projects[pKey].productGroups[prodKey].items.push(item);
        projects[pKey].totalCount++;
        
        // Thống kê chất lượng cho dự án
        const isFail = (item as any).hasNcr;
        if (isFail) {
            projects[pKey].failCount++;
        } else if ((item as any).isAllPass) {
            projects[pKey].passCount++;
        }
    });

    return projects;
  }, [inspections, searchTerm, filterQC, filterWorkshop, filterStatus]);

  const toggleProject = (key: string) => {
    setExpandedProjects(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 no-scroll-x" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="shrink-0 bg-white px-4 py-4 border-b border-slate-200 z-30 shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-3">
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
                  <button onClick={() => setShowFilterModal(true)} className={`px-6 py-3 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all shadow-sm border relative ${isFilterActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}><Filter className="w-4 h-4" /><span className="text-[10px] uppercase tracking-widest">Bộ lọc</span>{isFilterActive && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-white rounded-full shadow-sm"></div>}</button>
                  <button onClick={onRefresh} className="px-6 py-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-600 font-bold active:scale-95 transition-all shadow-sm">{isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}<span className="text-[10px] uppercase tracking-widest">Làm mới</span></button>
              </div>
          </div>
      </div>

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
                                                        
                                                        // ISO-FLAGS: Sử dụng dữ liệu đã quét từ service
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
                                                                        {/* HIỂN THỊ NHÃN ĐẠT (XANH) - Chỉ khi tất cả item OK */}
                                                                        {isAllPass && (
                                                                            <span className="bg-green-600 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-md flex items-center gap-1">
                                                                                <CheckCircle className="w-2.5 h-2.5" /> ĐẠT
                                                                            </span>
                                                                        )}
                                                                        
                                                                        {/* HIỂN THỊ NHÃN NCR (ĐỎ) - Khi có item hỏng */}
                                                                        {hasNcr && (
                                                                            <span className="bg-red-600 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg shadow-red-100 flex items-center gap-1 animate-pulse">
                                                                                <AlertTriangle className="w-2.5 h-2.5" /> NCR
                                                                            </span>
                                                                        )}
                                                                        
                                                                        {/* HIỂN THỊ NHÃN CĐK (VÀNG) - Khi có item có điều kiện */}
                                                                        {isCond && (
                                                                            <span className="bg-amber-500 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg shadow-amber-100 flex items-center gap-1">
                                                                                <Info className="w-2.5 h-2.5" /> CĐK
                                                                            </span>
                                                                        )}

                                                                        {/* TRẠNG THÁI CHÍNH */}
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
      
      {showFilterModal && (
          <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><SlidersHorizontal className="w-5 h-5" /></div>
                          <div><h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">Bộ lọc danh sách</h3><p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">ISO Digital Quality Logs</p></div>
                      </div>
                      <button onClick={() => setShowFilterModal(false)} className="p-2 text-slate-400"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="p-6 space-y-5 overflow-y-auto no-scrollbar">
                      <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-400 uppercase ml-1 flex items-center gap-1.5"><UserIcon className="w-3 h-3 text-indigo-500" /> Inspector</label><select value={filterQC} onChange={e => setFilterQC(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none appearance-none"><option value="ALL">Tất cả nhân viên</option>{filterOptions.inspectors.map(name => <option key={name} value={name}>{name}</option>)}</select></div>
                      <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-400 uppercase ml-1 flex items-center gap-1.5"><Factory className="w-3 h-3 text-teal-500" /> Workshop</label><select value={filterWorkshop} onChange={e => setFilterWorkshop(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none appearance-none"><option value="ALL">Tất cả xưởng</option>{filterOptions.workshops.map(name => <option key={name} value={name}>{name}</option>)}</select></div>
                      <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-400 uppercase ml-1 flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-blue-500" /> Status</label><select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none appearance-none"><option value="ALL">Tất cả trạng thái</option><option value={InspectionStatus.DRAFT}>DRAFT</option><option value={InspectionStatus.PENDING}>PENDING</option><option value={InspectionStatus.COMPLETED}>COMPLETED</option><option value={InspectionStatus.APPROVED}>APPROVED</option><option value={InspectionStatus.FLAGGED}>FLAGGED</option></select></div>
                  </div>
                  <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex gap-3 shrink-0"><button onClick={resetFilters} className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" /> Reset</button><button onClick={() => setShowFilterModal(false)} className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-blue-500/30 active:scale-95">Xác nhận</button></div>
              </div>
          </div>
      )}
    </div>
  );
};
