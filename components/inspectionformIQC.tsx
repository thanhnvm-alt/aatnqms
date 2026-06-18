
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, MaterialIQC, ModuleId, SupportingDoc, Material } from '../types';
import { 
  Save, X, Box, FileText, QrCode, Loader2, Building2, 
  Calendar, PenTool, Eraser, Plus, Trash2, 
  Camera, Image as ImageIcon, ClipboardList, ChevronDown, 
  ChevronUp, MessageCircle, History, FileCheck, Search, AlertCircle, Maximize2,
  Layers, Briefcase, Hash, CheckSquare, Square, Info, ShieldCheck, CheckCircle, AlertTriangle
} from 'lucide-react';
import { fetchProjects, fetchDefectLibrary, saveDefectLibraryItem, fetchPlans, uploadQMSImage, fetchMaterials } from '../services/apiService';
import { QRScannerModal } from './QRScannerModal';
import { ImageEditorModal } from './ImageEditorModal';
import { compressImage } from '../services/imageService';
import { PersistenceService } from '../services/persistenceService';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  inspections: Inspection[];
  user: User;
  templates: Record<string, CheckItem[]>;
}

const SUPPORTING_DOC_TEMPLATES = [
    "Bản vẽ có chữ ký xác nhận",
    "Spec",
    "Chứng nhận test nguyên vật liệu",
    "Rập cỡ có chữ ký xác nhận",
    "Mẫu màu",
    "Phiếu thông tin chi tiết các yêu cầu đặt mua nguyên vật liệu",
    "Mẫu đối chứng"
];

const UNIT_OPTIONS = [
    "PCS", "M2", "M3", "MÉT", "CHAI", "LỌ", "THÙNG", "PHUY", "FIT", "TUÝP", "BỘ", "CẶP", "KG", "LÍT"
];

import { SignaturePad } from './SignaturePad';
import { getProxyImageUrl } from '../src/utils';

