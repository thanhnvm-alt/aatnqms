
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, MaterialIQC, ModuleId, SupportingDoc } from '../types';
import { 
  Save, X, Box, FileText, QrCode, Loader2, Building2, 
  Calendar, PenTool, Eraser, Plus, Trash2, 
  Camera, Image as ImageIcon, ClipboardList, ChevronDown, 
  ChevronUp, MessageCircle, History, FileCheck, Search, AlertCircle, Maximize2,
  Layers, Briefcase, Hash, CheckSquare, Square, Info, ShieldCheck, CheckCircle, AlertTriangle
} from 'lucide-react';
import { fetchProjects, fetchDefectLibrary, saveDefectLibraryItem, fetchPlans } from '../services/apiService';
import { QRScannerModal } from './QRScannerModal';
import { ImageEditorModal } from './ImageEditorModal';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  inspections: Inspection[];
  user: User;
  templates: Record<string, CheckItem[]>;
}

const SUPPORTING_DOC_TEMPLATES = [
    "Bản vẽ có chữ ký xác nhận",
    "Spec",
    "Chứng nhận test nguyên vật liệu",
    "Rập cỡ có chữ ký xác nhận",
    "Mẫu màu",
    "Phiếu thông tin chi tiết các yêu cầu đặt mua nguyên vật liệu",
    "Mẫu đối chứng"
];

const UNIT_OPTIONS = [
    "PCS", "M2", "M3", "MÉT", "CHAI", "LỌ", "THÙNG", "PHUY", "FIT", "TUÝP", "BỘ", "CẶP", "KG", "LÍT"
];

const resizeImage = (base64Str: string, maxWidth = 1000): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
      } else {
        if (height > maxWidth) { width = Math.round((width * maxWidth) / height); height = maxWidth; }
      }
      canvas.width = width; 
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64Str); return; }
      ctx.fillStyle = '#FFFFFF'; 
      ctx.fillRect(0, 0, width, height); 
      ctx.drawImage(img, 0, 0, width, height);
      
      let quality = 0.7;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > 133333 && quality > 0.1) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(dataUrl);
    };
    img.onerror = () => resolve(base64Str);
  });
};

const SignaturePad = ({ label, value, onChange, readOnly = false }: { label: string; value?: string; onChange: (base64: string) => void; readOnly?: boolean; }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas && value) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => { ctx?.clearRect(0, 0, canvas.width, canvas.height); ctx?.drawImage(img, 0, 0, canvas.width, canvas.height); };
            img.src = value;
        }
    }, [value]);
    const startDrawing = (e: any) => {
        if (readOnly) return;
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        ctx.beginPath(); ctx.moveTo(clientX - rect.left, clientY - rect.top);
        ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000000';
        setIsDrawing(true);
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
    const clear = () => { if (readOnly) return; const canvas = canvasRef.current; if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height); onChange(''); } };
    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center px-1">
                <label className="text-slate-600 font-bold text-[9px] uppercase tracking-wider">{label}</label>
                {!readOnly && <button onClick={clear} className="text-[9px] font-bold text-red-600 uppercase flex items-center gap-1 hover:underline" type="button"><Eraser className="w-3 h-3" /> Xóa</button>}
            </div>
            <div className="border border-slate-300 rounded-xl bg-white overflow-hidden relative h-28 shadow-sm">
                <canvas ref={canvasRef} width={400} height={112} className="w-full h-full touch-none cursor-crosshair" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                {!value && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] uppercase font-bold tracking-widest">Ký xác nhận</div>}
            </div>
        </div>
    );
};

