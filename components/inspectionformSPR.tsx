
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, Workshop, NCR } from '../types';
import { Save, X, Camera, Image as ImageIcon, ChevronDown, MapPin, Box, AlertTriangle, Trash2, LayoutList, FileText, QrCode, PenTool, Eraser, Loader2 } from 'lucide-react';
import { uploadQMSImage } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';
import { getProxyImageUrl } from '../src/utils';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  workshops: Workshop[];
  user: User;
}

export const InspectionFormSPR: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, workshops, user }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({ 
    id: `SPR-${Date.now()}`, 
    date: new Date().toISOString().split('T')[0], 
    status: InspectionStatus.DRAFT, 
    items: [], 
    images: [], 
    score: 0, 
    type: 'SPR',
    ...initialData 
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadContext, setActiveUploadContext] = useState<{ type: 'MAIN' | 'ITEM', itemIdx?: number } | null>(null);

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
        const uploadPromises = Array.from(files).map(file => 
            uploadQMSImage(file, formData.id || 'temp', 'SPR', user.role)
        );
        const uploadedUrls = await Promise.all(uploadPromises);

        setFormData(prev => {
            if (type === 'MAIN') return { ...prev, images: [...(prev.images || []), ...uploadedUrls] };
            if (type === 'ITEM' && itemIdx !== undefined) {
                const items = [...(prev.items || [])];
                items[itemIdx] = { ...items[itemIdx], images: [...(items[itemIdx].images || []), ...uploadedUrls] };
                return { ...prev, items };
            }
            return prev;
        });
    } catch (err) { 
        console.error(err); 
        alert("Lỗi khi tải ảnh lên máy chủ.");
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
          const uploadedUrl = await uploadQMSImage(updatedImg, formData.id || 'temp', 'SPR', user.role);
          
          setFormData(prev => {
              if (type === 'MAIN') { const next = [...(prev.images || [])]; next[idx] = uploadedUrl; return { ...prev, images: next }; }
              if (type === 'ITEM' && itemIdx !== undefined) {
                  const items = [...(prev.items || [])];
                  items[itemIdx].images![idx] = uploadedUrl;
                  return { ...prev, items };
              }
              return prev;
          });
      } catch (err) {
          console.error(err);
          alert("Lỗi khi lưu ảnh đã chỉnh sửa.");
      } finally {
          setIsProcessingImages(false);
      }
  };

  const handleSubmit = async () => {
    if (!formData.ma_ct) { alert("Vui lòng nhập mã dự án."); return; }
    setIsSaving(true);
    try { await onSave({ ...formData, status: InspectionStatus.PENDING, updatedAt: new Date().toISOString() } as Inspection); }
    catch (e) { alert("Lỗi khi lưu phiếu SPR."); } finally { setIsSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      {(isProcessingImages || isSaving) && (
          <div className="absolute inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white p-6 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest">{isSaving ? "Đang lưu báo cáo..." : "Đang xử lý hình ảnh..."}</p>
              </div>
          </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar bg-slate-50">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-slate-700 border-b border-slate-50 pb-2 mb-2 font-black uppercase tracking-widest flex items-center gap-2"><Box className="w-4 h-4"/> I. THÔNG TIN MẪU CHUẨN</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Mã Dự Án / Mã Mẫu</label><input value={formData.ma_ct || ''} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-bold outline-none"/></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Tên Mẫu</label><input value={formData.ten_hang_muc || ''} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-bold outline-none"/></div>
            </div>
            <div className="pt-2 border-t border-slate-50">
                <div className="space-y-1.5 bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                    <label className="text-[8px] font-black text-blue-600 uppercase flex items-center justify-between">ẢNH HIỆN TRƯỜNG<div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'MAIN' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-blue-600" type="button"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => { setActiveUploadContext({ type: 'MAIN' }); fileInputRef.current?.click(); }} className="p-1 hover:text-blue-600" type="button"><ImageIcon className="w-3.5 h-3.5"/></button></div></label>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">{formData.images?.map((img, i) => (<img key={i} src={getProxyImageUrl(img)} className="w-10 h-10 rounded border border-slate-200 object-cover shrink-0" onClick={() => handleEditImage(formData.images!, i, { type: 'MAIN' })} />))}</div>
                </div>
            </div>
        </div>
        <div className="space-y-3">
            <h3 className="font-black text-slate-700 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-slate-300 pb-2 px-1 text-xs"><LayoutList className="w-4 h-4 text-slate-600"/> II. TIÊU CHÍ KIỂM MẪU ({formData.items?.length || 0})</h3>
            <div className="space-y-4">
                {formData.items?.map((item, idx) => (
                    <div key={item.id} className="bg-white rounded-[2rem] p-5 border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-3">
                            <div className="flex-1"><span className="bg-slate-100 text-[8pt] font-black uppercase text-slate-500 px-2.5 py-0.5 rounded-full border border-slate-200">{item.category}</span><p className="w-full font-black text-[11pt] text-slate-800 uppercase tracking-tight mt-1">{item.label}</p></div>
                        </div>
                        <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 border border-slate-200 shadow-inner w-fit">
                            {[CheckStatus.PASS, CheckStatus.FAIL].map(st => (
                                <button key={st} onClick={() => handleItemChange(idx, 'status', st)} className={`px-4 py-2 rounded-xl text-[9pt] font-black uppercase tracking-tight transition-all ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-lg' : 'bg-red-600 text-white shadow-lg') : 'text-slate-400'}`} type="button">{st}</button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 mt-4">
                            <textarea value={item.notes || ''} onChange={e => handleItemChange(idx, 'notes', e.target.value)} className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none h-16" placeholder="Ghi chú mẫu..."/>
                            <div className="flex flex-col gap-2">
                                <button onClick={() => { setActiveUploadContext({ type: 'ITEM', itemIdx: idx }); cameraInputRef.current?.click(); }} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600" type="button"><Camera className="w-5 h-5" /></button>
                                <button onClick={() => { setActiveUploadContext({ type: 'ITEM', itemIdx: idx }); fileInputRef.current?.click(); }} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600" type="button"><ImageIcon className="w-5 h-5" /></button>
                            </div>
                        </div>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar min-h-[40px] mt-2">
                            {item.images?.map((img, i) => (
                                <div key={i} className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-slate-200 shadow-sm cursor-pointer group" onClick={() => handleEditImage(item.images!, i, { type: 'ITEM', itemIdx: idx })}>
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
      <div className="p-4 md:p-6 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0 shadow-sm z-20">
        <button onClick={onCancel} className="px-8 py-3.5 text-slate-500 font-black uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all" type="button">Hủy</button>
        <button onClick={handleSubmit} disabled={isSaving || isProcessingImages} className="px-16 py-4 bg-slate-700 text-white font-black uppercase tracking-[0.2em] rounded-2xl shadow-2xl hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-xs" type="button">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
            <span>HOÀN TẤT SPR</span>
        </button>
      </div>

      {editorState && <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} onSave={onImageSave} readOnly={false}/>}
      
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
    </div>
  );
};
