
import React, { useMemo } from 'react';
import { Inspection, InspectionStatus, Priority, User, ViewState } from '../types';
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
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

interface DashboardProps {
  inspections: Inspection[];
  user?: User;
  onLogout?: () => void;
  onNavigate?: (view: ViewState) => void;
}

const COLORS = {
  pass: '#10b981', // emerald-500
  fail: '#ef4444', // red-500
  pending: '#f59e0b', // amber-500
  draft: '#94a3b8', // slate-400
  blue: '#3b82f6', // blue-500
};

export const Dashboard: React.FC<DashboardProps> = ({ inspections, user, onLogout, onNavigate }) => {
  const safeInspections = Array.isArray(inspections) ? inspections : [];

  const stats = useMemo(() => {
    const total = safeInspections.length;
    const completed = safeInspections.filter(i => i.status === InspectionStatus.COMPLETED || i.status === InspectionStatus.APPROVED).length;
    const flagged = safeInspections.filter(i => i.status === InspectionStatus.FLAGGED).length;
    const drafts = safeInspections.filter(i => i.status === InspectionStatus.DRAFT).length;
    const highPriority = safeInspections.filter(i => i.priority === Priority.HIGH).length;
    
    const finishedTotal = completed + flagged;
    const passRate = finishedTotal > 0 ? Math.round((completed / finishedTotal) * 100) : 0;

    return { total, completed, flagged, drafts, highPriority, passRate };
  }, [safeInspections]);

  const statusData = [
    { name: 'Đã xong', value: stats.completed, color: COLORS.pass },
    { name: 'Cần xử lý', value: stats.flagged, color: COLORS.fail },
    { name: 'Bản nháp', value: stats.drafts, color: COLORS.draft },
  ].filter(item => item.value > 0);

  const projectData = useMemo(() => {
    const projectScores: Record<string, { total: number; count: number }> = {};
    safeInspections.forEach(i => {
      if (i.status === InspectionStatus.DRAFT) return;
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
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [safeInspections]);

  const recentCritical = useMemo(() => {
    return safeInspections
      .filter(i => i.status === InspectionStatus.FLAGGED)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [safeInspections]);

  const StatCard = ({ title, value, icon: Icon, colorHex, subtitle }: any) => (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group transition-all hover:shadow-md">
      <div className="flex justify-between items-start">
        <div className="space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{title}</p>
          <h3 className="text-3xl font-black text-slate-900 leading-none">{value}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase">{subtitle}</p>
        </div>
        <div className={`p-3 rounded-2xl shrink-0`} style={{ backgroundColor: `${colorHex}15`, color: colorHex }}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <div className="absolute right-0 bottom-0 p-4 opacity-[0.03] translate-x-4 translate-y-4">
        <Icon className="w-24 h-24" />
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto no-scrollbar p-6 space-y-8 animate-in fade-in duration-500 bg-slate-50/30">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">DASHBOARD</h1>
          <p className="text-xs font-medium text-slate-400 flex items-center gap-2 mt-1">
            <Calendar className="w-3.5 h-3.5" /> Hôm nay, {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-2xl border border-blue-100">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Hệ thống ổn định</span>
        </div>
      </div>

      {/* Top Stat Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="TỔNG PHIẾU" value={stats.total} icon={ClipboardCheck} colorHex="#3b82f6" subtitle={`${stats.drafts} bản nháp`} />
        <StatCard title="TỶ LỆ ĐẠT" value={`${stats.passRate}%`} icon={CheckCircle2} colorHex="#10b981" subtitle="KPI: >90%" />
        <StatCard title="CẦN XỬ LÝ" value={stats.flagged} icon={AlertTriangle} colorHex="#ef4444" subtitle="Lỗi / NG" />
        <StatCard title="ƯU TIÊN CAO" value={stats.highPriority} icon={Flag} colorHex="#f59e0b" subtitle="Xử lý gấp" />
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col min-h-[400px]">
           <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-8">PHÂN BỐ TRẠNG THÁI</h3>
           <div className="flex-1 relative min-h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontSize: '12px', fontWeight: 'bold' }} 
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-2">
                 <p className="text-4xl font-black text-slate-900 leading-none">{stats.completed + stats.flagged}</p>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">ĐÃ XONG</p>
              </div>
           </div>
           <div className="grid grid-cols-3 gap-2 mt-4">
              {statusData.map((entry, idx) => (
                  <div key={idx} className="text-center">
                      <div className="w-1.5 h-1.5 rounded-full mx-auto mb-1" style={{ backgroundColor: entry.color }}></div>
                      <p className="text-[8px] font-black text-slate-400 uppercase truncate">{entry.name}</p>
                  </div>
              ))}
           </div>
        </div>

        {/* Project Performance */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm lg:col-span-2 flex flex-col min-h-[400px]">
           <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-8">HIỆU SUẤT CHẤT LƯỢNG THEO DỰ ÁN (TOP 8)</h3>
           <div className="flex-1 min-h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={100} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fontSize: 10, fontWeight: '900', fill: '#94a3b8'}} 
                  />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', fontSize: '11px', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="score" radius={[0, 10, 10, 0]} barSize={16}>
                    {projectData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.score >= 90 ? COLORS.pass : entry.score >= 70 ? COLORS.blue : COLORS.fail} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>

      {/* Critical Issues Area */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
         <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="text-xs font-black text-red-600 uppercase tracking-widest flex items-center gap-3">
                <AlertOctagon className="w-5 h-5" /> VẤN ĐỀ NGHIÊM TRỌNG
            </h3>
            <span className="text-[10px] font-black text-red-500 bg-red-50 px-3 py-1.5 rounded-xl border border-red-100 uppercase tracking-widest">{recentCritical.length} Phiếu</span>
         </div>
         <div className="divide-y divide-slate-100">
            {recentCritical.length > 0 ? (
                recentCritical.map((item) => (
                    <div key={item.id} className="p-6 hover:bg-slate-50 transition-all flex items-center justify-between group">
                        <div className="flex items-start gap-5">
                            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex flex-col items-center justify-center font-black shrink-0 border border-red-100 shadow-sm group-hover:scale-105 transition-transform">
                                <span className="text-lg leading-none">{item.score}</span>
                                <span className="text-[8px] mt-0.5 opacity-60">%</span>
                            </div>
                            <div className="overflow-hidden">
                                <h4 className="font-black text-slate-800 text-sm mb-1 group-hover:text-blue-600 transition-colors truncate max-w-[200px] md:max-w-md uppercase tracking-tight">{item.ten_hang_muc}</h4>
                                <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> {item.date}</span>
                                    <span className="flex items-center gap-1.5"><Flag className="w-3.5 h-3.5"/> {item.ma_ct}</span>
                                    <span className="flex items-center gap-1.5 text-blue-500/70"><ShieldCheck className="w-3.5 h-3.5"/> {item.inspectorName}</span>
                                </div>
                            </div>
                        </div>
                        <button className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-all shadow-sm active:scale-90 group-hover:translate-x-1">
                            <ArrowRight className="w-5 h-5" />
                        </button>
                    </div>
                ))
            ) : (
                <div className="py-20 text-center flex flex-col items-center justify-center space-y-4">
                    <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center border border-green-100">
                        <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="font-black text-slate-800 uppercase tracking-widest text-sm">Tuyệt vời!</p>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter mt-1">Không có vấn đề nghiêm trọng nào.</p>
                    </div>
                </div>
            )}
         </div>
      </div>
    </div>
  );
};
