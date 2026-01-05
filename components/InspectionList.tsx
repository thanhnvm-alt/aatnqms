
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Inspection, InspectionStatus, Priority, ModuleId, User as UserType } from '../types';
import { ALL_MODULES } from '../constants';
import { 
  Building2, Calendar, AlertCircle, CheckCircle2, Search, Filter, X, 
  ChevronDown, ArrowUp, LayoutGrid, Clock, ChevronRight, Layers, Zap,
  Plus, FileDown, SlidersHorizontal, MapPin, Hash, FolderOpen, 
  ChevronLeft, Briefcase, Loader2, Upload, ArrowRight, RefreshCw,
  User, UserCircle, LogOut, Settings as SettingsIcon, ShieldCheck,
  ListFilter, QrCode, FileUp, FileSpreadsheet, Factory, UserCheck
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
  const [selectedInspector, setSelectedInspector] = useState<string>('ALL');
  const [selectedWorkshop, setSelectedWorkshop] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // UI States
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showModuleMenu, setShowModuleMenu] = useState(false);
  const [showInspectorMenu, setShowInspectorMenu] = useState(false);
  const [showWorkshopMenu, setShowWorkshopMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  // QR Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const moduleMenuRef = useRef<HTMLDivElement>(null);
  const inspectorMenuRef = useRef<HTMLDivElement>(null);
  const workshopMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isQC = userRole === 'QC';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) setShowFilterMenu(false);
      if (moduleMenuRef.current && !moduleMenuRef.current.contains(event.target as Node)) setShowModuleMenu(false);
      if (inspectorMenuRef.current && !inspectorMenuRef.current.contains(event.target as Node)) setShowInspectorMenu(false);
      if (workshopMenuRef.current && !workshopMenuRef.current.contains(event.target as Node)) setShowWorkshopMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Data Extraction for Filters ---
  const inspectors = useMemo(() => {
    const unique = new Set(inspections.map(i => i.inspectorName).filter(Boolean));
    return Array.from(unique).sort();
  }, [inspections]);

  const workshops = useMemo(() => {
    const unique = new Set(inspections.map(i => i.workshop).filter(Boolean));
    return Array.from(unique).sort();
  }, [inspections]);

  // --- Excel Logic ---
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      // @ts-ignore
      const XLSX = await import('https://esm.sh/xlsx@0.18.5');
      const exportData = filteredInspections.map(item => ({
        'Mã NM': item.ma_nha_may || '',
        'Headcode': item.headcode || '',
        'Mã CT': item.ma_ct || '',
        'Tên CT': item.ten_ct || '',
        'Hạng mục': item.ten_hang_muc || '',
        'QC Thực hiện': item.inspectorName || '',
        'Xưởng': item.workshop || '',
        'Ngày kiểm': item.date || '',
        'Điểm số': item.score || 0,
        'Trạng thái': item.status || '',
        'Loại': item.type || '',
        'Số lượng ĐH': item.so_luong_ipo || 0,
        'Số lượng Đạt': item.passedQuantity || 0,
        'Số lượng Lỗi': item.failedQuantity || 0,
        'ĐVT': item.dvt || ''
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "BaoCaoKiemTra");
      XLSX.writeFile(wb, `Bao_cao_QC_AATN_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Lỗi khi xuất file Excel.");
    } finally {
      setIsExporting(false);
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

        const parsedInspections: Inspection[] = data.map((row: any, index: number) => ({
          id: `IMP-${Date.now()}-${index}`,
          ma_nha_may: row['Mã NM'] || row['ma_nha_may'] || '',
          headcode: row['Headcode'] || row['headcode'] || '',
          ma_ct: row['Mã CT'] || row['ma_ct'] || '',
          ten_ct: row['Tên CT'] || row['ten_ct'] || '',
          ten_hang_muc: row['Hạng mục'] || row['ten_hang_muc'] || '',
          inspectorName: row['QC Thực hiện'] || row['inspectorName'] || currentUserName || '',
          workshop: row['Xưởng'] || row['workshop'] || '',
          date: row['Ngày kiểm'] || row['date'] || new Date().toISOString().split('T')[0],
          score: parseInt(row['Điểm số'] || row['score'] || '0'),
          status: row['Trạng thái'] || row['status'] || InspectionStatus.COMPLETED,
          type: row['Loại'] || row['type'] || 'SITE',
          so_luong_ipo: parseInt(row['Số lượng ĐH'] || row['so_luong_ipo'] || '0'),
          passedQuantity: parseInt(row['Số lượng Đạt'] || row['passedQuantity'] || '0'),
          failedQuantity: parseInt(row['Số lượng Lỗi'] || row['failedQuantity'] || '0'),
          dvt: row['ĐVT'] || row['dvt'] || 'PCS',
          items: []
        }));

        if (window.confirm(`Nhập ${parsedInspections.length} bản ghi vào hệ thống?`)) {
          await onImportInspections(parsedInspections);
          alert(`Đã nhập ${parsedInspections.length} bản ghi thành công!`);
          onRefresh?.();
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

  const filteredInspections = useMemo(() => {
    return inspections
      .filter(item => {
        if (selectedModule && selectedModule !== 'ALL' && item.type !== selectedModule) return false;
        const term = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm || 
          String(item.ma_ct || '').toLowerCase().includes(term) ||
          String(item.ten_ct || '').toLowerCase().includes(term) ||
          String(item.inspectorName || '').toLowerCase().includes(term) ||
          String(item.ten_hang_muc || '').toLowerCase().includes(term) ||
          String(item.ma_nha_may || '').toLowerCase().includes(term) ||
          String(item.headcode || '').toLowerCase().includes(term);
        if (!matchesSearch) return false;
        if (startDate && item.date < startDate) return false;
        if (endDate && item.date > endDate) return false;
        if (selectedInspector !== 'ALL' && item.inspectorName !== selectedInspector) return false;
        if (selectedWorkshop !== 'ALL' && item.workshop !== selectedWorkshop) return false;
        if (!isQC) {
            if (filter === 'MY_REPORTS' && (item.inspectorName || '').toLowerCase() !== currentUserName?.toLowerCase()) return false;
            if (filter === 'FLAGGED' && item.status !== InspectionStatus.FLAGGED) return false;
            if (filter === 'HIGH_PRIORITY' && item.priority !== Priority.HIGH) return false;
            if (filter === 'DRAFT' && item.status !== InspectionStatus.DRAFT) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inspections, searchTerm, filter, selectedInspector, selectedWorkshop, startDate, endDate, currentUserName, selectedModule, isQC]);

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
    { key: 'ALL', label: 'Tất cả trạng thái', icon: undefined },
    { key: 'FLAGGED', label: 'Cần xử lý', icon: <AlertCircle className="w-3 h-3 text-red-500" /> },
    { key: 'HIGH_PRIORITY', label: 'Khẩn cấp', icon: <Zap className="w-3 h-3 text-orange-500" /> },
    { key: 'DRAFT', label: 'Bản nháp', icon: <FileDown className="w-3 h-3 text-slate-400" /> },
    { key: 'MY_REPORTS', label: 'Của tôi', icon: <User className="w-3 h-3 text-blue-500" /> },
  ] as const;

  const currentModuleName = selectedModule === 'ALL' || !selectedModule 
    ? 'TẤT CẢ MODULE' 
    : ALL_MODULES.find(m => m.id === selectedModule)?.label || selectedModule;

  const hasActiveFilters = searchTerm || filter !== 'ALL' || selectedInspector !== 'ALL' || selectedWorkshop !== 'ALL' || startDate || endDate;

  const clearFilters = () => {
    setSearchTerm('');
    setFilter('ALL');
    setSelectedInspector('ALL');
    setSelectedWorkshop('ALL');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx,.xls" className="hidden" />

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
            </div>
            <p className="text-blue-400 mt-10 font-black text-[10px] uppercase tracking-[0.3em] animate-pulse">Scanning...</p>
        </div>
      )}

      {/* Optimized Unified Toolbar */}
      <div className="bg-white px-3 py-3 border-b border-slate-200 shadow-sm z-30 shrink-0 lg:px-6">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          
          {/* Search Bar - Grows on larger screens, stays compact on small */}
          <div className="relative group flex-1 min-w-[200px] md:min-w-[300px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text" placeholder="Tìm Mã NM, Sản phẩm, QC..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-12 h-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchTerm && <button onClick={() => setSearchTerm('')} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"><X className="w-4 h-4"/></button>}
              <button onClick={() => setShowScanner(true)} className="p-1.5 bg-blue-50 text-blue-500 rounded-lg hover:bg-blue-100 active:scale-90 transition-all border border-blue-100/50"><QrCode className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Module Filter */}
          {!isQC && (
              <div className="relative" ref={moduleMenuRef}>
                  <button 
                      onClick={() => setShowModuleMenu(!showModuleMenu)}
                      className={`h-10 px-3 rounded-xl flex items-center gap-2 border transition-all active:scale-95 ${selectedModule && selectedModule !== 'ALL' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}
                  >
                      <Layers className={`w-3.5 h-3.5 ${selectedModule && selectedModule !== 'ALL' ? 'text-white' : 'text-slate-400'}`} />
                      <span className="text-[10px] font-black uppercase truncate max-w-[100px]">{currentModuleName}</span>
                      <ChevronDown className="w-3 h-3 opacity-40" />
                  </button>
                  {showModuleMenu && (
                      <div className="absolute left-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 origin-top-left max-h-60 overflow-y-auto no-scrollbar">
                          <button onClick={() => { onModuleChange?.('ALL'); setShowModuleMenu(false); }} className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-50">TẤT CẢ MODULE</button>
                          {ALL_MODULES.map((mod) => (
                              <button key={mod.id} onClick={() => { onModuleChange?.(mod.id); setShowModuleMenu(false); }} className={`w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase hover:bg-slate-50 ${selectedModule === mod.id ? 'text-blue-600 bg-blue-50' : 'text-slate-600'}`}>{mod.label}</button>
                          ))}
                      </div>
                  )}
              </div>
          )}

          {/* Inspector Filter */}
          <div className="relative" ref={inspectorMenuRef}>
              <button 
                  onClick={() => setShowInspectorMenu(!showInspectorMenu)}
                  className={`h-10 px-3 rounded-xl flex items-center gap-2 border transition-all active:scale-95 ${selectedInspector !== 'ALL' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}
              >
                  <UserCheck className={`w-3.5 h-3.5 ${selectedInspector !== 'ALL' ? 'text-white' : 'text-slate-400'}`} />
                  <span className="text-[10px] font-black uppercase truncate max-w-[100px]">{selectedInspector === 'ALL' ? 'QC THỰC HIỆN' : selectedInspector}</span>
                  <ChevronDown className="w-3 h-3 opacity-40" />
              </button>
              {showInspectorMenu && (
                  <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 origin-top-left max-h-60 overflow-y-auto no-scrollbar">
                      <button onClick={() => { setSelectedInspector('ALL'); setShowInspectorMenu(false); }} className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-50">TẤT CẢ QC</button>
                      {inspectors.map((name) => (
                          <button key={name} onClick={() => { setSelectedInspector(name); setShowInspectorMenu(false); }} className={`w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase hover:bg-slate-50 ${selectedInspector === name ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'}`}>{name}</button>
                      ))}
                  </div>
              )}
          </div>

          {/* Workshop Filter */}
          <div className="relative" ref={workshopMenuRef}>
              <button 
                  onClick={() => setShowWorkshopMenu(!showWorkshopMenu)}
                  className={`h-10 px-3 rounded-xl flex items-center gap-2 border transition-all active:scale-95 ${selectedWorkshop !== 'ALL' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}
              >
                  <Factory className={`w-3.5 h-3.5 ${selectedWorkshop !== 'ALL' ? 'text-white' : 'text-slate-400'}`} />
                  <span className="text-[10px] font-black uppercase truncate max-w-[100px]">{selectedWorkshop === 'ALL' ? 'XƯỞNG SX' : selectedWorkshop}</span>
                  <ChevronDown className="w-3 h-3 opacity-40" />
              </button>
              {showWorkshopMenu && (
                  <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 origin-top-left max-h-60 overflow-y-auto no-scrollbar">
                      <button onClick={() => { setSelectedWorkshop('ALL'); setShowWorkshopMenu(false); }} className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-50">TẤT CẢ XƯỞNG</button>
                      {workshops.map((ws) => (
                          <button key={ws} onClick={() => { setSelectedWorkshop(ws); setShowWorkshopMenu(false); }} className={`w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase hover:bg-slate-50 ${selectedWorkshop === ws ? 'text-emerald-600 bg-emerald-50' : 'text-slate-600'}`}>{ws}</button>
                      ))}
                  </div>
              )}
          </div>

          {/* Status Filter */}
          {!isQC && (
              <div className="relative" ref={filterMenuRef}>
                  <button 
                      onClick={() => setShowFilterMenu(!showFilterMenu)} 
                      className={`h-10 px-3 flex items-center justify-between gap-2 rounded-xl border transition-all active:scale-95 ${filter !== 'ALL' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200'}`}
                  >
                      <ListFilter className={`w-3.5 h-3.5 ${filter !== 'ALL' ? 'text-white' : 'text-slate-400'}`} />
                      <span className="text-[10px] font-black uppercase truncate max-w-[80px]">{filterOptions.find(o => o.key === filter)?.label}</span>
                      <ChevronDown className="w-3 h-3 opacity-40" />
                  </button>
                  {showFilterMenu && (
                      <div className="absolute right-0 lg:left-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 origin-top-right lg:origin-top-left">
                          {filterOptions.map((opt) => (
                              <button key={opt.key} onClick={() => { setFilter(opt.key); setShowFilterMenu(false); }} className={`w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase flex items-center justify-between ${filter === opt.key ? 'bg-orange-50 text-orange-600' : 'text-slate-600 hover:bg-slate-50'}`}>
                                  <div className="flex items-center gap-3">{opt.icon || <div className="w-3.5 h-3.5" />} <span>{opt.label}</span></div>
                              </button>
                          ))}
                      </div>
                  )}
              </div>
          )}

          {/* Date Picker Block - Compact for flow */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2 h-10 shrink-0 group focus-within:ring-2 focus-within:ring-blue-100 focus-within:bg-white focus-within:border-blue-300 transition-all">
              <div className="flex items-center gap-1.5 min-w-[110px]">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-[10px] font-black text-slate-600 outline-none w-full cursor-pointer py-1" />
              </div>
              <ArrowRight className="w-3 h-3 text-slate-300 mx-1" />
              <div className="flex items-center gap-1.5 min-w-[110px]">
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-[10px] font-black text-slate-600 outline-none w-full text-right cursor-pointer py-1" />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>
          </div>

          {/* Excel Actions & Clear */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
              {hasActiveFilters && (
                  <button onClick={clearFilters} className="h-10 w-10 flex items-center justify-center text-red-500 bg-red-50 rounded-xl border border-red-100 active:scale-95 transition-all" title="Xóa tất cả bộ lọc">
                      <RefreshCw className="w-4 h-4" />
                  </button>
              )}
              {!isQC && (
                  <div className="flex gap-2">
                      <button onClick={handleExportExcel} disabled={isExporting} className="h-10 px-3 flex items-center justify-center gap-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl hover:bg-indigo-100 active:scale-95 transition-all shadow-sm group">
                          {isExporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileDown className="w-4 h-4" />}
                          <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Xuất</span>
                      </button>
                      <button onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="h-10 px-3 flex items-center justify-center gap-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl hover:bg-emerald-100 active:scale-95 transition-all shadow-sm group">
                          {isImporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileUp className="w-4 h-4" />}
                          <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Nhập</span>
                      </button>
                  </div>
              )}
          </div>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto space-y-3 p-3 lg:p-6 no-scrollbar pb-24">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hiển thị {filteredInspections.length} bản ghi phù hợp</p>
        </div>

        {pagedProjectCodes.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center text-slate-400 bg-white/50 rounded-[2rem] border border-dashed border-slate-200 mx-1">
            <Briefcase className="w-12 h-12 text-slate-300 mb-4" />
            <p className="font-black uppercase text-slate-600">Không tìm thấy dữ liệu</p>
            <p className="text-[10px] mt-2 font-medium">Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
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
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{groupItems.length} Phiếu đánh giá</p>
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
                          <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 mt-2">
                             <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3"/> {item.date}</span>
                             <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${item.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>{item.status}</span>
                             {item.workshop && <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase flex items-center gap-1"><Factory className="w-2.5 h-2.5" /> {item.workshop}</span>}
                             <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 uppercase flex items-center gap-1"><UserCheck className="w-2.5 h-2.5" /> {item.inspectorName}</span>
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

        {/* Pagination Info */}
        {sortedProjectCodes.length > PROJECTS_PER_PAGE && (
          <div className="flex justify-center gap-4 pt-4 pb-10">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-2.5 bg-white border border-slate-200 rounded-xl disabled:opacity-30 active:scale-90 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center px-4 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Trang {currentPage} / {Math.ceil(sortedProjectCodes.length / PROJECTS_PER_PAGE)}
              </div>
              <button 
                disabled={currentPage >= Math.ceil(sortedProjectCodes.length / PROJECTS_PER_PAGE)}
                onClick={() => setCurrentPage(p => p + 1)}
                className="p-2.5 bg-white border border-slate-200 rounded-xl disabled:opacity-30 active:scale-90 transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
          </div>
        )}
      </div>
    </div>
  );
};
