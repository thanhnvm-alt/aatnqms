
import React, { useState, useEffect, useMemo } from 'react';
import { CheckItem, CheckStatus, Workshop } from '../types';
import { Button } from './Button';
import { Plus, Trash2, Save, Settings, Layers, Factory, Info, FileText } from 'lucide-react';
import { ALL_MODULES } from '../constants';
import { fetchWorkshops } from '../services/apiService';

interface TemplateEditorProps {
  currentTemplate: CheckItem[];
  onSave: (newTemplate: CheckItem[]) => void;
  onCancel: () => void;
  moduleId?: string;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ currentTemplate, onSave, onCancel, moduleId }) => {
  const [items, setItems] = useState<CheckItem[]>(JSON.parse(JSON.stringify(currentTemplate)));
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  
  const isPQC = moduleId === 'PQC';
  const moduleLabel = ALL_MODULES.find(m => m.id === moduleId)?.label || moduleId || 'Mặc định';

  useEffect(() => {
    fetchWorkshops().then(setWorkshops);
  }, []);

  const allAvailableStages = useMemo(() => {
    const stages = new Set<string>();
    workshops.forEach(w => w.stages?.forEach(s => stages.add(s)));
    return Array.from(stages).sort();
  }, [workshops]);

  const handleAddItem = (stageName?: string) => {
    const newItem: CheckItem = {
      id: Date.now().toString(),
      stage: isPQC ? (stageName || allAvailableStages[0] || 'MẶC ĐỊNH') : undefined,
      category: isPQC ? 'PQC' : 'Chung',
      label: 'Hạng mục kiểm tra mới',
      method: '',
      standard: '',
      status: CheckStatus.PENDING,
      notes: ''
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const handleChange = (id: string, field: keyof CheckItem, value: string) => {
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const groupedByStage = useMemo(() => {
    const groups: Record<string, CheckItem[]> = {};
    if (isPQC) {
      // Đảm bảo khởi tạo các công đoạn từ module xưởng
      allAvailableStages.forEach(s => groups[s] = []);
      items.forEach(item => {
        const s = item.stage || 'MẶC ĐỊNH';
        if (!groups[s]) groups[s] = [];
        groups[s].push(item);
      });
    }
    return groups;
  }, [items, isPQC, allAvailableStages]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col animate-fade-in pb-20 md:pb-0">
      <div className="p-3 md:p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center sticky top-0 z-20 shadow-sm">
         <div className="flex items-center gap-2">
            <div className="p-2 bg-slate-200 rounded-lg hidden md:block">
                <Settings className="w-5 h-5 text-slate-700" />
            </div>
            <div>
                <h2 className="text-base md:text-lg font-bold text-slate-800 leading-none uppercase tracking-tight">Thiết lập mẫu phiếu</h2>
                <div className="flex items-center gap-1 mt-1">
                    <Layers className="w-3 h-3 text-blue-500" />
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest truncate max-w-[150px]">{moduleLabel}</span>
                </div>
            </div>
         </div>
         <div className="flex gap-2">
             <Button variant="ghost" size="sm" onClick={onCancel} className="hidden md:flex">Hủy</Button>
             <Button onClick={() => onSave(items)} icon={<Save className="w-4 h-4"/>} size="sm">Lưu cấu hình</Button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-6 no-scrollbar bg-slate-50/30">
        {!isPQC ? (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs md:text-sm text-blue-800 mb-4 flex items-center gap-2">
                <Info className="w-4 h-4" /> Định dạng danh mục cho {moduleLabel}.
            </div>
            {items.map((item) => (
                <div key={item.id} className="flex gap-2 items-start bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                            type="text"
                            value={item.category}
                            onChange={(e) => handleChange(item.id, 'category', e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-blue-600 outline-none bg-slate-50"
                            placeholder="Danh mục"
                        />
                        <input
                            type="text"
                            value={item.label}
                            onChange={(e) => handleChange(item.id, 'label', e.target.value)}
                            className="md:col-span-2 px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 outline-none"
                            placeholder="Hạng mục kiểm tra"
                        />
                    </div>
                    <button onClick={() => handleRemoveItem(item.id)} className="p-2 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
            ))}
            <button onClick={() => handleAddItem()} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-blue-500 hover:text-blue-600 transition-all flex items-center justify-center font-bold text-xs uppercase tracking-widest"><Plus className="w-4 h-4 mr-2" /> Thêm hạng mục</button>
          </div>
        ) : (
          <div className="space-y-10 pb-10">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3 items-start">
                <Factory className="w-5 h-5 text-indigo-500 mt-1" />
                <div className="text-xs text-indigo-900">
                    <p className="font-black uppercase tracking-tight mb-1">Cấu hình PQC 2 Lớp (ISO Compliance)</p>
                    <p>Dữ liệu công đoạn được đồng bộ từ module Quản lý xưởng. Mỗi hạng mục bao gồm phương pháp và tiêu chuẩn chuẩn hóa.</p>
                </div>
            </div>

            {(Object.entries(groupedByStage) as [string, CheckItem[]][]).map(([stageName, stageItems]) => (
                <div key={stageName} className="space-y-4">
                    <div className="flex items-center justify-between px-2 bg-slate-100 py-2 rounded-lg border-l-4 border-blue-600">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">CÔNG ĐOẠN: {stageName}</h3>
                            <span className="text-[10px] font-bold text-slate-400">({stageItems.length} hạng mục)</span>
                        </div>
                        <button onClick={() => handleAddItem(stageName)} className="text-[10px] font-black text-blue-600 uppercase hover:bg-white px-2 py-1 rounded transition-colors flex items-center gap-1"><Plus className="w-3 h-3" /> Thêm</button>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {stageItems.map((item) => (
                            <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4 group">
                                <div className="flex justify-between items-start gap-4">
                                    <div className="flex-1 space-y-3">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên hạng mục kiểm tra *</label>
                                            <input
                                                type="text"
                                                value={item.label}
                                                onChange={(e) => handleChange(item.id, 'label', e.target.value)}
                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-800 focus:bg-white outline-none transition-all"
                                                placeholder="VD: Kiểm tra độ phẳng mặt bàn..."
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><Layers className="w-3 h-3 text-slate-300" /> Phương pháp kiểm tra</label>
                                                <input
                                                    type="text"
                                                    value={item.method || ''}
                                                    onChange={(e) => handleChange(item.id, 'method', e.target.value)}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-medium text-slate-600 outline-none"
                                                    placeholder="VD: Sử dụng thước thẳng 2m..."
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><FileText className="w-3 h-3 text-slate-300" /> Tiêu chuẩn / Dung sai</label>
                                                <input
                                                    type="text"
                                                    value={item.standard || ''}
                                                    onChange={(e) => handleChange(item.id, 'standard', e.target.value)}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-medium text-slate-600 outline-none"
                                                    placeholder="VD: Độ hở không quá 0.5mm..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => handleRemoveItem(item.id)} className="p-2 text-slate-300 hover:text-red-500 active:scale-90 transition-all"><Trash2 className="w-4.5 h-4.5" /></button>
                                </div>
                            </div>
                        ))}
                        {stageItems.length === 0 && (
                            <div className="py-6 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trống - Bấm "Thêm" để bắt đầu</p>
                            </div>
                        )}
                    </div>
                </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
