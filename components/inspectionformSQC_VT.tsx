
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, MaterialIQC, ModuleId, SupportingDoc } from '../types';
// Fixed: Added missing AlertTriangle and AlertOctagon imports from lucide-react to resolve reported error
import { 
  Save, X, Box, FileText, QrCode, Loader2, Building2, 
  Calendar, PenTool, Eraser, Plus, Trash2, 
  Camera, Image as ImageIcon, ClipboardList, ChevronDown, 
  ChevronUp, History, FileCheck, Search, AlertCircle, MapPin, Locate,
  CheckSquare, Square, Info, ShieldCheck, CheckCircle, AlertTriangle, AlertOctagon
} from 'lucide-react';
import { fetchPlans } from '../services/apiService';
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

const UNIT_OPTIONS = ["PCS", "M2", "M3", "MÉT", "CHAI", "LỌ", "THÙNG", "PHUY", "FIT", "TUÝP", "BỘ", "CẶP", "KG", "LÍT"];

const resizeImage = (base64Str: string, maxWidth = 1000): Promise<string> => {
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
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height);
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

export const InspectionFormSQC_VT: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, inspections, user, templates }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({
    id: initialData?.id || `SQC-VT-${Date.now()}`,
    type: 'SQC_VT' as ModuleId,
    date: new Date().toISOString().split('T')[0],
    status: InspectionStatus.DRAFT,
    materials: initialData?.materials || [],
    supportingDocs: initialData?.supportingDocs || SUPPORTING_DOC_TEMPLATES.map(name => ({ id: `doc_${Math.random()}`, name, verified: false })),
    inspectorName: user.name,
    po_number: initialData?.po_number || '', 
    supplier: initialData?.supplier || '',
    supplierAddress: initialData?.supplierAddress || '',
    location: initialData?.location || '',
    reportImages: initialData?.reportImages || [],
    deliveryNoteImages: initialData?.deliveryNoteImages || [],
    images: initialData?.images || [], 
    summary: initialData?.summary || '',
    ...initialData
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  
  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadContext, setActiveUploadContext] = useState<{ type: 'MAIN' | 'DELIVERY' | 'REPORT' | 'ITEM' | 'MATERIAL', matIdx?: number, itemIdx?: number } | null>(null);

  const sqcGroups = useMemo(() => {
      const sqcTpl = templates['SQC_MAT'] || templates['SQC_VT'] || templates['IQC'] || [];
      return Array.from(new Set(sqcTpl.map(i => i.category))).filter(Boolean).sort();
  }, [templates]);

  const handleInputChange = (field: keyof Inspection, value: any) => { 
    setFormData(prev => ({ ...prev, [field]: value })); 
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
        
        if (field === 'category') {
            const iqcTpl = templates['IQC'] || templates['SQC_MAT'] || [];
            mat.items = iqcTpl.filter(i => i.category === value).map(i => ({ ...i, id: `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, status: CheckStatus.PENDING, notes: '', images: [] }));
        }
        
        if (field === 'inspectQty') { mat.passQty = val; mat.failQty = 0; }
        else if (field === 'passQty') { mat.failQty = Number((mat.inspectQty - val).toFixed(2)); }
        else if (field === 'failQty') { mat.passQty = Number((mat.inspectQty - val).toFixed(2)); }

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

  const handleEditImage = (images: string[], index: number, context: any) => { setEditorState({ images, index, context }); };
  
  const onImageSave = (idx: number, updatedImg: string) => {
      if (!editorState) return;
      const { type, matIdx, itemIdx } = editorState.context;
      setFormData(prev => {
          if (type === 'MAIN') { const next = [...(prev.images || [])]; next[idx] = updatedImg; return { ...prev, images: next }; }
          if (type === 'DELIVERY') { const next = [...(prev.deliveryNoteImages || [])]; next[idx] = updatedImg; return { ...prev, deliveryNoteImages: next }; }
          if (type === 'REPORT') { const next = [...(prev.reportImages || [])]; next[idx] = updatedImg; return { ...prev, reportImages: next }; }
          if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
              const nextMats = [...(prev.materials || [])];
              nextMats[matIdx].items[itemIdx].images![idx] = updatedImg;
              return { ...prev, materials: nextMats };
          }
          return prev;
      });
  };

  const toggleDoc = (id: string) => {
      setFormData(prev => ({ ...prev, supportingDocs: prev.supportingDocs?.map(d => d.id === id ? { ...d, verified: !d.verified } : d) }));
  };

  const addCustomDoc = () => {
      if (!newDocName.trim()) return;
      setFormData(prev => ({ ...prev, supportingDocs: [...(prev.supportingDocs || []), { id: `doc_${Date.now()}`, name: newDocName.trim(), verified: true }] }));
      setNewDocName('');
  };

  const handleSubmit = async () => {
    if (!formData.po_number || !formData.supplier) { alert("Vui lòng nhập Mã PO và Nhà cung cấp."); return; }
    if (!formData.signature) { alert("QC bắt buộc phải ký tên xác nhận báo cáo."); return; }
    setIsSaving(true);
    try {
        await onSave({ ...formData, status: InspectionStatus.PENDING, updatedAt: new Date().toISOString() } as Inspection);
    } catch (e: any) { alert("Lỗi hệ thống: Không thể lưu báo cáo."); } finally { setIsSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative no-scroll-x" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      {(isProcessingImages || isLookupLoading || isSaving) && (
          <div className="absolute inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white p-6 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest">{isSaving ? "Đang lưu báo cáo..." : "Đang nén hình ảnh ISO..."}</p>
              </div>
          </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-28">
        {/* I. THÔNG TIN QUẢN LÝ */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-teal-50 pb-2 mb-1">
                <h3 className="text-teal-800 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><Box className="w-4 h-4"/> I. THÔNG TIN GIA CÔNG VẬT TƯ</h3>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowHistory(true)} className="px-2 py-1 bg-slate-100 hover:bg-teal-100 text-slate-600 rounded-lg font-bold uppercase text-[9px] flex items-center gap-1 shadow-sm" type="button"><History className="w-3 h-3" /> Lịch sử</button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">Mã PO / Chứng từ *</label>
                    <div className="relative flex items-center">
                        <input value={formData.po_number} onChange={e => handleInputChange('po_number', e.target.value.toUpperCase())} className="w-full px-2 py-1.5 border border-slate-300 rounded-md focus:ring-1 ring-teal-500 outline-none font-bold text-[11px] h-9 shadow-inner" placeholder="Mã PO..."/>
                        <button onClick={() => setShowScanner(true)} className="absolute right-1 p-1 text-slate-400" type="button"><QrCode className="w-4 h-4"/></button>
                    </div>
                </div>
                <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Nhà Thầu / Cung Cấp *</label>
                    <input value={formData.supplier || ''} onChange={e => handleInputChange('supplier', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold focus:ring-1 ring-teal-500 outline-none text-[11px] h-9 uppercase shadow-inner" placeholder="Tên đơn vị..."/>
                </div>
                <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Địa chỉ gia công</label>
                    <input value={formData.supplierAddress || ''} onChange={e => handleInputChange('supplierAddress', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-9 shadow-inner" placeholder="Vị trí..."/>
                </div>
                <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Ngày kiểm tra *</label>
                    <input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold outline-none text-[11px] h-9 shadow-inner"/>
                </div>
            </div>

            {/* Evidence Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-50">
                <div className="space-y-1.5 bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                    <label className="text-[8px] font-black text-blue-600 uppercase flex items-center justify-between">ẢNH HIỆN TRƯỜNG<div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'MAIN' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-blue-600" type="button"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => { setActiveUploadContext({ type: 'MAIN' }); fileInputRef.current?.click(); }} className="p-1 hover:text-blue-600" type="button"><ImageIcon className="w-3.5 h-3.5"/></button></div></label>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">{formData.images?.map((img, i) => (<img key={i} src={img} className="w-10 h-10 rounded border border-slate-200 object-cover shrink-0" onClick={() => handleEditImage(formData.images!, i, { type: 'MAIN' })} />))}</div>
                </div>
                <div className="space-y-1.5 bg-slate-50/50 p-2 rounded-xl border border-slate-100"><label className="text-[8px] font-black text-indigo-600 uppercase flex items-center justify-between">PHIẾU GIAO HÀNG<div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); fileInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><ImageIcon className="w-3.5 h-3.5"/></button></div></label><div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">{formData.deliveryNoteImages?.map((img, i) => (<img key={i} src={img} className="w-10 h-10 rounded border border-slate-200 object-cover shrink-0" onClick={() => handleEditImage(formData.deliveryNoteImages!, i, { type: 'DELIVERY' })} />))}</div></div>
                <div className="space-y-1.5 bg-slate-50/50 p-2 rounded-xl border border-slate-100"><label className="text-[8px] font-black text-emerald-600 uppercase flex items-center justify-between">BÁO CÁO NCC<div className="flex gap-1"><button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-emerald-600" type="button"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); fileInputRef.current?.click(); }} className="p-1 hover:text-emerald-600" type="button"><ImageIcon className="w-3.5 h-3.5"/></button></div></label><div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[40px]">{formData.reportImages?.map((img, i) => (<img key={i} src={img} className="w-10 h-10 rounded border border-slate-200 object-cover shrink-0" onClick={() => handleEditImage(formData.reportImages!, i, { type: 'REPORT' })} />))}</div></div>
            </div>

            {/* DANH MỤC TÀI LIỆU HỖ TRỢ */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
                <h3 className="text-slate-700 font-bold uppercase tracking-widest flex items-center gap-2 text-[10px]"><FileCheck className="w-3.5 h-3.5 text-blue-500"/> DANH MỤC TÀI LIỆU HỖ TRỢ</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {(formData.supportingDocs || []).map(doc => (
                        <button key={doc.id} onClick={() => toggleDoc(doc.id)} className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all text-left ${doc.verified ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400'}`} type="button">
                            {doc.verified ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" />}
                            <span className="text-[9px] font-bold uppercase leading-tight">{doc.name}</span>
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 pt-2 max-w-2xl">
                    <input value={newDocName} onChange={e => setNewDocName(e.target.value)} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 ring-blue-100 shadow-inner" placeholder="Thêm tài liệu hỗ trợ khác..."/>
                    <button onClick={addCustomDoc} className="px-5 py-2 bg-slate-800 text-white rounded-lg text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-md">Thêm</button>
                </div>
            </div>
        </section>

        {/* II. DANH MỤC VẬT TƯ GIA CÔNG */}
        <section className="space-y-3">
            <div className="flex justify-between items-center px-1">
                <h3 className="font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2 text-xs"><ClipboardList className="w-4 h-4 text-teal-600"/> II. DANH MỤC VẬT TƯ GIA CÔNG ({formData.materials?.length || 0})</h3>
                <button onClick={handleAddMaterial} className="bg-teal-600 text-white p-1.5 rounded-lg shadow active:scale-95 transition-all flex items-center gap-1.5 px-4 hover:bg-teal-700" type="button"><Plus className="w-3.5 h-3.5"/> <span className="text-[10px] font-bold uppercase">Thêm Vật Tư</span></button>
            </div>
            
            <div className="space-y-3">
                {(formData.materials || []).map((mat, matIdx) => {
                    const isExp = expandedMaterial === mat.id;
                    const passRate = mat.inspectQty > 0 ? ((mat.passQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                    
                    // Logic tính toán Nhãn trạng thái
                    const hasFail = mat.items?.some(it => it.status === CheckStatus.FAIL);
                    const hasCond = mat.items?.some(it => it.status === CheckStatus.CONDITIONAL);
                    const allPass = (mat.items?.length || 0) > 0 && mat.items?.every(it => it.status === CheckStatus.PASS);
                    
                    return (
                    <div key={mat.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${isExp ? 'bg-teal-50/50 border-b border-teal-100' : 'bg-white hover:bg-slate-50'}`} onClick={() => setExpandedMaterial(isExp ? null : mat.id)}>
                            <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm ${isExp ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{matIdx + 1}</div>
                                <div className="flex-1 overflow-hidden">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-slate-800 uppercase tracking-tight truncate text-xs">{mat.name || 'HẠNG MỤC MỚI'}</h4>
                                        <div className="flex gap-1 shrink-0">
                                            {allPass && <span className="bg-green-600 text-white px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5"/> ĐẠT</span>}
                                            {hasFail && <span className="bg-red-600 text-white px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1 animate-pulse"><AlertTriangle className="w-2.5 h-2.5"/> NCR</span>}
                                            {hasCond && <span className="bg-amber-500 text-white px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1"><Info className="w-2.5 h-2.5"/> CĐK</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5"><span className="text-[9px] font-bold text-slate-500 uppercase bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">SL: {mat.deliveryQty} {mat.unit}</span><span className="text-[9px] font-bold text-green-600 uppercase border border-green-200 bg-green-50 px-1.5 py-0.5 rounded">{passRate}% ĐẠT</span></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); if(window.confirm("Xóa mục này?")) setFormData(prev => ({ ...prev, materials: prev.materials?.filter((_, i) => i !== matIdx) })); }} className="p-1.5 text-slate-300 hover:text-red-600 rounded-md" type="button"><Trash2 className="w-4 h-4"/></button>
                                {isExp ? <ChevronUp className="w-4 h-4 text-teal-500"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                            </div>
                        </div>
                        {isExp && (
                            <div className="p-4 space-y-4 bg-white border-t border-slate-50">
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                  <div className="md:col-span-3">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Chủng loại</label>
                                      <select value={mat.category || ''} onChange={e => updateMaterial(matIdx, 'category', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold outline-none text-[11px] h-9 bg-white shadow-sm">
                                          <option value="">-- Chọn --</option>
                                          {sqcGroups.map(g => <option key={g} value={g}>{g}</option>)}
                                      </select>
                                  </div>
                                  <div className="md:col-span-2">
                                      <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-1">Loại kiểm</label>
                                      <select value={mat.inspectType || '100%'} onChange={e => updateMaterial(matIdx, 'inspectType', e.target.value as any)} className="w-full px-2 py-1.5 border border-blue-300 rounded-lg font-black text-[11px] h-9 bg-white outline-none text-blue-700 shadow-sm">
                                          <option value="100%">100%</option>
                                          <option value="AQL">AQL</option>
                                      </select>
                                  </div>
                                  <div className="md:col-span-7">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Tên Vật Tư Gia Công *</label>
                                      <input value={mat.name} onChange={e => updateMaterial(matIdx, 'name', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold focus:ring-1 ring-teal-500 outline-none text-xs shadow-sm uppercase" placeholder="Tên sản phẩm..."/>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-inner">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase block text-center">SL Giao(DN)</label>
                                        <input type="number" step="any" value={mat.deliveryQty} onChange={e => updateMaterial(matIdx, 'deliveryQty', e.target.value)} className="w-full px-2 py-1 border border-slate-300 rounded-md font-bold text-center bg-white text-[11px] h-9 shadow-sm"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase block text-center">ĐVT</label>
                                        <div className="relative">
                                            <input 
                                                list="unit-list" 
                                                value={mat.unit} 
                                                onChange={e => updateMaterial(matIdx, 'unit', e.target.value.toUpperCase())} 
                                                className="w-full px-2 py-1 border border-slate-300 rounded-md font-black text-center bg-white text-[11px] h-9 shadow-sm uppercase" 
                                                placeholder="Tìm/Thêm..."
                                            />
                                            <datalist id="unit-list">
                                                {UNIT_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                                            </datalist>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-teal-600 uppercase block text-center">SL Kiểm tra</label>
                                        <input type="number" step="any" value={mat.inspectQty} onChange={e => updateMaterial(matIdx, 'inspectQty', e.target.value)} className="w-full px-2 py-1 border border-teal-300 rounded-md font-bold text-center bg-white text-[11px] h-9 shadow-sm text-teal-700"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-green-600 uppercase block text-center">SL Đạt</label>
                                        <input type="number" step="any" value={mat.passQty} onChange={e => updateMaterial(matIdx, 'passQty', e.target.value)} className="w-full px-2 py-1 border border-green-300 rounded-md font-bold text-center text-green-700 bg-white text-[11px] h-9 shadow-sm"/>
                                    </div>
                                </div>

                                <div className="space-y-2 mt-4">
                                    {mat.items?.map((item, itemIdx) => (
                                        <div key={item.id} className={`bg-white border rounded-xl p-3 shadow-sm transition-all ${item.status === CheckStatus.PASS ? 'border-green-100' : item.status === CheckStatus.FAIL ? 'border-red-100' : 'border-slate-100'}`}>
                                            <div className="flex justify-between items-start gap-3 mb-2">
                                                <p className="font-bold text-slate-800 uppercase tracking-tight text-[11px]">{item.label}</p>
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
                                            </div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <input value={item.notes || ''} onChange={(e) => updateMaterialItem(matIdx, itemIdx, 'notes', e.target.value)} className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] h-8 outline-none focus:bg-white" placeholder="Ghi chú kết quả..."/>
                                                <div className="flex gap-1.5 shrink-0">
                                                    <button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); cameraInputRef.current?.click(); }} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 hover:text-teal-600 active:scale-95" type="button"><Camera className="w-4 h-4" /></button>
                                                    <button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); fileInputRef.current?.click(); }} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 hover:text-teal-600 active:scale-95" type="button"><ImageIcon className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 overflow-x-auto no-scrollbar min-h-[40px]">
                                                {item.images?.map((img, i) => (
                                                    <img key={i} src={img} className="w-12 h-12 rounded-lg border border-slate-200 object-cover shrink-0 cursor-zoom-in shadow-sm" onClick={() => handleEditImage(item.images!, i, { type: 'ITEM', matIdx, itemIdx })} />
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

        {/* III. XÁC NHẬN */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-teal-800 border-b border-teal-50 pb-2 mb-1 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><PenTool className="w-4 h-4"/> III. XÁC NHẬN BÁO CÁO</h3>
            <textarea value={formData.summary} onChange={e => handleInputChange('summary', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:bg-white h-24 resize-none text-[11px] shadow-inner" placeholder="Nhập ghi chú / nhận xét tổng quát của QC..."/>
            <div className="pt-2">
                <SignaturePad label={`QC Ký Tên (${user.name})`} value={formData.signature} onChange={sig => setFormData({...formData, signature: sig})} />
            </div>
        </section>
      </div>

      <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center justify-between gap-3 sticky bottom-0 z-40 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
        <button onClick={onCancel} className="h-[44px] px-6 text-slate-500 font-bold uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all border border-slate-200 text-[10px]" type="button">HỦY BỎ</button>
        <button onClick={handleSubmit} disabled={isSaving || isProcessingImages} className="h-[44px] flex-1 bg-teal-700 text-white font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-teal-800 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 text-[10px] transition-all" type="button">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            <span>GỬI DUYỆT SQC-VT</span>
        </button>
      </div>

      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { handleInputChange('po_number', data); setShowScanner(false); }} />}
      {editorState && <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} onSave={onImageSave} readOnly={false}/>}
      
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
    </div>
  );
};
