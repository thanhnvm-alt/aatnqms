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
  Activity, ShieldCheck, CheckCircle, AlertCircle, ChevronRight,
  Plus, Search
} from 'lucide-react';
import { fetchIpoByFactoryOrder, uploadQMSImage, fetchInspectionById } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';
import { QRScannerModal } from './QRScannerModal';
import { PersistenceService } from '../services/persistenceService';
import { FQC_CHECKLIST_TEMPLATE } from '../constants';

import { SignaturePad } from './SignaturePad';
import { Combobox } from '../src/components/qms';

const PRESET_ADDITIONAL_CRITERIA = [
  { category: 'Ngoại quan', label: 'Bề mặt sơn phẳng mịn, không bọt khí, bụi sơn' },
  { category: 'Ngoại quan', label: 'Không trầy xước, nứt vỡ, móp méo gỗ' },
  { category: 'Ngoại quan', label: 'Màu sắc đồng nhất với bảng mẫu chuẩn' },
  { category: 'Ngoại quan', label: 'Vệ sinh sạch sẽ toàn bộ mặt trong và mặt ngoài' },
  { category: 'Ngoại quan', label: 'Độ bóng/mờ sơn đồng đều trên toàn bộ sản phẩm' },
  { category: 'Ngoại quan', label: 'Vân gỗ tự nhiên hài hòa, không bị loang lổ' },
  { category: 'Kích thước', label: 'Kiểm tra kích thước tổng thể phủ bì sản phẩm' },
  { category: 'Kích thước', label: 'Độ vuông góc thùng tủ, mộng ghép và liên kết' },
  { category: 'Kích thước', label: 'Độ phẳng bề mặt bàn, cánh tủ và hông' },
  { category: 'Kích thước', label: 'Chiều dày vách, đáy, đợt và mặt cánh tủ' },
  { category: 'Kích thước', label: 'Khe hở đồng đều giữa các cánh tủ và hộc kéo' },
  { category: 'Kết cấu', label: 'Liên kết mộng, keo, vít chắc chắn, kín khít' },
  { category: 'Kết cấu', label: 'Sản phẩm đứng vững, không bập bênh hay rung lắc' },
  { category: 'Chức năng', label: 'Bản lề, ray giảm chấn trượt êm ái, hoạt động tốt' },
  { category: 'Chức năng', label: 'Khóa cửa, chốt an toàn và tay nắm hoạt động ổn định' },
  { category: 'Chức năng', label: 'Nút chân tăng đơ điều chỉnh cân bằng mặt sàn' },
  { category: 'Đóng gói', label: 'Quy cách đóng thùng carton đạt tiêu chuẩn bảo vệ hàng hóa' },
  { category: 'Đóng gói', label: 'Nhãn dán đầy đủ mã hàng, mã barcode và thông số' },
  { category: 'Đóng gói', label: 'Mút xốp chèn góc chắc chắn chống va đập' },
  { category: 'Đóng gói', label: 'Bộ phụ kiện và tờ hướng dẫn lắp ráp đi kèm đầy đủ' }
];

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  workshops: Workshop[];
  inspections: Inspection[];
  user: User;
  templates: Record<string, CheckItem[]>;
}

