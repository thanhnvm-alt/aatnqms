
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckStatus, Inspection, InspectionStatus, Priority, PlanItem, CheckItem, Workshop, User, NCR, DefectLibraryItem } from '../types';
import { INITIAL_CHECKLIST_TEMPLATE } from '../constants';
import { fetchPlans, fetchDefectLibrary } from '../services/apiService'; 
import { generateNCRSuggestions } from '../services/geminiService';
import { QRScannerModal } from './QRScannerModal';
import { 
  Save, ArrowLeft, Image as ImageIcon, X, Trash2, 
  Plus, PlusCircle, Layers, QrCode,
  ChevronDown, AlertTriangle, Calendar, ClipboardList, 
  Hash, Box, Loader2, PenTool, Eraser, Edit2, Check, Maximize2,
  Sparkles, Camera, Clock, Info, User as UserIcon, Search
} from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';

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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const ncrImageInputRef = useRef<HTMLInputElement>(null);
  const ncrCameraInputRef = useRef<HTMLInputElement>(null);
  
  // activeUploadId can be 'MAIN', or an item ID like 'site_1'
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
  const [editingImageIdx, setEditingImageIdx] = useState<{ type: 'MAIN' | 'ITEM', itemId?: string, index: number } | null>(null);

  const qcCanvasRef = useRef<HTMLCanvasElement>(null);
  const prodCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingQC, setIsDrawingQC] = useState(false);
  const [isDrawingProd, setIsDrawingProd] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    fetchDefectLibrary().then(setDefectLibrary);
  }, []);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent, canvasRef: React.RefObject<HTMLCanvasElement>, setDrawing: (v: boolean) => void) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 3;
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
            next.passedQuantity = Math.max(0, val - (prev.failedQuantity || 0));
        } else if (field === 'passedQuantity') {
            next.passedQuantity = val;
            next.failedQuantity = Math.max(0, (prev.inspectedQuantity || 0) - val);
        } else if (field === 'failedQuantity') {
            next.failedQuantity = val;
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
      // Fixed: Property 'stage' and 'code' do not exist on type 'DefectLibraryItem'. Replaced with applicable_process and defect_code.
      return defectLibrary.filter(d => 
          (!stage || d.applicable_process.toLowerCase() === stage.toLowerCase()) &&
          (!librarySearch || d.defect_code.toLowerCase().includes(librarySearch.toLowerCase()) || d.description.toLowerCase().includes(librarySearch.toLowerCase()))
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
      notes: '',
      images: []
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
          deadline: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
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
    if (!files || files.length === 0 || !activeUploadId) return;
    
    const processed = await Promise.all(Array.from(files).map(async (file: File) => 
        await resizeImage(await new Promise<string>(res => {
            const r = new FileReader(); 
            r.onload = () => res(r.result as string); 
            r.readAsDataURL(file);
        }))
    ));

    if (activeUploadId === 'MAIN') {
        setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...processed] }));
    } else {
        // Assume activeUploadId is the item ID
        const itemId = activeUploadId;
        setFormData(prev => ({
            ...prev,
            items: prev.items?.map(item => item.id === itemId ? { ...item, images: [...(item.images || []), ...processed] } : item)
        }));
    }
    
    setActiveUploadId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
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
      if (ncrCameraInputRef.current) ncrCameraInputRef.current.value = '';
  };

  const handleUpdateImage = (index: number, updatedImage: string) => {
    if (!editingImageIdx) return;
    
    if (editingImageIdx.type === 'MAIN') {
        setFormData(prev => ({
            ...prev,
            images: prev.images?.map((img, i) => i === index ? updatedImage : img)
        }));
    } else if (editingImageIdx.type === 'ITEM' && editingImageIdx.itemId) {
        const itemId = editingImageIdx.itemId;
        setFormData(prev => ({
            ...prev,
            items: prev.items?.map(item => item.id === itemId ? { ...item, images: item.images?.map((img, i) => i === index ? updatedImage : img) } : item)
        }));
    }
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
      // Fixed: Property 'code' does not exist on type 'DefectLibraryItem'. Replaced with defect_code.
      return defectLibrary.find(d => d.defect_code === ncrFormData.defect_code);
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
        case 'IQC': return 'IQC - VẬT LIỆU';
        case 'PQC': return 'PQC - SẢN XUẤT';
        case 'FQC': return 'FQC - THÀNH PHẨM';
        case 'SITE': return 'SITE - CÔNG TRÌNH';
        default: return `${mod} - KIỂM TRA`;
    }
  };

  return (
    <div className="bg-slate-50 h-full flex flex-col relative overflow-hidden">
      {/* Hidden inputs for Image Management */}
      <input type="file" accept="image/*" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handleFileChange} className="hidden" />

      {showScanner && (
        <QRScannerModal 
          onClose={() => setShowScanner(false)}
          onScan={(data) => {
            handleAutoFillFromCode(data);
            setShowScanner(false);
          }}
          title="Quét QR Sản Phẩm"
          subtitle="Tự động điền thông tin Headcode/Mã NM"
        />
      )}

      {editingImageIdx !== null && (
          <ImageEditorModal 
            images={editingImageIdx.type === 'MAIN' ? (formData.images || []) : (formData.items?.find(i => i.id === editingImageIdx.itemId)?.images || [])} 
            initialIndex={editingImageIdx.index} 
            onSave={handleUpdateImage} 
            onClose={() => setEditingImageIdx(null)} 
          />
      )}

      {/* Sticky Header Optimized for Mobile */}
      <div className="bg-white px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 z-[100] shadow-sm shrink-0 h-16">
        <button onClick={onCancel} className="p-2.5 text-slate-400 hover:text-slate-600 active:scale-90 transition-transform"><ArrowLeft className="w-6 h-6"/></button>
        <div className="text-center overflow-hidden">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-tight leading-none">PHIẾU KIỂM TRA MỚI</h2>
            <div className="mt-1"><span className="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[8px] font-black uppercase border border-blue-700 shadow-sm">{getModuleLabel()}</span></div>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white p-2.5 rounded-xl shadow-lg shadow-blue-500/30 active:scale-95 transition-all">
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar bg-slate-50/30">
        <div className="max-w-3xl mx-auto p-4 space-y-6 pb-32">
          
          {/* Visual Evidence Section */}
          <section className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                  <Camera className="w-4 h-4 text-slate-400" />
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">HÌNH ÁNH HIỆN TRƯỜNG ({formData.images?.length || 0})</h3>
              </div>
              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap gap-3">
                  <button 
                    onClick={() => { setActiveUploadId('MAIN'); cameraInputRef.current?.click(); }}
                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 flex flex-col items-center justify-center text-indigo-600 active:scale-95 transition-all shadow-inner"
                  >
                      <Camera className="w-6 h-6" />
                      <span className="text-[8px] font-black mt-1 uppercase">Chụp</span>
                  </button>
                  <button 
                    onClick={() => { setActiveUploadId('MAIN'); fileInputRef.current?.click(); }}
                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 flex flex-col items-center justify-center text-blue-500 active:scale-95 transition-all shadow-inner"
                  >
                      <Plus className="w-6 h-6" />
                      <span className="text-[8px] font-black mt-1 uppercase">Thư viện</span>
                  </button>

                  {formData.images?.map((img, idx) => (
                      <div key={idx} className="relative w-20 h-20 group cursor-pointer" onClick={() => setEditingImageIdx({ type: 'MAIN', index: idx })}>
                          <img src={img} className="w-full h-full object-cover rounded-2xl border border-slate-100 shadow-sm transition-all group-hover:scale-105" />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                              <PenTool className="text-white w-4 h-4" />
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setFormData(prev => ({...prev, images: prev.images?.filter((_, i) => i !== idx)})); }} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 shadow-md opacity-100"><X className="w-3 h-3"/></button>
                      </div>
                  ))}
              </div>
          </section>

          {/* Core Info Section */}
          <section className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                  <Box className="w-4 h-4 text-blue-600" />
                  <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">THÔNG TIN ĐỐI TƯỢNG</h3>
              </div>
              <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm space-y-5">
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MÃ NHÀ MÁY / HEADCODE *</label>
                      <div className="relative group">
                          <input value={formData.ma_nha_may} onChange={handleMaNhaMayChange} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-base font-black text-slate-800 focus:bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all pr-12 shadow-inner" placeholder="9 hoặc 13 ký tự..."/>
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              {isSearchingPlan && <Loader2 className="w-5 h-5 text-blue-500 animate-spin mr-1" />}
                              <button onClick={() => setShowScanner(true)} className="p-2.5 bg-white text-blue-600 rounded-xl shadow-md border border-slate-100 active:scale-90 transition-all"><QrCode className="w-5 h-5"/></button>
                          </div>
                      </div>
                  </div>
                  
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TÊN SẢN PHẨM *</label>
                      <input value={formData.ten_hang_muc} onChange={e => setFormData({...formData, ten_hang_muc: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:bg-white outline-none transition-all shadow-inner" placeholder="Tên SP..."/>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MÃ CÔNG TRÌNH *</label>
                          <input value={formData.ma_ct} onChange={e => setFormData({...formData, ma_ct: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-800 focus:bg-white outline-none transition-all shadow-inner" placeholder="Mã CT..."/>
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TÊN CÔNG TRÌNH</label>
                          <input value={formData.ten_ct} onChange={e => setFormData({...formData, ten_ct: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:bg-white outline-none transition-all shadow-inner truncate" placeholder="Tên CT..."/>
                      </div>
                  </div>
              </div>
          </section>

          {/* Logistics Section */}
          <section className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                  <ClipboardList className="w-4 h-4 text-orange-600" />
                  <h3 className="text-[10px] font-black text-orange-600 uppercase tracking-widest">ĐỊA ĐIỂM & CÔNG ĐOẠN</h3>
              </div>
              <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">XƯỞNG / KHO</label>
                          <div className="relative">
                              <select value={formData.workshop || ''} onChange={e => setFormData({...formData, workshop: e.target.value, inspectionStage: ''})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black text-slate-800 outline-none appearance-none shadow-inner">
                                  <option value="">-- Chọn --</option>
                                  {workshops.map(ws => <option key={ws.id} value={ws.name}>{ws.name}</option>)}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          </div>
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CÔNG ĐOẠN</label>
                          <div className="relative">
                              <select value={formData.inspectionStage || ''} onChange={e => setFormData({...formData, inspectionStage: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black text-slate-800 outline-none appearance-none shadow-inner">
                                  <option value="">-- Chọn --</option>
                                  {availableStages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          </div>
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">NGÀY KIỂM TRA</label>
                          <div className="relative">
                              <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-800 focus:bg-white outline-none transition-all shadow-inner" />
                              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          </div>
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">QC THỰC HIỆN</label>
                          <input value={formData.inspectorName} readOnly className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-2xl text-xs font-black text-slate-500 uppercase cursor-not-allowed shadow-inner" />
                      </div>
                  </div>
              </div>
          </section>

          {/* Quantities Section */}
          <section className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                  <Hash className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">SỐ LƯỢNG (DVT: {formData.dvt})</h3>
              </div>
              <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">SL ĐƠN HÀNG (IPO)</label>
                          <input 
                              type="number" step="any"
                              value={formData.so_luong_ipo} 
                              onChange={e => handleQuantityChange('so_luong_ipo', e.target.value)} 
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-base font-black text-slate-900 focus:bg-white outline-none transition-all shadow-inner" 
                          />
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest block ml-1">SL KIỂM TRA</label>
                          <input 
                              type="number" step="any"
                              value={formData.inspectedQuantity} 
                              onChange={e => handleQuantityChange('inspectedQuantity', e.target.value)} 
                              className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-2xl text-base font-black text-blue-700 focus:bg-white outline-none transition-all shadow-inner" 
                          />
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                      <div className="space-y-1.5">
                          <div className="flex justify-between items-center ml-1">
                              <label className="text-[10px] font-black text-green-600 uppercase tracking-widest">SL ĐẠT</label>
                              <span className="text-[10px] font-black text-green-500 bg-green-50 px-1.5 rounded-full">{stats.passPct}%</span>
                          </div>
                          <input 
                              type="number" step="any"
                              value={formData.passedQuantity} 
                              onChange={e => handleQuantityChange('passedQuantity', e.target.value)} 
                              className="w-full px-4 py-3 bg-green-50 border border-green-200 rounded-2xl text-base font-black text-green-700 focus:bg-white outline-none transition-all shadow-inner" 
                          />
                      </div>
                      <div className="space-y-1.5">
                          <div className="flex justify-between items-center ml-1">
                              <label className="text-[10px] font-black text-red-600 uppercase tracking-widest">SL LỖI</label>
                              <span className="text-[10px] font-black text-red-500 bg-red-50 px-1.5 rounded-full">{stats.failPct}%</span>
                          </div>
                          <input 
                              type="number" step="any"
                              value={formData.failedQuantity} 
                              onChange={e => handleQuantityChange('failedQuantity', e.target.value)} 
                              className="w-full px-4 py-3 bg-red-50 border border-red-200 rounded-2xl text-base font-black text-red-700 focus:bg-white outline-none transition-all shadow-inner" 
                          />
                      </div>
                  </div>
              </div>
          </section>

          {/* Items Checklist Section */}
          <section className="space-y-3">
              <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-slate-800" />
                      <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">TIÊU CHÍ KIỂM TRA ({formData.items?.length || 0})</h3>
                  </div>
                  <button onClick={() => handleAddItem()} className="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 active:scale-95 transition-all shadow-md">
                      <PlusCircle className="w-3.5 h-3.5" /> Thêm nhóm
                  </button>
              </div>

              <div className="space-y-8">
                  {Object.entries(groupedItems).map(([cat, items]: [string, CheckItem[]]) => (
                      <div key={cat} className="space-y-4 animate-in slide-in-from-bottom duration-300">
                          <div className="flex items-center justify-between bg-slate-200/50 px-4 py-2.5 rounded-2xl border border-slate-300 shadow-sm">
                              <div className="flex items-center gap-2 flex-1 overflow-hidden">
                                  {editingCategory?.name === cat ? (
                                      <div className="flex items-center gap-1 w-full max-w-xs">
                                          <input 
                                              autoFocus
                                              value={editingCategory.value} 
                                              onChange={e => setEditingCategory({...editingCategory, value: e.target.value})}
                                              onKeyDown={e => e.key === 'Enter' && handleUpdateCategoryName(cat)}
                                              className="px-3 py-1 text-[11px] font-black uppercase text-blue-700 border-2 border-blue-400 rounded-xl outline-none w-full bg-white"
                                          />
                                          <button onClick={() => handleUpdateCategoryName(cat)} className="p-1.5 text-green-600 bg-white rounded-xl shadow-sm border border-green-100 active:scale-90"><Check className="w-4 h-4"/></button>
                                          <button onClick={() => setEditingCategory(null)} className="p-1.5 text-slate-400 bg-white rounded-xl shadow-sm border border-slate-100 active:scale-90"><X className="w-4 h-4"/></button>
                                      </div>
                                  ) : (
                                      <>
                                          <span className="text-[11px] font-black uppercase text-slate-700 tracking-widest truncate">{cat}</span>
                                          <div className="flex items-center gap-1">
                                              <button onClick={(e) => { e.stopPropagation(); setEditingCategory({name: cat, value: cat}); }} className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 className="w-3 h-3"/></button>
                                              <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3 h-3"/></button>
                                          </div>
                                      </>
                                  )}
                              </div>
                              <button 
                                  onClick={() => handleAddItem(cat)}
                                  className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase hover:bg-white px-3 py-1.5 rounded-xl transition-all active:scale-95"
                              >
                                  <Plus className="w-3.5 h-3.5"/> Thêm mục
                              </button>
                          </div>

                          <div className="space-y-4">
                              {items.map(item => (
                                  <div key={item.id} className="bg-white rounded-[1.5rem] border border-slate-200 overflow-hidden shadow-sm">
                                      <div className="p-4 space-y-4">
                                          <div className="flex justify-between items-start gap-4">
                                              <div className="flex-1">
                                                  <textarea 
                                                      value={item.label} 
                                                      onChange={e => updateItem(item.id, { label: e.target.value })}
                                                      className="w-full px-1 py-0.5 text-sm font-bold text-slate-800 bg-transparent border-b border-dashed border-slate-200 focus:border-blue-500 outline-none transition-all resize-none min-h-[1.5rem]"
                                                      rows={1}
                                                      onInput={(e) => { 
                                                          const target = e.target as HTMLTextAreaElement;
                                                          target.style.height = 'auto';
                                                          target.style.height = target.scrollHeight + 'px';
                                                      }}
                                                      placeholder="Mô tả tiêu chí..."
                                                  />
                                              </div>
                                              <div className="flex gap-1.5 shrink-0 items-center">
                                                  <button onClick={(e) => { e.stopPropagation(); handleOpenNCR(item); }} className={`p-2 rounded-xl transition-all active:scale-90 ${item.ncr ? 'bg-red-600 text-white shadow-md' : 'text-red-500 bg-red-50 hover:bg-red-100'}`} title="Phiếu NCR"><AlertTriangle className="w-4.5 h-4.5"/></button>
                                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} className="p-2 text-slate-300 hover:text-red-500 active:scale-90 transition-all"><Trash2 className="w-4.5 h-4.5"/></button>
                                              </div>
                                          </div>
                                          
                                          <div className="flex gap-2">
                                              <button 
                                                  onClick={() => handleItemStatusChange(item, CheckStatus.PASS)}
                                                  className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase border-2 transition-all active:scale-95 ${item.status === CheckStatus.PASS ? 'bg-green-600 border-green-600 text-white shadow-lg shadow-green-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                                              >ĐẠT</button>
                                              <button 
                                                  onClick={() => handleItemStatusChange(item, CheckStatus.FAIL)}
                                                  className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase border-2 transition-all active:scale-95 ${item.status === CheckStatus.FAIL ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                                              >LỖI</button>
                                              <button 
                                                  onClick={() => handleItemStatusChange(item, CheckStatus.CONDITIONAL)}
                                                  className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase border-2 transition-all active:scale-95 ${item.status === CheckStatus.CONDITIONAL ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                                              >COND.</button>
                                          </div>

                                          {/* Item-level images */}
                                          <div className="space-y-2">
                                              <div className="flex items-center justify-between">
                                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ảnh minh chứng tiêu chí</label>
                                                  <div className="flex gap-2">
                                                      <button 
                                                          onClick={() => { setActiveUploadId(item.id); cameraInputRef.current?.click(); }}
                                                          className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100 active:scale-90 transition-all"
                                                          title="Chụp ảnh cho mục này"
                                                      >
                                                          <Camera className="w-3.5 h-3.5" />
                                                      </button>
                                                      <button 
                                                          onClick={() => { setActiveUploadId(item.id); fileInputRef.current?.click(); }}
                                                          className="p-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 active:scale-90 transition-all"
                                                          title="Tải ảnh từ thư viện"
                                                      >
                                                          <ImageIcon className="w-3.5 h-3.5" />
                                                      </button>
                                                  </div>
                                              </div>
                                              {item.images && item.images.length > 0 ? (
                                                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                                      {item.images.map((img, idx) => (
                                                          <div key={idx} className="relative w-16 h-16 shrink-0 group cursor-pointer" onClick={() => setEditingImageIdx({ type: 'ITEM', itemId: item.id, index: idx })}>
                                                              <img src={img} className="w-full h-full object-cover rounded-xl border border-slate-100 shadow-sm" />
                                                              <button onClick={(e) => { e.stopPropagation(); updateItem(item.id, { images: item.images?.filter((_, i) => i !== idx) }); }} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md"><X className="w-2.5 h-2.5"/></button>
                                                          </div>
                                                      ))}
                                                  </div>
                                              ) : null}
                                          </div>

                                          <div className="relative group">
                                              <Edit2 className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-300 group-focus-within:text-blue-500" />
                                              <textarea 
                                                value={item.notes}
                                                onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                                                placeholder="Ghi chú chi tiết cho mục này..."
                                                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium text-slate-600 focus:bg-white focus:ring-4 focus:ring-blue-100/50 outline-none resize-none shadow-inner"
                                                rows={1}
                                              />
                                          </div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  ))}
              </div>
          </section>

          {/* Signature Section */}
          <section className="space-y-4 pt-6 border-t border-slate-200">
              <div className="flex items-center gap-2 px-1">
                  <PenTool className="w-4 h-4 text-blue-600" />
                  <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">XÁC NHẬN CHỮ KÝ</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
                  <div className="space-y-2">
                      <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">QC INSPECTOR</label>
                          <button onClick={() => clearCanvas(qcCanvasRef)} className="text-[9px] font-black text-red-500 uppercase flex items-center gap-1 active:scale-90"><Eraser className="w-3 h-3"/> Xóa</button>
                      </div>
                      <div className="bg-white border-2 border-dashed border-slate-200 rounded-[2rem] h-48 relative overflow-hidden shadow-inner">
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
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02]">
                              <PenTool className="w-20 h-20 text-black" />
                          </div>
                      </div>
                      <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">{formData.inspectorName}</p>
                  </div>

                  <div className="space-y-2">
                      <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">ĐẠI DIỆN SẢN XUẤT</label>
                          <button onClick={() => clearCanvas(prodCanvasRef)} className="text-[9px] font-black text-red-500 uppercase flex items-center gap-1 active:scale-90"><Eraser className="w-3 h-3"/> Xóa</button>
                      </div>
                      <div className="bg-white border-2 border-dashed border-slate-200 rounded-[2rem] h-48 relative overflow-hidden shadow-inner">
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
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02]">
                              <PenTool className="w-20 h-20 text-black" />
                          </div>
                      </div>
                      <div className="relative">
                          <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                          <input 
                              value={formData.productionName || ''} 
                              onChange={e => setFormData({...formData, productionName: e.target.value.toUpperCase()})}
                              className="w-full text-center pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-700 outline-none uppercase placeholder:text-slate-300 shadow-sm"
                              placeholder="NHẬP TÊN NGƯỜI KÝ..."
                          />
                      </div>
                  </div>
              </div>
          </section>

        </div>
      </div>

      {/* Floating Save Hint for Mobile */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom duration-500 pointer-events-none lg:hidden">
          <div className="px-4 py-2 bg-slate-900/80 backdrop-blur-md text-white rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-2 border border-white/10 shadow-2xl">
              <Info className="w-3 h-3 text-blue-400" /> Bấm nút Save ở góc trên để lưu phiếu
          </div>
      </div>

      {/* NCR Form Modal (Reuse but optimize) */}
      {ncrModalItem && (
          <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-xl h-full md:h-auto md:max-h-[90vh] md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
                  <div className="px-6 py-4 bg-red-600 text-white flex justify-between items-center shrink-0">
                      <div className="flex gap-3 items-center">
                          <AlertTriangle className="w-6 h-6" />
                          <h3 className="font-black text-lg uppercase tracking-tight leading-none">PHIẾU NCR LỖI</h3>
                      </div>
                      <button onClick={() => setNcrModalItem(null)} className="p-2 active:scale-90"><X className="w-7 h-7"/></button>
                  </div>
                  <div className="p-6 space-y-6 overflow-y-auto no-scrollbar flex-1 pb-32 md:pb-6 bg-slate-50/50">
                      <div className="bg-blue-600 p-4 rounded-2xl text-white shadow-lg active:scale-95 transition-all cursor-pointer flex items-center justify-between" onClick={() => setShowLibraryModal(true)}>
                          <div className="flex items-center gap-3 overflow-hidden">
                              <Layers className="w-6 h-6 shrink-0" />
                              <div className="overflow-hidden">
                                  <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Thư viện lỗi chuẩn</p>
                                  <p className="text-xs font-black truncate">
                                      {/* Fixed: Property 'name' does not exist on type 'DefectLibraryItem'. Replaced with defect_name. */}
                                      {ncrFormData.defect_code ? `${ncrFormData.defect_code} - ${selectedDefectInfo?.defect_name || ''}` : 'CHỌN LỖI TỪ THƯ VIỆN'}
                                  </p>
                              </div>
                          </div>
                          <Plus className="w-5 h-5 shrink-0" />
                      </div>

                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MÔ TẢ LỖI PHÁT HIỆN *</label>
                          <textarea value={ncrFormData.issueDescription || ''} onChange={e => setNcrFormData({...ncrFormData, issueDescription: e.target.value})} className="w-full px-5 py-4 border-2 border-red-100 rounded-2xl bg-white text-sm font-bold text-slate-800 outline-none resize-none focus:border-red-500 shadow-sm" rows={3} placeholder="Mô tả cụ thể sai hỏng..."/>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">NGƯỜI CHỊU TRÁCH NHIỆM</label>
                              <input value={ncrFormData.responsiblePerson || ''} onChange={e => setNcrFormData({...ncrFormData, responsiblePerson: e.target.value.toUpperCase()})} className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-xs font-black uppercase bg-white shadow-inner" placeholder="TÊN NHÂN SỰ..."/>
                          </div>
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">HẠN XỬ LÝ (DEADLINE)</label>
                              <input type="date" value={ncrFormData.deadline || ''} onChange={e => setNcrFormData({...ncrFormData, deadline: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-xs font-black font-mono bg-white shadow-inner"/>
                          </div>
                      </div>

                      <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">HÌNH ÁNH TRỰC QUAN</label>
                          <div className="flex flex-wrap gap-3">
                                {/* NCR Camera Capture */}
                                <button 
                                    onClick={() => ncrCameraInputRef.current?.click()}
                                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 flex flex-col items-center justify-center text-indigo-400 hover:bg-indigo-50 active:scale-95 transition-all shadow-inner"
                                >
                                    <Camera className="w-6 h-6" />
                                    <span className="text-[8px] font-black mt-1 uppercase">CHỤP ÁNH</span>
                                </button>
                                
                                <button 
                                    onClick={() => ncrImageInputRef.current?.click()}
                                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-red-200 bg-red-50/30 flex flex-col items-center justify-center text-red-400 hover:bg-red-50 active:scale-95 transition-all shadow-inner"
                                >
                                    <ImageIcon className="w-6 h-6" />
                                    <span className="text-[8px] font-black mt-1 uppercase">THƯ VIỆN</span>
                                </button>
                                {ncrFormData.imagesBefore?.map((img, idx) => (
                                    <div key={idx} className="relative w-20 h-20 group">
                                        <img src={img} className="w-full h-full object-cover rounded-2xl border-2 border-white shadow-md" />
                                        <button onClick={() => setNcrFormData(prev => ({...prev, imagesBefore: prev.imagesBefore?.filter((_, i) => i !== idx)}))} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-lg active:scale-90"><X className="w-3.5 h-3.5"/></button>
                                    </div>
                                ))}
                                <input type="file" ref={ncrImageInputRef} multiple accept="image/*" className="hidden" onChange={handleNCRImagesUpload} />
                                <input type="file" ref={ncrCameraInputRef} accept="image/*" capture="environment" className="hidden" onChange={handleNCRImagesUpload} />
                          </div>
                      </div>

                      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                          <div className="flex justify-between items-center">
                              <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1.5"><Sparkles className="w-4 h-4"/> TRỢ LÝ AI PHÂN TÍCH</h4>
                              <button 
                                onClick={handleAiConsult}
                                disabled={isAiConsulting}
                                className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase shadow-lg active:scale-95 disabled:opacity-50 transition-all"
                              >
                                {isAiConsulting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Bắt đầu tư vấn'}
                              </button>
                          </div>

                          <div className="space-y-3">
                              <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nguyên nhân gốc rễ (AI suggested)</label>
                                  <textarea value={ncrFormData.rootCause || ''} onChange={e => setNcrFormData({...ncrFormData, rootCause: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium text-slate-700 outline-none resize-none min-h-[60px]" placeholder="Phân tích tại sao xảy ra lỗi..."/>
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Biện pháp khắc phục (Action Plan)</label>
                                  <textarea value={ncrFormData.solution || ''} onChange={e => setNcrFormData({...ncrFormData, solution: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium text-slate-700 outline-none resize-none min-h-[60px]" placeholder="Các bước xử lý tiếp theo..."/>
                              </div>
                          </div>
                      </div>
                  </div>
                  <div className="p-4 border-t bg-white flex justify-end gap-3 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] sticky bottom-0 z-50">
                      <button onClick={() => setNcrModalItem(null)} className="px-6 py-3 text-xs font-black uppercase text-slate-400 tracking-widest active:scale-95">HỦY BỎ</button>
                      <button onClick={handleSaveNCR} className="bg-red-600 text-white flex-1 md:flex-none px-12 py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-red-500/30 active:scale-95 transition-all">XÁC NHẬN NCR</button>
                  </div>
              </div>
          </div>
      )}

      {/* Library Modal (Reuse but clean) */}
      {showLibraryModal && (
          <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-none md:rounded-[3rem] shadow-2xl w-full max-w-lg h-full md:h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                  <div className="p-5 bg-blue-700 text-white flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-2">
                          <Layers className="w-6 h-6" />
                          <h3 className="font-black uppercase tracking-tighter">THƯ VIỆN SAI LỖI</h3>
                      </div>
                      <button onClick={() => setShowLibraryModal(false)} className="p-2 active:scale-90"><X className="w-7 h-7"/></button>
                  </div>
                  <div className="p-4 border-b bg-slate-50 shrink-0">
                      <div className="relative">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                            value={librarySearch} 
                            onChange={e => setLibrarySearch(e.target.value)} 
                            className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold shadow-inner outline-none focus:ring-4 focus:ring-blue-100" 
                            placeholder="Tìm kiếm lỗi chuẩn nhanh..."
                          />
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 no-scrollbar space-y-2 bg-slate-50/50">
                      {availableDefects.map(def => (
                          // Fixed: Property 'code', 'suggestedAction', 'category', 'name' do not exist on type 'DefectLibraryItem'.
                          <div key={def.id} onClick={() => { setNcrFormData({...ncrFormData, defect_code: def.defect_code, issueDescription: def.description, severity: def.severity, solution: def.suggested_action}); setShowLibraryModal(false); }} className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm active:scale-[0.98] transition-all hover:border-blue-300 group">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black text-blue-700 uppercase bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 shadow-sm">{def.defect_code}</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{def.applicable_process}</span>
                              </div>
                              <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight group-hover:text-blue-700 transition-colors">{def.defect_name}</h4>
                              <p className="text-xs font-medium text-slate-500 mt-2 leading-relaxed line-clamp-2 italic">"{def.description}"</p>
                          </div>
                      ))}
                      {availableDefects.length === 0 && (
                          <div className="py-20 text-center text-slate-400 flex flex-col items-center">
                              <Info className="w-10 h-10 mb-2 opacity-20" />
                              <p className="text-xs font-black uppercase tracking-widest">Không tìm thấy mã lỗi</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
