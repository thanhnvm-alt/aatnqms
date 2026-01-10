
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, PlanItem, User, Workshop, NCR, DefectLibraryItem } from '../types';
import { 
  Save, X, Camera, Image as ImageIcon, ChevronDown, 
  MapPin, Box, AlertTriangle, 
  Trash2, Info, LayoutList,
  AlertOctagon, FileText, QrCode,
  Ruler, Microscope, PenTool, Eraser, BookOpen, Search,
  Loader2, Sparkles, Send
} from 'lucide-react';
import { generateNCRSuggestions } from '../services/geminiService';
import { fetchPlans, fetchDefectLibrary } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';
import { QRScannerModal } from './QRScannerModal';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  plans: PlanItem[];
  workshops: Workshop[];
  user: User;
}

const resizeImage = (base64Str: string, maxWidth = 1280): Promise<string> => {
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
      if (!ctx) { resolve(base64Str); return; }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.7;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > 133333 && quality > 0.1) { quality -= 0.1; dataUrl = canvas.toDataURL('image/jpeg', quality); }
      resolve(dataUrl);
    };
    img.onerror = () => resolve(base64Str);
  });
};

const SignaturePad = ({ label, value, onChange, readOnly = false }: { label: string; value?: string; onChange: (base64: string) => void; readOnly?: boolean; }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isEmpty, setIsEmpty] = useState(!value);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas && value) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => { ctx?.drawImage(img, 0, 0, canvas.width, canvas.height); };
            img.src = value;
            setIsEmpty(false);
        }
    }, [value]);
    const startDrawing = (e: any) => {
        if (readOnly) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000000';
        setIsDrawing(true);
        setIsEmpty(false);
    };
    const draw = (e: any) => {
        if (!isDrawing || readOnly) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
    };
    const stopDrawing = () => { if (readOnly) return; setIsDrawing(false); if (canvasRef.current) onChange(canvasRef.current.toDataURL()); };
    const clearSignature = () => { if (readOnly) return; const canvas = canvasRef.current; if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height); onChange(''); setIsEmpty(true); } };
    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center px-1">
                <label className="text-slate-700 font-bold uppercase text-[10px] tracking-widest">{label}</label>
                {!readOnly && <button onClick={clearSignature} className="text-[10px] font-bold text-red-600 uppercase flex items-center gap-1 hover:underline" type="button"><Eraser className="w-3 h-3" /> Xóa</button>}
            </div>
            <div className="border border-slate-300 rounded-[1.5rem] bg-white overflow-hidden relative h-32">
                <canvas ref={canvasRef} width={400} height={128} className="w-full h-full touch-none cursor-crosshair" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                {isEmpty && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] font-black uppercase tracking-widest">Ký tại đây</div>}
            </div>
        </div>
    );
};

