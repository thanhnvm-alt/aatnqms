
import React, { useMemo, useState, useEffect } from 'react';
import { Inspection, InspectionStatus, Priority, User, ViewState, Workshop, NCR } from '../types';
import { fetchInspectionsProjects, fetchNcrs } from '../services/apiService';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ComposedChart, Line, CartesianGrid, Legend, LabelList
} from 'recharts';
import { 
  ClipboardCheck, AlertTriangle, CheckCircle2, Flag, 
  Activity, Clock, AlertOctagon,
  ArrowRight, ShieldCheck, UserCircle, Filter, X, Search, RotateCcw, ChevronDown
} from 'lucide-react';
import { SearchableSelect } from './SearchableSelect';
import { DateRangePicker } from './DateRangePicker';

interface DashboardProps {
  dashboardStats?: any;
  user?: User;
  users?: User[];
  workshops?: Workshop[];
  filters?: any;
  onLogout?: () => void;
  onNavigate?: (view: ViewState) => void;
  onViewInspection?: (id: string) => void;
  onFilterChange?: (filters: any) => void;
}

const COLORS = {
  pass: '#10b981',
  fail: '#ef4444',
  pending: '#f59e0b',
  draft: '#94a3b8',
  blue: '#3b82f6',
};

const MODULE_CONFIG: Record<string, { label: string }> = {
    'IQC': { label: 'IQC' },
    'PQC': { label: 'PQC' },
    'SQC_MAT': { label: 'SQC-VT' },
    'SQC_VT': { label: 'SQC-VT' },
    'SQC_BTP': { label: 'SQC-BTP' },
    'FQC': { label: 'FQC' },
    'SITE': { label: 'SITE' },
    'SPR': { label: 'SPR' },
    'STEP': { label: 'STEP' },
    'FSR': { label: 'FSR' }
};

