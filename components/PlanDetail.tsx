
import React, { useState } from 'react';
import { PlanItem, CheckItem, CheckStatus, Inspection, InspectionStatus } from '../types';
import { PQC_CHECKLIST_TEMPLATE } from '../constants';
import { 
  X, Calendar, Building2, Box, Hash, Edit3, Plus, 
  CheckCircle2, ArrowRight, Save, Trash2, GripVertical,
  ClipboardCheck, Info, Tag, Clock, FileText, User, ChevronRight, AlertOctagon
} from 'lucide-react';

interface PlanDetailProps {
  item: PlanItem;
  onBack: () => void;
  onCreateInspection: (customItems: CheckItem[]) => void;
  relatedInspections?: Inspection[];
  onViewInspection: (id: string) => void;
}

export const PlanDetail: React.FC<PlanDetailProps> = ({ 
    item, onBack, onCreateInspection, relatedInspections = [], onViewInspection 
}) => {
  // Khởi tạo checklist từ template PQC mặc định
  const [checklist, setChecklist] = useState<CheckItem[]>(() => {
      return JSON.parse(JSON.stringify(PQC_CHECKLIST_TEMPLATE));
  });

  const [isEditing, setIsEditing] = useState(false);

  const handleAddItem = () => {
      const newItem: CheckItem = {
          id: `custom_${Date.now()}`,
          category: 'MỚI',
          label: '',
          status: CheckStatus.PENDING,
          notes: ''
      };
      setChecklist([...checklist, newItem]);
      setIsEditing(true);
  };

  const handleUpdateItem = (id: string, field: keyof CheckItem, value: string) => {
      setChecklist(prev => prev.map(check => 
          check.id === id ? { ...check, [field]: value } : check
      ));
  };

  const handleDeleteItem = (id: string) => {
      if (window.confirm('Xóa tiêu chí này?')) {
          setChecklist(prev => prev.filter(check => check.id !== id));
      }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0f172a]/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-300">
        
        {/* Header - Dark Theme */}
        <div className="bg-[#1e293b] p-6 relative shrink-0">
            <button 
                onClick={onBack} 
                className="absolute top-6 right-6 p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors active:scale-90"
            >
                <X className="w-6 h-6" />
            </button>
            
            <div className="flex gap-5 pr-8">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/40 shrink-0">
                    <Box className="w-10 h-10 text-white" />
                </div>
                <div className="overflow-hidden">
                    <h2 className="text-white font-black text-xl uppercase leading-tight line-clamp-2 mb-2 tracking-tight">
                        {item.ten_hang_muc}
                    </h2>
                    <div className="flex flex-wrap gap-2 text-[10px] md:text-xs font-mono font-bold text-slate-400">
                        <span className="flex items-center gap-1"># {item.ma_nha_may}</span>
                        <span className="bg-slate-700/50 px-2 py-0.5 rounded text-slate-400 border border-slate-700">HC: {item.headcode}</span>
                    </div>
                </div>
            </div>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto no-scrollbar space-y-6 bg-white flex-1">
            
            {/* Project & Date Row */}
            <div className="grid grid-cols-2 gap-6 px-1">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <Box className="w-3.5 h-3.5" /> Dự án
                    </div>
                    <p className="text-sm font-black text-slate-800 uppercase">{item.ma_ct}</p>
                </div>
                <div className="text-right space-y-1.5">
                    <div className="flex items-center justify-end gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <Clock className="w-3.5 h-3.5" /> Ngày dự kiến
                    </div>
                    <p className="text-sm font-black text-slate-800">{item.plannedDate || '---'}</p>
                </div>
            </div>

            {/* Quantities Block */}
            <div className="bg-slate-50/50 rounded-3xl p-5 border border-slate-100 grid grid-cols-2 gap-6 relative overflow-hidden">
                <div className="absolute left-1/2 top-4 bottom-4 w-px bg-slate-200"></div>
                <div className="space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Số lượng ĐH</span>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-blue-600">{item.so_luong_ipo}</span>
                        <span className="text-xs font-bold text-slate-400 uppercase">{item.dvt}</span>
                    </div>
                </div>
                <div className="space-y-1 pl-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">PTHSP</span>
                    <p className="text-2xl font-black text-slate-300">---</p>
                </div>
            </div>

            {/* Project Name Section */}
            <div className="flex items-start gap-4 px-1">
                <div className="p-2 bg-red-50 text-red-500 rounded-xl mt-0.5 shrink-0 shadow-sm border border-red-100">
                    <Building2 className="w-5 h-5" />
                </div>
                <div className="flex-1 overflow-hidden">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tên công trình</p>
                    <p className="text-sm font-bold text-slate-700 leading-tight uppercase">
                        {item.ten_ct}
                    </p>
                </div>
            </div>

            {/* Related Inspections Section */}
            {relatedInspections.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2">
                        <FileText className="w-4 h-4 text-green-600"/> Phiếu đã tạo ({relatedInspections.length})
                    </h3>
                    <div className="space-y-2">
                        {relatedInspections.map(insp => {
                            const ncrCount = insp.items.filter(i => i.status === CheckStatus.FAIL).length;
                            return (
                                <div 
                                    key={insp.id}
                                    onClick={() => onViewInspection(insp.id)}
                                    className="bg-white border border-slate-200 p-3 rounded-2xl flex items-center justify-between cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-xl ${
                                            insp.status === InspectionStatus.APPROVED ? 'bg-green-100 text-green-600' :
                                            insp.status === InspectionStatus.FLAGGED ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            <ClipboardCheck className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase text-slate-700">{insp.type} - {insp.id.split('-').pop()}</p>
                                            <div className="flex items-center gap-2 text-[9px] text-slate-400 font-medium">
                                                <span className="flex items-center gap-1"><User className="w-2.5 h-2.5"/> {insp.inspectorName}</span>
                                                <span>{insp.date}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {ncrCount > 0 && (
                                            <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[8px] font-black border border-red-100 flex items-center gap-1">
                                                <AlertOctagon className="w-2.5 h-2.5"/> {ncrCount}
                                            </span>
                                        )}
                                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Checklist Selection */}
            <div className="bg-blue-50/30 rounded-[2rem] border border-blue-100 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-blue-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <ClipboardCheck className="w-5 h-5 text-blue-600" />
                        <h3 className="text-xs font-black text-blue-900 uppercase tracking-widest">Tiêu chí kiểm tra theo mã SP</h3>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setIsEditing(!isEditing)}
                            className={`p-2 rounded-xl border transition-all active:scale-90 ${isEditing ? 'bg-green-600 border-green-600 text-white' : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'}`}
                        >
                            {isEditing ? <Save className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                        </button>
                        <button 
                            onClick={handleAddItem}
                            className="p-2 bg-white text-green-600 border border-green-200 rounded-xl hover:bg-green-50 active:scale-90 transition-all shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                
                <div className="p-4 space-y-4 max-h-[250px] overflow-y-auto no-scrollbar">
                    {checklist.map((check, idx) => (
                        <div key={check.id} className="flex items-start gap-4 group">
                            <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
                            
                            {isEditing ? (
                                <div className="flex-1 flex gap-2">
                                    <input 
                                        value={check.category}
                                        onChange={(e) => handleUpdateItem(check.id, 'category', e.target.value.toUpperCase())}
                                        className="w-24 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[9px] font-black text-blue-600 uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="NHÓM"
                                    />
                                    <input 
                                        value={check.label}
                                        onChange={(e) => handleUpdateItem(check.id, 'label', e.target.value)}
                                        className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Tiêu chí..."
                                    />
                                    <button onClick={() => handleDeleteItem(check.id)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            ) : (
                                <p className="text-slate-700 font-bold text-[13px] leading-relaxed">
                                    <span className="text-[10px] font-black text-blue-500 mr-2 uppercase tracking-tighter">[{check.category}]</span>
                                    {check.label}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>

        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-white border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
            <button 
                onClick={() => onCreateInspection(checklist)}
                className="order-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl text-sm font-black uppercase tracking-[0.1em] shadow-xl shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
                <Plus className="w-5 h-5" /> Tạo phiếu mới
            </button>
            <button 
                onClick={onBack}
                className="order-2 bg-slate-100 hover:bg-slate-200 text-slate-600 py-4 rounded-2xl text-sm font-black uppercase tracking-[0.1em] active:scale-[0.98] transition-all"
            >
                Đóng
            </button>
        </div>

      </div>
    </div>
  );
};
