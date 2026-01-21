
import React, { useState, useEffect, useMemo } from 'react';
import { Supplier, Inspection, User, InspectionStatus } from '../types';
import { fetchSupplierStats, fetchSupplierInspections } from '../services/apiService';
import { 
  ArrowLeft, Building2, Phone, Mail, MapPin, 
  Activity, Star, Clock, FileText, ChevronRight,
  TrendingUp, AlertTriangle, CheckCircle2, ShieldCheck,
  Package, LayoutGrid, BarChart3, ListChecks,
  User as UserIcon
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';

interface SupplierDetailProps {
  supplier: Supplier;
  user: User;
  onBack: () => void;
  onViewInspection: (id: string) => void;
}

export const SupplierDetail: React.FC<SupplierDetailProps> = ({ supplier, user, onBack, onViewInspection }) => {
  const [stats, setStats] = useState(supplier.stats);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [supplier.id]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [sData, iData] = await Promise.all([
        fetchSupplierStats(supplier.name),
        fetchSupplierInspections(supplier.name)
      ]);
      setStats(sData);
      setInspections(iData);
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const uniqueMaterials = useMemo(() => {
      const items = inspections.flatMap(i => i.materials || []);
      return Array.from(new Set(items.map(m => m.name))).filter(Boolean).sort();
  }, [inspections]);

  const historyData = useMemo(() => {
      return inspections.slice(0, 7).reverse().map(i => ({
          date: i.date.split('-').slice(1).join('/'),
          score: i.score || 0
      }));
  }, [inspections]);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-40 shadow-sm flex items-center justify-between">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors active:scale-90 border border-slate-100 shadow-sm"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
          <div className="text-center">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Hồ sơ năng lực Nhà Cung Cấp</h2>
            <p className="text-[10px] text-slate-400 font-mono font-bold tracking-tight">#{supplier.code}</p>
          </div>
          <div className="w-9" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar bg-slate-50 space-y-6">
        <div className="max-w-6xl mx-auto space-y-6 pb-20">
          
          {/* Main Info Card */}
          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none rotate-12 text-6xl font-black uppercase">{supplier.category}</div>
            <div className="flex flex-col md:flex-row gap-8 items-start relative z-10">
              <div className="w-24 h-24 bg-blue-600 text-white rounded-[2rem] flex items-center justify-center shadow-xl shadow-blue-200 shrink-0"><Building2 className="w-12 h-12" /></div>
              <div className="flex-1 space-y-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">{supplier.name}</h1>
                    <span className="px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full text-[9px] font-black uppercase tracking-widest">{supplier.status}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{supplier.category || 'Vendor Profile'}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-slate-500"><MapPin className="w-4 h-4 text-blue-500" /><span className="text-xs font-medium">{supplier.address || '---'}</span></div>
                  <div className="flex items-center gap-2 text-slate-500"><UserIcon className="w-4 h-4 text-blue-500" /><span className="text-xs font-bold uppercase">{supplier.contact_person || '---'}</span></div>
                  <div className="flex items-center gap-2 text-slate-500"><Phone className="w-4 h-4 text-blue-500" /><span className="text-xs font-bold font-mono">{supplier.phone || '---'}</span></div>
                  <div className="flex items-center gap-2 text-slate-500"><Mail className="w-4 h-4 text-blue-500" /><span className="text-xs font-bold">{supplier.email || '---'}</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-500" /> Chỉ số IQC/SQC</h3>
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div className="space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Chấp nhận (Pass)</p><p className="text-3xl font-black text-green-600">{Math.round(stats?.pass_rate || 0)}%</p></div>
                    <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600 border border-green-100"><CheckCircle2 className="w-6 h-6" /></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Sai lỗi (Defect)</p><p className="text-3xl font-black text-red-600">{Math.round(stats?.defect_rate || 0)}%</p></div>
                    <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600 border border-red-100"><AlertTriangle className="w-6 h-6" /></div>
                  </div>
                  <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tổng đơn hàng (POs)</p>
                    <span className="text-xl font-black text-slate-800">{stats?.total_pos || 0}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col h-full">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-4"><Package className="w-5 h-5 text-blue-500" /> Danh mục vật tư</h3>
                <div className="flex-1 overflow-y-auto no-scrollbar max-h-60 space-y-2">
                  {uniqueMaterials.map(m => (
                    <div key={m} className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-black text-slate-600 uppercase tracking-tight">{m}</div>
                  ))}
                  {uniqueMaterials.length === 0 && <p className="text-center text-[10px] text-slate-300 py-10 font-bold uppercase tracking-widest">Chưa có lịch sử vật tư</p>}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-8"><BarChart3 className="w-5 h-5 text-indigo-500" /> Biểu đồ chất lượng theo thời gian (%)</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 'bold', fill: '#94a3b8'}} />
                      <YAxis domain={[0, 100]} hide />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                      <Bar dataKey="score" radius={[8, 8, 8, 8]} barSize={32}>
                        {historyData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.score >= 90 ? '#10b981' : entry.score >= 70 ? '#f59e0b' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><ListChecks className="w-5 h-5 text-indigo-500" /> Nhật ký kiểm tra (PO History)</h3>
                  <span className="text-[10px] font-black bg-blue-600 text-white px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">{inspections.length} Phiếu</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {inspections.map(i => (
                    <div key={i.id} onClick={() => onViewInspection(i.id)} className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer group transition-all">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-xl ${i.status === InspectionStatus.APPROVED ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}><FileText className="w-5 h-5" /></div>
                        <div>
                          <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight mb-0.5">{i.ten_hang_muc}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{i.date} • {i.type} • Score: {i.score}%</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-all" />
                    </div>
                  ))}
                  {inspections.length === 0 && <div className="py-20 text-center text-slate-300 font-bold uppercase tracking-widest text-[10px]">Không có dữ liệu lịch sử</div>}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
