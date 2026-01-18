import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DefectLibraryItem, User, Workshop } from '../types';
import { fetchDefectLibrary, saveDefectLibraryItem, deleteDefectLibraryItem, fetchWorkshops, exportDefectLibrary, importDefectLibraryFile } from '../services/apiService';
import { 
    Search, Plus, Edit2, Trash2, ShieldAlert, Hammer, 
    Tag, Filter, Loader2, X, Save, AlertTriangle, 
    Layers, BookOpen, ChevronRight, Hash, ChevronDown,
    Image as ImageIcon, CheckCircle, XCircle, Camera,
    FileUp, FileDown, SlidersHorizontal, Package, LayoutGrid
} from 'lucide-react';

interface DefectLibraryProps {
  currentUser: User;
}

const resizeImage = (base64Str: string, maxWidth = 800): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) { if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; } }
      else { if (height > maxWidth) { width = Math.round((width * maxWidth) / height); height = maxWidth; } }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.fillStyle = 'white'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', 0.7)); }
      else resolve(base64Str);
    };
    img.onerror = () => resolve(base64Str);
  });
};

export const DefectLibrary: React.FC<DefectLibraryProps> = ({ currentUser }) => {
  const [library, setLibrary] = useState<DefectLibraryItem[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DefectLibraryItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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
              suggestedAction: '',
              correctImage: '',
              incorrectImage: ''
          });
      }
      setIsModalOpen(true);
  };

  const handleExport = async () => {
      setIsExporting(true);
      try {
          await exportDefectLibrary();
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
    const reader = new FileReader();
    reader.onload = async () => {
        const resized = await resizeImage(reader.result as string);
        setFormData(prev => ({
            ...prev,
            [type === 'correct' ? 'correctImage' : 'incorrectImage']: resized
        }));
    };
    reader.readAsDataURL(file);
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
              createdAt: editingItem?.createdAt || Math.floor(Date.now() / 1000)
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

  const handleDelete = async (id: string) => {
      if (window.confirm("Xóa lỗi này khỏi thư viện?")) {
          await deleteDefectLibraryItem(id);
          await loadData();
      }
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity?.toUpperCase()) {
        case 'CRITICAL': return 'bg-red-600 text-white border-red-700';
        case 'MAJOR': return 'bg-orange-500 text-white border-orange-600';
        default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".xlsx" className="hidden" />
      
      {/* HEADER TOOLBAR */}
      <div className="bg-white p-4 md:px-6 md:py-4 border-b border-slate-200 shadow-sm shrink-0">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg">
                      <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                      <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Thư viện lỗi ISO</h2>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tiêu chuẩn kỹ thuật AATN</p>
                  </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 flex-1 md:justify-end">
                  <div className="relative group flex-1 md:max-w-xs">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500" />
                      <input 
                        type="text" placeholder="Tìm mã lỗi, tên..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold w-full focus:bg-white outline-none focus:ring-4 focus:ring-blue-100/50 transition-all shadow-inner"
                      />
                  </div>
                  
                  {isQA && (
                      <div className="flex items-center gap-2">
                        <button 
                            onClick={handleExport}
                            disabled={isExporting}
                            className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
                            title="Xuất Excel"
                        >
                            {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileDown className="w-5 h-5" />}
                        </button>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isImporting}
                            className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
                            title="Nhập từ Excel"
                        >
                            {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
                        </button>
                        <button onClick={() => handleOpenModal()} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-200 active:scale-95 transition-all">
                            <Plus className="w-4 h-4" /> Thêm lỗi mới
                        </button>
                      </div>
                  )}
              </div>
          </div>
      </div>

      {/* CONTENT AREA - ACCORDION GROUPING */}
      <div className="flex-1 overflow-auto p-4 md:p-6 no-scrollbar pb-24">
          <div className="max-w-7xl mx-auto space-y-4">
              {isLoading ? (
                  <div className="h-full flex flex-col items-center justify-center py-20 text-slate-400">
                      <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
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
                          <div key={stage} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden transition-all">
                              {/* Stage Header */}
                              <div 
                                  onClick={() => toggleStage(stage)}
                                  className={`p-5 flex items-center justify-between cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50 border-b border-blue-100' : 'hover:bg-slate-50'}`}
                              >
                                  <div className="flex items-center gap-4">
                                      <div className={`p-3 rounded-2xl ${isExpanded ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                          <LayoutGrid className="w-5 h-5" />
                                      </div>
                                      <div>
                                          <h3 className="font-black text-sm uppercase tracking-wider text-slate-800">{stage}</h3>
                                          {/* Fix: explicit typing ensures items.length is accessible */}
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tiêu chuẩn ISO • {items.length} lỗi ghi nhận</p>
                                      </div>
                                  </div>
                                  <ChevronDown className={`w-5 h-5 text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                              </div>

                              {/* Defects Table within stage */}
                              {isExpanded && (
                                  <div className="overflow-x-auto bg-white animate-in slide-in-from-top-2 duration-300">
                                      <table className="w-full text-left border-collapse min-w-[800px]">
                                          <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500 font-black uppercase tracking-widest text-[9px]">
                                              <tr>
                                                  <th className="px-8 py-4 w-64">Mã & Tên Lỗi</th>
                                                  <th className="px-6 py-4 w-44">Phân loại</th>
                                                  <th className="px-6 py-4">Mô tả chi tiết</th>
                                                  <th className="px-8 py-4 w-28 text-right">Thao tác</th>
                                              </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-50">
                                              {/* Fix: explicit typing ensures items.map is accessible */}
                                              {items.map((item) => (
                                                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                                                      <td className="px-8 py-5">
                                                          <div className="flex items-center gap-4">
                                                              <div className="p-2.5 bg-slate-100 text-slate-500 rounded-xl group-hover:bg-blue-50 group-hover:text-blue-600 transition-all border border-slate-200">
                                                                  <Tag className="w-4 h-4" />
                                                              </div>
                                                              <div>
                                                                  <span className="font-black text-slate-900 text-[11px] block uppercase tracking-tighter">{item.code}</span>
                                                                  <span className="text-[10px] font-bold text-slate-500 uppercase truncate max-w-[180px] block">{item.name || '---'}</span>
                                                              </div>
                                                          </div>
                                                      </td>
                                                      <td className="px-6 py-5">
                                                          <div className="flex flex-col gap-1.5">
                                                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{item.category}</span>
                                                              <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase w-fit border shadow-sm ${getSeverityStyle(item.severity)}`}>
                                                                  {item.severity}
                                                              </span>
                                                          </div>
                                                      </td>
                                                      <td className="px-6 py-5">
                                                          <p className="text-xs font-bold text-slate-700 leading-relaxed italic line-clamp-2">"{item.description}"</p>
                                                          {item.suggestedAction && (
                                                              <div className="mt-2 flex items-center gap-1.5 text-[9px] font-black text-blue-600 uppercase tracking-tighter">
                                                                  <SlidersHorizontal className="w-3 h-3" /> Fix: {item.suggestedAction}
                                                              </div>
                                                          )}
                                                      </td>
                                                      <td className="px-8 py-5 text-right">
                                                          {isQA ? (
                                                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                  <button onClick={() => handleOpenModal(item)} className="p-2 text-blue-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-blue-100 transition-all"><Edit2 className="w-4 h-4"/></button>
                                                                  <button onClick={() => handleDelete(item.id)} className="p-2 text-red-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-red-100 transition-all"><Trash2 className="w-4 h-4"/></button>
                                                              </div>
                                                          ) : (
                                                              <ChevronRight className="w-4 h-4 text-slate-300 ml-auto" />
                                                          )}
                                                      </td>
                                                  </tr>
                                              ))}
                                          </tbody>
                                      </table>
                                  </div>
                              )}
                          </div>
                      );
                  })
              )}
          </div>
      </div>

      {/* CRUD MODAL */}
      {isModalOpen && (
          <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white">
                      <div className="flex items-center gap-4">
                          <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-100">
                              <Hammer className="w-6 h-6" />
                          </div>
                          <h3 className="font-black text-slate-900 uppercase tracking-tighter text-xl">
                              {editingItem ? 'Chỉnh sửa lỗi chuẩn' : 'Thêm mới lỗi chuẩn'}
                          </h3>
                      </div>
                      <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-7 h-7 text-slate-300"/></button>
                  </div>
                  
                  <div className="p-8 space-y-6 overflow-y-auto max-h-[75vh] no-scrollbar bg-slate-50/30">
                      <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mã Lỗi Hệ Thống</label>
                              <input 
                                value={formData.code} 
                                readOnly 
                                className="w-full px-5 py-3.5 border rounded-2xl font-black uppercase bg-slate-100 text-slate-400 cursor-not-allowed shadow-inner" 
                                placeholder="Tự động sinh mã..."
                              />
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên lỗi tóm tắt *</label>
                              <input 
                                value={formData.name} 
                                onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})}
                                className="w-full px-5 py-3.5 border border-slate-200 rounded-2xl font-black text-slate-800 focus:ring-4 focus:ring-blue-100 outline-none uppercase shadow-sm" 
                                placeholder="VD: TRẦY XƯỚC BỀ MẶT"
                              />
                          </div>
                      </div>

                      <div className="grid grid-cols-3 gap-6">
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Công đoạn áp dụng *</label>
                              <div className="relative">
                                  <select 
                                    value={formData.stage} 
                                    onChange={e => setFormData({...formData, stage: e.target.value})} 
                                    className="w-full px-5 py-3.5 border border-slate-200 rounded-2xl font-bold appearance-none bg-white outline-none focus:ring-4 focus:ring-blue-100 transition-all text-xs shadow-sm"
                                  >
                                      <option value="" disabled>Chọn stage</option>
                                      {availableStages.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                              </div>
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phân loại kỹ thuật</label>
                              <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-5 py-3.5 border border-slate-200 rounded-2xl font-bold text-xs bg-white shadow-sm outline-none focus:ring-4 focus:ring-blue-100">
                                  <option value="Ngoại quan">Ngoại quan</option>
                                  <option value="Kết cấu">Kết cấu</option>
                                  <option value="Kích thước">Kích thước</option>
                                  <option value="Phụ kiện">Phụ kiện</option>
                              </select>
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mức độ nghiêm trọng</label>
                              <select value={formData.severity} onChange={e => setFormData({...formData, severity: e.target.value as any})} className="w-full px-5 py-3.5 border border-slate-200 rounded-2xl font-bold text-xs bg-white shadow-sm outline-none focus:ring-4 focus:ring-blue-100">
                                  <option value="MINOR">MINOR (Nhẹ)</option>
                                  <option value="MAJOR">MAJOR (Nặng)</option>
                                  <option value="CRITICAL">CRITICAL (Nghiêm trọng)</option>
                              </select>
                          </div>
                      </div>

                      <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mô tả chi tiết lỗi ISO *</label>
                          <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-5 py-4 border border-slate-200 rounded-3xl font-bold text-sm focus:ring-4 focus:ring-blue-100 outline-none resize-none shadow-inner" rows={3} placeholder="Nhập mô tả chuẩn để QC tra cứu..."/>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-3">
                              <label className="text-[10px] font-black text-green-600 uppercase flex items-center gap-1.5 ml-1"><CheckCircle className="w-3 h-3" /> Hình ảnh chuẩn (ĐÚNG)</label>
                              <div 
                                onClick={() => correctImgRef.current?.click()}
                                className="aspect-video bg-green-50/50 border-2 border-dashed border-green-200 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-green-100/50 transition-all overflow-hidden relative group shadow-sm"
                              >
                                  {formData.correctImage ? (
                                      <img src={formData.correctImage} className="w-full h-full object-cover" />
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
                              <label className="text-[10px] font-black text-red-600 uppercase flex items-center gap-1.5 ml-1"><XCircle className="w-3 h-3" /> Hình ảnh lỗi (SAI)</label>
                              <div 
                                onClick={() => incorrectImgRef.current?.click()}
                                className="aspect-video bg-red-50/50 border-2 border-dashed border-red-200 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-red-100/50 transition-all overflow-hidden relative group shadow-sm"
                              >
                                  {formData.incorrectImage ? (
                                      <img src={formData.incorrectImage} className="w-full h-full object-cover" />
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
                          <label className="text-[10px] font-black text-blue-600 uppercase ml-1 flex items-center gap-1.5">
                              <SlidersHorizontal className="w-3 h-3" /> Biện pháp khắc phục gợi ý
                          </label>
                          <textarea value={formData.suggestedAction} onChange={e => setFormData({...formData, suggestedAction: e.target.value})} className="w-full px-5 py-4 border border-blue-100 rounded-3xl font-bold bg-blue-50/20 text-sm focus:ring-4 focus:ring-blue-100 outline-none resize-none shadow-sm" rows={2} placeholder="Nhập hướng dẫn xử lý cho QC..."/>
                      </div>
                  </div>

                  <div className="p-8 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.04)]">
                      <button onClick={() => setIsModalOpen(false)} className="px-10 py-4 text-xs font-black uppercase text-slate-400 tracking-widest hover:text-red-600 transition-colors">Hủy bỏ</button>
                      <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white px-16 py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5" />}
                        Lưu vào thư viện
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
