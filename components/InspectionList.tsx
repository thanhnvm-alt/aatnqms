import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Inspection, InspectionStatus, Priority, ModuleId } from '../types';
import { ALL_MODULES } from '../constants';
import { QRScannerModal } from './QRScannerModal';
import { 
  Search, Filter, X, ChevronDown, ChevronRight, Layers, 
  RefreshCw, QrCode, FileDown, FolderOpen, Clock, Tag, 
  UserCheck, Briefcase, Loader2, Calendar, FileText
} from 'lucide-react';

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
  const [filter, setFilter] = useState<'ALL' | 'FLAGGED' | 'HIGH_PRIORITY' | 'DRAFT' | 'MY_REPORTS'>('ALL');
  const [selectedInspector, setSelectedInspector] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  const [showModuleMenu, setShowModuleMenu] = useState(false);
  const [showInspectorMenu, setShowInspectorMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  const moduleMenuRef = useRef<HTMLDivElement>(null);
  const inspectorMenuRef = useRef<HTMLDivElement>(null);

  const isQC = userRole === 'QC';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moduleMenuRef.current && !moduleMenuRef.current.contains(event.target as Node)) setShowModuleMenu(false);
      if (inspectorMenuRef.current && !inspectorMenuRef.current.contains(event.target as Node)) setShowInspectorMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const inspectors = useMemo(() => {
    const safeInsps = Array.isArray(inspections) ? inspections : [];
    const unique = new Set(safeInsps.filter(i => i && i.inspectorName).map(i => i.inspectorName));
    return Array.from(unique).sort();
  }, [inspections]);

  const filteredInspections = useMemo(() => {
    const safeInsps = Array.isArray(inspections) ? inspections : [];
    return safeInsps
      .filter(item => {
        if (!item) return false;
        if (selectedModule && selectedModule !== 'ALL' && item.type !== selectedModule) return false;
        const term = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm || 
          String(item.ma_ct || '').toLowerCase().includes(term) ||
          String(item.ten_ct || '').toLowerCase().includes(term) ||
          String(item.inspectorName || '').toLowerCase().includes(term) ||
          String(item.ten_hang_muc || '').toLowerCase().includes(term) ||
          String(item.ma_nha_may || '').toLowerCase().includes(term);
        if (!matchesSearch) return false;
        if (startDate && item.date < startDate) return false;
        if (endDate && item.date > endDate) return false;
        if (selectedInspector !== 'ALL' && item.inspectorName !== selectedInspector) return false;
        if (!isQC) {
            if (filter === 'MY_REPORTS' && (item.inspectorName || '').toLowerCase() !== currentUserName?.toLowerCase()) return false;
            if (filter === 'FLAGGED' && item.status !== InspectionStatus.FLAGGED) return false;
            if (filter === 'HIGH_PRIORITY' && item.priority !== Priority.HIGH) return false;
            if (filter === 'DRAFT' && item.status !== InspectionStatus.DRAFT) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inspections, searchTerm, filter, selectedInspector, startDate, endDate, currentUserName, selectedModule, isQC]);

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

  const handleExport = async () => {
      setIsExporting(true);
      try {
          // @ts-ignore
          const XLSX = await import('https://esm.sh/xlsx@0.18.5');
          const exportData = filteredInspections.map(item => ({
              'Mã dự án': item.ma_ct,
              'Tên công trình': item.ten_ct,
              'Mã nhà máy': item.ma_nha_may,
              'Tên hạng mục': item.ten_hang_muc,
              'Người kiểm tra': item.inspectorName,
              'Ngày kiểm tra': item.date,
              'Điểm số': item.score,
              'Trạng thái': item.status,
              'Xưởng': item.workshop
          }));
          const ws = XLSX.utils.json_to_sheet(exportData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Inspections");
          XLSX.writeFile(wb, `Bao_cao_QC_AATN_${new Date().toISOString().split('T')[0]}.xlsx`);
      } catch (e) { alert("Lỗi khi xuất file Excel"); } finally { setIsExporting(false); }
  };

  const currentModuleName = selectedModule === 'ALL' || !selectedModule 
    ? 'TẤT CẢ MODULE' 
    : ALL_MODULES.find(m => m.id === selectedModule)?.label || selectedModule;

  const clearFilters = () => {
    setSearchTerm('');
    setFilter('ALL');
    setSelectedInspector('ALL');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
      {/* Fixed Sub-Header for Search & Actions */}
      <div className="bg-white border-b border-slate-200 z-40 sticky top-0 shadow-sm px-4 py-3 shrink-0">
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" placeholder="Tìm Mã NM, Sản phẩm, QC..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-10 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-blue-100/50 transition-all shadow-inner"
              />
              <button 
                onClick={() => setShowScanner(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-white text-blue-600 rounded-lg shadow-sm border border-slate-100 active:scale-90"
              >
                <QrCode className="w-4 h-4" />
              </button>
            </div>
            <button onClick={onRefresh} className="p-2.5 text-slate-500 bg-slate-100 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-all">
                <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              <button onClick={handleExport} disabled={isExporting} className="whitespace-nowrap px-3 py-1.5 rounded-lg flex items-center gap-2 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase border border-indigo-100 shadow-sm active:scale-95 transition-all">
                  {isExporting ? <Loader2 className="w-3 h-3 animate-spin"/> : <FileDown className="w-3.5 h-3.5" />}
                  <span>Xuất Excel</span>
              </button>

              {!isQC && (
                  <div className="relative" ref={moduleMenuRef}>
                      <button onClick={() => setShowModuleMenu(!showModuleMenu)} className={`whitespace-nowrap px-3 py-1.5 rounded-lg flex items-center gap-2 border text-[10px] font-black uppercase transition-all shadow-sm ${selectedModule && selectedModule !== 'ALL' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                          <Layers className="w-3 h-3" />
                          <span className="truncate max-w-[100px]">{currentModuleName}</span>
                      </button>
                      {showModuleMenu && (
                          <div className="absolute left-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 origin-top-left max-h-[60vh] overflow-y-auto shadow-2xl">
                              <button onClick={() => { onModuleChange?.('ALL'); setShowModuleMenu(false); }} className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase hover:bg-slate-50">TẤT CẢ MODULE</button>
                              {ALL_MODULES.filter(m => m.group === 'QC' || m.group === 'QA').map((mod) => (
                                  <button key={mod.id} onClick={() => { onModuleChange?.(mod.id); setShowModuleMenu(false); }} className={`w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase hover:bg-slate-50 ${selectedModule === mod.id ? 'text-blue-600 bg-blue-50' : 'text-slate-600'}`}>{mod.label}</button>
                              ))}
                          </div>
                      )}
                  </div>
              )}

              <div className="relative" ref={inspectorMenuRef}>
                  <button onClick={() => setShowInspectorMenu(!showInspectorMenu)} className={`whitespace-nowrap px-3 py-1.5 rounded-lg flex items-center gap-2 border text-[10px] font-black uppercase transition-all shadow-sm ${selectedInspector !== 'ALL' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                      <UserCheck className="w-3.5 h-3.5" />
                      <span className="truncate max-w-[100px]">{selectedInspector === 'ALL' ? 'QC THỰC HIỆN' : selectedInspector}</span>
                  </button>
                  {showInspectorMenu && (
                      <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-xl shadow-2xl border border-slate-100 py-2 z-50 max-h-[60vh] overflow-y-auto">
                          <button onClick={() => { setSelectedInspector('ALL'); setShowInspectorMenu(false); }} className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase hover:bg-slate-50 border-b border-slate-50">TẤT CẢ QC</button>
                          {inspectors.map((name) => (
                              <button key={name} onClick={() => { setSelectedInspector(name); setShowInspectorMenu(false); }} className={`w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase hover:bg-slate-50`}>{name}</button>
                          ))}
                      </div>
                  )}
              </div>

              {(searchTerm || selectedInspector !== 'ALL' || startDate || endDate) && (
                <button onClick={clearFilters} className="whitespace-nowrap px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[10px] font-black uppercase border border-red-100 flex items-center gap-1">
                  <X className="w-3 h-3"/> Xóa lọc
                </button>
              )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
            <p className="font-black uppercase tracking-widest text-[10px]">Đang tải báo cáo...</p>
          </div>
        ) : pagedProjectCodes.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center bg-white rounded-[2rem] border border-dashed border-slate-200 mx-1">
            <Briefcase className="w-12 h-12 text-slate-300 mb-4 opacity-50" />
            <p className="font-black uppercase text-slate-400 text-xs tracking-widest">Không có báo cáo phù hợp</p>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto space-y-4 pb-20">
            {pagedProjectCodes.map(projectCode => {
              const groupItems = groupedItems[projectCode];
              const isExpanded = expandedGroups.has(projectCode);
              const firstItem = groupItems[0];
              
              return (
                <div key={projectCode} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-all hover:shadow-md">
                  <div 
                    onClick={() => setExpandedGroups(prev => {const next = new Set(prev); if (next.has(projectCode)) next.delete(projectCode); else next.add(projectCode); return next;})} 
                    className={`p-4 cursor-pointer flex items-center justify-between transition-colors ${isExpanded ? 'bg-blue-50/50' : 'bg-white active:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`p-2.5 rounded-xl shrink-0 ${isExpanded ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          <FolderOpen className="w-5 h-5" />
                      </div>
                      <div className="overflow-hidden">
                        <h3 className="font-black text-sm text-slate-900 uppercase tracking-tight truncate leading-tight">{projectCode}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">{firstItem.ten_ct || 'Tên công trình chưa cập nhật'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[9px] font-black bg-slate-200/50 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">{groupItems.length}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="divide-y divide-slate-100 border-t border-slate-100">
                      {groupItems.map(item => (
                        <div key={item.id} onClick={() => onSelect(item.id)} className="p-4 bg-white active:bg-blue-50 transition-all cursor-pointer flex items-center justify-between group">
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                {item.ma_nha_may && (
                                    <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 uppercase flex items-center gap-1 shrink-0 shadow-sm">
                                        <Tag className="w-3 h-3" /> {item.ma_nha_may}
                                    </span>
                                )}
                                <h4 className="font-black text-slate-800 text-[13px] truncate uppercase tracking-tight leading-tight flex-1">
                                    {item.ten_hang_muc || 'Hạng mục QC'}
                                </h4>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                               <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border shadow-sm ${item.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-200' : item.status === 'FLAGGED' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                                   {item.status}
                               </span>
                               <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                   <Clock className="w-3 h-3"/> {item.date}
                               </span>
                               <span className="text-[9px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 uppercase flex items-center gap-1">
                                   <UserCheck className="w-3 h-3" /> {item.inspectorName}
                               </span>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {sortedProjectCodes.length > PROJECTS_PER_PAGE && (
          <div className="flex justify-center gap-4 py-6">
              <button disabled={currentPage === 1} onClick={() => {setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo(0,0);}} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl shadow-sm disabled:opacity-30 active:scale-90"><ChevronDown className="w-6 h-6 rotate-90" /></button>
              <div className="flex items-center px-6 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-500 uppercase tracking-widest shadow-sm">Trang {currentPage}</div>
              <button disabled={currentPage >= Math.ceil(sortedProjectCodes.length / PROJECTS_PER_PAGE)} onClick={() => {setCurrentPage(p => p + 1); window.scrollTo(0,0);}} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl shadow-sm disabled:opacity-30 active:scale-90"><ChevronDown className="w-6 h-6 -rotate-90" /></button>
          </div>
        )}
      </div>

      {showScanner && (
        <QRScannerModal 
          onClose={() => setShowScanner(false)} 
          onScan={(data) => {
            setSearchTerm(data);
            setShowScanner(false);
          }} 
        />
      )}
    </div>
  );
};