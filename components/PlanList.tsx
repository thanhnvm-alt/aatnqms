
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { PlanItem, Inspection, CheckItem, InspectionStatus, CheckStatus } from '../types';
import { QRScannerModal } from './QRScannerModal';
import { 
  Search, RefreshCw, Plus, 
  Briefcase, Calendar, 
  Loader2, CheckCircle2, AlertCircle, FileUp,
  Tag, QrCode, X, ChevronDown, FileDown,
  Building2, Clock, Info, PieChart, CheckCircle, AlertTriangle, Circle, ListChecks
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

export const PlanList: React.FC<PlanListProps> = ({
  items, inspections, onSelect, onViewInspection, onRefresh, onImportPlans,
  searchTerm, onSearch, isLoading, totalItems, defaultTemplate = [], onViewPlan
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showScanner, setShowScanner] = useState(false);

  const filteredItems = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    if (!term) return items;
    return (items || []).filter(item => 
        (item.ma_ct || '').toLowerCase().includes(term) ||
        (item.ten_ct || '').toLowerCase().includes(term) ||
        (item.ten_hang_muc || '').toLowerCase().includes(term) ||
        (item.ma_nha_may || '').toLowerCase().includes(term)
    );
  }, [items, searchTerm]);

  const groupedItems = useMemo(() => {
      const groups: Record<string, PlanItem[]> = {};
      filteredItems.forEach(item => {
          const key = item.ma_ct || 'DỰ ÁN KHÁC';
          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
      });
      return groups;
  }, [filteredItems]);

  const toggleGroup = (key: string) => {
      setExpandedGroups(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
      });
  };

  const getInspectionStatus = (ma_nha_may: string, ma_ct: string, ten_hang_muc: string) => {
      return inspections.find(i => 
          (i.ma_nha_may && i.ma_nha_may === ma_nha_may) ||
          (i.ma_ct === ma_ct && i.ten_hang_muc === ten_hang_muc && !i.ma_nha_may) // Fallback matching
      );
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 no-scroll-x">
      <div className="shrink-0 bg-white px-3 py-3 border-b border-slate-200 z-20 shadow-sm">
          <div className="flex flex-col gap-3">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" placeholder="Tìm Mã CT, Sản phẩm..." 
                        value={searchTerm}
                        onChange={(e) => onSearch(e.target.value)}
                        className="w-full pl-9 pr-10 h-10 bg-slate-100 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none focus:bg-white transition-all"
                    />
                    <button onClick={() => setShowScanner(true)} className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-slate-400"><QrCode className="w-4 h-4" /></button>
                </div>
                
                <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Tổng cộng: {filteredItems.length} kế hoạch
                    </p>
                    <div className="flex items-center gap-2">
                        <button onClick={() => fileInputRef.current?.click()} className="h-8 w-8 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100"><FileUp className="w-3.5 h-3.5"/></button>
                        <button onClick={onRefresh} className="h-8 w-8 flex items-center justify-center bg-white text-slate-400 rounded-lg border border-slate-200 active:text-blue-600"><RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /></button>
                    </div>
                </div>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar pb-24">
        {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400"><Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" /><p className="text-[9px] font-black uppercase tracking-widest">Đang tải kế hoạch...</p></div>
        ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200"><Briefcase className="w-10 h-10 mb-2 opacity-10" /><p className="font-bold text-[10px] uppercase">Trống</p></div>
        ) : (
            <div className="space-y-3">
                {Object.keys(groupedItems).sort().map((groupKey) => {
                    const groupItems = groupedItems[groupKey];
                    const isExpanded = expandedGroups.has(groupKey);
                    // Use the project name from the first item if available
                    const projectName = groupItems[0]?.ten_ct || '';
                    
                    // Calculate stats for this group
                    const groupStats = groupItems.reduce((acc, item) => {
                        const inspection = getInspectionStatus(item.ma_nha_may, item.ma_ct, item.ten_hang_muc);
                        acc.total++;
                        if (inspection) {
                            acc.checked++;
                            const isFail = inspection.status === InspectionStatus.FLAGGED || inspection.items?.some(it => it.status === CheckStatus.FAIL);
                            if (isFail) acc.fail++;
                        }
                        return acc;
                    }, { total: 0, checked: 0, fail: 0 });

                    return (
                        <div key={groupKey} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                            <div onClick={() => toggleGroup(groupKey)} className={`p-3 md:p-4 cursor-pointer flex items-center justify-between gap-2 ${isExpanded ? 'bg-blue-50/40 border-b border-blue-100' : 'bg-white'}`}>
                                <div className="flex items-center gap-3 overflow-hidden flex-1">
                                    <div className={`p-2 rounded-lg shrink-0 ${isExpanded ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}><Building2 className="w-4 h-4" /></div>
                                    <div className="flex flex-col overflow-hidden w-full">
                                        <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                                            <h3 className="font-black text-[11px] text-slate-800 uppercase truncate max-w-[120px] md:max-w-none">
                                                {groupKey}
                                            </h3>
                                            
                                            {/* Badge Stats for Group */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md flex items-center gap-1 whitespace-nowrap">
                                                    <ListChecks className="w-2.5 h-2.5" /> {groupStats.checked}/{groupStats.total}
                                                </span>
                                                {groupStats.fail > 0 && (
                                                    <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md flex items-center gap-1 whitespace-nowrap">
                                                        <AlertTriangle className="w-2.5 h-2.5" /> {groupStats.fail}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <span className="text-slate-500 text-[10px] font-medium truncate block mt-0.5">{projectName}</span>
                                    </div>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                            </div>
                            {isExpanded && (
                                <div className="p-2 space-y-2 bg-slate-50/50">
                                    {groupItems.map((item, idx) => {
                                        const inspection = getInspectionStatus(item.ma_nha_may, item.ma_ct, item.ten_hang_muc);
                                        const isDone = inspection?.status === InspectionStatus.COMPLETED || inspection?.status === InspectionStatus.APPROVED;
                                        return (
                                            <div 
                                                key={idx} 
                                                // Trigger view detail on card click
                                                onClick={() => onViewPlan?.(item)}
                                                className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm active:scale-[0.98] transition-all flex flex-col gap-2 cursor-pointer hover:border-blue-300 group"
                                            >
                                                <div className="flex justify-between items-start">
                                                    <span className="text-[9px] font-black bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 truncate max-w-[150px]">{item.ma_nha_may || item.headcode || 'N/A'}</span>
                                                    <span className="text-[8px] font-bold text-slate-400 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {item.plannedDate}</span>
                                                </div>
                                                <h4 className="text-[11px] font-bold text-slate-700 leading-tight uppercase line-clamp-2 group-hover:text-blue-600 transition-colors">{item.ten_hang_muc}</h4>
                                                <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                                    <span className="text-[10px] font-black text-slate-400">SL: {item.so_luong_ipo} {item.dvt}</span>
                                                    <div className="flex items-center gap-2">
                                                        {inspection ? (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); onViewInspection(inspection.id); }} 
                                                                className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase flex items-center gap-1 border shadow-sm ${isDone ? 'bg-green-600 text-white border-green-600' : 'bg-orange-500 text-white border-orange-500'}`}
                                                            >
                                                                {isDone ? <CheckCircle2 className="w-3 h-3"/> : <AlertCircle className="w-3 h-3"/>}
                                                                {isDone ? 'Hoàn tất' : 'Chi tiết'}
                                                            </button>
                                                        ) : (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); onSelect(item, defaultTemplate); }} 
                                                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[8px] font-black uppercase shadow-md active:scale-90 flex items-center gap-1.5 hover:bg-blue-700"
                                                            >
                                                                <Plus className="w-3 h-3" /> Kiểm tra
                                                            </button>
                                                        )}
                                                        {/* Optional Info Icon for detail view explicit action */}
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); onViewPlan?.(item); }}
                                                            className="p-1.5 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                                                        >
                                                            <Info className="w-3.5 h-3.5" />
                                                        </button>
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
      <input type="file" ref={fileInputRef} onChange={(e) => {/* Handle */}} accept=".xlsx" className="hidden" />
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={(data) => { onSearch(data); setShowScanner(false); }} />}
    </div>
  );
};
