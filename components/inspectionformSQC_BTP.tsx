
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, MaterialIQC, ModuleId, DefectLibraryItem } from '../types';
import { 
  Save, X, Box, FileText, QrCode, Loader2, Building2, UserCheck, 
  Calendar, CheckSquare, PenTool, Eraser, Plus, Trash2, 
  Camera, Image as ImageIcon, ClipboardList, ChevronDown, 
  // Added CheckCircle2 to fix Error on line 322: Cannot find name 'CheckCircle2'
  ChevronUp, MessageCircle, History, FileCheck, Search, AlertCircle, MapPin, Locate, CheckCircle2
} from 'lucide-react';
import { fetchProjects, fetchDefectLibrary, saveDefectLibraryItem, fetchPlans } from '../services/apiService';
import { QRScannerModal } from './QRScannerModal';
import { ImageEditorModal } from './ImageEditorModal';
import { GoogleGenAI } from "@google/genai";

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  inspections: Inspection[];
  user: User;
  templates: Record<string, CheckItem[]>;
}

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
      while (dataUrl.length > 130000 && quality > 0.1) { quality -= 0.1; dataUrl = canvas.toDataURL('image/jpeg', quality); }
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

export const InspectionFormSQC_BTP: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, inspections, user, templates }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({
    id: initialData?.id || `SQC-BTP-${Date.now()}`,
    type: 'SQC_BTP' as ModuleId,
    date: new Date().toISOString().split('T')[0],
    status: InspectionStatus.DRAFT,
    materials: initialData?.materials || [],
    referenceDocs: initialData?.referenceDocs || [],
    inspectorName: user.name,
    po_number: initialData?.po_number || '', 
    ma_ct: initialData?.ma_ct || '',        
    supplier: initialData?.supplier || '',
    supplierAddress: initialData?.supplierAddress || '',
    location: initialData?.location || '',
    reportImage: initialData?.reportImage || '',
    deliveryNoteImage: initialData?.deliveryNoteImage || '',
    summary: initialData?.summary || '',
    score: 0,
    items: initialData?.items || [], 
    ...initialData
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);

  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadContext, setActiveUploadContext] = useState<{ type: 'DELIVERY' | 'REPORT' | 'ITEM' | 'MATERIAL', matIdx?: number, itemIdx?: number } | null>(null);

  const btpGroups = useMemo(() => {
      const btpTpl = templates['SQC_BTP'] || [];
      return Array.from(new Set(btpTpl.map(i => i.category))).filter(Boolean).sort();
  }, [templates]);

  const historicalRecords = useMemo(() => {
    if (!inspections || !formData.po_number) return [];
    return inspections.filter(i => i.id !== formData.id && i.po_number === formData.po_number);
  }, [inspections, formData.po_number, formData.id]);

  const handleInputChange = (field: keyof Inspection, value: any) => { setFormData(prev => ({ ...prev, [field]: value })); };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Tọa độ GPS là: ${lat}, ${lng}. Hãy trả về địa chỉ văn bản chính xác nhất tại Việt Nam cho tọa độ này. Chỉ trả về chuỗi văn bản địa chỉ, không thêm giải thích.`,
        });
        if (response.text) {
            handleInputChange('supplierAddress', response.text.trim());
        }
    } catch (e) {
        console.error("AI Reverse Geocoding failed", e);
    }
  };

  const handleGetLocation = () => {
      setIsGettingLocation(true);
      if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
              async (pos) => {
                  const lat = pos.coords.latitude;
                  const lng = pos.coords.longitude;
                  const loc = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                  setFormData(prev => ({ ...prev, location: loc }));
                  await reverseGeocode(lat, lng);
                  setIsGettingLocation(false);
              },
              (err) => {
                  alert("Không thể lấy vị trí GPS. Vui lòng kiểm tra quyền.");
                  setIsGettingLocation(false);
              },
              { enableHighAccuracy: true }
          );
      } else {
          alert("Trình duyệt không hỗ trợ.");
          setIsGettingLocation(false);
      }
  };

  const handleAddMaterial = () => {
    const newMaterial: MaterialIQC = {
        id: `mat-${Date.now()}`,
        name: '',
        category: '',
        scope: 'PROJECT',
        projectCode: formData.ma_ct || '',
        projectName: formData.ten_ct || '',
        orderQty: 0,
        deliveryQty: 0,
        unit: 'PCS',
        criteria: [],
        items: [],
        inspectQty: 0,
        passQty: 0,
        failQty: 0,
        images: [],
        type: '100%',
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
        if (field === 'category') {
            const btpTpl = templates['SQC_BTP'] || [];
            mat.items = btpTpl
                .filter(i => i.category === value)
                .map(i => ({
                    ...i,
                    id: `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    status: CheckStatus.PENDING,
                    notes: '',
                    images: []
                }));
        }
        if (field === 'inspectQty') mat.passQty = Math.max(0, (mat.inspectQty || 0) - (mat.failQty || 0));
        else if (field === 'passQty') mat.failQty = Math.max(0, (mat.inspectQty || 0) - (mat.passQty || 0));
        else if (field === 'failQty') mat.passQty = Math.max(0, (mat.inspectQty || 0) - (mat.failQty || 0));
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
            nextMats[matIdx].items[itemIdx].images = [...(nextMats[matIdx].items[itemIdx].images || []), compressed];
            setFormData(prev => ({ ...prev, materials: nextMats }));
        }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleEditImage = (images: string[], index: number, context: any) => { setEditorState({ images, index, context }); };
  const onImageSave = (idx: number, updatedImg: string) => {
      if (!editorState) return;
      const { type, matIdx, itemIdx } = editorState.context;
      if (type === 'DELIVERY') setFormData(prev => ({ ...prev, deliveryNoteImage: updatedImg }));
      else if (type === 'REPORT') setFormData(prev => ({ ...prev, reportImage: updatedImg }));
      else if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
          const nextMats = [...(formData.materials || [])];
          nextMats[matIdx].items[itemIdx].images![idx] = updatedImg;
          setFormData(prev => ({ ...prev, materials: nextMats }));
      }
  };

  const handleSubmit = async () => {
    if (!formData.po_number || !formData.supplier || !formData.supplierAddress) { alert("Vui lòng nhập đầy đủ Mã LSX, Nhà cung cấp và Địa chỉ gia công."); return; }
    if (!formData.location) { alert("ISO REQUIREMENT: Bắt buộc xác định vị trí GPS tại xưởng đối tác."); return; }
    if (!formData.signature) { alert("QC bắt buộc ký tên."); return; }
    setIsSaving(true);
    try {
        await onSave({ ...formData, status: InspectionStatus.PENDING, updatedAt: new Date().toISOString() } as Inspection);
    } catch (e) { alert("Lỗi lưu SQC-BTP."); } finally { setIsSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative no-scroll-x" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-28">
        
        {/* I. THÔNG TIN QUẢN LÝ GIA CÔNG BTP */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-teal-50 pb-2 mb-1">
                <h3 className="text-teal-800 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><Box className="w-4 h-4"/> I. THÔNG TIN GIA CÔNG BÁN THÀNH PHẨM</h3>
                <button onClick={() => setShowHistory(true)} className="px-2 py-1 bg-slate-100 hover:bg-teal-100 text-slate-600 rounded-lg font-bold uppercase text-[9px] flex items-center gap-1"><History className="w-3 h-3" /> Lịch sử ({historicalRecords.length})</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Lệnh Sản Xuất / PO Gia Công *</label>
                    <div className="relative flex items-center">
                        <input value={formData.po_number} onChange={e => handleInputChange('po_number', e.target.value.toUpperCase())} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-9" placeholder="Mã LSX..."/>
                        <button onClick={() => setShowScanner(true)} className="absolute right-1 p-1 text-slate-400" type="button"><QrCode className="w-4 h-4"/></button>
                    </div>
                </div>
                <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Đối Tác Gia Công BTP *</label>
                    <div className="relative flex items-center">
                        <input value={formData.supplier || ''} onChange={e => handleInputChange('supplier', e.target.value)} className="w-full px-2 py-1.5 pl-8 border border-slate-300 rounded-md font-bold text-[11px] text-slate-800 h-9 uppercase" placeholder="Tên đơn vị..."/>
                        <Building2 className="absolute left-2 w-4 h-4 text-slate-400" />
                    </div>
                </div>
                <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Địa chỉ xưởng gia công *</label>
                    <div className="flex gap-1.5 items-center">
                        <div className="relative flex-1 flex items-center">
                            <input value={formData.supplierAddress || ''} onChange={e => handleInputChange('supplierAddress', e.target.value)} className="w-full px-2 py-1.5 pl-8 border border-slate-300 rounded-md font-bold text-[11px] text-slate-800 h-9" placeholder="Địa chỉ chi tiết..."/>
                            <MapPin className="absolute left-2 w-4 h-4 text-slate-400" />
                        </div>
                        <button 
                            onClick={handleGetLocation} 
                            disabled={isGettingLocation} 
                            className={`p-2.5 rounded-lg border flex items-center justify-center transition-all shadow-sm ${formData.location ? 'bg-teal-600 text-white border-teal-600' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-teal-50'}`} 
                            type="button"
                        >
                            {isGettingLocation ? <Loader2 className="w-4 h-4 animate-spin"/> : <Locate className="w-4 h-4" />}
                        </button>
                    </div>
                    {formData.location && <p className="text-[8px] font-mono text-teal-600 font-bold mt-1 ml-1 flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" /> GPS VERIFIED: {formData.location}</p>}
                </div>
            </div>

            <div><label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Ngày thực hiện</label><input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-9"/></div>

            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-50">
                <div className="space-y-1"><label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">Ảnh Giao Nhận BTP</label>
                    {formData.deliveryNoteImage ? (
                        <div className="relative h-24 rounded-lg overflow-hidden border border-slate-300 group"><img src={formData.deliveryNoteImage} className="w-full h-full object-cover cursor-pointer" onClick={() => handleEditImage([formData.deliveryNoteImage!], 0, { type: 'DELIVERY' })}/><button onClick={() => setFormData({...formData, deliveryNoteImage: ''})} className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded-full"><X className="w-3 h-3"/></button></div>
                    ) : (
                        <div className="flex gap-2 h-9"><button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); cameraInputRef.current?.click(); }} className="flex-1 bg-teal-50 text-teal-600 rounded-md border border-teal-100 flex items-center justify-center"><Camera className="w-4 h-4"/></button><button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); fileInputRef.current?.click(); }} className="flex-1 bg-slate-50 text-slate-500 rounded-md border border-slate-200 flex items-center justify-center"><ImageIcon className="w-4 h-4"/></button></div>
                    )}
                </div>
                <div className="space-y-1"><label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">Ảnh QC Gia Công</label>
                    {formData.reportImage ? (
                        <div className="relative h-24 rounded-lg overflow-hidden border border-slate-300 group"><img src={formData.reportImage} className="w-full h-full object-cover cursor-pointer" onClick={() => handleEditImage([formData.reportImage!], 0, { type: 'REPORT' })}/><button onClick={() => setFormData({...formData, reportImage: ''})} className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded-full"><X className="w-3 h-3"/></button></div>
                    ) : (
                        <div className="flex gap-2 h-9"><button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); cameraInputRef.current?.click(); }} className="flex-1 bg-teal-50 text-teal-600 rounded-md border border-teal-100 flex items-center justify-center"><Camera className="w-4 h-4"/></button><button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); fileInputRef.current?.click(); }} className="flex-1 bg-slate-50 text-slate-500 rounded-md border border-slate-200 flex items-center justify-center"><ImageIcon className="w-4 h-4"/></button></div>
                    )}
                </div>
            </div>
        </section>

        {/* II. Materials Details */}
        <section className="space-y-3">
            <div className="flex justify-between items-center px-1"><h3 className="font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2 text-xs"><ClipboardList className="w-4 h-4 text-teal-600"/> II. DANH MỤC BTP KIỂM TRA ({formData.materials?.length || 0})</h3><button onClick={handleAddMaterial} className="bg-teal-600 text-white p-1.5 rounded-lg shadow active:scale-95 transition-all flex items-center gap-1.5 px-3" type="button"><Plus className="w-3 h-3"/><span className="text-[10px] font-bold uppercase">Thêm BTP</span></button></div>
            <div className="space-y-3">
                {(formData.materials || []).map((mat, matIdx) => {
                    const isExp = expandedMaterial === mat.id;
                    const passRate = mat.inspectQty > 0 ? ((mat.passQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                    return (
                    <div key={mat.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${isExp ? 'bg-teal-50/50 border-b border-teal-100' : 'bg-white'}`} onClick={() => setExpandedMaterial(isExp ? null : mat.id)}>
                            <div className="flex items-center gap-3 flex-1 overflow-hidden"><div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${isExp ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{matIdx + 1}</div><div className="flex-1 overflow-hidden"><h4 className="font-bold text-slate-800 uppercase text-xs truncate">{mat.name || 'BÁN THÀNH PHẨM MỚI'}</h4><div className="flex items-center gap-2 mt-0.5"><span className="text-[9px] font-bold text-slate-500 uppercase bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">SL: {mat.deliveryQty} {mat.unit}</span><span className="text-[9px] font-bold text-green-600 uppercase bg-green-50 px-1.5 py-0.5 rounded border border-green-200">{passRate}% ĐẠT</span></div></div></div>
                            <div className="flex items-center gap-2"><button onClick={(e) => { e.stopPropagation(); if(window.confirm("Xóa?")) setFormData(prev => ({ ...prev, materials: prev.materials?.filter((_, i) => i !== matIdx) })); }} className="p-1.5 text-slate-300 hover:text-red-500 rounded-md" type="button"><Trash2 className="w-4 h-4"/></button>{isExp ? <ChevronUp className="w-4 h-4 text-teal-500"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}</div>
                        </div>
                        {isExp && (
                            <div className="p-4 space-y-4 bg-white">
                                <div className="grid grid-cols-12 gap-3">
                                  <div className="col-span-4"><label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Công đoạn</label><select value={mat.category || ''} onChange={e => updateMaterial(matIdx, 'category', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] text-slate-800 h-8 bg-white"><option value="">-- Chọn --</option>{btpGroups.map(g => <option key={g} value={g}>{g}</option>)}</select></div>
                                  <div className="col-span-8"><label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Tên BTP Gia Công *</label><input value={mat.name} onChange={e => updateMaterial(matIdx, 'name', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold focus:ring-1 ring-teal-500 outline-none text-[11px] h-8" placeholder="Tên BTP..."/></div>
                                </div>
                                <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block text-center">Giao(DN)</label><input type="number" value={mat.deliveryQty} onChange={e => updateMaterial(matIdx, 'deliveryQty', Number(e.target.value))} className="w-full px-2 py-1 border border-slate-300 rounded-md font-bold text-center bg-white text-[11px] h-7"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-teal-600 uppercase tracking-widest block text-center">Kiểm tra</label><input type="number" value={mat.inspectQty} onChange={e => updateMaterial(matIdx, 'inspectQty', Number(e.target.value))} className="w-full px-2 py-1 border border-teal-300 rounded-md font-bold text-center text-teal-700 bg-white text-[11px] h-7"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block text-center">ĐVT</label><input value={mat.unit} onChange={e => updateMaterial(matIdx, 'unit', e.target.value.toUpperCase())} className="w-full px-2 py-1 border border-slate-300 rounded-md text-center uppercase font-bold bg-white text-[11px] h-7"/></div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                     <div className="space-y-1"><div className="flex justify-between items-center px-1"><label className="text-[9px] font-bold text-green-600 uppercase tracking-widest">Đạt (PASS)</label><span className="text-[9px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">{passRate}%</span></div><input type="number" value={mat.passQty} onChange={e => updateMaterial(matIdx, 'passQty', Number(e.target.value))} className="w-full px-2 py-1.5 border border-green-300 rounded-md font-bold text-center text-green-700 bg-green-50/20 text-sm h-9"/></div>
                                     <div className="space-y-1"><div className="flex justify-between items-center px-1"><label className="text-[9px] font-bold text-red-600 uppercase tracking-widest">Lỗi (FAIL)</label><span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">{mat.inspectQty > 0 ? ((mat.failQty / mat.inspectQty) * 100).toFixed(1) : "0.0"}%</span></div><input type="number" value={mat.failQty} onChange={e => updateMaterial(matIdx, 'failQty', Number(e.target.value))} className="w-full px-2 py-1.5 border border-red-300 rounded-md font-bold text-center text-red-700 bg-red-50/20 text-sm h-9"/></div>
                                </div>
                                <div className="space-y-2 mt-3">
                                    {(mat.items || []).map((item, itemIdx) => (
                                        <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-2 group"><p className="font-bold text-slate-800 uppercase tracking-tight text-[11px]">{item.label}</p><div className="flex items-center gap-2 pt-2 border-t border-slate-50 mt-1"><div className="flex bg-slate-100 p-0.5 rounded-lg gap-0.5 border border-slate-200">{[CheckStatus.PASS, CheckStatus.FAIL].map(st => (<button key={st} onClick={() => updateMaterialItem(matIdx, itemIdx, 'status', st)} className={`px-4 py-1.5 rounded-md text-[9px] font-bold uppercase transition-all ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white' : 'bg-red-600 text-white') : 'text-slate-400 hover:bg-white'}`} type="button">{st}</button>))}</div><div className="flex items-center gap-2 ml-auto"><button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); cameraInputRef.current?.click(); }} className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400"><Camera className="w-4 h-4" /></button><button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); fileInputRef.current?.click(); }} className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400"><ImageIcon className="w-4 h-4" /></button></div></div><input value={item.notes || ''} onChange={(e) => updateMaterialItem(matIdx, itemIdx, 'notes', e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] h-8" placeholder="Ghi chú kết quả..."/><div className="flex gap-2 overflow-x-auto no-scrollbar py-1">{(item.images || []).map((img, i) => (<div key={i} className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 shrink-0 group"><img src={img} className="w-full h-full object-cover cursor-pointer" onClick={() => handleEditImage(item.images || [], i, { type: 'ITEM', matIdx, itemIdx })}/><button onClick={() => { const nextMats = [...formData.materials!]; nextMats[matIdx].items[itemIdx].images = nextMats[matIdx].items[itemIdx].images!.filter((_, idx) => idx !== i); setFormData(prev => ({...prev, materials: nextMats})); }} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-2.5 h-2.5" /></button></div>))}</div></div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );})}
            </div>
        </section>

        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mt-2"><h3 className="text-teal-800 border-b border-teal-50 pb-2 mb-4 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><PenTool className="w-4 h-4"/> IV. XÁC NHẬN QC</h3><SignaturePad label={`QC Ký Tên (${user.name})`} value={formData.signature} onChange={sig => setFormData({...formData, signature: sig})} /></section>
      </div>

      <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center justify-between gap-3 sticky bottom-0 z-40 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"><button onClick={onCancel} className="h-[44px] px-6 text-slate-500 font-bold uppercase tracking-widest rounded-xl border border-slate-200 text-[10px]" type="button">HỦY BỎ</button><button onClick={handleSubmit} disabled={isSaving} className="h-[44px] flex-1 bg-teal-700 text-white font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-teal-800 flex items-center justify-center gap-2 disabled:opacity-50 text-[10px]" type="button">{isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}<span>GỬI DUYỆT SQC-BTP</span></button></div>

      {/* History Side Panel */}
      {showHistory && (
          <div className="fixed inset-0 z-[170] flex justify-end">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
              <div className="relative w-full max-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg"><History className="w-4 h-4" /></div>
                          <div>
                              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-tight">Lịch sử kiểm tra</h3>
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
                              <h4 className="font-bold text-slate-800 uppercase line-clamp-1 mb-2 text-xs">LSX: {record.po_number}</h4>
                              <div className="flex items-center justify-between border-t border-slate-50 pt-2">
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500"><UserCheck className="w-3 h-3" /><span>{record.inspectorName}</span></div>
                                  <span className="font-bold text-blue-600 uppercase text-[9px]">{record.materials?.length || 0} MỤC</span>
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
      {editorState && <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} onSave={onImageSave} readOnly={false}/>}
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
    </div>
  );
};
