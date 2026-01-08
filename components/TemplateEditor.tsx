import React, { useState, useEffect, useMemo } from 'react';
import { CheckItem, CheckStatus, Workshop } from '../types';
import { Button } from './Button';
import { Plus, Trash2, Save, X, Settings, Layers, ChevronDown, ChevronRight, Info, FileText, Factory } from 'lucide-react';
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
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  
  const moduleLabel = ALL_MODULES.find(m => m.id === moduleId)?.label || moduleId || 'Mặc định';

  useEffect(() => {
    fetchWorkshops().then(setWorkshops);
  }, []);

  const allAvailableStages = useMemo(() => {
      const stages = new Set<string>();
      workshops.forEach(w => w.stages?.forEach(s => stages.add(s)));
      if (stages.size === 0) return ['CHUNG'];
      return Array.from(stages).sort();
  }, [workshops]);

  const handleAddItem = (stage: string, category: string = 'CHUNG') => {
    const newItem: CheckItem = {
      id: `tmp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      stage: stage,
      category: category,
      label: 'Hạng mục kiểm tra mới',
      standard: 'Tiêu chuẩn kỹ thuật...',
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

  /**
   * Cập nhật danh mục cho một nhóm các hạng mục cùng lúc
   * Logic tách biệt để không gây re-index liên tục khi đang gõ
   */
  const handleUpdateCategoryName = (stage: string, oldCat: string, newCat: string) => {
      setItems(prev => prev.map(item => 
          (item.stage === stage && item.category === oldCat) 
          ? { ...item, category: newCat } 
          : item
      ));
  };

  const toggleStage = (stage: string) => {
      setExpandedStages(prev => {
          const next = new Set(prev);
          if (next.has(stage)) next.delete(stage);
          else next.add(stage);
          return next;
      });
  };

  const groupedData = useMemo(() => {
      const groups: Record<string, Record<string, CheckItem[]>> = {};
      allAvailableStages.forEach(s => { groups[s] = {}; });
      if (!groups['CHUNG']) groups['CHUNG'] = {};

      items.forEach(item => {
          const s = item.stage || 'CHUNG';
          const c = item.category || 'CHUNG';
          if (!groups[s]) groups[s] = {};
          if (!groups[s][c]) groups[s][c] = [];
          groups[s][c].push(item);
      });
      return groups;
  }, [items, allAvailableStages]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col animate-fade-in pb-20 md:pb-0">
      <div className="p-3 md:p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center sticky top-0 z-20 shadow-sm">
         <div className="flex items-center gap-2">
            <div className="p-2 bg-slate-200 rounded-lg hidden md:block">
                <Settings className="w-5 h-5 text-slate-700" />
            </div>
            <div>
                <h2 className="text-base md:text-lg font-bold text-slate-800 leading-none uppercase tracking-tight">Cấu hình mẫu ISO 3 Lớp</h2>
                <div className="flex items-center gap-1 mt-1">
                    <Layers className="w-3 h-3 text-blue-500" />
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest truncate max-w-[150px]">{moduleLabel}</span>
                </div>
            </div>
         </div>
         <div className="flex gap-2">
             <Button variant="ghost" size="sm" onClick={onCancel} className="hidden md:flex">Hủy</Button>
             <Button onClick={() => onSave(items)} icon={<Save className="w-4 h-4"/>} size="sm">Lưu ma trận ISO</Button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-6 no-scrollbar bg-slate-50/30">
        <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-100 flex items-start gap-3">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Nguyên tắc cấu hình 3 cấp (ISO)</p>
                <p className="text-xs font-medium leading-relaxed">G1: Công đoạn (từ Xưởng). G2: Danh mục (Nhóm). G3: Hạng mục & Tiêu chuẩn chi tiết. Form kiểm tra sẽ lọc tự động theo công đoạn đã chọn.</p>
            </div>
        </div>

        <div className="space-y-4">
            {Object.entries(groupedData).map(([stageName, categories]) => (
                <div key={stageName} className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden">
                    <div 
                        onClick={() => toggleStage(stageName)}
                        className={`px-5 py-4 flex items-center justify-between cursor-pointer transition-colors ${expandedStages.has(stageName) ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-800'}`}
                    >
                        <div className="flex items-center gap-3">
                            <Factory className="w-4 h-4 opacity-40" />
                            <span className="text-xs font-black uppercase tracking-widest">{stageName}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold ${expandedStages.has(stageName) ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                {Object.values(categories).flat().length} mục
                            </span>
                        </div>
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleAddItem(stageName); if(!expandedStages.has(stageName)) toggleStage(stageName); }}
                            className={`p-2 rounded-xl transition-all ${expandedStages.has(stageName) ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    {expandedStages.has(stageName) && (
                        <div className="p-4 space-y-8 bg-slate-50/20">
                            {Object.entries(categories).length === 0 ? (
                                <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-white">
                                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">Công đoạn này chưa có tiêu chí kiểm tra</p>
                                </div>
                            ) : (
                                Object.entries(categories).map(([catName, catItems]) => (
                                    <div key={`${stageName}-${catName}`} className="space-y-4 animate-in fade-in duration-300">
                                        <div className="flex items-center gap-3 px-2">
                                            {/* Ô NHẬP DANH MỤC (G2) - Tối ưu cho ký tự tự do không re-render khi chưa Blur */}
                                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-blue-100 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all shadow-sm group/cat">
                                                <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0 group-focus-within/cat:text-blue-600" />
                                                <input 
                                                    defaultValue={catName}
                                                    onBlur={(e) => handleUpdateCategoryName(stageName, catName, e.target.value)}
                                                    className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-transparent outline-none flex-1 placeholder:text-blue-200 min-w-[150px]"
                                                    placeholder="NHẬP TÊN DANH MỤC (G2)..."
                                                />
                                            </div>
                                            <div className="h-px flex-1 bg-slate-200/50"></div>
                                            {/* NÚT THÊM HẠNG MỤC RIÊNG CHO DANH MỤC NÀY */}
                                            <button 
                                                onClick={() => handleAddItem(stageName, catName)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[9px] font-black uppercase tracking-tighter hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-95"
                                            >
                                                <Plus className="w-3 h-3" /> Thêm Hạng Mục
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 gap-3 pl-4 md:pl-8">
                                            {catItems.map((item) => (
                                                <div key={item.id} className="p-5 bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:border-blue-200 transition-all group relative">
                                                    <div className="flex gap-4">
                                                        <div className="flex-1 space-y-4">
                                                            <div className="space-y-1.5">
                                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Hạng mục kiểm tra (Group 3)</label>
                                                                <input
                                                                    type="text"
                                                                    value={item.label}
                                                                    onChange={(e) => handleChange(item.id, 'label', e.target.value)}
                                                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:ring-4 focus:ring-blue-100 focus:bg-white outline-none transition-all shadow-inner"
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <label className="text-[8px] font-black text-blue-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                                                    <FileText className="w-3 h-3 text-blue-300" /> Tiêu chuẩn kỹ thuật đối chiếu
                                                                </label>
                                                                <textarea
                                                                    value={item.standard}
                                                                    onChange={(e) => handleChange(item.id, 'standard', e.target.value)}
                                                                    className="w-full px-4 py-2.5 bg-blue-50/30 border border-blue-100 rounded-2xl text-xs font-semibold text-slate-600 focus:ring-4 focus:ring-blue-100 focus:bg-white outline-none resize-none transition-all shadow-sm"
                                                                    rows={2}
                                                                    placeholder="VD: Dung sai cho phép +/- 1mm so với bản vẽ..."
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col justify-center gap-2 shrink-0">
                                                            <button
                                                                onClick={() => handleRemoveItem(item.id)}
                                                                className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all active:scale-90"
                                                            >
                                                                <Trash2 className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                            {/* Nút thêm danh mục mới cho công đoạn này */}
                            <button 
                                onClick={() => {
                                    const newCat = prompt("Tên danh mục mới (G2):") || "CHUNG";
                                    handleAddItem(stageName, newCat);
                                }}
                                className="w-full py-4 border-2 border-dashed border-slate-200 rounded-[2rem] text-slate-400 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.2em]"
                            >
                                <Plus className="w-4 h-4" /> Tạo Danh Mục Mới (G2)
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};