export const InspectionFormFQC: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, workshops, inspections, user, templates }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({ 
    ...initialData,
    id: initialData?.id || `FQC-${Date.now()}`, 
    date: initialData?.date || new Date().toISOString().split('T')[0], 
    status: initialData?.status || InspectionStatus.DRAFT, 
    items: initialData?.items || [], 
    images: initialData?.images || [], 
    score: initialData?.score || 0, 
    signature: initialData?.signature || '', 
    inspectedQuantity: initialData?.inspectedQuantity || 0, 
    passedQuantity: initialData?.passedQuantity || 0, 
    failedQuantity: initialData?.failedQuantity || 0, 
    type: 'FQC',
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
  
  const [showAddCriteriaModal, setShowAddCriteriaModal] = useState(false);
  const [criteriaSearch, setCriteriaSearch] = useState('');
  const [customCategory, setCustomCategory] = useState('Ngoại quan');
  const [customLabel, setCustomLabel] = useState('');

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
    PersistenceService.hasDraft('FQC', user.id).then(setHasDraft);
  }, []);

  useEffect(() => {
    if (formData.ma_nha_may || formData.headcode || (formData.items && formData.items.length > 0)) {
        PersistenceService.saveDraft('FQC', user.id, formData);
    }
  }, [formData]);

  const recoverDraft = async () => {
    const saved = await PersistenceService.getDraft('FQC', user.id);
    if (saved) {
      setFormData(saved as Inspection);
      setHasDraft(false);
    }
  };

  const clearDraft = () => {
    PersistenceService.clearDraft('FQC', user.id);
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
        .filter(ins => ins.type === 'FQC' && (ins.ma_nha_may === searchCode || ins.headcode === searchCode))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inspections, searchCode]);

  const lookupPlanInfo = async (code: string) => {
    const cleanCode = (code || '').trim();
    if (!cleanCode) return;
    setIsLookupLoading(true);
    try {
        const res = await fetchIpoByFactoryOrder(cleanCode);
        const items = res?.items || (Array.isArray(res) ? res : []);
        if (items && items.length > 0) {
            const match = items[0];
            const derivedMaCt = match.Ma_Tender || match.Project_name || prevMaCt(match.ID_Factory_Order || cleanCode);
            setFormData(prev => ({
                ...prev,
                ma_nha_may: match.ID_Factory_Order || cleanCode,
                headcode: match.ID_Factory_Order || cleanCode,
                ma_ct: match.Ma_Tender || match.Project_name || prev.ma_ct || match.ID_Factory_Order || cleanCode,
                ten_ct: match.Project_name || prev.ten_ct || '',
                ten_hang_muc: match.Material_description || prev.ten_hang_muc || '',
                so_luong_ipo: Number(match.Quantity_IPO || match.so_luong_ipo || 0) || prev.so_luong_ipo || 0,
                dvt: match.Base_Unit || match.dvt || prev.dvt || 'PCS'
            }));
            setSearchCode(match.ID_Factory_Order || cleanCode);
            return;
        }
        alert("Không tìm thấy dữ liệu IPO cho mã này.");
    } catch (e) {
        console.error("Lookup error:", e);
    } finally {
        setIsLookupLoading(false);
    }
  };

  function prevMaCt(fallback: string) {
    return formData.ma_ct || fallback;
  }

  const handleInputChange = (field: keyof Inspection, value: any) => {
    if (typeof value === 'string' && ['inspectedQuantity', 'passedQuantity', 'failedQuantity', 'orderQty', 'deliveryQty', 'inspectQty', 'passQty', 'failQty', 'so_luong_ipo'].includes(field)) {
        value = value.replace(/,/g, '.');
    } 
    setFormData(prev => {
        const next = { ...prev, [field]: value };
        if (field === 'workshop') {
            next.inspectionStage = '';
        }
        if (field === 'inspectionStage') {
            const fqcTemplate = templates['FQC'] || [];
            if (fqcTemplate.length > 0) {
               // Load items that belong to the selected stage, or all items if FQC template has no stage info
               const stageItems = fqcTemplate.filter(item => item.stage === value || !item.stage).map(item => ({ 
                   ...item, 
                   id: `fqc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, 
                   status: CheckStatus.PENDING, 
                   notes: '', 
                   images: [] 
               }));
               next.items = stageItems;
            }
        }
        return next;
    });
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
    const foCode = formData.ma_nha_may || formData.headcode || searchCode || '';

    if (!formData.workshop || !formData.inspectionStage) { 
        alert("Vui lòng chọn Xưởng sản xuất và Công đoạn kiểm tra."); 
        return; 
    }
    if (ins <= 0) { alert("Số lượng kiểm tra phải lớn hơn 0."); return; }

    const pas = Number(formData.passedQuantity || 0);
    const fai = Number(formData.failedQuantity || 0);
    if (pas + fai !== ins) {
        alert("Tổng số lượng Đạt và Lỗi phải đúng bằng Số lượng kiểm tra.");
        return;
    }

    setIsSaving(true);
    try {
        const entityId = formData.id || 'new';
        interface UploadTask { url: string; role: string; path: string; originalIndex?: number; itemId?: string; }
        const tasks: UploadTask[] = [];

        (formData.images || []).forEach((img, idx) => { if (img.startsWith('data:')) tasks.push({ url: img, role: 'MAIN', path: 'MAIN', originalIndex: idx }); });
        (formData.items || []).forEach((item) => {
            (item.images || []).forEach((img, idx) => { if (img.startsWith('data:')) tasks.push({ url: img, role: 'ITEM', path: 'ITEM', itemId: item.id, originalIndex: idx }); });
        });
        if (formData.signature?.startsWith('data:')) tasks.push({ url: formData.signature, role: 'SIGNATURE_QC', path: 'SIGNATURE' });

        const totalTasks = tasks.length;
        let completedCount = 0;
        const updateStateWithUrl = (task: UploadTask, serverUrl: string) => {
            setFormData(prev => {
                const next = { ...prev };
                if (task.path === 'MAIN' && task.originalIndex !== undefined) {
                    const nextImgs = [...(next.images || [])]; nextImgs[task.originalIndex] = serverUrl; next.images = nextImgs;
                } else if (task.path === 'ITEM' && task.itemId) {
                    next.items = (next.items || []).map(it => it.id === task.itemId 
                        ? { ...it, images: (it.images || []).map((img, i) => i === task.originalIndex ? serverUrl : img) } : it
                    );
                } else if (task.path === 'SIGNATURE') { next.signature = serverUrl; }
                return next;
            });
        };

        if (totalTasks > 0) {
            await Promise.all(tasks.map(async (task) => {
                const serverUrl = await uploadQMSImage(task.url, { entityId, type: 'FQC', role: task.role });
                updateStateWithUrl(task, serverUrl);
                completedCount++;
                setUploadProgress(Math.round((completedCount / totalTasks) * 100));
            }));
        }

        const effectiveMaCt = formData.ma_ct || foCode || '';
        const finalForm = {
            ...formData,
            ma_ct: effectiveMaCt,
            ma_nha_may: formData.ma_nha_may || foCode,
            headcode: formData.headcode || foCode
        };
        const itemsToSave = (finalForm.items || []).filter((it: any) => it.stage === finalForm.inspectionStage || !it.stage);
        const finalStatus = InspectionStatus.SUBMITTED;

        await onSave({ ...finalForm, items: itemsToSave, status: finalStatus, inspectorName: user.name, updatedAt: new Date().toISOString() } as Inspection);
        clearDraft();
            

    } catch (e: any) { 
        alert(`Lỗi lưu báo cáo: ${e.message || "Không xác định"}`); 
    } finally { setIsSaving(false); }
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
                  <div className="flex items-center gap-2"><div className="bg-amber-100 p-1.5 rounded-lg"><AlertCircle className="w-4 h-4 text-amber-600" /></div>
                  <div className="flex flex-col"><span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">Phát hiện bản nháp</span><span className="text-[8px] text-slate-500 dark:text-slate-400 font-bold">Dữ liệu FQC chưa được lưu.</span></div></div>
                  <div className="flex gap-2"><button type="button" onClick={clearDraft} className="min-h-[44px] lg:min-h-[34px] px-3 py-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest hover:text-red-500 rounded-xl">Xóa</button><button type="button" onClick={recoverDraft} className="min-h-[44px] lg:min-h-[34px] px-3.5 py-1.5 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-all">Khôi phục</button></div>
              </div>
          </div>
      )}
      {(isProcessingImages || isLookupLoading || isSaving) && (
          <div className="absolute inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] shadow-2xl flex flex-col items-center gap-5 w-[80%] max-w-sm border border-white/20">
                  <div className="relative flex items-center justify-center">
                      <Loader2 className="w-16 h-16 text-blue-600 animate-spin opacity-20" />
                      {isSaving ? (
                          <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-xl font-black text-blue-600 font-mono tracking-tighter">{uploadProgress}%</span>
                          </div>
                      ) : isProcessingImages && imageUploadProgress !== null ? (
                          <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-sm font-black text-blue-600 font-mono tracking-tighter">{imageUploadProgress}%</span>
                          </div>
                      ) : (
                          <Loader2 className="absolute w-8 h-8 text-blue-600 animate-spin" />
                      )}
                  </div>
                  <p className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest text-center">
                      {isLookupLoading ? "Đang truy xuất..." : isSaving ? "Đang lưu báo cáo..." : isProcessingImages ? "Đang tải ảnh..." : "Đang xử lý..."}
                  </p>
                  {isProcessingImages && imageUploadProgress !== null && (
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden shadow-inner">
                          <div 
                              className="bg-blue-600 h-full rounded-full transition-all duration-300" 
                              style={{ width: `${imageUploadProgress}%` }}
                          />
                      </div>
                  )}
              </div>
          </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar bg-slate-50 dark:bg-slate-800/50 pb-28">
        <section className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-blue-50 dark:border-slate-800 pb-2 mb-1">
                <h3 className="text-blue-800 dark:text-blue-400 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><Box className="w-4 h-4 shrink-0"/> I. THÔNG TIN SẢN PHẨM</h3>
                <button onClick={() => setShowHistory(true)} className="min-h-[44px] lg:min-h-[34px] px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full font-bold uppercase tracking-widest flex items-center gap-1.5 text-[10px] tabular-nums" type="button"><History className="w-3.5 h-3.5" /> Lịch sử ({historicalRecords.length})</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mã NM</label><div className="relative flex items-center"><input value={searchCode || ''} onChange={e => { setSearchCode(e.target.value); setFormData(prev => ({ ...prev, ma_nha_may: e.target.value, headcode: e.target.value })); }} onBlur={() => lookupPlanInfo(searchCode || '')} onKeyDown={e => e.key === 'Enter' && lookupPlanInfo(searchCode || '')} className="w-full pl-3 pr-12 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-1 ring-blue-100 outline-none font-bold text-xs min-h-[44px] lg:min-h-[38px]" placeholder="Quét/Nhập mã..."/><button onClick={() => setShowScanner(true)} className="absolute right-1 min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center text-slate-400 hover:text-blue-600 rounded-lg" type="button" aria-label="Quét QR"><QrCode className="w-4 h-4"/></button></div></div>
                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mã dự án</label><input value={formData.ma_ct || ''} readOnly className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 font-bold shadow-inner text-xs min-h-[44px] lg:min-h-[38px]"/></div>
                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tên công trình</label><input value={formData.ten_ct || ''} readOnly className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 font-bold shadow-inner text-xs min-h-[44px] lg:min-h-[38px]"/></div>
                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hạng mục</label><input value={formData.ten_hang_muc || ''} readOnly className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 font-bold shadow-inner text-xs min-h-[44px] lg:min-h-[38px]"/></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">SL IPO</label><input value={formData.so_luong_ipo ?? ''} readOnly className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-black text-blue-600 dark:text-blue-400 shadow-inner text-xs min-h-[44px] lg:min-h-[38px] tabular-nums"/></div>
                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ĐVT</label><input value={formData.dvt || 'PCS'} readOnly className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-bold shadow-inner uppercase text-xs min-h-[44px] lg:min-h-[38px]"/></div>
                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ngày kiểm</label><input type="date" value={formData.date || ''} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg font-bold shadow-inner text-xs min-h-[44px] lg:min-h-[38px] tabular-nums"/></div>
                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">QC/QA</label><input value={formData.inspectorName || user.name || ''} readOnly className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-bold shadow-inner uppercase text-xs min-h-[44px] lg:min-h-[38px]"/></div>
            </div>
        </section>

        <section className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-2">
            <h3 className="text-blue-700 dark:text-blue-400 border-b border-blue-50 dark:border-slate-800 pb-2 mb-1 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><ImageIcon className="w-4 h-4"/> II. HÌNH ẢNH HIỆN TRƯỜNG</h3>
            <div className="flex gap-2.5 overflow-x-auto py-1.5 pr-1.5 no-scrollbar">
                <button onClick={() => { setActiveUploadId('MAIN'); cameraInputRef.current?.click(); }} className="min-w-[68px] min-h-[68px] bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl flex flex-col items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 transition-all active:scale-95" type="button"><Camera className="w-5 h-5 mb-1"/><span className="font-bold uppercase text-[9px]">Camera</span></button>
                <button onClick={() => { setActiveUploadId('MAIN'); fileInputRef.current?.click(); }} className="min-w-[68px] min-h-[68px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 shrink-0 transition-all active:scale-95" type="button"><ImageIcon className="w-5 h-5 mb-1"/><span className="font-bold uppercase text-[9px]">Thiết bị</span></button>
                {formData.images?.map((img, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0 group">
                        <button type="button" className="w-full h-full rounded-xl overflow-hidden block cursor-zoom-in" onClick={() => handleEditImage('MAIN', formData.images || [], idx)}>
                            <ProxyImage src={img} alt="Ảnh hiện trường" className="w-full h-full object-cover" />
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setFormData({...formData, images: formData.images?.filter((_, i) => i !== idx)}); }} className="absolute -top-1.5 -right-1.5 w-6 h-6 flex items-center justify-center bg-red-500 text-white rounded-full opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shadow-sm" aria-label="Xóa ảnh"><X className="w-3 h-3"/></button>
                    </div>
                ))}
            </div>
        </section>

        <section className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <h3 className="text-blue-700 dark:text-blue-400 border-b border-blue-50 dark:border-slate-800 pb-2 mb-1 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><MapPin className="w-4 h-4"/> III. ĐỊA ĐIỂM & SỐ LƯỢNG</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                 <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Xưởng sản xuất</label>
                    <Combobox
                        value={formData.workshop || null}
                        onChange={val => handleInputChange('workshop', val || '')}
                        placeholder="-- Chọn xưởng --"
                        ariaLabel="Xưởng sản xuất"
                        options={workshops.map(ws => ({ value: ws.code, label: ws.name }))}
                    />
                 </div>
                 <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Công đoạn *</label>
                    <Combobox
                        value={formData.inspectionStage || null}
                        onChange={val => handleInputChange('inspectionStage', val || '')}
                        placeholder="-- Chọn giai đoạn --"
                        disabled={!formData.workshop}
                        ariaLabel="Công đoạn"
                        options={availableStages.map(s => ({ value: s, label: s }))}
                    />
                 </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center block">SL Kiểm tra</label><input onKeyDown={(e) => { 
    if (['e', 'E', '+', '-'].includes(e.key)) {
        e.preventDefault();
    }
}} type="text" inputMode="decimal" value={formData.inspectedQuantity ?? ''} onChange={e => handleInputChange('inspectedQuantity', e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-xs min-h-[44px] lg:min-h-[38px] text-center bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm tabular-nums" /></div>
                    <div className="space-y-1"><div className="flex justify-between items-center px-1"><label className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">Đạt</label><span className="text-[9px] font-bold text-green-700 dark:text-green-400 tabular-nums">{rates.passRate}%</span></div><input onKeyDown={(e) => { 
    if (['e', 'E', '+', '-'].includes(e.key)) {
        e.preventDefault();
    }
}} type="text" inputMode="decimal" value={formData.passedQuantity ?? ''} onChange={e => handleInputChange('passedQuantity', e.target.value)} className="w-full px-3 py-2 border border-green-300 dark:border-green-700 rounded-lg font-bold text-xs min-h-[44px] lg:min-h-[38px] text-center bg-white dark:bg-slate-900 text-green-700 dark:text-green-400 tabular-nums" /></div>
                    <div className="space-y-1"><div className="flex justify-between items-center px-1"><label className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">Lỗi</label><span className="text-[9px] font-bold text-red-700 dark:text-red-400 tabular-nums">{rates.defectRate}%</span></div><input onKeyDown={(e) => { 
    if (['e', 'E', '+', '-'].includes(e.key)) {
        e.preventDefault();
    }
}} type="text" inputMode="decimal" value={formData.failedQuantity ?? ''} onChange={e => handleInputChange('failedQuantity', e.target.value)} className="w-full px-3 py-2 border border-red-300 dark:border-red-700 rounded-lg font-bold text-xs min-h-[44px] lg:min-h-[38px] text-center bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 tabular-nums" /></div>
                </div>
            </div>
        </section>

        <div className="space-y-2">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-300 dark:border-slate-700 pb-2 px-1">
                <h3 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2 text-xs"><LayoutList className="w-4 h-4 text-blue-600"/> IV. NỘI DUNG KIỂM TRA FQC ({visibleItems.length})</h3>
                <button onClick={() => setShowAddCriteriaModal(true)} className="min-h-[44px] lg:min-h-[36px] px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-blue-200 dark:border-blue-800 transition-all duration-200 active:scale-95" type="button">
                    <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Thêm tiêu chí
                </button>
            </div>
            {formData.inspectionStage ? (
                <div className="space-y-3">
                    {visibleItems.length > 0 ? (
                        visibleItems.map((item, originalIndex) => {
                            const actualIndex = formData.items?.findIndex(i => i.id === item.id) ?? -1;
                            return (
                                <div key={item.id} className={`bg-white dark:bg-slate-900 rounded-xl p-3 border shadow-sm ${item.status === CheckStatus.FAIL ? 'border-red-300 bg-red-50 dark:bg-red-900/10' : 'border-slate-200 dark:border-slate-700'}`}>
                                    <div className="flex justify-between items-start mb-2 border-b border-slate-100 dark:border-slate-800 pb-2 gap-2"><div className="flex-1"><span className="bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 tracking-widest">{item.category}</span><p className="w-full font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-tight mt-1">{item.label}</p></div><button onClick={() => setFormData({...formData, items: formData.items?.filter(it => it.id !== item.id)})} className="min-w-[44px] min-h-[44px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center text-slate-400 hover:text-red-500 rounded-lg" type="button" aria-label="Xóa tiêu chí"><Trash2 className="w-4 h-4"/></button></div>
                                    <div className="flex flex-wrap gap-2 items-center"><div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg gap-1 border border-slate-200 dark:border-slate-700 w-fit">{[CheckStatus.PASS, CheckStatus.FAIL].map(st => (<button key={st} onClick={() => handleItemChange(actualIndex, 'status', st)} className={`min-h-[44px] lg:min-h-[34px] px-3.5 py-1.5 rounded-md font-bold uppercase transition-all text-[10px] ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white' : 'bg-red-600 text-white') : 'text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'}`} type="button">{st === CheckStatus.PASS ? 'Đạt' : 'Hỏng'}</button>))}</div><div className="flex items-center gap-1.5 ml-auto"><button type="button" className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600" onClick={() => { setActiveUploadId(item.id); fileInputRef.current?.click(); }} aria-label="Chọn ảnh"><ImageIcon className="w-4 h-4"/></button><button type="button" className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600" onClick={() => { setActiveUploadId(item.id); cameraInputRef.current?.click(); }} aria-label="Chụp ảnh"><Camera className="w-4 h-4"/></button></div></div>
                                    <textarea value={item.notes || ''} onChange={e => handleItemChange(actualIndex, 'notes', e.target.value)} className="w-full mt-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg font-medium outline-none min-h-[52px] shadow-inner text-xs" placeholder="Ghi chú kỹ thuật..."/>
                                    {item.images && item.images.length > 0 && (<div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar py-1.5 pr-1.5">{item.images.map((im, i) => (<div key={i} className="relative w-12 h-12 shrink-0 border border-slate-200 dark:border-slate-700 rounded-lg group"><button type="button" className="w-full h-full rounded-lg overflow-hidden block cursor-zoom-in" onClick={() => handleEditImage('ITEM', item.images || [], i, item.id)}><ProxyImage src={im} alt="Ảnh tiêu chí" className="w-full h-full object-cover" /></button><button onClick={(e) => { e.stopPropagation(); const newImgs = item.images?.filter((_, idx) => idx !== i); handleItemChange(actualIndex, 'images', newImgs); }} className="absolute -top-1.5 -right-1.5 w-6 h-6 flex items-center justify-center bg-red-500 text-white rounded-full opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shadow-sm" type="button" aria-label="Xóa ảnh"><X className="w-3 h-3"/></button></div>))}</div>)}
                                </div>
                            );
                        })
                    ) : (
                        <div className="p-8 text-center text-slate-400 dark:text-slate-500 italic bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                            <p className="text-[10px] font-bold uppercase">Không có dữ liệu mẫu cho công đoạn này</p>
                            <p className="text-[9px]">Vui lòng nhấn "+ Thêm Tiêu Chí" bên trên</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-orange-50 border border-orange-100 p-6 rounded-2xl text-center space-y-1 animate-pulse"><Info className="w-6 h-6 text-orange-300 mx-auto" /><p className="font-bold text-orange-800 uppercase tracking-widest text-[10px]">Vui lòng chọn Công đoạn tại Mục III</p></div>
            )}
        </div>

        <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mt-3">
            <h3 className="text-blue-700 border-b border-blue-50 pb-2 mb-3 font-bold uppercase tracking-widest flex items-center gap-2 text-[11px]"><PenTool className="w-3.5 h-3.5"/> V. CHỮ KÝ XÁC NHẬN</h3>
            <div className="mb-4"><label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Ghi chú QC</label><textarea value={formData.summary || ''} onChange={e => handleInputChange('summary', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none h-20 resize-none" placeholder="Ghi chú thêm..."/></div>
            <SignaturePad label={`QC Ký Tên (${user.name})`} value={formData.signature} onChange={sig => setFormData({...formData, signature: sig})} uploadContext={{ entityId: formData.id || 'new', type: 'INSPECTION', role: 'SIGNATURE_QC' }} />
        </section>
      </div>

      <div className="px-4 py-3 lg:pr-24 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 sticky bottom-0 z-40 shadow-lg pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <button onClick={onCancel} className="min-h-[44px] lg:min-h-[40px] px-5 py-2 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all border border-slate-200 dark:border-slate-700 text-[11px]" type="button">Hủy</button>
        <button onClick={handleSubmit} disabled={isSaving || isProcessingImages} className="min-h-[44px] lg:min-h-[40px] flex-1 bg-blue-700 text-white font-black uppercase tracking-[0.15em] rounded-xl shadow-lg hover:bg-blue-800 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-[11px] py-2.5">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            <span>GỬI DUYỆT FQC</span>
        </button>
      </div>

      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => lookupPlanInfo(data)} />}

      {showAddCriteriaModal && (
        <div className="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl max-w-lg w-full max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200" style={{ fontFamily: 'var(--font-sans)' }}>
            {/* Header */}
            <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 bg-slate-50/70 dark:bg-slate-950/20 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <LayoutList className="w-4 h-4 text-blue-600 animate-pulse shrink-0" />
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider truncate">CHỌN TIÊU CHÍ CẦN KIỂM TRÊN FQC</h4>
              </div>
              <button 
                onClick={() => {
                  setShowAddCriteriaModal(false);
                  setCriteriaSearch('');
                  setCustomLabel('');
                }} 
                className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shrink-0 cursor-pointer"
                type="button"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 space-y-4 no-scrollbar">
              {/* Search preset criteria */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Tìm kiếm tiêu chuẩn có sẵn..."
                  value={criteriaSearch}
                  onChange={(e) => setCriteriaSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none text-xs min-h-[44px] lg:min-h-[38px] focus:ring-1 ring-blue-100 bg-slate-50 dark:bg-slate-950 focus:bg-white dark:text-slate-100"
                />
              </div>

              {/* Preset checklist list */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Tiêu chí khuyên dùng</p>
                <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1 no-scrollbar border border-slate-100 dark:border-slate-800 rounded-xl p-2 bg-slate-50/30">
                  {PRESET_ADDITIONAL_CRITERIA.filter(item => 
                    item.label.toLowerCase().includes(criteriaSearch.toLowerCase()) || 
                    item.category.toLowerCase().includes(criteriaSearch.toLowerCase())
                  ).map((item, idx) => {
                    const isAdded = formData.items?.some(it => it.label === item.label) ?? false;
                    return (
                      <div 
                        key={idx} 
                        className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border text-xs transition-all ${
                          isAdded 
                            ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30 opacity-75' 
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <span className="inline-block bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase text-slate-500 px-1.5 py-0.5 rounded mr-2 border border-slate-200/50 tracking-wider">
                            {item.category}
                          </span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {item.label}
                          </span>
                        </div>
                        {isAdded ? (
                          <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider bg-blue-100/50 px-2.5 py-1.5 rounded-lg shrink-0">Đã chọn</span>
                        ) : (
                          <button
                            onClick={() => {
                              const newItem = {
                                id: `fqc_add_${Date.now()}_${idx}`,
                                category: item.category,
                                label: item.label,
                                status: CheckStatus.PENDING,
                                notes: '',
                                images: [],
                                stage: formData.inspectionStage || undefined
                              };
                              setFormData(prev => ({
                                ...prev,
                                items: [...(prev.items || []), newItem]
                              }));
                            }}
                            className="min-h-[44px] lg:min-h-[32px] px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-all shrink-0"
                            type="button"
                          >
                            <Plus className="w-3.5 h-3.5" /> Thêm
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {PRESET_ADDITIONAL_CRITERIA.filter(item => 
                    item.label.toLowerCase().includes(criteriaSearch.toLowerCase()) || 
                    item.category.toLowerCase().includes(criteriaSearch.toLowerCase())
                  ).length === 0 && (
                    <p className="text-center py-4 text-slate-400 text-xs font-bold">Không tìm thấy tiêu chí phù hợp</p>
                  )}
                </div>
              </div>

              {/* Custom criteria input */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Tự nhập tiêu chí mới
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-1 space-y-1">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Phân loại</label>
                    <Combobox
                      value={customCategory}
                      onChange={(val) => setCustomCategory(val || 'Ngoại quan')}
                      allowClear={false}
                      ariaLabel="Phân loại tiêu chí"
                      options={[
                        { value: 'Ngoại quan', label: 'Ngoại quan' },
                        { value: 'Kích thước', label: 'Kích thước' },
                        { value: 'Kết cấu', label: 'Kết cấu' },
                        { value: 'Hoàn thiện', label: 'Hoàn thiện' },
                        { value: 'Chức năng', label: 'Chức năng' },
                        { value: 'Đóng gói', label: 'Đóng gói' },
                        { value: 'Hồ sơ', label: 'Hồ sơ' }
                      ]}
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Nội dung tiêu chuẩn cần kiểm</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="VD: Kiểm tra độ đồng màu chân bàn..."
                        value={customLabel}
                        onChange={(e) => setCustomLabel(e.target.value)}
                        className="flex-1 min-w-0 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 dark:text-slate-100 font-bold outline-none text-xs min-h-[44px] lg:min-h-[36px]"
                      />
                      <button
                        onClick={() => {
                          if (!customLabel.trim()) {
                            alert("Vui lòng nhập nội dung tiêu chí.");
                            return;
                          }
                          const newItem = {
                            id: `fqc_custom_${Date.now()}`,
                            category: customCategory,
                            label: customLabel.trim(),
                            status: CheckStatus.PENDING,
                            notes: '',
                            images: [],
                            stage: formData.inspectionStage || undefined
                          };
                          setFormData(prev => ({
                            ...prev,
                            items: [...(prev.items || []), newItem]
                          }));
                          setCustomLabel('');
                        }}
                        className="min-h-[44px] lg:min-h-[36px] px-3.5 bg-slate-900 hover:bg-black text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 shrink-0"
                        type="button"
                      >
                        Thêm
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/20 flex justify-end shrink-0">
              <button
                onClick={() => {
                  setShowAddCriteriaModal(false);
                  setCriteriaSearch('');
                  setCustomLabel('');
                }}
                className="min-h-[44px] sm:min-h-[36px] px-5 py-2 sm:py-1.5 bg-slate-900 hover:bg-black text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all whitespace-nowrap shrink-0"
                type="button"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}
      {editorState && <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} onSave={onImageSave} readOnly={false}/>}
      <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
    </div>
  );
};

export default InspectionFormFQC;
