
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckStatus, Inspection, InspectionStatus, Priority, PlanItem, CheckItem, Workshop, User, NCR } from '../types';
import { INITIAL_CHECKLIST_TEMPLATE } from '../constants';
import { Button } from './Button';
import { generateItemSuggestion, generateNCRSuggestions } from '../services/geminiService';
import { fetchPlans } from '../services/apiService'; // Import fetchPlans for server-side lookup
import { ImageEditorModal } from './ImageEditorModal';
import { 
  Save, ArrowLeft, Camera, Image as ImageIcon, FileSpreadsheet, X, Trash2, 
  Box, Factory, Hash, Plus, PenTool, Eraser, PlusCircle, Building2, 
  Layers, User as UserIcon, Images, Sparkles, Loader2, Maximize2, QrCode, Zap,
  ChevronDown, ChevronRight, List, AlertTriangle, FileWarning, Calendar, CheckCircle2,
  BrainCircuit, ArrowRight
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
  const [showPlanModal, setShowPlanModal] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prodCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [itemLoadingStates, setItemLoadingStates] = useState<Record<string, boolean>>({});
  const [isSearchingPlan, setIsSearchingPlan] = useState(false);
  const currentSearchRef = useRef<string>(''); // Track latest search input to prevent race conditions
  
  // NCR Modal State
  const [ncrModalItem, setNcrModalItem] = useState<{ itemId: string, itemLabel: string, ncrData?: NCR } | null>(null);
  const [ncrFormData, setNcrFormData] = useState<Partial<NCR>>({});
  const [isAnalyzingNCR, setIsAnalyzingNCR] = useState(false);

  // Image Editor State
  const [editorState, setEditorState] = useState<{ itemId: string; images: string[]; index: number } | null>(null);

  // Signature Modes: 'VIEW' (Image) or 'EDIT' (Canvas)
  const [qcSignMode, setQcSignMode] = useState<'VIEW' | 'EDIT'>(initialData?.signature ? 'VIEW' : 'EDIT');
  const [prodSignMode, setProdSignMode] = useState<'VIEW' | 'EDIT'>(initialData?.productionSignature ? 'VIEW' : 'EDIT');

  // Scanner State
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

  // Derived state for available stages based on selected workshop
  const availableStages = useMemo(() => {
    if (!formData.workshop) return [];
    const selectedWs = workshops.find(ws => ws.name === formData.workshop);
    return selectedWs?.stages || [];
  }, [formData.workshop, workshops]);

  // Auto-calculate passed quantity
  useEffect(() => {
    const inspected = formData.inspectedQuantity || 0;
    const failed = formData.failedQuantity || 0;
    const passed = Math.max(0, inspected - failed);
    
    if (passed !== formData.passedQuantity) {
        setFormData(prev => ({ ...prev, passedQuantity: passed }));
    }
  }, [formData.inspectedQuantity, formData.failedQuantity]);

  // Group items by category for rendering
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
        // Keep the searched value but update others
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
    // 1. Update UI immediately
    setFormData(prev => ({ ...prev, ma_nha_may: code }));

    const trimmedCode = code.trim();
    currentSearchRef.current = trimmedCode; // Mark this as the latest search

    if (!trimmedCode) return;

    const len = trimmedCode.length;

    // Requirement: 9 chars (Headcode) or 12 chars (Ma Nha May)
    // Only proceed if length matches strict requirements
    if (len !== 9 && len !== 12) return;

    // 2. Try Local Search first (Fast)
    const localMatch = plans.find(p => 
        (len === 9 && String(p.headcode || '').trim().toLowerCase() === trimmedCode.toLowerCase()) ||
        (len === 12 && String(p.ma_nha_may || '').trim().toLowerCase() === trimmedCode.toLowerCase())
    );

    if (localMatch) {
        fillFormData(localMatch);
        return;
    }

    // 3. Server Search (Async) if not found locally
    setIsSearchingPlan(true);
    try {
        const result = await fetchPlans(trimmedCode, 1, 10);
        
        // Race Condition Check: Ensure user hasn't typed something else while waiting
        if (currentSearchRef.current !== trimmedCode) return;

        const serverMatch = result.items.find(p => 
            (len === 9 && String(p.headcode || '').trim().toLowerCase() === trimmedCode.toLowerCase()) ||
            (len === 12 && String(p.ma_nha_may || '').trim().toLowerCase() === trimmedCode.toLowerCase())
        );

        if (serverMatch) {
            fillFormData(serverMatch);
        }
    } catch (e) {
        console.error("Auto-fill error:", e);
    } finally {
        // Only stop loading if we are still on the same search
        if (currentSearchRef.current === trimmedCode) {
            setIsSearchingPlan(false);
        }
    }
  };

  // Scanner Logic
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
          if (code && code.data) {
             const scannedData = code.data.trim();
             // Auto fill logic handled by common function
             handleFactoryCodeChange(scannedData);
             setShowScanner(false);
             return;
          }
        }
      }
    }
    if (showScanner) requestRef.current = requestAnimationFrame(tick);
  };

  const updateItem = (id: string, updates: Partial<CheckItem | { images: string[] | undefined }>) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items?.map(item => item.id === id ? { ...item, ...updates } : item)
    }));
  };

  // Status Change Logic
  const handleItemStatusChange = (item: CheckItem, status: CheckStatus) => {
      updateItem(item.id, { status });
      
      // If status is FAIL, trigger NCR modal automatically if no NCR exists yet
      if (status === CheckStatus.FAIL && !item.ncr) {
          handleOpenNCR(item);
      }
  };

  // NCR Handlers
  const handleOpenNCR = (item: CheckItem) => {
      setNcrModalItem({ 
          itemId: item.id, 
          itemLabel: item.label,
          ncrData: item.ncr 
      });
      // Pre-fill form if data exists, else defaults
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
      if (!ncrFormData.issueDescription) {
          alert("Vui lòng nhập mô tả lỗi trước khi nhờ AI phân tích.");
          return;
      }
      if (!ncrModalItem) return;

      setIsAnalyzingNCR(true);
      try {
          const suggestion = await generateNCRSuggestions(ncrFormData.issueDescription, ncrModalItem.itemLabel);
          setNcrFormData(prev => ({
              ...prev,
              rootCause: suggestion.rootCause,
              solution: suggestion.solution
          }));
      } catch (e) {
          alert("Lỗi khi phân tích NCR: " + (e as Error).message);
      } finally {
          setIsAnalyzingNCR(false);
      }
  };

  const handleSaveNCR = () => {
      if (!ncrModalItem || !ncrFormData.issueDescription) {
          alert("Vui lòng nhập mô tả lỗi");
          return;
      }

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

      updateItem(ncrModalItem.itemId, { 
          ncr: newNCR,
          status: CheckStatus.FAIL // Ensure status stays FAIL
      });
      
      setNcrModalItem(null);
      setNcrFormData({});
  };

  // Add NCR Photo handler
  const handleAddNCRPhoto = (type: 'BEFORE' | 'AFTER') => {
      setActiveUploadId(`NCR_${type}`);
      fileInputRef.current?.click();
  };

  const handleRemoveNCRPhoto = (type: 'BEFORE' | 'AFTER', index: number) => {
      if (type === 'BEFORE') {
          setNcrFormData(prev => ({
              ...prev,
              imagesBefore: prev.imagesBefore?.filter((_, i) => i !== index)
          }));
      } else {
          setNcrFormData(prev => ({
              ...prev,
              imagesAfter: prev.imagesAfter?.filter((_, i) => i !== index)
          }));
      }
  };

  // Bulk update category name
  const updateCategoryName = (oldName: string, newName: string) => {
      if (oldName === newName) return;
      setFormData(prev => ({
          ...prev,
          items: prev.items?.map(item => item.category === oldName ? { ...item, category: newName } : item)
      }));
  };

  // Add a new item to a specific category
  const handleAddItemToCategory = (category: string) => {
      const newItem: CheckItem = {
          id: `custom_${Date.now()}`,
          category: category,
          label: '',
          status: CheckStatus.PENDING,
          notes: ''
      };
      setFormData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
  };

  // Add a completely new category (with one empty item)
  const handleAddNewCategory = () => {
      const newItem: CheckItem = {
          id: `new_cat_${Date.now()}`,
          category: 'DANH MỤC MỚI',
          label: '',
          status: CheckStatus.PENDING,
          notes: ''
      };
      setFormData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
  };

  const handleAIItemSuggest = async (itemId: string) => {
    const item = formData.items?.find(i => i.id === itemId);
    if (!item) return;

    setItemLoadingStates(prev => ({ ...prev, [itemId]: true }));
    try {
      const suggestion = await generateItemSuggestion(item, `${formData.ma_ct} - ${formData.ten_hang_muc}`);
      updateItem(itemId, { notes: suggestion });
    } catch (error) {
      console.error("AI Suggestion failed:", error);
    } finally {
      setItemLoadingStates(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const handleRemoveItem = (id: string) => {
      setFormData(prev => ({ ...prev, items: prev.items?.filter(item => item.id !== id) }));
  };

  const handleRemoveCategory = (category: string) => {
      if (window.confirm(`Bạn có chắc muốn xóa toàn bộ danh mục "${category}" và các hạng mục bên trong?`)) {
          setFormData(prev => ({ ...prev, items: prev.items?.filter(item => item.category !== category) }));
      }
  };

  const handleSave = () => {
    if (!formData.ma_ct || !formData.ten_hang_muc || !formData.inspectorName) {
      alert("Vui lòng điền đầy đủ thông tin bắt buộc");
      return;
    }
    let score = 0;
    if (formData.inspectedQuantity && formData.inspectedQuantity > 0) {
        score = Math.round(((formData.passedQuantity || 0) / formData.inspectedQuantity) * 100);
    } else {
        const total = formData.items?.length || 1;
        const passed = formData.items?.filter(i => i.status === CheckStatus.PASS).length || 0;
        // Conditional status counts as half pass or ignored? Let's treat it as neutral or handle logic per requirement.
        // For now, score is purely Pass rate.
        score = Math.round((passed / total) * 100);
    }
    const hasFailures = (formData.failedQuantity && formData.failedQuantity > 0) || formData.items?.some(i => i.status === CheckStatus.FAIL);
    const status = hasFailures ? InspectionStatus.FLAGGED : InspectionStatus.COMPLETED;

    const newInspection: Inspection = {
      ...formData as Inspection,
      id: formData.id || `INS-${Date.now()}`,
      score,
      status: formData.status === InspectionStatus.DRAFT ? status : formData.status || status,
    };
    onSave(newInspection);
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
    
    if (activeUploadId === 'MAIN') {
        setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...imgs] }));
    } else if (activeUploadId === 'NCR_BEFORE') {
        setNcrFormData(prev => ({ ...prev, imagesBefore: [...(prev.imagesBefore || []), ...imgs] }));
    } else if (activeUploadId === 'NCR_AFTER') {
        setNcrFormData(prev => ({ ...prev, imagesAfter: [...(prev.imagesAfter || []), ...imgs] }));
    } else if (activeUploadId) {
        const currentItem = formData.items?.find(i => i.id === activeUploadId);
        updateItem(activeUploadId, { images: [...(currentItem?.images || []), ...imgs] });
    }
    setActiveUploadId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveProductPhoto = (index: number) => { 
    setFormData(prev => ({ ...prev, images: prev.images?.filter((_, i) => i !== index) })); 
  };
  
  const handleRemoveItemPhoto = (itemId: string, indexToRemove: number) => {
    const currentItem = formData.items?.find(i => i.id === itemId);
    if (currentItem?.images) updateItem(itemId, { images: currentItem.images.filter((_, idx) => idx !== indexToRemove) });
  };

  const handleOpenImageEditor = (itemId: string, images: string[], index: number) => {
    setEditorState({ itemId, images, index });
  };

  const handleSaveEditedImage = (index: number, updatedImage: string) => {
    if (!editorState) return;
    const { itemId } = editorState;
    
    if (itemId === 'MAIN_GALLERY') {
      setFormData(prev => {
        const newImages = [...(prev.images || [])];
        newImages[index] = updatedImage;
        return { ...prev, images: newImages };
      });
    } else {
      setFormData(prev => {
        const newItems = (prev.items || []).map(item => {
          if (item.id === itemId) {
            const newImgs = [...(item.images || [])];
            newImgs[index] = updatedImage;
            return { ...item, images: newImgs };
          }
          return item;
        });
        return { ...prev, items: newItems };
      });
    }

    // Update local editor state to reflect changes immediately in modal
    setEditorState(prev => {
      if (!prev) return null;
      const newImgs = [...prev.images];
      newImgs[index] = updatedImage;
      return { ...prev, images: newImgs };
    });
  };

  const handleSelectPlan = (item: PlanItem) => {
      // Manual select plan always overrides
      fillFormData(item);
      setShowPlanModal(false);
  };

  const startDrawing = (canvas: HTMLCanvasElement | null, e: React.MouseEvent | React.TouchEvent) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
    const { x, y } = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(x, y);
    setIsDrawing(true);
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
          setFormData(prev => ({ ...prev, signature: undefined }));
          setQcSignMode('EDIT');
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext('2d');
          if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      } else {
          setFormData(prev => ({ ...prev, productionSignature: undefined, productionConfirmedDate: undefined }));
          setProdSignMode('EDIT');
          const canvas = prodCanvasRef.current;
          const ctx = canvas?.getContext('2d');
          if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
  };

  const failRate = formData.inspectedQuantity ? Math.round(((formData.failedQuantity || 0) / formData.inspectedQuantity) * 100) : 0;
  const passRate = formData.inspectedQuantity ? Math.round(((formData.passedQuantity || 0) / formData.inspectedQuantity) * 100) : 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col relative">
      <input type="file" accept="image/*" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      
      {/* Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-[120] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
            <button onClick={() => setShowScanner(false)} className="absolute top-6 right-6 text-white p-3 bg-white/10 rounded-full active:scale-90 transition-transform"><X className="w-8 h-8"/></button>
            <div className="w-full max-w-sm aspect-square bg-slate-800 rounded-[2.5rem] overflow-hidden relative border-4 border-blue-500/50 shadow-[0_0_50px_rgba(37,99,235,0.4)]">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                <canvas ref={scannerCanvasRef} className="hidden" />
            </div>
            <p className="text-blue-400 mt-10 font-bold text-xs uppercase tracking-[0.2em] animate-pulse">Scanning QR / Barcode...</p>
        </div>
      )}

      {/* Image Editor Modal */}
      {editorState && (
        <ImageEditorModal 
          images={editorState.images}
          initialIndex={editorState.index}
          onSave={handleSaveEditedImage}
          onClose={() => setEditorState(null)}
        />
      )}

      {/* NCR Edit Modal */}
      {ncrModalItem && (
          <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-4 bg-red-600 text-white flex justify-between items-center">
                      <div className="flex items-center gap-2">
                          <AlertTriangle className="w-6 h-6" />
                          <div>
                              <h3 className="font-black uppercase tracking-tight text-sm">Phiếu NCR - Sự không phù hợp</h3>
                              <p className="text-[10px] opacity-90 truncate max-w-[250px]">{ncrModalItem.itemLabel}</p>
                          </div>
                      </div>
                      <button onClick={() => setNcrModalItem(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                      <div>
                          <div className="flex justify-between items-end mb-1">
                              <label className="text-xs font-bold text-slate-500 uppercase">Mô tả lỗi *</label>
                              <button 
                                onClick={handleAutoFillNCR}
                                disabled={isAnalyzingNCR}
                                className="text-[10px] font-black text-purple-600 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
                              >
                                {isAnalyzingNCR ? <Loader2 className="w-3 h-3 animate-spin"/> : <BrainCircuit className="w-3 h-3"/>}
                                {isAnalyzingNCR ? 'Đang phân tích...' : 'AI Phân tích & Đề xuất'}
                              </button>
                          </div>
                          <textarea 
                              value={ncrFormData.issueDescription || ''}
                              onChange={e => setNcrFormData({...ncrFormData, issueDescription: e.target.value})}
                              className="w-full px-3 py-2 border border-red-200 rounded-xl bg-red-50 text-slate-800 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                              rows={3}
                              placeholder="Mô tả chi tiết vấn đề..."
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Người chịu trách nhiệm</label>
                              <input 
                                  value={ncrFormData.responsiblePerson || ''}
                                  onChange={e => setNcrFormData({...ncrFormData, responsiblePerson: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                                  placeholder="Tên nhân viên/Bộ phận"
                              />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Hạn xử lý</label>
                              <input 
                                  type="date"
                                  value={ncrFormData.deadline || ''}
                                  onChange={e => setNcrFormData({...ncrFormData, deadline: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono"
                              />
                          </div>
                      </div>
                      
                      {/* Image Upload Section */}
                      <div className="grid grid-cols-2 gap-4 border-t border-b border-slate-100 py-3">
                          {/* Before Images */}
                          <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                  <label className="text-[10px] font-black text-red-500 uppercase flex items-center gap-1">
                                      <FileWarning className="w-3 h-3" /> Trước xử lý
                                  </label>
                                  <button onClick={() => handleAddNCRPhoto('BEFORE')} className="text-blue-600 hover:bg-blue-50 p-1 rounded-full"><PlusCircle className="w-4 h-4"/></button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                  {ncrFormData.imagesBefore && ncrFormData.imagesBefore.length > 0 ? (
                                      ncrFormData.imagesBefore.map((img, idx) => (
                                          <div key={idx} className="relative w-12 h-12 group">
                                              <img src={img} className="w-full h-full object-cover rounded-lg border border-red-200" alt="Before" />
                                              <button 
                                                  onClick={() => handleRemoveNCRPhoto('BEFORE', idx)}
                                                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                              ><X className="w-3 h-3"/></button>
                                          </div>
                                      ))
                                  ) : (
                                      <div className="w-full h-12 bg-slate-50 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[10px]" onClick={() => handleAddNCRPhoto('BEFORE')}>Trống</div>
                                  )}
                              </div>
                          </div>

                          {/* After Images */}
                          <div className="space-y-2 border-l border-slate-100 pl-3">
                              <div className="flex justify-between items-center">
                                  <label className="text-[10px] font-black text-green-600 uppercase flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> Sau xử lý
                                  </label>
                                  <button onClick={() => handleAddNCRPhoto('AFTER')} className="text-blue-600 hover:bg-blue-50 p-1 rounded-full"><PlusCircle className="w-4 h-4"/></button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                  {ncrFormData.imagesAfter && ncrFormData.imagesAfter.length > 0 ? (
                                      ncrFormData.imagesAfter.map((img, idx) => (
                                          <div key={idx} className="relative w-12 h-12 group">
                                              <img src={img} className="w-full h-full object-cover rounded-lg border border-green-200" alt="After" />
                                              <button 
                                                  onClick={() => handleRemoveNCRPhoto('AFTER', idx)}
                                                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                              ><X className="w-3 h-3"/></button>
                                          </div>
                                      ))
                                  ) : (
                                      <div className="w-full h-12 bg-slate-50 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[10px]" onClick={() => handleAddNCRPhoto('AFTER')}>Trống</div>
                                  )}
                              </div>
                          </div>
                      </div>

                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nguyên nhân gốc rễ</label>
                          <textarea 
                              value={ncrFormData.rootCause || ''}
                              onChange={e => setNcrFormData({...ncrFormData, rootCause: e.target.value})}
                              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              rows={2}
                              placeholder={isAnalyzingNCR ? "Đang chờ AI phân tích..." : "Tại sao lỗi này xảy ra?"}
                              disabled={isAnalyzingNCR}
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Biện pháp khắc phục</label>
                          <textarea 
                              value={ncrFormData.solution || ''}
                              onChange={e => setNcrFormData({...ncrFormData, solution: e.target.value})}
                              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              rows={2}
                              placeholder={isAnalyzingNCR ? "Đang chờ AI đề xuất..." : "Hướng xử lý..."}
                              disabled={isAnalyzingNCR}
                          />
                      </div>
                  </div>
                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
                      <Button variant="ghost" onClick={() => setNcrModalItem(null)}>Hủy bỏ</Button>
                      <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleSaveNCR} disabled={isAnalyzingNCR}>Lưu NCR</Button>
                  </div>
              </div>
          </div>
      )}

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
                                    {item.headcode && <span className="text-[10px] md:text-xs font-bold text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{item.headcode}</span>}
                                  </div>
                              </div>
                              <div className="font-bold text-slate-800 text-sm leading-tight">{item.ten_hang_muc}</div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

      <div className="p-3 md:p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center sticky top-0 z-40 shadow-sm shrink-0">
        <button onClick={onCancel} className="p-2 text-slate-500 hover:text-slate-800 active:scale-90 transition-transform"><ArrowLeft className="w-6 h-6"/></button>
        <div className="flex flex-col items-center overflow-hidden">
            <h2 className="text-sm md:text-base font-black text-slate-800 uppercase tracking-tighter truncate max-w-[180px]">{initialData?.id ? 'SỬA PHIẾU' : 'TẠO PHIẾU MỚI'}</h2>
            <div className="flex items-center gap-1.5">
                <span className="text-[9px] md:text-[10px] font-black px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full uppercase tracking-tighter">{getModuleLabel()}</span>
                {!initialData?.id && <button onClick={() => setShowPlanModal(true)} className="text-[9px] md:text-[10px] font-black bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full border border-green-200 uppercase tracking-tighter active:scale-95">Link Kế Hoạch</button>}
            </div>
        </div>
        <button onClick={handleSave} className="bg-blue-600 text-white p-2 rounded-xl shadow-lg shadow-blue-500/30 active:scale-90 transition-transform"><Save className="w-5 h-5"/></button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-8 space-y-6 pb-24 md:pb-8 no-scrollbar bg-white">
        {/* Gallery Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
             <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Images className="w-3.5 h-3.5" /> Hình ảnh hiện trường ({formData.images?.length || 0})
             </h3>
          </div>
          
          <div className="flex flex-wrap gap-3 py-2 px-1 min-h-[100px] items-start">
            {formData.images && formData.images.map((img, idx) => (
              <div key={idx} className="relative w-24 h-24 md:w-28 md:h-28 group">
                <img src={img} className="w-full h-full object-cover rounded-2xl border-2 border-slate-200 shadow-sm transition-transform active:scale-95" alt={`Img ${idx}`} />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 rounded-2xl">
                    <button onClick={(e) => { e.stopPropagation(); handleOpenImageEditor('MAIN_GALLERY', formData.images!, idx); }} className="p-2 bg-white rounded-xl shadow-lg text-blue-600 mr-2 hover:scale-110 transition-transform"><Maximize2 className="w-4 h-4"/></button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleRemoveProductPhoto(idx); }}
                      className="p-2 bg-red-500 text-white rounded-xl shadow-lg hover:scale-110 transition-transform"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                </div>
              </div>
            ))}
            <button 
              onClick={handleAddPhoto}
              className="w-24 h-24 md:w-28 md:h-28 rounded-2xl border-2 border-dashed border-blue-200 flex flex-col items-center justify-center text-blue-500 bg-blue-50/30 hover:bg-blue-50 hover:border-blue-400 transition-all active:scale-95"
            >
              <div className="p-2 bg-white rounded-full shadow-sm mb-2 text-blue-600">
                <Plus className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-tighter">Thêm ảnh</span>
            </button>
          </div>
        </div>

        {/* Basic Information Forms (Source, Inspection Info, Quantities) */}
        
        {/* Source Info Card - Reorganized */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
           <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-50 pb-2"><Box className="w-4 h-4 text-blue-600" /> Thông tin nguồn</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Mã Nhà Máy *</label>
                    <div className="flex gap-2 relative">
                      <input 
                        value={formData.ma_nha_may} 
                        onChange={e => handleFactoryCodeChange(e.target.value)} 
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-base pr-10" 
                        placeholder="Nhập mã nhà máy..." 
                      />
                      {isSearchingPlan && (
                          <div className="absolute right-12 top-1/2 -translate-y-1/2 pointer-events-none">
                              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          </div>
                      )}
                      <button onClick={() => setShowScanner(true)} className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg active:scale-95 shrink-0"><QrCode className="w-5 h-5" /></button>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Mã Công Trình *</label>
                    <input value={formData.ma_ct} onChange={e => setFormData({...formData, ma_ct: e.target.value})} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-base" placeholder="Nhập mã công trình..." />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Tên Công Trình</label>
                    <input value={formData.ten_ct} onChange={e => setFormData({...formData, ten_ct: e.target.value})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-base" placeholder="Nhập tên công trình..." />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Tên Sản Phẩm *</label>
                    <input value={formData.ten_hang_muc} onChange={e => setFormData({...formData, ten_hang_muc: e.target.value})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-base" placeholder="Nhập tên sản phẩm..." />
                </div>
           </div>
        </div>

        {/* Inspection Info Card - With Stages Logic */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
           <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-slate-50 pb-2">
             <Factory className="w-4 h-4 text-orange-600" /> Thông tin kiểm tra
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Xưởng / Kho / Phòng</label>
                    <select 
                        value={formData.workshop} 
                        onChange={e => setFormData({...formData, workshop: e.target.value, inspectionStage: ''})} 
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-base font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    >
                        <option value="">-- Chọn Xưởng --</option>
                        {workshops.map(ws => (
                            <option key={ws.id} value={ws.name}>{ws.name} ({ws.code})</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Công đoạn sản xuất</label>
                    {availableStages.length > 0 ? (
                        <select 
                            value={formData.inspectionStage} 
                            onChange={e => setFormData({...formData, inspectionStage: e.target.value})} 
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-base font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        >
                            <option value="">-- Chọn công đoạn --</option>
                            {availableStages.map(stage => (
                                <option key={stage} value={stage}>{stage}</option>
                            ))}
                        </select>
                    ) : (
                        <input 
                            value={formData.inspectionStage} 
                            onChange={e => setFormData({...formData, inspectionStage: e.target.value})} 
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-base" 
                            placeholder="Nhập công đoạn..." 
                        />
                    )}
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">QC Thực Hiện *</label>
                    <input value={formData.inspectorName} onChange={e => setFormData({...formData, inspectorName: e.target.value})} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-base" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Ngày Kiểm Tra</label>
                    <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-base" />
                </div>
           </div>
        </div>

        {/* Quantity Card - New Added */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
           <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-50 pb-2">
               <Hash className="w-4 h-4 text-indigo-600" /> Số lượng kiểm tra
           </h3>
           <div className="grid grid-cols-2 gap-4">
                {/* IPO Quantity */}
                <div className="space-y-1.5">
                     <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">SL Đơn hàng (IPO)</label>
                     <div className="relative">
                        <input type="number" inputMode="numeric" value={formData.so_luong_ipo} onChange={e => setFormData({...formData, so_luong_ipo: parseInt(e.target.value)||0})} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-black text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-base" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">{formData.dvt}</span>
                     </div>
                </div>
                {/* Inspected Quantity */}
                <div className="space-y-1.5">
                     <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">SL Kiểm tra</label>
                     <input type="number" inputMode="numeric" value={formData.inspectedQuantity} onChange={e => setFormData({...formData, inspectedQuantity: parseInt(e.target.value)||0})} className="w-full px-3 py-2.5 border border-blue-200 bg-blue-50/50 rounded-xl font-black text-blue-700 outline-none focus:ring-2 focus:ring-blue-500 text-base" />
                </div>
                {/* Passed Quantity */}
                <div className="space-y-1.5">
                     <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 flex justify-between items-center">
                        <span>SL Đạt</span>
                        <span className="text-green-600 bg-green-50 px-1.5 rounded">{passRate}%</span>
                     </label>
                     <input type="number" inputMode="numeric" value={formData.passedQuantity} readOnly className="w-full px-3 py-2.5 border border-green-200 bg-green-50/30 rounded-xl font-black text-green-600 outline-none text-base" />
                </div>
                {/* Failed Quantity */}
                <div className="space-y-1.5">
                     <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 flex justify-between items-center">
                        <span>SL Lỗi</span>
                        <span className="text-red-600 bg-red-50 px-1.5 rounded">{failRate}%</span>
                     </label>
                     <input type="number" inputMode="numeric" value={formData.failedQuantity} onChange={e => setFormData({...formData, failedQuantity: parseInt(e.target.value)||0})} className="w-full px-3 py-2.5 border border-red-200 bg-red-50/30 rounded-xl font-black text-red-600 outline-none focus:ring-2 focus:ring-red-500 text-base" />
                </div>
           </div>
        </div>
        
        {/* Detailed Item List - GROUPED BY CATEGORY */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
             <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Chi tiết hạng mục ({formData.items?.length})</h3>
             <button onClick={handleAddNewCategory} className="text-[10px] bg-slate-900 text-white px-3 py-2 rounded-xl font-black uppercase tracking-widest shadow-lg active:scale-90 transition-transform flex items-center gap-2">
                <PlusCircle className="w-4 h-4"/> Thêm danh mục mới
             </button>
          </div>
          
          <div className="space-y-6">
            {Object.entries(groupedItems).map(([category, items]: [string, CheckItem[]]) => (
                <div key={category} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-2 duration-300">
                    {/* Category Header with Inline Edit and Add Item Button */}
                    <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                        <div className="flex-1">
                            <input 
                                defaultValue={category}
                                onBlur={(e) => updateCategoryName(category, e.target.value.toUpperCase())}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                className="bg-transparent text-sm font-black text-blue-700 uppercase tracking-tight focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-200 rounded px-2 py-1 w-full"
                                placeholder="TÊN DANH MỤC"
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => handleAddItemToCategory(category)}
                                className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-1"
                            >
                                <Plus className="w-3 h-3" /> Thêm
                            </button>
                            <button 
                                onClick={() => handleRemoveCategory(category)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Items in this Category */}
                    <div className="divide-y divide-slate-100">
                        {items.map((item) => (
                            <div key={item.id} className="p-4 hover:bg-slate-50 transition-colors group">
                                <div className="flex items-start gap-3 mb-3">
                                    <div className="mt-1">
                                        <div className={`w-2 h-2 rounded-full ${item.status === CheckStatus.FAIL ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`}></div>
                                    </div>
                                    <div className="flex-1">
                                        <input 
                                            value={item.label}
                                            onChange={(e) => updateItem(item.id, { label: e.target.value })}
                                            className="w-full font-bold text-slate-800 text-base bg-transparent border-b border-transparent focus:border-blue-300 focus:bg-white rounded-sm px-1 outline-none transition-all placeholder:text-slate-400 leading-relaxed"
                                            placeholder="Nhập tên hạng mục..."
                                        />
                                        {/* NCR Indicator */}
                                        {item.ncr && (
                                            <div onClick={() => handleOpenNCR(item)} className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 cursor-pointer hover:bg-red-200 transition-colors">
                                                <FileWarning className="w-3 h-3" /> NCR: {item.ncr.issueDescription.substring(0, 30)}...
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => handleRemoveItem(item.id)} className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="pl-5 space-y-3">
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                        {Object.values(CheckStatus).filter(v => v !== CheckStatus.PENDING).map(v => (
                                            <button 
                                                key={v} 
                                                onClick={() => handleItemStatusChange(item, v)} 
                                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-black uppercase tracking-tighter whitespace-nowrap transition-all active:scale-95 border ${
                                                    item.status === v 
                                                    ? (
                                                        v === CheckStatus.PASS ? 'bg-green-600 text-white border-green-600 shadow-md' : 
                                                        v === CheckStatus.FAIL ? 'bg-red-600 text-white border-red-600 shadow-md' : 
                                                        v === CheckStatus.CONDITIONAL ? 'bg-amber-500 text-white border-amber-500 shadow-md' :
                                                        'bg-slate-700 text-white border-slate-700 shadow-md'
                                                      ) 
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                                }`}
                                            >
                                                {v}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <input 
                                                value={item.notes} 
                                                onChange={e => updateItem(item.id, { notes: e.target.value })} 
                                                className="w-full pl-3 pr-9 py-2 text-base border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" 
                                                placeholder="Ghi chú kỹ thuật..." 
                                            />
                                            {item.status === CheckStatus.FAIL && (
                                                <button 
                                                    onClick={() => handleAIItemSuggest(item.id)}
                                                    disabled={itemLoadingStates[item.id]}
                                                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-purple-600 hover:bg-purple-50 rounded-md transition-colors"
                                                >
                                                    {itemLoadingStates[item.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                                </button>
                                            )}
                                        </div>
                                        <button 
                                            onClick={() => handleAddItemPhoto(item.id)} 
                                            className={`p-2 rounded-lg border transition-all flex-shrink-0 ${
                                                item.images && item.images.length > 0 
                                                ? 'bg-blue-50 text-blue-600 border-blue-200' 
                                                : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'
                                            }`}
                                        >
                                            <Camera className="w-4 h-4"/>
                                        </button>
                                    </div>

                                    {/* Item Images */}
                                    {item.images && item.images.length > 0 && (
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {item.images.map((img, imgIdx) => (
                                                <div key={imgIdx} className="relative w-12 h-12 group">
                                                    <img 
                                                        src={img} 
                                                        onClick={() => handleOpenImageEditor(item.id, item.images!, imgIdx)}
                                                        className="w-full h-full object-cover rounded-lg border border-slate-200 cursor-zoom-in" 
                                                        alt="Item" 
                                                    />
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleRemoveItemPhoto(item.id, imgIdx); }} 
                                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {items.length === 0 && (
                            <div className="p-4 text-center text-xs text-slate-400 italic">Chưa có hạng mục nào trong danh mục này.</div>
                        )}
                    </div>
                </div>
            ))}
          </div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4 pt-4 border-t border-slate-100">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2 justify-center"><PenTool className="w-4 h-4 text-blue-600" /> Ký tên QC Kiểm Tra</h3>
                {qcSignMode === 'VIEW' && formData.signature ? (
                    <div className="relative inline-block border-2 border-blue-50 p-2 rounded-xl bg-slate-50 w-full">
                        <img src={formData.signature} className="h-32 md:h-40 w-full object-contain bg-white rounded-lg" alt="QC Sign" />
                        <button onClick={() => handleClearSignature('QC')} className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full shadow-lg active:scale-75 transition-transform"><Eraser className="w-4 h-4"/></button>
                    </div>
                ) : (
                    <div className="w-full border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 overflow-hidden shadow-inner relative">
                        <canvas 
                            ref={canvasRef} 
                            width={window.innerWidth > 400 ? 400 : 300} 
                            height={200} 
                            className="w-full h-48 cursor-crosshair touch-none bg-white"
                            style={{ touchAction: 'none' }} 
                            onMouseDown={(e) => startDrawing(canvasRef.current, e)} 
                            onMouseMove={(e) => draw(canvasRef.current, e)} 
                            onMouseUp={() => stopDrawing('QC')} 
                            onMouseLeave={() => stopDrawing('QC')} 
                            onTouchStart={(e) => startDrawing(canvasRef.current, e)} 
                            onTouchMove={(e) => draw(canvasRef.current, e)} 
                            onTouchEnd={() => stopDrawing('QC')}
                        />
                        <button onClick={() => handleClearSignature('QC')} className="absolute top-2 right-2 p-2 bg-red-100 text-red-500 rounded-full shadow-sm active:scale-75 transition-transform"><Eraser className="w-4 h-4"/></button>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest py-2 border-t border-slate-200/50 absolute bottom-0 w-full bg-slate-50/80 pointer-events-none">Vùng ký xác nhận</p>
                    </div>
                )}
            </div>
            {/* Prod Signature Block same as before... */}
             <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center flex flex-col items-center">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2 justify-center"><UserIcon className="w-4 h-4 text-slate-600" /> Ký tên Đại diện sản xuất</h3>
                <input 
                    value={formData.productionName} 
                    onChange={e => setFormData({...formData, productionName: e.target.value})} 
                    className="w-full px-4 py-3 mb-4 border border-slate-200 rounded-xl text-base text-center font-bold bg-slate-50 focus:bg-white transition-colors h-12" 
                    placeholder="Họ tên đại diện..." 
                />
                {prodSignMode === 'VIEW' && formData.productionSignature ? (
                    <div className="relative inline-block border-2 border-slate-50 p-2 rounded-xl bg-slate-50 w-full">
                        <img src={formData.productionSignature} className="h-32 md:h-40 w-full object-contain bg-white rounded-lg" alt="Prod Sign" />
                        <button onClick={() => handleClearSignature('PROD')} className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full shadow-lg active:scale-75 transition-transform"><Eraser className="w-4 h-4"/></button>
                    </div>
                ) : (
                    <div className="w-full border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 overflow-hidden shadow-inner relative">
                        <canvas 
                            ref={prodCanvasRef} 
                            width={window.innerWidth > 400 ? 400 : 300} 
                            height={200} 
                            className="w-full h-48 cursor-crosshair touch-none bg-white" 
                            style={{ touchAction: 'none' }}
                            onMouseDown={(e) => startDrawing(prodCanvasRef.current, e)} 
                            onMouseMove={(e) => draw(prodCanvasRef.current, e)} 
                            onMouseUp={() => stopDrawing('PROD')} 
                            onMouseLeave={() => stopDrawing('PROD')} 
                            onTouchStart={(e) => startDrawing(prodCanvasRef.current, e)} 
                            onTouchMove={(e) => draw(prodCanvasRef.current, e)} 
                            onTouchEnd={() => stopDrawing('PROD')}
                        />
                        <button onClick={() => handleClearSignature('PROD')} className="absolute top-2 right-2 p-2 bg-red-100 text-red-500 rounded-full shadow-sm active:scale-75 transition-transform"><Eraser className="w-4 h-4"/></button>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest py-2 border-t border-slate-200/50 absolute bottom-0 w-full bg-slate-50/80 pointer-events-none">Vùng ký xác nhận</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
