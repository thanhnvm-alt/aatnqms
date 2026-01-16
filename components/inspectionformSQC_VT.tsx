import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, User, MaterialIQC, ModuleId, DefectLibraryItem } from '../types';
import { 
  Save, X, Box, FileText, QrCode, Loader2, Building2, UserCheck, 
  Calendar, CheckSquare, PenTool, Eraser, Plus, Trash2, 
  Camera, Image as ImageIcon, ClipboardList, ChevronDown, 
  ChevronUp, MessageCircle, History, FileCheck, Search, AlertCircle, MapPin, Locate, Map, CheckCircle2,
  Maximize2, Layers
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
                {!readOnly && <button onClick={clear} className="text-[9px] font-bold text-red-600 uppercase flex items-center gap-1 hover:underline" type="button"><Eraser className="w-3 h-3" /> Xóa ký lại</button>}
            </div>
            <div className="border border-slate-300 rounded-xl bg-white overflow-hidden relative h-28 shadow-sm">
                <canvas ref={canvasRef} width={400} height={112} className="w-full h-full touch-none cursor-crosshair" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                {!value && !readOnly && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] uppercase font-bold tracking-widest">Ký tại đây</div>}
            </div>
        </div>
    );
};

export const InspectionFormSQC_VT: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, inspections, user, templates }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({
    id: initialData?.id || `SQC-VT-${Date.now()}`,
    type: 'SQC_VT' as ModuleId,
    date: initialData?.date || new Date().toISOString().split('T')[0],
    status: InspectionStatus.DRAFT,
    materials: initialData?.materials || [],
    referenceDocs: initialData?.referenceDocs || [],
    inspectorName: user.name,
    po_number: initialData?.po_number || '', 
    ma_ct: initialData?.ma_ct || '',        
    ten_ct: initialData?.ten_ct || '',
    supplier: initialData?.supplier || '',
    supplierAddress: initialData?.supplierAddress || '',
    location: initialData?.location || '',
    reportImages: initialData?.reportImages || [],
    deliveryNoteImages: initialData?.deliveryNoteImages || [],
    images: initialData?.images || [], 
    summary: initialData?.summary || '',
    score: 0,
    items: initialData?.items || [], 
    ...initialData
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);

  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadContext, setActiveUploadContext] = useState<{ type: 'DELIVERY' | 'REPORT' | 'FIELD' | 'ITEM' | 'MATERIAL', matIdx?: number, itemIdx?: number } | null>(null);

  const sqcGroups = useMemo(() => {
      const sqcTpl = templates['SQC_MAT'] || [];
      return Array.from(new Set(sqcTpl.map(i => i.category))).filter(Boolean).sort();
  }, [templates]);

  const historicalRecords = useMemo(() => {
    if (!inspections || !formData.po_number) return [];
    return inspections.filter(i => i.id !== formData.id && i.po_number === formData.po_number);
  }, [inspections, formData.po_number, formData.id]);

  const handleInputChange = (field: keyof Inspection, value: any) => { 
    setFormData(prev => ({ ...prev, [field]: value })); 
  };

  /**
   * ISO-CRITICAL: Đồng bộ mã dự án từ cấp vật tư lên cấp Header của phiếu
   */
  const lookupMaterialProject = async (code: string, matIdx: number) => {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 3) return;
    
    setIsLookupLoading(true);
    try {
      const response = await fetchPlans(cleanCode, 1, 10);
      const match = (response.items || []).find(p => 
          (p.ma_ct || '').toUpperCase() === cleanCode || 
          (p.ma_nha_may || '').toUpperCase() === cleanCode ||
          (p.headcode || '').toUpperCase() === cleanCode
      );

      if (match) {
        setFormData(prev => {
            const nextMats = [...(prev.materials || [])];
            if (nextMats[matIdx]) {
                nextMats[matIdx].projectName = match.ten_ct;
                nextMats[matIdx].projectCode = match.ma_ct;
            }
            
            // Logic: Nếu đây là vật tư có dự án đầu tiên hoặc duy nhất, cập nhật vào Header
            // Điều này đảm bảo tính năng Grouping trong InspectionList hoạt động.
            const currentHeaderMaCt = prev.ma_ct || '';
            const shouldUpdateHeader = !currentHeaderMaCt || currentHeaderMaCt === 'DÙNG CHUNG';
            
            return { 
                ...prev, 
                materials: nextMats,
                ma_ct: shouldUpdateHeader ? match.ma_ct : prev.ma_ct,
                ten_ct: shouldUpdateHeader ? match.ten_ct : prev.ten_ct
            };
        });
      }
    } catch (e) {
        console.error("ISO-INTERNAL: Plan lookup failed", e);
    } finally {
        setIsLookupLoading(false);
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
                  setIsGettingLocation(false);
              },
              (err) => {
                  alert("Không thể lấy vị trí GPS. Vui lòng kiểm tra quyền ứng dụng.");
                  setIsGettingLocation(false);
              }
          );
      } else {
          alert("Trình duyệt không hỗ trợ định vị.");
          setIsGettingLocation(false);
      }
  };

  const handleAddMaterial = () => {
    const newMaterial: MaterialIQC = {
        id: `mat-${Date.now()}`,
        name: '',
        category: '',
        scope: 'COMMON',
        projectCode: 'DÙNG CHUNG',
        projectName: 'VẬT TƯ KHO TỔNG',
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
        
        if (field === 'scope') {
            if (value === 'COMMON') {
                mat.projectCode = 'DÙNG CHUNG';
                mat.projectName = 'VẬT TƯ KHO TỔNG';
            } else {
                mat.projectCode = '';
                mat.projectName = '';
            }
        }

        if (field === 'category') {
            const sqcTpl = templates['SQC_MAT'] || [];
            mat.items = sqcTpl
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
        
        // Cập nhật lại ma_ct Header nếu tất cả vật tư đều là DÙNG CHUNG
        const allCommon = nextMaterials.every(m => m.scope === 'COMMON');
        const headerMaCt = allCommon ? 'DÙNG CHUNG' : prev.ma_ct;
        const headerTenCt = allCommon ? 'Vật tư / Thành phần dùng chung' : prev.ten_ct;

        return { ...prev, materials: nextMaterials, ma_ct: headerMaCt, ten_ct: headerTenCt };
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

    setFormData(prev => {
        if (type === 'DELIVERY') return { ...prev, deliveryNoteImages: [...(prev.deliveryNoteImages || []), ...processedImages] };
        if (type === 'REPORT') return { ...prev, reportImages: [...(prev.reportImages || []), ...processedImages] };
        if (type === 'FIELD') return { ...prev, images: [...(prev.images || []), ...processedImages] };
        if (type === 'ITEM' && matIdx !== undefined && itemIdx !== undefined) {
            const nextMats = [...(prev.materials || [])];
            const items = [...nextMats[matIdx].items];
            items[itemIdx] = { ...items[itemIdx], images: [...(items[itemIdx].images || []), ...processedImages] };
            nextMats[matIdx] = { ...nextMats[matIdx], items };
            return { ...prev, materials: nextMats };
        }
        return prev;
    });
    e.target.value = '';
  };

  const handleEditImage = (images: string[], index: number, context: any) => { setEditorState({ images, index, context }); };
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
          if (type === 'FIELD') {
              const next = [...(prev.images || [])]; next[idx] = updatedImg;
              return { ...prev, images: next };
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
    if (!formData.po_number || !formData.supplier) { 
        alert("THIẾU THÔNG TIN: Vui lòng nhập Mã PO và Nhà cung cấp."); 
        return; 
    }
    if (!formData.signature) { 
        alert("YÊU CẦU CHỮ KÝ: QC bắt buộc phải ký tên xác nhận báo cáo."); 
        return; 
    }
    if (!formData.materials || formData.materials.length === 0) {
        alert("DANH MỤC TRỐNG: Vui lòng thêm ít nhất một loại vật tư vào báo cáo.");
        return;
    }

    const invalidMat = formData.materials.find(m => !m.name || !m.category);
    if (invalidMat) {
        alert("DỮ LIỆU VẬT TƯ LỖI: Tất cả vật tư phải có Tên và Chủng loại.");
        setExpandedMaterial(invalidMat.id);
        return;
    }

    setIsSaving(true);
    try {
        // Đảm bảo ma_ct Header được gán giá trị mặc định nếu vẫn trống
        const finalMaCt = formData.ma_ct || 'DÙNG CHUNG';
        const finalTenCt = formData.ten_ct || 'Vật tư / Thành phần dùng chung';

        await onSave({ 
            ...formData, 
            ma_ct: finalMaCt,
            ten_ct: finalTenCt,
            status: InspectionStatus.PENDING, 
            updatedAt: new Date().toISOString() 
        } as Inspection);
    } catch (e: any) {
        console.error("ISO-ERROR: Save failed", e);
        alert("LỖI HỆ THỐNG: Không thể lưu báo cáo.");
    } finally { 
        setIsSaving(false); 
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative no-scroll-x" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      
      {isLookupLoading && (
        <div className="absolute inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Đang truy xuất dữ liệu dự án...</p>
            </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-28">
        
        {/* I. General Information */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-teal-50 pb-2 mb-1">
                <h3 className="text-teal-800 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><Box className="w-4 h-4"/> I. THÔNG TIN GIA CÔNG VẬT TƯ</h3>
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2 py-1 rounded-lg border border-blue-100 uppercase tracking-tighter">
                        DỰ ÁN: {formData.ma_ct || '---'}
                    </span>
                    <button onClick={() => setShowHistory(true)} className="px-2 py-1 bg-slate-100 hover:bg-teal-100 text-slate-600 rounded-lg font-bold uppercase tracking-wide flex items-center gap-1 text-[9px]" type="button">
                        <History className="w-3 h-3" /> Lịch sử ({historicalRecords.length})
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Mã PO / Chứng từ *</label>
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
                    <div className="flex gap-1.5">
                        <input value={formData.supplierAddress || ''} onChange={e => handleInputChange('supplierAddress', e.target.value)} className="flex-1 px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[11px] h-9 shadow-inner" placeholder="Vị trí..."/>
                        <button onClick={handleGetLocation} disabled={isGettingLocation} className={`p-2 rounded-lg border flex items-center justify-center transition-all ${formData.location ? 'bg-teal-600 text-white border-teal-600' : 'bg-slate-50 text-slate-400 border-slate-200'}`} type="button">
                            {isGettingLocation ? <Loader2 className="w-4 h-4 animate-spin"/> : <Locate className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
                <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Ngày kiểm tra *</label>
                    <input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold outline-none text-[11px] h-9 shadow-inner"/>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-50">
                <div className="space-y-1">
                    <label className="text-[9px] font-bold text-blue-600 uppercase flex items-center justify-between px-1">
                        Ảnh Hiện Trường
                        <div className="flex gap-1">
                            <button onClick={() => { setActiveUploadContext({ type: 'FIELD' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-blue-600" type="button"><Camera className="w-3.5 h-3.5"/></button>
                            <button onClick={() => { setActiveUploadContext({ type: 'FIELD' }); fileInputRef.current?.click(); }} className="p-1 hover:text-blue-600" type="button"><ImageIcon className="w-3.5 h-3.5"/></button>
                        </div>
                    </label>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[44px] p-1 bg-slate-50 rounded-xl border border-slate-100">
                        {formData.images?.map((img, i) => (
                            <img key={i} src={img} className="w-10 h-10 rounded-lg border border-white shadow-sm object-cover shrink-0 cursor-pointer" onClick={() => setEditorState({ images: formData.images!, index: i, context: { type: 'FIELD' } })} />
                        ))}
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] font-bold text-indigo-600 uppercase flex items-center justify-between px-1">
                        Ảnh Phiếu Giao Nhận
                        <div className="flex gap-1">
                            <button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><Camera className="w-3.5 h-3.5"/></button>
                            <button onClick={() => { setActiveUploadContext({ type: 'DELIVERY' }); fileInputRef.current?.click(); }} className="p-1 hover:text-indigo-600" type="button"><ImageIcon className="w-3.5 h-3.5"/></button>
                        </div>
                    </label>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[44px] p-1 bg-slate-50 rounded-xl border border-slate-100">
                        {formData.deliveryNoteImages?.map((img, i) => (
                            <img key={i} src={img} className="w-10 h-10 rounded-lg border border-white shadow-sm object-cover shrink-0 cursor-pointer" onClick={() => setEditorState({ images: formData.deliveryNoteImages!, index: i, context: { type: 'DELIVERY' } })} />
                        ))}
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] font-bold text-emerald-600 uppercase flex items-center justify-between px-1">
                        Báo cáo NCC (CO/CQ)
                        <div className="flex gap-1">
                            <button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); cameraInputRef.current?.click(); }} className="p-1 hover:text-emerald-600" type="button"><Camera className="w-3.5 h-3.5"/></button>
                            <button onClick={() => { setActiveUploadContext({ type: 'REPORT' }); fileInputRef.current?.click(); }} className="p-1 hover:text-emerald-600" type="button"><ImageIcon className="w-3.5 h-3.5"/></button>
                        </div>
                    </label>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-h-[44px] p-1 bg-slate-50 rounded-xl border border-slate-100">
                        {formData.reportImages?.map((img, i) => (
                            <img key={i} src={img} className="w-10 h-10 rounded-lg border border-white shadow-sm object-cover shrink-0 cursor-pointer" onClick={() => setEditorState({ images: formData.reportImages!, index: i, context: { type: 'REPORT' } })} />
                        ))}
                    </div>
                </div>
            </div>
        </section>

        {/* II. Materials Details */}
        <section className="space-y-3">
            <div className="flex justify-between items-center px-1">
                <h3 className="font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2 text-xs"><ClipboardList className="w-4 h-4 text-teal-600"/> II. DANH MỤC VẬT TƯ GIA CÔNG ({formData.materials?.length || 0})</h3>
                <button onClick={handleAddMaterial} className="bg-teal-600 text-white p-1.5 rounded-lg shadow active:scale-95 transition-all flex items-center gap-1.5 px-4 hover:bg-teal-700" type="button">
                    <Plus className="w-3.5 h-3.5"/> <span className="text-[10px] font-bold uppercase">Thêm Vật Tư</span>
                </button>
            </div>
            
            <div className="space-y-3">
                {(formData.materials || []).map((mat, matIdx) => {
                    const isExp = expandedMaterial === mat.id;
                    const passRate = mat.inspectQty > 0 ? ((mat.passQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                    return (
                    <div key={mat.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in zoom-in duration-200">
                        <div className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${isExp ? 'bg-teal-50/50 border-b border-teal-100' : 'bg-white hover:bg-slate-50'}`} onClick={() => setExpandedMaterial(isExp ? null : mat.id)}>
                            <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm ${isExp ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{matIdx + 1}</div>
                                <div className="flex-1 overflow-hidden">
                                    <h4 className="font-bold text-slate-800 uppercase tracking-tight truncate text-xs">{mat.name || 'HẠNG MỤC MỚI'}</h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">SL: {mat.deliveryQty} {mat.unit}</span>
                                        <span className="text-[9px] font-bold text-green-600 uppercase border border-green-200 bg-green-50 px-1.5 py-0.5 rounded">{passRate}% ĐẠT</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); if(window.confirm("Xác nhận xóa hạng mục này?")) setFormData(prev => ({ ...prev, materials: prev.materials?.filter((_, i) => i !== matIdx) })); }} className="p-1.5 text-slate-300 hover:text-red-600 rounded-md transition-colors" type="button"><Trash2 className="w-4 h-4"/></button>
                                {isExp ? <ChevronUp className="w-4 h-4 text-teal-500"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                            </div>
                        </div>

                        {isExp && (
                            <div className="p-4 space-y-4 bg-white">
                                {/* Material Scope, Project Code & Name in 1 row */}
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3 shadow-inner">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Phân loại sử dụng</label>
                                        <div className="relative">
                                            <select 
                                                value={mat.scope} 
                                                onChange={e => updateMaterial(matIdx, 'scope', e.target.value)}
                                                className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold text-[10px] h-8 bg-white outline-none appearance-none shadow-sm"
                                            >
                                                <option value="COMMON">Dùng chung (Kho tổng)</option>
                                                <option value="PROJECT">Cho công trình cụ thể</option>
                                            </select>
                                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Mã dự án</label>
                                        <input 
                                            value={mat.projectCode} 
                                            readOnly={mat.scope === 'COMMON'}
                                            onChange={e => updateMaterial(matIdx, 'projectCode', e.target.value.toUpperCase())} 
                                            onBlur={() => mat.scope === 'PROJECT' && lookupMaterialProject(mat.projectCode || '', matIdx)} 
                                            className={`w-full px-2 py-1.5 border rounded-md font-bold text-[10px] h-8 outline-none shadow-sm transition-all ${mat.scope === 'COMMON' ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white border-slate-300 focus:border-indigo-500'}`} 
                                            placeholder="Mã CT..."
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên công trình</label>
                                        <input 
                                            value={mat.projectName} 
                                            readOnly 
                                            className="w-full px-2 py-1.5 bg-slate-100 border border-slate-200 rounded-md font-bold text-[10px] h-8 text-slate-500 uppercase truncate" 
                                            placeholder="..."
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-12 gap-3">
                                  <div className="col-span-4">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1 ml-1">Chủng loại *</label>
                                      <select value={mat.category || ''} onChange={e => updateMaterial(matIdx, 'category', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold outline-none text-[11px] text-slate-800 h-8 bg-white shadow-sm">
                                          <option value="">-- Chọn --</option>
                                          {sqcGroups.map(g => <option key={g} value={g}>{g}</option>)}
                                      </select>
                                  </div>
                                  <div className="col-span-8">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1 ml-1">Tên Vật Tư Gia Công *</label>
                                      <input value={mat.name} onChange={e => updateMaterial(matIdx, 'name', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold focus:ring-1 ring-teal-500 outline-none text-[11px] h-8 shadow-sm" placeholder="Tên sản phẩm..."/>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-inner">
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-slate-500 uppercase block text-center">Giao(DN)</label><input type="number" value={mat.deliveryQty} onChange={e => updateMaterial(matIdx, 'deliveryQty', Number(e.target.value))} className="w-full px-2 py-1 border border-slate-300 rounded-md font-bold text-center bg-white text-[11px] h-7 shadow-sm"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-teal-600 uppercase block text-center">Kiểm tra</label><input type="number" value={mat.inspectQty} onChange={e => updateMaterial(matIdx, 'inspectQty', Number(e.target.value))} className="w-full px-2 py-1 border border-teal-300 rounded-md font-bold text-center text-teal-700 bg-white text-[11px] h-7 shadow-sm"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-green-600 uppercase block text-center">Đạt</label><input type="number" value={mat.passQty} onChange={e => updateMaterial(matIdx, 'passQty', Number(e.target.value))} className="w-full px-2 py-1 border border-green-300 rounded-md font-bold text-center text-green-700 bg-white text-[11px] h-7 shadow-sm"/></div>
                                    <div className="space-y-1"><label className="text-[9px] font-bold text-red-600 uppercase block text-center">Lỗi</label><input type="number" value={mat.failQty} onChange={e => updateMaterial(matIdx, 'failQty', Number(e.target.value))} className="w-full px-2 py-1 border border-red-300 rounded-md font-bold text-center text-red-700 bg-white text-[11px] h-7 shadow-sm"/></div>
                                </div>

                                <div className="space-y-2 mt-3">
                                    {(mat.items || []).map((item, itemIdx) => (
                                        <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm space-y-2 group hover:border-teal-200 transition-all">
                                            <p className="font-bold text-slate-800 uppercase tracking-tight text-[11px]">{item.label}</p>
                                            <div className="flex items-center gap-2 pt-2 border-t border-slate-50 mt-1">
                                                <div className="flex bg-slate-100 p-0.5 rounded-lg gap-0.5 border border-slate-200 shadow-inner">
                                                    {[CheckStatus.PASS, CheckStatus.FAIL, CheckStatus.CONDITIONAL].map(st => (
                                                        <button 
                                                            key={st} 
                                                            onClick={() => updateMaterialItem(matIdx, itemIdx, 'status', st)} 
                                                            className={`px-3 py-1.5 rounded-md text-[8px] font-bold uppercase transition-all ${
                                                                item.status === st 
                                                                    ? (st === CheckStatus.PASS ? 'bg-green-600 text-white' : st === CheckStatus.FAIL ? 'bg-red-600 text-white' : 'bg-orange-50 text-white') 
                                                                    : 'text-slate-400 hover:bg-white'
                                                            }`} 
                                                            type="button"
                                                        >
                                                            {st === CheckStatus.PASS ? 'Đạt' : st === CheckStatus.FAIL ? 'Hỏng' : 'Có ĐK'}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-2 ml-auto">
                                                    <button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); cameraInputRef.current?.click(); }} className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-teal-600 shadow-sm active:scale-90" title="Chụp ảnh"><Camera className="w-4 h-4" /></button>
                                                    <button onClick={() => { setActiveUploadContext({ type: 'ITEM', matIdx, itemIdx }); fileInputRef.current?.click(); }} className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-teal-600 shadow-sm active:scale-90" title="Chọn ảnh"><ImageIcon className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                            <input value={item.notes || ''} onChange={(e) => updateMaterialItem(matIdx, itemIdx, 'notes', e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] h-8 shadow-inner outline-none focus:bg-white focus:border-teal-300" placeholder="Ghi chú kết quả..."/>
                                            {item.images && item.images.length > 0 && (
                                                <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                                                    {item.images.map((img, i) => (
                                                        <div key={i} className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 shrink-0 group/img">
                                                            <img src={img} className="w-full h-full object-cover cursor-pointer" onClick={() => handleEditImage(item.images!, i, { type: 'ITEM', matIdx, itemIdx })}/>
                                                            <button onClick={() => { const nextMats = [...formData.materials!]; nextMats[matIdx].items[itemIdx].images = nextMats[matIdx].items[itemIdx].images!.filter((_, idx) => idx !== i); setFormData(prev => ({...prev, materials: nextMats})); }} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity"><X className="w-2.5 h-2.5" /></button>
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

        {/* IV. QC Signature */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-teal-800 border-b border-teal-50 pb-2 mb-4 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><PenTool className="w-4 h-4"/> IV. XÁC NHẬN QC</h3>
            <div className="space-y-4">
                <textarea 
                    value={formData.summary}
                    onChange={e => handleInputChange('summary', e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none h-20 resize-none text-[11px] shadow-inner focus:bg-white"
                    placeholder="Ghi chú tổng kết của QC về lô vật tư này..."
                />
                <SignaturePad label={`QC Ký Tên (${user.name})`} value={formData.signature} onChange={sig => setFormData({...formData, signature: sig})} />
            </div>
        </section>
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center justify-between gap-3 sticky bottom-0 z-40 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
        <button onClick={onCancel} className="h-[44px] px-6 text-slate-500 font-bold uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all border border-slate-200 text-[10px]" type="button">HỦY BỎ</button>
        <button onClick={handleSubmit} disabled={isSaving} className="h-[44px] flex-1 bg-teal-700 text-white font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-teal-800 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 text-[10px] transition-all" type="button">
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