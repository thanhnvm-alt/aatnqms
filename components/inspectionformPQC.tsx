
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, PlanItem, User, Workshop, NCR, DefectLibraryItem } from '../types';
import { 
  Save, X, Camera, Image as ImageIcon, ChevronDown, 
  MapPin, Box, AlertTriangle, 
  Trash2, Info, LayoutList,
  AlertOctagon, FileText, QrCode,
  Ruler, Microscope, PenTool, Eraser, BookOpen, Search,
  Loader2, Sparkles, CheckCircle2, ArrowLeft, History, Clock,
  Calendar, UserCheck
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
  inspections: Inspection[];
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
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
        ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000000';
        setIsDrawing(true); setIsEmpty(false);
    };

    const draw = (e: any) => {
        if (!isDrawing || readOnly) return;
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        ctx.lineTo(clientX - rect.left, clientY - rect.top); ctx.stroke();
    };

    const stopDrawing = () => { if (readOnly) return; setIsDrawing(false); if (canvasRef.current) onChange(canvasRef.current.toDataURL()); };
    const clearSignature = () => { if (readOnly) return; const canvas = canvasRef.current; if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height); onChange(''); setIsEmpty(true); } };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center px-1">
                <label className="text-slate-700 font-bold uppercase text-[10px] tracking-widest">{label}</label>
                {!readOnly && <button onClick={clearSignature} className="text-[10px] font-bold text-red-600 uppercase flex items-center gap-1 hover:underline" type="button"><Eraser className="w-3 h-3" /> Xóa</button>}
            </div>
            <div className="border border-slate-300 rounded-[1.5rem] bg-white overflow-hidden relative h-32 shadow-inner">
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
    const [defectName, setDefectName] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const [uploadTarget, setUploadTarget] = useState<'BEFORE' | 'AFTER'>('BEFORE');

    useEffect(() => {
        if (isOpen) {
            setNcrData(initialData || { severity: 'MINOR', issueDescription: '', rootCause: '', solution: '', responsiblePerson: '', imagesBefore: [], imagesAfter: [], status: 'OPEN' });
            fetchDefectLibrary().then(setLibrary);
            if (initialData?.defect_code) {
                fetchDefectLibrary().then(libs => {
                    const match = libs.find(l => l.code === initialData.defect_code);
                    if (match) setDefectName(match.name);
                });
            } else { setDefectName(''); }
        }
    }, [isOpen, initialData]);

    const filteredLib = useMemo(() => {
        const search = (libSearch || '').toLowerCase();
        return library.filter(item => {
            const name = (item.name || '').toLowerCase();
            const desc = (item.description || '').toLowerCase();
            const code = (item.code || '').toLowerCase();
            const matchSearch = !search || name.includes(search) || desc.includes(search) || code.includes(search);
            const matchStage = !inspectionStage || item.stage === inspectionStage;
            return matchSearch && matchStage;
        });
    }, [library, libSearch, inspectionStage]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        Array.from(files).forEach((file: File) => {
            const reader = new FileReader();
            reader.onloadend = async () => {
                if (typeof reader.result === 'string') {
                    const resized = await resizeImage(reader.result);
                    setNcrData(prev => {
                        const field = uploadTarget === 'BEFORE' ? 'imagesBefore' : 'imagesAfter';
                        return { ...prev, [field]: [...(prev[field] || []), resized] };
                    });
                }
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const handleAiAnalysis = async () => {
        if (!ncrData.issueDescription) return;
        setIsAiLoading(true);
        try {
            const result = await generateNCRSuggestions(ncrData.issueDescription, itemName);
            setNcrData(prev => ({ ...prev, rootCause: result.rootCause, solution: result.solution }));
        } catch (e) { alert("Lỗi phân tích AI."); } finally { setIsAiLoading(false); }
    };

    if (!isOpen) return null;
    const modalStyle = { fontFamily: '"Times New Roman", Times, serif', fontSize: '12px' };

    return (
        <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 md:p-4" style={modalStyle}>
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[98vh]">
                <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center shrink-0">
                    <h3 className="text-red-600 flex items-center gap-2 font-bold uppercase tracking-tight">
                        <AlertOctagon className="w-5 h-5" /> Báo cáo sự không phù hợp (NCR)
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-red-100 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400"/></button>
                </div>
                <div className="p-4 md:p-6 space-y-4 overflow-y-auto flex-1 no-scrollbar bg-slate-50/30">
                    <div className="border border-blue-200 rounded-xl overflow-hidden bg-white shadow-sm">
                        <button onClick={() => setShowLibrary(!showLibrary)} className="w-full p-3 flex justify-between items-center text-blue-700 font-bold bg-blue-50/50" type="button">
                            <span className="flex items-center gap-2"><BookOpen className="w-4 h-4"/> Chọn lỗi từ thư viện chuẩn</span>
                            <ChevronDown className={`w-4 h-4 transition-transform ${showLibrary ? 'rotate-180' : ''}`} />
                        </button>
                        {showLibrary && (
                            <div className="p-3 space-y-3 bg-white border-t border-blue-100 animate-in slide-in-from-top duration-200">
                                <div className="relative">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input value={libSearch} onChange={e => setLibSearch(e.target.value)} className="w-full pl-7 pr-2 py-2 border rounded-lg outline-none text-xs focus:ring-2 ring-blue-100" placeholder="Tìm lỗi..." />
                                </div>
                                <div className="max-h-40 overflow-y-auto space-y-1 no-scrollbar">
                                    {filteredLib.map(item => (
                                        <div key={item.id} onClick={() => { setNcrData({...ncrData, issueDescription: item.description, severity: item.severity as any, defect_code: item.code, solution: item.suggestedAction || ncrData.solution }); setDefectName(item.name); setShowLibrary(false); }} className="p-2 border rounded-lg hover:bg-blue-50 cursor-pointer flex justify-between items-center group">
                                            <div className="flex-1 min-w-0"><p className="text-xs font-bold truncate">{item.name}</p><p className="text-[9px] text-slate-500 line-clamp-1">{item.description}</p></div>
                                            <ChevronDown className="w-3 h-3 text-slate-300 -rotate-90 group-hover:text-blue-500" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Hạng mục kiểm tra</label><input readOnly value={itemName} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-slate-500 italic text-sm" /></div>
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Tên lỗi chuẩn</label><input readOnly value={defectName || 'Chưa chọn'} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-blue-700 font-bold text-sm" /></div>
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Mô tả lỗi chi tiết *</label><button onClick={handleAiAnalysis} disabled={isAiLoading || !ncrData.issueDescription} className="text-[9px] font-black text-purple-600 uppercase flex items-center gap-1 hover:underline disabled:opacity-30">{isAiLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3"/>} AI Phân tích</button></div>
                        <textarea className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-red-100 bg-white text-sm" rows={2} value={ncrData.issueDescription || ''} onChange={e => setNcrData({...ncrData, issueDescription: e.target.value})} placeholder="Mô tả cụ thể hiện trạng lỗi tại hiện trường..." />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mức độ</label><select className="w-full p-2 border border-slate-200 rounded-lg bg-white text-sm font-bold" value={ncrData.severity} onChange={e => setNcrData({...ncrData, severity: e.target.value as any})}><option value="MINOR">MINOR</option><option value="MAJOR">MAJOR</option><option value="CRITICAL">CRITICAL</option></select></div>
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Người phụ trách</label><input className="w-full p-2 border border-slate-200 rounded-lg bg-white text-sm" value={ncrData.responsiblePerson || ''} onChange={e => setNcrData({...ncrData, responsiblePerson: e.target.value})} placeholder="Tên / Bộ phận..." /></div>
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hạn xử lý</label><input type="date" className="w-full p-2 border border-slate-200 rounded-lg bg-white text-sm font-mono" value={ncrData.deadline || ''} onChange={e => setNcrData({...ncrData, deadline: e.target.value})} /></div>
                    </div>
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nguyên nhân gốc rễ (Root Cause)</label><textarea className="w-full p-3 border border-slate-200 rounded-xl bg-white text-sm font-medium italic text-slate-600" rows={1} value={ncrData.rootCause || ''} onChange={e => setNcrData({...ncrData, rootCause: e.target.value})} placeholder="Phân tích tại sao lỗi xảy ra..." /></div>
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Biện pháp khắc phục</label><textarea className="w-full p-3 border border-slate-200 rounded-xl bg-white text-sm font-medium text-blue-900" rows={1} value={ncrData.solution || ''} onChange={e => setNcrData({...ncrData, solution: e.target.value})} placeholder="Hướng xử lý và ngăn chặn lặp lại..." /></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div className="space-y-2 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="flex justify-between items-center border-b border-slate-50 pb-2 mb-2">
                                <label className="text-[10px] font-black text-red-500 uppercase flex items-center gap-1.5"><AlertTriangle className="w-4 h-4"/> Ảnh TRƯỚC xử lý</label>
                                <div className="flex gap-1">
                                    <button onClick={() => { setUploadTarget('BEFORE'); cameraInputRef.current?.click(); }} className="p-1.5 bg-red-50 text-red-600 rounded-lg border border-red-100 hover:bg-red-100 active:scale-90 transition-all" type="button"><Camera className="w-4 h-4"/></button>
                                    <button onClick={() => { setUploadTarget('BEFORE'); fileInputRef.current?.click(); }} className="p-1.5 bg-slate-50 text-slate-400 rounded-lg border border-slate-200 hover:bg-slate-100 active:scale-90 transition-all" type="button"><ImageIcon className="w-4 h-4"/></button>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                {ncrData.imagesBefore?.map((img, i) => (
                                    <div key={i} className="relative aspect-square border rounded-lg overflow-hidden group"><img src={img} className="w-full h-full object-cover" /><button onClick={() => setNcrData({...ncrData, imagesBefore: ncrData.imagesBefore?.filter((_, idx) => idx !== i)})} className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button></div>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="flex justify-between items-center border-b border-slate-50 pb-2 mb-2">
                                <label className="text-[10px] font-black text-green-600 uppercase flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4"/> Ảnh SAU xử lý</label>
                                <div className="flex gap-1">
                                    <button onClick={() => { setUploadTarget('AFTER'); cameraInputRef.current?.click(); }} className="p-1.5 bg-green-50 text-green-600 rounded-lg border border-green-100 hover:bg-green-100 active:scale-90 transition-all" type="button"><Camera className="w-4 h-4"/></button>
                                    <button onClick={() => { setUploadTarget('AFTER'); fileInputRef.current?.click(); }} className="p-1.5 bg-slate-50 text-slate-400 rounded-lg border border-slate-200 hover:bg-slate-100 active:scale-90 transition-all" type="button"><ImageIcon className="w-4 h-4"/></button>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                {ncrData.imagesAfter?.map((img, i) => (
                                    <div key={i} className="relative aspect-square border rounded-lg overflow-hidden group"><img src={img} className="w-full h-full object-cover" /><button onClick={() => setNcrData({...ncrData, imagesAfter: ncrData.imagesAfter?.filter((_, idx) => idx !== i)})} className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button></div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
                <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleImageUpload} />
                <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                    <button onClick={onClose} className="px-6 py-3 text-slate-600 font-bold hover:text-slate-900 uppercase text-xs tracking-widest">Hủy bỏ</button>
                    <button onClick={() => onSave(ncrData as NCR)} disabled={!ncrData.issueDescription} className="px-10 py-3 bg-red-600 text-white rounded-xl shadow-xl shadow-red-200 hover:bg-red-700 active:scale-95 transition-all font-black uppercase text-xs tracking-widest disabled:opacity-50">Lưu hồ sơ NCR</button>
                </div>
            </div>
        </div>
    );
};

export const InspectionFormPQC: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, plans, workshops, inspections, user }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({ id: `INS-${Date.now()}`, date: new Date().toISOString().split('T')[0], status: InspectionStatus.DRAFT, items: [], images: [], score: 0, signature: '', productionSignature: '', inspectedQuantity: 0, passedQuantity: 0, failedQuantity: 0, ...initialData });
  const [searchCode, setSearchCode] = useState(initialData?.ma_nha_may || ''); 
  const [activeNcrItemIndex, setActiveNcrItemIndex] = useState<number | null>(null);
  const [isNcrModalOpen, setIsNcrModalOpen] = useState(false);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

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
  
  const historicalRecords = useMemo(() => {
    if (!inspections || !searchCode) return [];
    const term = searchCode.toLowerCase().trim();
    const proj = (formData.ma_ct || '').toLowerCase().trim();
    
    return inspections.filter(i => 
        i.id !== formData.id && (
            (i.ma_nha_may && i.ma_nha_may.toLowerCase() === term) ||
            (i.headcode && i.headcode.toLowerCase() === term) ||
            (i.ma_ct && i.ma_ct.toLowerCase() === proj && term === '')
        )
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inspections, searchCode, formData.ma_ct, formData.id]);

  const lookupPlanInfo = async (value: string) => {
      if (!value) return; setIsLookupLoading(true);
      try {
          const searchTerm = value.toLowerCase().trim();
          const apiRes = await fetchPlans(value, 1, 5);
          const match = (apiRes.items || []).find(p => (p.headcode || '').toLowerCase().trim() === searchTerm || (p.ma_nha_may || '').toLowerCase().trim() === searchTerm);
          if (match) {
              setFormData(prev => ({ ...prev, ma_ct: match.ma_ct, ten_ct: match.ten_ct, ten_hang_muc: match.ten_hang_muc, dvt: match.dvt, so_luong_ipo: match.so_luong_ipo, ma_nha_may: match.ma_nha_may, workshop: match.ma_nha_may }));
              setSearchCode(match.ma_nha_may || value);
          }
      } catch (e) { console.error(e); } finally { setIsLookupLoading(false); }
  };

  const handleInputChange = (field: keyof Inspection, value: any) => { 
      setFormData(prev => {
          const next = { ...prev, [field]: value };
          if (field === 'inspectedQuantity' || field === 'passedQuantity' || field === 'failedQuantity') {
              const ins = parseFloat(String(next.inspectedQuantity || 0));
              const pas = parseFloat(String(next.passedQuantity || 0));
              const fai = parseFloat(String(next.failedQuantity || 0));
              if (field === 'inspectedQuantity') next.passedQuantity = Math.max(0, parseFloat(String(value)) - fai);
              else if (field === 'passedQuantity') next.failedQuantity = Math.max(0, ins - parseFloat(String(value)));
              else if (field === 'failedQuantity') next.passedQuantity = Math.max(0, ins - parseFloat(String(value)));
          }
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
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative no-scroll-x" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12px' }}>
      <div className="flex-1 overflow-y-auto p-3 space-y-4 no-scrollbar bg-slate-50 pb-28">
        
        {/* I. THÔNG TIN SẢN PHẨM */}
        <section className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-blue-50 pb-2 mb-1">
                <h3 className="text-blue-700 font-black text-[10px] uppercase tracking-widest flex items-center gap-2"><Box className="w-4 h-4"/> I. THÔNG TIN SẢN PHẨM</h3>
                <button 
                  onClick={() => setShowHistory(true)}
                  className="px-3 py-1 bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-sm"
                  type="button"
                >
                    <History className="w-3 h-3" />
                    Lịch sử ({historicalRecords.length})
                </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                    <label className="block text-[8pt] font-black text-slate-400 uppercase tracking-tighter">Mã định danh (Headcode)</label>
                    <div className="relative flex items-center">
                        <input value={searchCode} onChange={e => { setSearchCode(e.target.value); if(e.target.value.length >= 3) lookupPlanInfo(e.target.value); }} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-2 ring-blue-100 outline-none font-bold text-[10pt]" placeholder="Quét/Nhập mã..."/>
                        <button onClick={() => setShowScanner(true)} className="absolute right-1 p-1 text-slate-400" type="button"><QrCode className="w-4 h-4"/></button>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="block text-[8pt] font-black text-slate-400 uppercase tracking-tighter">Mã dự án / PO</label>
                    <input value={formData.ma_ct || ''} readOnly className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 font-bold text-[10pt] shadow-inner"/>
                </div>
                <div className="space-y-1">
                    <label className="block text-[8pt] font-black text-slate-400 uppercase tracking-tighter">Tên công trình</label>
                    <input value={formData.ten_ct || ''} readOnly className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 font-bold text-[10pt] shadow-inner"/>
                </div>
                <div className="space-y-1">
                    <label className="block text-[8pt] font-black text-slate-400 uppercase tracking-tighter">Tên hạng mục</label>
                    <input value={formData.ten_hang_muc || ''} readOnly className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 font-bold text-[10pt] shadow-inner"/>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                    <label className="block text-[8pt] font-black text-slate-400 uppercase tracking-tighter">Số lượng IPO</label>
                    <input value={formData.so_luong_ipo || 0} readOnly className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 font-bold text-[10pt] shadow-inner"/>
                </div>
                <div className="space-y-1">
                    <label className="block text-[8pt] font-black text-slate-400 uppercase tracking-tighter">ĐVT</label>
                    <input value={formData.dvt || 'PCS'} readOnly className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 font-bold text-[10pt] shadow-inner uppercase"/>
                </div>
                <div className="space-y-1">
                    <label className="block text-[8pt] font-black text-slate-400 uppercase tracking-tighter">Ngày kiểm</label>
                    <input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-bold text-[10pt] shadow-inner"/>
                </div>
                <div className="space-y-1">
                    <label className="block text-[8pt] font-black text-slate-400 uppercase tracking-tighter">QC/QA</label>
                    <input value={formData.inspectorName || user.name} readOnly className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 font-bold text-[10pt] shadow-inner uppercase"/>
                </div>
            </div>
        </section>

        {/* II. HÌNH ẢNH HIỆN TRƯỜNG */}
        <section className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-blue-700 font-black text-[10px] uppercase tracking-widest flex items-center gap-2 border-b border-blue-50 pb-2"><ImageIcon className="w-4 h-4"/> II. HÌNH ẢNH HIỆN TRƯỜNG</h3>
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                <button onClick={() => { setActiveUploadId('MAIN'); cameraInputRef.current?.click(); }} className="w-20 h-20 bg-blue-50 border border-blue-200 rounded-xl flex flex-col items-center justify-center text-blue-600 shrink-0 shadow-sm" type="button"><Camera className="w-6 h-6 mb-1"/><span className="text-[7pt] font-black uppercase">Camera</span></button>
                <button onClick={() => { setActiveUploadId('MAIN'); fileInputRef.current?.click(); }} className="w-20 h-20 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 shrink-0 shadow-sm" type="button"><ImageIcon className="w-6 h-6 mb-1"/><span className="text-[7pt] font-black uppercase">Thiết bị</span></button>
                {formData.images?.map((img, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                        <img src={img} className="w-full h-full object-cover" />
                        <button onClick={() => setFormData({...formData, images: formData.images?.filter((_, i) => i !== idx)})} className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button>
                    </div>
                ))}
            </div>
        </section>

        {/* III. ĐỊA ĐIỂM & SỐ LƯỢNG */}
        <section className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-blue-700 border-b border-blue-50 pb-2 mb-1 font-black text-[10px] uppercase tracking-widest flex items-center gap-2"><MapPin className="w-4 h-4"/> III. ĐỊA ĐIỂM & SỐ LƯỢNG</h3>
            
            <div className="grid grid-cols-2 gap-3">
                 <div className="space-y-1">
                    <label className="block text-[8pt] font-black text-slate-400 uppercase tracking-tighter">Xưởng sản xuất</label>
                    <select value={formData.workshop || ''} onChange={e => handleInputChange('workshop', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-[10pt] font-bold shadow-sm outline-none">
                        <option value="">-- Chọn xưởng --</option>
                        {workshops.map(ws => <option key={ws.code} value={ws.code}>{ws.name}</option>)}
                    </select>
                 </div>
                 <div className="space-y-1">
                    <label className="block text-[8pt] font-black text-slate-400 uppercase tracking-tighter">Công đoạn kiểm tra *</label>
                    <select value={formData.inspectionStage || ''} onChange={e => handleInputChange('inspectionStage', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-[10pt] font-bold shadow-sm outline-none">
                        <option value="">-- Chọn giai đoạn --</option>
                        {availableStages.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                 </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                 <div className="space-y-1">
                    <label className="font-black text-slate-500 text-[8pt] uppercase tracking-tighter">SL Thực tế</label>
                    <input type="number" step="0.01" value={formData.inspectedQuantity || ''} onChange={e => handleInputChange('inspectedQuantity', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-black bg-white focus:ring-2 ring-blue-100 outline-none text-[10pt]" placeholder="0.00" />
                 </div>
                 <div className="space-y-1">
                    <label className="font-black text-green-600 text-[8pt] uppercase tracking-tighter">SL Đạt</label>
                    <input type="number" step="0.01" value={formData.passedQuantity || ''} onChange={e => handleInputChange('passedQuantity', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-black bg-white focus:ring-2 ring-green-100 outline-none text-[10pt]" placeholder="0.00" />
                 </div>
                 <div className="space-y-1">
                    <label className="font-black text-red-600 text-[8pt] uppercase tracking-tighter">SL Lỗi</label>
                    <input type="number" step="0.01" value={formData.failedQuantity || ''} onChange={e => handleInputChange('failedQuantity', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-black bg-white focus:ring-2 ring-red-100 outline-none text-[10pt]" placeholder="0.00" />
                 </div>
            </div>
        </section>

        {/* IV. NỘI DUNG KIỂM TRA */}
        <div className="space-y-3">
            <h3 className="font-black text-slate-700 text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 border-b border-slate-300 pb-2 px-1"><LayoutList className="w-4 h-4 text-blue-600"/> IV. NỘI DUNG KIỂM TRA ({visibleItems.length})</h3>
            {!formData.inspectionStage ? (
                <div className="bg-orange-50 border border-orange-100 p-8 rounded-3xl text-center space-y-2 animate-pulse"><Info className="w-8 h-8 text-orange-300 mx-auto" /><p className="font-black text-orange-800 uppercase tracking-widest text-[10px]">Vui lòng chọn Công đoạn tại Mục III</p></div>
            ) : (
                <div className="space-y-4">
                    {formData.items?.map((item, originalIndex) => (
                        (!item.stage || item.stage === formData.inspectionStage) && (
                            <div key={item.id} className={`bg-white rounded-[1.5rem] p-4 border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-300 bg-red-50/10' : 'border-slate-200'}`}>
                                <div className="flex justify-between items-start mb-3 border-b border-slate-50 pb-2">
                                    <div className="flex-1">
                                        <div className="flex gap-1 mb-1"><span className="bg-slate-100 text-[7pt] font-black uppercase text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">{item.category}</span></div>
                                        <input value={item.label} onChange={e => handleItemChange(originalIndex, 'label', e.target.value)} className="w-full font-black text-[11pt] bg-transparent outline-none text-slate-800 uppercase tracking-tight mt-1" placeholder="Nội dung..." />
                                    </div>
                                    <button onClick={() => setFormData({...formData, items: formData.items?.filter(it => it.id !== item.id)})} className="p-1.5 text-slate-300" type="button"><Trash2 className="w-4 h-4"/></button>
                                </div>
                                <div className="flex flex-wrap gap-2 items-center">
                                    <div className="flex bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200 shadow-inner w-fit">
                                        {[CheckStatus.PASS, CheckStatus.FAIL].map(st => (
                                            <button key={st} onClick={() => handleItemChange(originalIndex, 'status', st)} className={`px-4 py-2 rounded-xl text-[9pt] font-black uppercase tracking-tight transition-all ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-lg' : 'bg-red-600 text-white shadow-lg') : 'text-slate-400'}`} type="button">{st}</button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-1.5 ml-auto">
                                        <div className="relative p-2 bg-white border border-slate-200 rounded-xl text-slate-400 active:text-blue-600 transition-all shadow-sm active:scale-90">
                                            <Camera className="w-4.5 h-4.5"/>
                                            <input type="file" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={e => handleFileUpload(e)} />
                                        </div>
                                        {item.status === CheckStatus.FAIL && <button onClick={() => { setActiveNcrItemIndex(originalIndex); setIsNcrModalOpen(true); }} className="px-3 py-2 bg-slate-900 text-white rounded-xl text-[7pt] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-xl active:scale-95 transition-all" type="button"><AlertOctagon className="w-3.5 h-3.5"/> NCR</button>}
                                    </div>
                                </div>
                                <textarea value={item.notes || ''} onChange={e => handleItemChange(originalIndex, 'notes', e.target.value)} className="w-full mt-3 p-3 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-medium focus:bg-white outline-none h-16 shadow-inner" placeholder="Ghi chú kỹ thuật..."/>
                            </div>
                        )
                    ))}
                    <button onClick={() => setFormData({...formData, items: [...(formData.items || []), { id: `new_${Date.now()}`, category: 'BỔ SUNG', label: 'TIÊU CHÍ MỚI', status: CheckStatus.PENDING, stage: formData.inspectionStage }]})} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] hover:bg-white hover:text-blue-500 transition-all" type="button">+ THÊM TIÊU CHÍ TÙY CHỈNH</button>
                </div>
            )}
        </div>

        {/* V. CHỮ KÝ XÁC NHẬN */}
        <section className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm mt-4">
            <h3 className="text-blue-700 border-b border-blue-50 pb-3 mb-4 font-black text-[10px] uppercase tracking-widest flex items-center gap-2"><PenTool className="w-4 h-4"/> V. CHỮ KÝ XÁC NHẬN</h3>
            <SignaturePad label={`Chữ ký QA/QC (${user.name})`} value={formData.signature} onChange={sig => setFormData({...formData, signature: sig})} />
        </section>
      </div>

      {/* FOOTER */}
      <div className="p-3 border-t border-slate-200 bg-white sticky bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-4 shadow-[0_-10px_25px_rgba(0,0,0,0.05)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <button onClick={onCancel} className="px-4 py-2 text-slate-500 font-black uppercase text-[9pt] tracking-widest active:bg-slate-50 rounded-xl transition-all border border-slate-100" type="button">
            Quay lại
        </button>
        <button onClick={handleSubmit} disabled={isSaving} className="px-5 py-2 bg-blue-600 text-white font-black uppercase text-[9pt] tracking-widest rounded-xl shadow-lg shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50" type="button">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            <span>Hoàn tất PQC</span>
        </button>
      </div>

      {/* HISTORY SLIDE OVER */}
      {showHistory && (
          <div className="fixed inset-0 z-[170] flex justify-end">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
              <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg">
                              <History className="w-5 h-5" />
                          </div>
                          <div>
                              <h3 className="font-black text-slate-800 text-sm uppercase tracking-tight">Lịch sử kiểm tra</h3>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{searchCode || formData.ma_ct}</p>
                          </div>
                      </div>
                      <button onClick={() => setShowHistory(false)} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-full transition-all">
                          <X className="w-6 h-6" />
                      </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                      {historicalRecords.length > 0 ? (
                          historicalRecords.map((record) => (
                              <div key={record.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-blue-300 transition-all group">
                                  <div className="flex justify-between items-start mb-2">
                                      <div className="flex items-center gap-2">
                                          <Calendar className="w-3 h-3 text-blue-500" />
                                          <span className="text-[10px] font-black text-slate-900">{record.date}</span>
                                      </div>
                                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border uppercase tracking-widest ${
                                          record.status === InspectionStatus.APPROVED ? 'bg-green-50 text-green-700 border-green-200' :
                                          'bg-orange-50 text-orange-700 border-orange-200'
                                      }`}>
                                          {record.status}
                                      </span>
                                  </div>
                                  <h4 className="text-[11px] font-bold text-slate-700 uppercase line-clamp-1 mb-2">{record.ten_hang_muc}</h4>
                                  <div className="flex items-center justify-between border-t border-slate-50 pt-2">
                                      <div className="flex items-center gap-1.5">
                                          <UserCheck className="w-3 h-3 text-slate-400" />
                                          <span className="text-[10px] font-bold text-slate-500">{record.inspectorName}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                          <span className="text-[9px] font-black text-slate-400 uppercase">Score:</span>
                                          <span className={`text-[11px] font-black ${record.score >= 90 ? 'text-green-600' : 'text-red-600'}`}>
                                              {record.score}
                                          </span>
                                      </div>
                                  </div>
                                  <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar">
                                      {record.images?.slice(0, 3).map((img, i) => (
                                          <div key={i} className="w-10 h-10 rounded-lg border border-slate-100 overflow-hidden shrink-0">
                                              <img src={img} className="w-full h-full object-cover" />
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          ))
                      ) : (
                          <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                              <History className="w-12 h-12 opacity-10 mb-4" />
                              <p className="text-[10px] font-black uppercase tracking-widest">Không có bản ghi cũ</p>
                          </div>
                      )}
                  </div>
                  
                  <div className="p-4 border-t border-slate-100 bg-slate-50 text-center">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Hiển thị {historicalRecords.length} bản ghi gần nhất</p>
                  </div>
              </div>
          </div>
      )}

      <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
      
      {activeNcrItemIndex !== null && formData.items && formData.items[activeNcrItemIndex] && (
          <NCRModal isOpen={isNcrModalOpen} onClose={() => setIsNcrModalOpen(false)} onSave={ncr => { setFormData(prev => { const newItems = [...(prev.items || [])]; newItems[activeNcrItemIndex] = { ...newItems[activeNcrItemIndex], status: CheckStatus.FAIL, ncr: { ...ncr, id: newItems[activeNcrItemIndex].ncr?.id || `NCR-${Date.now()}`, inspection_id: formData.id, itemId: newItems[activeNcrItemIndex].id, createdDate: new Date().toISOString() } }; return { ...prev, items: newItems }; }); setIsNcrModalOpen(false); }} initialData={formData.items[activeNcrItemIndex].ncr} itemName={formData.items[activeNcrItemIndex].label} inspectionStage={formData.inspectionStage} />
      )}
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { setSearchCode(data); handleInputChange('ma_nha_may', data); lookupPlanInfo(data); setShowScanner(false); }} />}
    </div>
  );
};
