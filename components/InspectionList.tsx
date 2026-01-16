import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, Workshop, ModuleId } from '../types';
import { 
  Search, RefreshCw, FolderOpen, Clock, 
  Loader2, X, ChevronDown, ChevronRight,
  Filter, Building2, User, SlidersHorizontal,
  PackageCheck, Factory, Truck, Box, ShieldCheck, MapPin,
  Calendar, RotateCcw, CheckCircle2, AlertOctagon, UserCheck, LayoutGrid
} from 'lucide-react';

interface InspectionListProps {
  inspections: Inspection[];
  onSelect: (id: string) => void;
  isLoading?: boolean;
  workshops?: Workshop[];
  onRefresh?: () => void;
}

const MODULE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    'IQC': { label: 'IQC', color: 'text-blue-600', bg: 'bg-blue-50', icon: PackageCheck },
    'PQC': { label: 'PQC', color: 'text-purple-600', bg: 'bg-purple-50', icon: Factory },
    'SQC_MAT': { label: 'SQC-VT', color: 'text-teal-600', bg: 'bg-teal-50', icon: Truck },
    'SQC_VT': { label: 'SQC-VT', color: 'text-teal-600', bg: 'bg-teal-50', icon: Truck },
    'SQC_BTP': { label: 'SQC-BTP', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: Box },
    'FQC': { label: 'FQC', color: 'text-indigo-600', bg: 'bg-indigo-50', icon: ShieldCheck },
    'SITE': { label: 'SITE', color: 'text-amber-600', bg: 'bg-amber-50', icon: MapPin },
    'SPR': { label: 'SPR', color: 'text-slate-600', bg: 'bg-slate-50', icon: Filter },
    'STEP': { label: 'STEP', color: 'text-rose-600', bg: 'bg-rose-50', icon: SlidersHorizontal },
    'FSR': { label: 'FSR', color: 'text-orange-600', bg: 'bg-orange-50', icon: FolderOpen }
};

const SkeletonItem = () => (
    <div className="bg-white p-4 rounded-2xl border border-slate-100 animate-pulse flex items-center justify-between">
        <div className="flex-1 space-y-2">
            <div className="h-3 w-20 bg-slate-100 rounded"></div>
            <div className="h-4 w-3/4 bg-slate-100 rounded"></div>
            <div className="h-2 w-1/2 bg-slate-100 rounded"></div>
        </div>
        <div className="w-8 h-8 bg-slate-50 rounded-lg"></div>
    </div>
);

