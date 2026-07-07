import { getProxyImageUrl } from '../src/utils';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project, Inspection, InspectionStatus, CheckStatus, FloorPlan, LayoutPin, ModuleId, User, ViewState, IPOItem, ProjectDocument, NCR } from '../types';
import { 
  ArrowLeft, MapPin, Calendar, User as UserIcon, CheckCircle2, 
  AlertTriangle, PieChart as PieChartIcon, 
  Building2, Hash, Edit3, Save, X, Loader2,
  Activity, Layers, 
  ChevronRight, AlertCircle, FileText,
  ClipboardList, AlertOctagon, Search, ChevronDown, Plus,
  UserCheck, Users, Camera, Image as ImageIcon, Sparkles,
  ShieldCheck, Clock, Locate, Map as MapIcon, ChevronDown as ChevronDownIcon, Eye
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { updateProject, fetchFloorPlans, saveFloorPlan, deleteFloorPlan, fetchLayoutPins, saveLayoutPin, saveInspectionToSheet, fetchInspectionById, fetchPlansByProject, uploadQMSImage, fetchProjectDocuments, saveProjectDocument, deleteProjectDocument, fetchNcrById, fetchInspections, fetchNcrs } from '../services/apiService';
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
import { IPODetail } from './IPODetail';
import { NCRDetail } from './NCRDetail';
import { SITE_CHECKLIST_TEMPLATE } from '../constants';

interface ProjectDetailProps {
  project: Project;
  inspections: Inspection[];
  user: User;
  onBack: () => void;
  onUpdate?: () => void; 
  onViewInspection: (id: string) => void;
  onNavigate?: (view: ViewState) => void;
  initialFocusedPinId?: string;
}

const DETAIL_MAP: Record<string, any> = {
    'SITE': InspectionDetailSITE, 'PQC': InspectionDetailPQC, 'IQC': InspectionDetailIQC,
    'SQC_VT': InspectionDetailSQC_VT, 'SQC_MAT': InspectionDetailSQC_VT, 'SQC_BTP': InspectionDetailSQC_BTP,
    'FSR': InspectionDetailFRS, 'STEP': InspectionDetailStepVecni, 'FQC': InspectionDetailFQC, 'SPR': InspectionDetailSPR
};

const formatDate = (dateStr: any) => {
    if (!dateStr) return 'N/A';
    
    let numStr = String(dateStr);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(numStr)) {
        return numStr;
    }
    
    // Check if it's a numeric string or number (timestamp)
    if (/^\d+$/.test(numStr)) {
        const num = parseInt(numStr, 10);
        // if length is <= 10, it's seconds, else ms
        const d = new Date(num > 9999999999 ? num : num * 1000);
        if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}/${month}/${year}`;
        }
    }
    
    const d = new Date(numStr);
    if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }
    return numStr;
};

const parseDateForSort = (dateStr: any) => {
    if (!dateStr) return 0;
    
    let numStr = String(dateStr);
    
    // Check if it's DD/MM/YYYY
    const dmmyyyyMatch = numStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmmyyyyMatch) {
        return new Date(Number(dmmyyyyMatch[3]), Number(dmmyyyyMatch[2]) - 1, Number(dmmyyyyMatch[1])).getTime();
    }
    
    // Check if it's a numeric string or number (timestamp)
    if (/^\d+$/.test(numStr)) {
        const num = parseInt(numStr, 10);
        return num > 9999999999 ? num : num * 1000;
    }
    
    const d = new Date(numStr);
    if (!isNaN(d.getTime())) {
        return d.getTime();
    }
    return 0;
};

const getInspectionStats = (ins: any) => {
    let insQty = Number(ins.inspectedQuantity || 0);
    let pasQty = Number(ins.passedQuantity || 0);
    let faiQty = Number(ins.failedQuantity || 0);

    if (insQty === 0 && ins.materials && ins.materials.length > 0) {
        insQty = ins.materials.reduce((acc: number, mat: any) => acc + (Number(mat.inspectQty) || 0), 0);
        pasQty = ins.materials.reduce((acc: number, mat: any) => acc + (Number(mat.passQty) || 0), 0);
        faiQty = ins.materials.reduce((acc: number, mat: any) => acc + (Number(mat.failQty) || 0), 0);
    }

    if (insQty > 0) {
        const passPercent = Math.round((pasQty / insQty) * 100);
        const failPercent = Math.round((faiQty / insQty) * 100);
        return { passPercent, failPercent: failPercent > 0 ? failPercent : (100 - passPercent) };
    }
    
    if (ins.items && ins.items.length > 0) {
        const passItems = ins.items.filter((it: any) => it.status === 'PASS' || it.status === 'ĐẠT' || it.status === CheckStatus.PASS).length;
        const failItems = ins.items.filter((it: any) => it.status === 'FAIL' || it.status === 'KHÔNG ĐẠT' || it.status === CheckStatus.FAIL).length;
        const total = passItems + failItems;
        if (total > 0) {
            const passPercent = Math.round((passItems / total) * 100);
            return { passPercent, failPercent: 100 - passPercent };
        }
    }
    
    const passPercent = typeof ins.score === 'number' ? Math.round(ins.score) : 0;
    return { passPercent, failPercent: 100 - passPercent };
};

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#94a3b8'];

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ 
    project: initialProject, 
    inspections, 
    user, 
    onBack, 
    onUpdate, 
    onViewInspection,
    onNavigate,
    initialFocusedPinId
}) => {
  const [project, setProject] = useState(initialProject);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'LAYOUTS' | 'DOCUMENTS'>('OVERVIEW');
  
  // Custom project documents management states
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [docSearch, setDocSearch] = useState('');
  const [docFormOpen, setDocFormOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<ProjectDocument | null>(null);
  const [docFormData, setDocFormData] = useState<Partial<ProjectDocument>>({});
  const [uploadProgress, setUploadProgress] = useState(false);
  const [ipoSearch, setIpoSearch] = useState('');
  const [ipoInput, setIpoInput] = useState('');
  const [inspectionSearch, setInspectionSearch] = useState('');
  const [inspectionInput, setInspectionInput] = useState('');
  const [ncrSearch, setNcrSearch] = useState('');
  const [ncrInput, setNcrInput] = useState('');
  const [layoutSearch, setLayoutSearch] = useState('');
  const [layoutInput, setLayoutInput] = useState('');
  
  const [projectSpecificPlans, setProjectSpecificPlans] = useState<IPOItem[]>([]);
  const [isPlansLoading, setIsPlansLoading] = useState(false);
  const [selectedIpoId, setSelectedIpoId] = useState<string | null>(null);
  const [selectedIpoForDetail, setSelectedIpoForDetail] = useState<IPOItem | null>(null);

  const [projectInspections, setProjectInspections] = useState<Inspection[]>([]);
  const [projectActualNcrs, setProjectActualNcrs] = useState<NCR[]>([]);
  const [isLoadingInspections, setIsLoadingInspections] = useState(false);

  // Pagination states for UI
  const [ipoLimit, setIpoLimit] = useState(10);
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
  const [activeNcr, setActiveNcr] = useState<NCR | null>(null);
  const [isLoadingNcr, setIsLoadingNcr] = useState(false);
  const [focusedPinId, setFocusedPinId] = useState<string | undefined>(initialFocusedPinId);

  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialFocusedPinId) {
      setFocusedPinId(initialFocusedPinId);
    }
  }, [initialFocusedPinId]);

  useEffect(() => {
    if (focusedPinId && inspections.length > 0 && floorPlans.length > 0) {
      const targetInsp = inspections.find(i => i.id === focusedPinId);
      if (targetInsp && targetInsp.floor_plan_id) {
        const foundPlan = floorPlans.find(fp => fp.id === targetInsp.floor_plan_id);
        if (foundPlan) {
          handleSelectPlan(foundPlan);
        }
      }
    }
  }, [focusedPinId, inspections, floorPlans]);

  const loadProjectInspections = async () => {
      setIsLoadingInspections(true);
      try {
          const data = await fetchInspections({ project: project.ma_ct }, 1, 10000);
          setProjectInspections(data.items || []);
      } catch (e) {
          console.error("Failed to load project inspections", e);
      } finally {
          setIsLoadingInspections(false);
      }
  };

  const loadProjectNcrs = async () => {
      try {
          const data = await fetchNcrs({ project: project.ma_ct }, 1, 10000);
          setProjectActualNcrs(data.items || []);
      } catch (e) {
          console.error("Failed to load project NCRs", e);
      }
  };

  useEffect(() => {
      loadFloorPlans();
      loadProjectPlans();
      loadProjectDocuments();
      loadProjectInspections();
      loadProjectNcrs();
  }, [project.ma_ct, project.id]);

  const loadProjectDocuments = async () => {
      setIsLoadingDocs(true);
      try {
          const data = await fetchProjectDocuments(project.id);
          setDocuments(data);
      } catch (e) {
          console.error("Failed to load project documents", e);
      } finally {
          setIsLoadingDocs(false);
      }
  };

  const handleSaveDoc = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!docFormData.name) return;
      
      try {
          const docData: ProjectDocument = {
              id: editingDoc?.id || 'DOC-' + Date.now(),
              projectId: project.id,
              ma_ct: project.ma_ct,
              name: docFormData.name,
              version: docFormData.version || '1.0',
              issueDate: docFormData.issueDate || new Date().toISOString().split('T')[0],
              updateDate: new Date().toISOString().split('T')[0],
              fileUrl: docFormData.fileUrl || '',
              description: docFormData.description || '',
              createdBy: editingDoc?.createdBy || user.name || user.username,
              createdAt: editingDoc?.createdAt || Date.now(),
              updatedAt: Date.now()
          };
          
          await saveProjectDocument(docData);
          await loadProjectDocuments();
          setDocFormOpen(false);
          setEditingDoc(null);
          setDocFormData({});
      } catch (err) {
          console.error("Failed to save document:", err);
      }
  };

  const handleEditDoc = (doc: ProjectDocument) => {
      setEditingDoc(doc);
      setDocFormData(doc);
      setDocFormOpen(true);
  };

  const handleDeleteDoc = async (id: string) => {
      if (!window.confirm("Bạn có chắc chắn muốn xóa tài liệu này không?")) return;
      try {
          await deleteProjectDocument(id);
          await loadProjectDocuments();
      } catch (err) {
          console.error("Failed to delete document:", err);
      }
  };

  const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setUploadProgress(true);
      try {
          const url = await uploadQMSImage(file, {
              entityId: project.id,
              type: 'PROJECT_DOC',
              role: 'ATTACHMENT'
          });
          setDocFormData(prev => ({ ...prev, fileUrl: url }));
      } catch (err) {
          console.error("Failed to upload document file:", err);
      } finally {
          setUploadProgress(false);
      }
  };

  const filteredDocs = useMemo(() => {
    const term = docSearch.toLowerCase().trim();
    return documents.filter(doc => 
        !term || 
        doc.name.toLowerCase().includes(term) || 
        (doc.description && doc.description.toLowerCase().includes(term)) ||
        doc.version.toLowerCase().includes(term)
    );
  }, [documents, docSearch]);

  const loadProjectPlans = async () => {
      setIsPlansLoading(true);
      try {
          const data = await fetchPlansByProject(project.ma_ct);
          setProjectSpecificPlans(data);
      } catch (e) { console.error("Failed to load project plans", e); }
      finally { setIsPlansLoading(false); }
  };

  const loadFloorPlans = async () => {
      setIsLoadingPlans(true);
      try {
          const data = await fetchFloorPlans(project.ma_ct);
          setFloorPlans(data);
      } catch (e) { console.error(e); }
      finally { setIsLoadingPlans(false); }
  };

  const filteredIpoPlans = useMemo(() => {
    const term = ipoSearch.toLowerCase().trim();
    
    // Lọc trùng trước
    const seen = new Set<string>();
    const unique = projectSpecificPlans.filter(p => {
        const key = p.headcode || p.ma_nha_may || p.id;
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const filtered = unique.filter(p => 
        !term || 
        (p.ten_hang_muc && p.ten_hang_muc.toLowerCase().includes(term)) || 
        (p.ma_nha_may && p.ma_nha_may.toLowerCase().includes(term)) ||
        (p.headcode && p.headcode.toLowerCase().includes(term))
    );

    // Sắp xếp theo số lượng phiếu kiểm tra QC (từ lớn đến bé)
    return filtered.sort((a, b) => {
        const targetIdA = a.headcode || a.ma_nha_may;
        const targetIdB = b.headcode || b.ma_nha_may;
        const countA = projectInspections.filter(i => i && (i.ma_nha_may === targetIdA || i.headcode === targetIdA)).length;
        const countB = projectInspections.filter(i => i && (i.ma_nha_may === targetIdB || i.headcode === targetIdB)).length;
        return countB - countA;
    });
  }, [projectSpecificPlans, ipoSearch, projectInspections]);

  const productionProgress = useMemo(() => {
    const seen = new Set<string>();
    const uniquePlans = projectSpecificPlans.filter(p => {
        const key = p.headcode || p.ma_nha_may || p.id;
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const total = uniquePlans.length;
    if (total === 0) return 0;

    const completedCount = uniquePlans.filter(p => {
        const targetId = p.headcode || p.ma_nha_may;
        const ipoInspections = projectInspections.filter(i => i && (i.ma_nha_may === targetId || i.headcode === targetId));
        return ipoInspections.some(i => {
            const stageStr = String(i.inspectionStage || (i as any).stage || '').toLowerCase();
            return stageStr.includes('p20');
        });
    }).length;

    return Math.round((completedCount / total) * 100);
  }, [projectSpecificPlans, projectInspections]);

  const filteredInspectionsFull = useMemo(() => {
    const pMaCt = String(project.ma_ct || '').trim().toLowerCase();
    const pName = String(project.name || '').trim().toLowerCase();
    const term = inspectionSearch.toLowerCase().trim();

    return projectInspections.filter(i => {
        if (!i) return false;
        const matchesProject = String(i.ma_ct || '').toLowerCase() === pMaCt || String(i.ten_ct || '').toLowerCase() === pName;
        const matchesSearch = !term || (i.ten_hang_muc || '').toLowerCase().includes(term);
        const matchesIpo = !selectedIpoId || i.ma_nha_may === selectedIpoId || i.headcode === selectedIpoId;
        return matchesProject && matchesSearch && matchesIpo;
    }).sort((a, b) => parseDateForSort(b.date) - parseDateForSort(a.date));
  }, [projectInspections, project, inspectionSearch, selectedIpoId]);

  const projectNcrs = useMemo(() => {
    const term = ncrSearch.toLowerCase().trim();
    return projectActualNcrs.filter(ncr => {
        const matchesSearch = !term || 
            (ncr.issueDescription || '').toLowerCase().includes(term) || 
            (ncr.ten_hang_muc || '').toLowerCase().includes(term);
        const matchesIpo = !selectedIpoId || ncr.workshop === selectedIpoId;
        return matchesSearch && matchesIpo;
    });
  }, [projectActualNcrs, ncrSearch, selectedIpoId]);

  const filteredLayouts = useMemo(() => {
    const term = layoutSearch.toLowerCase().trim();
    return floorPlans.filter(fp => {
        const matchesSearch = !term || fp.name.toLowerCase().includes(term);
        const matchesIpo = !selectedIpoId || fp.name.toLowerCase().includes(selectedIpoId.toLowerCase());
        return matchesSearch && matchesIpo;
    });
  }, [floorPlans, layoutSearch, selectedIpoId]);

  const stats = useMemo(() => {
    const pMaCt = String(project.ma_ct || '').trim().toLowerCase();
    const pName = String(project.name || '').trim().toLowerCase();
    
    const projInspections = projectInspections.filter(i => {
        if (!i) return false;
        return String(i.ma_ct || '').toLowerCase() === pMaCt || String(i.ten_ct || '').toLowerCase() === pName;
    });

    const total = projInspections.length;
    const completed = projInspections.filter(i => i && (i.status === InspectionStatus.COMPLETED || i.status === InspectionStatus.APPROVED)).length;
    const flagged = projInspections.filter(i => i && i.status === InspectionStatus.FLAGGED).length;
    const drafts = projInspections.filter(i => i && i.status === InspectionStatus.DRAFT).length;
    return { 
        total, 
        completed, 
        flagged, 
        drafts, 
        passRate: total > 0 ? Math.round((completed / (completed + flagged)) * 100) || 0 : 0 
    };
  }, [projectInspections, project]);

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
          setFullDetailId(null);
      } finally {
          setIsLoadingFullDetail(false);
      }
  };

  const handleOpenNcr = async (id: string) => {
      setIsLoadingNcr(true);
      try {
          const data = await fetchNcrById(id);
          setActiveNcr(data);
      } catch (e) {
          alert("Lỗi tải chi tiết NCR.");
      } finally {
          setIsLoadingNcr(false);
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
          loadProjectInspections();
          if (onUpdate) onUpdate();
      } catch (err: any) { 
          console.error("Layout Save Detailed Error:", err);
          alert(`Error saving inspection spatial data: ${err.message || 'Unknown error'}`); 
      } finally { setIsSaving(false); }
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

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
          const { uploadFileToStorage } = await import('../services/apiService');
          const url = await uploadFileToStorage(file, `project_thumb_${Date.now()}_${file.name}`);
          setEditForm(prev => ({ ...prev, thumbnail: url }));
      } catch (err) {
          alert("Lỗi tải ảnh lên.");
      }
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
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-800/50 overflow-hidden relative" style={{ fontFamily: '"Inter", sans-serif' }}>
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3 md:p-4 sticky top-0 z-20 shadow-sm flex items-center justify-between shrink-0">
         <div className="flex items-center gap-2 md:gap-3">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-xl transition-colors active:scale-90"><ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-400 dark:text-slate-500" /></button>
            <div className="overflow-hidden">
                <h2 className="text-sm md:text-lg font-black text-slate-900 dark:text-slate-100 leading-none truncate max-w-[160px] md:max-w-md uppercase tracking-tight">{project.name}</h2>
                <div className="flex items-center gap-1.5 mt-1">
                    <p className="text-[9px] md:text-[10px] text-slate-400 dark:text-slate-500 font-mono font-bold tracking-widest">{project.ma_ct}</p>
                    <div className="h-0.5 w-0.5 rounded-full bg-slate-300 dark:bg-slate-600"></div>
                    <p className="text-[9px] md:text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-widest truncate">
                        {activeTab === 'OVERVIEW' ? 'Project Repository' : activeTab === 'DOCUMENTS' ? 'Hồ sơ tài liệu ban hành' : 'Technical Map'}
                    </p>
                </div>
            </div>
         </div>
         <div className="flex items-center gap-1 md:gap-2">
             <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 md:p-1 rounded-lg md:rounded-xl border border-slate-200 dark:border-slate-700 mr-1 md:mr-2">
                 <button onClick={() => setActiveTab('OVERVIEW')} className={`px-2 md:px-4 py-1.5 rounded-md md:rounded-lg text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'OVERVIEW' ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>Overview</button>
                 <button onClick={() => setActiveTab('LAYOUTS')} className={`px-2 md:px-4 py-1.5 rounded-md md:rounded-lg text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LAYOUTS' ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>Map</button>
                 <button onClick={() => setActiveTab('DOCUMENTS')} className={`px-2 md:px-4 py-1.5 rounded-md md:rounded-lg text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'DOCUMENTS' ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>Tài liệu ({documents.length})</button>
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
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col h-full min-h-[400px]">
                            <div className="flex items-center gap-3 mb-6">
                                <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">THÔNG TIN CHI TIẾT</h3>
                            </div>
                            <div className="space-y-4 flex-1">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-slate-800/80 flex items-center justify-center border border-blue-100 dark:border-slate-700 text-blue-600 dark:text-blue-400 shrink-0">
                                        <Hash className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-0.5">MÃ DỰ ÁN</p>
                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase">{project.ma_ct}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-slate-800/80 flex items-center justify-center border border-blue-100 dark:border-slate-700 text-blue-600 dark:text-blue-400 shrink-0">
                                        <UserCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-0.5">PROJECT MANAGER</p>
                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase">{project.pm || 'CHƯA PHÂN CÔNG'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100 text-indigo-600 shrink-0">
                                        <Users className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-0.5">COORDINATOR (PC)</p>
                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase">{project.pc || 'CHƯA PHÂN CÔNG'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100 text-emerald-600 shrink-0">
                                        <ShieldCheck className="w-5 h-5 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-0.5">QA/QC MANAGER</p>
                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase">{project.qa || 'CHƯA PHÂN CÔNG'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center border border-purple-100 text-purple-600 shrink-0">
                                        <MapPin className="w-5 h-5 text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-0.5">VỊ TRÍ</p>
                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase line-clamp-1">{project.location || '---'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-100 text-amber-600 shrink-0">
                                        <Calendar className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-0.5">THỜI GIAN</p>
                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase">{project.startDate || '--'} • {project.endDate || '--'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. MÔ TẢ TỔNG QUAN */}
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col h-full min-h-[400px]">
                            <div className="flex items-center gap-3 mb-6">
                                <Layers className="w-5 h-5 text-indigo-600" />
                                <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">MÔ TẢ TỔNG QUAN</h3>
                            </div>
                            <div className="flex-1">
                                <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 italic leading-relaxed line-clamp-[10]">
                                    {project.description || 'Chưa có mô tả chi tiết cho dự án này.'}
                                </p>
                            </div>
                            <div className="mt-6 pt-6 border-t border-slate-50">
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" /> TIẾN ĐỘ SẢN XUẤT</span>
                                    <span className="text-xl font-black text-blue-700">{productionProgress}%</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-200 dark:border-slate-700 shadow-inner">
                                    <div className="bg-blue-600 h-full rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(37,99,235,0.4)]" style={{ width: `${productionProgress}%` }}></div>
                                </div>
                            </div>
                        </div>

                        {/* 3. CHỈ SỐ CHẤT LƯỢNG */}
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center h-full min-h-[400px]">
                            <div className="w-full flex items-center gap-3 mb-2 text-left">
                                <PieChartIcon className="w-5 h-5 text-emerald-600" />
                                <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">CHỈ SỐ CHẤT LƯỢNG</h3>
                            </div>
                            <div className="flex-1 flex flex-col items-center justify-center w-full">
                                <div className="relative w-36 h-36 min-h-[144px] min-w-[144px]">
                                    <PieChart width={144} height={144}>
                                        <Pie data={pieData.length > 0 ? pieData : [{name: 'Empty', value: 1}]} innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value" stroke="none">
                                            {pieData.length > 0 ? pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            )) : <Cell fill="#f1f5f9" />}
                                        </Pie>
                                    </PieChart>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-2xl font-black text-slate-800 dark:text-slate-200">{stats.passRate}%</span>
                                        <span className="text-[7px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">QC PASS</span>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-6 w-full">
                                <div className="flex items-center justify-center gap-2 py-3 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-100">
                                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                    <span className="text-[10px] font-black text-green-700 uppercase">{stats.completed} ĐẠT</span>
                                </div>
                                <div className="flex items-center justify-center gap-2 py-3 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100">
                                    <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_5px_red]"></div>
                                    <span className="text-[10px] font-black text-red-700 uppercase">{stats.flagged} LỖI</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* --- 4-COLUMN DATA REPOSITORY --- */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 min-h-[600px]">
                        
                        {/* 1. IPO COLUMN */}
                        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden max-h-[700px]">
                            <div className="px-4 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-blue-50 dark:bg-slate-800/80/30 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md"><ClipboardList className="w-4 h-4" /></div>
                                    <span className="font-black text-[11px] uppercase tracking-wider text-blue-900">Danh sách IPO</span>
                                </div>
                                <span className="bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg border border-blue-100 dark:border-slate-700 text-[10px] font-black">{filteredIpoPlans.length}</span>
                            </div>
                            <div className="px-4 py-2 border-b border-slate-50 shrink-0">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                    <input 
                                        type="text" 
                                        placeholder="Tìm mã hoặc tên..." 
                                        value={ipoInput}
                                        onChange={e => setIpoInput(e.target.value)}
                                        onBlur={() => setIpoSearch(ipoInput)}
                                        onKeyDown={e => e.key === 'Enter' && setIpoSearch(ipoInput)}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-[10px] font-bold outline-none focus:bg-white dark:bg-slate-900 focus:ring-4 focus:ring-blue-100 transition-all"
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
                                {isPlansLoading ? (
                                    <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 text-blue-300 animate-spin" /></div>
                                ) : filteredIpoPlans.length > 0 ? (
                                    <>
                                        {filteredIpoPlans.slice(0, ipoLimit).map((ipo, idx) => {
                                             const targetId = ipo.headcode || ipo.ma_nha_may;
                                             const isSelected = selectedIpoId === targetId;
                                             const ipoInspections = projectInspections.filter(i => i && (i.ma_nha_may === targetId || i.headcode === targetId));
                                             const insCount = ipoInspections.length;
                                             const isCompleted = ipoInspections.some(i => {
                                                 const stageStr = String(i.inspectionStage || (i as any).stage || '').toLowerCase();
                                                 return stageStr.includes('p20');
                                             });

                                             let borderClass = 'border-slate-100 dark:border-slate-800';
                                             let bgClass = 'bg-white dark:bg-slate-900';

                                             if (isCompleted) {
                                                 if (isSelected) {
                                                     borderClass = 'border-green-600 dark:border-green-500 border-2';
                                                     bgClass = 'bg-green-50/80 dark:bg-green-950/40';
                                                 } else {
                                                     borderClass = 'border-green-200 dark:border-green-900/50';
                                                     bgClass = 'bg-green-50/40 dark:bg-green-950/10';
                                                 }
                                             } else {
                                                 if (isSelected) {
                                                     borderClass = 'border-blue-500 shadow-md';
                                                     bgClass = 'bg-blue-50 dark:bg-slate-800/80/30';
                                                 }
                                             }

                                             return (
                                                 <div 
                                                     key={`${ipo.id}-${idx}`} 
                                                     onClick={() => setSelectedIpoId(prev => prev === targetId ? null : targetId)} 
                                                     className={`p-4 ${bgClass} border ${borderClass} rounded-2xl hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group flex items-start gap-3`}
                                                 >
                                                     <div className="flex flex-col items-center gap-1.5 shrink-0 w-[95px]">
                                                         <button 
                                                             onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 setSelectedIpoForDetail(ipo);
                                                             }}
                                                             className={`w-full px-2 py-1.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1 ${
                                                                 isSelected 
                                                                     ? (isCompleted ? 'bg-green-600 text-white shadow-sm' : 'bg-white text-blue-600 shadow-sm') 
                                                                     : 'bg-blue-600 text-white hover:bg-blue-700'
                                                             } hover:shadow-lg border border-transparent`}
                                                         >
                                                             <Eye className="w-3.5 h-3.5"/>
                                                             <span className="text-[9px] font-black uppercase tracking-wider">Chi tiết</span>
                                                         </button>
                                                         
                                                         <div className="flex items-center gap-1 text-[8px] font-black uppercase text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded-md border border-slate-200/50 dark:border-slate-700/50">
                                                             <span>{insCount} phiếu QC</span>
                                                         </div>

                                                         {isCompleted && (
                                                             <span className="px-1.5 py-0.5 bg-green-500/15 text-green-700 dark:text-green-400 text-[8px] font-black uppercase tracking-wider rounded-md border border-green-500/20 text-center leading-none">
                                                                 Đã hoàn thiện
                                                             </span>
                                                         )}
                                                     </div>
                                                     <div className="flex-1 min-w-0">
                                                         <h4 className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase truncate leading-none mb-1.5">{ipo.ten_hang_muc}</h4>
                                                         <div className="flex justify-between items-center">
                                                             <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase">{ipo.headcode || ipo.ma_nha_may}</p>
                                                             <span className="text-[10px] font-black text-slate-900 dark:text-slate-100">{ipo.so_luong_ipo} {ipo.dvt}</span>
                                                         </div>
                                                     </div>
                                                 </div>
                                             );
                                        })}
                                        {projectSpecificPlans.length > ipoLimit && (
                                            <button 
                                                onClick={() => setIpoLimit(Infinity)}
                                                className="w-full py-3 mt-2 bg-blue-50 dark:bg-slate-800/80 text-blue-600 dark:text-blue-400 font-black text-[9px] uppercase tracking-widest rounded-xl border border-blue-100 dark:border-slate-700 hover:bg-blue-100 dark:bg-blue-900/30 transition-all flex items-center justify-center gap-2"
                                            >
                                                <ChevronDownIcon className="w-3 h-3" /> HIỂN THỊ TẤT CẢ ({filteredIpoPlans.length})
                                            </button>
                                        )}
                                    </>
                                ) : <div className="py-20 text-center text-[9px] font-black text-slate-300 uppercase italic tracking-widest">Trống</div>}
                            </div>
                        </div>

                        {/* 2. INSPECTIONS COLUMN */}
                        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden max-h-[700px]">
                            <div className="px-4 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/30 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-md"><FileText className="w-4 h-4" /></div>
                                    <div className="flex flex-col">
                                        <span className="font-black text-[11px] uppercase tracking-wider text-indigo-900">Phiếu kiểm tra QC</span>
                                        {selectedIpoId && <span className="text-[8px] font-bold text-indigo-500 uppercase tracking-tight">Lọc theo: {selectedIpoId}</span>}
                                    </div>
                                </div>
                                <span className="bg-white dark:bg-slate-900 text-indigo-600 px-2 py-1 rounded-lg border border-indigo-100 text-[10px] font-black">{filteredInspectionsFull.length}</span>
                            </div>
                            <div className="px-4 py-2 border-b border-slate-50 shrink-0">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                    <input 
                                        type="text" 
                                        placeholder="Tìm hạng mục..." 
                                        value={inspectionInput}
                                        onChange={e => setInspectionInput(e.target.value)}
                                        onBlur={() => setInspectionSearch(inspectionInput)}
                                        onKeyDown={e => e.key === 'Enter' && setInspectionSearch(inspectionInput)}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-[10px] font-bold outline-none focus:bg-white dark:bg-slate-900 focus:ring-4 focus:ring-indigo-100 transition-all"
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
                                {filteredInspectionsFull.length > 0 ? (
                                    <>
                                        {filteredInspectionsFull.slice(0, inspectionsLimit).map((ins, idx) => {
                                            const { passPercent, failPercent } = getInspectionStats(ins);
                                            return (
                                                <div key={`${ins.id}-${idx}`} onClick={() => handleOpenFullDetail(ins.id)} className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group flex items-start gap-3">
                                                    <div className={`p-2 rounded-xl shrink-0 ${ins.status === InspectionStatus.APPROVED ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-500' : 'bg-orange-50 text-orange-600'}`}><CheckCircle2 className="w-4 h-4"/></div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase truncate leading-tight mb-2">
                                                            {
                                                                (ins.type === 'IQC' || ins.type === 'SQC_VT') 
                                                                    ? (ins.materials?.[0]?.name || ins.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')
                                                                    : (ins.ten_hang_muc || 'CHƯA CÓ TIÊU ĐỀ')
                                                            }
                                                        </h4>
                                                        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[9px] text-slate-500 dark:text-slate-400">
                                                            <div className="flex flex-col">
                                                                <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Ngày kiểm</span>
                                                                <span className="font-mono font-black text-slate-700 dark:text-slate-300">{formatDate(ins.date)}</span>
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">QC Kiểm</span>
                                                                <span className="font-black text-slate-700 dark:text-slate-300 truncate">{ins.inspectorName || 'Chưa rõ'}</span>
                                                            </div>
                                                            <div className="flex flex-col col-span-2">
                                                                <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Xưởng / Công đoạn</span>
                                                                <span className="font-bold text-slate-700 dark:text-slate-300 truncate">
                                                                    {ins.workshop || 'N/A'} / {ins.inspectionStage || ins.stage || 'N/A'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-3 mt-2 pt-2 border-t border-slate-100/50 dark:border-slate-800/50">
                                                            <div className="flex items-center gap-1">
                                                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                                                <span className="text-[9px] font-black text-green-600 dark:text-green-400">Đạt: {passPercent}%</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                                                                <span className="text-[9px] font-black text-red-600 dark:text-red-400">Lỗi: {failPercent}%</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {filteredInspectionsFull.length > inspectionsLimit && (
                                            <button 
                                                onClick={() => setInspectionsLimit(Infinity)}
                                                className="w-full py-3 mt-2 bg-indigo-50 text-indigo-600 font-black text-[9px] uppercase tracking-widest rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                                            >
                                                <ChevronDownIcon className="w-3 h-3" /> HIỂN THỊ TẤT CẢ ({filteredInspectionsFull.length})
                                            </button>
                                        )}
                                    </>
                                ) : <div className="py-20 text-center text-[9px] font-black text-slate-300 uppercase italic tracking-widest">Trống</div>}
                            </div>
                        </div>

                        {/* 3. NCR COLUMN */}
                        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden max-h-[700px]">
                            <div className="px-4 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-red-50 dark:bg-red-900/20/30 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-600 text-white rounded-xl shadow-md"><AlertOctagon className="w-4 h-4" /></div>
                                    <div className="flex flex-col">
                                        <span className="font-black text-[11px] uppercase tracking-wider text-red-900">Danh sách lỗi NCR</span>
                                        {selectedIpoId && <span className="text-[8px] font-bold text-red-500 uppercase tracking-tight">Lọc theo: {selectedIpoId}</span>}
                                    </div>
                                </div>
                                <span className="bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 px-2 py-1 rounded-lg border border-red-100 text-[10px] font-black">{projectNcrs.length}</span>
                            </div>
                            <div className="px-4 py-2 border-b border-slate-50 shrink-0">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                    <input 
                                        type="text" 
                                        placeholder="Tìm lỗi..." 
                                        value={ncrInput}
                                        onChange={e => setNcrInput(e.target.value)}
                                        onBlur={() => setNcrSearch(ncrInput)}
                                        onKeyDown={e => e.key === 'Enter' && setNcrSearch(ncrInput)}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-[10px] font-bold outline-none focus:bg-white dark:bg-slate-900 focus:ring-4 focus:ring-red-100 transition-all"
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
                                {projectNcrs.length > 0 ? (
                                    <>
                                        {projectNcrs.slice(0, ncrLimit).map((ncr, idx) => (
                                            <div key={`${ncr.id}-${idx}`} onClick={() => handleOpenNcr(ncr.id)} className="p-4 bg-white dark:bg-slate-900 border border-red-100 rounded-2xl hover:shadow-md transition-all cursor-pointer group space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-[8px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full uppercase shrink-0">DEFECT</span>
                                                        <span className="text-[8px] font-mono font-bold text-red-600 bg-red-50 dark:bg-red-950/20 px-1.5 py-0.5 rounded border border-red-100/50 shrink-0">
                                                            {formatDate(ncr.createdDate)}
                                                        </span>
                                                        {ncr.workshop && (
                                                            <span className="text-[8px] font-mono font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200/50 shrink-0">
                                                                {ncr.workshop}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[9px] font-mono font-bold text-slate-400 dark:text-slate-500">#{ncr.id.split('-').pop()}</span>
                                                </div>
                                                <h4 className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase line-clamp-2 leading-tight italic">"{ncr.ten_hang_muc}"</h4>
                                                <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Reported by: {ncr.inspectorName}</p>
                                            </div>
                                        ))}
                                        {projectNcrs.length > ncrLimit && (
                                            <button 
                                                onClick={() => setNcrLimit(Infinity)}
                                                className="w-full py-3 mt-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-black text-[9px] uppercase tracking-widest rounded-xl border border-red-100 hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                                            >
                                                <ChevronDownIcon className="w-3 h-3" /> HIỂN THỊ TẤT CẢ ({projectNcrs.length})
                                            </button>
                                        )}
                                    </>
                                ) : <div className="py-20 text-center text-[9px] font-black text-slate-300 uppercase italic tracking-widest">Trống</div>}
                            </div>
                        </div>

                        {/* 4. LAYOUTS COLUMN */}
                        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden max-h-[700px]">
                            <div className="px-4 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-emerald-50/30 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-md"><Layers className="w-4 h-4" /></div>
                                    <div className="flex flex-col">
                                        <span className="font-black text-[11px] uppercase tracking-wider text-emerald-900">Bản vẽ kỹ thuật</span>
                                        {selectedIpoId && <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-tight">Lọc theo: {selectedIpoId}</span>}
                                    </div>
                                </div>
                                <button onClick={() => setIsUploadModalOpen(true)} className="p-1 bg-white dark:bg-slate-900 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all"><Plus className="w-4 h-4"/></button>
                            </div>
                            <div className="px-4 py-2 border-b border-slate-50 shrink-0">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                    <input 
                                        type="text" 
                                        placeholder="Tìm bản vẽ..." 
                                        value={layoutInput}
                                        onChange={e => setLayoutInput(e.target.value)}
                                        onBlur={() => setLayoutSearch(layoutInput)}
                                        onKeyDown={e => e.key === 'Enter' && setLayoutSearch(layoutInput)}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-[10px] font-bold outline-none focus:bg-white dark:bg-slate-900 focus:ring-4 focus:ring-emerald-100 transition-all"
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
                                {filteredLayouts.length > 0 ? (
                                    <>
                                        {filteredLayouts.slice(0, layoutLimit).map((fp, idx) => (
                                            <div key={`${fp.id}-${idx}`} onClick={() => handleSelectPlan(fp)} className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800 shrink-0 shadow-sm"><img src={getProxyImageUrl(fp.image_url)} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" /></div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase truncate leading-none mb-1.5">{fp.name}</h4>
                                                    <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase">REV {fp.version} • {fp.status}</p>
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
         ) : activeTab === 'LAYOUTS' ? (
             <div className="h-full overflow-y-auto p-4 md:p-6 no-scrollbar bg-[#f8fafc]">
                 <div className="max-w-7xl mx-auto">
                     <FloorPlanLibrary project={project} plans={floorPlans} isLoading={isLoadingPlans} onSelectPlan={handleSelectPlan} onUploadPlan={() => setIsUploadModalOpen(true)} onDeletePlan={async (id) => { if(window.confirm('Hành động này sẽ xóa vĩnh viễn layout. Xác nhận?')){ await deleteFloorPlan(id); loadFloorPlans(); } }} />
                 </div>
             </div>
          ) : (
             <div className="h-full flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-800/50">
                 {/* Toolbar */}
                 <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
                     <div className="relative w-full sm:w-[320px]">
                         <input 
                             type="text" 
                             placeholder="Tìm kiếm tài liệu..." 
                             value={docSearch}
                             onChange={e => setDocSearch(e.target.value)}
                             className="w-full pl-10 pr-4 py-2 bg-slate-55 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold font-sans outline-none focus:ring-2 focus:ring-blue-100"
                         />
                         <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-2.5" />
                     </div>
                     <button 
                         onClick={() => { setEditingDoc(null); setDocFormData({}); setDocFormOpen(true); }} 
                         className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg hover:shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                     >
                         <Plus className="w-4 h-4" /> THÊM TÀI LIỆU
                     </button>
                 </div>

                 {/* Table */}
                 <div className="flex-1 overflow-auto p-4 md:p-6 no-scrollbar">
                     <div className="max-w-7xl mx-auto bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
                         {isLoadingDocs ? (
                             <div className="p-12 flex flex-col items-center justify-center gap-2">
                                 <Loader2 className="w-8 h-8 text-blue-500 dark:text-blue-400 animate-spin" />
                                 <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">ĐANG TẢI PHIÊN BẢN TÀI LIỆU...</span>
                             </div>
                         ) : filteredDocs.length === 0 ? (
                             <div className="p-16 text-center">
                                 <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                 <h3 className="text-xs font-black text-slate-600 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest">CHƯA CÓ TÀI LIỆU NÀO ĐƯỢC BAN HÀNH</h3>
                                 <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 max-w-md mx-auto">Vui lòng ban hành các phiên bản hồ sơ thiết kế, bản vẽ kỹ thuật, quy trình hoặc biên bản nghiệm thu cho dự án này.</p>
                             </div>
                         ) : (
                             <div className="overflow-x-auto">
                                 <table className="w-full border-collapse text-left">
                                     <thead>
                                         <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                             <th className="px-6 py-4">Tên tài liệu</th>
                                             <th className="px-6 py-4 text-center">Phiên bản</th>
                                             <th className="px-6 py-4 text-center">Ngày ban hành</th>
                                             <th className="px-6 py-4 text-center">Ngày cập nhật</th>
                                             <th className="px-6 py-4">Người ban hành</th>
                                             <th className="px-6 py-4 text-center">Đính kèm</th>
                                             <th className="px-8 py-4 text-right">Thao tác</th>
                                         </tr>
                                     </thead>
                                     <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 dark:text-slate-500">
                                         {filteredDocs.map(doc => (
                                             <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50/50 transition-colors">
                                                 <td className="px-6 py-4">
                                                     <div className="flex items-center gap-3">
                                                         <div className="p-2.5 bg-blue-50 dark:bg-slate-800/80 text-blue-600 dark:text-blue-400 rounded-2xl">
                                                             <FileText className="w-4 h-4" />
                                                         </div>
                                                         <div>
                                                             <p className="font-extrabold text-slate-800 dark:text-slate-200">{doc.name}</p>
                                                             {doc.description && <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5 max-w-sm truncate">{doc.description}</p>}
                                                         </div>
                                                     </div>
                                                 </td>
                                                 <td className="px-6 py-4 text-center">
                                                     <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 dark:text-slate-500 rounded text-[10px] font-mono font-bold">
                                                         {doc.version}
                                                     </span>
                                                 </td>
                                                 <td className="px-6 py-4 text-center font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">{doc.issueDate}</td>
                                                 <td className="px-6 py-4 text-center font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500">{doc.updateDate || doc.issueDate}</td>
                                                 <td className="px-6 py-4 text-slate-500 dark:text-slate-400 dark:text-slate-500">{doc.createdBy || 'Hệ thống'}</td>
                                                 <td className="px-6 py-4 text-center">
                                                     {doc.fileUrl ? (
                                                         <a href={getProxyImageUrl(doc.fileUrl)} referrerPolicy="no-referrer" target="_blank" rel="noopener noreferrer" className="inline-flex px-3.5 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all border border-emerald-100 uppercase tracking-widest text-[9px] font-black" title="Tải file đính kèm">
                                                             Mở bản vẽ
                                                         </a>
                                                     ) : (
                                                         <span className="text-[10px] text-slate-300 font-medium font-sans">Không đính kèm</span>
                                                     )}
                                                 </td>
                                                 <td className="px-8 py-4 text-right">
                                                     <div className="flex items-center justify-end gap-2">
                                                         <button onClick={() => handleEditDoc(doc)} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-xl transition-all" title="Chỉnh sửa"><Edit3 className="w-4 h-4" /></button>
                                                         <button onClick={() => handleDeleteDoc(doc.id)} className="p-2 text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-xl transition-all" title="Xóa"><X className="w-4 h-4" /></button>
                                                     </div>
                                                 </td>
                                             </tr>
                                         ))}
                                     </tbody>
                                 </table>
                             </div>
                         )}
                     </div>
                 </div>
             </div>
          )}
      </div>

      {/* --- OVERLAYS --- */}
      {selectedPlan && (
          <div className="absolute inset-0 z-[140] bg-white dark:bg-slate-900 flex flex-col animate-in fade-in duration-300">
            <LayoutManager 
              floorPlan={selectedPlan} 
              pins={pins} 
              onBack={() => { setSelectedPlan(null); setFocusedPinId(undefined); }} 
              onAddPin={handleAddPin} 
              onViewFullDetail={handleOpenFullDetail} 
              currentUser={user} 
              initialFocusedPinId={focusedPinId}
            />
          </div>
      )}

      {fullDetailId && (
          <div className="absolute inset-0 z-[150] bg-white dark:bg-slate-900 flex flex-col animate-in slide-in-from-bottom duration-300 shadow-2xl">
              {isLoadingFullDetail ? <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50"><Loader2 className="w-10 h-10 animate-spin text-blue-600 dark:text-blue-400 mb-4"/><p className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-[0.3em]">SYNCHRONIZING RECORD DATA...</p></div> : fullDetailData ? (() => { const DetailComponent = DETAIL_MAP[fullDetailData.type || 'PQC'] || InspectionDetailPQC; return <DetailComponent inspection={fullDetailData} user={user} onBack={() => { setFullDetailId(null); setFullDetailData(null); }} onEdit={() => { }} onDelete={() => { }} onApprove={async (id: string, sig: string, extra: any) => { const updated = { ...fullDetailData, ...extra }; if (sig || extra.managerSignature) { updated.status = InspectionStatus.APPROVED; updated.managerSignature = sig || extra.managerSignature; updated.managerName = extra.managerName || user.name; } await saveInspectionToSheet(updated); setFullDetailData(updated); if (onUpdate) onUpdate(); }} onPostComment={async (id: string, cmt: any) => { const updated = { ...fullDetailData, comments: [...(fullDetailData.comments || []), cmt] }; await saveInspectionToSheet(updated); setFullDetailData(updated); }} onViewOnPlan={(insp: Inspection) => { setFullDetailId(null); setFullDetailData(null); setFocusedPinId(insp.id); if (insp.floor_plan_id) { const foundPlan = floorPlans.find(fp => fp.id === insp.floor_plan_id); if (foundPlan) { handleSelectPlan(foundPlan); } } }} />; })() : null}
          </div>
      )}

      {activeNcr && (
          <div className="fixed inset-0 z-[300] bg-white dark:bg-slate-900 animate-in slide-in-from-right duration-300 shadow-2xl">
              <NCRDetail 
                ncr={activeNcr} 
                user={user} 
                onBack={() => setActiveNcr(null)} 
                onViewInspection={handleOpenFullDetail}
                onUpdate={() => { if(onUpdate) onUpdate(); }}
              />
          </div>
      )}

      {isLoadingNcr && (
          <div className="fixed inset-0 z-[350] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-red-600" />
                  <span className="text-xs font-black uppercase tracking-widest text-slate-600">Đang tải hồ sơ NCR...</span>
              </div>
          </div>
      )}

      {isUploadModalOpen && <FloorPlanUploadModal projectId={project.ma_ct} onClose={() => setIsUploadModalOpen(false)} onSave={async (plan) => { await saveFloorPlan(plan); loadFloorPlans(); }} />}

      {selectedIpoForDetail && (
          <div className="fixed inset-0 z-[100] bg-white dark:bg-slate-900 animate-in fade-in zoom-in duration-300">
              <IPODetail 
                  item={selectedIpoForDetail} 
                  onBack={() => setSelectedIpoForDetail(null)}
                  onCreateInspection={() => {}}
                  onViewInspection={() => {}}
                  onUpdatePlan={async () => {}}
              />
          </div>
      )}

      {isInspectionFormOpen && pendingPinCoord && (
          <div className="absolute inset-0 z-[200] bg-white dark:bg-slate-900 flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl">
              <header className="h-14 border-b px-4 flex items-center justify-between bg-slate-900 text-white shrink-0 z-10"><div className="flex items-center gap-3"><button onClick={() => setIsInspectionFormOpen(false)} className="p-2 hover:bg-white dark:bg-slate-900/10 rounded-xl transition-all"><ArrowLeft className="w-4 h-4" /></button><div><h2 className="text-[9px] font-black uppercase tracking-[0.2em] leading-none">New Site Inspection</h2><p className="text-[8px] font-bold text-blue-400 uppercase mt-1">Point Sync: {pendingPinCoord.x.toFixed(1)}%, {pendingPinCoord.y.toFixed(1)}%</p></div></div><button onClick={() => setIsInspectionFormOpen(false)} className="p-2 hover:bg-white dark:bg-slate-900/10 rounded-xl transition-all"><X className="w-4 h-4" /></button></header>
              <div className="flex-1 overflow-hidden bg-slate-50 dark:bg-slate-800/50"><InspectionFormSITE onCancel={() => setIsInspectionFormOpen(false)} onSave={handleSaveInspectionFromLayout} workshops={[]} user={user} initialData={{ ma_ct: project.ma_ct, ten_ct: project.name, type: 'SITE' as ModuleId, floor_plan_id: selectedPlan?.id, coord_x: pendingPinCoord.x, coord_y: pendingPinCoord.y }} templates={{ 'SITE': SITE_CHECKLIST_TEMPLATE }} /></div>
          </div>
      )}

      {isEditing && (
          <div className="fixed inset-0 z-[500] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
                      <div className="flex items-center gap-4">
                          <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-100"><Edit3 className="w-6 h-6" /></div>
                          <div>
                            <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter text-xl leading-none">Chỉnh sửa hồ sơ dự án</h3>
                            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1.5">Administrative Controls</p>
                          </div>
                      </div>
                      <button onClick={() => setIsEditing(false)} className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:text-red-400 transition-colors active:scale-90"><X className="w-8 h-8"/></button>
                  </div>

                  <div className="p-8 space-y-8 overflow-y-auto bg-slate-50 dark:bg-slate-800/50/30 flex-1 no-scrollbar">
                      
                      {/* Thumbnail & Basic Identity */}
                      <div className="flex flex-col md:flex-row gap-8 items-start">
                          <div className="relative group shrink-0">
                              <div className="w-40 h-40 md:w-56 md:h-56 bg-slate-200 dark:bg-slate-700 rounded-[2.5rem] border-4 border-white shadow-xl overflow-hidden relative">
                                  {editForm.thumbnail ? (
                                      <img src={getProxyImageUrl(editForm.thumbnail)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-2">
                                          <ImageIcon className="w-10 h-10 opacity-30" />
                                          <span className="text-[9px] font-black uppercase">Chưa có ảnh</span>
                                      </div>
                                  )}
                                  <button onClick={() => thumbnailInputRef.current?.click()} className="absolute inset-0 bg-black/40 md:opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-2">
                                      <Camera className="w-8 h-8" />
                                      <span className="text-[9px] font-black uppercase">Thay đổi ảnh</span>
                                  </button>
                                  <input type="file" ref={thumbnailInputRef} className="hidden" accept="image/*" onChange={handleThumbnailUpload} />
                              </div>
                          </div>

                          <div className="flex-1 w-full space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-1.5">
                                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3">Mã Công Trình (ID) *</label>
                                      <input value={editForm.ma_ct || ''} readOnly className="w-full px-6 py-4 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] font-black text-slate-500 dark:text-slate-400 dark:text-slate-500 outline-none uppercase text-sm shadow-inner cursor-not-allowed" />
                                  </div>
                                  <div className="space-y-1.5">
                                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3">Tên Dự Án *</label>
                                      <input value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] font-black text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-100 uppercase text-sm shadow-sm transition-all" />
                                  </div>
                                  <div className="space-y-1.5">
                                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3">Trạng thái vận hành</label>
                                      <div className="relative">
                                          <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value as any})} className="w-full px-6 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] font-black text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-100 appearance-none shadow-sm cursor-pointer">
                                              <option value="Planning">PLANNING (CHUẨN BỊ)</option>
                                              <option value="In Progress">IN PROGRESS (ĐANG THI CÔNG)</option>
                                              <option value="On Hold">ON HOLD (TẠM DỪNG)</option>
                                              <option value="Completed">COMPLETED (HOÀN TẤT)</option>
                                          </select>
                                          <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500 pointer-events-none" />
                                      </div>
                                  </div>
                                  <div className="space-y-1.5">
                                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3">Tiến độ (%)</label>
                                      <div className="relative">
                                          <input type="number" min="0" max="100" value={editForm.progress || 0} onChange={e => setEditForm({...editForm, progress: parseInt(e.target.value) || 0})} className="w-full px-6 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] font-black text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-100 text-sm shadow-sm" />
                                          <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-slate-300">%</span>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* Professional Roles Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3 flex items-center gap-2"><UserCheck className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" /> Project Manager</label>
                              <input value={editForm.pm || ''} onChange={e => setEditForm({...editForm, pm: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] font-black text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-100 text-xs shadow-sm uppercase" placeholder="NHẬP HỌ TÊN PM..." />
                          </div>
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3 flex items-center gap-2"><Users className="w-3.5 h-3.5 text-indigo-500" /> Coordinator (PC)</label>
                              <input value={editForm.pc || ''} onChange={e => setEditForm({...editForm, pc: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] font-black text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-indigo-100 text-xs shadow-sm uppercase" placeholder="NHẬP HỌ TÊN PC..." />
                          </div>
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3 flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> QA/QC Manager</label>
                              <input value={editForm.qa || ''} onChange={e => setEditForm({...editForm, qa: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] font-black text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-100 text-xs shadow-sm uppercase" placeholder="NHẬP HỌ TÊN QA..." />
                          </div>
                      </div>

                      {/* Dates & Location */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3 flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" /> Ngày Bắt Đầu</label>
                                  <input type="date" value={editForm.startDate || ''} onChange={e => setEditForm({...editForm, startDate: e.target.value})} className="w-full px-6 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] font-black text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-100 text-xs shadow-sm" />
                              </div>
                              <div className="space-y-1.5">
                                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3 flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-red-500 dark:text-red-400" /> Ngày Kết Thúc</label>
                                  <input type="date" value={editForm.endDate || ''} onChange={e => setEditForm({...editForm, endDate: e.target.value})} className="w-full px-6 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] font-black text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-100 text-xs shadow-sm" />
                              </div>
                          </div>
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3 flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" /> Vị trí thi công / Địa chỉ</label>
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <input 
                                        value={editForm.location || ''} 
                                        onChange={e => setEditForm({...editForm, location: e.target.value})} 
                                        className="w-full pl-6 pr-12 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-100 text-xs shadow-sm" 
                                        placeholder="NHẬP VỊ TRÍ CHI TIẾT..." 
                                    />
                                    <button 
                                        onClick={handleGetLocation} 
                                        disabled={isGettingLocation} 
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:text-blue-400 rounded-xl transition-all active:scale-90"
                                        title="Lấy vị trí GPS"
                                    >
                                        {isGettingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Locate className="w-4 h-4" />}
                                    </button>
                                </div>
                                <button 
                                    onClick={handleOpenInMaps}
                                    disabled={!editForm.location && !project.location}
                                    className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] text-slate-400 dark:text-slate-500 hover:text-emerald-600 hover:border-emerald-200 transition-all active:scale-95 shadow-sm"
                                    title="Kiểm tra trên Google Maps"
                                >
                                    <MapIcon className="w-5 h-5" />
                                </button>
                              </div>
                          </div>
                      </div>

                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3 flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-amber-500" /> Mô tả chi tiết dự án</label>
                          <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="w-full px-6 py-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2.5rem] font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 h-32 resize-none shadow-sm transition-all" placeholder="GHI CHÚ CHI TIẾT VỀ QUY MÔ, TIẾN ĐỘ VÀ CÁC YÊU CẦU ĐẶC BIỆT CỦA CÔNG TRÌNH..." />
                      </div>
                  </div>

                  <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row justify-end gap-3 shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.04)] z-10">
                      <button onClick={() => setIsEditing(false)} className="order-2 md:order-1 px-8 py-4 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-red-600 dark:text-red-400 transition-colors">Hủy bỏ</button>
                      <button onClick={handleSaveProject} disabled={isSaving} className="order-1 md:order-2 px-12 py-4 bg-blue-600 text-white rounded-[1.5rem] text-xs font-black uppercase tracking-[0.25em] shadow-2xl shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                          CẬP NHẬT DỮ LIỆU
                      </button>
                  </div>
              </div>
          </div>
      )}

      {docFormOpen && (
          <div className="fixed inset-0 z-[500] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in duration-200">
                  {/* Modal Header */}
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
                      <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md">
                              <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base uppercase tracking-tight">
                                {editingDoc ? 'Cập Nhật Phiên Bản Tài Liệu' : 'Ban Hành Tài Liệu Mới'}
                            </h3>
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Dự án: {project.name}</p>
                          </div>
                      </div>
                      <button onClick={() => setDocFormOpen(false)} className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-550 transition-colors rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"><X className="w-6 h-6"/></button>
                  </div>

                  {/* Modal Body */}
                  <form onSubmit={handleSaveDoc} className="p-6 space-y-5 overflow-y-auto bg-slate-50 dark:bg-slate-800/50/50 flex-1 no-scrollbar-all">
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3">Tên tài liệu / Bản vẽ *</label>
                          <input 
                              type="text" 
                              required
                              value={docFormData.name || ''} 
                              onChange={e => setDocFormData({...docFormData, name: e.target.value})}
                              placeholder="Ví dụ: Thiết kế nội thất biệt thự v1.2"
                              className="w-full px-5 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-800 dark:text-slate-200 text-xs outline-none focus:ring-4 focus:ring-blue-100 shadow-sm transition-all" 
                          />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3">Phiên bản *</label>
                              <input 
                                  type="text" 
                                  required
                                  value={docFormData.version || ''} 
                                  placeholder="Ví dụ: v1.0"
                                  onChange={e => setDocFormData({...docFormData, version: e.target.value})}
                                  className="w-full px-5 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-mono text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-100 shadow-sm transition-all" 
                              />
                          </div>
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3">Ngày ban hành *</label>
                              <input 
                                  type="date" 
                                  required
                                  value={docFormData.issueDate || ''} 
                                  onChange={e => setDocFormData({...docFormData, issueDate: e.target.value})}
                                  className="w-full px-5 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-mono text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-100 shadow-sm transition-all" 
                              />
                          </div>
                      </div>

                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3">Mô tả chi tiết tài liệu</label>
                          <textarea 
                              value={docFormData.description || ''} 
                              onChange={e => setDocFormData({...docFormData, description: e.target.value})}
                              placeholder="Nhập ghi chú hoặc mô tả ngắn gọn về đặc điểm của tài liệu/bản vẽ kỹ thuật ban hành này..."
                              className="w-full px-5 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-medium text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-4 focus:ring-blue-100 h-24 resize-none shadow-sm transition-all" 
                          />
                      </div>

                      {/* File Upload Zone */}
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-3">Tài liệu đính kèm (Bản thiết kế/Hồ sơ)</label>
                          <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-6 flex flex-col items-center justify-center relative hover:border-blue-400 transition-colors">
                              {docFormData.fileUrl ? (
                                  <div className="text-center w-full">
                                      <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-500 mb-2">
                                          <Sparkles className="w-5 h-5 text-emerald-500" />
                                          <span className="text-xs font-black uppercase tracking-wider">Đã đính kèm bản vẽ thành công!</span>
                                      </div>
                                      <p className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 truncate max-w-xs mx-auto mb-3 font-mono">{docFormData.fileUrl}</p>
                                      <div className="flex items-center justify-center gap-2">
                                          <button 
                                              type="button"
                                              onClick={() => docFileInputRef.current?.click()} 
                                              className="px-4 py-1.5 bg-blue-50 dark:bg-slate-800/80 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:bg-blue-900/30 rounded-lg text-xs font-bold transition-all"
                                          >
                                              Chọn file khác
                                          </button>
                                          <button 
                                              type="button"
                                              onClick={() => setDocFormData({...docFormData, fileUrl: ''})} 
                                              className="px-4 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 rounded-lg text-xs font-bold transition-all"
                                          >
                                              Gỡ bỏ
                                          </button>
                                      </div>
                                  </div>
                              ) : (
                                  <div className="text-center cursor-pointer w-full" onClick={() => docFileInputRef.current?.click()}>
                                      <Camera className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto mb-2 opacity-60 animate-pulse" />
                                      <p className="text-xs font-bold text-slate-600 dark:text-slate-400 dark:text-slate-500">Nhấn vào đây để tải tài liệu lên</p>
                                      <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">Chấp nhận JPG, PNG, PDF hoặc bất kỳ tệp đính kèm nào</p>
                                  </div>
                              )}
                              <input 
                                  type="file" 
                                  ref={docFileInputRef} 
                                  className="hidden" 
                                  onChange={handleDocFileChange} 
                              />
                          </div>

                          {/* Upload Progress */}
                          {uploadProgress && (
                              <div className="mt-2 text-center bg-blue-50 dark:bg-slate-800/80/50 rounded-2xl p-3 border border-blue-100 dark:border-slate-700/30 flex items-center justify-center gap-2">
                                  <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
                                  <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">ĐANG TẢI LÊN STORAGE...</span>
                              </div>
                          )}
                      </div>

                      {/* Modal Footer */}
                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                          <button 
                              type="button" 
                              onClick={() => setDocFormOpen(false)} 
                              className="px-6 py-3.5 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-red-500 dark:text-red-400 transition-colors"
                          >
                              HỦY BỎ
                          </button>
                          <button 
                              type="submit" 
                              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg hover:shadow-blue-200 transition-all flex items-center justify-center gap-2"
                          >
                              <Save className="w-4 h-4" /> BAN HÀNH BẢN VẼ
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};
