
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, MaterialIQC, ModuleId } from '../types';
import { 
  Save, X, Box, FileText, QrCode, Loader2, Building2, UserCheck, 
  Calendar, CheckSquare, PenTool, Eraser, Plus, Trash2, 
  Camera, Image as ImageIcon, ClipboardList, ChevronDown, 
  ChevronUp, MessageCircle, History, FileCheck
} from 'lucide-react';
import { fetchProjects } from '../services/apiService';
import { QRScannerModal } from './QRScannerModal';
import { ImageEditorModal } from './ImageEditorModal';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  inspections: Inspection[];
  user: User;
}

const PRESET_DOCS = [
    'Bản vẽ (Ký)', 
    'Spec', 
    'Test Report', 
    'Rập/Cỡ (Ký)', 
    'Mẫu màu', 
    'Phiếu đặt mua (PO Detail)', 
    'Mẫu đối chứng'
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
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64Str); return; }
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.7;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > 130000 && quality > 0.1) {
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

export const InspectionFormIQC: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, inspections, user }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({
    id: initialData?.id || `IQC-${Date.now()}`,
    type: 'IQC' as ModuleId,
    date: new Date().toISOString().split('T')[0],
    status: InspectionStatus.DRAFT,
    materials: initialData?.materials || [],
    referenceDocs: initialData?.referenceDocs || [],
    inspectorName: user.name,
    po_number: initialData?.po_number || '', 
    ma_ct: initialData?.ma_ct || '',        
    supplier: initialData?.supplier || '',
    reportImage: initialData?.reportImage || '',
    deliveryNoteImage: initialData?.deliveryNoteImage || '',
    summary: initialData?.summary || '',
    score: 0,
    items: initialData?.items || [], 
    ...initialData
  });

  const [isSaving, setIsSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [customDoc, setCustomDoc] = useState('');
  
  // Image Editing State
  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadContext, setActiveUploadContext] = useState<{ type: 'DELIVERY' | 'REPORT' | 'ITEM' | 'MATERIAL', matIdx?: number, itemIdx?: number } | null>(null);

  const handleInputChange = (field: keyof Inspection, value: any) => { 
    setFormData(prev => ({ ...prev, [field]: value })); 
  };

  const lookupMaterialProject = async (code: string, matIdx: number) => {
    if (!code || code.length < 3) return;
    try {
      const projects = await fetchProjects();
      // Tìm tương đối
      const match = projects.find(p => 
          p.ma_ct.toLowerCase().includes(code.toLowerCase()) || 
          p.code?.toLowerCase().includes(code.toLowerCase())
      );
      if (match) {
        setFormData(prev => {
            const nextMats = [...(prev.materials || [])];
            if (nextMats[matIdx]) {
                nextMats[matIdx].projectName = match.ten_ct;
                // Nếu tìm thấy chính xác, có thể update lại projectCode cho chuẩn
                if (match.ma_ct) nextMats[matIdx].projectCode = match.ma_ct;
            }
            return { ...prev, materials: nextMats };
        });
      }
    } catch (e) {}
  };
  
  const handleAddMaterial = () => {
    const templateItems = formData.items ? JSON.parse(JSON.stringify(formData.items)) : [];
    const newMaterial: MaterialIQC = {
        id: `mat-${Date.now()}`,
        name: '',
        category: '',
        scope: 'COMMON',
        projectCode: 'VẬT TƯ DÙNG CHUNG',
        projectName: 'SỬ DỤNG TẤT CẢ CÔNG TRÌNH',
        orderQty: 0,
        deliveryQty: 0,
        unit: 'PCS',
        criteria: [],
        items: templateItems.map((it: CheckItem) => ({ ...it, images: [] })),
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
        
        let mat = { ...nextMaterials[idx], [field]: value };

        // Logic tự động điền khi thay đổi Scope
        if (field === 'scope') {
            if (value === 'COMMON') {
                mat.projectCode = 'VẬT TƯ DÙNG CHUNG';
                mat.projectName = 'SỬ DỤNG TẤT CẢ CÔNG TRÌNH';
            } else {
                // Reset nếu chuyển sang Project để người dùng nhập
                mat.projectCode = '';
                mat.projectName = '';
            }
        }

        // Logic tính toán số lượng
        if (field === 'inspectQty') mat.passQty = Math.max(0, (mat.inspectQty || 0) - (mat.failQty || 0));
        else if (field === 'passQty') mat.failQty = Math.max(0, (mat.inspectQty || 0) - (mat.passQty || 0));
        else if (field === 'failQty') mat.passQty = Math.max(0, (mat.inspectQty || 0) - (mat.failQty || 0));
        
        // Sync project info back to global if this material is defining the context (Optional)
        if (field === 'projectCode' && idx === 0 && mat.scope === 'PROJECT') prev.ma_ct = value;

        nextMaterials[idx] = mat;
        return { ...prev, materials: nextMaterials };
    });

    // Trigger lookup nếu đang nhập mã dự án
    if (field === 'projectCode' && typeof value === 'string' && value.length >= 3) {
        // Debounce hoặc gọi trực tiếp (ở đây gọi trực tiếp cho đơn giản)
        // Cần check scope trong state cũ hoặc logic trên đã set
        const currentScope = formData.materials?.[idx]?.scope; 
        
        if (currentScope === 'PROJECT') {
            lookupMaterialProject(value, idx);
        }
    }
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUploadContext) return;
    
    const reader = new FileReader();
    reader.onload = async () => {
        const compressed = await resizeImage(reader.result as string);
        const { type, matIdx, itemIdx } = activeUploadContext;

        if (type === 'DELIVERY') setFormData(prev => ({ ...prev, deliveryNoteImage: compressed }));
        else if (type === 'REPORT') setFormData(prev => ({ ...prev, reportImage: compressed }));
        else if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
            const nextMats = [...(formData.materials || [])];
            const items = [...nextMats[matIdx].items];
            items[itemIdx].images = [...(items[itemIdx].images || []), compressed];
            nextMats[matIdx].items = items;
            setFormData(prev => ({ ...prev, materials: nextMats }));
        }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleEditImage = (images: string[], index: number, context: any) => {
      setEditorState({ images, index, context });
  };

  const onImageSave = (idx: number, updatedImg: string) => {
      if (!editorState) return;
      const { type, matIdx, itemIdx } = editorState.context;

      if (type === 'DELIVERY') setFormData(prev => ({ ...prev, deliveryNoteImage: updatedImg }));
      else if (type === 'REPORT') setFormData(prev => ({ ...prev, reportImage: updatedImg }));
      else if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
          const nextMats = [...(formData.materials || [])];
          const items = [...nextMats[matIdx].items];
          const imgs = [...(items[itemIdx].images || [])];
          imgs[idx] = updatedImg;
          items[itemIdx].images = imgs;
          nextMats[matIdx].items = items;
          setFormData(prev => ({ ...prev, materials: nextMats }));
      }
  };

  const toggleDocType = (type: string) => {
      setFormData(prev => {
          const current = prev.referenceDocs || [];
          const next = current.includes(type) ? current.filter(t => t !== type) : [...current, type];
          return { ...prev, referenceDocs: next };
      });
  };

  const addCustomDoc = () => {
      if (customDoc.trim()) {
          toggleDocType(customDoc.trim());
          setCustomDoc('');
      }
  };

  const handleSubmit = async () => {
    if (!formData.po_number || !formData.supplier) { alert("Vui lòng nhập Mã PO và Nhà cung cấp."); return; }
    if (!formData.signature) { alert("Bắt buộc QC phải ký tên xác nhận báo cáo."); return; }
    setIsSaving(true);
    try {
        await onSave({ ...formData, status: InspectionStatus.PENDING, updatedAt: new Date().toISOString() } as Inspection);
    } catch (e) {
        alert("Lỗi hệ thống khi lưu IQC.");
    } finally { setIsSaving(false); }
  };

  const historicalRecords = useMemo(() => {
    if (!inspections || !formData.po_number) return [];
    return inspections.filter(i => i.id !== formData.id && i.po_number === formData.po_number);
  }, [inspections, formData.po_number, formData.id]);

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-28">
        
        {/* I. General Information */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-blue-50 pb-2 mb-1">
                <h3 className="text-blue-800 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><Box className="w-4 h-4"/> I. THÔNG TIN QUẢN LÝ PO</h3>
                <button 
                  onClick={() => setShowHistory(true)}
                  className="px-2 py-1 bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 rounded-lg font-bold uppercase tracking-wide flex items-center gap-1 transition-all shadow-sm text-[9px]"
                  type="button"
                >
                    <History className="w-3 h-3" />
                    Lịch sử ({historicalRecords.length})
                </button>
            </div>
            
            {/* Row 1: PO & Supplier */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Mã PO (Purchase Order) *</label>
                    <div className="relative flex items-center">
                        <input value={formData.po_number} onChange={e => handleInputChange('po_number', e.target.value.toUpperCase())} className="w-full px-2 py-1.5 border border-slate-300 rounded-md focus:ring-1 ring-blue-500 outline-none font-bold text-[11px] text-slate-800 h-8" placeholder="Nhập mã PO..."/>
                        <button onClick={() => setShowScanner(true)} className="absolute right-1 p-1 text-slate-400 hover:text-blue-600" type="button"><QrCode className="w-4 h-4"/></button>
                    </div>
                </div>
                <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Nhà Cung Cấp (Supplier) *</label>
                    <div className="relative flex items-center">
                        <input value={formData.supplier || ''} onChange={e => handleInputChange('supplier', e.target.value)} className="w-full px-2 py-1.5 pl-8 border border-slate-300 rounded-md font-bold focus:ring-1 ring-blue-500 outline-none text-[11px] text-slate-800 h-8" placeholder="Tên nhà cung cấp..."/>
                        <Building2 className="absolute left-2 w-4 h-4 text-slate-400" />
                    </div>
                </div>
            </div>

            {/* Row 2: Date */}
            <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Ngày kiểm tra</label>
                <input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold outline-none text-[11px] text-slate-800 h-8"/>
            </div>

            {/* Row 3: Supporting Docs */}
            <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Tài liệu hỗ trợ</label>
                <div className="flex flex-wrap gap-2 mb-2">
                    {PRESET_DOCS.map(doc => (
                        <button 
                            key={doc}
                            onClick={() => toggleDocType(doc)}
                            className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase border transition-all ${
                                formData.referenceDocs?.includes(doc) 
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-300'
                            }`}
                            type="button"
                        >
                            {doc}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input 
                        value={customDoc} 
                        onChange={e => setCustomDoc(e.target.value)} 
                        className="flex-1 px-2 py-1 border border-slate-300 rounded-md text-[10px] outline-none"
                        placeholder="Nhập tài liệu khác..."
                    />
                    <button onClick={addCustomDoc} className="px-3 py-1 bg-slate-100 border border-slate-300 rounded-md text-[9px] font-bold hover:bg-slate-200" type="button">Thêm</button>
                </div>
            </div>

            {/* Row 4: Images (Delivery & Report) */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-50">
                {/* Delivery Note */}
                <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">Ảnh Phiếu Giao Hàng</label>
                    {formData.deliveryNoteImage ? (
                        <div className="relative h-24 rounded-lg overflow-hidden border border-slate-300 group">
                            <img 
                                src={formData.deliveryNoteImage} 
                                className="w-full h-full object-cover cursor-pointer" 
                                onClick={() => handleEditImage([formData.deliveryNoteImage!], 0, { type: 'DELIVERY' })}
                            />
                            <button onClick={() => setFormData({...formData, deliveryNoteImage: ''})} className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded-full shadow-lg"><X className="w-3 h-3"/></button>
                        </div>
                    ) : (
                        <div className="flex gap-2 h-8">
                            <button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); cameraInputRef.current?.click(); }} className="flex-1 bg-blue-50 text-blue-600 rounded-md border border-blue-100 flex items-center justify-center hover:bg-blue-100"><Camera className="w-4 h-4"/></button>
                            <button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); fileInputRef.current?.click(); }} className="flex-1 bg-slate-50 text-slate-500 rounded-md border border-slate-200 flex items-center justify-center hover:bg-slate-100"><ImageIcon className="w-4 h-4"/></button>
                        </div>
                    )}
                </div>
                {/* IQC Report */}
                <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">Ảnh Phiếu IQC</label>
                    {formData.reportImage ? (
                        <div className="relative h-24 rounded-lg overflow-hidden border border-slate-300 group">
                            <img 
                                src={formData.reportImage} 
                                className="w-full h-full object-cover cursor-pointer"
                                onClick={() => handleEditImage([formData.reportImage!], 0, { type: 'REPORT' })}
                            />
                            <button onClick={() => setFormData({...formData, reportImage: ''})} className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded-full shadow-lg"><X className="w-3 h-3"/></button>
                        </div>
                    ) : (
                        <div className="flex gap-2 h-8">
                            <button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); cameraInputRef.current?.click(); }} className="flex-1 bg-blue-50 text-blue-600 rounded-md border border-blue-100 flex items-center justify-center hover:bg-blue-100"><Camera className="w-4 h-4"/></button>
                            <button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); fileInputRef.current?.click(); }} className="flex-1 bg-slate-50 text-slate-500 rounded-md border border-slate-200 flex items-center justify-center hover:bg-slate-100"><ImageIcon className="w-4 h-4"/></button>
                        </div>
                    )}
                </div>
            </div>
        </section>

        {/* II. Materials Details (Previously III) */}
        <section className="space-y-3">
            <div className="flex justify-between items-center px-1">
                <h3 className="font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2 text-xs"><ClipboardList className="w-4 h-4 text-blue-600"/> II. CHI TIẾT VẬT TƯ ({formData.materials?.length || 0})</h3>
                <button onClick={handleAddMaterial} className="bg-blue-600 text-white p-1.5 rounded-lg shadow active:scale-95 transition-all flex items-center gap-1.5 px-3 hover:bg-blue-700" type="button">
                    <Plus className="w-3 h-3"/>
                    <span className="text-[10px] font-bold uppercase">Thêm Vật Tư</span>
                </button>
            </div>
            
            <div className="space-y-3">
                {(formData.materials || []).map((mat, matIdx) => {
                    const isExp = expandedMaterial === mat.id;
                    const passRate = mat.inspectQty > 0 ? ((mat.passQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                    return (
                    <div key={mat.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in zoom-in duration-200">
                        <div 
                            className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${isExp ? 'bg-blue-50/50 border-b border-blue-100' : 'bg-white hover:bg-slate-50'}`}
                            onClick={() => setExpandedMaterial(isExp ? null : mat.id)}
                        >
                            <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm ${isExp ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {matIdx + 1}
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <h4 className="font-bold text-slate-800 uppercase tracking-tight truncate text-xs">{mat.name || 'VẬT TƯ MỚI'}</h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">DN: {mat.deliveryQty} {mat.unit}</span>
                                        <span className="text-[9px] font-bold text-green-600 uppercase border border-green-200 bg-green-50 px-1.5 py-0.5 rounded">{passRate}% ĐẠT</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); if(window.confirm("Xóa vật tư này?")) setFormData(prev => ({ ...prev, materials: prev.materials?.filter((_, i) => i !== matIdx) })); }} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors hover:bg-red-50 rounded-md" type="button"><Trash2 className="w-4 h-4"/></button>
                                {isExp ? <ChevronUp className="w-4 h-4 text-blue-500"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                            </div>
                        </div>

                        {isExp && (
                            <div className="p-4 space-y-4 bg-white">
                                {/* Row 1: Category & Name - Merged */}
                                <div className="grid grid-cols-12 gap-3">
                                  <div className="col-span-4">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1 block mb-1">Chủng loại vật tư</label>
                                      <input value={mat.category || ''} onChange={e => updateMaterial(matIdx, 'category', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold outline-none text-[11px] text-slate-800 h-8" placeholder="VD: Gỗ, Sơn..."/>
                                  </div>
                                  <div className="col-span-8">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1 block mb-1">Tên Vật Tư *</label>
                                      <input value={mat.name} onChange={e => updateMaterial(matIdx, 'name', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold focus:ring-1 ring-blue-500 outline-none text-[11px] text-slate-800 h-8" placeholder="Tên vật liệu..."/>
                                  </div>
                                </div>

                                {/* Row 2: Scope & Project Code - Merged */}
                                <div className="grid grid-cols-12 gap-3">
                                    <div className="col-span-5">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1 block mb-1">Loại sử dụng *</label>
                                        <div className="relative">
                                            <select 
                                                value={mat.scope} 
                                                onChange={e => updateMaterial(matIdx, 'scope', e.target.value as any)}
                                                className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold focus:ring-1 ring-blue-500 outline-none bg-white text-[11px] text-slate-800 appearance-none h-8"
                                            >
                                                <option value="COMMON">Dùng chung / Tổng kho</option>
                                                <option value="PROJECT">Theo công trình</option>
                                            </select>
                                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div className="col-span-7">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1 block mb-1">Mã Dự Án</label>
                                        <input 
                                            value={mat.projectCode || ''} 
                                            onChange={e => updateMaterial(matIdx, 'projectCode', e.target.value.toUpperCase())} 
                                            className={`w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold outline-none text-[11px] text-slate-800 h-8 ${mat.scope === 'COMMON' ? 'bg-slate-100 text-slate-500' : 'bg-white'}`} 
                                            placeholder="Nhập mã..."
                                            readOnly={mat.scope === 'COMMON'}
                                        />
                                    </div>
                                </div>

                                {/* Row 3: Project Name (Auto-filled or Lookup result) */}
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1 block mb-1">Tên Công Trình</label>
                                    <input 
                                        value={mat.projectName || ''} 
                                        readOnly 
                                        className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold outline-none text-[11px] text-slate-600 h-8 bg-slate-50" 
                                        placeholder="Tên công trình..."
                                    />
                                </div>
                                
                                {/* Row 4: Quantities */}
                                <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block text-center">SL ĐH</label>
                                        <input type="number" value={mat.orderQty || 0} onChange={e => updateMaterial(matIdx, 'orderQty', Number(e.target.value))} className="w-full px-2 py-1 border border-slate-300 rounded-md font-bold text-center bg-white text-[11px] h-7"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block text-center">Giao(DN)</label>
                                        <input type="number" value={mat.deliveryQty} onChange={e => updateMaterial(matIdx, 'deliveryQty', Number(e.target.value))} className="w-full px-2 py-1 border border-slate-300 rounded-md font-bold text-center bg-white text-[11px] h-7"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-blue-600 uppercase tracking-widest block text-center">Kiểm tra</label>
                                        <input type="number" value={mat.inspectQty} onChange={e => updateMaterial(matIdx, 'inspectQty', Number(e.target.value))} className="w-full px-2 py-1 border border-blue-300 rounded-md font-bold text-center text-blue-700 bg-white text-[11px] h-7"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block text-center">ĐVT</label>
                                        <input value={mat.unit} onChange={e => updateMaterial(matIdx, 'unit', e.target.value.toUpperCase())} className="w-full px-2 py-1 border border-slate-300 rounded-md text-center uppercase font-bold bg-white text-[11px] h-7"/>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                     <div className="space-y-1">
                                        <div className="flex justify-between items-center px-1">
                                            <label className="text-[9px] font-bold text-green-600 uppercase tracking-widest">Đạt (PASS)</label>
                                            <span className="text-[9px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">{passRate}%</span>
                                        </div>
                                        <input type="number" value={mat.passQty} onChange={e => updateMaterial(matIdx, 'passQty', Number(e.target.value))} className="w-full px-2 py-1.5 border border-green-300 rounded-md font-bold text-center text-green-700 bg-green-50/20 text-sm shadow-inner h-9"/>
                                     </div>
                                     <div className="space-y-1">
                                        <div className="flex justify-between items-center px-1">
                                            <label className="text-[9px] font-bold text-red-600 uppercase tracking-widest">Lỗi (FAIL)</label>
                                            <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">{mat.inspectQty > 0 ? ((mat.failQty / mat.inspectQty) * 100).toFixed(1) : "0.0"}%</span>
                                        </div>
                                        <input type="number" value={mat.failQty} onChange={e => updateMaterial(matIdx, 'failQty', Number(e.target.value))} className="w-full px-2 py-1.5 border border-red-300 rounded-md font-bold text-center text-red-700 bg-red-50/20 text-sm shadow-inner h-9"/>
                                     </div>
                                </div>

                                <div className="space-y-2 mt-3">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">Tiêu chí kiểm soát</label>
                                    {(mat.items || []).map((item, itemIdx) => (
                                        <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-2 hover:border-blue-300 transition-colors group">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5 bg-slate-50 w-fit px-1.5 py-0.5 rounded border border-slate-100">{item.category}</span>
                                                    <p className="font-bold text-slate-800 uppercase tracking-tight leading-snug text-xs">{item.label}</p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0 pt-1.5 border-t border-slate-50">
                                                    <div className="flex bg-slate-100 p-0.5 rounded-lg gap-0.5 border border-slate-200">
                                                        {[CheckStatus.PASS, CheckStatus.FAIL].map(st => (
                                                            <button 
                                                                key={st} 
                                                                onClick={() => updateMaterialItem(matIdx, itemIdx, 'status', st)}
                                                                className={`px-3 py-1 rounded-md text-[9px] font-bold uppercase transition-all ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-sm' : 'bg-red-600 text-white shadow-sm') : 'text-slate-400 hover:bg-white'}`}
                                                                type="button"
                                                            >
                                                                {st}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="flex items-center gap-2 ml-auto">
                                                        <button 
                                                            onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); cameraInputRef.current?.click(); }}
                                                            className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-blue-600 active:scale-90 transition-all shadow-sm"
                                                        >
                                                            <Camera className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); fileInputRef.current?.click(); }}
                                                            className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-blue-600 active:scale-90 transition-all shadow-sm"
                                                        >
                                                            <ImageIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            <input 
                                                value={item.notes || ''} 
                                                onChange={(e) => updateMaterialItem(matIdx, itemIdx, 'notes', e.target.value)}
                                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-400 h-8"
                                                placeholder="Ghi chú kết quả..."
                                            />
                                            {item.images && item.images.length > 0 && (
                                                <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                                                    {item.images.map((img, i) => (
                                                        <div key={i} className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 shrink-0 group">
                                                            <img 
                                                                src={img} 
                                                                className="w-full h-full object-cover cursor-pointer"
                                                                onClick={() => handleEditImage(item.images || [], i, { type: 'ITEM', matIdx, itemIdx })}
                                                            />
                                                            <button 
                                                                onClick={() => {
                                                                    const nextMats = [...formData.materials!];
                                                                    const nextImgs = nextMats[matIdx].items[itemIdx].images!.filter((_, idx) => idx !== i);
                                                                    nextMats[matIdx].items[itemIdx].images = nextImgs;
                                                                    setFormData(prev => ({...prev, materials: nextMats}));
                                                                }}
                                                                className="absolute top-0 right-0 bg-red-500 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );})}
            </div>
        </section>

        {/* IV. Ghi chú tổng quát */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <h3 className="text-blue-800 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><MessageCircle className="w-4 h-4"/> III. GHI CHÚ / TỔNG KẾT IQC</h3>
            <textarea 
                value={formData.summary}
                onChange={e => handleInputChange('summary', e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 outline-none focus:bg-white focus:ring-1 ring-blue-500 transition-all resize-none min-h-[80px] text-[11px] leading-relaxed"
                placeholder="Nhập nhận xét tổng quan về lô hàng..."
            />
        </section>

        {/* V. QC Signature */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mt-2">
            <h3 className="text-blue-800 border-b border-blue-50 pb-2 mb-4 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><PenTool className="w-4 h-4"/> IV. XÁC NHẬN QC</h3>
            <SignaturePad label={`QC Ký Tên (${user.name})`} value={formData.signature} onChange={sig => setFormData({...formData, signature: sig})} />
        </section>
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center justify-between gap-3 sticky bottom-0 z-40 shadow-[0_-5px_15px_rgba(0,0,0,0.03)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <button 
            onClick={onCancel} 
            className="h-[44px] px-6 text-slate-500 font-bold uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all active:scale-95 border border-slate-200 flex items-center justify-center text-[10px]" 
            type="button"
        >
            HỦY BỎ
        </button>
        <button 
            onClick={handleSubmit} 
            disabled={isSaving} 
            className="h-[44px] flex-1 bg-blue-700 text-white font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-blue-500/20 hover:bg-blue-800 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-[10px]" 
            type="button"
        >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            <span>GỬI DUYỆT IQC</span>
        </button>
      </div>

      {/* Hidden Inputs for File Upload */}
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />

      {/* History Side Panel */}
      {showHistory && (
          <div className="fixed inset-0 z-[170] flex justify-end">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
              <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg"><History className="w-4 h-4" /></div>
                          <div>
                              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-tight">Lịch sử kiểm tra PO</h3>
                              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">{formData.po_number || 'TRỐNG'}</p>
                          </div>
                      </div>
                      <button onClick={() => setShowHistory(false)} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-full transition-all"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                      {historicalRecords.length > 0 ? historicalRecords.map((record) => (
                          <div key={record.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:border-blue-300 transition-all">
                              <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500"><Calendar className="w-3 h-3 text-blue-500" /><span>{record.date}</span></div>
                                  <span className={`font-bold px-2 py-0.5 rounded-full border uppercase text-[8px] ${record.status === InspectionStatus.APPROVED ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>{record.status}</span>
                              </div>
                              <h4 className="font-bold text-slate-800 uppercase line-clamp-1 mb-2 text-xs">PO: {record.po_number}</h4>
                              <div className="flex items-center justify-between border-t border-slate-50 pt-2">
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500"><UserCheck className="w-3 h-3" /><span>{record.inspectorName}</span></div>
                                  <span className="font-bold text-blue-600 uppercase text-[9px]">{record.materials?.length || 0} VẬT TƯ</span>
                              </div>
                          </div>
                      )) : (
                          <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                              <History className="w-12 h-12 opacity-10 mb-4" />
                              <p className="font-bold uppercase tracking-widest text-[10px]">Không có bản ghi cũ</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { handleInputChange('po_number', data); setShowScanner(false); }} />}
      
      {editorState && (
          <ImageEditorModal 
              images={editorState.images} 
              initialIndex={editorState.index} 
              onClose={() => setEditorState(null)} 
              onSave={onImageSave}
              readOnly={false}
          />
      )}
    </div>
  );
};
