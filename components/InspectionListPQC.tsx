import React, { useState, useMemo } from 'react';
import { Inspection, InspectionStatus, CheckStatus, Workshop } from '../types';
import { 
  Search, RefreshCw, Filter, Calendar, 
  ChevronDown, ChevronRight, LayoutList, 
  CheckCircle2, XCircle, AlertTriangle, 
  Factory, Box, Layers, BarChart3, SlidersHorizontal,
  User, FileText
} from 'lucide-react';

interface InspectionListPQCProps {
  inspections: Inspection[];
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  workshops?: Workshop[];
  currentUserName?: string;
}

export const InspectionListPQC: React.FC<InspectionListPQCProps> = ({ 
  inspections, onSelect, onRefresh, isLoading, workshops
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [workshopFilter, setWorkshopFilter] = useState<string>('ALL');
  
  // Date Filtering
  const [dateFilterMode, setDateFilterMode] = useState<'7DAYS' | 'ALL' | 'CUSTOM'>('7DAYS');
  const [specificDate, setSpecificDate] = useState<string>('');
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  
  const [expandedWorkshops, setExpandedWorkshops] = useState<Set<string>>(new Set());

  // Helper to safely access DB fields (any type cast)
  const getField = (item: any, dbField: string, appField: string, fallback: any = '') => {
      if (item[dbField] !== undefined && item[dbField] !== null) return item[dbField];
      if (item[appField] !== undefined && item[appField] !== null) return item[appField];
      return fallback;
  };

  // Derive unique values
  const uniqueWorkshops = useMemo(() => {
    const rawValues = Array.from(new Set(inspections.filter(i => i.type === 'PQC').map(i => i.workshop || i.ma_nha_may).filter(Boolean)));
    return rawValues.map(val => {
        const found = workshops?.find(w => w.code === val);
        return { code: val, label: found ? found.name : val };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [inspections, workshops]);

  // Filter Logic
  const filteredData = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    return inspections.filter(item => {
      // 1. Strict PQC Type Check
      if (item.type !== 'PQC') return false;

      // Data Mapping for Filter
      const inspectorName = getField(item, 'created_by', 'inspectorName', getField(item, 'inspector', 'inspectorName', 'Unknown'));
      const itemDateStr = getField(item, 'created_at', 'date'); // Note: created_at might be timestamp in some DBs, assuming string 'YYYY-MM-DD' based on context or need conversion

      // 2. Date Filter
      // Handle date parsing safely
      let itemDate = new Date();
      if (itemDateStr) {
          // If numeric timestamp
          if (!isNaN(itemDateStr) && typeof itemDateStr === 'number') itemDate = new Date(itemDateStr * 1000); 
          else itemDate = new Date(itemDateStr);
      }
      itemDate.setHours(0, 0, 0, 0);

      if (dateFilterMode === '7DAYS') {
          if (itemDate < sevenDaysAgo) return false;
      } else if (dateFilterMode === 'CUSTOM' && specificDate) {
          const specDate = new Date(specificDate);
          specDate.setHours(0,0,0,0);
          if (itemDate.getTime() !== specDate.getTime()) return false;
      }

      // 3. Search
      const matchesSearch = !term || (
        (item.ma_ct || '').toLowerCase().includes(term) ||
        (item.ten_ct || '').toLowerCase().includes(term) ||
        (item.ten_hang_muc || '').toLowerCase().includes(term) ||
        (inspectorName || '').toLowerCase().includes(term)
      );

      // 4. Dropdowns
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const itemWorkshop = item.workshop || item.ma_nha_may;
      const matchesWorkshop = workshopFilter === 'ALL' || itemWorkshop === workshopFilter;

      return matchesSearch && matchesStatus && matchesWorkshop;
    }).sort((a, b) => {
        const dateA = getField(a, 'created_at', 'date');
        const dateB = getField(b, 'created_at', 'date');
        return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [inspections, searchTerm, statusFilter, workshopFilter, dateFilterMode, specificDate]);

  // Statistics for Header
  const stats = useMemo(() => {
      let totalQty = 0;
      let passQty = 0;
      let failQty = 0;
      filteredData.forEach(i => {
          // Map to DB columns: qty_total, qty_pass, qty_fail
          totalQty += Number(getField(i, 'qty_total', 'inspectedQuantity', 0));
          passQty += Number(getField(i, 'qty_pass', 'passedQuantity', 0));
          failQty += Number(getField(i, 'qty_fail', 'failedQuantity', 0));
      });
      const passRate = totalQty > 0 ? Math.round((passQty / totalQty) * 100) : 0;
      return { totalQty, passQty, failQty, passRate };
  }, [filteredData]);

  // Grouping: Factory -> Project
  const groupedData = useMemo(() => {
    const groups: Record<string, { 
      name: string, 
      projects: Record<string, Inspection[]>,
      count: number 
    }> = {};

    filteredData.forEach(item => {
      const wKey = item.workshop || item.ma_nha_may || 'KHÁC';
      
      if (!groups[wKey]) {
          const wName = workshops?.find(w => w.code === wKey)?.name || (wKey === 'KHÁC' ? 'Chưa phân xưởng' : wKey);
          groups[wKey] = { name: wName, projects: {}, count: 0 };
      }
      
      const pKey = item.ma_ct || 'NO_PROJECT';
      if (!groups[wKey].projects[pKey]) groups[wKey].projects[pKey] = [];
      
      groups[wKey].projects[pKey].push(item);
      groups[wKey].count++;
    });
    return groups;
  }, [filteredData, workshops]);

  const toggleWorkshop = (key: string) => {
    setExpandedWorkshops(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const activeFiltersCount = [
      statusFilter !== 'ALL',
      workshopFilter !== 'ALL',
      dateFilterMode === 'CUSTOM'
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full bg-indigo-50/30 no-scroll-x relative">
      {/* PQC Header Toolbar */}
      <div className="bg-white border-b border-indigo-100 sticky top-0 z-40 px-4 py-3 shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-200">
                <Factory className="w-5 h-5" />
            </div>
            <div className="flex-1">
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">KIỂM SOÁT SẢN XUẤT (PQC)</h2>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] font-bold text-slate-500">
                    <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3"/> SL Kiểm: {stats.totalQty}</span>
                    <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3 h-3"/> Đạt: {stats.passRate}%</span>
                </div>
            </div>
            <button onClick={onRefresh} className="p-2 text-indigo-500 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all"><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /></button>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" placeholder="Tìm LSX, sản phẩm, QC..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:ring-2 ring-indigo-200 transition-all"
              />
            </div>
            <button 
                onClick={() => setShowFiltersPanel(!showFiltersPanel)} 
                className={`p-2 rounded-xl border transition-all relative ${showFiltersPanel || activeFiltersCount > 0 ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}
            >
                <SlidersHorizontal className="w-4 h-4" />
                {activeFiltersCount > 0 && !showFiltersPanel && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                )}
            </button>
          </div>

          {showFiltersPanel && (
            <div className="mt-3 p-4 bg-white rounded-2xl border border-indigo-100 shadow-xl animate-in slide-in-from-top-2 duration-300 relative z-50">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Filter className="w-3 h-3"/> Bộ lọc PQC
                    </h3>
                    {activeFiltersCount > 0 && (
                        <button onClick={() => { setStatusFilter('ALL'); setWorkshopFilter('ALL'); setDateFilterMode('7DAYS'); setSpecificDate(''); }} className="text-[10px] font-bold text-red-500 hover:underline">Xóa lọc</button>
                    )}
                </div>
                
                {/* Date Filter */}
                <div className="mb-3 bg-indigo-50/50 p-2 rounded-xl border border-indigo-100 flex flex-wrap gap-2">
                    <button onClick={() => { setDateFilterMode('7DAYS'); setSpecificDate(''); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border ${dateFilterMode === '7DAYS' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>7 Ngày qua</button>
                    <button onClick={() => { setDateFilterMode('ALL'); setSpecificDate(''); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border ${dateFilterMode === 'ALL' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>Tất cả</button>
                    <button onClick={() => setDateFilterMode('CUSTOM')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border ${dateFilterMode === 'CUSTOM' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>Ngày cụ thể</button>
                    {dateFilterMode === 'CUSTOM' && <input type="date" value={specificDate} onChange={e => setSpecificDate(e.target.value)} className="px-2 py-1 bg-white border border-indigo-200 rounded-lg text-[10px] font-bold text-indigo-700 outline-none"/>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Xưởng</label>
                        <select value={workshopFilter} onChange={e => setWorkshopFilter(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold outline-none">
                            <option value="ALL">Tất cả xưởng</option>
                            {uniqueWorkshops.map(w => <option key={w.code} value={w.code}>{w.label}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Trạng thái</label>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold outline-none">
                            <option value="ALL">Tất cả</option>
                            <option value={InspectionStatus.PENDING}>Chờ duyệt</option>
                            <option value={InspectionStatus.COMPLETED}>Hoàn thành</option>
                            <option value={InspectionStatus.FLAGGED}>Có lỗi (NCR)</option>
                        </select>
                    </div>
                </div>
            </div>
          )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 no-scrollbar pb-24">
        {Object.keys(groupedData).length === 0 ? (
             <div className="py-20 text-center flex flex-col items-center justify-center">
                <Box className="w-12 h-12 text-indigo-200 mb-3" />
                <p className="font-bold text-slate-400 text-xs uppercase tracking-widest">Không có dữ liệu PQC</p>
                {isLoading && <p className="text-[9px] text-slate-400 mt-1 animate-pulse">Đang tải...</p>}
             </div>
        ) : (
            <div className="space-y-4">
                {Object.keys(groupedData).sort().map(wKey => {
                    const group = groupedData[wKey];
                    const isExpanded = expandedWorkshops.has(wKey);
                    
                    return (
                        <div key={wKey} className="space-y-2">
                            <div 
                                onClick={() => toggleWorkshop(wKey)}
                                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${isExpanded ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <Factory className={`w-4 h-4 ${isExpanded ? 'text-indigo-200' : 'text-indigo-500'}`} />
                                    <div>
                                        <h3 className="font-bold text-xs uppercase tracking-tight">{group.name}</h3>
                                        <p className={`text-[9px] font-medium uppercase tracking-widest ${isExpanded ? 'text-indigo-200' : 'text-slate-400'}`}>{wKey}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isExpanded ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{group.count}</span>
                                    <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="space-y-4 pl-2 md:pl-4 border-l-2 border-indigo-100 animate-in slide-in-from-top-2 duration-300">
                                    {Object.entries(group.projects).map(([pKey, items]) => (
                                        <div key={pKey} className="space-y-2">
                                            <div className="flex items-center gap-2 px-2">
                                                <Box className="w-3 h-3 text-slate-400" />
                                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{pKey === 'NO_PROJECT' ? 'Dự án khác' : pKey}</h4>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {/* Fixed: cast items as Inspection[] to resolve mapping error */}
                                                {(items as Inspection[]).map(item => {
                                                    // Map Data from forms_pqc table schema
                                                    const iTotal = Number(getField(item, 'qty_total', 'inspectedQuantity', 0));
                                                    // Use calculated pass/fail if available, else derive
                                                    const iPass = Number(getField(item, 'qty_pass', 'passedQuantity', 0));
                                                    const iFail = Number(getField(item, 'qty_fail', 'failedQuantity', 0));
                                                    const iRate = iTotal > 0 ? (iPass/iTotal)*100 : 0;
                                                    
                                                    // Display Fields
                                                    const stageName = getField(item, 'stage', 'inspectionStage', 'Chưa rõ CĐ');
                                                    // Prioritize ten_hang_muc
                                                    const prodName = getField(item, 'ten_hang_muc', 'ten_hang_muc', item.ten_ct || 'Sản phẩm chưa đặt tên');
                                                    const hasNCR = item.status === InspectionStatus.FLAGGED;
                                                    
                                                    // Plan Quantity vs Inspected
                                                    const planQty = Number(getField(item, 'sl_ipo', 'so_luong_ipo', 0));
                                                    const unit = getField(item, 'dvt', 'dvt', 'PCS');
                                                    
                                                    // Inspector: Map from created_by per request
                                                    const inspectorName = getField(item, 'created_by', 'inspectorName', getField(item, 'inspector', 'inspectorName', 'Unknown'));
                                                    
                                                    // Date
                                                    const rawDate = getField(item, 'created_at', 'date');
                                                    const displayDate = rawDate ? (typeof rawDate === 'number' ? new Date(rawDate * 1000).toLocaleDateString('vi-VN') : rawDate) : 'N/A';

                                                    return (
                                                        <div 
                                                            key={item.id} 
                                                            onClick={() => onSelect(item.id)}
                                                            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer relative overflow-hidden group"
                                                        >
                                                            <div className="flex justify-between items-start mb-3">
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`p-1.5 rounded-lg ${hasNCR ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                                                        {hasNCR ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                                                                            <Layers className="w-3 h-3" /> {stageName}
                                                                        </span>
                                                                        <h4 className="font-bold text-slate-800 text-xs uppercase line-clamp-1">{prodName}</h4>
                                                                    </div>
                                                                </div>
                                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                                                                    item.status === InspectionStatus.APPROVED ? 'bg-green-600 text-white border-green-600' :
                                                                    item.status === InspectionStatus.FLAGGED ? 'bg-red-600 text-white border-red-600' :
                                                                    'bg-slate-100 text-slate-500 border-slate-200'
                                                                }`}>
                                                                    {item.status}
                                                                </span>
                                                            </div>

                                                            <div className="bg-slate-50 rounded-xl p-2 border border-slate-100 mb-3">
                                                                <div className="flex justify-between text-[10px] mb-1 font-bold text-slate-500 uppercase tracking-wider">
                                                                    <span>Kiểm: {iTotal} / {planQty} {unit}</span>
                                                                    <span>Lỗi: {iFail}</span>
                                                                </div>
                                                                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden flex">
                                                                    <div className="bg-green-500 h-full" style={{ width: `${iRate}%` }}></div>
                                                                    <div className="bg-red-500 h-full" style={{ width: `${100-iRate}%` }}></div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {displayDate}</span>
                                                                    <span className="flex items-center gap-1"><User className="w-3 h-3"/> {inspectorName}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1 text-indigo-600 group-hover:underline">
                                                                    Chi tiết <ChevronRight className="w-3 h-3" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
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