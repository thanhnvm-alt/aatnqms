
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

export const InspectionFormFRS: React.FC<InspectionFormProps> = ({ initialData, onSave, onCancel, plans, workshops, user }) => {
  const [formData, setFormData] = useState<Partial<Inspection>>({ 
    id: `FRS-${Date.now()}`, 
    date: new Date().toISOString().split('T')[0], 
    status: InspectionStatus.DRAFT, 
    items: [], 
    images: [], 
    score: 0, 
    type: 'FSR',
    ...initialData 
  });
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
    catch (e) { alert("Lỗi khi lưu phiếu FRS."); } finally { setIsSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-lg overflow-hidden animate-in slide-in-from-bottom duration-300 relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-slate-50">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-orange-700 border-b border-orange-50 pb-2 mb-1 font-black uppercase tracking-widest flex items-center gap-2 text-xs"><Box className="w-4 h-4"/> I. THÔNG TIN MẪU ĐỐI CHỨNG</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Mã Dự Án / Mẫu</label>
                    <input value={formData.ma_ct || ''} readOnly className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-slate-700 font-bold text-[11px] outline-none h-8"/>
                </div>
                <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Tên Sản Phẩm Mẫu</label>
                    <input value={formData.ten_hang_muc || ''} readOnly className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-slate-700 font-bold text-[11px] outline-none h-8"/>
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Ngày kiểm mẫu</label>
                    <input type="date" value={formData.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-md font-bold outline-none text-[11px] h-8"/>
                </div>
                <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">QC/QA Lead</label>
                    <input value={formData.inspectorName || user.name} readOnly className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-md font-bold text-[11px] h-8"/>
                </div>
            </div>
        </div>
        
        <div className="space-y-3">
            <h3 className="font-black text-slate-700 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-slate-300 pb-2 px-1 text-xs"><LayoutList className="w-4 h-4 text-orange-600"/> II. TIÊU CHÍ THẨM ĐỊNH MẪU ĐẦU TIÊN ({formData.items?.length || 0})</h3>
            <div className="space-y-3">
                {formData.items?.map((item, idx) => (
                    <div key={item.id} className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm hover:border-orange-300 transition-colors">
                        <div className="flex justify-between items-start mb-2 border-b border-slate-100 pb-2">
                            <div className="flex-1">
                                <span className="bg-slate-100 text-[8px] font-black uppercase text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">{item.category}</span>
                                <p className="w-full font-black text-xs text-slate-800 uppercase tracking-tight mt-1">{item.label}</p>
                            </div>
                        </div>
                        <div className="flex bg-slate-50 p-1 rounded-lg gap-1 border border-slate-200 shadow-inner w-fit mb-2">
                            {[CheckStatus.PASS, CheckStatus.FAIL].map(st => (
                                <button 
                                    key={st} 
                                    onClick={() => handleItemChange(idx, 'status', st)} 
                                    className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 ${item.status === st ? (st === CheckStatus.PASS ? 'bg-green-600 text-white shadow-sm' : 'bg-red-600 text-white shadow-sm') : 'text-slate-400 hover:bg-white'}`} 
                                    type="button"
                                >
                                    {st}
                                </button>
                            ))}
                        </div>
                        <textarea 
                            value={item.notes || ''} 
                            onChange={e => handleItemChange(idx, 'notes', e.target.value)} 
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-[11px] font-medium focus:ring-1 ring-orange-500 transition-all resize-none h-16" 
                            rows={2}
                            placeholder="Nhận xét mẫu..."
                        />
                    </div>
                ))}
            </div>
        </div>
      </div>
      <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0 shadow-sm z-20 sticky bottom-0">
        <button onClick={onCancel} className="px-6 py-2 text-slate-500 font-bold uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all border border-slate-200 text-[10px]" type="button">Hủy</button>
        <button onClick={handleSubmit} disabled={isSaving} className="px-10 py-2.5 bg-orange-700 text-white font-black uppercase tracking-[0.2em] rounded-xl shadow-lg hover:bg-orange-800 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-[10px]" type="button">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            <span>HOÀN TẤT FRS</span>
        </button>
      </div>
    </div>
  );
};
