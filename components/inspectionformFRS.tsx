import { getProxyImageUrl } from '../src/utils';

import ProxyImage from '../src/components/ProxyImage';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, Workshop, NCR } from '../types';
import { 
  Save, X, Camera, Image as ImageIcon, ChevronDown, 
  MapPin, Box, AlertTriangle, 
  Trash2, Info, LayoutList,
  AlertOctagon, FileText, QrCode,
  Ruler, Microscope, PenTool, Eraser, Loader2, Sparkles, CheckCircle2, History, Clock,
  Activity, ShieldCheck, CheckCircle, AlertCircle, ChevronRight
} from 'lucide-react';
import { fetchIpoByFactoryOrder, uploadQMSImage, fetchInspectionById } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';
import { QRScannerModal } from './QRScannerModal';
import { PersistenceService } from '../services/persistenceService';
import { FSR_CHECKLIST_TEMPLATE } from '../constants';

import { SignaturePad } from './SignaturePad';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  workshops: Workshop[];
  inspections: Inspection[];
  user: User;
  templates: Record<string, CheckItem[]>;
}

export const InspectionFormFRS: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, workshops, inspections, user, templates }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({ 
    ...initialData,
    id: initialData?.id || `FSR-${Date.now()}`, 
    date: initialData?.date || new Date().toISOString().split('T')[0], 
    status: initialData?.status || InspectionStatus.DRAFT, 
    items: initialData?.items || templates?.['FSR'] || FSR_CHECKLIST_TEMPLATE, 
    images: initialData?.images || [], 
    score: initialData?.score || 0, 
    signature: initialData?.signature || '', 
    inspectedQuantity: initialData?.inspectedQuantity || 0, 
    passedQuantity: initialData?.passedQuantity || 0, 
    failedQuantity: initialData?.failedQuantity || 0, 
    type: 'FSR',
    ma_nha_may: initialData?.ma_nha_may || '',
    headcode: initialData?.headcode || '',
    workshop: initialData?.workshop || '',
    so_luong_ipo: initialData?.so_luong_ipo || 0,
    ma_ct: initialData?.ma_ct || '',
    ten_ct: initialData?.ten_ct || '',
    ten_hang_muc: initialData?.ten_hang_muc || '',
    dvt: initialData?.dvt || ''
  });
  
  const [searchCode, setSearchCode] = useState(initialData?.ma_nha_may || initialData?.headcode || ''); 
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: { type: 'MAIN' | 'ITEM', itemId?: string }; } | null>(null);

  const [isMaCtManual, setIsMaCtManual] = useState(!initialData?.ma_ct);
  const [isTenCtManual, setIsTenCtManual] = useState(!initialData?.ten_ct);

  useEffect(() => {
    if (!formData.ma_ct) {
      setIsMaCtManual(true);
    }
  }, [formData.ma_ct]);

  useEffect(() => {
    if (!formData.ten_ct) {
      setIsTenCtManual(true);
    }
  }, [formData.ten_ct]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).current_ma_ct = formData.ma_ct || '';
    }
    return () => {
      if (typeof window !== 'undefined' && (window as any).current_ma_ct === formData.ma_ct) {
        (window as any).current_ma_ct = undefined;
      }
    };
  }, [formData.ma_ct]);

  useEffect(() => {
    PersistenceService.hasDraft('FSR', user.id).then(setHasDraft);
  }, []);

  useEffect(() => {
    if (formData.ma_nha_may || formData.headcode || (formData.items && formData.items.length > 0)) {
        PersistenceService.saveDraft('FSR', user.id, formData);
    }
  }, [formData]);

  const recoverDraft = async () => {
    const saved = await PersistenceService.getDraft('FSR', user.id);
    if (saved) {
      setFormData(saved as Inspection);
      setHasDraft(false);
      setIsMaCtManual(!saved.ma_ct);
      setIsTenCtManual(!saved.ten_ct);
    }
  };

  const clearDraft = () => {
    PersistenceService.clearDraft('FSR', user.id);
    setHasDraft(false);
  };

  const availableStages = useMemo(() => { 
      const wsCode = formData.workshop;
      if (!wsCode) return []; 
      const selectedWorkshop = workshops.find(ws => ws.code === wsCode); 
      return selectedWorkshop?.stages || []; 
  }, [formData.workshop, workshops]);

  const visibleItems = useMemo(() => { 
      if (!formData.inspectionStage) return (formData.items || []); 
      return (formData.items || []).filter(item => !item.stage || item.stage === formData.inspectionStage); 
  }, [formData.items, formData.inspectionStage]);
  
  const rates = useMemo(() => {
    const ins = parseFloat(String(formData.inspectedQuantity || 0));
    const pas = parseFloat(String(formData.passedQuantity || 0));
    const fai = parseFloat(String(formData.failedQuantity || 0));
    if (ins <= 0) return { passRate: '0.0', defectRate: '0.0' };
    return { 
        passRate: ((pas / ins) * 100).toFixed(1), 
        defectRate: ((fai / ins) * 100).toFixed(1) 
    };
  }, [formData.inspectedQuantity, formData.passedQuantity, formData.failedQuantity]);

  const historicalRecords = useMemo(() => {
    if (!searchCode) return [];
    return inspections
        .filter(ins => ins.type === 'FSR' && (ins.ma_nha_may === searchCode || ins.headcode === searchCode))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inspections, searchCode]);

  const lookupPlanInfo = async (code: string) => {
    if (!code) return;
    setIsLookupLoading(true);
    try {
        if (code.length === 9 || code.length === 13) {
            const res = await fetchIpoByFactoryOrder(code);
            const items = res?.items || (Array.isArray(res) ? res : []);
            if (items && items.length > 0) {
                const match = items[0];
                const fetchedMaCt = match.Ma_Tender || match.Project_name || '';
                const fetchedTenCt = match.Project_name || '';
                setFormData(prev => ({
                    ...prev,
                    ma_nha_may: match.ID_Factory_Order || code,
                    headcode: match.ID_Factory_Order || code,
                    ma_ct: fetchedMaCt || prev.ma_ct,
                    ten_ct: fetchedTenCt || prev.ten_ct,
                    ten_hang_muc: match.Material_description || prev.ten_hang_muc,
                    so_luong_ipo: Number(match.Quantity_IPO || match.so_luong_ipo || 0) || prev.so_luong_ipo,
                    dvt: match.Base_Unit || match.dvt || prev.dvt
                }));
                setSearchCode(match.ID_Factory_Order || code);
                setIsMaCtManual(!fetchedMaCt);
                setIsTenCtManual(!fetchedTenCt);
                return;
            }
        }
        alert("Không tìm thấy dữ liệu IPO cho mã này.");
        setIsMaCtManual(true);
        setIsTenCtManual(true);
    } catch (e) {
        console.error("Lookup error:", e);
        setIsMaCtManual(true);
        setIsTenCtManual(true);
    } finally {
        setIsLookupLoading(false);
    }
  };

  const handleInputChange = (field: keyof Inspection, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleItemChange = (index: number, field: keyof CheckItem, value: any) => {
    setFormData(prev => {
        const newItems = [...(prev.items || [])];
        if (newItems[index]) {
            newItems[index] = { ...newItems[index], [field]: value };
        }
        return { ...prev, items: newItems };
    });
  };

  const handleSubmit = async () => {
    const ins = Number(formData.inspectedQuantity || 0);
    const ipo = Number(formData.so_luong_ipo || 0);

    if (!formData.ma_ct || !formData.workshop || !formData.inspectionStage) { 
        alert("Vui lòng nhập đủ thông tin xưởng và chọn công đoạn."); 
        return; 
    }
    
    if (ins <= 0) { alert("Số lượng kiểm tra phải lớn hơn 0."); return; }

    setIsSaving(true);
    setUploadProgress(0);
    try {
        const entityId = formData.id || 'new';
        
        interface UploadTask {
            url: string;
            role: string;
            path: string;
            originalIndex?: number;
            itemId?: string;
        }

        const tasks: UploadTask[] = [];

        (formData.images || []).forEach((img, idx) => {
            if (img.startsWith('data:')) tasks.push({ url: img, role: 'MAIN', path: 'MAIN', originalIndex: idx });
        });

        (formData.items || []).forEach((item) => {
            (item.images || []).forEach((img, idx) => {
                if (img.startsWith('data:')) tasks.push({ url: img, role: 'ITEM', path: 'ITEM', itemId: item.id, originalIndex: idx });
            });
        });

        if (formData.signature?.startsWith('data:')) tasks.push({ url: formData.signature, role: 'SIGNATURE_QC', path: 'SIGNATURE' });

        const totalTasks = tasks.length;
        let completedCount = 0;

        const updateStateWithUrl = (task: UploadTask, serverUrl: string) => {
            setFormData(prev => {
                const next = { ...prev };
                if (task.path === 'MAIN' && task.originalIndex !== undefined) {
                    const nextImgs = [...(next.images || [])];
                    nextImgs[task.originalIndex] = serverUrl;
                    next.images = nextImgs;
                } else if (task.path === 'ITEM' && task.itemId) {
                    next.items = (next.items || []).map(it => it.id === task.itemId 
                        ? { ...it, images: (it.images || []).map((img, i) => i === task.originalIndex ? serverUrl : img) }
                        : it
                    );
                } else if (task.path === 'SIGNATURE') {
                    next.signature = serverUrl;
                }
                return next;
            });
        };

        if (totalTasks > 0) {
            await Promise.all(tasks.map(async (task) => {
                const serverUrl = await uploadQMSImage(task.url, { entityId, type: 'FSR', role: task.role });
                updateStateWithUrl(task, serverUrl);
                completedCount++;
                setUploadProgress(Math.round((completedCount / totalTasks) * 100));
            }));
        }

        const finalForm = formData;
            const itemsToSave = (finalForm.items || []).filter((it: any) => it.stage === finalForm.inspectionStage || !it.stage);
            const hasIssues = itemsToSave.some((it: any) => it.status === CheckStatus.FAIL || it.status === CheckStatus.CONDITIONAL);
            const finalStatus = hasIssues ? InspectionStatus.FLAGGED : InspectionStatus.PENDING;

            await onSave({ ...finalForm, 
                items: itemsToSave,
                status: finalStatus, 
                inspectorName: user.name, 
                updatedAt: new Date().toISOString() 
            } as Inspection);
            
            clearDraft();
            

    } catch (e: any) { 
        console.error("ISO-SAVE-FSR:", e);
        alert(`Lỗi lưu báo cáo: ${e.message || "Không xác định"}`); 
    } finally { 
        setIsSaving(false); 
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeUploadId) return;
    setIsProcessingImages(true);
    setImageUploadProgress(0);
    try {
        const uploadedUrls = await Promise.all(
            Array.from(files).map(async (file: File) => {
                return await uploadQMSImage(file, { 
                    entityId: formData.id || 'new', 
                    type: 'INSPECTION', 
                    role: activeUploadId === 'MAIN' ? 'MAIN' : 'ITEM' 
                }, undefined, undefined, (percent) => {
                    setImageUploadProgress(percent);
                });
            })
        );
        
        if (activeUploadId === 'MAIN') {
            setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...uploadedUrls] }));
        } else {
            setFormData(prev => ({ 
                ...prev, 
                items: prev.items?.map(i => 
                    i.id === activeUploadId 
                        ? { ...i, images: [...(i.images || []), ...uploadedUrls] } 
                        : i
                ) 
            }));
        }
    } catch (err) { 
        console.error("ISO-UPLOAD: Failed", err); 
        alert("Lỗi tải ảnh lên.");
    } finally { 
        setIsProcessingImages(false); 
        setImageUploadProgress(null);
        e.target.value = ''; 
    }
  };

  const handleEditImage = (type: 'MAIN' | 'ITEM', images: string[], index: number, itemId?: string) => { setEditorState({ images, index, context: { type, itemId } }); };
  const onImageSave = async (idx: number, updatedImg: string) => {
      if (!editorState) return;
      const { type, itemId } = editorState.context;
      setIsProcessingImages(true);
      setImageUploadProgress(0);
      try {
          // Convert base64 to File
          const res = await fetch(updatedImg);
          const blob = await res.blob();
          const file = new File([blob], `edited_${Date.now()}.jpg`, { type: 'image/jpeg' });
          
          // Upload immediately
          const uploadedUrl = await uploadQMSImage(file, { 
              entityId: formData.id || 'new', 
              type: 'INSPECTION', 
              role: type === 'MAIN' ? 'MAIN' : 'ITEM' 
          }, undefined, undefined, (percent) => {
              setImageUploadProgress(percent);
          });

          if (type === 'MAIN') { 
              setFormData(prev => { 
                  const newImgs = [...(prev.images || [])]; 
                  newImgs[idx] = uploadedUrl; 
                  return { ...prev, images: newImgs }; 
              }); 
          }
          else if (type === 'ITEM' && itemId) { 
              setFormData(prev => ({ 
                  ...prev, 
                  items: prev.items?.map(i => i.id === itemId 
                      ? { ...i, images: i.images?.map((img, imIdx) => imIdx === idx ? uploadedUrl : img) } 
                      : i) 
              })); 
          }
      } catch (err) { 
          alert("Lỗi lưu ảnh chỉnh sửa."); 
      } finally { 
          setIsProcessingImages(false); 
          setImageUploadProgress(null);
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
                          <span className="text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-bold">Dữ liệu FSR bạn đang nhập chưa được lưu.</span>
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
                      {isSaving ? (
                          <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono tracking-tighter">{uploadProgress}%</span>
                          </div>
                      ) : isProcessingImages && imageUploadProgress !== null ? (
                          <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono tracking-tighter">{imageUploadProgress}%</span>
                          </div>
                      ) : (
                          <Loader2 className="absolute w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
                      )}
                  </div>
                  <p className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest text-center">
                      {isLookupLoading ? "Đang truy xuất dữ liệu..." : isSaving ? "Đang tải dữ liệu & ảnh..." : isProcessingImages ? "Đang tải ảnh..." : "Đang xử lý hình ảnh..."}
                  </p>
                  {isProcessingImages && imageUploadProgress !== null && (
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden shadow-inner">
                          <div 
                              className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-300" 
                              style={{ width: `${imageUploadProgress}%` }}
                          />
                      </div>
                  )}
              </div>
          </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar bg-slate-50 dark:bg-slate-800/50 pb-28">
        
        <section className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <div className="flex justify-between items-center border-b border-blue-50 pb-2 mb-1">
                <h3 className="text-blue-800 font-bold uppercase tracking-widest flex items-center gap-2 text-[11px]"><Box className="w-3.5 h-3.5"/> I. THÔNG TIN SẢN PHẨM</h3>
                <button onClick={() => setShowHistory(true)} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full font-bold uppercase tracking-widest flex items-center gap-1 text-[9px]" type="button"><History className="w-3 h-3" /> Lịch sử ({historicalRecords.length})</button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="space-y-0.5">
                    <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Mã định danh (Mã NM)</label>
                    <div className="relative flex items-center">
                        <input 
                            value={searchCode || ''} 
                            onChange={e => { setSearchCode(e.target.value); setFormData(prev => ({ ...prev, ma_nha_may: e.target.value, headcode: e.target.value })); }} 
                            onBlur={() => lookupPlanInfo(searchCode || '')} 
                            onKeyDown={e => e.key === 'Enter' && lookupPlanInfo(searchCode || '')}
                            className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md focus:ring-1 ring-blue-100 outline-none font-bold text-[11px]" 
                            placeholder="Quét/Nhập mã..."
                        />
                        <button onClick={() => setShowScanner(true)} className="absolute right-1 p-1 text-slate-400 dark:text-slate-500" type="button"><QrCode className="w-3.5 h-3.5"/></button>
                    </div>
                </div>
                <div className="space-y-0.5">
                    <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Mã dự án</label>
                    <input 
                        value={formData.ma_ct || ''} 
                        readOnly={!isMaCtManual}
                        onChange={isMaCtManual ? e => handleInputChange('ma_ct', e.target.value) : undefined}
                        className={`w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-md font-bold text-[11px] ${!isMaCtManual ? 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 shadow-inner' : 'bg-white dark:bg-slate-900 focus:ring-1 ring-blue-100 outline-none text-slate-800 dark:text-slate-200'}`}
                    />
                </div>
                <div className="space-y-0.5">
                    <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tên công trình</label>
                    <input 
                        value={formData.ten_ct || ''} 
                        readOnly={!isTenCtManual}
                        onChange={isTenCtManual ? e => handleInputChange('ten_ct', e.target.value) : undefined}
                        className={`w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-md font-bold text-[11px] ${!isTenCtManual ? 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 shadow-inner' : 'bg-white dark:bg-slate-900 focus:ring-1 ring-blue-100 outline-none text-slate-800 dark:text-slate-200'}`}
                    />
                </div>
                <div className="space-y-0.5"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tên hạng mục</label><input value={formData.ten_hang_muc || ''} readOnly className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-400 font-bold shadow-inner text-[11px]"/></div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="space-y-0.5"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Số lượng IPO</label><input value={formData.so_luong_ipo ?? ''} readOnly className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md font-black text-blue-600 dark:text-blue-400 shadow-inner text-[11px]"/></div>
                <div className="space-y-0.5"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">ĐVT</label><input value={formData.dvt || 'PCS'} readOnly className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md text-slate-600 dark:text-slate-400 font-bold shadow-inner uppercase text-[11px]"/></div>
                <div className="space-y-0.5"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ngày kiểm</label><input type="date" value={formData.date || ''} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md font-bold shadow-inner text-[11px]"/></div>
                <div className="space-y-0.5"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">QC/QA</label><input value={formData.inspectorName || user.name || ''} readOnly className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md text-slate-600 dark:text-slate-400 font-bold shadow-inner uppercase text-[11px]"/></div>
            </div>
        </section>

        <section className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-2">
            <h3 className="text-blue-700 border-b border-blue-50 pb-2 mb-1 font-bold uppercase tracking-widest flex items-center gap-2 text-[11px]"><ImageIcon className="w-3.5 h-3.5"/> II. HÌNH ÁNH HIỆN TRƯỜNG</h3>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                <button onClick={() => { setActiveUploadId('MAIN'); cameraInputRef.current?.click(); }} className="w-16 h-16 bg-blue-50 dark:bg-slate-800 border-blue-200 dark:border-slate-700 rounded-lg flex flex-col items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 transition-all active:scale-95" type="button"><Camera className="w-5 h-5 mb-0.5"/><span className="font-bold uppercase text-[8px]">Camera</span></button>
                <button onClick={() => { setActiveUploadId('MAIN'); fileInputRef.current?.click(); }} className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 shrink-0 transition-all active:scale-95" type="button"><ImageIcon className="w-5 h-5 mb-0.5"/><span className="font-bold uppercase text-[8px]">Thiết bị</span></button>
                {formData.images?.map((img, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 group cursor-pointer" onClick={() => handleEditImage('MAIN', formData.images || [], idx)}>
                            <ProxyImage src={img} alt="Ảnh" className="w-full h-full object-cover" />
                            <button onClick={(e) => { e.stopPropagation(); setFormData({...formData, images: formData.images?.filter((_, i) => i !== idx)}); }} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-full md:opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button>
                        </div>
                ))}
            </div>
        </section>

        <section className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <h3 className="text-blue-700 border-b border-blue-50 pb-2 mb-1 font-bold uppercase tracking-widest flex items-center gap-2 text-[11px]"><MapPin className="w-3.5 h-3.5"/> III. ĐỊA ĐIỂM & SỐ LƯỢNG</h3>
            <div className="grid grid-cols-2 gap-2">
                 <div className="space-y-0.5">
                    <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Xưởng sản xuất</label>
                    <select value={formData.workshop || ''} onChange={e => handleInputChange('workshop', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 font-bold outline-none text-[11px]">
                        <option value="">-- Chọn xưởng --</option>
                        {workshops.map(ws => <option key={ws.code} value={ws.code}>{ws.name}</option>)}
                    </select>
                 </div>
                 <div className="space-y-0.5">
                    <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Công đoạn *</label>
                    <select value={formData.inspectionStage || ''} onChange={e => handleInputChange('inspectionStage', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 font-bold outline-none text-[11px]">
                        <option value="">-- Chọn giai đoạn --</option>
                        {availableStages.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                 </div>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center block">SL Kiểm tra</label>
                        <input onKeyDown={(e) => { 
    if(e.key === ',') { 
        e.preventDefault(); 
        alert('Vui lòng sử dụng dấu chấm (.) cho số thập phân'); 
    }
    // Also prevent invalid characters like 'e', '+', '-' if it's supposed to be positive numbers
    if (['e', 'E', '+', '-'].includes(e.key)) {
        e.preventDefault();
    }
}} type="text" inputMode="decimal" value={formData.inspectedQuantity ?? ''} onChange={e => handleInputChange('inspectedQuantity', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md font-bold text-[11px] text-center bg-white dark:bg-slate-900 shadow-sm" />
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-[9px] font-bold text-green-600 dark:text-green-500 uppercase tracking-wider">Đạt</label>
                            <span className="text-[8px] font-bold text-green-700">{rates.passRate}%</span>
                        </div>
                        <input onKeyDown={(e) => { 
    if(e.key === ',') { 
        e.preventDefault(); 
        alert('Vui lòng sử dụng dấu chấm (.) cho số thập phân'); 
    }
    // Also prevent invalid characters like 'e', '+', '-' if it's supposed to be positive numbers
    if (['e', 'E', '+', '-'].includes(e.key)) {
        e.preventDefault();
    }
}} type="text" inputMode="decimal" value={formData.passedQuantity ?? ''} onChange={e => handleInputChange('passedQuantity', e.target.value)} className="w-full px-2 py-1.5 border border-green-200 dark:border-green-800 rounded-md font-bold text-[11px] text-center bg-white dark:bg-slate-900" />
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">Lỗi</label>
                            <span className="text-[8px] font-bold text-red-700">{rates.defectRate}%</span>
                        </div>
                        <input onKeyDown={(e) => { 
    if(e.key === ',') { 
        e.preventDefault(); 
        alert('Vui lòng sử dụng dấu chấm (.) cho số thập phân'); 
    }
    // Also prevent invalid characters like 'e', '+', '-' if it's supposed to be positive numbers
    if (['e', 'E', '+', '-'].includes(e.key)) {
        e.preventDefault();
    }
}} type="text" inputMode="decimal" value={formData.failedQuantity ?? ''} onChange={e => handleInputChange('failedQuantity', e.target.value)} className="w-full px-2 py-1.5 border border-red-200 rounded-md font-bold text-[11px] text-center bg-white dark:bg-slate-900" />
                    </div>
                </div>
            </div>
        </section>

        <div className="space-y-2">
            <h3 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2 border-b border-slate-300 dark:border-slate-600 pb-2 px-1 text-[11px]"><LayoutList className="w-3.5 h-3.5 text-blue-600"/> IV. NỘI DUNG KIỂM TRA FSR ({visibleItems.length})</h3>
            <div className="space-y-3">
                {visibleItems.map((item, originalIndex) => {
                    const actualIndex = formData.items?.findIndex(i => i.id === item.id) ?? -1;
                    return (
                        <div key={item.id} className={`bg-white dark:bg-slate-900 rounded-xl p-3 border shadow-sm ${item.status === CheckStatus.FAIL ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                            <div className="flex justify-between items-start mb-2 border-b border-slate-50 pb-2">
                                <div className="flex-1">
                                    <span className="bg-slate-100 dark:bg-slate-800 text-[8px] font-black uppercase text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 tracking-widest">{item.category}</span>
                                    <p className="w-full font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-tight mt-1">{item.label}</p>
                                </div>
                                <button onClick={() => setFormData({...formData, items: formData.items?.filter(it => it.id !== item.id)})} className="p-1 text-slate-300 hover:text-red-500" type="button"><Trash2 className="w-3.5 h-3.5"/></button>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center">
                                <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg gap-0.5 border border-slate-200 dark:border-slate-700 w-fit">
                                    {[CheckStatus.PASS, CheckStatus.FAIL].map(st => (
                                        <button key={st} onClick={() => handleItemChange(actualIndex, 'status', st)} className={`px-2 py-1.5 rounded-md font-bold uppercase transition-all text-[9px] ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white' : 'bg-red-600 text-white') : 'text-slate-400 dark:text-slate-500 hover:bg-white dark:bg-slate-900'}`} type="button">{st === CheckStatus.PASS ? 'Đạt' : 'Hỏng'}</button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-1 ml-auto">
                                    <div className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 cursor-pointer" onClick={() => { setActiveUploadId(item.id); fileInputRef.current?.click(); }}><ImageIcon className="w-4 h-4"/></div>
                                    <div className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 cursor-pointer" onClick={() => { setActiveUploadId(item.id); cameraInputRef.current?.click(); }}><Camera className="w-4 h-4"/></div>
                                </div>
                            </div>
                            <textarea value={item.notes || ''} onChange={e => handleItemChange(actualIndex, 'notes', e.target.value)} className="w-full mt-2 p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-lg font-medium outline-none h-12 shadow-inner text-[11px]" placeholder="Ghi chú kỹ thuật..."/>
                            {item.images && item.images.length > 0 && (
                                <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar py-1">
                                    {item.images.map((im, i) => (
                                        <div key={i} className="relative w-12 h-12 shrink-0 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden group cursor-pointer" onClick={() => handleEditImage('ITEM', item.images || [], i, item.id)}>
                                            <ProxyImage src={im} alt="Ảnh lỗi" className="w-full h-full object-cover" />
                                            <button onClick={(e) => { e.stopPropagation(); const newImgs = item.images?.filter((_, idx) => idx !== i); handleItemChange(actualIndex, 'images', newImgs); }} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 md:opacity-0 group-hover:opacity-100 transition-opacity" type="button"><X className="w-2.5 h-2.5"/></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

        <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mt-3">
            <h3 className="text-blue-700 border-b border-blue-50 pb-2 mb-3 font-bold uppercase tracking-widest flex items-center gap-2 text-[11px]"><PenTool className="w-3.5 h-3.5"/> V. CHỮ KÝ XÁC NHẬN</h3>
            <div className="mb-4"><label className="block text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Ghi chú QC</label><textarea value={formData.summary || ''} onChange={e => handleInputChange('summary', e.target.value)} className="w-full p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-1 ring-blue-100 outline-none h-20 resize-none" placeholder="Ghi chú thêm..."/></div>
            <SignaturePad 
                label={`QC Ký Tên (${user.name})`} 
                value={formData.signature} 
                onChange={sig => setFormData({...formData, signature: sig})} 
                uploadContext={{ entityId: formData.id || 'new', type: 'INSPECTION', role: 'SIGNATURE_QC' }}
            />
        </section>
      </div>

      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between gap-4 sticky bottom-0 z-40 shadow-lg">
        <button onClick={onCancel} className="px-6 py-2 text-slate-500 font-bold uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all border border-slate-200 text-[10px]" type="button">Hủy</button>
        <button onClick={handleSubmit} disabled={isSaving || isProcessingImages} className="flex-1 bg-blue-700 text-white font-black uppercase tracking-[0.2em] rounded-xl shadow-lg hover:bg-blue-800 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-[10px] py-3">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            <span>GỬI DUYỆT FSR</span>
        </button>
      </div>

      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => lookupPlanInfo(data)} />}
      {editorState && <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} onSave={onImageSave} readOnly={false}/>}
      <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
    </div>
  );
};

export default InspectionFormFRS;
