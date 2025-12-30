
import React, { useState } from 'react';
import { CheckItem, CheckStatus } from '../types';
import { Button } from './Button';
import { Plus, Trash2, Save, X, Settings, Layers } from 'lucide-react';
import { ALL_MODULES } from '../constants';

interface TemplateEditorProps {
  currentTemplate: CheckItem[];
  onSave: (newTemplate: CheckItem[]) => void;
  onCancel: () => void;
  moduleId?: string;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ currentTemplate, onSave, onCancel, moduleId }) => {
  const [items, setItems] = useState<CheckItem[]>(JSON.parse(JSON.stringify(currentTemplate)));
  
  const moduleLabel = ALL_MODULES.find(m => m.id === moduleId)?.label || moduleId || 'Mặc định';

  const handleAddItem = () => {
    const newItem: CheckItem = {
      id: Date.now().toString(),
      category: 'Chung',
      label: 'Hạng mục mới',
      status: CheckStatus.PENDING,
      notes: ''
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const handleChange = (id: string, field: 'category' | 'label', value: string) => {
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col animate-fade-in pb-20 md:pb-0">
      <div className="p-3 md:p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center sticky top-0 z-20">
         <div className="flex items-center gap-2">
            <div className="p-2 bg-slate-200 rounded-lg hidden md:block">
                <Settings className="w-5 h-5 text-slate-700" />
            </div>
            <div>
                <h2 className="text-base md:text-lg font-bold text-slate-800 leading-none uppercase tracking-tight">Cấu hình mẫu</h2>
                <div className="flex items-center gap-1 mt-1">
                    <Layers className="w-3 h-3 text-blue-500" />
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest truncate max-w-[150px]">{moduleLabel}</span>
                </div>
            </div>
         </div>
         <div className="flex gap-2">
             <Button variant="ghost" size="sm" onClick={onCancel} className="hidden md:flex">Hủy</Button>
             <Button onClick={() => onSave(items)} icon={<Save className="w-4 h-4"/>} size="sm">Lưu</Button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 no-scrollbar">
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs md:text-sm text-blue-800 mb-4">
            Mẫu này sẽ được áp dụng cho tất cả các phiếu kiểm tra {moduleLabel} mới.
        </div>

        <div className="space-y-3">
            {items.map((item, index) => (
                <div key={item.id} className="flex gap-2 items-start group bg-white md:bg-transparent p-2 md:p-0 rounded-lg border md:border-none border-slate-100 shadow-sm md:shadow-none">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                            type="text"
                            value={item.category}
                            onChange={(e) => handleChange(item.id, 'category', e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 w-full"
                            placeholder="Danh mục"
                        />
                        <input
                            type="text"
                            value={item.label}
                            onChange={(e) => handleChange(item.id, 'label', e.target.value)}
                            className="md:col-span-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none w-full"
                            placeholder="Tên hạng mục kiểm tra"
                        />
                    </div>
                    <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors bg-slate-50 md:bg-transparent self-start md:self-center border border-slate-200 md:border-transparent mt-0.5 md:mt-0"
                        title="Xóa"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                </div>
            ))}
        </div>

        <button
            onClick={handleAddItem}
            className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center font-medium active:scale-95"
        >
            <Plus className="w-5 h-5 mr-2" /> Thêm hạng mục mới
        </button>
      </div>
    </div>
  );
};
