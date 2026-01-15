import React, { useState, useMemo } from 'react';
import { Inspection, InspectionStatus, Workshop } from '../types';
import { 
  Search, RefreshCw, Calendar, 
  CheckCircle2, AlertTriangle, 
  Factory, Box, User,
  ArrowRight
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
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  
  const filteredData = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    return inspections.filter(item => {
      // Module Filter
      if (selectedModule !== 'ALL' && item.type !== selectedModule) return false;

      // Search
      const matchesSearch = !term || (
        (item.ma_ct || '').toLowerCase().includes(term) ||
        (item.ten_ct || '').toLowerCase().includes(term) ||
        (item.ten_hang_muc || '').toLowerCase().includes(term) ||
        (item.inspectorName || '').toLowerCase().includes(term)
      );

      // Status Filter
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;

      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inspections, searchTerm, statusFilter, selectedModule]);

  const formatDate = (dateString: string) => {
      if (!dateString) return '---';
      return new Date(dateString).toLocaleDateString('vi-VN');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 py-3 shadow-sm shrink-0">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
            <button 
                onClick={() => onModuleChange('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase whitespace-nowrap transition-all border ${selectedModule === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
            >
                Tất cả
            </button>
            {ALL_MODULES.map(m => (
                <button 
                    key={m.id}
                    onClick={() => onModuleChange(m.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase whitespace-nowrap transition-all border ${selectedModule === m.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`}
                >
                    {m.label}
                </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" placeholder="Tìm kiếm..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:ring-2 ring-blue-100 transition-all"
              />
            </div>
            <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none text-slate-600"
            >
                <option value="ALL">Tất cả trạng thái</option>
                <option value={InspectionStatus.PENDING}>Chờ duyệt</option>
                <option value={InspectionStatus.COMPLETED}>Hoàn thành</option>
                <option value={InspectionStatus.FLAGGED}>Có lỗi (NCR)</option>
                <option value={InspectionStatus.DRAFT}>Nháp</option>
            </select>
            <button onClick={onRefresh} className="p-2 text-blue-500 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all">
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar pb-24">
        {filteredData.length === 0 ? (
             <div className="py-20 text-center flex flex-col items-center justify-center">
                <Box className="w-12 h-12 text-slate-200 mb-3" />
                <p className="font-bold text-slate-400 text-xs uppercase tracking-widest">Không có dữ liệu</p>
             </div>
        ) : (
            filteredData.map(item => (
                <div 
                    key={item.id} 
                    onClick={() => onSelect(item.id)}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-white bg-blue-600 px-1.5 py-0.5 rounded uppercase tracking-wider">{item.type || 'N/A'}</span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                                item.status === InspectionStatus.APPROVED ? 'bg-green-50 text-green-600 border-green-200' :
                                item.status === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-600 border-red-200' :
                                'bg-slate-50 text-slate-500 border-slate-200'
                            }`}>
                                {item.status}
                            </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 font-bold">#{item.id.split('-').pop()}</span>
                    </div>

                    <h4 className="font-bold text-slate-800 text-sm uppercase line-clamp-2 mb-2">
                        {item.ten_hang_muc || item.ten_ct || 'Sản phẩm chưa đặt tên'}
                    </h4>

                    <div className="flex flex-wrap gap-y-1 gap-x-3 text-[10px] text-slate-500 font-medium">
                        <div className="flex items-center gap-1">
                            <Box className="w-3 h-3 text-slate-400" /> 
                            <span className="font-bold text-slate-700">{item.ma_ct}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Factory className="w-3 h-3 text-slate-400" />
                            <span>{item.ma_nha_may || item.workshop || '---'}</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                        <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                <Calendar className="w-3 h-3"/> {formatDate(item.date)}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                <User className="w-3 h-3"/> {item.inspectorName}
                            </span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                    </div>
                </div>
            ))
        )}
      </div>
    </div>
  );
};