const NCRModal = ({ isOpen, onClose, onSave, initialData, itemName, inspectionStage }: { isOpen: boolean; onClose: () => void; onSave: (ncr: NCR) => void; initialData?: NCR; itemName: string; inspectionStage?: string; }) => {
    const [ncrData, setNcrData] = useState<Partial<NCR>>({ severity: 'MINOR', issueDescription: '', rootCause: '', solution: '', responsiblePerson: '', imagesBefore: [], imagesAfter: [], status: 'OPEN' });
    const [library, setLibrary] = useState<DefectLibraryItem[]>([]);
    const [showLibrary, setShowLibrary] = useState(false);
    const [libSearch, setLibSearch] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const [uploadTarget, setUploadTarget] = useState<'BEFORE' | 'AFTER'>('BEFORE');
    useEffect(() => {
        if (isOpen) {
            setNcrData(initialData || { severity: 'MINOR', issueDescription: '', rootCause: '', solution: '', responsiblePerson: '', imagesBefore: [], imagesAfter: [], status: 'OPEN' });
            fetchDefectLibrary().then(setLibrary);
        }
    }, [isOpen, initialData]);
    const filteredLib = useMemo(() => {
        const search = (libSearch || '').toLowerCase();
        return (library || []).filter(item => (!search || item.name.toLowerCase().includes(search) || item.code.toLowerCase().includes(search)) && (!inspectionStage || item.stage === inspectionStage));
    }, [library, libSearch, inspectionStage]);
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files; if (!files) return;
        Array.from(files).forEach((file: File) => {
            const reader = new FileReader();
            reader.onloadend = async () => { if (typeof reader.result === 'string') { const resized = await resizeImage(reader.result); setNcrData(prev => ({ ...prev, [uploadTarget === 'BEFORE' ? 'imagesBefore' : 'imagesAfter']: [...(prev[uploadTarget === 'BEFORE' ? 'imagesBefore' : 'imagesAfter'] || []), resized] })); } };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 md:p-4">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[98vh]">
                <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center shrink-0">
                    <h3 className="text-red-600 flex items-center gap-2 font-bold uppercase text-sm tracking-tight"><AlertOctagon className="w-5 h-5" /> NCR - Phiếu sai lỗi</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button>
                </div>
                <div className="p-4 md:p-6 space-y-4 overflow-y-auto flex-1 no-scrollbar bg-slate-50/30">
                    <div className="border border-blue-200 rounded-xl overflow-hidden bg-white">
                        <button onClick={() => setShowLibrary(!showLibrary)} className="w-full p-3 flex justify-between items-center text-blue-700 font-bold bg-blue-50/50" type="button">
                            <span className="flex items-center gap-2 text-xs uppercase tracking-widest"><BookOpen className="w-4 h-4"/> Chọn lỗi thư viện</span>
                            <ChevronDown className={`w-4 h-4 transition-transform ${showLibrary ? 'rotate-180' : ''}`} />
                        </button>
                        {showLibrary && (
                            <div className="p-3 space-y-3 bg-white border-t border-blue-100">
                                <input value={libSearch} onChange={e => setLibSearch(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-xs outline-none focus:ring-2 ring-blue-100" placeholder="Tìm lỗi..." />
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                    {(filteredLib || []).map(item => (
                                        <div key={item.id} onClick={() => { setNcrData({...ncrData, issueDescription: item.description, severity: item.severity as any, defect_code: item.code, solution: item.suggestedAction || ncrData.solution }); setShowLibrary(false); }} className="p-2 border rounded-lg hover:bg-blue-50 cursor-pointer flex justify-between items-center group">
                                            <div className="flex-1 min-w-0 text-xs"><p className="font-bold truncate uppercase">{item.name}</p></div>
                                            <ChevronDown className="w-3 h-3 text-slate-300 -rotate-90 group-hover:text-blue-500" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mô tả lỗi *</label><textarea className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-red-100 bg-white text-sm" rows={2} value={ncrData.issueDescription} onChange={e => setNcrData({...ncrData, issueDescription: e.target.value})} placeholder="Hiện trạng lỗi..." /></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mức độ</label><select className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-sm font-bold" value={ncrData.severity} onChange={e => setNcrData({...ncrData, severity: e.target.value as any})}><option value="MINOR">MINOR</option><option value="MAJOR">MAJOR</option><option value="CRITICAL">CRITICAL</option></select></div>
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Người phụ trách</label><input className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-sm" value={ncrData.responsiblePerson || ''} onChange={e => setNcrData({...ncrData, responsiblePerson: e.target.value})} placeholder="Tên..." /></div>
                    </div>
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
                <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleImageUpload} />
                <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
                    <button onClick={onClose} className="px-6 py-2 text-slate-600 font-bold uppercase text-xs tracking-widest">Hủy</button>
                    <button onClick={() => onSave(ncrData as NCR)} disabled={!ncrData.issueDescription} className="px-10 py-3 bg-red-600 text-white rounded-xl shadow-xl shadow-red-200 font-black uppercase text-xs tracking-widest disabled:opacity-50">Lưu NCR</button>
                </div>
            </div>
        </div>
    );
};

export const InspectionFormPQC: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, plans, workshops, user }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({ id: `INS-${Date.now()}`, date: new Date().toISOString().split('T')[0], status: InspectionStatus.DRAFT, items: [], images: [], score: 0, signature: '', productionSignature: '', inspectedQuantity: 0, passedQuantity: 0, failedQuantity: 0, ...initialData });
  const [searchCode, setSearchCode] = useState(initialData?.ma_nha_may || ''); 
  const [activeNcrItemIndex, setActiveNcrItemIndex] = useState<number | null>(null);
  const [isNcrModalOpen, setIsNcrModalOpen] = useState(false);
  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: { type: 'MAIN' | 'ITEM', itemId?: string }; } | null>(null);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Available stages based on selected workshop
  const availableStages = useMemo(() => { 
      if (!formData.workshop) return []; 
      const selectedWorkshop = workshops.find(ws => ws.code === formData.workshop); 
      return selectedWorkshop?.stages || []; 
  }, [formData.workshop, workshops]);

  const visibleItems = useMemo(() => { 
      if (!formData.inspectionStage) return []; 
      if (!formData.items) return []; 
      return formData.items.filter(item => !item.stage || item.stage === formData.inspectionStage); 
  }, [formData.items, formData.inspectionStage]);
  
  const lookupPlanInfo = async (value: string) => {
      if (!value) return; setIsLookupLoading(true);
      try {
          const searchTerm = value.toLowerCase().trim();
          const apiRes = await fetchPlans(value, 1, 5);
          // Match logic from plans
          const match = (apiRes.items || []).find(p => (p.headcode || '').toLowerCase().trim() === searchTerm || (p.ma_nha_may || '').toLowerCase().trim() === searchTerm);
          
          if (match) {
              setFormData(prev => ({ 
                  ...prev, 
                  ma_ct: match.ma_ct, 
                  ten_ct: match.ten_ct, 
                  ten_hang_muc: match.ten_hang_muc, 
                  dvt: match.dvt, 
                  so_luong_ipo: match.so_luong_ipo, 
                  // ISO UPDATE: Tự động gán ma_nha_may từ kế hoạch vào ma_nha_may của biểu mẫu
                  ma_nha_may: match.ma_nha_may,
                  workshop: match.ma_nha_may
              }));
              // Đồng bộ ô nhập liệu hiển thị mã chính thức
              setSearchCode(match.ma_nha_may || value);
          }
      } catch (e) { console.error(e); } finally { setIsLookupLoading(false); }
  };

  const handleInputChange = (field: keyof Inspection, value: any) => {
    setFormData(prev => {
        const next = { ...prev, [field]: value };
        const ins = parseFloat(String(next.inspectedQuantity || 0)); 
        const pas = parseFloat(String(next.passedQuantity || 0)); 
        const fai = parseFloat(String(next.failedQuantity || 0));
        if (field === 'inspectedQuantity') next.passedQuantity = Math.max(0, value - fai);
        else if (field === 'passedQuantity') next.failedQuantity = Math.max(0, ins - value);
        else if (field === 'failedQuantity') next.passedQuantity = Math.max(0, ins - value);
        return next;
    });
  };

  const handleItemChange = (index: number, field: keyof CheckItem, value: any) => {
    setFormData(prev => {
        const newItems = [...(prev.items || [])];
        if (newItems[index]) {
            newItems[index] = { ...newItems[index], [field]: value };
            if (field === 'status' && value === CheckStatus.FAIL && !newItems[index].ncr) { setActiveNcrItemIndex(index); setIsNcrModalOpen(true); }
        }
        return { ...prev, items: newItems };
    });
  };

  const handleSubmit = async () => {
    if (!formData.ma_ct || !formData.inspectionStage) { alert("Vui lòng nhập đủ thông tin và chọn công đoạn."); return; }
    setIsSaving(true);
    try {
        const itemsToSave = (formData.items || []).filter(it => it.stage === formData.inspectionStage || !it.stage);
        await onSave({ ...formData, items: itemsToSave, status: InspectionStatus.PENDING, inspectorName: user.name, updatedAt: new Date().toISOString() } as Inspection);
    } catch (e) { alert("Lỗi khi lưu phiếu."); } finally { setIsSaving(false); }
  };

  const handleFileUpload = (req: React.ChangeEvent<HTMLInputElement>) => {
    const files = req.target.files; if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = async () => { if (typeof reader.result === 'string') { const processed = await resizeImage(reader.result); if (activeUploadId === 'MAIN') setFormData(prev => ({ ...prev, images: [...(prev.images || []), processed] })); else setFormData(prev => ({ ...prev, items: prev.items?.map(i => i.id === activeUploadId ? { ...i, images: [...(i.images || []), processed] } : i) })); } };
      reader.readAsDataURL(file);
    });
    req.target.value = '';
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg md:shadow-xl overflow-hidden animate-in slide-in-from-bottom duration-300 relative" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt' }}>
      <div className="bg-white border-b border-slate-300 z-10 shrink-0 flex justify-between items-center px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600" /><div><h2 className="font-black text-[13pt] uppercase tracking-tighter leading-none">QAQC PQC</h2><p className="text-[8pt] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Kiểm tra sản xuất</p></div></div>
          <button onClick={onCancel} className="p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-full transition-all" type="button"><X className="w-6 h-6" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar bg-slate-50">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-blue-700 border-b border-blue-50 pb-2 mb-2 font-black text-xs uppercase tracking-widest flex items-center gap-2"><Box className="w-4 h-4"/> I. THÔNG TIN SẢN PHẨM</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Mã định danh (Headcode)</label>
                    <div className="relative flex items-center">
                        <input value={searchCode} onChange={e => { setSearchCode(e.target.value); handleInputChange('ma_nha_may', e.target.value); if(e.target.value.length >= 3) lookupPlanInfo(e.target.value); }} className="w-full p-2.5 pr-10 border border-slate-200 rounded-xl focus:ring-2 ring-blue-100 outline-none font-bold text-sm" placeholder="Quét/Nhập mã..."/>
                        <button onClick={() => setShowScanner(true)} className="absolute right-2 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" type="button"><QrCode className="w-5 h-5"/></button>
                    </div>
                </div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Mã Dự Án / PO</label><input value={formData.ma_ct || ''} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-bold text-sm"/></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Tên Hạng Mục</label><input value={formData.ten_hang_muc || ''} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-bold text-sm"/></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Số lượng IPO</label><input type="number" value={formData.so_luong_ipo || 0} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"/></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">ĐVT</label><input value={formData.dvt || 'PCS'} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"/></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Ngày kiểm</label><input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl font-bold text-sm"/></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">QC/QA</label><input value={formData.inspectorName || user.name} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"/></div>
            </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-blue-700 border-b border-blue-50 pb-2 mb-2 font-black text-xs uppercase tracking-widest flex items-center gap-2"><MapPin className="w-4 h-4"/> II. ĐỊA ĐIỂM & SỐ LƯỢNG</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Xưởng sản xuất</label><select value={formData.workshop || ''} onChange={e => handleInputChange('workshop', e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-sm font-bold shadow-sm"><option value="">-- Chọn xưởng --</option>{(workshops || []).map(ws => <option key={ws.code} value={ws.code}>{ws.name}</option>)}</select></div>
                 <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Công đoạn kiểm tra *</label><select value={formData.inspectionStage || ''} onChange={e => handleInputChange('inspectionStage', e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-sm font-bold shadow-sm"><option value="">-- Chọn giai đoạn --</option>{(availableStages || []).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 bg-slate-50/50 p-4 rounded-2xl">
                 <div className="space-y-1"><label className="font-black text-slate-500 text-[9pt] uppercase tracking-widest ml-1">SL Thực tế</label><input type="number" step="0.01" value={formData.inspectedQuantity || ''} onChange={e => handleInputChange('inspectedQuantity', e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl font-black bg-white focus:ring-4 ring-blue-100 outline-none transition-all shadow-inner" placeholder="0.00" /></div>
                 <div className="space-y-1"><label className="font-black text-green-600 text-[9pt] uppercase tracking-widest ml-1">SL Đ đạt</label><input type="number" step="0.01" value={formData.passedQuantity || ''} onChange={e => handleInputChange('passedQuantity', e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl font-black bg-white focus:ring-4 ring-blue-100 outline-none transition-all shadow-inner" placeholder="0.00" /></div>
                 <div className="space-y-1"><label className="font-black text-red-600 text-[9pt] uppercase tracking-widest ml-1">SL Lỗi</label><input type="number" step="0.01" value={formData.failedQuantity || ''} onChange={e => handleInputChange('failedQuantity', e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl font-black bg-white focus:ring-4 ring-red-100 outline-none transition-all shadow-inner" placeholder="0.00" /></div>
            </div>
        </div>
        <div className="space-y-3">
            <h3 className="font-black text-slate-700 text-xs uppercase tracking-[0.2em] flex items-center gap-2 border-b border-slate-300 pb-2 px-1"><LayoutList className="w-4 h-4 text-blue-600"/> III. NỘI DUNG KIỂM TRA ({visibleItems.length})</h3>
            {!formData.inspectionStage ? (
                <div className="bg-orange-50 border border-orange-100 p-10 rounded-[3rem] text-center space-y-3 animate-pulse shadow-inner"><Info className="w-12 h-12 text-orange-300 mx-auto" /><p className="font-black text-orange-800 uppercase tracking-widest text-sm">Chọn Công đoạn để tải danh mục</p></div>
            ) : (
                <div className="space-y-4">
                    {(visibleItems || []).map((item, originalIndex) => (
                        <div key={item.id} className={`bg-white rounded-[2rem] p-5 border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-300 bg-red-50/10' : 'border-slate-200'}`}>
                            <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-3">
                                <div className="flex-1"><div className="flex gap-2 mb-1.5"><span className="bg-slate-100 text-[8pt] font-black uppercase text-slate-500 px-2.5 py-0.5 rounded-full border border-slate-200">{item.category}</span><span className="bg-blue-600 text-[8pt] font-black uppercase text-white px-2.5 py-0.5 rounded-full shadow-sm">{formData.inspectionStage}</span></div><input value={item.label} onChange={e => handleItemChange(originalIndex, 'label', e.target.value)} className="w-full font-black text-[12pt] bg-transparent outline-none text-slate-800 uppercase tracking-tight" placeholder="Nội dung..." /></div>
                                <button onClick={() => setFormData({...formData, items: formData.items?.filter(it => it.id !== item.id)})} className="p-2 text-slate-300 hover:text-red-500 active:scale-90" type="button"><Trash2 className="w-5 h-5"/></button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1 mb-1"><Microscope className="w-3 h-3"/> Phương pháp (ISO)</label><input value={item.method || ''} readOnly className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 cursor-not-allowed shadow-inner" placeholder="Tự động..."/></div>
                                <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1 mb-1"><Ruler className="w-3 h-3"/> Tiêu chuẩn</label><input value={item.standard || ''} readOnly className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 cursor-not-allowed shadow-inner" placeholder="Tự động..."/></div>
                            </div>
                            <div className="flex flex-wrap gap-3 items-center">
                                <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 border border-slate-200 shadow-inner">
                                    {[CheckStatus.PASS, CheckStatus.FAIL, CheckStatus.CONDITIONAL].map(st => (
                                        <button key={st} onClick={() => handleItemChange(originalIndex, 'status', st)} className={`px-4 py-2 rounded-xl text-[9pt] font-black uppercase tracking-tight transition-all active:scale-95 ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-lg shadow-green-200' : st === CheckStatus.FAIL ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'bg-orange-50 text-white shadow-lg shadow-orange-200') : 'text-slate-400 hover:bg-white'}`} type="button">{st}</button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2 ml-auto">
                                    <button onClick={() => { setActiveUploadId(item.id); cameraInputRef.current?.click(); }} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 shadow-sm transition-all" type="button"><Camera className="w-5 h-5"/></button>
                                    {item.status === CheckStatus.FAIL && <button onClick={() => { setActiveNcrItemIndex(originalIndex); setIsNcrModalOpen(true); }} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[9pt] font-black uppercase tracking-widest flex items-center gap-2 shadow-xl active:scale-95 transition-all" type="button"><AlertOctagon className="w-4 h-4"/> NCR</button>}
                                </div>
                            </div>
                            <textarea value={item.notes || ''} onChange={e => handleItemChange(originalIndex, 'notes', e.target.value)} className="w-full mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:bg-white outline-none transition-all shadow-inner h-20" placeholder="Ghi chú..."/>
                        </div>
                    ))}
                    <button onClick={() => setFormData({...formData, items: [...(formData.items || []), { id: `new_${Date.now()}`, category: 'CHUNG', label: 'BỔ SUNG', status: CheckStatus.PENDING, stage: formData.inspectionStage, method: 'Kiểm tra hiện trường', standard: 'Theo hồ sơ' }]})} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-[2rem] text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white hover:text-blue-500 transition-all shadow-sm" type="button">+ Thêm tiêu chí tùy chỉnh</button>
                </div>
            )}
        </div>
        <section className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm mt-6">
            <h3 className="text-blue-700 border-b border-blue-50 pb-3 mb-6 font-black text-xs uppercase tracking-widest flex items-center gap-2"><PenTool className="w-4 h-4"/> IV. CHỮ KÝ ĐIỆY TỬ (ISO LOG)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <SignaturePad label="Đại diện Xưởng / Hiện trường" value={formData.productionSignature} onChange={sig => setFormData({...formData, productionSignature: sig})} />
                <SignaturePad label={`QC/QA thực hiện (${user.name})`} value={formData.signature} onChange={sig => setFormData({...formData, signature: sig})} />
            </div>
        </section>
      </div>
      <div className="p-4 md:p-6 border-t border-slate-200 bg-white flex flex-col sm:flex-row justify-end gap-3 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] z-20">
        <button onClick={onCancel} className="px-8 py-3.5 text-slate-500 font-black uppercase text-xs tracking-widest hover:bg-slate-50 rounded-xl transition-all" type="button">Thoát & Hủy</button>
        <button onClick={handleSubmit} disabled={isSaving} className="px-16 py-4 bg-blue-700 text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl shadow-2xl shadow-blue-200 hover:bg-blue-800 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50" type="button">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
            <span>HOÀN TẤT & GỬI PHÊ DUYỆT</span>
        </button>
      </div>
      <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
      {activeNcrItemIndex !== null && formData.items && formData.items[activeNcrItemIndex] && <NCRModal isOpen={isNcrModalOpen} onClose={() => setIsNcrModalOpen(false)} onSave={ncr => { setFormData(prev => { const newItems = [...(prev.items || [])]; newItems[activeNcrItemIndex] = { ...newItems[activeNcrItemIndex], status: CheckStatus.FAIL, ncr: { ...ncr, id: newItems[activeNcrItemIndex].ncr?.id || `NCR-${Date.now()}`, inspection_id: formData.id, itemId: newItems[activeNcrItemIndex].id, createdDate: new Date().toISOString() } }; return { ...prev, items: newItems }; }); setIsNcrModalOpen(false); }} initialData={formData.items[activeNcrItemIndex].ncr} itemName={formData.items[activeNcrItemIndex].label} inspectionStage={formData.inspectionStage} />}
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { setSearchCode(data); handleInputChange('ma_nha_may', data); lookupPlanInfo(data); setShowScanner(false); }} />}
    </div>
  );
};
