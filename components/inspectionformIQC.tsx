
import React, { useState, useRef, useEffect } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, MaterialIQC, ModuleId } from '../types';
import { Save, X, Box, FileText, QrCode, Loader2, Building2, UserCheck, Calendar, CheckSquare, Square, PenTool, Eraser, Plus, Trash2, Camera, Image as ImageIcon, ClipboardList, Info, ChevronDown, ChevronUp, Calculator, TrendingUp, Search, Layers, Tag } from 'lucide-react';
import { fetchPlans } from '../services/apiService';
import { QRScannerModal } from './QRScannerModal';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  user: User;
}

const QUICK_DOC_TYPES = ['CO', 'CQ', 'TDS', 'COA', 'Packing List'];

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
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center px-1">
                <label className="text-slate-700 font-black uppercase text-[10px] tracking-widest">{label}</label>
                {!readOnly && <button onClick={clear} className="text-[10px] font-bold text-red-600 uppercase flex items-center gap-1 hover:underline" type="button"><Eraser className="w-3 h-3" /> Xóa</button>}
            </div>
            <div className="border border-slate-300 rounded-2xl bg-white overflow-hidden relative h-32 shadow-inner">
                <canvas ref={canvasRef} width={400} height={128} className="w-full h-full touch-none cursor-crosshair" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                {!value && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] uppercase font-bold tracking-widest">Ký xác nhận</div>}
            </div>
        </div>
    );
};

