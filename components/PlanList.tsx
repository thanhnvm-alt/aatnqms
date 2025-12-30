
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { PlanItem, Inspection, CheckItem, InspectionStatus } from '../types';
import { 
  Search, RefreshCw, FileSpreadsheet, Plus, Upload, 
  ChevronLeft, ChevronRight, Briefcase, Calendar, 
  ArrowRight, Loader2, CheckCircle2, AlertCircle, FileUp,
  FolderOpen, Tag, MoreHorizontal, Clock, ArrowUpRight,
  QrCode, X, ChevronDown, Filter, Layers, FileDown,
  PieChart
} from 'lucide-react';
// @ts-ignore
import jsQR from 'jsqr';

interface PlanListProps {
  items: PlanItem[];
  inspections: Inspection[];
  onSelect: (item: PlanItem, customItems?: CheckItem[]) => void;
  onViewInspection: (id: string) => void;
  onRefresh: () => void;
  onImportPlans: (plans: PlanItem[]) => Promise<void>;
  searchTerm: string;
  onSearch: (term: string) => void;
  isLoading: boolean;
  totalItems: number;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  defaultTemplate?: CheckItem[];
  onViewPlan?: (item: PlanItem) => void; 
}

export const PlanList: React.FC<PlanListProps> = ({
  items,
  inspections,
  onSelect,
  onViewInspection,
  onRefresh,
  onImportPlans,
  searchTerm,
  onSearch,
  isLoading,
  totalItems,
  currentPage,
  itemsPerPage,
  onPageChange,
  defaultTemplate = [],
  onViewPlan
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // --- LOGIC: Advanced Search & Grouping ---

  // 1. Filter locally for immediate feedback (Multi-column search)
  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;
    const lowerTerm = searchTerm.toLowerCase().trim();
    
    return items.filter(item => {
        return (
            (item.ma_ct && item.ma_ct.toLowerCase().includes(lowerTerm)) ||
            (item.ten_ct && item.ten_ct.toLowerCase().includes(lowerTerm)) ||
            (item.ten_hang_muc && item.ten_hang_muc.toLowerCase().includes(lowerTerm)) ||
            (item.ma_nha_may && item.ma_nha_may.toLowerCase().includes(lowerTerm)) ||
            (item.headcode && item.headcode.toLowerCase().includes(lowerTerm)) ||
            (item.assignee && item.assignee.toLowerCase().includes(lowerTerm))
        );
    });
  }, [items, searchTerm]);

  // 2. Group items by 'ma_ct' (Project Code)
  const groupedItems = useMemo(() => {
      const groups: Record<string, PlanItem[]> = {};
      filteredItems.forEach(item => {
          const key = item.ma_ct || 'KHÁC';
          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
      });
      return groups;
  }, [filteredItems]);

  // 3. Auto-expand groups when searching
  useEffect(() => {
      if (searchTerm) {
          setExpandedGroups(new Set(Object.keys(groupedItems)));
      }
  }, [searchTerm, groupedItems]);

  const toggleGroup = (groupKey: string) => {
      setExpandedGroups(prev => {
          const next = new Set(prev);
          if (next.has(groupKey)) next.delete(groupKey);
          else next.add(groupKey);
          return next;
      });
  };

  // --- LOGIC: QR Scanner ---
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
             onSearch(scannedData); // Set search term
             setShowScanner(false);
             return;
          }
        }
      }
    }
    if (showScanner) requestRef.current = requestAnimationFrame(tick);
  };

  // --- LOGIC: Excel Import/Export ---
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

        // Map Excel columns to PlanItem
        const parsedPlans: PlanItem[] = data.map((row: any, index: number) => ({
             stt: row['STT'] || index + 1,
             ma_nha_may: row['Mã nhà máy'] || row['Ma NM'] || row['ma_nha_may'] || '',
             headcode: row['Headcode'] || row['Head Code'] || row['headcode'] || '',
             ten_ct: row['Tên công trình'] || row['Ten CT'] || row['ten_ct'] || '',
             // Added aliases for Tên Sản Phẩm
             ten_hang_muc: row['Tên sản phẩm'] || row['Tên hạng mục'] || row['Ten Hang Muc'] || row['Ten SP'] || row['ten_sp'] || row['ten_hang_muc'] || '',
             ma_ct: row['Mã công trình'] || row['Ma CT'] || row['ma_ct'] || '',
             so_luong_ipo: parseInt(row['Số lượng'] || row['So Luong'] || row['sl_dh'] || row['so_luong_ipo'] || '0'),
             dvt: row['ĐVT'] || row['DVT'] || row['dvt'] || 'PCS',
             plannedDate: row['Ngày kế hoạch'] ? String(row['Ngày kế hoạch']) : new Date().toISOString().split('T')[0],
             assignee: row['Người thực hiện'] || '',
             status: 'PENDING'
        }));

        // Validate basic required fields
        const validPlans = parsedPlans.filter(p => p.ma_nha_may || p.headcode);

        if (validPlans.length > 0) {
            if (window.confirm(`Tìm thấy ${validPlans.length} dòng dữ liệu hợp lệ. Nhập vào hệ thống?`)) {
                await onImportPlans(validPlans);
                alert(`Đã nhập ${validPlans.length} kế hoạch thành công!`);
                onRefresh();
            }
        } else {
            alert("Không tìm thấy dữ liệu hợp lệ (cần ít nhất Mã nhà máy hoặc Headcode).");
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

  const handleExport = async () => {
      setIsExporting(true);
      try {
          // @ts-ignore
          const XLSX = await import('https://esm.sh/xlsx@0.18.5');
          
          // Flatten data for export
          const exportData = filteredItems.map(item => ({
              'STT': item.stt,
              'Mã nhà máy': item.ma_nha_may,
              'Headcode': item.headcode,
              'Mã công trình': item.ma_ct,
              'Tên công trình': item.ten_ct,
              'Tên sản phẩm': item.ten_hang_muc,
              'Số lượng': item.so_luong_ipo,
              'ĐVT': item.dvt,
              'Ngày kế hoạch': item.plannedDate,
              'Người thực hiện': item.assignee,
              'Trạng thái': item.status
          }));

          const ws = XLSX.utils.json_to_sheet(exportData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "KeHoachSX");
          XLSX.writeFile(wb, `KeHoach_AATN_${new Date().toISOString().split('T')[0]}.xlsx`);
      } catch (error) {
          console.error("Export failed:", error);
          alert("Lỗi khi xuất file.");
      } finally {
          setIsExporting(false);
      }
  };

  const getInspectionStatus = (ma_nha_may: string) => {
      const found = inspections.filter(i => i.ma_nha_may === ma_nha_may);
      if (found.length === 0) return null;
      // Get latest status
      const latest = found.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      return latest;
  };

  // Sort groups by item count descending (Most items first)
  const sortedGroups = Object.keys(groupedItems).sort((a, b) => groupedItems[b].length - groupedItems[a].length);

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImport} 
        accept=".xlsx,.xls,.csv" 
        className="hidden" 
      />

      {/* Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-[120] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
            <button onClick={() => setShowScanner(false)} className="absolute top-6 right-6 text-white p-3 bg-white/10 rounded-full active:scale-90 transition-transform"><X className="w-8 h-8"/></button>
            <div className="text-center mb-8">
                <h3 className="text-white font-bold text-lg uppercase tracking-widest mb-1">Quét mã tìm kiếm</h3>
                <p className="text-slate-400 text-xs">Di chuyển camera đến mã QR/Barcode trên sản phẩm</p>
            </div>
            <div className="w-full max-w-sm aspect-square bg-slate-800 rounded-[2.5rem] overflow-hidden relative border-4 border-blue-500/50 shadow-[0_0_50px_rgba(37,99,235,0.4)]">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-0 border-2 border-white/20 m-12 rounded-xl pointer-events-none">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-blue-500 -mt-1 -ml-1"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-blue-500 -mt-1 -mr-1"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-blue-500 -mb-1 -ml-1"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-blue-500 -mb-1 -mr-1"></div>
                </div>
            </div>
        </div>
      )}

      {/* Top Header Row with Title and Actions - Fixed at top */}
      <div className="shrink-0 bg-white/95 backdrop-blur-sm px-3 md:px-4 pt-3 pb-2 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 z-20 shadow-sm">
          <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
                  <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                  <h1 className="text-lg font-black text-slate-800 uppercase tracking-tighter leading-none">KẾ HOẠCH SX</h1>
                  <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">{totalItems} mục dữ liệu</p>
              </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {/* Colored Search Input */}
                <div className="relative flex-1 min-w-[200px] md:min-w-[300px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Tìm kiếm: Mã NM, Mã CT, Sản phẩm..." 
                        value={searchTerm}
                        onChange={(e) => onSearch(e.target.value)}
                        className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl text-sm font-bold text-slate-700 outline-none transition-all"
                    />
                    <button 
                        onClick={() => setShowScanner(true)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-blue-50 text-blue-500 rounded-lg hover:bg-blue-100 hover:text-blue-700 transition-colors"
                        title="Quét QR Code"
                    >
                        <QrCode className="w-3.5 h-3.5" />
                    </button>
                </div>
                
                <div className="flex gap-2 shrink-0">
                    {/* Colored Action Buttons */}
                    <button 
                        onClick={handleExport}
                        disabled={isExporting}
                        className="p-2 bg-indigo-50 border border-indigo-100 text-indigo-600 hover:bg-indigo-100 hover:border-indigo-200 hover:text-indigo-700 rounded-xl transition-all disabled:opacity-50 active:scale-95 shadow-sm"
                        title="Xuất Excel"
                    >
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileDown className="w-4 h-4" />}
                    </button>
                    
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        className="p-2 bg-emerald-50 border border-emerald-100 text-emerald-600 hover:bg-emerald-100 hover:border-emerald-200 hover:text-emerald-700 rounded-xl transition-all disabled:opacity-50 active:scale-95 shadow-sm"
                        title="Nhập Excel"
                    >
                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileUp className="w-4 h-4" />}
                    </button>
                    
                    <button 
                        onClick={onRefresh}
                        disabled={isLoading}
                        className="p-2 bg-slate-50 text-slate-500 border border-slate-200 hover:bg-white hover:border-blue-200 hover:text-blue-600 rounded-xl transition-colors disabled:opacity-50 active:scale-95 shadow-sm"
                        title="Tải lại"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
          </div>
      </div>

      {/* Content List - Scrollable Area */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 md:p-4 space-y-3 no-scrollbar bg-slate-50">
        {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Loader2 className="w-10 h-10 animate-spin mb-3 text-blue-500" />
                <p className="text-xs font-bold uppercase tracking-widest">Đang tải dữ liệu...</p>
            </div>
        ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200 m-2">
                <FileSpreadsheet className="w-12 h-12 mb-3 opacity-20" />
                <p className="font-bold">Không tìm thấy kế hoạch nào.</p>
                <p className="text-xs mt-1">Thử từ khóa khác hoặc tải lại danh sách.</p>
                <button onClick={onRefresh} className="mt-4 text-blue-600 font-bold text-sm hover:underline">Tải lại danh sách</button>
            </div>
        ) : (
            <div className="space-y-4">
                {sortedGroups.map((groupKey) => {
                    const groupItems = groupedItems[groupKey];
                    const isExpanded = expandedGroups.has(groupKey);
                    const firstItem = groupItems[0];
                    const projectName = firstItem.ten_ct || 'Không xác định';

                    // Group Statistics
                    const totalGroupItems = groupItems.length;
                    const inspectedCount = groupItems.filter(item => {
                        const status = getInspectionStatus(item.ma_nha_may)?.status;
                        return status === InspectionStatus.COMPLETED || status === InspectionStatus.APPROVED || status === InspectionStatus.FLAGGED;
                    }).length;
                    const unInspectedCount = totalGroupItems - inspectedCount;
                    const hasIssuesCount = groupItems.filter(item => getInspectionStatus(item.ma_nha_may)?.status === InspectionStatus.FLAGGED).length;

                    return (
                        <div key={groupKey} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all">
                            {/* Group Header - Redesigned */}
                            <div 
                                onClick={() => toggleGroup(groupKey)}
                                className={`p-4 cursor-pointer transition-colors border-b ${isExpanded ? 'bg-blue-50/30 border-blue-100' : 'bg-white hover:bg-slate-50 border-slate-100'}`}
                            >
                                <div className="flex flex-col gap-3">
                                    {/* Line 1: Icon + Project Info */}
                                    <div className="flex items-start gap-3">
                                        <div className={`mt-0.5 p-2 rounded-lg shrink-0 transition-colors ${isExpanded ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                            {isExpanded ? <FolderOpen className="w-5 h-5" /> : <Briefcase className="w-5 h-5" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-2">
                                                <h3 className="font-black text-slate-800 text-base md:text-lg uppercase tracking-tight leading-none">{groupKey}</h3>
                                                <span className="hidden md:inline text-slate-300">|</span>
                                                <span className="text-xs md:text-sm font-bold text-slate-500 uppercase leading-snug">{projectName}</span>
                                            </div>
                                        </div>
                                        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 mt-1 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                                    </div>

                                    {/* Line 2: Statistics Badges */}
                                    <div className="flex items-center gap-2 pl-12 flex-wrap">
                                        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-100 shadow-sm">
                                            <Layers className="w-3 h-3" />
                                            <span className="text-[10px] md:text-xs font-black uppercase whitespace-nowrap">{totalGroupItems} MÃ</span>
                                        </div>
                                        
                                        <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 rounded-md border border-green-100 shadow-sm">
                                            <CheckCircle2 className="w-3 h-3" />
                                            <span className="text-[10px] md:text-xs font-black uppercase whitespace-nowrap">{inspectedCount} ĐÃ KIỂM</span>
                                        </div>

                                        <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 text-slate-500 rounded-md border border-slate-200 shadow-sm">
                                            <Clock className="w-3 h-3" />
                                            <span className="text-[10px] md:text-xs font-black uppercase whitespace-nowrap">{unInspectedCount} CHƯA KIỂM</span>
                                        </div>

                                        {hasIssuesCount > 0 && (
                                            <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 text-red-700 rounded-md border border-red-100 shadow-sm animate-pulse">
                                                <AlertCircle className="w-3 h-3" />
                                                <span className="text-[10px] md:text-xs font-black uppercase whitespace-nowrap">{hasIssuesCount} LỖI</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Group Items */}
                            {isExpanded && (
                                <div className="divide-y divide-slate-50 bg-slate-50/30">
                                    {groupItems.map((item, idx) => {
                                        const inspection = getInspectionStatus(item.ma_nha_may);
                                        const isDone = inspection?.status === InspectionStatus.COMPLETED || inspection?.status === InspectionStatus.APPROVED;
                                        const hasIssue = inspection?.status === InspectionStatus.FLAGGED;
                                        
                                        return (
                                            <div 
                                                key={`${item.ma_nha_may}_${idx}`} 
                                                onClick={() => onViewPlan && onViewPlan(item)}
                                                className="p-3 md:p-4 hover:bg-white hover:shadow-sm transition-all cursor-pointer group relative flex flex-col md:flex-row gap-3 md:items-center pl-4 md:pl-6 border-l-4 border-transparent hover:border-blue-400"
                                            >
                                                {/* Left: Main Info */}
                                                <div className="flex-1 min-w-0 space-y-1.5">
                                                    <p className="text-sm font-bold text-slate-700 group-hover:text-blue-700 transition-colors leading-relaxed">
                                                        {item.ten_hang_muc}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-tight shadow-sm">
                                                            <Tag className="w-3 h-3" />
                                                            {item.ma_nha_may}
                                                        </div>
                                                        {item.headcode && (
                                                            <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-tight shadow-sm">
                                                                <Layers className="w-3 h-3" />
                                                                {item.headcode}
                                                            </div>
                                                        )}
                                                        <span className="text-[10px] md:text-xs text-slate-400 font-medium flex items-center gap-1 ml-auto md:ml-0">
                                                            <Clock className="w-3 h-3" /> {item.plannedDate}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Right: Actions & Status */}
                                                <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                                                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] md:text-xs font-black uppercase whitespace-nowrap border border-blue-100">
                                                        {item.so_luong_ipo} {item.dvt}
                                                    </span>

                                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                        {inspection ? (
                                                            <button 
                                                                onClick={() => onViewInspection(inspection.id)}
                                                                className={`h-8 px-3 rounded-lg font-bold text-[10px] md:text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all min-w-[90px] border shadow-sm ${
                                                                    isDone ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 
                                                                    hasIssue ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' :
                                                                    'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                {isDone ? <CheckCircle2 className="w-3.5 h-3.5"/> : hasIssue ? <AlertCircle className="w-3.5 h-3.5"/> : <div className="w-2 h-2 rounded-full bg-slate-400"></div>}
                                                                {isDone ? 'Đã xong' : hasIssue ? 'Có lỗi' : 'Đang xử lý'}
                                                            </button>
                                                        ) : (
                                                            <button 
                                                                onClick={() => onSelect(item, defaultTemplate)}
                                                                className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[10px] md:text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-blue-200 transition-all active:scale-95 min-w-[90px]"
                                                            >
                                                                <Plus className="w-3.5 h-3.5" /> Tạo phiếu
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        )}
      </div>

      {/* Pagination - Fixed at bottom */}
      {totalPages > 1 && (
        <div className="shrink-0 h-14 flex items-center justify-center gap-4 bg-white border-t border-slate-200 px-4 z-20 shadow-[0_-4px_10px_-4px_rgba(0,0,0,0.05)]">
             <button 
                disabled={currentPage === 1} 
                onClick={() => onPageChange(currentPage - 1)}
                className="w-9 h-9 flex items-center justify-center bg-slate-50 text-blue-600 rounded-lg disabled:opacity-30 active:bg-blue-100 transition-colors shadow-sm border border-slate-100"
            >
                <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center min-w-[100px]">
                <span className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">Trang {currentPage} / {totalPages}</span>
            </div>
            <button 
                disabled={currentPage === totalPages} 
                onClick={() => onPageChange(currentPage + 1)}
                className="w-9 h-9 flex items-center justify-center bg-slate-50 text-blue-600 rounded-lg disabled:opacity-30 active:bg-blue-100 transition-colors shadow-sm border border-slate-100"
            >
                <ChevronRight className="w-5 h-5" />
            </button>
        </div>
      )}
    </div>
  );
};
