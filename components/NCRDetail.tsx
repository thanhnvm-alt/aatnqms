
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { NCR, User, DefectLibraryItem } from '../types';
import { 
    ArrowLeft, Calendar, User as UserIcon, AlertTriangle, 
    CheckCircle2, Clock, MessageSquare, Camera, Paperclip, 
    Send, Loader2, BrainCircuit, Maximize2, Plus, 
    X, FileText, Image as ImageIcon, Save, Sparkles, BookOpen,
    ChevronDown, Filter, RefreshCw
} from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';
import { fetchDefectLibrary, saveNcrMapped } from '../services/apiService';
import { generateNCRSuggestions } from '../services/geminiService';

interface NCRDetailProps {
  ncr: NCR;
  user: User;
  onBack: () => void;
  onViewInspection: (id: string) => void;
  onUpdate?: () => void;
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

export const NCRDetail: React.FC<NCRDetailProps> = ({ ncr: initialNcr, user, onBack, onViewInspection, onUpdate }) => {
  const [ncr, setNcr] = useState<NCR>(initialNcr);
  const [formData, setFormData] = useState<NCR>(initialNcr);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // Comment State
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  
  // Library State
  const [library, setLibrary] = useState<DefectLibraryItem[]>([]);
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [showLibrary, setShowLibrary] = useState(false);

  // UI State
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);

  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);
  const beforeFileRef = useRef<HTMLInputElement>(null);
  const beforeCameraRef = useRef<HTMLInputElement>(null);
  const afterFileRef = useRef<HTMLInputElement>(null);
  const afterCameraRef = useRef<HTMLInputElement>(null);

  const isLocked = ncr.status === 'CLOSED';

  // Load Defect Library
  useEffect(() => {
      const loadLib = async () => {
          try {
              const data = await fetchDefectLibrary();
              setLibrary(data);
          } catch (e) {
              console.error("Failed to load defect library", e);
          }
      };
      loadLib();
  }, []);

  const stages = useMemo(() => {
      const unique = new Set(library.map(item => item.stage || 'Chung'));
      return Array.from(unique).sort();
  }, [library]);

  const filteredDefects = useMemo(() => {
      if (!selectedStage) return library;
      return library.filter(item => item.stage === selectedStage);
  }, [library, selectedStage]);

  // Sync formData when initialNcr changes
  useEffect(() => {
      setNcr(initialNcr);
      setFormData(initialNcr);
  }, [initialNcr]);

  const handleApplyDefect = (defect: DefectLibraryItem) => {
      if (window.confirm("Áp dụng thông tin lỗi này? Mô tả và mức độ sẽ được cập nhật.")) {
          setFormData(prev => ({
              ...prev,
              issueDescription: defect.description,
              defect_code: defect.code,
              severity: defect.severity as any,
              solution: defect.suggestedAction || prev.solution
          }));
          setIsEditing(true); // Auto enable edit mode to show changes
          setShowLibrary(false);
      }
  };

  const handleRunAI = async () => {
      if (!formData.issueDescription) return;
      setIsAiLoading(true);
      try {
          const result = await generateNCRSuggestions(formData.issueDescription, 'General');
          setFormData(prev => ({
              ...prev,
              rootCause: result.rootCause,
              solution: result.solution
          }));
          setIsEditing(true); // Switch to edit mode to review AI results
      } catch (error) {
          alert("Lỗi khi gọi AI. Vui lòng thử lại.");
      } finally {
          setIsAiLoading(false);
      }
  };

  const handleSaveChanges = async () => {
      setIsSaving(true);
      try {
          await saveNcrMapped(formData.inspection_id || '', formData, user.name);
          setNcr(formData);
          setIsEditing(false);
          if (onUpdate) onUpdate();
          alert("Đã lưu cập nhật NCR thành công!");
      } catch (error) {
          console.error(error);
          alert("Lỗi khi lưu NCR.");
      } finally {
          setIsSaving(false);
      }
  };

  const handleAddImage = async (e: React.ChangeEvent<HTMLInputElement>, type: 'BEFORE' | 'AFTER') => {
      const files = e.target.files;
      if (!files) return;
      
      const processed = await Promise.all(Array.from(files).map(async (f: File) => {
          const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(f);
          });
          return resizeImage(base64);
      }));

      setFormData(prev => {
          const field = type === 'BEFORE' ? 'imagesBefore' : 'imagesAfter';
          return { ...prev, [field]: [...(prev[field] || []), ...processed] };
      });
      setIsEditing(true); // Mark as dirty
      e.target.value = '';
  };

  const removeImage = (index: number, type: 'BEFORE' | 'AFTER') => {
      if (!isEditing && isLocked) return;
      if (window.confirm("Xóa ảnh này?")) {
          setFormData(prev => {
              const field = type === 'BEFORE' ? 'imagesBefore' : 'imagesAfter';
              const currentList = prev[field] || [];
              return { ...prev, [field]: currentList.filter((_, i) => i !== index) };
          });
          setIsEditing(true);
      }
  };

  const handlePostComment = async () => {
      if (!newComment.trim() && commentAttachments.length === 0) return;
      setIsSubmitting(true);
      
      // Simulate comment structure since we don't have a separate comment table in this scope
      const newCommentObj = {
          id: Date.now().toString(),
          userId: user.id,
          userName: user.name,
          userAvatar: user.avatar,
          content: newComment,
          createdAt: new Date().toISOString(),
          attachments: commentAttachments
      };

      const updatedComments = [...(formData.comments || []), newCommentObj];
      const updatedNcr = { ...formData, comments: updatedComments };

      try {
          await saveNcrMapped(ncr.inspection_id || '', updatedNcr, user.name);
          setFormData(updatedNcr);
          setNcr(updatedNcr); // Update view state immediately
          setNewComment('');
          setCommentAttachments([]);
      } catch (e) {
          alert("Lỗi khi gửi bình luận.");
      } finally {
          setIsSubmitting(false);
      }
  };

  const openGallery = (images: string[], index: number) => {
      setLightboxState({ images, index });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="flex items-center gap-1.5 text-slate-600 font-bold text-xs px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors active:scale-95">
                  <ArrowLeft className="w-4 h-4"/>
              </button>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:inline">Chi tiết NCR</span>
          </div>
          <div className="flex gap-2">
              {isEditing ? (
                  <>
                    <button onClick={() => { setFormData(ncr); setIsEditing(false); }} className="px-3 py-1.5 text-slate-500 font-bold text-[10px] hover:bg-slate-100 rounded-lg">Hủy</button>
                    <button onClick={handleSaveChanges} disabled={isSaving} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1.5 shadow-lg active:scale-95">
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin"/> : <Save className="w-3 h-3"/>} Lưu
                    </button>
                  </>
              ) : (
                  !isLocked && (
                      <button onClick={() => setIsEditing(true)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1.5 shadow-lg active:scale-95">
                          <AlertTriangle className="w-3 h-3"/> Review / Sửa
                      </button>
                  )
              )}
              <button onClick={() => onViewInspection(ncr.inspection_id || '')} className="text-blue-600 bg-blue-50 px-2 py-1.5 rounded-lg hover:bg-blue-100 active:scale-95">
                  <FileText className="w-4 h-4"/>
              </button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-24">
        <div className="max-w-5xl mx-auto space-y-4">
            
            {/* Header Status Card */}
            <div className={`rounded-xl p-4 border shadow-sm relative overflow-hidden transition-colors ${
                formData.status === 'CLOSED' ? 'bg-green-50 border-green-100' : 'bg-white border-slate-200'
            }`}>
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="bg-slate-900 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">NCR: {formData.id}</span>
                            
                            {isEditing ? (
                                <select 
                                    value={formData.severity}
                                    onChange={e => setFormData({...formData, severity: e.target.value as any})}
                                    className="px-2 py-0.5 rounded text-[9px] font-bold uppercase border tracking-widest bg-white outline-none focus:ring-1 ring-blue-500"
                                >
                                    <option value="MINOR">MINOR</option>
                                    <option value="MAJOR">MAJOR</option>
                                    <option value="CRITICAL">CRITICAL</option>
                                </select>
                            ) : (
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border tracking-widest ${
                                    formData.severity === 'CRITICAL' ? 'bg-red-600 text-white border-red-600' :
                                    formData.severity === 'MAJOR' ? 'bg-orange-500 text-white border-orange-500' :
                                    'bg-blue-50 text-blue-600 border-blue-100'
                                }`}>{formData.severity}</span>
                            )}

                            {isEditing ? (
                                <select 
                                    value={formData.status}
                                    onChange={e => setFormData({...formData, status: e.target.value})}
                                    className="px-2 py-0.5 rounded text-[9px] font-bold uppercase border tracking-widest bg-white outline-none focus:ring-1 ring-blue-500"
                                >
                                    <option value="OPEN">OPEN</option>
                                    <option value="IN_PROGRESS">IN PROGRESS</option>
                                    <option value="CLOSED">CLOSED</option>
                                </select>
                            ) : (
                                <span className="bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">{formData.status}</span>
                            )}
                        </div>

                        <div>
                            {isEditing ? (
                                <textarea 
                                    value={formData.issueDescription}
                                    onChange={e => setFormData({...formData, issueDescription: e.target.value})}
                                    className="w-full text-base font-bold text-slate-800 bg-slate-50 border-b-2 border-blue-500 focus:outline-none resize-none p-2 rounded-t-lg"
                                    rows={2}
                                />
                            ) : (
                                <h1 className="text-base font-bold text-slate-800 uppercase leading-tight tracking-tight">
                                    {formData.issueDescription}
                                </h1>
                            )}
                        </div>

                        {/* Defect Library Selector (Only visible in Edit Mode) */}
                        {isEditing && (
                            <div className="bg-blue-50/50 rounded-lg p-2 border border-blue-100 space-y-2">
                                <div 
                                    className="flex justify-between items-center cursor-pointer" 
                                    onClick={() => setShowLibrary(!showLibrary)}
                                >
                                    <span className="text-[9px] font-bold text-blue-600 uppercase flex items-center gap-1.5">
                                        <BookOpen className="w-3 h-3" /> Chuẩn hóa từ thư viện lỗi
                                    </span>
                                    <ChevronDown className={`w-3 h-3 text-blue-400 transition-transform ${showLibrary ? 'rotate-180' : ''}`} />
                                </div>
                                
                                {showLibrary && (
                                    <div className="animate-in slide-in-from-top-2 pt-2 space-y-2">
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                                <select 
                                                    value={selectedStage} 
                                                    onChange={e => setSelectedStage(e.target.value)}
                                                    className="w-full pl-7 pr-2 py-1 text-[10px] border border-slate-200 rounded-lg outline-none focus:border-blue-400 bg-white"
                                                >
                                                    <option value="">-- Lọc theo công đoạn --</option>
                                                    {stages.map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg bg-white no-scrollbar">
                                            {filteredDefects.map(def => (
                                                <div 
                                                    key={def.id} 
                                                    onClick={() => handleApplyDefect(def)}
                                                    className="p-2 border-b border-slate-50 hover:bg-blue-50 cursor-pointer flex justify-between items-center group"
                                                >
                                                    <div className="flex-1">
                                                        <p className="text-[10px] font-bold text-slate-700">{def.name || def.description}</p>
                                                        <span className="text-[9px] text-slate-400 font-mono">{def.code}</span>
                                                    </div>
                                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                                                        def.severity === 'CRITICAL' ? 'text-red-600 border-red-100 bg-red-50' : 
                                                        'text-slate-500 border-slate-100'
                                                    }`}>{def.severity}</span>
                                                </div>
                                            ))}
                                            {filteredDefects.length === 0 && <div className="p-2 text-center text-[10px] text-slate-400 italic">Không tìm thấy lỗi phù hợp</div>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-4 text-[10px] font-bold text-slate-500 pt-1">
                            <div className="flex items-center gap-1.5">
                                <UserIcon className="w-3.5 h-3.5"/> 
                                {isEditing ? (
                                    <input 
                                        value={formData.responsiblePerson}
                                        onChange={e => setFormData({...formData, responsiblePerson: e.target.value})}
                                        className="bg-slate-50 border-b border-slate-300 px-1 focus:outline-none focus:border-blue-500 w-28"
                                        placeholder="Người phụ trách"
                                    />
                                ) : (
                                    formData.responsiblePerson || 'Chưa phân công'
                                )}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5"/> 
                                {isEditing ? (
                                    <input 
                                        type="date"
                                        value={formData.deadline}
                                        onChange={e => setFormData({...formData, deadline: e.target.value})}
                                        className="bg-slate-50 border-b border-slate-300 px-1 focus:outline-none focus:border-blue-500"
                                    />
                                ) : (
                                    `Deadline: ${formData.deadline || 'ASAP'}`
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="shrink-0 flex flex-col items-center gap-2">
                        {formData.status === 'CLOSED' ? (
                            <div className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-green-200">
                                <CheckCircle2 className="w-6 h-6" />
                            </div>
                        ) : (
                            <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center border-2 border-white shadow-lg animate-pulse">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                        )}
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{formData.status}</span>
                    </div>
                </div>
            </div>

            {/* Analysis Section with AI */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
                <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4 text-purple-600" />
                        <h3 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">Phân tích Kỹ thuật</h3>
                    </div>
                    {isEditing && (
                        <button 
                            onClick={handleRunAI} 
                            disabled={isAiLoading || !formData.issueDescription}
                            className="bg-purple-600 text-white px-2 py-1 rounded text-[9px] font-bold uppercase flex items-center gap-1 shadow-md shadow-purple-200 hover:bg-purple-700 active:scale-95 disabled:opacity-50 transition-all"
                        >
                            {isAiLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin"/> : <Sparkles className="w-2.5 h-2.5" />}
                            AI Phân tích
                        </button>
                    )}
                </div>
                <div className="p-4 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nguyên nhân gốc rễ (Root Cause)</label>
                        {isEditing ? (
                            <textarea 
                                value={formData.rootCause}
                                onChange={e => setFormData({...formData, rootCause: e.target.value})}
                                className="w-full p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] font-medium focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                                rows={2}
                                placeholder="Nhập nguyên nhân..."
                            />
                        ) : (
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-[11px] font-bold text-slate-700 italic leading-relaxed whitespace-pre-wrap">
                                {formData.rootCause || 'Đang chờ phân tích...'}
                            </div>
                        )}
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Biện pháp xử lý (Action Plan)</label>
                        {isEditing ? (
                            <textarea 
                                value={formData.solution}
                                onChange={e => setFormData({...formData, solution: e.target.value})}
                                className="w-full p-3 bg-blue-50 rounded-lg border border-blue-100 text-[11px] font-medium focus:ring-1 focus:ring-blue-500 outline-none resize-none text-blue-900"
                                rows={2}
                                placeholder="Nhập biện pháp khắc phục..."
                            />
                        ) : (
                            <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 text-[11px] font-bold text-blue-900 leading-relaxed whitespace-pre-wrap">
                                {formData.solution || 'Chưa cập nhật biện pháp khắc phục.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Images Grid (Before & After) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Before Images */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-red-50/30">
                        <label className="text-[9px] font-bold text-red-500 uppercase flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5"/> TRƯỚC XỬ LÝ (ISSUE)</label>
                        {isEditing && (
                            <div className="flex gap-1">
                                <button onClick={() => beforeCameraRef.current?.click()} className="p-1 bg-white text-slate-500 hover:text-red-500 rounded border border-slate-200 shadow-sm active:scale-90"><Camera className="w-3.5 h-3.5"/></button>
                                <button onClick={() => beforeFileRef.current?.click()} className="p-1 bg-white text-slate-500 hover:text-red-500 rounded border border-slate-200 shadow-sm active:scale-90"><Plus className="w-3.5 h-3.5"/></button>
                            </div>
                        )}
                    </div>
                    <div className="p-3 grid grid-cols-2 gap-2">
                        {formData.imagesBefore?.map((img, idx) => (
                            <div key={idx} className="aspect-square rounded-lg overflow-hidden border border-slate-100 relative group">
                                <img src={img} className="w-full h-full object-cover" onClick={() => openGallery(formData.imagesBefore!, idx)} />
                                {isEditing && <button onClick={() => removeImage(idx, 'BEFORE')} className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button>}
                            </div>
                        ))}
                        {(!formData.imagesBefore || formData.imagesBefore.length === 0) && <div className="col-span-2 py-6 text-center text-[10px] text-slate-300 font-bold border-2 border-dashed border-slate-100 rounded-lg">Chưa có ảnh lỗi</div>}
                    </div>
                </div>

                {/* After Images */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-green-50/30">
                        <label className="text-[9px] font-bold text-green-600 uppercase flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5"/> SAU XỬ LÝ (FIX)</label>
                        {(!isLocked || isEditing) && (
                            <div className="flex gap-1">
                                <button onClick={() => afterCameraRef.current?.click()} className="p-1 bg-white text-slate-500 hover:text-green-600 rounded border border-slate-200 shadow-sm active:scale-90"><Camera className="w-3.5 h-3.5"/></button>
                                <button onClick={() => afterFileRef.current?.click()} className="p-1 bg-white text-slate-500 hover:text-green-600 rounded border border-slate-200 shadow-sm active:scale-90"><Plus className="w-3.5 h-3.5"/></button>
                            </div>
                        )}
                    </div>
                    <div className="p-3 grid grid-cols-2 gap-2">
                        {formData.imagesAfter?.map((img, idx) => (
                            <div key={idx} className="aspect-square rounded-lg overflow-hidden border border-slate-100 relative group">
                                <img src={img} className="w-full h-full object-cover" onClick={() => openGallery(formData.imagesAfter!, idx)} />
                                {(!isLocked || isEditing) && <button onClick={() => removeImage(idx, 'AFTER')} className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button>}
                            </div>
                        ))}
                        {(!formData.imagesAfter || formData.imagesAfter.length === 0) && <div className="col-span-2 py-6 text-center text-[10px] text-slate-300 font-bold border-2 border-dashed border-slate-100 rounded-lg">Chưa có ảnh khắc phục</div>}
                    </div>
                </div>
            </div>

            {/* Discussions */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    <h3 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">Thảo luận & Theo dõi xử lý</h3>
                </div>
                <div className="p-4 space-y-4">
                    {formData.comments?.map((comment) => (
                        <div key={comment.id} className="flex gap-3">
                            <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="w-8 h-8 rounded-lg border border-slate-200 shrink-0" alt="" />
                            <div className="flex-1 space-y-1">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-slate-800 text-[10px] uppercase">{comment.userName}</span>
                                    <span className="text-[9px] font-bold text-slate-400">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                                </div>
                                <div className="bg-slate-50 p-2.5 rounded-lg rounded-tl-none border border-slate-100 shadow-sm text-[11px] text-slate-700 font-medium whitespace-pre-wrap">{comment.content}</div>
                                {comment.attachments && comment.attachments.length > 0 && (
                                    <div className="flex gap-2 pt-1">
                                        {comment.attachments.map((att, idx) => (
                                            <img key={idx} src={att} onClick={() => openGallery(comment.attachments!, idx)} className="w-12 h-12 object-cover rounded-lg border border-slate-200 cursor-zoom-in" />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {(!formData.comments || formData.comments.length === 0) && <p className="text-center text-[10px] text-slate-400 py-4 italic font-medium">Chưa có bình luận trao đổi cho phiếu này.</p>}
                </div>

                <div className="p-3 border-t border-slate-100 bg-slate-50">
                    <div className="flex items-start gap-3">
                        <div className="flex-1 relative">
                            <textarea 
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Nhập bình luận hoặc cập nhật tiến độ..."
                                className="w-full pl-3 pr-20 py-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-medium focus:ring-1 focus:ring-blue-500 outline-none resize-none shadow-sm"
                                rows={2}
                            />
                            <div className="absolute right-2 bottom-2 flex items-center gap-1">
                                <button onClick={() => commentCameraRef.current?.click()} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg active:scale-90 transition-all"><Camera className="w-3.5 h-3.5" /></button>
                                <button onClick={() => commentFileRef.current?.click()} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg active:scale-90 transition-all"><Paperclip className="w-3.5 h-3.5" /></button>
                                <button 
                                    onClick={handlePostComment}
                                    disabled={isSubmitting || (!newComment.trim() && commentAttachments.length === 0)}
                                    className="p-1.5 bg-blue-600 text-white rounded-lg shadow-sm active:scale-95 disabled:opacity-50 transition-all"
                                >
                                    {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Send className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
      </div>

      {lightboxState && <ImageEditorModal images={lightboxState.images} initialIndex={lightboxState.index} onClose={() => setLightboxState(null)} readOnly={true} />}
      
      <input type="file" ref={beforeFileRef} className="hidden" multiple accept="image/*" onChange={(e) => handleAddImage(e, 'BEFORE')} />
      <input type="file" ref={beforeCameraRef} className="hidden" capture="environment" accept="image/*" onChange={(e) => handleAddImage(e, 'BEFORE')} />
      
      <input type="file" ref={afterFileRef} className="hidden" multiple accept="image/*" onChange={(e) => handleAddImage(e, 'AFTER')} />
      <input type="file" ref={afterCameraRef} className="hidden" capture="environment" accept="image/*" onChange={(e) => handleAddImage(e, 'AFTER')} />

      <input type="file" ref={commentFileRef} className="hidden" multiple accept="image/*" onChange={async (e) => {
           const files = e.target.files; if(!files) return;
           const processed = await Promise.all(Array.from(files).map(async (f: File) => await resizeImage(await new Promise<string>(res => {const r=new FileReader(); r.onload=()=>res(r.result as string); r.readAsDataURL(f);}))));
           setCommentAttachments(prev => [...prev, ...processed]);
      }} />
      <input type="file" ref={commentCameraRef} className="hidden" capture="environment" accept="image/*" onChange={async (e) => {
           const files = e.target.files; if(!files) return;
           const processed = await Promise.all(Array.from(files).map(async (f: File) => await resizeImage(await new Promise<string>(res => {const r=new FileReader(); r.onload=()=>res(r.result as string); r.readAsDataURL(f);}))));
           setCommentAttachments(prev => [...prev, ...processed]);
      }} />
    </div>
  );
};
