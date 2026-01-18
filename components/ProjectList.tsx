
import React, { useState, useMemo, useEffect } from 'react';
import { Project, Inspection, InspectionStatus, PlanItem } from '../types';
import { 
  Search, ChevronDown, Filter, Briefcase, 
  Building2, SlidersHorizontal, Check, X, 
  ArrowRight, Clock, AlertCircle, LayoutGrid, CheckCircle2
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface ProjectListProps {
  projects: Project[];
  inspections: Inspection[];
  plans: PlanItem[];
  onSelectProject: (maCt: string) => void;
  onSearch?: (term: string) => void;
}

const COLORS = {
  resolved: '#10b981',
  open: '#ef4444',
  empty: '#e2e8f0'
};

export const ProjectList: React.FC<ProjectListProps> = ({ projects, inspections, plans, onSelectProject, onSearch }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  // ISO-UI: Mặc định tất cả các nhóm đóng để tiết kiệm diện tích (Empty Set)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Debounced Search Database - limit = 10
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
        if (onSearch) onSearch(searchTerm);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm, onSearch]);

  const groupedProjects = useMemo(() => {
    const groups: Record<string, Project[]> = {
        'OEM': [],
        'Công trình nội địa': [],
        'NHÀ XINH': [],
        'Nội bộ': []
    };
    
    // Filter by status if selected
    const filtered = projects.filter(p => filterStatus === 'ALL' || p.status === filterStatus);

    filtered.forEach(p => {
        const maCt = (p.ma_ct || '').toUpperCase();
        const name = (p.name || '').toUpperCase();
        
        if (maCt.startsWith('EM')) {
            groups['OEM'].push(p);
        } else if (maCt.startsWith('CT')) {
            groups['Công trình nội địa'].push(p);
        } else if (maCt.startsWith('AKA') || name.includes('NHÀ XINH') || name.includes('NHA XINH')) {
            groups['NHÀ XINH'].push(p);
        } else {
            groups['Nội bộ'].push(p);
        }
    });

    return groups;
  }, [projects, filterStatus]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
    });
  };

  const getStats = (maCt: string) => {
    const pInsps = inspections.filter(i => String(i.ma_ct).toUpperCase() === String(maCt).toUpperCase());
    return {
      total: pInsps.length,
      open: pInsps.filter(i => i.status === InspectionStatus.FLAGGED || i.status === InspectionStatus.PENDING).length,
      closed: pInsps.filter(i => i.status === InspectionStatus.APPROVED || i.status === InspectionStatus.COMPLETED).length
    };
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 no-scroll-x">
      {/* HEADER TOOLBAR */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Quản lý Dự án</h2>
                <div className="flex items-center gap-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ISO 9001:2024 SYSTEM</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Tìm theo Mã hoặc Tên dự án..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all shadow-inner"
                />
              </div>
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button 
                    onClick={() => setShowFilterModal(true)}
                    className="flex items-center gap-2 px-4 py-1.5 bg-white rounded-lg shadow-sm font-black text-[10px] uppercase tracking-widest text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span>Bộ lọc</span>
                    {filterStatus !== 'ALL' && <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>}
                  </button>
                  <div className="px-3 py-1.5 flex items-center gap-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase">Hồ sơ:</span>
                      <span className="text-sm font-black text-slate-800">{projects.length}</span>
                  </div>
              </div>
            </div>
        </div>
      </div>

      {/* PROJECT GROUPS */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar pb-24">
        <div className="max-w-7xl mx-auto space-y-4">
            {Object.entries(groupedProjects).map(([groupName, groupItems]: [string, Project[]]) => {
                if (groupItems.length === 0 && !searchTerm) return null;
                const isExpanded = expandedGroups.has(groupName);

                return (
                    <div key={groupName} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden transition-all">
                        {/* Group Header Card */}
                        <div 
                            onClick={() => toggleGroup(groupName)}
                            className={`p-5 flex items-center justify-between cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50 border-b border-blue-100' : 'hover:bg-slate-50'}`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-2xl ${isExpanded ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                    <LayoutGrid className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-black text-sm uppercase tracking-wider text-slate-800">{groupName}</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ISO 9001 • {groupItems.length} công trình</p>
                                </div>
                            </div>
                            <ChevronDown className={`w-5 h-5 text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                        </div>

                        {isExpanded && (
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 bg-slate-50/30 animate-in fade-in slide-in-from-top-2 duration-300">
                                {groupItems.map(p => {
                                    const pStats = getStats(p.ma_ct);
                                    const chartData = [
                                        { name: 'OK', value: pStats.closed, color: COLORS.resolved },
                                        { name: 'NG', value: pStats.open, color: COLORS.open },
                                        { name: 'None', value: pStats.total === 0 ? 1 : 0, color: COLORS.empty }
                                    ].filter(d => d.value > 0);

                                    return (
                                        <div 
                                            key={p.id}
                                            onClick={() => onSelectProject(p.ma_ct)}
                                            className="bg-white rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer overflow-hidden flex flex-col group animate-in zoom-in duration-300"
                                        >
                                            <div className="aspect-[16/10] relative overflow-hidden bg-slate-100">
                                                {p.thumbnail ? (
                                                    <img src={p.thumbnail} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-700" alt="" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                        <Building2 className="w-12 h-12 opacity-20" />
                                                    </div>
                                                )}
                                                {/* ISO-CLEAN: Đã xóa overlay text/thông tin trên ảnh */}
                                            </div>

                                            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                                                <div>
                                                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">
                                                        {p.name}
                                                    </h3>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className="text-[9px] font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">#{p.ma_ct}</span>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{p.location || 'Hồ Chí Minh'}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Tiến độ QC</span>
                                                        <div className="flex items-baseline gap-1">
                                                            <span className="text-lg font-black text-slate-800">{pStats.total}</span>
                                                            <span className="text-[8px] font-bold text-slate-400 uppercase">Phiếu</span>
                                                        </div>
                                                    </div>
                                                    <div className="w-10 h-10 shrink-0">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <PieChart>
                                                                <Pie data={chartData} cx="50%" cy="50%" innerRadius={12} outerRadius={18} dataKey="value" stroke="none">
                                                                    {chartData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                                                                </Pie>
                                                            </PieChart>
                                                        </ResponsiveContainer>
                                                    </div>
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
      </div>

      {/* FILTER MODAL */}
      {showFilterModal && (
          <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest flex items-center gap-2">
                          <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                          Bộ lọc dự án
                      </h3>
                      <button onClick={() => setShowFilterModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400"/></button>
                  </div>
                  <div className="p-6 space-y-6">
                      <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Trạng thái vận hành</label>
                          <div className="grid grid-cols-1 gap-2">
                              {['ALL', 'Planning', 'In Progress', 'On Hold', 'Completed'].map(status => (
                                  <button 
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    className={`px-4 py-3 rounded-2xl border text-left flex items-center justify-between transition-all group ${filterStatus === status ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}
                                  >
                                      <span className="text-xs font-bold uppercase">{status === 'ALL' ? 'Tất cả trạng thái' : status}</span>
                                      {filterStatus === status ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                                  </button>
                              ))}
                          </div>
                      </div>
                      <div className="bg-blue-50 rounded-2xl p-4 flex gap-3">
                          <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                          <p className="text-[10px] text-blue-800 leading-relaxed font-medium uppercase tracking-tighter">Bộ lọc được áp dụng tức thì. Để làm mới danh sách từ máy chủ, hãy sử dụng thanh tìm kiếm.</p>
                      </div>
                  </div>
                  <div className="p-6 bg-slate-50/50 border-t border-slate-100">
                      <button 
                        onClick={() => setShowFilterModal(false)}
                        className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-blue-500/30 active:scale-[0.98] transition-all"
                      >
                          XÁC NHẬN
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
