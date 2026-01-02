
// ... keep existing imports ...
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckStatus, Inspection, InspectionStatus, Priority, PlanItem, CheckItem, Workshop, User, NCR } from '../types';
import { INITIAL_CHECKLIST_TEMPLATE } from '../constants';
import { Button } from './Button';
import { generateItemSuggestion, generateNCRSuggestions } from '../services/geminiService';
import { fetchPlans } from '../services/apiService'; 
import { ImageEditorModal } from './ImageEditorModal';
import { 
  Save, ArrowLeft, Camera, Image as ImageIcon, FileSpreadsheet, X, Trash2, 
  Box, Factory, Hash, Plus, PenTool, Eraser, PlusCircle, Building2, 
  Layers, User as UserIcon, Images, Sparkles, Loader2, Maximize2, QrCode, Zap,
  ChevronDown, ChevronRight, List, AlertTriangle, FileWarning, Calendar, CheckCircle2,
  BrainCircuit, ArrowRight, ClipboardList, MapPin
} from 'lucide-react';
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
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } else {
        resolve(base64Str);
      }
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
  // ... keep existing state ...
  const [showPlanModal, setShowPlanModal] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prodCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [itemLoadingStates, setItemLoadingStates] = useState<Record<string, boolean>>({});
  const [isSearchingPlan, setIsSearchingPlan] = useState(false);
  const currentSearchRef = useRef<string>(''); 
  
  const [ncrModalItem, setNcrModalItem] = useState<{ itemId: string, itemLabel: string, ncrData?: NCR } | null>(null);
  const [ncrFormData, setNcrFormData] = useState<Partial<NCR>>({});
  const [isAnalyzingNCR, setIsAnalyzingNCR] = useState(false);

  const [editorState, setEditorState] = useState<{ itemId: string; images: string[]; index: number } | null>(null);

  const [qcSignMode, setQcSignMode] = useState<'VIEW' | 'EDIT'>(initialData?.signature ? 'VIEW' : 'EDIT');
  const [prodSignMode, setProdSignMode] = useState<'VIEW' | 'EDIT'>(initialData?.productionSignature ? 'VIEW' : 'EDIT');

  const [showScanner, setShowScanner] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerCanvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  const formType = initialData?.type || 'SITE';

  const getModuleLabel = () => {
      switch(formType) {
          case 'IQC': return 'IQC - Vật tư đầu vào';
          case 'SQC_MAT': return 'SQC - Gia công Vật tư';
          case 'SQC_BTP': return 'SQC - Gia công BTP';
          case 'FSR': return 'FSR - Duyệt mẫu đầu tiên';
          case 'PQC': return 'PQC - KIỂM TRA SẢN XUẤT';
          case 'SITE': return 'SITE - CÔNG TRÌNH';
          default: return 'SITE - CÔNG TRÌNH';
      }
  }

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
      signature: undefined, 
      productionSignature: undefined,
      productionName: '',
      type: formType as any,
    };

    if (initialData) {
      return {
        ...baseState,
        ...JSON.parse(JSON.stringify(initialData)),
        inspectorName: initialData.inspectorName || user?.name || baseState.inspectorName,
        items: initialData.items ? JSON.parse(JSON.stringify(initialData.items)) : baseState.items
      };
    }
    return baseState;
  });

  const availableStages = useMemo(() => {
    if (!formData.workshop) return [];
    const selectedWs = workshops.find(ws => ws.name === formData.workshop);
    return selectedWs?.stages || [];
  }, [formData.workshop, workshops]);

  useEffect(() => {
    const inspected = formData.inspectedQuantity || 0;
    const failed = formData.failedQuantity || 0;
    const passed = Math.max(0, inspected - failed);
    
    if (passed !== formData.passedQuantity) {
        setFormData(prev => ({ ...prev, passedQuantity: passed }));
    }
  }, [formData.inspectedQuantity, formData.failedQuantity]);

  const groupedItems = useMemo((): Record<string, CheckItem[]> => {
    const groups: { [key: string]: CheckItem[] } = {};
    (formData.items || []).forEach(item => {
        const cat = item.category || 'KHÁC';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
    });
    return groups;
  }, [formData.items]);

  const fillFormData = (match: PlanItem) => {
      setFormData(prev => ({
        ...prev,
        ma_nha_may: match.ma_nha_may, 
        headcode: match.headcode,
        ten_ct: match.ten_ct,
        ten_hang_muc: match.ten_hang_muc,
        ma_ct: match.ma_ct,
        dvt: match.dvt || prev.dvt, 
        so_luong_ipo: match.so_luong_ipo || prev.so_luong_ipo,
      }));
  };

  const handleFactoryCodeChange = async (code: string) => {
    setFormData(prev => ({ ...prev, ma_nha_may: code }));
    const trimmedCode = code.trim();
    currentSearchRef.current = trimmedCode; 

    if (!trimmedCode) return;
    const len = trimmedCode.length;
    if (len !== 9 && len !== 12) return;

    const localMatch = plans.find(p => 
        (len === 9 && String(p.headcode || '').trim().toLowerCase() === trimmedCode.toLowerCase()) ||
        (len === 12 && String(p.ma_nha_may || '').trim().toLowerCase() === trimmedCode.toLowerCase())
    );

    if (localMatch) {
        fillFormData(localMatch);
        return;
    }

    setIsSearchingPlan(true);
    try {
        const result = await fetchPlans(trimmedCode, 1, 10);
        if (currentSearchRef.current !== trimmedCode) return;
        const serverMatch = result.items.find(p => 
            (len === 9 && String(p.headcode || '').trim().toLowerCase() === trimmedCode.toLowerCase()) ||
            (len === 12 && String(p.ma_nha_may || '').trim().toLowerCase() === trimmedCode.toLowerCase())
        );
        if (serverMatch) fillFormData(serverMatch);
    } catch (e) {
        console.error("Auto-fill error:", e);
    } finally {
        if (currentSearchRef.current === trimmedCode) setIsSearchingPlan(false);
    }
  };

  const updateItem = (id: string, updates: Partial<CheckItem | { images: string[] | undefined }>) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items?.map(item => item.id === id ? { ...item, ...updates } : item)
    }));
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
          imagesBefore: [],
          imagesAfter: []
      });
  };

  const handleAutoFillNCR = async () => {
      if (!ncrFormData.issueDescription) { alert("Vui lòng nhập mô tả lỗi"); return; }
      if (!ncrModalItem) return;
      setIsAnalyzingNCR(true);
      try {
          const suggestion = await generateNCRSuggestions(ncrFormData.issueDescription, ncrModalItem.itemLabel);
          setNcrFormData(prev => ({ ...prev, rootCause: suggestion.rootCause, solution: suggestion.solution }));
      } catch (e) { alert("Lỗi khi phân tích NCR: " + (e as Error).message); } finally { setIsAnalyzingNCR(false); }
  };

  const handleSaveNCR = () => {
      if (!ncrModalItem || !ncrFormData.issueDescription) { alert("Vui lòng nhập mô tả lỗi"); return; }
      const newNCR: NCR = {
          id: ncrModalItem.ncrData?.id || `NCR-${Date.now()}`,
          createdDate: ncrFormData.createdDate || new Date().toISOString().split('T')[0],
          issueDescription: ncrFormData.issueDescription,
          rootCause: ncrFormData.rootCause,
          solution: ncrFormData.solution,
          responsiblePerson: ncrFormData.responsiblePerson,
          deadline: ncrFormData.deadline,
          status: ncrFormData.status || 'OPEN',
          imagesBefore: ncrFormData.imagesBefore || [],
          imagesAfter: ncrFormData.imagesAfter || []
      };
      updateItem(ncrModalItem.itemId, { ncr: newNCR, status: CheckStatus.FAIL });
      setNcrModalItem(null); setNcrFormData({});
  };

  const handleAddNCRPhoto = (type: 'BEFORE' | 'AFTER') => { setActiveUploadId(`NCR_${type}`); fileInputRef.current?.click(); };
  const handleRemoveNCRPhoto = (type: 'BEFORE' | 'AFTER', index: number) => {
      if (type === 'BEFORE') setNcrFormData(prev => ({ ...prev, imagesBefore: prev.imagesBefore?.filter((_, i) => i !== index) }));
      else setNcrFormData(prev => ({ ...prev, imagesAfter: prev.imagesAfter?.filter((_, i) => i !== index) }));
  };

  const updateCategoryName = (oldName: string, newName: string) => {
      if (oldName === newName) return;
      setFormData(prev => ({ ...prev, items: prev.items?.map(item => item.category === oldName ? { ...item, category: newName } : item) }));
  };

  const handleAddItemToCategory = (category: string) => {
      const newItem: CheckItem = { id: `custom_${Date.now()}`, category: category, label: '', status: CheckStatus.PENDING, notes: '' };
      setFormData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
  };

  const handleAddNewCategory = () => {
      const newItem: CheckItem = { id: `new_cat_${Date.now()}`, category: 'DANH MỤC MỚI', label: '', status: CheckStatus.PENDING, notes: '' };
      setFormData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
  };

  const handleAIItemSuggest = async (itemId: string) => {
    const item = formData.items?.find(i => i.id === itemId);
    if (!item) return;
    setItemLoadingStates(prev => ({ ...prev, [itemId]: true }));
    try {
      const suggestion = await generateItemSuggestion(item, `${formData.ma_ct} - ${formData.ten_hang_muc}`);
      updateItem(itemId, { notes: suggestion });
    } catch (error) { console.error("AI Suggestion failed:", error); } finally { setItemLoadingStates(prev => ({ ...prev, [itemId]: false })); }
  };

  const handleRemoveItem = (id: string) => { setFormData(prev => ({ ...prev, items: prev.items?.filter(item => item.id !== id) })); };
  const handleRemoveCategory = (category: string) => {
      if (window.confirm(`Bạn có chắc muốn xóa toàn bộ danh mục "${category}"?`)) {
          setFormData(prev => ({ ...prev, items: prev.items?.filter(item => item.category !== category) }));
      }
  };

  const handleSave = () => {
    if (!formData.ma_ct || !formData.ten_hang_muc || !formData.inspectorName) { alert("Vui lòng điền đầy đủ thông tin bắt buộc"); return; }
    let score = 0;
    if (formData.inspectedQuantity && formData.inspectedQuantity > 0) {
        score = Math.round(((formData.passedQuantity || 0) / formData.inspectedQuantity) * 100);
    } else {
        const total = formData.items?.length || 1;
        const passed = formData.items?.filter(i => i.status === CheckStatus.PASS).length || 0;
        score = Math.round((passed / total) * 100);
    }
    const hasFailures = (formData.failedQuantity && formData.failedQuantity > 0) || formData.items?.some(i => i.status === CheckStatus.FAIL);
    const status = hasFailures ? InspectionStatus.FLAGGED : InspectionStatus.COMPLETED;
    onSave({ ...formData as Inspection, id: formData.id || `INS-${Date.now()}`, score, status: formData.status === InspectionStatus.DRAFT ? status : formData.status || status });
  };

  const handleAddPhoto = () => { setActiveUploadId('MAIN'); fileInputRef.current?.click(); };
  const handleAddItemPhoto = (itemId: string) => { setActiveUploadId(itemId); fileInputRef.current?.click(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const validImages = await Promise.all((Array.from(files) as File[]).map(async (file: File) => {
        if (!file.type.startsWith('image/')) return null;
        const reader = new FileReader();
        return new Promise<string | null>((resolve) => {
            reader.onloadend = async () => resolve(await resizeImage(reader.result as string));
            reader.readAsDataURL(file);
        });
    }));
    const imgs = validImages.filter((img): img is string => img !== null);
    if (activeUploadId === 'MAIN') setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...imgs] }));
    else if (activeUploadId === 'NCR_BEFORE') setNcrFormData(prev => ({ ...prev, imagesBefore: [...(prev.imagesBefore || []), ...imgs] }));
    else if (activeUploadId === 'NCR_AFTER') setNcrFormData(prev => ({ ...prev, imagesAfter: [...(prev.imagesAfter || []), ...imgs] }));
    else if (activeUploadId) {
        const currentItem = formData.items?.find(i => i.id === activeUploadId);
        updateItem(activeUploadId, { images: [...(currentItem?.images || []), ...imgs] });
    }
    setActiveUploadId(null); if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveProductPhoto = (index: number) => { setFormData(prev => ({ ...prev, images: prev.images?.filter((_, i) => i !== index) })); };
  const handleRemoveItemPhoto = (itemId: string, indexToRemove: number) => {
    const currentItem = formData.items?.find(i => i.id === itemId);
    if (currentItem?.images) updateItem(itemId, { images: currentItem.images.filter((_, idx) => idx !== indexToRemove) });
  };

  const handleOpenImageEditor = (itemId: string, images: string[], index: number) => { setEditorState({ itemId, images, index }); };
  const handleSaveEditedImage = (index: number, updatedImage: string) => {
    if (!editorState) return;
    const { itemId } = editorState;
    if (itemId === 'MAIN_GALLERY') {
      setFormData(prev => { const newImages = [...(prev.images || [])]; newImages[index] = updatedImage; return { ...prev, images: newImages }; });
    } else {
      setFormData(prev => ({ ...prev, items: prev.items?.map(item => item.id === itemId ? { ...item, images: item.images?.map((img, i) => i === index ? updatedImage : img) } : item) }));
    }
    setEditorState(prev => prev ? { ...prev, images: prev.images.map((img, i) => i === index ? updatedImage : img) } : null);
  };

  const handleSelectPlan = (item: PlanItem) => { fillFormData(item); setShowPlanModal(false); };

  const startDrawing = (canvas: HTMLCanvasElement | null, e: React.MouseEvent | React.TouchEvent) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
    const { x, y } = getPos(e, canvas); ctx.beginPath(); ctx.moveTo(x, y); setIsDrawing(true);
  };
  const draw = (canvas: HTMLCanvasElement | null, e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || !canvas) return;
      if ('touches' in e) e.preventDefault();
      const ctx = canvas.getContext('2d');
      if (ctx) { const { x, y } = getPos(e, canvas); ctx.lineTo(x, y); ctx.stroke(); }
  };
  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const stopDrawing = (type: 'QC' | 'PROD') => {
      if (isDrawing) {
          setIsDrawing(false);
          const canvas = type === 'QC' ? canvasRef.current : prodCanvasRef.current;
          if (canvas) {
              if (type === 'QC') setFormData(prev => ({ ...prev, signature: canvas.toDataURL() }));
              else setFormData(prev => ({ ...prev, productionSignature: canvas.toDataURL(), productionConfirmedDate: new Date().toISOString().split('T')[0] }));
          }
      }
  };
  const handleClearSignature = (type: 'QC' | 'PROD') => {
      if (type === 'QC') {
          setFormData(prev => ({ ...prev, signature: undefined })); setQcSignMode('EDIT');
          const ctx = canvasRef.current?.getContext('2d'); if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      } else {
          setFormData(prev => ({ ...prev, productionSignature: undefined, productionConfirmedDate: undefined })); setProdSignMode('EDIT');
          const ctx = prodCanvasRef.current?.getContext('2d'); if (ctx) ctx.clearRect(0, 0, prodCanvasRef.current!.width, prodCanvasRef.current!.height);
      }
  };

  const failRate = formData.inspectedQuantity ? Math.round(((formData.failedQuantity || 0) / formData.inspectedQuantity) * 100) : 0;
  const passRate = formData.inspectedQuantity ? Math.round(((formData.passedQuantity || 0) / formData.inspectedQuantity) * 100) : 0;

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
        } catch (err) { alert('Camera access denied'); setShowScanner(false); }
      };
      startCamera();
    }
    return () => { if (stream) stream.getTracks().forEach(track => track.stop()); if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [showScanner]);

  const tick = () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = scannerCanvasRef.current;
      const video = videoRef.current;
      if (canvas) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) { handleFactoryCodeChange(code.data.trim()); setShowScanner(false); return; }
        }
      }
    }
    if (showScanner) requestRef.current = requestAnimationFrame(tick);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col relative">
      <input type="file" accept="image/*" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      
      {/* Scanner & NCR Modals ... (keeping mostly same but wrapped) */}
      {showScanner && (
        <div className="fixed inset-0 z-[120] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
            <button onClick={() => setShowScanner(false)} className="absolute top-6 right-6 text-white p-3 bg-white/10 rounded-full active:scale-90 transition-transform"><X className="w-8 h-8"/></button>
            <div className="w-full max-w-sm aspect-square bg-slate-800 rounded-[2.5rem] overflow-hidden relative border-4 border-blue-500/50 shadow-[0_0_50px_rgba(37,99,235,0.4)]">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                <canvas ref={scannerCanvasRef} className="hidden" />
            </div>
            <p className="text-blue-400 mt-10 font-bold text-xs uppercase tracking-[0.2em] animate-pulse">Scanning QR...</p>
        </div>
      )}

      {editorState && (
        <ImageEditorModal 
          images={editorState.images}
          initialIndex={editorState.index}
          onSave={handleSaveEditedImage}
          onClose={() => setEditorState(null)}
        />
      )}

      {ncrModalItem && (
          <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh]">
                  {/* ... NCR Modal Content ... */}
                  <div className="px-6 py-4 bg-[#DC2626] text-white flex justify-between items-start shrink-0">
                      <div className="flex gap-3">
                          <div className="mt-1"><AlertTriangle className="w-6 h-6" /></div>
                          <div>
                              <h3 className="font-black text-lg leading-none uppercase tracking-tight">PHIẾU NCR - SỰ KHÔNG PHÙ HỢP</h3>
                              <p className="text-sm font-medium opacity-90 mt-1 truncate max-w-[200px]">{ncrModalItem.itemLabel}</p>
                          </div>
                      </div>
                      <button onClick={() => setNcrModalItem(null)} className="text-white/80 hover:text-white transition-colors active:scale-90"><X className="w-6 h-6"/></button>
                  </div>
                  
                  <div className="p-6 space-y-5 overflow-y-auto no-scrollbar">
                      {/* Description Section */}
                      <div>
                          <div className="flex justify-between items-end mb-2">
                              <label className="text-xs font-bold text-slate-500 uppercase">MÔ TẢ LỖI *</label>
                              <button 
                                onClick={handleAutoFillNCR}
                                disabled={isAnalyzingNCR}
                                className="text-[10px] font-black text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1 rounded-full flex items-center gap-1.5 transition-colors disabled:opacity-50"
                              >
                                {isAnalyzingNCR ? <Loader2 className="w-3 h-3 animate-spin"/> : <BrainCircuit className="w-3 h-3"/>}
                                {isAnalyzingNCR ? 'Đang phân tích...' : 'AI Phân tích & Đề xuất'}
                              </button>
                          </div>
                          <textarea 
                              value={ncrFormData.issueDescription || ''}
                              onChange={e => setNcrFormData({...ncrFormData, issueDescription: e.target.value})}
                              className="w-full px-4 py-3 border border-red-200 rounded-xl bg-red-50 text-slate-800 text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none font-medium"
                              rows={3}
                              placeholder="Mô tả chi tiết vấn đề..."
                          />
                      </div>

                      {/* Responsibility & Deadline */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">NGƯỜI CHỊU TRÁCH NHIỆM</label>
                              <input 
                                type="text"
                                value={ncrFormData.responsiblePerson || ''}
                                onChange={e => setNcrFormData({...ncrFormData, responsiblePerson: e.target.value})}
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Tên nhân viên/Bộ phận"
                              />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">HẠN XỬ LÝ</label>
                              <input 
                                type="date"
                                value={ncrFormData.deadline || ''}
                                onChange={e => setNcrFormData({...ncrFormData, deadline: e.target.value})}
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                          </div>
                      </div>

                      {/* Images Section */}
                      <div className="grid grid-cols-2 gap-4 py-2">
                          {/* Before Images */}
                          <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                  <label className="text-[10px] font-black text-red-500 uppercase flex items-center gap-1.5"><FileWarning className="w-4 h-4" /> TRƯỚC XỬ LÝ</label>
                                  <button onClick={() => handleAddNCRPhoto('BEFORE')} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-full transition-colors"><PlusCircle className="w-5 h-5"/></button>
                              </div>
                              <div className="border-2 border-dashed border-red-200 rounded-xl p-2 min-h-[80px] bg-red-50/30">
                                  <div className="flex flex-wrap gap-2">
                                      {ncrFormData.imagesBefore && ncrFormData.imagesBefore.length > 0 ? (
                                          ncrFormData.imagesBefore.map((img, idx) => (
                                              <div key={idx} className="relative w-16 h-16 group"><img src={img} className="w-full h-full object-cover rounded-lg shadow-sm" /><button onClick={() => handleRemoveNCRPhoto('BEFORE', idx)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-md"><X className="w-3 h-3"/></button></div>
                                          ))
                                      ) : (<div className="w-full h-16 flex items-center justify-center text-red-300 text-xs font-medium cursor-pointer" onClick={() => handleAddNCRPhoto('BEFORE')}>Trống</div>)}
                                  </div>
                              </div>
                          </div>
                          {/* After Images */}
                          <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                  <label className="text-[10px] font-black text-green-600 uppercase flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> SAU XỬ LÝ</label>
                                  <button onClick={() => handleAddNCRPhoto('AFTER')} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-full transition-colors"><PlusCircle className="w-5 h-5"/></button>
                              </div>
                              <div className="border-2 border-dashed border-green-200 rounded-xl p-2 min-h-[80px] bg-green-50/30">
                                  <div className="flex flex-wrap gap-2">
                                      {ncrFormData.imagesAfter && ncrFormData.imagesAfter.length > 0 ? (
                                          ncrFormData.imagesAfter.map((img, idx) => (
                                              <div key={idx} className="relative w-16 h-16 group"><img src={img} className="w-full h-full object-cover rounded-lg shadow-sm" /><button onClick={() => handleRemoveNCRPhoto('AFTER', idx)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-md"><X className="w-3 h-3"/></button></div>
                                          ))
                                      ) : (<div className="w-full h-16 flex items-center justify-center text-green-300 text-xs font-medium cursor-pointer" onClick={() => handleAddNCRPhoto('AFTER')}>Trống</div>)}
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* Root Cause & Solution */}
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">NGUYÊN NHÂN GỐC RỄ</label>
                          <textarea 
                              value={ncrFormData.rootCause || ''}
                              onChange={e => setNcrFormData({...ncrFormData, rootCause: e.target.value})}
                              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-slate-50"
                              rows={2}
                              placeholder="Tại sao lỗi này xảy ra?"
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">BIỆN PHÁP KHẮC PHỤC</label>
                          <textarea 
                              value={ncrFormData.solution || ''}
                              onChange={e => setNcrFormData({...ncrFormData, solution: e.target.value})}
                              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-slate-50"
                              rows={2}
                              placeholder="Hướng xử lý..."
                          />
                      </div>
                  </div>

                  <div className="p-5 border-t border-slate-100 bg-white flex gap-4 justify-end shrink-0">
                      <button 
                        onClick={() => setNcrModalItem(null)}
                        className="px-6 py-2 text-slate-500 hover:text-slate-800 font-bold text-sm transition-colors"
                      >
                        Hủy bỏ
                      </button>
                      <button 
                        onClick={handleSaveNCR}
                        disabled={isAnalyzingNCR}
                        className="bg-[#DC2626] hover:bg-red-700 text-white px-6 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-red-500/30 active:scale-95 transition-all"
                      >
                        Lưu NCR
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Show Plan Modal */}
      {showPlanModal && (
          <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80%] flex flex-col overflow-hidden animate-in zoom-in duration-300">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-green-600"/> Chọn Kế Hoạch</h3>
                      <button onClick={() => setShowPlanModal(false)} className="p-2 text-slate-400 active:scale-90"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="overflow-y-auto p-2 space-y-2 no-scrollbar flex-1 min-h-0">
                      {plans.filter(p => p.status === 'PENDING').map(item => (
                          <div key={item.ma_nha_may} onClick={() => handleSelectPlan(item)} className="p-3 hover:bg-blue-50 border border-slate-100 rounded-xl cursor-pointer active:scale-95 transition-transform">
                              <div className="flex justify-between items-center mb-1">
                                  <span className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">{item.ma_ct}</span>
                                  <div className="flex gap-1">
                                    <span className="text-[10px] md:text-xs font-bold text-blue-600 font-mono bg-blue-50 px-1.5 py-0.5 rounded">{item.ma_nha_may}</span>
                                  </div>
                              </div>
                              <div className="font-bold text-slate-800 text-sm leading-tight">{item.ten_hang_muc}</div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* Main Header */}
      <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center sticky top-0 z-40 shadow-sm shrink-0">
        <button onClick={onCancel} className="p-2 text-slate-500 hover:text-slate-800 active:scale-90 transition-transform"><ArrowLeft className="w-5 h-5"/></button>
        <div className="flex flex-col items-center overflow-hidden">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tighter truncate max-w-[200px]">{initialData?.id ? 'SỬA PHIẾU' : 'TẠO PHIẾU MỚI'}</h2>
            <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full uppercase tracking-tighter">{getModuleLabel()}</span>
            </div>
        </div>
        <button onClick={handleSave} className="bg-blue-600 text-white p-2 rounded-xl shadow-lg shadow-blue-500/30 active:scale-90 transition-transform"><Save className="w-5 h-5"/></button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-3 md:p-6 space-y-4 pb-20 md:pb-8 no-scrollbar bg-slate-50">
        
        {/* 1. IMAGES SECTION */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
             <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Images className="w-4 h-4" /> Hình ảnh hiện trường ({formData.images?.length || 0})
             </h3>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex flex-wrap gap-3">
                {formData.images && formData.images.map((img, idx) => (
                  <div key={idx} className="relative w-20 h-20 md:w-24 md:h-24 group">
                    <img src={img} className="w-full h-full object-cover rounded-xl border border-slate-200 shadow-sm transition-transform active:scale-95" alt={`Img ${idx}`} />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 rounded-xl">
                        <button onClick={(e) => { e.stopPropagation(); handleOpenImageEditor('MAIN_GALLERY', formData.images!, idx); }} className="p-1 bg-white rounded-lg shadow text-blue-600 mr-1"><Maximize2 className="w-4 h-4"/></button>
                        <button onClick={(e) => { e.stopPropagation(); handleRemoveProductPhoto(idx); }} className="p-1 bg-red-500 text-white rounded-lg shadow"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
                <button onClick={handleAddPhoto} className="w-20 h-20 md:w-24 md:h-24 rounded-xl border-2 border-dashed border-blue-300 flex flex-col items-center justify-center text-blue-500 bg-blue-50/30 hover:bg-blue-50 transition-all active:scale-95 group">
                  <Plus className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-[8px] font-black uppercase">Thêm ảnh</span>
                </button>
              </div>
          </div>
        </div>

        {/* 2. SOURCE INFO SECTION */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
           <h3 className="text-sm font-black text-blue-600 uppercase tracking-tight flex items-center gap-2 border-b border-slate-100 pb-2">
               <Box className="w-4 h-4" /> Thông tin nguồn
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-1 mb-1 block">Mã Nhà Máy *</label>
                    <div className="flex gap-2 relative">
                      <input value={formData.ma_nha_may} onChange={e => handleFactoryCodeChange(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-blue-700 text-sm focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all" placeholder="Nhập mã..." />
                      {isSearchingPlan && <div className="absolute right-12 top-1/2 -translate-y-1/2"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /></div>}
                      <button onClick={() => setShowScanner(true)} className="p-2.5 bg-blue-100 text-blue-600 rounded-xl shadow-sm active:scale-95 shrink-0 hover:bg-blue-200 transition-colors"><QrCode className="w-5 h-5" /></button>
                    </div>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-1 mb-1 block">Mã Công Trình *</label>
                    <input value={formData.ma_ct} onChange={e => setFormData({...formData, ma_ct: e.target.value})} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all" placeholder="Nhập mã CT..." />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-1 mb-1 block">Tên Công Trình</label>
                    <input value={formData.ten_ct} onChange={e => setFormData({...formData, ten_ct: e.target.value})} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-sm focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all" placeholder="Nhập tên CT..." />
                </div>
                <div className="md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-1 mb-1 block">Tên Sản Phẩm *</label>
                    <input value={formData.ten_hang_muc} onChange={e => setFormData({...formData, ten_hang_muc: e.target.value})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-medium text-sm focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all" placeholder="Nhập tên SP..." />
                </div>
           </div>
        </div>

        {/* 3. INSPECTION INFO SECTION (Matching the screenshot layout) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
           <h3 className="text-sm font-black text-orange-600 uppercase tracking-tight flex items-center gap-2 border-b border-slate-100 pb-2">
             <ClipboardList className="w-4 h-4" /> Thông tin kiểm tra
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Row 1 */}
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-1">Xưởng / Kho / Phòng</label>
                    <div className="relative">
                        <select 
                            value={formData.workshop || ''} 
                            onChange={e => setFormData(prev => ({ ...prev, workshop: e.target.value, inspectionStage: '' }))}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 focus:bg-white outline-none appearance-none transition-all focus:ring-2 focus:ring-orange-100"
                        >
                            <option value="">-- Chọn Xưởng --</option>
                            {workshops.map(ws => (
                                <option key={ws.id} value={ws.name}>{ws.name} ({ws.code})</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-1">Công đoạn sản xuất</label>
                    <div className="relative">
                        {availableStages.length > 0 ? (
                            <select 
                                value={formData.inspectionStage || ''} 
                                onChange={e => setFormData(prev => ({ ...prev, inspectionStage: e.target.value }))}
                                disabled={!formData.workshop}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 focus:bg-white outline-none appearance-none disabled:opacity-50 transition-all focus:ring-2 focus:ring-orange-100"
                            >
                                <option value="">-- Chọn công đoạn --</option>
                                {availableStages.map(stage => (
                                    <option key={stage} value={stage}>{stage}</option>
                                ))}
                            </select>
                        ) : (
                            <input 
                                type="text"
                                value={formData.inspectionStage || ''} 
                                onChange={e => setFormData(prev => ({ ...prev, inspectionStage: e.target.value }))}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 focus:bg-white outline-none transition-all focus:ring-2 focus:ring-orange-100"
                                placeholder="Nhập công đoạn..."
                            />
                        )}
                        {availableStages.length > 0 && <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />}
                    </div>
                </div>

                {/* Row 2 */}
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-1">QC Thực hiện *</label>
                    <input 
                        type="text" 
                        value={formData.inspectorName || ''} 
                        onChange={e => setFormData(prev => ({ ...prev, inspectorName: e.target.value.toUpperCase() }))}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 focus:bg-white outline-none uppercase transition-all focus:ring-2 focus:ring-orange-100"
                        placeholder="TÊN QC..."
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-1">Ngày kiểm tra</label>
                    <div className="relative">
                        <input 
                            type="date" 
                            value={formData.date || ''} 
                            onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 focus:bg-white outline-none transition-all focus:ring-2 focus:ring-orange-100"
                        />
                        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>
           </div>
        </div>

        {/* 4. QUANTITIES SECTION */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
           <h3 className="text-sm font-black text-indigo-900 uppercase tracking-tight flex items-center gap-2 border-b border-slate-100 pb-2">
               <Hash className="w-4 h-4" /> Số lượng kiểm tra
           </h3>
           <div className="grid grid-cols-2 gap-4">
                <div>
                     <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">SL Đơn hàng (IPO)</label>
                     <div className="relative">
                        <input type="number" inputMode="numeric" value={formData.so_luong_ipo} onChange={e => setFormData({...formData, so_luong_ipo: parseInt(e.target.value)||0})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-black text-slate-900 text-sm focus:ring-2 focus:ring-indigo-100 outline-none" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{formData.dvt}</span>
                     </div>
                </div>
                <div>
                     <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">SL Kiểm tra</label>
                     <input type="number" inputMode="numeric" value={formData.inspectedQuantity} onChange={e => setFormData({...formData, inspectedQuantity: parseInt(e.target.value)||0})} className="w-full px-3 py-2.5 border border-blue-200 bg-blue-50/30 rounded-xl font-black text-blue-700 text-sm focus:ring-2 focus:ring-blue-100 outline-none" />
                </div>
                <div>
                     <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 flex justify-between"><span>SL Đạt</span><span className="text-green-600">{passRate}%</span></label>
                     <input type="number" inputMode="numeric" value={formData.passedQuantity} readOnly className="w-full px-3 py-2.5 border border-green-200 bg-green-50/20 rounded-xl font-black text-green-700 text-sm focus:outline-none" />
                </div>
                <div>
                     <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 flex justify-between"><span>SL Lỗi</span><span className="text-red-600">{failRate}%</span></label>
                     <input type="number" inputMode="numeric" value={formData.failedQuantity} onChange={e => setFormData({...formData, failedQuantity: parseInt(e.target.value)||0})} className="w-full px-3 py-2.5 border border-red-200 bg-red-50/20 rounded-xl font-black text-red-600 text-sm focus:ring-2 focus:ring-red-100 outline-none" />
                </div>
           </div>
        </div>
        
        {/* 5. CHECK ITEMS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1 border-b-2 border-slate-800 pb-1">
             <h3 className="text-xs font-black text-slate-900 uppercase tracking-tighter">Chi tiết hạng mục ({formData.items?.length || 0})</h3>
             <button onClick={handleAddNewCategory} className="text-[9px] bg-slate-900 text-white px-3 py-1.5 rounded-lg font-bold uppercase shadow-sm flex items-center gap-1 active:scale-95 transition-transform">
                <PlusCircle className="w-3 h-3"/> Thêm mục
             </button>
          </div>
          
          <div className="space-y-4">
            {Object.entries(groupedItems).map(([category, items]: [string, CheckItem[]]) => (
                <div key={category} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2">
                        <input 
                            defaultValue={category}
                            onBlur={(e) => updateCategoryName(category, e.target.value.toUpperCase())}
                            className="bg-transparent text-xs font-black text-slate-700 uppercase focus:bg-white rounded px-2 w-full outline-none focus:ring-1 focus:ring-blue-300"
                        />
                        <div className="flex gap-1">
                            <button onClick={() => handleAddItemToCategory(category)} className="bg-white border border-slate-300 text-slate-600 hover:text-blue-600 px-2 py-1 rounded-lg text-[9px] font-bold uppercase shadow-sm"><Plus className="w-3 h-3" /></button>
                            <button onClick={() => handleRemoveCategory(category)} className="p-1 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {items.map((item) => (
                            <div key={item.id} className="p-3 hover:bg-slate-50 transition-colors group">
                                <div className="flex justify-between items-start mb-2 gap-2">
                                    <input value={item.label} onChange={(e) => updateItem(item.id, { label: e.target.value })} className="w-full text-sm font-bold text-slate-800 bg-transparent border-b border-transparent focus:border-blue-300 focus:bg-white rounded-sm outline-none transition-colors" placeholder="Hạng mục..." />
                                    <button onClick={() => handleRemoveItem(item.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
                                        {Object.values(CheckStatus).filter(v => v !== CheckStatus.PENDING).map(v => (
                                            <button key={v} onClick={() => handleItemStatusChange(item, v)} className={`flex-1 py-2 px-2 rounded-lg text-[10px] font-black uppercase whitespace-nowrap border transition-all active:scale-95 ${item.status === v ? (v === CheckStatus.PASS ? 'bg-green-600 text-white border-green-600 shadow-md' : v === CheckStatus.FAIL ? 'bg-red-600 text-white border-red-600 shadow-md' : 'bg-amber-500 text-white border-amber-500 shadow-md') : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>{v}</button>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <input value={item.notes} onChange={e => updateItem(item.id, { notes: e.target.value })} className="w-full pl-3 pr-8 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:border-blue-300 transition-all" placeholder="Ghi chú..." />
                                            {item.status === CheckStatus.FAIL && <button onClick={() => handleAIItemSuggest(item.id)} className="absolute right-2 top-1/2 -translate-y-1/2 text-purple-500 hover:text-purple-700 animate-pulse"><Sparkles className="w-3.5 h-3.5" /></button>}
                                        </div>
                                        <button onClick={() => handleAddItemPhoto(item.id)} className={`p-2 rounded-lg border transition-colors ${item.images?.length ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-400 border-slate-200 hover:border-blue-300 hover:text-blue-500'}`}><Camera className="w-4 h-4"/></button>
                                    </div>
                                    {item.images && item.images.length > 0 && <div className="flex gap-2 pt-2 overflow-x-auto">{item.images.map((img, i) => <div key={i} className="w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-slate-200"><img src={img} className="w-full h-full object-cover" /></div>)}</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
          </div>
        </div>
        
        {/* Signatures ... existing code ... */}
        
      </div>
    </div>
  );
};
