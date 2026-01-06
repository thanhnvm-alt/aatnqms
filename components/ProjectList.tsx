
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project, Inspection, InspectionStatus } from '../types';
import { 
  Search, Calendar, CheckCircle2, Clock, PauseCircle, 
  ImageIcon, Target, BarChart3, ArrowUpRight, ChevronDown, Filter, X,
  User, MapPin, Loader2, FolderOpen, Building2
} from 'lucide-react';
import { fetchProjectsSummary } from '../services/apiService';

interface ProjectListProps {
  projects: Project[];
  inspections: Inspection[];
  onSelectProject: (id: string) => void;
  onRefreshProjects?: (searchTerm: string) => void;
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

export const ProjectList: React.FC<ProjectListProps> = ({ projects: initialProjects, inspections, onSelectProject, onRefreshProjects }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'All' | 'In Progress' | 'Completed' | 'On Hold' | 'Planning'>('All');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [dbProjects, setDbProjects] = useState<Project[]>(initialProjects);
  const [isLoading, setIsLoading] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<any>(null);

  // Sync projects from initial list when changed
  useEffect(() => {
    setDbProjects(initialProjects);
  }, [initialProjects]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Thực hiện tìm kiếm trực tiếp từ Turso nếu có search term
  useEffect(() => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      
      searchTimeout.current = setTimeout(async () => {
          setIsLoading(true);
          try {
              const results = await fetchProjectsSummary(searchTerm);
              setDbProjects(results);
          } catch (e) {
              console.error("Search failed:", e);
          } finally {
              setIsLoading(false);
          }
      }, 500);

      return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [searchTerm]);

  const filteredProjects = useMemo(() => {
    return dbProjects.filter(p => filter === 'All' || p.status === filter);
  }, [dbProjects, filter]);

  /**
   * Logic Grouping:
   * Nếu 2 ký tự đầu ma_ct là "CT" thì group theo mã_ct. Ngược lại thì group theo ten_ct.
   */
  const groupedProjects = useMemo(() => {
    const groups: Record<string, Project[]> = {};
    
    filteredProjects.forEach(p => {
        let groupKey = "";
        const maCtPrefix = String(p.ma_ct || "").substring(0, 2).toUpperCase();
        
        if (maCtPrefix === "CT") {
            groupKey = p.ma_ct;
        } else {
            groupKey = p.name; // name lưu ten_ct
        }
        
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(p);
    });
    
    return groups;
  }, [filteredProjects]);

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
      {/* Search & Filter Header */}
      <div className="bg-white px-4 py-4 border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3 w-full">
          <div className="relative group flex-1">
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${isLoading ? 'text-blue-500 animate-pulse' : 'text-slate-400 group-focus-within:text-blue-600'}`} />
            <input 
              type="text" 
              placeholder="Tìm dự án (Turso Database)..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-inner"
            />
            {searchTerm && !isLoading && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-600 transition-colors"><X className="w-4 h-4" /></button>
            )}
            {isLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2"><Loader2 className="w-4 h-4 text-blue-500 animate-spin" /></div>
            )}
          </div>

          <div className="relative shrink-0" ref={filterRef}>
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`h-full px-4 py-3 rounded-2xl border flex items-center justify-between gap-3 transition-all active:scale-95 shadow-sm min-w-[130px] ${
                filter !== 'All' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <Filter className={`w-4 h-4 shrink-0 ${filter !== 'All' ? 'text-white' : 'text-slate-400'}`} />
                <span className="text-xs font-black uppercase tracking-tight truncate">{filter === 'All' ? 'TẤT CẢ' : filter}</span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isFilterOpen ? 'rotate-180' : ''} opacity-40`} />
            </button>

            {isFilterOpen && (
              <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 origin-top-right overflow-hidden">
                {filterOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setFilter(opt); setIsFilterOpen(false); }}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between group transition-colors ${filter === opt ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-3">
                       <div className={`w-2.5 h-2.5 rounded-full ${opt === 'All' ? 'bg-slate-400' : opt === 'In Progress' ? 'bg-blue-500' : opt === 'Completed' ? 'bg-green-500' : opt === 'On Hold' ? 'bg-orange-500' : 'bg-slate-300'}`} />
                       <span className={`text-xs font-black uppercase tracking-tight ${filter === opt ? 'text-blue-700' : 'text-slate-600'}`}>{opt === 'All' ? 'TẤT CẢ' : opt}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8 no-scrollbar pb-24">
        {Object.keys(groupedProjects).length === 0 ? (
          <div className="py-20 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-200 mx-2 flex flex-col items-center">
            <Target className="w-12 h-12 text-slate-200 mb-4" />
            <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Không tìm thấy dự án phù hợp</p>
          </div>
        ) : (
          <div className="space-y-10">
            {Object.entries(groupedProjects).map(([groupKey, groupItems]) => (
                <div key={groupKey} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center gap-3 px-2">
                        <FolderOpen className="w-5 h-5 text-blue-500" />
                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest border-b-2 border-blue-100 pb-1">{groupKey}</h2>
                        <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{groupItems.length}</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {groupItems.map(project => {
                            const { total, passRate } = getProjectStats(project.ma_ct);
                            return (
                                <div 
                                    key={project.id} 
                                    onClick={() => onSelectProject(project.ma_ct)} // Click vào đọc thông tin từ DB theo mã_ct
                                    className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer group flex flex-col overflow-hidden"
                                >
                                    <div className="h-32 relative overflow-hidden bg-slate-100 shrink-0 border-b border-slate-50">
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
                                            {/* Fixed: Building2 is now imported from lucide-react */}
                                            <Building2 className="w-10 h-10 text-blue-200 group-hover:scale-110 transition-transform duration-500" />
                                        </div>
                                        <div className="absolute top-4 left-4">
                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm backdrop-blur-md ${STATUS_COLORS[project.status] || STATUS_COLORS['Planning']}`}>
                                                {STATUS_ICONS[project.status] || STATUS_ICONS['Planning']} {project.status}
                                            </div>
                                        </div>
                                        <div className="absolute bottom-3 right-4">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ma CT: {project.ma_ct}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="p-6 flex-1 flex flex-col space-y-4">
                                        <h3 className="text-base font-black text-slate-800 leading-tight uppercase tracking-tight group-hover:text-blue-600 transition-colors line-clamp-2 mb-1">{project.name}</h3>
                                        
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tiến độ</p>
                                                <p className="text-sm font-black text-blue-600">{project.progress}%</p>
                                            </div>
                                            <div className="space-y-1 text-right">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Chất lượng</p>
                                                <p className="text-sm font-black text-green-600">{passRate}% Pass</p>
                                            </div>
                                        </div>
                                        
                                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden shadow-inner">
                                            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-1000" style={{ width: `${project.progress}%` }}></div>
                                        </div>
                                    </div>
                                    
                                    <div className="px-6 py-4 border-t border-slate-50 bg-slate-50/50 flex justify-between items-center group-hover:bg-blue-50/30 transition-colors">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] group-hover:text-blue-500 transition-colors">Đọc chi tiết dự án</span>
                                        <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 transition-all" />
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
    </div>
  );
};
