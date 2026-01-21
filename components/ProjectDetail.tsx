
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project, Inspection, InspectionStatus, CheckStatus, SmartGoal, FloorPlan, LayoutPin, ModuleId } from '../types';
import { 
  ArrowLeft, MapPin, Calendar, User, LayoutGrid, CheckCircle2, 
  AlertTriangle, Clock, PieChart as PieChartIcon, ShieldCheck, 
  Users, Building2, Hash, Edit3, Save, X, Loader2, ExternalLink, 
  Locate, Image as ImageIcon, Camera, Plus, Maximize2,
  TrendingUp, Activity, Filter, Layers, MessageSquare, 
  ChevronRight, AlertCircle, FileSearch, CheckCircle, ArrowRight,
  Target, Zap, CheckSquare, ListChecks, Info, Trash2, FileText
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { updateProject, fetchFloorPlans, saveFloorPlan, deleteFloorPlan, fetchLayoutPins, saveLayoutPin, saveInspectionToSheet } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';
import { FloorPlanLibrary } from './FloorPlanLibrary';
import { LayoutManager } from './LayoutManager';
import { InspectionFormSITE } from './inspectionformSITE';

interface ProjectDetailProps {
  project: Project;
  inspections: Inspection[];
  user: User;
  onBack: () => void;
  onUpdate?: () => void; 
  onViewInspection: (id: string) => void;
}

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#94a3b8'];

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ project: initialProject, inspections, user, onBack, onUpdate, onViewInspection }) => {
  const [project, setProject] = useState(initialProject);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'LAYOUTS'>('OVERVIEW');
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Project>>({});
  
  // Floor Plans State
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<FloorPlan | null>(null);
  const [pins, setPins] = useState<LayoutPin[]>([]);
  const [isInspectionFormOpen, setIsInspectionFormOpen] = useState(false);
  const [pendingPinCoord, setPendingPinCoord] = useState<{x: number, y: number} | null>(null);

  useEffect(() => {
      loadFloorPlans();
  }, [project.ma_ct]);

  const loadFloorPlans = async () => {
      setIsLoadingPlans(true);
      try {
          const data = await fetchFloorPlans(project.ma_ct);
          setFloorPlans(data);
      } catch (e) { console.error(e); }
      finally { setIsLoadingPlans(false); }
  };

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

  const handleSelectPlan = async (plan: FloorPlan) => {
      setSelectedPlan(plan);
      const pinData = await fetchLayoutPins(plan.id);
      setPins(pinData);
  };

  const handleAddPin = (x: number, y: number) => {
      setPendingPinCoord({ x, y });
      setIsInspectionFormOpen(true);
  };

  const handleSaveInspectionFromLayout = async (newInsp: Inspection) => {
      if (!selectedPlan || !pendingPinCoord) return;
      
      const inspectionWithSpatial = {
          ...newInsp,
          floor_plan_id: selectedPlan.id,
          coord_x: pendingPinCoord.x,
          coord_y: pendingPinCoord.y,
          ma_ct: project.ma_ct,
          ten_ct: project.name
      };

      await saveInspectionToSheet(inspectionWithSpatial);
      
      // Save the layout pin reference
      const newPin: LayoutPin = {
          id: `pin_${Date.now()}`,
          floor_plan_id: selectedPlan.id,
          inspection_id: inspectionWithSpatial.id,
          x: pendingPinCoord.x,
          y: pendingPinCoord.y,
          label: inspectionWithSpatial.ten_hang_muc,
          status: inspectionWithSpatial.status
      };
      await saveLayoutPin(newPin);
      
      // Refresh pins
      const updatedPins = await fetchLayoutPins(selectedPlan.id);
      setPins(updatedPins);
      setIsInspectionFormOpen(false);
      setPendingPinCoord(null);
  };

  const handleEditClick = () => {
      setEditForm({ ...project });
      setIsEditing(true);
  };

  const handleSaveProject = async () => {
      setIsSaving(true);
      try { 
          const updated: Project = { ...project, ...editForm as any }; 
          await updateProject(updated); 
          setProject(updated); 
          setIsEditing(false); 
          if (onUpdate) onUpdate(); 
      } catch (error) { 
          alert("Lỗi khi lưu thông tin dự án."); 
      } finally { setIsSaving(false); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Inter", sans-serif' }}>
      {/* Header Toolbar */}
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-20 shadow-sm flex items-center justify-between">
         <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2.5 hover:bg-slate-100 rounded-2xl transition-colors active:scale-90"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
            <div className="overflow-hidden">
                <h2 className="text-lg font-black text-slate-900 leading-none truncate max-w-md uppercase tracking-tighter">{project.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] text-slate-400 font-mono font-bold tracking-widest">{project.ma_ct}</p>
                    <div className="h-1 w-1 rounded-full bg-slate-300"></div>
                    <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">{activeTab === 'OVERVIEW' ? 'Project Overview' : 'Layout Manager'}</p>
                </div>
            </div>
         </div>
         <div className="flex items-center gap-2">
             <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 mr-2">
                 <button onClick={() => setActiveTab('OVERVIEW')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'OVERVIEW' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Overview</button>
                 <button onClick={() => setActiveTab('LAYOUTS')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LAYOUTS' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Layouts</button>
             </div>
             <button onClick={handleEditClick} className="p-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-2xl transition-all active:scale-90 shadow-lg shadow-blue-200 border border-blue-500"><Edit3 className="w-4 h-4" /></button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar pb-24">
         {activeTab === 'OVERVIEW' ? (
             <div className="max-w-7xl mx-auto space-y-6">
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
         ) : (
             <div className="max-w-7xl mx-auto">
                 <FloorPlanLibrary 
                    project={project} 
                    plans={floorPlans} 
                    isLoading={isLoadingPlans}
                    onSelectPlan={handleSelectPlan}
                    onUploadPlan={() => {/* Implement Upload Modal */}}
                    onDeletePlan={async (id) => { if(window.confirm('Xóa layout này?')){ await deleteFloorPlan(id); loadFloorPlans(); } }}
                 />
             </div>
         )}
      </div>

      {/* Overlays for spatial features */}
      {selectedPlan && (
          <LayoutManager 
            floorPlan={selectedPlan}
            pins={pins}
            onBack={() => setSelectedPlan(null)}
            onAddPin={handleAddPin}
            onSelectPin={(pin) => pin.inspection_id && onViewInspection(pin.inspection_id)}
          />
      )}

      {isInspectionFormOpen && pendingPinCoord && (
          <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-in slide-in-from-right duration-300">
              <header className="h-16 border-b px-6 flex items-center justify-between bg-slate-900 text-white shrink-0">
                  <div className="flex items-center gap-3">
                      <button onClick={() => setIsInspectionFormOpen(false)} className="p-2 hover:bg-white/10 rounded-xl"><X className="w-5 h-5" /></button>
                      <h2 className="text-sm font-black uppercase tracking-widest">New Site Inspection from Layout</h2>
                  </div>
              </header>
              <div className="flex-1 overflow-hidden">
                <InspectionFormSITE 
                    onCancel={() => setIsInspectionFormOpen(false)}
                    onSave={handleSaveInspectionFromLayout}
                    plans={[]} // Optional plans
                    workshops={[]} // Optional workshops
                    user={user}
                    initialData={{
                        ma_ct: project.ma_ct,
                        ten_ct: project.name,
                        type: 'SITE' as ModuleId,
                        floor_plan_id: selectedPlan?.id,
                        coord_x: pendingPinCoord.x,
                        coord_y: pendingPinCoord.y
                    }}
                />
              </div>
          </div>
      )}

      {/* Edit Project Modal */}
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
                  {/* ... Existing Edit Form Content ... */}
                  <div className="p-8 border-t border-slate-100 bg-white flex flex-col md:flex-row justify-end gap-3 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.04)] z-10">
                      <button onClick={() => setIsEditing(false)} className="order-2 md:order-1 px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-red-600 transition-colors">Hủy bỏ</button>
                      <button onClick={handleSaveProject} disabled={isSaving} className="order-1 md:order-2 px-16 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/30 active:scale-95 flex items-center justify-center gap-3 transition-all">
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
