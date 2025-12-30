
import React, { useMemo } from 'react';
import { Inspection, InspectionStatus, Priority } from '../types';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend 
} from 'recharts';
import { 
  ClipboardCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Flag, 
  TrendingUp, 
  Activity, 
  Clock, 
  AlertOctagon,
  Calendar,
  ArrowRight
} from 'lucide-react';

interface DashboardProps {
  inspections: Inspection[];
}

const COLORS = {
  pass: '#10b981', // emerald-500
  fail: '#ef4444', // red-500
  pending: '#f59e0b', // amber-500
  draft: '#94a3b8', // slate-400
  blue: '#3b82f6', // blue-500
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-slate-100 shadow-xl rounded-xl text-xs z-50">
        <p className="font-black text-slate-800 uppercase tracking-widest mb-1">{label || payload[0].name}</p>
        <p className="text-slate-600 font-bold">
          <span className="text-blue-600">{payload[0].value}</span> {typeof payload[0].value === 'number' && payload[0].name !== 'Điểm TB' ? 'Phiếu' : ''}
        </p>
      </div>
    );
  }
  return null;
};

export const Dashboard: React.FC<DashboardProps> = ({ inspections }) => {
  const safeInspections = Array.isArray(inspections) ? inspections : [];

  const stats = useMemo(() => {
    const total = safeInspections.length;
    const completed = safeInspections.filter(i => i.status === InspectionStatus.COMPLETED || i.status === InspectionStatus.APPROVED).length;
    const flagged = safeInspections.filter(i => i.status === InspectionStatus.FLAGGED).length;
    const drafts = safeInspections.filter(i => i.status === InspectionStatus.DRAFT).length;
    const highPriority = safeInspections.filter(i => i.priority === Priority.HIGH).length;
    
    // Calculate pass rate based on completed inspections only
    const finishedTotal = completed + flagged;
    const passRate = finishedTotal > 0 ? Math.round((completed / finishedTotal) * 100) : 0;

    return { total, completed, flagged, drafts, highPriority, passRate };
  }, [safeInspections]);

  const statusData = [
    { name: 'Đạt / OK', value: stats.completed, color: COLORS.pass },
    { name: 'Lỗi / NG', value: stats.flagged, color: COLORS.fail },
    { name: 'Nháp', value: stats.drafts, color: COLORS.draft },
  ].filter(item => item.value > 0);

  // Group by project for the bar chart
  const projectData = useMemo(() => {
    const projectScores: Record<string, { total: number; count: number }> = {};
    safeInspections.forEach(i => {
      if (i.status === InspectionStatus.DRAFT) return; // Skip drafts for scoring
      const project = String(i.ma_ct || 'Unknown');
      if (!projectScores[project]) projectScores[project] = { total: 0, count: 0 };
      projectScores[project].total += (i.score || 0);
      projectScores[project].count += 1;
    });

    return Object.keys(projectScores)
      .map(key => ({
        name: key,
        score: Math.round(projectScores[key].total / projectScores[key].count)
      }))
      .sort((a, b) => b.score - a.score) // Sort by score desc
      .slice(0, 8); // Top 8
  }, [safeInspections]);

  // Recent Critical Issues
  const recentCritical = useMemo(() => {
    return safeInspections
      .filter(i => i.status === InspectionStatus.FLAGGED)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [safeInspections]);

  const StatCard = ({ title, value, icon: Icon, colorClass, trend, footer }: any) => (
    <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
      <div className={`absolute top-0 right-0 p-3 md:p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 ${colorClass.replace('text-', 'text-')}`}>
        <Icon className="w-12 h-12 md:w-16 md:h-16" />
      </div>
      <div className="relative z-10">
        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center mb-2 md:mb-3 ${colorClass.replace('text-', 'bg-').replace('600', '100')} ${colorClass}`}>
          <Icon className="w-4 h-4 md:w-5 md:h-5" />
        </div>
        <p className="text-slate-500 text-xs md:text-xs font-black uppercase tracking-widest mb-1 truncate">{title}</p>
        <div className="flex items-baseline gap-2">
          <h3 className="text-2xl md:text-3xl font-black text-slate-800">{value}</h3>
          {trend && <span className="text-[10px] md:text-xs font-bold text-green-500 flex items-center hidden md:flex">{trend} <TrendingUp className="w-3 h-3 ml-0.5"/></span>}
        </div>
        {footer && <p className="text-xs md:text-xs text-slate-400 mt-1 md:mt-2 font-medium truncate">{footer}</p>}
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto no-scrollbar p-4 md:p-6 animate-fade-in">
      <div className="space-y-4 md:space-y-6 pb-20 md:pb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight">Dashboard</h2>
            <p className="text-slate-500 text-xs md:text-sm font-medium flex items-center gap-2 mt-1">
              <Calendar className="w-3 h-3 md:w-4 md:h-4" /> 
              Hôm nay, {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-slate-200 shadow-sm w-fit">
             <Activity className="w-3 h-3 md:w-4 md:h-4 text-blue-500 animate-pulse" />
             <span className="text-[10px] md:text-xs font-bold text-slate-600">Hệ thống ổn định</span>
          </div>
        </div>
        
        {/* Mobile Optimized Grid: 2 columns on mobile */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard 
            title="Tổng phiếu" 
            value={stats.total} 
            icon={ClipboardCheck} 
            colorClass="text-blue-600" 
            footer={`${stats.drafts} bản nháp`}
          />
          <StatCard 
            title="Tỷ lệ đạt" 
            value={`${stats.passRate}%`} 
            icon={CheckCircle2} 
            colorClass="text-green-600"
            trend={stats.passRate >= 90 ? "Đạt mục tiêu" : undefined}
            footer="KPI: >90%"
          />
          <StatCard 
            title="Cần xử lý" 
            value={stats.flagged} 
            icon={AlertTriangle} 
            colorClass="text-red-500" 
            footer="Lỗi / NG"
          />
          <StatCard 
            title="Ưu tiên cao" 
            value={stats.highPriority} 
            icon={Flag} 
            colorClass="text-orange-500" 
            footer="Xử lý gấp"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-200 lg:col-span-1 flex flex-col">
            <h3 className="text-xs md:text-sm font-black text-slate-800 uppercase tracking-widest mb-4 md:mb-6">Phân bố trạng thái</h3>
            {/* Added explicit height to container to resolve Recharts warning about width/height being 0 or -1 */}
            <div className="w-full h-[250px] relative">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }}/>
                </PieChart>
              </ResponsiveContainer>
              {/* Center Label */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center -mt-4">
                 <p className="text-2xl md:text-3xl font-black text-slate-800">{stats.completed + stats.flagged}</p>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đã xong</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-200 lg:col-span-2 flex flex-col">
            <h3 className="text-xs md:text-sm font-black text-slate-800 uppercase tracking-widest mb-4 md:mb-6">Hiệu suất chất lượng theo Dự án (Top 8)</h3>
            {/* Added explicit height to container to resolve Recharts warning */}
            <div className="w-full h-[250px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={projectData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis dataKey="name" type="category" width={70} axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 'bold', fill: '#64748b'}} />
                  <Tooltip content={<CustomTooltip />} cursor={{fill: '#f8fafc'}} />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={20} animationDuration={1000}>
                    {projectData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.score >= 90 ? COLORS.pass : entry.score >= 70 ? COLORS.blue : COLORS.fail} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Critical Issues List */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
           <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-red-50/30">
              <h3 className="text-xs md:text-sm font-black text-red-600 uppercase tracking-widest flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 md:w-5 md:h-5" /> <span className="hidden md:inline">Vấn đề nghiêm trọng</span><span className="md:hidden">Lỗi nghiêm trọng</span>
              </h3>
              <span className="text-[10px] md:text-xs font-bold text-red-400 bg-red-50 px-2 md:px-3 py-1 rounded-full">{recentCritical.length} Phiếu</span>
           </div>
           <div className="divide-y divide-slate-100">
              {recentCritical.length > 0 ? (
                  recentCritical.map((item) => (
                      <div key={item.id} className="p-3 md:p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group">
                          <div className="flex items-start gap-3 md:gap-4">
                              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-black text-[10px] md:text-xs shrink-0">
                                  {item.score}%
                              </div>
                              <div className="overflow-hidden">
                                  <h4 className="font-bold text-slate-800 text-sm mb-1 group-hover:text-blue-600 transition-colors truncate max-w-[200px] md:max-w-md">{item.ma_ct} - {item.ten_hang_muc}</h4>
                                  <div className="flex items-center gap-3 text-xs text-slate-500">
                                      <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {item.date}</span>
                                      <span className="flex items-center gap-1"><Flag className="w-3 h-3"/> {item.ma_nha_may}</span>
                                  </div>
                              </div>
                          </div>
                          <div className="text-right hidden sm:block">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Người kiểm tra</span>
                              <span className="text-xs font-bold text-slate-700">{item.inspectorName}</span>
                          </div>
                      </div>
                  ))
              ) : (
                  <div className="p-8 md:p-10 text-center text-slate-400">
                      <CheckCircle2 className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-3 text-green-500 opacity-50" />
                      <p className="font-bold text-xs md:text-sm">Tuyệt vời! Không có vấn đề nghiêm trọng nào.</p>
                  </div>
              )}
           </div>
           {recentCritical.length > 0 && (
               <div className="p-2 md:p-3 bg-slate-50 text-center">
                   <button className="text-[10px] md:text-xs font-black text-slate-500 hover:text-blue-600 uppercase tracking-widest flex items-center justify-center gap-1 w-full py-2">
                       Xem tất cả <ArrowRight className="w-3 h-3" />
                   </button>
               </div>
           )}
        </div>
      </div>
    </div>
  );
};
