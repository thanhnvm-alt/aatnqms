import React, { useState, useRef, useMemo, useEffect } from 'react';
import { PlanItem, Inspection, CheckItem, InspectionStatus } from '../types';
import { QRScannerModal } from './QRScannerModal';
import { exportPlans, importPlansFile } from '../services/apiService';
import { 
  Search, RefreshCw, FileSpreadsheet, Plus, Upload, 
  ChevronLeft, ChevronRight, Briefcase, Calendar, 
  ArrowRight, Loader2, CheckCircle2, AlertCircle, FileUp,
  FolderOpen, Tag, MoreHorizontal, Clock, ArrowUpRight,
  QrCode, X, ChevronDown, Filter, Layers, FileDown,
  PieChart, FileText, Building2
} from 'lucide-react';

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
  defaultTemplate = [],
  onViewPlan
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showScanner, setShowScanner] = useState(false);

  const filteredItems = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : [];
    const safeSearchTerm = (searchTerm || '').toLowerCase().trim();
    if (!safeSearchTerm) return safeItems;
    
    return safeItems.filter(item => {
        if (!item) return false;
        return (
            (String(item.ma_ct || '').toLowerCase().includes(safeSearchTerm)) ||
            (String(item.ten_ct || '').toLowerCase().includes(safeSearchTerm)) ||
            (String(item.ten_hang_muc || '').toLowerCase().includes(safeSearchTerm)) ||
            (String(item.ma_nha_may || '').toLowerCase().includes(safeSearchTerm)) ||
            (String(item.headcode || '').toLowerCase().includes(safeSearchTerm)) ||
            (String(item.assignee || '').toLowerCase().includes(safeSearchTerm))
        );
    });
  }, [items, searchTerm]);

  const groupedItems = useMemo(() => {
      const groups: Record<string, PlanItem[]> = {};
      filteredItems.forEach(item => {
          if (!item) return;
          const ma_ct = String(item.ma_ct || '');
          const key = ma_ct.toUpperCase().startsWith('CT') ? ma_ct : (item.ten_ct || 'KHÁC');
          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
      });
      return groups;
  }, [filteredItems]);

  useEffect(() => {
      if (searchTerm) setExpandedGroups(new Set(Object.keys(groupedItems)));
      else setExpandedGroups(new Set());
  }, [searchTerm, groupedItems]);

  const toggleGroup = (groupKey: string) => {
      setExpandedGroups(prev => {
          const next = new Set(prev);
          if (next.has(groupKey)) next.delete(groupKey);
          else next.add(groupKey);
          return next;
      });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
        const result = await importPlansFile(file);
        alert(`ISO: Đã nhập thành công ${result.count} bản ghi. Hệ thống đã ghi audit log.`);
        onRefresh();
    } catch (err: any) {
        console.error(err);
        alert(`ISO Error: ${err.message}`);
    } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async () => {
      setIsExporting(true);
      try {
          await exportPlans();
      } catch (error) {
          console.error("Export failed:", error);
      } finally {
          setIsExporting(false);
      }
  };

  const getInspectionStatus = (ma_nha_may: string) => {
      if (!ma_nha_may || !Array.isArray(inspections)) return null;
      const found = inspections.filter(i => i && i.ma_nha_may === ma_nha_may);
      if (found.length === 0) return null;
      return found.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  };

  const sortedGroups = Object.keys(groupedItems).sort((a, b) => groupedItems[b].length - groupedItems[a].length);

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleImport} accept=".xlsx" className="hidden" />

      {showScanner && (
        <QRScannerModal 
          onClose={() => setShowScanner(false)}
          onScan={(data) => { onSearch(data); setShowScanner(false); }}
          title="Quét mã tìm kế hoạch"
          subtitle="Quét mã QR/Barcode trên sản phẩm để tìm nhanh kế hoạch sản xuất"
        />
      )}

      <div className="shrink-0 bg-white px-2 py-2 border-b border-slate-200 z-20 shadow-sm">
          <div className="flex flex-col gap-2">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" placeholder="Tìm kế hoạch (Mã NM, SP...)" value={searchTerm}
                        onChange={(e) => onSearch(e.target.value)}
                        className="w-full pl-9 pr-10 h-9 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all shadow-inner"
                    />
                    {searchTerm && (
                        <button onClick={() => onSearch('')} className="absolute right-9 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5"/></button>
                    )}
                    <button onClick={() => setShowScanner(true)} className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-600 transition-colors">
                        <QrCode className="w-4 h-4" />
                    </button>
                </div>
                
                <div className="flex items-center justify-between">
                    <div className="flex items-center justify-start gap-1.5">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded border border-slate-100">
                            Total: {totalItems}
                        </span>
                    </div>
                    
                    <div className="flex gap-2">
                        <button onClick={handleExport} disabled={isExporting} className="h-8 w-8 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-lg active:scale-95 transition-all border border-indigo-100 shadow-sm">
                            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <FileDown className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="h-8 w-8 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-lg active:scale-95 transition-all border border-emerald-100 shadow-sm">
                            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <FileUp className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={onRefresh} disabled={isLoading} className="h-8 w-8 flex items-center justify-center bg-white text-slate-500 rounded-lg active:scale-95 transition-all border border-slate-200 hover:text-blue-600 hover:border-blue-300 shadow-sm">
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
          </div>
      </div>

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
                    const ma_ct = firstItem.ma_ct || '---';
                    const ten_ct = firstItem.ten_ct || '---';
                    const totalGroupItems = groupItems.length;
                    const inspectedCount = groupItems.filter(item => {
                        const status = getInspectionStatus(item.ma_nha_may)?.status;
                        return status === InspectionStatus.COMPLETED || status === InspectionStatus.APPROVED || status === InspectionStatus.FLAGGED;
                    }).length;
                    
                    return (
                        <div key={groupKey} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <div onClick={() => toggleGroup(groupKey)} className={`p-3 cursor-pointer transition-colors border-b flex items-start justify-between gap-3 ${isExpanded ? 'bg-blue-50/40 border-blue-100' : 'bg-white border-slate-100'}`}>
                                <div className="flex items-start gap-2 overflow-hidden">
                                    <div className={`p-2 rounded-lg shrink-0 ${isExpanded ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}><Building2 className="w-4 h-4" /></div>
                                    <div className="flex flex-col min-w-0">
                                        <h3 className="font-black text-sm text-slate-800 uppercase tracking-tight truncate"><HighlightedText text={ma_ct} highlight={searchTerm} /></h3>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight truncate"><HighlightedText text={ten_ct} highlight={searchTerm} /></p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">{inspectedCount}/{totalGroupItems} QC</span>
                                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                                </div>
                            </div>
                            {isExpanded && (
                                <div className="bg-slate-50/50 p-2 grid grid-cols-1 gap-2 border-t border-slate-100">
                                    {groupItems.map((item, idx) => {
                                        if (!item) return null;
                                        const inspection = getInspectionStatus(item.ma_nha_may);
                                        const isDone = inspection?.status === InspectionStatus.COMPLETED || inspection?.status === InspectionStatus.APPROVED;
                                        const hasIssue = inspection?.status === InspectionStatus.FLAGGED;
                                        const isDraft = inspection?.status === InspectionStatus.DRAFT;
                                        return (
                                            <div key={`${item.ma_nha_may}_${idx}`} onClick={() => onViewPlan && onViewPlan(item)} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm active:scale-[0.98] transition-transform flex flex-col gap-2 group">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex flex-wrap gap-1.5 items-center">
                                                        <span className="flex items-center gap-1 text-[9px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200"><Tag className="w-3 h-3 text-blue-500" /><HighlightedText text={item.ma_nha_may} highlight={searchTerm} /></span>
                                                        {item.headcode && <span className="text-[9px] font-bold bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-slate-100">HC: <HighlightedText text={item.headcode} highlight={searchTerm} /></span>}
                                                    </div>
                                                    <span className="text-[9px] font-medium text-slate-400 flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" /> {item.plannedDate}</span>
                                                </div>
                                                <div className="flex items-start gap-2"><h4 className="text-xs font-bold text-slate-800 leading-snug flex-1"><HighlightedText text={item.ten_hang_muc} highlight={searchTerm} /></h4>{inspection && <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter border ${isDone ? 'bg-green-100 text-green-700 border-green-200' : hasIssue ? 'bg-red-100 text-red-700 border-red-200' : isDraft ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-orange-100 text-orange-700 border-orange-200'}`}>{isDone ? 'ĐẠT' : hasIssue ? 'LỖI' : isDraft ? 'NHÁP' : 'ĐANG XỬ LÝ'}</span>}</div>
                                                <div className="flex items-center justify-between pt-2 border-t border-slate-50"><span className="text-[10px] font-black text-blue-600 uppercase">SL: {item.so_luong_ipo} {item.dvt}</span><div onClick={(e) => e.stopPropagation()}>{inspection ? <button onClick={() => onViewInspection(inspection.id)} className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 border shadow-sm transition-all hover:shadow-md ${isDone ? 'bg-green-50 text-green-700 border-green-200' : hasIssue ? 'bg-red-50 text-red-700 border-red-200' : isDraft ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-white text-slate-600 border-slate-200'}`}>{isDone ? <CheckCircle2 className="w-3 h-3"/> : hasIssue ? <AlertCircle className="w-3 h-3"/> : <FileText className="w-3 h-3" />}{isDone ? 'Chi tiết' : hasIssue ? 'Lỗi/NCR' : isDraft ? 'Sửa nháp' : 'Đang xử lý'}</button> : <button onClick={() => onSelect(item, defaultTemplate)} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm active:scale-95"> <Plus className="w-3 h-3" /> Tạo phiếu</button>}</div></div>
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
    </div>
  );
};