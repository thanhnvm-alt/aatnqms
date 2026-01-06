
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DefectLibraryItem, User, Workshop } from '../types';
import { fetchDefectLibrary, saveDefectLibraryItem, deleteDefectLibraryItem, fetchWorkshops, fetchDefectUsageHistory } from '../services/apiService';
import { 
    Search, Plus, Edit2, Trash2, ShieldAlert, Hammer, 
    Tag, Filter, Loader2, X, Save, AlertTriangle, 
    // Added AlertCircle to fix 'Cannot find name AlertCircle' error
    AlertCircle, Layers, BookOpen, ChevronRight, Hash, ChevronDown,
    Image as ImageIcon, CheckCircle, XCircle, Camera, Clock,
    BarChart3, FileText, ArrowUpRight
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
  const [library, setLibrary] = useState<(DefectLibraryItem & { occurrenceCount?: number })[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DefectLibraryItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // History state
  const [historyItem, setHistoryItem] = useState<(DefectLibraryItem & { occurrenceCount?: number }) | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const correctImgRef = useRef<HTMLInputElement>(null);
  const incorrectImgRef = useRef<HTMLInputElement>(null);

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

  const loadHistory = async (item: DefectLibraryItem & { occurrenceCount?: number }) => {
      setHistoryItem(item);
      setIsLoadingHistory(true);
      try {
          const history = await fetchDefectUsageHistory(item.code);
          setHistoryData(history);
      } catch (err) {
          console.error("Load history failed:", err);
      } finally {
          setIsLoadingHistory(false);
      }
  };

  const availableStages = useMemo(() => {
      const allStages = workshops.flatMap(ws => ws.stages || []);
      const unique = Array.from(new Set(allStages)).filter(Boolean);
      return unique.sort();
  }, [workshops]);

  const filteredLibrary = useMemo(() => {
    const term = (searchTerm || '').toLowerCase().trim();
    return library.filter(item => {
        const matchesSearch = !term || 
            item.code.toLowerCase().includes(term) || 
            (item.name && item.name.toLowerCase().includes(term)) ||
            item.description.toLowerCase().includes(term);
        const matchesStage = stageFilter === 'ALL' || item.stage === stageFilter;
        return matchesSearch && matchesStage;
    });
  }, [library, searchTerm, stageFilter]);

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
              stage: availableStages[0] || '',
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
      <div className="bg-white p-4 md:p-6 border-b border-slate-200 shadow-sm shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                  <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                      <BookOpen className="w-8 h-8 text-blue-600" />
                      THƯ VIỆN LỖI (DEFECT LIBRARY)
                  </h1>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Danh mục sai lỗi kỹ thuật chuẩn hóa</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                  <div className="relative group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500" />
                      <input 
                        type="text" placeholder="Tìm mã lỗi, tên, mô tả..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium w-full md:w-80 focus:bg-white outline-none transition-all shadow-inner"
                      />
                  </div>
                  <select 
                    value={stageFilter}
                    onChange={e => setStageFilter(e.target.value)}
                    className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase outline-none cursor-pointer shadow-sm"
                  >
                      <option value="ALL">Tất cả công đoạn</option>
                      {availableStages.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {isQA && (
                      <button onClick={() => handleOpenModal()} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg active:scale-95 transition-all">
                          <Plus className="w-4 h-4" /> Thêm lỗi chuẩn
                      </button>
                  )}
              </div>
          </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 no-scrollbar">
          {isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
                  <p className="font-black uppercase tracking-widest text-xs">Đang truy xuất thư viện lỗi...</p>
              </div>
          ) : filteredLibrary.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300">
                  <BookOpen className="w-24 h-24 opacity-10 mb-4 text-blue-500" />
                  <p className="font-black uppercase tracking-[0.3em] text-sm">Thư viện lỗi còn trống</p>
              </div>
          ) : (
              <div className="max-w-7xl mx-auto bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[1000px]">
                          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-black uppercase tracking-widest text-[10px]">
                              <tr>
                                  <th className="px-6 py-4 w-64">Mã & Tên Lỗi</th>
                                  <th className="px-6 py-4 w-44">Thông tin gộp</th>
                                  <th className="px-6 py-4">Mô tả lỗi</th>
                                  <th className="px-6 py-4 w-24 text-center">Tần suất</th>
                                  <th className="px-6 py-4 w-28 text-center">Thao tác</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {filteredLibrary.map((item) => (
                                  <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-3">
                                              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-all">
                                                  <Tag className="w-4 h-4" />
                                              </div>
                                              <div>
                                                  <span className="font-black text-slate-900 text-xs tracking-tight block">{item.code}</span>
                                                  <span className="text-[11px] font-bold text-slate-600 uppercase">{item.name || '---'}</span>
                                              </div>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="space-y-1">
                                              <span className="block px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[8px] font-black uppercase w-fit">{item.stage}</span>
                                              <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-slate-400">{item.category}</span>
                                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${getSeverityStyle(item.severity)}`}>{item.severity}</span>
                                              </div>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <p className="text-sm font-bold text-slate-700 leading-snug">{item.description}</p>
                                          {item.suggestedAction && <p className="text-[10px] text-blue-600 font-medium mt-1 uppercase italic">Gợi ý xử lý: {item.suggestedAction}</p>}
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <button 
                                            onClick={() => loadHistory(item)}
                                            className={`px-3 py-1.5 rounded-xl font-black text-[10px] transition-all hover:scale-105 active:scale-95 ${item.occurrenceCount && item.occurrenceCount > 0 ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-slate-50 text-slate-300 border border-slate-100'}`}
                                          >
                                              {item.occurrenceCount || 0} lần
                                          </button>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          {isQA ? (
                                              <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                  <button onClick={() => handleOpenModal(item)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg"><Edit2 className="w-4 h-4"/></button>
                                                  <button onClick={() => handleDelete(item.id)} className="p-2 text-red-600 hover:bg-red-100 rounded-lg"><Trash2 className="w-4 h-4"/></button>
                                              </div>
                                          ) : (
                                              <ChevronRight className="w-4 h-4 text-slate-300 mx-auto" />
                                          )}
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}
      </div>

      {/* History Modal */}
      {historyItem && (
          <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in zoom-in duration-300">
                  <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-4">
                          <div className="p-3 bg-blue-600 rounded-2xl">
                              <BarChart3 className="w-6 h-6" />
                          </div>
                          <div>
                              <h3 className="font-black text-xl uppercase tracking-tighter">Lịch sử ghi nhận lỗi</h3>
                              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">{historyItem.code} — {historyItem.name}</p>
                          </div>
                      </div>
                      <button onClick={() => setHistoryItem(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-8 h-8" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-8 no-scrollbar bg-slate-50">
                      {isLoadingHistory ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400">
                              <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                              <p className="font-black uppercase tracking-widest text-xs">Đang lấy lịch sử...</p>
                          </div>
                      ) : historyData.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                              <Clock className="w-20 h-20 opacity-10" />
                              <p className="font-black text-xs uppercase tracking-widest">Chưa có dữ liệu thực tế nào được liên kết</p>
                          </div>
                      ) : (
                          <div className="space-y-4">
                              {historyData.map((h, idx) => (
                                  <div key={idx} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                                      <div className="flex items-start gap-4">
                                          <div className="p-3 bg-red-50 text-red-600 rounded-2xl border border-red-100 shadow-sm shrink-0">
                                              <AlertCircle className="w-6 h-6" />
                                          </div>
                                          <div className="overflow-hidden">
                                              <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[9px] font-black bg-slate-900 text-white px-2 py-0.5 rounded uppercase tracking-widest">{h.ma_ct}</span>
                                                <span className="text-[10px] font-bold text-slate-400 truncate">{h.ten_ct}</span>
                                              </div>
                                              <h4 className="text-sm font-black text-slate-800 line-clamp-1 italic">"{h.description}"</h4>
                                              <div className="flex items-center gap-3 mt-2">
                                                  <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3"/> {h.date}</span>
                                                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${h.status === 'CLOSED' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{h.status}</span>
                                              </div>
                                          </div>
                                      </div>
                                      <button className="flex items-center gap-2 px-5 py-2.5 bg-blue-50 text-blue-600 rounded-2xl text-[10px] font-black uppercase border border-blue-100 hover:bg-blue-600 hover:text-white transition-all active:scale-95 group">
                                          <FileText className="w-4 h-4" />
                                          Xem phiếu gốc
                                          <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </button>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
                  <div className="p-6 bg-white border-t border-slate-100 flex justify-center shrink-0">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Hệ thống truy vết sai lỗi kỹ thuật AATN</p>
                  </div>
              </div>
          </div>
      )}

      {/* CRUD Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="px-6 py-4 bg-blue-600 text-white flex justify-between items-center">
                      <h3 className="font-black uppercase tracking-tight">{editingItem ? 'Chỉnh sửa lỗi chuẩn' : 'Thêm mới lỗi vào thư viện'}</h3>
                      <button onClick={() => setIsModalOpen(false)}><X className="w-6 h-6"/></button>
                  </div>
                  <div className="p-6 space-y-5 overflow-y-auto max-h-[80vh] no-scrollbar">
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Mã Lỗi *</label>
                              <input 
                                value={formData.code} 
                                onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
                                className="w-full px-4 py-2.5 border rounded-xl font-black uppercase bg-slate-50 text-slate-800 outline-none focus:ring-2 focus:ring-blue-100" 
                                placeholder="Nhập mã lỗi chuẩn..."
                              />
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Tên lỗi *</label>
                              <input 
                                value={formData.name} 
                                onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})}
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-blue-100 outline-none uppercase" 
                                placeholder="VD: TRẦY XƯỚC BỀ MẶT..."
                              />
                          </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Công đoạn *</label>
                              <div className="relative">
                                  <select 
                                    value={formData.stage} 
                                    onChange={e => setFormData({...formData, stage: e.target.value})} 
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl font-bold appearance-none bg-white outline-none focus:ring-2 focus:ring-blue-100 transition-all text-xs"
                                  >
                                      <option value="" disabled>Chọn công đoạn</option>
                                      {availableStages.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                              </div>
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Phân loại</label>
                              <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl font-bold text-xs">
                                  <option value="Ngoại quan">Ngoại quan</option>
                                  <option value="Kết cấu">Kết cấu</option>
                                  <option value="Kích thước">Kích thước</option>
                                  <option value="Phụ kiện">Phụ kiện</option>
                              </select>
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Mức độ</label>
                              <select value={formData.severity} onChange={e => setFormData({...formData, severity: e.target.value as any})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl font-bold text-xs">
                                  <option value="MINOR">MINOR</option>
                                  <option value="MAJOR">MAJOR</option>
                                  <option value="CRITICAL">CRITICAL</option>
                              </select>
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Mô tả chi tiết *</label>
                          <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl font-medium text-sm focus:ring-2 focus:ring-blue-100 outline-none resize-none" rows={2} placeholder="Nhập mô tả lỗi..."/>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-green-600 uppercase flex items-center gap-1.5"><CheckCircle className="w-3 h-3" /> Hình ảnh chuẩn (ĐÚNG)</label>
                              <div 
                                onClick={() => correctImgRef.current?.click()}
                                className="aspect-video bg-green-50 border-2 border-dashed border-green-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-green-100 transition-all overflow-hidden relative group shadow-inner"
                              >
                                  {formData.correctImage ? (
                                      <img src={formData.correctImage} className="w-full h-full object-cover" />
                                  ) : (
                                      <div className="flex flex-col items-center text-green-300">
                                          <Camera className="w-8 h-8" />
                                          <span className="text-[8px] font-black mt-1">BẤM TẢI LÊN</span>
                                      </div>
                                  )}
                                  <input type="file" ref={correctImgRef} className="hidden" accept="image/*" onChange={e => handleImageUpload(e, 'correct')} />
                              </div>
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-red-600 uppercase flex items-center gap-1.5"><XCircle className="w-3 h-3" /> Hình ảnh sai (LỖI)</label>
                              <div 
                                onClick={() => incorrectImgRef.current?.click()}
                                className="aspect-video bg-red-50 border-2 border-dashed border-red-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-red-100 transition-all overflow-hidden relative group shadow-inner"
                              >
                                  {formData.incorrectImage ? (
                                      <img src={formData.incorrectImage} className="w-full h-full object-cover" />
                                  ) : (
                                      <div className="flex flex-col items-center text-red-300">
                                          <Camera className="w-8 h-8" />
                                          <span className="text-[8px] font-black mt-1">BẤM TẢI LÊN</span>
                                      </div>
                                  )}
                                  <input type="file" ref={incorrectImgRef} className="hidden" accept="image/*" onChange={e => handleImageUpload(e, 'incorrect')} />
                              </div>
                          </div>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Biện pháp khắc phục gợi ý</label>
                          <textarea value={formData.suggestedAction} onChange={e => setFormData({...formData, suggestedAction: e.target.value})} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl font-medium bg-blue-50/30 text-sm focus:ring-2 focus:ring-blue-100 outline-none resize-none" rows={2} placeholder="Nhập biện pháp xử lý chuẩn..."/>
                      </div>
                  </div>

                  <div className="p-4 border-t bg-slate-50 flex justify-end gap-3 shrink-0">
                      <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-xs font-black uppercase text-slate-500">Hủy</button>
                      <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase shadow-lg active:scale-95 transition-all flex items-center gap-2">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4" />}
                        Lưu vào thư viện
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
