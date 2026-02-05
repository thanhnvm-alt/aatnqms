
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project, Inspection, InspectionStatus, CheckStatus, FloorPlan, LayoutPin, ModuleId, User, ViewState, PlanItem } from '../types';
import { 
  ArrowLeft, MapPin, Calendar, User as UserIcon, CheckCircle2, 
  AlertTriangle, PieChart as PieChartIcon, 
  Building2, Hash, Edit3, Save, X, Loader2,
  Activity, Layers, 
  ChevronRight, AlertCircle, FileText,
  ClipboardList, AlertOctagon, Search, ChevronDown, Plus,
  UserCheck, Users, Camera, Image as ImageIcon, Sparkles,
  ShieldCheck, Clock, Locate, Map as MapIcon, ChevronDown as ChevronDownIcon
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { updateProject, fetchFloorPlans, saveFloorPlan, deleteFloorPlan, fetchLayoutPins, saveLayoutPin, saveInspectionToSheet, fetchInspectionById, fetchPlansByProject } from '../services/apiService';
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
  plans?: PlanItem[];
  user: User;
  onBack: () => void;
  onUpdate?: () => void; 
  onViewInspection: (id: string) => void;
  onNavigate?: (view: ViewState) => void;
}

const DETAIL_MAP: Record<string, any> = {
    'SITE': InspectionDetailSITE, 'PQC': InspectionDetailPQC, 'IQC': InspectionDetailIQC,
    'SQC_VT': InspectionDetailSQC_VT, 'SQC_MAT': InspectionDetailSQC_VT, 'SQC_BTP': InspectionDetailSQC_BTP,
    'FSR': InspectionDetailFRS, 'STEP': InspectionDetailStepVecni, 'FQC': InspectionDetailFQC, 'SPR': InspectionDetailSPR
};

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#94a3b8'];

