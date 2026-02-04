
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { PlanItem, Inspection, CheckItem, InspectionStatus, CheckStatus } from '../types';
import { QRScannerModal } from './QRScannerModal';
import { 
  Search, RefreshCw, Plus, 
  Briefcase, 
  Loader2, CheckCircle2, AlertCircle, FileUp,
  QrCode, ChevronDown,
  Building2, Clock, ListChecks,
  AlertTriangle,
  FileText, ImageIcon, Info, ChevronRight,
  Calendar, RotateCcw, Check, Layers, User as UserIcon, Palette, Cuboid,
  MessageSquare
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
  onUpdatePlan: (id: number | string, updatedPlan: Partial<PlanItem>) => Promise<void>;
  onLoadAll?: () => void;
}

export const PlanList: React.FC<PlanListProps> = ({
  items, inspections, onSelect, onViewInspection, onRefresh,
  searchTerm, onSearch, isLoading, totalItems, defaultTemplate = [], onUpdatePlan,
  onLoadAll, onImportPlans 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showScanner, setShowScanner] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  
  const [localTerm, setLocalTerm] = useState(searchTerm);

  useEffect(() => {
    setLocalTerm(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (localTerm !== searchTerm) {
        onSearch(localTerm);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [localTerm, onSearch, searchTerm]);

  const handleSearchChange = (val: string) => {
    setLocalTerm(val);
  };

  const filteredItems = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    if (!term) return items;
    return (items || []).filter(item => 
        (item.ma_ct || '').toLowerCase().includes(term) ||
        (item.ten_ct || '').toLowerCase().includes(term) ||
        (item.ten_hang_muc || '').toLowerCase().includes(term) ||
        (item.ma_nha_may || '').toLowerCase().includes(term) ||
        (item.assignee || '').toLowerCase().includes(term) ||
        (item.description || '').toLowerCase().includes(term)
    );
  }, [items, searchTerm]);

  const groupedItems = useMemo(() => {
      const groups: Record<string, PlanItem[]> = {};
      filteredItems.forEach(item => {
          let key = "";
          const maCt = (item.ma_ct || '').toUpperCase();
          const tenCt = (item.ten_ct || '').toUpperCase();
          if (tenCt.includes('NB') || tenCt.includes('NỘI BỘ')) key = "NỘI BỘ";
          else if (maCt.includes('DM')) key = `NHÀ XINH - ${tenCt || 'CHƯA PHÂN LOẠI'}`;
          else if (maCt.includes('EM')) key = `OEM - ${tenCt || 'CHƯA PHÂN LOẠI'}`;
          else if (maCt.includes('CT')) key = maCt;
          else key = maCt || "DỰ ÁN KHÁC";
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

  const toggleDetails = (id: string) => {
      setExpandedDetails(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id); else next.add(id);
          return next;
      });
  };

  const getInspectionStatus = (item: PlanItem) => {
      const relatedInspections = inspections.filter(i => 
          (i.ma_ct === item.ma_ct && i.ten_hang_muc === item.ten_hang_muc) ||
          (item.ma_nha_may && i.ma_nha_may === item.ma_nha_may) ||
          (item.headcode && i.headcode === item.headcode)
      );

      if (relatedInspections.length === 0) {
          return { status: 'CHƯA QC', color: 'text-slate-400 bg-slate-50 border-slate-100', icon: Clock };
      }

      const allApproved = relatedInspections.every(i => i.status === InspectionStatus.APPROVED);
      const hasFlagged = relatedInspections.some(i => i.status === InspectionStatus.FLAGGED);
      const hasPending = relatedInspections.some(i => i.status === InspectionStatus.PENDING);
      
      if (allApproved) {
          return { status: 'ĐÃ DUYỆT', color: 'text-green-700 bg-green-50 border-green-100', icon: CheckCircle2 };
      } else if (hasFlagged) {
          return { status: 'CÓ LỖI', color: 'text-red-700 bg-red-50 border-red-100', icon: AlertTriangle };
      } else if (hasPending) {
          return { status: 'ĐANG QC', color: 'text-orange-700 bg-orange-50 border-orange-100', icon: AlertCircle };
      } else {
          return { status: 'ĐANG XỬ LÝ', color: 'text-blue-700 bg-blue-50 border-blue-100', icon: Clock };
      }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 no-scroll-x font-sans">
      <div className="shrink-0 bg-white px-4 py-3 border-b border-slate-200 z-20 shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col gap-3">
                <div className="relative w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Tìm Mã CT, Sản phẩm, Người phụ trách..." 
                        value={localTerm}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="w-full pl-11 pr-12 h-11 bg-[#f1f5f9] border border-slate-200 rounded-full text-xs font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all shadow-inner"
                    />
                    <button onClick={() => setShowScanner(true)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 text-slate-400 hover:text-blue-600 transition-colors"><QrCode className="w-5 h-5" /></button>
                </div>
                
                <div className="flex items-center justify-between px-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        TỔNG CỘNG: {totalItems} KẾ HOẠCH
                    </p>
                    <div className="flex items-center gap-2">
                        <button onClick={() => fileInputRef.current?.click()} className="h-8 w-8 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100 shadow-sm hover:bg-emerald-100" title="Nhập Excel IPO"><FileUp className="w-3.5 h-3.5"/></button>
                        <button onClick={onRefresh} className="h-8 w-8 flex items-center justify-center bg-white text-slate-400 rounded-lg border border-slate-200 active:text-blue-600 shadow-sm" title="Làm mới"><RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /></button>
                    </div>
                </div>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar pb-24">
        {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400"><Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" /><p className="text-[9px] font-black uppercase tracking-widest">Đang tải kế hoạch...</p></div>
        ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200"><Briefcase className="w-10 h-10 mb-2 opacity-10" /><p className="font-bold text-[10px] uppercase">Không tìm thấy dữ liệu</p></div>
        ) : (
            <div className="max-w-7xl mx-auto space-y-3">
                {Object.keys(groupedItems).sort().map((groupKey) => {
                    const groupItems = groupedItems[groupKey];
                    const isExpanded = expandedGroups.has(groupKey) || searchTerm.length > 0;
                    const groupStats = groupItems.reduce((acc, item) => {
                        const { status } = getInspectionStatus(item);
                        acc.total++;
                        if (status !== 'CHƯA QC') acc.checked++;
                        return acc;
                    }, { total: 0, checked: 0 });

                    return (
                        <div key={groupKey} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-all">
                            <div onClick={() => toggleGroup(groupKey)} className={`p-4 cursor-pointer flex items-center justify-between ${isExpanded ? 'bg-blue-50/40 border-b border-blue-100' : 'bg-white hover:bg-slate-50'}`}>
                                <div className="flex items-center gap-3 overflow-hidden flex-1">
                                    <div className={`p-2.5 rounded-xl shrink-0 ${isExpanded ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-blue-600'}`}><Building2 className="w-4.5 h-4.5" /></div>
                                    <div className="flex flex-col overflow-hidden">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-black text-[11px] uppercase truncate text-slate-800 tracking-tight">{groupKey}</h3>
                                            <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg flex items-center gap-1"><ListChecks className="w-3 h-3" /> {groupStats.checked}/{groupStats.total}</span>
                                        </div>
                                    </div>
                                </div>
                                <ChevronDown className={`w-5 h-5 text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                            </div>
                            {isExpanded && (
                                <div className="p-2.5 space-y-2 bg-slate-50/30 animate-in slide-in-from-top-1">
                                    {groupItems.map(item => {
                                        const { status, color, icon: StatusIcon } = getInspectionStatus(item);
                                        const isDetailsExpanded = expandedDetails.has(item.id as string);
                                        const hasDrawing = item.drawing_url && JSON.parse(item.drawing_url).length > 0;
                                        const hasMaterials = item.materials_text && JSON.parse(item.materials_text).length > 0;
                                        const hasSamples = item.samples_json && JSON.parse(item.samples_json).length > 0;
                                        const hasSimulations = item.simulations_json && JSON.parse(item.simulations_json).length > 0;

                                        return (
                                            <div 
                                                key={item.id} 
                                                className="bg-white p-4 rounded-[1.25rem] border border-slate-200 shadow-sm active:scale-[0.98] transition-all flex flex-col gap-3 cursor-pointer hover:border-blue-300 group"
                                                onClick={() => onSelect(item)}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex flex-col min-w-0 flex-1">
                                                        <h4 className="text-[12px] font-black text-slate-800 uppercase leading-tight group-hover:text-blue-700 transition-colors truncate">
                                                            {item.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ'}
                                                        </h4>
                                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">#{item.ma_ct}</span>
                                                            <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                                                            <span className="text-[9px] font-mono text-slate-500 uppercase">{item.ma_nha_may || item.headcode || 'N/A'}</span>
                                                            <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                                                            <span className="text-[9px] font-bold text-slate-500 uppercase">{item.so_luong_ipo} {item.dvt}</span>
                                                        </div>
                                                    </div>
                                                    <div className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase flex items-center gap-1.5 border shadow-sm ${color}`}>
                                                        <StatusIcon className="w-3.5 h-3.5"/> {status}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter flex items-center gap-1"><Calendar className="w-3 h-3 text-blue-400" /> {item.plannedDate || 'N/A'}</span>
                                                        {item.assignee && <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter flex items-center gap-1"><UserIcon className="w-3 h-3 text-purple-400" /> {item.assignee}</span>}
                                                    </div>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); toggleDetails(item.id as string); }}
                                                        className="p-1 bg-slate-50 rounded-lg group-hover:bg-blue-50 transition-colors flex items-center gap-1 text-[9px] font-black uppercase text-slate-400"
                                                    >
                                                        {isDetailsExpanded ? 'Thu gọn' : 'Chi tiết khác'} <ChevronRight className={`w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-transform ${isDetailsExpanded ? 'rotate-90' : ''}`} />
                                                    </button>
                                                </div>
                                                
                                                {isDetailsExpanded && (
                                                    <div className="border-t border-slate-100 pt-3 mt-3 animate-in fade-in slide-in-from-top-1 text-[11px] text-slate-600 space-y-2">
                                                        {item.description && (
                                                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                                <p className="font-bold mb-1 flex items-center gap-1.5 text-slate-700"><MessageSquare className="w-3.5 h-3.5 text-blue-500"/> Mô tả:</p>
                                                                <p className="italic leading-relaxed">{item.description}</p>
                                                            </div>
                                                        )}
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {hasDrawing && (
                                                                <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-100 text-blue-700">
                                                                    <Layers className="w-4 h-4" /> <span className="font-bold">Bản vẽ kỹ thuật</span>
                                                                </div>
                                                            )}
                                                            {hasMaterials && (
                                                                <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg border border-emerald-100 text-emerald-700">
                                                                    <Cuboid className="w-4 h-4" /> <span className="font-bold">Vật tư (BOM)</span>
                                                                </div>
                                                            )}
                                                            {hasSamples && (
                                                                <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg border border-purple-100 text-purple-700">
                                                                    <Palette className="w-4 h-4" /> <span className="font-bold">Mẫu đối chứng</span>
                                                                </div>
                                                            )}
                                                            {hasSimulations && (
                                                                <div className="flex items-center gap-2 p-2 bg-pink-50 rounded-lg border border-pink-100 text-pink-700">
                                                                    <ImageIcon className="w-4 h-4" /> <span className="font-bold">Render/3D</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {(!item.description && !hasDrawing && !hasMaterials && !hasSamples && !hasSimulations) && (
                                                            <p className="text-center text-[9px] text-slate-400 italic py-2">Không có chi tiết bổ sung.</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
                {onLoadAll && items.length < totalItems && (
                    <div className="pt-4 pb-12 flex justify-center">
                        <button 
                            onClick={onLoadAll}
                            className="px-8 py-3.5 bg-white border border-slate-200 rounded-full text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 transition-all shadow-md active:scale-95"
                        >
                            Tải thêm dữ liệu ({items.length}/{totalItems})
                        </button>
                    </div>
                )}
            </div>
        )}
      </div>
      <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx" />
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={(data) => { onSearch(data); setShowScanner(false); }} />}
    </div>
  );
};
