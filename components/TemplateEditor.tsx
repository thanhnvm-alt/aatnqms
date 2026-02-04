
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CheckItem, CheckStatus, Workshop, DefectLibraryItem, ModuleId } from '../types';
import { Button } from './Button';
import { Plus, Trash2, Save, Settings, Layers, Factory, Info, FileText, Package, ChevronDown, CheckSquare, X, Loader2, Search, Edit3, Grid, Pencil, LayoutGrid, FileUp, FileDown } from 'lucide-react';
import { ALL_MODULES } from '../constants';
import { fetchWorkshops, fetchDefectLibrary, saveDefectLibraryItem } from '../services/apiService';

interface TemplateEditorProps {
  currentTemplate: CheckItem[];
  onSave: (newTemplate: CheckItem[]) => void;
  onCancel: () => void;
  moduleId?: string;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ currentTemplate, onSave, onCancel, moduleId }) => {
  const [items, setItems] = useState<CheckItem[]>(JSON.parse(JSON.stringify(currentTemplate)));
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [defectLibrary, setDefectLibrary] = useState<DefectLibraryItem[]>([]);
  const [openDefectSelector, setOpenDefectSelector] = useState<string | null>(null); 
  const [defectSearchTerm, setDefectSearchTerm] = useState(''); 
  const [isImporting, setIsImporting] = useState(false);
  
  const [isAddDefectModalOpen, setIsAddDefectModalOpen] = useState(false);
  const [newDefect, setNewDefect] = useState<Partial<DefectLibraryItem>>({
      code: '',
      name: '',
      description: '',
      severity: 'MINOR',
      category: 'Ngoại quan'
  });
  const [isSavingDefect, setIsSavingDefect] = useState(false);

  const [activeGroup, setActiveGroup] = useState<string>('');
  const [activeStage, setActiveStage] = useState<string>('');

  const excelInputRef = useRef<HTMLInputElement>(null);
  const XLSX = (window as any).XLSX;

  const isStandardPQC = moduleId === 'PQC';
  const isCustomStagePQC = moduleId === 'SQC_BTP';
  const isPQC = isStandardPQC || isCustomStagePQC;
  const isIQC = moduleId === 'IQC' || moduleId === 'SQC_MAT';
  
  const moduleLabel = ALL_MODULES.find(m => m.id === moduleId)?.label || moduleId || 'Mặc định';

  useEffect(() => {
    fetchWorkshops().then(setWorkshops);
    if (isIQC) {
        fetchDefectLibrary().then(setDefectLibrary);
    }
  }, [isIQC]);

  const stageOptions = useMemo(() => {
    if (isStandardPQC) {
        const stages = new Set<string>();
        workshops.forEach(w => w.stages?.forEach(s => stages.add(s)));
        return Array.from(stages).sort();
    } else if (isCustomStagePQC) {
        const stages = new Set<string>();
        items.forEach(i => { if (i.stage) stages.add(i.stage); });
        if (activeStage) stages.add(activeStage);
        return Array.from(stages).sort();
    }
    return [];
  }, [workshops, items, isStandardPQC, isCustomStagePQC, activeStage]);

  const iqcGroups = useMemo(() => {
    const groups: Record<string, CheckItem[]> = {};
    if (isIQC) {
        items.forEach(item => {
            const cat = item.category || 'CHUNG';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });
    }
    return groups;
  }, [items, isIQC]);

  const activeStageItems = useMemo(() => {
      if (!isPQC || !activeStage) return [];
      return items.filter(i => i.stage === activeStage);
  }, [items, isPQC, activeStage]);

  useEffect(() => {
      if (isIQC && !activeGroup && Object.keys(iqcGroups).length > 0) {
          setActiveGroup(Object.keys(iqcGroups)[0]);
      }
  }, [iqcGroups, isIQC, activeGroup]);

  useEffect(() => {
      if (isPQC && !activeStage && stageOptions.length > 0) {
          setActiveStage(stageOptions[0]);
      }
  }, [isPQC, stageOptions, activeStage]);

  const handleAddItem = (stageOrCategory?: string) => {
    const newItem: CheckItem = {
      id: Date.now().toString(),
      stage: isPQC ? (stageOrCategory || activeStage || 'CHUNG') : undefined,
      category: isIQC ? (stageOrCategory || activeGroup || 'Nhóm mới') : (isPQC ? (moduleId === 'SQC_BTP' ? 'SQC' : 'PQC') : 'Chung'),
      label: 'Hạng mục kiểm tra mới',
      method: '',
      standard: '',
      frequency: '',
      defectIds: [],
      status: CheckStatus.PENDING,
      notes: ''
    };
    setItems([...items, newItem]);
    
    if (isIQC && stageOrCategory) setActiveGroup(stageOrCategory);
    if (isPQC && stageOrCategory) setActiveStage(stageOrCategory);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const handleChange = (id: string, field: keyof CheckItem, value: any) => {
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleExportExcel = () => {
    if (!XLSX) return alert("Thư viện Excel chưa sẵn sàng.");
    
    const exportData = items.map(item => ({
      'Nhóm/Công đoạn': item.stage || item.category,
      'Hạng mục kiểm tra': item.label,
      'Phương pháp': item.method || '',
      'Tiêu chuẩn ISO': item.standard || '',
      'Tần suất': item.frequency || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checklist Template");
    XLSX.writeFile(wb, `AATN_Template_${moduleId}_${Date.now()}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !XLSX) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(sheet);

        const importedItems: CheckItem[] = json.map((row, idx) => ({
          id: `imp_${Date.now()}_${idx}`,
          stage: isPQC ? (row['Nhóm/Công đoạn'] || row['Công đoạn'] || activeStage) : undefined,
          category: isIQC ? (row['Nhóm/Công đoạn'] || row['Nhóm'] || activeGroup) : (isPQC ? (moduleId === 'SQC_BTP' ? 'SQC' : 'PQC') : 'Chung'),
          label: row['Hạng mục kiểm tra'] || row['Hạng mục'] || 'N/A',
          method: row['Phương pháp'] || '',
          standard: row['Tiêu chuẩn ISO'] || row['Tiêu chuẩn'] || '',
          frequency: row['Tần suất'] || '',
          status: CheckStatus.PENDING,
          defectIds: []
        }));

        if (window.confirm(`Tìm thấy ${importedItems.length} hạng mục. Bạn muốn ghi đè (OK) hay thêm mới (Cancel)?`)) {
          setItems(importedItems);
        } else {
          setItems([...items, ...importedItems]);
        }
      } catch (err) {
        alert("Lỗi đọc file Excel.");
      } finally {
        setIsImporting(false);
        if (excelInputRef.current) excelInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleAddIQCGroup = () => {
      const newGroupName = `Nhóm mới ${Object.keys(iqcGroups).length + 1}`;
      handleAddItem(newGroupName);
  };

  const handleRenameGroup = (oldName: string, newName: string) => {
      if (!newName.trim()) return;
      setItems(items.map(i => i.category === oldName ? { ...i, category: newName } : i));
      if (activeGroup === oldName) setActiveGroup(newName);
  };

  const handleDeleteGroup = (groupName: string) => {
      if (window.confirm(`Bạn có chắc muốn xóa nhóm "${groupName}" và toàn bộ tiêu chí bên trong?`)) {
          setItems(items.filter(i => i.category !== groupName));
          if (activeGroup === groupName) {
              const remainingGroups = Object.keys(iqcGroups).filter(g => g !== groupName);
              setActiveGroup(remainingGroups[0] || '');
          }
      }
  };

  const handleAddCustomStage = () => {
      const name = prompt("Nhập tên công đoạn mới:");
      if (name && name.trim()) {
          const cleanName = name.trim();
          if (stageOptions.includes(cleanName)) {
              alert("Công đoạn này đã tồn tại!");
              setActiveStage(cleanName);
              return;
          }
          setActiveStage(cleanName);
          handleAddItem(cleanName);
      }
  };

  const handleRenameCustomStage = () => {
      if (!activeStage) return;
      const newName = prompt("Đổi tên công đoạn:", activeStage);
      // Fixed: changed name.trim() to newName.trim() as 'name' was not defined in this scope.
      if (newName && newName.trim() && newName.trim() !== activeStage) {
          setItems(items.map(i => i.stage === activeStage ? { ...i, stage: newName.trim() } : i));
          setActiveStage(newName.trim());
      }
  };

  const handleDeleteCustomStage = () => {
      if (!activeStage) return;
      if (window.confirm(`Bạn có chắc muốn xóa công đoạn "${activeStage}"?`)) {
          setItems(items.filter(i => i.stage !== activeStage));
          const remaining = stageOptions.filter(s => s !== activeStage);
          setActiveStage(remaining[0] || '');
      }
  };

  const toggleDefect = (itemId: string, defectCode: string) => {
      setItems(prev => prev.map(item => {
          if (item.id !== itemId) return item;
          const currentDefects = item.defectIds || [];
          if (currentDefects.includes(defectCode)) {
              return { ...item, defectIds: currentDefects.filter(d => d !== defectCode) };
          } else {
              return { ...item, defectIds: [...currentDefects, defectCode] };
          }
      }));
  };

  const handleSaveNewDefect = async () => {
      if (!newDefect.name) { alert("Vui lòng nhập tên lỗi."); return; }
      setIsSavingDefect(true);
      try {
          const code = newDefect.code || `DEF_${Date.now()}`;
          const itemToSave: DefectLibraryItem = {
              id: code,
              code: code,
              name: newDefect.name,
              description: newDefect.description || newDefect.name,
              severity: newDefect.severity || 'MINOR',
              category: newDefect.category || 'Ngoại quan',
              stage: isIQC ? 'IQC' : 'Chung', 
              createdAt: Math.floor(Date.now() / 1000),
              createdBy: 'Template Editor'
          } as DefectLibraryItem;
          await saveDefectLibraryItem(itemToSave);
          setDefectLibrary(prev => [...prev, itemToSave]);
          if (openDefectSelector) toggleDefect(openDefectSelector, itemToSave.code);
          setIsAddDefectModalOpen(false);
          setNewDefect({ code: '', name: '', description: '', severity: 'MINOR', category: 'Ngoại quan' });
      } catch (e) { alert("Lỗi khi lưu lỗi mới."); } finally { setIsSavingDefect(false); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col animate-fade-in pb-20 md:pb-0 relative">
      <div className="p-3 md:p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center sticky top-0 z-20">
         <div className="flex items-center gap-2">
            <div className="p-2 bg-slate-200 rounded-lg hidden md:block"><Settings className="w-5 h-5 text-slate-700" /></div>
            <div>
                <h2 className="text-base md:text-lg font-bold text-slate-800 leading-none uppercase tracking-tight">Cấu hình mẫu phiếu</h2>
                <div className="flex items-center gap-1 mt-1"><Layers className="w-3 h-3 text-blue-500" /><span className="text-[10px] font-black text-blue-600 uppercase tracking-widest truncate max-w-[150px]">{moduleLabel}</span></div>
            </div>
         </div>
         <div className="flex gap-2">
             <input type="file" ref={excelInputRef} className="hidden" accept=".xlsx" onChange={handleImportExcel} />
             <button onClick={() => excelInputRef.current?.click()} className="hidden md:flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold text-xs uppercase hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
                <FileUp className="w-4 h-4 text-blue-600" /> Nhập Excel
             </button>
             <button onClick={handleExportExcel} className="hidden md:flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold text-xs uppercase hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
                <FileDown className="w-4 h-4 text-emerald-600" /> Xuất Excel
             </button>
             <div className="w-px h-8 bg-slate-200 mx-1 hidden md:block"></div>
             <Button variant="ghost" size="sm" onClick={onCancel} className="hidden md:flex">Hủy</Button>
             <Button onClick={() => onSave(items)} icon={<Save className="w-4 h-4"/>} size="sm">Lưu</Button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-6 no-scrollbar bg-slate-50/30">
        {/* IQC / SQC_MAT CONFIGURATION UI */}
        {isIQC && (
            <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 items-start">
                    <Package className="w-5 h-5 text-blue-500 mt-1" />
                    <div className="text-xs text-blue-900">
                        <p className="font-black uppercase tracking-tight mb-1">Cấu hình {moduleId === 'SQC_MAT' ? 'SQC - Vật Tư' : 'IQC - Vật liệu đầu vào'}</p>
                        <p>Thiết lập theo cấu trúc: <strong>Nhóm Hạng Mục</strong> {'>'} <strong>Tiêu chí kiểm tra</strong>. Liên kết lỗi từ thư viện để QC chọn nhanh.</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                            <LayoutGrid className="w-3 h-3 text-blue-500" /> Chọn nhóm hạng mục cần chỉnh sửa
                        </label>
                        <div className="relative">
                            <select 
                                value={activeGroup} 
                                onChange={e => setActiveGroup(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-800 text-sm uppercase outline-none focus:ring-4 focus:ring-blue-100 appearance-none transition-all cursor-pointer shadow-sm"
                            >
                                <option value="" disabled>-- Chọn nhóm --</option>
                                {Object.keys(iqcGroups).map(groupName => (
                                    <option key={groupName} value={groupName}>
                                        {groupName} ({iqcGroups[groupName].length} tiêu chí)
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleAddIQCGroup}
                            className="flex-1 md:flex-none h-[50px] px-6 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
                        >
                            <Plus className="w-4 h-4" /> Thêm Nhóm Mới
                        </button>
                    </div>
                </div>

                {/* Active Group Editor */}
                {activeGroup && iqcGroups[activeGroup] ? (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex items-center gap-3 flex-1">
                                <div className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500"><Package className="w-5 h-5" /></div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Chỉnh sửa tên nhóm hiện tại</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            className="font-bold text-base bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-slate-800 uppercase w-full transition-all hover:border-slate-300 focus:bg-white"
                                            value={activeGroup}
                                            onChange={(e) => handleRenameGroup(activeGroup, e.target.value)}
                                            placeholder="Tên nhóm..."
                                        />
                                        <Edit3 className="w-4 h-4 text-slate-300" />
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => handleDeleteGroup(activeGroup)} className="flex items-center justify-center gap-2 px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl font-bold text-xs transition-colors"><Trash2 className="w-4 h-4" /> Xóa nhóm</button>
                        </div>

                        <div className="p-4 space-y-4 bg-slate-50/30">
                            {iqcGroups[activeGroup].map((item) => (
                                <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all group relative">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nội dung kiểm tra *</label>
                                                <input type="text" value={item.label} onChange={(e) => handleChange(item.id, 'label', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phương pháp</label><input type="text" value={item.method || ''} onChange={(e) => handleChange(item.id, 'method', e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-blue-400" /></div>
                                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tần suất</label><input type="text" value={item.frequency || ''} onChange={(e) => handleChange(item.id, 'frequency', e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-blue-400" /></div>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tiêu chuẩn ISO / Dung sai</label><textarea rows={1} value={item.standard || ''} onChange={(e) => handleChange(item.id, 'standard', e.target.value)} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-medium outline-none resize-none focus:border-blue-400" /></div>
                                            <div className="space-y-1.5 relative">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between"><span>Lỗi liên kết (Thư viện)</span><span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{item.defectIds?.length || 0} đã chọn</span></label>
                                                <div className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 cursor-pointer flex justify-between items-center hover:border-blue-400 transition-all" onClick={() => { setOpenDefectSelector(openDefectSelector === item.id ? null : item.id); setDefectSearchTerm(''); }}><span className="truncate font-medium">{item.defectIds && item.defectIds.length > 0 ? defectLibrary.filter(d => item.defectIds?.includes(d.code)).map(d => d.name).join(', ') : 'Gán lỗi chuẩn...'}</span><ChevronDown className="w-4 h-4 text-slate-400"/></div>
                                                {openDefectSelector === item.id && (
                                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <div className="p-2 border-b border-slate-100 bg-slate-50 flex flex-col gap-2"><div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Thư viện lỗi</span><button onClick={() => setOpenDefectSelector(null)}><X className="w-3.5 h-3.5 text-slate-400"/></button></div><div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" /><input className="w-full pl-8 pr-16 py-1.5 border border-slate-200 rounded-lg text-[11px] outline-none focus:ring-2 ring-blue-100 font-medium" placeholder="Tìm..." value={defectSearchTerm} onChange={(e) => setDefectSearchTerm(e.target.value)} autoFocus /><button onClick={() => setIsAddDefectModalOpen(true)} className="absolute right-1 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-2 py-0.5 rounded-md text-[9px] font-bold uppercase">Mới</button></div></div>
                                                        <div className="max-h-56 overflow-y-auto p-2 space-y-1">{defectLibrary.filter(def => !defectSearchTerm || def.name.toLowerCase().includes(defectSearchTerm.toLowerCase()) || def.code.toLowerCase().includes(defectSearchTerm.toLowerCase())).map(def => (<div key={def.code} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${item.defectIds?.includes(def.code) ? 'bg-blue-50 border border-blue-100' : 'hover:bg-slate-50 border border-transparent'}`} onClick={() => toggleDefect(item.id, def.code)}><div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${item.defectIds?.includes(def.code) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>{item.defectIds?.includes(def.code) && <CheckSquare className="w-3 h-3 text-white" />}</div><div className="flex-1 overflow-hidden"><p className="text-[11px] font-bold text-slate-700 truncate">{def.name}</p><div className="flex items-center gap-2 mt-0.5"><span className="text-[9px] text-slate-400 font-mono bg-slate-100 px-1 rounded">{def.code}</span><span className={`text-[8px] font-bold uppercase ${def.severity === 'CRITICAL' ? 'text-red-500' : 'text-slate-400'}`}>{def.severity}</span></div></div></div>))}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => handleRemoveItem(item.id)} className="absolute -top-2 -right-2 bg-white text-slate-300 hover:text-red-500 p-1.5 rounded-full shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-all hover:scale-110"><Trash2 className="w-4 h-4"/></button>
                                </div>
                            ))}
                            <button onClick={() => handleAddItem(activeGroup)} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50/50 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 group"><div className="p-1 bg-slate-200 rounded-full group-hover:bg-blue-200 transition-colors"><Plus className="w-4 h-4 text-slate-500 group-hover:text-blue-600" /></div> Thêm tiêu chí vào {activeGroup}</button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-4"><Package className="w-16 h-16 opacity-20" /><p className="font-bold uppercase tracking-widest text-xs">Vui lòng chọn nhóm hạng mục phía trên</p></div>
                )}
            </div>
        )}

        {/* PQC / SQC_BTP CONFIGURATION UI */}
        {isPQC && (
          <div className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3 items-start"><Factory className="w-5 h-5 text-indigo-500 mt-1" /><div className="text-xs text-indigo-900"><p className="font-black uppercase tracking-tight mb-1">Cấu hình {moduleId === 'SQC_BTP' ? 'SQC - Bán Thành Phẩm' : 'PQC 2 Lớp (ISO Compliance)'}</p><p>{isCustomStagePQC ? "Tự do quản lý danh sách công đoạn và các tiêu chí kiểm tra cho Bán thành phẩm." : "Hạng mục được gán trực tiếp vào Công đoạn sản xuất. Dữ liệu công đoạn được đồng bộ từ module Quản lý xưởng."}</p></div></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4"><div className="flex flex-col md:flex-row gap-4 items-start md:items-end"><div className="flex-1 w-full"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Chọn Công Đoạn Cần Cấu Hình</label><div className="relative"><select value={activeStage} onChange={e => setActiveStage(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:ring-2 focus:ring-blue-100 outline-none appearance-none cursor-pointer"><option value="" disabled>-- Chọn công đoạn --</option>{stageOptions.map(s => <option key={s} value={s}>{s}</option>)}</select><ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div></div>{isCustomStagePQC && (<div className="flex gap-2 w-full md:w-auto"><button onClick={handleAddCustomStage} className="flex-1 md:flex-none h-[46px] px-4 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-2 shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"><Plus className="w-4 h-4" /> Thêm mới</button>{activeStage && (<><button onClick={handleRenameCustomStage} className="h-[46px] w-[46px] bg-white border border-slate-200 rounded-xl flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-all"><Pencil className="w-4 h-4"/></button><button onClick={handleDeleteCustomStage} className="h-[46px] w-[46px] bg-white border border-slate-200 rounded-xl flex items-center justify-center text-red-600 hover:bg-red-50 transition-all"><Trash2 className="w-4 h-4"/></button></>)}</div>)}</div></div>
            {activeStage ? (<div className="space-y-3"><div className="flex items-center justify-between px-2"><h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500" /> Tiêu chí: {activeStage}<span className="text-[10px] font-bold text-slate-400 px-2 py-0.5 bg-slate-100 rounded-full">{activeStageItems.length}</span></h3></div><div className="grid grid-cols-1 gap-3">{activeStageItems.map((item) => (<div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4 group transition-all hover:border-indigo-300"><div className="flex justify-between items-start gap-4"><div className="flex-1 space-y-3"><div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Hạng mục kiểm tra *</label><input type="text" value={item.label} onChange={(e) => handleChange(item.id, 'label', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-800 focus:bg-white outline-none transition-all" /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><Layers className="w-3 h-3 text-slate-300" /> Phương pháp</label><input type="text" value={item.method || ''} onChange={(e) => handleChange(item.id, 'method', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium text-slate-600 outline-none" /></div><div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><FileText className="w-3 h-3 text-slate-300" /> Tiêu chuẩn</label><input type="text" value={item.standard || ''} onChange={(e) => handleChange(item.id, 'standard', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium text-slate-600 outline-none" /></div></div></div><button onClick={() => handleRemoveItem(item.id)} className="p-2 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 className="w-4.5 h-4.5" /></button></div></div>))}</div><button onClick={() => handleAddItem(activeStage)} className="w-full py-4 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-500 font-bold text-xs uppercase tracking-widest hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 group"><Plus className="w-4 h-4 group-hover:scale-110 transition-transform" /> Thêm tiêu chí vào {activeStage}</button></div>) : (<div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-4 border-2 border-dashed border-slate-200 rounded-2xl"><Factory className="w-12 h-12 opacity-20" /><p className="font-bold uppercase tracking-widest text-xs">Chọn công đoạn sản xuất để cấu hình</p></div>)}
          </div>
        )}

        {!isPQC && !isIQC && (
          <div className="space-y-3"><div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 mb-4 flex items-center gap-2"><Info className="w-4 h-4" /> Mẫu này được áp dụng cho {moduleLabel} mới.</div>{items.map((item) => (<div key={item.id} className="flex gap-2 items-start bg-white p-3 rounded-xl border border-slate-200 shadow-sm"><div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2"><input type="text" value={item.category} onChange={(e) => handleChange(item.id, 'category', e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-blue-600 outline-none bg-slate-50"/><input type="text" value={item.label} onChange={(e) => handleChange(item.id, 'label', e.target.value)} className="md:col-span-2 px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 outline-none"/></div><button onClick={() => handleRemoveItem(item.id)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div>))}<button onClick={() => handleAddItem()} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-blue-500 hover:text-blue-600 transition-all flex items-center justify-center font-bold text-xs uppercase tracking-widest"><Plus className="w-4 h-4 mr-2" /> Thêm hạng mục</button></div>
        )}
      </div>

      {isAddDefectModalOpen && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col"><div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50"><h3 className="font-bold text-slate-800 uppercase text-xs flex items-center gap-2"><Plus className="w-4 h-4 text-blue-600" /> Thêm Lỗi Mới</h3><button onClick={() => setIsAddDefectModalOpen(false)}><X className="w-5 h-5 text-slate-400"/></button></div><div className="p-4 space-y-3"><div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Mã lỗi</label><input value={newDefect.code} onChange={e => setNewDefect({...newDefect, code: e.target.value.toUpperCase()})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold uppercase" /></div><div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Tên lỗi *</label><input value={newDefect.name} onChange={e => setNewDefect({...newDefect, name: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 ring-blue-500" /></div><div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Mức độ</label><select value={newDefect.severity} onChange={e => setNewDefect({...newDefect, severity: e.target.value as any})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white"><option value="MINOR">MINOR</option><option value="MAJOR">MAJOR</option><option value="CRITICAL">CRITICAL</option></select></div></div><div className="p-4 border-t border-slate-100 flex gap-2"><Button variant="secondary" size="sm" onClick={() => setIsAddDefectModalOpen(false)} className="flex-1">Hủy</Button><Button size="sm" onClick={handleSaveNewDefect} disabled={isSavingDefect} className="flex-1">{isSavingDefect ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Lưu'}</Button></div></div>
          </div>
      )}
      
      {isImporting && (
          <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Đang xử lý file Excel...</p>
              </div>
          </div>
      )}
    </div>
  );
};