export const InspectionFormIQC: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, inspections, user, templates }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({
    ...initialData,
    id: initialData?.id || `IQC-${Date.now()}`,
    type: 'IQC' as ModuleId,
    date: initialData?.date || new Date().toISOString().split('T')[0],
    status: initialData?.status || InspectionStatus.DRAFT,
    materials: initialData?.materials || [],
    supportingDocs: initialData?.supportingDocs || SUPPORTING_DOC_TEMPLATES.map(name => ({ id: `doc_${Math.random()}`, name, verified: false })),
    referenceDocs: initialData?.referenceDocs || [],
    inspectorName: initialData?.inspectorName || user.name,
    po_number: initialData?.po_number || '', 
    ma_ct: initialData?.ma_ct || '',        
    supplier: initialData?.supplier || '',
    location: initialData?.location || '',
    reportImages: initialData?.reportImages || [],
    deliveryNoteImages: initialData?.deliveryNoteImages || [],
    summary: initialData?.summary || '',
    images: initialData?.images || [],
    score: initialData?.score || 0
  });

  const [isSaving, setIsSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [matSearch, setMatSearch] = useState('');
  const [matSearchInput, setMatSearchInput] = useState('');

  const handleCommitMatSearch = () => {
      setMatSearch(matSearchInput);
  };

  const handleKeyDownMatSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          handleCommitMatSearch();
      }
  };
  
  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadContext, setActiveUploadContext] = useState<{ type: 'MAIN' | 'DELIVERY' | 'REPORT' | 'ITEM' | 'MATERIAL', matIdx?: number, itemIdx?: number } | null>(null);

  useEffect(() => {
    PersistenceService.hasDraft('IQC', user.id).then(setHasDraft);
  }, []);

  useEffect(() => {
    if (formData.po_number || (formData.materials && formData.materials.length > 0)) {
      PersistenceService.saveDraft('IQC', user.id, formData);
    }
  }, [formData]);

  const recoverDraft = async () => {
    const saved = await PersistenceService.getDraft('IQC', user.id);
    if (saved) {
      setFormData(saved as Inspection);
      setHasDraft(false);
    }
  };

  const clearDraft = () => {
    PersistenceService.clearDraft('IQC', user.id);
    setHasDraft(false);
  };

  const iqcGroups = useMemo(() => {
      const iqcTpl = templates['IQC'] || [];
      return Array.from(new Set(iqcTpl.map(i => i.category))).filter(Boolean).sort();
  }, [templates]);

  const filteredMaterials = useMemo(() => {
      if (!matSearch.trim()) return formData.materials || [];
      const s = matSearch.toLowerCase().trim();
      return (formData.materials || []).filter(m => 
          (m.name || '').toLowerCase().includes(s) || 
          (m.projectCode || '').toLowerCase().includes(s) ||
          (m.category || '').toLowerCase().includes(s)
      );
  }, [formData.materials, matSearch]);

  const handlePoBlur = async () => {
    if (!formData.po_number || formData.po_number.length < 3) return;
    setIsLookupLoading(true);
    try {
      const result = await fetchMaterials(formData.po_number);
      if (result && result.items && result.items.length > 0) {
        const materials = result.items as Material[];
        const matIqc: MaterialIQC[] = materials.map(m => {
          const hasProject = !!(m.Ma_Tender || m.projectName);
          return {
            id: m.id,
            name: m.shortText || m.material,
            category: 'Vật tư',
            inspectType: 'AQL',
            scope: hasProject ? 'PROJECT' : 'COMMON',
            projectCode: m.Ma_Tender || (hasProject ? '' : 'Dùng Chung'),
            projectName: m.projectName || (hasProject ? '' : 'VẬT TƯ KHO DÙNG CHUNG'),
            orderQty: m.orderQuantity,
            deliveryQty: m.orderQuantity,
            unit: m.orderUnit,
            criteria: [],
            items: [],
            inspectQty: m.orderQuantity,
            passQty: 0,
            failQty: 0,
            images: [],
            type: 'Material',
            date: new Date().toISOString()
          };
        });

        const supplier = materials[0].supplierName;
        const firstMat = materials[0];
        setFormData(prev => ({ 
            ...prev, 
            supplier: supplier || prev.supplier, 
            ma_ct: firstMat.Ma_Tender || firstMat.projectName || prev.ma_ct,
            ten_ct: firstMat.projectName || prev.ten_ct,
            materials: matIqc 
        }));
      }
    } catch (e) {
      console.error(e);
      alert("Không tìm thấy thông tin PO.");
    } finally {
      setIsLookupLoading(false);
    }
  };

  const handleInputChange = (field: keyof Inspection, value: any) => { 
    setFormData(prev => ({ ...prev, [field]: value })); 
  };

  const lookupMaterialProject = async (code: string, matIdx: number) => {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 3) return;
    setIsLookupLoading(true);
    try {
      const response = await fetchPlans(cleanCode, 1, 10);
      const match = (response.items || []).find((p: any) => (p.ma_ct || '').toUpperCase() === cleanCode || (p.ma_nha_may || '').toUpperCase() === cleanCode);
      if (match) {
        setFormData(prev => {
            const nextMats = [...(prev.materials || [])];
            if (nextMats[matIdx]) { nextMats[matIdx].projectName = match.ten_ct; nextMats[matIdx].projectCode = match.ma_ct; }
            return { ...prev, materials: nextMats, ma_ct: prev.ma_ct || match.ma_ct };
        });
      }
    } catch (e) { console.error(e); } finally { setIsLookupLoading(false); }
  };
  
  const handleAddMaterial = () => {
    const newMaterial: MaterialIQC = {
        id: `mat-${Date.now()}`,
        name: '',
        category: '',
        inspectType: '100%',
        scope: 'COMMON',
        projectCode: 'DÙNG CHUNG',
        projectName: 'VẬT TƯ KHO DÙNG CHUNG',
        orderQty: 0,
        deliveryQty: 0,
        unit: 'PCS',
        criteria: [],
        items: [],
        inspectQty: 0,
        passQty: 0,
        failQty: 0,
        images: [],
        type: 'AQL',
        date: new Date().toISOString().split('T')[0]
    };
    setFormData(prev => ({ ...prev, materials: [...(prev.materials || []), newMaterial] }));
    setExpandedMaterial(newMaterial.id);
  };

  const updateMaterial = (idx: number, field: keyof MaterialIQC, value: any) => {
    setFormData(prev => {
        const nextMaterials = [...(prev.materials || [])];
        if (!nextMaterials[idx]) return prev;
        let val = value;
        if (['orderQty', 'deliveryQty', 'inspectQty', 'passQty', 'failQty'].includes(field)) { val = parseFloat(String(value)) || 0; }
        let mat = { ...nextMaterials[idx], [field]: val };
        if (field === 'inspectQty') { if (val > mat.deliveryQty) val = mat.deliveryQty; if (val < 0) val = 0; mat.inspectQty = val; mat.passQty = val; mat.failQty = 0; }
        else if (field === 'passQty') { if (val > mat.inspectQty) val = mat.inspectQty; if (val < 0) val = 0; mat.passQty = val; mat.failQty = Number((mat.inspectQty - val).toFixed(2)); }
        else if (field === 'failQty') { if (val > mat.inspectQty) val = mat.inspectQty; if (val < 0) val = 0; mat.failQty = val; mat.passQty = Number((mat.inspectQty - val).toFixed(2)); }
        if (field === 'category') {
            const iqcTpl = templates['IQC'] || [];
            mat.items = iqcTpl.filter(i => i.category === value).map(i => ({ ...i, id: `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, status: CheckStatus.PENDING, notes: '', images: [] }));
        }
        
        if (field === 'scope') { 
            if (value === 'COMMON') { 
                mat.projectCode = 'Dùng Chung'; 
                mat.projectName = 'VẬT TƯ KHO DÙNG CHUNG'; 
            } else { 
                mat.projectCode = ''; 
                mat.projectName = ''; 
            } 
        }

        if (field === 'projectCode' && mat.scope === 'PROJECT') {
            if (val && val !== 'Dùng Chung') {
                mat.scope = 'PROJECT';
            } else if (!val || val === 'Dùng Chung') {
                mat.scope = 'COMMON';
                mat.projectCode = 'Dùng Chung';
                mat.projectName = 'VẬT TƯ KHO DÙNG CHUNG';
            }
        }
        nextMaterials[idx] = mat;
        return { ...prev, materials: nextMaterials };
    });
  };

  const updateMaterialItem = (matIdx: number, itemIdx: number, field: keyof CheckItem, value: any) => {
      const nextMaterials = [...(formData.materials || [])];
      if (!nextMaterials[matIdx]) return;
      const matItems = [...(nextMaterials[matIdx].items || [])];
      if (!matItems[itemIdx]) return;
      matItems[itemIdx] = { ...matItems[itemIdx], [field]: value };
      nextMaterials[matIdx].items = matItems;
      setFormData(prev => ({ ...prev, materials: nextMaterials }));
  };

  const toggleDoc = (id: string) => {
      setFormData(prev => ({ ...prev, supportingDocs: prev.supportingDocs?.map(d => d.id === id ? { ...d, verified: !d.verified } : d) }));
  };

  const addCustomDoc = () => {
      if (!newDocName.trim()) return;
      setFormData(prev => ({ ...prev, supportingDocs: [...(prev.supportingDocs || []), { id: `doc_${Date.now()}`, name: newDocName.trim(), verified: true }] }));
      setNewDocName('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeUploadContext) return;
    setIsProcessingImages(true);
    const { type, matIdx, itemIdx } = activeUploadContext;
    try {
        const compressedBase64s = await Promise.all(
            Array.from(files).map(async (file: File) => {
                return new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = async () => {
                        try {
                            const compressed = await compressImage(reader.result as string);
                            resolve(compressed);
                        } catch (e) {
                            resolve(reader.result as string); // Fallback
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            })
        );
        
        setFormData(prev => {
            if (type === 'MAIN') return { ...prev, images: [...(prev.images || []), ...compressedBase64s] };
            if (type === 'DELIVERY') return { ...prev, deliveryNoteImages: [...(prev.deliveryNoteImages || []), ...compressedBase64s] };
            if (type === 'REPORT') return { ...prev, reportImages: [...(prev.reportImages || []), ...compressedBase64s] };
            if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
                const nextMats = [...(prev.materials || [])];
                const items = [...nextMats[matIdx].items];
                items[itemIdx] = { ...items[itemIdx], images: [...(items[itemIdx].images || []), ...compressedBase64s] };
                nextMats[matIdx] = { ...nextMats[matIdx], items };
                return { ...prev, materials: nextMats };
            }
            if (type === 'MATERIAL' && matIdx !== undefined) {
                const nextMats = [...(prev.materials || [])];
                nextMats[matIdx] = { ...nextMats[matIdx], images: [...(nextMats[matIdx].images || []), ...compressedBase64s] };
                return { ...prev, materials: nextMats };
            }
            return prev;
        });
    } catch (err) { 
        console.error("ISO-LOCAL-STORAGE: Failed", err); 
        alert("Lỗi xử lý ảnh.");
    } finally { 
        setIsProcessingImages(false); 
        e.target.value = ''; 
    }
  };

  const onImageSave = async (idx: number, updatedImg: string) => {
      if (!editorState) return;
      const { type, matIdx, itemIdx } = editorState.context;
      
      const finalImg = updatedImg.startsWith('data:') ? await compressImage(updatedImg) : updatedImg;

      // Store the edited data URL directly in local state
      setFormData(prev => {
          if (type === 'MAIN') { const newImgs = [...(prev.images || [])]; newImgs[idx] = updatedImg; return { ...prev, images: newImgs }; }
          if (type === 'DELIVERY') { const newImgs = [...(prev.deliveryNoteImages || [])]; newImgs[idx] = updatedImg; return { ...prev, deliveryNoteImages: newImgs }; }
          if (type === 'REPORT') { const newImgs = [...(prev.reportImages || [])]; newImgs[idx] = updatedImg; return { ...prev, reportImages: newImgs }; }
          if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
              const nextMats = [...(prev.materials || [])];
              const items = [...nextMats[matIdx].items];
              const imgs = [...(items[itemIdx].images || [])];
              imgs[idx] = updatedImg;
              items[itemIdx] = { ...items[itemIdx], images: imgs };
              nextMats[matIdx] = { ...nextMats[matIdx], items };
              return { ...prev, materials: nextMats };
          }
          if (type === 'MATERIAL' && matIdx !== undefined) {
              const nextMats = [...(prev.materials || [])];
              const imgs = [...(nextMats[matIdx].images || [])];
              imgs[idx] = updatedImg;
              nextMats[matIdx] = { ...nextMats[matIdx], images: imgs };
              return { ...prev, materials: nextMats };
          }
          return prev;
      });
  };

  const handleSubmit = async () => {
    if (!formData.po_number || !formData.supplier) { alert("Vui lòng nhập Mã PO và Nhà cung cấp."); return; }
    if (!formData.signature) { alert("QC bắt buộc ký tên xác nhận báo cáo."); return; }
    const invalidMat = formData.materials?.find(m => m.inspectQty <= 0 || m.inspectQty > m.deliveryQty);
    if (invalidMat) { alert(`Vật tư "${invalidMat.name}" có số lượng kiểm tra không hợp lệ (phải > 0 và <= SL Giao).`); return; }
    
    setIsSaving(true);
    setUploadProgress(0);
    try {
        const entityId = formData.id || 'new';
        
        // Helper to prepare upload tasks
        interface UploadTask {
            url: string;
            role: string;
            path: string;
            matIndex?: number;
            itemIndex?: number;
            originalIndex?: number;
        }

        const tasks: UploadTask[] = [];

        // 1. Identify all base64 images
        (formData.images || []).forEach((img, idx) => {
            if (img.startsWith('data:')) tasks.push({ url: img, role: 'MAIN', path: 'MAIN', originalIndex: idx });
        });
        (formData.deliveryNoteImages || []).forEach((img, idx) => {
            if (img.startsWith('data:')) tasks.push({ url: img, role: 'DELIVERY', path: 'DELIVERY', originalIndex: idx });
        });
        (formData.reportImages || []).forEach((img, idx) => {
            if (img.startsWith('data:')) tasks.push({ url: img, role: 'REPORT', path: 'REPORT', originalIndex: idx });
        });
        if (formData.signature?.startsWith('data:')) tasks.push({ url: formData.signature, role: 'SIGNATURE_QC', path: 'SIGNATURE' });

        (formData.materials || []).forEach((mat, mIdx) => {
            (mat.images || []).forEach((img, idx) => {
                if (img.startsWith('data:')) tasks.push({ url: img, role: 'MATERIAL', path: 'MATERIAL', matIndex: mIdx, originalIndex: idx });
            });
            (mat.items || []).forEach((item, iIdx) => {
                (item.images || []).forEach((img, idx) => {
                    if (img.startsWith('data:')) tasks.push({ url: img, role: 'ITEM', path: 'ITEM', matIndex: mIdx, itemIndex: iIdx, originalIndex: idx });
                });
            });
        });

        const totalTasks = tasks.length;
        let completedCount = 0;

        // Function to update formData state and free memory
        const updateStateWithUrl = (task: UploadTask, serverUrl: string) => {
            setFormData(prev => {
                const next = { ...prev };
                if (task.path === 'MAIN' && task.originalIndex !== undefined) {
                    const nextImgs = [...(next.images || [])];
                    nextImgs[task.originalIndex] = serverUrl;
                    next.images = nextImgs;
                } else if (task.path === 'DELIVERY' && task.originalIndex !== undefined) {
                    const nextImgs = [...(next.deliveryNoteImages || [])];
                    nextImgs[task.originalIndex] = serverUrl;
                    next.deliveryNoteImages = nextImgs;
                } else if (task.path === 'REPORT' && task.originalIndex !== undefined) {
                    const nextImgs = [...(next.reportImages || [])];
                    nextImgs[task.originalIndex] = serverUrl;
                    next.reportImages = nextImgs;
                } else if (task.path === 'SIGNATURE') {
                    next.signature = serverUrl;
                } else if (task.path === 'MATERIAL' && task.matIndex !== undefined && task.originalIndex !== undefined) {
                    const nextMats = [...(next.materials || [])];
                    const mat = { ...nextMats[task.matIndex] };
                    const matImgs = [...(mat.images || [])];
                    matImgs[task.originalIndex] = serverUrl;
                    mat.images = matImgs;
                    nextMats[task.matIndex] = mat;
                    next.materials = nextMats;
                } else if (task.path === 'ITEM' && task.matIndex !== undefined && task.itemIndex !== undefined && task.originalIndex !== undefined) {
                    const nextMats = [...(next.materials || [])];
                    const mat = { ...nextMats[task.matIndex] };
                    const nextItems = [...(mat.items || [])];
                    const item = { ...nextItems[task.itemIndex] };
                    const itemImgs = [...(item.images || [])];
                    itemImgs[task.originalIndex] = serverUrl;
                    item.images = itemImgs;
                    nextItems[task.itemIndex] = item;
                    mat.items = nextItems;
                    nextMats[task.matIndex] = mat;
                    next.materials = nextMats;
                }
                return next;
            });
        };

        // Execute uploads in parallel but track progress
        if (totalTasks > 0) {
            await Promise.all(tasks.map(async (task) => {
                const serverUrl = await uploadQMSImage(task.url, { entityId, type: 'IQC', role: task.role });
                updateStateWithUrl(task, serverUrl);
                completedCount++;
                setUploadProgress(Math.round((completedCount / totalTasks) * 100));
            }));
        }

        // Final snap for saving
        setFormData(finalForm => {
            const totalInspected = (finalForm.materials || []).reduce((acc: number, mat: any) => acc + (Number(mat.inspectQty) || 0), 0);
            const totalPassed = (finalForm.materials || []).reduce((acc: number, mat: any) => acc + (Number(mat.passQty) || 0), 0);
            const totalFailed = (finalForm.materials || []).reduce((acc: number, mat: any) => acc + (Number(mat.failQty) || 0), 0);

            onSave({ 
                ...finalForm,
                status: InspectionStatus.PENDING,
                inspectedQuantity: totalInspected,
                passedQuantity: totalPassed,
                failedQuantity: totalFailed,
                updatedAt: new Date().toISOString() 
            } as Inspection);
            
            clearDraft();
            return finalForm;
        });

    } catch (e: any) { 
        console.error("ISO-SAVE: Error uploading images or saving", e);
        alert(`Lỗi lưu báo cáo IQC: ${e.message || "Không thể tải ảnh lên"}`); 
    } finally { 
        setIsSaving(false); 
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-800/50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      {hasDraft && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md animate-in slide-in-from-top-4 duration-500">
              <div className="bg-white dark:bg-slate-900/80 backdrop-blur-md border border-amber-200 p-3 rounded-2xl shadow-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                      <div className="bg-amber-100 p-1.5 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">Phát hiện bản nháp</span>
                          <span className="text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-bold">Dữ liệu IQC bạn đang nhập chưa được lưu.</span>
                      </div>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={clearDraft} className="px-2 py-1.5 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-red-500 dark:text-red-400">Xóa</button>
                      <button onClick={recoverDraft} className="px-3 py-1.5 bg-amber-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-md shadow-amber-200 active:scale-95 transition-all">Khôi phục</button>
                  </div>
              </div>
          </div>
      )}
      {(isProcessingImages || isLookupLoading || isSaving) && (
          <div className="absolute inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] shadow-2xl flex flex-col items-center gap-5 w-[80%] max-w-sm border border-white/20">
                  <div className="relative flex items-center justify-center">
                      <Loader2 className="w-16 h-16 text-blue-600 dark:text-blue-400 animate-spin opacity-20" />
                      {isSaving && (
                          <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono tracking-tighter">{uploadProgress}%</span>
                          </div>
                      )}
                      {!isSaving && <Loader2 className="absolute w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />}
                  </div>
                  
                  <div className="w-full space-y-2">
                    <p className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest text-center">
                        {isLookupLoading ? "Đang truy xuất dữ liệu Plan..." : isSaving ? "Đang tải dữ liệu & ảnh lên server..." : "Đang xử lý hình ảnh..."}
                    </p>
                    
                    {isSaving && (
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                            <div 
                                className="h-full bg-blue-600 transition-all duration-300 ease-out" 
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                    )}
                  </div>
              </div>
          </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-28">
        {/* I. General Information */}
        <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-blue-50 pb-2 mb-1">
                <h3 className="text-blue-800 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><Box className="w-4 h-4"/> I. THÔNG TIN QUẢN LÝ IQC</h3>
                <button onClick={() => setShowHistory(true)} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 dark:bg-blue-900/30 text-slate-600 dark:text-slate-400 dark:text-slate-500 rounded-lg font-bold uppercase text-[9px] flex items-center gap-1 shadow-sm" type="button"><History className="w-3 h-3" /> Lịch sử ({inspections.filter(i => i.id !== formData.id && i.po_number === formData.po_number).length})</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Mã PO / Chứng từ *</label><div className="relative flex items-center"><input value={formData.po_number || ''} onChange={e => handleInputChange('po_number', e.target.value.toUpperCase())} onBlur={handlePoBlur} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-1 ring-blue-500 outline-none font-bold text-[11px] h-9" placeholder="Nhập mã..."/><button onClick={() => setShowScanner(true)} className="absolute right-1 p-1 text-slate-400 dark:text-slate-500" type="button"><QrCode className="w-4 h-4"/></button></div></div>
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Nhà Cung Cấp *</label><div className="relative flex items-center"><input value={formData.supplier || ''} onChange={e => handleInputChange('supplier', e.target.value)} className="w-full px-2 py-1.5 pl-8 border border-slate-300 dark:border-slate-600 rounded-md font-bold focus:ring-1 ring-blue-500 outline-none text-[11px] h-9 uppercase" placeholder="Tên NCC..."/><Building2 className="absolute left-2 w-4 h-4 text-slate-400 dark:text-slate-500" /></div></div>
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Ngày kiểm tra</label><div className="relative flex items-center"><input type="date" value={formData.date || ''} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-2 py-1.5 pl-8 border border-slate-300 dark:border-slate-600 rounded-md font-bold outline-none text-[11px] h-9"/><Calendar className="absolute left-2 w-4 h-4 text-slate-400 dark:text-slate-500" /></div></div>
            </div>

            {/* Evidence Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-50">
                <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                    <label className="text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase flex items-center justify-between">Ảnh Hiện Trường<div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'MAIN' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-blue-600 dark:text-blue-400" type="button"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => { setActiveUploadContext({ type: 'MAIN' }); fileInputRef.current?.click(); }} className="p-1 hover:text-blue-600 dark:text-blue-400" type="button"><ImageIcon className="w-3 h-3"/></button></div></label>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">
                        {formData.images?.map((img, i) => (
                            <div key={i} className="relative group shrink-0">
                                <img src={getProxyImageUrl(img)} className="w-10 h-10 rounded border border-slate-200 dark:border-slate-700 object-cover cursor-zoom-in" onClick={() => setEditorState({ images: formData.images!, index: i, context: { type: 'MAIN' } })} />
                                <button
                                    onClick={() => setFormData(prev => ({ ...prev, images: prev.images?.filter((_, idx) => idx !== i) }))}
                                    className="absolute -top-1 -right-1 bg-red-500 text-white p-0.5 rounded-full md:opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                    type="button"
                                >
                                    <X className="w-2 h-2" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                    <label className="text-[8px] font-black text-indigo-600 uppercase flex items-center justify-between">Phiếu Giao Hàng<div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); fileInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><ImageIcon className="w-3 h-3"/></button></div></label>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">
                        {formData.deliveryNoteImages?.map((img, i) => (
                            <div key={i} className="relative group shrink-0">
                                <img src={getProxyImageUrl(img)} className="w-10 h-10 rounded border border-slate-200 dark:border-slate-700 object-cover cursor-zoom-in" onClick={() => setEditorState({ images: formData.deliveryNoteImages!, index: i, context: { type: 'DELIVERY' } })} />
                                <button
                                    onClick={() => setFormData(prev => ({ ...prev, deliveryNoteImages: prev.deliveryNoteImages?.filter((_, idx) => idx !== i) }))}
                                    className="absolute -top-1 -right-1 bg-red-500 text-white p-0.5 rounded-full md:opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                    type="button"
                                >
                                    <X className="w-2 h-2" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                    <label className="text-[8px] font-black text-emerald-600 uppercase flex items-center justify-between">Báo cáo NCC<div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-emerald-600" type="button"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); fileInputRef.current?.click(); }} className="p-1 hover:text-emerald-600" type="button"><ImageIcon className="w-3 h-3"/></button></div></label>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">
                        {formData.reportImages?.map((img, i) => (
                            <div key={i} className="relative group shrink-0">
                                <img src={getProxyImageUrl(img)} className="w-10 h-10 rounded border border-slate-200 dark:border-slate-700 object-cover cursor-zoom-in" onClick={() => setEditorState({ images: formData.reportImages!, index: i, context: { type: 'REPORT' } })} />
                                <button
                                    onClick={() => setFormData(prev => ({ ...prev, reportImages: prev.reportImages?.filter((_, idx) => idx !== i) }))}
                                    className="absolute -top-1 -right-1 bg-red-500 text-white p-0.5 rounded-full md:opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                    type="button"
                                >
                                    <X className="w-2 h-2" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Supporting Documents */}
            <div className="pt-4 border-t border-slate-50 space-y-3">
                <h3 className="text-slate-700 dark:text-slate-300 font-bold uppercase tracking-widest flex items-center gap-2 text-[10px] border-b border-slate-50 pb-2"><FileCheck className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400"/> DANH MỤC TÀI LIỆU HỖ TRỢ</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {(formData.supportingDocs || []).map(doc => (
                        <button key={doc.id} onClick={() => toggleDoc(doc.id)} className={`flex items-center gap-2 p-2 rounded-xl border transition-all text-left ${doc.verified ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-slate-700 text-blue-700 shadow-sm' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 opacity-60'}`} type="button">
                            {doc.verified ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" />}
                            <span className="text-[9px] font-bold uppercase leading-tight">{doc.name}</span>
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 pt-2">
                    <input value={newDocName || ''} onChange={e => setNewDocName(e.target.value)} className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-1 ring-blue-100" placeholder="Thêm tài liệu hỗ trợ khác..."/>
                    <button onClick={addCustomDoc} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all">Thêm</button>
                </div>
            </div>
        </section>

        {/* II. Materials Details */}
        <section className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-1">
                <h3 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2 text-xs">
                    <ClipboardList className="w-4 h-4 text-blue-600 dark:text-blue-400"/> II. DANH MỤC VẬT TƯ ({formData.materials?.length || 0})
                </h3>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Tìm vật tư..." 
                            value={matSearchInput}
                            onChange={e => setMatSearchInput(e.target.value)}
                            onBlur={handleCommitMatSearch}
                            onKeyDown={handleKeyDownMatSearch}
                            className="pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] w-48 outline-none focus:ring-1 ring-blue-100 shadow-sm"
                        />
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                    </div>
                    <button onClick={handleAddMaterial} className="bg-blue-600 text-white p-1.5 rounded-lg shadow active:scale-95 transition-all flex items-center gap-1.5 px-3 hover:bg-blue-700" type="button">
                        <Plus className="w-3 h-3"/> <span className="text-[10px] font-bold uppercase">Thêm Vật Tư</span>
                    </button>
                </div>
            </div>
            
            <div className="space-y-3">
                {filteredMaterials.map((mat, matIdx) => {
                    const isExp = expandedMaterial === mat.id;
                    const passRate = mat.inspectQty > 0 ? ((mat.passQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                    const hasFail = mat.items?.some(it => it.status === CheckStatus.FAIL);
                    const hasCond = mat.items?.some(it => it.status === CheckStatus.CONDITIONAL);
                    const allPass = (mat.items?.length || 0) > 0 && mat.items?.every(it => it.status === CheckStatus.PASS);
                    
                    return (
                    <div key={mat.id} className={`bg-white dark:bg-slate-900 rounded-xl border shadow-sm overflow-hidden animate-in zoom-in duration-200 ${allPass ? 'border-green-200 dark:border-green-800 ring-1 ring-green-50' : hasFail ? 'border-red-200 ring-1 ring-red-50' : 'border-slate-200 dark:border-slate-700'}`}>
                        <div className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${isExp ? 'bg-blue-50 dark:bg-blue-900/20/50 border-b border-blue-100 dark:border-slate-700' : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50'}`} onClick={() => setExpandedMaterial(isExp ? null : mat.id)}>
                            <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm ${isExp ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500'}`}>{matIdx + 1}</div>
                                <div className="flex-1 overflow-hidden">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight truncate text-xs">{mat.name || 'VẬT TƯ MỚI'}</h4>
                                        <div className="flex gap-1 shrink-0">
                                            {allPass && <span className="bg-green-600 text-white px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5"/> ĐẠT</span>}
                                            {hasFail && <span className="bg-red-600 text-white px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1 animate-pulse"><AlertTriangle className="w-2.5 h-2.5"/> NCR</span>}
                                            {hasCond && <span className="bg-amber-500 text-white px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1"><Info className="w-2.5 h-2.5"/> CĐK</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5"><span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">{mat.scope === 'COMMON' ? 'Dùng chung' : mat.projectCode}</span><span className="px-1.5 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-500 rounded text-[8px] font-bold uppercase border border-green-100">{passRate}% ĐẠT</span></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2"><button onClick={(e) => { e.stopPropagation(); if(window.confirm("Xóa mục này?")) setFormData(prev => ({ ...prev, materials: prev.materials?.filter((_, i) => i !== matIdx) })); }} className="p-1.5 text-slate-300 hover:text-red-600 dark:text-red-400" type="button"><Trash2 className="w-4 h-4"/></button>{isExp ? <ChevronUp className="w-5 h-5 text-blue-500 dark:text-blue-400"/> : <ChevronDown className="w-5 h-5 text-slate-300"/>}</div>
                        </div>
                        {isExp && (
                            <div className="p-4 space-y-4 bg-white dark:bg-slate-900 border-t border-slate-50">
                                {/* CLASSIFICATION MATRIX */}
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-12 gap-4 shadow-inner">
                                    <div className="md:col-span-3 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                            PHÂN LOẠI
                                        </label>
                                        <div className="relative">
                                            <select 
                                                value={mat.scope || 'COMMON'} 
                                                onChange={e => updateMaterial(matIdx, 'scope', e.target.value)}
                                                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-black text-[11px] h-10 uppercase outline-none focus:ring-2 ring-blue-100 transition-all appearance-none"
                                            >
                                                <option value="COMMON">DÙNG CHUNG</option>
                                                <option value="PROJECT">CÔNG TRÌNH</option>
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div className="md:col-span-3 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                            MÃ DỰ ÁN
                                        </label>
                                        <div className="relative flex items-center">
                                            <input 
                                                value={mat.projectCode || ''} 
                                                onChange={e => updateMaterial(matIdx, 'projectCode', e.target.value.toUpperCase())} 
                                                onBlur={() => mat.scope === 'PROJECT' && lookupMaterialProject(mat.projectCode || '', matIdx)}
                                                disabled={mat.scope === 'COMMON'}
                                                className={`w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-[11px] h-10 outline-none transition-all shadow-sm ${mat.scope === 'COMMON' ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500' : 'bg-white dark:bg-slate-900 focus:ring-2 ring-blue-100'}`} 
                                                placeholder="Mã CT..."
                                            />
                                        </div>
                                    </div>
                                    <div className="md:col-span-6 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                            TÊN CÔNG TRÌNH
                                        </label>
                                        <div className="relative flex items-center">
                                            <input 
                                                value={mat.projectName || ''} 
                                                readOnly 
                                                className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-[11px] h-10 text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase truncate" 
                                                placeholder="..."
                                            />
                                            {isLookupLoading && mat.scope === 'PROJECT' && <Loader2 className="absolute right-3 w-4 h-4 animate-spin text-blue-500 dark:text-blue-400" />}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-12 gap-3">
                                  <div className="col-span-4">
                                      <label className="text-[9px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Chủng loại</label>
                                      <div className="relative">
                                          <input 
                                              value={mat.category || ''} 
                                              onChange={e => {
                                                  const val = e.target.value;
                                                  updateMaterial(matIdx, 'category', val);
                                              }} 
                                              list={`category-list-${matIdx}`}
                                              className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-md font-bold outline-none text-[10px] h-9 bg-white dark:bg-slate-900 shadow-sm"
                                              placeholder="Tìm chủng loại..."
                                          />
                                          <datalist id={`category-list-${matIdx}`}>
                                              {iqcGroups.map(g => <option key={g} value={g} />)}
                                          </datalist>
                                          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-30">
                                              <Search className="w-3 h-3" />
                                          </div>
                                      </div>
                                  </div>
                                  <div className="col-span-3">
                                      <label className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest block mb-1">Loại kiểm</label>
                                      <select value={mat.inspectType || '100%'} onChange={e => updateMaterial(matIdx, 'inspectType', e.target.value as any)} className="w-full px-2 py-1.5 border border-blue-300 rounded-lg font-black text-[10px] h-9 bg-white dark:bg-slate-900 outline-none text-blue-700 shadow-sm"><option value="100%">100%</option><option value="AQL">AQL</option></select>
                                  </div>
                                  <div className="col-span-5">
                                      <label className="text-[9px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Tên Vật Tư *</label>
                                      <input value={mat.name || ''} onChange={e => updateMaterial(matIdx, 'name', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg font-bold focus:ring-1 ring-blue-500 outline-none text-[10px] h-9 shadow-sm" placeholder="Tên sản phẩm..."/>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase block text-center">Giao(DN)</label><input type="number" step="any" value={mat.deliveryQty ?? 0} onChange={e => updateMaterial(matIdx, 'deliveryQty', e.target.value)} className="w-full px-1 py-1 border border-slate-300 dark:border-slate-600 rounded-md font-bold text-center bg-white dark:bg-slate-900 text-[11px] h-7"/></div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase block text-center">DVT</label>
                                        <input list="unit-list" value={mat.unit || ''} onChange={e => updateMaterial(matIdx, 'unit', e.target.value)} className="w-full px-1 py-1 border border-slate-300 dark:border-slate-600 rounded-md font-black text-center bg-white dark:bg-slate-900 text-[11px] h-7 uppercase" placeholder="DVT..."/>
                                        <datalist id="unit-list">{UNIT_OPTIONS.map(opt => <option key={opt} value={opt} />)}</datalist>
                                    </div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase block text-center">Kiểm tra</label><input type="number" step="any" value={mat.inspectQty ?? 0} onChange={e => updateMaterial(matIdx, 'inspectQty', e.target.value)} className={`w-full px-1 py-1 border rounded-md font-bold text-center bg-white dark:bg-slate-900 text-[11px] h-7 ${mat.inspectQty > mat.deliveryQty || mat.inspectQty <= 0 ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-blue-300 text-blue-700'}`}/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-green-600 dark:text-green-500 uppercase block text-center">Đạt</label><input type="number" step="any" value={mat.passQty ?? 0} onChange={e => updateMaterial(matIdx, 'passQty', e.target.value)} className="w-full px-1 py-1 border border-green-300 rounded-md font-bold text-center text-green-700 bg-white dark:bg-slate-900 text-[11px] h-7"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase block text-center">Hỏng</label><input type="number" step="any" value={mat.failQty ?? 0} onChange={e => updateMaterial(matIdx, 'failQty', e.target.value)} className="w-full px-1 py-1 border border-red-300 rounded-md font-bold text-center text-red-700 bg-white dark:bg-slate-900 text-[11px] h-7"/></div>
                                </div>

                                <div className="space-y-3 mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                                    <div className="flex justify-between items-center px-1">
                                        <h5 className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
                                            <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400"/> DANH MỤC HẠNG MỤC KIỂM TRA
                                        </h5>
                                        <button 
                                            onClick={() => {
                                                const newItem: CheckItem = { 
                                                    id: `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                                    category: mat.category || '',
                                                    label: '',
                                                    status: CheckStatus.PENDING,
                                                    notes: '',
                                                    images: []
                                                };
                                                const nextMats = [...(formData.materials || [])];
                                                nextMats[matIdx] = { ...nextMats[matIdx], items: [...(nextMats[matIdx].items || []), newItem] };
                                                setFormData(prev => ({ ...prev, materials: nextMats }));
                                            }}
                                            className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-slate-800/80 rounded-lg"
                                            type="button"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {(mat.items || []).map((item, itemIdx) => (
                                        <div key={item.id} className={`bg-white dark:bg-slate-900 rounded-xl p-3 border shadow-sm ${item.status === CheckStatus.FAIL ? 'border-red-300 bg-red-50 dark:bg-red-900/20/10' : 'border-slate-200 dark:border-slate-700'}`}>
                                            <div className="flex justify-between items-start mb-2 border-b border-slate-50 pb-2">
                                                <div className="flex-1 pr-2">
                                                    <input 
                                                        value={item.label || ''} 
                                                        onChange={e => updateMaterialItem(matIdx, itemIdx, 'label', e.target.value)}
                                                        className="w-full font-bold bg-transparent outline-none text-slate-800 dark:text-slate-200 uppercase text-[11px]" 
                                                        placeholder="Tên hạng mục..." 
                                                    />
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        const nextMats = [...(formData.materials || [])];
                                                        nextMats[matIdx].items = (nextMats[matIdx].items || []).filter((_, i) => i !== itemIdx);
                                                        setFormData(prev => ({ ...prev, materials: nextMats }));
                                                    }}
                                                    className="p-1 text-slate-300 hover:text-red-500 dark:text-red-400 rounded-lg hover:bg-red-50 dark:bg-red-900/20"
                                                    type="button"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            
                                            <div className="space-y-2">
                                                <textarea 
                                                    value={item.notes || ''}
                                                    onChange={e => updateMaterialItem(matIdx, itemIdx, 'notes', e.target.value)}
                                                    className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] outline-none focus:ring-1 ring-blue-100"
                                                    placeholder="Ghi chú kết quả..."
                                                    rows={2}
                                                />
                                                
                                                <div className="flex flex-wrap gap-2 items-center justify-between">
                                                    <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg gap-0.5 border border-slate-200 dark:border-slate-700 w-fit">
                                                        {[CheckStatus.PASS, CheckStatus.FAIL, CheckStatus.CONDITIONAL].map(st => (
                                                            <button key={st} onClick={() => updateMaterialItem(matIdx, itemIdx, 'status', st)} className={`px-2 py-1.5 rounded-md font-bold uppercase transition-all text-[9px] ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-sm' : st === CheckStatus.FAIL ? 'bg-red-600 text-white shadow-sm' : 'bg-amber-500 text-white shadow-sm') : 'text-slate-400 dark:text-slate-500 hover:bg-white dark:bg-slate-900'}`} type="button">{st === CheckStatus.PASS ? 'Đạt' : st === CheckStatus.FAIL ? 'Hỏng' : 'CĐK'}</button>
                                                        ))}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); cameraInputRef.current?.click(); }} className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:text-blue-400" type="button"><Camera className="w-4 h-4"/></button>
                                                        <button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); fileInputRef.current?.click(); }} className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:text-blue-400" type="button"><ImageIcon className="w-4 h-4"/></button>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[30px]">
                                                    {(item.images || []).map((img, i) => (
                                                        <div key={i} className="relative group shrink-0">
                                                            <div className="cursor-zoom-in" onClick={() => setEditorState({ images: item.images || [], index: i, context: { type: 'ITEM', matIdx, itemIdx } })}>
                                                                <img src={getProxyImageUrl(img)} alt="Ảnh item" className="w-10 h-10 rounded border border-slate-200 dark:border-slate-700 object-cover shadow-sm" />
                                                            </div>
                                                            <button onClick={() => {
                                                                const nextMats = [...(formData.materials || [])];
                                                                const nextItems = [...(nextMats[matIdx].items || [])];
                                                                nextItems[itemIdx].images = nextItems[itemIdx].images?.filter((_, idx) => idx !== i);
                                                                nextMats[matIdx].items = nextItems;
                                                                setFormData(prev => ({ ...prev, materials: nextMats }));
                                                            }} className="absolute -top-1 -right-1 bg-red-500 text-white p-1 rounded-full md:opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"><X className="w-2.5 h-2.5"/></button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* MATERIAL IMAGES SECTION */}
                                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                                            <ImageIcon className="w-4 h-4"/> HÌNH ẢNH SẢN PHẨM
                                        </label>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => { setActiveUploadContext({ type: 'MATERIAL', matIdx }); cameraInputRef.current?.click(); }} 
                                                className="p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-indigo-600 active:scale-95 transition-all shadow-sm" 
                                                type="button"
                                            >
                                                <Camera className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => { setActiveUploadContext({ type: 'MATERIAL', matIdx }); fileInputRef.current?.click(); }} 
                                                className="p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-indigo-600 active:scale-95 transition-all shadow-sm" 
                                                type="button"
                                            >
                                                <ImageIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar min-h-[50px] py-2 px-1">
                                        {(mat.images || []).map((img, i) => (
                                            <div key={i} className="relative group shrink-0">
                                                <img 
                                                    src={getProxyImageUrl(img)} 
                                                    className="w-14 h-14 rounded-xl border border-slate-200 dark:border-slate-700 object-cover cursor-zoom-in shadow-md" 
                                                    onClick={() => setEditorState({ images: mat.images!, index: i, context: { type: 'MATERIAL', matIdx } })} 
                                                />
                                                <button
                                                    onClick={() => {
                                                        const nextMats = [...(formData.materials || [])];
                                                        const imgs = [...(nextMats[matIdx].images || [])];
                                                        imgs.splice(i, 1);
                                                        nextMats[matIdx].images = imgs;
                                                        setFormData(prev => ({ ...prev, materials: nextMats }));
                                                    }}
                                                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-1 rounded-full md:opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                                    type="button"
                                                >
                                                    <X className="w-2.5 h-2.5" />
                                                </button>
                                            </div>
                                        ))}
                                        {(!mat.images || mat.images.length === 0) && (
                                            <div className="flex-1 h-14 flex items-center justify-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-800/50/30">
                                                <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">CHƯA CÓ ẢNH SẢN PHẨM</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        )}
                    </div>
                );})}
            </div>
        </section>

        {/* III. Summary */}
        <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-2"><h3 className="text-blue-800 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><MessageCircle className="w-4 h-4"/> III. GHI CHÚ / TỔNG KẾT</h3><textarea value={formData.summary || ''} onChange={e => handleInputChange('summary', e.target.value)} className="w-full p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg font-medium text-slate-700 dark:text-slate-300 outline-none focus:bg-white dark:bg-slate-900 h-20 resize-none text-[11px]" placeholder="Nhập nhận xét tổng quan của QC..."/></section>
        
        {/* IV. QC Signature */}
        <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-blue-800 border-b border-blue-50 pb-2 mb-4 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><PenTool className="w-4 h-4"/> IV. XÁC NHẬN QC</h3>
          <SignaturePad 
            label={`QC Ký Tên (${user.name})`} 
            value={getProxyImageUrl(formData.signature)} 
            onChange={sig => setFormData({...formData, signature: sig})} 
            uploadContext={{ entityId: formData.id || 'new', type: 'INSPECTION', role: 'SIGNATURE_QC' }}
          />
        </section>
      </div>

      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 sticky bottom-0 z-40 shadow-sm pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <button onClick={onCancel} className="h-[44px] px-6 text-slate-500 dark:text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 rounded-xl transition-all border border-slate-200 dark:border-slate-700 text-[10px]" type="button">HỦY BỎ</button>
        <button onClick={handleSubmit} disabled={isSaving || isProcessingImages} className="h-[44px] flex-1 bg-blue-700 text-white font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-blue-800 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 text-[10px]" type="button">{isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}<span>GỬI DUYỆT BÁO CÁO IQC</span></button>
      </div>

      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { handleInputChange('po_number', data); setShowScanner(false); }} />}
      {editorState && <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} onSave={onImageSave} readOnly={false}/>}
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
    </div>
  );
};