export const InspectionFormIQC: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, user }) => {
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
    score: 0,
    items: initialData?.items || [], 
    ...initialData
  });

  const [isSaving, setIsSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [customDoc, setCustomDoc] = useState('');

  useEffect(() => {
    if (formData.materials && formData.materials.length > 0) {
        const firstProject = formData.materials.find(m => m.scope === 'PROJECT');
        if (firstProject && firstProject.projectCode) {
            setFormData(prev => ({ ...prev, ma_ct: firstProject.projectCode }));
        } else if (formData.materials.every(m => m.scope === 'COMMON')) {
            setFormData(prev => ({ ...prev, ma_ct: 'DÙNG CHUNG' }));
        }
    }
  }, [formData.materials]);

  const handleInputChange = (field: keyof Inspection, value: any) => { setFormData(prev => ({ ...prev, [field]: value })); };
  
  const addDoc = (doc: string) => {
    const trimmed = doc.trim();
    if (!trimmed) return;
    setFormData(prev => {
        const current = prev.referenceDocs || [];
        if (current.includes(trimmed)) return prev;
        return { ...prev, referenceDocs: [...current, trimmed] };
    });
    setCustomDoc('');
  };

  const removeDoc = (doc: string) => {
    setFormData(prev => ({
        ...prev,
        referenceDocs: (prev.referenceDocs || []).filter(d => d !== doc)
    }));
  };

  const handleAddMaterial = () => {
    const templateItems = formData.items ? JSON.parse(JSON.stringify(formData.items)) : [];
    const newMaterial: MaterialIQC = {
        id: `mat-${Date.now()}`,
        name: '',
        scope: 'COMMON',
        projectCode: 'DÙNG CHUNG',
        projectName: 'VẬT TƯ KHO TỔNG / DÙNG CHUNG',
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
        
        if (field === 'inspectQty') {
            mat.passQty = Math.max(0, (mat.inspectQty || 0) - (mat.failQty || 0));
        } else if (field === 'passQty') {
            mat.failQty = Math.max(0, (mat.inspectQty || 0) - (mat.passQty || 0));
        } else if (field === 'failQty') {
            mat.passQty = Math.max(0, (mat.inspectQty || 0) - (mat.failQty || 0));
        }

        if (field === 'scope') {
            if (value === 'COMMON') {
                mat.projectCode = 'DÙNG CHUNG';
                mat.projectName = 'VẬT TƯ KHO TỔNG / DÙNG CHUNG';
            } else {
                mat.projectCode = '';
                mat.projectName = '';
            }
        }

        nextMaterials[idx] = mat;
        return { ...prev, materials: nextMaterials };
    });
    
    if (field === 'projectCode' && value && value.length >= 3) {
        lookupProjectForMaterial(idx, value);
    }
  };

  const lookupProjectForMaterial = async (matIdx: number, code: string) => {
    setIsLookupLoading(true);
    try {
        const result = await fetchPlans(code, 1, 5);
        const match = result.items?.find(p => (p.ma_ct || '').toLowerCase() === code.toLowerCase());
        if (match) {
            setFormData(prev => {
                const nextMaterials = [...(prev.materials || [])];
                if (nextMaterials[matIdx]) {
                    nextMaterials[matIdx] = { 
                        ...nextMaterials[matIdx], 
                        projectName: match.ten_ct 
                    };
                }
                return { ...prev, materials: nextMaterials };
            });
        }
    } catch (e) {
        console.error(e);
    } finally {
        setIsLookupLoading(false);
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, matIdx: number, itemIdx?: number) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        const compressed = await resizeImage(reader.result as string);
        const nextMats = [...(formData.materials || [])];
        if (itemIdx !== undefined) {
            const items = [...nextMats[matIdx].items];
            items[itemIdx].images = [...(items[itemIdx].images || []), compressed];
            nextMats[matIdx].items = items;
        } else {
            nextMats[matIdx].images = [...(nextMats[matIdx].images || []), compressed];
        }
        setFormData(prev => ({ ...prev, materials: nextMats }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt' }}>
      <div className="bg-white border-b border-slate-300 shrink-0 flex justify-between items-center px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600" /><div><h2 className="font-black text-[13pt] uppercase tracking-tighter leading-none">IQC FORM</h2><p className="text-[8pt] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Kiểm soát vật liệu đầu vào</p></div></div>
          <button onClick={onCancel} className="p-2 text-slate-500 hover:bg-red-50 rounded-full transition-all" type="button"><X className="w-6 h-6" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar">
        {/* I. General Information */}
        <section className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-5">
            <h3 className="text-blue-700 border-b border-blue-50 pb-2 mb-2 font-black text-xs uppercase tracking-widest flex items-center gap-2"><Box className="w-4 h-4"/> I. THÔNG TIN QUẢN LÝ PO</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Mã PO (Purchase Order) *</label>
                    <div className="relative flex items-center">
                        <input value={formData.po_number} onChange={e => handleInputChange('po_number', e.target.value.toUpperCase())} className="w-full p-2.5 pr-10 border border-slate-200 rounded-xl focus:ring-2 ring-blue-100 outline-none font-bold text-sm shadow-inner" placeholder="Nhập mã PO giao hàng..."/>
                        <button onClick={() => setShowScanner(true)} className="absolute right-2 p-1.5 text-slate-400 hover:text-blue-600" type="button"><QrCode className="w-5 h-5"/></button>
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Nhà Cung Cấp (Supplier) *</label>
                    <div className="relative flex items-center">
                        <input value={formData.supplier || ''} onChange={e => handleInputChange('supplier', e.target.value)} className="w-full p-2.5 pl-9 border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 ring-blue-100 outline-none shadow-inner" placeholder="Tên nhà cung cấp..."/>
                        <Building2 className="absolute left-3 w-4 h-4 text-slate-400" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ngày kiểm lô hàng</label>
                        <input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl font-bold text-sm bg-white shadow-inner"/>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">QC Thực hiện</label>
                        <input value={user.name} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-sm text-slate-500 cursor-not-allowed"/>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tài liệu tham chiếu (CO, CQ, TDS...)</label>
                    <div className="flex flex-col gap-3">
                        <div className="flex gap-2">
                            <input 
                                value={customDoc} 
                                onChange={e => setCustomDoc(e.target.value)}
                                onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); addDoc(customDoc); } }}
                                className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 ring-blue-100 shadow-inner"
                                placeholder="Nhập tên tài liệu khác..."
                            />
                            <button 
                                onClick={() => addDoc(customDoc)} 
                                className="p-2.5 bg-blue-600 text-white rounded-xl active:scale-95 shadow-lg shadow-blue-200"
                                type="button"
                            >
                                <Plus className="w-4 h-4"/>
                            </button>
                        </div>
                        
                        {/* Display selected docs as Tags */}
                        <div className="flex flex-wrap gap-2">
                            {(formData.referenceDocs || []).map(doc => (
                                <span key={doc} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl text-[10px] font-black uppercase shadow-sm animate-in zoom-in-95 duration-200">
                                    <Tag className="w-3 h-3 opacity-50"/> {doc}
                                    <button onClick={() => removeDoc(doc)} className="ml-1 p-0.5 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors" type="button"><X className="w-3 h-3"/></button>
                                </span>
                            ))}
                        </div>

                        {/* Quick Picks */}
                        <div className="flex flex-wrap gap-1.5 border-t border-slate-50 pt-2">
                            {QUICK_DOC_TYPES.map(doc => (
                                <button 
                                    key={doc} 
                                    onClick={() => addDoc(doc)} 
                                    disabled={formData.referenceDocs?.includes(doc)}
                                    className={`px-2 py-1 rounded-lg border text-[8px] font-black uppercase transition-all ${formData.referenceDocs?.includes(doc) ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`} 
                                    type="button"
                                >
                                    + {doc}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* II. Materials List */}
        <section className="space-y-4">
            <div className="flex justify-between items-center border-b border-slate-300 pb-2">
                <h3 className="font-black text-slate-700 text-xs uppercase tracking-[0.2em] flex items-center gap-2"><ClipboardList className="w-4 h-4 text-blue-600"/> II. CHI TIẾT VẬT TƯ ({formData.materials?.length || 0})</h3>
                <button onClick={handleAddMaterial} className="bg-blue-600 text-white p-2 rounded-xl shadow-lg active:scale-90 transition-all flex items-center gap-2 px-4" type="button">
                    <Plus className="w-5 h-5"/>
                    <span className="text-[10px] font-black uppercase">Thêm vật tư</span>
                </button>
            </div>
            
            <div className="space-y-4">
                {(formData.materials || []).map((mat, matIdx) => {
                    const passRate = mat.inspectQty > 0 ? ((mat.passQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                    const failRate = mat.inspectQty > 0 ? ((mat.failQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                    return (
                    <div key={mat.id} className="bg-white rounded-[2rem] border border-slate-200 shadow-md overflow-hidden animate-in zoom-in duration-200">
                        <div 
                            className={`p-5 flex items-center justify-between cursor-pointer transition-colors ${expandedMaterial === mat.id ? 'bg-blue-50/50 border-b border-blue-100' : 'bg-white'}`}
                            onClick={() => setExpandedMaterial(expandedMaterial === mat.id ? null : mat.id)}
                        >
                            <div className="flex items-center gap-4 flex-1">
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-slate-500 shrink-0 shadow-sm ${expandedMaterial === mat.id ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>
                                    {matIdx + 1}
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">{mat.name || 'VẬT TƯ MỚI'}</h4>
                                    <div className="flex items-center gap-3">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Giao: {mat.deliveryQty} {mat.unit}</p>
                                        <div className="flex gap-2">
                                            <span className="text-[9px] font-black text-green-600 uppercase bg-green-50 px-1.5 rounded">{passRate}% Đạt</span>
                                            <span className="text-[9px] font-black text-red-600 uppercase bg-red-50 px-1.5 rounded">{failRate}% Lỗi</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={(e) => { e.stopPropagation(); if(window.confirm("Xóa vật tư này?")) setFormData(prev => ({ ...prev, materials: prev.materials?.filter((_, i) => i !== matIdx) })); }} className="p-2 text-slate-300 hover:text-red-500 transition-colors" type="button"><Trash2 className="w-5 h-5"/></button>
                                {expandedMaterial === mat.id ? <ChevronUp className="w-5 h-5 text-blue-500"/> : <ChevronDown className="w-5 h-5 text-slate-400"/>}
                            </div>
                        </div>

                        {expandedMaterial === mat.id && (
                            <div className="p-5 space-y-6 bg-white">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên Vật Tư *</label>
                                            <input value={mat.name} onChange={e => updateMaterial(matIdx, 'name', e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 ring-blue-100 outline-none shadow-inner" placeholder="Loại vật liệu..."/>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50/50 rounded-2xl border border-slate-100">
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Phạm vi vật tư</label>
                                                <select 
                                                    value={mat.scope} 
                                                    onChange={e => updateMaterial(matIdx, 'scope', e.target.value)}
                                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none shadow-sm"
                                                >
                                                    <option value="COMMON">Dùng chung</option>
                                                    <option value="PROJECT">Theo công trình</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1 animate-in fade-in slide-in-from-left-2 duration-200">
                                                <label className="text-[9px] font-black text-blue-500 uppercase tracking-widest ml-1">Mã Công Trình</label>
                                                <div className="relative">
                                                    <input 
                                                        value={mat.projectCode} 
                                                        onChange={e => updateMaterial(matIdx, 'projectCode', e.target.value.toUpperCase())}
                                                        readOnly={mat.scope === 'COMMON'}
                                                        className={`w-full pl-7 pr-8 py-2 border rounded-lg text-xs font-black outline-none transition-all uppercase ${mat.scope === 'COMMON' ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-white border-blue-200 text-blue-700 focus:ring-2 ring-blue-100'}`}
                                                        placeholder={mat.scope === 'COMMON' ? '---' : 'Nhập mã...'}
                                                    />
                                                    <Search className={`absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${mat.scope === 'COMMON' ? 'text-slate-300' : 'text-blue-300'}`} />
                                                </div>
                                            </div>
                                            {(mat.projectName || mat.projectCode === 'DÙNG CHUNG') && (
                                                <div className="sm:col-span-2 px-3 py-2 bg-blue-50 rounded-xl border border-blue-100">
                                                    <p className="text-[10px] font-bold text-blue-700 uppercase flex items-center gap-2">
                                                        <Layers className="w-3 h-3"/> {mat.projectName}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-3 gap-2">
                                        <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">SL ĐH</label><input type="number" value={mat.orderQty} onChange={e => updateMaterial(matIdx, 'orderQty', Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold shadow-inner"/></div>
                                        <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">SL Giao</label><input type="number" value={mat.deliveryQty} onChange={e => updateMaterial(matIdx, 'deliveryQty', Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold shadow-inner"/></div>
                                        <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">ĐVT</label><input value={mat.unit} onChange={e => updateMaterial(matIdx, 'unit', e.target.value.toUpperCase())} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold uppercase shadow-inner"/></div>
                                    </div>
                                </div>

                                <div className="space-y-4 bg-slate-50/50 p-4 rounded-[1.5rem] border border-slate-100 shadow-inner">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <Calculator className="w-4 h-4 text-blue-500" />
                                            <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Số lượng kiểm tra</h5>
                                        </div>
                                        <select value={mat.type} onChange={e => updateMaterial(matIdx, 'type', e.target.value)} className="bg-white px-2 py-1 border border-slate-200 rounded-lg text-[9px] font-black uppercase outline-none shadow-sm">
                                            <option value="AQL">AQL</option>
                                            <option value="100%">100%</option>
                                        </select>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                                            <div className="flex-1 space-y-1">
                                                <label className="text-[8px] font-black text-blue-500 uppercase ml-1">Kiểm (K)</label>
                                                <input type="number" value={mat.inspectQty} onChange={e => updateMaterial(matIdx, 'inspectQty', Number(e.target.value))} className="w-full p-2.5 bg-blue-50/30 border border-blue-100 rounded-xl text-center text-sm font-black text-blue-700 outline-none"/>
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <div className="flex justify-between items-end px-1"><label className="text-[8px] font-black text-green-600 uppercase">Đạt (Đ)</label><span className="text-[8px] font-black text-green-500">{passRate}%</span></div>
                                                <input type="number" value={mat.passQty} onChange={e => updateMaterial(matIdx, 'passQty', Number(e.target.value))} className="w-full p-2.5 bg-blue-50/30 border border-blue-100 rounded-xl text-center text-sm font-black text-green-700 outline-none"/>
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <div className="flex justify-between items-end px-1"><label className="text-[8px] font-black text-red-600 uppercase">Lỗi (L)</label><span className="text-[8px] font-black text-red-500">{failRate}%</span></div>
                                                <input type="number" value={mat.failQty} onChange={e => updateMaterial(matIdx, 'failQty', Number(e.target.value))} className="w-full p-2.5 bg-blue-50/30 border border-red-100 rounded-xl text-center text-sm font-black text-red-700 outline-none"/>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                                            <div className="flex-1 space-y-1">
                                                <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Ngày kiểm vật tư</label>
                                                <input type="date" value={mat.date} onChange={e => updateMaterial(matIdx, 'date', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-600 outline-none"/>
                                            </div>
                                            <div className="flex flex-col items-center gap-1 shrink-0">
                                                <label className="text-[8px] font-black text-slate-400 uppercase">Ảnh vật tư</label>
                                                <div className="flex gap-1.5 overflow-x-auto no-scrollbar max-w-[120px]">
                                                    <div className="relative w-10 h-10 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center shrink-0 active:scale-90 transition-all cursor-pointer">
                                                        <Camera className="w-4 h-4 text-blue-600" />
                                                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={e => handleImageUpload(e, matIdx)} />
                                                    </div>
                                                    {(mat.images || []).map((img, iIdx) => (
                                                        <div key={iIdx} className="relative w-10 h-10 rounded-lg overflow-hidden border border-slate-200 shrink-0 group">
                                                            <img src={img} className="w-full h-full object-cover" />
                                                            <button onClick={() => { const nextImgs = (mat.images || []).filter((_, i) => i !== iIdx); updateMaterial(matIdx, 'images', nextImgs); }} className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" type="button"><Trash2 className="w-3 h-3"/></button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3 bg-slate-50/50 p-4 rounded-[1.5rem] border border-slate-100 shadow-inner">
                                    <div className="flex items-center gap-2 mb-2">
                                        <ClipboardList className="w-4 h-4 text-indigo-500" />
                                        <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nội dung đánh giá chi tiết</h5>
                                    </div>
                                    <div className="space-y-2">
                                        {(mat.items || []).map((item, itemIdx) => (
                                            <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col gap-4 shadow-sm group">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">{item.category}</span>
                                                        <p className="text-xs font-black text-slate-700 uppercase tracking-tight">{item.label}</p>
                                                    </div>
                                                    <div className="flex bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200 shadow-inner shrink-0 w-fit">
                                                        {[CheckStatus.PASS, CheckStatus.FAIL].map(st => (
                                                            <button 
                                                                key={st} 
                                                                onClick={() => updateMaterialItem(matIdx, itemIdx, 'status', st)}
                                                                className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase transition-all ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-md' : 'bg-red-600 text-white shadow-md') : 'text-slate-400 hover:text-slate-600'}`}
                                                                type="button"
                                                            >
                                                                {st}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-3">
                                                    <input 
                                                        value={item.notes || ''} 
                                                        onChange={e => updateMaterialItem(matIdx, itemIdx, 'notes', e.target.value)}
                                                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-medium outline-none focus:bg-white focus:ring-2 ring-blue-100 transition-all shadow-inner"
                                                        placeholder="Ghi chú kết quả..."
                                                    />
                                                    
                                                    <div className="flex items-center gap-1.5 shrink-0 border-l border-slate-100 pl-3">
                                                        <div className="relative p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-90 cursor-pointer">
                                                            <Camera className="w-4 h-4" />
                                                            <input type="file" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={e => handleImageUpload(e, matIdx, itemIdx)} />
                                                        </div>
                                                        <div className="relative p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm active:scale-90 cursor-pointer">
                                                            <ImageIcon className="w-4 h-4" />
                                                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={e => handleImageUpload(e, matIdx, itemIdx)} />
                                                        </div>
                                                    </div>
                                                </div>

                                                {item.images && item.images.length > 0 && (
                                                    <div className="flex gap-2 overflow-x-auto no-scrollbar pt-1">
                                                        {item.images.map((img, i) => (
                                                            <div key={i} className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-200 shadow-sm shrink-0 group">
                                                                <img src={img} className="w-full h-full object-cover" />
                                                                <button onClick={() => { const nextImgs = (item.images || []).filter((_, idx) => idx !== i); updateMaterialItem(matIdx, itemIdx, 'images', nextImgs); }} className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" type="button"><Trash2 className="w-3 h-3"/></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );})}
            </div>
        </section>

        {/* III. Approvals - ONLY QC Signature for initial submission */}
        <section className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm mt-6 space-y-8">
            <h3 className="text-blue-700 border-b border-blue-50 pb-4 font-black text-xs uppercase tracking-widest flex items-center gap-2"><PenTool className="w-4 h-4"/> III. XÁC NHẬN QC THỰC HIỆN</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <SignaturePad label={`Nhân viên QC ký tên (${user.name})`} value={formData.signature} onChange={sig => setFormData({...formData, signature: sig})} />
                <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 flex flex-col items-center justify-center text-center opacity-60">
                    <Info className="w-10 h-10 text-slate-300 mb-3" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Thông tin phê duyệt</p>
                    <p className="text-[9pt] text-slate-500 mt-2">Chữ ký của QA Manager và PM Dự Án sẽ được ghi nhận sau khi báo cáo được gửi phê duyệt chính thức.</p>
                </div>
            </div>
        </section>
      </div>

      <div className="p-4 md:p-6 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0 shadow-sm z-20">
        <button onClick={onCancel} className="px-8 py-3.5 text-slate-500 font-black uppercase text-xs tracking-widest hover:bg-slate-50 rounded-xl transition-all active:scale-95" type="button">Hủy bỏ</button>
        <button onClick={handleSubmit} disabled={isSaving} className="px-16 py-4 bg-blue-700 text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl shadow-2xl hover:bg-blue-800 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50" type="button">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
            <span>GỬI PHÊ DUYỆT IQC</span>
        </button>
      </div>
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { handleInputChange('po_number', data); setShowScanner(false); }} />}
    </div>
  );
};
