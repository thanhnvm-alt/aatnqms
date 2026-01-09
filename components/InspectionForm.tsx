
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, PlanItem, User, Workshop, NCR } from '../types';
import { Button } from './Button';
import { 
  Save, X, Camera, Image as ImageIcon, ChevronDown, 
  MapPin, Briefcase, Box, AlertTriangle, 
  CheckCircle2, Trash2, Plus, Info, LayoutList,
  AlertOctagon, FileText, Tag, Hash, Pencil, Calendar, Loader2, QrCode,
  Ruler, Microscope, CheckSquare, PenTool, Eraser
} from 'lucide-react';
import { generateItemSuggestion } from '../services/geminiService';
import { fetchPlans } from '../services/apiService';
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
    }, []);

    const startDrawing = (e: any) => {
        if (readOnly) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        // Prevent scrolling on touch devices
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
        document.body.style.overflow = 'auto'; // Restore scrolling
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

// Sub-component: NCR Modal (Keep existing)
const NCRModal = ({ 
    isOpen, 
    onClose, 
    onSave, 
    initialData, 
    itemName 
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    onSave: (ncr: NCR) => void; 
    initialData?: NCR;
    itemName: string;
}) => {
    const [ncrData, setNcrData] = useState<Partial<NCR>>({
        severity: 'MINOR',
        issueDescription: '',
        solution: '',
        imagesBefore: []
    });

    useEffect(() => {
        if (isOpen) {
            setNcrData(initialData || {
                severity: 'MINOR',
                issueDescription: '',
                solution: '',
                imagesBefore: []
            });
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const modalStyle = { fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt', fontWeight: 'normal' };

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" style={modalStyle}>
            <div className="bg-white w-full max-w-md rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center">
                    <h3 className="text-red-600 flex items-center gap-2" style={{ fontWeight: 'bold' }}>
                        <AlertOctagon className="w-5 h-5" /> Báo cáo sự không phù hợp (NCR)
                    </h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="p-3 bg-slate-50 rounded border border-slate-200">
                        <span className="text-slate-500 block">Hạng mục lỗi:</span>
                        <span className="text-slate-800" style={{ fontWeight: 'bold' }}>{itemName}</span>
                    </div>

                    <div className="space-y-1">
                        <label className="text-slate-700">Mô tả lỗi *</label>
                        <textarea 
                            className="w-full p-2 border border-slate-300 rounded outline-none focus:border-blue-500"
                            rows={3}
                            placeholder="Mô tả chi tiết vấn đề..."
                            value={ncrData.issueDescription}
                            onChange={e => setNcrData({...ncrData, issueDescription: e.target.value})}
                            style={modalStyle}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-slate-700">Mức độ</label>
                            <select 
                                className="w-full p-2 border border-slate-300 rounded outline-none"
                                value={ncrData.severity}
                                onChange={e => setNcrData({...ncrData, severity: e.target.value as any})}
                                style={modalStyle}
                            >
                                <option value="MINOR">MINOR (Nhẹ)</option>
                                <option value="MAJOR">MAJOR (Nặng)</option>
                                <option value="CRITICAL">CRITICAL (Nghiêm trọng)</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-slate-700">Hạn xử lý</label>
                            <input 
                                type="date" 
                                className="w-full p-2 border border-slate-300 rounded outline-none"
                                value={ncrData.deadline || ''}
                                onChange={e => setNcrData({...ncrData, deadline: e.target.value})}
                                style={modalStyle}
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-slate-700">Biện pháp khắc phục (Dự kiến)</label>
                        <textarea 
                            className="w-full p-2 border border-slate-300 rounded outline-none resize-none"
                            rows={2}
                            placeholder="Hướng xử lý..."
                            value={ncrData.solution}
                            onChange={e => setNcrData({...ncrData, solution: e.target.value})}
                            style={modalStyle}
                        />
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:text-slate-800 border rounded bg-white">Hủy</button>
                    <button 
                        onClick={() => onSave(ncrData as NCR)}
                        disabled={!ncrData.issueDescription}
                        className="px-6 py-2 bg-red-600 text-white rounded shadow-sm hover:bg-red-700 disabled:opacity-50"
                    >
                        Lưu NCR
                    </button>
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
    ...initialData
  });

  const [searchCode, setSearchCode] = useState(initialData?.headcode || initialData?.ma_nha_may || '');
  const [activeNcrItemIndex, setActiveNcrItemIndex] = useState<number | null>(null);
  const [isNcrModalOpen, setIsNcrModalOpen] = useState(false);
  const [editorState, setEditorState] = useState<{
    images: string[];
    index: number;
    context: { type: 'MAIN' | 'ITEM', itemId?: string };
  } | null>(null);

  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Styling
  const formStyle = { 
      fontFamily: '"Times New Roman", Times, serif', 
      fontSize: '12pt', 
      fontWeight: 'normal',
      color: '#1e293b'
  };

  const inputStyle = {
      ...formStyle,
      border: '1px solid #cbd5e1',
      borderRadius: '4px',
      padding: '8px 12px',
      width: '100%',
      outline: 'none'
  };

  const readOnlyStyle = {
      ...inputStyle,
      backgroundColor: '#f1f5f9',
      color: '#64748b',
      cursor: 'not-allowed'
  };

  const availableStages = useMemo(() => {
      if (!formData.ma_nha_may) return [];
      const selectedWorkshop = workshops.find(ws => ws.code === formData.ma_nha_may);
      return selectedWorkshop?.stages || [];
  }, [formData.ma_nha_may, workshops]);

  const visibleItems = useMemo(() => {
      if (!formData.items) return [];
      if (!formData.inspectionStage) return formData.items;
      return formData.items.filter(item => !item.stage || item.stage === formData.inspectionStage);
  }, [formData.items, formData.inspectionStage]);

  useEffect(() => {
    if (formData.items) {
      const total = formData.items.length;
      if (total === 0) {
        setFormData(prev => ({ ...prev, score: 0 }));
        return;
      }
      const passed = formData.items.filter(i => i.status === CheckStatus.PASS).length;
      const score = Math.round((passed / total) * 100);
      if (score !== formData.score) {
        setFormData(prev => ({ ...prev, score }));
      }
    }
  }, [formData.items]);

  const lookupPlanInfo = async (value: string) => {
      if (!value) return;
      setIsLookupLoading(true);
      try {
          const searchTerm = value.toLowerCase().trim();
          let match = plans.find(p => 
              p.headcode?.toLowerCase().trim() === searchTerm || 
              p.ma_nha_may?.toLowerCase().trim() === searchTerm
          );

          if (!match) {
              const apiRes = await fetchPlans(value, 1, 5); 
              match = apiRes.items.find(p => 
                  p.headcode?.toLowerCase().trim() === searchTerm || 
                  p.ma_nha_may?.toLowerCase().trim() === searchTerm
              );
          }

          if (match) {
              setFormData(prev => ({
                  ...prev,
                  ma_ct: match?.ma_ct || prev.ma_ct,
                  ten_ct: match?.ten_ct || prev.ten_ct,
                  ten_hang_muc: match?.ten_hang_muc || prev.ten_hang_muc,
                  dvt: match?.dvt || prev.dvt,
                  so_luong_ipo: match?.so_luong_ipo || prev.so_luong_ipo,
                  headcode: match?.headcode || prev.headcode,
                  ma_nha_may: match?.ma_nha_may || prev.ma_nha_may
              }));
              setSearchCode(value);
          }
      } catch (e) {
          console.error("Auto lookup failed:", e);
      } finally {
          setIsLookupLoading(false);
      }
  };

  const handleInputChange = (field: keyof Inspection, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSearchCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearchCode(val);
      if (val.length >= 3) {
          lookupPlanInfo(val);
      }
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
          const fullNcr: NCR = {
              ...ncrData,
              id: currentItem.ncr?.id || `NCR-${Date.now()}`,
              inspection_id: formData.id,
              itemId: currentItem.id,
              createdDate: new Date().toISOString(),
              responsiblePerson: ncrData.responsiblePerson || 'QA/QC Lead',
              status: 'OPEN',
              imagesBefore: currentItem.images || []
          };
          newItems[activeNcrItemIndex] = {
              ...currentItem,
              status: CheckStatus.FAIL,
              ncr: fullNcr
          };
          return { ...prev, items: newItems };
      });
      setIsNcrModalOpen(false);
      setActiveNcrItemIndex(null);
  };

  const handleAddItem = () => {
    const newItem: CheckItem = {
      id: `new_${Date.now()}`,
      category: 'General',
      label: '',
      status: CheckStatus.PENDING,
      notes: '',
      stage: formData.inspectionStage
    };
    setFormData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
  };

  const handleRemoveItem = (index: number) => {
    if (window.confirm("Xóa hạng mục này?")) {
        setFormData(prev => ({ 
            ...prev, 
            items: prev.items?.filter((_, i) => i !== index) 
        }));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const processedImage = await resizeImage(base64);
        if (activeUploadId === 'MAIN') {
          setFormData(prev => ({ ...prev, images: [...(prev.images || []), processedImage] }));
        } else if (activeUploadId) {
          setFormData(prev => ({
            ...prev,
            items: prev.items?.map(item => 
              item.id === activeUploadId 
                ? { ...item, images: [...(item.images || []), processedImage] }
                : item
            )
          }));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const triggerUpload = (id: string, type: 'file' | 'camera') => {
    setActiveUploadId(id);
    if (type === 'file') fileInputRef.current?.click();
    else cameraInputRef.current?.click();
  };

  const handleImageClick = (images: string[], index: number, context: { type: 'MAIN' | 'ITEM', itemId?: string }) => {
    setEditorState({ images, index, context });
  };

  const handleEditorSave = (index: number, newImage: string) => {
    if (!editorState) return;
    const { context } = editorState;
    if (context.type === 'MAIN') {
        setFormData(prev => {
            const newImages = [...(prev.images || [])];
            newImages[index] = newImage;
            return { ...prev, images: newImages };
        });
    } else if (context.type === 'ITEM' && context.itemId) {
        setFormData(prev => ({
            ...prev,
            items: prev.items?.map(item => {
                if (item.id === context.itemId) {
                    const newImages = [...(item.images || [])];
                    newImages[index] = newImage;
                    return { ...item, images: newImages };
                }
                return item;
            })
        }));
    }
    setEditorState(prev => {
        if (!prev) return null;
        const newImgs = [...prev.images];
        newImgs[index] = newImage;
        return { ...prev, images: newImgs };
    });
  };

  const handleGetSuggestion = async (item: CheckItem, index: number) => {
      const suggestion = await generateItemSuggestion(item, formData.ten_ct);
      if (suggestion) {
          handleItemChange(index, 'notes', (item.notes ? item.notes + '\n' : '') + `[AI]: ${suggestion}`);
      }
  };

  const handleSubmit = async () => {
    if (!formData.ma_ct || !formData.ten_hang_muc) {
      alert("Vui lòng nhập/quét mã để tải thông tin dự án và hạng mục");
      return;
    }
    setIsSaving(true);
    try {
      const finalData = {
        ...formData,
        inspectorName: user.name,
        updatedAt: new Date().toISOString()
      } as Inspection;
      await onSave(finalData);
    } catch (error) {
      console.error(error);
      alert("Lỗi khi lưu phiếu.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg md:shadow-xl overflow-hidden animate-in slide-in-from-bottom duration-300 relative" style={formStyle}>
      
      {/* 1. Header Toolbar (Top position as requested) */}
      <div className="bg-white border-b border-slate-300 z-10 shrink-0 flex justify-between items-center px-4 py-3">
          <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <h2 style={{ fontWeight: 'bold', fontSize: '13pt' }}>
                {initialData?.id ? 'Biên Bản Kiểm Tra Chất Lượng' : 'Tạo Phiếu Kiểm Tra Mới'}
              </h2>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-all">
              <X className="w-6 h-6" />
          </button>
      </div>

      {/* 2. Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar bg-slate-50">
        
        {/* Section I: Thông tin sản phẩm & Dự án */}
        <div className="bg-white p-4 rounded border border-slate-300 shadow-sm space-y-4">
            <h3 className="text-blue-700 border-b border-blue-100 pb-2 mb-2 flex items-center gap-2" style={{ fontWeight: 'bold' }}>
                <Box className="w-4 h-4"/> I. THÔNG TIN SẢN PHẨM & DỰ ÁN
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                    <div className="flex justify-between items-center">
                        <label className="block text-slate-600 mb-1">Mã định danh (Headcode / Barcode)</label>
                        {isLookupLoading && <Loader2 className="w-3 h-3 animate-spin text-blue-500"/>}
                    </div>
                    <div className="relative flex items-center">
                        <input 
                            value={searchCode}
                            onChange={handleSearchCodeChange}
                            style={inputStyle}
                            className="pr-10"
                            placeholder="Nhập hoặc quét mã..."
                        />
                        <button 
                            onClick={() => setShowScanner(true)}
                            className="absolute right-2 p-1 text-slate-500 hover:text-blue-600 transition-colors"
                            title="Quét QR"
                        >
                            <QrCode className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-slate-600 mb-1">Mã Dự Án</label>
                        <input value={formData.ma_ct || ''} readOnly style={readOnlyStyle} placeholder="Tự động tải..." />
                    </div>
                    <div>
                        <label className="block text-slate-600 mb-1">Tên Sản Phẩm</label>
                        <input value={formData.ten_hang_muc || ''} readOnly style={readOnlyStyle} placeholder="Tự động tải..." />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                    <label className="block text-slate-600 mb-1">Số lượng</label>
                    <input type="number" value={formData.so_luong_ipo || 0} readOnly style={readOnlyStyle} />
                </div>
                <div>
                    <label className="block text-slate-600 mb-1">ĐVT</label>
                    <input value={formData.dvt || 'PCS'} readOnly style={readOnlyStyle} />
                </div>
                <div>
                    <label className="block text-slate-600 mb-1">Ngày kiểm tra</label>
                    <input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} style={inputStyle} />
                </div>
                <div>
                    <label className="block text-slate-600 mb-1">Người kiểm tra</label>
                    <input value={formData.inspectorName || user.name} readOnly style={readOnlyStyle} />
                </div>
            </div>
        </div>

        {/* Section II: Thông tin xưởng & Công đoạn */}
        <div className="bg-white p-4 rounded border border-slate-300 shadow-sm space-y-4">
             <h3 className="text-blue-700 border-b border-blue-100 pb-2 mb-2 flex items-center gap-2" style={{ fontWeight: 'bold' }}>
                <MapPin className="w-4 h-4"/> II. ĐỊA ĐIỂM & CÔNG ĐOẠN
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="block text-slate-600 mb-1">Nhà máy / Xưởng sản xuất</label>
                    <div className="relative">
                        <select
                            value={formData.ma_nha_may || ''}
                            onChange={(e) => handleInputChange('ma_nha_may', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="">-- Chọn nhà máy --</option>
                            {workshops.map(ws => (
                                <option key={ws.code} value={ws.code}>{ws.name} ({ws.code})</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                 </div>
                 <div>
                    <label className="block text-slate-600 mb-1">Giai đoạn kiểm tra</label>
                    {availableStages.length > 0 ? (
                        <div className="relative">
                            <select 
                                value={formData.inspectionStage || ''}
                                onChange={(e) => handleInputChange('inspectionStage', e.target.value)}
                                style={inputStyle}
                            >
                                <option value="">-- Tất cả công đoạn --</option>
                                {availableStages.map(stage => (
                                    <option key={stage} value={stage}>{stage}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    ) : (
                        <input value={formData.inspectionStage || ''} onChange={(e) => handleInputChange('inspectionStage', e.target.value)} style={inputStyle} placeholder="Nhập giai đoạn..." />
                    )}
                 </div>
            </div>
        </div>

        {/* Section III: Hình ảnh hiện trường (Moved Up) */}
        <section className="bg-white p-4 rounded border border-slate-300 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-blue-100 pb-2 mb-2">
                <ImageIcon className="w-4 h-4 text-blue-700" />
                <h3 className="text-blue-700" style={{ fontWeight: 'bold' }}>III. HÌNH ẢNH HIỆN TRƯỜNG TỔNG QUAN</h3>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                <button onClick={() => triggerUpload('MAIN', 'camera')} className="w-24 h-24 shrink-0 bg-blue-50 border border-blue-200 rounded flex flex-col items-center justify-center gap-1 text-blue-600 hover:bg-blue-100 transition-all">
                    <Camera className="w-6 h-6" />
                    <span style={{ fontSize: '10pt' }}>Chụp ảnh</span>
                </button>
                <button onClick={() => triggerUpload('MAIN', 'file')} className="w-24 h-24 shrink-0 bg-white border border-slate-300 rounded flex flex-col items-center justify-center gap-1 text-slate-500 hover:bg-slate-50 hover:border-slate-400 transition-all">
                    <ImageIcon className="w-6 h-6" />
                    <span style={{ fontSize: '10pt' }}>Thư viện</span>
                </button>
                {formData.images?.map((img, idx) => (
                    <div 
                        key={idx} 
                        onClick={() => handleImageClick(formData.images || [], idx, { type: 'MAIN' })}
                        className="relative w-24 h-24 shrink-0 rounded overflow-hidden border border-slate-300 shadow-sm group cursor-pointer hover:border-blue-500 transition-colors"
                    >
                        <img src={img} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Pencil className="w-6 h-6 text-white drop-shadow-sm" />
                        </div>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setFormData({...formData, images: formData.images?.filter((_, i) => i !== idx)});
                            }} 
                            className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full shadow-lg hover:bg-red-600"
                        >
                            <X className="w-3 h-3"/>
                        </button>
                    </div>
                ))}
            </div>
        </section>

        {/* Section IV: Danh sách kiểm tra */}
        <div className="space-y-3">
            <div className="flex justify-between items-end border-b border-slate-300 pb-2 px-1">
                <h3 className="text-slate-700 flex items-center gap-2" style={{ fontWeight: 'bold' }}>
                    <LayoutList className="w-4 h-4 text-blue-600" /> IV. NỘI DUNG KIỂM TRA ({visibleItems.length})
                </h3>
                <button 
                    onClick={handleAddItem} 
                    className="text-blue-600 hover:underline flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded border border-blue-200"
                    style={{ fontSize: '11pt' }}
                >
                    <Plus className="w-3 h-3" /> Thêm tiêu chí
                </button>
            </div>

            <div className="space-y-3">
                {formData.items?.map((item, originalIndex) => {
                    if (formData.inspectionStage && item.stage && item.stage !== formData.inspectionStage) return null;

                    return (
                        <div key={item.id} className={`bg-white rounded p-4 border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-300 bg-red-50/10' : 'border-slate-300'}`}>
                            {/* Row 1: Content Label */}
                            <div className="flex items-start justify-between gap-3 mb-3 border-b border-slate-100 pb-2">
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200" style={{ fontSize: '10pt' }}>{item.category}</span>
                                        {item.stage && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200" style={{ fontSize: '10pt' }}>{item.stage}</span>}
                                        {item.ncr && <span className="bg-red-600 text-white px-2 py-0.5 rounded flex items-center gap-1" style={{ fontSize: '10pt' }}><AlertTriangle className="w-3 h-3"/> NCR Active</span>}
                                    </div>
                                    <input 
                                        value={item.label}
                                        onChange={(e) => handleItemChange(originalIndex, 'label', e.target.value)}
                                        className="w-full bg-transparent p-1 text-slate-800 focus:border-blue-500 focus:outline-none placeholder:text-slate-400"
                                        style={{ fontWeight: 'bold', fontSize: '12pt' }}
                                        placeholder="Nội dung kiểm tra..."
                                    />
                                </div>
                                <button onClick={() => handleRemoveItem(originalIndex)} className="text-slate-400 hover:text-red-500 p-2">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Row 2: Method & Standard */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                                <div className="space-y-1">
                                    <label className="text-slate-500 flex items-center gap-1" style={{ fontSize: '10pt', fontWeight: 'bold' }}>
                                        <Microscope className="w-3 h-3" /> Phương pháp kiểm tra
                                    </label>
                                    <input 
                                        value={item.method || ''}
                                        onChange={(e) => handleItemChange(originalIndex, 'method', e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-slate-700 outline-none focus:border-blue-400"
                                        style={{ fontSize: '11pt' }}
                                        placeholder="VD: Kiểm tra bằng mắt, thước..."
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 flex items-center gap-1" style={{ fontSize: '10pt', fontWeight: 'bold' }}>
                                        <Ruler className="w-3 h-3" /> Tiêu chuẩn / Dung sai
                                    </label>
                                    <input 
                                        value={item.standard || ''}
                                        onChange={(e) => handleItemChange(originalIndex, 'standard', e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-slate-700 outline-none focus:border-blue-400"
                                        style={{ fontSize: '11pt' }}
                                        placeholder="VD: Không trầy xước, +/- 1mm..."
                                    />
                                </div>
                            </div>

                            {/* Row 3: Evaluation Status Buttons */}
                            <div className="flex flex-wrap gap-3 items-center mb-3">
                                <span className="text-slate-600 mr-2" style={{ fontWeight: 'bold' }}>Đánh giá:</span>
                                <div className="flex bg-slate-100 rounded p-1 gap-1 border border-slate-200">
                                    {/* Pass */}
                                    <button
                                        onClick={() => handleItemChange(originalIndex, 'status', CheckStatus.PASS)}
                                        className={`px-3 py-1.5 rounded transition-all flex items-center gap-1 ${
                                            item.status === CheckStatus.PASS 
                                            ? 'bg-green-600 text-white shadow-sm' 
                                            : 'text-slate-600 hover:bg-white'
                                        }`}
                                        style={{ fontSize: '10pt', fontWeight: item.status === CheckStatus.PASS ? 'bold' : 'normal' }}
                                    >
                                        {item.status === CheckStatus.PASS && <CheckCircle2 className="w-3 h-3"/>} Đạt
                                    </button>
                                    
                                    {/* Fail */}
                                    <button
                                        onClick={() => handleItemChange(originalIndex, 'status', CheckStatus.FAIL)}
                                        className={`px-3 py-1.5 rounded transition-all flex items-center gap-1 ${
                                            item.status === CheckStatus.FAIL 
                                            ? 'bg-red-600 text-white shadow-sm' 
                                            : 'text-slate-600 hover:bg-white'
                                        }`}
                                        style={{ fontSize: '10pt', fontWeight: item.status === CheckStatus.FAIL ? 'bold' : 'normal' }}
                                    >
                                        {item.status === CheckStatus.FAIL && <AlertTriangle className="w-3 h-3"/>} Lỗi
                                    </button>

                                    {/* Conditional */}
                                    <button
                                        onClick={() => handleItemChange(originalIndex, 'status', CheckStatus.CONDITIONAL)}
                                        className={`px-3 py-1.5 rounded transition-all flex items-center gap-1 ${
                                            item.status === CheckStatus.CONDITIONAL 
                                            ? 'bg-orange-500 text-white shadow-sm' 
                                            : 'text-slate-600 hover:bg-white'
                                        }`}
                                        style={{ fontSize: '10pt', fontWeight: item.status === CheckStatus.CONDITIONAL ? 'bold' : 'normal' }}
                                    >
                                        {item.status === CheckStatus.CONDITIONAL && <Info className="w-3 h-3"/>} Có điều kiện
                                    </button>

                                    {/* Pending */}
                                    <button
                                        onClick={() => handleItemChange(originalIndex, 'status', CheckStatus.PENDING)}
                                        className={`px-2 py-1.5 rounded transition-all text-slate-400 hover:text-slate-600 hover:bg-white`}
                                        title="Đặt lại"
                                    >
                                        ---
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 ml-auto">
                                    <button 
                                        onClick={() => triggerUpload(item.id, 'camera')}
                                        className="p-2 bg-white text-slate-600 hover:text-blue-600 rounded border border-slate-300 shadow-sm"
                                        title="Chụp ảnh minh chứng"
                                    >
                                        <Camera className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleGetSuggestion(item, originalIndex)}
                                        className="p-2 bg-purple-50 text-purple-600 rounded border border-purple-200 hover:bg-purple-100 shadow-sm"
                                        title="Gợi ý AI"
                                    >
                                        <Info className="w-4 h-4" />
                                    </button>
                                    {item.status === CheckStatus.FAIL && (
                                        <button 
                                            onClick={() => { setActiveNcrItemIndex(originalIndex); setIsNcrModalOpen(true); }}
                                            className={`px-3 py-1.5 rounded border flex items-center gap-1.5 transition-all ${
                                                item.ncr 
                                                ? 'bg-red-50 text-red-600 border-red-200' 
                                                : 'bg-slate-800 text-white border-slate-800 hover:bg-black'
                                            }`}
                                            style={{ fontSize: '10pt' }}
                                        >
                                            <AlertOctagon className="w-3 h-3" />
                                            {item.ncr ? 'Sửa NCR' : 'Tạo NCR'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Row 4: Notes & Images */}
                            <div className="mt-2 space-y-2">
                                <div className="relative">
                                    <textarea 
                                        value={item.notes || ''}
                                        onChange={(e) => handleItemChange(originalIndex, 'notes', e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-700 resize-none h-16 focus:bg-white focus:border-blue-300 outline-none"
                                        style={{ fontSize: '11pt' }}
                                        placeholder="Ghi chú chi tiết..."
                                    />
                                    <div className="absolute top-2 right-2 pointer-events-none opacity-20">
                                        <Pencil className="w-4 h-4" />
                                    </div>
                                </div>
                                
                                {item.images && item.images.length > 0 && (
                                    <div className="flex gap-2 overflow-x-auto py-1 no-scrollbar border-t border-slate-100 pt-2">
                                        {item.images.map((img, i) => (
                                            <div 
                                                key={i} 
                                                onClick={() => handleImageClick(item.images || [], i, { type: 'ITEM', itemId: item.id })}
                                                className="relative w-16 h-16 shrink-0 rounded overflow-hidden border border-slate-300 group/img cursor-pointer hover:border-blue-500"
                                            >
                                                <img src={img} className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                                                    <Pencil className="w-4 h-4 text-white" />
                                                </div>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newImages = item.images?.filter((_, imgIdx) => imgIdx !== i);
                                                        handleItemChange(originalIndex, 'images', newImages);
                                                    }}
                                                    className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl shadow-sm"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Section V: Chữ ký (New) */}
        <section className="bg-white p-4 rounded border border-slate-300 shadow-sm mt-4">
            <h3 className="text-blue-700 border-b border-blue-100 pb-2 mb-4 flex items-center gap-2" style={{ fontWeight: 'bold' }}>
                <PenTool className="w-4 h-4"/> V. XÁC NHẬN & CHỮ KÝ
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SignaturePad 
                    label="Đại diện Xưởng / Nhà máy"
                    value={formData.productionSignature}
                    onChange={(sig) => setFormData(prev => ({ ...prev, productionSignature: sig }))}
                />
                <SignaturePad 
                    label={`Đại diện QA/QC (${user.name})`}
                    value={formData.signature}
                    onChange={(sig) => setFormData(prev => ({ ...prev, signature: sig }))}
                />
            </div>
        </section>

      </div>

      {/* 5. Footer Actions */}
      <div className="p-4 border-t border-slate-300 bg-white flex justify-end gap-3 shrink-0 shadow-lg z-20">
        <Button variant="secondary" onClick={onCancel} className="w-32 border-slate-300">Hủy bỏ</Button>
        <Button 
            onClick={handleSubmit} 
            disabled={isSaving}
            className="w-48 bg-blue-700 hover:bg-blue-800 text-white shadow-md"
        >
            {isSaving ? 'Đang lưu...' : 'Lưu Phiếu'}
        </Button>
      </div>

      {/* Hidden Inputs & Modals */}
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileUpload} />
      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
      
      {activeNcrItemIndex !== null && formData.items && formData.items[activeNcrItemIndex] && (
          <NCRModal 
              isOpen={isNcrModalOpen} 
              onClose={() => setIsNcrModalOpen(false)} 
              onSave={handleSaveNCR}
              initialData={formData.items[activeNcrItemIndex].ncr}
              itemName={formData.items[activeNcrItemIndex].label}
          />
      )}

      {editorState && (
          <ImageEditorModal
              images={editorState.images}
              initialIndex={editorState.index}
              onClose={() => setEditorState(null)}
              onSave={handleEditorSave}
              readOnly={false} 
          />
      )}

      {showScanner && (
          <QRScannerModal 
              onClose={() => setShowScanner(false)} 
              onScan={(data) => {
                  setSearchCode(data);
                  lookupPlanInfo(data);
                  setShowScanner(false);
              }} 
          />
      )}
    </div>
  );
};
