
import React, { useState, useMemo } from 'react';
import { Project, Inspection, InspectionStatus, PlanItem } from '../types';
import { 
  Search, ChevronDown, LayoutGrid, Users, User, Target, 
  BarChart3, AlertCircle, SlidersHorizontal, X, Filter,
  Briefcase, CheckCircle2, Clock, Loader2
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface ProjectListProps {
  projects: Project[];
  inspections: Inspection[];
  plans: PlanItem[];
  onSelectProject: (maCt: string) => void;
}

const COLORS = {
  open: '#ef4444',
  inProgress: '#3b82f6',
  resolved: '#10b981',
  feedback: '#f59e0b',
  closed: '#64748b',
  rejected: '#000000',
  empty: '#e2e8f0'
};

export const ProjectList: React.FC<ProjectListProps> = ({ projects, inspections, plans, onSelectProject }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterPm, setFilterPm] = useState('ALL');
  const [filterQa, setFilterQa] = useState('ALL');
  const [filterPc, setFilterPc] = useState('ALL');

  // Tổng hợp danh sách dự án từ database projects VÀ plans
  const displayProjects = useMemo(() => {
    // 1. Lấy danh sách dự án từ database projects làm gốc
    const combined = [...projects];
    
    // 2. Duyệt qua plans để tìm những mã công trình (ma_ct) chưa tồn tại trong danh sách projects
    // Sử dụng Map để tối ưu hiệu năng và tránh trùng lặp
    const projectCodes = new Set(combined.map(p => String(p.ma_ct).toUpperCase()));
    
    plans.forEach(plan => {
      if (plan.ma_ct && !projectCodes.has(String(plan.ma_ct).toUpperCase())) {
        combined.push({
          id: `derived_${plan.ma_ct}`,
          code: plan.ma_ct,
          name: plan.ten_ct || plan.ma_ct,
          ma_ct: plan.ma_ct,
          ten_ct: plan.ten_ct || plan.ma_ct,
          status: 'In Progress', // Mặc định là đang thực hiện nếu có trong plans
          startDate: 'N/A',
          endDate: 'N/A',
          progress: 0,
          pm: 'Chưa phân công',
          qa: 'Chưa phân công',
          pc: 'Chưa phân công'
        } as Project);
        projectCodes.add(String(plan.ma_ct).toUpperCase());
      }
    });
    
    return combined;
  }, [projects, plans]);

  // Lấy các giá trị duy nhất cho bộ lọc từ danh sách đã tổng hợp
  const filterOptions = useMemo(() => {
    const pms = new Set<string>();
    const qas = new Set<string>();
    const pcs = new Set<string>();

    displayProjects.forEach(p => {
      if (p.pm && p.pm !== 'Chưa phân công') pms.add(p.pm);
      if (p.qa && p.qa !== 'Chưa phân công') qas.add(p.qa);
      if (p.pc && p.pc !== 'Chưa phân công') pcs.add(p.pc);
    });

    return {
      pms: Array.from(pms).sort(),
      qas: Array.from(qas).sort(),
      pcs: Array.from(pcs).sort()
    };
  }, [displayProjects]);

  const filteredProjects = useMemo(() => {
    return displayProjects.filter(p => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || 
        String(p.name).toLowerCase().includes(term) || 
        String(p.ma_ct).toLowerCase().includes(term);
      
      const matchesPm = filterPm === 'ALL' || p.pm === filterPm;
      const matchesQa = filterQa === 'ALL' || p.qa === filterQa;
      const matchesPc = filterPc === 'ALL' || p.pc === filterPc;

      return matchesSearch && matchesPm && matchesQa && matchesPc;
    });
  }, [displayProjects, searchTerm, filterPm, filterQa, filterPc]);

  const getStats = (maCt: string) => {
    const pInsps = inspections.filter(i => String(i.ma_ct).toUpperCase() === String(maCt).toUpperCase());
    const pPlans = plans.filter(p => String(p.ma_ct).toUpperCase() === String(maCt).toUpperCase());
    return {
      tickets: pInsps.length,
      plans: pPlans.length,
      open: pInsps.filter(i => i.status === InspectionStatus.FLAGGED || i.status === InspectionStatus.PENDING).length,
      closed: pInsps.filter(i => i.status === InspectionStatus.APPROVED || i.status === InspectionStatus.COMPLETED).length
    };
  };

  const activeFilterCount = [filterPm, filterQa, filterPc].filter(f => f !== 'ALL').length;

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] no-scroll-x">
      {/* HEADER TOOLBAR */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Danh sách dự án</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                   Hiển thị {filteredProjects.length} / {displayProjects.length} dự án
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Tìm tên hoặc mã dự án..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all shadow-inner"
                />
              </div>
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all active:scale-95 ${
                  showFilters || activeFilterCount > 0 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Bộ lọc</span>
                {activeFilterCount > 0 && (
                  <span className="ml-1 w-4 h-4 bg-white text-blue-600 rounded-full flex items-center justify-center text-[8px]">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* FILTER PANEL (Toggleable) */}
          {showFilters && (
            <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in slide-in-from-top duration-300">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                  <User className="w-3 h-3"/> PMCT (Project Manager)
                </label>
                <div className="relative">
                  <select 
                    value={filterPm} 
                    onChange={e => setFilterPm(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 focus:bg-white outline-none appearance-none cursor-pointer pr-8"
                  >
                    <option value="ALL">TẤT CẢ PM</option>
                    <option value="Chưa phân công">CHƯA PHÂN CÔNG</option>
                    {filterOptions.pms.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                  <Target className="w-3 h-3"/> QA-Project
                </label>
                <div className="relative">
                  <select 
                    value={filterQa} 
                    onChange={e => setFilterQa(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 focus:bg-white outline-none appearance-none cursor-pointer pr-8"
                  >
                    <option value="ALL">TẤT CẢ QA</option>
                    <option value="Chưa phân công">CHƯA PHÂN CÔNG</option>
                    {filterOptions.qas.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                  <Users className="w-3 h-3"/> PC (Project Coordinator)
                </label>
                <div className="relative">
                  <select 
                    value={filterPc} 
                    onChange={e => setFilterPc(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 focus:bg-white outline-none appearance-none cursor-pointer pr-8"
                  >
                    <option value="ALL">TẤT CẢ PC</option>
                    <option value="Chưa phân công">CHƯA PHÂN CÔNG</option>
                    {filterOptions.pcs.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="sm:col-span-3 flex justify-end">
                <button 
                  onClick={() => { setFilterPm('ALL'); setFilterQa('ALL'); setFilterPc('ALL'); setSearchTerm(''); }}
                  className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                >
                  Xóa tất cả bộ lọc
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PROJECT LIST */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar pb-24">
        {displayProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
             <Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-500" />
             <p className="font-black uppercase tracking-widest text-xs">Đang tải dữ liệu từ database...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300">
            <AlertCircle className="w-16 h-16 opacity-10 mb-4" />
            <p className="font-black uppercase tracking-[0.2em] text-sm">Không tìm thấy dự án phù hợp</p>
            <button 
                onClick={() => { setSearchTerm(''); setFilterPm('ALL'); setFilterQa('ALL'); setFilterPc('ALL'); }} 
                className="mt-4 text-xs font-bold text-blue-500 hover:underline"
            >
                Xóa tất cả bộ lọc
            </button>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProjects.map((project) => {
              const stats = getStats(project.ma_ct);
              const chartData = [
                { name: 'Resolved', value: stats.closed, color: COLORS.resolved },
                { name: 'Open', value: stats.open, color: COLORS.open },
                { name: 'Empty', value: stats.tickets === 0 ? 1 : 0, color: COLORS.empty }
              ].filter(d => d.value > 0);

              return (
                <div 
                  key={project.id}
                  onClick={() => onSelectProject(project.ma_ct)}
                  className="bg-white rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all cursor-pointer group flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden"
                >
                  <div className="p-5 border-b border-slate-50 flex justify-between items-start bg-slate-50/50">
                    <div className="flex-1 min-w-0 pr-3">
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">
                        {project.name}
                      </h3>
                      <p className="text-[10px] font-mono font-bold text-slate-400 mt-1 uppercase">#{project.ma_ct}</p>
                    </div>
                    <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase border shadow-sm ${
                      project.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {project.status}
                    </div>
                  </div>

                  <div className="p-5 space-y-4 flex-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Project Manager</p>
                        <p className="text-[11px] font-bold text-slate-700 truncate">{project.pm}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">QA Lead</p>
                        <p className="text-[11px] font-bold text-slate-700 truncate">{project.qa}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <div className="bg-blue-50 p-2 rounded-2xl border border-blue-100 flex flex-col items-center">
                          <span className="text-lg font-black text-blue-700 leading-none">{stats.plans}</span>
                          <span className="text-[7px] font-black text-blue-400 uppercase tracking-tighter mt-1">HẠNG MỤC</span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-2xl border border-slate-100 flex flex-col items-center">
                          <span className="text-lg font-black text-slate-700 leading-none">{stats.tickets}</span>
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter mt-1">PHIẾU QC</span>
                        </div>
                      </div>
                      
                      <div className="w-16 h-16 relative ml-4 shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={20}
                              outerRadius={30}
                              paddingAngle={2}
                              dataKey="value"
                              stroke="none"
                            >
                              {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-[9px] font-black text-slate-400">{project.progress}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50/50 border-t border-slate-50 flex items-center justify-center gap-2">
                     <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest group-hover:translate-x-1 transition-transform">Xem chi tiết báo cáo</span>
                     <ChevronDown className="-rotate-90 w-3 h-3 text-blue-400" />
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
