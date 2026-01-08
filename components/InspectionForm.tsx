
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckStatus, Inspection, InspectionStatus, Priority, PlanItem, CheckItem, Workshop, User, NCR } from '../types';
import { fetchPlans, fetchTemplates } from '../services/apiService'; 
import { QRScannerModal } from './QRScannerModal';
import { 
  Save, ArrowLeft, Image as ImageIcon, X, Trash2, 
  Layers, QrCode, ChevronDown, AlertTriangle, 
  ClipboardList, Loader2, PenTool, Edit2, Camera, Info,
  Box, Hash, Factory, Calendar, FileText, Sparkles, Building2, UserCircle, Plus
} from 'lucide-react';

interface InspectionFormProps {
  onSave: (inspection: Inspection) => void;
  onCancel: () => void;
  initialData?: Partial<Inspection>;
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
    };
    if (initialData) return { ...baseState, ...JSON.parse(JSON.stringify(initialData)) };
    return baseState;
  });

  const [masterTemplates, setMasterTemplates] = useState<Record<string, CheckItem[]>>({});
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false); 
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [ncrModalItem, setNcrModalItem] = useState<{ itemId: string, itemLabel: string } | null>(null);
  const [ncrFormData, setNcrFormData] = useState<Partial<NCR>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const qcCanvasRef = useRef<HTMLCanvasElement>(null);

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
      setFormData(prev => ({ ...prev, items: JSON.parse(JSON.stringify(stageItems)) }));
  }, [formData.inspectionStage, isTemplatesLoading, formData.type, masterTemplates]);

  const availableStages = useMemo(() => {
    if (!formData.workshop) return [];
    const workshop = workshops.find(w => w.name === formData.workshop);
    return workshop?.stages || [];
  }, [formData.workshop, workshops]);

  // Hàm tự động truy vấn dữ liệu từ database Plans
  const handlePlanLookup = async (code: string) => {
    if (!code || code.trim().length < 3) return;
    
    setIsLookingUp(true);
    try {
        const result = await fetchPlans(code, 1, 10);
        // Tìm bản ghi khớp chính xác mã nhà máy hoặc headcode
        const found = result.items.find(p => 
            p.ma_nha_may?.toLowerCase() === code.toLowerCase() || 
            p.headcode?.toLowerCase() === code.toLowerCase()
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
                so_luong_ipo: found.so_luong_ipo || 0
            }));
        }
    } catch (error) {
        console.error("Auto-lookup error:", error);
    } finally {
        setIsLookingUp(false);
    }
  };

  const updateItem = (id: string, updates: Partial<CheckItem>) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items?.map(item => item.id === id ? { ...item, ...updates } : item)
    }));
  };

  const handleItemStatusChange = (item: CheckItem, status: CheckStatus) => {
    updateItem(item.id, { status });
    if (formData.type === 'PQC' && status === CheckStatus.FAIL) {
        setNcrModalItem({ itemId: item.id, itemLabel: item.label });
        setNcrFormData({
            issueDescription: item.notes || '',
            status: 'OPEN',
            createdDate: new Date().toISOString().split('T')[0],
            imagesBefore: item.images || []
        });
    }
  };

  const handleSaveNCR = () => {
      if (!ncrModalItem || !ncrFormData.issueDescription) { alert("Vui lòng mô tả lỗi NCR"); return; }
      const newNCR: NCR = {
          id: `NCR-${Date.now()}`,
          inspection_id: formData.id,
          itemId: ncrModalItem.itemId,
          createdDate: ncrFormData.createdDate || '',
          issueDescription: ncrFormData.issueDescription || '',
          rootCause: ncrFormData.rootCause || '',
          solution: ncrFormData.solution || '',
          responsiblePerson: ncrFormData.responsiblePerson || '',
          status: 'OPEN',
          severity: ncrFormData.severity || 'MINOR',
          imagesBefore: ncrFormData.imagesBefore || [],
          imagesAfter: []
      };
      updateItem(ncrModalItem.itemId, { ncr: newNCR });
      setNcrModalItem(null);
  };

  const handleImageInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeUploadId) return;
    const processed = await Promise.all(Array.from(files).map(async (f: File) => 
        await resizeImage(await new Promise<string>(res => {
            const r = new FileReader(); 
            r.onload = () => res(r.result as string); 
            r.readAsDataURL(f);
        }))
    ));
    if (activeUploadId === 'MAIN') setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...processed] }));
    else updateItem(activeUploadId, { images: [...(formData.items?.find(i => i.id === activeUploadId)?.images || []), ...processed] });
    setActiveUploadId(null);
  };

  const handleSave = () => {
    if (!formData.ma_nha_may || !formData.ten_hang_muc) { alert("Vui lòng nhập đủ thông tin bắt buộc (*)"); return; }
    setIsSaving(true);
    onSave({ ...formData as Inspection, id: formData.id || `INS-${Date.now()}`, signature: qcCanvasRef.current?.toDataURL() });
  };

  return (
    <div className="bg-[#f8faff] h-full flex flex-col relative overflow-hidden">
      <input type="file" multiple ref={fileInputRef} onChange={handleImageInput} className="hidden" />
      <input type="file" capture="environment" ref={cameraInputRef} onChange={handleImageInput} className="hidden" />

      {showScanner && (
          <QRScannerModal 
            onClose={() => setShowScanner(false)} 
            onScan={(code) => {
                setFormData(prev => ({ ...prev, ma_nha_may: code }));
                setShowScanner(false);
                handlePlanLookup(code); // Tự động load ngay sau khi quét
            }}
          />
      )}

      {/* Header Toolbar */}
      <div className="bg-white px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 z-[100] h-16 shadow-sm">
        <button onClick={onCancel} className="p-2 text-slate-400 active:scale-90 transition-all"><ArrowLeft className="w-6 h-6"/></button>
        <div className="text-center">
            <h2 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] leading-none mb-1">Tạo phiếu mới</h2>
            <div className="flex gap-2 justify-center">
                <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[8px] font-black uppercase">{formData.type} - KIỂM TRA</span>
                <span className="px-2 py-0.5 bg-green-500 text-white rounded text-[8px] font-black uppercase">ISO-LINKED</span>
            </div>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white p-2.5 rounded-xl shadow-lg active:scale-95 transition-all">
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar bg-[#f8faff]">
        <div className="max-w-3xl mx-auto p-4 space-y-6 pb-32">
          
          {/* Section: Hình ảnh hiện trường */}
          <section className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                  <ImageIcon className="w-4 h-4 text-slate-400" />
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">HÌNH ẢNH HIỆN TRƯỜNG ({formData.images?.length || 0})</h3>
              </div>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                  <button onClick={() => { setActiveUploadId('MAIN'); fileInputRef.current?.click(); }} className="w-24 h-24 shrink-0 bg-white border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-1 text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-all">
                      <Plus className="w-6 h-6" />
                      <span className="text-[8px] font-black uppercase">Thêm ảnh</span>
                  </button>
                  {formData.images?.map((img, idx) => (
                      <div key={idx} className="relative w-24 h-24 shrink-0 rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
                          <img src={img} className="w-full h-full object-cover" />
                          <button onClick={() => setFormData({...formData, images: formData.images?.filter((_, i) => i !== idx)})} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full shadow-lg"><X className="w-3 h-3"/></button>
                      </div>
                  ))}
              </div>
          </section>

          {/* Section: Thông tin nguồn */}
          <section className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-50 pb-3 mb-1">
                  <Box className="w-4 h-4 text-blue-600" />
                  <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Thông tin nguồn (Tự động)</h3>
                  {isLookingUp && <Loader2 className="w-3 h-3 animate-spin text-blue-500 ml-auto" />}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MÃ NHÀ MÁY / HEADCODE *</label>
                      <div className="relative">
                          <input 
                            value={formData.ma_nha_may} 
                            onChange={e => setFormData({...formData, ma_nha_may: e.target.value})}
                            onBlur={() => handlePlanLookup(formData.ma_nha_may || '')} // Tự động load khi thoát focus
                            onKeyDown={e => e.key === 'Enter' && handlePlanLookup(formData.ma_nha_may || '')}
                            className={`w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:bg-white transition-all shadow-inner pr-12 ${isLookingUp ? 'animate-pulse' : ''}`} 
                            placeholder="Nhập mã nhà máy..."
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                              {isLookingUp ? (
                                  <div className="p-2"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /></div>
                              ) : (
                                  <button onClick={() => setShowScanner(true)} className="p-2 text-slate-400 hover:text-blue-600 active:scale-90 transition-all"><QrCode className="w-5 h-5"/></button>
                              )}
                          </div>
                      </div>
                  </div>
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MÃ CÔNG TRÌNH *</label>
                      <input value={formData.ma_ct} onChange={e => setFormData({...formData, ma_ct: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-800 uppercase shadow-inner outline-none focus:bg-white" placeholder="NHẬP MÃ CÔNG TRÌNH..."/>
                  </div>
              </div>
              <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TÊN CÔNG TRÌNH</label>
                  <input value={formData.ten_ct} onChange={e => setFormData({...formData, ten_ct: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 shadow-inner outline-none focus:bg-white" placeholder="Nhập tên công trình..."/>
              </div>
              <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">TÊN SẢN PHẨM *</label>
                  <input value={formData.ten_hang_muc} onChange={e => setFormData({...formData, ten_hang_muc: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 shadow-inner outline-none focus:bg-white" placeholder="Nhập tên sản phẩm..."/>
              </div>
          </section>

          {/* Section: Thông tin kiểm tra */}
          <section className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-50 pb-3 mb-1">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                  <h3 className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Thông tin kiểm tra</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">XƯỞNG / KHO / PHÒNG</label>
                      <select value={formData.workshop || ''} onChange={e => setFormData({...formData, workshop: e.target.value, inspectionStage: '', items: []})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black text-slate-700 outline-none appearance-none shadow-inner">
                          <option value="">-- Chọn Xưởng --</option>
                          {workshops?.map(ws => <option key={ws.id} value={ws.name}>{ws.name}</option>)}
                      </select>
                  </div>
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CÔNG ĐOẠN SẢN XUẤT</label>
                      <select value={formData.inspectionStage || ''} onChange={e => setFormData({...formData, inspectionStage: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black text-slate-700 outline-none appearance-none shadow-inner">
                          <option value="">-- Chọn công đoạn --</option>
                          {availableStages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                      </select>
                  </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">QC THỰC HIỆN *</label>
                      <div className="flex items-center gap-3 px-5 py-3 bg-slate-100 rounded-2xl border border-slate-50">
                          <UserCircle className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-black text-slate-800 uppercase tracking-tight">{formData.inspectorName}</span>
                      </div>
                  </div>
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">NGÀY KIỂM TRA</label>
                      <div className="relative">
                        <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none shadow-inner"/>
                        <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      </div>
                  </div>
              </div>
          </section>

          {/* Section: Số lượng kiểm tra */}
          <section className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-50 pb-3 mb-1">
                  <Hash className="w-4 h-4 text-blue-700" />
                  <h3 className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Số lượng kiểm tra</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">SL ĐƠN HÀNG (IPO)</label>
                      <div className="relative">
                          <input type="number" value={formData.so_luong_ipo} onChange={e => setFormData({...formData, so_luong_ipo: Number(e.target.value)})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-blue-700 outline-none pr-12 shadow-inner"/>
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">{formData.dvt || 'PCS'}</span>
                      </div>
                  </div>
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">SL KIỂM TRA</label>
                      <input type="number" value={formData.inspectedQuantity} onChange={e => setFormData({...formData, inspectedQuantity: Number(e.target.value)})} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-blue-700 outline-none shadow-inner"/>
                  </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                      <div className="flex justify-between items-center px-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SL ĐẠT</label>
                          <span className="text-[10px] font-bold text-green-500">
                             {formData.inspectedQuantity ? Math.round(((formData.passedQuantity || 0) / formData.inspectedQuantity) * 100) : 0}%
                          </span>
                      </div>
                      <input type="number" value={formData.passedQuantity} onChange={e => setFormData({...formData, passedQuantity: Number(e.target.value)})} className="w-full px-5 py-3 bg-green-50/30 border border-green-100 rounded-2xl text-sm font-black text-green-600 outline-none shadow-inner"/>
                  </div>
                  <div className="space-y-1.5">
                      <div className="flex justify-between items-center px-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SL LỖI</label>
                          <span className="text-[10px] font-bold text-red-500">
                             {formData.inspectedQuantity ? Math.round(((formData.failedQuantity || 0) / formData.inspectedQuantity) * 100) : 0}%
                          </span>
                      </div>
                      <input type="number" value={formData.failedQuantity} onChange={e => setFormData({...formData, failedQuantity: Number(e.target.value)})} className="w-full px-5 py-3 bg-red-50/30 border border-red-100 rounded-2xl text-sm font-black text-red-600 outline-none shadow-inner"/>
                  </div>
              </div>
          </section>

          {/* Hạng mục kiểm tra dynamic */}
          {formData.items && formData.items.length > 0 && (
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <ClipboardList className="w-4 h-4 text-slate-800" />
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">HẠNG MỤC KIỂM TRA ISO {formData.inspectionStage ? `[${formData.inspectionStage}]` : ''}</h3>
                </div>

                <div className="space-y-4">
                    {formData.items.map((item) => (
                        <div key={item.id} className="bg-white rounded-[1.5rem] border border-slate-200 overflow-hidden shadow-sm p-4 space-y-4 relative group">
                            <div className="flex justify-between items-start gap-4">
                                <div className="flex-1 space-y-2">
                                    <h4 className="text-sm font-bold text-slate-800 leading-tight">{item.label}</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {item.method && <span className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded text-[9px] font-bold border border-slate-100 uppercase">Cách: {item.method}</span>}
                                        {item.standard && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-bold border border-blue-100 uppercase">Chuẩn: {item.standard}</span>}
                                    </div>
                                </div>
                                {item.ncr && <div className="p-1.5 bg-red-600 text-white rounded-lg shadow-sm animate-pulse"><AlertTriangle className="w-3.5 h-3.5" /></div>}
                            </div>
                            
                            <div className="flex gap-2">
                                <button onClick={() => handleItemStatusChange(item, CheckStatus.PASS)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${item.status === CheckStatus.PASS ? 'bg-green-600 border-green-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>ĐẠT</button>
                                <button onClick={() => handleItemStatusChange(item, CheckStatus.FAIL)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${item.status === CheckStatus.FAIL ? 'bg-red-600 border-red-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>LỖI</button>
                                <button onClick={() => handleItemStatusChange(item, CheckStatus.CONDITIONAL)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${item.status === CheckStatus.CONDITIONAL ? 'bg-orange-500 border-orange-500 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>CÓ ĐK</button>
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
                    ))}
                </div>
            </section>
          )}

          {/* Chữ ký */}
          <section className="space-y-4 pt-6 border-t border-slate-200 pb-12">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">XÁC NHẬN CHỮ KÝ HIỆN TRƯỜNG</p>
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-[2rem] h-44 relative overflow-hidden shadow-inner max-w-sm mx-auto">
                  <canvas ref={qcCanvasRef} width={400} height={200} className="w-full h-full cursor-crosshair touch-none" style={{ touchAction: 'none' }} />
              </div>
              <p className="text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">{formData.inspectorName || user?.name}</p>
          </section>
        </div>
      </div>

      {/* NCR Mandatory Modal */}
      {ncrModalItem && (
          <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="px-6 py-4 bg-red-600 text-white flex justify-between items-center shrink-0">
                      <div className="flex gap-3 items-center"><AlertTriangle className="w-6 h-6" /><h3 className="font-black text-lg uppercase tracking-tight">PHÁT HÀNH PHIẾU NCR LỖI</h3></div>
                      <button onClick={() => setNcrModalItem(null)} className="p-2 active:scale-90"><X className="w-7 h-7"/></button>
                  </div>
                  <div className="p-6 space-y-6 overflow-y-auto no-scrollbar flex-1">
                      <div className="bg-red-50 p-4 rounded-2xl border-2 border-red-50 flex justify-between items-center">
                          <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Hạng mục sai lỗi</p><p className="text-sm font-black text-red-600 uppercase">{ncrModalItem.itemLabel}</p></div>
                          <div className="text-right"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Công đoạn</p><p className="text-xs font-black text-slate-700 uppercase">{formData.inspectionStage}</p></div>
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MÔ TẢ SAI HỎNG KỸ THUẬT *</label>
                          <textarea value={ncrFormData.issueDescription || ''} onChange={e => setNcrFormData({...ncrFormData, issueDescription: e.target.value})} className="w-full px-5 py-4 border-2 border-red-100 rounded-2xl bg-white text-sm font-bold text-slate-800 outline-none resize-none focus:border-red-500 shadow-sm" rows={3} placeholder="Mô tả cụ thể tình trạng sai hỏng thực tế..."/>
                      </div>
                      <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200 space-y-4">
                          <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5"><Sparkles className="w-4 h-4"/> PHÂN TÍCH ISO (QUY TRÌNH)</h4>
                          <div className="space-y-3">
                              {/* Fixed: Corrected typo 'set=ncrFormData' to 'setNcrFormData' */}
                              <textarea value={ncrFormData.rootCause || ''} onChange={e => setNcrFormData({...ncrFormData, rootCause: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none resize-none h-16" placeholder="Nguyên nhân thực tế (Root Cause)..."/>
                              <textarea value={ncrFormData.solution || ''} onChange={e => setNcrFormData({...ncrFormData, solution: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none resize-none h-16" placeholder="Biện pháp khắc phục (Action Plan)..."/>
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
