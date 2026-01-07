import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project, Inspection, InspectionStatus, CheckStatus } from '../types';
import { 
  Search, Calendar, CheckCircle2, Clock, PauseCircle, 
  ImageIcon, Target, BarChart3, ArrowUpRight, ChevronDown, Filter, LayoutGrid, X,
  ClipboardList, AlertCircle, ChevronRight, Building2
} from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  inspections: Inspection[];
  onSelectProject: (id: string) => void;
}

const STATUS_COLORS = {
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-100',
  'Completed': 'bg-green-50 text-green-700 border-green-100',
  'On Hold': 'bg-orange-50 text-orange-700 border-orange-100',
  'Planning': 'bg-slate-50 text-slate-700 border-slate-100'
};

const STATUS_ICONS = {
  'In Progress': <Clock className="w-3.5 h-3.5" />,
  'Completed': <CheckCircle2 className="w-3.5 h-3.5" />,
  'On Hold': <PauseCircle className="w-3.5 h-3.5" />,
  'Planning': <Calendar className="w-3.5 h-3.5" />
};

export const ProjectList: React.FC<ProjectListProps> = ({ projects, inspections, onSelectProject }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'All' | 'In Progress' | 'Completed' | 'On Hold' | 'Planning'>('All');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const statusCounts = useMemo(() => {
    const safeProjs = Array.isArray(projects) ? projects : [];
    return {
      All: safeProjs.length,
      'In Progress': safeProjs.filter(p => p && p.status === 'In Progress').length,
      'Completed': safeProjs.filter(p => p && p.status === 'Completed').length,
      'On Hold': safeProjs.filter(p => p && p.status === 'On Hold').length,
      'Planning': safeProjs.filter(p => p && p.status === 'Planning').length,
    };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const safeProjs = Array.isArray(projects) ? projects : [];
    const safeSearchTerm = (searchTerm || '').toLowerCase().trim();
    return safeProjs.filter(p => {
      if (!p) return false;
      
      const matchesSearch = !safeSearchTerm || 
                            (p.name && p.name.toLowerCase().includes(safeSearchTerm)) || 
                            (p.code && p.code.toLowerCase().includes(safeSearchTerm)) ||
                            (p.ma_ct && p.ma_ct.toLowerCase().includes(safeSearchTerm));
      const matchesFilter = filter === 'All' || p.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [projects, searchTerm, filter]);

  const getProjectStats = (maCt: string) => {
      if (!maCt) return { total: 0, passed: 0, passRate: 0 };
      const safeInsps = Array.isArray(inspections) ? inspections : [];
      const pInsps = safeInsps.filter(i => i && String(i.ma_ct).trim().toLowerCase() === String(maCt).trim().toLowerCase());
      const total = pInsps.length;
      const passed = pInsps.filter(i => i && (i.status === InspectionStatus.COMPLETED || i.status === InspectionStatus.APPROVED)).length;
      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
      return { total, passed, passRate };
  };

  const filterOptions = ['All', 'In Progress', 'Completed', 'On Hold', 'Planning'] as const;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white px-4 py-4 border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3 w-full">
          <div className="relative group flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
            <input 
              type="text" 
              placeholder="Tìm tên dự án, mã công trình..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-inner"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="relative shrink-0" ref={filterRef}>
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`h-full px-4 py-3 rounded-2xl border flex items-center justify-between gap-3 transition-all active:scale-95 shadow-sm min-w-[130px] ${
                filter !== 'All' 
                ? 'bg-blue-600 text-white border-blue-600 shadow-blue-200' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <Filter className={`w-4 h-4 shrink-0 ${filter !== 'All' ? 'text-white' : 'text-slate-400'}`} />
                <span className="text-xs font-black uppercase tracking-tight truncate">
                    {filter === 'All' ? 'TẤT CẢ' : filter}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isFilterOpen ? 'rotate-180' : ''} opacity-40`} />
            </button>

            {isFilterOpen && (
              <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 origin-top-right overflow-hidden">
                {filterOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setFilter(opt); setIsFilterOpen(false); }}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between group transition-colors ${
                      filter === opt ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                       <div className={`w-2.5 h-2.5 rounded-full ${
                          opt === 'All' ? 'bg-slate-400' : 
                          opt === 'In Progress' ? 'bg-blue-500' : 
                          opt === 'Completed' ? 'bg-green-500' : 
                          opt === 'On Hold' ? 'bg-orange-500' : 'bg-slate-300'
                       }`} />
                       <span className={`text-xs font-black uppercase tracking-tight ${filter === opt ? 'text-blue-700' : 'text-slate-600'}`}>
                           {opt === 'All' ? 'TẤT CẢ' : opt}
                       </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${filter === opt ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                        {statusCounts[opt]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 md:p-6 no-scrollbar pb-24">
        {filteredProjects.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200 mx-2 flex flex-col items-center">
            <Target className="w-10 h-10 text-slate-200 mb-2" />
            <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Không tìm thấy dự án</p>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto bg-white rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-black uppercase tracking-widest text-[9px] md:text-[10px] sticky top-0 z-10">
                      <tr>
                          <th className="px-4 md:px-6 py-4">Dự án & Mã CT</th>
                          <th className="px-4 md:px-6 py-4 hidden sm:table-cell">Tiến độ</th>
                          <th className="px-4 md:px-6 py-4 hidden md:table-cell text-center">QC Pass</th>
                          <th className="px-4 md:px-6 py-4 text-right">Trạng thái</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                      {filteredProjects.map(project => {
                          const { total, passRate } = getProjectStats(project.ma_ct);
                          const displayImage = project.thumbnail || (project.images && project.images[0]);
                          
                          return (
                              <tr 
                                  key={project.id} 
                                  onClick={() => onSelectProject(project.id)}
                                  className="hover:bg-blue-50/30 transition-all cursor-pointer group"
                              >
                                  <td className="px-4 md:px-6 py-4">
                                      <div className="flex items-center gap-4">
                                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 shrink-0">
                                              <img src={displayImage} className="w-full h-full object-cover" alt="" />
                                          </div>
                                          <div className="overflow-hidden">
                                              <p className="font-black text-slate-900 text-xs md:text-sm tracking-tight uppercase truncate leading-tight group-hover:text-blue-600 transition-colors">{project.name}</p>
                                              <div className="flex items-center gap-2 mt-1">
                                                  <span className="text-[9px] font-mono font-bold text-slate-400 tracking-widest">{project.ma_ct}</span>
                                                  <span className="sm:hidden text-[9px] font-black text-blue-600">{project.progress}%</span>
                                              </div>
                                          </div>
                                      </div>
                                  </td>
                                  <td className="px-4 md:px-6 py-4 hidden sm:table-cell">
                                      <div className="w-32">
                                          <div className="flex justify-between items-center mb-1">
                                              <span className="text-[9px] font-black text-slate-400 uppercase">{project.progress}%</span>
                                          </div>
                                          <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                              <div className="bg-blue-600 h-full" style={{ width: `${project.progress}%` }}></div>
                                          </div>
                                      </div>
                                  </td>
                                  <td className="px-4 md:px-6 py-4 hidden md:table-cell text-center">
                                      <div className="flex flex-col items-center">
                                          <span className={`text-xs font-black ${passRate >= 90 ? 'text-green-600' : passRate >= 70 ? 'text-blue-600' : 'text-red-600'}`}>{passRate}%</span>
                                          <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">{total} QC</span>
                                      </div>
                                  </td>
                                  <td className="px-4 md:px-6 py-4 text-right">
                                      <div className="flex items-center justify-end gap-3">
                                          <span className={`px-2 py-1 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-tighter border shadow-sm ${STATUS_COLORS[project.status] || STATUS_COLORS['Planning']}`}>
                                              {project.status}
                                          </span>
                                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                                      </div>
                                  </td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
        )}
      </div>
    </div>
  );
};