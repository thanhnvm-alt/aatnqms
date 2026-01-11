
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, CheckItem, CheckStatus, InspectionStatus, PlanItem, User, Workshop, NCR } from '../types';
import { Save, X, Camera, Image as ImageIcon, ChevronDown, MapPin, Box, AlertTriangle, Trash2, LayoutList, FileText, QrCode, PenTool, Eraser, Loader2 } from 'lucide-react';
import { fetchPlans } from '../services/apiService';

interface InspectionFormProps {
  initialData?: Partial<Inspection>;
  onSave: (inspection: Inspection) => Promise<void>;
  onCancel: () => void;
  plans: PlanItem[];
  workshops: Workshop[];
  user: User;
}

export const InspectionFormSQC_BTP: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, plans, workshops, user }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({ id: `SQC-BTP-${Date.now()}`, date: new Date().toISOString().split('T')[0], status: InspectionStatus.DRAFT, items: [], images: [], score: 0, ...initialData });
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
    catch (e) { alert("Lỗi khi lưu phiếu SQC-BTP."); } finally { setIsSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12px' }}>
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar bg-slate-50 pb-28">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-teal-700 border-b border-teal-50 pb-2 mb-2 font-black text-xs uppercase tracking-widest flex items-center gap-2"><Box className="w-4 h-4"/> I. THÔNG TIN BÁN THÀNH PHẨM</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Mã Dự Án / PO</label><input value={formData.ma_ct || ''} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-bold text-sm"/></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Xưởng sản xuất / Gia công</label><select value={formData.ma_nha_may || ''} onChange={e => handleInputChange('ma_nha_may', e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-sm font-bold shadow-sm"><option value="">-- Chọn xưởng --</option>{workshops.map(ws => <option key={ws.code} value={ws.code}>{ws.name}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Ngày kiểm</label><input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl font-bold text-sm"/></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">QC Người kiểm</label><input value={formData.inspectorName || user.name} readOnly className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"/></div>
            </div>
        </div>
        <div className="space-y-3">
            <h3 className="font-black text-slate-700 text-xs uppercase tracking-[0.2em] flex items-center gap-2 border-b border-slate-300 pb-2 px-1"><LayoutList className="w-4 h-4 text-teal-600"/> II. TIÊU CHÍ KIỂM TRA BÁN THÀNH PHẨM ({formData.items?.length || 0})</h3>
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
                        <textarea value={item.notes || ''} onChange={e => handleItemChange(idx, 'notes', e.target.value)} className="w-full mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none h-16" placeholder="Ghi chú sai sót..."/>
                    </div>
                ))}
            </div>
        </div>
      </div>
      <div className="p-4 md:p-6 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0 sticky bottom-0 z-20 shadow-[0_-10px_25px_rgba(0,0,0,0.05)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <button onClick={onCancel} className="px-8 py-3.5 text-slate-500 font-black uppercase text-xs tracking-widest hover:bg-slate-50 rounded-xl transition-all" type="button">Hủy</button>
        <button onClick={handleSubmit} disabled={isSaving} className="flex-1 md:px-16 py-4 bg-teal-700 text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl shadow-2xl hover:bg-teal-800 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50" type="button">
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
            <span>HOÀN TẤT SQC-BTP</span>
        </button>
      </div>
    </div>
  );
};
