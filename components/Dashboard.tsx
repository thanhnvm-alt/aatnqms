

import React, { useMemo } from 'react';
import { Inspection, InspectionStatus, Priority, User, ViewState } from '../types';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip
} from 'recharts';
import { 
  ClipboardCheck, AlertTriangle, CheckCircle2, Flag, 
  Activity, Clock, AlertOctagon,
  ArrowRight, ShieldCheck, UserCircle
} from 'lucide-react';

interface DashboardProps {
  inspections: Inspection[];
  user?: User;
  onLogout?: () => void;
  onNavigate?: (view: ViewState) => void;
  onViewInspection?: (id: string) => void;
}

const COLORS = {
  pass: '#10b981',
  fail: '#ef4444',
  pending: '#f59e0b',
  draft: '#94a3b8',
  blue: '#3b82f6',
};

export const Dashboard: React.FC<DashboardProps> = ({ inspections, user, onLogout, onNavigate, onViewInspection }) => {
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
    { name: 'Đạt', value: stats.completed, color: COLORS.pass },
    { name: 'Lỗi', value: stats.flagged, color: COLORS.fail },
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
        {/* Top Stat Grid */}
        <div className="grid grid-cols-2 gap-3">
            <StatCard title="TỔNG PHIẾU" value={stats.total} icon={ClipboardCheck} colorHex="#3b82f6" subtitle={`${stats.drafts} bản nháp`} />
            <StatCard title="TỶ LỆ ĐẠT" value={`${stats.passRate}%`} icon={CheckCircle2} colorHex="#10b981" subtitle="KPI: >90%" />
            <StatCard title="LỖI/KPH" value={stats.flagged} icon={AlertTriangle} colorHex="#ef4444" subtitle="Đã phát hiện" />
            <StatCard title="CẤP BÁCH" value={stats.highPriority} icon={Flag} colorHex="#f59e0b" subtitle="Ưu tiên cao" />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-4">
            {/* Status Pie */}
            <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col items-center">
               <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 w-full text-center border-b border-slate-50 pb-2">PHÂN BỔ TRẠNG THÁI</h3>
               <div className="w-full h-40 relative">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
                     <p className="text-xl font-black text-slate-800 leading-none">{stats.completed + stats.flagged}</p>
                     <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-0.5">HOÀN TẤT</p>
                  </div>
               </div>
               <div className="flex flex-wrap gap-3 mt-2 justify-center">
                  {statusData.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }}></div>
                          <p className="text-[8px] font-black text-slate-400 uppercase whitespace-nowrap">{entry.name}: {entry.value}</p>
                      </div>
                  ))}
               </div>
            </div>

            {/* Top Project Bar */}
            <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col">
               <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2">HIỆU SUẤT THEO DỰ ÁN (%)</h3>
               <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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