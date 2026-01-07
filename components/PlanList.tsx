
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { PlanItem, Inspection, CheckItem, InspectionStatus } from '../types';
import { QRScannerModal } from './QRScannerModal';
import { 
  Search, RefreshCw, FileSpreadsheet, Plus, Upload, 
  ChevronLeft, ChevronRight, Briefcase, Calendar, 
  ArrowRight, Loader2, CheckCircle2, AlertCircle, FileUp,
  FolderOpen, Tag, MoreHorizontal, Clock, ArrowUpRight,
  QrCode, X, ChevronDown, Filter, Layers, FileDown,
  PieChart, FileText, Building2
} from 'lucide-react';
import { exportPlans, importPlansExcel } from '../services/apiService';

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
    return safeItems.filter(item => item && (
        String(item.ma_ct || '').toLowerCase().includes(safeSearchTerm) ||
        String(item.ten_ct || '').toLowerCase().includes(safeSearchTerm) ||
        String(item.ma_nha_may || '').toLowerCase().includes(safeSearchTerm)
    ));
  }, [items, searchTerm]);

  const groupedItems = useMemo(() => {
      const groups: Record<string, PlanItem[]> = {};
      filteredItems.forEach(item => {
          if (!item) return;
          const key = item.ma_ct || 'KHÁC';
          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
      });
      return groups;
  }, [filteredItems]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const result = await importPlansExcel(file);
      alert(`Đã nhập thành công ${result.success}/${result.total} kế hoạch.`);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportPlans();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const getInspectionStatus = (ma_nha_may: string) => {
      if (!ma_nha_may || !Array.isArray(inspections)) return null;
      return inspections.find(i => i && i.ma_nha_may === ma_nha_may);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleImport} accept=".xlsx" className="hidden" />
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={(d) => { onSearch(d); setShowScanner(false); }} />}

      <div className="shrink-0 bg-white px-3 py-3 border-b border-slate-200 z-20 shadow-sm">
          <div className="flex flex-col gap-3">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Tìm mã CT, NM, sản phẩm..." value={searchTerm} onChange={(e) => onSearch(e.target.value)} className="w-full pl-9 pr-10 h-10 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-blue-500 transition-all"/>
                    <button onClick={() => setShowScanner(true)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-blue-600"><QrCode className="w-5 h-5"/></button>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">Total: {totalItems} items</span>
                    <div className="flex gap-2">
                        <button onClick={handleExport} disabled={isExporting} className="h-10 w-10 flex items-center justify-center bg-white text-indigo-600 rounded-xl active:scale-95 transition-all border border-slate-200 shadow-sm">{isExporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileDown className="w-4 h-4" />}</button>
                        <button onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="h-10 w-10 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-xl active:scale-95 transition-all border border-indigo-100 shadow-sm">{isImporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileUp className="w-4 h-4" />}</button>
                        <button onClick={onRefresh} disabled={isLoading} className="h-10 w-10 flex items-center justify-center bg-white text-slate-500 rounded-xl active:scale-95 transition-all border border-slate-200 hover:text-blue-600 shadow-sm"><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /></button>
                    </div>
                </div>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar pb-24">
        {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400"><Loader2 className="w-10 h-10 animate-spin mb-3 text-blue-500" /><p className="text-[10px] font-bold uppercase tracking-widest">Đang tải...</p></div>
        ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 bg-white rounded-[2rem] border border-dashed border-slate-200 m-1"><FileSpreadsheet className="w-12 h-12 mb-2 opacity-10" /><p className="font-bold text-xs">Không có dữ liệu phù hợp</p></div>
        ) : (
            Object.keys(groupedItems).map(key => (
                <div key={key} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div onClick={() => setExpandedGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })} className={`p-4 cursor-pointer flex items-center justify-between transition-colors ${expandedGroups.has(key) ? 'bg-blue-50/50 border-b border-blue-100' : 'active:bg-slate-50'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl ${expandedGroups.has(key) ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}><Building2 className="w-5 h-5"/></div>
                            <div className="overflow-hidden"><h3 className="font-black text-sm text-slate-800 uppercase tracking-tight truncate">{key}</h3><p className="text-[9px] font-bold text-slate-400 uppercase truncate">{groupedItems[key][0].ten_ct}</p></div>
                        </div>
                        <div className="flex items-center gap-3"><span className="text-[9px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{groupedItems[key].length} Items</span><ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${expandedGroups.has(key) ? 'rotate-180 text-blue-600' : ''}`} /></div>
                    </div>
                    {expandedGroups.has(key) && (
                        <div className="p-2 space-y-2 bg-slate-50/30">
                            {groupedItems[key].map((item, idx) => {
                                const ins = getInspectionStatus(item.ma_nha_may);
                                return (
                                    <div key={idx} onClick={() => ins ? onViewInspection(ins.id) : onSelect(item, defaultTemplate)} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm active:scale-[0.98] transition-all flex flex-col gap-2 group">
                                        <div className="flex justify-between items-start gap-2">
                                            <h4 className="text-xs font-bold text-slate-800 leading-snug flex-1 uppercase"><HighlightedText text={item.ten_hang_muc} highlight={searchTerm} /></h4>
                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border shrink-0 ${ins ? (ins.status === 'APPROVED' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200') : 'bg-slate-100 text-slate-400'}`}>{ins ? (ins.status === 'APPROVED' ? 'ĐẠT' : 'ĐANG XỬ LÝ') : 'CHƯA QC'}</span>
                                        </div>
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                            <div className="flex items-center gap-2"><span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase border border-blue-100">{item.ma_nha_may}</span><span className="text-[10px] font-black text-slate-400">SL: {item.so_luong_ipo} {item.dvt}</span></div>
                                            <button className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase flex items-center gap-1.5 shadow-sm transition-all ${ins ? 'bg-blue-600 text-white shadow-blue-200' : 'bg-slate-900 text-white'}`}>{ins ? <FileText className="w-3 h-3"/> : <Plus className="w-3 h-3"/>}{ins ? 'Chi tiết' : 'Tạo phiếu'}</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))
        )}
      </div>
    </div>
  );
};
