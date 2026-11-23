import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { CheckItem, CheckStatus, Workshop, DefectLibraryItem, User } from '../types';
import { Button } from './Button';
import { Plus, Trash2, Save, Settings, Layers, Factory, Info, FileText, Package, ChevronDown, CheckSquare, X, Loader2, Search, Edit3, Pencil, LayoutGrid, FileUp, FileDown, AlertCircle, CheckCircle2, Lock, RotateCcw } from 'lucide-react';
import { ALL_MODULES, SITE_TEMPLATES, PQC_CHECKLIST_TEMPLATE } from '../constants';
import { fetchWorkshops, fetchDefectLibrary, saveDefectLibraryItem } from '../services/apiService';
import { Combobox, ConfirmDialog } from '../src/components/qms';

interface TemplateEditorProps {
  user: User;
  currentTemplate: CheckItem[];
  onSave: (newTemplate: CheckItem[], subModuleId?: string) => Promise<void> | void;
  onCancel?: () => void;
  moduleId?: string;
  allTemplates?: Record<string, CheckItem[]>;
  isReadOnly?: boolean;
  canExport?: boolean;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  user,
  currentTemplate,
  onSave,
  onCancel,
  moduleId,
  allTemplates,
  isReadOnly,
  canExport,
}) => {
  const effectiveReadOnly = isReadOnly ?? (String(user?.role || '').toUpperCase().trim() !== 'ADMIN');
  const allowExport = canExport ?? true;

  const resolveBaseline = (siteGroup: string = 'BAN'): CheckItem[] => {
    if (moduleId === 'SITE') {
      const subId = `SITE_${siteGroup}`;
      const list = allTemplates?.[subId] || (SITE_TEMPLATES as any)[siteGroup] || currentTemplate || [];
      return JSON.parse(JSON.stringify(list));
    }
    return JSON.parse(JSON.stringify(currentTemplate || []));
  };

  const [selectedSiteGroup, setSelectedSiteGroup] = useState<string>('BAN');
  const [items, setItems] = useState<CheckItem[]>(() => resolveBaseline('BAN'));
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => JSON.stringify(resolveBaseline('BAN')));
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [defectLibrary, setDefectLibrary] = useState<DefectLibraryItem[]>([]);
  const [openDefectSelector, setOpenDefectSelector] = useState<string | null>(null); 
  const [defectSearchInput, setDefectSearchInput] = useState(''); 
  const [defectSearchTerm, setDefectSearchTerm] = useState(''); 
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  
  const handleCommitDefectSearch = () => {
    setDefectSearchTerm(defectSearchInput);
  };

  const handleDefectSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        handleCommitDefectSearch();
    }
  };
  const [isImporting, setIsImporting] = useState(false);
  
  const [isAddDefectModalOpen, setIsAddDefectModalOpen] = useState(false);
  const [newDefect, setNewDefect] = useState<Partial<DefectLibraryItem>>({
      code: '',
      name: '',
      description: '',
      severity: 'MINOR',
      category: 'Ngoại quan'
  });
  const [defectModalError, setDefectModalError] = useState<string | null>(null);
  const [isSavingDefect, setIsSavingDefect] = useState(false);

  const [activeGroup, setActiveGroup] = useState<string>('');
  const [activeStage, setActiveStage] = useState<string>('');

  const [promptModal, setPromptModal] = useState<{
    isOpen: boolean;
    title: string;
    message?: string;
    value: string;
    onConfirm: (val: string) => void;
  }>({ isOpen: false, title: '', value: '', onConfirm: () => {} });

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const excelInputRef = useRef<HTMLInputElement>(null);

  const isStandardPQC = moduleId === 'PQC' || moduleId === 'FQC';
  const isCustomStagePQC = moduleId === 'SQC_BTP' || moduleId === 'SQC_TP';
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

  const isDirty = useMemo(() => JSON.stringify(items) !== savedSnapshot, [items, savedSnapshot]);

  const handleAddItem = (stageOrCategory?: string) => {
    if (effectiveReadOnly) return;
    const newItem: CheckItem = {
      id: Date.now().toString(),
      stage: isPQC ? (stageOrCategory || activeStage || 'CHUNG') : undefined,
      category: isIQC ? (stageOrCategory || activeGroup || 'Nhóm mới') : (isPQC ? (moduleId === 'SQC_BTP' ? 'SQC' : moduleId === 'SQC_TP' ? 'SQC_TP' : moduleId === 'FQC' ? 'FQC' : 'PQC') : 'Chung'),
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
    if (effectiveReadOnly) return;
    setItems(items.filter(i => i.id !== id));
  };

  const handleChange = (id: string, field: keyof CheckItem, value: any) => {
    if (effectiveReadOnly) return;
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleSaveTemplate = async () => {
    if (effectiveReadOnly || isSaving) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      await onSave(items, moduleId === 'SITE' ? `SITE_${selectedSiteGroup}` : undefined);
      setSavedSnapshot(JSON.stringify(items));
      setFeedback({ type: 'success', message: `Đã lưu cấu hình mẫu "${moduleLabel}" thành công.` });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Lỗi khi lưu cấu hình mẫu kiểm tra.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevertChanges = () => {
    const restored = resolveBaseline(selectedSiteGroup);
    setItems(restored);
    setSavedSnapshot(JSON.stringify(restored));
    setRevertConfirmOpen(false);
    setFeedback(null);
    onCancel?.();
  };

  const handleExportExcel = () => {
    if (!XLSX) {
      setFeedback({ type: 'error', message: 'Thư viện Excel chưa sẵn sàng.' });
      return;
    }
    
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
    if (effectiveReadOnly) return;
    const file = e.target.files?.[0];
    if (!file || !XLSX) return;

    setIsImporting(true);
    setFeedback(null);
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
          category: isIQC ? (row['Nhóm/Công đoạn'] || row['Nhóm'] || activeGroup) : (isPQC ? (moduleId === 'SQC_BTP' ? 'SQC' : moduleId === 'SQC_TP' ? 'SQC_TP' : moduleId === 'FQC' ? 'FQC' : 'PQC') : 'Chung'),
          label: row['Hạng mục kiểm tra'] || row['Hạng mục'] || 'N/A',
          method: row['Phương pháp'] || '',
          standard: row['Tiêu chuẩn ISO'] || row['Tiêu chuẩn'] || '',
          frequency: row['Tần suất'] || '',
          status: CheckStatus.PENDING,
          defectIds: []
        }));

        setIsImporting(false);
        setConfirmModal({
          isOpen: true,
          title: 'Nhập dữ liệu từ Excel',
          message: `Tìm thấy ${importedItems.length} hạng mục từ file Excel. Bạn muốn ghi đè toàn bộ danh sách hiện tại hay thêm mới nối tiếp vào danh sách?`,
          confirmText: 'Ghi đè',
          cancelText: 'Thêm mới',
          onConfirm: () => {
            setItems(importedItems);
          },
          onCancel: () => {
            setItems([...items, ...importedItems]);
          }
        });
      } catch (err) {
        setIsImporting(false);
        setFeedback({ type: 'error', message: 'Lỗi đọc file Excel. Vui lòng kiểm tra định dạng tệp.' });
      } finally {
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
      setConfirmModal({
          isOpen: true,
          title: 'Xóa nhóm tiêu chí',
          message: `Bạn có chắc muốn xóa nhóm "${groupName}" và toàn bộ tiêu chí bên trong?`,
          confirmText: 'Xóa',
          cancelText: 'Hủy',
          onConfirm: () => {
              setItems(items.filter(i => i.category !== groupName));
              if (activeGroup === groupName) {
                  const remainingGroups = Object.keys(iqcGroups).filter(g => g !== groupName);
                  setActiveGroup(remainingGroups[0] || '');
              }
          }
      });
  };

  const handleCopyFromPQC = () => {
      const targetLabel = moduleId === 'SQC_TP' ? 'SQC - Thành Phẩm' : 'SQC - Bán Thành Phẩm';
      const targetCategory = moduleId === 'SQC_TP' ? 'SQC_TP' : 'SQC';
      setConfirmModal({
          isOpen: true,
          title: 'Sao chép từ mẫu PQC',
          message: `Bạn có chắc muốn sao chép toàn bộ công đoạn và hạng mục kiểm tra từ PQC sang ${targetLabel}? Các tiêu chí sẽ được thêm nối tiếp vào danh sách hiện tại.`,
          confirmText: 'Sao chép',
          cancelText: 'Hủy',
          onConfirm: () => {
              const newItems: CheckItem[] = PQC_CHECKLIST_TEMPLATE.map(item => ({
                  ...item,
                  id: `copy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${item.id}`,
                  stage: item.stage || 'Chung',
                  category: targetCategory
              }));
              const updatedItems = [...items, ...newItems];
              setItems(updatedItems);
              if (newItems.length > 0) {
                  setActiveStage(newItems[0].stage || 'Chung');
              }
          }
      });
  };

  const handleAddCustomStage = () => {
      setPromptModal({
          isOpen: true,
          title: 'Thêm công đoạn mới',
          message: 'Nhập tên công đoạn sản xuất mới:',
          value: '',
          onConfirm: (val: string) => {
              const cleanName = val.trim();
              if (!cleanName) return;
              if (stageOptions.includes(cleanName)) {
                  setFeedback({ type: 'error', message: `Công đoạn "${cleanName}" đã tồn tại!` });
                  setActiveStage(cleanName);
                  return;
              }
              setActiveStage(cleanName);
              handleAddItem(cleanName);
          }
      });
  };

  const handleRenameCustomStage = () => {
      if (!activeStage) return;
      setPromptModal({
          isOpen: true,
          title: 'Đổi tên công đoạn',
          message: `Nhập tên mới cho công đoạn "${activeStage}":`,
          value: activeStage,
          onConfirm: (newName: string) => {
              const cleanName = newName.trim();
              if (cleanName && cleanName !== activeStage) {
                  setItems(items.map(i => i.stage === activeStage ? { ...i, stage: cleanName } : i));
                  setActiveStage(cleanName);
              }
          }
      });
  };

  const handleDeleteCustomStage = () => {
      if (!activeStage) return;
      setConfirmModal({
          isOpen: true,
          title: 'Xóa công đoạn',
          message: `Bạn có chắc muốn xóa công đoạn "${activeStage}" và toàn bộ tiêu chí thuộc công đoạn này?`,
          confirmText: 'Xóa',
          cancelText: 'Hủy',
          onConfirm: () => {
              setItems(items.filter(i => i.stage !== activeStage));
              const remaining = stageOptions.filter(s => s !== activeStage);
              setActiveStage(remaining[0] || '');
          }
      });
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
      if (effectiveReadOnly) return;
      if (!newDefect.name?.trim()) {
        setDefectModalError("Vui lòng nhập tên lỗi.");
        return;
      }
      setIsSavingDefect(true);
      setDefectModalError(null);
      try {
          const code = newDefect.code || `DEF_${Date.now()}`;
          const itemToSave: DefectLibraryItem = {
              id: code,
              code: code,
              name: newDefect.name.trim(),
              description: newDefect.description || newDefect.name.trim(),
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
      } catch (e: any) {
          setDefectModalError(e?.message || "Lỗi khi lưu lỗi mới.");
      } finally {
          setIsSavingDefect(false);
      }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 h-full flex flex-col animate-fade-in pb-2 md:pb-0 relative">
      <div className="p-3 md:p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap justify-between items-center gap-2 sticky top-0 z-20">
         <div className="flex items-center gap-2">
            <div className="p-2 bg-slate-200 dark:bg-slate-700 rounded-lg hidden md:block"><Settings className="w-5 h-5 text-slate-700 dark:text-slate-300" /></div>
            <div>
                <h2 className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-200 leading-none uppercase tracking-tight">Cấu hình mẫu phiếu</h2>
                <div className="flex items-center gap-1 mt-1"><Layers className="w-3 h-3 text-blue-500 dark:text-blue-400" /><span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest truncate max-w-[180px]">{moduleLabel}</span></div>
            </div>
         </div>
         <div className="flex flex-wrap items-center gap-2">
             {!effectiveReadOnly && (
               <>
                 <input type="file" ref={excelInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleImportExcel} />
                 <button type="button" onClick={() => excelInputRef.current?.click()} className="hidden md:flex items-center gap-2 min-h-[44px] lg:min-h-[38px] px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-400 font-bold text-xs uppercase hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all active:scale-95 shadow-sm">
                    <FileUp className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Nhập Excel
                 </button>
               </>
             )}
             {allowExport && (
               <button type="button" onClick={handleExportExcel} className="hidden md:flex items-center gap-2 min-h-[44px] lg:min-h-[38px] px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-400 font-bold text-xs uppercase hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all active:scale-95 shadow-sm">
                  <FileDown className="w-4 h-4 text-emerald-600" /> Xuất Excel
               </button>
             )}
             {!effectiveReadOnly && (
               <>
                 <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-1 hidden md:block"></div>
                 {isDirty && (
                   <Button variant="ghost" size="sm" onClick={() => setRevertConfirmOpen(true)} icon={<RotateCcw className="w-4 h-4" />} className="min-h-[44px] lg:min-h-[38px]">
                     Hoàn tác
                   </Button>
                 )}
                 <Button
                   onClick={handleSaveTemplate}
                   disabled={isSaving}
                   icon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4"/>}
                   size="sm"
                   className="min-h-[44px] lg:min-h-[38px]"
                 >
                   {isSaving ? 'Đang lưu...' : 'Lưu mẫu'}
                 </Button>
               </>
             )}
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-4 pb-24 lg:pb-6 space-y-4 no-scrollbar bg-slate-50 dark:bg-slate-800/30">
        {effectiveReadOnly && (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs font-medium text-blue-800 dark:text-blue-200 flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            <span>Chế độ chỉ xem: Chỉ tài khoản ADMIN mới được chỉnh sửa hoặc nhập mẫu kiểm tra từ Excel.</span>
          </div>
        )}

        {feedback && (
          <div className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-semibold ${feedback.type === 'success' ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'}`}>
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{feedback.message}</span>
            </div>
            <button type="button" onClick={() => setFeedback(null)} aria-label="Đóng thông báo" className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg hover:bg-black/5">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* IQC / SQC_MAT CONFIGURATION UI */}
        {isIQC && (
            <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-slate-800/80 border border-blue-100 dark:border-slate-700 rounded-xl p-4 flex gap-3 items-start">
                    <Package className="w-5 h-5 text-blue-500 dark:text-blue-400 mt-1" />
                    <div className="text-xs text-blue-900 dark:text-slate-200">
                        <p className="font-black uppercase tracking-tight mb-1">Cấu hình {moduleId === 'SQC_MAT' ? 'SQC - Vật Tư' : 'IQC - Vật liệu đầu vào'}</p>
                        <p>Thiết lập theo cấu trúc: <strong>Nhóm Hạng Mục</strong> {'>'} <strong>Tiêu chí kiểm tra</strong>. Liên kết lỗi từ thư viện để QC chọn nhanh.</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                            <LayoutGrid className="w-3 h-3 text-blue-500 dark:text-blue-400" /> Chọn nhóm hạng mục cần chỉnh sửa
                        </label>
                        <Combobox
                            value={activeGroup || null}
                            onChange={(v) => setActiveGroup(v || '')}
                            options={Object.keys(iqcGroups).map(groupName => ({
                                value: groupName,
                                label: `${groupName} (${iqcGroups[groupName].length} tiêu chí)`
                            }))}
                            placeholder="-- Chọn nhóm --"
                            allowClear={false}
                            ariaLabel="Chọn nhóm hạng mục"
                        />
                    </div>
                    {!effectiveReadOnly && (
                      <div className="flex gap-2">
                          <button 
                              type="button"
                              onClick={handleAddIQCGroup}
                              className="flex-1 md:flex-none h-[50px] px-6 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
                          >
                              <Plus className="w-4 h-4" /> Thêm Nhóm Mới
                          </button>
                      </div>
                    )}
                </div>

                {/* Active Group Editor */}
                {activeGroup && iqcGroups[activeGroup] ? (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex items-center gap-3 flex-1">
                                <div className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 dark:text-slate-500"><Package className="w-5 h-5" /></div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Chỉnh sửa tên nhóm hiện tại</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            className="font-bold text-base bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-slate-800 dark:text-slate-200 uppercase w-full transition-all hover:border-slate-300 dark:border-slate-600 focus:bg-white dark:bg-slate-900"
                                            value={activeGroup || ''}
                                            onChange={(e) => handleRenameGroup(activeGroup, e.target.value)}
                                            placeholder="Tên nhóm..."
                                        />
                                        <Edit3 className="w-4 h-4 text-slate-300" />
                                    </div>
                                </div>
                            </div>
                            <button type="button" onClick={() => handleDeleteGroup(activeGroup)} className="min-h-[44px] lg:min-h-[38px] flex items-center justify-center gap-2 px-4 py-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 rounded-xl font-bold text-xs transition-colors"><Trash2 className="w-4 h-4" /> Xóa nhóm</button>
                        </div>

                        <div className="p-4 space-y-4 bg-slate-50 dark:bg-slate-800/30">
                            {iqcGroups[activeGroup].map((item) => (
                                <div key={item.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-all group relative">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Nội dung kiểm tra *</label>
                                                <input type="text" value={item.label || ''} onChange={(e) => handleChange(item.id, 'label', e.target.value)} className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-100 outline-none transition-all" />
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Phương pháp</label><input type="text" value={item.method || ''} onChange={(e) => handleChange(item.id, 'method', e.target.value)} className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm lg:text-xs font-medium outline-none focus:border-blue-400" /></div>
                                                <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Tần suất</label><input type="text" value={item.frequency || ''} onChange={(e) => handleChange(item.id, 'frequency', e.target.value)} className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm lg:text-xs font-medium outline-none focus:border-blue-400" /></div>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Tiêu chuẩn ISO / Dung sai</label><textarea rows={1} value={item.standard || ''} onChange={(e) => handleChange(item.id, 'standard', e.target.value)} className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm lg:text-xs font-medium outline-none resize-none focus:border-blue-400" /></div>
                                            <div className="space-y-1.5 relative">
                                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex justify-between"><span>Lỗi liên kết (Thư viện)</span><span className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-slate-800/80 px-1.5 py-0.5 rounded">{item.defectIds?.length || 0} đã chọn</span></label>
                                                <button type="button" className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm lg:text-xs text-slate-600 dark:text-slate-400 cursor-pointer flex justify-between items-center hover:border-blue-400 transition-all text-left" onClick={() => { setOpenDefectSelector(openDefectSelector === item.id ? null : item.id); setDefectSearchTerm(''); }}><span className="truncate font-medium">{item.defectIds && item.defectIds.length > 0 ? defectLibrary.filter(d => item.defectIds?.includes(d.code)).map(d => d.name).join(', ') : 'Gán lỗi chuẩn...'}</span><ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0"/></button>
                                                {openDefectSelector === item.id && (
                                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col gap-2"><div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Thư viện lỗi</span><button type="button" onClick={() => setOpenDefectSelector(null)} className="min-w-[44px] min-h-[44px] lg:min-w-[32px] lg:min-h-[32px] -mr-1.5 flex items-center justify-center rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700"><X className="w-4 h-4 text-slate-400 dark:text-slate-500"/></button></div><div className="relative flex items-center gap-1.5"><div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" /><input className="w-full min-h-[44px] lg:min-h-[36px] pl-9 pr-3 border border-slate-200 dark:border-slate-700 rounded-lg text-sm lg:text-xs outline-none focus:ring-2 ring-blue-100 font-medium bg-white dark:bg-slate-900" placeholder="Tìm..." value={defectSearchInput} onChange={(e) => setDefectSearchInput(e.target.value)} onBlur={handleCommitDefectSearch} onKeyDown={handleDefectSearchKeyDown} autoFocus /></div><button type="button" onClick={() => setIsAddDefectModalOpen(true)} className="min-h-[44px] lg:min-h-[36px] bg-blue-600 text-white px-3 rounded-lg text-xs font-bold uppercase shrink-0">Mới</button></div></div>
                                                        <div className="max-h-56 overflow-y-auto p-2 space-y-1">{defectLibrary.filter(def => !defectSearchTerm || def.name.toLowerCase().includes(defectSearchTerm.toLowerCase()) || def.code.toLowerCase().includes(defectSearchTerm.toLowerCase())).map(def => (<button type="button" key={def.code} className={`w-full text-left min-h-[44px] flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer ${item.defectIds?.includes(def.code) ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-slate-700' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'}`} onClick={() => toggleDefect(item.id, def.code)}><div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${item.defectIds?.includes(def.code) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-600'}`}>{item.defectIds?.includes(def.code) && <CheckSquare className="w-3.5 h-3.5 text-white" />}</div><div className="flex-1 overflow-hidden"><p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{def.name}</p><div className="flex items-center gap-2 mt-0.5"><span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">{def.code}</span><span className={`text-[9px] font-bold uppercase ${def.severity === 'CRITICAL' ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>{def.severity}</span></div></div></button>))}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => handleRemoveItem(item.id)} aria-label="Xóa tiêu chí" className="min-w-[44px] min-h-[44px] lg:min-w-[32px] lg:min-h-[32px] flex items-center justify-center absolute -top-2 -right-2 bg-white dark:bg-slate-900 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-full shadow-sm border border-slate-200 dark:border-slate-700 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all hover:scale-110"><Trash2 className="w-4 h-4"/></button>
                                </div>
                            ))}
                            <button type="button" onClick={() => handleAddItem(activeGroup)} className="w-full min-h-[48px] py-4 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800/50 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 group"><div className="p-1 bg-slate-200 dark:bg-slate-700 rounded-full group-hover:bg-blue-200 transition-colors"><Plus className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" /></div> Thêm tiêu chí vào {activeGroup}</button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500 space-y-4"><Package className="w-16 h-16 opacity-20" /><p className="font-bold uppercase tracking-widest text-xs">Vui lòng chọn nhóm hạng mục phía trên</p></div>
                )}
            </div>
        )}

        {/* PQC / SQC_BTP CONFIGURATION UI */}
        {isPQC && (
          <div className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3 items-start"><Factory className="w-5 h-5 text-indigo-500 mt-1" /><div className="text-xs text-indigo-900"><p className="font-black uppercase tracking-tight mb-1">Cấu hình {moduleId === 'SQC_TP' ? 'SQC - Thành Phẩm' : moduleId === 'SQC_BTP' ? 'SQC - Bán Thành Phẩm' : moduleId === 'FQC' ? 'FQC - Thành Phẩm' : 'PQC 2 Lớp (ISO Compliance)'}</p><p>{isCustomStagePQC ? "Tự do quản lý danh sách công đoạn và các tiêu chí kiểm tra cho Bán thành phẩm / Thành phẩm." : "Hạng mục được gán trực tiếp vào Công đoạn sản xuất. Dữ liệu công đoạn được đồng bộ từ module Quản lý xưởng."}</p></div></div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4"><div className="flex flex-col md:flex-row gap-4 items-start md:items-end"><div className="flex-1 w-full"><label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">Chọn Công Đoạn Cần Cấu Hình</label><Combobox value={activeStage || null} onChange={(v) => setActiveStage(v || '')} options={stageOptions.map(s => ({ value: s, label: s }))} placeholder="-- Chọn công đoạn --" allowClear={false} ariaLabel="Chọn công đoạn cấu hình" /></div>{isCustomStagePQC && (<div className="flex flex-wrap gap-2 w-full md:w-auto"><button type="button" onClick={handleAddCustomStage} className="flex-1 md:flex-none min-h-[46px] px-4 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-2 shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"><Plus className="w-4 h-4" /> Thêm mới</button>
<button type="button" onClick={handleCopyFromPQC} className="flex-1 md:flex-none min-h-[46px] px-4 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all"> Sao chép PQC</button>
{activeStage && (<><button type="button" onClick={handleRenameCustomStage} aria-label="Đổi tên công đoạn" className="min-h-[46px] min-w-[46px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-blue-900/20 transition-all"><Pencil className="w-4 h-4"/></button><button type="button" onClick={handleDeleteCustomStage} aria-label="Xóa công đoạn" className="min-h-[46px] min-w-[46px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-900/20 transition-all"><Trash2 className="w-4 h-4"/></button></>)}</div>)}</div></div>
            {activeStage ? (<div className="space-y-3"><div className="flex items-center justify-between px-2"><h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500" /> Tiêu chí: {activeStage}<span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full">{activeStageItems.length}</span></h3></div><div className="grid grid-cols-1 gap-3">{activeStageItems.map((item) => (<div key={item.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4 group transition-all hover:border-indigo-300"><div className="flex justify-between items-start gap-3"><div className="flex-1 space-y-3"><div className="space-y-1"><label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Hạng mục kiểm tra *</label><input type="text" value={item.label} onChange={(e) => handleChange(item.id, 'label', e.target.value)} className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl text-sm lg:text-xs font-bold text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 outline-none transition-all" /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div className="space-y-1"><label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5"><Layers className="w-3 h-3 text-slate-300" /> Phương pháp</label><input type="text" value={item.method || ''} onChange={(e) => handleChange(item.id, 'method', e.target.value)} className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl text-sm lg:text-xs font-medium text-slate-600 dark:text-slate-300 outline-none" /></div><div className="space-y-1"><label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5"><FileText className="w-3 h-3 text-slate-300" /> Tiêu chuẩn</label><input type="text" value={item.standard || ''} onChange={(e) => handleChange(item.id, 'standard', e.target.value)} className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl text-sm lg:text-xs font-medium text-slate-600 dark:text-slate-300 outline-none" /></div></div></div><button type="button" onClick={() => handleRemoveItem(item.id)} aria-label="Xóa tiêu chí" className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"><Trash2 className="w-4 h-4" /></button></div></div>))}</div><button type="button" onClick={() => handleAddItem(activeStage)} className="w-full min-h-[48px] py-4 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-500 font-bold text-xs uppercase tracking-widest hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 group"><Plus className="w-4 h-4 group-hover:scale-110 transition-transform" /> Thêm tiêu chí vào {activeStage}</button></div>) : (<div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500 space-y-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl"><Factory className="w-12 h-12 opacity-20" /><p className="font-bold uppercase tracking-widest text-xs">Chọn công đoạn sản xuất để cấu hình</p></div>)}
          </div>
        )}

        {moduleId === 'SITE' && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-slate-800/80 border border-blue-100 dark:border-slate-700 rounded-xl p-4 flex gap-3 items-start">
              <Package className="w-5 h-5 text-blue-500 dark:text-blue-400 mt-1" />
              <div className="text-xs text-blue-900">
                <p className="font-black uppercase tracking-tight mb-1">Cấu hình Checklist Site - Công trình</p>
                <p>Chọn nhóm sản phẩm để cấu hình checklist riêng biệt. Mỗi nhóm sẽ có một bảng tiêu chí riêng.</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                  <LayoutGrid className="w-3 h-3 text-blue-500 dark:text-blue-400" /> Chọn nhóm sản phẩm cần cấu hình
                </label>
                <Combobox
                  value={selectedSiteGroup}
                  onChange={(group) => {
                    const nextGroup = group || 'BAN';
                    setSelectedSiteGroup(nextGroup);
                    const restored = resolveBaseline(nextGroup);
                    setItems(restored);
                    setSavedSnapshot(JSON.stringify(restored));
                    setFeedback(null);
                  }}
                  options={[
                    { value: 'BAN', label: 'Bàn' },
                    { value: 'GHE', label: 'Ghế' },
                    { value: 'TU', label: 'Tủ' },
                    { value: 'GIUONG', label: 'Giường' },
                    { value: 'GUONG', label: 'Khung gương' },
                    { value: 'TU_AO', label: 'Tủ áo & Tủ liền tường' },
                    { value: 'TRAN', label: 'Trần' },
                    { value: 'TUONG', label: 'Tường, vách & đồ liền tường' },
                    { value: 'SAN', label: 'Sàn' },
                    { value: 'CUA', label: 'Cửa' },
                  ]}
                  allowClear={false}
                  ariaLabel="Chọn nhóm sản phẩm"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-500 dark:text-blue-400" /> Tiêu chí: {selectedSiteGroup}
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full">{items.length}</span>
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {items.map((item) => (
                  <div key={item.id} className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm space-y-4 group transition-all hover:border-blue-300">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Nhóm (Category)</label>
                            <input type="text" disabled={effectiveReadOnly} value={item.category} onChange={(e) => handleChange(item.id, 'category', e.target.value)} className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-md text-sm lg:text-xs font-bold text-blue-600 dark:text-blue-400 focus:bg-white dark:focus:bg-slate-900 outline-none transition-all disabled:opacity-70" />
                          </div>
                          <div className="md:col-span-2 space-y-1">
                            <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Hạng mục kiểm tra *</label>
                            <input type="text" disabled={effectiveReadOnly} value={item.label} onChange={(e) => handleChange(item.id, 'label', e.target.value)} className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-md text-sm lg:text-xs font-bold text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 outline-none transition-all disabled:opacity-70" />
                          </div>
                        </div>
                      </div>
                      {!effectiveReadOnly && (
                        <button type="button" onClick={() => handleRemoveItem(item.id)} aria-label="Xóa tiêu chí" className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {!effectiveReadOnly && (
                <button type="button" onClick={() => handleAddItem()} className="w-full min-h-[48px] py-4 border-2 border-dashed border-blue-200 dark:border-slate-700 rounded-lg text-blue-500 dark:text-blue-400 font-bold text-xs uppercase tracking-widest hover:bg-blue-50 dark:hover:bg-slate-800/80 transition-all flex items-center justify-center gap-2 group">
                  <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" /> Thêm tiêu chí vào {selectedSiteGroup}
                </button>
              )}
            </div>
          </div>
        )}

        {!isPQC && !isIQC && moduleId !== 'SITE' && (
          <div className="space-y-3">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-slate-700 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-200 mb-4 flex items-center gap-2">
              <Info className="w-4 h-4" /> Mẫu này được áp dụng cho {moduleLabel} mới.
            </div>
            {items.map((item) => (
              <div key={item.id} className="flex gap-2 items-start bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input type="text" disabled={effectiveReadOnly} value={item.category} onChange={(e) => handleChange(item.id, 'category', e.target.value)} className="min-h-[44px] lg:min-h-[38px] px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm lg:text-xs font-bold text-blue-600 dark:text-blue-400 outline-none bg-slate-50 dark:bg-slate-800/50 disabled:opacity-70" />
                  <input type="text" disabled={effectiveReadOnly} value={item.label} onChange={(e) => handleChange(item.id, 'label', e.target.value)} className="md:col-span-2 min-h-[44px] lg:min-h-[38px] px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm lg:text-xs text-slate-900 dark:text-slate-100 outline-none disabled:opacity-70" />
                </div>
                {!effectiveReadOnly && (
                  <button type="button" onClick={() => handleRemoveItem(item.id)} aria-label="Xóa hạng mục" className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            ))}
            {!effectiveReadOnly && (
              <button type="button" onClick={() => handleAddItem()} className="w-full min-h-[48px] py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 dark:text-slate-400 hover:border-blue-500 hover:text-blue-600 transition-all flex items-center justify-center font-bold text-xs uppercase tracking-widest">
                <Plus className="w-4 h-4 mr-2" /> Thêm hạng mục
              </button>
            )}
          </div>
        )}
      </div>

      {typeof document !== 'undefined' && isAddDefectModalOpen && createPortal(
          <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] rounded-lg shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col">
                <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 bg-slate-50 dark:bg-slate-800/50 shrink-0"><h3 className="font-bold text-slate-800 dark:text-slate-200 uppercase text-xs flex items-center gap-2 truncate"><Plus className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" /> Thêm Lỗi Mới</h3><button type="button" onClick={() => setIsAddDefectModalOpen(false)} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 shrink-0 flex items-center justify-center rounded-lg"><X className="w-5 h-5 text-slate-400 dark:text-slate-500"/></button></div>
                <div className="p-3.5 sm:p-5 space-y-3 overflow-y-auto flex-1 min-h-0">
                  {defectModalError && (
                    <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{defectModalError}</span>
                    </div>
                  )}
                  <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Mã lỗi</label><input value={newDefect.code} onChange={e => setNewDefect({...newDefect, code: e.target.value.toUpperCase()})} className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm lg:text-xs font-mono font-bold uppercase" /></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Tên lỗi *</label><input value={newDefect.name} onChange={e => setNewDefect({...newDefect, name: e.target.value})} className="w-full min-h-[44px] lg:min-h-[38px] px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm lg:text-xs font-bold outline-none focus:ring-2 ring-blue-500" /></div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Mức độ</label>
                    <Combobox
                      value={newDefect.severity || 'MINOR'}
                      onChange={(v) => setNewDefect({ ...newDefect, severity: (v as any) || 'MINOR' })}
                      options={[
                        { value: 'MINOR', label: 'MINOR' },
                        { value: 'MAJOR', label: 'MAJOR' },
                        { value: 'CRITICAL', label: 'CRITICAL' },
                      ]}
                      allowClear={false}
                      ariaLabel="Mức độ lỗi"
                    />
                  </div>
                </div>
                <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex gap-2 shrink-0"><Button variant="secondary" size="sm" onClick={() => setIsAddDefectModalOpen(false)} className="flex-1 min-h-[44px] sm:min-h-[36px] py-2 sm:py-1.5 rounded-md whitespace-nowrap">Hủy</Button><Button size="sm" onClick={handleSaveNewDefect} disabled={isSavingDefect} className="flex-1 min-h-[44px] sm:min-h-[36px] py-2 sm:py-1.5 rounded-md whitespace-nowrap">{isSavingDefect ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Lưu'}</Button></div>
              </div>
          </div>,
          document.body
      )}
      
      {typeof document !== 'undefined' && isImporting && createPortal(
          <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-xl flex flex-col items-center gap-4 border border-slate-200 dark:border-slate-800">
                  <Loader2 className="w-10 h-10 text-blue-600 dark:text-blue-400 animate-spin" />
                  <p className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Đang xử lý file Excel...</p>
              </div>
          </div>,
          document.body
      )}

      {/* Prompt Modal */}
      {typeof document !== 'undefined' && promptModal.isOpen && createPortal(
        <div className="fixed inset-0 z-[240] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200">
            <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 uppercase text-xs flex items-center gap-2 truncate">
                <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" /> <span className="truncate">{promptModal.title}</span>
              </h3>
              <button type="button" onClick={() => setPromptModal(prev => ({ ...prev, isOpen: false }))} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 shrink-0 flex items-center justify-center rounded-lg">
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <div className="p-3.5 sm:p-5 space-y-3 overflow-y-auto flex-1 min-h-0">
              {promptModal.message && (
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{promptModal.message}</p>
              )}
              <input
                type="text"
                autoFocus
                value={promptModal.value}
                onChange={e => setPromptModal(prev => ({ ...prev, value: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const val = promptModal.value;
                    const cb = promptModal.onConfirm;
                    setPromptModal(prev => ({ ...prev, isOpen: false }));
                    cb(val);
                  }
                }}
                className="w-full min-h-[44px] px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                placeholder="Nhập..."
              />
            </div>
            <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/30 flex justify-end gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setPromptModal(prev => ({ ...prev, isOpen: false }))} className="min-h-[44px] sm:min-h-[36px] py-2 sm:py-1.5 whitespace-nowrap shrink-0">Hủy</Button>
              <Button size="sm" className="min-h-[44px] sm:min-h-[36px] py-2 sm:py-1.5 whitespace-nowrap shrink-0" onClick={() => {
                const val = promptModal.value;
                const cb = promptModal.onConfirm;
                setPromptModal(prev => ({ ...prev, isOpen: false }));
                cb(val);
              }}>Xác nhận</Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm Modal */}
      {typeof document !== 'undefined' && confirmModal.isOpen && createPortal(
        <div className="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200">
            <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 uppercase text-xs flex items-center gap-2 text-indigo-600 dark:text-indigo-400 truncate">
                <Info className="w-4 h-4 shrink-0" /> <span className="truncate">{confirmModal.title}</span>
              </h3>
              <button type="button" onClick={() => {
                if (confirmModal.onCancel) confirmModal.onCancel();
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
              }} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 shrink-0 flex items-center justify-center rounded-lg">
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 min-h-0">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-relaxed">{confirmModal.message}</p>
            </div>
            <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/30 flex justify-end gap-2 shrink-0">
              <Button variant="ghost" size="sm" className="min-h-[44px] sm:min-h-[36px] py-2 sm:py-1.5 whitespace-nowrap shrink-0" onClick={() => {
                if (confirmModal.onCancel) confirmModal.onCancel();
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
              }}>{confirmModal.cancelText || 'Hủy'}</Button>
              <Button size="sm" className="min-h-[44px] sm:min-h-[36px] py-2 sm:py-1.5 whitespace-nowrap shrink-0" onClick={() => {
                const cb = confirmModal.onConfirm;
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                cb();
              }}>{confirmModal.confirmText || 'Xác nhận'}</Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmDialog
        open={revertConfirmOpen}
        variant="warning"
        title="Hoàn tác thay đổi chưa lưu"
        message="Bạn có muốn hoàn tác toàn bộ thay đổi chưa lưu và khôi phục về phiên bản mẫu đã lưu gần nhất?"
        confirmLabel="Hoàn tác"
        cancelLabel="Tiếp tục sửa"
        onConfirm={handleRevertChanges}
        onCancel={() => setRevertConfirmOpen(false)}
      />
    </div>
  );
};