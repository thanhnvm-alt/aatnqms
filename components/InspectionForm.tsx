import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckStatus, Inspection, InspectionStatus, Priority, PlanItem, CheckItem, Workshop, User, NCR, DefectLibraryItem } from '../types';
import { INITIAL_CHECKLIST_TEMPLATE } from '../constants';
import { fetchPlans, fetchDefectLibrary, fetchTemplates } from '../services/apiService'; 
import { generateNCRSuggestions } from '../services/geminiService';
import { QRScannerModal } from './QRScannerModal';
import { 
  Save, ArrowLeft, Image as ImageIcon, X, Trash2, 
  Plus, PlusCircle, Layers, QrCode,
  ChevronDown, AlertTriangle, AlertCircle, Calendar, ClipboardList, 
  Hash, Box, Loader2, PenTool, Eraser, Edit2, Check, Maximize2,
  Sparkles, Camera, Clock, Info, User as UserIcon, Search,
  FileText
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
      items: [],
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

  const [masterTemplates, setMasterTemplates] = useState<Record<string, CheckItem[]>>({});
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(true);

  useEffect(() => {
    fetchTemplates().then(data => {
        setMasterTemplates(data);
        setIsTemplatesLoading(false);
    });
  }, []);

  // ISO Logic: Tự động lọc checklist theo công đoạn
  useEffect(() => {
      if (isTemplatesLoading || !formData.type || !formData.inspectionStage) return;
      
      const type = formData.type as string;
      const stage = formData.inspectionStage;
      
      if (stage && masterTemplates[type]) {
          const allTemplateItems = masterTemplates[type];
          const filteredItems = allTemplateItems.filter(item => 
              item.stage === stage || !item.stage || item.stage === 'CHUNG'
          );
          
          if (formData.items?.length === 0 || window.confirm(`Load lại danh mục kiểm tra cho công đoạn ${stage}?`)) {
              setFormData(prev => ({
                  ...prev,
                  items: JSON.parse(JSON.stringify(filteredItems))
              }));
          }
      }
  }, [formData.inspectionStage, isTemplatesLoading]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const ncrImageInputRef = useRef<HTMLInputElement>(null);
  const ncrCameraInputRef = useRef<HTMLInputElement>(null);
  
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
      
      setIsSearchingPlan(true);
      try {
          const result = await fetchPlans(cleanCode, 1, 5);
          const found = result.items.find(p => 
              String(p.headcode || '').toLowerCase() === cleanCode.toLowerCase() ||
              String(p.ma_nha_may || '').toLowerCase() === cleanCode.toLowerCase()
          );

          if (found) {
              setFormData(prev => ({
                  ...prev,
                  ma_nha_may: found.ma_nha_may,
                  headcode: found.headcode,
                  ma_ct: found.ma_ct,
                  ten_ct: found.ten_ct,
                  ten_hang_muc: found.ten_hang_muc,
                  dvt: found.dvt || 'PCS',
                  so_luong_ipo: found.so_luong_ipo
              }));
          } else {
              setFormData(prev => ({ ...prev, ma_nha_may: cleanCode }));
          }
      } catch (err) {
          console.error("Direct plan lookup failed:", err);
      } finally {
          setIsSearchingPlan(false);
      }
  };

  const handleMaNhaMayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setFormData(prev => ({ ...prev, ma_nha_may: value }));
      if (value.trim().length >= 9) {
          handleAutoFillFromCode(value.trim());
      }
  };

  const handleQuantityChange = (field: 'inspectedQuantity' | 'passedQuantity' | 'failedQuantity' | 'so_luong_ipo', valueStr: string) => {
    const val = valueStr === '' ? 0 : parseFloat(valueStr);
    setFormData(prev => {
        const next = { ...prev };
        if (field === 'so_luong_ipo') next.so_luong_ipo = val;
        else if (field === 'inspectedQuantity') {
            next.inspectedQuantity = val;
            next.passedQuantity = Math.max(0, val - (prev.failedQuantity || 0));
        } else if (field === 'passedQuantity') {
            next.passedQuantity = val;
            next.failedQuantity = Math.max(0, (next.inspectedQuantity || 0) - val);
        } else if (field === 'failedQuantity') {
            next.failedQuantity = val;
            next.passedQuantity = Math.max(0, (next.inspectedQuantity || 0) - val);
        }
        return next;
    });
  };

  const availableStages = useMemo(() => {
    if (!formData.workshop) return [];
    const workshop = workshops.find(w => w.name === formData.workshop);
    return workshop?.stages || [];
  }, [formData.workshop, workshops]);

  const updateItem = (id: string, updates: Partial<CheckItem>) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items?.map(item => item.id === id ? { ...item, ...updates } : item)
    }));
  };

  const handleAddItem = (categoryName?: string) => {
    const finalCategory = categoryName || prompt("Nhập tên danh mục (G2):", "CHUNG") || "CHUNG";
    const label = prompt("Nhập hạng mục kiểm tra (G3):") || "Hạng mục mới";
    const newItem: CheckItem = {
      id: `item_${Date.now()}`,
      stage: formData.inspectionStage,
      category: finalCategory.toUpperCase(),
      label,
      standard: 'Tiêu chuẩn kỹ thuật...',
      status: CheckStatus.PENDING,
      notes: '',
      images: []
    };
    setFormData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
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
    if (!ncrFormData.issueDescription) { alert("Vui lòng nhập mô tả lỗi để AI có thể tư vấn."); return; }
    setIsAiConsulting(true);
    try {
        const result = await generateNCRSuggestions(ncrFormData.issueDescription, ncrModalItem?.itemLabel || '');
        setNcrFormData(prev => ({ ...prev, rootCause: result.rootCause, solution: result.solution }));
    } catch (err) { alert("Lỗi khi kết nối AI."); } finally { setIsAiConsulting(false); }
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
            const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file);
        }))
    ));
    if (activeUploadId === 'MAIN') setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...processed] }));
    else {
        const itemId = activeUploadId;
        setFormData(prev => ({
            ...prev,
            items: prev.items?.map(item => item.id === itemId ? { ...item, images: [...(item.images || []), ...processed] } : item)
        }));
    }
    setActiveUploadId(null);
  };

  const groupedItems = useMemo(() => {
      const groups: Record<string, CheckItem[]> = {};
      formData.items?.forEach(item => {
          if (!groups[item.category]) groups[item.category] = [];
          groups[item.category].push(item);
      });
      return groups;
  }, [formData.items]);

  const stats = useMemo(() => {
    const total = formData.inspectedQuantity || 0;
    const passed = formData.passedQuantity || 0;
    const passPct = total > 0 ? Math.round((passed / total) * 100) : 0;
    return { passPct };
  }, [formData.inspectedQuantity, formData.passedQuantity]);

  const handleSave = () => {
    if (!formData.ma_nha_may || !formData.ten_hang_muc) { alert("Vui lòng nhập đủ thông tin bắt buộc (*)"); return; }
    setIsSaving(true);
    const total = formData.items?.length || 0;
    const passed = formData.items?.filter(i => i.status === CheckStatus.PASS).length || 0;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;
    const finalInspection: Inspection = {
        ...formData as Inspection,
        id: formData.id || `INS-${Date.now()}`,
        score,
        status: (formData.failedQuantity || 0) > 0 ? InspectionStatus.FLAGGED : InspectionStatus.COMPLETED,
        signature: qcCanvasRef.current?.toDataURL(),
        productionSignature: prodCanvasRef.current?.toDataURL()
    };
    onSave(finalInspection);
  };

  return (
    <div className="bg-slate-50 h-full flex flex-col relative overflow-hidden">
      <input type="file" accept="image/*" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handleFileChange} className="hidden" />

      {showScanner && (
        <QRScannerModal 
          onClose={() => setShowScanner(false)}
          onScan={(data) => { handleAutoFillFromCode(data); setShowScanner(false); }}
        />
      )}

      {editingImageIdx !== null && (
          <ImageEditorModal 
            images={editingImageIdx.type === 'MAIN' ? (formData.images || []) : (formData.items?.find(i => i.id === editingImageIdx.itemId)?.images || [])} 
            initialIndex={editingImageIdx.index} 
            onSave={(idx, img) => {
                if (editingImageIdx.type === 'MAIN') setFormData(prev => ({ ...prev, images: prev.images?.map((im, i) => i === idx ? img : im) }));
                else updateItem(editingImageIdx.itemId!, { images: formData.items?.find(i => i.id === editingImageIdx.itemId)?.images?.map((im, i) => i === idx ? img : im) });
            }} 
            onClose={() => setEditingImageIdx(null)} 
          />
      )}

      <div className="bg-white px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 z-[100] h-16">
        <button onClick={onCancel} className="p-2.5 text-slate-400"><ArrowLeft className="w-6 h-6"/></button>
        <div className="text-center">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-tight">PHIẾU KIỂM TRA MỚI</h2>
            <div className="mt-1"><span className="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[8px] font-black uppercase tracking-widest">{formData.type}</span></div>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white p-2.5 rounded-xl">
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar bg-slate-50/30">
        <div className="max-w-3xl mx-auto p-4 space-y-6 pb-32">
          {/* Đối tượng */}
          <section className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm space-y-5">
              <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MÃ NHÀ MÁY / HEADCODE *</label>
                  <div className="relative group"><input value={formData.ma_nha_may} onChange={handleMaNhaMayChange} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-base font-black text-slate-800 outline-none pr-12 shadow-inner" placeholder="Quét hoặc nhập mã..."/><div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">{isSearchingPlan && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}<button onClick={() => setShowScanner(true)} className="p-2.5 bg-white text-blue-600 rounded-xl shadow-md active:scale-90 transition-all"><QrCode className="w-5 h-5"/></button></div></div>
              </div>
              <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TÊN SẢN PHẨM *</label>
                  <input value={formData.ten_hang_muc} onChange={e => setFormData({...formData, ten_hang_muc: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none" placeholder="Tên sản phẩm..."/>
              </div>
          </section>

          {/* Công đoạn lọc */}
          <section className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm space-y-5">
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">XƯỞNG / KHO</label>
                      <select value={formData.workshop || ''} onChange={e => setFormData({...formData, workshop: e.target.value, inspectionStage: '', items: []})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black outline-none">
                          <option value="">-- Chọn xưởng --</option>
                          {workshops?.map(ws => <option key={ws.id} value={ws.name}>{ws.name}</option>)}
                      </select>
                  </div>
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-1">CÔNG ĐOẠN (G1)</label>
                      <select value={formData.inspectionStage || ''} onChange={e => setFormData({...formData, inspectionStage: e.target.value})} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs font-black text-blue-800 outline-none">
                          <option value="">-- Chọn công đoạn --</option>
                          {availableStages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                      </select>
                  </div>
              </div>
          </section>

          {/* Checklist 3 cấp */}
          <section className="space-y-3">
              <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-slate-800" /><h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">DANH MỤC KIỂM TRA {formData.inspectionStage ? `[${formData.inspectionStage}]` : ''}</h3></div>
                  <button onClick={() => handleAddItem()} className="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 shadow-md"><PlusCircle className="w-3.5 h-3.5" /> Thêm mới</button>
              </div>

              <div className="space-y-8">
                  {isTemplatesLoading ? (
                      <div className="py-10 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
                  ) : !formData.inspectionStage ? (
                      <div className="py-20 text-center bg-slate-100 rounded-3xl border-2 border-dashed border-slate-200"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vui lòng chọn Công đoạn để load checklist</p></div>
                  ) : (
                      Object.entries(groupedItems).map(([cat, items]: [string, CheckItem[]]) => (
                      <div key={cat} className="space-y-4 animate-in slide-in-from-bottom duration-300">
                          <div className="flex items-center justify-between bg-slate-200/50 px-4 py-2.5 rounded-2xl border border-slate-300">
                              <span className="text-[11px] font-black uppercase text-slate-700 tracking-widest">{cat}</span>
                              <button onClick={() => handleAddItem(cat)} className="text-[10px] font-black text-blue-600 uppercase hover:bg-white px-3 py-1.5 rounded-xl"><Plus className="w-3.5 h-3.5"/> Thêm mục</button>
                          </div>

                          <div className="space-y-4">
                              {items.map(item => (
                                  <div key={item.id} className="bg-white rounded-[1.5rem] border border-slate-200 overflow-hidden shadow-sm p-4 space-y-4">
                                      <div className="flex justify-between items-start gap-4">
                                          <div className="flex-1 space-y-2">
                                              <textarea value={item.label} onChange={e => updateItem(item.id, { label: e.target.value })} className="w-full text-sm font-bold text-slate-800 bg-transparent border-b border-dashed border-slate-200 outline-none resize-none" rows={1} onInput={(e) => { const t = e.target as any; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}/>
                                              {item.standard && (
                                                  <div className="flex items-start gap-1.5 bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                                                      <FileText className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
                                                      <p className="text-[10px] text-blue-700 font-medium italic leading-relaxed">{item.standard}</p>
                                                  </div>
                                              )}
                                          </div>
                                          <div className="flex gap-1.5 shrink-0"><button onClick={() => handleOpenNCR(item)} className={`p-2 rounded-xl ${item.ncr ? 'bg-red-600 text-white' : 'text-red-500 bg-red-50'}`}><AlertTriangle className="w-4 h-4"/></button><button onClick={() => updateItem(item.id, { id: 'DELETE' })} className="p-2 text-slate-300"><Trash2 className="w-4 h-4"/></button></div>
                                      </div>
                                      
                                      <div className="flex gap-2"><button onClick={() => handleItemStatusChange(item, CheckStatus.PASS)} className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black border-2 transition-all ${item.status === CheckStatus.PASS ? 'bg-green-600 border-green-600 text-white shadow-lg shadow-green-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>ĐẠT</button><button onClick={() => handleItemStatusChange(item, CheckStatus.FAIL)} className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black border-2 transition-all ${item.status === CheckStatus.FAIL ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>LỖI</button></div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )))}
              </div>
          </section>
        </div>
      </div>
    </div>
  );
};
