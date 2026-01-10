import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, PlanItem, User, Workshop, NCR, DefectLibraryItem } from '../types';
import { Button } from './Button';
import { 
  Save, X, Camera, Image as ImageIcon, ChevronDown, 
  MapPin, Briefcase, Box, AlertTriangle, 
  CheckCircle2, Trash2, Plus, Info, LayoutList,
  AlertOctagon, FileText, Tag, Hash, Pencil, Calendar, Loader2, QrCode,
  Ruler, Microscope, CheckSquare, PenTool, Eraser, BookOpen, Search,
  Target, CheckCircle, XCircle, Calculator, TrendingUp, User as UserIcon,
  Sparkles, BrainCircuit
} from 'lucide-react';
import { generateItemSuggestion, generateNCRSuggestions } from '../services/geminiService';
import { fetchPlans, fetchDefectLibrary, saveNcrMapped } from '../services/apiService';
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

/**
 * ISO-Compliant Image Compressor
 * Đảm bảo file < 100KB để tối ưu truyền tải mobile và lưu trữ Turso.
 */
const resizeImage = (base64Str: string, maxWidth = 1280): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64Str); return; }
      
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Vòng lặp nén thông minh: Giảm chất lượng cho đến khi < 100KB
      let quality = 0.7;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      
      // 100KB ~ 133,333 characters in Base64
      while (dataUrl.length > 133333 && quality > 0.1) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      
      resolve(dataUrl);
    };
    img.onerror = () => resolve(base64Str);
  });
};

// Sub-component: Signature Pad
const SignaturePad = ({ 
    label, 
    value, 
    onChange, 
    readOnly = false 
}: { 
    label: string; 
    value?: string; 
    onChange: (base64: string) => void;
    readOnly?: boolean;
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isEmpty, setIsEmpty] = useState(!value);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas && value) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = value;
            setIsEmpty(false);
        }
    }, [value]);

    const startDrawing = (e: any) => {
        if (readOnly) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (e.type === 'touchstart') document.body.style.overflow = 'hidden';
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

    const stopDrawing = () => {
        if (readOnly) return;
        setIsDrawing(false);
        document.body.style.overflow = 'auto';
        if (canvasRef.current) onChange(canvasRef.current.toDataURL());
    };

    const clearSignature = () => {
        if (readOnly) return;
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            onChange('');
            setIsEmpty(true);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
                <label className="block text-slate-700 font-bold" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '11pt' }}>{label}</label>
                {!readOnly && (
                    <button onClick={clearSignature} className="text-xs text-red-600 hover:underline flex items-center gap-1" type="button">
                        <Eraser className="w-3 h-3" /> Xóa ký lại
                    </button>
                )}
            </div>
            <div className="border border-slate-300 rounded bg-white overflow-hidden relative" style={{ height: '150px' }}>
                <canvas ref={canvasRef} width={400} height={150} className="w-full h-full touch-none cursor-crosshair" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                {isEmpty && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-sm select-none">Ký tên tại đây</div>}
            </div>
        </div>
    );
};

