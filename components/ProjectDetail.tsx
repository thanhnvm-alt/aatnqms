
import React, { useState, useMemo, useRef } from 'react';
import { Project, Inspection, InspectionStatus, CheckStatus, SmartGoal } from '../types';
import { 
  ArrowLeft, MapPin, Calendar, User, LayoutGrid, CheckCircle2, 
  AlertTriangle, Clock, PieChart as PieChartIcon, ShieldCheck, 
  Users, Building2, Hash, Edit3, Save, X, Loader2, ExternalLink, 
  Locate, Image as ImageIcon, Camera, Plus, Maximize2,
  TrendingUp, Activity, Filter, Layers, MessageSquare, 
  // Added Trash2 to lucide-react imports to fix Error on line 295
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
  // Added onViewInspection to fix Error on line 324
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

// Added onViewInspection to destructuring to fix Error on line 324
export const ProjectDetail: React.FC<ProjectDetailProps> = ({ project: initialProject, inspections, onBack, onUpdate, onViewInspection }) => {
  const [project, setProject] = useState(initialProject);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Project>>({});
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // SMART Goal State
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SmartGoal | null>(null);
  const [goalForm, setGoalForm] = useState<Partial<SmartGoal>>({
      title: '', specific: '', measurable: '', achievable: '', relevant: '', timeBound: '', status: 'PENDING'
  });

  const projectInspections = useMemo(() => {
    const safeInsps = Array.isArray(inspections) ? inspections : [];
    const pCode = String(project.code || '').trim().toLowerCase();
    const pMaCt = String(project.ma_ct || '').trim().toLowerCase();
    return safeInsps
      .filter(i => {
          if (!i) return false;
          const iMaCt = String(i.ma_ct || '').trim().toLowerCase();
          const iTenCt = String(i.ten_ct || '').trim().toLowerCase();
          return iMaCt === pMaCt || (pCode && iMaCt.includes(pCode)) || (pCode && iTenCt.includes(pCode));
      })
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
      setEditForm({ pm: project.pm, pc: project.pc, qa: project.qa, location: project.location, startDate: project.startDate, endDate: project.endDate, status: project.status, description: project.description, progress: project.progress, images: project.images || [] });
      setIsEditing(true);
  };

  const handleGetLocation = () => {
      setIsGettingLocation(true);
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(pos => { setEditForm(prev => ({ ...prev, location: `${pos.coords.latitude}, ${pos.coords.longitude}` })); setIsGettingLocation(false); }, () => { alert("Lỗi định vị. Vui lòng kiểm tra quyền."); setIsGettingLocation(false); });
      }
  };

  const handleSave = async () => {
      setIsSaving(true);
      try { 
          const updated: Project = { ...project, ...editForm as any }; 
          await updateProject(updated); 
          setProject(updated); 
          setIsEditing(false); 
          if (onUpdate) onUpdate(); 
      }
      catch (error) { 
          alert("Lỗi khi lưu thông tin dự án."); 
      } finally { 
          setIsSaving(false); 
      }
  };

  // SMART Goal Handlers
  const handleOpenGoalModal = (goal?: SmartGoal) => {
      if (goal) {
          setEditingGoal(goal);
          setGoalForm(goal);
      } else {
          setEditingGoal(null);
          setGoalForm({ title: '', specific: '', measurable: '', achievable: '', relevant: '', timeBound: '', status: 'PENDING' });
      }
      setIsGoalModalOpen(true);
  };

  const handleSaveGoal = async () => {
      if (!goalForm.title) return alert("Vui lòng nhập tên mục tiêu.");
      setIsSaving(true);
      try {
          const goals = [...(project.smartGoals || [])];
          if (editingGoal) {
              const idx = goals.findIndex(g => g.id === editingGoal.id);
              goals[idx] = { ...editingGoal, ...goalForm } as SmartGoal;
          } else {
              goals.push({ ...goalForm, id: `goal_${Date.now()}`, createdAt: Date.now() } as SmartGoal);
          }
          const updatedProject = { ...project, smartGoals: goals };
          await updateProject(updatedProject);
          setProject(updatedProject);
          setIsGoalModalOpen(false);
          if (onUpdate) onUpdate();
      } catch (e) {
          alert("Lỗi khi lưu mục tiêu.");
      } finally {
          setIsSaving(false);
      }
  };

  const handleDeleteGoal = async (id: string) => {
      if (!window.confirm("Xóa mục tiêu này?")) return;
      setIsSaving(true);
      try {
          const goals = (project.smartGoals || []).filter(g => g.id !== id);
          const updatedProject = { ...project, smartGoals: goals };
          await updateProject(updatedProject);
          setProject(updatedProject);
          if (onUpdate) onUpdate();
      } catch (e) {
          alert("Lỗi khi xóa mục tiêu.");
      } finally {
          setIsSaving(false);
      }
  };

  const InfoRow = ({ icon: Icon, label, value, colorClass = "bg-slate-100 text-slate-600", mapsLink = false }: any) => (
      <div className="flex items-start gap-4 p-2 rounded-2xl hover:bg-slate-50 transition-colors">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${colorClass}`}><Icon className="w-5 h-5" /></div>
          <div className="flex-1 overflow-hidden">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
              <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-900 truncate leading-tight uppercase">{value || '---'}</p>
                  {mapsLink && value && <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`, '_blank')} className="text-[10px] font-black text-blue-600 hover:underline flex items-center gap-1 shrink-0"><ExternalLink className="w-3 h-3" /> MAPS</button>}
              </div>
          </div>
      </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-20 shadow-sm flex items-center justify-between">
         <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2.5 hover:bg-slate-100 rounded-2xl transition-colors active:scale-90"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
            <div className="overflow-hidden">
                <h2 className="text-lg md:text-xl font-black text-slate-900 leading-none truncate max-w-[180px] md:max-w-md uppercase tracking-tighter">{project.name}</h2>
                <p className="text-[10px] text-slate-400 font-mono mt-1 font-bold tracking-widest">{project.code}</p>
            </div>
         </div>
         <div className="flex items-center gap-2">
             <div className={`px-3 py-1.5 rounded-full text-[10px] font-black border uppercase tracking-widest shadow-sm ${project.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{project.status}</div>
             <button onClick={handleEditClick} className="p-2.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-2xl transition-all active:scale-90 border border-slate-200 shadow-sm"><Edit3 className="w-4 h-4" /></button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar pb-24">
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             {/* Thẻ Metadata */}
             <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-4">
                 <div className="flex items-center gap-2 mb-2 border-b border-slate-50 pb-3"><Activity className="w-5 h-5 text-blue-600" /><h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">THÔNG TIN DỰ ÁN</h3></div>
                 <div className="space-y-2">
                     <InfoRow icon={Hash} label="Mã Dự Án" value={project.ma_ct} colorClass="bg-slate-100 text-slate-500" />
                     <InfoRow icon={User} label="Project Manager" value={project.pm} colorClass="bg-blue-100 text-blue-600" />
                     <InfoRow icon={Users} label="PC / Phụ trách" value={project.pc} colorClass="bg-indigo-100 text-indigo-600" />
                     <InfoRow icon={ShieldCheck} label="QA / QC Lead" value={project.qa} colorClass="bg-emerald-100 text-emerald-600" />
                     <InfoRow icon={Calendar} label="Thời gian thực hiện" value={`${project.startDate} - ${project.endDate}`} colorClass="bg-orange-100 text-orange-600" />
                     <InfoRow icon={MapPin} label="Vị trí công trình" value={project.location} mapsLink={true} colorClass="bg-purple-100 text-purple-600" />
                 </div>
             </div>

             {/* Thẻ Overview */}
             <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col h-full">
                 <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-3"><Layers className="w-5 h-5 text-indigo-600" /><h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">MÔ TẢ TỔNG QUAN</h3></div>
                 <p className="flex-1 text-sm text-slate-600 leading-relaxed font-medium italic whitespace-pre-wrap px-2">{project.description || 'Chưa có mô tả chi tiết.'}</p>
                 <div className="mt-6 pt-6 border-t border-slate-100">
                     <div className="flex justify-between items-center mb-3"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-blue-500" /> Tiến độ thi công</span><span className="text-lg font-black text-blue-700">{project.progress}%</span></div>
                     <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden shadow-inner border border-slate-200/50"><div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-1000" style={{ width: `${project.progress}%` }}></div></div>
                 </div>
             </div>

             {/* Thẻ Thống kê chất lượng */}
             <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col items-center">
                 <div className="flex items-center gap-2 mb-6 border-b border-slate-50 pb-3 w-full"><PieChartIcon className="w-5 h-5 text-emerald-600" /><h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">BÁO CÁO CHẤT LƯỢNG</h3></div>
                 <div className="flex flex-col items-center w-full">
                     <div className="w-44 h-44 relative">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                          <PieChart>
                            <Pie data={pieData} innerRadius={50} outerRadius={75} paddingAngle={5} dataKey="value" stroke="none">
                              {pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-black text-slate-800 leading-none">{stats.passRate}%</span><span className="text-[8px] text-slate-400 font-black uppercase tracking-widest mt-1">QC PASS</span></div>
                     </div>
                     <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-8 w-full px-4">
                         <div className="flex items-center gap-2.5 p-2 bg-green-50 rounded-xl border border-green-100"><div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-sm"></div><span className="text-[10px] font-black text-slate-600 uppercase">{stats.completed} ĐẠT</span></div>
                         <div className="flex items-center gap-2.5 p-2 bg-red-50 rounded-xl border border-red-100"><div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm"></div><span className="text-[10px] font-black text-slate-600 uppercase">{stats.flagged} LỖI</span></div>
                         <div className="flex items-center gap-2.5 p-2 bg-orange-50 rounded-xl border border-orange-100"><div className="w-2.5 h-2.5 rounded-full bg-orange-400 shadow-sm"></div><span className="text-[10px] font-black text-slate-600 uppercase">{stats.drafts} NHÁP</span></div>
                         <div className="flex items-center gap-2.5 p-2 bg-slate-100 rounded-xl border border-slate-200"><div className="w-2.5 h-2.5 rounded-full bg-slate-400"></div><span className="text-[10px] font-black text-slate-600 uppercase">{stats.total} TỔNG</span></div>
                     </div>
                 </div>
             </div>
         </div>

         {/* SMART Goals Section */}
         <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
             <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                 <div className="flex items-center gap-3">
                     <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100">
                         <Target className="w-6 h-6" />
                     </div>
                     <div>
                         <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Mục tiêu chiến lược SMART</h3>
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">ISO 9001:2015 Clause 6.2 - Quality Objectives</p>
                     </div>
                 </div>
                 <button 
                    onClick={() => handleOpenGoalModal()}
                    className="flex items-center gap-2 bg-blue-50 text-blue-600 px-5 py-2.5 rounded-2xl hover:bg-blue-600 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest border border-blue-100 shadow-sm active:scale-95"
                 >
                     <Plus className="w-4 h-4" /> Thiết lập mục tiêu
                 </button>
             </div>

             {project.smartGoals && project.smartGoals.length > 0 ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                     {project.smartGoals.map((goal) => (
                         <div key={goal.id} className="bg-slate-50/50 rounded-[2rem] border border-slate-100 p-6 space-y-4 hover:shadow-xl transition-all group relative overflow-hidden">
                             <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl text-[8px] font-black uppercase tracking-widest ${
                                 goal.status === 'COMPLETED' ? 'bg-green-50 text-white' : 
                                 goal.status === 'IN_PROGRESS' ? 'bg-blue-50 text-white' : 'bg-slate-200 text-slate-600'
                             }`}>
                                 {goal.status}
                             </div>
                             <h4 className="text-base font-black text-slate-800 uppercase tracking-tight pr-12 line-clamp-2 leading-tight">{goal.title}</h4>
                             
                             <div className="space-y-3 pt-2">
                                 {[
                                     { label: 'S', value: goal.specific, color: 'text-blue-600', full: 'Specific' },
                                     { label: 'M', value: goal.measurable, color: 'text-emerald-600', full: 'Measurable' },
                                     { label: 'T', value: goal.timeBound, color: 'text-orange-600', full: 'Time-bound' }
                                 ].map((item) => (
                                     <div key={item.label} className="flex gap-3">
                                         <div className={`w-6 h-6 rounded-lg bg-white border border-slate-100 shadow-sm flex items-center justify-center font-black text-[10px] ${item.color} shrink-0`}>{item.label}</div>
                                         <p className="text-xs font-bold text-slate-600 line-clamp-2">{item.value}</p>
                                     </div>
                                 ))}
                             </div>

                             <div className="pt-4 mt-2 border-t border-white/60 flex items-center justify-between">
                                 <div className="flex items-center gap-1.5 text-slate-400">
                                     <Clock className="w-3 h-3" />
                                     <span className="text-[10px] font-bold">{new Date(goal.createdAt).toLocaleDateString('vi-VN')}</span>
                                 </div>
                                 <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                     <button onClick={() => handleOpenGoalModal(goal)} className="p-2 bg-white text-blue-600 rounded-xl shadow-sm border border-blue-50 hover:bg-blue-600 hover:text-white transition-all"><Edit3 className="w-3.5 h-3.5" /></button>
                                     <button onClick={() => handleDeleteGoal(goal.id)} className="p-2 bg-white text-red-500 rounded-xl shadow-sm border border-red-50 hover:bg-red-600 hover:text-white transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                 </div>
                             </div>
                         </div>
                     ))}
                 </div>
             ) : (
                 <div className="py-12 flex flex-col items-center justify-center text-slate-300 space-y-4">
                     <Target className="w-16 h-16 opacity-10" />
                     <p className="text-xs font-black uppercase tracking-[0.2em]">Chưa thiết lập mục tiêu SMART cho dự án này</p>
                 </div>
             )}
         </div>

         {/* Gallery Section */}
         <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
             <div className="flex items-center justify-between mb-6 border-b border-slate-50 pb-3"><h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><ImageIcon className="w-4 h-4 text-blue-500" /> BỘ SƯU TẬP DỰ ÁN ({project.images?.length || 0})</h3><button onClick={handleEditClick} className="text-[10px] font-black text-blue-600 bg-blue-50 px-4 py-2 rounded-xl hover:bg-blue-100 transition-all uppercase tracking-widest border border-blue-100">Quản lý Ảnh</button></div>
             {project.images && project.images.length > 0 ? (
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">{project.images.map((img, idx) => (<div key={idx} onClick={() => setLightboxState({ images: project.images || [], index: idx })} className="relative group aspect-square rounded-[1.5rem] overflow-hidden border border-slate-200 shadow-sm bg-slate-50 cursor-zoom-in"><img src={img} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={`G${idx}`} /><div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><div className="p-2 bg-white/20 backdrop-blur-md rounded-full border border-white/20"><Maximize2 className="text-white w-5 h-5" /></div></div></div>))}</div>
             ) : (<div className="p-16 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-[2rem] border-2 border-dashed border-slate-200"><ImageIcon className="w-12 h-12 mb-3 opacity-20" /><p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Album dự án còn trống</p></div>)}
         </div>

         {/* Lịch sử kiểm tra */}
         <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/40"><div className="flex items-center gap-3"><div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100"><Filter className="w-5 h-5" /></div><div><h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">Lịch sử đánh giá chất lượng</h3><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Truy xuất dữ liệu kiểm tra chi tiết</p></div></div><span className="text-[10px] font-black bg-blue-600 text-white px-3 py-1.5 rounded-xl shadow-lg shadow-blue-200 uppercase tracking-widest">{projectInspections.length} Bản ghi</span></div>
             <div className="divide-y divide-slate-100">
                 {projectInspections.length > 0 ? (projectInspections.map(ins => {
                         if (!ins) return null;
                         const ncrCount = (ins.items || []).filter(i => i && i.ncr).length;
                         return (<div key={ins.id} onClick={() => onViewInspection(ins.id)} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50/80 transition-all group relative border-l-4 border-transparent hover:border-blue-500 cursor-pointer"><div className="flex items-start gap-4 flex-1"><div className={`p-3 rounded-2xl shadow-sm border transition-all ${ins.status === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-600 border-red-100' : ins.status === InspectionStatus.APPROVED ? 'bg-green-50 text-green-600 border-green-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{ins.status === InspectionStatus.FLAGGED ? <AlertCircle className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}</div><div className="overflow-hidden space-y-1.5"><div className="flex items-center gap-2"><p className="text-sm font-black text-slate-800 group-hover:text-blue-700 transition-colors uppercase tracking-tight truncate max-w-[200px] md:max-w-md">{ins.ten_hang_muc || 'Mục chưa đặt tên'}</p>{ncrCount > 0 && (<span className="flex items-center gap-1 bg-red-600 text-white px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-sm"><AlertTriangle className="w-2.5 h-2.5" /> NCR {ncrCount}</span>)}</div><div className="text-[10px] text-slate-500 font-bold flex flex-wrap items-center gap-y-2 gap-x-4 uppercase tracking-tighter"><span className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-sm"><Clock className="w-3 h-3 text-blue-500"/> {ins.date}</span><span className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-sm"><User className="w-3 h-3 text-indigo-500"/> {ins.inspectorName}</span></div></div></div><div className="mt-4 sm:mt-0 sm:ml-4 flex items-center justify-between sm:justify-end gap-3 shrink-0"><div className={`px-3 py-1.5 rounded-xl text-[9px] font-black border uppercase tracking-widest shadow-sm ${ins.status === InspectionStatus.APPROVED ? 'bg-blue-600 text-white border-blue-600 shadow-blue-200' : ins.status === InspectionStatus.FLAGGED ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-slate-600 border-slate-200'}`}>{ins.status}</div><div className="p-2.5 bg-white border border-slate-200 text-slate-400 rounded-2xl shadow-sm hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-all active:scale-90 group-hover:translate-x-1"><ArrowRight className="w-5 h-5" /></div></div></div>);
                 })) : (<div className="p-20 text-center flex flex-col items-center justify-center space-y-3 bg-slate-50/50"><div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-200"><FileSearch className="w-8 h-8 text-slate-200" /></div><p className="text-xs font-black text-slate-400 uppercase tracking-widest">Không có dữ liệu kiểm tra</p></div>)}
             </div>
         </div>
      </div>

      {lightboxState && <ImageEditorModal images={lightboxState.images} initialIndex={lightboxState.index} onClose={() => setLightboxState(null)} readOnly={true} />}

      {/* Goal Modal */}
      {isGoalModalOpen && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                      <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg">
                              <Target className="w-6 h-6" />
                          </div>
                          <h3 className="font-black text-slate-900 uppercase tracking-tighter text-base">Thiết lập mục tiêu chất lượng</h3>
                      </div>
                      <button onClick={() => setIsGoalModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 active:scale-90 transition-transform"><X className="w-6 h-6"/></button>
                  </div>
                  <div className="p-8 overflow-y-auto space-y-6 no-scrollbar flex-1 bg-white">
                      <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TÊN MỤC TIÊU (TITLE)</label>
                          <input 
                            value={goalForm.title || ''} 
                            onChange={e => setGoalForm({...goalForm, title: e.target.value})}
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-black text-sm uppercase"
                            placeholder="VD: TỐI ƯU TỶ LỆ PASS QC KHỐI LẮP RÁP..."
                          />
                      </div>

                      <div className="grid grid-cols-1 gap-5">
                          {[
                              { id: 'specific', label: 'Specific (Cụ thể)', color: 'text-blue-600', help: 'Mục tiêu muốn đạt được là gì?' },
                              { id: 'measurable', label: 'Measurable (Đo lường)', color: 'text-emerald-600', help: 'Chỉ số KPI đo lường cụ thể (%, số lượng)?' },
                              { id: 'achievable', label: 'Achievable (Khả thi)', color: 'text-orange-600', help: 'Các bước để đạt được điều này?' },
                              { id: 'relevant', label: 'Relevant (Liên quan)', color: 'text-purple-600', help: 'Mục tiêu này đóng góp gì cho dự án?' },
                              { id: 'timeBound', label: 'Time-bound (Thời hạn)', color: 'text-red-600', help: 'Khi nào mục tiêu này phải hoàn tất?' }
                          ].map((field) => (
                              <div key={field.id} className="space-y-1.5">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                      <span className={`w-4 h-4 rounded-md border border-slate-100 bg-white flex items-center justify-center font-black ${field.color}`}>{field.label.charAt(0)}</span>
                                      {field.label}
                                  </label>
                                  <input 
                                    value={(goalForm as any)[field.id] || ''} 
                                    onChange={e => setGoalForm({...goalForm, [field.id]: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-100 rounded-xl focus:bg-white focus:ring-2 ring-blue-100 outline-none text-[13px] font-bold text-slate-700"
                                    placeholder={field.help}
                                  />
                              </div>
                          ))}
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-50">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TRẠNG THÁI HIỆN TẠI</label>
                          <div className="flex gap-3">
                              {['PENDING', 'IN_PROGRESS', 'COMPLETED'].map(status => (
                                  <button 
                                    key={status}
                                    onClick={() => setGoalForm({...goalForm, status: status as any})}
                                    className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                        goalForm.status === status 
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100' 
                                        : 'bg-white text-slate-400 border-slate-200 hover:border-blue-300'
                                    }`}
                                  >
                                      {status === 'IN_PROGRESS' ? 'Đang chạy' : status === 'COMPLETED' ? 'Đã xong' : 'Chờ thực hiện'}
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>
                  <div className="p-6 border-t border-slate-100 bg-slate-50/30 flex justify-end gap-6 shrink-0">
                      <button onClick={() => setIsGoalModalOpen(false)} className="px-4 py-2 text-slate-800 text-xs font-black uppercase tracking-widest hover:text-red-600 transition-colors">HỦY BỎ</button>
                      <button onClick={handleSaveGoal} disabled={isSaving} className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 flex items-center gap-2 transition-all hover:bg-black disabled:opacity-50">{isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Zap className="w-4 h-4"/>} CẬP NHẬT MỤC TIÊU</button>
                  </div>
              </div>
          </div>
      )}

      {isEditing && (
          <div className="fixed inset-0 z-50 bg-[#0f172a]/60 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 overflow-hidden">
              <div className="bg-white w-full max-w-lg md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-full md:h-auto md:max-h-[90vh] animate-in zoom-in-95 duration-200">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                      <div className="flex items-center gap-3">
                          <Edit3 className="w-5 h-5 text-blue-600" />
                          <h3 className="font-black text-slate-800 uppercase tracking-tighter text-sm">CHỈNH SỬA DỰ ÁN</h3>
                      </div>
                      <button onClick={() => setIsEditing(false)} className="p-2 text-slate-400 hover:text-slate-600 active:scale-90 transition-transform">
                          <X className="w-6 h-6"/>
                      </button>
                  </div>

                  <div className="p-6 overflow-y-auto space-y-6 no-scrollbar flex-1 bg-white">
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TRẠNG THÁI</label>
                              <div className="relative group">
                                  <select 
                                      value={editForm.status} 
                                      onChange={e => setEditForm({...editForm, status: e.target.value as any})} 
                                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black focus:ring-4 focus:ring-blue-100 focus:bg-white outline-none appearance-none transition-all"
                                  >
                                      <option value="Planning">Planning</option>
                                      <option value="In Progress">In Progress</option>
                                      <option value="On Hold">On Hold</option>
                                      <option value="Completed">Completed</option>
                                  </select>
                                  <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
                              </div>
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TIẾN ĐỘ (%)</label>
                              <input 
                                  type="number" min="0" max="100" 
                                  value={editForm.progress} 
                                  onChange={e => setEditForm({...editForm, progress: Number(e.target.value)})} 
                                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black focus:ring-4 focus:ring-blue-100 focus:bg-white outline-none transition-all" 
                              />
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">PROJECT MANAGER</label>
                          <input 
                              type="text" 
                              value={editForm.pm || ''} 
                              onChange={e => setEditForm({...editForm, pm: e.target.value.toUpperCase()})} 
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black focus:ring-4 focus:ring-blue-100 focus:bg-white outline-none transition-all uppercase" 
                              placeholder="NHẬP TÊN PM..." 
                          />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">PC NAME</label>
                              <input type="text" value={editForm.pc || ''} onChange={e => setEditForm({...editForm, pc: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none" />
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">QA NAME</label>
                              <input type="text" value={editForm.qa || ''} onChange={e => setEditForm({...editForm, qa: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none" />
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">VỊ TRÍ CÔNG TRÌNH</label>
                          <div className="flex gap-2">
                              <input type="text" value={editForm.location || ''} onChange={e => setEditForm({...editForm, location: e.target.value})} className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black focus:ring-4 focus:ring-blue-100 focus:bg-white outline-none transition-all" placeholder="Địa chỉ hoặc tọa độ GPS" />
                              <button onClick={handleGetLocation} disabled={isGettingLocation} className="p-3 bg-blue-100 text-blue-600 rounded-2xl active:scale-90 shadow-sm flex items-center justify-center disabled:opacity-50">{isGettingLocation ? <Loader2 className="w-5 h-5 animate-spin"/> : <Locate className="w-5 h-5" />}</button>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">START DATE</label>
                              <div className="relative"><input type="date" value={editForm.startDate} onChange={e => setEditForm({...editForm, startDate: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none" /><Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" /></div>
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">END DATE</label>
                              <div className="relative"><input type="date" value={editForm.endDate} onChange={e => setEditForm({...editForm, endDate: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none" /><Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" /></div>
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MÔ TẢ CHI TIẾT</label>
                          {/* Fixed typo: changed description to editForm to fix Error on line 491 */}
                          <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium h-32 resize-none focus:ring-4 focus:ring-blue-100 outline-none transition-all" placeholder="Ghi chú thêm về dự án..." />
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-50">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">BỘ SƯU TẬP ẢNH ({editForm.images?.length || 0})</label>
                          <div className="grid grid-cols-4 gap-2">
                              {editForm.images?.map((img, i) => (
                                  <div key={i} className="relative aspect-square group">
                                      <img src={img} className="w-full h-full object-cover rounded-xl border border-slate-100 shadow-sm" />
                                      <button onClick={() => setEditForm({...editForm, images: editForm.images?.filter((_, idx) => idx !== i)})} className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 shadow-md opacity-0 group-hover:opacity-100 transition-all"><X className="w-3 h-3" /></button>
                                  </div>
                              ))}
                              <button onClick={() => modalFileInputRef.current?.click()} className="aspect-square border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-all bg-slate-50/50"><Camera className="w-6 h-6 mb-1 opacity-40" /><span className="text-[8px] font-black">TẢI LÊN</span></button>
                          </div>
                      </div>
                      <input type="file" ref={modalFileInputRef} className="hidden" multiple accept="image/*" onChange={async (e) => { const files = e.target.files; if (files) { const processed = await Promise.all(Array.from(files).map((f: File) => new Promise<string>((res) => { const r = new FileReader(); r.onload = async () => res(await resizeImage(r.result as string)); r.readAsDataURL(f); }))); setEditForm(prev => ({...prev, images: [...(prev.images || []), ...processed]})); } }} />
                  </div>

                  <div className="p-5 border-t border-slate-100 bg-slate-50/30 flex justify-end gap-6 shrink-0">
                      <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-800 text-xs font-black uppercase tracking-widest hover:text-red-600 transition-colors">HỦY BỎ</button>
                      <button onClick={handleSave} disabled={isSaving} className="px-8 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-500/30 active:scale-95 flex items-center gap-2 transition-all hover:bg-blue-700 disabled:opacity-50">{isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} LƯU THAY ĐỔI</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
