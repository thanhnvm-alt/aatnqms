import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, PlanItem, User, Workshop, NCR, DefectLibraryItem } from '../types';
import { Button } from './Button';
import { 
  Save, X, Camera, Image as ImageIcon, ChevronDown, 
  MapPin, Briefcase, Box, AlertTriangle, 
  CheckCircle2, Trash2, Plus, Info, LayoutList,
  AlertOctagon, FileText, Tag, Hash, Pencil, Calendar, Loader2, QrCode,
  Ruler, Microscope, CheckSquare, PenTool, Eraser, BookOpen, Search,
  Target, CheckCircle, XCircle, Calculator, TrendingUp, User as UserIcon
} from 'lucide-react';
import { generateItemSuggestion } from '../services/geminiService';
import { fetchPlans, fetchDefectLibrary } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';
import { QRScannerModal } from './QRScannerModal';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  plans: PlanItem[];
  workshops: Workshop[];
  user: User;
}

// Helper: Resize and compress image
const resizeImage = (base64Str: string, maxWidth = 800): Promise<string> => {
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
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
      } else {
          resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

// Sub-component: Signature Pad
const SignaturePad = ({ 
    label, 
    value, 
    onChange, 
    readOnly = false 
}: { 
    label: string; 
    value?: string; 
    onChange: (base64: string) => void;
    readOnly?: boolean;
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isEmpty, setIsEmpty] = useState(!value);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas && value) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = value;
            setIsEmpty(false);
        }
    }, [value]);

    const startDrawing = (e: any) => {
        if (readOnly) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        if (e.type === 'touchstart') document.body.style.overflow = 'hidden';

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000000';
        setIsDrawing(true);
        setIsEmpty(false);
    };

    const draw = (e: any) => {
        if (!isDrawing || readOnly) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (readOnly) return;
        setIsDrawing(false);
        document.body.style.overflow = 'auto';
        if (canvasRef.current) {
            onChange(canvasRef.current.toDataURL());
        }
    };

    const clearSignature = () => {
        if (readOnly) return;
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            onChange('');
            setIsEmpty(true);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
                <label className="block text-slate-700 font-bold" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '11pt' }}>{label}</label>
                {!readOnly && (
                    <button 
                        onClick={clearSignature} 
                        className="text-xs text-red-600 hover:underline flex items-center gap-1"
                        type="button"
                    >
                        <Eraser className="w-3 h-3" /> Xóa ký lại
                    </button>
                )}
            </div>
            <div className="border border-slate-300 rounded bg-white overflow-hidden relative" style={{ height: '150px' }}>
                <canvas
                    ref={canvasRef}
                    width={400}
                    height={150}
                    className="w-full h-full touch-none cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                />
                {isEmpty && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-sm select-none">
                        Ký tên tại đây
                    </div>
                )}
            </div>
        </div>
    );
};

