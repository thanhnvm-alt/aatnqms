
import React, { useState, useMemo } from 'react';
import { Inspection, InspectionStatus, Workshop, CheckStatus } from '../types';
import { 
  Search, RefreshCw, Calendar, 
  CheckCircle2, AlertTriangle, 
  Factory, Box, User,
  ArrowRight, Filter, X, Layers, AlertOctagon
} from 'lucide-react';
import { ALL_MODULES } from '../constants';

interface InspectionListProps {
  inspections: Inspection[];
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  workshops?: Workshop[];
  currentUserName?: string;
  userRole?: string;
  selectedModule: string;
  onModuleChange: (module: string) => void;
}

export const InspectionList: React.FC<InspectionListProps> = ({ 
  inspections, onSelect, onRefresh, isLoading, workshops,
  selectedModule, onModuleChange
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Advanced Filters State
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [filterInspector, setFilterInspector] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterWorkshop, setFilterWorkshop] = useState('ALL');
  const [filterStage, setFilterStage] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Helper to get Inspector Name consistently
  const getInspectorName = (item: any) => {
      return item.inspectorName || item.created_by || item.inspector || 'N/A';
  };

  // Helper to get Workshop Name
  const getWorkshopName = (code?: string) => {
      if (!code) return '---';
      const ws = workshops?.find(w => w.code === code);
      return ws ? ws.name : code;
  };

  // Extract Unique Lists for Dropdowns
  const uniqueData = useMemo(() => {
      const inspectors = new Set<string>();
      const types = new Set<string>();
      const workshopCodes = new Set<string>();
      const stages = new Set<string>();

      inspections.forEach(item => {
          inspectors.add(getInspectorName(item));
          if (item.type) types.add(item.type);
          if (item.workshop || item.ma_nha_may) workshopCodes.add(item.workshop || item.ma_nha_may || '');
          if (item.inspectionStage || item.stage) stages.add(item.inspectionStage || item.stage || '');
      });

      return {
          inspectors: Array.from(inspectors).filter(Boolean).sort(),
          types: Array.from(types).filter(Boolean).sort(),
          workshops: Array.from(workshopCodes).filter(Boolean).sort(),
          stages: Array.from(stages).filter(Boolean).sort(),
      };
  }, [inspections]);

  const filteredData = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    return inspections.filter(item => {
      // 1. Module Tab Filter (Top Level)
      // Note: We keep this logic but remove the UI buttons, assuming selectedModule is managed by parent or defaults to ALL
      if (selectedModule !== 'ALL' && item.type !== selectedModule) return false;

      // 2. Search Box
      const searchContent = `
        ${item.ma_ct || ''} 
        ${item.ten_ct || ''} 
        ${item.ten_hang_muc || ''} 
        ${getInspectorName(item)}
      `.toLowerCase();
      
      const matchesSearch = !term || searchContent.includes(term);

      // 3. Advanced Filters
      let matchesAdvanced = true;

      // Status
      if (filterStatus !== 'ALL' && item.status !== filterStatus) matchesAdvanced = false;

      // Type (Dropdown)
      if (filterType !== 'ALL' && item.type !== filterType) matchesAdvanced = false;

      // Inspector
      if (filterInspector !== 'ALL' && getInspectorName(item) !== filterInspector) matchesAdvanced = false;

      // Workshop
      const itemWs = item.workshop || item.ma_nha_may;
      if (filterWorkshop !== 'ALL' && itemWs !== filterWorkshop) matchesAdvanced = false;

      // Stage
      const itemStage = item.inspectionStage || item.stage;
      if (filterStage !== 'ALL' && itemStage !== filterStage) matchesAdvanced = false;

      // Date Range
      if (dateRange.start || dateRange.end) {
          const itemDate = new Date(item.date).getTime();
          if (dateRange.start && itemDate < new Date(dateRange.start).getTime()) matchesAdvanced = false;
          if (dateRange.end) {
              const endDate = new Date(dateRange.end);
              endDate.setHours(23, 59, 59, 999);
              if (itemDate > endDate.getTime()) matchesAdvanced = false;
          }
      }

      return matchesSearch && matchesAdvanced;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [
      inspections, searchTerm, selectedModule, 
      filterStatus, filterType, filterInspector, filterWorkshop, filterStage, dateRange
  ]);

  const formatDate = (dateString: string) => {
      if (!dateString) return '---';
      return new Date(dateString).toLocaleDateString('vi-VN');
  };

  const getStats = (item: Inspection) => {
      // Ưu tiên dữ liệu đã tính toán sẵn trong DB
      let total = item.qty_total || item.inspectedQuantity || 0;
      let pass = item.qty_pass || item.passedQuantity || 0;
      let fail = item.qty_fail || item.failedQuantity || 0;

      // Nếu không có, tính từ danh sách items
      if (total === 0 && item.items && item.items.length > 0) {
          total = item.items.length;
          pass = item.items.filter(i => i.status === CheckStatus.PASS).length;
          fail = item.items.filter(i => i.status === CheckStatus.FAIL).length;
      }

      const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;
      const failRate = total > 0 ? Math.round((fail / total) * 100) : 0; // Hoặc 100 - passRate

      return { passRate, failRate, hasStats: total > 0 };
  };

  const activeFiltersCount = [
      filterStatus !== 'ALL',
      filterType !== 'ALL',
      filterInspector !== 'ALL',
      filterWorkshop !== 'ALL',
      filterStage !== 'ALL',
      dateRange.start !== '',
      dateRange.end !== ''
  ].filter(Boolean).length;

  const clearFilters = () => {
      setFilterStatus('ALL');
      setFilterType('ALL');
      setFilterInspector('ALL');
      setFilterWorkshop('ALL');
      setFilterStage('ALL');
      setDateRange({ start: '', end: '' });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 py-3 shadow-sm shrink-0">
          
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" placeholder="Tìm kiếm phiếu..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:ring-2 ring-blue-100 transition-all"
              />
            </div>
            
            <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all relative ${
                    showFilters || activeFiltersCount > 0 
                    ? 'bg-blue-50 text-blue-600 border-blue-200' 
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
            >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Bộ lọc</span>
                {activeFiltersCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center border-2 border-white">
                        {activeFiltersCount}
                    </span>
                )}
            </button>

            <button onClick={onRefresh} className="p-2 text-blue-500 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all border border-blue-100">
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
              <div className="mt-3 p-4 bg-white border border-slate-200 rounded-2xl shadow-lg animate-in slide-in-from-top-2 duration-200">
                  <div className="flex justify-between items-center mb-3">
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Bộ lọc nâng cao</h3>
                      <button onClick={clearFilters} className="text-[10px] font-bold text-red-500 hover:underline flex items-center gap-1">
                          <X className="w-3 h-3" /> Xóa lọc
                      </button>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {/* Date Range */}
                      <div className="col-span-2 md:col-span-1 flex gap-2">
                          <div className="flex-1 space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase">Từ ngày</label>
                              <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400" />
                          </div>
                          <div className="flex-1 space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase">Đến ngày</label>
                              <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400" />
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase">Trạng thái</label>
                          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none">
                              <option value="ALL">Tất cả trạng thái</option>
                              <option value={InspectionStatus.PENDING}>Chờ duyệt</option>
                              <option value={InspectionStatus.COMPLETED}>Hoàn thành</option>
                              <option value={InspectionStatus.FLAGGED}>Có lỗi (NCR)</option>
                              <option value={InspectionStatus.APPROVED}>Đã phê duyệt</option>
                              <option value={InspectionStatus.DRAFT}>Nháp</option>
                          </select>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase">Inspector</label>
                          <select value={filterInspector} onChange={e => setFilterInspector(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none">
                              <option value="ALL">Tất cả Inspector</option>
                              {uniqueData.inspectors.map(i => <option key={i} value={i}>{i}</option>)}
                          </select>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase">Loại phiếu</label>
                          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none">
                              <option value="ALL">Tất cả loại</option>
                              {uniqueData.types.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase">Xưởng sản xuất</label>
                          <select value={filterWorkshop} onChange={e => setFilterWorkshop(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none">
                              <option value="ALL">Tất cả xưởng</option>
                              {uniqueData.workshops.map(w => <option key={w} value={w}>{getWorkshopName(w)}</option>)}
                          </select>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase">Công đoạn</label>
                          <select value={filterStage} onChange={e => setFilterStage(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none">
                              <option value="ALL">Tất cả công đoạn</option>
                              {uniqueData.stages.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                      </div>
                  </div>
              </div>
          )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar pb-24">
        {filteredData.length === 0 ? (
             <div className="py-20 text-center flex flex-col items-center justify-center">
                <Box className="w-12 h-12 text-slate-200 mb-3" />
                <p className="font-bold text-slate-400 text-xs uppercase tracking-widest">Không có dữ liệu</p>
                <button onClick={clearFilters} className="mt-2 text-blue-500 text-[10px] font-bold hover:underline">Xóa bộ lọc</button>
             </div>
        ) : (
            filteredData.map(item => {
                const stats = getStats(item);
                const inspectorName = getInspectorName(item);
                const workshopName = getWorkshopName(item.workshop || item.ma_nha_may);

                return (
                    <div 
                        key={item.id} 
                        onClick={() => onSelect(item.id)}
                        className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
                    >
                        {/* Status Bar */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                            item.status === InspectionStatus.APPROVED ? 'bg-green-500' :
                            item.status === InspectionStatus.FLAGGED ? 'bg-red-500' :
                            item.status === InspectionStatus.COMPLETED ? 'bg-blue-500' : 'bg-slate-300'
                        }`}></div>

                        <div className="pl-2">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wider">{item.type || 'N/A'}</span>
                                        <span className="text-[10px] font-mono text-slate-400 font-bold">#{item.id.split('-').pop()}</span>
                                    </div>
                                    
                                    {/* Pass/Fail Rates Display */}
                                    {stats.hasStats && (
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[9px] font-bold text-green-600 bg-green-50 px-1.5 rounded flex items-center gap-0.5">
                                                <CheckCircle2 className="w-2.5 h-2.5" /> {stats.passRate}%
                                            </span>
                                            {stats.failRate > 0 && (
                                                <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 rounded flex items-center gap-0.5">
                                                    <AlertTriangle className="w-2.5 h-2.5" /> {stats.failRate}%
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                                    item.status === InspectionStatus.APPROVED ? 'bg-green-50 text-green-600 border-green-200' :
                                    item.status === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-600 border-red-200' :
                                    item.status === InspectionStatus.COMPLETED ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                    'bg-slate-50 text-slate-500 border-slate-200'
                                }`}>
                                    {item.status}
                                </span>
                            </div>

                            <h4 className="font-bold text-slate-800 text-sm uppercase line-clamp-2 mb-2 group-hover:text-blue-600 transition-colors">
                                {item.ten_hang_muc || item.ten_ct || 'Sản phẩm chưa đặt tên'}
                            </h4>

                            <div className="flex flex-wrap gap-y-1 gap-x-3 text-[10px] text-slate-500 font-medium">
                                <div className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                    <Box className="w-3 h-3 text-slate-400" /> 
                                    <span className="font-bold text-slate-700">{item.ma_ct}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Factory className="w-3 h-3 text-slate-400" />
                                    <span>{workshopName}</span>
                                </div>
                                {(item.inspectionStage || item.stage) && (
                                    <div className="flex items-center gap-1">
                                        <Layers className="w-3 h-3 text-slate-400" />
                                        <span>{item.inspectionStage || item.stage}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                        <Calendar className="w-3 h-3"/> {formatDate(item.date)}
                                    </span>
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                        <User className="w-3 h-3"/> {inspectorName}
                                    </span>
                                </div>
                                <div className="p-1 rounded-full bg-slate-50 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })
        )}
      </div>
    </div>
  );
};