export const Dashboard: React.FC<DashboardProps> = ({ dashboardStats, user, users = [], workshops = [], filters, onLogout, onNavigate, onViewInspection, onFilterChange }) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterQC, setFilterQC] = useState<string[]>(() => filters?.qc ? filters.qc.split(',').filter(Boolean) : []);
  const [filterWorkshop, setFilterWorkshop] = useState<string[]>(() => filters?.workshop ? filters.workshop.split(',').filter(Boolean) : []);
  const [filterStatus, setFilterStatus] = useState<string[]>(() => filters?.status ? filters.status.split(',').filter(Boolean) : []);
  const [filterType, setFilterType] = useState<string[]>(() => filters?.type ? filters.type.split(',').filter(Boolean) : []);
  const [filterProject, setFilterProject] = useState<string[]>(() => filters?.project ? filters.project.split(',').filter(Boolean) : []);
  const [startDate, setStartDate] = useState(() => filters?.startDate || '');
  const [endDate, setEndDate] = useState(() => filters?.endDate || '');
  const [projectOptions, setProjectOptions] = useState<any[]>([]);
  const [ncrList, setNcrList] = useState<NCR[]>([]);
  const [isLoadingNcrs, setIsLoadingNcrs] = useState(false);
  const [ncrGroupRange, setNcrGroupRange] = useState<'DAY'|'WEEK'|'MONTH'|'YEAR'>('DAY');
  const [selectedNcrDateKey, setSelectedNcrDateKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoadingNcrs(true);
    
    // Convert startDate/endDate to unixStart/unixEnd if needed, though getNcrs supports them natively if passed as filters?
    // Wait, in apiService fetchNcrs just passes filters.
    // Let's pass the same filters
    const ncrFilters = { ...filters };
    if (ncrFilters.startDate) {
        ncrFilters.unixStart = Math.floor(new Date(ncrFilters.startDate).getTime() / 1000);
    }
    if (ncrFilters.endDate) {
        ncrFilters.unixEnd = Math.floor(new Date(ncrFilters.endDate).getTime() / 1000) + 86399;
    }
    
    fetchNcrs(ncrFilters, 1, 10000)
      .then((res: any) => {
        if (active) {
            setNcrList(res.items || []);
        }
      })
      .catch((err: any) => console.error("Failed to load NCRs for dashboard", err))
      .finally(() => {
        if (active) setIsLoadingNcrs(false);
      });
      
    return () => { active = false; };
  }, [filters]);

  const ncrChartData = useMemo(() => {
    const grouped: Record<string, { dateLabel: string; count: number, originalDate: Date }> = {};
    
    ncrList.forEach(ncr => {
        const d = ncr.createdDate ? new Date(ncr.createdDate) : new Date();
        if (isNaN(d.getTime())) return;
        
        let key = '';
        let label = '';
        
        if (ncrGroupRange === 'DAY') {
            key = d.toISOString().split('T')[0];
            label = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        } else if (ncrGroupRange === 'WEEK') {
            const firstDay = new Date(d.setDate(d.getDate() - d.getDay() + 1));
            key = firstDay.toISOString().split('T')[0];
            label = `Tuần ${Math.ceil((d.getDate() - 1 - d.getDay()) / 7) + 1} (${firstDay.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })})`;
        } else if (ncrGroupRange === 'MONTH') {
            key = `${d.getFullYear()}-${d.getMonth()+1}`;
            label = `T${d.getMonth()+1}/${d.getFullYear()}`;
        } else if (ncrGroupRange === 'YEAR') {
            key = `${d.getFullYear()}`;
            label = `Năm ${d.getFullYear()}`;
        }
        
        if (!grouped[key]) {
            grouped[key] = { dateLabel: label, count: 0, originalDate: d };
        }
        grouped[key].count += 1;
    });
    
    return Object.entries(grouped)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, val]) => ({
            key,
            name: val.dateLabel,
            count: val.count
        }));
  }, [ncrList, ncrGroupRange]);

  const filteredNcrList = useMemo(() => {
      if (!selectedNcrDateKey) return ncrList;
      return ncrList.filter(ncr => {
          const d = ncr.createdDate ? new Date(ncr.createdDate) : new Date();
          if (isNaN(d.getTime())) return false;
          let key = '';
          if (ncrGroupRange === 'DAY') {
              key = d.toISOString().split('T')[0];
          } else if (ncrGroupRange === 'WEEK') {
              const firstDay = new Date(d.setDate(d.getDate() - d.getDay() + 1));
              key = firstDay.toISOString().split('T')[0];
          } else if (ncrGroupRange === 'MONTH') {
              key = `${d.getFullYear()}-${d.getMonth()+1}`;
          } else if (ncrGroupRange === 'YEAR') {
              key = `${d.getFullYear()}`;
          }
          return key === selectedNcrDateKey;
      });
  }, [ncrList, selectedNcrDateKey, ncrGroupRange]);

  const filteredInspectionNcrList = useMemo(() => {
    const map = new Map();
    filteredNcrList.forEach(ncr => {
        if (!map.has(ncr.inspection_id)) {
            map.set(ncr.inspection_id, {
                inspection_id: ncr.inspection_id,
                ma_ct: ncr.ma_ct,
                ten_hang_muc: ncr.ten_hang_muc,
                workshop: ncr.workshop,
                createdDate: ncr.createdDate,
                createdAt: ncr.createdDate,
                inspectorName: ncr.inspectorName,
                ncrCount: 1,
            });
        } else {
            map.get(ncr.inspection_id).ncrCount += 1;
        }
    });
    return Array.from(map.values());
  }, [filteredNcrList]);

  useEffect(() => {
    let active = true;
    fetchInspectionsProjects()
      .then((projs) => {
        if (active) {
          setProjectOptions(projs || []);
        }
      })
      .catch((err) => console.error("Failed to load dashboard projects filtering options", err));
    return () => {
      active = false;
    };
  }, []);

  const workshopLabels = useMemo(() => {
    const map: Record<string, string> = {};
    workshops.forEach(w => {
      map[w.code] = `${w.name} (${w.code})`;
    });
    map['VẬT TƯ'] = 'Vật Tư (VẬT TƯ)';
    map['GCN'] = 'GCN (Gia Công Ngoài)';
    map['LẮP ĐẶT'] = 'Lắp Đặt (SITE)';
    return map;
  }, [workshops]);

  const projectLabels = useMemo(() => {
    const map: Record<string, string> = {};
    projectOptions.forEach(p => {
      map[p.ma_ct] = `${p.ten_ct || p.name || p.ma_ct} (${p.ma_ct})`;
    });
    return map;
  }, [projectOptions]);

  const filterOptions = useMemo(() => {
    const qaqcUsers = (users || []).filter(u => {
      const isRoleQC = u.role === 'QC';
      const dept = String(u.phong_ban || u.phongBan || '').toUpperCase();
      return isRoleQC || dept.includes('QA') || dept.includes('QC') || dept.includes('CHẤT LƯỢNG') || dept.includes('CHAT LUONG');
    });

    return {
      inspectors: Array.from(new Set(user?.role === 'QC' ? [user.name] : (qaqcUsers.map(u => u.name) || []))),
      workshops: Array.from(new Set([
        ...workshops.map(w => w.code),
        'VẬT TƯ', 'GCN', 'LẮP ĐẶT'
      ])),
      types: Object.keys(MODULE_CONFIG),
      projects: projectOptions.map(p => p.ma_ct),
      statuses: [InspectionStatus.DRAFT, InspectionStatus.PENDING, InspectionStatus.COMPLETED, InspectionStatus.APPROVED, InspectionStatus.FLAGGED]
    };
  }, [user, users, workshops, projectOptions]);

  const isFilterActive = filterQC.length > 0 || filterWorkshop.length > 0 || filterStatus.length > 0 || filterType.length > 0 || filterProject.length > 0 || startDate !== '' || endDate !== '';

  const handleApplyFilters = () => {
    if (onFilterChange) {
      onFilterChange({
        qc: filterQC.join(','),
        workshop: filterWorkshop.join(','),
        status: filterStatus.join(','),
        type: filterType.join(','),
        project: filterProject.join(','),
        startDate,
        endDate
      });
    }
  };

  const clearFilters = () => {
    setFilterQC([]);
    setFilterWorkshop([]);
    setFilterStatus([]);
    setFilterType([]);
    setFilterProject([]);
    setStartDate('');
    setEndDate('');
    if (onFilterChange) onFilterChange({});
  };

  const stats = useMemo(() => {
    if (dashboardStats?.stats) {
      return dashboardStats.stats;
    }
    return { total: 0, drafts: 0, highPriority: 0, avgSuccessRate: 0, avgErrorRate: 0, nonDraftCount: 0 };
  }, [dashboardStats]);

  const statusData = useMemo(() => {
    return [
      { name: '% Đạt', value: stats.avgSuccessRate, color: COLORS.pass },
      { name: '% Lỗi', value: stats.avgErrorRate, color: COLORS.fail },
    ].filter(item => item.value > 0);
  }, [stats]);

  const monthlyData = useMemo(() => {
    if (!dashboardStats?.monthlyData) return [];
    
    return dashboardStats.monthlyData.map((m: any) => {
        let passRate = 0;
        let failRate = 0;
        
        if (m.inspected > 0) {
            passRate = Number(((m.passed / m.inspected) * 100).toFixed(1));
            failRate = Number(((m.failed / m.inspected) * 100).toFixed(1));
        } else if (m.count > 0) {
            // fallback if no qty
            passRate = Number(((m.fallbackScore / (m.count * 100)) * 100).toFixed(1));
            failRate = Number((100 - passRate).toFixed(1));
        }
        
        return {
            name: m.month,
            passRate,
            failRate,
            inspected: m.inspected,
            count: m.count
        };
    });
  }, [dashboardStats]);

  const workshopData = useMemo(() => {
    if (!dashboardStats?.workshopData) return [];
    
    return dashboardStats.workshopData
      .map((item: any) => {
        let passRate = 0;
        if (item.inspected > 0) {
          passRate = parseFloat(((item.passed / item.inspected) * 100).toFixed(2));
        } else if (item.count > 0) {
          passRate = parseFloat((item.fallbackScore / item.count).toFixed(2));
        }
        
        // Translate raw code/value to readable Name
        const wsObj = workshops.find(w => w.code === item.code);
        const displayName = wsObj ? wsObj.name : (workshopLabels[item.code] || item.code);

        return {
          code: item.code,
          name: displayName,
          passRate: passRate,
          failRate: parseFloat((100 - passRate).toFixed(2))
        };
      })
      .sort((a: any, b: any) => a.code.localeCompare(b.code, undefined, { numeric: true }))
      .slice(0, 15);
  }, [dashboardStats, workshops, workshopLabels]);

  const stageData = useMemo(() => {
    if (!dashboardStats?.stageData) return [];

    const stageMap: Record<string, { inspected: number; passed: number; count: number }> = {};
    
    dashboardStats.stageData.forEach((item: any) => {
      let stageName = String(item.stageName || '').trim();
      if (!stageName) return;

      // Ensure formatting as "Pxx"
      const numericMatches = stageName.match(/\d+/);
      if (numericMatches) {
        stageName = `P${numericMatches[0]}`;
      } else if (!stageName.startsWith('P')) {
        stageName = `P${stageName}`;
      }

      if (!stageMap[stageName]) stageMap[stageName] = { inspected: 0, passed: 0, count: 0 };
      
      stageMap[stageName].inspected += Number(item.inspected || 0);
      stageMap[stageName].passed += Number(item.passed || 0);
      stageMap[stageName].count += Number(item.count || 0);
    });

    return Object.keys(stageMap)
      .map(key => {
        const item = stageMap[key];
        let passRate = 100;
        if (item.inspected > 0) {
          passRate = parseFloat(((item.passed / item.inspected) * 100).toFixed(2));
        }
        
        return {
          name: key,
          passRate: passRate,
          failRate: parseFloat((100 - passRate).toFixed(2))
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [dashboardStats]);



  const StatCard = ({ title, value, icon: Icon, colorHex, subtitle }: any) => (
    <div className="bg-white dark:bg-slate-900 p-4 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group active:scale-[0.98] transition-all">
      <div className="flex justify-between items-start">
        <div className="space-y-0.5">
          <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{title}</p>
          <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 leading-tight">{value}</h3>
          <p className="text-[7px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">{subtitle}</p>
        </div>
        <div className={`p-2 rounded-xl shrink-0`} style={{ backgroundColor: `${colorHex}15`, color: colorHex }}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-slate-50 dark:bg-slate-800/50 flex flex-col no-scroll-x">
      <div className="p-4 space-y-5 max-w-7xl mx-auto w-full pb-28">
        
        {/* Filter Section */}
        <div className="bg-white dark:bg-slate-900 px-5 py-4 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setIsFilterOpen(!isFilterOpen)}>
                <h3 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Filter className="w-4 h-4" /> BỘ LỌC DỮ LIỆU {isFilterActive && <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded text-[8px] animate-pulse">ĐANG TÁC DỤNG</span>}
                </h3>
                <div className="flex items-center gap-4">
                  {isFilterActive && (
                      <button 
                          onClick={(e) => { e.stopPropagation(); clearFilters(); }}
                          className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest hover:underline"
                      >
                          Xóa tất cả
                      </button>
                  )}
                  <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-full">
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isFilterOpen ? 'rotate-180' : ''}`} />
                  </div>
                </div>
            </div>
            
            {isFilterOpen && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200">
                    <SearchableSelect 
                        label="Loại phiếu"
                        values={filterType}
                        options={filterOptions.types}
                        onChange={(vals) => { setFilterType(vals); if (onFilterChange) onFilterChange({ qc: filterQC.join(','), workshop: filterWorkshop.join(','), status: filterStatus.join(','), type: vals.join(','), project: filterProject.join(','), startDate, endDate }); }}
                        optionLabels={Object.fromEntries(Object.entries(MODULE_CONFIG).map(([k, v]) => [k, v.label]))}
                    />
                    <SearchableSelect 
                        label="Dự án"
                        values={filterProject}
                        options={filterOptions.projects}
                        onChange={(vals) => { setFilterProject(vals); if (onFilterChange) onFilterChange({ qc: filterQC.join(','), workshop: filterWorkshop.join(','), status: filterStatus.join(','), type: filterType.join(','), project: vals.join(','), startDate, endDate }); }}
                        optionLabels={projectLabels}
                    />
                    <SearchableSelect 
                        label="Xưởng Sản Xuất"
                        values={filterWorkshop}
                        options={filterOptions.workshops}
                        onChange={(vals) => { setFilterWorkshop(vals); if (onFilterChange) onFilterChange({ qc: filterQC.join(','), workshop: vals.join(','), status: filterStatus.join(','), type: filterType.join(','), project: filterProject.join(','), startDate, endDate }); }}
                        optionLabels={workshopLabels}
                    />
                    <SearchableSelect 
                        label="QC Kiểm tra"
                        values={filterQC}
                        options={filterOptions.inspectors}
                        onChange={(vals) => { setFilterQC(vals); if (onFilterChange) onFilterChange({ qc: vals.join(','), workshop: filterWorkshop.join(','), status: filterStatus.join(','), type: filterType.join(','), project: filterProject.join(','), startDate, endDate }); }}
                    />
                    <DateRangePicker 
                        label="Khoảng ngày"
                        startDate={startDate}
                        endDate={endDate}
                        onStartDateChange={(d) => { setStartDate(d); if (onFilterChange) onFilterChange({ qc: filterQC.join(','), workshop: filterWorkshop.join(','), status: filterStatus.join(','), type: filterType.join(','), project: filterProject.join(','), startDate: d, endDate }); }}
                        onEndDateChange={(d) => { setEndDate(d); if (onFilterChange) onFilterChange({ qc: filterQC.join(','), workshop: filterWorkshop.join(','), status: filterStatus.join(','), type: filterType.join(','), project: filterProject.join(','), startDate, endDate: d }); }}
                    />
                </div>
            )}
        </div>

        {/* Top Stat Grid */}
        <div className="grid grid-cols-2 gap-3">
            <StatCard title="TỔNG PHIẾU" value={stats.total} icon={ClipboardCheck} colorHex="#3b82f6" subtitle={`${stats.drafts} bản nháp`} />
            <StatCard title="TỶ LỆ ĐẠT AVG" value={`${stats.avgSuccessRate}%`} icon={CheckCircle2} colorHex="#10b981" subtitle="KPI: >90%" />
            <StatCard title="% LỖI AVG" value={`${stats.avgErrorRate}%`} icon={AlertTriangle} colorHex="#ef4444" subtitle="Trung bình/Phiếu" />
            <StatCard title="CẤP BÁCH" value={stats.highPriority} icon={Flag} colorHex="#f59e0b" subtitle="Ưu tiên cao" />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-4">
            {/* Status Pie */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center">
               <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 w-full text-center border-b border-slate-50 pb-2">PHÂN BỔ TỶ LỆ (%)</h3>
               <div className="w-full h-40 relative min-h-[160px]">
                  <ResponsiveContainer width="99%" height={160}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {statusData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                     <p className="text-xl font-black text-slate-800 dark:text-slate-200 leading-none">{stats.avgSuccessRate}%</p>
                     <p className="text-[7px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">TRUNG BÌNH</p>
                  </div>
               </div>
               <div className="flex flex-wrap gap-3 mt-2 justify-center">
                  {statusData.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }}></div>
                          <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase whitespace-nowrap">{entry.name}: {entry.value}%</p>
                      </div>
                  ))}
               </div>
            </div>



            {/* Workshop Quality Chart */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
               <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2 flex items-center justify-between">
                  CHẤT LƯỢNG XƯỞNG SẢN XUẤT
               </h3>
               <div className="h-64 w-full min-h-[256px]">
                  <ResponsiveContainer width="99%" height={256}>
                    <ComposedChart data={workshopData} margin={{ top: 20, right: 0, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}} 
                        angle={-45}
                        textAnchor="end"
                      />
                      <YAxis 
                        yAxisId="left"
                        domain={[0, 100]} 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        domain={[0, 'auto']} 
                        hide
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                        labelStyle={{ fontSize: '11px', fontWeight: '900', color: '#1e293b', marginBottom: '4px' }}
                      />
                      <Legend 
                        iconType="circle" 
                        wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} 
                      />
                      <Bar yAxisId="left" dataKey="passRate" name="Tỷ Lệ Đạt %" fill={COLORS.pass} barSize={24} radius={[4, 4, 0, 0]}>
                        {workshopData.map((entry: any, index: number) => (
                           <Cell key={`cell-${index}`} fill={COLORS.pass} />
                        ))}
                        <LabelList dataKey="passRate" position="insideTop" style={{ fill: '#fff', fontSize: 8, fontWeight: '900' }} formatter={(val: any) => `${val}%`} />
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="failRate" name="Tỷ Lệ Lỗi %" stroke={COLORS.fail} strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }}>
                        <LabelList dataKey="failRate" position="top" offset={10} style={{ fill: '#dc2626', fontSize: 9, fontWeight: '900' }} formatter={(val: any) => `${val}%`} />
                      </Line>
                    </ComposedChart>
                  </ResponsiveContainer>
               </div>
            </div>

            {/* Stage Quality Chart (PQC) */}
            {stageData.length > 0 && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                 <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2">
                    HIỆU SUẤT THEO CÔNG ĐOẠN PQC (%)
                 </h3>
                 <div className="h-64 w-full min-h-[256px]">
                    <ResponsiveContainer width="99%" height={256}>
                      <ComposedChart data={stageData} margin={{ top: 20, right: 0, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}}
                        />
                        <YAxis domain={[0, 100]} hide />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                          labelStyle={{ fontSize: '11px', fontWeight: '900', color: '#1e293b' }}
                        />
                        <Bar dataKey="passRate" name="Tỷ Lệ Đạt %" fill={COLORS.pass} barSize={24} radius={[4, 4, 0, 0]}>
                           <LabelList dataKey="passRate" position="insideTop" style={{ fill: '#fff', fontSize: 8, fontWeight: '900' }} formatter={(val: any) => `${val}%`} />
                        </Bar>
                        <Line type="monotone" dataKey="failRate" name="Tỷ Lệ Lỗi %" stroke={COLORS.fail} strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }}>
                           <LabelList dataKey="failRate" position="top" offset={10} style={{ fill: '#dc2626', fontSize: 9, fontWeight: '900' }} formatter={(val: any) => `${val}%`} />
                        </Line>
                      </ComposedChart>
                    </ResponsiveContainer>
                 </div>
              </div>
            )}

            {/* Monthly Quality Chart */}
            {monthlyData.length > 0 && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                 <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2 flex items-center justify-between">
                    CHẤT LƯỢNG THEO THÁNG
                 </h3>
                 <div className="h-64 w-full min-h-[256px]">
                    <ResponsiveContainer width="99%" height={256}>
                      <ComposedChart data={monthlyData} margin={{ top: 20, right: 0, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}} 
                          angle={-45}
                          textAnchor="end"
                        />
                        <YAxis 
                          yAxisId="left"
                          domain={[0, 100]} 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}}
                        />
                        <YAxis 
                          yAxisId="right"
                          orientation="right"
                          domain={[0, 'auto']} 
                          hide
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                          labelStyle={{ fontSize: '11px', fontWeight: '900', color: '#1e293b', marginBottom: '4px' }}
                        />
                        <Legend 
                          iconType="circle" 
                          wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} 
                        />
                        <Bar yAxisId="left" dataKey="passRate" name="Tỷ Lệ Đạt %" fill={COLORS.pass} barSize={24} radius={[4, 4, 0, 0]}>
                          {monthlyData.map((entry: any, index: number) => (
                             <Cell key={`cell-${index}`} fill={COLORS.pass} />
                          ))}
                          <LabelList dataKey="passRate" position="insideTop" style={{ fill: '#fff', fontSize: 8, fontWeight: '900' }} formatter={(val: any) => `${val}%`} />
                        </Bar>
                        <Line yAxisId="right" type="monotone" dataKey="failRate" name="Tỷ Lệ Lỗi %" stroke={COLORS.fail} strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }}>
                          <LabelList dataKey="failRate" position="top" offset={10} style={{ fill: '#dc2626', fontSize: 9, fontWeight: '900' }} formatter={(val: any) => `${val}%`} />
                        </Line>
                      </ComposedChart>
                    </ResponsiveContainer>
                 </div>
              </div>
            )}

            {/* NCR Quality Chart */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
               <div className="flex items-center justify-between mb-4 border-b border-slate-50 dark:border-slate-800 pb-2">
                 <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                    BIỂU ĐỒ LỖI (NCR)
                 </h3>
                 <select
                   value={ncrGroupRange}
                   onChange={(e) => {
                     setNcrGroupRange(e.target.value as any);
                     setSelectedNcrDateKey(null);
                   }}
                   className="text-[10px] font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 outline-none text-slate-700 dark:text-slate-300"
                 >
                   <option value="DAY">Theo Ngày</option>
                   <option value="WEEK">Theo Tuần</option>
                   <option value="MONTH">Theo Tháng</option>
                   <option value="YEAR">Theo Năm</option>
                 </select>
               </div>
               
               <div className="h-64 w-full min-h-[256px]">
                  {isLoadingNcrs ? (
                     <div className="h-full flex items-center justify-center text-slate-400">Đang tải dữ liệu...</div>
                  ) : ncrChartData.length === 0 ? (
                     <div className="h-full flex items-center justify-center text-slate-400 font-medium text-xs">Không có dữ liệu lỗi</div>
                  ) : (
                     <ResponsiveContainer width="99%" height={256}>
                       <BarChart 
                         data={ncrChartData} 
                         margin={{ top: 20, right: 0, left: -20, bottom: 20 }}
                         onClick={(data) => {
                           if (data && data.activePayload && data.activePayload.length > 0) {
                             const key = data.activePayload[0].payload.key;
                             setSelectedNcrDateKey(key === selectedNcrDateKey ? null : key);
                           }
                         }}
                       >
                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                         <XAxis 
                           dataKey="name" 
                           axisLine={false} 
                           tickLine={false} 
                           tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}}
                           angle={ncrGroupRange === 'DAY' ? -45 : 0}
                           textAnchor={ncrGroupRange === 'DAY' ? 'end' : 'middle'}
                         />
                         <YAxis 
                           domain={[0, 'auto']} 
                           axisLine={false} 
                           tickLine={false} 
                           tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}} 
                         />
                         <Tooltip 
                           cursor={{fill: 'rgba(0,0,0,0.05)'}}
                           contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                           itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                           labelStyle={{ fontSize: '11px', fontWeight: '900', color: '#1e293b', marginBottom: '4px' }}
                         />
                         <Bar dataKey="count" name="Số lượng NCR" fill="#ef4444" barSize={32} radius={[4, 4, 0, 0]}>
                           {ncrChartData.map((entry, index) => (
                             <Cell 
                               key={`cell-${index}`} 
                               fill={entry.key === selectedNcrDateKey ? "#dc2626" : "#ef4444"} 
                               className="cursor-pointer transition-colors duration-200"
                             />
                           ))}
                           <LabelList dataKey="count" position="top" style={{ fill: '#b91c1c', fontSize: 9, fontWeight: '900' }} />
                         </Bar>
                       </BarChart>
                     </ResponsiveContainer>
                  )}
               </div>
            </div>



            {/* NCR List Details */}
            {ncrList.length > 0 && (
                <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                   <h3 className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-50 dark:border-slate-800 pb-2 flex items-center justify-between">
                      DANH SÁCH PHIẾU KIỂM TRA CÓ LỖI (NCR)
                      {selectedNcrDateKey && (
                        <button 
                          onClick={() => setSelectedNcrDateKey(null)}
                          className="text-blue-500 hover:text-blue-600 flex items-center gap-1 font-bold lowercase"
                        >
                          <X className="w-3 h-3" /> Bỏ lọc
                        </button>
                      )}
                   </h3>
                   <div className="max-h-[440px] overflow-auto w-full no-scrollbar rounded-xl border border-slate-100 dark:border-slate-800">
                      <table className="w-full text-left min-w-[600px] border-collapse">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-slate-50 dark:bg-slate-800">
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Mã phiếu</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Hạng mục / Công trình</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase text-center border-b border-slate-200 dark:border-slate-700">Số lỗi (NCR)</th>
                            <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase text-right border-b border-slate-200 dark:border-slate-700">Ngày tạo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredInspectionNcrList.map(item => (
                            <tr 
                              key={item.inspection_id} 
                              onClick={() => onViewInspection && onViewInspection(item.inspection_id)}
                              className="hover:bg-blue-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer group"
                            >
                              <td className="px-3 py-2 text-xs font-mono font-bold text-slate-700 dark:text-slate-300 group-hover:text-blue-600 transition-colors">
                                #{item.inspection_id.substring(0, 8).toUpperCase()}
                              </td>
                              <td className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                                {item.ten_hang_muc || '---'}
                                <span className="block text-[10px] text-slate-400">
                                  {item.ma_ct || '---'} {item.workshop ? ` - ${item.workshop}` : ''}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs font-black text-red-500 text-center">
                                {item.ncrCount}
                              </td>
                              <td className="px-3 py-2 text-xs font-medium text-slate-500 text-right">
                                {item.createdDate ? new Date(item.createdDate).toLocaleDateString('vi-VN') : (item.createdAt ? new Date(item.createdAt * 1000).toLocaleDateString('vi-VN') : '')}
                              </td>
                            </tr>
                          ))}
                          {filteredInspectionNcrList.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-6 text-center text-xs font-medium text-slate-400">
                                Không có dữ liệu phù hợp
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                   </div>
                </div>
            )}


        </div>


      </div>
    </div>
  );
};
