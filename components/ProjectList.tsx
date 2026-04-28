import { getProxyImageUrl } from '../src/utils';

import React, { useState, useMemo, useEffect } from 'react';
import { Project, Inspection, InspectionStatus } from '../types';
import { 
  Search, ChevronDown, Filter, Briefcase, 
  Building2, SlidersHorizontal, Check, X, 
  ArrowRight, Clock, AlertCircle, LayoutGrid, CheckCircle2,
  User, UserCheck, Users, RotateCcw, List
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface ProjectListProps {
  projects: Project[];
  inspections: Inspection[];
  onSelectProject: (maCt: string) => void;
  onSearch?: (term: string) => void;
  total?: number;
  page?: number;
  onPageChange?: (page: number) => void;
}

const COLORS = {
  resolved: '#10b981',
  open: '#ef4444',
  empty: '#e2e8f0'
};

export const ProjectList: React.FC<ProjectListProps> = ({ 
  projects, inspections, onSelectProject, onSearch, 
  total = 0, page = 1, onPageChange 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>(() => {
    return (localStorage.getItem('PROJECT_VIEW_MODE') as 'GRID' | 'LIST') || 'GRID';
  });

  useEffect(() => {
    localStorage.setItem('PROJECT_VIEW_MODE', viewMode);
  }, [viewMode]);
  
  // States cho bộ lọc
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPM, setFilterPM] = useState<string>('ALL');
  const [filterPC, setFilterPC] = useState<string>('ALL');
  const [filterQA, setFilterQA] = useState<string>('ALL');

  const handleCommitSearch = () => {
    if (onSearch) onSearch(searchTerm);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommitSearch();
    }
  };

  // Trích xuất danh sách nhân sự duy nhất từ dữ liệu dự án
  const uniqueStaff = useMemo(() => {
    return {
        pms: Array.from(new Set(projects.map(p => p.pm).filter(Boolean))).sort() as string[],
        pcs: Array.from(new Set(projects.map(p => p.pc).filter(Boolean))).sort() as string[],
        qas: Array.from(new Set(projects.map(p => p.qa).filter(Boolean))).sort() as string[]
    };
  }, [projects]);

  const isFilterActive = filterStatus !== 'ALL' || filterPM !== 'ALL' || filterPC !== 'ALL' || filterQA !== 'ALL';

  const resetFilters = () => {
    setFilterStatus('ALL');
    setFilterPM('ALL');
    setFilterPC('ALL');
    setFilterQA('ALL');
  };

  const groupedProjects = useMemo(() => {
    const groups: Record<string, Project[]> = {
        'OEM': [],
        'Công trình nội địa': [],
        'NHÀ XINH': [],
        'Nội bộ': []
    };
    
    // Áp dụng logic lọc đa tiêu chí
    const filtered = projects.filter(p => {
        const matchesStatus = filterStatus === 'ALL' || p.status === filterStatus;
        const matchesPM = filterPM === 'ALL' || p.pm === filterPM;
        const matchesPC = filterPC === 'ALL' || p.pc === filterPC;
        const matchesQA = filterQA === 'ALL' || p.qa === filterQA;
        
        return matchesStatus && matchesPM && matchesPC && matchesQA;
    });

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
  }, [projects, filterStatus, filterPM, filterPC, filterQA]);

  // Tự động mở rộng các nhóm có dữ liệu sau khi lọc
  useEffect(() => {
      if (isFilterActive || searchTerm) {
          const activeGroups = Object.keys(groupedProjects).filter(key => groupedProjects[key].length > 0);
          setExpandedGroups(new Set(activeGroups));
      }
  }, [groupedProjects, isFilterActive, searchTerm]);

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
    <div className="h-full flex flex-col bg-slate-50 no-scroll-x" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">


            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Tìm theo Mã hoặc Tên dự án..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onBlur={handleCommitSearch}
                  onKeyDown={handleKeyDown}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all shadow-inner"
                />
              </div>
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <div className="flex bg-white/50 p-0.5 rounded-lg border border-slate-200 mr-2">
                    <button 
                      onClick={() => setViewMode('GRID')}
                      className={`p-1.5 rounded-md transition-all ${viewMode === 'GRID' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}
                      title="Chế độ lưới"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => setViewMode('LIST')}
                      className={`p-1.5 rounded-md transition-all ${viewMode === 'LIST' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}
                      title="Chế độ danh sách"
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button 
                    onClick={() => setShowFilterModal(!showFilterModal)}
                    className={`p-2.5 rounded-xl shadow-sm font-black text-[10px] uppercase tracking-widest transition-all relative ${isFilterActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-blue-600 hover:bg-blue-50'} border border-slate-200`}
                    title="Bộ lọc"
                  >
                    <Filter className="w-4 h-4" />
                    {isFilterActive && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full animate-pulse"></div>}
                  </button>
                  {showFilterModal && (
                      <div className="absolute top-16 right-4 w-[320px] bg-white rounded-2xl p-4 border border-slate-200 shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2">
                        <div className="flex justify-between items-center mb-4">
                            <span className="font-bold text-slate-800">Bộ lọc hồ sơ dự án</span>
                            <button onClick={() => setShowFilterModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                    <Clock className="w-3 h-3 text-blue-500" /> Trạng thái vận hành
                                </label>
                                <select 
                                    value={filterStatus}
                                    onChange={e => setFilterStatus(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:ring-4 focus:ring-blue-100 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="ALL">TẤT CẢ TRẠNG THÁI</option>
                                    <option value="Planning">Planning (Chuẩn bị)</option>
                                    <option value="In Progress">In Progress (Đang thực hiện)</option>
                                    <option value="On Hold">On Hold (Tạm dừng)</option>
                                    <option value="Completed">Completed (Hoàn tất)</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                    <UserCheck className="w-3 h-3 text-indigo-500" /> Project Manager (PM)
                                </label>
                                <select 
                                    value={filterPM}
                                    onChange={e => setFilterPM(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:ring-4 focus:ring-blue-100 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="ALL">TẤT CẢ PM</option>
                                    {uniqueStaff.pms.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                    <Users className="w-3 h-3 text-teal-500" /> Coordinator (PC)
                                </label>
                                <select 
                                    value={filterPC}
                                    onChange={e => setFilterPC(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:ring-4 focus:ring-blue-100 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="ALL">TẤT CẢ PC</option>
                                    {uniqueStaff.pcs.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                    <User className="w-3 h-3 text-purple-500" /> QA/QC Lead
                                </label>
                                <select 
                                    value={filterQA}
                                    onChange={e => setFilterQA(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:ring-4 focus:ring-blue-100 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="ALL">TẤT CẢ QA/QC</option>
                                    {uniqueStaff.qas.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>
                            </div>
                            <button onClick={() => { resetFilters(); setShowFilterModal(false); }} className="w-full p-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold uppercase hover:bg-blue-100 transition-colors border border-blue-200">XÓA BỘ LỌC</button>
                        </div>
                      </div>
                  )}
                  </div>
              </div>
            </div>
        </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar pb-24">
        <div className="max-w-7xl mx-auto space-y-4">
            {Object.entries(groupedProjects).map(([groupName, groupItems]: [string, Project[]]) => {
                if (groupItems.length === 0 && !searchTerm && !isFilterActive) return null;
                const isExpanded = expandedGroups.has(groupName);

                return (
                    <div key={groupName} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden transition-all">
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
                            <div className={`p-6 bg-slate-50/30 animate-in fade-in slide-in-from-top-2 duration-300 ${
                                viewMode === 'GRID' 
                                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' 
                                : 'flex flex-col gap-3'
                            }`}>
                                {groupItems.map(p => {
                                    const pStats = getStats(p.ma_ct);
                                    
                                    if (viewMode === 'LIST') {
                                        return (
                                            <div 
                                                key={p.id}
                                                onClick={() => onSelectProject(p.ma_ct)}
                                                className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
                                            >
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-50">
                                                        {p.thumbnail ? (
                                                            <img src={getProxyImageUrl(p.thumbnail)} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                                <Building2 className="w-6 h-6 opacity-30" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="font-black text-xs text-slate-800 uppercase truncate group-hover:text-blue-600 transition-colors">
                                                            {p.name}
                                                        </h3>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-[8px] font-mono font-bold text-blue-600">#{p.ma_ct}</span>
                                                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">{p.location || 'Hồ Chí Minh'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-6 shrink-0 ml-4">
                                                    <div className="hidden sm:flex flex-col items-end">
                                                        <span className="text-[7px] font-black text-slate-400 uppercase">Tiến độ QC</span>
                                                        <span className="text-xs font-black text-slate-800">{pStats.total} <span className="text-[8px] font-bold text-slate-400 uppercase">Phiếu</span></span>
                                                    </div>
                                                    <div className="flex flex-col items-end min-w-[70px]">
                                                        <span className={`px-2 py-0.5 rounded-lg text-[7px] font-black uppercase tracking-widest ${p.status === 'Completed' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                                                            {p.status}
                                                        </span>
                                                        <span className="text-[7px] font-bold text-slate-400 uppercase mt-0.5">{p.progress}% Complete</span>
                                                    </div>
                                                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 transition-colors" />
                                                </div>
                                            </div>
                                        );
                                    }

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
                                            <div className="aspect-[16/10] relative overflow-hidden bg-slate-100 border-b border-slate-50 flex flex-col items-center justify-center gap-2">
                                                <Building2 className="w-12 h-12 opacity-20" />
                                                <div className="text-center px-2">
                                                    <p className="font-mono font-bold text-[10px] text-slate-500">#{p.ma_ct}</p>
                                                    <p className="font-black text-[11px] text-slate-800 uppercase line-clamp-1">{p.name}</p>
                                                </div>
                                                <div className="absolute top-3 right-3">
                                                    <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg border backdrop-blur-md ${p.status === 'Completed' ? 'bg-green-500/90 text-white border-green-400' : 'bg-blue-600/90 text-white border-blue-400'}`}>{p.status}</span>
                                                </div>
                                            </div>

                                            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                                                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Tiến độ QC</span>
                                                        <div className="flex items-baseline gap-1">
                                                            <span className="text-lg font-black text-slate-800">{pStats.total}</span>
                                                            <span className="text-[8px] font-bold text-slate-400 uppercase">Phiếu</span>
                                                        </div>
                                                    </div>
                                                    <div className="w-10 h-10 shrink-0">
                                                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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

            {/* PAGINATION CONTROLS REMOVED - FULL LIST LOADED */}
        </div>
      </div>
      
    </div>
  );
};
