
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckStatus, Inspection, InspectionStatus, Priority, PlanItem, CheckItem, Workshop, User, NCR, DefectLibraryItem } from '../types';
import { INITIAL_CHECKLIST_TEMPLATE } from '../constants';
import { fetchPlans, fetchDefectLibrary } from '../services/apiService'; 
import { generateNCRSuggestions } from '../services/geminiService';
import { 
  Save, ArrowLeft, Image as ImageIcon, X, Trash2, 
  Plus, PlusCircle, Layers, QrCode,
  ChevronDown, AlertTriangle, Calendar, ClipboardList, 
  Hash, Box, Loader2, PenTool, Eraser, Edit2, Check, Maximize2,
  Sparkles, Camera, Clock
} from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';
// @ts-ignore
import jsQR from 'jsqr';

interface InspectionFormProps {
  onSave: (inspection: Inspection) => void;
  onCancel: () => void;
  initialData?: Partial<Inspection>;
  template?: CheckItem[];
  plans?: PlanItem[];
  workshops?: Workshop[];
  user?: User; 
}

const resizeImage = (base64Str: string, maxWidth = 1200): Promise<string> => {
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
      if (ctx) { ctx.fillStyle = 'white'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', 0.7)); }
      else resolve(base64Str);
    };
    img.onerror = () => resolve(base64Str);
  });
};

