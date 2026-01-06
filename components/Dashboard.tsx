import React, { useMemo } from 'react';
import { Inspection, InspectionStatus, Priority, User, ViewState } from '../types';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip
} from 'recharts';
import { 
  ClipboardCheck, AlertTriangle, CheckCircle2, Flag, 
  TrendingUp, Activity, Clock, AlertOctagon,
  Calendar, ArrowRight, ShieldCheck, UserCircle
} from 'lucide-react';

interface DashboardProps {
  inspections: Inspection[];
  user?: User;
  onLogout?: () => void;
  onNavigate?: (view: ViewState) => void;
}

const COLORS = {
  pass: '#10b981',
  fail: '#ef4444',
  pending: '#f59e0b',
  draft: '#94a3b8',
  blue: '#3b82f6',
};

export const Dashboard: React.FC<DashboardProps> = ({ inspections, user, onLogout, onNavigate }) => {
  const safeInspections = useMemo(() => (Array.isArray(inspections) ? inspections : []).filter(i => i !== null), [inspections]);

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
    { name: 'Lỗi/NG', value: stats.flagged, color: COLORS.fail },
    { name: 'Nháp', value: stats.drafts, color: COLORS.draft },
  ].filter(item => item.value > 0);

  const projectData = useMemo(() => {
    const projectScores: Record<string, { total: number; count: number }> = {};
    safeInspections.forEach(i => {
      if (!i || i.status === InspectionStatus.DRAFT) return;
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
      .slice(0, 6);
  }, [safeInspections]);

  const recentCritical = useMemo(() => {
    return safeInspections
      .filter(i => i && i.status === InspectionStatus.FLAGGED)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 4);
  }, [safeInspections]);

  const StatCard = ({ title, value, icon: Icon, colorHex, subtitle }: any) => (
    <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group active:scale-[0.98] transition-all">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
          <h3 className="text-2xl font-black text-slate-900 leading-tight">{value}</h3>
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">{subtitle}</p>
        </div>
        <div className={`p-2.5 rounded-xl shrink-0`} style={{ backgroundColor: `${colorHex}15`, color: colorHex }}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-slate-50/50 flex flex-col">
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full pb-24">
        {/* Page Header */}
        <div className="flex flex-col gap-1 px-1">
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-blue-600" />
                SYSTEM DASHBOARD
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3 h-3" /> Cập nhật: {new Date().toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' })}
            </p>
        </div>

        {/* Top Stat Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
            <StatCard title="TỔNG PHIẾU" value={stats.total} icon={ClipboardCheck} colorHex="#3b82f6" subtitle={`${stats.drafts} bản nháp`} />
            <StatCard title="TỶ LỆ ĐẠT" value={`${stats.passRate}%`} icon={CheckCircle2} colorHex="#10b981" subtitle="KPI: >90%" />
            <StatCard title="LỖI/KPH" value={stats.flagged} icon={AlertTriangle} colorHex="#ef4444" subtitle="Đã phát hiện" />
            <StatCard title="CẤP BÁCH" value={stats.highPriority} icon={Flag} colorHex="#f59e0b" subtitle="Ưu tiên xử lý" />
        </div>

        {/* Main Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            {/* Status Pie */}
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col items-center">
               <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 w-full text-center border-b border-slate-50 pb-3">TRẠNG THÁI KIỂM TRA</h3>
               <div className="w-full h-48 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={6}
                        dataKey="value"
                        stroke="none"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '10px', fontWeight: 'bold' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                     <p className="text-2xl font-black text-slate-800 leading-none">{stats.completed + stats.flagged}</p>
                     <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">XONG</p>
                  </div>
               </div>
               <div className="flex gap-4 mt-2 overflow-x-auto no-scrollbar w-full justify-center">
                  {statusData.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 shrink-0">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }}></div>
                          <p className="text-[8px] font-black text-slate-400 uppercase whitespace-nowrap">{entry.name}</p>
                      </div>
                  ))}
               </div>
            </div>

            {/* Top Project Bar */}
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm lg:col-span-2 flex flex-col">
               <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-50 pb-3">HIỆU SUẤT THEO DỰ ÁN (%)</h3>
               <div className="flex-1 min-h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={projectData} layout="vertical" margin={{ left: 0, right: 30 }}>
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={80} 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 9, fontWeight: '900', fill: '#94a3b8'}} 
                      />
                      <Tooltip 
                        cursor={{fill: '#f8fafc'}}
                        contentStyle={{ borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' }}
                      />
                      <Bar dataKey="score" radius={[0, 8, 8, 0]} barSize={12}>
                        {projectData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.score >= 90 ? COLORS.pass : entry.score >= 70 ? COLORS.blue : COLORS.fail} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>
        </div>

        {/* Critical Issues Section */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-red-50/20">
                <h3 className="text-[10px] font-black text-red-600 uppercase tracking-widest flex items-center gap-2">
                    <AlertOctagon className="w-5 h-5" /> PHIẾU CÓ LỖI (FLAGGED)
                </h3>
                <span className="text-[8px] font-black text-red-500 bg-red-100 px-2 py-1 rounded-lg border border-red-200 uppercase tracking-widest">{recentCritical.length} Mới nhất</span>
             </div>
             <div className="divide-y divide-slate-100">
                {recentCritical.length > 0 ? (
                    recentCritical.map((item) => (
                        <div 
                          key={item.id} 
                          onClick={() => onNavigate?.('LIST')}
                          className="p-4 active:bg-slate-50 transition-all flex items-center justify-between group cursor-pointer"
                        >
                            <div className="flex items-center gap-4 flex-1 min-w-0 pr-3">
                                <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex flex-col items-center justify-center font-black shrink-0 shadow-lg shadow-red-200">
                                    <span className="text-base leading-none">{item.score}</span>
                                    <span className="text-[7px] uppercase mt-0.5 opacity-60">PTS</span>
                                </div>
                                <div className="min-w-0 overflow-hidden">
                                    <h4 className="font-black text-slate-800 text-xs truncate uppercase tracking-tight mb-1">{item.ten_hang_muc}</h4>
                                    <div className="flex flex-wrap items-center gap-3 text-[8px] text-slate-400 font-black uppercase tracking-tighter">
                                        <span className="flex items-center gap-1"><Flag className="w-3 h-3 text-red-400"/> {item.ma_ct}</span>
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {item.date}</span>
                                        <span className="flex items-center gap-1 text-blue-500/70"><UserCircle className="w-3 h-3"/> {item.inspectorName}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-300 group-hover:text-blue-600 group-hover:border-blue-100 transition-all active:scale-90">
                                <ArrowRight className="w-4 h-4" />
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="py-16 text-center flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 bg-green-50 text-green-500 rounded-full flex items-center justify-center shadow-inner">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Hệ thống chưa ghi nhận lỗi mới</p>
                    </div>
                )}
             </div>
             <div className="p-4 bg-slate-50 border-t border-slate-100">
                <button onClick={() => onNavigate?.('LIST')} className="w-full py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm active:scale-95 transition-all">Xem tất cả báo cáo</button>
             </div>
        </div>
      </div>
    </div>
  );
};