
import React, { useState, useEffect } from 'react';
import { PlanItem, CheckItem, CheckStatus } from '../types';
import { PQC_CHECKLIST_TEMPLATE } from '../constants';
import { 
  X, Calendar, Building2, Box, Hash, Edit3, Plus, 
  CheckCircle2, ArrowRight, Save, Trash2, GripVertical
} from 'lucide-react';

interface PlanDetailProps {
  item: PlanItem;
  onBack: () => void;
  onCreateInspection: (customItems: CheckItem[]) => void;
}

export const PlanDetail: React.FC<PlanDetailProps> = ({ item, onBack, onCreateInspection }) => {
  // Initialize with a template or existing items if available
  const [checklist, setChecklist] = useState<CheckItem[]>(() => {
      // Deep copy to avoid mutating the constant
      return JSON.parse(JSON.stringify(PQC_CHECKLIST_TEMPLATE));
  });

  const [isEditing, setIsEditing] = useState(false);

  // Handlers for editing checklist
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
      setChecklist(prev => prev.map(item => 
          item.id === id ? { ...item, [field]: value } : item
      ));
  };

  const handleDeleteItem = (id: string) => {
      if (window.confirm('Xóa tiêu chí này?')) {
          setChecklist(prev => prev.filter(item => item.id !== id));
      }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        
        {/* Header - Dark Blue Theme */}
        <div className="bg-[#0f172a] p-5 relative shrink-0">
            <button 
                onClick={onBack} 
                className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors active:scale-90"
            >
                <X className="w-5 h-5" />
            </button>
            
            <div className="flex gap-4 pr-8">
                <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/50 shrink-0">
                    <Box className="w-8 h-8 text-white" />
                </div>
                <div className="overflow-hidden">
                    <h2 className="text-white font-black text-lg uppercase leading-tight line-clamp-2 mb-1">
                        {item.ten_hang_muc}
                    </h2>
                    <div className="flex flex-wrap gap-2 text-[10px] md:text-xs font-mono font-bold text-slate-400">
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded"># {item.ma_nha_may}</span>
                        {item.headcode && <span className="bg-slate-800 px-1.5 py-0.5 rounded">HC: {item.headcode}</span>}
                    </div>
                </div>
            </div>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto no-scrollbar space-y-6 bg-slate-50/50 flex-1">
            
            {/* Info Grid */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="flex justify-between items-start mb-4 border-b border-slate-50 pb-4">
                    <div className="space-y-1">
                        <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <Box className="w-3 h-3" /> Dự án
                        </span>
                        <p className="text-sm font-black text-slate-800">{item.ma_ct}</p>
                    </div>
                    <div className="text-right space-y-1">
                        <span className="flex items-center justify-end gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <Calendar className="w-3 h-3" /> Ngày dự kiến
                        </span>
                        <p className="text-sm font-black text-slate-800">{item.plannedDate || '---'}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Số lượng ĐH</span>
                        <p className="text-xl font-black text-blue-600">
                            {item.so_luong_ipo} <span className="text-xs text-slate-400 ml-0.5">{item.dvt}</span>
                        </p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">PTHSP</span>
                        <p className="text-xl font-black text-slate-700">{item.pthsp || '---'}</p>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-50">
                    <span className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        <Building2 className="w-3 h-3 text-red-400" /> Tên công trình
                    </span>
                    <p className="text-sm font-bold text-slate-700 leading-relaxed uppercase">
                        {item.ten_ct}
                    </p>
                </div>
            </div>

            {/* Checklist Preview & Editor */}
            <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${isEditing ? 'border-blue-400 ring-4 ring-blue-50' : 'border-blue-100'}`}>
                <div className="px-4 py-3 bg-blue-50/30 border-b border-blue-50 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
                    <h3 className="text-xs font-black text-blue-800 uppercase tracking-widest flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-600" /> Tiêu chí kiểm tra ({checklist.length})
                    </h3>
                    <div className="flex gap-1">
                        {isEditing ? (
                            <button 
                                onClick={() => setIsEditing(false)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all text-[10px] font-bold uppercase shadow-sm active:scale-95"
                            >
                                <Save className="w-3.5 h-3.5" /> Lưu lại
                            </button>
                        ) : (
                            <button 
                                onClick={() => setIsEditing(true)}
                                className="p-1.5 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors active:scale-90"
                                title="Chỉnh sửa danh sách"
                            >
                                <Edit3 className="w-3.5 h-3.5" />
                            </button>
                        )}
                        <button 
                            onClick={handleAddItem}
                            className="p-1.5 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors active:scale-90"
                            title="Thêm tiêu chí"
                        >
                            <Plus className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
                
                <div className="p-2 space-y-2 max-h-[300px] overflow-y-auto">
                    {checklist.map((checkItem, idx) => (
                        <div key={checkItem.id} className={`flex items-start gap-2 p-2 rounded-xl transition-colors ${isEditing ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                            {isEditing ? (
                                <>
                                    <div className="flex-1 grid grid-cols-3 gap-2">
                                        <input 
                                            value={checkItem.category}
                                            onChange={(e) => handleUpdateItem(checkItem.id, 'category', e.target.value)}
                                            className="col-span-1 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] md:text-xs font-bold text-blue-600 uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="DANH MỤC"
                                        />
                                        <input 
                                            value={checkItem.label}
                                            onChange={(e) => handleUpdateItem(checkItem.id, 'label', e.target.value)}
                                            className="col-span-2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs md:text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="Nội dung kiểm tra"
                                        />
                                    </div>
                                    <button 
                                        onClick={() => handleDeleteItem(checkItem.id)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                                    <p className="text-slate-600 font-medium leading-relaxed text-sm">
                                        <span className="text-[10px] font-bold text-blue-600 mr-1 bg-blue-50 px-1 rounded">[{checkItem.category}]</span>
                                        {checkItem.label}
                                    </p>
                                </>
                            )}
                        </div>
                    ))}
                    {checklist.length === 0 && (
                        <div className="text-center py-4 text-slate-400 text-xs italic">
                            Chưa có tiêu chí nào. Nhấn dấu + để thêm.
                        </div>
                    )}
                </div>
                {isEditing && (
                    <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 text-center italic">
                        Thay đổi ở đây chỉ áp dụng cho lần kiểm tra này.
                    </div>
                )}
            </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-slate-100 flex gap-3 shrink-0">
            <button 
                onClick={() => onCreateInspection(checklist)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
                Bắt đầu kiểm tra <ArrowRight className="w-4 h-4" />
            </button>
            <button 
                onClick={onBack}
                className="px-6 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3.5 rounded-xl text-sm font-bold uppercase tracking-widest active:scale-[0.98] transition-all"
            >
                Hủy bỏ
            </button>
        </div>

      </div>
    </div>
  );
};
