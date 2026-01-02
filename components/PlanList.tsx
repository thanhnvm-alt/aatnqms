
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

const HighlightedText: React.FC<{ text: string; highlight: string; className?: string }> = ({ text, highlight, className = "" }) => {
  if (!highlight.trim()) return <span className={className}>{text}</span>;
  try {
    const keywords = highlight.trim().split(/\s+/).filter(k => k.length > 0);
    if (keywords.length === 0) return <span className={className}>{text}</span>;
    const escapedKeywords = keywords.map(str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
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

  const groupedItems = useMemo(() => {
      const groups: Record<string, PlanItem[]> = {};
      filteredItems.forEach(item => {
          const key = item.ma_ct || 'KHÁC';
          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
      });
      return groups;
  }, [filteredItems]);

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
             onSearch(scannedData);
             setShowScanner(false);
             return;
          }
        }
      }
    }
    if (showScanner) requestRef.current = requestAnimationFrame(tick);
  };

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

        const parsedPlans: PlanItem[] = data.map((row: any, index: number) => ({
             stt: row['STT'] || index + 1,
             ma_nha_may: row['Mã nhà máy'] || row['Ma NM'] || row['ma_nha_may'] || '',
             headcode: row['Headcode'] || row['Head Code'] || row['headcode'] || '',
             ten_ct: row['Tên công trình'] || row['Ten CT'] || row['ten_ct'] || '',
             ten_hang_muc: row['Tên sản phẩm'] || row['Tên hạng mục'] || row['Ten Hang Muc'] || row['Ten SP'] || row['ten_sp'] || row['ten_hang_muc'] || '',
             ma_ct: row['Mã công trình'] || row['Ma CT'] || row['ma_ct'] || '',
             so_luong_ipo: parseInt(row['Số lượng'] || row['So Luong'] || row['sl_dh'] || row['so_luong_ipo'] || '0'),
             dvt: row['ĐVT'] || row['DVT'] || row['dvt'] || 'PCS',
             plannedDate: row['Ngày kế hoạch'] ? String(row['Ngày kế hoạch']) : new Date().toISOString().split('T')[0],
             assignee: row['Người thực hiện'] || '',
             status: 'PENDING'
        }));

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
      const latest = found.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      return latest;
  };

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
            </div>
            <p className="text-blue-400 mt-10 font-bold text-xs uppercase tracking-[0.2em] animate-pulse">Scanning QR / Barcode...</p>
        </div>
      )}

      {/* Mobile Optimized Header */}
      <div className="shrink-0 bg-white px-2 py-2 border-b border-slate-200 z-20 shadow-sm">
          <div className="flex flex-col gap-2">
                {/* Search Bar Row */}
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Tìm kế hoạch (Mã NM, SP...)" 
                        value={searchTerm}
                        onChange={(e) => onSearch(e.target.value)}
                        className="w-full pl-9 pr-10 h-9 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-400"
                    />
                    {searchTerm && (
                        <button onClick={() => onSearch('')} className="absolute right-9 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5"/></button>
                    )}
                    <button 
                        onClick={() => setShowScanner(true)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                    >
                        <QrCode className="w-4 h-4" />
                    </button>
                </div>
                
                {/* Action Bar Row */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded border border-slate-100">
                            Total: {totalItems}
                        </span>
                    </div>
                    
                    <div className="flex gap-2">
                        <button 
                            onClick={handleExport}
                            disabled={isExporting}
                            className="h-8 w-8 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-lg active:scale-95 transition-all border border-indigo-100 shadow-sm"
                            title="Xuất Excel"
                        >
                            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <FileDown className="w-3.5 h-3.5" />}
                        </button>
                        
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isImporting}
                            className="h-8 w-8 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-lg active:scale-95 transition-all border border-emerald-100 shadow-sm"
                            title="Nhập Excel"
                        >
                            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <FileUp className="w-3.5 h-3.5" />}
                        </button>
                        
                        <button 
                            onClick={onRefresh}
                            disabled={isLoading}
                            className="h-8 w-8 flex items-center justify-center bg-white text-slate-500 rounded-lg active:scale-95 transition-all border border-slate-200 hover:text-blue-600 hover:border-blue-300 shadow-sm"
                            title="Tải lại"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
          </div>
      </div>

      {/* Content List - Scrollable Area */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 md:p-3 space-y-2 no-scrollbar bg-slate-50">
        {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Đang tải...</p>
            </div>
        ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200 m-1">
                <FileSpreadsheet className="w-10 h-10 mb-2 opacity-20" />
                <p className="font-bold text-xs">Không có dữ liệu</p>
            </div>
        ) : (
            <div className="space-y-3">
                {sortedGroups.map((groupKey) => {
                    const groupItems = groupedItems[groupKey];
                    const isExpanded = expandedGroups.has(groupKey);
                    const firstItem = groupItems[0];
                    const projectName = firstItem.ten_ct || '---';

                    // Group Statistics
                    const totalGroupItems = groupItems.length;
                    const inspectedCount = groupItems.filter(item => {
                        const status = getInspectionStatus(item.ma_nha_may)?.status;
                        return status === InspectionStatus.COMPLETED || status === InspectionStatus.APPROVED || status === InspectionStatus.FLAGGED;
                    }).length;
                    
                    return (
                        <div key={groupKey} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            {/* Group Header */}
                            <div 
                                onClick={() => toggleGroup(groupKey)}
                                className={`p-3 cursor-pointer transition-colors border-b flex items-start justify-between gap-3 ${isExpanded ? 'bg-blue-50/40 border-blue-100' : 'bg-white border-slate-100'}`}
                            >
                                <div className="flex items-start gap-2 overflow-hidden">
                                    <FolderOpen className={`w-5 h-5 shrink-0 mt-0.5 ${isExpanded ? 'text-blue-600' : 'text-slate-400'}`} />
                                    <div className="flex flex-col min-w-0">
                                        <h3 className="font-black text-sm text-slate-800 uppercase tracking-tight truncate">
                                            <HighlightedText text={groupKey} highlight={searchTerm} />
                                        </h3>
                                        <p className="text-[10px] font-medium text-slate-500 truncate">
                                            <HighlightedText text={projectName} highlight={searchTerm} />
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                        {inspectedCount}/{totalGroupItems}
                                    </span>
                                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                                </div>
                            </div>

                            {/* Group Items */}
                            {isExpanded && (
                                <div className="bg-slate-50/50 p-2 grid grid-cols-1 gap-2">
                                    {groupItems.map((item, idx) => {
                                        const inspection = getInspectionStatus(item.ma_nha_may);
                                        const isDone = inspection?.status === InspectionStatus.COMPLETED || inspection?.status === InspectionStatus.APPROVED;
                                        const hasIssue = inspection?.status === InspectionStatus.FLAGGED;
                                        
                                        return (
                                            <div 
                                                key={`${item.ma_nha_may}_${idx}`} 
                                                onClick={() => onViewPlan && onViewPlan(item)}
                                                className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm active:scale-[0.98] transition-transform flex flex-col gap-2"
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex flex-wrap gap-1.5 items-center">
                                                        <span className="flex items-center gap-1 text-[9px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                                            <Tag className="w-3 h-3" />
                                                            <HighlightedText text={item.ma_nha_may} highlight={searchTerm} />
                                                        </span>
                                                        {item.headcode && (
                                                            <span className="text-[9px] font-bold bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-slate-100">
                                                                <HighlightedText text={item.headcode} highlight={searchTerm} />
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[9px] font-medium text-slate-400 flex items-center gap-1 shrink-0">
                                                        <Clock className="w-3 h-3" /> {item.plannedDate}
                                                    </span>
                                                </div>

                                                <h4 className="text-xs font-bold text-slate-800 leading-snug line-clamp-2">
                                                    <HighlightedText text={item.ten_hang_muc} highlight={searchTerm} />
                                                </h4>

                                                <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                                    <span className="text-[10px] font-black text-blue-600 uppercase">
                                                        SL: {item.so_luong_ipo} {item.dvt}
                                                    </span>

                                                    <div onClick={(e) => e.stopPropagation()}>
                                                        {inspection ? (
                                                            <button 
                                                                onClick={() => onViewInspection(inspection.id)}
                                                                className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider flex items-center gap-1 border shadow-sm ${
                                                                    isDone ? 'bg-green-50 text-green-700 border-green-200' : 
                                                                    hasIssue ? 'bg-red-50 text-red-700 border-red-200' :
                                                                    'bg-white text-slate-600 border-slate-200'
                                                                }`}
                                                            >
                                                                {isDone ? <CheckCircle2 className="w-3 h-3"/> : hasIssue ? <AlertCircle className="w-3 h-3"/> : <div className="w-2 h-2 rounded-full bg-slate-400"></div>}
                                                                {isDone ? 'Đã xong' : hasIssue ? 'Lỗi' : 'Đang xử lý'}
                                                            </button>
                                                        ) : (
                                                            <button 
                                                                onClick={() => onSelect(item, defaultTemplate)}
                                                                className="px-2 py-1 bg-blue-600 text-white rounded text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm active:scale-95 hover:bg-blue-700 transition-colors"
                                                            >
                                                                <Plus className="w-3 h-3" /> Tạo phiếu
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
        <div className="shrink-0 h-12 flex items-center justify-center gap-4 bg-white border-t border-slate-200 px-4 z-20 shadow-[0_-4px_10px_-4px_rgba(0,0,0,0.05)]">
             <button 
                disabled={currentPage === 1} 
                onClick={() => onPageChange(currentPage - 1)}
                className="w-8 h-8 flex items-center justify-center bg-slate-50 text-blue-600 rounded-lg disabled:opacity-30 border border-slate-100 shadow-sm active:bg-blue-50 transition-colors"
            >
                <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex flex-col items-center">
                <span className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">Trang {currentPage} / {totalPages}</span>
                <div className="w-full h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${(currentPage / totalPages) * 100}%` }}></div>
                </div>
            </div>
            <button 
                disabled={currentPage === totalPages} 
                onClick={() => onPageChange(currentPage + 1)}
                className="w-8 h-8 flex items-center justify-center bg-slate-50 text-blue-600 rounded-lg disabled:opacity-30 border border-slate-100 shadow-sm active:bg-blue-50 transition-colors"
            >
                <ChevronRight className="w-4 h-4" />
            </button>
        </div>
      )}
    </div>
  );
};
