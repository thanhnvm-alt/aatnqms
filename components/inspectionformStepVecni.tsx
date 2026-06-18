
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, Workshop, NCR } from '../types';
import { 
  Save, X, Camera, Image as ImageIcon, ChevronDown, MapPin, Box, AlertTriangle, Trash2, LayoutList, FileText, QrCode, PenTool, Eraser, Loader2, AlertCircle
} from 'lucide-react';
import { uploadQMSImage } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';
import { compressImage } from '../services/imageService';
import { PersistenceService } from '../services/persistenceService';
import { getProxyImageUrl } from '../src/utils';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  workshops: Workshop[];
  user: User;
}

export const InspectionFormStepVecni: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, workshops, user }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({ 
    id: `STEP-${Date.now()}`, 
    date: new Date().toISOString().split('T')[0], 
    status: InspectionStatus.DRAFT, 
    items: [], 
    images: [], 
    score: 0, 
    type: 'STEP',
    ...initialData 
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);
  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadContext, setActiveUploadContext] = useState<{ type: 'MAIN' | 'ITEM', itemIdx?: number } | null>(null);

  useEffect(() => {
    PersistenceService.hasDraft('STEP', user.id).then(setHasDraft);
  }, []);

  useEffect(() => {
    if (formData.ma_ct || (formData.items && formData.items.length > 0)) {
        PersistenceService.saveDraft('STEP', user.id, formData);
    }
  }, [formData]);

  const recoverDraft = async () => {
    const saved = await PersistenceService.getDraft('STEP', user.id);
    if (saved) {
      setFormData(saved as Inspection);
      setHasDraft(false);
    }
  };

  const clearDraft = () => {
    PersistenceService.clearDraft('STEP', user.id);
    setHasDraft(false);
  };

  const handleInputChange = (field: keyof Inspection, value: any) => { setFormData(prev => ({ ...prev, [field]: value })); };
  const handleItemChange = (index: number, field: keyof CheckItem, value: any) => {
    const newItems = [...(formData.items || [])]; if (newItems[index]) { newItems[index] = { ...newItems[index], [field]: value }; }
    setFormData({ ...formData, items: newItems });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeUploadContext) return;
    setIsProcessingImages(true);
    const { type, itemIdx } = activeUploadContext;
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
                            resolve(reader.result as string);
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            })
        );

        setFormData(prev => {
            if (type === 'MAIN') return { ...prev, images: [...(prev.images || []), ...compressedBase64s] };
            if (type === 'ITEM' && itemIdx !== undefined) {
                const items = [...(prev.items || [])];
                items[itemIdx] = { ...items[itemIdx], images: [...(items[itemIdx].images || []), ...compressedBase64s] };
                return { ...prev, items };
            }
            return prev;
        });
    } catch (err) { 
        console.error(err); 
        alert("Lỗi khi xử lý hình ảnh.");
    } finally { 
        setIsProcessingImages(false); 
        e.target.value = ''; 
    }
  };

  const handleEditImage = (images: string[], index: number, context: any) => { setEditorState({ images, index, context }); };
  
  const onImageSave = async (idx: number, updatedImg: string) => {
      if (!editorState) return;
      const { type, itemIdx } = editorState.context;
      
      setIsProcessingImages(true);
      try {
          const finalImg = updatedImg.startsWith('data:') ? await compressImage(updatedImg) : updatedImg;
          
          setFormData(prev => {
              if (type === 'MAIN') { const next = [...(prev.images || [])]; next[idx] = finalImg; return { ...prev, images: next }; }
              if (type === 'ITEM' && itemIdx !== undefined) {
                  const items = [...(prev.items || [])];
                  items[itemIdx].images![idx] = finalImg;
                  return { ...prev, items };
              }
              return prev;
          });
      } catch (err) {
          console.error(err);
          alert("Lỗi khi nén ảnh.");
      } finally {
          setIsProcessingImages(false);
      }
  };

  const handleSubmit = async () => {
    if (!formData.ma_ct) { alert("Vui lòng nhập mã dự án."); return; }
    
    setIsSaving(true);
    setUploadProgress(0);
    try { 
        const entityId = formData.id || 'new';
        
        interface UploadTask {
            url: string;
            role: string;
            path: 'MAIN' | 'ITEM';
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
                }
                return next;
            });
        };

        // Execute uploads in parallel
        if (totalTasks > 0) {
            await Promise.all(tasks.map(async (task) => {
                const serverUrl = await uploadQMSImage(task.url, { entityId, type: 'STEP', role: task.role });
                updateStateWithUrl(task, serverUrl);
                completedCount++;
                setUploadProgress(Math.round((completedCount / totalTasks) * 100));
            }));
        }

        // Final save with fresh state
        setFormData(finalForm => {
            onSave({ 
                ...finalForm, 
                status: InspectionStatus.PENDING, 
                updatedAt: new Date().toISOString() 
            } as Inspection);
            clearDraft();
            return finalForm;
        });

    } catch (e: any) { 
        console.error("ISO-SAVE-STEP:", e);
        alert("Lỗi khi lưu phiếu Step Vecni: " + (e.message || "Không thể tải ảnh lên")); 
    } finally { 
        setIsSaving(false); 
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-800/50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      {hasDraft && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md animate-in slide-in-from-top-4 duration-500">
              <div className="bg-white dark:bg-slate-900/80 backdrop-blur-md border border-blue-200 dark:border-slate-700 p-2.5 rounded-lg shadow-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                      <div className="bg-blue-100 dark:bg-blue-900/30 p-1.5 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">Phát hiện bản nháp</span>
                          <span className="text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-bold">Dữ liệu Step Vecni bạn đang nhập chưa được lưu.</span>
                      </div>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={clearDraft} className="px-2 py-1.5 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-red-500 dark:text-red-400">Xóa</button>
                      <button onClick={recoverDraft} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-[9px] font-black uppercase tracking-widest shadow-md shadow-blue-200 active:scale-95 transition-all">Khôi phục</button>
                  </div>
              </div>
          </div>
      )}
      {(isProcessingImages || isSaving) && (
          <div className="absolute inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-2xl flex flex-col items-center gap-4 w-[85%] max-w-sm border border-white/25">
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
                        {isSaving ? "Đang tải dữ liệu & ảnh lên server..." : "Đang xử lý hình ảnh..."}
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
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar bg-slate-50 dark:bg-slate-800/50">
        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <h3 className="text-purple-700 border-b border-purple-50 pb-2 mb-2 font-black uppercase tracking-widest flex items-center gap-2"><Box className="w-4 h-4"/> I. THÔNG TIN CÔNG ĐOẠN SƠN</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 mb-1">Mã Dự Án</label><input value={formData.ma_ct || ''} readOnly className="w-full p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md text-slate-500 dark:text-slate-400 font-bold outline-none"/></div>
                <div><label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 mb-1">Xưởng Sơn</label><select value={formData.ma_nha_may || ''} onChange={e => handleInputChange('ma_nha_may', e.target.value)} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 font-bold shadow-sm outline-none"><option value="">-- Chọn xưởng --</option>{workshops.map(ws => <option key={ws.code} value={ws.code}>{ws.name}</option>)}</select></div>
            </div>
            <div className="pt-2 border-t border-slate-50">
                <div className="space-y-1 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-md border border-slate-100 dark:border-slate-800">
                    <label className="text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase flex items-center justify-between">ẢNH HIỆN TRƯỜNG<div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'MAIN' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-blue-600 dark:text-blue-400" type="button"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => { setActiveUploadContext({ type: 'MAIN' }); fileInputRef.current?.click(); }} className="p-1 hover:text-blue-600 dark:text-blue-400" type="button"><ImageIcon className="w-3.5 h-3.5"/></button></div></label>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">{formData.images?.map((img, i) => (<img key={i} src={getProxyImageUrl(img)} className="w-10 h-10 rounded border border-slate-200 dark:border-slate-700 object-cover shrink-0" onClick={() => handleEditImage(formData.images!, i, { type: 'MAIN' })} />))}</div>
                </div>
            </div>
        </div>
        <div className="space-y-3">
            <h3 className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-slate-300 dark:border-slate-600 pb-2 px-1 text-xs"><LayoutList className="w-4 h-4 text-purple-600"/> II. KIỂM TRA BƯỚC MÀU ({formData.items?.length || 0})</h3>
            <div className="space-y-4">
                {formData.items?.map((item, idx) => (
                    <div key={item.id} className="bg-white dark:bg-slate-900 rounded-lg p-3.5 border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="flex justify-between items-start mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                            <div className="flex-1"><span className="bg-slate-100 dark:bg-slate-800 text-[8pt] font-black uppercase text-slate-500 dark:text-slate-400 px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">{item.category}</span><p className="w-full font-black text-[11pt] text-slate-800 dark:text-slate-200 uppercase tracking-tight mt-1">{item.label}</p></div>
                        </div>
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-md gap-1 border border-slate-200 dark:border-slate-700 shadow-inner w-fit">
                            {[CheckStatus.PASS, CheckStatus.FAIL].map(st => (
                                <button key={st} onClick={() => handleItemChange(idx, 'status', st)} className={`px-4 py-1.5 rounded-md text-[9pt] font-black uppercase tracking-tight transition-all ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-lg' : 'bg-red-600 text-white shadow-lg') : 'text-slate-400 dark:text-slate-500'}`} type="button">{st}</button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                            <textarea value={item.notes || ''} onChange={e => handleItemChange(idx, 'notes', e.target.value)} className="flex-1 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md outline-none h-12 text-xs" placeholder="Ghi chú màu sắc..."/>
                            <div className="flex flex-col gap-1.5">
                                <button onClick={() => { setActiveUploadContext({ type: 'ITEM', itemIdx: idx }); cameraInputRef.current?.click(); }} className="p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md text-slate-400 dark:text-slate-500 hover:text-purple-600" type="button"><Camera className="w-4.5 h-4.5" /></button>
                                <button onClick={() => { setActiveUploadContext({ type: 'ITEM', itemIdx: idx }); fileInputRef.current?.click(); }} className="p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md text-slate-400 dark:text-slate-500 hover:text-purple-600" type="button"><ImageIcon className="w-4.5 h-4.5" /></button>
                            </div>
                        </div>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar min-h-[40px] mt-2">
                            {item.images?.map((img, i) => (
                                <div key={i} className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer group" onClick={() => handleEditImage(item.images!, i, { type: 'ITEM', itemIdx: idx })}>
                                    <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" />
                                    <button onClick={(e) => { e.stopPropagation(); const newImgs = item.images?.filter((_, imageIndex) => imageIndex !== i); handleItemChange(idx, 'images', newImgs); }} className="absolute top-0 right-0 bg-red-600 text-white p-0.5 rounded-bl shadow md:opacity-0 group-hover:opacity-100 transition-opacity" type="button"><X className="w-3 h-3"/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>
      <div className="p-3 md:p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-end gap-2 shrink-0 shadow-sm z-20">
        <button onClick={onCancel} className="px-5 py-2 text-slate-500 dark:text-slate-450 font-black uppercase tracking-wider hover:bg-slate-10" type="button">Hủy</button>
        <button onClick={handleSubmit} disabled={isSaving || isProcessingImages} className="px-10 py-2.5 bg-purple-700 text-white font-black uppercase tracking-wider rounded-md hover:bg-purple-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-[10px]" type="button">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
            <span>HOÀN TẤT STEP VECNI</span>
        </button>
      </div>

      {editorState && <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} onSave={onImageSave} readOnly={false}/>}
      
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
    </div>
  );
};
