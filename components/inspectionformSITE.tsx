import { getProxyImageUrl } from '../src/utils';

import React, { useState, useRef, useEffect } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, Workshop, ModuleId } from '../types';
import { 
  Save, X, Camera, Image as ImageIcon, ChevronDown, 
  MapPin, Box, AlertTriangle, Trash2, LayoutList, 
  QrCode, PenTool, Eraser, Loader2, 
  AlertOctagon, Locate, History, Clock
} from 'lucide-react';
import { uploadQMSImage } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';
// Added missing QRScannerModal import
import { QRScannerModal } from './QRScannerModal';
import { SITE_TEMPLATES } from '../constants';

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
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: any } | null>(null);

  const handleInputChange = (field: keyof Inspection, value: any) => { setFormData(prev => ({ ...prev, [field]: value })); };

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
    try {
        const uploadedUrls = await Promise.all(
            Array.from(files).map(async (file: File) => {
                return await uploadQMSImage(file, { 
                    entityId: formData.id || 'new', 
                    type: 'SITE', 
                    role: activeUploadId === 'MAIN' ? 'MAIN' : 'ITEM' 
                });
            })
        );
        if (activeUploadId === 'MAIN') setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...uploadedUrls] }));
        else setFormData(prev => ({ ...prev, items: prev.items?.map(it => it.id === activeUploadId ? { ...it, images: [...(it.images || []), ...uploadedUrls] } : it) }));
    } catch (err) {
        console.error("ISO-UPLOAD: Failed", err);
        alert("Lỗi tải ảnh lên.");
    } finally { setIsProcessingImages(false); e.target.value = ''; }
  };

  const handleEditImage = (images: string[], index: number, context: any) => {
    setEditorState({ images, index, context });
  };

  const onImageSave = async (idx: number, updatedImg: string) => {
    if (!editorState) return;
    setIsProcessingImages(true);
    try {
        const { context } = editorState;
        // Upload edited image
        const newUrl = await uploadQMSImage(updatedImg, { 
            entityId: formData.id || 'new', 
            type: 'SITE', 
            role: context.itemId === 'MAIN' ? 'MAIN' : 'ITEM' 
        });

        if (context.itemId === 'MAIN') {
            setFormData(prev => {
                const next = [...(prev.images || [])];
                next[idx] = newUrl;
                return { ...prev, images: next };
            });
        } else {
            setFormData(prev => ({
                ...prev,
                items: prev.items?.map(it => it.id === context.itemId ? {
                    ...it,
                    images: it.images?.map((img, i) => i === idx ? newUrl : img)
                } : it)
            }));
        }
    } catch (e) {
        console.error("Failed to save edited image:", e);
        alert("Không thể lưu ảnh đã chỉnh sửa.");
    } finally {
        setIsProcessingImages(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.ma_ct) { alert("Thiếu mã công trình."); return; }
    if (!formData.signature) { alert("Yêu cầu chữ ký QC."); return; }
    setIsSaving(true);
    try {
        // If status wasn't changed by user (still DRAFT), apply auto-status logic.
        // Otherwise, use user-selected status.
        let statusToSave = formData.status;
        if (statusToSave === InspectionStatus.DRAFT) {
            const hasFail = formData.items?.some(it => it.status === CheckStatus.FAIL);
            statusToSave = hasFail ? InspectionStatus.FLAGGED : InspectionStatus.PENDING;
        }

        await onSave({ ...formData, status: statusToSave, updatedAt: new Date().toISOString() } as Inspection);
    } catch (e) { alert("Lỗi lưu phiếu."); } finally { setIsSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative no-scroll-x" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      {(isProcessingImages || isSaving) && (
          <div className="absolute inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white p-6 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest">{isSaving ? 'ĐANG LƯU HỒ SƠ...' : 'ĐANG XỬ LÝ HÌNH ÁNH...'}</p>
              </div>
          </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar bg-slate-50 pb-28">
        {/* I. THÔNG TIN CÔNG TRÌNH */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-amber-700 border-b border-amber-50 pb-2 mb-1 font-black uppercase tracking-widest flex items-center gap-2 text-xs"><MapPin className="w-4 h-4"/> I. THÔNG TIN CÔNG TRÌNH</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-1">Mã Công Trình</label><input value={formData.ma_ct || ''} readOnly className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 font-bold text-xs shadow-inner uppercase"/></div>
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-1">Tên Công Trình</label><input value={formData.ten_ct || ''} readOnly className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 font-bold text-xs shadow-inner uppercase"/></div>
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-1">Headcode</label><input value={formData.headcode || ''} onChange={e => handleInputChange('headcode', e.target.value)} onBlur={() => setCommittedHeadcode(formData.headcode || null)} onKeyDown={e => e.key === 'Enter' && setCommittedHeadcode(formData.headcode || null)} className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold text-xs focus:ring-1 ring-amber-200 outline-none" placeholder="Nhập mã Headcode..."/></div>
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-1">Tên Hạng Mục</label><input value={formData.ten_hang_muc || ''} onChange={e => handleInputChange('ten_hang_muc', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold text-xs focus:ring-1 ring-amber-200 outline-none" placeholder="Tên hạng mục..."/></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-1">Ngày kiểm tra</label><input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold text-xs focus:ring-1 ring-amber-200 outline-none"/></div>
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-1">Trạng thái phiếu</label>
                  <select value={formData.status} onChange={e => handleInputChange('status', e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold text-xs focus:ring-1 ring-amber-200 outline-none">
                    <option value={InspectionStatus.PENDING}>Chưa xử lý</option>
                    <option value={InspectionStatus.SUBMITTED}>Đang xử lý</option>
                    <option value={InspectionStatus.APPROVED}>Đã phê duyệt</option>
                    <option value={InspectionStatus.REJECTED}>Đã từ chối</option>
                  </select>
                </div>
                <div className="md:col-span-1 space-y-1"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-1">QC Site</label><input value={formData.inspectorName || user.name} readOnly className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 font-bold text-xs uppercase"/></div>
                <div className="md:col-span-3 space-y-1"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-1">Vị trí lắp đặt / GPS</label><div className="flex gap-2"><input value={formData.location || ''} onChange={e => handleInputChange('location', e.target.value)} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg font-bold text-xs outline-none" placeholder="Phòng, Tầng, Căn hộ..."/><button onClick={handleGetLocation} className="p-2 bg-slate-100 rounded-lg border border-slate-200 text-slate-500 hover:bg-amber-50 hover:text-amber-600 transition-colors" type="button"><Locate className="w-4 h-4"/></button></div></div>
            </div>
        </section>

        {/* II. HÌNH ÁNH HIỆN TRƯỜNG */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-amber-700 border-b border-amber-50 pb-2 mb-1 font-black uppercase tracking-widest flex items-center gap-2 text-xs"><ImageIcon className="w-4 h-4"/> II. HÌNH ÁNH HIỆN TRƯỜNG TỔNG QUÁT</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                <button onClick={() => { setActiveUploadId('MAIN'); cameraInputRef.current?.click(); }} className="w-20 h-20 bg-amber-50 border border-amber-100 rounded-2xl flex flex-col items-center justify-center text-amber-600 shrink-0 transition-all active:scale-95" type="button"><Camera className="w-6 h-6 mb-1"/><span className="font-black text-[8px] uppercase">Chụp ảnh</span></button>
                <button onClick={() => { setActiveUploadId('MAIN'); fileInputRef.current?.click(); }} className="w-20 h-20 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 shrink-0 transition-all active:scale-95" type="button"><ImageIcon className="w-6 h-6 mb-1"/><span className="font-black text-[8px] uppercase">Tải tệp</span></button>
                {formData.images?.map((img, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 shrink-0 group shadow-sm">
                        <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" />
                        <button onClick={() => setFormData({...formData, images: formData.images?.filter((_, i) => i !== idx)})} className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full md:opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button>
                    </div>
                ))}
            </div>
        </section>
        
        {/* III. CHECKLIST LẮP ĐẶT */}
        <section className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-300 pb-2 px-1">
              <h3 className="font-black text-slate-700 uppercase tracking-[0.2em] flex items-center gap-2 text-xs"><LayoutList className="w-4 h-4 text-amber-700"/> III. TIÊU CHÍ THẨM ĐỊNH LẮP ĐẶT ({formData.items?.length || 0})</h3>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nhóm sản phẩm:</label>
                <select 
                  value={selectedGroup}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-1 ring-amber-500"
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
                    <div key={item.id} className={`bg-white rounded-2xl p-4 border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-200 bg-red-50/10' : 'border-slate-200'}`}>
                        <div className="flex justify-between items-start mb-3 border-b border-slate-50 pb-2">
                            <div className="flex-1">
                                <span className="bg-slate-100 text-[8px] font-black uppercase text-slate-500 px-2 py-0.5 rounded-full border border-slate-200 tracking-widest">{item.category}</span>
                                <p className="w-full font-black text-xs text-slate-800 uppercase tracking-tight mt-1.5">{item.label}</p>
                            </div>
                            <button onClick={() => setFormData({...formData, items: formData.items?.filter(it => it.id !== item.id)})} className="p-1.5 text-slate-300 hover:text-red-500" type="button"><Trash2 className="w-4 h-4"/></button>
                        </div>
                        <div className="flex flex-wrap gap-3 items-center">
                            <div className="flex bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200 shadow-inner w-fit">
                                {[CheckStatus.PASS, CheckStatus.FAIL, CheckStatus.CONDITIONAL].map(st => (
                                    <button 
                                        key={st} 
                                        onClick={() => handleItemChange(idx, 'status', st)} 
                                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-md' : st === CheckStatus.FAIL ? 'bg-red-600 text-white shadow-md' : 'bg-amber-500 text-white shadow-md') : 'text-slate-400 hover:bg-white'}`} 
                                        type="button"
                                    >
                                        {st === CheckStatus.PASS ? 'Đạt' : st === CheckStatus.FAIL ? 'Hỏng' : 'ĐK'}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-2 ml-auto">
                                <button onClick={() => { setActiveUploadId(item.id); cameraInputRef.current?.click(); }} className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-amber-600 active:scale-95 transition-all" type="button" title="Chụp ảnh"><Camera className="w-4 h-4"/></button>
                                <button onClick={() => { setActiveUploadId(item.id); fileInputRef.current?.click(); }} className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-amber-600 active:scale-95 transition-all" type="button" title="Tải ảnh"><ImageIcon className="w-4 h-4"/></button>
                                {item.status === CheckStatus.FAIL && <button className="px-3 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-lg active:scale-95" type="button"><AlertOctagon className="w-3.5 h-3.5"/> NCR</button>}
                            </div>
                        </div>
                        <textarea 
                            value={item.notes || ''} 
                            onChange={e => handleItemChange(idx, 'notes', e.target.value)} 
                            className="w-full mt-3 p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none text-[11px] font-medium focus:ring-1 ring-amber-500 transition-all resize-none h-20 shadow-inner" 
                            placeholder="Ghi chú kỹ thuật tại vị trí lắp..."
                        />
                        {item.images && item.images.length > 0 && (
                            <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar py-1">
                                {item.images.map((img, i) => (
                                    <div key={i} className="relative w-14 h-14 shrink-0 rounded-xl overflow-hidden border border-slate-200 shadow-sm cursor-pointer group" onClick={() => handleEditImage(item.images!, i, { itemId: item.id })}>
                                        <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" />
                                        <button onClick={(e) => { e.stopPropagation(); const newImgs = item.images?.filter((_, idx) => idx !== i); handleItemChange(idx, 'images', newImgs); }} className="absolute top-0 right-0 bg-red-600 text-white p-0.5 rounded-bl shadow md:opacity-0 group-hover:opacity-100 transition-opacity" type="button"><X className="w-3 h-3"/></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                <button onClick={() => setFormData({...formData, items: [...(Array.isArray(formData.items) ? formData.items : []), { id: `new_${Date.now()}`, category: 'HIỆN TRƯỜNG', label: 'HẠNG MỤC PHÁT SINH', status: CheckStatus.PENDING }]})} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-black uppercase tracking-[0.2em] transition-all text-[10px] hover:bg-slate-50 hover:border-amber-300 hover:text-amber-600" type="button">+ THÊM TIÊU CHÍ HIỆN TRƯỜNG</button>
            </div>
        </section>

        {/* IV. CHỮ KÝ XÁC NHẬN */}
        <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-amber-800 border-b border-amber-50 pb-3 font-black uppercase tracking-widest flex items-center gap-2 text-xs"><PenTool className="w-4 h-4"/> IV. XÁC NHẬN QC HIỆN TRƯỜNG</h3>
            <textarea value={formData.summary || ''} onChange={e => handleInputChange('summary', e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:ring-1 ring-amber-200 outline-none h-28 resize-none shadow-inner" placeholder="Tóm tắt tình trạng hoàn thiện và các yêu cầu sửa chữa cần thiết..."/>
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
      <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between gap-4 sticky bottom-0 z-40 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
        <button onClick={onCancel} className="h-14 px-8 text-slate-500 font-black uppercase tracking-[0.2em] hover:bg-slate-50 rounded-[1.5rem] transition-all border border-slate-200 text-[10px]" type="button">HỦY BỎ</button>
        <button onClick={handleSubmit} disabled={isSaving || isProcessingImages} className="h-14 flex-1 bg-amber-700 text-white font-black uppercase tracking-[0.2em] rounded-[1.5rem] shadow-2xl shadow-amber-500/20 hover:bg-amber-800 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-[10px]" type="button">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
            <span>HOÀN TẤT SITE QC</span>
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
