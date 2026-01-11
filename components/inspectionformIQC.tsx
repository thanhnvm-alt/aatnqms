
import React, { useState, useRef, useEffect } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, MaterialIQC, ModuleId } from '../types';
import { Save, X, Box, FileText, QrCode, Loader2, Building2, UserCheck, Calendar, CheckSquare, Square, PenTool, Eraser, Plus, Trash2, Camera, Image as ImageIcon, ClipboardList, Info, ChevronDown, ChevronUp, Calculator, TrendingUp, Search, Layers, Tag, Sparkles } from 'lucide-react';
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
                <label className="text-slate-700 font-black uppercase text-[12px] tracking-widest">{label}</label>
                {!readOnly && <button onClick={clear} className="text-[12px] font-bold text-red-600 uppercase flex items-center gap-1 hover:underline" type="button"><Eraser className="w-3 h-3" /> Xóa</button>}
            </div>
            <div className="border border-slate-300 rounded-2xl bg-white overflow-hidden relative h-32 shadow-inner">
                <canvas ref={canvasRef} width={400} height={128} className="w-full h-full touch-none cursor-crosshair" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                {!value && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[12px] uppercase font-bold tracking-widest">Ký xác nhận</div>}
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
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12px' }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-5 no-scrollbar text-[12px] pb-28">
        {/* I. General Information */}
        <section className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-blue-700 border-b border-blue-50 pb-2 font-black text-[12px] uppercase tracking-widest flex items-center gap-2"><Box className="w-4 h-4"/> I. THÔNG TIN QUẢN LÝ PO</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Mã PO (Purchase Order) *</label>
                    <div className="relative flex items-center">
                        <input value={formData.po_number} onChange={e => handleInputChange('po_number', e.target.value.toUpperCase())} className="w-full p-2.5 pr-10 border border-slate-200 rounded-xl focus:ring-2 ring-blue-100 outline-none font-bold text-[12px] shadow-inner" placeholder="Nhập mã PO..."/>
                        <button onClick={() => setShowScanner(true)} className="absolute right-2 p-1.5 text-slate-400 hover:text-blue-600" type="button"><QrCode className="w-5 h-5"/></button>
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Nhà Cung Cấp (Supplier) *</label>
                    <div className="relative flex items-center">
                        <input value={formData.supplier || ''} onChange={e => handleInputChange('supplier', e.target.value)} className="w-full p-2.5 pl-9 border border-slate-200 rounded-xl font-bold text-[12px] focus:ring-2 ring-blue-100 outline-none shadow-inner" placeholder="Tên nhà cung cấp..."/>
                        <Building2 className="absolute left-3 w-4 h-4 text-slate-400" />
                    </div>
                </div>
            </div>
        </section>

        {/* II. Materials Details */}
        <section className="space-y-3">
            <div className="flex justify-between items-center px-1">
                <h3 className="font-black text-slate-700 text-[12px] uppercase tracking-widest flex items-center gap-2"><ClipboardList className="w-4 h-4 text-blue-600"/> II. CHI TIẾT VẬT TƯ ({formData.materials?.length || 0})</h3>
                <button onClick={handleAddMaterial} className="bg-blue-600 text-white p-1.5 rounded-lg shadow-lg active:scale-90 transition-all flex items-center gap-2 px-3" type="button">
                    <Plus className="w-4 h-4"/>
                    <span className="text-[11px] font-black uppercase">Thêm</span>
                </button>
            </div>
            
            <div className="space-y-3">
                {(formData.materials || []).map((mat, matIdx) => {
                    const isExp = expandedMaterial === mat.id;
                    return (
                    <div key={mat.id} className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in zoom-in duration-200">
                        <div 
                            className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${isExp ? 'bg-blue-50/50 border-b border-blue-100' : 'bg-white'}`}
                            onClick={() => setExpandedMaterial(isExp ? null : mat.id)}
                        >
                            <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 shadow-sm ${isExp ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {matIdx + 1}
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <h4 className="font-black text-[12px] text-slate-800 uppercase tracking-tight truncate">{mat.name || 'VẬT TƯ MỚI'}</h4>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter truncate">Giao: {mat.deliveryQty} {mat.unit}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); if(window.confirm("Xóa vật tư này?")) setFormData(prev => ({ ...prev, materials: prev.materials?.filter((_, i) => i !== matIdx) })); }} className="p-2 text-slate-300 hover:text-red-500 transition-colors" type="button"><Trash2 className="w-4.5 h-4.5"/></button>
                                {isExp ? <ChevronUp className="w-5 h-5 text-blue-500"/> : <ChevronDown className="w-5 h-5 text-slate-400"/>}
                            </div>
                        </div>

                        {isExp && (
                            <div className="p-4 space-y-4 bg-white">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên Vật Tư *</label>
                                    <input value={mat.name} onChange={e => updateMaterial(matIdx, 'name', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg font-bold text-[12px] focus:ring-2 ring-blue-100 outline-none shadow-inner" placeholder="Tên vật liệu..."/>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-2">
                                    <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Giao</label><input type="number" value={mat.deliveryQty} onChange={e => updateMaterial(matIdx, 'deliveryQty', Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-lg text-[12px] font-black shadow-inner"/></div>
                                    <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ĐVT</label><input value={mat.unit} onChange={e => updateMaterial(matIdx, 'unit', e.target.value.toUpperCase())} className="w-full p-2 border border-slate-200 rounded-lg text-[12px] font-black uppercase shadow-inner"/></div>
                                </div>

                                <div className="space-y-2 mt-4">
                                    {(mat.items || []).map((item, itemIdx) => (
                                        <div key={item.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-3 shadow-sm group">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">{item.category}</span>
                                                    <p className="text-[12px] font-black text-slate-700 uppercase tracking-tight leading-snug">{item.label}</p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <div className="flex bg-white p-1 rounded-xl gap-1 border border-slate-200 shadow-sm w-fit">
                                                        {[CheckStatus.PASS, CheckStatus.FAIL].map(st => (
                                                            <button 
                                                                key={st} 
                                                                onClick={() => updateMaterialItem(matIdx, itemIdx, 'status', st)}
                                                                className={`px-4 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-md' : 'bg-red-600 text-white shadow-md') : 'text-slate-400'}`}
                                                                type="button"
                                                            >
                                                                {st}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="flex items-center gap-1 ml-auto">
                                                        <div className="relative p-2 bg-white border border-slate-200 rounded-xl text-slate-400 active:text-blue-600 shadow-sm active:scale-90">
                                                            <Camera className="w-4.5 h-4.5" />
                                                            <input type="file" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={e => handleImageUpload(e, matIdx, itemIdx)} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <input 
                                                value={item.notes || ''} 
                                                onChange={(e) => updateMaterialItem(matIdx, itemIdx, 'notes', e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[12px] font-medium outline-none shadow-inner"
                                                placeholder="Ghi chú kết quả..."
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );})}
            </div>
        </section>

        {/* III. QC Signature */}
        <section className="bg-white p-5 rounded-[2.5rem] border border-slate-200 shadow-sm mt-2">
            <h3 className="text-blue-700 border-b border-blue-50 pb-3 mb-4 font-black text-[12px] uppercase tracking-widest flex items-center gap-2"><PenTool className="w-4 h-4"/> III. XÁC NHẬN QC</h3>
            <SignaturePad label={`QC Ký Tên (${user.name})`} value={formData.signature} onChange={sig => setFormData({...formData, signature: sig})} />
        </section>
      </div>

      <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between gap-4 sticky bottom-0 z-40 shadow-[0_-10px_25px_rgba(0,0,0,0.05)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <button 
            onClick={onCancel} 
            className="px-6 py-3 text-slate-500 font-black uppercase text-[12px] tracking-widest hover:bg-slate-50 rounded-xl transition-all active:scale-95" 
            type="button"
        >
            HỦY BỎ
        </button>
        <button 
            onClick={handleSubmit} 
            disabled={isSaving} 
            className="flex-1 py-4 bg-blue-700 text-white font-black uppercase text-[12px] tracking-[0.1em] rounded-2xl shadow-2xl shadow-blue-500/30 hover:bg-blue-800 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50" 
            type="button"
        >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
            <span>GỬI PHÊ DUYỆT IQC</span>
        </button>
      </div>
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { handleInputChange('po_number', data); setShowScanner(false); }} />}
    </div>
  );
};
