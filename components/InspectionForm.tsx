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
  FileText, Factory
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

  // ISO Logic: Tự động lọc checklist khi Công đoạn thay đổi
  useEffect(() => {
      if (isTemplatesLoading || !formData.type || !formData.inspectionStage) return;
      
      const type = formData.type as string;
      const stage = formData.inspectionStage;
      
      if (stage && masterTemplates[type]) {
          const allTemplateItems = masterTemplates[type];
          // Lọc hạng mục thuộc công đoạn (G1)
          const filteredItems = allTemplateItems.filter(item => 
              item.stage === stage || !item.stage || item.stage === 'CHUNG'
          );
          
          if (formData.items?.length === 0 || (initialData?.inspectionStage !== stage && window.confirm(`Đồng bộ lại danh mục kiểm tra cho công đoạn [${stage}]?`))) {
              setFormData(prev => ({
                  ...prev,
                  items: JSON.parse(JSON.stringify(filteredItems))
              }));
          }
      }
  }, [formData.inspectionStage, isTemplatesLoading, formData.type]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiConsulting, setIsAiConsulting] = useState(false);
  const [isSearchingPlan, setIsSearchingPlan] = useState(false);
  const [ncrModalItem, setNcrModalItem] = useState<{ itemId: string, itemLabel: string, ncrData?: NCR } | null>(null);
  const [ncrFormData, setNcrFormData] = useState<Partial<NCR>>({});
  const [editingCategory, setEditingCategory] = useState<{name: string, value: string} | null>(null);
  const [editingImageIdx, setEditingImageIdx] = useState<{ type: 'MAIN' | 'ITEM', itemId?: string, index: number } | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  const qcCanvasRef = useRef<HTMLCanvasElement>(null);
  const prodCanvasRef = useRef<HTMLCanvasElement>(null);

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
      } catch (err) { console.error("Plan lookup failed:", err); } finally { setIsSearchingPlan(false); }
  };

  const handleMaNhaMayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setFormData(prev => ({ ...prev, ma_nha_may: value }));
      if (value.trim().length >= 9) { handleAutoFillFromCode(value.trim()); }
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
      standard: 'Tiêu chuẩn mặc định cho hạng mục này...',
      status: CheckStatus.PENDING,
      notes: '',
      images: []
    };
    setFormData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
  };

  const groupedItems = useMemo(() => {
      const groups: Record<string, CheckItem[]> = {};
      formData.items?.forEach(item => {
          if (!groups[item.category]) groups[item.category] = [];
          groups[item.category].push(item);
      });
      return groups;
  }, [formData.items]);

  const handleSave = () => {
    if (!formData.ma_nha_may || !formData.ten_hang_muc) { alert("Vui lòng nhập đủ thông tin bắt buộc (*)"); return; }
    setIsSaving(true);
    const total = formData.items?.length || 0;
    const passed = formData.items?.filter(i => i.status === CheckStatus.PASS).length || 0;
    const finalInspection: Inspection = {
        ...formData as Inspection,
        id: formData.id || `INS-${Date.now()}`,
        score: total > 0 ? Math.round((passed / total) * 100) : 0,
        status: (formData.failedQuantity || 0) > 0 ? InspectionStatus.FLAGGED : InspectionStatus.COMPLETED,
        signature: qcCanvasRef.current?.toDataURL(),
        productionSignature: prodCanvasRef.current?.toDataURL()
    };
    onSave(finalInspection);
  };

  const handleItemStatusChange = (item: CheckItem, status: CheckStatus) => {
      updateItem(item.id, { status });
      if (status === CheckStatus.FAIL && !item.ncr) {
          setNcrModalItem({ itemId: item.id, itemLabel: item.label });
          setNcrFormData({ issueDescription: item.notes || '', status: 'OPEN', createdDate: new Date().toISOString().split('T')[0] });
      }
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

  return (
    <div className="bg-slate-50 h-full flex flex-col relative overflow-hidden">
      <input type="file" accept="image/*" multiple ref={fileInputRef} onChange={async (e) => {
          const files = e.target.files; if (!files || files.length === 0 || !activeUploadId) return;
          const processed = await Promise.all(Array.from(files).map(async (f: File) => await resizeImage(await new Promise<string>(res => {const r=new FileReader(); r.onload=()=>res(r.result as string); r.readAsDataURL(f);}))));
          if (activeUploadId === 'MAIN') setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...processed] }));
          else updateItem(activeUploadId, { images: [...(formData.items?.find(i => i.id === activeUploadId)?.images || []), ...processed] });
          setActiveUploadId(null);
      }} className="hidden" />

      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={(data) => { handleAutoFillFromCode(data); setShowScanner(false); }} />}

      <div className="bg-white px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 z-[100] h-16 shadow-sm">
        <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 active:scale-90 transition-all"><ArrowLeft className="w-6 h-6"/></button>
        <div className="text-center">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-tight">PHIẾU KIỂM TRA ISO</h2>
            <div className="mt-1"><span className="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[8px] font-black uppercase tracking-widest">{formData.type}</span></div>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white p-2.5 rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar bg-slate-50/30">
        <div className="max-w-3xl mx-auto p-4 space-y-6 pb-32">
          {/* Thông tin đối tượng */}
          <section className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-5">
              <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MÃ NHÀ MÁY / HEADCODE *</label>
                  <div className="relative group"><input value={formData.ma_nha_may} onChange={handleMaNhaMayChange} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-base font-black text-slate-800 outline-none pr-12 shadow-inner focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all" placeholder="Quét QR hoặc nhập mã..."/><div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">{isSearchingPlan && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}<button onClick={() => setShowScanner(true)} className="p-2.5 bg-white text-blue-600 rounded-xl shadow-md active:scale-90 transition-all border border-slate-100"><QrCode className="w-5 h-5"/></button></div></div>
              </div>
              <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TÊN SẢN PHẨM *</label>
                  <input value={formData.ten_hang_muc} onChange={e => setFormData({...formData, ten_hang_muc: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:bg-white transition-all shadow-inner" placeholder="Tên sản phẩm..."/>
              </div>
          </section>

          {/* Lọc Công đoạn (ISO G1) */}
          <section className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><Factory className="w-3.5 h-3.5" /> XƯỞNG / KHO</label>
                      <select value={formData.workshop || ''} onChange={e => setFormData({...formData, workshop: e.target.value, inspectionStage: '', items: []})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black outline-none shadow-inner appearance-none cursor-pointer">
                          <option value="">-- Chọn xưởng sản xuất --</option>
                          {workshops?.map(ws => <option key={ws.id} value={ws.name}>{ws.name}</option>)}
                      </select>
                  </div>
                  <div className="space-y-2">
                      <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-1 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> CÔNG ĐOẠN (GROUP 1)</label>
                      <div className="relative">
                          <select value={formData.inspectionStage || ''} onChange={e => setFormData({...formData, inspectionStage: e.target.value})} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs font-black text-blue-800 outline-none appearance-none cursor-pointer shadow-sm focus:ring-4 focus:ring-blue-100 transition-all">
                              <option value="">-- Chọn công đoạn thực hiện --</option>
                              {availableStages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                      </div>
                  </div>
              </div>
          </section>

          {/* Ma trận 3 cấp (ISO G2 & G3) */}
          <section className="space-y-3">
              <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-slate-800" />
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">HẠNG MỤC ISO {formData.inspectionStage ? `[${formData.inspectionStage}]` : ''}</h3>
                  </div>
                  <button onClick={() => handleAddItem()} className="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 shadow-md active:scale-95 transition-all"><PlusCircle className="w-3.5 h-3.5" /> Thêm mục mới</button>
              </div>

              <div className="space-y-8">
                  {isTemplatesLoading ? (
                      <div className="py-20 text-center flex flex-col items-center gap-3"><Loader2 className="w-10 h-10 animate-spin text-blue-500" /><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Đang tải cấu hình...</p></div>
                  ) : !formData.inspectionStage ? (
                      <div className="py-24 text-center bg-slate-100 rounded-[3rem] border-2 border-dashed border-slate-200 flex flex-col items-center gap-3 animate-pulse">
                          <AlertCircle className="w-10 h-10 text-slate-300" />
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] max-w-xs leading-relaxed">Vui lòng chọn Công đoạn sản xuất để tải danh mục kiểm tra.</p>
                      </div>
                  ) : Object.entries(groupedItems).length === 0 ? (
                      <div className="py-20 text-center bg-white rounded-3xl border border-slate-200"><p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Không có hạng mục cho công đoạn này</p></div>
                  ) : (
                      Object.entries(groupedItems).map(([cat, items]: [string, CheckItem[]]) => (
                      <div key={cat} className="space-y-4 animate-in slide-in-from-bottom duration-300">
                          <div className="flex items-center justify-between bg-slate-200/50 px-4 py-2.5 rounded-2xl border border-slate-300 shadow-sm">
                              <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div>
                                  <span className="text-[11px] font-black uppercase text-slate-700 tracking-widest">{cat}</span>
                              </div>
                              <button onClick={() => handleAddItem(cat)} className="text-[10px] font-black text-blue-600 uppercase hover:bg-white px-3 py-1.5 rounded-xl transition-all"><Plus className="w-3.5 h-3.5"/> Thêm hạng mục</button>
                          </div>

                          <div className="space-y-4">
                              {items.map(item => (
                                  <div key={item.id} className="bg-white rounded-[1.5rem] border border-slate-200 overflow-hidden shadow-sm p-5 space-y-4 relative group">
                                      <div className="flex justify-between items-start gap-4">
                                          <div className="flex-1 space-y-2">
                                              <textarea value={item.label} onChange={e => updateItem(item.id, { label: e.target.value })} className="w-full text-sm font-bold text-slate-800 bg-transparent border-b border-dashed border-slate-200 outline-none resize-none focus:border-blue-500 transition-colors" rows={1} onInput={(e) => { const t = e.target as any; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }} placeholder="Nhập hạng mục..."/>
                                              
                                              {/* ISO Technical Standard (G3) */}
                                              {item.standard && (
                                                  <div className="flex items-start gap-2 bg-blue-50/60 p-3 rounded-xl border border-blue-100 shadow-inner">
                                                      <FileText className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                                                      <p className="text-[10px] text-blue-700 font-semibold italic leading-relaxed">{item.standard}</p>
                                                  </div>
                                              )}
                                          </div>
                                          <div className="flex gap-1.5 shrink-0"><button onClick={() => handleItemStatusChange(item, CheckStatus.FAIL)} className={`p-2 rounded-xl transition-all active:scale-90 ${item.ncr ? 'bg-red-600 text-white shadow-lg' : 'text-red-500 bg-red-50'}`} title="Phiếu NCR"><AlertTriangle className="w-4.5 h-4.5"/></button><button onClick={() => updateItem(item.id, { id: 'DELETE' })} className="p-2 text-slate-300 hover:text-red-500 transition-colors active:scale-90"><Trash2 className="w-4.5 h-4.5"/></button></div>
                                      </div>
                                      
                                      <div className="flex gap-2">
                                          <button onClick={() => handleItemStatusChange(item, CheckStatus.PASS)} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase border-2 transition-all active:scale-95 ${item.status === CheckStatus.PASS ? 'bg-green-600 border-green-600 text-white shadow-lg shadow-green-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>ĐẠT (PASS)</button>
                                          <button onClick={() => handleItemStatusChange(item, CheckStatus.FAIL)} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase border-2 transition-all active:scale-95 ${item.status === CheckStatus.FAIL ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>LỖI (NCR)</button>
                                      </div>

                                      <div className="relative group/note"><Edit2 className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-300 group-focus-within/note:text-blue-500" /><textarea value={item.notes} onChange={(e) => updateItem(item.id, { notes: e.target.value })} placeholder="Ghi chú chi tiết cho mục này..." className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-medium text-slate-600 focus:bg-white focus:ring-4 focus:ring-blue-100/50 outline-none resize-none shadow-sm" rows={1}/></div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )))}
              </div>
          </section>

          {/* Chữ ký xác nhận */}
          <section className="space-y-4 pt-6 border-t border-slate-200 pb-12">
              <div className="flex items-center gap-2 px-1"><PenTool className="w-4 h-4 text-blue-600" /><h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">XÁC NHẬN CHỮ KÝ HIỆN TRƯỜNG</h3></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">QC INSPECTOR</label><div className="bg-white border-2 border-dashed border-slate-200 rounded-[2rem] h-44 relative overflow-hidden shadow-inner"><canvas ref={qcCanvasRef} width={400} height={200} className="w-full h-full cursor-crosshair touch-none" style={{ touchAction: 'none' }} /></div><p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{formData.inspectorName}</p></div>
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ĐẠI DIỆN SẢN XUẤT</label><div className="bg-white border-2 border-dashed border-slate-200 rounded-[2rem] h-44 relative overflow-hidden shadow-inner"><canvas ref={prodCanvasRef} width={400} height={200} className="w-full h-full cursor-crosshair touch-none" style={{ touchAction: 'none' }} /></div><input value={formData.productionName || ''} onChange={e => setFormData({...formData, productionName: e.target.value.toUpperCase()})} className="w-full text-center py-2 text-[10px] font-black text-slate-700 outline-none uppercase bg-transparent" placeholder="NHẬP TÊN NGƯỜI KÝ..."/></div>
              </div>
          </section>
        </div>
      </div>

      {ncrModalItem && (
          <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-xl h-full md:h-auto md:max-h-[90vh] md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
                  <div className="px-6 py-4 bg-red-600 text-white flex justify-between items-center shrink-0"><div className="flex gap-3 items-center"><AlertTriangle className="w-6 h-6" /><h3 className="font-black text-lg uppercase tracking-tight leading-none">PHIẾU NCR LỖI</h3></div><button onClick={() => setNcrModalItem(null)} className="p-2 active:scale-90"><X className="w-7 h-7"/></button></div>
                  <div className="p-6 space-y-6 overflow-y-auto no-scrollbar flex-1 pb-32 md:pb-6 bg-slate-50/50">
                      <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MÔ TẢ LỖI PHÁT HIỆN *</label><textarea value={ncrFormData.issueDescription || ''} onChange={e => setNcrFormData({...ncrFormData, issueDescription: e.target.value})} className="w-full px-5 py-4 border-2 border-red-100 rounded-2xl bg-white text-sm font-bold text-slate-800 outline-none resize-none focus:border-red-500 shadow-sm" rows={3} placeholder="Mô tả cụ thể sai hỏng..."/></div>
                      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                          <div className="flex justify-between items-center"><h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1.5"><Sparkles className="w-4 h-4"/> TRỢ LÝ AI PHÂN TÍCH</h4><button onClick={handleAiConsult} disabled={isAiConsulting} className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase shadow-lg active:scale-95 disabled:opacity-50 transition-all">{isAiConsulting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Bắt đầu tư vấn'}</button></div>
                          <div className="space-y-3">
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nguyên nhân gốc rễ (AI suggested)</label><textarea value={ncrFormData.rootCause || ''} onChange={e => setNcrFormData({...ncrFormData, rootCause: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium text-slate-700 outline-none resize-none min-h-[60px]" placeholder="Phân tích tại sao xảy ra lỗi..."/></div>
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Biện pháp khắc phục (Action Plan)</label><textarea value={ncrFormData.solution || ''} onChange={e => setNcrFormData({...ncrFormData, solution: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium text-slate-700 outline-none resize-none min-h-[60px]" placeholder="Các bước xử lý tiếp theo..."/></div>
                          </div>
                      </div>
                  </div>
                  <div className="p-4 border-t bg-white flex justify-end gap-3 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] sticky bottom-0 z-50"><button onClick={() => setNcrModalItem(null)} className="px-6 py-3 text-xs font-black uppercase text-slate-400 tracking-widest active:scale-95">HỦY BỎ</button><button onClick={handleSaveNCR} className="bg-red-600 text-white flex-1 md:flex-none px-12 py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-red-500/30 active:scale-95 transition-all">XÁC NHẬN NCR</button></div>
              </div>
          </div>
      )}
    </div>
  );
};
