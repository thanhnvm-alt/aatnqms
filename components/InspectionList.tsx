
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, Workshop, ModuleId, User } from '../types';
import { exportInspections, deleteInspection } from '../services/apiService';
import { formatDisplayDate } from '../lib/utils';
import { 
  Search, RefreshCw, FolderOpen, Clock, 
  Loader2, X, ChevronDown, ChevronRight,
  Filter, Building2, SlidersHorizontal,
  PackageCheck, Factory, Truck, Box, ShieldCheck, MapPin,
  Calendar, RotateCcw, CheckCircle2, AlertOctagon, UserCheck, LayoutGrid,
  ClipboardList, AlertTriangle, Info, User as UserIcon, CheckCircle,
  CalendarDays, ArrowRight, Check, FileText, Download, Trash2
} from 'lucide-react';

interface InspectionListProps {
  inspections: Inspection[];
  onSelect: (id: string) => void;
  isLoading?: boolean;
  workshops?: Workshop[];
  onRefresh?: () => void;
  total?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  user: User;
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
  inspections, onSelect, isLoading, workshops = [], onRefresh, total = 0, page = 1, onPageChange, user
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelectAll = () => {
    if (selectedIds.size === inspections.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(inspections.map(i => i.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.size} phiếu đã chọn?`)) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => deleteInspection(id)));
      setSelectedIds(new Set());
      if (onRefresh) onRefresh();
      alert('Đã xóa thành công các phiếu đã chọn.');
    } catch (error) {
      console.error('Bulk delete failed:', error);
      alert('Lỗi khi xóa hàng loạt: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const [filterQC, setFilterQC] = useState<string[]>([]);
  const [filterWorkshop, setFilterWorkshop] = useState<string[]>([]);
  const [filterProject, setFilterProject] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filterOptions = useMemo(() => ({
      inspectors: Array.from(new Set(inspections.map(i => i.inspectorName).filter(Boolean))).sort(),
      workshops: Array.from(new Set(inspections.map(i => i.workshop).filter(Boolean))).sort(),
      projects: Array.from(new Set(inspections.map(i => i.ma_ct).filter(Boolean))).sort(),
      statuses: [InspectionStatus.DRAFT, InspectionStatus.PENDING, InspectionStatus.COMPLETED, InspectionStatus.APPROVED, InspectionStatus.FLAGGED]
  }), [inspections]);

  const isFilterActive = filterQC.length > 0 || filterWorkshop.length > 0 || filterProject.length > 0 || filterStatus.length > 0 || startDate !== '' || endDate !== '';

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportInspections();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Lỗi khi xuất file Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const groupedData = useMemo(() => {
    const groups: Record<string, Record<string, { 
        projectName: string, 
        items: Inspection[]
    }>> = {};

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
        if (filterProject.length > 0 && !filterProject.includes(item.ma_ct || '')) return false;
        if (filterStatus.length > 0 && !filterStatus.includes(item.status)) return false;
        if (startDate && item.date < startDate) return false;
        if (endDate && item.date > endDate) return false;
        return true;
    });

    filtered.forEach(item => {
        const dateKey = formatDisplayDate(item.date) || 'KHÔNG RÕ NGÀY';
        const pKey = item.ma_ct || 'DÙNG CHUNG';
        
        if (!groups[dateKey]) {
            groups[dateKey] = {};
        }

        if (!groups[dateKey][pKey]) {
            groups[dateKey][pKey] = { 
                projectName: item.ten_ct || (pKey === 'DÙNG CHUNG' ? 'DANH MỤC DÙNG CHUNG' : 'DỰ ÁN KHÁC'), 
                items: [] 
            };
        }
        groups[dateKey][pKey].items.push(item);
    });

    return groups;
  }, [inspections, searchTerm, filterQC, filterWorkshop, filterProject, filterStatus, startDate, endDate]);

  const toggleProject = (dateKey: string, pKey: string) => {
    const key = `${dateKey}_${pKey}`;
    setExpandedProjects(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] no-scroll-x" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* BULK ACTION BAR */}
      {user.role === 'ADMIN' && selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-4 right-4 bg-white border border-slate-200 p-4 rounded-2xl shadow-xl flex items-center justify-between z-50 animate-in slide-in-from-bottom-10">
          <span className="text-xs font-black text-slate-800 uppercase">Đã chọn {selectedIds.size} phiếu</span>
          <button 
            onClick={handleBulkDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-black uppercase hover:bg-red-700 transition-all active:scale-95"
          >
            <Trash2 className="w-4 h-4" /> Xóa hàng loạt
          </button>
        </div>
      )}

      {/* COMPACT TOOLBAR */}
      <div className="shrink-0 bg-white px-4 py-3 border-b border-slate-200 z-30 shadow-sm">
          <div className="max-w-7xl mx-auto space-y-3">
              <div className="flex gap-2">
                  {user.role === 'ADMIN' && (
                    <button 
                      onClick={toggleSelectAll}
                      className="p-2.5 bg-white text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-95"
                    >
                      {selectedIds.size === inspections.length && inspections.length > 0 ? <CheckCircle2 className="w-5 h-5 text-blue-600" /> : <LayoutGrid className="w-5 h-5" />}
                    </button>
                  )}
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
                  {user.role !== 'QC' && (
                    <button 
                      onClick={handleExport}
                      disabled={isExporting}
                      title="Xuất Excel"
                      className="p-2.5 bg-white text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                    </button>
                  )}
              </div>
              
              {isFilterOpen && (
                  <div className="bg-white rounded-2xl p-4 border border-slate-200 animate-in slide-in-from-top duration-200 grid grid-cols-1 md:grid-cols-4 gap-3 mt-3 shadow-sm">
                      <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">QC KIỂM TRA</label>
                          <select value={filterQC[0] || 'ALL'} onChange={e => setFilterQC(e.target.value === 'ALL' ? [] : [e.target.value])} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black uppercase">
                              <option value="ALL">- TẤT CẢ -</option>
                              {filterOptions.inspectors.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                      </div>
                      <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">XƯỞNG SẢN XUẤT</label>
                          <select value={filterWorkshop[0] || 'ALL'} onChange={e => setFilterWorkshop(e.target.value === 'ALL' ? [] : [e.target.value])} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black uppercase">
                              <option value="ALL">- TẤT CẢ -</option>
                              {filterOptions.workshops.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                      </div>
                      <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">MÃ DỰ ÁN</label>
                          <select value={filterProject[0] || 'ALL'} onChange={e => setFilterProject(e.target.value === 'ALL' ? [] : [e.target.value])} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black uppercase">
                              <option value="ALL">- TẤT CẢ -</option>
                              {filterOptions.projects.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                      </div>
                      <div className="flex items-end">
                          <button onClick={() => { setFilterQC([]); setFilterWorkshop([]); setFilterProject([]); setFilterStatus([]); setSearchTerm(''); setIsFilterOpen(false); }} className="w-full p-2 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase hover:bg-blue-100 transition-colors border border-blue-200">XÓA BỘ LỌC</button>
                      </div>
                  </div>
              )}
          </div>
      </div>

      {/* COMPACT LIST CONTENT */}
      <div className="flex-1 overflow-y-auto p-3 no-scrollbar pb-24">
        <div className="max-w-7xl mx-auto space-y-2">
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                    <p className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Đang tải dữ liệu...</p>
                </div>
            ) : Object.keys(groupedData).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                    <FolderOpen className="w-16 h-16 opacity-10 mb-2" />
                    <p className="font-black uppercase tracking-widest text-[10px]">Không tìm thấy dữ liệu</p>
                </div>
            ) : (
                Object.keys(groupedData).map(dateKey => {
                    const dateGroup = groupedData[dateKey];
                    return (
                        <div key={dateKey} className="space-y-4 mb-8">
                            <div className="flex items-center gap-2 px-2 pb-1 border-b-2 border-slate-200 inline-flex">
                                <CalendarDays className="w-4 h-4 text-blue-600" />
                                <h2 className="font-black text-slate-700 text-[13px] uppercase tracking-widest">{dateKey}</h2>
                            </div>
                            
                            <div className="space-y-4">
                                {Object.keys(dateGroup).map(pKey => {
                                    const project = dateGroup[pKey];
                                    const expKey = `${dateKey}_${pKey}`;
                                    const isExpanded = expandedProjects.has(expKey) || searchTerm.length > 0;
                                    
                                    return (
                                        <div key={expKey} className="space-y-1">
                                            {/* PROJECT HEADER */}
                                            <div 
                                                onClick={() => toggleProject(dateKey, pKey)}
                                                className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all ${isExpanded ? 'bg-blue-50 text-blue-900 border-blue-100 shadow-sm' : 'bg-white border border-slate-100 shadow-sm hover:border-blue-200'}`}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={`p-2 rounded-xl shrink-0 ${isExpanded ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                                                        <Building2 className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="font-black text-[11px] uppercase tracking-tight truncate text-slate-800">{pKey}</h3>
                                                        <p className={`text-[8px] font-bold uppercase truncate ${isExpanded ? 'text-blue-500' : 'text-slate-400'}`}>{project.projectName}</p>
                                                    </div>
                                                </div>
                                                <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180 text-blue-600' : 'text-slate-300'}`} />
                                            </div>

                                            {/* PROJECT ITEMS (TABLE VIEW) */}
                                            {isExpanded && (
                                                <div className="pl-2 pr-1 py-2 overflow-x-auto">
                                                    <div className="min-w-[600px] border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
                                                        <table className="w-full text-left border-collapse">
                                                            <thead>
                                                                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase text-slate-500 tracking-widest">
                                                                    {user.role === 'ADMIN' && (
                                                                        <th className="p-3 w-10 text-center border-r border-slate-100">
                                                                            <CheckCircle className="w-4 h-4 mx-auto text-slate-300"/>
                                                                        </th>
                                                                    )}
                                                                    <th className="p-3 w-20 border-r border-slate-100">LOẠI</th>
                                                                    <th className="p-3 w-32 border-r border-slate-100">MÃ ĐỊNH DANH</th>
                                                                    <th className="p-3 border-r border-slate-100">HẠNG MỤC</th>
                                                                    <th className="p-3 w-32 border-r border-slate-100">QC KIỂM TRA</th>
                                                                    <th className="p-3 w-28 border-r border-slate-100">XƯỞNG/CĐ</th>
                                                                    <th className="p-3 w-28">TRẠNG THÁI</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {project.items.map((item, index) => {
                                                                    const cfg = MODULE_CONFIG[item.type || 'PQC'] || MODULE_CONFIG['PQC'];
                                                                    
                                                                    return (
                                                                        <tr 
                                                                            key={item.id} 
                                                                            className={`group hover:bg-blue-50/50 transition-colors cursor-pointer ${index < project.items.length - 1 ? 'border-b border-slate-100' : ''}`}
                                                                            onClick={() => onSelect(item.id)}
                                                                        >
                                                                            {user.role === 'ADMIN' && (
                                                                                <td className="p-3 text-center border-r border-slate-100" onClick={(e) => e.stopPropagation()}>
                                                                                    <input 
                                                                                        type="checkbox"
                                                                                        checked={selectedIds.has(item.id)}
                                                                                        onChange={() => toggleSelect(item.id)}
                                                                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                                                    />
                                                                                </td>
                                                                            )}
                                                                            <td className="p-3 border-r border-slate-100">
                                                                                <div className="flex flex-col gap-1 inline-flex">
                                                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black ${cfg.bg} ${cfg.color} inline-block uppercase text-center border shadow-sm`}>{cfg.label}</span>
                                                                                    <span className="text-[8px] font-mono text-slate-400">#{item.id.split('-').pop()}</span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="p-3 border-r border-slate-100 text-[10px] font-bold text-slate-700">
                                                                                {item.ma_nha_may || item.headcode || '---'}
                                                                            </td>
                                                                            <td className="p-3 border-r border-slate-100">
                                                                                <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight group-hover:text-blue-700 transition-colors">{item.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ'}</p>
                                                                            </td>
                                                                            <td className="p-3 border-r border-slate-100">
                                                                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                                                    <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                                                                        <UserIcon className="w-3 h-3 text-slate-500" />
                                                                                    </div>
                                                                                    <span className="text-[10px] font-bold text-slate-700 uppercase truncate">{item.inspectorName || '---'}</span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="p-3 border-r border-slate-100 text-[10px] font-bold text-slate-600 uppercase">
                                                                                {item.workshop || '---'}
                                                                            </td>
                                                                            <td className="p-3">
                                                                                <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border tracking-tighter block text-center ${
                                                                                    item.status === InspectionStatus.APPROVED ? 'bg-green-50 text-green-700 border-green-200' :
                                                                                    item.status === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-700 border-red-200' :
                                                                                    'bg-slate-50 text-slate-500 border-slate-200'
                                                                                }`}>
                                                                                    {item.status}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })
            )}

            {/* PAGINATION CONTROLS */}
            {total > 0 && onPageChange && (
                <div className="flex items-center justify-between px-2 py-6 border-t border-slate-100 mt-4">
                    <button 
                        disabled={page <= 1 || isLoading}
                        onClick={() => onPageChange(page - 1)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 disabled:opacity-30 active:scale-95 transition-all"
                    >
                        Trang trước
                    </button>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trang {page}</span>
                        <span className="text-[8px] font-bold text-slate-300 uppercase">Tổng {total} phiếu</span>
                    </div>
                    <button 
                        disabled={page * 20 >= total || isLoading}
                        onClick={() => onPageChange(page + 1)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 disabled:opacity-30 active:scale-95 transition-all"
                    >
                        Trang sau
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
