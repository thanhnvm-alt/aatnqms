
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckStatus, Inspection, InspectionStatus, Priority, PlanItem, CheckItem, Workshop, User, NCR, DefectLibraryItem } from '../types';
import { INITIAL_CHECKLIST_TEMPLATE } from '../constants';
import { fetchPlans, fetchDefectLibrary, fetchTemplates } from '../services/apiService'; 
import { generateNCRSuggestions } from '../services/geminiService';
import { QRScannerModal } from './QRScannerModal';
import { 
  Save, ArrowLeft, Image as ImageIcon, X, Trash2, 
  Plus, PlusCircle, Layers, QrCode,
  ChevronDown, AlertTriangle, Calendar, ClipboardList, 
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
    if (initialData) return { ...baseState, ...JSON.parse(JSON.stringify(initialData)) };
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

  // ISO Logic: Tải hạng mục theo Công đoạn cho PQC
  useEffect(() => {
      if (isTemplatesLoading || formData.type !== 'PQC' || !formData.inspectionStage) return;
      
      const pqcTemplate = masterTemplates['PQC'] || [];
      const stageItems = pqcTemplate.filter(item => item.stage === formData.inspectionStage);
      
      // Chỉ cập nhật nếu danh sách hiện tại rỗng hoặc người dùng đổi công đoạn (có confirm)
      if (formData.items?.length === 0 || (initialData?.inspectionStage !== formData.inspectionStage)) {
          setFormData(prev => ({
              ...prev,
              items: JSON.parse(JSON.stringify(stageItems))
          }));
      }
  }, [formData.inspectionStage, isTemplatesLoading, formData.type]);

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
  const [showScanner, setShowScanner] = useState(false);

  const qcCanvasRef = useRef<HTMLCanvasElement>(null);
  const prodCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleMaNhaMayChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setFormData(prev => ({ ...prev, ma_nha_may: value }));
      if (value.trim().length >= 9) {
          setIsSearchingPlan(true);
          try {
              const res = await fetchPlans(value.trim(), 1, 5);
              const found = res.items.find(p => p.ma_nha_may === value.trim() || p.headcode === value.trim());
              if (found) {
                  setFormData(prev => ({ ...prev, ...found, ten_hang_muc: found.ten_hang_muc }));
              }
          } finally { setIsSearchingPlan(false); }
      }
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

  const handleItemStatusChange = (item: CheckItem, status: CheckStatus) => {
    updateItem(item.id, { status });
    // BẮT BUỘC: Khi chọn LỖI trong PQC, mở NCR Form
    if (formData.type === 'PQC' && status === CheckStatus.FAIL) {
        setNcrModalItem({ itemId: item.id, itemLabel: item.label });
        setNcrFormData({
            issueDescription: item.notes || '',
            responsiblePerson: '',
            status: 'OPEN',
            createdDate: new Date().toISOString().split('T')[0],
            imagesBefore: item.images || []
        });
    }
  };

  const handleSaveNCR = () => {
      if (!ncrModalItem || !ncrFormData.issueDescription) { alert("Vui lòng nhập mô tả lỗi cho NCR"); return; }
      const newNCR: NCR = {
          id: `NCR-${Date.now()}`,
          inspection_id: formData.id,
          itemId: ncrModalItem.itemId,
          createdDate: ncrFormData.createdDate || new Date().toISOString().split('T')[0],
          issueDescription: ncrFormData.issueDescription,
          rootCause: ncrFormData.rootCause || '',
          solution: ncrFormData.solution || '',
          responsiblePerson: ncrFormData.responsiblePerson || '',
          status: 'OPEN',
          severity: ncrFormData.severity || 'MINOR',
          imagesBefore: ncrFormData.imagesBefore || [],
          imagesAfter: []
      };
      // Ghi chú: Theo yêu cầu, NCR Form được lưu vào bảng NCR. 
      // Trong phiên bản Web này, ta lưu tạm vào item và sẽ được API xử lý tách bảng khi gọi onSave.
      updateItem(ncrModalItem.itemId, { ncr: newNCR });
      setNcrModalItem(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeUploadId) return;
    const processed = await Promise.all(Array.from(files).map(async (f: File) => await resizeImage(await new Promise<string>(res => {const r=new FileReader(); r.onload=()=>res(r.result as string); r.readAsDataURL(f);}))));
    if (activeUploadId === 'MAIN') setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...processed] }));
    else updateItem(activeUploadId, { images: [...(formData.items?.find(i => i.id === activeUploadId)?.images || []), ...processed] });
    setActiveUploadId(null);
  };

  const handleSave = () => {
    if (!formData.ma_nha_may || !formData.ten_hang_muc) { alert("Vui lòng nhập đủ thông tin bắt buộc (*)"); return; }
    setIsSaving(true);
    onSave({
        ...formData as Inspection,
        id: formData.id || `INS-${Date.now()}`,
        signature: qcCanvasRef.current?.toDataURL()
    });
  };

  return (
    <div className="bg-slate-50 h-full flex flex-col relative overflow-hidden">
      <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      <input type="file" capture="environment" ref={cameraInputRef} onChange={handleFileChange} className="hidden" />

      {showScanner && <QRScannerModal onClose={() => setShowScanner(false)} onScan={(data) => { setFormData(prev => ({...prev, ma_nha_may: data})); setShowScanner(false); }} />}

      <div className="bg-white px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 z-[100] h-16 shadow-sm">
        <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 active:scale-90 transition-all"><ArrowLeft className="w-6 h-6"/></button>
        <div className="text-center">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-tight">PHIẾU KIỂM TRA ISO</h2>
            <div className="mt-1"><span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[8px] font-black uppercase">{formData.type}</span></div>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white p-2.5 rounded-xl shadow-lg active:scale-95 transition-all">
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar bg-slate-50/30">
        <div className="max-w-3xl mx-auto p-4 space-y-6 pb-32">
          
          {/* Section: Thông tin đối tượng */}
          <section className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
              <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MÃ NHÀ MÁY / HEADCODE *</label>
                  <div className="relative group">
                      <input value={formData.ma_nha_may} onChange={handleMaNhaMayChange} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-800 outline-none pr-12 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all shadow-inner" placeholder="Quét QR hoặc nhập mã..."/>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {isSearchingPlan && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                          <button onClick={() => setShowScanner(true)} className="p-2.5 bg-white text-blue-600 rounded-xl shadow-md border border-slate-100 active:scale-90 transition-all"><QrCode className="w-5 h-5"/></button>
                      </div>
                  </div>
              </div>
              <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TÊN SẢN PHẨM *</label>
                  <input value={formData.ten_hang_muc} onChange={e => setFormData({...formData, ten_hang_muc: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none shadow-inner" placeholder="Tên SP..."/>
              </div>
          </section>

          {/* Section: Xưởng & Công đoạn */}
          <section className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">XƯỞNG SẢN XUẤT</label>
                      <div className="relative">
                          <select value={formData.workshop || ''} onChange={e => setFormData({...formData, workshop: e.target.value, inspectionStage: '', items: []})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black text-slate-800 outline-none appearance-none shadow-inner cursor-pointer">
                              <option value="">-- Chọn xưởng --</option>
                              {workshops?.map(ws => <option key={ws.id} value={ws.name}>{ws.name}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                  </div>
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-1">CÔNG ĐOẠN SẢN XUẤT</label>
                      <div className="relative">
                          <select value={formData.inspectionStage || ''} onChange={e => setFormData({...formData, inspectionStage: e.target.value})} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs font-black text-blue-800 outline-none appearance-none shadow-sm cursor-pointer">
                              <option value="">-- Chọn công đoạn --</option>
                              {availableStages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                      </div>
                  </div>
              </div>
          </section>

          {/* Section: Hạng mục kiểm tra chuẩn ISO */}
          <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                  <ClipboardList className="w-4 h-4 text-slate-800" />
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">TIÊU CHÍ KIỂM TRA ISO {formData.inspectionStage ? `[${formData.inspectionStage}]` : ''}</h3>
              </div>

              <div className="space-y-4">
                  {isTemplatesLoading ? (
                      <div className="py-10 text-center flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /><p className="text-[10px] font-black text-slate-400 uppercase">Đang tải cấu hình...</p></div>
                  ) : !formData.inspectionStage ? (
                      <div className="py-16 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center gap-2 animate-pulse">
                          <Info className="w-8 h-8 text-slate-200" />
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chọn công đoạn để tải danh mục</p>
                      </div>
                  ) : (
                      formData.items?.map((item) => (
                          <div key={item.id} className="bg-white rounded-[1.5rem] border border-slate-200 overflow-hidden shadow-sm p-4 space-y-4 relative group">
                              <div className="flex justify-between items-start gap-4">
                                  <div className="flex-1 space-y-2">
                                      <h4 className="text-sm font-black text-slate-800 leading-tight">{item.label}</h4>
                                      <div className="flex flex-wrap gap-2">
                                          {item.method && <span className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded text-[9px] font-bold border border-slate-100 uppercase">Cách: {item.method}</span>}
                                          {item.standard && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-bold border border-blue-100 uppercase">Chuẩn: {item.standard}</span>}
                                      </div>
                                  </div>
                                  {item.ncr && <div className="p-1.5 bg-red-600 text-white rounded-lg shadow-sm animate-pulse"><AlertTriangle className="w-3.5 h-3.5" /></div>}
                              </div>
                              
                              <div className="flex gap-2">
                                  <button onClick={() => handleItemStatusChange(item, CheckStatus.PASS)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all active:scale-95 ${item.status === CheckStatus.PASS ? 'bg-green-600 border-green-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>ĐẠT</button>
                                  <button onClick={() => handleItemStatusChange(item, CheckStatus.FAIL)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all active:scale-95 ${item.status === CheckStatus.FAIL ? 'bg-red-600 border-red-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>LỖI</button>
                                  <button onClick={() => handleItemStatusChange(item, CheckStatus.CONDITIONAL)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all active:scale-95 ${item.status === CheckStatus.CONDITIONAL ? 'bg-orange-500 border-orange-500 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>CÓ ĐK</button>
                              </div>

                              <div className="flex items-center gap-3 pt-1">
                                  <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar">
                                      <button onClick={() => { setActiveUploadId(item.id); cameraInputRef.current?.click(); }} className="w-10 h-10 shrink-0 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100 active:scale-90 transition-all"><Camera className="w-5 h-5" /></button>
                                      <button onClick={() => { setActiveUploadId(item.id); fileInputRef.current?.click(); }} className="w-10 h-10 shrink-0 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center border border-slate-100 active:scale-90 transition-all"><ImageIcon className="w-5 h-5" /></button>
                                      {item.images?.map((img, i) => (
                                          <div key={i} className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden border border-slate-200">
                                              <img src={img} className="w-full h-full object-cover" />
                                              <button onClick={() => updateItem(item.id, { images: item.images?.filter((_, idx) => idx !== i) })} className="absolute top-0 right-0 bg-black/50 text-white p-0.5"><X className="w-2 h-2" /></button>
                                          </div>
                                      ))}
                                  </div>
                                  <div className="relative group/note flex-1 max-w-[150px]">
                                      <Edit2 className="absolute left-3 top-3 w-3 h-3 text-slate-300" />
                                      <textarea value={item.notes} onChange={(e) => updateItem(item.id, { notes: e.target.value })} placeholder="Ghi chú..." className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-medium text-slate-600 focus:bg-white outline-none resize-none shadow-sm" rows={1}/>
                                  </div>
                              </div>
                          </div>
                      ))
                  )}
              </div>
          </section>

          {/* Section Chữ ký */}
          <section className="space-y-4 pt-6 border-t border-slate-200 pb-12">
              <div className="flex items-center gap-2 px-1"><PenTool className="w-4 h-4 text-blue-600" /><h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">XÁC NHẬN CHỮ KÝ HIỆN TRƯỜNG</h3></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">QC INSPECTOR</label><div className="bg-white border-2 border-dashed border-slate-200 rounded-[2rem] h-44 relative overflow-hidden shadow-inner"><canvas ref={qcCanvasRef} width={400} height={200} className="w-full h-full cursor-crosshair touch-none" style={{ touchAction: 'none' }} /></div><p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{formData.inspectorName}</p></div>
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ĐẠI DIỆN SẢN XUẤT</label><div className="bg-white border-2 border-dashed border-slate-200 rounded-[2rem] h-44 relative overflow-hidden shadow-inner"><canvas ref={prodCanvasRef} width={400} height={200} className="w-full h-full cursor-crosshair touch-none" style={{ touchAction: 'none' }} /></div><input value={formData.productionName || ''} onChange={e => setFormData({...formData, productionName: e.target.value.toUpperCase()})} className="w-full text-center py-2 text-[10px] font-black text-slate-700 outline-none uppercase bg-transparent" placeholder="NHẬP TÊN NGƯỜI KÝ..."/></div>
              </div>
          </section>
        </div>
      </div>

      {/* NCR Form Modal (Bắt buộc khi chọn Lỗi) */}
      {ncrModalItem && (
          <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="px-6 py-4 bg-red-600 text-white flex justify-between items-center shrink-0">
                      <div className="flex gap-3 items-center"><AlertTriangle className="w-6 h-6" /><h3 className="font-black text-lg uppercase tracking-tight">PHÁT HÀNH PHIẾU NCR LỖI</h3></div>
                      <button onClick={() => setNcrModalItem(null)} className="p-2 active:scale-90"><X className="w-7 h-7"/></button>
                  </div>
                  <div className="p-6 space-y-6 overflow-y-auto no-scrollbar flex-1 bg-slate-50/50">
                      <div className="bg-white p-4 rounded-2xl border-2 border-red-50 shadow-sm flex justify-between items-center">
                          <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Hạng mục sai hỏng</p><p className="text-sm font-black text-red-600 uppercase">{ncrModalItem.itemLabel}</p></div>
                          <div className="text-right"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Công đoạn</p><p className="text-xs font-black text-slate-700 uppercase">{formData.inspectionStage}</p></div>
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MÔ TẢ SAI HỎNG KỸ THUẬT *</label>
                          <textarea value={ncrFormData.issueDescription || ''} onChange={e => setNcrFormData({...ncrFormData, issueDescription: e.target.value})} className="w-full px-5 py-4 border-2 border-red-100 rounded-2xl bg-white text-sm font-bold text-slate-800 outline-none resize-none focus:border-red-500 shadow-sm" rows={3} placeholder="Mô tả cụ thể tình trạng sai hỏng thực tế..."/>
                      </div>
                      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                          <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1.5"><Sparkles className="w-4 h-4"/> PHÂN TÍCH ISO 9001 (AI ASSISTANT)</h4>
                          <div className="space-y-3">
                              <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nguyên nhân (Root Cause)</label>
                                  <textarea value={ncrFormData.rootCause || ''} onChange={e => setNcrFormData({...ncrFormData, rootCause: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium text-slate-700 outline-none resize-none h-16" placeholder="Phân tích tại sao xảy ra lỗi..."/>
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Giải pháp (Correction)</label>
                                  <textarea value={ncrFormData.solution || ''} onChange={e => setNcrFormData({...ncrFormData, solution: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium text-slate-700 outline-none resize-none h-16" placeholder="Các bước xử lý ngay lập tức..."/>
                              </div>
                          </div>
                      </div>
                  </div>
                  <div className="p-4 border-t bg-white flex justify-end gap-3 shrink-0 shadow-lg">
                      <button onClick={() => setNcrModalItem(null)} className="px-6 py-3 text-xs font-black uppercase text-slate-400 tracking-widest active:scale-95">HỦY BỎ</button>
                      <button onClick={handleSaveNCR} className="bg-red-600 text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">LƯU HỒ SƠ NCR</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
