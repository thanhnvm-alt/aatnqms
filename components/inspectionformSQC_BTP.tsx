
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, MaterialIQC, ModuleId, DefectLibraryItem } from '../types';
import { 
  Save, X, Box, FileText, QrCode, Loader2, Building2, UserCheck, 
  Calendar, CheckSquare, PenTool, Eraser, Plus, Trash2, 
  Camera, Image as ImageIcon, ClipboardList, ChevronDown, 
  ChevronUp, MessageCircle, History, FileCheck, Search, AlertCircle, MapPin, Locate, CheckCircle2,
  AlertTriangle, AlertOctagon
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
                {!readOnly && <button onClick={clear} className="text-[9px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1 hover:underline" type="button"><Eraser className="w-3 h-3" /> Xóa ký lại</button>}
            </div>
            <div className="border border-slate-300 rounded-xl bg-white overflow-hidden relative h-28 shadow-sm">
                <canvas ref={canvasRef} width={400} height={112} className={`w-full h-full ${readOnly ? 'cursor-default' : 'cursor-crosshair touch-none'}`} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                {!value && !readOnly && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] uppercase font-bold tracking-widest">Ký xác nhận</div>}
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
    reportImages: initialData?.reportImages || (initialData?.reportImage ? [initialData.reportImage] : []),
    deliveryNoteImage: initialData?.deliveryNoteImage || '',
    deliveryNoteImages: initialData?.deliveryNoteImages || (initialData?.deliveryNoteImage ? [initialData.deliveryNoteImage] : []),
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

  const handleGetLocation = () => {
      setIsGettingLocation(true);
      if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
              async (pos) => {
                  const lat = pos.coords.latitude;
                  const lng = pos.coords.longitude;
                  const loc = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                  setFormData(prev => ({ ...prev, location: loc }));
                  setIsGettingLocation(false);
              },
              (err) => {
                  alert("Không thể lấy vị trí GPS.");
                  setIsGettingLocation(false);
              }
          );
      } else {
          setIsGettingLocation(false);
      }
  };

  const handleAddMaterial = () => {
    const newMaterial: MaterialIQC = {
        id: `mat-${Date.now()}`,
        name: '',
        category: '',
        inspectType: '100%',
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
        let val = value;
        if (['orderQty', 'deliveryQty', 'inspectQty', 'passQty', 'failQty'].includes(field)) {
            val = parseFloat(String(value)) || 0;
        }
        let mat = { ...nextMaterials[idx], [field]: val };
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeUploadContext) return;
    const { type, matIdx, itemIdx } = activeUploadContext;
    const processedImages = await Promise.all(
        Array.from(files).map(async (file: File) => {
            return new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = async () => {
                    const compressed = await resizeImage(reader.result as string);
                    resolve(compressed);
                };
                reader.readAsDataURL(file);
            });
        })
    );
    if (type === 'DELIVERY') { setFormData(prev => ({ ...prev, deliveryNoteImages: [...(prev.deliveryNoteImages || []), ...processedImages] })); }
    else if (type === 'REPORT') { setFormData(prev => ({ ...prev, reportImages: [...(prev.reportImages || []), ...processedImages] })); }
    else if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
        setFormData(prev => {
            const nextMats = [...(prev.materials || [])];
            const items = [...nextMats[matIdx].items];
            items[itemIdx] = { ...items[itemIdx], images: [...(items[itemIdx].images || []), ...processedImages] };
            nextMats[matIdx] = { ...nextMats[matIdx], items };
            return { ...prev, materials: nextMats };
        });
    }
    e.target.value = '';
  };

  const onImageSave = (idx: number, updatedImg: string) => {
      if (!editorState) return;
      const { type, matIdx, itemIdx } = editorState.context;
      setFormData(prev => {
          if (type === 'DELIVERY') {
              const next = [...(prev.deliveryNoteImages || [])]; next[idx] = updatedImg;
              return { ...prev, deliveryNoteImages: next };
          }
          if (type === 'REPORT') {
              const next = [...(prev.reportImages || [])]; next[idx] = updatedImg;
              return { ...prev, reportImages: next };
          }
          if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
              const nextMats = [...(prev.materials || [])];
              nextMats[matIdx].items[itemIdx].images![idx] = updatedImg;
              return { ...prev, materials: nextMats };
          }
          return prev;
      });
  };

  const handleSubmit = async () => {
    if (!formData.po_number || !formData.supplier || !formData.supplierAddress) { alert("Vui lòng nhập đầy đủ thông tin."); return; }
    if (!formData.signature) { alert("QC bắt buộc ký tên."); return; }
    setIsSaving(true);
    try {
        await onSave({ ...formData, status: InspectionStatus.PENDING, updatedAt: new Date().toISOString() } as Inspection);
    } catch (e) { alert("Lỗi lưu SQC-BTP."); } finally { setIsSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative no-scroll-x" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-28">
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-teal-50 pb-2 mb-1">
                <h3 className="text-teal-800 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><Box className="w-4 h-4"/> I. THÔNG TIN GIA CÔNG BÁN THÀNH PHẨM</h3>
                <button onClick={() => setShowHistory(true)} className="px-2 py-1 bg-slate-100 hover:bg-teal-100 text-slate-600 rounded-lg font-bold uppercase text-[9px] flex items-center gap-1"><History className="w-3 h-3" /> Lịch sử ({historicalRecords.length})</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Lệnh Sản Xuất / PO Gia Công *</label>
                    <div className="relative flex items-center">
                        <input value={formData.po_number} onChange={e => handleInputChange('po_number', e.target.value.toUpperCase())} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-9 shadow-inner" placeholder="Mã LSX..."/>
                        <button onClick={() => setShowScanner(true)} className="absolute right-1 p-1 text-slate-400" type="button"><QrCode className="w-4 h-4"/></button>
                    </div>
                </div>
                <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Đối Tác Gia Công BTP *</label>
                    <input value={formData.supplier || ''} onChange={e => handleInputChange('supplier', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] uppercase shadow-inner" placeholder="Tên đơn vị..."/>
                </div>
                <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Địa chỉ xưởng *</label>
                    <div className="flex gap-1.5 items-center">
                        <input value={formData.supplierAddress || ''} onChange={e => handleInputChange('supplierAddress', e.target.value)} className="flex-1 px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-9 shadow-inner" placeholder="Địa chỉ..."/>
                        <button onClick={handleGetLocation} disabled={isGettingLocation} className="p-2.5 rounded-lg border bg-slate-50 text-slate-400"><Locate className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>
        </section>
        <section className="space-y-3">
            <div className="flex justify-between items-center px-1"><h3 className="font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2 text-xs"><ClipboardList className="w-4 h-4 text-teal-600"/> II. DANH MỤC BTP KIỂM TRA ({formData.materials?.length || 0})</h3><button onClick={handleAddMaterial} className="bg-teal-600 text-white p-1.5 rounded-lg shadow active:scale-95 transition-all flex items-center gap-1.5 px-3" type="button"><Plus className="w-3 h-3"/><span className="text-[10px] font-bold uppercase">Thêm BTP</span></button></div>
            <div className="space-y-3">
                {(formData.materials || []).map((mat, matIdx) => {
                    const isExp = expandedMaterial === mat.id;
                    const passRate = mat.inspectQty > 0 ? ((mat.passQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                    return (
                    <div key={mat.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${isExp ? 'bg-teal-50/50 border-b border-teal-100' : 'bg-white'}`} onClick={() => setExpandedMaterial(isExp ? null : mat.id)}>
                            <div className="flex items-center gap-3 flex-1 overflow-hidden"><div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${isExp ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{matIdx + 1}</div><div className="flex-1 overflow-hidden"><h4 className="font-bold text-slate-800 uppercase text-xs truncate">{mat.name || 'BÁN THÀNH PHẨM MỚI'}</h4><div className="flex items-center gap-2 mt-0.5"><span className="text-[9px] font-bold text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">SL: {mat.deliveryQty} {mat.unit}</span><span className="text-[9px] font-bold text-green-600 uppercase bg-green-50 px-1.5 py-0.5 rounded">{passRate}% ĐẠT</span></div></div></div>
                            <div className="flex items-center gap-2"><button onClick={(e) => { e.stopPropagation(); if(window.confirm("Xóa?")) setFormData(prev => ({ ...prev, materials: prev.materials?.filter((_, i) => i !== matIdx) })); }} className="p-1.5 text-slate-300 hover:text-red-600" type="button"><Trash2 className="w-4 h-4"/></button>{isExp ? <ChevronUp className="w-4 h-4 text-teal-500"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}</div>
                        </div>
                        {isExp && (
                            <div className="p-4 space-y-4 bg-white border-t border-slate-50">
                                <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-inner">
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-slate-500 uppercase block text-center">Giao(DN)</label><input type="number" step="any" value={mat.deliveryQty} onChange={e => updateMaterial(matIdx, 'deliveryQty', e.target.value)} className="w-full px-2 py-1 border border-slate-300 rounded-md font-bold text-center bg-white text-[11px] h-7 shadow-sm"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-teal-600 uppercase block text-center">Kiểm tra</label><input type="number" step="any" value={mat.inspectQty} onChange={e => updateMaterial(matIdx, 'inspectQty', e.target.value)} className="w-full px-2 py-1 border border-teal-300 rounded-md font-bold text-center text-teal-700 bg-white text-[11px] h-7 shadow-sm"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-green-600 uppercase block text-center">Đạt</label><input type="number" step="any" value={mat.passQty} onChange={e => updateMaterial(matIdx, 'passQty', e.target.value)} className="w-full px-2 py-1 border border-green-300 rounded-md font-bold text-center text-green-700 bg-white text-[11px] h-7 shadow-sm"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-red-600 uppercase block text-center">Lỗi</label><input type="number" step="any" value={mat.failQty} onChange={e => updateMaterial(matIdx, 'failQty', e.target.value)} className="w-full px-2 py-1 border border-red-300 rounded-md font-bold text-center text-red-700 bg-white text-[11px] h-7 shadow-sm"/></div>
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
      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { handleInputChange('po_number', data); setShowScanner(false); }} />}
      {editorState && <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} onSave={onImageSave} readOnly={false}/>}
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
    </div>
  );
};
