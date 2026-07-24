import { getProxyImageUrl } from '../src/utils';

import React, { useState, useRef, useEffect } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, Workshop, ModuleId } from '../types';
import { 
  Save, X, Camera, Image as ImageIcon, ChevronDown, 
  MapPin, Box, AlertTriangle, Trash2, LayoutList, 
  QrCode, PenTool, Eraser, Loader2, 
  AlertOctagon, Locate, History, Clock, AlertCircle
} from 'lucide-react';
import { uploadQMSImage } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';
// Added missing QRScannerModal import
import { QRScannerModal } from './QRScannerModal';
import { SITE_TEMPLATES } from '../constants';
import { PersistenceService } from '../services/persistenceService';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  workshops: Workshop[];
  user: User;
  templates: Record<string, CheckItem[]>;
}

import { SignaturePad } from './SignaturePad';

export const InspectionFormSITE: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, user, templates }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({ 
    id: initialData?.id || `SITE-${Date.now()}`, 
    date: new Date().toISOString().split('T')[0], 
    status: InspectionStatus.DRAFT, 
    // ISO-FIX: Defensive array check to prevent .map crashes
    items: Array.isArray(initialData?.items) ? initialData?.items : 
           (Array.isArray(templates?.['SITE']) ? templates['SITE'] : []), 
    images: initialData?.images || [], 
    score: 0, 
    type: 'SITE' as ModuleId,
    inspectorName: user.name,
    headcode: initialData?.headcode || '',
    ten_hang_muc: initialData?.ten_hang_muc || '',
    ...initialData 
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);
  
  const [committedHeadcode, setCommittedHeadcode] = useState<string | null>(null);
  
  // Logic to load data based on headcode
  useEffect(() => {
    const fetchIpoData = async (headcode: string) => {
        try {
            const res = await fetch(`/api/ipo?factoryOrder=${encodeURIComponent(headcode)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.items && data.items.length > 0) {
                    const ipo = data.items[0];
                    setFormData(prev => ({
                        ...prev,
                        ten_hang_muc: ipo.Material_description || prev.ten_hang_muc,
                        ma_ct: ipo.Ma_Tender || prev.ma_ct,
                        ten_ct: ipo.Project_name || prev.ten_ct
                    }));
                }
            }
        } catch (e) {
            console.error("Failed to fetch IPO data:", e);
        }
    };
    
    if (committedHeadcode) {
        fetchIpoData(committedHeadcode);
    }
  }, [committedHeadcode]);

  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<keyof typeof SITE_TEMPLATES>('BAN');

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
    PersistenceService.hasDraft('SITE', user.id).then(setHasDraft);
  }, []);

  useEffect(() => {
    if (formData.ma_ct || formData.headcode || (formData.items && formData.items.length > 0)) {
        PersistenceService.saveDraft('SITE', user.id, formData);
    }
  }, [formData]);

  const recoverDraft = async () => {
    const saved = await PersistenceService.getDraft('SITE', user.id);
    if (saved) {
      setFormData(saved as Inspection);
      setHasDraft(false);
    }
  };

  const clearDraft = () => {
    PersistenceService.clearDraft('SITE', user.id);
    setHasDraft(false);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: any } | null>(null);

  const handleEditImage = (images: string[], index: number, context: any) => {
    setEditorState({ images, index, context });
  };

  const onImageSave = async (index: number, newImageUrl: string) => {
    if (!editorState) return;
    const newImages = [...editorState.images];
    newImages[index] = newImageUrl;
    setEditorState({ ...editorState, images: newImages });
    const { itemId } = editorState.context || {};
    if (itemId) {
      setFormData(prev => ({
        ...prev,
        items: prev.items?.map(it => it.id === itemId ? { ...it, images: newImages } : it)
      }));
    } else {
      setFormData(prev => ({ ...prev, images: newImages }));
    }
  };

  const handleInputChange = (field: keyof Inspection, value: any) => {
    if (typeof value === 'string' && ['inspectedQuantity', 'passedQuantity', 'failedQuantity', 'orderQty', 'deliveryQty', 'inspectQty', 'passQty', 'failQty', 'so_luong_ipo'].includes(field)) {
        value = value.replace(/,/g, '.');
    }  setFormData(prev => ({ ...prev, [field]: value })); };

  const handleItemChange = (index: number, field: keyof CheckItem, value: any) => {
    const newItems = [...(formData.items || [])];
    if (newItems[index]) { newItems[index] = { ...newItems[index], [field]: value }; }
    setFormData({ ...formData, items: newItems });
  };

  const handleGetLocation = () => {
    setIsGettingLocation(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setFormData(prev => ({ ...prev, location: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}` }));
        setIsGettingLocation(false);
      }, () => { alert("Không thể lấy vị trí."); setIsGettingLocation(false); });
    } else { setIsGettingLocation(false); }
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

  const handleSubmit = async () => {
    if (!formData.ma_ct) { alert("Thiếu mã công trình."); return; }
    if (!formData.signature) { alert("Yêu cầu chữ ký QC."); return; }
    
    setIsSaving(true);
    setUploadProgress(0);
    try {
        const entityId = formData.id || 'new';
        
        interface UploadTask {
            url: string;
            role: string;
            path: 'MAIN' | 'ITEM' | 'SIGNATURE';
            itemId?: string;
            originalIndex?: number;
        }

        const tasks: UploadTask[] = [];

        // 1. Identify all base64 images
        (formData.images || []).forEach((img, idx) => {
            if (img.startsWith('data:')) tasks.push({ url: img, role: 'MAIN', path: 'MAIN', originalIndex: idx });
        });

        (formData.items || []).forEach((item) => {
            (item.images || []).forEach((img, idx) => {
                if (img.startsWith('data:')) tasks.push({ url: img, role: 'ITEM', path: 'ITEM', itemId: item.id, originalIndex: idx });
            });
        });

        if (formData.signature?.startsWith('data:')) {
            tasks.push({ url: formData.signature, role: 'SIGNATURE_QC', path: 'SIGNATURE' });
        }

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

        // Execute uploads in parallel
        if (totalTasks > 0) {
            await Promise.all(tasks.map(async (task) => {
                const serverUrl = await uploadQMSImage(task.url, { entityId, type: 'SITE', role: task.role });
                updateStateWithUrl(task, serverUrl);
                completedCount++;
                setUploadProgress(Math.round((completedCount / totalTasks) * 100));
            }));
        }

        // Final save with fresh state
        const finalForm = formData;
            const hasFail = (finalForm.items || []).some(it => it.status === CheckStatus.FAIL);
            let statusToSave = finalForm.status;
            if (statusToSave === InspectionStatus.DRAFT) {
                statusToSave = hasFail ? InspectionStatus.FLAGGED : InspectionStatus.PENDING;
            }

            await onSave({ ...finalForm, 
                status: statusToSave, 
                updatedAt: new Date().toISOString() 
            } as Inspection);
            
            clearDraft();
            

    } catch (e: any) { 
        console.error("ISO-SAVE-SITE:", e);
        alert(`Lỗi lưu phiếu: ${e.message || "Không thể tải ảnh lên"}`); 
    } finally { 
        setIsSaving(false); 
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-800/50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative no-scroll-x" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      {hasDraft && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md animate-in slide-in-from-top-4 duration-500">
              <div className="bg-white dark:bg-slate-900/80 backdrop-blur-md border border-amber-200 p-3 rounded-2xl shadow-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                      <div className="bg-amber-100 p-1.5 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">Phát hiện bản nháp</span>
                          <span className="text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-bold">Dữ liệu SITE bạn đang nhập chưa được lưu.</span>
                      </div>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={clearDraft} className="px-2 py-1.5 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-red-500 dark:text-red-400">Xóa</button>
                      <button onClick={recoverDraft} className="px-3 py-1.5 bg-amber-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-md shadow-amber-200 active:scale-95 transition-all">Khôi phục</button>
                  </div>
              </div>
          </div>
      )}
      {(isProcessingImages || isSaving) && (
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
                  
                  <div className="w-full space-y-2">
                    <p className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest text-center">
                        {isSaving ? "Đang tải hồ sơ & ảnh lên server..." : isProcessingImages ? "Đang tải ảnh..." : "Đang xử lý hình ảnh..."}
                    </p>
                    
                    {isSaving && (
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                            <div 
                                className="h-full bg-blue-600 transition-all duration-300 ease-out" 
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                    )}
                    {isProcessingImages && imageUploadProgress !== null && (
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                            <div 
                                className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300 ease-out" 
                                style={{ width: `${imageUploadProgress}%` }}
                            />
                        </div>
                    )}
                  </div>
              </div>
          </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar bg-slate-50 dark:bg-slate-800/50 pb-28">
        {/* I. THÔNG TIN CÔNG TRÌNH */}
        <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <h3 className="text-amber-700 border-b border-amber-50 pb-2 mb-1 font-black uppercase tracking-widest flex items-center gap-2 text-xs"><MapPin className="w-4 h-4"/> I. THÔNG TIN CÔNG TRÌNH</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">Mã Công Trình</label><input value={formData.ma_ct || ''} readOnly className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 font-bold text-xs shadow-inner uppercase"/></div>
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">Tên Công Trình</label><input value={formData.ten_ct || ''} readOnly className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 font-bold text-xs shadow-inner uppercase"/></div>
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">Headcode</label><input value={formData.headcode || ''} onChange={e => handleInputChange('headcode', e.target.value)} onBlur={() => setCommittedHeadcode(formData.headcode || null)} onKeyDown={e => e.key === 'Enter' && setCommittedHeadcode(formData.headcode || null)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-xs focus:ring-1 ring-amber-200 outline-none" placeholder="Nhập mã Headcode..."/></div>
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">Tên Hạng Mục</label><input value={formData.ten_hang_muc || ''} onChange={e => handleInputChange('ten_hang_muc', e.target.value)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-xs focus:ring-1 ring-amber-200 outline-none" placeholder="Tên hạng mục..."/></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">Ngày kiểm tra</label><input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-xs focus:ring-1 ring-amber-200 outline-none"/></div>
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">Trạng thái phiếu</label>
                  <select value={formData.status} onChange={e => handleInputChange('status', e.target.value)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-xs focus:ring-1 ring-amber-200 outline-none">
                    <option value={InspectionStatus.PENDING}>Chưa xử lý</option>
                    <option value={InspectionStatus.SUBMITTED}>Đang xử lý</option>
                    <option value={InspectionStatus.APPROVED}>Đã phê duyệt</option>
                    <option value={InspectionStatus.REJECTED}>Đã từ chối</option>
                  </select>
                </div>
                <div className="md:col-span-1 space-y-1"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">QC Site</label><input value={formData.inspectorName || user.name} readOnly className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 dark:text-slate-500 font-bold text-xs uppercase"/></div>
                <div className="md:col-span-3 space-y-1"><label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">Vị trí lắp đặt / GPS</label><div className="flex gap-2"><input value={formData.location || ''} onChange={e => handleInputChange('location', e.target.value)} className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-xs outline-none" placeholder="Phòng, Tầng, Căn hộ..."/><button onClick={handleGetLocation} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-amber-50 hover:text-amber-600 transition-colors" type="button"><Locate className="w-4 h-4"/></button></div></div>
            </div>
        </section>

        {/* II. HÌNH ÁNH HIỆN TRƯỜNG */}
        <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <h3 className="text-amber-700 border-b border-amber-50 pb-2 mb-1 font-black uppercase tracking-widest flex items-center gap-2 text-xs"><ImageIcon className="w-4 h-4"/> II. HÌNH ÁNH HIỆN TRƯỜNG TỔNG QUÁT</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                <button onClick={() => { setActiveUploadId('MAIN'); cameraInputRef.current?.click(); }} className="w-20 h-20 bg-amber-50 border border-amber-100 rounded-2xl flex flex-col items-center justify-center text-amber-600 shrink-0 transition-all active:scale-95" type="button"><Camera className="w-6 h-6 mb-1"/><span className="font-black text-[8px] uppercase">Chụp ảnh</span></button>
                <button onClick={() => { setActiveUploadId('MAIN'); fileInputRef.current?.click(); }} className="w-20 h-20 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 shrink-0 transition-all active:scale-95" type="button"><ImageIcon className="w-6 h-6 mb-1"/><span className="font-black text-[8px] uppercase">Tải tệp</span></button>
                {formData.images?.map((img, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 group shadow-sm">
                        <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" />
                        <button onClick={() => setFormData({...formData, images: formData.images?.filter((_, i) => i !== idx)})} className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full md:opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button>
                    </div>
                ))}
            </div>
        </section>
        
        {/* III. CHECKLIST LẮP ĐẶT */}
        <section className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-300 dark:border-slate-600 pb-2 px-1">
              <h3 className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-[0.2em] flex items-center gap-2 text-xs"><LayoutList className="w-4 h-4 text-amber-700"/> III. TIÊU CHÍ THẨM ĐỊNH LẮP ĐẶT ({formData.items?.length || 0})</h3>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wider">Nhóm sản phẩm:</label>
                <select 
                  value={selectedGroup}
                  className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:ring-1 ring-amber-500"
                  onChange={(e) => {
                    const group = e.target.value as keyof typeof SITE_TEMPLATES;
                    setSelectedGroup(group);
                    const subModuleId = `SITE_${group}`;
                    const templateItems = templates?.[subModuleId] || SITE_TEMPLATES[group];
                    setFormData(prev => ({ ...prev, items: JSON.parse(JSON.stringify(templateItems)) }));
                  }}
                >
                  <option value="BAN">Bàn</option>
                  <option value="GHE">Ghế</option>
                  <option value="TU">Tủ</option>
                  <option value="GIUONG">Giường</option>
                  <option value="GUONG">Khung gương</option>
                  <option value="TU_AO">Tủ áo & Tủ liền tường</option>
                  <option value="TRAN">Trần</option>
                  <option value="TUONG">Tường, vách & đồ liền tường</option>
                  <option value="SAN">Sàn</option>
                  <option value="CUA">Cửa</option>
                </select>
              </div>
            </div>
            <div className="space-y-3">
                {Array.isArray(formData.items) && formData.items.map((item, idx) => (
                    <div key={item.id} className={`bg-white dark:bg-slate-900 rounded-2xl p-4 border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-200 bg-red-50 dark:bg-red-900/20/10' : 'border-slate-200 dark:border-slate-700'}`}>
                        <div className="flex justify-between items-start mb-3 border-b border-slate-50 pb-2">
                            <div className="flex-1">
                                <span className="bg-slate-100 dark:bg-slate-800 text-[8px] font-black uppercase text-slate-500 dark:text-slate-400 dark:text-slate-500 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 tracking-widest">{item.category}</span>
                                <p className="w-full font-black text-xs text-slate-800 dark:text-slate-200 uppercase tracking-tight mt-1.5">{item.label}</p>
                            </div>
                            <button onClick={() => setFormData({...formData, items: formData.items?.filter(it => it.id !== item.id)})} className="p-1.5 text-slate-300 hover:text-red-500 dark:text-red-400" type="button"><Trash2 className="w-4 h-4"/></button>
                        </div>
                        <div className="flex flex-wrap gap-3 items-center">
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1 border border-slate-200 dark:border-slate-700 shadow-inner w-fit">
                                {[CheckStatus.PASS, CheckStatus.FAIL, CheckStatus.CONDITIONAL].map(st => (
                                    <button 
                                        key={st} 
                                        onClick={() => handleItemChange(idx, 'status', st)} 
                                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-md' : st === CheckStatus.FAIL ? 'bg-red-600 text-white shadow-md' : 'bg-amber-500 text-white shadow-md') : 'text-slate-400 dark:text-slate-500 hover:bg-white dark:bg-slate-900'}`} 
                                        type="button"
                                    >
                                        {st === CheckStatus.PASS ? 'Đạt' : st === CheckStatus.FAIL ? 'Hỏng' : 'ĐK'}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-2 ml-auto">
                                <button onClick={() => { setActiveUploadId(item.id); cameraInputRef.current?.click(); }} className="p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 dark:text-slate-500 hover:text-amber-600 active:scale-95 transition-all" type="button" title="Chụp ảnh"><Camera className="w-4 h-4"/></button>
                                <button onClick={() => { setActiveUploadId(item.id); fileInputRef.current?.click(); }} className="p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 dark:text-slate-500 hover:text-amber-600 active:scale-95 transition-all" type="button" title="Tải ảnh"><ImageIcon className="w-4 h-4"/></button>
                                {item.status === CheckStatus.FAIL && <button className="px-3 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-lg active:scale-95" type="button"><AlertOctagon className="w-3.5 h-3.5"/> NCR</button>}
                            </div>
                        </div>
                        <textarea 
                            value={item.notes || ''} 
                            onChange={e => handleItemChange(idx, 'notes', e.target.value)} 
                            className="w-full mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl outline-none text-[11px] font-medium focus:ring-1 ring-amber-500 transition-all resize-none h-20 shadow-inner" 
                            placeholder="Ghi chú kỹ thuật tại vị trí lắp..."
                        />
                        {item.images && item.images.length > 0 && (
                            <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar py-1">
                                {item.images.map((img, i) => (
                                    <div key={i} className="relative w-14 h-14 shrink-0 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer group" onClick={() => handleEditImage(item.images!, i, { itemId: item.id })}>
                                        <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" />
                                        <button onClick={(e) => { e.stopPropagation(); const newImgs = item.images?.filter((_, idx) => idx !== i); handleItemChange(idx, 'images', newImgs); }} className="absolute top-0 right-0 bg-red-600 text-white p-0.5 rounded-bl shadow md:opacity-0 group-hover:opacity-100 transition-opacity" type="button"><X className="w-3 h-3"/></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                <button onClick={() => setFormData({...formData, items: [...(Array.isArray(formData.items) ? formData.items : []), { id: `new_${Date.now()}`, category: 'HIỆN TRƯỜNG', label: 'HẠNG MỤC PHÁT SINH', status: CheckStatus.PENDING }]})} className="w-full py-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em] transition-all text-[10px] hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 hover:border-amber-300 hover:text-amber-600" type="button">+ THÊM TIÊU CHÍ HIỆN TRƯỜNG</button>
            </div>
        </section>

        {/* IV. CHỮ KÝ XÁC NHẬN */}
        <section className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <h3 className="text-amber-800 border-b border-amber-50 pb-3 font-black uppercase tracking-widest flex items-center gap-2 text-xs"><PenTool className="w-4 h-4"/> IV. XÁC NHẬN QC HIỆN TRƯỜNG</h3>
            <textarea value={formData.summary || ''} onChange={e => handleInputChange('summary', e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-medium focus:ring-1 ring-amber-200 outline-none h-28 resize-none shadow-inner" placeholder="Tóm tắt tình trạng hoàn thiện và các yêu cầu sửa chữa cần thiết..."/>
            <div className="pt-4">
                <SignaturePad 
                    label={`Ký tên xác nhận (${user.name})`} 
                    value={formData.signature} 
                    onChange={sig => setFormData({...formData, signature: sig})} 
                    uploadContext={{ entityId: formData.id || 'new', type: 'INSPECTION', role: 'SIGNATURE_QC' }}
                />
            </div>
        </section>
      </div>

      {/* FOOTER ACTIONS */}
      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between gap-4 sticky bottom-0 z-40 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
        <button onClick={onCancel} className="h-14 px-8 text-slate-500 dark:text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em] hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 rounded-[1.5rem] transition-all border border-slate-200 dark:border-slate-700 text-[10px]" type="button">HỦY BỎ</button>
        <button onClick={handleSubmit} disabled={isSaving || isProcessingImages} className="h-14 flex-1 bg-amber-700 text-white font-black uppercase tracking-[0.2em] rounded-[1.5rem] shadow-2xl shadow-amber-500/20 hover:bg-amber-800 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-[10px]" type="button">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
            <span>GỬI DUYỆT SITE QC</span>
        </button>
      </div>

      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { handleInputChange('ma_ct', data); setShowScanner(false); }} />}
      {editorState && <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} onSave={onImageSave} readOnly={false}/>}
      <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
    </div>
  );
};

export default InspectionFormSITE;