const resizeImage = (base64Str: string, maxWidth = 800): Promise<string> => {
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

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ 
    project: initialProject, 
    inspections, 
    user, 
    onBack, 
    onUpdate, 
    onViewInspection,
    onNavigate 
}) => {
  const [project, setProject] = useState(initialProject);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'LAYOUTS'>('OVERVIEW');
  const [searchInList, setSearchInList] = useState('');
  
  const [projectSpecificPlans, setProjectSpecificPlans] = useState<PlanItem[]>([]);
  const [isPlansLoading, setIsPlansLoading] = useState(false);

  // Pagination states for UI
  const [plansLimit, setPlansLimit] = useState(10);
  const [inspectionsLimit, setInspectionsLimit] = useState(10);
  const [ncrLimit, setNcrLimit] = useState(10);
  const [layoutLimit, setLayoutLimit] = useState(10);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
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

  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      loadFloorPlans();
      loadProjectPlans(plansLimit);
  }, [project.ma_ct, plansLimit]);

  const loadFloorPlans = async () => {
      setIsLoadingPlans(true);
      try {
          const data = await fetchFloorPlans(project.ma_ct);
          setFloorPlans(data);
      } catch (e) { console.error(e); }
      finally { setIsLoadingPlans(false); }
  };

  const loadProjectPlans = async (limit: number) => {
    setIsPlansLoading(true);
    try {
        // Fetch with specific limit to optimize mobile performance
        const data = await fetchPlansByProject(project.ma_ct, limit === Infinity ? undefined : limit);
        setProjectSpecificPlans(data);
    } catch (e) {
        console.error("Failed to fetch project plans:", e);
    } finally {
        setIsPlansLoading(false);
    }
  };

  const filteredInspections = useMemo(() => {
    const pMaCt = String(project.ma_ct || '').trim().toLowerCase();
    const pName = String(project.name || '').trim().toLowerCase();
    const term = searchInList.toLowerCase().trim();

    return inspections.filter(i => {
        if (!i) return false;
        const matchesProject = String(i.ma_ct || '').toLowerCase() === pMaCt || String(i.ten_ct || '').toLowerCase() === pName;
        const matchesSearch = !term || (i.ten_hang_muc || '').toLowerCase().includes(term);
        return matchesProject && matchesSearch;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inspections, project, searchInList]);

  const projectNcrs = useMemo(() => {
      return filteredInspections.filter(i => i.status === InspectionStatus.FLAGGED);
  }, [filteredInspections]);

  const filteredLayouts = useMemo(() => {
    const term = searchInList.toLowerCase().trim();
    return floorPlans.filter(fp => !term || fp.name.toLowerCase().includes(term));
  }, [floorPlans, searchInList]);

  const stats = useMemo(() => {
    const total = filteredInspections.length;
    const completed = filteredInspections.filter(i => i && (i.status === InspectionStatus.COMPLETED || i.status === InspectionStatus.APPROVED)).length;
    const flagged = filteredInspections.filter(i => i && i.status === InspectionStatus.FLAGGED).length;
    const drafts = filteredInspections.filter(i => i && i.status === InspectionStatus.DRAFT).length;
    return { 
        total, 
        completed, 
        flagged, 
        drafts, 
        passRate: total > 0 ? Math.round((completed / (completed + flagged)) * 100) || 0 : 0 
    };
  }, [filteredInspections]);

  const pieData = [{ name: 'Đạt', value: stats.completed }, { name: 'Lỗi', value: stats.flagged }, { name: 'Nháp', value: stats.drafts }].filter(d => d.value > 0);

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
          const inspectionWithSpatial = { ...newInsp, floor_plan_id: selectedPlan.id, coord_x: pendingPinCoord.x, coord_y: pendingPinCoord.y, ma_ct: project.ma_ct, ten_ct: project.name };
          await saveInspectionToSheet(inspectionWithSpatial);
          const newPin: LayoutPin = { id: `pin_${Date.now()}`, floor_plan_id: selectedPlan.id, inspection_id: inspectionWithSpatial.id, x: pendingPinCoord.x, y: pendingPinCoord.y, label: inspectionWithSpatial.ten_hang_muc, status: inspectionWithSpatial.status };
          await saveLayoutPin(newPin);
          const updatedPins = await fetchLayoutPins(selectedPlan.id);
          setPins(updatedPins);
          setIsInspectionFormOpen(false);
          setPendingPinCoord(null);
          if (onUpdate) onUpdate();
      } catch (err) { alert("Error saving inspection spatial data."); } finally { setIsSaving(false); }
  };

  const handleSaveProject = async () => {
      setIsSaving(true);
      try { 
          const updated: Project = { ...project, ...editForm as any }; 
          await updateProject(updated); 
          setProject(updated); 
          setIsEditing(false); 
          if (onUpdate) onUpdate(); 
      } catch (error) { alert("Lỗi khi lưu thông tin dự án."); } finally { setIsSaving(false); }
  };

  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
          const resized = await resizeImage(reader.result as string);
          setEditForm(prev => ({ ...prev, thumbnail: resized }));
      };
      reader.readAsDataURL(file);
  };

  const handleGetLocation = () => {
    setIsGettingLocation(true);
    if (!navigator.geolocation) {
      alert("Trình duyệt của bạn không hỗ trợ định vị GPS.");
      setIsGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
        setEditForm(prev => ({ ...prev, location: loc }));
        setIsGettingLocation(false);
      },
      (err) => {
        let msg = "Không thể lấy vị trí hiện tại.";
        switch(err.code) {
          case err.PERMISSION_DENIED:
            msg = "Quyền truy cập vị trí bị từ chối. Vui lòng kiểm tra cài đặt trình duyệt (Cho phép định vị).";
            break;
          case err.POSITION_UNAVAILABLE:
            msg = "Thông tin vị trí không khả dụng (Vui lòng bật GPS trên thiết bị).";
            break;
          case err.TIMEOUT:
            msg = "Hết thời gian yêu cầu vị trí GPS.";
            break;
        }
        alert(msg);
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleOpenInMaps = () => {
      const loc = editForm.location || project.location;
      if (!loc) return;
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`, '_blank');
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Inter", sans-serif' }}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-3 md:p-4 sticky top-0 z-20 shadow-sm flex items-center justify-between shrink-0">
         <div className="flex items-center gap-2 md:gap-3">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors active:scale-90"><ArrowLeft className="w-4 h-4 text-slate-600" /></button>
            <div className="overflow-hidden">
                <h2 className="text-sm md:text-lg font-black text-slate-900 leading-none truncate max-w-[160px] md:max-w-md uppercase tracking-tight">{project.name}</h2>
                <div className="flex items-center gap-1.5 mt-1">
                    <p className="text-[9px] md:text-[10px] text-slate-400 font-mono font-bold tracking-widest">{project.ma_ct}</p>
                    <div className="h-0.5 w-0.5 rounded-full bg-slate-300"></div>
                    <p className="text-[9px] md:text-[10px] text-blue-600 font-bold uppercase tracking-widest truncate">{activeTab === 'OVERVIEW' ? 'Project Repository' : 'Technical Map'}</p>
                </div>
            </div>
         </div>
         <div className="flex items-center gap-1 md:gap-2">
             <div className="relative hidden md:block">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                 <input 
                    type="text" value={searchInList} onChange={e => setSearchInList(e.target.value)} 
                    placeholder="Tìm nhanh hạng mục..." 
                    className="pl-9 pr-4 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:ring-4 ring-blue-100 outline-none w-48 transition-all"
                 />
             </div>
             <div className="flex bg-slate-100 p-0.5 md:p-1 rounded-lg md:rounded-xl border border-slate-200 mr-1 md:mr-2">
                 <button onClick={() => setActiveTab('OVERVIEW')} className={`px-2 md:px-4 py-1.5 rounded-md md:rounded-lg text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'OVERVIEW' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>Overview</button>
                 <button onClick={() => setActiveTab('LAYOUTS')} className={`px-2 md:px-4 py-1.5 rounded-md md:rounded-lg text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LAYOUTS' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>Map</button>
             </div>
             <button onClick={() => { setEditForm({ ...project }); setIsEditing(true); }} className="p-2 md:p-2.5 bg-blue-600 text-white rounded-lg md:rounded-2xl shadow-lg border border-blue-500 active:scale-90"><Edit3 className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
         </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
         {activeTab === 'OVERVIEW' ? (
             <div className="h-full overflow-y-auto p-4 md:p-6 no-scrollbar pb-24 bg-[#f8fafc]">
                <div className="max-w-[100rem] mx-auto space-y-6">
                    
                    {/* --- TOP STATISTICS CARDS --- */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* 1. THÔNG TIN CHI TIẾT */}
                        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col h-full min-h-[400px]">
                            <div className="flex items-center gap-3 mb-6">
                                <Activity className="w-5 h-5 text-blue-600" />
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">THÔNG TIN CHI TIẾT</h3>
                            </div>
                            <div className="space-y-4 flex-1">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100 text-blue-600 shrink-0">
                                        <Hash className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">MÃ DỰ ÁN</p>
                                        <p className="text-xs font-black text-slate-800 uppercase">{project.ma_ct}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100 text-blue-600 shrink-0">
                                        <UserCheck className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">PROJECT MANAGER</p>
                                        <p className="text-xs font-black text-slate-800 uppercase">{project.pm || 'CHƯA PHÂN CÔNG'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100 text-indigo-600 shrink-0">
                                        <Users className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">COORDINATOR (PC)</p>
                                        <p className="text-xs font-black text-slate-800 uppercase">{project.pc || 'CHƯA PHÂN CÔNG'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100 text-emerald-600 shrink-0">
                                        <ShieldCheck className="w-5 h-5 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">QA/QC MANAGER</p>
                                        <p className="text-xs font-black text-slate-800 uppercase">{project.qa || 'CHƯA PHÂN CÔNG'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center border border-purple-100 text-purple-600 shrink-0">
                                        <MapPin className="w-5 h-5 text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">VỊ TRÍ</p>
                                        <p className="text-xs font-black text-slate-800 uppercase line-clamp-1">{project.location || '---'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-100 text-amber-600 shrink-0">
                                        <Calendar className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">THỜI GIAN</p>
                                        <p className="text-xs font-black text-slate-800 uppercase">{project.startDate || '--'} • {project.endDate || '--'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. MÔ TẢ TỔNG QUAN */}
                        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col h-full min-h-[400px]">
                            <div className="flex items-center gap-3 mb-6">
                                <Layers className="w-5 h-5 text-indigo-600" />
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">MÔ TẢ TỔNG QUAN</h3>
                            </div>
                            <div className="flex-1">
                                <p className="text-sm text-slate-600 italic leading-relaxed line-clamp-[10]">
                                    {project.description || 'Chưa có mô tả chi tiết cho dự án này.'}
                                </p>
                            </div>
                            <div className="mt-6 pt-6 border-t border-slate-50">
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-blue-500" /> TIẾN ĐỘ THI CÔNG</span>
                                    <span className="text-xl font-black text-blue-700">{project.progress}%</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200 shadow-inner">
                                    <div className="bg-blue-600 h-full rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(37,99,235,0.4)]" style={{ width: `${project.progress}%` }}></div>
                                </div>
                            </div>
                        </div>

                        {/* 3. CHỈ SỐ CHẤT LƯỢNG */}
                        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col items-center h-full min-h-[400px]">
                            <div className="w-full flex items-center gap-3 mb-2 text-left">
                                <PieChartIcon className="w-5 h-5 text-emerald-600" />
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">CHỈ SỐ CHẤT LƯỢNG</h3>
                            </div>
                            <div className="flex-1 flex flex-col items-center justify-center w-full">
                                <div className="relative w-36 h-36">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={pieData.length > 0 ? pieData : [{name: 'Empty', value: 1}]} innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value" stroke="none">
                                                {pieData.length > 0 ? pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                )) : <Cell fill="#f1f5f9" />}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-2xl font-black text-slate-800">{stats.passRate}%</span>
                                        <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-0.5">QC PASS</span>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-6 w-full">
                                <div className="flex items-center justify-center gap-2 py-3 bg-green-50 rounded-2xl border border-green-100">
                                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                    <span className="text-[10px] font-black text-green-700 uppercase">{stats.completed} ĐẠT</span>
                                </div>
                                <div className="flex items-center justify-center gap-2 py-3 bg-red-50 rounded-2xl border border-red-100">
                                    <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_5px_red]"></div>
                                    <span className="text-[10px] font-black text-red-700 uppercase">{stats.flagged} LỖI</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* --- 4-COLUMN DATA REPOSITORY --- */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 min-h-[600px]">
                        
                        {/* 1. PLANS COLUMN */}
                        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm flex flex-col overflow-hidden max-h-[700px]">
                            <div className="p-5 border-b border-slate-100 bg-blue-50/30 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md"><ClipboardList className="w-4 h-4" /></div>
                                    <span className="font-black text-[11px] uppercase tracking-wider text-blue-900">Kế hoạch sản xuất</span>
                                </div>
                                <span className="bg-white text-blue-600 px-2 py-1 rounded-lg border border-blue-100 text-[10px] font-black">{projectSpecificPlans.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
                                {isPlansLoading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-200"/></div> : 
                                 projectSpecificPlans.length > 0 ? (
                                    <>
                                        {projectSpecificPlans.slice(0, plansLimit).map((p, i) => (
                                            <div key={i} className="p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all group">
                                                <h4 className="text-[11px] font-black text-slate-800 uppercase line-clamp-2 leading-snug mb-2 group-hover:text-blue-700">{p.ten_hang_muc}</h4>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{p.ma_nha_may || 'N/A'}</span>
                                                    <span className="text-[9px] font-black text-blue-600 uppercase">{p.so_luong_ipo} {p.dvt}</span>
                                                </div>
                                            </div>
                                        ))}
                                        {projectSpecificPlans.length > plansLimit && (
                                            <button 
                                                onClick={() => setPlansLimit(Infinity)}
                                                className="w-full py-3 mt-2 bg-blue-50 text-blue-600 font-black text-[9px] uppercase tracking-widest rounded-xl border border-blue-100 hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
                                            >
                                                <ChevronDownIcon className="w-3 h-3" /> HIỂN THỊ TẤT CẢ ({projectSpecificPlans.length})
                                            </button>
                                        )}
                                    </>
                                ) : <div className="py-20 text-center text-[9px] font-black text-slate-300 uppercase italic tracking-widest">Trống</div>}
                            </div>
                        </div>

                        {/* 2. INSPECTIONS COLUMN */}
                        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm flex flex-col overflow-hidden max-h-[700px]">
                            <div className="p-5 border-b border-slate-100 bg-indigo-50/30 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-md"><FileText className="w-4 h-4" /></div>
                                    <span className="font-black text-[11px] uppercase tracking-wider text-indigo-900">Phiếu kiểm tra QC</span>
                                </div>
                                <span className="bg-white text-indigo-600 px-2 py-1 rounded-lg border border-indigo-100 text-[10px] font-black">{filteredInspections.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
                                {filteredInspections.length > 0 ? (
                                    <>
                                        {filteredInspections.slice(0, inspectionsLimit).map(ins => (
                                            <div key={ins.id} onClick={() => handleOpenFullDetail(ins.id)} className="p-4 bg-white border border-slate-100 rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group flex items-start gap-3">
                                                <div className={`p-2 rounded-xl shrink-0 ${ins.status === InspectionStatus.APPROVED ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}><CheckCircle2 className="w-4 h-4"/></div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-[11px] font-black text-slate-800 uppercase truncate leading-none mb-1.5">{ins.ten_hang_muc}</h4>
                                                    <div className="flex justify-between items-center"><p className="text-[8px] font-bold text-slate-400 uppercase">{ins.date}</p><span className="text-[10px] font-black text-slate-900">{ins.score}%</span></div>
                                                </div>
                                            </div>
                                        ))}
                                        {filteredInspections.length > inspectionsLimit && (
                                            <button 
                                                onClick={() => setInspectionsLimit(Infinity)}
                                                className="w-full py-3 mt-2 bg-indigo-50 text-indigo-600 font-black text-[9px] uppercase tracking-widest rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                                            >
                                                <ChevronDownIcon className="w-3 h-3" /> HIỂN THỊ TẤT CẢ ({filteredInspections.length})
                                            </button>
                                        )}
                                    </>
                                ) : <div className="py-20 text-center text-[9px] font-black text-slate-300 uppercase italic tracking-widest">Trống</div>}
                            </div>
                        </div>

                        {/* 3. NCR COLUMN */}
                        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm flex flex-col overflow-hidden max-h-[700px]">
                            <div className="p-5 border-b border-slate-100 bg-red-50/30 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-600 text-white rounded-xl shadow-md"><AlertOctagon className="w-4 h-4" /></div>
                                    <span className="font-black text-[11px] uppercase tracking-wider text-red-900">Danh sách lỗi NCR</span>
                                </div>
                                <span className="bg-white text-red-600 px-2 py-1 rounded-lg border border-red-100 text-[10px] font-black">{projectNcrs.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
                                {projectNcrs.length > 0 ? (
                                    <>
                                        {projectNcrs.slice(0, ncrLimit).map(ncr => (
                                            <div key={ncr.id} onClick={() => handleOpenFullDetail(ncr.id)} className="p-4 bg-white border border-red-100 rounded-2xl hover:shadow-md transition-all cursor-pointer group space-y-2">
                                                <div className="flex justify-between items-center"><span className="text-[8px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full uppercase">DEFECT</span><span className="text-[9px] font-mono font-bold text-slate-400">#{ncr.id.split('-').pop()}</span></div>
                                                <h4 className="text-[11px] font-black text-slate-800 uppercase line-clamp-2 leading-tight italic">"{ncr.ten_hang_muc}"</h4>
                                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Reported by: {ncr.inspectorName}</p>
                                            </div>
                                        ))}
                                        {projectNcrs.length > ncrLimit && (
                                            <button 
                                                onClick={() => setNcrLimit(Infinity)}
                                                className="w-full py-3 mt-2 bg-red-50 text-red-600 font-black text-[9px] uppercase tracking-widest rounded-xl border border-red-100 hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                                            >
                                                <ChevronDownIcon className="w-3 h-3" /> HIỂN THỊ TẤT CẢ ({projectNcrs.length})
                                            </button>
                                        )}
                                    </>
                                ) : <div className="py-20 text-center text-[9px] font-black text-slate-300 uppercase italic tracking-widest">Trống</div>}
                            </div>
                        </div>

                        {/* 4. LAYOUTS COLUMN */}
                        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm flex flex-col overflow-hidden max-h-[700px]">
                            <div className="p-5 border-b border-slate-100 bg-emerald-50/30 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-md"><Layers className="w-4 h-4" /></div>
                                    <span className="font-black text-[11px] uppercase tracking-wider text-emerald-900">Bản vẽ kỹ thuật</span>
                                </div>
                                <button onClick={() => setIsUploadModalOpen(true)} className="p-1 bg-white text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all"><Plus className="w-4 h-4"/></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
                                {filteredLayouts.length > 0 ? (
                                    <>
                                        {filteredLayouts.slice(0, layoutLimit).map(fp => (
                                            <div key={fp.id} onClick={() => handleSelectPlan(fp)} className="p-3 bg-white border border-slate-100 rounded-2xl hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-100 shrink-0 shadow-sm"><img src={fp.image_url} className="w-full h-full object-cover" alt=""/></div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-[11px] font-black text-slate-800 uppercase truncate leading-none mb-1.5">{fp.name}</h4>
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase">REV {fp.version} • {fp.status}</p>
                                                </div>
                                            </div>
                                        ))}
                                        {filteredLayouts.length > layoutLimit && (
                                            <button 
                                                onClick={() => setLayoutLimit(Infinity)}
                                                className="w-full py-3 mt-2 bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-widest rounded-xl border border-emerald-100 hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
                                            >
                                                <ChevronDownIcon className="w-3 h-3" /> HIỂN THỊ TẤT CẢ ({filteredLayouts.length})
                                            </button>
                                        )}
                                    </>
                                ) : <div className="py-20 text-center text-[9px] font-black text-slate-300 uppercase italic tracking-widest">Trống</div>}
                            </div>
                        </div>
                    </div>
                </div>
             </div>
         ) : (
             <div className="h-full overflow-y-auto p-4 md:p-6 no-scrollbar bg-[#f8fafc]">
                 <div className="max-w-7xl mx-auto">
                     <FloorPlanLibrary project={project} plans={floorPlans} isLoading={isLoadingPlans} onSelectPlan={handleSelectPlan} onUploadPlan={() => setIsUploadModalOpen(true)} onDeletePlan={async (id) => { if(window.confirm('Hành động này sẽ xóa vĩnh viễn layout. Xác nhận?')){ await deleteFloorPlan(id); loadFloorPlans(); } }} />
                 </div>
             </div>
         )}
      </div>

      {/* --- OVERLAYS --- */}
      {selectedPlan && (
          <div className="absolute inset-0 z-[140] bg-white flex flex-col animate-in fade-in duration-300">
            <LayoutManager floorPlan={selectedPlan} pins={pins} onBack={() => setSelectedPlan(null)} onAddPin={handleAddPin} onViewFullDetail={handleOpenFullDetail} currentUser={user} />
          </div>
      )}

      {fullDetailId && (
          <div className="absolute inset-0 z-[150] bg-white flex flex-col animate-in slide-in-from-bottom duration-300 shadow-2xl">
              {isLoadingFullDetail ? <div className="flex-1 flex flex-col items-center justify-center bg-slate-50"><Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4"/><p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em]">SYNCHRONIZING RECORD DATA...</p></div> : fullDetailData ? (() => { const DetailComponent = DETAIL_MAP[fullDetailData.type || 'PQC'] || InspectionDetailPQC; return <DetailComponent inspection={fullDetailData} user={user} onBack={() => { setFullDetailId(null); setFullDetailData(null); }} onEdit={() => { }} onDelete={() => { }} onApprove={async (id: string, sig: string, extra: any) => { const updated = { ...fullDetailData, ...extra }; if (sig || extra.managerSignature) { updated.status = InspectionStatus.APPROVED; updated.managerSignature = sig || extra.managerSignature; updated.managerName = extra.managerName || user.name; } await saveInspectionToSheet(updated); setFullDetailData(updated); if (onUpdate) onUpdate(); }} onPostComment={async (id: string, cmt: any) => { const updated = { ...fullDetailData, comments: [...(fullDetailData.comments || []), cmt] }; await saveInspectionToSheet(updated); setFullDetailData(updated); }} />; })() : null}
          </div>
      )}

      {isUploadModalOpen && <FloorPlanUploadModal projectId={project.ma_ct} onClose={() => setIsUploadModalOpen(false)} onSave={async (plan) => { await saveFloorPlan(plan); loadFloorPlans(); }} />}

      {isInspectionFormOpen && pendingPinCoord && (
          <div className="absolute inset-0 z-[200] bg-white flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl">
              <header className="h-14 border-b px-4 flex items-center justify-between bg-slate-900 text-white shrink-0 z-10"><div className="flex items-center gap-3"><button onClick={() => setIsInspectionFormOpen(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all"><ArrowLeft className="w-4 h-4" /></button><div><h2 className="text-[9px] font-black uppercase tracking-[0.2em] leading-none">New Site Inspection</h2><p className="text-[8px] font-bold text-blue-400 uppercase mt-1">Point Sync: {pendingPinCoord.x.toFixed(1)}%, {pendingPinCoord.y.toFixed(1)}%</p></div></div><button onClick={() => setIsInspectionFormOpen(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all"><X className="w-4 h-4" /></button></header>
              <div className="flex-1 overflow-hidden bg-slate-50"><InspectionFormSITE onCancel={() => setIsInspectionFormOpen(false)} onSave={handleSaveInspectionFromLayout} plans={[]} workshops={[]} user={user} initialData={{ ma_ct: project.ma_ct, ten_ct: project.name, type: 'SITE' as ModuleId, floor_plan_id: selectedPlan?.id, coord_x: pendingPinCoord.x, coord_y: pendingPinCoord.y }} templates={{ 'SITE': SITE_CHECKLIST_TEMPLATE }} /></div>
          </div>
      )}

      {isEditing && (
          <div className="fixed inset-0 z-[500] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                      <div className="flex items-center gap-4">
                          <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-100"><Edit3 className="w-6 h-6" /></div>
                          <div>
                            <h3 className="font-black text-slate-900 uppercase tracking-tighter text-xl leading-none">Chỉnh sửa hồ sơ dự án</h3>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">Administrative Controls</p>
                          </div>
                      </div>
                      <button onClick={() => setIsEditing(false)} className="p-2 text-slate-400 hover:text-red-500 transition-colors active:scale-90"><X className="w-8 h-8"/></button>
                  </div>

                  <div className="p-8 space-y-8 overflow-y-auto bg-slate-50/30 flex-1 no-scrollbar">
                      
                      {/* Thumbnail & Basic Identity */}
                      <div className="flex flex-col md:flex-row gap-8 items-start">
                          <div className="relative group shrink-0">
                              <div className="w-40 h-40 md:w-56 md:h-56 bg-slate-200 rounded-[2.5rem] border-4 border-white shadow-xl overflow-hidden relative">
                                  {editForm.thumbnail ? (
                                      <img src={editForm.thumbnail} className="w-full h-full object-cover" />
                                  ) : (
                                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                                          <ImageIcon className="w-10 h-10 opacity-30" />
                                          <span className="text-[9px] font-black uppercase">Chưa có ảnh</span>
                                      </div>
                                  )}
                                  <button onClick={() => thumbnailInputRef.current?.click()} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-2">
                                      <Camera className="w-8 h-8" />
                                      <span className="text-[9px] font-black uppercase">Thay đổi ảnh</span>
                                  </button>
                                  <input type="file" ref={thumbnailInputRef} className="hidden" accept="image/*" onChange={handleThumbnailUpload} />
                              </div>
                          </div>

                          <div className="flex-1 w-full space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-1.5">
                                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Mã Công Trình (ID) *</label>
                                      <input value={editForm.ma_ct || ''} readOnly className="w-full px-6 py-4 bg-slate-100 border border-slate-200 rounded-[1.5rem] font-black text-slate-500 outline-none uppercase text-sm shadow-inner cursor-not-allowed" />
                                  </div>
                                  <div className="space-y-1.5">
                                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Tên Dự Án *</label>
                                      <input value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[1.5rem] font-black text-slate-800 outline-none focus:ring-4 focus:ring-blue-100 uppercase text-sm shadow-sm transition-all" />
                                  </div>
                                  <div className="space-y-1.5">
                                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Trạng thái vận hành</label>
                                      <div className="relative">
                                          <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value as any})} className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[1.5rem] font-black text-slate-800 outline-none focus:ring-4 focus:ring-blue-100 appearance-none shadow-sm cursor-pointer">
                                              <option value="Planning">PLANNING (CHUẨN BỊ)</option>
                                              <option value="In Progress">IN PROGRESS (ĐANG THI CÔNG)</option>
                                              <option value="On Hold">ON HOLD (TẠM DỪNG)</option>
                                              <option value="Completed">COMPLETED (HOÀN TẤT)</option>
                                          </select>
                                          <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                      </div>
                                  </div>
                                  <div className="space-y-1.5">
                                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Tiến độ (%)</label>
                                      <div className="relative">
                                          <input type="number" min="0" max="100" value={editForm.progress || 0} onChange={e => setEditForm({...editForm, progress: parseInt(e.target.value) || 0})} className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[1.5rem] font-black text-slate-800 outline-none focus:ring-4 focus:ring-blue-100 text-sm shadow-sm" />
                                          <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-slate-300">%</span>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* Professional Roles Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3 flex items-center gap-2"><UserCheck className="w-3.5 h-3.5 text-blue-500" /> Project Manager</label>
                              <input value={editForm.pm || ''} onChange={e => setEditForm({...editForm, pm: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[1.5rem] font-black text-slate-800 outline-none focus:ring-4 focus:ring-blue-100 text-xs shadow-sm uppercase" placeholder="NHẬP HỌ TÊN PM..." />
                          </div>
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3 flex items-center gap-2"><Users className="w-3.5 h-3.5 text-indigo-500" /> Coordinator (PC)</label>
                              <input value={editForm.pc || ''} onChange={e => setEditForm({...editForm, pc: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[1.5rem] font-black text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100 text-xs shadow-sm uppercase" placeholder="NHẬP HỌ TÊN PC..." />
                          </div>
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3 flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> QA/QC Manager</label>
                              <input value={editForm.qa || ''} onChange={e => setEditForm({...editForm, qa: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[1.5rem] font-black text-slate-800 outline-none focus:ring-4 focus:ring-blue-100 text-xs shadow-sm uppercase" placeholder="NHẬP HỌ TÊN QA..." />
                          </div>
                      </div>

                      {/* Dates & Location */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3 flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-blue-500" /> Ngày Bắt Đầu</label>
                                  <input type="date" value={editForm.startDate || ''} onChange={e => setEditForm({...editForm, startDate: e.target.value})} className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[1.5rem] font-black text-slate-800 outline-none focus:ring-4 focus:ring-blue-100 text-xs shadow-sm" />
                              </div>
                              <div className="space-y-1.5">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3 flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-red-500" /> Ngày Kết Thúc</label>
                                  <input type="date" value={editForm.endDate || ''} onChange={e => setEditForm({...editForm, endDate: e.target.value})} className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[1.5rem] font-black text-slate-800 outline-none focus:ring-4 focus:ring-blue-100 text-xs shadow-sm" />
                              </div>
                          </div>
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3 flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-blue-500" /> Vị trí thi công / Địa chỉ</label>
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <input 
                                        value={editForm.location || ''} 
                                        onChange={e => setEditForm({...editForm, location: e.target.value})} 
                                        className="w-full pl-6 pr-12 py-4 bg-white border border-slate-200 rounded-[1.5rem] font-bold text-slate-800 outline-none focus:ring-4 focus:ring-blue-100 text-xs shadow-sm" 
                                        placeholder="NHẬP VỊ TRÍ CHI TIẾT..." 
                                    />
                                    <button 
                                        onClick={handleGetLocation} 
                                        disabled={isGettingLocation} 
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-xl transition-all active:scale-90"
                                        title="Lấy vị trí GPS"
                                    >
                                        {isGettingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Locate className="w-4 h-4" />}
                                    </button>
                                </div>
                                <button 
                                    onClick={handleOpenInMaps}
                                    disabled={!editForm.location && !project.location}
                                    className="p-4 bg-white border border-slate-200 rounded-[1.5rem] text-slate-400 hover:text-emerald-600 hover:border-emerald-200 transition-all active:scale-95 shadow-sm"
                                    title="Kiểm tra trên Google Maps"
                                >
                                    <MapIcon className="w-5 h-5" />
                                </button>
                              </div>
                          </div>
                      </div>

                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3 flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-amber-500" /> Mô tả chi tiết dự án</label>
                          <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="w-full px-6 py-5 bg-white border border-slate-200 rounded-[2.5rem] font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 h-32 resize-none shadow-sm transition-all" placeholder="GHI CHÚ CHI TIẾT VỀ QUY MÔ, TIẾN ĐỘ VÀ CÁC YÊU CẦU ĐẶC BIỆT CỦA CÔNG TRÌNH..." />
                      </div>
                  </div>

                  <div className="p-8 border-t border-slate-100 bg-white flex flex-col md:flex-row justify-end gap-3 shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.04)] z-10">
                      <button onClick={() => setIsEditing(false)} className="order-2 md:order-1 px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-red-600 transition-colors">Hủy bỏ</button>
                      <button onClick={handleSaveProject} disabled={isSaving} className="order-1 md:order-2 px-12 py-4 bg-blue-600 text-white rounded-[1.5rem] text-xs font-black uppercase tracking-[0.25em] shadow-2xl shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                          CẬP NHẬT DỮ LIỆU
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
