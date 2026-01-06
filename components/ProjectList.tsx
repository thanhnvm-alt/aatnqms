
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project, Inspection, InspectionStatus, CheckStatus } from '../types';
import { 
  Search, Calendar, CheckCircle2, Clock, PauseCircle, 
  ImageIcon, Target, BarChart3, ArrowUpRight, ChevronDown, Filter, LayoutGrid, X,
  ClipboardList, AlertCircle
} from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  inspections: Inspection[];
  onSelectProject: (maCt: string) => void;
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
    return {
      All: projects.length,
      'In Progress': projects.filter(p => p.status === 'In Progress').length,
      'Completed': projects.filter(p => p.status === 'Completed').length,
      'On Hold': projects.filter(p => p.status === 'On Hold').length,
      'Planning': projects.filter(p => p.status === 'Planning').length,
    };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const safeSearchTerm = (searchTerm || '').toLowerCase().trim();
    return projects.filter(p => {
      const matchesSearch = !safeSearchTerm || 
                            p.name.toLowerCase().includes(safeSearchTerm) || 
                            p.code.toLowerCase().includes(safeSearchTerm) ||
                            p.ma_ct.toLowerCase().includes(safeSearchTerm);
      const matchesFilter = filter === 'All' || p.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [projects, searchTerm, filter]);

  const getProjectStats = (maCt: string) => {
      const pInsps = inspections.filter(i => String(i.ma_ct).trim().toLowerCase() === String(maCt).trim().toLowerCase());
      const total = pInsps.length;
      const passed = pInsps.filter(i => i.status === InspectionStatus.COMPLETED || i.status === InspectionStatus.APPROVED).length;
      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
      return { total, passed, passRate };
  };

  const filterOptions = ['All', 'In Progress', 'Completed', 'On Hold', 'Planning'] as const;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Refined Search & Filter Header */}
      <div className="bg-white px-4 py-4 border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3 w-full">
          {/* Search Input Container */}
          <div className="relative group flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
            <input 
              type="text" 
              placeholder="Tìm tên dự án, mã công trình..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-700 focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-inner uppercase"
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

          {/* Filter Dropdown List */}
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
              <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${filter !== 'All' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {statusCounts[filter]}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isFilterOpen ? 'rotate-180' : ''} opacity-40`} />
              </div>
            </button>

            {isFilterOpen && (
              <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 origin-top-right overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-50 mb-1">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TRẠNG THÁI DỰ ÁN</p>
                </div>
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
                    <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${filter === opt ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            {statusCounts[opt]}
                        </span>
                        {filter === opt && <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-white" /></div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar pb-24">
        {filteredProjects.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-200 mx-2 flex flex-col items-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <Target className="w-10 h-10 text-slate-200" />
            </div>
            <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Không tìm thấy dự án phù hợp</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map(project => {
              const displayImage = (project.images && project.images.length > 0) ? project.images[0] : project.thumbnail;
              const { total, passed, passRate } = getProjectStats(project.ma_ct);
              
              return (
                <div 
                  key={project.ma_ct} 
                  onClick={() => onSelectProject(project.ma_ct)}
                  className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer group flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  <div className="h-48 relative overflow-hidden bg-slate-900 shrink-0">
                    {displayImage ? (
                      <img src={displayImage} alt={project.name} className="w-full h-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-110 group-hover:opacity-100" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600"><ImageIcon className="w-12 h-12 opacity-20" /></div>
                    )}
                    <div className="absolute top-4 left-4">
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-lg backdrop-blur-md ${STATUS_COLORS[project.status] || STATUS_COLORS['Planning']}`}>
                            {STATUS_ICONS[project.status] || STATUS_ICONS['Planning']} {project.status}
                        </div>
                    </div>
                    {/* Overall Pass Rate Overlay */}
                    <div className="absolute bottom-4 right-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-3 py-2 text-white flex items-center gap-2 shadow-xl">
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] font-black uppercase opacity-60">QC Pass</span>
                            <span className="text-sm font-black leading-none">{passRate}%</span>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full ${passRate >= 90 ? 'bg-green-500' : passRate >= 70 ? 'bg-blue-500' : 'bg-red-500'} shadow-[0_0_10px_currentColor]`}></div>
                    </div>
                  </div>
                  
                  <div className="p-6 flex-1 flex flex-col space-y-4">
                    <div className="flex-1 overflow-hidden">
                        <h3 className="text-base font-black text-slate-800 leading-tight uppercase tracking-tight group-hover:text-blue-600 transition-colors line-clamp-2 mb-2">{project.name || project.ma_ct}</h3>
                        
                        <div className="flex items-center gap-4 mb-4 border-b border-slate-50 pb-3">
                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">
                                <Target className="w-3.5 h-3.5 text-blue-500 shrink-0" /> {project.pm || 'No PM'}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">
                                <ClipboardList className="w-3.5 h-3.5 text-indigo-500" /> {total} QC
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mã dự án</p>
                                <p className="text-xs font-bold text-slate-700 truncate">{project.ma_ct}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tiến độ</p>
                                <p className="text-xs font-bold text-slate-700">{project.progress || 0}%</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="pt-2">
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><BarChart3 className="w-3 h-3 text-indigo-500" /> Project Progress</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden shadow-inner">
                            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-1000" style={{ width: `${project.progress || 0}%` }}></div>
                        </div>
                    </div>
                  </div>
                  <div className="px-6 py-4 border-t border-slate-50 bg-slate-50/50 flex justify-between items-center group-hover:bg-blue-50/30 transition-colors">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] group-hover:text-blue-500 transition-colors">Project Details</span>
                        <div className="p-1.5 rounded-lg bg-white border border-slate-200 text-blue-600 shadow-sm group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all"><ArrowUpRight className="w-4 h-4" /></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
