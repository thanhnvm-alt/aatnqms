import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, ModuleId } from '../types';
import { ALL_MODULES } from '../constants';
import { QRScannerModal } from './QRScannerModal';
import { 
  Search, RefreshCw, QrCode, FolderOpen, Clock, Tag, 
  UserCheck, Briefcase, Loader2, Calendar, FileText, Camera,
  Factory, SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight, X,
  CheckCircle2, AlertCircle, FileEdit, Filter
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
  
  // Pending Filter States (Local to Dropdowns)
  const [status, setStatus] = useState<string>('ALL');
  const [type, setType] = useState<string>('ALL');
  const [inspector, setInspector] = useState<string>('ALL');
  const [workshop, setWorkshop] = useState<string>('ALL');
  const [datePreset, setDatePreset] = useState<string>('ALL');

  // Applied Filter States (Used for Logic)
  const [appliedFilters, setAppliedFilters] = useState({
    status: 'ALL',
    type: 'ALL',
    inspector: 'ALL',
    workshop: 'ALL',
    datePreset: 'ALL'
  });

  // UI States
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  const [isQuickCapturing, setIsQuickCapturing] = useState<string | null>(null);
  const quickCameraRef = useRef<HTMLInputElement>(null);

  // Derive unique values for dropdowns from data
  const inspectors = useMemo(() => {
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
    // Sync with App's module change if needed
    if (onModuleChange) {
      onModuleChange(type);
    }
  };

  const clearFilters = () => {
    setStatus('ALL');
    setType('ALL');
    setInspector('ALL');
    setWorkshop('ALL');
    setDatePreset('ALL');
    setAppliedFilters({
      status: 'ALL',
      type: 'ALL',
      inspector: 'ALL',
      workshop: 'ALL',
      datePreset: 'ALL'
    });
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
      
      // 1. Text Search - Added Safe Guards for Null/Undefined properties
      if (term && !(
        (item.ma_ct || '').toLowerCase().includes(term) ||
        (item.ten_ct || '').toLowerCase().includes(term) ||
        (item.ma_nha_may || '').toLowerCase().includes(term) ||
        (item.ten_hang_muc || '').toLowerCase().includes(term) ||
        (item.inspectorName || '').toLowerCase().includes(term)
      )) return false;

      // 2. Status Filter
      if (appliedFilters.status !== 'ALL' && item.status !== appliedFilters.status) return false;

      // 3. Type Filter
      if (appliedFilters.type !== 'ALL') {
        const targetType = appliedFilters.type.toUpperCase();
        const itemType = (item.type || '').toUpperCase();
        
        if (targetType === 'SQC') {
            if (!itemType.includes('SQC')) return false;
        } else if (targetType === 'FRS') {
            if (itemType !== 'FSR') return false;
        } else if (targetType === 'SITE') {
            if (itemType !== 'SITE') return false;
        } else {
            if (itemType !== targetType) return false;
        }
      }

      // 4. Inspector Filter
      if (appliedFilters.inspector !== 'ALL' && item.inspectorName !== appliedFilters.inspector) return false;

      // 5. Workshop Filter
      if (appliedFilters.workshop !== 'ALL' && item.workshop !== appliedFilters.workshop) return false;

      // 6. Time Preset Filter
      if (appliedFilters.datePreset !== 'ALL') {
        const itemDateStr = item.date || '';
        const itemDate = new Date(itemDateStr);
        if (appliedFilters.datePreset === 'Today') {
          if (itemDateStr !== todayStr) return false;
        } else if (appliedFilters.datePreset === 'Last 7 days') {
          const limit = new Date();
          limit.setDate(now.getDate() - 7);
          if (itemDate < limit) return false;
        } else if (appliedFilters.datePreset === 'Last 30 days') {
          const limit = new Date();
          limit.setDate(now.getDate() - 30);
          if (itemDate < limit) return false;
        } else if (appliedFilters.datePreset === 'This month') {
          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
          if (itemDate < firstDay) return false;
        }
      }

      return true;
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [inspections, searchTerm, appliedFilters]);

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

  const toggleGroup = (code: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const isFilterActive = appliedFilters.status !== 'ALL' || appliedFilters.type !== 'ALL' || appliedFilters.inspector !== 'ALL' || appliedFilters.workshop !== 'ALL' || appliedFilters.datePreset !== 'ALL';

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
      <input type="file" accept="image/*" capture="environment" ref={quickCameraRef} className="hidden" />
      
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
            </div>
            <button 
              onClick={() => setShowFiltersPanel(!showFiltersPanel)}
              className={`p-2.5 rounded-xl border transition-all shadow-sm flex items-center gap-2 ${showFiltersPanel || isFilterActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            >
              <SlidersHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase hidden md:inline">Bộ lọc</span>
              {isFilterActive && <div className="w-2 h-2 rounded-full bg-red-500 absolute -top-1 -right-1 border-2 border-white shadow-sm"></div>}
            </button>
            <button onClick={onRefresh} className="p-2.5 text-slate-500 bg-slate-100 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm">
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Collapsible Dropdown Filter Panel */}
          {showFiltersPanel && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 animate-in slide-in-from-top duration-300 space-y-4 shadow-inner">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                
                {/* 1. Status Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Trạng thái</label>
                  <div className="relative">
                    <select 
                      value={status} 
                      onChange={e => setStatus(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none appearance-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm"
                    >
                      <option value="ALL">Tất cả trạng thái</option>
                      <option value={InspectionStatus.DRAFT}>DRAFT</option>
                      <option value={InspectionStatus.COMPLETED}>COMPLETED</option>
                      <option value={InspectionStatus.FLAGGED}>FLAGGED</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* 2. Type Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Loại phiếu</label>
                  <div className="relative">
                    <select 
                      value={type} 
                      onChange={e => setType(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none appearance-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm"
                    >
                      <option value="ALL">Tất cả loại phiếu</option>
                      <option value="IQC">IQC</option>
                      <option value="SQC">SQC</option>
                      <option value="FRS">FRS</option>
                      <option value="PQC">PQC</option>
                      <option value="FQC">FQC</option>
                      <option value="SPR">SPR</option>
                      <option value="Site">Site</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* 3. QC Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">QC Người kiểm</label>
                  <div className="relative">
                    <select 
                      value={inspector} 
                      onChange={e => setInspector(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none appearance-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm"
                    >
                      <option value="ALL">Tất cả QC</option>
                      {inspectors.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* 4. Factory/Workshop Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Xưởng / Nhà máy</label>
                  <div className="relative">
                    <select 
                      value={workshop} 
                      onChange={e => setWorkshop(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none appearance-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm"
                    >
                      <option value="ALL">Tất cả xưởng</option>
                      {workshopsList.map(ws => <option key={ws} value={ws}>{ws}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* 5. Time Preset Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Thời gian</label>
                  <div className="relative">
                    <select 
                      value={datePreset} 
                      onChange={e => setDatePreset(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none appearance-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm"
                    >
                      <option value="ALL">Tất cả thời gian</option>
                      <option value="Today">Today</option>
                      <option value="Last 7 days">Last 7 days</option>
                      <option value="Last 30 days">Last 30 days</option>
                      <option value="This month">This month</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end items-center gap-3 pt-2 border-t border-slate-200">
                <button 
                  onClick={clearFilters} 
                  className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-500 transition-colors px-4 py-2"
                >
                  Xóa bộ lọc
                </button>
                <button 
                  onClick={handleApplyFilters}
                  className="bg-blue-600 text-white px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] shadow-lg shadow-blue-500/30 active:scale-95 transition-all flex items-center gap-2"
                >
                  <Filter className="w-3 h-3" /> Áp dụng bộ lọc
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
            <p className="font-black uppercase tracking-widest text-[10px]">Đang tải dữ liệu...</p>
          </div>
        ) : pagedProjectCodes.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center bg-white rounded-[2rem] border border-dashed border-slate-200 mx-1">
            <Briefcase className="w-12 h-12 text-slate-300 mb-4 opacity-50" />
            <p className="font-black uppercase text-slate-400 text-xs tracking-widest">Không tìm thấy báo cáo phù hợp</p>
            <button onClick={clearFilters} className="mt-4 text-blue-600 font-bold text-[10px] uppercase tracking-widest border border-blue-200 px-4 py-2 rounded-xl hover:bg-blue-50">Xóa bộ lọc</button>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto space-y-4 pb-20">
            {pagedProjectCodes.map(projectCode => {
              const groupItems = groupedItems[projectCode];
              const isExpanded = expandedGroups.has(projectCode);
              const firstItem = groupItems[0];
              
              return (
                <div key={projectCode} className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm transition-all hover:shadow-md">
                  <div 
                    onClick={() => toggleGroup(projectCode)} 
                    className={`p-5 cursor-pointer flex items-center justify-between transition-colors ${isExpanded ? 'bg-blue-50/40 border-b border-blue-100' : 'bg-white active:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-4 overflow-hidden">
                      <div className={`p-3 rounded-2xl shrink-0 ${isExpanded ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-slate-100 text-slate-400'}`}>
                          <FolderOpen className="w-5 h-5" />
                      </div>
                      <div className="overflow-hidden">
                        <h3 className="font-black text-sm text-slate-900 uppercase tracking-tight truncate leading-tight">{projectCode}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">{firstItem.ten_ct || 'Tên công trình chưa cập nhật'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] font-black bg-slate-200/50 text-slate-500 px-3 py-1 rounded-full border border-slate-200">{groupItems.length} QC</span>
                      <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="divide-y divide-slate-100 bg-slate-50/30">
                      {groupItems.map(item => (
                        <div key={item.id} onClick={() => onSelect(item.id)} className="p-4 md:p-5 bg-white active:bg-blue-50 transition-all cursor-pointer flex items-center justify-between group">
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                {item.ma_nha_may && (
                                    <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 uppercase flex items-center gap-1 shrink-0">
                                        <Tag className="w-3 h-3" /> {item.ma_nha_may}
                                    </span>
                                )}
                                <h4 className="font-bold text-slate-800 text-sm truncate uppercase tracking-tight leading-tight flex-1">
                                    {item.ten_hang_muc || 'Hạng mục QC'}
                                </h4>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                               <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border shadow-sm ${
                                   item.status === InspectionStatus.APPROVED ? 'bg-green-50 text-green-700 border-green-200' : 
                                   item.status === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-700 border-red-200' : 
                                   item.status === InspectionStatus.DRAFT ? 'bg-slate-100 text-slate-500 border-slate-200' :
                                   'bg-orange-50 text-orange-700 border-orange-200'
                               }`}>
                                   {item.status}
                               </div>
                               <div className="flex items-center gap-1 text-[9px] font-black text-indigo-600 uppercase tracking-tighter bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                   <FileText className="w-3 h-3" /> {item.type || 'QC'}
                               </div>
                               <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                                   <Clock className="w-3.5 h-3.5 text-slate-300"/> {item.date}
                               </div>
                               <div className="text-[10px] font-black text-blue-500 uppercase flex items-center gap-1.5">
                                   <div className="w-4 h-4 rounded-full overflow-hidden border border-blue-100 bg-blue-50 flex items-center justify-center shrink-0">
                                      <UserCheck className="w-2.5 h-2.5" />
                                   </div>
                                   {item.inspectorName || 'N/A'}
                               </div>
                               {item.workshop && (
                                   <div className="text-[10px] font-black text-emerald-600 uppercase flex items-center gap-1.5">
                                       <Factory className="w-3.5 h-3.5 opacity-40" /> {item.workshop}
                                   </div>
                               )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                              <div className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-300 group-hover:text-blue-600 group-hover:border-blue-200 group-hover:bg-blue-50 transition-all">
                                 <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                              </div>
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

        {/* Improved Pagination Controls */}
        {sortedProjectCodes.length > PROJECTS_PER_PAGE && (
          <div className="flex justify-center gap-4 py-8">
              <button 
                disabled={currentPage === 1} 
                onClick={() => {setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' });}} 
                className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl shadow-sm disabled:opacity-30 active:scale-90 transition-all hover:border-blue-300"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <div className="flex items-center px-8 bg-white border border-slate-200 rounded-2xl text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] shadow-sm">
                Trang {currentPage} / {Math.ceil(sortedProjectCodes.length / PROJECTS_PER_PAGE)}
              </div>
              <button 
                disabled={currentPage >= Math.ceil(sortedProjectCodes.length / PROJECTS_PER_PAGE)} 
                onClick={() => {setCurrentPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' });}} 
                className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl shadow-sm disabled:opacity-30 active:scale-90 transition-all hover:border-blue-300"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
          </div>
        )}
      </div>

      {/* Scanner Modal Integration */}
      {showScanner && (
        <QRScannerModal 
          onClose={() => setShowScanner(false)} 
          onScan={(data) => {
            setSearchTerm(data);
            setShowScanner(false);
          }} 
          title="Tìm kiếm thông minh"
          subtitle="Quét mã QR để lọc nhanh báo cáo của sản phẩm"
        />
      )}
    </div>
  );
};