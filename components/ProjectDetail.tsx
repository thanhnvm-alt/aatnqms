
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project, Inspection, InspectionStatus, CheckStatus, SmartGoal, FloorPlan, LayoutPin, ModuleId, User } from '../types';
import { 
  ArrowLeft, MapPin, Calendar, User as UserIcon, LayoutGrid, CheckCircle2, 
  AlertTriangle, Clock, PieChart as PieChartIcon, ShieldCheck, 
  Users, Building2, Hash, Edit3, Save, X, Loader2, ExternalLink, 
  Locate, Image as ImageIcon, Camera, Plus, Maximize2,
  TrendingUp, Activity, Filter, Layers, MessageSquare, 
  ChevronRight, AlertCircle, FileSearch, CheckCircle, ArrowRight,
  Target, Zap, CheckSquare, ListChecks, Info, Trash2, FileText
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { updateProject, fetchFloorPlans, saveFloorPlan, deleteFloorPlan, fetchLayoutPins, saveLayoutPin, saveInspectionToSheet, fetchInspectionById } from '../services/apiService';
import { FloorPlanLibrary } from './FloorPlanLibrary';
import { LayoutManager } from './LayoutManager';
import { InspectionFormSITE } from './inspectionformSITE';
import { FloorPlanUploadModal } from './FloorPlanUploadModal';
import { InspectionDetailSITE } from './inspectiondetailSITE';
import { InspectionDetailPQC } from './inspectiondetailPQC';
import { InspectionDetailIQC } from './inspectiondetailIQC';
import { InspectionDetailSQC_VT } from './inspectiondetailSQC_VT';
import { InspectionDetailSQC_BTP } from './inspectiondetailSQC_BTP';
import { InspectionDetailFRS } from './inspectiondetailFRS';
import { InspectionDetailStepVecni } from './inspectiondetailStepVecni';
import { InspectionDetailFQC } from './inspectiondetailFQC';
import { InspectionDetailSPR } from './inspectiondetailSPR';
import { SITE_CHECKLIST_TEMPLATE } from '../constants';

interface ProjectDetailProps {
  project: Project;
  inspections: Inspection[];
  user: User;
  onBack: () => void;
  onUpdate?: () => void; 
  onViewInspection: (id: string) => void;
}

const DETAIL_MAP: Record<string, any> = {
    'SITE': InspectionDetailSITE, 'PQC': InspectionDetailPQC, 'IQC': InspectionDetailIQC,
    'SQC_VT': InspectionDetailSQC_VT, 'SQC_MAT': InspectionDetailSQC_VT, 'SQC_BTP': InspectionDetailSQC_BTP,
    'FSR': InspectionDetailFRS, 'STEP': InspectionDetailStepVecni, 'FQC': InspectionDetailFQC, 'SPR': InspectionDetailSPR
};

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#94a3b8'];

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ project: initialProject, inspections, user, onBack, onUpdate, onViewInspection }) => {
  const [project, setProject] = useState(initialProject);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'LAYOUTS'>('OVERVIEW');
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Project>>({});
  
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<FloorPlan | null>(null);
  const [pins, setPins] = useState<LayoutPin[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isInspectionFormOpen, setIsInspectionFormOpen] = useState(false);
  const [pendingPinCoord, setPendingPinCoord] = useState<{x: number, y: number} | null>(null);

  const [fullDetailId, setFullDetailId] = useState<string | null>(null);
  const [fullDetailData, setFullDetailData] = useState<Inspection | null>(null);
  const [isLoadingFullDetail, setIsLoadingFullDetail] = useState(false);

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

  const handleOpenFullDetail = async (id: string) => {
      setFullDetailId(id);
      setIsLoadingFullDetail(true);
      try {
          const data = await fetchInspectionById(id);
          setFullDetailData(data);
      } catch (e) {
          alert("Lỗi tải chi tiết hồ sơ.");
      } finally {
          setIsLoadingFullDetail(false);
      }
  };

  const handleSaveInspectionFromLayout = async (newInsp: Inspection) => {
      if (!selectedPlan || !pendingPinCoord) return;
      
      setIsSaving(true);
      try {
          const inspectionWithSpatial = {
              ...newInsp,
              floor_plan_id: selectedPlan.id,
              coord_x: pendingPinCoord.x,
              coord_y: pendingPinCoord.y,
              ma_ct: project.ma_ct,
              ten_ct: project.name
          };

          await saveInspectionToSheet(inspectionWithSpatial);
          
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
          
          const updatedPins = await fetchLayoutPins(selectedPlan.id);
          setPins(updatedPins);
          setIsInspectionFormOpen(false);
          setPendingPinCoord(null);
          if (onUpdate) onUpdate();
      } catch (err) {
          alert("Error saving inspection spatial data.");
      } finally {
          setIsSaving(false);
      }
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
      <div className="bg-white border-b border-slate-200 p-3 md:p-4 sticky top-0 z-20 shadow-sm flex items-center justify-between shrink-0">
         <div className="flex items-center gap-2 md:gap-3">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors active:scale-90"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
            <div className="overflow-hidden">
                <h2 className="text-sm md:text-lg font-black text-slate-900 leading-none truncate max-w-[160px] md:max-w-md uppercase tracking-tight">{project.name}</h2>
                <div className="flex items-center gap-1.5 mt-1">
                    <p className="text-[9px] md:text-[10px] text-slate-400 font-mono font-bold tracking-widest">{project.ma_ct}</p>
                    <div className="h-0.5 w-0.5 rounded-full bg-slate-300"></div>
                    <p className="text-[9px] md:text-[10px] text-blue-600 font-bold uppercase tracking-widest truncate">{activeTab === 'OVERVIEW' ? 'Overview' : 'Layouts'}</p>
                </div>
            </div>
         </div>
         <div className="flex items-center gap-1 md:gap-2">
             <div className="flex bg-slate-100 p-0.5 md:p-1 rounded-lg md:rounded-xl border border-slate-200 mr-1 md:mr-2">
                 <button onClick={() => setActiveTab('OVERVIEW')} className={`px-2 md:px-4 py-1.5 rounded-md md:rounded-lg text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'OVERVIEW' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>Stats</button>
                 <button onClick={() => setActiveTab('LAYOUTS')} className={`px-2 md:px-4 py-1.5 rounded-md md:rounded-lg text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LAYOUTS' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>Map</button>
             </div>
             <button onClick={handleEditClick} className="p-2 md:p-2.5 bg-blue-600 text-white rounded-lg md:rounded-2xl shadow-lg border border-blue-500 active:scale-90"><Edit3 className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
         </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
         {activeTab === 'OVERVIEW' ? (
             <div className="h-full overflow-y-auto p-4 md:p-6 no-scrollbar pb-24">
                <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                        <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                            <div className="flex items-center gap-2 mb-2 border-b border-slate-50 pb-3"><Activity className="w-5 h-5 text-blue-600" /><h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">DỰ ÁN CHI TIẾT</h3></div>
                            <div className="space-y-4">
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100"><Hash className="w-5 h-5 text-slate-400" /></div>
                                    <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Mã Dự Án</p><p className="text-xs font-bold text-slate-900 uppercase">{project.ma_ct}</p></div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100"><UserIcon className="w-5 h-5 text-blue-500" /></div>
                                    <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Project Manager</p><p className="text-xs font-bold text-slate-900 uppercase">{project.pm || '---'}</p></div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0 border border-purple-100"><MapPin className="w-5 h-5 text-purple-500" /></div>
                                    <div className="flex-1 min-w-0"><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Vị trí</p><p className="text-xs font-bold text-slate-900 truncate">{project.location || '---'}</p></div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[2rem] border border-slate-200 shadow-sm flex flex-col h-full">
                            <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-3"><Layers className="w-5 h-5 text-indigo-600" /><h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">MÔ TẢ TỔNG QUAN</h3></div>
                            <p className="flex-1 text-xs md:text-sm text-slate-600 leading-relaxed italic whitespace-pre-wrap">{project.description || 'Chưa có mô tả chi tiết cho dự án này.'}</p>
                            <div className="mt-6 pt-4 border-t border-slate-100">
                                <div className="flex justify-between items-center mb-2.5"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-blue-500" /> Tiến độ thi công</span><span className="text-base font-black text-blue-700">{project.progress}%</span></div>
                                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner"><div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-1000" style={{ width: `${project.progress}%` }}></div></div>
                            </div>
                        </div>

                        <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[2rem] border border-slate-200 shadow-sm flex flex-col items-center">
                            <div className="flex items-center gap-2 mb-6 border-b border-slate-50 pb-3 w-full"><PieChartIcon className="w-5 h-5 text-emerald-600" /><h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">CHỈ SỐ CHẤT LƯỢNG</h3></div>
                            <div className="flex flex-col items-center w-full">
                                <div className="w-36 h-36 md:w-40 md:h-40 relative">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                        <PieChart>
                                            <Pie data={pieData} innerRadius={35} outerRadius={55} paddingAngle={5} dataKey="value" stroke="none">
                                                {pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl md:text-2xl font-black text-slate-800">{stats.passRate}%</span><span className="text-[7px] text-slate-400 font-black uppercase mt-0.5">QC PASS</span></div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mt-6 w-full">
                                    <div className="flex items-center gap-2 p-2 bg-green-50 rounded-xl border border-green-100"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div><span className="text-[9px] font-black text-slate-600 uppercase">{stats.completed} ĐẠT</span></div>
                                    <div className="flex items-center gap-2 p-2 bg-red-50 rounded-xl border border-red-100"><div className="w-1.5 h-1.5 rounded-full bg-red-500"></div><span className="text-[9px] font-black text-red-600 uppercase">{stats.flagged} LỖI</span></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl md:rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden mb-6">
                        <div className="p-5 md:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-600 text-white rounded-xl md:rounded-2xl shadow-lg"><Filter className="w-5 h-5" /></div>
                                <div><h3 className="font-black text-slate-900 text-xs md:text-sm uppercase tracking-tight leading-none">Lịch sử đánh giá</h3><p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Audit Log</p></div>
                            </div>
                            <span className="text-[8px] md:text-[10px] font-black bg-blue-600 text-white px-2.5 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl shadow-lg uppercase tracking-widest">{projectInspections.length} Bản ghi</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {projectInspections.length > 0 ? (projectInspections.map(ins => (
                                <div key={ins.id} onClick={() => handleOpenFullDetail(ins.id)} className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer group transition-colors">
                                    <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                                        <div className={`p-2 rounded-lg md:rounded-xl shrink-0 ${ins.status === InspectionStatus.APPROVED ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}><CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" /></div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] md:text-xs font-black text-slate-800 uppercase leading-none mb-1 truncate pr-1">{ins.ten_hang_muc}</p>
                                            <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase truncate">{ins.date} • {ins.inspectorName}</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-slate-300 group-hover:text-blue-500 transition-all shrink-0" />
                                </div>
                            ))) : (<div className="p-20 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">Chưa có dữ liệu kiểm tra.</div>)}
                        </div>
                    </div>
                </div>
             </div>
         ) : (
             <div className="h-full overflow-y-auto p-4 md:p-6 no-scrollbar">
                 <div className="max-w-7xl mx-auto">
                     <FloorPlanLibrary 
                        project={project} 
                        plans={floorPlans} 
                        isLoading={isLoadingPlans}
                        onSelectPlan={handleSelectPlan}
                        onUploadPlan={() => setIsUploadModalOpen(true)}
                        onDeletePlan={async (id) => { if(window.confirm('Xóa layout này?')){ await deleteFloorPlan(id); loadFloorPlans(); } }}
                     />
                 </div>
             </div>
         )}

        {selectedPlan && (
            <LayoutManager 
                floorPlan={selectedPlan}
                pins={pins}
                onBack={() => setSelectedPlan(null)}
                onAddPin={handleAddPin}
                onViewFullDetail={handleOpenFullDetail}
                currentUser={user}
            />
        )}

        {fullDetailId && (
            <div className="absolute inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-bottom duration-300 shadow-2xl">
                {isLoadingFullDetail ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50">
                        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">TRUY XUẤT HỒ SƠ CHI TIẾT...</p>
                    </div>
                ) : fullDetailData ? (
                    (() => {
                        const DetailComponent = DETAIL_MAP[fullDetailData.type || 'PQC'] || InspectionDetailPQC;
                        return (
                            <DetailComponent 
                                inspection={fullDetailData}
                                user={user}
                                onBack={() => { setFullDetailId(null); setFullDetailData(null); }}
                                onEdit={() => { }}
                                onDelete={() => { }}
                                onApprove={async (id: string, sig: string, extra: any) => {
                                    const updated = { ...fullDetailData, ...extra };
                                    if (sig || extra.managerSignature) {
                                        updated.status = InspectionStatus.APPROVED;
                                        updated.managerSignature = sig || extra.managerSignature;
                                        updated.managerName = extra.managerName || user.name;
                                    }
                                    await saveInspectionToSheet(updated);
                                    setFullDetailData(updated);
                                    if (onUpdate) onUpdate();
                                }}
                                onPostComment={async (id: string, cmt: any) => {
                                    const updated = { ...fullDetailData, comments: [...(fullDetailData.comments || []), cmt] };
                                    await saveInspectionToSheet(updated);
                                    setFullDetailData(updated);
                                }}
                            />
                        );
                    })()
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
                        <AlertTriangle className="w-16 h-16 text-red-500 mb-4 opacity-20" />
                        <p className="font-black text-slate-800 uppercase">Lỗi truy xuất</p>
                        <p className="text-[10px] text-slate-500 mt-2 uppercase">Không tìm thấy dữ liệu cho hồ sơ #{fullDetailId}</p>
                        <button onClick={() => setFullDetailId(null)} className="mt-6 px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase">Quay lại</button>
                    </div>
                )}
            </div>
        )}
      </div>

      {isUploadModalOpen && (
          <FloorPlanUploadModal 
              projectId={project.ma_ct}
              onClose={() => setIsUploadModalOpen(false)}
              onSave={async (plan) => {
                  await saveFloorPlan(plan);
                  loadFloorPlans();
              }}
          />
      )}

      {isInspectionFormOpen && pendingPinCoord && (
          <div className="absolute inset-0 z-[200] bg-white flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl">
              <header className="h-14 border-b px-4 flex items-center justify-between bg-slate-900 text-white shrink-0 z-10">
                  <div className="flex items-center gap-3">
                      <button onClick={() => setIsInspectionFormOpen(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all"><ArrowLeft className="w-4 h-4" /></button>
                      <div>
                          <h2 className="text-[9px] font-black uppercase tracking-[0.2em] leading-none">New Site Inspection</h2>
                          <p className="text-[8px] font-bold text-blue-400 uppercase mt-1">Point Sync: {pendingPinCoord.x.toFixed(1)}%, {pendingPinCoord.y.toFixed(1)}%</p>
                      </div>
                  </div>
                  <button onClick={() => setIsInspectionFormOpen(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all"><X className="w-4 h-4" /></button>
              </header>
              <div className="flex-1 overflow-hidden bg-slate-50">
                <InspectionFormSITE 
                    onCancel={() => setIsInspectionFormOpen(false)}
                    onSave={handleSaveInspectionFromLayout}
                    plans={[]} 
                    workshops={[]} 
                    user={user}
                    initialData={{
                        ma_ct: project.ma_ct,
                        ten_ct: project.name,
                        type: 'SITE' as ModuleId,
                        floor_plan_id: selectedPlan?.id,
                        coord_x: pendingPinCoord.x,
                        coord_y: pendingPinCoord.y
                    }}
                    templates={{ 'SITE': SITE_CHECKLIST_TEMPLATE }} 
                />
              </div>
          </div>
      )}

      {isEditing && (
          <div className="fixed inset-0 z-[500] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-2xl rounded-3xl md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in duration-200">
                  <div className="p-5 md:p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg"><Edit3 className="w-5 h-5" /></div>
                          <h3 className="font-black text-slate-900 uppercase tracking-tighter text-sm md:text-lg">Chỉnh sửa hồ sơ dự án</h3>
                      </div>
                      <button onClick={() => setIsEditing(false)} className="p-2 text-slate-400 active:scale-90"><X className="w-6 h-6"/></button>
                  </div>
                  <div className="p-5 md:p-8 space-y-5 md:space-y-6 overflow-y-auto bg-slate-50/30 flex-1 no-scrollbar">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                        <div className="space-y-1.5"><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Tên Dự Án *</label><input value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value.toUpperCase()})} className="w-full px-4 py-3 md:px-5 md:py-3 border border-slate-200 rounded-2xl font-black text-slate-800 outline-none focus:ring-4 focus:ring-blue-100 uppercase text-xs md:text-sm" /></div>
                        <div className="space-y-1.5"><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Tiến độ (%)</label><input type="number" value={editForm.progress || 0} onChange={e => setEditForm({...editForm, progress: parseInt(e.target.value) || 0})} className="w-full px-4 py-3 border border-slate-200 rounded-2xl font-black text-slate-800 outline-none focus:ring-4 focus:ring-blue-100 text-xs md:text-sm" /></div>
                      </div>
                      <div className="space-y-1.5"><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Mô tả dự án</label><textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="w-full px-4 py-3 md:px-5 md:py-4 border border-slate-200 rounded-[1.5rem] md:rounded-[2rem] font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 h-24 md:h-32 resize-none" /></div>
                      <div className="space-y-1.5"><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Vị trí thi công</label><input value={editForm.location || ''} onChange={e => setEditForm({...editForm, location: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-2xl font-bold outline-none text-xs" /></div>
                  </div>
                  <div className="p-5 md:p-8 border-t border-slate-100 bg-white flex flex-col md:flex-row justify-end gap-3 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.04)] z-10">
                      <button onClick={() => setIsEditing(false)} className="order-2 md:order-1 px-8 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-600 transition-colors">Hủy bỏ</button>
                      <button onClick={handleSaveProject} disabled={isSaving} className="order-1 md:order-2 py-3.5 md:px-16 md:py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-500/30 active:scale-[0.98] flex items-center justify-center gap-2">
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          LƯU THÔNG TIN
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
