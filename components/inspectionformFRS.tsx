
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, Workshop, NCR } from '../types';
import { Save, X, Camera, Image as ImageIcon, ChevronDown, MapPin, Box, AlertTriangle, Trash2, LayoutList, FileText, QrCode, PenTool, Eraser, Loader2 } from 'lucide-react';
import { uploadQMSImage } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  workshops: Workshop[];
  user: User;
}

export const InspectionFormFRS: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, workshops, user }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({ 
    id: `FRS-${Date.now()}`, 
    date: new Date().toISOString().split('T')[0], 
    status: InspectionStatus.DRAFT, 
    items: [], 
    images: [], 
    score: 0, 
    type: 'FSR',
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
            uploadQMSImage(file, formData.id || 'temp', 'FRS', user.role)
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
          const uploadedUrl = await uploadQMSImage(updatedImg, formData.id || 'temp', 'FRS', user.role);
          
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
    catch (e) { alert("Lỗi khi lưu phiếu FRS."); } finally { setIsSaving(false); }
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-slate-50">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-orange-700 border-b border-orange-50 pb-2 mb-1 font-black uppercase tracking-widest flex items-center gap-2 text-xs"><Box className="w-4 h-4"/> I. THÔNG TIN MẪU ĐỐI CHỨNG</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Mã Dự Án / Mẫu</label>
                    <input value={formData.ma_ct || ''} readOnly className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-slate-700 font-bold text-[11px] outline-none h-8"/>
                </div>
                <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Tên Sản Phẩm Mẫu</label>
                    <input value={formData.ten_hang_muc || ''} readOnly className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-slate-700 font-bold text-[11px] outline-none h-8"/>
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Ngày kiểm mẫu</label>
                    <input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold outline-none text-[11px] h-8"/>
                </div>
                <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">QC/QA Lead</label>
                    <input value={formData.inspectorName || user.name} readOnly className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-md font-bold text-[11px] h-8"/>
                </div>
            </div>
            
            <div className="pt-2 border-t border-slate-50">
                <div className="space-y-1.5 bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                    <label className="text-[8px] font-black text-blue-600 uppercase flex items-center justify-between">ẢNH HIỆN TRƯỜNG<div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'MAIN' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-blue-600" type="button"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => { setActiveUploadContext({ type: 'MAIN' }); fileInputRef.current?.click(); }} className="p-1 hover:text-blue-600" type="button"><ImageIcon className="w-3.5 h-3.5"/></button></div></label>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">{formData.images?.map((img, i) => (<img key={i} src={img} className="w-10 h-10 rounded border border-slate-200 object-cover shrink-0" onClick={() => handleEditImage(formData.images!, i, { type: 'MAIN' })} />))}</div>
                </div>
            </div>
        </div>
        
        <div className="space-y-3">
            <h3 className="font-black text-slate-700 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-slate-300 pb-2 px-1 text-xs"><LayoutList className="w-4 h-4 text-orange-600"/> II. TIÊU CHÍ THẨM ĐỊNH MẪU ĐẦU TIÊN ({formData.items?.length || 0})</h3>
            <div className="space-y-3">
                {formData.items?.map((item, idx) => (
                    <div key={item.id} className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm hover:border-orange-300 transition-colors">
                        <div className="flex justify-between items-start mb-2 border-b border-slate-100 pb-2">
                            <div className="flex-1">
                                <span className="bg-slate-100 text-[8px] font-black uppercase text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">{item.category}</span>
                                <p className="w-full font-black text-xs text-slate-800 uppercase tracking-tight mt-1">{item.label}</p>
                            </div>
                        </div>
                        <div className="flex bg-slate-50 p-1 rounded-lg gap-1 border border-slate-200 shadow-inner w-fit mb-2">
                            {[CheckStatus.PASS, CheckStatus.FAIL].map(st => (
                                <button 
                                    key={st} 
                                    onClick={() => handleItemChange(idx, 'status', st)} 
                                    className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-sm' : 'bg-red-600 text-white shadow-sm') : 'text-slate-400 hover:bg-white'}`} 
                                    type="button"
                                >
                                    {st}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <textarea 
                                value={item.notes || ''} 
                                onChange={e => handleItemChange(idx, 'notes', e.target.value)} 
                                className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-[11px] font-medium focus:ring-1 ring-orange-500 transition-all resize-none h-16" 
                                rows={2}
                                placeholder="Nhận xét mẫu..."
                            />
                            <div className="flex flex-col gap-2">
                                <button onClick={() => { setActiveUploadContext({ type: 'ITEM', itemIdx: idx }); cameraInputRef.current?.click(); }} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 hover:text-orange-600" type="button"><Camera className="w-4 h-4" /></button>
                                <button onClick={() => { setActiveUploadContext({ type: 'ITEM', itemIdx: idx }); fileInputRef.current?.click(); }} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 hover:text-orange-600" type="button"><ImageIcon className="w-4 h-4" /></button>
                            </div>
                        </div>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar min-h-[40px]">
                            {item.images?.map((img, i) => (
                                <img key={i} src={img} className="w-12 h-12 rounded-lg border border-slate-200 object-cover shrink-0 cursor-zoom-in shadow-sm" onClick={() => handleEditImage(item.images!, i, { type: 'ITEM', itemIdx: idx })} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>
      <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0 shadow-sm z-20 sticky bottom-0">
        <button onClick={onCancel} className="px-6 py-2 text-slate-500 font-bold uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all border border-slate-200 text-[10px]" type="button">Hủy</button>
        <button onClick={handleSubmit} disabled={isSaving || isProcessingImages} className="px-10 py-2.5 bg-orange-700 text-white font-black uppercase tracking-[0.2em] rounded-xl shadow-lg hover:bg-orange-800 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-[10px]" type="button">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            <span>HOÀN TẤT FRS</span>
        </button>
      </div>

      {editorState && <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} onSave={onImageSave} readOnly={false}/>}
      
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
    </div>
  );
};
