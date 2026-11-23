import { getProxyImageUrl } from '../src/utils';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DefectLibraryItem, User, Workshop, hasPermission } from '../types';
import { fetchDefectLibrary, saveDefectLibraryItem, deleteDefectLibraryItem, fetchWorkshops, exportDefectLibrary, importDefectLibraryFile } from '../services/apiService';
import { useTheme } from '../src/context/ThemeContext';
import { 
    Search, Plus, Edit2, Trash2, ShieldAlert, Hammer, 
    Tag, Filter, Loader2, X, Save, AlertTriangle, 
    Layers, BookOpen, ChevronRight, Hash, ChevronDown,
    Image as ImageIcon, CheckCircle, XCircle, Camera,
    FileUp, FileDown, SlidersHorizontal, Package, LayoutGrid
} from 'lucide-react';
import { Combobox, ConfirmDialog } from '../src/components/qms';

interface DefectLibraryProps {
  currentUser: User;
}

export const DefectLibrary: React.FC<DefectLibraryProps> = ({ currentUser }) => {
  const { theme, density } = useTheme();
  const paddingClass = density === 'comfortable' ? 'px-4 py-3' : 'px-3 py-2.5';

  const [library, setLibrary] = useState<DefectLibraryItem[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const handleCommitSearch = () => {
    setSearchTerm(searchInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommitSearch();
    }
  };
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DefectLibraryItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [deleteDefectId, setDeleteDefectId] = useState<string | null>(null);

  const correctImgRef = useRef<HTMLInputElement>(null);
  const incorrectImgRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isQA = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER' || currentUser.role === 'QA';

  const [formData, setFormData] = useState<Partial<DefectLibraryItem>>({
    code: '',
    name: '',
    stage: '',
    category: 'Ngoại quan',
    description: '',
    severity: 'MINOR',
    rootCause: '',
    suggestedAction: '',
    correctImage: '',
    incorrectImage: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
        const [libData, wsData] = await Promise.all([
            fetchDefectLibrary(),
            fetchWorkshops()
        ]);
        setLibrary(libData);
        setWorkshops(wsData);
    } catch (e) {
        console.error("Load library failed:", e);
    } finally {
        setIsLoading(false);
    }
  };

  const availableStages = useMemo(() => {
      const allStages = workshops.flatMap(ws => ws.stages || []);
      const unique = Array.from(new Set(allStages)).filter(Boolean);
      if (unique.length === 0) return ['Chung', 'IQC', 'PQC', 'FQC', 'Site'];
      return unique.sort();
  }, [workshops]);

  // Logic phân nhóm theo Stage cho Thư viện lỗi
  const groupedLibrary = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    const groups: Record<string, DefectLibraryItem[]> = {};

    const filtered = library.filter(item => {
        return !term || 
            item.code.toLowerCase().includes(term) || 
            (item.name && item.name.toLowerCase().includes(term)) ||
            item.description.toLowerCase().includes(term);
    });

    filtered.forEach(item => {
        const stage = item.stage || 'Chung';
        if (!groups[stage]) groups[stage] = [];
        groups[stage].push(item);
    });

    return groups;
  }, [library, searchTerm]);

  const toggleStage = (stage: string) => {
    setExpandedStages(prev => {
        const next = new Set(prev);
        if (next.has(stage)) next.delete(stage);
        else next.add(stage);
        return next;
    });
  };

  const handleOpenModal = (item?: DefectLibraryItem) => {
      if (item) {
          setEditingItem(item);
          setFormData({ ...item });
      } else {
          setEditingItem(null);
          const generatedCode = `DEF_${Date.now()}`;
          setFormData({
              id: generatedCode,
              code: generatedCode,
              name: '',
              stage: availableStages[0] || 'Chung',
              category: 'Ngoại quan',
              description: '',
              severity: 'MINOR',
              rootCause: '',
              suggestedAction: '',
              correctImage: '',
              incorrectImage: ''
          });
      }
      setIsModalOpen(true);
  };

  const handleExport = async (format: 'csv' | 'xlsx' = 'csv') => {
      setIsExporting(true);
      try {
          await exportDefectLibrary(format);
      } catch (e) {
          console.error(e);
      } finally {
          setIsExporting(false);
      }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsImporting(true);
      try {
          const result = await importDefectLibraryFile(file);
          alert(`Thành công! Đã nhập ${result.count} lỗi chuẩn vào hệ thống.`);
          await loadData();
      } catch (err: any) {
          alert(`Lỗi khi nhập file: ${err.message}`);
      } finally {
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'correct' | 'incorrect') => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        const { uploadFileToStorage } = await import('../services/apiService');
        const url = await uploadFileToStorage(file, `defect_${type}_${Date.now()}_${file.name}`);
        setFormData(prev => ({
            ...prev,
            [type === 'correct' ? 'correctImage' : 'incorrectImage']: url
        }));
    } catch (err) {
        alert("Lỗi tải ảnh lên.");
    }
  };

  const handleSave = async () => {
      if (!formData.code || !formData.name || !formData.stage || !formData.description) {
          alert("Vui lòng điền đầy đủ các thông tin bắt buộc (*)");
          return;
      }
      setIsSaving(true);
      try {
          const itemToSave = {
              ...formData,
              id: formData.id || formData.code,
              createdBy: currentUser.name,
              createdAt: typeof editingItem?.createdAt === 'string' ? Math.floor(Date.parse(editingItem.createdAt) / 1000) : (editingItem?.createdAt || Math.floor(Date.now() / 1000))
          } as DefectLibraryItem;

          await saveDefectLibraryItem(itemToSave);
          await loadData();
          setIsModalOpen(false);
      } catch (err) {
          console.error("Save error:", err);
          alert("Lỗi khi lưu thư viện lỗi.");
      } finally {
          setIsSaving(false);
      }
  };

  const handleDelete = (id: string) => {
      setDeleteDefectId(id);
  };

  const executeDeleteDefect = async () => {
      if (!deleteDefectId) return;
      const targetId = deleteDefectId;
      setDeleteDefectId(null);
      await deleteDefectLibraryItem(targetId);
      await loadData();
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity?.toUpperCase()) {
        case 'CRITICAL': return 'bg-red-600 text-white border-red-700';
        case 'MAJOR': return 'bg-orange-500 text-white border-orange-600';
        default: return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-800/50 overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".xlsx" className="hidden" />
      
      {/* HEADER TOOLBAR */}
      <div className="bg-white dark:bg-slate-900 p-3 md:px-6 md:py-3 border-b border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-end gap-4">
              <div className="flex flex-wrap items-center gap-2 flex-1 md:justify-end">
                  <div className="relative group flex-1 md:max-w-xs">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-500 dark:text-blue-400" />
                      <input 
                        type="text" placeholder="Tìm mã lỗi, tên..." 
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        onBlur={handleCommitSearch}
                        onKeyDown={handleKeyDown}
                        className="min-h-[44px] lg:min-h-[40px] pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm lg:text-xs font-bold w-full focus:bg-white dark:bg-slate-900 outline-none focus:ring-4 focus:ring-blue-100/50 transition-all shadow-inner"
                      />
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2">
                      {hasPermission(currentUser, [], 'DEFECT_LIBRARY', 'EXPORT') && (
                          <div className="flex items-center gap-1.5">
                              <button 
                                  onClick={() => handleExport('csv')}
                                  disabled={isExporting}
                                  className="min-h-[44px] lg:min-h-[40px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                                  title="Xuất CSV Stream"
                              >
                                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                                  <span>CSV</span>
                              </button>
                              <button 
                                  onClick={() => handleExport('xlsx')}
                                  disabled={isExporting}
                                  className="min-w-[44px] min-h-[44px] lg:min-w-[40px] lg:min-h-[40px] p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm flex items-center justify-center"
                                  title="Xuất Excel (.xlsx)"
                              >
                                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                              </button>
                          </div>
                      )}
                      {hasPermission(currentUser, [], 'DEFECT_LIBRARY', 'IMPORT') && (
                          <button 
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isImporting}
                              className="min-w-[44px] min-h-[44px] lg:min-w-[40px] lg:min-h-[40px] p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 active:scale-95 transition-all shadow-sm flex items-center justify-center"
                              title="Nhập từ Excel"
                          >
                              {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
                          </button>
                      )}
                      {hasPermission(currentUser, [], 'DEFECT_LIBRARY', 'CREATE') && (
                          <button onClick={() => handleOpenModal()} className="min-h-[44px] lg:min-h-[40px] px-4 sm:px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs lg:text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-200 active:scale-95 transition-all">
                              <Plus className="w-4 h-4" /> Thêm lỗi mới
                          </button>
                      )}
                  </div>
              </div>
          </div>
      </div>

      {/* CONTENT AREA - ACCORDION GROUPING */}
      <div className="flex-1 overflow-auto p-4 md:p-6 no-scrollbar pb-24">
          <div className="max-w-7xl mx-auto space-y-4">
              {isLoading ? (
                  <div className="h-full flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
                      <Loader2 className="w-12 h-12 animate-spin text-blue-600 dark:text-blue-400 mb-4" />
                      <p className="font-black uppercase tracking-widest text-xs">Đang đồng bộ dữ liệu thư viện...</p>
                  </div>
              ) : Object.keys(groupedLibrary).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-slate-300">
                      <BookOpen className="w-24 h-24 opacity-10 mb-4" />
                      <p className="font-black uppercase tracking-[0.3em] text-xs">Không tìm thấy lỗi phù hợp</p>
                  </div>
              ) : (
                  // Fix: Added explicit type [string, DefectLibraryItem[]] to resolve unknown type error on line 312 and 331
                  Object.entries(groupedLibrary).sort().map(([stage, items]: [string, DefectLibraryItem[]]) => {
                      const isExpanded = expandedStages.has(stage) || searchTerm.length > 0;
                      return (
                          <div key={stage} className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all">
                              {/* Stage Header */}
                              <div 
                                  onClick={() => toggleStage(stage)}
                                  className={`p-5 flex items-center justify-between cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50 dark:bg-blue-900/20 dark:bg-slate-800 border-b border-blue-100 dark:border-slate-700' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 dark:hover:bg-slate-800'}`}
                              >
                                  <div className="flex items-center gap-4">
                                      <div className={`p-3 rounded-2xl ${isExpanded ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500'}`}>
                                          <LayoutGrid className="w-5 h-5" />
                                      </div>
                                      <div>
                                          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-800 dark:text-slate-200">{stage}</h3>
                                          {/* Fix: explicit typing ensures items.length is accessible */}
                                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest">Tiêu chuẩn ISO • {items.length} lỗi ghi nhận</p>
                                      </div>
                                  </div>
                                  <ChevronDown className={`w-5 h-5 text-slate-300 dark:text-slate-500 dark:text-slate-400 dark:text-slate-500 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''}`} />
                              </div>

                              {/* Defects Mobile Cards + Tablet/Desktop Table */}
                              {isExpanded && (
                                  <>
                                      {/* Mobile Cards */}
                                      <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 animate-in slide-in-from-top-2 duration-300">
                                          {items.map((item) => (
                                              <div key={item.id} className="p-4 space-y-2.5">
                                                  <div className="flex items-start justify-between gap-2">
                                                      <div className="flex items-center gap-3 min-w-0">
                                                          <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                                                              <Tag className="w-4 h-4" />
                                                          </div>
                                                          <div className="min-w-0">
                                                              <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs block uppercase">{item.code}</span>
                                                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase truncate block">{item.name || '---'}</span>
                                                          </div>
                                                      </div>
                                                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border shadow-sm shrink-0 ${getSeverityStyle(item.severity)}`}>
                                                          {item.severity}
                                                      </span>
                                                  </div>
                                                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 leading-relaxed">"{item.description}"</p>
                                                  {item.rootCause && (
                                                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                                                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {item.rootCause}
                                                      </div>
                                                  )}
                                                  {isQA && (
                                                      <div className="flex items-center gap-2 pt-2">
                                                          <button onClick={() => handleOpenModal(item)} className="flex-1 min-h-[44px] px-3 py-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-blue-100 dark:border-slate-700"><Edit2 className="w-4 h-4"/> Sửa</button>
                                                          <button onClick={() => handleDelete(item.id)} className="min-w-[44px] min-h-[44px] px-3 py-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-red-100 dark:border-red-900/40"><Trash2 className="w-4 h-4"/></button>
                                                      </div>
                                                  )}
                                              </div>
                                          ))}
                                      </div>

                                      {/* Tablet/Desktop Table */}
                                      <div className="hidden md:block overflow-x-auto bg-white dark:bg-slate-900 animate-in slide-in-from-top-2 duration-300">
                                          <table className="w-full text-left border-collapse min-w-[720px]">
                                              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                                                  <tr>
                                                      <th className={`${paddingClass} w-64`}>Mã & Tên Lỗi</th>
                                                      <th className={`${paddingClass} w-44`}>Phân loại</th>
                                                      <th className={`${paddingClass}`}>Mô tả chi tiết</th>
                                                      <th className={`${paddingClass} w-32 text-right`}>Thao tác</th>
                                                  </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                                  {items.map((item) => (
                                                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                                          <td className={`${paddingClass}`}>
                                                              <div className="flex items-center gap-4">
                                                                  <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-all border border-slate-200 dark:border-slate-700">
                                                                      <Tag className="w-4 h-4" />
                                                                  </div>
                                                                  <div>
                                                                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs block uppercase tracking-tighter">{item.code}</span>
                                                                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase truncate max-w-[180px] block">{item.name || '---'}</span>
                                                                  </div>
                                                              </div>
                                                          </td>
                                                          <td className={`${paddingClass}`}>
                                                              <div className="flex flex-col gap-1.5">
                                                                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">{item.category}</span>
                                                                  <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase w-fit border shadow-sm ${getSeverityStyle(item.severity)}`}>
                                                                      {item.severity}
                                                                  </span>
                                                              </div>
                                                          </td>
                                                          <td className={`${paddingClass}`}>
                                                              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-2">"{item.description}"</p>
                                                              {item.rootCause && (
                                                                <div className="mt-2 flex items-center gap-1.5 text-[9px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-tighter">
                                                                    <AlertTriangle className="w-3 h-3" /> Nguyên nhân: {item.rootCause}
                                                                </div>
                                                              )}
                                                              {item.suggestedAction && (
                                                                  <div className="mt-2 flex items-center gap-1.5 text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-tighter">
                                                                      <SlidersHorizontal className="w-3 h-3" /> Fix: {item.suggestedAction}
                                                                  </div>
                                                              )}
                                                          </td>
                                                          <td className={`${paddingClass} text-right`}>
                                                              {isQA ? (
                                                                  <div className="flex items-center justify-end gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                                                      <button onClick={() => handleOpenModal(item)} className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] p-2 text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-slate-700 rounded-xl shadow-sm border border-transparent hover:border-blue-100 dark:hover:border-slate-600 transition-all flex items-center justify-center"><Edit2 className="w-4 h-4"/></button>
                                                                      <button onClick={() => handleDelete(item.id)} className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] p-2 text-red-600 dark:text-red-400 hover:bg-white dark:hover:bg-slate-700 rounded-xl shadow-sm border border-transparent hover:border-red-100 dark:hover:border-slate-600 transition-all flex items-center justify-center"><Trash2 className="w-4 h-4"/></button>
                                                                  </div>
                                                              ) : (
                                                                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 ml-auto" />
                                                              )}
                                                          </td>
                                                      </tr>
                                                  ))}
                                              </tbody>
                                          </table>
                                      </div>
                                  </>
                              )}
                          </div>
                      );
                  })
              )}
          </div>
      </div>

      {/* CRUD MODAL */}
      {isModalOpen && (
          <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden">
              <div className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
                  <div className="px-4 py-2 sm:py-2.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 bg-white dark:bg-slate-900 shrink-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 bg-blue-600 text-white rounded-xl shadow-sm shrink-0">
                              <Hammer className="w-4 h-4 sm:w-5 sm:h-5" />
                          </div>
                          <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight text-sm sm:text-base truncate">
                              {editingItem ? 'Chỉnh sửa lỗi chuẩn' : 'Thêm mới lỗi chuẩn'}
                          </h3>
                      </div>
                      <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Đóng" className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center justify-center shrink-0 cursor-pointer"><X className="w-5 h-5 text-slate-400"/></button>
                  </div>
                  
                  <div className="p-3.5 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-0 no-scrollbar bg-slate-50 dark:bg-slate-800/30">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Mã Lỗi Hệ Thống</label>
                              <input 
                                value={formData.code} 
                                readOnly 
                                className="w-full px-5 py-3.5 border rounded-2xl font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-inner" 
                                placeholder="Tự động sinh mã..."
                              />
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Tên lỗi tóm tắt *</label>
                              <input 
                                value={formData.name} 
                                onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})}
                                className="w-full px-5 py-3.5 border border-slate-200 dark:border-slate-700 rounded-2xl font-black text-slate-800 dark:text-slate-200 focus:ring-4 focus:ring-blue-100 outline-none uppercase shadow-sm" 
                                placeholder="VD: TRẦY XƯỚC BỀ MẶT"
                              />
                          </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Công đoạn áp dụng *</label>
                              <Combobox
                                value={formData.stage || null}
                                onChange={(v) => setFormData({ ...formData, stage: v || '' })}
                                options={availableStages.map(s => ({ value: s, label: s }))}
                                placeholder="Chọn stage"
                                allowClear={false}
                                ariaLabel="Công đoạn áp dụng"
                              />
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Phân loại kỹ thuật</label>
                              <Combobox
                                value={formData.category || 'Ngoại quan'}
                                onChange={(v) => setFormData({ ...formData, category: v || 'Ngoại quan' })}
                                options={[
                                  { value: 'Ngoại quan', label: 'Ngoại quan' },
                                  { value: 'Kết cấu', label: 'Kết cấu' },
                                  { value: 'Kích thước', label: 'Kích thước' },
                                  { value: 'Phụ kiện', label: 'Phụ kiện' },
                                ]}
                                allowClear={false}
                                ariaLabel="Phân loại kỹ thuật"
                              />
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Mức độ nghiêm trọng</label>
                              <Combobox
                                value={formData.severity || 'MINOR'}
                                onChange={(v) => setFormData({ ...formData, severity: (v as any) || 'MINOR' })}
                                options={[
                                  { value: 'MINOR', label: 'MINOR (Nhẹ)' },
                                  { value: 'MAJOR', label: 'MAJOR (Nặng)' },
                                  { value: 'CRITICAL', label: 'CRITICAL (Nghiêm trọng)' },
                                ]}
                                allowClear={false}
                                ariaLabel="Mức độ nghiêm trọng"
                              />
                          </div>
                      </div>

                      <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Mô tả chi tiết lỗi ISO *</label>
                          <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-5 py-4 border border-slate-200 dark:border-slate-700 rounded-3xl font-bold text-sm focus:ring-4 focus:ring-blue-100 outline-none resize-none shadow-inner" rows={3} placeholder="Nhập mô tả chuẩn để QC tra cứu..."/>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                          <div className="space-y-3">
                              <label className="text-[10px] font-black text-green-600 dark:text-green-500 uppercase flex items-center gap-1.5 ml-1"><CheckCircle className="w-3 h-3" /> Hình ảnh chuẩn (ĐÚNG)</label>
                              <div 
                                onClick={() => correctImgRef.current?.click()}
                                className="aspect-video bg-green-50 dark:bg-green-900/20 border-2 border-dashed border-green-200 dark:border-green-800 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-green-100 dark:bg-green-900/50 transition-all overflow-hidden relative group shadow-sm"
                              >
                                  {formData.correctImage ? (
                                      <img src={getProxyImageUrl(formData.correctImage)} className="w-full h-full object-cover" />
                                  ) : (
                                      <div className="flex flex-col items-center text-green-300">
                                          <Camera className="w-8 h-8" />
                                          <span className="text-[9px] font-black uppercase mt-1">Tải ảnh mẫu</span>
                                      </div>
                                  )}
                                  <input type="file" ref={correctImgRef} className="hidden" accept="image/*" onChange={e => handleImageUpload(e, 'correct')} />
                              </div>
                          </div>
                          <div className="space-y-3">
                              <label className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase flex items-center gap-1.5 ml-1"><XCircle className="w-3 h-3" /> Hình ảnh lỗi (SAI)</label>
                              <div 
                                onClick={() => incorrectImgRef.current?.click()}
                                className="aspect-video bg-red-50 dark:bg-red-900/20 border-2 border-dashed border-red-200 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-red-100/50 transition-all overflow-hidden relative group shadow-sm"
                              >
                                  {formData.incorrectImage ? (
                                      <img src={getProxyImageUrl(formData.incorrectImage)} className="w-full h-full object-cover" />
                                  ) : (
                                      <div className="flex flex-col items-center text-red-300">
                                          <Camera className="w-8 h-8" />
                                          <span className="text-[9px] font-black uppercase mt-1">Tải ảnh lỗi</span>
                                      </div>
                                  )}
                                  <input type="file" ref={incorrectImgRef} className="hidden" accept="image/*" onChange={e => handleImageUpload(e, 'incorrect')} />
                              </div>
                          </div>
                      </div>

                      <div className="space-y-2">
                          <label className="text-[10px] font-black text-rose-600 uppercase ml-1 flex items-center gap-1.5">
                              <AlertTriangle className="w-3 h-3" /> Nguyên nhân gốc rễ
                          </label>
                          <textarea value={formData.rootCause} onChange={e => setFormData({...formData, rootCause: e.target.value})} className="w-full px-5 py-4 border border-rose-100 rounded-3xl font-bold bg-rose-50/20 text-sm focus:ring-4 focus:ring-rose-100 outline-none resize-none shadow-sm" rows={2} placeholder="Nhập nguyên nhân gốc rễ..."/>
                      </div>
                      <div className="space-y-2">
                          <label className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase ml-1 flex items-center gap-1.5">
                              <SlidersHorizontal className="w-3 h-3" /> Biện pháp khắc phục gợi ý
                          </label>
                          <textarea value={formData.suggestedAction} onChange={e => setFormData({...formData, suggestedAction: e.target.value})} className="w-full px-5 py-4 border border-blue-100 dark:border-slate-700 rounded-3xl font-bold bg-blue-50 dark:bg-slate-800/20 text-sm focus:ring-4 focus:ring-blue-100 outline-none resize-none shadow-sm" rows={2} placeholder="Nhập hướng dẫn xử lý cho QC..."/>
                      </div>
                  </div>

                  <div className="px-4 py-2 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex flex-col-reverse sm:flex-row justify-end gap-2 shrink-0">
                      <button type="button" onClick={() => setIsModalOpen(false)} className="min-h-[44px] sm:min-h-[36px] w-full sm:w-auto px-4 py-2 sm:py-1.5 text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider hover:text-red-600 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-colors rounded-xl whitespace-nowrap shrink-0">Hủy bỏ</button>
                      <button type="button" onClick={handleSave} disabled={isSaving} className="min-h-[44px] sm:min-h-[36px] w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 sm:py-1.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4" />}
                        Lưu vào thư viện
                      </button>
                  </div>
              </div>
          </div>
      )}
      <ConfirmDialog
        open={deleteDefectId !== null}
        variant="danger"
        title="Xóa mã lỗi khỏi thư viện"
        message="Bạn có chắc chắn muốn xóa lỗi này khỏi thư viện chuẩn ISO?"
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        onConfirm={executeDeleteDefect}
        onCancel={() => setDeleteDefectId(null)}
      />
    </div>
  );
};
