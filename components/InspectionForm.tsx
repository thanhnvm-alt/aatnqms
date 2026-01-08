import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckStatus, Inspection, InspectionStatus, Priority, PlanItem, CheckItem, Workshop, User, NCR } from '../types';
import { fetchPlans, fetchTemplates } from '../services/apiService'; 
import { QRScannerModal } from './QRScannerModal';
import { 
  Save, ArrowLeft, Image as ImageIcon, X, Trash2, 
  Plus, Layers, QrCode,
  ChevronDown, AlertTriangle, AlertCircle, ClipboardList, 
  Loader2, PenTool, Edit2, Sparkles, Camera, Info,
  Box, Hash, Factory, Calendar, User as UserIcon
} from 'lucide-react';

interface InspectionFormProps {
  onSave: (inspection: Inspection) => void;
  onCancel: () => void;
  initialData?: Partial<Inspection>;
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
  workshops = [],
  user
}) => {
  const [formData, setFormData] = useState<Partial<Inspection>>(() => {
    const baseState = {
      ma_ct: '',
      ten_ct: '',
      inspectorName: user?.name || 'Administrator', 
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
    if (initialData) return { ...baseState, ...JSON.parse(JSON.stringify(initialData)) };
    return baseState;
  });

  const [masterTemplates, setMasterTemplates] = useState<Record<string, CheckItem[]>>({});
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(true);
  const [isSearchingPlan, setIsSearchingPlan] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const qcCanvasRef = useRef<HTMLCanvasElement>(null);
  const prodCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetchTemplates().then(data => {
        setMasterTemplates(data);
        setIsTemplatesLoading(false);
    });
  }, []);

  useEffect(() => {
      if (isTemplatesLoading || !formData.type || !formData.inspectionStage) return;
      const type = formData.type as string;
      const stage = formData.inspectionStage;
      if (stage && masterTemplates[type]) {
          const filteredItems = masterTemplates[type].filter(item => 
              item.stage === stage || !item.stage || item.stage === 'CHUNG'
          );
          if (formData.items?.length === 0 || initialData?.inspectionStage !== stage) {
              setFormData(prev => ({ ...prev, items: JSON.parse(JSON.stringify(filteredItems)) }));
          }
      }
  }, [formData.inspectionStage, isTemplatesLoading, formData.type]);

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

  const availableStages = useMemo(() => {
    if (!formData.workshop) return [];
    const workshop = workshops.find(w => w.name === formData.workshop);
    return workshop?.stages || [];
  }, [formData.workshop, workshops]);

  const handleSave = () => {
    if (!formData.ma_nha_may || !formData.ma_ct || !formData.ten_hang_muc) { 
        alert("Vui lòng nhập đủ thông tin bắt buộc (*)"); 
        return; 
    }
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
      category: finalCategory,
      label,
      standard: 'Tiêu chuẩn mặc định...',
      status: CheckStatus.PENDING,
      notes: '',
      images: []
    };
    setFormData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
  };

  const groupedItems = useMemo(() => {
      const groups: Record<string, CheckItem[]> = {};
      formData.items?.forEach(item => {
          const cat = item.category || 'CHUNG';
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(item);
      });
      return groups;
  }, [formData.items]);

  const passPercent = formData.inspectedQuantity && formData.inspectedQuantity > 0 
    ? Math.round(((formData.passedQuantity || 0) / formData.inspectedQuantity) * 100) 
    : 0;
  const failPercent = formData.inspectedQuantity && formData.inspectedQuantity > 0 
    ? Math.round(((formData.failedQuantity || 0) / formData.inspectedQuantity) * 100) 
    : 0;

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
            <h2 className="text-[14px] font-black text-slate-900 uppercase tracking-tight">TẠO PHIẾU MỚI</h2>
            <div className="flex gap-2 justify-center mt-1">
                <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[8px] font-black uppercase tracking-widest">{formData.type} - KIỂM TRA SẢN XUẤT</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 border border-emerald-200 rounded text-[8px] font-black uppercase tracking-widest">LINK KẾ HOẠCH</span>
            </div>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white p-2.5 rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar bg-slate-50/30">
        <div className="max-w-4xl mx-auto p-4 space-y-6 pb-32">
          
          {/* SECTION: HÌNH ẢNH HIỆN TRƯỜNG */}
          <section className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                  <ImageIcon className="w-4 h-4 text-slate-400" />
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">HÌNH ẢNH HIỆN TRƯỜNG ({formData.images?.length || 0})</h3>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                  <button 
                    onClick={() => { setActiveUploadId('MAIN'); fileInputRef.current?.click(); }}
                    className="w-24 h-24 shrink-0 bg-white border-2 border-dashed border-blue-200 rounded-2xl flex flex-col items-center justify-center gap-1 active:bg-blue-50 transition-all"
                  >
                      <Plus className="w-5 h-5 text-blue-600" />
                      <span className="text-[8px] font-black text-blue-600 uppercase">THÊM ẢNH</span>
                  </button>
                  {formData.images?.map((img, idx) => (
                      <div key={idx} className="w-24 h-24 shrink-0 rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative group">
                          <img src={img} className="w-full h-full object-cover" />
                          <button onClick={() => setFormData(prev => ({ ...prev, images: prev.images?.filter((_, i) => i !== idx) }))} className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button>
                      </div>
                  ))}
              </div>
          </section>

          {/* SECTION: THÔNG TIN NGUỒN */}
          <section className="bg-white p-6 rounded-[1.5rem] border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center gap-2 px-1 mb-2 border-b border-slate-50 pb-3">
                  <Box className="w-4 h-4 text-blue-600" />
                  <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">THÔNG TIN NGUỒN</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">MÃ NHÀ MÁY *</label>
                      <div className="relative group">
                          <input 
                            value={formData.ma_nha_may} 
                            onChange={e => { const v = e.target.value; setFormData({...formData, ma_nha_may: v}); if(v.length >= 9) handleAutoFillFromCode(v); }} 
                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-800 outline-none pr-12 shadow-inner focus:bg-white focus:ring-4 focus:ring-blue-100/50 transition-all" 
                            placeholder="Nhập mã nhà máy..."
                          />
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              {isSearchingPlan && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                              <button onClick={() => setShowScanner(true)} className="p-2 bg-blue-600 text-white rounded-lg shadow-md active:scale-90 transition-all"><QrCode className="w-4 h-4"/></button>
                          </div>
                      </div>
                  </div>
                  <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">MÃ CÔNG TRÌNH *</label>
                      <input 
                        value={formData.ma_ct} 
                        onChange={e => setFormData({...formData, ma_ct: e.target.value.toUpperCase()})} 
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-800 outline-none shadow-inner focus:bg-white focus:ring-4 focus:ring-blue-100/50 transition-all uppercase" 
                        placeholder="Nhập mã công trình..."
                      />
                  </div>
              </div>

              <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">TÊN CÔNG TRÌNH</label>
                  <input 
                    value={formData.ten_ct} 
                    onChange={e => setFormData({...formData, ten_ct: e.target.value})} 
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none shadow-inner focus:bg-white transition-all" 
                    placeholder="Nhập tên công trình..."
                  />
              </div>

              <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">TÊN SẢN PHẨM *</label>
                  <input 
                    value={formData.ten_hang_muc} 
                    onChange={e => setFormData({...formData, ten_hang_muc: e.target.value})} 
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none shadow-inner focus:bg-white transition-all" 
                    placeholder="Nhập tên sản phẩm..."
                  />
              </div>
          </section>

          {/* SECTION: THÔNG TIN KIỂM TRA */}
          <section className="bg-white p-6 rounded-[1.5rem] border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center gap-2 px-1 mb-2 border-b border-slate-50 pb-3">
                  <AlertCircle className="w-4 h-4 text-orange-600" />
                  <h3 className="text-[10px] font-black text-orange-600 uppercase tracking-widest">THÔNG TIN KIỂM TRA</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">XƯỞNG / KHO / PHÒNG</label>
                      <div className="relative">
                          <select 
                            value={formData.workshop || ''} 
                            onChange={e => setFormData({...formData, workshop: e.target.value, inspectionStage: '', items: []})} 
                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none appearance-none cursor-pointer shadow-sm focus:ring-4 focus:ring-blue-100/50 transition-all"
                          >
                              <option value="">-- Chọn Xưởng --</option>
                              {workshops?.map(ws => <option key={ws.id} value={ws.name}>{ws.name}</option>)}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                  </div>
                  <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">CÔNG ĐOẠN SẢN XUẤT</label>
                      <div className="relative">
                          <select 
                            value={formData.inspectionStage || ''} 
                            onChange={e => setFormData({...formData, inspectionStage: e.target.value})} 
                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none appearance-none cursor-pointer shadow-sm focus:ring-4 focus:ring-blue-100/50 transition-all"
                          >
                              <option value="">-- Chọn công đoạn --</option>
                              {availableStages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                  </div>

                  <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">QC THỰC HIỆN *</label>
                      <div className="relative">
                          <input 
                            value={formData.inspectorName} 
                            readOnly 
                            className="w-full px-11 py-3.5 bg-slate-100 border border-slate-100 rounded-xl text-sm font-black text-slate-700 outline-none"
                          />
                          <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
                      </div>
                  </div>
                  <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">NGÀY KIỂM TRA</label>
                      <div className="relative">
                          <input 
                            type="date" 
                            value={formData.date} 
                            onChange={e => setFormData({...formData, date: e.target.value})} 
                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none shadow-inner focus:bg-white focus:ring-4 focus:ring-blue-100/50 transition-all"
                          />
                          <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                  </div>
              </div>
          </section>

          {/* SECTION: SỐ LƯỢNG KIỂM TRA */}
          <section className="bg-white p-6 rounded-[1.5rem] border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center gap-2 px-1 mb-2 border-b border-slate-50 pb-3">
                  <Hash className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">SỐ LƯỢNG KIỂM TRA</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">SL ĐƠN HÀNG (IPO)</label>
                      <div className="relative">
                          <input 
                            type="number" 
                            value={formData.so_luong_ipo} 
                            onChange={e => setFormData({...formData, so_luong_ipo: Number(e.target.value)})} 
                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-black text-slate-700 outline-none shadow-inner focus:bg-white"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">{formData.dvt || 'PCS'}</span>
                      </div>
                  </div>
                  <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">SL KIỂM TRA</label>
                      <input 
                        type="number" 
                        value={formData.inspectedQuantity} 
                        onChange={e => setFormData({...formData, inspectedQuantity: Number(e.target.value)})} 
                        className="w-full px-5 py-3.5 bg-slate-50 border border-blue-200/50 rounded-xl text-sm font-black text-blue-600 outline-none shadow-inner focus:bg-white"
                      />
                  </div>

                  <div className="space-y-1.5 relative">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex justify-between">SL ĐẠT <span className="text-green-500 font-bold">{passPercent}%</span></label>
                      <input 
                        type="number" 
                        value={formData.passedQuantity} 
                        onChange={e => setFormData({...formData, passedQuantity: Number(e.target.value)})} 
                        className="w-full px-5 py-3.5 bg-green-50/30 border border-green-200/50 rounded-xl text-sm font-black text-green-600 outline-none shadow-sm focus:bg-white"
                      />
                  </div>
                  <div className="space-y-1.5 relative">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex justify-between">SL LỖI <span className="text-red-500 font-bold">{failPercent}%</span></label>
                      <input 
                        type="number" 
                        value={formData.failedQuantity} 
                        onChange={e => setFormData({...formData, failedQuantity: Number(e.target.value)})} 
                        className="w-full px-5 py-3.5 bg-red-50/30 border border-red-200/50 rounded-xl text-sm font-black text-red-600 outline-none shadow-sm focus:bg-white"
                      />
                  </div>
              </div>
          </section>

          {/* Checklist Sections (ISO G2 & G3) */}
          <section className="space-y-4 pt-4">
              <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-slate-800" />
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">DANH MỤC KIỂM TRA ISO {formData.inspectionStage ? `[${formData.inspectionStage}]` : ''}</h3>
                  </div>
              </div>

              <div className="space-y-10">
                  {isTemplatesLoading ? (
                      <div className="py-10 text-center"><Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" /></div>
                  ) : !formData.inspectionStage ? (
                      <div className="py-20 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center gap-3 animate-pulse">
                          <AlertCircle className="w-10 h-10 text-slate-300" />
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] max-w-xs">Chọn công đoạn sản xuất để tải danh mục kiểm tra phù hợp.</p>
                      </div>
                  ) : Object.entries(groupedItems).length === 0 ? (
                      <div className="py-20 text-center bg-white rounded-3xl border border-slate-200"><p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Không có hạng mục cho công đoạn này</p></div>
                  ) : (
                      Object.entries(groupedItems).map(([cat, items]: [string, CheckItem[]]) => (
                      <div key={cat} className="space-y-4 animate-in slide-in-from-bottom duration-300">
                          <div className="flex items-center justify-between bg-white px-5 py-2 rounded-2xl border border-blue-100 shadow-sm">
                              <div className="flex items-center gap-2">
                                  <Layers className="w-4 h-4 text-blue-600" />
                                  <span className="text-[11px] font-black uppercase text-blue-700 tracking-widest">{cat}</span>
                              </div>
                              <button onClick={() => handleAddItem(cat)} className="bg-blue-600 text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"><Plus className="w-3 h-3"/> Thêm mục</button>
                          </div>

                          <div className="space-y-4">
                              {items.map(item => (
                                  <div key={item.id} className="bg-white rounded-[1.5rem] border border-slate-200 overflow-hidden shadow-sm p-5 space-y-4 relative group">
                                      <div className="flex justify-between items-start gap-4">
                                          <div className="flex-1 space-y-2">
                                              <textarea value={item.label} onChange={e => updateItem(item.id, { label: e.target.value })} className="w-full text-sm font-bold text-slate-800 bg-transparent border-b border-dashed border-slate-200 outline-none resize-none focus:border-blue-500 transition-colors" rows={1} placeholder="Nhập hạng mục..."/>
                                              {item.standard && (
                                                  <div className="flex items-start gap-2 bg-blue-50/60 p-3 rounded-xl border border-blue-100 shadow-inner">
                                                      <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                                                      <p className="text-[10px] text-blue-700 font-semibold italic leading-relaxed">{item.standard}</p>
                                                  </div>
                                              )}
                                          </div>
                                          <div className="flex gap-1.5 shrink-0">
                                              <button onClick={() => updateItem(item.id, { id: 'DELETE' })} className="p-2 text-slate-300 hover:text-red-500 transition-colors active:scale-90"><Trash2 className="w-4.5 h-4.5"/></button>
                                          </div>
                                      </div>
                                      
                                      <div className="flex gap-2">
                                          <button onClick={() => updateItem(item.id, { status: CheckStatus.PASS })} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase border-2 transition-all active:scale-95 ${item.status === CheckStatus.PASS ? 'bg-green-600 border-green-600 text-white shadow-lg shadow-green-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>ĐẠT (PASS)</button>
                                          <button onClick={() => updateItem(item.id, { status: CheckStatus.FAIL })} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase border-2 transition-all active:scale-95 ${item.status === CheckStatus.FAIL ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>LỖI (NG)</button>
                                      </div>

                                      <div className="relative group/note">
                                          <Edit2 className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-300 group-focus-within/note:text-blue-500" />
                                          <textarea value={item.notes} onChange={(e) => updateItem(item.id, { notes: e.target.value })} placeholder="Ghi chú chi tiết cho mục này..." className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-medium text-slate-600 focus:bg-white focus:ring-4 focus:ring-blue-100/50 outline-none resize-none shadow-sm" rows={1}/>
                                      </div>
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
    </div>
  );
};
