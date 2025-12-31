
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Inspection, InspectionStatus, Priority, ModuleId } from '../types';
import { 
  Building2, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  Search, 
  Filter, 
  X, 
  ChevronDown,
  ArrowUp,
  LayoutGrid,
  Clock,
  ChevronRight,
  Layers,
  Zap,
  Plus,
  FileDown,
  SlidersHorizontal,
  MapPin,
  Hash,
  FolderOpen,
  ChevronLeft,
  Briefcase,
  Loader2,
  Upload,
  ArrowRight,
  RefreshCw,
  User
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
}

const PROJECTS_PER_PAGE = 10;

const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const HighlightedText: React.FC<{ text: string; highlight: string; className?: string }> = ({ text, highlight, className = "" }) => {
  if (!highlight.trim()) return <span className={className}>{text}</span>;
  
  try {
    const keywords = highlight.trim().split(/\s+/).filter(k => k.length > 0);
    if (keywords.length === 0) return <span className={className}>{text}</span>;

    const escapedKeywords = keywords.map(escapeRegExp);
    const regex = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');
    const parts = String(text).split(regex);
    
    return (
      <span className={className}>
        {parts.map((part, i) => 
          regex.test(part) ? (
            <mark key={i} className="bg-yellow-300 text-slate-900 rounded-sm px-0.5 font-bold shadow-sm">{part}</mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  } catch (e) {
    return <span className={className}>{text}</span>;
  }
};

export const InspectionList: React.FC<InspectionListProps> = ({ 
  inspections, 
  allInspections = [], 
  onSelect, 
  currentModuleLabel = "Module", 
  userRole,
  selectedModule,
  onModuleChange,
  visibleModules = [],
  onImportInspections,
  onRefresh,
  currentUserName
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'FLAGGED' | 'HIGH_PRIORITY' | 'DRAFT' | 'MY_REPORTS'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isQC = userRole === 'QC';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filter, startDate, endDate, selectedModule]);

  useEffect(() => {
    if (listContainerRef.current) {
        listContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage]);

  useEffect(() => {
    if (searchTerm.trim() !== '') {
    } else {
        setExpandedGroups(new Set());
    }
  }, [searchTerm]);

  const getStatusColor = (status: InspectionStatus) => {
    switch (status) {
      case InspectionStatus.COMPLETED: return 'bg-green-600 text-white border-green-600';
      case InspectionStatus.FLAGGED: return 'bg-red-600 text-white border-red-600';
      case InspectionStatus.APPROVED: return 'bg-blue-600 text-white border-blue-600';
      default: return 'bg-slate-200 text-slate-600 border-slate-200'; // Draft
    }
  };

  const getStatusLabel = (status: InspectionStatus) => {
      switch (status) {
          case InspectionStatus.COMPLETED: return 'ĐẠT';
          case InspectionStatus.FLAGGED: return 'LỖI';
          case InspectionStatus.APPROVED: return 'OK';
          default: return 'NHÁP';
      }
  };

  const filteredInspections = useMemo(() => {
    return inspections
      .filter(item => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = 
          String(item.ma_ct || '').toLowerCase().includes(term) ||
          String(item.ten_ct || '').toLowerCase().includes(term) ||
          String(item.inspectorName || '').toLowerCase().includes(term) ||
          String(item.ten_hang_muc || '').toLowerCase().includes(term) ||
          String(item.ma_nha_may || '').toLowerCase().includes(term);
        
        if (!matchesSearch) return false;

        if (filter === 'MY_REPORTS') {
            if (!currentUserName) return false;
            // Case insensitive check for inspector name
            if ((item.inspectorName || '').toLowerCase() !== currentUserName.toLowerCase()) return false;
        }

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
        const code = item.ma_ct || 'CHƯA PHÂN LOẠI';
        if (!groups[code]) groups[code] = [];
        groups[code].push(item);
    });
    return groups;
  }, [filteredInspections]);

  const sortedProjectCodes = useMemo(() => {
      return Object.keys(groupedItems).sort((a, b) => {
          if (searchTerm) {
             const aName = groupedItems[a][0]?.ten_ct || '';
             const bName = groupedItems[b][0]?.ten_ct || '';
             const term = searchTerm.toLowerCase();
             const aMatch = a.toLowerCase().includes(term) || aName.toLowerCase().includes(term);
             const bMatch = b.toLowerCase().includes(term) || bName.toLowerCase().includes(term);
             if (aMatch && !bMatch) return -1;
             if (!aMatch && bMatch) return 1;
          }
          return groupedItems[b].length - groupedItems[a].length;
      });
  }, [groupedItems, searchTerm]);

  const totalPages = Math.ceil(sortedProjectCodes.length / PROJECTS_PER_PAGE);
  const pagedProjectCodes = useMemo(() => {
    const startIndex = (currentPage - 1) * PROJECTS_PER_PAGE;
    return sortedProjectCodes.slice(startIndex, startIndex + PROJECTS_PER_PAGE);
  }, [sortedProjectCodes, currentPage]);

  useEffect(() => {
      if (searchTerm.trim() !== '') {
          setExpandedGroups(new Set(pagedProjectCodes));
      }
  }, [pagedProjectCodes, searchTerm]);

  const toggleGroup = (code: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const getGroupStats = (items: Inspection[]) => {
      let pass = 0, fail = 0, draft = 0;
      items.forEach(i => {
          if (i.status === InspectionStatus.FLAGGED || (i.score && i.score < 70)) fail++;
          else if (i.status === InspectionStatus.DRAFT) draft++;
          else pass++;
      });
      return { total: items.length, pass, fail, draft };
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setFilter('ALL');
  };

  const handleExport = async (data: Inspection[], fileName: string) => {
    try {
      // @ts-ignore
      const XLSX = await import('https://esm.sh/xlsx@0.18.5');

      const exportData = data.map(item => {
        const inspected = item.inspectedQuantity || 0;
        const passed = item.passedQuantity || 0;
        const failed = item.failedQuantity || 0;
        
        const passRate = inspected > 0 ? ((passed / inspected) * 100).toFixed(1) + '%' : '0%';
        const failRate = inspected > 0 ? ((failed / inspected) * 100).toFixed(1) + '%' : '0%';

        return {
          'Mã phiếu': item.id,
          'Loại': item.type || 'N/A',
          'Mã dự án (ma_ct)': item.ma_ct,
          'Tên công trình': item.ten_ct,
          'Sản phẩm': item.ten_hang_muc || 'N/A',
          'Mã nhà máy (ma_nha_may)': item.ma_nha_may || 'N/A',
          'Xưởng sản xuất': item.workshop || '',
          'công đoạn': item.inspectionStage || '',
          'ĐVT': item.dvt || '',
          'SL IPO': item.so_luong_ipo || 0,
          'SLkiem': inspected,
          'SLDat': passed,
          'TLDat': passRate,
          'SLLoi': failed,
          'TLLoi': failRate,
          'QC kiểm tra': item.inspectorName,
          'Ngày kiểm tra': item.date
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Danh sách QC");

      ws['!cols'] = [
        { wch: 15 },
        { wch: 10 },
        { wch: 15 },
        { wch: 30 },
        { wch: 30 },
        { wch: 15 },
        { wch: 20 },
        { wch: 20 },
        { wch: 8 }, 
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 20 },
        { wch: 15 } 
      ];

      XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
      setShowExportMenu(false);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Lỗi khi xuất file Excel.");
    }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportInspections) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            // @ts-ignore
            const XLSX = await import('https://esm.sh/xlsx@0.18.5');

            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data: any[] = XLSX.utils.sheet_to_json(ws);

            if (data.length === 0) {
                alert("File không có dữ liệu.");
                setIsImporting(false);
                return;
            }

            const parsedInspections: Inspection[] = data.map((row: any, index: number) => {
                const mapStatus = (s: string) => {
                    if (!s) return InspectionStatus.DRAFT;
                    const u = s.toUpperCase();
                    if (u.includes('ĐẠT') || u.includes('OK') || u.includes('COMPLETED')) return InspectionStatus.COMPLETED;
                    if (u.includes('LỖI') || u.includes('NG') || u.includes('FLAGGED')) return InspectionStatus.FLAGGED;
                    if (u.includes('APPROVED')) return InspectionStatus.APPROVED;
                    return InspectionStatus.DRAFT;
                };

                const parseScore = (s: any) => {
                    const n = parseInt(String(s).replace('%', ''));
                    return isNaN(n) ? 0 : n;
                };

                return {
                    id: row['Mã phiếu'] || `IMP_${Date.now()}_${index}`,
                    type: row['Loại'] || (selectedModule !== 'ALL' ? selectedModule : 'SITE'),
                    ma_ct: row['Mã dự án (ma_ct)'] || row['Mã dự án'] || row['ma_ct'] || '',
                    ten_ct: row['Tên công trình'] || row['ten_ct'] || '',
                    ten_hang_muc: row['Sản phẩm'] || row['Tên sản phẩm'] || row['ten_hang_muc'] || '',
                    ma_nha_may: row['Mã nhà máy (ma_nha_may)'] || row['Mã nhà máy'] || row['ma_nha_may'] || '',
                    inspectorName: row['QC kiểm tra'] || row['Người kiểm tra'] || '',
                    date: row['Ngày kiểm tra'] ? String(row['Ngày kiểm tra']) : new Date().toISOString().split('T')[0],
                    score: parseScore(row['Điểm số'] || row['Điểm']),
                    status: mapStatus(row['Trạng thái']),
                    items: [],
                    priority: Priority.MEDIUM,
                    
                    workshop: row['Xưởng sản xuất'] || '',
                    inspectionStage: row['công đoạn'] || row['Công đoạn'] || '',
                    dvt: row['ĐVT'] || 'PCS',
                    so_luong_ipo: parseInt(row['SL IPO'] || 0),
                    inspectedQuantity: parseInt(row['SLkiem'] || 1),
                    passedQuantity: parseInt(row['SLDat'] || (mapStatus(row['Trạng thái']) === InspectionStatus.COMPLETED ? 1 : 0)),
                    failedQuantity: parseInt(row['SLLoi'] || (mapStatus(row['Trạng thái']) === InspectionStatus.FLAGGED ? 1 : 0)),
                } as Inspection;
            });

            if (window.confirm(`Tìm thấy ${parsedInspections.length} dòng dữ liệu. Bạn có muốn nhập vào hệ thống?`)) {
                await onImportInspections(parsedInspections);
                alert("Đã nhập dữ liệu thành công!");
            }
        } catch (err) {
            console.error(err);
            alert("Lỗi khi đọc file Excel.");
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };
    reader.readAsBinaryString(file);
  };

  const activeFilterCount = (startDate ? 1 : 0) + (endDate ? 1 : 0) + (filter !== 'ALL' ? 1 : 0);

  const FILTER_OPTIONS = [
    { label: 'Tất cả', value: 'ALL' },
    { label: 'Báo cáo của tôi', value: 'MY_REPORTS', icon: User },
    { label: 'Cần chú ý', value: 'FLAGGED', icon: AlertCircle },
    { label: 'Ưu tiên cao', value: 'HIGH_PRIORITY', icon: Zap },
    { label: 'Nháp', value: 'DRAFT' }
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 relative">
      <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx,.xls,.csv" className="hidden" />
      
      {/* Consolidated Header Bar */}
      <div className="bg-white px-2 py-2 border-b border-slate-200 shadow-sm z-30 shrink-0">
        <div className="flex flex-col gap-2">
            
            {/* Row 1: Search, Filter, Refresh */}
            <div className="flex items-center gap-2 w-full">
              {/* Search Box - Flex 1 */}
              <div className="relative group flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-blue-600 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Tìm mã, sản phẩm..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 h-9 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-400"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5"/></button>
                )}
              </div>

              {/* Filter Dropdown */}
              <div className="relative shrink-0" ref={filterMenuRef}>
                  <button
                      onClick={() => setShowFilterMenu(!showFilterMenu)}
                      className="h-9 w-9 bg-white border border-slate-200 rounded-lg flex items-center justify-center gap-2 text-[10px] font-bold text-slate-700 hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm"
                  >
                      <Filter className="w-3.5 h-3.5" />
                  </button>

                  {showFilterMenu && (
                      <div className="absolute top-full mt-1 right-0 w-48 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in duration-200 origin-top-right">
                          {FILTER_OPTIONS.map((f) => (
                              <button
                                  key={f.value}
                                  onClick={() => { setFilter(f.value as any); setShowFilterMenu(false); }}
                                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide transition-colors border-b border-slate-50 last:border-0 ${
                                      filter === f.value 
                                      ? 'bg-blue-50 text-blue-700' 
                                      : 'text-slate-600 hover:bg-slate-50'
                                  }`}
                              >
                                  {f.icon ? <f.icon className={`w-4 h-4 ${filter === f.value ? 'text-blue-500' : 'text-slate-400'}`} /> : <div className="w-4 h-4" />}
                                  {f.label}
                                  {filter === f.value && <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-blue-500" />}
                              </button>
                          ))}
                      </div>
                  )}
              </div>

              {/* Refresh Button */}
              <button 
                  onClick={onRefresh}
                  className="h-9 w-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-400 transition-all shrink-0 shadow-sm active:scale-95"
                  title="Tải lại dữ liệu"
              >
                  <RefreshCw className="w-4 h-4" />
              </button>

              {/* Import/Export Actions (Hidden on Mobile if not needed, or compact) */}
              {!isQC && (
                  <div className="flex items-center gap-2 shrink-0 hidden md:flex">
                      <div className="h-6 w-px bg-slate-200 mx-1"></div>
                      {onImportInspections && (
                          <button 
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isImporting}
                              className="h-9 w-9 md:w-auto md:px-3 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition-all active:scale-95"
                              title="Import Excel"
                          >
                              {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Upload className="w-3.5 h-3.5" />}
                              <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">Nhập</span>
                          </button>
                      )}

                      <div className="relative h-9" ref={exportMenuRef}>
                          <button 
                              onClick={() => setShowExportMenu(!showExportMenu)}
                              className="h-full w-9 md:w-auto md:px-3 bg-slate-900 text-white rounded-lg flex items-center justify-center gap-1.5 hover:bg-black transition-all active:scale-95 shadow-md"
                          >
                              <FileDown className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">Xuất</span>
                          </button>

                          {showExportMenu && (
                              <div className="absolute right-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in duration-200 origin-top-right">
                                  <button 
                                      onClick={() => handleExport(filteredInspections, `Bao_cao_${currentModuleLabel}`)}
                                      className="w-full flex items-center gap-2 px-3 py-2.5 text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors text-left font-bold text-xs"
                                  >
                                      <Layers className="w-3.5 h-3.5" />
                                      Xuất {currentModuleLabel}
                                  </button>
                                  <button 
                                      onClick={() => handleExport(allInspections, "Bao_cao_tong_hop_AATN")}
                                      className="w-full flex items-center gap-2 px-3 py-2.5 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors text-left font-bold text-xs"
                                  >
                                      <LayoutGrid className="w-3.5 h-3.5" />
                                      Xuất tất cả Module
                                  </button>
                              </div>
                          )}
                      </div>
                  </div>
              )}
            </div>

            {/* Row 2: Date Picker (Full Width) */}
            <div className="w-full">
               <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-2 h-9 w-full group focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-200">
                   <div className="flex items-center gap-2 flex-1">
                       <Calendar className="w-3.5 h-3.5 text-slate-400" />
                       <input 
                           type="date" 
                           value={startDate} 
                           onChange={(e) => setStartDate(e.target.value)} 
                           className="bg-transparent text-xs font-bold text-slate-600 outline-none w-full cursor-pointer" 
                       />
                   </div>
                   <span className="text-slate-300 mx-2">-</span>
                   <div className="flex items-center justify-end gap-2 flex-1">
                       <input 
                           type="date" 
                           value={endDate} 
                           onChange={(e) => setEndDate(e.target.value)} 
                           className="bg-transparent text-xs font-bold text-slate-600 outline-none w-full text-right cursor-pointer" 
                       />
                   </div>
               </div>
            </div>
        </div>
      </div>

      {/* List Content - Scrollable */}
      <div ref={listContainerRef} className="flex-1 overflow-y-auto min-h-0 space-y-2 md:space-y-3 px-2 md:px-3 py-3 no-scrollbar bg-slate-50 pb-20">
        {sortedProjectCodes.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center text-slate-400 bg-white/50 rounded-3xl border border-dashed border-slate-200 mx-1 shadow-inner animate-in fade-in zoom-in duration-300">
            <div className="p-5 bg-slate-100 rounded-full mb-4">
              <Briefcase className="w-12 h-12 text-slate-300" />
            </div>
            <p className="font-black uppercase tracking-tighter text-slate-600 text-lg">Không tìm thấy dữ liệu</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-2">Thử điều chỉnh bộ lọc hoặc xóa từ khóa</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pagedProjectCodes.map(projectCode => {
                const groupItems = groupedItems[projectCode];
                const stats = getGroupStats(groupItems);
                const isExpanded = expandedGroups.has(projectCode);
                const firstItem = groupItems[0];

                return (
                    <div key={projectCode} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all">
                        {/* Group Header - Refactored for Mobile */}
                        <div 
                            onClick={() => toggleGroup(projectCode)}
                            className={`p-3 border-b border-slate-100 relative cursor-pointer active:bg-blue-50 transition-colors flex items-start justify-between gap-3 ${isExpanded ? 'bg-blue-50/30' : 'bg-white'}`}
                        >
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                                <FolderOpen className={`w-5 h-5 shrink-0 mt-0.5 ${isExpanded ? 'text-blue-600' : 'text-slate-400'}`} />
                                <div className="flex flex-col min-w-0">
                                    <h3 className="font-black text-sm text-slate-900 uppercase tracking-tight truncate leading-tight">
                                        <HighlightedText text={projectCode} highlight={searchTerm} />
                                    </h3>
                                    <p className="text-[11px] font-medium text-slate-500 truncate leading-tight mt-0.5">
                                        <HighlightedText text={firstItem.ten_ct} highlight={searchTerm} />
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <div className="flex items-center gap-1.5">
                                    <div className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-600">
                                        <Layers className="w-3 h-3" /> {stats.total}
                                    </div>
                                    {stats.fail > 0 && (
                                        <div className="flex items-center gap-1 bg-red-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-red-600">
                                            <AlertCircle className="w-3 h-3" /> {stats.fail}
                                        </div>
                                    )}
                                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ml-1 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                                </div>
                            </div>
                        </div>

                        {isExpanded && (
                            <div className="bg-slate-50/50 p-2 md:p-3 animate-in slide-in-from-top-2 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
                                    {groupItems.map(inspection => (
                                        <div 
                                            key={inspection.id}
                                            onClick={() => onSelect(inspection.id)}
                                            className="bg-white p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden flex flex-col active:scale-[0.98]"
                                        >
                                            {inspection.priority === Priority.HIGH && (
                                                <div className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-bl-lg z-10 shadow-md">
                                                    <Zap className="w-3 h-3 fill-white" />
                                                </div>
                                            )}

                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                                                    <span className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                        <Hash className="w-3 h-3" />
                                                        <HighlightedText text={inspection.ma_nha_may || '---'} highlight={searchTerm} />
                                                    </span>
                                                    <span className="flex items-center gap-1 text-[9px] text-slate-400">
                                                        <Clock className="w-3 h-3" /> {inspection.date}
                                                    </span>
                                                </div>
                                            </div>

                                            <h4 className="text-sm font-bold text-slate-800 leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors uppercase mb-3">
                                                <HighlightedText text={inspection.ten_hang_muc || 'CHƯA CÓ TÊN SP'} highlight={searchTerm} />
                                            </h4>

                                            <div className="mt-auto pt-2 border-t border-slate-50 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${getStatusColor(inspection.status)}`}>
                                                        {getStatusLabel(inspection.status)}
                                                    </span>
                                                    {inspection.status !== InspectionStatus.DRAFT && (
                                                        <span className={`text-xs font-black ${
                                                            inspection.score >= 90 ? 'text-green-600' : 
                                                            inspection.score >= 70 ? 'text-blue-600' : 'text-red-600'
                                                        }`}>
                                                            {inspection.score}%
                                                        </span>
                                                    )}
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
          </div>
        )}
      </div>

      {/* Pagination Controls - Fixed */}
      {totalPages > 1 && (
        <div className="shrink-0 h-14 flex items-center justify-center gap-4 bg-white border-t border-slate-200 px-4 z-20 shadow-[0_-4px_10px_-4px_rgba(0,0,0,0.05)]">
            <button 
                disabled={currentPage === 1} 
                onClick={() => setCurrentPage(p => p - 1)}
                className="w-9 h-9 flex items-center justify-center bg-slate-50 text-blue-600 rounded-lg disabled:opacity-30 active:bg-blue-100 transition-colors shadow-sm border border-slate-100"
            >
                <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center min-w-[80px]">
                <span className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">Trang {currentPage} / {totalPages}</span>
                <div className="w-full h-1 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${(currentPage / totalPages) * 100}%` }}></div>
                </div>
            </div>
            <button 
                disabled={currentPage === totalPages} 
                onClick={() => setCurrentPage(p => p + 1)}
                className="w-9 h-9 flex items-center justify-center bg-slate-50 text-blue-600 rounded-lg disabled:opacity-30 active:bg-blue-100 transition-colors shadow-sm border border-slate-100"
            >
                <ChevronRight className="w-5 h-5" />
            </button>
        </div>
      )}
    </div>
  );
};