export const InspectionForm: React.FC<InspectionFormProps> = ({ 
  onSave, 
  onCancel, 
  initialData, 
  template = INITIAL_CHECKLIST_TEMPLATE,
  plans = [],
  workshops = [],
  user
}) => {
  const [formData, setFormData] = useState<Partial<Inspection>>(() => {
    const baseState = {
      ma_ct: '',
      ten_ct: '',
      inspectorName: user?.name || '', 
      priority: Priority.MEDIUM,
      date: new Date().toISOString().split('T')[0],
      items: JSON.parse(JSON.stringify(template)),
      status: InspectionStatus.DRAFT,
      images: [],
      ten_hang_muc: '',
      ma_nha_may: '',
      headcode: '',
      workshop: '',
      inspectionStage: '',
      dvt: 'PCS',
      so_luong_ipo: 0,
      inspectedQuantity: 0,
      passedQuantity: 0,
      failedQuantity: 0,
      type: (initialData?.type || 'PQC') as any,
      signature: '',
      productionSignature: '',
      productionName: ''
    };
    if (initialData) return { ...baseState, ...JSON.parse(JSON.stringify(initialData)), items: initialData.items ? JSON.parse(JSON.stringify(initialData.items)) : baseState.items };
    return baseState;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ncrImageInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiConsulting, setIsAiConsulting] = useState(false);
  const [isSearchingPlan, setIsSearchingPlan] = useState(false);
  const [ncrModalItem, setNcrModalItem] = useState<{ itemId: string, itemLabel: string, ncrData?: NCR } | null>(null);
  const [ncrFormData, setNcrFormData] = useState<Partial<NCR>>({});
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [defectLibrary, setDefectLibrary] = useState<DefectLibraryItem[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [editingCategory, setEditingCategory] = useState<{name: string, value: string} | null>(null);
  
  const [editingImageIdx, setEditingImageIdx] = useState<number | null>(null);

  const qcCanvasRef = useRef<HTMLCanvasElement>(null);
  const prodCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingQC, setIsDrawingQC] = useState(false);
  const [isDrawingProd, setIsDrawingProd] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    fetchDefectLibrary().then(setDefectLibrary);
  }, []);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent, canvasRef: React.RefObject<HTMLCanvasElement>, setDrawing: (v: boolean) => void) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent, canvasRef: React.RefObject<HTMLCanvasElement>, isDrawing: boolean) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const clearCanvas = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (showScanner) {
      const startCamera = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (videoRef.current && stream) {
              videoRef.current.srcObject = stream;
              videoRef.current.setAttribute('playsinline', 'true');
              videoRef.current.play();
              requestRef.current = requestAnimationFrame(tick);
          }
        } catch (err) {
          alert('Không thể truy cập camera. Vui lòng cấp quyền.');
          setShowScanner(false);
        }
      };
      startCamera();
    }
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [showScanner]);

  const tick = () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
             const scannedData = code.data.trim();
             handleAutoFillFromCode(scannedData);
             setShowScanner(false);
             return;
          }
        }
      }
    }
    if (showScanner) requestRef.current = requestAnimationFrame(tick);
  };

  const handleAutoFillFromCode = async (code: string) => {
      const cleanCode = (code || '').trim();
      if (!cleanCode) return;
      const len = cleanCode.length;
      
      let found: PlanItem | undefined = plans.find(p => 
          (len === 9 && String(p.headcode || '').toLowerCase() === cleanCode.toLowerCase()) ||
          (len === 13 && String(p.ma_nha_may || '').toLowerCase() === cleanCode.toLowerCase())
      );

      if (!found) {
          setIsSearchingPlan(true);
          try {
              const result = await fetchPlans(cleanCode, 1, 5);
              if (result.items && result.items.length > 0) {
                  found = result.items.find(p => 
                      (len === 9 && String(p.headcode || '').toLowerCase() === cleanCode.toLowerCase()) ||
                      (len === 13 && String(p.ma_nha_may || '').toLowerCase() === cleanCode.toLowerCase())
                  );
              }
          } catch (err) {
              console.error("Direct plan lookup failed:", err);
          } finally {
              setIsSearchingPlan(false);
          }
      }

      if (found) {
          setFormData(prev => ({
              ...prev,
              ma_nha_may: found!.ma_nha_may,
              headcode: found!.headcode || (len === 9 ? cleanCode : ''),
              ma_ct: found!.ma_ct,
              ten_ct: found!.ten_ct,
              ten_hang_muc: found!.ten_hang_muc,
              dvt: found!.dvt || 'PCS',
              so_luong_ipo: found!.so_luong_ipo
          }));
      } else {
          setFormData(prev => ({ ...prev, ma_nha_may: cleanCode }));
      }
  };

  const handleMaNhaMayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setFormData(prev => ({ ...prev, ma_nha_may: value }));
      const cleanValue = value.trim();
      if (cleanValue.length === 9 || cleanValue.length === 13) {
          handleAutoFillFromCode(cleanValue);
      }
  };

  const handleQuantityChange = (field: 'inspectedQuantity' | 'passedQuantity' | 'failedQuantity' | 'so_luong_ipo', valueStr: string) => {
    const val = valueStr === '' ? 0 : parseFloat(valueStr);
    
    setFormData(prev => {
        const next = { ...prev };
        if (field === 'so_luong_ipo') {
            next.so_luong_ipo = val;
        } else if (field === 'inspectedQuantity') {
            next.inspectedQuantity = val;
            // SL Đạt = Tổng - Lỗi
            next.passedQuantity = Math.max(0, val - (prev.failedQuantity || 0));
        } else if (field === 'passedQuantity') {
            next.passedQuantity = val;
            // SL Lỗi = Tổng - Đạt
            next.failedQuantity = Math.max(0, (prev.inspectedQuantity || 0) - val);
        } else if (field === 'failedQuantity') {
            next.failedQuantity = val;
            // SL Đạt = Tổng - Lỗi
            next.passedQuantity = Math.max(0, (prev.inspectedQuantity || 0) - val);
        }
        return next;
    });
  };

  const availableStages = useMemo(() => {
    if (!formData.workshop) return [];
    const workshop = workshops.find(w => w.name === formData.workshop);
    return workshop?.stages || [];
  }, [formData.workshop, workshops]);

  const availableDefects = useMemo(() => {
      const stage = formData.inspectionStage || '';
      return defectLibrary.filter(d => 
          (!stage || d.stage.toLowerCase() === stage.toLowerCase()) &&
          (!librarySearch || d.code.toLowerCase().includes(librarySearch.toLowerCase()) || d.description.toLowerCase().includes(librarySearch.toLowerCase()))
      );
  }, [defectLibrary, formData.inspectionStage, librarySearch]);

  const updateItem = (id: string, updates: Partial<CheckItem>) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items?.map(item => item.id === id ? { ...item, ...updates } : item)
    }));
  };

  const handleAddItem = (categoryName?: string) => {
    let finalCategory = categoryName;
    if (!finalCategory) {
        finalCategory = prompt("Nhập tên danh mục mới (VD: LẮP RÁP, BỀ MẶT...):", "CHUNG") || "CHUNG";
    }
    const label = prompt("Nhập tên hạng mục kiểm tra:") || "Hạng mục mới";
    const newItem: CheckItem = {
      id: `item_${Date.now()}`,
      category: finalCategory.toUpperCase(),
      label,
      status: CheckStatus.PENDING,
      notes: ''
    };
    setFormData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
  };

  const handleDeleteItem = (id: string) => {
    if (window.confirm("Xóa hạng mục này?")) {
      setFormData(prev => ({ ...prev, items: prev.items?.filter(i => i.id !== id) }));
    }
  };

  const handleUpdateCategoryName = (oldName: string) => {
      if (!editingCategory || !editingCategory.value.trim()) return;
      const newName = editingCategory.value.toUpperCase();
      setFormData(prev => ({
          ...prev,
          items: prev.items?.map(item => item.category === oldName ? { ...item, category: newName } : item)
      }));
      setEditingCategory(null);
  };

  const handleDeleteCategory = (categoryName: string) => {
      if (window.confirm(`Bạn có chắc chắn muốn xóa toàn bộ danh mục "${categoryName}" và các hạng mục bên trong?`)) {
          setFormData(prev => ({
              ...prev,
              items: prev.items?.filter(item => item.category !== categoryName)
          }));
      }
  };

  const handleItemStatusChange = (item: CheckItem, status: CheckStatus) => {
      updateItem(item.id, { status });
      if (status === CheckStatus.FAIL && !item.ncr) handleOpenNCR(item);
  };

  const handleOpenNCR = (item: CheckItem) => {
      setNcrModalItem({ itemId: item.id, itemLabel: item.label, ncrData: item.ncr });
      setNcrFormData(item.ncr || {
          issueDescription: item.notes || '',
          responsiblePerson: '',
          rootCause: '',
          solution: '',
          status: 'OPEN',
          createdDate: new Date().toISOString().split('T')[0],
          deadline: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0], // 3 days default
          imagesBefore: [],
          imagesAfter: []
      });
  };

  const handleAiConsult = async () => {
    if (!ncrFormData.issueDescription) {
        alert("Vui lòng nhập mô tả lỗi để AI có thể tư vấn.");
        return;
    }
    setIsAiConsulting(true);
    try {
        const result = await generateNCRSuggestions(ncrFormData.issueDescription, ncrModalItem?.itemLabel || '');
        setNcrFormData(prev => ({
            ...prev,
            rootCause: result.rootCause,
            solution: result.solution
        }));
    } catch (err) {
        alert("Lỗi khi kết nối AI.");
    } finally {
        setIsAiConsulting(false);
    }
  };

  const handleSaveNCR = () => {
      if (!ncrModalItem || !ncrFormData.issueDescription) { alert("Vui lòng nhập mô tả lỗi"); return; }
      const newNCR: NCR = {
          id: ncrModalItem.ncrData?.id || `NCR-${Date.now()}`,
          defect_code: ncrFormData.defect_code,
          createdDate: ncrFormData.createdDate || new Date().toISOString().split('T')[0],
          issueDescription: ncrFormData.issueDescription,
          rootCause: ncrFormData.rootCause || '',
          solution: ncrFormData.solution || '',
          responsiblePerson: ncrFormData.responsiblePerson || '',
          deadline: ncrFormData.deadline,
          status: ncrFormData.status || 'OPEN',
          severity: ncrFormData.severity || 'MINOR',
          imagesBefore: ncrFormData.imagesBefore || [],
          imagesAfter: ncrFormData.imagesAfter || []
      };
      updateItem(ncrModalItem.itemId, { ncr: newNCR, status: CheckStatus.FAIL });
      setNcrModalItem(null); setNcrFormData({});
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const processed = await Promise.all(Array.from(files).map(async (file: File) => await resizeImage(await new Promise<string>(res => {const r=new FileReader(); r.onload=()=>res(r.result as string); r.readAsDataURL(file);}))));
    if (activeUploadId === 'MAIN') setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...processed] }));
    setActiveUploadId(null); if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleNCRImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const processed = await Promise.all(Array.from(files).map(async (file: File) => await resizeImage(await new Promise<string>(res => {const r=new FileReader(); r.onload=()=>res(r.result as string); r.readAsDataURL(file);}))));
      setNcrFormData(prev => ({
          ...prev,
          imagesBefore: [...(prev.imagesBefore || []), ...processed]
      }));
      if (ncrImageInputRef.current) ncrImageInputRef.current.value = '';
  };

  const handleUpdateImage = (index: number, updatedImage: string) => {
    setFormData(prev => ({
        ...prev,
        images: prev.images?.map((img, i) => i === index ? updatedImage : img)
    }));
  };

  const groupedItems = useMemo(() => {
      const groups: Record<string, CheckItem[]> = {};
      formData.items?.forEach(item => {
          if (!groups[item.category]) groups[item.category] = [];
          groups[item.category].push(item);
      });
      return groups;
  }, [formData.items]);

  const selectedDefectInfo = useMemo(() => {
      if (!ncrFormData.defect_code) return null;
      return defectLibrary.find(d => d.code === ncrFormData.defect_code);
  }, [defectLibrary, ncrFormData.defect_code]);

  const stats = useMemo(() => {
    const total = formData.inspectedQuantity || 0;
    const passed = formData.passedQuantity || 0;
    const failed = formData.failedQuantity || 0;
    const passPct = total > 0 ? Math.round((passed / total) * 100) : 0;
    const failPct = total > 0 ? Math.round((failed / total) * 100) : 0;
    return { passPct, failPct };
  }, [formData.inspectedQuantity, formData.passedQuantity, formData.failedQuantity]);

  const handleSave = () => {
    if (!formData.ma_nha_may || !formData.ten_hang_muc) { alert("Vui lòng nhập đủ thông tin bắt buộc (*)"); return; }
    setIsSaving(true);
    
    const qcSign = qcCanvasRef.current?.toDataURL();
    const prodSign = prodCanvasRef.current?.toDataURL();
    
    const total = formData.items?.length || 0;
    const passed = formData.items?.filter(i => i.status === CheckStatus.PASS).length || 0;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;

    const finalInspection: Inspection = {
        ...formData as Inspection,
        id: formData.id || `INS-${Date.now()}`,
        score,
        status: (formData.failedQuantity || 0) > 0 ? InspectionStatus.FLAGGED : InspectionStatus.COMPLETED,
        signature: qcSign,
        productionSignature: prodSign
    };
    onSave(finalInspection);
  };

  const getModuleLabel = () => {
    const mod = formData.type || 'PQC';
    switch(mod) {
        case 'IQC': return 'IQC - KIỂM TRA VẬT TƯ';
        case 'PQC': return 'PQC - KIỂM TRA SẢN XUẤT';
        case 'FQC': return 'FQC - KIỂM TRA THÀNH PHẨM';
        case 'SITE': return 'SITE - KIỂM TRA CÔNG TRÌNH';
        default: return `${mod} - KIỂM TRA`;
    }
  };

  return (
    <div className="bg-slate-50 h-full flex flex-col relative overflow-hidden">
      <input type="file" accept="image/*" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />

      {showScanner && (
        <div className="fixed inset-0 z-[160] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
            <button onClick={() => setShowScanner(false)} className="absolute top-8 right-8 text-white p-3 bg-white/10 rounded-full active:scale-90 transition-transform"><X className="w-8 h-8"/></button>
            <div className="text-center mb-8">
                <h3 className="text-white font-black text-xl uppercase tracking-widest mb-1">Quét mã sản phẩm</h3>
                <p className="text-slate-400 text-sm">Di chuyển camera đến mã Headcode hoặc Mã nhà máy</p>
            </div>
            <div className="w-full max-w-sm aspect-square bg-slate-800 rounded-[3rem] overflow-hidden relative border-4 border-blue-500/50 shadow-[0_0_50px_rgba(37,99,235,0.4)]">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_15px_red] animate-pulse"></div>
            </div>
            <p className="text-blue-400 mt-10 font-black text-xs uppercase tracking-[0.3em] animate-pulse">Đang dò tìm mã...</p>
        </div>
      )}

      {editingImageIdx !== null && (
          <ImageEditorModal 
            images={formData.images || []} 
            initialIndex={editingImageIdx} 
            onSave={handleUpdateImage} 
            onClose={() => setEditingImageIdx(null)} 
          />
      )}

      <div className="bg-white px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 z-40 shadow-sm shrink-0">
        <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 active:scale-90 transition-transform"><ArrowLeft className="w-6 h-6"/></button>
        <div className="text-center">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">TẠO PHIẾU MỚI</h2>
            <div className="mt-0.5"><span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[9px] font-black uppercase border border-blue-100">{getModuleLabel()}</span></div>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white p-2.5 rounded-xl shadow-lg shadow-blue-500/30 active:scale-95 transition-all">
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar pb-32">
        
        <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
                <ImageIcon className="w-4 h-4 text-slate-400" />
                <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest">HÌNH ÁNH HIỆN TRƯỜNG ({formData.images?.length || 0})</h3>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-3">
                <button 
                  onClick={() => { setActiveUploadId('MAIN'); fileInputRef.current?.click(); }}
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 flex flex-col items-center justify-center text-blue-500 active:scale-95 transition-all"
                >
                    <Plus className="w-6 h-6" />
                    <span className="text-[8px] font-black mt-1 uppercase">Thêm ảnh</span>
                </button>
                {formData.images?.map((img, idx) => (
                    <div key={idx} className="relative w-20 h-20 group cursor-pointer" onClick={() => setEditingImageIdx(idx)}>
                        <img src={img} className="w-full h-full object-cover rounded-xl border border-slate-100 shadow-sm transition-transform group-hover:scale-110 group-hover:opacity-100" />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                            <PenTool className="text-white w-4 h-4" />
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setFormData(prev => ({...prev, images: prev.images?.filter((_, i) => i !== idx)})); }} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button>
                    </div>
                ))}
            </div>
        </div>

        <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
                <Box className="w-4 h-4 text-blue-600" />
                <h3 className="text-[11px] font-black text-blue-600 uppercase tracking-widest">THÔNG TIN NGUỒN</h3>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="space-y-1">
                    <label className="text-[11px] font-black text-slate-400 uppercase ml-1">MÃ NHÀ MÁY *</label>
                    <div className="relative group">
                        <input value={formData.ma_nha_may} onChange={handleMaNhaMayChange} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-base font-bold text-slate-700 focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all pr-12 shadow-sm" placeholder="Nhập 9 ký tự (Headcode) hoặc 13 ký tự (Mã NM)..."/>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {isSearchingPlan && <Loader2 className="w-5 h-5 text-blue-500 animate-spin mr-1" />}
                            <button onClick={() => setShowScanner(true)} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 active:scale-90 transition-all border border-blue-100/50"><QrCode className="w-5 h-5"/></button>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Mã công trình *</label>
                        <input value={formData.ma_ct} onChange={e => setFormData({...formData, ma_ct: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:bg-white outline-none transition-all" placeholder="Nhập mã CT..."/>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tên công trình</label>
                        <input value={formData.ten_ct} onChange={e => setFormData({...formData, ten_ct: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:bg-white outline-none transition-all" placeholder="Nhập tên CT..."/>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tên sản phẩm *</label>
                    <input value={formData.ten_hang_muc} onChange={e => setFormData({...formData, ten_hang_muc: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:bg-white outline-none transition-all" placeholder="Nhập tên SP..."/>
                </div>
            </div>
        </div>

        <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
                <ClipboardList className="w-4 h-4 text-orange-600" />
                <h3 className="text-[11px] font-black text-orange-600 uppercase tracking-widest">THÔNG TIN KIỂM TRA</h3>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Xưởng / Kho / Phòng</label>
                        <div className="relative">
                            <select value={formData.workshop || ''} onChange={e => setFormData({...formData, workshop: e.target.value, inspectionStage: ''})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none appearance-none">
                                <option value="">-- Chọn Xưởng --</option>
                                {workshops.map(ws => <option key={ws.id} value={ws.name}>{ws.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Công đoạn sản xuất</label>
                        <div className="relative">
                            <select value={formData.inspectionStage || ''} onChange={e => setFormData({...formData, inspectionStage: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none appearance-none">
                                <option value="">-- Chọn Công Đoạn --</option>
                                {availableStages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">QC thực hiện *</label>
                        <input value={formData.inspectorName} readOnly className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 cursor-not-allowed uppercase" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Ngày kiểm tra</label>
                        <div className="relative">
                            <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:bg-white outline-none transition-all" />
                            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
                <Hash className="w-4 h-4 text-indigo-600" />
                <h3 className="text-[11px] font-black text-indigo-600 uppercase tracking-widest">SỐ LƯỢNG KIỂM TRA</h3>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">SL đơn hàng (IPO)</label>
                        <div className="relative">
                            <input 
                                type="number" step="any"
                                value={formData.so_luong_ipo} 
                                onChange={e => handleQuantityChange('so_luong_ipo', e.target.value)} 
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 focus:bg-white outline-none transition-all" 
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 uppercase">{formData.dvt}</span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">SL kiểm tra</label>
                        <input 
                            type="number" step="any"
                            value={formData.inspectedQuantity} 
                            onChange={e => handleQuantityChange('inspectedQuantity', e.target.value)} 
                            className="w-full px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-sm font-black text-blue-600 focus:bg-white outline-none transition-all" 
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <div className="flex justify-between items-center ml-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">SL đạt</label>
                            <span className="text-[9px] font-black text-green-600">{stats.passPct}%</span>
                        </div>
                        <input 
                            type="number" step="any"
                            value={formData.passedQuantity} 
                            onChange={e => handleQuantityChange('passedQuantity', e.target.value)} 
                            className="w-full px-4 py-2.5 bg-green-50 border border-green-100 rounded-xl text-sm font-black text-green-600 focus:bg-white outline-none transition-all" 
                        />
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center ml-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">SL lỗi</label>
                            <span className="text-[9px] font-black text-red-600">{stats.failPct}%</span>
                        </div>
                        <input 
                            type="number" step="any"
                            value={formData.failedQuantity} 
                            onChange={e => handleQuantityChange('failedQuantity', e.target.value)} 
                            className="w-full px-4 py-2.5 bg-red-100 border border-red-200 rounded-xl text-sm font-black text-red-700 focus:bg-white outline-none transition-all" 
                        />
                    </div>
                </div>
            </div>
        </div>

        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">CHI TIẾT HẠNG MỤC ({formData.items?.length || 0})</h3>
                </div>
                <button onClick={() => handleAddItem()} className="bg-slate-900 text-white px-3 py-1 rounded-md text-[9px] font-black uppercase flex items-center gap-1.5 active:scale-95 transition-all shadow-sm">
                    <PlusCircle className="w-3 h-3" /> Danh mục mới
                </button>
            </div>

            <div className="space-y-6">
                {Object.entries(groupedItems).map(([cat, items]: [string, CheckItem[]]) => (
                    <div key={cat} className="space-y-3 animate-in slide-in-from-bottom duration-300">
                        <div className="flex items-center justify-between bg-slate-100/80 px-4 py-2 rounded-xl group/cat border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 flex-1 overflow-hidden">
                                {editingCategory?.name === cat ? (
                                    <div className="flex items-center gap-1 w-full max-w-xs">
                                        <input 
                                            autoFocus
                                            value={editingCategory.value} 
                                            onChange={e => setEditingCategory({...editingCategory, value: e.target.value})}
                                            onKeyDown={e => e.key === 'Enter' && handleUpdateCategoryName(cat)}
                                            className="px-2 py-0.5 text-[10px] font-black uppercase text-blue-600 border border-blue-400 rounded outline-none w-full"
                                        />
                                        <button onClick={() => handleUpdateCategoryName(cat)} className="p-1 text-green-600 bg-white rounded shadow-sm border border-green-100"><Check className="w-3 h-3"/></button>
                                        <button onClick={() => setEditingCategory(null)} className="p-1 text-slate-400 bg-white rounded shadow-sm border border-slate-100"><X className="w-3 h-3"/></button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-[10px] font-black uppercase text-slate-600 tracking-widest truncate">{cat}</span>
                                        <div className="flex items-center gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); setEditingCategory({name: cat, value: cat}); }} className="p-1 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 className="w-3 h-3"/></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }} className="p-1 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3 h-3"/></button>
                                        </div>
                                    </>
                                )}
                            </div>
                            <button 
                                onClick={() => handleAddItem(cat)}
                                className="flex items-center gap-1 text-[8px] font-black text-blue-600 uppercase hover:bg-white px-2 py-1 rounded-lg transition-all active:scale-95"
                            >
                                <Plus className="w-3 h-3"/> Thêm mục
                            </button>
                        </div>

                        <div className="space-y-3">
                            {items.map(item => (
                                <div key={item.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                    <div className="p-4 space-y-3">
                                        <div className="flex justify-between items-start gap-4">
                                            <div className="flex-1">
                                                <input 
                                                    value={item.label} 
                                                    onChange={e => updateItem(item.id, { label: e.target.value })}
                                                    className="w-full px-2 py-1 text-sm font-bold text-slate-800 bg-slate-50/50 border-b border-transparent focus:border-blue-500 focus:bg-white outline-none rounded transition-all"
                                                    placeholder="Tên hạng mục..."
                                                />
                                            </div>
                                            <div className="flex gap-1.5 shrink-0 items-center">
                                                <button onClick={(e) => { e.stopPropagation(); handleOpenNCR(item); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Ghi nhận lỗi"><AlertTriangle className="w-4 h-4"/></button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg transition-colors" title="Xóa hạng mục"><Trash2 className="w-4 h-4"/></button>
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5">
                                            <button 
                                                onClick={() => handleItemStatusChange(item, CheckStatus.PASS)}
                                                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase border transition-all ${item.status === CheckStatus.PASS ? 'bg-green-600 border-green-600 text-white shadow-lg shadow-green-200' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                                            >ĐẠT</button>
                                            <button 
                                                onClick={() => handleItemStatusChange(item, CheckStatus.FAIL)}
                                                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase border transition-all ${item.status === CheckStatus.FAIL ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-200' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                                            >HỎNG</button>
                                            <button 
                                                onClick={() => handleItemStatusChange(item, CheckStatus.CONDITIONAL)}
                                                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase border transition-all ${item.status === CheckStatus.CONDITIONAL ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                                            >CÓ ĐIỀU KIỆN</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>

        <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
                <PenTool className="w-4 h-4 text-blue-600" />
                <h3 className="text-[11px] font-black text-blue-600 uppercase tracking-widest">XÁC NHẬN CHỮ KÝ (VẼ TỰ DO)</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">1. QC Kiểm tra</label>
                        <button onClick={() => clearCanvas(qcCanvasRef)} className="text-[9px] font-black text-red-500 uppercase flex items-center gap-1"><Eraser className="w-3 h-3"/> Xóa</button>
                    </div>
                    <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl h-40 relative overflow-hidden shadow-inner">
                        <canvas 
                            ref={qcCanvasRef} width={400} height={200} className="w-full h-full cursor-crosshair touch-none" 
                            style={{ touchAction: 'none' }}
                            onMouseDown={e => startDrawing(e, qcCanvasRef, setIsDrawingQC)}
                            onMouseMove={e => draw(e, qcCanvasRef, isDrawingQC)}
                            onMouseUp={() => setIsDrawingQC(false)}
                            onMouseLeave={() => setIsDrawingQC(false)}
                            onTouchStart={e => startDrawing(e, qcCanvasRef, setIsDrawingQC)}
                            onTouchMove={e => draw(e, qcCanvasRef, isDrawingQC)}
                            onTouchEnd={() => setIsDrawingQC(false)}
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                            <PenTool className="w-20 h-20 text-black" />
                        </div>
                    </div>
                    <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">{formData.inspectorName}</p>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">2. Đại diện Sản xuất</label>
                        <button onClick={() => clearCanvas(prodCanvasRef)} className="text-[9px] font-black text-red-500 uppercase flex items-center gap-1"><Eraser className="w-3 h-3"/> Xóa</button>
                    </div>
                    <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl h-40 relative overflow-hidden shadow-inner">
                        <canvas 
                            ref={prodCanvasRef} width={400} height={200} className="w-full h-full cursor-crosshair touch-none" 
                            style={{ touchAction: 'none' }}
                            onMouseDown={e => startDrawing(e, prodCanvasRef, setIsDrawingProd)}
                            onMouseMove={e => draw(e, prodCanvasRef, isDrawingProd)}
                            onMouseUp={() => setIsDrawingProd(false)}
                            onMouseLeave={() => setIsDrawingProd(false)}
                            onTouchStart={e => startDrawing(e, prodCanvasRef, setIsDrawingProd)}
                            onTouchMove={e => draw(e, prodCanvasRef, isDrawingProd)}
                            onTouchEnd={() => setIsDrawingProd(false)}
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                            <PenTool className="w-20 h-20 text-black" />
                        </div>
                    </div>
                    <input 
                        value={formData.productionName || ''} 
                        onChange={e => setFormData({...formData, productionName: e.target.value.toUpperCase()})}
                        className="w-full text-center px-2 py-1.5 bg-transparent border-b border-slate-200 text-[10px] font-black text-slate-700 outline-none uppercase placeholder:text-slate-300"
                        placeholder="NHẬP HỌ TÊN NGƯỜI KÝ..."
                    />
                </div>
            </div>
        </div>

      </div>

      {ncrModalItem && (
          <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="px-6 py-4 bg-red-600 text-white flex justify-between items-center shrink-0">
                      <div className="flex gap-3 items-center">
                          <AlertTriangle className="w-6 h-6" />
                          <h3 className="font-black text-lg uppercase tracking-tight leading-none">PHIẾU LỖI (NCR)</h3>
                      </div>
                      <button onClick={() => setNcrModalItem(null)}><X className="w-6 h-6"/></button>
                  </div>
                  <div className="p-6 space-y-5 overflow-y-auto no-scrollbar">
                      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center justify-between cursor-pointer active:scale-95 transition-all" onClick={() => setShowLibraryModal(true)}>
                          <div className="flex items-center gap-3 overflow-hidden">
                              <Layers className="w-6 h-6 text-blue-600 shrink-0" />
                              <div className="overflow-hidden">
                                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Chọn từ thư viện lỗi</p>
                                  <p className="text-xs font-bold text-blue-900 truncate">
                                      {ncrFormData.defect_code ? `${ncrFormData.defect_code}${selectedDefectInfo ? ` - ${selectedDefectInfo.name}` : ''}` : 'Bấm để tra cứu lỗi mẫu'}
                                  </p>
                              </div>
                          </div>
                          <Plus className="w-5 h-5 text-blue-400 shrink-0" />
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mô tả lỗi *</label>
                          <textarea value={ncrFormData.issueDescription || ''} onChange={e => setNcrFormData({...ncrFormData, issueDescription: e.target.value})} className="w-full px-4 py-3 border border-red-100 rounded-xl bg-red-50/30 text-sm font-bold text-slate-800 outline-none resize-none" rows={3} placeholder="Mô tả cụ thể sự không phù hợp..."/>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Người phụ trách</label>
                              <input value={ncrFormData.responsiblePerson || ''} onChange={e => setNcrFormData({...ncrFormData, responsiblePerson: e.target.value})} className="w-full px-4 py-2 border rounded-xl text-xs font-bold" placeholder="Nhập tên..."/>
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Hạn xử lý</label>
                              <input type="date" value={ncrFormData.deadline || ''} onChange={e => setNcrFormData({...ncrFormData, deadline: e.target.value})} className="w-full px-3 py-2 border rounded-xl text-xs font-bold font-mono"/>
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mức độ</label>
                              <select value={ncrFormData.severity || 'MINOR'} onChange={e => setNcrFormData({...ncrFormData, severity: e.target.value as any})} className="w-full px-4 py-2 border rounded-xl text-xs font-bold bg-white">
                                  <option value="MINOR">MINOR</option>
                                  <option value="MAJOR">MAJOR</option>
                                  <option value="CRITICAL">CRITICAL</option>
                              </select>
                          </div>
                      </div>

                      <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Hình ảnh trước xử lý</label>
                          <div className="flex flex-wrap gap-3">
                                <button 
                                    onClick={() => ncrImageInputRef.current?.click()}
                                    className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors"
                                >
                                    <Camera className="w-5 h-5" />
                                    <span className="text-[8px] font-black mt-1">THÊM ẢNH</span>
                                </button>
                                {ncrFormData.imagesBefore?.map((img, idx) => (
                                    <div key={idx} className="relative w-16 h-16 group">
                                        <img src={img} className="w-full h-full object-cover rounded-xl border" />
                                        <button onClick={() => setNcrFormData(prev => ({...prev, imagesBefore: prev.imagesBefore?.filter((_, i) => i !== idx)}))} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"><X className="w-3 h-3"/></button>
                                    </div>
                                ))}
                                <input type="file" ref={ncrImageInputRef} multiple accept="image/*" className="hidden" onChange={handleNCRImagesUpload} />
                          </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                          <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest italic">Sử dụng Gemini AI để phân tích lỗi?</p>
                          <button 
                            onClick={handleAiConsult}
                            disabled={isAiConsulting}
                            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase hover:bg-indigo-100 transition-all active:scale-95 disabled:opacity-50"
                          >
                            {isAiConsulting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            AI Tư vấn lỗi
                          </button>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nguyên nhân gốc rễ</label>
                          <textarea value={ncrFormData.rootCause || ''} onChange={e => setNcrFormData({...ncrFormData, rootCause: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-xs font-bold text-slate-700 outline-none resize-none" rows={2} placeholder="Phân tích nguyên nhân..."/>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Biện pháp xử lý</label>
                          <textarea value={ncrFormData.solution || ''} onChange={e => setNcrFormData({...ncrFormData, solution: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-xs font-bold text-slate-700 outline-none resize-none" rows={2} placeholder="Nhập hướng khắc phục..."/>
                      </div>
                  </div>
                  <div className="p-4 border-t bg-slate-50 flex justify-end gap-3 shrink-0">
                      <button onClick={() => setNcrModalItem(null)} className="px-6 py-2 text-xs font-black uppercase text-slate-500">Hủy</button>
                      <button onClick={handleSaveNCR} className="bg-red-600 text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase shadow-lg active:scale-95 transition-all">Lưu NCR</button>
                  </div>
              </div>
          </div>
      )}

      {showLibraryModal && (
          <div className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in duration-200">
                  <div className="p-5 bg-blue-600 text-white flex justify-between items-center">
                      <h3 className="font-black uppercase tracking-tight">Tra cứu thư viện lỗi</h3>
                      <button onClick={() => setShowLibraryModal(false)}><X className="w-6 h-6"/></button>
                  </div>
                  <div className="p-4 border-b">
                      <input value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-xs outline-none" placeholder="Tìm kiếm lỗi nhanh..."/>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
                      {availableDefects.map(def => (
                          <div key={def.id} onClick={() => { setNcrFormData({...ncrFormData, defect_code: def.code, issueDescription: def.description, severity: def.severity, solution: def.suggestedAction}); setShowLibraryModal(false); }} className="p-4 hover:bg-blue-50 border-b border-slate-50 cursor-pointer transition-all active:scale-[0.98]">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{def.code}</span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{def.name}</span>
                              </div>
                              <p className="text-sm font-bold text-slate-800 mt-1 leading-snug">{def.description}</p>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