export const InspectionFormIQC: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, inspections, user, templates }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({
    id: initialData?.id || `IQC-${Date.now()}`,
    type: 'IQC' as ModuleId,
    date: new Date().toISOString().split('T')[0],
    status: InspectionStatus.DRAFT,
    materials: initialData?.materials || [],
    supportingDocs: initialData?.supportingDocs || SUPPORTING_DOC_TEMPLATES.map(name => ({ id: `doc_${Math.random()}`, name, verified: false })),
    referenceDocs: initialData?.referenceDocs || [],
    inspectorName: user.name,
    po_number: initialData?.po_number || '', 
    ma_ct: initialData?.ma_ct || '',        
    supplier: initialData?.supplier || '',
    location: initialData?.location || '',
    reportImages: initialData?.reportImages || [],
    deliveryNoteImages: initialData?.deliveryNoteImages || [],
    summary: initialData?.summary || '',
    images: initialData?.images || [],
    score: initialData?.score || 0,
    ...initialData
  });

  const [isSaving, setIsSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  
  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadContext, setActiveUploadContext] = useState<{ type: 'MAIN' | 'DELIVERY' | 'REPORT' | 'ITEM' | 'MATERIAL', matIdx?: number, itemIdx?: number } | null>(null);

  const iqcGroups = useMemo(() => {
      const iqcTpl = templates['IQC'] || [];
      return Array.from(new Set(iqcTpl.map(i => i.category))).filter(Boolean).sort();
  }, [templates]);

  const handleInputChange = (field: keyof Inspection, value: any) => { 
    setFormData(prev => ({ ...prev, [field]: value })); 
  };

  const lookupMaterialProject = async (code: string, matIdx: number) => {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 3) return;
    setIsLookupLoading(true);
    try {
      const response = await fetchPlans(cleanCode, 1, 10);
      const match = (response.items || []).find(p => (p.ma_ct || '').toUpperCase() === cleanCode || (p.ma_nha_may || '').toUpperCase() === cleanCode || (p.headcode || '').toUpperCase() === cleanCode);
      if (match) {
        setFormData(prev => {
            const nextMats = [...(prev.materials || [])];
            if (nextMats[matIdx]) { nextMats[matIdx].projectName = match.ten_ct; nextMats[matIdx].projectCode = match.ma_ct; }
            return { ...prev, materials: nextMats, ma_ct: prev.ma_ct || match.ma_ct };
        });
      }
    } catch (e) { console.error(e); } finally { setIsLookupLoading(false); }
  };
  
  const handleAddMaterial = () => {
    const newMaterial: MaterialIQC = {
        id: `mat-${Date.now()}`,
        name: '',
        category: '',
        inspectType: '100%',
        scope: 'COMMON',
        projectCode: 'DÙNG CHUNG',
        projectName: 'VẬT TƯ KHO DÙNG CHUNG',
        orderQty: 0,
        deliveryQty: 0,
        unit: 'PCS',
        criteria: [],
        items: [],
        inspectQty: 0,
        passQty: 0,
        failQty: 0,
        images: [],
        type: 'AQL',
        date: new Date().toISOString().split('T')[0]
    };
    setFormData(prev => ({ ...prev, materials: [...(prev.materials || []), newMaterial] }));
    setExpandedMaterial(newMaterial.id);
  };

  const updateMaterial = (idx: number, field: keyof MaterialIQC, value: any) => {
    setFormData(prev => {
        const nextMaterials = [...(prev.materials || [])];
        if (!nextMaterials[idx]) return prev;
        let val = value;
        if (['orderQty', 'deliveryQty', 'inspectQty', 'passQty', 'failQty'].includes(field)) { val = parseFloat(String(value)) || 0; }
        let mat = { ...nextMaterials[idx], [field]: val };
        if (field === 'inspectQty') { if (val > mat.deliveryQty) val = mat.deliveryQty; if (val < 0) val = 0; mat.inspectQty = val; mat.passQty = val; mat.failQty = 0; }
        else if (field === 'passQty') { if (val > mat.inspectQty) val = mat.inspectQty; if (val < 0) val = 0; mat.passQty = val; mat.failQty = Number((mat.inspectQty - val).toFixed(2)); }
        else if (field === 'failQty') { if (val > mat.inspectQty) val = mat.inspectQty; if (val < 0) val = 0; mat.failQty = val; mat.passQty = Number((mat.inspectQty - val).toFixed(2)); }
        if (field === 'category') {
            const iqcTpl = templates['IQC'] || [];
            mat.items = iqcTpl.filter(i => i.category === value).map(i => ({ ...i, id: `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, status: CheckStatus.PENDING, notes: '', images: [] }));
        }
        if (field === 'scope') { if (value === 'COMMON') { mat.projectCode = 'DÙNG CHUNG'; mat.projectName = 'VẬT TƯ KHO DÙNG CHUNG'; } else { mat.projectCode = ''; mat.projectName = ''; } }
        nextMaterials[idx] = mat;
        return { ...prev, materials: nextMaterials };
    });
  };

  const updateMaterialItem = (matIdx: number, itemIdx: number, field: keyof CheckItem, value: any) => {
      const nextMaterials = [...(formData.materials || [])];
      if (!nextMaterials[matIdx]) return;
      const matItems = [...(nextMaterials[matIdx].items || [])];
      if (!matItems[itemIdx]) return;
      matItems[itemIdx] = { ...matItems[itemIdx], [field]: value };
      nextMaterials[matIdx].items = matItems;
      setFormData(prev => ({ ...prev, materials: nextMaterials }));
  };

  const toggleDoc = (id: string) => {
      setFormData(prev => ({ ...prev, supportingDocs: prev.supportingDocs?.map(d => d.id === id ? { ...d, verified: !d.verified } : d) }));
  };

  const addCustomDoc = () => {
      if (!newDocName.trim()) return;
      setFormData(prev => ({ ...prev, supportingDocs: [...(prev.supportingDocs || []), { id: `doc_${Date.now()}`, name: newDocName.trim(), verified: true }] }));
      setNewDocName('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeUploadContext) return;
    setIsProcessingImages(true);
    const { type, matIdx, itemIdx } = activeUploadContext;
    try {
        const processedImages = await Promise.all(Array.from(files).map(async (file: File) => { return new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = async () => { const compressed = await resizeImage(reader.result as string); resolve(compressed); }; reader.readAsDataURL(file); }); }));
        setFormData(prev => {
            if (type === 'MAIN') return { ...prev, images: [...(prev.images || []), ...processedImages] };
            if (type === 'DELIVERY') return { ...prev, deliveryNoteImages: [...(prev.deliveryNoteImages || []), ...processedImages] };
            if (type === 'REPORT') return { ...prev, reportImages: [...(prev.reportImages || []), ...processedImages] };
            if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
                const nextMats = [...(prev.materials || [])];
                const items = [...nextMats[matIdx].items];
                items[itemIdx] = { ...items[itemIdx], images: [...(items[itemIdx].images || []), ...processedImages] };
                nextMats[matIdx] = { ...nextMats[matIdx], items };
                return { ...prev, materials: nextMats };
            }
            return prev;
        });
    } catch (err) { console.error(err); } finally { setIsProcessingImages(false); e.target.value = ''; }
  };

  const onImageSave = (idx: number, updatedImg: string) => {
      if (!editorState) return;
      const { type, matIdx, itemIdx } = editorState.context;
      setFormData(prev => {
          if (type === 'MAIN') { const newImgs = [...(prev.images || [])]; newImgs[idx] = updatedImg; return { ...prev, images: newImgs }; }
          if (type === 'DELIVERY') { const newImgs = [...(prev.deliveryNoteImages || [])]; newImgs[idx] = updatedImg; return { ...prev, deliveryNoteImages: newImgs }; }
          if (type === 'REPORT') { const newImgs = [...(prev.reportImages || [])]; newImgs[idx] = updatedImg; return { ...prev, reportImages: newImgs }; }
          if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
              const nextMats = [...(prev.materials || [])];
              const items = [...nextMats[matIdx].items];
              const imgs = [...(items[itemIdx].images || [])];
              imgs[idx] = updatedImg;
              items[itemIdx] = { ...items[itemIdx], images: imgs };
              nextMats[matIdx] = { ...nextMats[matIdx], items };
              return { ...prev, materials: nextMats };
          }
          return prev;
      });
  };

  const handleSubmit = async () => {
    if (!formData.po_number || !formData.supplier) { alert("Vui lòng nhập Mã PO và Nhà cung cấp."); return; }
    if (!formData.signature) { alert("QC bắt buộc ký tên xác nhận báo cáo."); return; }
    const invalidMat = formData.materials?.find(m => m.inspectQty <= 0 || m.inspectQty > m.deliveryQty);
    if (invalidMat) { alert(`Vật tư "${invalidMat.name}" có số lượng kiểm tra không hợp lệ (phải > 0 và <= SL Giao).`); return; }
    setIsSaving(true);
    try { await onSave({ ...formData, status: InspectionStatus.PENDING, updatedAt: new Date().toISOString() } as Inspection); } catch (e: any) { alert("Lỗi lưu báo cáo IQC."); } finally { setIsSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      {(isProcessingImages || isLookupLoading) && (
          <div className="absolute inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white p-6 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest">{isLookupLoading ? "Đang truy xuất dữ liệu Plan..." : "Đang nén hình ảnh ISO..."}</p>
              </div>
          </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-28">
        {/* I. General Information */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-blue-50 pb-2 mb-1">
                <h3 className="text-blue-800 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><Box className="w-4 h-4"/> I. THÔNG TIN QUẢN LÝ IQC</h3>
                <button onClick={() => setShowHistory(true)} className="px-2 py-1 bg-slate-100 hover:bg-blue-100 text-slate-600 rounded-lg font-bold uppercase text-[9px] flex items-center gap-1 shadow-sm" type="button"><History className="w-3 h-3" /> Lịch sử ({inspections.filter(i => i.id !== formData.id && i.po_number === formData.po_number).length})</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Mã PO / Chứng từ *</label><div className="relative flex items-center"><input value={formData.po_number} onChange={e => handleInputChange('po_number', e.target.value.toUpperCase())} className="w-full px-2 py-1.5 border border-slate-300 rounded-md focus:ring-1 ring-blue-500 outline-none font-bold text-[11px] h-9" placeholder="Nhập mã..."/><button onClick={() => setShowScanner(true)} className="absolute right-1 p-1 text-slate-400" type="button"><QrCode className="w-4 h-4"/></button></div></div>
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nhà Cung Cấp *</label><div className="relative flex items-center"><input value={formData.supplier || ''} onChange={e => handleInputChange('supplier', e.target.value)} className="w-full px-2 py-1.5 pl-8 border border-slate-300 rounded-md font-bold focus:ring-1 ring-blue-500 outline-none text-[11px] h-9 uppercase" placeholder="Tên NCC..."/><Building2 className="absolute left-2 w-4 h-4 text-slate-400" /></div></div>
                <div className="space-y-1"><label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Ngày kiểm tra</label><div className="relative flex items-center"><input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-2 py-1.5 pl-8 border border-slate-300 rounded-md font-bold outline-none text-[11px] h-9"/><Calendar className="absolute left-2 w-4 h-4 text-slate-400" /></div></div>
            </div>

            {/* Evidence Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-50">
                <div className="space-y-1.5 bg-slate-50/50 p-2 rounded-xl border border-slate-100"><label className="text-[8px] font-black text-blue-600 uppercase flex items-center justify-between">Ảnh Hiện Trường<div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'MAIN' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-blue-600" type="button"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => { setActiveUploadContext({ type: 'MAIN' }); fileInputRef.current?.click(); }} className="p-1 hover:text-blue-600" type="button"><ImageIcon className="w-3 h-3"/></button></div></label><div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">{formData.images?.map((img, i) => (<img key={i} src={img} className="w-10 h-10 rounded border border-slate-200 object-cover shrink-0" onClick={() => setEditorState({ images: formData.images!, index: i, context: { type: 'MAIN' } })} />))}</div></div>
                <div className="space-y-1.5 bg-slate-50/50 p-2 rounded-xl border border-slate-100"><label className="text-[8px] font-black text-indigo-600 uppercase flex items-center justify-between">Phiếu Giao Hàng<div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); fileInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><ImageIcon className="w-3 h-3"/></button></div></label><div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">{formData.deliveryNoteImages?.map((img, i) => (<img key={i} src={img} className="w-10 h-10 rounded border border-slate-200 object-cover shrink-0" onClick={() => setEditorState({ images: formData.deliveryNoteImages!, index: i, context: { type: 'DELIVERY' } })} />))}</div></div>
                <div className="space-y-1.5 bg-slate-50/50 p-2 rounded-xl border border-slate-100"><label className="text-[8px] font-black text-emerald-600 uppercase flex items-center justify-between">Báo cáo NCC<div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-emerald-600" type="button"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); fileInputRef.current?.click(); }} className="p-1 hover:text-emerald-600" type="button"><ImageIcon className="w-3 h-3"/></button></div></label><div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">{formData.reportImages?.map((img, i) => (<img key={i} src={img} className="w-10 h-10 rounded border border-slate-200 object-cover shrink-0" onClick={() => setEditorState({ images: formData.reportImages!, index: i, context: { type: 'REPORT' } })} />))}</div></div>
            </div>

            {/* Supporting Documents */}
            <div className="pt-4 border-t border-slate-50 space-y-3">
                <h3 className="text-slate-700 font-bold uppercase tracking-widest flex items-center gap-2 text-[10px] border-b border-slate-50 pb-2"><FileCheck className="w-3.5 h-3.5 text-blue-500"/> DANH MỤC TÀI LIỆU HỖ TRỢ</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {(formData.supportingDocs || []).map(doc => (
                        <button key={doc.id} onClick={() => toggleDoc(doc.id)} className={`flex items-center gap-2 p-2 rounded-xl border transition-all text-left ${doc.verified ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'}`} type="button">
                            {doc.verified ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" />}
                            <span className="text-[9px] font-bold uppercase leading-tight">{doc.name}</span>
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 pt-2">
                    <input value={newDocName} onChange={e => setNewDocName(e.target.value)} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 ring-blue-100" placeholder="Thêm tài liệu hỗ trợ khác..."/>
                    <button onClick={addCustomDoc} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all">Thêm</button>
                </div>
            </div>
        </section>

        {/* II. Materials Details */}
        <section className="space-y-3">
            <div className="flex justify-between items-center px-1">
                <h3 className="font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2 text-xs"><ClipboardList className="w-4 h-4 text-blue-600"/> II. DANH MỤC VẬT TƯ ({formData.materials?.length || 0})</h3>
                <button onClick={handleAddMaterial} className="bg-blue-600 text-white p-1.5 rounded-lg shadow active:scale-95 transition-all flex items-center gap-1.5 px-3 hover:bg-blue-700" type="button">
                    <Plus className="w-3 h-3"/> <span className="text-[10px] font-bold uppercase">Thêm Vật Tư</span>
                </button>
            </div>
            
            <div className="space-y-3">
                {(formData.materials || []).map((mat, matIdx) => {
                    const isExp = expandedMaterial === mat.id;
                    const passRate = mat.inspectQty > 0 ? ((mat.passQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                    const hasFail = mat.items?.some(it => it.status === CheckStatus.FAIL);
                    const hasCond = mat.items?.some(it => it.status === CheckStatus.CONDITIONAL);
                    const allPass = (mat.items?.length || 0) > 0 && mat.items?.every(it => it.status === CheckStatus.PASS);
                    
                    return (
                    <div key={mat.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden animate-in zoom-in duration-200 ${allPass ? 'border-green-200 ring-1 ring-green-50' : hasFail ? 'border-red-200 ring-1 ring-red-50' : 'border-slate-200'}`}>
                        <div className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${isExp ? 'bg-blue-50/50 border-b border-blue-100' : 'bg-white hover:bg-slate-50'}`} onClick={() => setExpandedMaterial(isExp ? null : mat.id)}>
                            <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm ${isExp ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{matIdx + 1}</div>
                                <div className="flex-1 overflow-hidden">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-slate-800 uppercase tracking-tight truncate text-xs">{mat.name || 'VẬT TƯ MỚI'}</h4>
                                        <div className="flex gap-1 shrink-0">
                                            {allPass && <span className="bg-green-600 text-white px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5"/> ĐẠT</span>}
                                            {hasFail && <span className="bg-red-600 text-white px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1 animate-pulse"><AlertTriangle className="w-2.5 h-2.5"/> NCR</span>}
                                            {hasCond && <span className="bg-amber-500 text-white px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1"><Info className="w-2.5 h-2.5"/> CĐK</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5"><span className="text-[9px] font-bold text-slate-400 uppercase">{mat.scope === 'COMMON' ? 'Dùng chung' : mat.projectCode}</span><span className="px-1.5 py-0.5 bg-green-50 text-green-600 rounded text-[8px] font-bold uppercase border border-green-100">{passRate}% ĐẠT</span></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2"><button onClick={(e) => { e.stopPropagation(); if(window.confirm("Xóa mục này?")) setFormData(prev => ({ ...prev, materials: prev.materials?.filter((_, i) => i !== matIdx) })); }} className="p-1.5 text-slate-300 hover:text-red-600" type="button"><Trash2 className="w-4 h-4"/></button>{isExp ? <ChevronUp className="w-5 h-5 text-blue-500"/> : <ChevronDown className="w-5 h-5 text-slate-300"/>}</div>
                        </div>
                        {isExp && (
                            <div className="p-4 space-y-4 bg-white border-t border-slate-50">
                                {/* CLASSIFICATION MATRIX */}
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-4 shadow-inner">
                                    <div className="md:col-span-3 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                            PHÂN LOẠI
                                        </label>
                                        <div className="relative">
                                            <select 
                                                value={mat.scope} 
                                                onChange={e => updateMaterial(matIdx, 'scope', e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-black text-[11px] h-10 uppercase outline-none focus:ring-2 ring-blue-100 transition-all appearance-none"
                                            >
                                                <option value="COMMON">Dùng chung</option>
                                                <option value="PROJECT">Công trình</option>
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div className="md:col-span-3 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                            MÃ DỰ ÁN
                                        </label>
                                        <div className="relative flex items-center">
                                            <input 
                                                value={mat.projectCode} 
                                                onChange={e => updateMaterial(matIdx, 'projectCode', e.target.value.toUpperCase())} 
                                                onBlur={() => mat.scope === 'PROJECT' && lookupMaterialProject(mat.projectCode || '', matIdx)}
                                                disabled={mat.scope === 'COMMON'}
                                                className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-[11px] h-10 outline-none transition-all shadow-sm ${mat.scope === 'COMMON' ? 'bg-slate-100 text-slate-400' : 'bg-white focus:ring-2 ring-blue-100'}`} 
                                                placeholder="Mã CT..."
                                            />
                                        </div>
                                    </div>
                                    <div className="md:col-span-6 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                            TÊN CÔNG TRÌNH
                                        </label>
                                        <div className="relative flex items-center">
                                            <input 
                                                value={mat.projectName} 
                                                readOnly 
                                                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg font-bold text-[11px] h-10 text-slate-500 uppercase truncate" 
                                                placeholder="..."
                                            />
                                            {isLookupLoading && mat.scope === 'PROJECT' && <Loader2 className="absolute right-3 w-4 h-4 animate-spin text-blue-500" />}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-12 gap-3">
                                  <div className="col-span-4">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Chủng loại</label>
                                      <select value={mat.category || ''} onChange={e => updateMaterial(matIdx, 'category', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold outline-none text-[10px] h-9 bg-white shadow-sm">
                                          <option value="">-- Chọn --</option>
                                          {iqcGroups.map(g => <option key={g} value={g}>{g}</option>)}
                                      </select>
                                  </div>
                                  <div className="col-span-3">
                                      <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-1">Loại kiểm</label>
                                      <select value={mat.inspectType || '100%'} onChange={e => updateMaterial(matIdx, 'inspectType', e.target.value as any)} className="w-full px-2 py-1.5 border border-blue-300 rounded-lg font-black text-[10px] h-9 bg-white outline-none text-blue-700 shadow-sm"><option value="100%">100%</option><option value="AQL">AQL</option></select>
                                  </div>
                                  <div className="col-span-5">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Tên Vật Tư *</label>
                                      <input value={mat.name} onChange={e => updateMaterial(matIdx, 'name', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg font-bold focus:ring-1 ring-blue-500 outline-none text-[10px] h-9 shadow-sm" placeholder="Tên sản phẩm..."/>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-slate-500 uppercase block text-center">Giao(DN)</label><input type="number" step="any" value={mat.deliveryQty} onChange={e => updateMaterial(matIdx, 'deliveryQty', e.target.value)} className="w-full px-1 py-1 border border-slate-300 rounded-md font-bold text-center bg-white text-[11px] h-7"/></div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase block text-center">DVT</label>
                                        <input list="unit-list" value={mat.unit} onChange={e => updateMaterial(matIdx, 'unit', e.target.value)} className="w-full px-1 py-1 border border-slate-300 rounded-md font-black text-center bg-white text-[11px] h-7 uppercase" placeholder="DVT..."/>
                                        <datalist id="unit-list">{UNIT_OPTIONS.map(opt => <option key={opt} value={opt} />)}</datalist>
                                    </div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-blue-600 uppercase block text-center">Kiểm tra</label><input type="number" step="any" value={mat.inspectQty} onChange={e => updateMaterial(matIdx, 'inspectQty', e.target.value)} className={`w-full px-1 py-1 border rounded-md font-bold text-center bg-white text-[11px] h-7 ${mat.inspectQty > mat.deliveryQty || mat.inspectQty <= 0 ? 'border-red-500 text-red-600' : 'border-blue-300 text-blue-700'}`}/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-green-600 uppercase block text-center">Đạt</label><input type="number" step="any" value={mat.passQty} onChange={e => updateMaterial(matIdx, 'passQty', e.target.value)} className="w-full px-1 py-1 border border-green-300 rounded-md font-bold text-center text-green-700 bg-white text-[11px] h-7"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-red-600 uppercase block text-center">Hỏng</label><input type="number" step="any" value={mat.failQty} onChange={e => updateMaterial(matIdx, 'failQty', e.target.value)} className="w-full px-1 py-1 border border-red-300 rounded-md font-bold text-center text-red-700 bg-white text-[11px] h-7"/></div>
                                </div>

                                <div className="space-y-2 mt-2">
                                    {mat.items?.map((item, itemIdx) => (
                                        <div key={item.id} className={`bg-white border rounded-xl p-3 shadow-sm transition-colors ${item.status === CheckStatus.PASS ? 'border-green-100 hover:border-green-300' : item.status === CheckStatus.FAIL ? 'border-red-100 hover:border-red-300' : item.status === CheckStatus.CONDITIONAL ? 'border-amber-100 hover:border-amber-300' : 'border-slate-200 hover:border-blue-300'}`}>
                                            <p className="font-bold text-slate-800 uppercase tracking-tight text-xs mb-2">{item.label}</p>
                                            <div className="flex items-center gap-2 shrink-0 border-t border-slate-50 pt-2">
                                                <div className="flex bg-slate-100 p-0.5 rounded-lg gap-0.5 border border-slate-200">
                                                    {[CheckStatus.PASS, CheckStatus.FAIL, CheckStatus.CONDITIONAL].map(st => (
                                                        <button 
                                                            key={st} 
                                                            onClick={() => updateMaterialItem(matIdx, itemIdx, 'status', st)}
                                                            className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-sm' : st === CheckStatus.FAIL ? 'bg-red-600 text-white shadow-sm' : 'bg-amber-500 text-white shadow-sm') : 'text-slate-400 hover:text-slate-600'}`}
                                                            type="button"
                                                        >
                                                            {st === CheckStatus.PASS ? 'Đạt' : st === CheckStatus.FAIL ? 'Hỏng' : 'CĐK'}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-2 ml-auto">
                                                    <button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); cameraInputRef.current?.click(); }} className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 hover:text-blue-600" type="button"><Camera className="w-4 h-4" /></button>
                                                    <button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); fileInputRef.current?.click(); }} className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 hover:text-blue-600" type="button"><ImageIcon className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                            <input value={item.notes || ''} onChange={(e) => updateMaterialItem(matIdx, itemIdx, 'notes', e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] h-8 mt-2" placeholder="Ghi chú kết quả..."/>
                                            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 mt-1">
                                                {item.images?.map((img, i) => (
                                                    <img key={i} src={img} className="w-12 h-12 rounded border border-slate-200 object-cover shrink-0" onClick={() => setEditorState({ images: item.images!, index: i, context: { type: 'ITEM', matIdx, itemIdx } })} />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );})}
            </div>
        </section>

        {/* III. Summary */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2"><h3 className="text-blue-800 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><MessageCircle className="w-4 h-4"/> III. GHI CHÚ / TỔNG KẾT</h3><textarea value={formData.summary} onChange={e => handleInputChange('summary', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 outline-none focus:bg-white h-20 resize-none text-[11px]" placeholder="Nhập nhận xét tổng quan của QC..."/></section>
        
        {/* IV. QC Signature */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><h3 className="text-blue-800 border-b border-blue-50 pb-2 mb-4 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><PenTool className="w-4 h-4"/> IV. XÁC NHẬN QC</h3><SignaturePad label={`QC Ký Tên (${user.name})`} value={formData.signature} onChange={sig => setFormData({...formData, signature: sig})} /></section>
      </div>

      <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center justify-between gap-3 sticky bottom-0 z-40 shadow-sm pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <button onClick={onCancel} className="h-[44px] px-6 text-slate-500 font-bold uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all border border-slate-200 text-[10px]" type="button">HỦY BỎ</button>
        <button onClick={handleSubmit} disabled={isSaving || isProcessingImages} className="h-[44px] flex-1 bg-blue-700 text-white font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-blue-800 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 text-[10px]" type="button">{isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}<span>GỬI DUYỆT BÁO CÁO IQC</span></button>
      </div>

      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { handleInputChange('po_number', data); setShowScanner(false); }} />}
      {editorState && <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} onSave={onImageSave} readOnly={false}/>}
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
    </div>
  );
};
