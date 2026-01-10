import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, PlanItem, User, Workshop, NCR } from '../types';
import { Save, X, Camera, Image as ImageIcon, ChevronDown, MapPin, Box, AlertTriangle, Trash2, LayoutList, FileText, QrCode, PenTool, Eraser, Loader2 } from 'lucide-react';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  plans: PlanItem[];
  workshops: Workshop[];
  user: User;
}

export const InspectionFormSPR: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, plans, workshops, user }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({ id: `SPR-${Date.now()}`, date: new Date().toISOString().split('T')[0], status: InspectionStatus.DRAFT, items: [], images: [], score: 0, ...initialData });
  const [isSaving, setIsSaving] = useState(false);

  const handleInputChange = (field: keyof Inspection, value: any) => { setFormData(prev => ({ ...prev, [field]: value })); };
  const handleItemChange = (index: number, field: keyof CheckItem, value: any) => {
    const newItems = [...(formData.items || [])]; if (newItems[index]) { newItems[index] = { ...newItems[index], [field]: value }; }
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async () => {
    if (!formData.ma_ct) { alert("Vui lòng nhập mã dự án."); return; }
    setIsSaving(true);
    try { await onSave({ ...formData, status: InspectionStatus.PENDING, updatedAt: new Date().toISOString() } as Inspection); }
    catch (e) { alert("Lỗi khi lưu phiếu SPR."); } finally { setIsSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt' }}>
      <div className="bg-white border-b border-slate-300 shrink-0 flex justify-between items-center px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-slate-600" /><div><h2 className="font-black text-[13pt] uppercase tracking-tighter leading-none">SPR FORM</h2><p className="text-[8pt] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Kiểm tra mẫu chuẩn (Sample Review)</p></div></div>
          <button onClick={onCancel} className="p-2 text-slate-500 hover:bg-red-50 rounded-full transition-all" type="button"><X className="w-6 h-6" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar bg-slate-50">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-slate-700 border-b border-slate-50 pb-2 mb-2 font-black text-xs uppercase tracking-widest flex items-center gap-2"><Box className="w-4 h-4"/> I. THÔNG TIN MẪU CHUẨN</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Mã Dự Án / Mã Mẫu</label><input value={formData.ma_ct || ''} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-bold text-sm"/></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Tên Mẫu</label><input value={formData.ten_hang_muc || ''} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-bold text-sm"/></div>
            </div>
        </div>
        <div className="space-y-3">
            <h3 className="font-black text-slate-700 text-xs uppercase tracking-[0.2em] flex items-center gap-2 border-b border-slate-300 pb-2 px-1"><LayoutList className="w-4 h-4 text-slate-600"/> II. TIÊU CHÍ KIỂM MẪU ({formData.items?.length || 0})</h3>
            <div className="space-y-4">
                {formData.items?.map((item, idx) => (
                    <div key={item.id} className="bg-white rounded-[2rem] p-5 border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-3">
                            <div className="flex-1"><span className="bg-slate-100 text-[8pt] font-black uppercase text-slate-500 px-2.5 py-0.5 rounded-full border border-slate-200">{item.category}</span><p className="w-full font-black text-[11pt] text-slate-800 uppercase tracking-tight mt-1">{item.label}</p></div>
                        </div>
                        <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 border border-slate-200 shadow-inner w-fit">
                            {[CheckStatus.PASS, CheckStatus.FAIL].map(st => (
                                <button key={st} onClick={() => handleItemChange(idx, 'status', st)} className={`px-4 py-2 rounded-xl text-[9pt] font-black uppercase tracking-tight transition-all ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-lg' : 'bg-red-600 text-white shadow-lg') : 'text-slate-400'}`} type="button">{st}</button>
                            ))}
                        </div>
                        <textarea value={item.notes || ''} onChange={e => handleItemChange(idx, 'notes', e.target.value)} className="w-full mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none h-16" placeholder="Ghi chú mẫu..."/>
                    </div>
                ))}
            </div>
        </div>
      </div>
      <div className="p-4 md:p-6 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0 shadow-sm z-20">
        <button onClick={onCancel} className="px-8 py-3.5 text-slate-500 font-black uppercase text-xs tracking-widest hover:bg-slate-50 rounded-xl transition-all" type="button">Hủy</button>
        <button onClick={handleSubmit} disabled={isSaving} className="px-16 py-4 bg-slate-700 text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl shadow-2xl hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50" type="button">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
            <span>HOÀN TẤT SPR</span>
        </button>
      </div>
    </div>
  );
};