// Sub-component: NCR Modal
const NCRModal = ({ 
    isOpen, 
    onClose, 
    onSave, 
    initialData, 
    itemName,
    inspectionStage
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    onSave: (ncr: NCR) => void; 
    initialData?: NCR;
    itemName: string;
    inspectionStage?: string;
}) => {
    const [ncrData, setNcrData] = useState<Partial<NCR>>({
        severity: 'MINOR', issueDescription: '', rootCause: '', solution: '',
        responsiblePerson: '', imagesBefore: [], imagesAfter: [], status: 'OPEN'
    });
    
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
            setNcrData(initialData || {
                severity: 'MINOR', issueDescription: '', rootCause: '', solution: '',
                responsiblePerson: '', imagesBefore: [], imagesAfter: [], status: 'OPEN'
            });
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
            
            const matchSearch = !search || 
                               name.includes(search) || 
                               desc.includes(search) ||
                               code.includes(search);
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
    const modalStyle = { fontFamily: '"Times New Roman", Times, serif', fontSize: '11pt' };

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
                                            <div className="flex-1 min-w-0"><p className="text-xs font-bold truncate">{item.name}</p><p className="text-[9pt] text-slate-500 line-clamp-1">{item.description}</p></div>
                                            <ChevronDown className="w-3 h-3 text-slate-300 -rotate-90 group-hover:text-blue-500" />
                                        </div>
                                    ))}
                                    {filteredLib.length === 0 && <div className="p-4 text-center text-slate-400 text-xs italic">Không tìm thấy lỗi phù hợp</div>}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hạng mục kiểm tra</label><input readOnly value={itemName} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-slate-500 italic text-sm" /></div>
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên lỗi chuẩn</label><input readOnly value={defectName || 'Chưa chọn'} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-blue-700 font-bold text-sm" /></div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex justify-between items-center"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mô tả lỗi chi tiết *</label><button onClick={handleAiAnalysis} disabled={isAiLoading || !ncrData.issueDescription} className="text-[9px] font-black text-purple-600 uppercase flex items-center gap-1 hover:underline disabled:opacity-30">{isAiLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3"/>} AI Phân tích</button></div>
                        <textarea className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-red-100 bg-white text-sm" rows={2} value={ncrData.issueDescription} onChange={e => setNcrData({...ncrData, issueDescription: e.target.value})} placeholder="Mô tả cụ thể hiện trạng lỗi tại hiện trường..." />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mức độ</label><select className="w-full p-2 border border-slate-200 rounded-lg bg-white text-sm font-bold" value={ncrData.severity} onChange={e => setNcrData({...ncrData, severity: e.target.value as any})}><option value="MINOR">MINOR</option><option value="MAJOR">MAJOR</option><option value="CRITICAL">CRITICAL</option></select></div>
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Người phụ trách</label><input className="w-full p-2 border border-slate-200 rounded-lg bg-white text-sm" value={ncrData.responsiblePerson || ''} onChange={e => setNcrData({...ncrData, responsiblePerson: e.target.value})} placeholder="Tên / Bộ phận..." /></div>
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hạn xử lý</label><input type="date" className="w-full p-2 border border-slate-200 rounded-lg bg-white text-sm font-mono" value={ncrData.deadline || ''} onChange={e => setNcrData({...ncrData, deadline: e.target.value})} /></div>
                    </div>

                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nguyên nhân gốc rễ (Root Cause)</label><textarea className="w-full p-3 border border-slate-200 rounded-xl bg-white text-sm font-medium italic text-slate-600" rows={1} value={ncrData.rootCause || ''} onChange={e => setNcrData({...ncrData, rootCause: e.target.value})} placeholder="Phân tích tại sao lỗi xảy ra..." /></div>
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Biện pháp khắc phục</label><textarea className="w-full p-3 border border-slate-200 rounded-xl bg-white text-sm font-medium text-blue-900" rows={1} value={ncrData.solution} onChange={e => setNcrData({...ncrData, solution: e.target.value})} placeholder="Hướng xử lý và ngăn chặn lặp lại..." /></div>

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
                                    <div key={i} className="relative aspect-square border rounded-lg overflow-hidden group"><img src={img} className="w-full h-full object-cover" /><button onClick={() => setNcrData({...ncrData, imagesBefore: ncrData.imagesBefore?.filter((_, idx) => idx !== i)})} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button></div>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="flex justify-between items-center border-b border-slate-50 pb-2 mb-2">
                                <label className="text-[10px] font-black text-green-600 uppercase flex items-center gap-1.5"><CheckCircle className="w-4 h-4"/> Ảnh SAU xử lý</label>
                                <div className="flex gap-1">
                                    <button onClick={() => { setUploadTarget('AFTER'); cameraInputRef.current?.click(); }} className="p-1.5 bg-green-50 text-green-600 rounded-lg border border-green-100 hover:bg-green-100 active:scale-90 transition-all" type="button"><Camera className="w-4 h-4"/></button>
                                    <button onClick={() => { setUploadTarget('AFTER'); fileInputRef.current?.click(); }} className="p-1.5 bg-slate-50 text-slate-400 rounded-lg border border-slate-200 hover:bg-slate-100 active:scale-90 transition-all" type="button"><ImageIcon className="w-4 h-4"/></button>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                {ncrData.imagesAfter?.map((img, i) => (
                                    <div key={i} className="relative aspect-square border rounded-lg overflow-hidden group"><img src={img} className="w-full h-full object-cover" /><button onClick={() => setNcrData({...ncrData, imagesAfter: ncrData.imagesAfter?.filter((_, idx) => idx !== i)})} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button></div>
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

export const InspectionForm: React.FC<InspectionFormProps> = ({ 
  initialData, onSave, onCancel, plans, workshops, user
}) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({
    id: `INS-${Date.now()}`, date: new Date().toISOString().split('T')[0],
    status: InspectionStatus.DRAFT, items: [], images: [], score: 0,
    signature: '', productionSignature: '', inspectedQuantity: 0,
    passedQuantity: 0, failedQuantity: 0, ...initialData
  });

  const [searchCode, setSearchCode] = useState(initialData?.headcode || initialData?.ma_nha_may || '');
  const [activeNcrItemIndex, setActiveNcrItemIndex] = useState<number | null>(null);
  const [isNcrModalOpen, setIsNcrModalOpen] = useState(false);
  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: { type: 'MAIN' | 'ITEM', itemId?: string }; } | null>(null);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Auto-sync searchCode when ma_nha_may changes (from direct lookup)
  useEffect(() => {
    if (formData.ma_nha_may && !searchCode) {
        setSearchCode(formData.ma_nha_may);
    }
  }, [formData.ma_nha_may]);

  const availableStages = useMemo(() => {
      if (!formData.ma_nha_may) return [];
      const selectedWorkshop = workshops.find(ws => ws.code === formData.ma_nha_may);
      return selectedWorkshop?.stages || [];
  }, [formData.ma_nha_may, workshops]);

  const visibleItems = useMemo(() => {
      if (!formData.inspectionStage) return [];
      if (!formData.items) return [];
      return formData.items.filter(item => !item.stage || item.stage === formData.inspectionStage);
  }, [formData.items, formData.inspectionStage]);

  const rates = useMemo(() => {
    const ins = parseFloat(String(formData.inspectedQuantity || 0));
    const pas = parseFloat(String(formData.passedQuantity || 0));
    const fai = parseFloat(String(formData.failedQuantity || 0));
    if (ins <= 0) return { passRate: 0, defectRate: 0 };
    return {
        passRate: ((pas / ins) * 100).toFixed(1),
        defectRate: ((fai / ins) * 100).toFixed(1)
    };
  }, [formData.inspectedQuantity, formData.passedQuantity, formData.failedQuantity]);

  const lookupPlanInfo = async (value: string) => {
      if (!value) return;
      setIsLookupLoading(true);
      try {
          const searchTerm = value.toLowerCase().trim();
          const apiRes = await fetchPlans(value, 1, 5);
          const match = apiRes.items.find(p => (p.headcode || '').toLowerCase().trim() === searchTerm || (p.ma_nha_may || '').toLowerCase().trim() === searchTerm);
          if (match) {
              setFormData(prev => ({ ...prev, ma_ct: match.ma_ct, ten_ct: match.ten_ct, ten_hang_muc: match.ten_hang_muc, dvt: match.dvt, so_luong_ipo: match.so_luong_ipo, headcode: match.headcode, ma_nha_may: match.ma_nha_may }));
              setSearchCode(match.ma_nha_may || match.headcode || value);
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
            if (field === 'status' && value === CheckStatus.FAIL && !newItems[index].ncr) {
                setActiveNcrItemIndex(index);
                setIsNcrModalOpen(true);
            }
        }
        return { ...prev, items: newItems };
    });
  };

  const handleSaveNCR = (ncrData: NCR) => {
      if (activeNcrItemIndex === null) return;
      setFormData(prev => {
          const newItems = [...(prev.items || [])];
          const currentItem = newItems[activeNcrItemIndex];
          newItems[activeNcrItemIndex] = { ...currentItem, status: CheckStatus.FAIL, ncr: { ...ncrData, id: currentItem.ncr?.id || `NCR-${Date.now()}`, inspection_id: formData.id, itemId: currentItem.id, createdDate: new Date().toISOString() } };
          return { ...prev, items: newItems };
      });
      setIsNcrModalOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          const processed = await resizeImage(reader.result);
          if (activeUploadId === 'MAIN') setFormData(prev => ({ ...prev, images: [...(prev.images || []), processed] }));
          else setFormData(prev => ({ ...prev, items: prev.items?.map(i => i.id === activeUploadId ? { ...i, images: [...(i.images || []), processed] } : i) }));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!formData.ma_ct || !formData.inspectionStage) { alert("Vui lòng nhập đủ thông tin và chọn công đoạn."); return; }
    setIsSaving(true);
    try { await onSave({ ...formData, inspectorName: user.name, updatedAt: new Date().toISOString() } as Inspection); } 
    catch (e) { alert("Lỗi khi lưu phiếu."); } finally { setIsSaving(false); }
  };

  const formStyle = { fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt' };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg md:shadow-xl overflow-hidden animate-in slide-in-from-bottom duration-300 relative" style={formStyle}>
      <div className="bg-white border-b border-slate-300 z-10 shrink-0 flex justify-between items-center px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <h2 className="font-black text-[13pt] uppercase tracking-tighter">QAQC SYSTEM</h2>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-full transition-all" type="button"><X className="w-6 h-6" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar bg-slate-50">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-blue-700 border-b border-blue-50 pb-2 mb-2 font-black text-xs uppercase tracking-widest flex items-center gap-2"><Box className="w-4 h-4"/> I. THÔNG TIN SẢN PHẨM</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Mã định danh (Headcode)</label>
                    <div className="relative flex items-center">
                        <input value={searchCode} onChange={e => { setSearchCode(e.target.value); if(e.target.value.length >= 3) lookupPlanInfo(e.target.value); }} className="w-full p-2.5 pr-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none font-bold text-sm" placeholder="Quét/Nhập mã..."/>
                        <button onClick={() => setShowScanner(true)} className="absolute right-2 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" type="button"><QrCode className="w-5 h-5"/></button>
                    </div>
                </div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Mã Dự Án</label><input value={formData.ma_ct || ''} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-bold text-sm"/></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Tên Sản Phẩm</label><input value={formData.ten_hang_muc || ''} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-bold text-sm"/></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Số IPO</label><input type="number" value={formData.so_luong_ipo || 0} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"/></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">ĐVT</label><input value={formData.dvt || 'PCS'} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"/></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Ngày kiểm</label><input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl font-bold text-sm"/></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">QC</label><input value={formData.inspectorName || user.name} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"/></div>
            </div>
        </div>

        <section className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-blue-700 font-black text-xs uppercase tracking-widest flex items-center gap-2 border-b border-blue-50 pb-2"><ImageIcon className="w-4 h-4"/> II. ẢNH TỔNG QUAN HIỆN TRƯỜNG</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                <button onClick={() => { setActiveUploadId('MAIN'); cameraInputRef.current?.click(); }} className="w-24 h-24 bg-blue-50 border border-blue-200 rounded-2xl flex flex-col items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors shrink-0 shadow-sm" type="button"><Camera className="w-7 h-7 mb-1"/><span className="text-[8pt] font-black uppercase">Chụp ảnh</span></button>
                <button onClick={() => { setActiveUploadId('MAIN'); fileInputRef.current?.click(); }} className="w-24 h-24 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors shrink-0 shadow-sm" type="button"><ImageIcon className="w-7 h-7 mb-1"/><span className="text-[8pt] font-black uppercase">Thiết bị</span></button>
                {formData.images?.map((img, idx) => (
                    <div key={idx} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 shrink-0 group"><img src={img} className="w-full h-full object-cover" /><button onClick={() => setFormData({...formData, images: formData.images?.filter((_, i) => i !== idx)})} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"><X className="w-3 h-3"/></button></div>
                ))}
            </div>
        </section>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-blue-700 border-b border-blue-50 pb-2 font-black text-xs uppercase tracking-widest flex items-center gap-2"><MapPin className="w-4 h-4"/> III. ĐỊA ĐIỂM & SỐ LƯỢNG</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Xưởng sản xuất</label><select value={formData.ma_nha_may || ''} onChange={e => handleInputChange('ma_nha_may', e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-sm font-bold shadow-sm"><option value="">-- Chọn xưởng --</option>{workshops.map(ws => <option key={ws.code} value={ws.code}>{ws.name}</option>)}</select></div>
                 <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Công đoạn kiểm tra *</label><select value={formData.inspectionStage || ''} onChange={e => handleInputChange('inspectionStage', e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-sm font-bold shadow-sm"><option value="">-- Chọn giai đoạn để load checklist --</option>{availableStages.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 bg-slate-50/50 p-4 rounded-2xl">
                 <div className="space-y-1"><label className="font-black text-slate-500 text-[9pt] uppercase tracking-widest ml-1">SL Kiểm tra</label><input type="number" step="0.01" value={formData.inspectedQuantity || ''} onChange={e => handleInputChange('inspectedQuantity', e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl font-black bg-white focus:ring-4 ring-blue-100 outline-none transition-all shadow-inner" placeholder="0.00" /></div>
                 <div className="space-y-1"><div className="flex justify-between items-center"><label className="font-black text-green-600 text-[9pt] uppercase tracking-widest ml-1">SL Đạt</label><span className="text-[9pt] font-black text-green-700 bg-green-100 px-2 py-0.5 rounded-full shadow-sm">{rates.passRate}%</span></div><input type="number" step="0.01" value={formData.passedQuantity || ''} onChange={e => handleInputChange('passedQuantity', e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl font-black bg-white focus:ring-4 ring-green-100 outline-none transition-all shadow-inner" placeholder="0.00" /></div>
                 <div className="space-y-1"><div className="flex justify-between items-center"><label className="font-black text-red-600 text-[9pt] uppercase tracking-widest ml-1">SL Lỗi</label><span className="text-[9pt] font-black text-red-700 bg-red-100 px-2 py-0.5 rounded-full shadow-sm">{rates.defectRate}%</span></div><input type="number" step="0.01" value={formData.failedQuantity || ''} onChange={e => handleInputChange('failedQuantity', e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl font-black bg-white focus:ring-4 ring-red-100 outline-none transition-all shadow-inner" placeholder="0.00" /></div>
            </div>
        </div>

        <div className="space-y-3">
            <h3 className="font-black text-slate-700 text-xs uppercase tracking-[0.2em] flex items-center gap-2 border-b border-slate-300 pb-2 px-1"><LayoutList className="w-4 h-4 text-blue-600"/> IV. NỘI DUNG KIỂM TRA ({visibleItems.length})</h3>
            {!formData.inspectionStage ? (
                <div className="bg-orange-50 border border-orange-100 p-10 rounded-[3rem] text-center space-y-3 animate-pulse shadow-inner"><Info className="w-12 h-12 text-orange-300 mx-auto" /><p className="font-black text-orange-800 uppercase tracking-widest text-sm">Vui lòng chọn Công đoạn tại Mục III để tải danh mục tiêu chuẩn</p></div>
            ) : (
                <div className="space-y-4">
                    {formData.items?.map((item, originalIndex) => (
                        (!item.stage || item.stage === formData.inspectionStage) && (
                            <div key={item.id} className={`bg-white rounded-[2rem] p-5 border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-300 bg-red-50/10' : 'border-slate-200'}`}>
                                <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-3">
                                    <div className="flex-1">
                                        <div className="flex gap-2 mb-1.5"><span className="bg-slate-100 text-[8pt] font-black uppercase text-slate-500 px-2.5 py-0.5 rounded-full border border-slate-200">{item.category}</span><span className="bg-blue-600 text-[8pt] font-black uppercase text-white px-2.5 py-0.5 rounded-full shadow-sm">{formData.inspectionStage}</span></div>
                                        <input value={item.label} onChange={e => handleItemChange(originalIndex, 'label', e.target.value)} className="w-full font-black text-[12pt] bg-transparent outline-none text-slate-800 uppercase tracking-tight" placeholder="Nội dung kiểm tra..." />
                                    </div>
                                    <button onClick={() => setFormData({...formData, items: formData.items?.filter((_, i) => i !== originalIndex)})} className="p-2 text-slate-300 hover:text-red-500 active:scale-90" type="button"><Trash2 className="w-5 h-5"/></button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1 mb-1"><Microscope className="w-3 h-3"/> Phương pháp (ISO)</label><input value={item.method || ''} readOnly className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 cursor-not-allowed shadow-inner" placeholder="Tự động tải..."/></div>
                                    <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1 mb-1"><Ruler className="w-3 h-3"/> Tiêu chuẩn chấp nhận</label><input value={item.standard || ''} readOnly className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 cursor-not-allowed shadow-inner" placeholder="Tự động tải..."/></div>
                                </div>
                                <div className="flex flex-wrap gap-3 items-center">
                                    <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 border border-slate-200 shadow-inner">
                                        {[CheckStatus.PASS, CheckStatus.FAIL, CheckStatus.CONDITIONAL].map(st => (
                                            <button key={st} onClick={() => handleItemChange(originalIndex, 'status', st)} className={`px-4 py-2 rounded-xl text-[9pt] font-black uppercase tracking-tight transition-all active:scale-95 ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-lg shadow-green-200' : st === CheckStatus.FAIL ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'bg-orange-50 text-white shadow-lg shadow-orange-200') : 'text-slate-400 hover:bg-white hover:text-slate-700'}`} type="button">{st}</button>
                                        ))}
                                    </div>
                                    
                                    <div className="flex items-center gap-2 ml-auto">
                                        <button onClick={() => { setActiveUploadId(item.id); cameraInputRef.current?.click(); }} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 shadow-sm active:scale-90 transition-all" title="Chụp ảnh Camera" type="button"><Camera className="w-5 h-5"/></button>
                                        <button onClick={() => { setActiveUploadId(item.id); fileInputRef.current?.click(); }} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 shadow-sm active:scale-90 transition-all" title="Tải ảnh từ thiết bị" type="button"><ImageIcon className="w-5 h-5"/></button>
                                        {item.status === CheckStatus.FAIL && (
                                            <button onClick={() => { setActiveNcrItemIndex(originalIndex); setIsNcrModalOpen(true); }} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[9pt] font-black uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-slate-200 active:scale-95 transition-all" type="button"><AlertOctagon className="w-4 h-4"/> NCR</button>
                                        )}
                                    </div>
                                </div>
                                <textarea value={item.notes || ''} onChange={e => handleItemChange(originalIndex, 'notes', e.target.value)} className="w-full mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:bg-white focus:ring-4 ring-blue-100 outline-none transition-all shadow-inner h-20" placeholder="Mô tả sai lệch kỹ thuật hoặc ghi chú xử lý..."/>
                                {item.images && item.images.length > 0 && (
                                    <div className="flex gap-2.5 mt-3 overflow-x-auto no-scrollbar py-1">
                                        {item.images.map((im, i) => (
                                            <div key={i} className="relative w-16 h-16 shrink-0 border border-slate-200 rounded-xl overflow-hidden shadow-sm group"><img src={im} className="w-full h-full object-cover" /><button onClick={() => { const newImgs = item.images?.filter((_, idx) => idx !== i); handleItemChange(originalIndex, 'images', newImgs); }} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity" type="button"><X className="w-3 h-3"/></button></div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    ))}
                    <button onClick={() => setFormData({...formData, items: [...(formData.items || []), { id: `new_${Date.now()}`, category: 'CHUNG', label: 'TIÊU CHÍ BỔ SUNG', status: CheckStatus.PENDING, stage: formData.inspectionStage, method: 'Kiểm tra hiện trường', standard: 'Theo phê duyệt dự án' }]})} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-[2rem] text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white hover:border-blue-300 hover:text-blue-500 transition-all active:scale-[0.99] shadow-sm" type="button">+ Thêm tiêu chí kiểm tra tùy chỉnh</button>
                </div>
            )}
        </div>

        <section className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm mt-6">
            <h3 className="text-blue-700 border-b border-blue-50 pb-3 mb-6 font-black text-xs uppercase tracking-widest flex items-center gap-2"><PenTool className="w-4 h-4"/> V. XÁC NHẬN & CHỮ KÝ ĐIỆN TỬ</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <SignaturePad label="Đại diện Xưởng / Hiện trường" value={formData.productionSignature} onChange={sig => setFormData({...formData, productionSignature: sig})} />
                <SignaturePad label={`Đại diện QA/QC (${user.name})`} value={formData.signature} onChange={sig => setFormData({...formData, signature: sig})} />
            </div>
        </section>
      </div>

      <div className="p-4 md:p-6 border-t border-slate-200 bg-white flex flex-col sm:flex-row justify-end gap-3 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] z-20">
        <button onClick={onCancel} className="px-8 py-3.5 text-slate-500 font-black uppercase text-xs tracking-widest hover:bg-slate-50 rounded-xl transition-all active:scale-95" type="button">Hủy bỏ</button>
        <button onClick={handleSubmit} disabled={isSaving} className="px-16 py-4 bg-blue-700 text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl shadow-2xl shadow-blue-200 hover:bg-blue-800 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50" type="button">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
            <span>Lưu & Hoàn tất Phiếu</span>
        </button>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
      
      {activeNcrItemIndex !== null && formData.items && formData.items[activeNcrItemIndex] && (
          <NCRModal 
              isOpen={isNcrModalOpen} onClose={() => setIsNcrModalOpen(false)} onSave={handleSaveNCR}
              initialData={formData.items[activeNcrItemIndex].ncr}
              itemName={formData.items[activeNcrItemIndex].label}
              inspectionStage={formData.inspectionStage}
          />
      )}

      {showScanner && (
          <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { setSearchCode(data); lookupPlanInfo(data); setShowScanner(false); }} />
      )}
      {editorState && (
          <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} readOnly={false} />
      )}
    </div>
  );
};
