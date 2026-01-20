
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { NCR, User, DefectLibraryItem, NCRComment } from '../types';
import { 
    ArrowLeft, Calendar, User as UserIcon, AlertTriangle, 
    CheckCircle2, Clock, MessageSquare, Camera, Paperclip, 
    Send, Loader2, BrainCircuit, Maximize2, Plus, 
    X, FileText, Image as ImageIcon, Save, Sparkles, BookOpen,
    ChevronDown, Filter, RefreshCw, ShieldCheck, PenTool, AlertOctagon,
    Edit3, Search
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
  
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  
  const [library, setLibrary] = useState<DefectLibraryItem[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);

  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number; context?: string } | null>(null);

  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);
  const beforeFileRef = useRef<HTMLInputElement>(null);
  const beforeCameraRef = useRef<HTMLInputElement>(null);
  const afterFileRef = useRef<HTMLInputElement>(null);
  const afterCameraRef = useRef<HTMLInputElement>(null);

  // --- ISO RBAC (CRITICAL) ---
  const isAdmin = user.role === 'ADMIN';
  const isManager = user.role === 'MANAGER';
  const isQA = user.role === 'QA';
  const isOwner = ncr.createdBy === user.name;
  
  // Logic 2: Trạng thái CLOSED sẽ khóa toàn bộ phiếu, không liên quan đến phê duyệt detailPQC
  const isClosed = formData.status === 'CLOSED';
  const isLocked = isClosed;

  const canApprove = (isAdmin || isManager || isQA) && !isClosed;
  const canModify = (isAdmin || isManager || isOwner) && !isClosed;

  useEffect(() => {
      fetchDefectLibrary().then(setLibrary);
  }, []);

  useEffect(() => {
      setNcr(initialNcr);
      setFormData(initialNcr);
  }, [initialNcr]);

  const handleRunAI = async () => {
      if (!formData.issueDescription || isLocked) return;
      setIsAiLoading(true);
      try {
          const result = await generateNCRSuggestions(formData.issueDescription, 'General');
          setFormData(prev => ({ ...prev, rootCause: result.rootCause, solution: result.solution }));
          setIsEditing(true);
      } catch (error) { alert("Lỗi khi gọi AI."); } finally { setIsAiLoading(false); }
  };

  const handleSaveChanges = async () => {
      if (isLocked) return;
      setIsSaving(true);
      try {
          // Logic 1: Trạng thái tự động dựa trên minh chứng xử lý
          let finalStatus = formData.status;
          if (finalStatus !== 'CLOSED') {
              finalStatus = (formData.imagesAfter && formData.imagesAfter.length > 0) ? 'IN_PROGRESS' : 'OPEN';
          }
          
          const dataToSave = { ...formData, status: finalStatus };
          await saveNcrMapped(dataToSave.inspection_id || '', dataToSave, ncr.createdBy || user.name);
          setNcr(dataToSave);
          setFormData(dataToSave);
          setIsEditing(false);
          if (onUpdate) onUpdate();
      } catch (error) { alert("Lỗi khi lưu NCR."); } finally { setIsSaving(false); }
  };

  const handleApprove = async () => {
      if (!window.confirm("Xác nhận phê duyệt và đóng báo cáo NCR này? Hồ sơ sẽ bị khóa không thể chỉnh sửa.")) return;
      setIsSaving(true);
      try {
          // Logic 2: Chỉ chuyển trạng thái NCR = close (màu xanh) và khóa NCR, không liên quan PQC status
          const approvedData = { ...formData, status: 'CLOSED' };
          await saveNcrMapped(approvedData.inspection_id || '', approvedData, ncr.createdBy || user.name);
          setNcr(approvedData);
          setFormData(approvedData);
          setIsEditing(false);
          if (onUpdate) onUpdate();
      } catch (error) { alert("Lỗi khi phê duyệt."); } finally { setIsSaving(false); }
  };

  const handleAddImage = async (e: React.ChangeEvent<HTMLInputElement>, type: 'BEFORE' | 'AFTER' | 'COMMENT') => {
      if (isLocked && type !== 'COMMENT') return;
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
      
      if (type === 'COMMENT') {
          setCommentAttachments(prev => [...prev, ...processed]);
      } else {
          setFormData(prev => {
              const field = type === 'BEFORE' ? 'imagesBefore' : 'imagesAfter';
              const newImages = [...(prev[field] as string[] || []), ...processed];
              let newStatus = prev.status;
              if (newStatus !== 'CLOSED' && type === 'AFTER') {
                  newStatus = newImages.length > 0 ? 'IN_PROGRESS' : 'OPEN';
              }
              return { ...prev, [field]: newImages, status: newStatus };
          });
          setIsEditing(true);
      }
      e.target.value = '';
  };

  const removeImage = (index: number, type: 'BEFORE' | 'AFTER') => {
      if (isLocked) return;
      setFormData(prev => {
          const field = type === 'BEFORE' ? 'imagesBefore' : 'imagesAfter';
          const newList = (prev[field] || []).filter((_, i) => i !== index);
          let newStatus = prev.status;
          if (newStatus !== 'CLOSED' && type === 'AFTER') {
              newStatus = newList.length > 0 ? 'IN_PROGRESS' : 'OPEN';
          }
          return { ...prev, [field]: newList, status: newStatus };
      });
      setIsEditing(true);
  };

  const handlePostComment = async () => {
      if (!newComment.trim() && commentAttachments.length === 0) return;
      setIsSubmitting(true);
      const newCommentObj: NCRComment = {
          id: `cmt_${Date.now()}`,
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
          await saveNcrMapped(ncr.inspection_id || '', updatedNcr, ncr.createdBy || user.name);
          setFormData(updatedNcr);
          setNcr(updatedNcr);
          setNewComment('');
          setCommentAttachments([]);
      } catch (e) { alert("Lỗi khi gửi bình luận."); } finally { setIsSubmitting(false); }
  };

  const openGallery = (images: string[], index: number, context?: string) => {
      setLightboxState({ images, index, context });
  };

  const handleEditCommentImage = (index: number) => {
      setLightboxState({ images: commentAttachments, index, context: 'PENDING_COMMENT' });
  };

  const updateCommentImage = (index: number, updatedImage: string) => {
      setCommentAttachments(prev => {
          const next = [...prev];
          next[index] = updatedImage;
          return next;
      });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      {/* HEADER ACTION BAR */}
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="flex items-center gap-1.5 text-slate-600 font-bold text-xs px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors active:scale-95"><ArrowLeft className="w-4 h-4"/></button>
              <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Báo cáo lỗi NCR</span>
                  <span className="text-[11px] font-black text-slate-800 uppercase font-mono">#{ncr.id.split('-').pop()}</span>
              </div>
          </div>
          <div className="flex gap-2">
              {/* Nút liên kết tới Detail PQC liên quan */}
              <button 
                onClick={() => onViewInspection(ncr.inspection_id || '')}
                className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-white hover:text-blue-600 transition-all active:scale-95 shadow-sm"
              >
                  <FileText className="w-4 h-4" />
                  XEM PHIẾU QC GỐC
              </button>

              {canApprove && (
                  <button 
                    onClick={handleApprove} 
                    disabled={isSaving} 
                    className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-emerald-900/10 active:scale-95 hover:bg-emerald-700 transition-all"
                  >
                      <ShieldCheck className="w-4 h-4" /> 
                      PHÊ DUYỆT & ĐÓNG NCR
                  </button>
              )}
              {isEditing ? (
                  <>
                    <button onClick={() => { setFormData(ncr); setIsEditing(false); }} className="px-3 py-1.5 text-slate-500 font-bold text-[10px] hover:bg-slate-100 rounded-lg">Hủy</button>
                    <button onClick={handleSaveChanges} disabled={isSaving} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-blue-900/10 active:scale-95 transition-all">{isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} Lưu cập nhật</button>
                  </>
              ) : (
                  canModify && <button onClick={() => setIsEditing(true)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg active:scale-95 transition-all"><Edit3 className="w-4 h-4"/> Sửa hồ sơ</button>
              )}
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-24">
        <div className="max-w-5xl mx-auto space-y-4">
            
            {/* --- STATUS & ISSUE DESCRIPTION CARD --- */}
            <div className={`rounded-[2rem] p-6 border shadow-sm relative overflow-hidden transition-all duration-500 ${formData.status === 'CLOSED' ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200 shadow-xl shadow-slate-900/5'}`}>
                {formData.status === 'CLOSED' && (
                    <div className="absolute -right-6 -top-6 p-10 opacity-10 pointer-events-none rotate-12">
                        <CheckCircle2 className="w-32 h-32 text-green-600" />
                    </div>
                )}
                
                <div className="space-y-4 relative z-10">
                    <div className="flex flex-wrap items-center gap-2">
                        {isEditing ? (
                            <select value={formData.severity} onChange={e => setFormData({...formData, severity: e.target.value as any})} className="px-3 py-1 rounded-lg text-[9px] font-black uppercase border bg-white outline-none focus:ring-2 ring-blue-100"><option value="MINOR">MINOR</option><option value="MAJOR">MAJOR</option><option value="CRITICAL">CRITICAL</option></select>
                        ) : (
                            <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border tracking-widest shadow-sm ${formData.severity === 'CRITICAL' ? 'bg-red-600 text-white border-red-700' : formData.severity === 'MAJOR' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{formData.severity}</span>
                        )}
                        
                        <span className={`border px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] shadow-sm ${formData.status === 'CLOSED' ? 'bg-green-600 text-white border-green-600' : 'bg-indigo-600 text-white border-indigo-600'}`}>{formData.status}</span>
                    </div>
                    
                    <div>
                        {isEditing ? (
                            <textarea value={formData.issueDescription} onChange={e => setFormData({...formData, issueDescription: e.target.value})} className="w-full text-base font-black text-slate-800 bg-slate-50 border-2 border-blue-500 outline-none resize-none p-4 rounded-2xl shadow-inner transition-all uppercase" rows={2} />
                        ) : (
                            <h1 className="text-xl font-black text-slate-900 uppercase leading-tight tracking-tight">{formData.issueDescription}</h1>
                        )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                        <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Người phụ trách</p><p className="text-[11px] font-black text-slate-800 uppercase">{formData.responsiblePerson || '---'}</p></div>
                        <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Hạn xử lý (Deadline)</p><p className={`text-[11px] font-black font-mono ${formData.deadline && new Date(formData.deadline) < new Date() && !isClosed ? 'text-red-600' : 'text-slate-800'}`}>{formData.deadline || 'ASAP'}</p></div>
                        <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Người báo cáo</p><p className="text-[11px] font-black text-slate-800 uppercase">{formData.createdBy}</p></div>
                        <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Ngày ghi nhận</p><p className="text-[11px] font-black text-slate-800 font-mono">{new Date(formData.createdDate).toLocaleDateString('vi-VN')}</p></div>
                    </div>
                </div>
            </div>

            {/* --- TECHNICAL ANALYSIS SECTION --- */}
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-purple-600" /><h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Phân tích Kỹ thuật & Hành động</h3></div>
                    {isEditing && (
                        <button onClick={handleRunAI} disabled={isAiLoading || !formData.issueDescription} className="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-2 shadow-lg active:scale-95 disabled:opacity-30 transition-all">
                            {isAiLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3 text-purple-400" />} 
                            AI PHÂN TÍCH FISHBONE
                        </button>
                    )}
                </div>
                <div className="p-6 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Root Cause (Nguyên nhân gốc rễ)</label>
                        {isEditing ? (
                            <textarea value={formData.rootCause} onChange={e => setFormData({...formData, rootCause: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 text-[12px] font-medium outline-none focus:border-blue-200 transition-all" rows={2} />
                        ) : (
                            <div className="p-4 bg-slate-50/50 rounded-2xl text-[12px] font-bold text-slate-700 italic leading-relaxed border border-slate-100 shadow-inner">
                                {formData.rootCause || 'Đang chờ phân tích kỹ thuật...'}
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Action Plan (Biện pháp xử lý)</label>
                        {isEditing ? (
                            <textarea value={formData.solution} onChange={e => setFormData({...formData, solution: e.target.value})} className="w-full p-4 bg-blue-50/30 rounded-2xl border-2 border-blue-50 text-[12px] font-black outline-none focus:border-blue-200 text-blue-900 transition-all" rows={2} />
                        ) : (
                            <div className="p-4 bg-blue-50/30 rounded-2xl border border-blue-100 text-[12px] font-black text-blue-900 leading-relaxed shadow-inner">
                                {formData.solution || 'Chưa cập nhật biện pháp khắc phục.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* --- VISUAL EVIDENCE GRID --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* BEFORE SECTION */}
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-red-50/20">
                        <label className="text-[10px] font-black text-red-600 uppercase tracking-widest flex items-center gap-2">
                            <AlertOctagon className="w-4 h-4"/> HIỆN TRẠNG LỖI (BEFORE)
                        </label>
                        {isEditing && !isLocked && (
                            <div className="flex gap-2">
                                <button onClick={() => beforeCameraRef.current?.click()} className="p-2 bg-white text-red-600 rounded-xl border border-red-100 shadow-sm active:scale-90 transition-all"><Camera className="w-4 h-4"/></button>
                                <button onClick={() => beforeFileRef.current?.click()} className="p-2 bg-white text-red-600 rounded-xl border border-red-100 shadow-sm active:scale-90 transition-all"><Plus className="w-4 h-4"/></button>
                            </div>
                        )}
                    </div>
                    <div className="p-5 grid grid-cols-2 gap-3">
                        {formData.imagesBefore?.map((img, idx) => (
                            <div key={idx} className="aspect-square rounded-2xl overflow-hidden border border-slate-100 relative group cursor-zoom-in shadow-sm hover:border-red-400 transition-all" onClick={() => openGallery(formData.imagesBefore!, idx)}>
                                <img src={img} className="w-full h-full object-cover" />
                                {isEditing && !isLocked && <button onClick={() => removeImage(idx, 'BEFORE')} className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow-xl"><X className="w-3.5 h-3.5"/></button>}
                                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Maximize2 className="text-white w-6 h-6" /></div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* AFTER SECTION */}
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-green-50/20">
                        <label className="text-[10px] font-black text-green-600 uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4"/> MINH CHỨNG XỬ LÝ (AFTER)
                        </label>
                        {!isLocked && (
                            <div className="flex gap-2">
                                <button onClick={() => afterCameraRef.current?.click()} className="p-2 bg-white text-green-600 rounded-xl border border-green-100 shadow-sm active:scale-90 transition-all" type="button"><Camera className="w-4 h-4"/></button>
                                <button onClick={() => afterFileRef.current?.click()} className="p-2 bg-white text-green-600 rounded-xl border border-green-100 shadow-sm active:scale-90 transition-all" type="button"><ImageIcon className="w-4 h-4"/></button>
                            </div>
                        )}
                    </div>
                    <div className="p-5 grid grid-cols-2 gap-3">
                        {formData.imagesAfter?.map((img, idx) => (
                            <div key={idx} className="aspect-square rounded-2xl overflow-hidden border border-slate-100 relative group cursor-zoom-in shadow-sm hover:border-green-400 transition-all" onClick={() => openGallery(formData.imagesAfter!, idx)}>
                                <img src={img} className="w-full h-full object-cover" />
                                {!isLocked && <button onClick={() => removeImage(idx, 'AFTER')} className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow-xl"><X className="w-3.5 h-3.5"/></button>}
                                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Maximize2 className="text-white w-6 h-6" /></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- DISCUSSION SECTION --- */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col mb-10">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-blue-600" />
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Nhật ký xử lý & Thảo luận</h3>
                </div>
                <div className="p-6 space-y-6 max-h-[500px] overflow-y-auto no-scrollbar">
                    {formData.comments?.map((comment) => (
                        <div key={comment.id} className="flex gap-4 animate-in slide-in-from-left-2 duration-300">
                            <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="w-10 h-10 rounded-xl border border-slate-200 shrink-0 shadow-sm" alt="" />
                            <div className="flex-1 space-y-2">
                                <div className="flex justify-between items-center px-1">
                                    <span className="font-black text-slate-800 text-[11px] uppercase tracking-tight">{comment.userName}</span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-[1.5rem] rounded-tl-none border border-slate-100 text-[12px] text-slate-700 font-medium whitespace-pre-wrap leading-relaxed shadow-sm">{comment.content}</div>
                                {comment.attachments && comment.attachments.length > 0 && (
                                    <div className="flex gap-3 flex-wrap pt-2">
                                        {comment.attachments.map((att, idx) => (
                                            <img key={idx} src={att} onClick={() => openGallery(comment.attachments!, idx)} className="w-20 h-20 object-cover rounded-2xl border border-slate-200 shadow-sm cursor-zoom-in transition-all hover:scale-110 shrink-0" />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {!isLocked && (
                    <div className="p-4 bg-slate-50/50 border-t border-slate-100 space-y-4">
                        {commentAttachments.length > 0 && (
                            <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
                                {commentAttachments.map((img, idx) => (
                                    <div key={idx} className="relative w-20 h-20 shrink-0 group">
                                        <img src={img} className="w-full h-full object-cover rounded-2xl border-2 border-blue-200 shadow-lg cursor-pointer" onClick={() => handleEditCommentImage(idx)}/>
                                        <button onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1.5 -right-1.5 bg-red-600 text-white p-1 rounded-full shadow-xl active:scale-90 transition-all"><X className="w-4 h-4"/></button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-3 items-end">
                            <div className="flex-1 relative">
                                <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Nhập ý kiến phản hồi hoặc tiến độ xử lý..." className="w-full pl-5 pr-28 py-4 bg-white border border-slate-200 rounded-[2rem] text-[12px] font-bold focus:ring-4 focus:ring-blue-100 outline-none resize-none min-h-[70px] shadow-inner transition-all" />
                                <div className="absolute right-3 bottom-3 flex items-center gap-2">
                                    <button onClick={() => commentCameraRef.current?.click()} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-transparent hover:border-blue-100 active:scale-90" title="Chụp ảnh"><Camera className="w-5 h-5"/></button>
                                    <button onClick={() => commentFileRef.current?.click()} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-transparent hover:border-blue-100 active:scale-90" title="Chọn ảnh"><ImageIcon className="w-5 h-5"/></button>
                                </div>
                            </div>
                            <button onClick={handlePostComment} disabled={isSubmitting || (!newComment.trim() && commentAttachments.length === 0)} className="w-14 h-14 bg-blue-600 text-white rounded-[1.5rem] shadow-xl shadow-blue-500/30 flex items-center justify-center active:scale-95 disabled:opacity-30 transition-all shrink-0 hover:bg-blue-700"><Send className="w-6 h-6" /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>

      {lightboxState && (
          <ImageEditorModal 
              images={lightboxState.images} 
              initialIndex={lightboxState.index} 
              onClose={() => setLightboxState(null)} 
              onSave={lightboxState.context === 'PENDING_COMMENT' ? (idx, updated) => updateCommentImage(idx, updated) : undefined}
              readOnly={lightboxState.context !== 'PENDING_COMMENT'} 
          />
      )}
      <input type="file" ref={commentFileRef} className="hidden" multiple accept="image/*" onChange={handleAddImage.bind(null, 'COMMENT' as any)} />
      <input type="file" ref={commentCameraRef} className="hidden" capture="environment" accept="image/*" onChange={handleAddImage.bind(null, 'COMMENT' as any)} />
      <input type="file" ref={beforeFileRef} className="hidden" multiple accept="image/*" onChange={(e) => handleAddImage(e, 'BEFORE')} />
      <input type="file" ref={beforeCameraRef} className="hidden" capture="environment" accept="image/*" onChange={(e) => handleAddImage(e, 'BEFORE')} />
      <input type="file" ref={afterFileRef} className="hidden" multiple accept="image/*" onChange={(e) => handleAddImage(e, 'AFTER')} />
      <input type="file" ref={afterCameraRef} className="hidden" capture="environment" accept="image/*" onChange={(e) => handleAddImage(e, 'AFTER')} />
    </div>
  );
};