export const InspectionList: React.FC<InspectionListProps> = ({ 
  inspections, onSelect, isLoading, workshops = [], onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // ISO-GROUPING LOGIC
  const groupedInspections = useMemo(() => {
    const groups: Record<string, { inspections: Inspection[], projectName: string }> = {};
    
    const filtered = (inspections || []).filter(item => {
        const term = searchTerm.toLowerCase();
        return !term || 
               item.ma_ct?.toLowerCase().includes(term) ||
               item.ten_ct?.toLowerCase().includes(term) ||
               item.ten_hang_muc?.toLowerCase().includes(term) ||
               item.po_number?.toLowerCase().includes(term);
    });

    filtered.forEach(item => {
        // Grouping key: If no ma_ct or ma_ct is 'DÙNG CHUNG' -> Group in 'COMMON'
        const isCommon = !item.ma_ct || item.ma_ct === 'DÙNG CHUNG';
        const key = isCommon ? 'DÙNG CHUNG' : (item.ma_ct || 'DỰ ÁN KHÁC');
        
        if (!groups[key]) {
            groups[key] = {
                inspections: [],
                projectName: isCommon ? 'Vật tư / Thành phần dùng chung' : (item.ten_ct || 'Dự án chưa định danh')
            };
        }
        groups[key].inspections.push(item);
    });

    // Auto-expand first few groups if searching
    if (searchTerm && Object.keys(groups).length > 0) {
        setExpandedGroups(new Set(Object.keys(groups)));
    }

    return groups;
  }, [inspections, searchTerm]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 no-scroll-x" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="shrink-0 bg-white px-4 py-4 border-b border-slate-200 z-30 shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-3">
              <div className="relative flex-1 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  <input 
                    type="text" 
                    placeholder="Tìm theo Mã CT, Dự án, Sản phẩm..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-inner"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-600"><X className="w-4 h-4" /></button>
                  )}
              </div>
              <button 
                onClick={onRefresh} 
                className="px-6 py-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-600 font-bold hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span className="text-[10px] uppercase tracking-widest">Làm mới</span>
              </button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar pb-24">
        <div className="max-w-7xl mx-auto space-y-6">
            {isLoading && inspections.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1,2,3,4,5,6].map(i => <SkeletonItem key={i} />)}
                </div>
            ) : Object.keys(groupedInspections).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                    <FolderOpen className="w-20 h-20 opacity-10 mb-4" />
                    <p className="font-black uppercase tracking-[0.2em] text-[10px]">Không tìm thấy dữ liệu kiểm tra</p>
                </div>
            ) : (
                Object.keys(groupedInspections).sort((a,b) => a === 'DÙNG CHUNG' ? 1 : b === 'DÙNG CHUNG' ? -1 : a.localeCompare(b)).map(groupKey => {
                    const group = groupedInspections[groupKey];
                    const isExpanded = expandedGroups.has(groupKey);
                    const isSpecial = groupKey === 'DÙNG CHUNG';

                    return (
                        <div key={groupKey} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div 
                                onClick={() => toggleGroup(groupKey)}
                                className={`p-5 flex items-center justify-between cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/40 border-b border-blue-100' : 'hover:bg-slate-50/50'}`}
                            >
                                <div className="flex items-center gap-4 flex-1 overflow-hidden">
                                    <div className={`p-3 rounded-2xl shrink-0 shadow-sm ${isExpanded ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <h3 className={`font-black text-xs uppercase tracking-tight truncate ${isSpecial ? 'text-blue-700' : 'text-slate-800'}`}>
                                                {groupKey}
                                            </h3>
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black border border-slate-200">
                                                {group.inspections.length}
                                            </span>
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate">
                                            {group.projectName}
                                        </p>
                                    </div>
                                </div>
                                <ChevronDown className={`w-5 h-5 text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                            </div>

                            {isExpanded && (
                                <div className="divide-y divide-slate-50 bg-white animate-in slide-in-from-top-2 duration-200">
                                    {group.inspections.map((item) => {
                                        const config = MODULE_CONFIG[item.type || 'PQC'] || MODULE_CONFIG['PQC'];
                                        const Icon = config.icon;
                                        
                                        return (
                                            <div 
                                                key={item.id}
                                                onClick={() => onSelect(item.id)}
                                                className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/80 transition-all group cursor-pointer relative border-l-4 border-transparent hover:border-blue-500"
                                            >
                                                <div className="flex items-start gap-4 flex-1">
                                                    <div className={`p-3 rounded-2xl shadow-sm border transition-all ${config.bg} ${config.color} border-current/10 group-hover:scale-105`}>
                                                        <Icon className="w-6 h-6" />
                                                    </div>
                                                    <div className="flex-1 overflow-hidden space-y-1.5">
                                                        <div className="flex items-center flex-wrap gap-2">
                                                            <p className="font-black text-slate-800 text-sm uppercase tracking-tight truncate max-w-[300px] md:max-w-xl group-hover:text-blue-700 transition-colors">
                                                                {item.ten_hang_muc || `PO: ${item.po_number}`}
                                                            </p>
                                                            {item.status === InspectionStatus.FLAGGED && (
                                                                <span className="flex items-center gap-1 bg-red-600 text-white px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-sm">
                                                                    <AlertOctagon className="w-2.5 h-2.5" /> LỖI/KPH
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                                            <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase">
                                                                <Clock className="w-3 h-3 text-blue-400" /> {item.date}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase">
                                                                <UserCheck className="w-3 h-3 text-indigo-400" /> {item.inspectorName}
                                                            </div>
                                                            {item.workshop && (
                                                                <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase">
                                                                    <Factory className="w-3 h-3 text-emerald-400" /> {item.workshop}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                                                    <div className={`px-3 py-1.5 rounded-xl text-[9px] font-black border uppercase tracking-[0.1em] shadow-sm ${
                                                        item.status === InspectionStatus.APPROVED ? 'bg-blue-600 text-white border-blue-600' :
                                                        item.status === InspectionStatus.COMPLETED ? 'bg-green-600 text-white border-green-600' :
                                                        item.status === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-600 border-red-200' :
                                                        'bg-white text-slate-500 border-slate-200'
                                                    }`}>
                                                        {item.status}
                                                    </div>
                                                    <div className="p-2.5 bg-white border border-slate-200 text-slate-300 rounded-2xl shadow-sm group-hover:text-blue-600 group-hover:border-blue-300 group-hover:bg-blue-50 transition-all group-hover:translate-x-1 active:scale-90">
                                                        <ChevronRight className="w-5 h-5" />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
      </div>
      
      {/* Scroll Info for Mobile */}
      <div className="md:hidden px-4 py-2 bg-slate-900/5 backdrop-blur-sm text-center border-t border-slate-200 sticky bottom-0">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Hiển thị {inspections.length} bản ghi kiểm tra</p>
      </div>
    </div>
  );
};