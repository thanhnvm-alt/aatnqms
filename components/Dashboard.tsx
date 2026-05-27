
import React, { useMemo, useState } from 'react';
import { Inspection, InspectionStatus, Priority, User, ViewState, Workshop } from '../types';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ComposedChart, Line, CartesianGrid, Legend
} from 'recharts';
import { 
  ClipboardCheck, AlertTriangle, CheckCircle2, Flag, 
  Activity, Clock, AlertOctagon,
  ArrowRight, ShieldCheck, UserCircle, Filter, X, Search, RotateCcw
} from 'lucide-react';
import { SearchableSelect } from './SearchableSelect';
import { DateRangePicker } from './DateRangePicker';

interface DashboardProps {
  inspections: Inspection[];
  user?: User;
  users?: User[];
  workshops?: Workshop[];
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

export const Dashboard: React.FC<DashboardProps> = ({ inspections, user, users = [], workshops = [], onLogout, onNavigate, onViewInspection, onFilterChange }) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterQC, setFilterQC] = useState<string[]>([]);
  const [filterWorkshop, setFilterWorkshop] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filterOptions = useMemo(() => ({
    inspectors: Array.from(new Set(user?.role === 'QC' ? [user.name] : (users?.filter(u => u.role === 'QC').map(u => u.name) || []))),
    workshops: Array.from(new Set(workshops.map(w => w.name))),
    types: Object.keys(MODULE_CONFIG),
    statuses: [InspectionStatus.DRAFT, InspectionStatus.PENDING, InspectionStatus.COMPLETED, InspectionStatus.APPROVED, InspectionStatus.FLAGGED]
  }), [user, users, workshops]);

  const isFilterActive = filterQC.length > 0 || filterWorkshop.length > 0 || filterStatus.length > 0 || filterType.length > 0 || startDate !== '' || endDate !== '';

  const handleApplyFilters = () => {
    if (onFilterChange) {
      onFilterChange({
        qc: filterQC.join(','),
        workshop: filterWorkshop.join(','),
        status: filterStatus.join(','),
        type: filterType.join(','),
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
    setStartDate('');
    setEndDate('');
    if (onFilterChange) onFilterChange({});
  };

  const safeInspections = useMemo(() => (Array.isArray(inspections) ? inspections : []).filter(i => i !== null), [inspections]);

  const stats = useMemo(() => {
    const total = safeInspections.length;
    const nonDraftItems = safeInspections.filter(i => i.status !== InspectionStatus.DRAFT);
    const drafts = safeInspections.filter(i => i.status === InspectionStatus.DRAFT).length;
    const highPriority = safeInspections.filter(i => i.priority === Priority.HIGH).length;
    
    let totalInspected = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let fallbackScoreSum = 0;
    let hasQuantities = false;

    nonDraftItems.forEach(i => {
      const inspected = Number(i.inspectedQuantity || 0);
      const passed = Number(i.passedQuantity || 0);
      const failed = Number(i.failedQuantity || 0);
      
      if (inspected > 0) {
        hasQuantities = true;
        totalInspected += inspected;
        totalPassed += passed;
        totalFailed += failed;
      }
      fallbackScoreSum += Number(i.score || 0); 
    });

    let avgSuccessRate = 0;
    let avgErrorRate = 0;

    if (hasQuantities && totalInspected > 0) {
      avgSuccessRate = parseFloat(((totalPassed / totalInspected) * 100).toFixed(2));
      avgErrorRate = parseFloat(((totalFailed / totalInspected) * 100).toFixed(2));
    } else if (nonDraftItems.length > 0) {
      // Fallback for types that only use 'score'
      avgSuccessRate = parseFloat((fallbackScoreSum / nonDraftItems.length).toFixed(2));
      avgErrorRate = parseFloat((100 - avgSuccessRate).toFixed(2));
    }

    return { total, drafts, highPriority, avgSuccessRate, avgErrorRate, nonDraftCount: nonDraftItems.length };
  }, [safeInspections]);

  const statusData = [
    { name: '% Đạt', value: stats.avgSuccessRate, color: COLORS.pass },
    { name: '% Lỗi', value: stats.avgErrorRate, color: COLORS.fail },
  ].filter(item => item.value > 0);

  const workshopData = useMemo(() => {
    const wsMap: Record<string, { inspected: number; passed: number; fallbackScore: number; count: number }> = {};
    
    safeInspections.forEach(i => {
      if (!i || i.status === InspectionStatus.DRAFT) return;
      const ws = String(i.ma_xuong || i.workshop || 'Chưa xác định');
      if (!wsMap[ws]) wsMap[ws] = { inspected: 0, passed: 0, fallbackScore: 0, count: 0 };
      
      wsMap[ws].inspected += Number(i.inspectedQuantity || 0);
      wsMap[ws].passed += Number(i.passedQuantity || 0);
      wsMap[ws].fallbackScore += Number(i.score || 0);
      wsMap[ws].count += 1;
    });

    return Object.keys(wsMap)
      .map(key => {
        const item = wsMap[key];
        let passRate = 0;
        if (item.inspected > 0) {
          passRate = parseFloat(((item.passed / item.inspected) * 100).toFixed(2));
        } else if (item.count > 0) {
          passRate = parseFloat((item.fallbackScore / item.count).toFixed(2));
        }
        
        return {
          name: key,
          passRate: passRate,
          failRate: parseFloat((100 - passRate).toFixed(2))
        };
      })
      .sort((a, b) => b.passRate - a.passRate)
      .slice(0, 10);
  }, [safeInspections]);

  const projectData = useMemo(() => {
    const projMap: Record<string, { inspected: number; passed: number; fallbackScore: number; count: number }> = {};
    
    safeInspections.forEach(i => {
      if (!i || i.status === InspectionStatus.DRAFT) return;
      const project = String(i.ma_ct || 'Không xác định');
      if (!projMap[project]) projMap[project] = { inspected: 0, passed: 0, fallbackScore: 0, count: 0 };
      
      projMap[project].inspected += Number(i.inspectedQuantity || 0);
      projMap[project].passed += Number(i.passedQuantity || 0);
      projMap[project].fallbackScore += Number(i.score || 0);
      projMap[project].count += 1;
    });

    return Object.keys(projMap)
      .map(key => {
        const item = projMap[key];
        let score = 0;
        if (item.inspected > 0) {
          score = parseFloat(((item.passed / item.inspected) * 100).toFixed(2));
        } else if (item.count > 0) {
          score = parseFloat((item.fallbackScore / item.count).toFixed(2));
        }
        
        return {
          name: key,
          score: score
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [safeInspections]);

  const recentCritical = useMemo(() => {
    return safeInspections
      .filter(i => i && i.status === InspectionStatus.FLAGGED)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [safeInspections]);

  const StatCard = ({ title, value, icon: Icon, colorHex, subtitle }: any) => (
    <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm relative overflow-hidden group active:scale-[0.98] transition-all">
      <div className="flex justify-between items-start">
        <div className="space-y-0.5">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
          <h3 className="text-xl font-black text-slate-900 leading-tight">{value}</h3>
          <p className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">{subtitle}</p>
        </div>
        <div className={`p-2 rounded-xl shrink-0`} style={{ backgroundColor: `${colorHex}15`, color: colorHex }}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-slate-50 flex flex-col no-scroll-x">
      <div className="p-4 space-y-5 max-w-7xl mx-auto w-full pb-28">
        
        {/* Filter Section */}
        <div className="bg-white p-4 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Filter className="w-4 h-4" /> BỘ LỌC DỮ LIỆU
                </h3>
                {isFilterActive && (
                    <button 
                        onClick={clearFilters}
                        className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                    >
                        Xóa tất cả
                    </button>
                )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <SearchableSelect 
                    label="Loại phiếu"
                    values={filterType}
                    options={filterOptions.types}
                    onChange={(vals) => { setFilterType(vals); if (onFilterChange) onFilterChange({ qc: filterQC.join(','), workshop: filterWorkshop.join(','), status: filterStatus.join(','), type: vals.join(','), startDate, endDate }); }}
                    optionLabels={Object.fromEntries(Object.entries(MODULE_CONFIG).map(([k, v]) => [k, v.label]))}
                />
                <SearchableSelect 
                    label="Xưởng Sản Xuất"
                    values={filterWorkshop}
                    options={filterOptions.workshops}
                    onChange={(vals) => { setFilterWorkshop(vals); if (onFilterChange) onFilterChange({ qc: filterQC.join(','), workshop: vals.join(','), status: filterStatus.join(','), type: filterType.join(','), startDate, endDate }); }}
                />
                <SearchableSelect 
                    label="QC Kiểm tra"
                    values={filterQC}
                    options={filterOptions.inspectors}
                    onChange={(vals) => { setFilterQC(vals); if (onFilterChange) onFilterChange({ qc: vals.join(','), workshop: filterWorkshop.join(','), status: filterStatus.join(','), type: filterType.join(','), startDate, endDate }); }}
                />
                <DateRangePicker 
                    label="Khoảng ngày"
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={(d) => { setStartDate(d); if (onFilterChange) onFilterChange({ qc: filterQC.join(','), workshop: filterWorkshop.join(','), status: filterStatus.join(','), type: filterType.join(','), startDate: d, endDate }); }}
                    onEndDateChange={(d) => { setEndDate(d); if (onFilterChange) onFilterChange({ qc: filterQC.join(','), workshop: filterWorkshop.join(','), status: filterStatus.join(','), type: filterType.join(','), startDate, endDate: d }); }}
                />
            </div>
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
            <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col items-center">
               <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 w-full text-center border-b border-slate-50 pb-2">PHÂN BỔ TỶ LỆ (%)</h3>
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
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                     <p className="text-xl font-black text-slate-800 leading-none">{stats.avgSuccessRate}%</p>
                     <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-0.5">TRUNG BÌNH</p>
                  </div>
               </div>
               <div className="flex flex-wrap gap-3 mt-2 justify-center">
                  {statusData.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }}></div>
                          <p className="text-[8px] font-black text-slate-400 uppercase whitespace-nowrap">{entry.name}: {entry.value}%</p>
                      </div>
                  ))}
               </div>
            </div>

            {/* Top Project Bar */}
            <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col">
               <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2">HIỆU SUẤT THEO DỰ ÁN (%)</h3>
               <div className="h-48 w-full min-h-[192px]">
                  <ResponsiveContainer width="99%" height={192}>
                    <BarChart data={projectData} layout="vertical" margin={{ left: -20, right: 10 }}>
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={80} 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 8, fontWeight: '900', fill: '#94a3b8'}} 
                      />
                      <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={8}>
                        {projectData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.score >= 90 ? COLORS.pass : COLORS.blue} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>

            {/* Workshop Quality Chart */}
            <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col">
               <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2 flex items-center justify-between">
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
                        {workshopData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={COLORS.pass} />
                        ))}
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="failRate" name="Tỷ Lệ Lỗi %" stroke={COLORS.fail} strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
               </div>
            </div>
        </div>

        {/* Critical Issues Section */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-red-50/20">
                <h3 className="text-[9px] font-black text-red-600 uppercase tracking-widest flex items-center gap-2">
                    <AlertOctagon className="w-4 h-4" /> PHIẾU CẦN XỬ LÝ LỖI
                </h3>
             </div>
             <div className="divide-y divide-slate-100">
                {recentCritical.length > 0 ? (
                    recentCritical.map((item) => (
                        <div 
                          key={item.id} 
                          onClick={() => onViewInspection?.(item.id)}
                          className="p-4 active:bg-slate-50 transition-all flex items-center justify-between group cursor-pointer"
                        >
                            <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
                                <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex flex-col items-center justify-center font-black shrink-0 shadow-md">
                                    <span className="text-sm leading-none">{item.score}</span>
                                    <span className="text-[6px] uppercase opacity-60">PTS</span>
                                </div>
                                <div className="min-w-0 overflow-hidden">
                                    <h4 className="font-black text-slate-800 text-[11px] truncate uppercase tracking-tight mb-0.5">{item.ten_hang_muc}</h4>
                                    <div className="flex items-center gap-2 text-[7px] text-slate-400 font-black uppercase tracking-tighter">
                                        <span className="truncate max-w-[60px]">{item.ma_ct}</span>
                                        <span className="text-slate-300">|</span>
                                        <span>{item.date}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-300 active:scale-90 shrink-0">
                                <ArrowRight className="w-3.5 h-3.5" />
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="py-12 text-center flex flex-col items-center justify-center space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-green-200" />
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Hệ thống không ghi nhận lỗi mới</p>
                    </div>
                )}
             </div>
             <div className="p-3 bg-slate-50 border-t border-slate-100">
                <button onClick={() => onNavigate?.('LIST')} className="w-full py-2.5 bg-white border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500 shadow-sm active:scale-95 transition-all">Xem tất cả báo cáo</button>
             </div>
        </div>
      </div>
    </div>
  );
};
