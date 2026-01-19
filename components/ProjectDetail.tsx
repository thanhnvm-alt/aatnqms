
import React, { useState, useMemo, useRef } from 'react';
import { Project, Inspection, InspectionStatus, CheckStatus, SmartGoal } from '../types';
import { 
  ArrowLeft, MapPin, Calendar, User, LayoutGrid, CheckCircle2, 
  AlertTriangle, Clock, PieChart as PieChartIcon, ShieldCheck, 
  Users, Building2, Hash, Edit3, Save, X, Loader2, ExternalLink, 
  Locate, Image as ImageIcon, Camera, Plus, Maximize2,
  TrendingUp, Activity, Filter, Layers, MessageSquare, 
  ChevronRight, AlertCircle, FileSearch, CheckCircle, ArrowRight,
  Target, Zap, CheckSquare, ListChecks, Info, Trash2
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { updateProject } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';

interface ProjectDetailProps {
  project: Project;
  inspections: Inspection[];
  onBack: () => void;
  onUpdate?: () => void; 
  onViewInspection: (id: string) => void;
}

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#94a3b8'];

const resizeImage = (base64Str: string, maxWidth = 1200): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) { if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; } }
      else { if (height > maxWidth) { width = Math.round((width * maxWidth) / height); height = maxWidth; } }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.fillStyle = 'white'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', 0.7)); }
      else resolve(base64Str);
    };
    img.onerror = () => resolve(base64Str);
  });
};

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ project: initialProject, inspections, onBack, onUpdate, onViewInspection }) => {
  const [project, setProject] = useState(initialProject);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Project>>({});
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  const projectInspections = useMemo(() => {
    const safeInsps = Array.isArray(inspections) ? inspections : [];
    const pMaCt = String(project.ma_ct || '').trim().toLowerCase();
    return safeInsps
      .filter(i => i && String(i.ma_ct || '').trim().toLowerCase() === pMaCt)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inspections, project]);

  const stats = useMemo(() => {
    const total = projectInspections.length;
    const completed = projectInspections.filter(i => i && (i.status === InspectionStatus.COMPLETED || i.status === InspectionStatus.APPROVED)).length;
    const flagged = projectInspections.filter(i => i && i.status === InspectionStatus.FLAGGED).length;
    const drafts = projectInspections.filter(i => i && i.status === InspectionStatus.DRAFT).length;
    return { total, completed, flagged, drafts, passRate: total > 0 ? Math.round((completed / (completed + flagged)) * 100) || 0 : 0 };
  }, [projectInspections]);

  const pieData = [{ name: 'Pass', value: stats.completed }, { name: 'Fail', value: stats.flagged }, { name: 'Draft', value: stats.drafts }].filter(d => d.value > 0);

  const handleEditClick = () => {
      setEditForm({ 
        pm: project.pm || '', 
        pc: project.pc || '', 
        qa: project.qa || '', 
        location: project.location || '', 
        startDate: project.startDate || '', 
        endDate: project.endDate || '', 
        status: project.status || 'In Progress', 
        description: project.description || '', 
        progress: project.progress || 0, 
        images: project.images || [] 
      });
      setIsEditing(true);
  };

  const handleSave = async () => {
      setIsSaving(true);
      try { 
          const updated: Project = { ...project, ...editForm as any }; 
          await updateProject(updated); 
          setProject(updated); 
          setIsEditing(false); 
          if (onUpdate) onUpdate(); 
          alert("Đã lưu thông tin dự án thành công!");
      } catch (error) { 
          alert("Lỗi khi lưu thông tin dự án. Vui lòng kiểm tra kết nối Database."); 
      } finally { 
          setIsSaving(false); 
      }
  };

  const handleGetLocation = () => {
      setIsGettingLocation(true);
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(pos => { setEditForm(prev => ({ ...prev, location: `${pos.coords.latitude}, ${pos.coords.longitude}` })); setIsGettingLocation(false); }, () => { alert("Lỗi định vị. Vui lòng kiểm tra quyền."); setIsGettingLocation(false); });
      }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Inter", sans-serif' }}>
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-20 shadow-sm flex items-center justify-between">
         <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2.5 hover:bg-slate-100 rounded-2xl transition-colors active:scale-90"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
            <div className="overflow-hidden">
                <h2 className="text-lg font-black text-slate-900 leading-none truncate max-w-md uppercase tracking-tighter">{project.name}</h2>
                <p className="text-[10px] text-slate-400 font-mono mt-1 font-bold tracking-widest">{project.ma_ct}</p>
            </div>
         </div>
         <div className="flex items-center gap-2">
             <div className={`px-3 py-1.5 rounded-full text-[10px] font-black border uppercase tracking-widest shadow-sm ${project.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{project.status}</div>
             <button onClick={handleEditClick} className="p-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-2xl transition-all active:scale-90 shadow-lg shadow-blue-200 border border-blue-500"><Edit3 className="w-4 h-4" /></button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar pb-24">
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                 <div className="flex items-center gap-2 mb-2 border-b border-slate-50 pb-3"><Activity className="w-5 h-5 text-blue-600" /><h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">THÔNG TIN CHI TIẾT</h3></div>
                 <div className="space-y-4">
                     <div className="flex gap-4">
                         <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Hash className="w-5 h-5 text-slate-400" /></div>
                         <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Mã Dự Án</p><p className="text-xs font-bold text-slate-900 uppercase">{project.ma_ct}</p></div>
                     </div>
                     <div className="flex gap-4">
                         <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><User className="w-5 h-5 text-blue-500" /></div>
                         <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Project Manager</p><p className="text-xs font-bold text-slate-900 uppercase">{project.pm || '---'}</p></div>
                     </div>
                     <div className="flex gap-4">
                         <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0"><MapPin className="w-5 h-5 text-purple-500" /></div>
                         <div className="flex-1 min-w-0"><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Vị trí</p><p className="text-xs font-bold text-slate-900 truncate">{project.location || '---'}</p></div>
                     </div>
                 </div>
             </div>

             <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col h-full">
                 <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-3"><Layers className="w-5 h-5 text-indigo-600" /><h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">MÔ TẢ TỔNG QUAN</h3></div>
                 <p className="flex-1 text-sm text-slate-600 leading-relaxed italic whitespace-pre-wrap">{project.description || 'Chưa có mô tả chi tiết cho dự án này.'}</p>
                 <div className="mt-6 pt-6 border-t border-slate-100">
                     <div className="flex justify-between items-center mb-3"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-blue-500" /> Tiến độ thi công</span><span className="text-lg font-black text-blue-700">{project.progress}%</span></div>
                     <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-inner"><div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-1000" style={{ width: `${project.progress}%` }}></div></div>
                 </div>
             </div>

             <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col items-center">
                 <div className="flex items-center gap-2 mb-6 border-b border-slate-50 pb-3 w-full"><PieChartIcon className="w-5 h-5 text-emerald-600" /><h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">CHỈ SỐ CHẤT LƯỢNG</h3></div>
                 <div className="flex flex-col items-center w-full">
                     <div className="w-40 h-40 relative">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <PieChart>
                            <Pie data={pieData} innerRadius={45} outerRadius={65} paddingAngle={5} dataKey="value" stroke="none">
                              {pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-black text-slate-800">{stats.passRate}%</span><span className="text-[7px] text-slate-400 font-black uppercase mt-1">QC PASS</span></div>
                     </div>
                     <div className="grid grid-cols-2 gap-4 mt-8 w-full">
                         <div className="flex items-center gap-2 p-2 bg-green-50 rounded-xl border border-green-100"><div className="w-2 h-2 rounded-full bg-green-500"></div><span className="text-[10px] font-black text-slate-600 uppercase">{stats.completed} ĐẠT</span></div>
                         <div className="flex items-center gap-2 p-2 bg-red-50 rounded-xl border border-red-100"><div className="w-2 h-2 rounded-full bg-red-500"></div><span className="text-[10px] font-black text-slate-600 uppercase">{stats.flagged} LỖI</span></div>
                     </div>
                 </div>
             </div>
         </div>

         <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/40"><div className="flex items-center gap-3"><div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg"><Filter className="w-5 h-5" /></div><div><h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">Nhật ký đánh giá (Inspections)</h3><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Lịch sử QC các giai đoạn</p></div></div><span className="text-[10px] font-black bg-blue-600 text-white px-3 py-1.5 rounded-xl shadow-lg uppercase tracking-widest">{projectInspections.length} Bản ghi</span></div>
             <div className="divide-y divide-slate-100">
                 {projectInspections.length > 0 ? (projectInspections.map(ins => (
                    <div key={ins.id} onClick={() => onViewInspection(ins.id)} className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer group transition-colors">
                        <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-xl ${ins.status === InspectionStatus.APPROVED ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}><CheckCircle2 className="w-5 h-5" /></div>
                            <div>
                                <p className="text-xs font-black text-slate-800 uppercase leading-none mb-1">{ins.ten_hang_muc}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">{ins.date} • {ins.inspectorName}</p>
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-all" />
                    </div>
                 ))) : (<div className="p-20 text-center text-slate-400 italic">Chưa có dữ liệu kiểm tra.</div>)}
             </div>
         </div>
      </div>
      {/* ... rest of editing modal code ... */}
      {isEditing && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                      <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg"><Edit3 className="w-6 h-6" /></div>
                          <h3 className="font-black text-slate-900 uppercase tracking-tighter text-lg">Chỉnh sửa hồ sơ dự án</h3>
                      </div>
                      <button onClick={() => setIsEditing(false)} className="p-2 text-slate-400 hover:text-red-500 active:scale-90 transition-all"><X className="w-7 h-7"/></button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-slate-50/30">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Trạng thái vận hành</label>
                              <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value as any})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm uppercase focus:ring-4 focus:ring-blue-100 outline-none transition-all">
                                  <option value="Planning">Planning (Chuẩn bị)</option>
                                  <option value="In Progress">In Progress (Đang chạy)</option>
                                  <option value="On Hold">On Hold (Tạm dừng)</option>
                                  <option value="Completed">Completed (Hoàn tất)</option>
                              </select>
                          </div>
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phần trăm tiến độ (%)</label>
                              <div className="relative">
                                  <input type="number" min="0" max="100" value={editForm.progress} onChange={e => setEditForm({...editForm, progress: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm focus:ring-4 focus:ring-blue-100 outline-none" />
                                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-400">%</span>
                              </div>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Project Manager (PM)</label>
                              <input value={editForm.pm} onChange={e => setEditForm({...editForm, pm: e.target.value.toUpperCase()})} className="w-full px-4 py-3 border border-slate-200 rounded-2xl font-bold text-xs uppercase" placeholder="Tên PM..." />
                          </div>
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Coordinator (PC)</label>
                              <input value={editForm.pc} onChange={e => setEditForm({...editForm, pc: e.target.value.toUpperCase()})} className="w-full px-4 py-3 border border-slate-200 rounded-2xl font-bold text-xs uppercase" placeholder="Tên PC..." />
                          </div>
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">QA/QC Lead</label>
                              <input value={editForm.qa} onChange={e => setEditForm({...editForm, qa: e.target.value.toUpperCase()})} className="w-full px-4 py-3 border border-slate-200 rounded-2xl font-bold text-xs uppercase" placeholder="Tên QA..." />
                          </div>
                      </div>

                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Vị trí GPS / Địa điểm</label>
                          <div className="flex gap-2">
                              <input value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} className="flex-1 px-4 py-3 border border-slate-200 rounded-2xl font-bold text-xs" placeholder="Địa chỉ công trình..." />
                              <button onClick={handleGetLocation} disabled={isGettingLocation} className="p-3 bg-blue-100 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all">{isGettingLocation ? <Loader2 className="w-5 h-5 animate-spin" /> : <Locate className="w-5 h-5" />}</button>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ngày bắt đầu</label>
                              <input type="date" value={editForm.startDate} onChange={e => setEditForm({...editForm, startDate: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-2xl font-bold text-xs" />
                          </div>
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ngày kết thúc (DK)</label>
                              <input type="date" value={editForm.endDate} onChange={e => setEditForm({...editForm, endDate: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-2xl font-bold text-xs" />
                          </div>
                      </div>

                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ghi chú & Mô tả dự án</label>
                          <textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} className="w-full px-5 py-4 border border-slate-200 rounded-[2rem] font-medium text-xs h-32 resize-none focus:ring-4 focus:ring-blue-100 outline-none" placeholder="Thông tin tổng quan về quy mô dự án..." />
                      </div>

                      <div className="space-y-3">
                          <div className="flex justify-between items-center px-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bộ sưu tập ảnh ({editForm.images?.length || 0})</label>
                              <button onClick={() => modalFileInputRef.current?.click()} className="text-[10px] font-black text-blue-600 hover:underline uppercase flex items-center gap-1"><Plus className="w-3 h-3"/> Tải ảnh lên</button>
                          </div>
                          <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                              {editForm.images?.map((img, i) => (
                                  <div key={i} className="relative aspect-square group">
                                      <img src={img} className="w-full h-full object-cover rounded-xl border border-slate-200" />
                                      <button onClick={() => setEditForm({...editForm, images: editForm.images?.filter((_, idx) => idx !== i)})} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-all active:scale-90"><X className="w-3 h-3"/></button>
                                  </div>
                              ))}
                              <button onClick={() => modalFileInputRef.current?.click()} className="aspect-square border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-500 transition-all bg-white"><ImageIcon className="w-6 h-6 mb-1 opacity-40" /></button>
                          </div>
                          <input type="file" ref={modalFileInputRef} className="hidden" multiple accept="image/*" onChange={async (e) => { const files = e.target.files; if (files) { const processed = await Promise.all(Array.from(files).map((f: File) => new Promise<string>((res) => { const r = new FileReader(); r.onload = async () => res(await resizeImage(r.result as string)); r.readAsDataURL(f); }))); setEditForm(prev => ({...prev, images: [...(prev.images || []), ...processed]})); } }} />
                      </div>
                  </div>

                  <div className="p-8 border-t border-slate-100 bg-white flex flex-col md:flex-row justify-end gap-3 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.04)] z-10">
                      <button onClick={() => setIsEditing(false)} className="order-2 md:order-1 px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-red-600 transition-colors">Hủy bỏ</button>
                      <button onClick={handleSave} disabled={isSaving} className="order-1 md:order-2 px-16 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/30 active:scale-95 flex items-center justify-center gap-3 transition-all disabled:opacity-50">
                          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                          Lưu hồ sơ dự án
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