// Sub-component: NCR Modal
const NCRModal = ({ 
    isOpen, 
    onClose, 
    onSave, 
    initialData, 
    itemName,
    inspectionStage
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    onSave: (ncr: NCR) => void; 
    initialData?: NCR;
    itemName: string;
    inspectionStage?: string;
}) => {
    const [ncrData, setNcrData] = useState<Partial<NCR>>({
        severity: 'MINOR',
        issueDescription: '',
        rootCause: '',
        solution: '',
        responsiblePerson: '',
        imagesBefore: [],
        imagesAfter: [],
        status: 'OPEN'
    });
    
    const [library, setLibrary] = useState<DefectLibraryItem[]>([]);
    const [showLibrary, setShowLibrary] = useState(false);
    const [libSearch, setLibSearch] = useState('');
    const [defectName, setDefectName] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadType, setUploadType] = useState<'BEFORE' | 'AFTER'>('BEFORE');

    useEffect(() => {
        if (isOpen) {
            setNcrData(initialData || {
                severity: 'MINOR',
                issueDescription: '',
                rootCause: '',
                solution: '',
                responsiblePerson: '',
                imagesBefore: [],
                imagesAfter: [],
                status: 'OPEN'
            });
            fetchDefectLibrary().then(setLibrary);
            
            if (initialData?.defect_code) {
                fetchDefectLibrary().then(libs => {
                    const match = libs.find(l => l.code === initialData.defect_code);
                    if (match) setDefectName(match.name);
                });
            } else {
                setDefectName('');
            }
        }
    }, [isOpen, initialData]);

    const filteredLib = useMemo(() => {
        return library.filter(item => {
            const matchSearch = item.name?.toLowerCase().includes(libSearch.toLowerCase()) || 
                               item.description?.toLowerCase().includes(libSearch.toLowerCase()) ||
                               item.code?.toLowerCase().includes(libSearch.toLowerCase());
            const matchStage = !inspectionStage || item.stage === inspectionStage;
            return matchSearch && matchStage;
        });
    }, [library, libSearch, inspectionStage]);

    // Fixed: handleImageUpload explicitly types the file as File to avoid 'unknown' type inference
    // which prevents it from being passed to readAsDataURL (which expects a Blob/File).
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        Array.from(files).forEach((file: File) => {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const result = reader.result;
                if (typeof result === 'string') {
                    const resized = await resizeImage(result);
                    setNcrData(prev => {
                        const field = uploadType === 'BEFORE' ? 'imagesBefore' : 'imagesAfter';
                        return { ...prev, [field]: [...(prev[field] || []), resized] };
                    });
                }
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    if (!isOpen) return null;

    const modalStyle = { fontFamily: '"Times New Roman", Times, serif', fontSize: '11pt' };

    return (
        <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" style={modalStyle}>
            <div className="bg-white w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh]">
                <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center shrink-0">
                    <h3 className="text-red-600 flex items-center gap-2 font-bold">
                        <AlertOctagon className="w-5 h-5" /> Báo cáo sự không phù hợp (NCR)
                    </h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button>
                </div>
                
                <div className="p-5 space-y-4 overflow-y-auto flex-1 no-scrollbar">
                    <div className="border border-blue-200 rounded-lg overflow-hidden bg-blue-50/30">
                        <button 
                            onClick={() => setShowLibrary(!showLibrary)}
                            className="w-full p-2 flex justify-between items-center text-blue-700 font-bold"
                            type="button"
                        >
                            <span className="flex items-center gap-2"><BookOpen className="w-4 h-4"/> Chọn từ thư viện lỗi chuẩn</span>
                            <ChevronDown className={`w-4 h-4 transition-transform ${showLibrary ? 'rotate-180' : ''}`} />
                        </button>
                        {showLibrary && (
                            <div className="p-3 space-y-3 bg-white border-t border-blue-100">
                                <div className="relative">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input 
                                        value={libSearch}
                                        onChange={e => setLibSearch(e.target.value)}
                                        className="w-full pl-7 pr-2 py-1.5 border rounded outline-none text-xs"
                                        placeholder="Tìm lỗi chuẩn..."
                                    />
                                </div>
                                <div className="max-h-40 overflow-y-auto space-y-1 no-scrollbar">
                                    {filteredLib.map(item => (
                                        <div 
                                            key={item.id} 
                                            onClick={() => {
                                                setNcrData({
                                                    ...ncrData,
                                                    issueDescription: item.description,
                                                    severity: item.severity as any,
                                                    defect_code: item.code,
                                                    solution: item.suggestedAction || ncrData.solution
                                                });
                                                setDefectName(item.name);
                                                setShowLibrary(false);
                                            }}
                                            className="p-2 border rounded hover:bg-blue-50 cursor-pointer flex justify-between items-center group"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold truncate">{item.name}</p>
                                                <p className="text-[9pt] text-slate-500 line-clamp-1">{item.description}</p>
                                            </div>
                                            <ChevronDown className="w-3 h-3 text-slate-300 -rotate-90 group-hover:text-blue-500" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-slate-700 font-bold">Hạng mục kiểm tra</label>
                            <input readOnly value={itemName} className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-slate-500 italic" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-slate-700 font-bold">Tên lỗi (Thư viện)</label>
                            <input readOnly value={defectName || 'Chưa chọn'} className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-blue-700 font-bold" />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-slate-700 font-bold">Mô tả lỗi chi tiết *</label>
                        <textarea 
                            className="w-full p-2 border border-slate-300 rounded outline-none focus:border-blue-500"
                            rows={3}
                            value={ncrData.issueDescription}
                            onChange={e => setNcrData({...ncrData, issueDescription: e.target.value})}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-slate-700 font-bold">Mức độ</label>
                            <select className="w-full p-2 border border-slate-300 rounded" value={ncrData.severity} onChange={e => setNcrData({...ncrData, severity: e.target.value as any})}>
                                <option value="MINOR">MINOR</option>
                                <option value="MAJOR">MAJOR</option>
                                <option value="CRITICAL">CRITICAL</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-slate-700 font-bold">Người chịu trách nhiệm</label>
                            <input className="w-full p-2 border border-slate-300 rounded" value={ncrData.responsiblePerson || ''} onChange={e => setNcrData({...ncrData, responsiblePerson: e.target.value})} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-slate-700 font-bold">Hạn xử lý</label>
                            <input type="date" className="w-full p-2 border border-slate-300 rounded" value={ncrData.deadline || ''} onChange={e => setNcrData({...ncrData, deadline: e.target.value})} />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-slate-700 font-bold">Nguyên nhân gốc rễ (Root Cause)</label>
                        <textarea className="w-full p-2 border border-slate-300 rounded" rows={2} value={ncrData.rootCause || ''} onChange={e => setNcrData({...ncrData, rootCause: e.target.value})} />
                    </div>

                    <div className="space-y-1">
                        <label className="text-slate-700 font-bold">Biện pháp khắc phục</label>
                        <textarea className="w-full p-2 border border-slate-300 rounded outline-none resize-none" rows={2} value={ncrData.solution} onChange={e => setNcrData({...ncrData, solution: e.target.value})} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-red-600 font-bold flex items-center gap-1"><AlertTriangle className="w-4 h-4"/> Ảnh Trước</label>
                                <button onClick={() => { setUploadType('BEFORE'); fileInputRef.current?.click(); }} className="p-1 bg-red-50 text-red-600 rounded border border-red-200"><Camera className="w-4 h-4"/></button>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                {ncrData.imagesBefore?.map((img, i) => (
                                    <div key={i} className="relative aspect-square border rounded overflow-hidden">
                                        <img src={img} className="w-full h-full object-cover" />
                                        <button onClick={() => setNcrData({...ncrData, imagesBefore: ncrData.imagesBefore?.filter((_, idx) => idx !== i)})} className="absolute top-0 right-0 bg-red-500 text-white p-0.5"><X className="w-3 h-3"/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-green-600 font-bold flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Ảnh Sau</label>
                                <button onClick={() => { setUploadType('AFTER'); fileInputRef.current?.click(); }} className="p-1 bg-green-50 text-green-600 rounded border border-green-200"><Camera className="w-4 h-4"/></button>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                {ncrData.imagesAfter?.map((img, i) => (
                                    <div key={i} className="relative aspect-square border rounded overflow-hidden">
                                        <img src={img} className="w-full h-full object-cover" />
                                        <button onClick={() => setNcrData({...ncrData, imagesAfter: ncrData.imagesAfter?.filter((_, idx) => idx !== i)})} className="absolute top-0 right-0 bg-red-500 text-white p-0.5"><X className="w-3 h-3"/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleImageUpload} />

                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 border rounded bg-white font-bold">Hủy</button>
                    <button onClick={() => onSave(ncrData as NCR)} disabled={!ncrData.issueDescription} className="px-6 py-2 bg-red-600 text-white rounded shadow-sm font-bold">Lưu hồ sơ NCR</button>
                </div>
            </div>
        </div>
    );
};

export const InspectionForm: React.FC<InspectionFormProps> = ({ 
  initialData, 
  onSave, 
  onCancel, 
  plans, 
  workshops,
  user
}) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({
    id: `INS-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    status: InspectionStatus.DRAFT,
    items: [],
    images: [],
    score: 0,
    signature: '',
    productionSignature: '',
    inspectedQuantity: 0,
    passedQuantity: 0,
    failedQuantity: 0,
    ...initialData
  });

  const [searchCode, setSearchCode] = useState(initialData?.headcode || initialData?.ma_nha_may || '');
  const [activeNcrItemIndex, setActiveNcrItemIndex] = useState<number | null>(null);
  const [isNcrModalOpen, setIsNcrModalOpen] = useState(false);
  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: { type: 'MAIN' | 'ITEM', itemId?: string }; } | null>(null);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const availableStages = useMemo(() => {
      if (!formData.ma_nha_may) return [];
      const selectedWorkshop = workshops.find(ws => ws.code === formData.ma_nha_may);
      return selectedWorkshop?.stages || [];
  }, [formData.ma_nha_may, workshops]);

  const visibleItems = useMemo(() => {
      if (!formData.inspectionStage) return [];
      if (!formData.items) return [];
      return formData.items.filter(item => !item.stage || item.stage === formData.inspectionStage);
  }, [formData.items, formData.inspectionStage]);

  const rates = useMemo(() => {
    const ins = parseFloat(String(formData.inspectedQuantity || 0));
    const pas = parseFloat(String(formData.passedQuantity || 0));
    const fai = parseFloat(String(formData.failedQuantity || 0));
    if (ins <= 0) return { passRate: 0, defectRate: 0 };
    return {
        passRate: ((pas / ins) * 100).toFixed(1),
        defectRate: ((fai / ins) * 100).toFixed(1)
    };
  }, [formData.inspectedQuantity, formData.passedQuantity, formData.failedQuantity]);

  const lookupPlanInfo = async (value: string) => {
      if (!value) return;
      setIsLookupLoading(true);
      try {
          const searchTerm = value.toLowerCase().trim();
          const apiRes = await fetchPlans(value, 1, 5);
          const match = apiRes.items.find(p => p.headcode?.toLowerCase().trim() === searchTerm || p.ma_nha_may?.toLowerCase().trim() === searchTerm);
          if (match) {
              setFormData(prev => ({ ...prev, ma_ct: match.ma_ct, ten_ct: match.ten_ct, ten_hang_muc: match.ten_hang_muc, dvt: match.dvt, so_luong_ipo: match.so_luong_ipo, headcode: match.headcode, ma_nha_may: match.ma_nha_may }));
              setSearchCode(value);
          }
      } catch (e) { console.error(e); } finally { setIsLookupLoading(false); }
  };

  const handleInputChange = (field: keyof Inspection, value: any) => {
    setFormData(prev => {
        const next = { ...prev, [field]: value };
        const ins = parseFloat(String(next.inspectedQuantity || 0));
        const pas = parseFloat(String(next.passedQuantity || 0));
        const fai = parseFloat(String(next.failedQuantity || 0));
        if (field === 'inspectedQuantity') next.passedQuantity = Math.max(0, value - fai);
        else if (field === 'passedQuantity') next.failedQuantity = Math.max(0, ins - value);
        else if (field === 'failedQuantity') next.passedQuantity = Math.max(0, ins - value);
        return next;
    });
  };

  const handleItemChange = (index: number, field: keyof CheckItem, value: any) => {
    setFormData(prev => {
        const newItems = [...(prev.items || [])];
        if (newItems[index]) {
            newItems[index] = { ...newItems[index], [field]: value };
            if (field === 'status' && value === CheckStatus.FAIL && !newItems[index].ncr) {
                setActiveNcrItemIndex(index);
                setIsNcrModalOpen(true);
            }
        }
        return { ...prev, items: newItems };
    });
  };

  const handleSaveNCR = (ncrData: NCR) => {
      if (activeNcrItemIndex === null) return;
      setFormData(prev => {
          const newItems = [...(prev.items || [])];
          const currentItem = newItems[activeNcrItemIndex];
          newItems[activeNcrItemIndex] = { ...currentItem, status: CheckStatus.FAIL, ncr: { ...ncrData, id: currentItem.ncr?.id || `NCR-${Date.now()}`, inspection_id: formData.id, itemId: currentItem.id, createdDate: new Date().toISOString() } };
          return { ...prev, items: newItems };
      });
      setIsNcrModalOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          const processed = await resizeImage(reader.result);
          if (activeUploadId === 'MAIN') setFormData(prev => ({ ...prev, images: [...(prev.images || []), processed] }));
          else setFormData(prev => ({ ...prev, items: prev.items?.map(i => i.id === activeUploadId ? { ...i, images: [...(i.images || []), processed] } : i) }));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!formData.ma_ct || !formData.inspectionStage) { alert("Vui lòng nhập đủ thông tin và chọn công đoạn."); return; }
    setIsSaving(true);
    try { await onSave({ ...formData, inspectorName: user.name, updatedAt: new Date().toISOString() } as Inspection); } 
    catch (e) { alert("Lỗi khi lưu phiếu."); } finally { setIsSaving(false); }
  };

  const formStyle = { fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt' };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg md:shadow-xl overflow-hidden animate-in slide-in-from-bottom duration-300 relative" style={formStyle}>
      <div className="bg-white border-b border-slate-300 z-10 shrink-0 flex justify-between items-center px-4 py-3">
          <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-[13pt]">{initialData?.id ? 'Biên Bản Kiểm Tra' : 'Tạo Phiếu Mới'}</h2>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full"><X className="w-6 h-6" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar bg-slate-50">
        <div className="bg-white p-4 rounded border border-slate-300 shadow-sm space-y-4">
            <h3 className="text-blue-700 border-b border-blue-100 pb-2 mb-2 font-bold flex items-center gap-2"><Box className="w-4 h-4"/> I. THÔNG TIN SẢN PHẨM</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                    <label className="block text-slate-600 mb-1">Mã định danh (Headcode)</label>
                    <input value={searchCode} onChange={e => { setSearchCode(e.target.value); if(e.target.value.length >= 3) lookupPlanInfo(e.target.value); }} className="w-full p-2 border rounded" placeholder="Quét/Nhập mã..."/>
                    <button onClick={() => setShowScanner(true)} className="absolute right-2 top-8 text-slate-400"><QrCode className="w-5 h-5"/></button>
                </div>
                <div><label className="block text-slate-600 mb-1">Mã Dự Án</label><input value={formData.ma_ct || ''} readOnly className="w-full p-2 bg-slate-50 border rounded text-slate-500"/></div>
                <div><label className="block text-slate-600 mb-1">Tên Sản Phẩm</label><input value={formData.ten_hang_muc || ''} readOnly className="w-full p-2 bg-slate-50 border rounded text-slate-500"/></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><label className="block text-slate-600 mb-1">Số IPO</label><input type="number" value={formData.so_luong_ipo || 0} readOnly className="w-full p-2 bg-slate-50 border rounded"/></div>
                <div><label className="block text-slate-600 mb-1">ĐVT</label><input value={formData.dvt || 'PCS'} readOnly className="w-full p-2 bg-slate-50 border rounded"/></div>
                <div><label className="block text-slate-600 mb-1">Ngày kiểm</label><input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full p-2 border rounded"/></div>
                <div><label className="block text-slate-600 mb-1">QC</label><input value={formData.inspectorName || user.name} readOnly className="w-full p-2 bg-slate-50 border rounded"/></div>
            </div>
        </div>

        <section className="bg-white p-4 rounded border border-slate-300 shadow-sm space-y-3">
            <h3 className="text-blue-700 font-bold flex items-center gap-2 border-b border-blue-100 pb-2"><ImageIcon className="w-4 h-4"/> II. ẢNH TỔNG QUAN</h3>
            <div className="flex gap-3 overflow-x-auto pb-2">
                <button onClick={() => { setActiveUploadId('MAIN'); cameraInputRef.current?.click(); }} className="w-24 h-24 bg-blue-50 border border-blue-200 rounded flex flex-col items-center justify-center text-blue-600"><Camera className="w-6 h-6"/></button>
                {formData.images?.map((img, idx) => (
                    <div key={idx} className="relative w-24 h-24 rounded overflow-hidden border">
                        <img src={img} className="w-full h-full object-cover" />
                        <button onClick={() => setFormData({...formData, images: formData.images?.filter((_, i) => i !== idx)})} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full"><X className="w-3 h-3"/></button>
                    </div>
                ))}
            </div>
        </section>

        <div className="bg-white p-4 rounded border border-slate-300 shadow-sm space-y-4">
            <h3 className="text-blue-700 border-b border-blue-100 pb-2 font-bold flex items-center gap-2"><MapPin className="w-4 h-4"/> III. ĐỊA ĐIỂM & SỐ LƯỢNG</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div><label className="block text-slate-600 mb-1">Xưởng</label><select value={formData.ma_nha_may || ''} onChange={e => handleInputChange('ma_nha_may', e.target.value)} className="w-full p-2 border rounded"><option value="">-- Chọn xưởng --</option>{workshops.map(ws => <option key={ws.code} value={ws.code}>{ws.name}</option>)}</select></div>
                 <div><label className="block text-slate-600 mb-1">Giai đoạn *</label><select value={formData.inspectionStage || ''} onChange={e => handleInputChange('inspectionStage', e.target.value)} className="w-full p-2 border rounded"><option value="">-- Chọn giai đoạn để load checklist --</option>{availableStages.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                 <div className="space-y-1"><label className="font-bold text-slate-600 text-[10pt]">SL Kiểm tra</label><input type="number" step="0.01" value={formData.inspectedQuantity || ''} onChange={e => handleInputChange('inspectedQuantity', e.target.value)} className="w-full p-2 border rounded font-bold" /></div>
                 <div className="space-y-1">
                    <div className="flex justify-between items-center"><label className="font-bold text-green-600 text-[10pt]">SL Đạt</label><span className="text-[9pt] font-black text-green-700 bg-green-50 px-1 rounded">{rates.passRate}%</span></div>
                    <input type="number" step="0.01" value={formData.passedQuantity || ''} onChange={e => handleInputChange('passedQuantity', e.target.value)} className="w-full p-2 border rounded font-bold" />
                 </div>
                 <div className="space-y-1">
                    <div className="flex justify-between items-center"><label className="font-bold text-red-600 text-[10pt]">SL Lỗi</label><span className="text-[9pt] font-black text-red-700 bg-red-50 px-1 rounded">{rates.defectRate}%</span></div>
                    <input type="number" step="0.01" value={formData.failedQuantity || ''} onChange={e => handleInputChange('failedQuantity', e.target.value)} className="w-full p-2 border rounded font-bold" />
                 </div>
            </div>
        </div>

        <div className="space-y-3">
            <h3 className="font-bold text-slate-700 flex items-center gap-2 border-b border-slate-300 pb-2"><LayoutList className="w-4 h-4 text-blue-600"/> IV. NỘI DUNG KIỂM TRA ({visibleItems.length})</h3>
            {!formData.inspectionStage ? (
                <div className="bg-orange-50 border p-8 rounded-[2rem] text-center space-y-3"><Info className="w-10 h-10 text-orange-400 mx-auto" /><p className="font-bold text-orange-800 uppercase">Chọn giai đoạn tại Mục III để bắt đầu</p></div>
            ) : (
                <div className="space-y-3">
                    {formData.items?.map((item, originalIndex) => (
                        (!item.stage || item.stage === formData.inspectionStage) && (
                            <div key={item.id} className={`bg-white rounded p-4 border shadow-sm ${item.status === CheckStatus.FAIL ? 'border-red-300 bg-red-50/10' : 'border-slate-300'}`}>
                                <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-2">
                                    <div className="flex-1">
                                        <div className="flex gap-2 mb-1"><span className="bg-slate-100 text-[9pt] px-2 rounded">{item.category}</span><span className="bg-blue-50 text-[9pt] px-2 rounded text-blue-700">{formData.inspectionStage}</span></div>
                                        <input value={item.label} onChange={e => handleItemChange(originalIndex, 'label', e.target.value)} className="w-full font-bold text-[12pt] bg-transparent outline-none" />
                                    </div>
                                    <button onClick={() => setFormData({...formData, items: formData.items?.filter((_, i) => i !== originalIndex)})} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div><label className="text-[9pt] text-slate-500">Phương pháp</label><input value={item.method || ''} onChange={e => handleItemChange(originalIndex, 'method', e.target.value)} className="w-full text-xs p-1 bg-slate-50 border rounded"/></div>
                                    <div><label className="text-[9pt] text-slate-500">Tiêu chuẩn</label><input value={item.standard || ''} onChange={e => handleItemChange(originalIndex, 'standard', e.target.value)} className="w-full text-xs p-1 bg-slate-50 border rounded"/></div>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <div className="flex bg-slate-100 p-1 rounded gap-1">
                                        {[CheckStatus.PASS, CheckStatus.FAIL, CheckStatus.CONDITIONAL].map(st => (
                                            <button key={st} onClick={() => handleItemChange(originalIndex, 'status', st)} className={`px-3 py-1 rounded text-[9pt] font-bold ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white' : st === CheckStatus.FAIL ? 'bg-red-600 text-white' : 'bg-orange-500 text-white') : 'text-slate-600'}`}>{st}</button>
                                        ))}
                                    </div>
                                    {item.status === CheckStatus.FAIL && (
                                        <button onClick={() => { setActiveNcrItemIndex(originalIndex); setIsNcrModalOpen(true); }} className="px-3 py-1 bg-red-600 text-white rounded text-[9pt] font-bold flex items-center gap-1"><AlertOctagon className="w-3 h-3"/> NCR</button>
                                    )}
                                </div>
                                <textarea value={item.notes || ''} onChange={e => handleItemChange(originalIndex, 'notes', e.target.value)} className="w-full mt-3 p-2 bg-slate-50 border rounded text-[11pt] h-16" placeholder="Ghi chú lỗi..."/>
                                <div className="flex gap-2 mt-2">
                                    <button onClick={() => { setActiveUploadId(item.id); cameraInputRef.current?.click(); }} className="p-2 border rounded"><Camera className="w-4 h-4 text-slate-400"/></button>
                                    {item.images?.map((im, i) => <img key={i} src={im} className="w-10 h-10 object-cover rounded border" />)}
                                </div>
                            </div>
                        )
                    ))}
                    <button onClick={() => setFormData({...formData, items: [...(formData.items || []), { id: `new_${Date.now()}`, category: 'Chung', label: 'Tiêu chí mới', status: CheckStatus.PENDING, stage: formData.inspectionStage }]})} className="w-full py-2 border-2 border-dashed rounded text-slate-400 text-xs font-bold uppercase tracking-widest">+ Thêm hạng mục</button>
                </div>
            )}
        </div>

        <section className="bg-white p-4 rounded border border-slate-300 shadow-sm mt-4">
            <h3 className="text-blue-700 border-b border-blue-100 pb-2 mb-4 font-bold flex items-center gap-2"><PenTool className="w-4 h-4"/> V. CHỮ KÝ XÁC NHẬN</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SignaturePad label="Đại diện Xưởng" value={formData.productionSignature} onChange={sig => setFormData({...formData, productionSignature: sig})} />
                <SignaturePad label={`Đại diện QA/QC (${user.name})`} value={formData.signature} onChange={sig => setFormData({...formData, signature: sig})} />
            </div>
        </section>
      </div>

      <div className="p-4 border-t bg-white flex justify-end gap-3 shrink-0 shadow-lg">
        <Button variant="secondary" onClick={onCancel}>Hủy</Button>
        <Button onClick={handleSubmit} disabled={isSaving} className="bg-blue-700 text-white font-bold w-48">{isSaving ? 'Đang lưu...' : 'Lưu Phiếu'}</Button>
      </div>

      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
      
      {activeNcrItemIndex !== null && formData.items && formData.items[activeNcrItemIndex] && (
          <NCRModal 
              isOpen={isNcrModalOpen} onClose={() => setIsNcrModalOpen(false)} onSave={handleSaveNCR}
              initialData={formData.items[activeNcrItemIndex].ncr}
              itemName={formData.items[activeNcrItemIndex].label}
              inspectionStage={formData.inspectionStage}
          />
      )}

      {showScanner && (
          <QRScannerModal onClose={() => setShowScanner(false)} onScan={data => { setSearchCode(data); lookupPlanInfo(data); setShowScanner(false); }} />
      )}
      {editorState && (
          <ImageEditorModal images={editorState.images} initialIndex={editorState.index} onClose={() => setEditorState(null)} readOnly={false} />
      )}
    </div>
  );
};
