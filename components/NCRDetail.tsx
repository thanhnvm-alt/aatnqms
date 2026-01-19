
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { NCR, User, DefectLibraryItem, NCRComment } from '../types';
import { 
    ArrowLeft, Calendar, User as UserIcon, AlertTriangle, 
    CheckCircle2, Clock, MessageSquare, Camera, Paperclip, 
    Send, Loader2, BrainCircuit, Maximize2, Plus, 
    X, FileText, Image as ImageIcon, Save, Sparkles, BookOpen,
    ChevronDown, Filter, RefreshCw, ShieldCheck, PenTool, AlertOctagon
} from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';
import { fetchDefectLibrary, saveNcrMapped, saveComment, fetchComments } from '../services/apiService';
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
  const [activeComments, setActiveComments] = useState<NCRComment[]>(initialNcr.comments || []);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  
  // Library State
  const [library, setLibrary] = useState<DefectLibraryItem[]>([]);
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [showLibrary, setShowLibrary] = useState(false);

  // UI State
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number; context?: string } | null>(null);

  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);
  const beforeFileRef = useRef<HTMLInputElement>(null);
  const beforeCameraRef = useRef<HTMLInputElement>(null);
  const afterFileRef = useRef<HTMLInputElement>(null);
  const afterCameraRef = useRef<HTMLInputElement>(null);

  // --- PERMISSIONS ---
  const isAdmin = user.role === 'ADMIN';
  const isManager = user.role === 'MANAGER';
  const isQA = user.role === 'QA';
  const isOwner = ncr.createdBy === user.name;
  const isClosed = ncr.status === 'CLOSED';
  const isLocked = isClosed && !isAdmin;
  const canModify = isAdmin || isManager || isOwner;
  const canApprove = (isAdmin || isManager || isQA) && !isClosed;

  useEffect(() => {
      fetchDefectLibrary().then(setLibrary);
      fetchComments(ncr.id).then(setActiveComments);
  }, [ncr.id]);

  const handleApplyDefect = (defect: DefectLibraryItem) => {
      if (window.confirm("Áp dụng thông tin lỗi này? Mô tả và mức độ sẽ được cập nhật.")) {
          setFormData(prev => ({
              ...prev,
              issueDescription: defect.description,
              defect_code: defect.code,
              severity: defect.severity as any,
              solution: defect.suggestedAction || prev.solution
          }));
          setIsEditing(true);
          setShowLibrary(false);
      }
  };

  const handleRunAI = async () => {
      if (!formData.issueDescription) return;
      setIsAiLoading(true);
      try {
          const result = await generateNCRSuggestions(formData.issueDescription, 'General');
          setFormData(prev => ({ ...prev, rootCause: result.rootCause, solution: result.solution }));
          setIsEditing(true);
      } catch (error) { alert("Lỗi khi gọi AI."); } finally { setIsAiLoading(false); }
  };

  const handleSaveChanges = async () => {
      setIsSaving(true);
      try {
          let statusToSave = formData.status;
          if (statusToSave === 'OPEN' && (formData.imagesAfter?.length || 0) > 0) statusToSave = 'IN_PROGRESS';
          const finalData = { ...formData, status: statusToSave };
          await saveNcrMapped(finalData.inspection_id || '', finalData, ncr.createdBy || user.name);
          setNcr(finalData); setFormData(finalData); setIsEditing(false);
          if (onUpdate) onUpdate();
      } catch (error) { alert("Lỗi khi lưu NCR."); } finally { setIsSaving(false); }
  };

  const handleApprove = async () => {
      if (!window.confirm("Xác nhận phê duyệt và đóng NCR này?")) return;
      setIsSaving(true);
      try {
          const approvedData = { ...formData, status: 'CLOSED' };
          await saveNcrMapped(approvedData.inspection_id || '', approvedData, ncr.createdBy || user.name);
          setNcr(approvedData); setFormData(approvedData); setIsEditing(false);
          if (onUpdate) onUpdate();
      } catch (error) { alert("Lỗi khi phê duyệt."); } finally { setIsSaving(false); }
  };

  const handleAddImage = async (e: React.ChangeEvent<HTMLInputElement>, type: 'BEFORE' | 'AFTER' | 'COMMENT') => {
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
              return { ...prev, [field]: [...(prev[field] as string[] || []), ...processed] };
          });
          setIsEditing(true);
      }
      e.target.value = '';
  };

  const removeImage = (index: number, type: 'BEFORE' | 'AFTER') => {
      setFormData(prev => {
          const field = type === 'BEFORE' ? 'imagesBefore' : 'imagesAfter';
          const newList = (prev[field] || []).filter((_, i) => i !== index);
          return { ...prev, [field]: newList };
      });
      setIsEditing(true);
  };

  const handlePostComment = async () => {
      if (!newComment.trim() && commentAttachments.length === 0) return;
      setIsSubmitting(true);
      try {
          const newCommentObj: NCRComment = {
              id: `cmt_${Date.now()}`,
              userId: user.id,
              userName: user.name,
              userAvatar: user.avatar,
              content: newComment,
              createdAt: new Date().toISOString(),
              attachments: commentAttachments
          };
          await saveComment(ncr.id, newCommentObj);
          
          const refreshed = await fetchComments(ncr.id);
          setActiveComments(refreshed);
          setNewComment(''); 
          setCommentAttachments([]);
      } catch (e) { alert("Lỗi khi gửi bình luận."); } finally { setIsSubmitting(false); }
  };

  const updateCommentImage = (idx: number, newImg: string) => {
      setCommentAttachments(prev => {
          const next = [...prev];
          next[idx] = newImg;
          return next;
      });
  };

  const openGallery = (images: string[], index: number, context?: string) => {
      setLightboxState({ images, index, context });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="flex items-center gap-1.5 text-slate-600 font-bold text-xs px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors active:scale-95"><ArrowLeft className="w-4 h-4"/></button>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:inline">Chi tiết NCR</span>
          </div>
          <div className="flex gap-2">
              {canApprove && <button onClick={handleApprove} disabled={isSaving} className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1.5 shadow-lg active:scale-95 hover:bg-teal-700"><ShieldCheck className="w-3 h-3" /> Phê duyệt / Đóng</button>}
              {isEditing ? (
                  <>
                    <button onClick={() => { setFormData(ncr); setIsEditing(false); }} className="px-3 py-1.5 text-slate-500 font-bold text-[10px] hover:bg-slate-100 rounded-lg">Hủy</button>
                    <button onClick={handleSaveChanges} disabled={isSaving} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1.5 shadow-lg active:scale-95">{isSaving ? <Loader2 className="w-3 h-3 animate-spin"/> : <Save className="w-3 h-3"/>} Lưu</button>
                  </>
              ) : (
                  canModify && !isLocked && <button onClick={() => setIsEditing(true)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1.5 shadow-lg active:scale-95"><AlertTriangle className="w-3 h-3"/> Sửa</button>
              )}
              <button onClick={() => onViewInspection(ncr.inspection_id || '')} className="text-blue-600 bg-blue-50 px-2 py-1.5 rounded-lg hover:bg-blue-100 active:scale-95"><FileText className="w-4 h-4"/></button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-24">
        <div className="max-w-5xl mx-auto space-y-4">
            
            {/* Header Status Card */}
            <div className={`rounded-xl p-4 border shadow-sm relative overflow-hidden transition-colors ${formData.status === 'CLOSED' ? 'bg-green-50 border-green-100' : 'bg-white border-slate-200'}`}>
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="bg-slate-900 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">NCR: {formData.id}</span>
                            {isEditing ? (<select value={formData.severity} onChange={e => setFormData({...formData, severity: e.target.value as any})} className="px-2 py-0.5 rounded text-[9px] font-bold uppercase border bg-white outline-none"><option value="MINOR">MINOR</option><option value="MAJOR">MAJOR</option><option value="CRITICAL">CRITICAL</option></select>) : (<span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${formData.severity === 'CRITICAL' ? 'bg-red-600 text-white border-red-700' : formData.severity === 'MAJOR' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{formData.severity}</span>)}
                            {isEditing ? (<select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="px-2 py-0.5 rounded text-[9px] font-bold uppercase border bg-white outline-none"><option value="OPEN">OPEN</option><option value="IN_PROGRESS">IN PROGRESS</option><option value="CLOSED">CLOSED</option></select>) : (<span className={`border px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${formData.status === 'CLOSED' ? 'bg-green-100 text-green-700' : formData.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' : 'bg-red-50 text-red-700'}`}>{formData.status}</span>)}
                        </div>
                        <div>{isEditing ? (<textarea value={formData.issueDescription} onChange={e => setFormData({...formData, issueDescription: e.target.value})} className="w-full text-base font-bold text-slate-800 bg-slate-50 border-b-2 border-blue-500 outline-none resize-none p-2 rounded-t-lg" rows={2} />) : (<h1 className="text-base font-bold text-slate-800 uppercase leading-tight tracking-tight">{formData.issueDescription}</h1>)}</div>
                    </div>
                </div>
            </div>

            {/* Analysis Section with AI */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-purple-600" /><h3 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">Phân tích Kỹ thuật</h3></div>
                    {isEditing && <button onClick={handleRunAI} disabled={isAiLoading || !formData.issueDescription} className="bg-purple-600 text-white px-2 py-1 rounded text-[9px] font-bold uppercase flex items-center gap-1 shadow-md active:scale-95 disabled:opacity-30">{isAiLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin"/> : <Sparkles className="w-2.5 h-2.5" />} AI Phân tích</button>}
                </div>
                <div className="p-4 space-y-4">
                    <div className="space-y-1"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Root Cause</label>{isEditing ? (<textarea value={formData.rootCause} onChange={e => setFormData({...formData, rootCause: e.target.value})} className="w-full p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] outline-none" rows={2} />) : (<div className="p-3 bg-slate-50 rounded-lg text-[11px] font-bold text-slate-700 italic leading-relaxed">{formData.rootCause || 'Đang chờ phân tích...'}</div>)}</div>
                    <div className="space-y-1"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Action Plan</label>{isEditing ? (<textarea value={formData.solution} onChange={e => setFormData({...formData, solution: e.target.value})} className="w-full p-3 bg-blue-50 rounded-lg border border-blue-100 text-[11px] outline-none text-blue-900" rows={2} />) : (<div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 text-[11px] font-bold text-blue-900 leading-relaxed">{formData.solution || 'Chưa cập nhật biện pháp khắc phục.'}</div>)}</div>
                </div>
            </div>

            {/* Images Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-red-50/30"><label className="text-[9px] font-bold text-red-500 uppercase flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5"/> TRƯỚC XỬ LÝ (ISSUE)</label>{isEditing && <div className="flex gap-1"><button onClick={() => beforeCameraRef.current?.click()} className="p-1 bg-white text-slate-500 rounded border border-slate-200"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => beforeFileRef.current?.click()} className="p-1 bg-white text-slate-500 rounded border border-slate-200"><Plus className="w-3.5 h-3.5"/></button></div>}</div>
                    <div className="p-3 grid grid-cols-2 gap-2">{formData.imagesBefore?.map((img, idx) => (<div key={idx} className="aspect-square rounded-lg overflow-hidden border relative group"><img src={img} className="w-full h-full object-cover cursor-pointer" onClick={() => openGallery(formData.imagesBefore!, idx)} />{isEditing && <button onClick={() => removeImage(idx, 'BEFORE')} className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded-full shadow-lg"><X className="w-3 h-3"/></button>}</div>))}</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-green-50/30"><label className="text-[9px] font-bold text-green-600 uppercase flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5"/> SAU XỬ LÝ (FIX)</label>{(!isLocked || isEditing) && <div className="flex gap-1"><button onClick={() => afterCameraRef.current?.click()} className="p-1 bg-green-50 text-green-600 rounded-lg border border-green-100 hover:bg-green-100 active:scale-90 transition-all" type="button"><Camera className="w-3.5 h-3.5"/></button><button onClick={() => afterFileRef.current?.click()} className="p-1 bg-slate-50 text-slate-400 rounded-lg border border-slate-200 hover:bg-slate-100 active:scale-90 transition-all" type="button"><ImageIcon className="w-3.5 h-3.5"/></button></div>}</div>
                    <div className="p-3 grid grid-cols-2 gap-2">{formData.imagesAfter?.map((img, idx) => (<div key={idx} className="aspect-square rounded-lg overflow-hidden border relative group"><img src={img} className="w-full h-full object-cover" onClick={() => openGallery(formData.imagesAfter!, idx)} />{(!isLocked || isEditing) && <button onClick={() => removeImage(idx, 'AFTER')} className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded-full shadow-lg"><X className="w-3 h-3"/></button>}</div>))}</div>
                </div>
            </div>

            {/* Discussions - Independent Comment Flow */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-blue-600" /><h3 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">Thảo luận & Theo dõi xử lý</h3></div>
                <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto no-scrollbar">
                    {activeComments.map((comment) => (
                        <div key={comment.id} className="flex gap-3">
                            <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="w-8 h-8 rounded-lg border shrink-0" alt="" />
                            <div className="flex-1 space-y-1">
                                <div className="flex justify-between items-center"><span className="font-bold text-slate-800 text-[10px] uppercase">{comment.userName}</span><span className="text-[9px] font-bold text-slate-400">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span></div>
                                <div className="bg-slate-50 p-2.5 rounded-lg border text-[11px] text-slate-700 font-medium whitespace-pre-wrap">{comment.content}</div>
                                {comment.attachments && comment.attachments.length > 0 && (
                                    <div className="flex gap-2 pt-1 flex-wrap">
                                        {comment.attachments.map((att, idx) => (<img key={idx} src={att} onClick={() => openGallery(comment.attachments!, idx)} className="w-12 h-12 object-cover rounded-lg border cursor-zoom-in" />))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {activeComments.length === 0 && <p className="text-center text-[10px] text-slate-400 py-4 italic font-medium">Chưa có bình luận trao đổi cho phiếu này.</p>}
                </div>

                <div className="p-3 border-t border-slate-100 bg-slate-50/30 space-y-3">
                    {commentAttachments.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                            {commentAttachments.map((img, idx) => (
                                <div key={idx} className="relative w-16 h-16 shrink-0 group">
                                    <img src={img} className="w-full h-full object-cover rounded-xl border-2 border-blue-200 shadow-md cursor-pointer" onClick={() => openGallery(commentAttachments, idx, 'PENDING_COMMENT')}/>
                                    <button onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 bg-red-500 text-white p-0.5 rounded-full shadow-lg"><X className="w-3 h-3"/></button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex items-start gap-3">
                        <div className="flex-1 relative">
                            <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Nhập bình luận hoặc cập nhật tiến độ..." className="w-full pl-3 pr-24 py-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-medium focus:ring-1 focus:ring-blue-500 outline-none resize-none h-[60px]" />
                            <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
                                <button onClick={() => commentCameraRef.current?.click()} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-xl transition-all" title="Chụp ảnh"><Camera className="w-4 h-4"/></button>
                                <button onClick={() => commentFileRef.current?.click()} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-xl transition-all" title="Chọn ảnh"><ImageIcon className="w-4 h-4"/></button>
                            </div>
                        </div>
                        <button onClick={handlePostComment} disabled={isSubmitting || (!newComment.trim() && commentAttachments.length === 0)} className="p-3.5 bg-blue-600 text-white rounded-xl shadow-lg active:scale-95 disabled:opacity-50 transition-all shrink-0">{isSubmitting ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5" />}</button>
                    </div>
                </div>
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
      
      <input type="file" ref={beforeFileRef} className="hidden" multiple accept="image/*" onChange={(e) => handleAddImage(e, 'BEFORE')} />
      <input type="file" ref={beforeCameraRef} className="hidden" capture="environment" accept="image/*" onChange={(e) => handleAddImage(e, 'BEFORE')} />
      <input type="file" ref={afterFileRef} className="hidden" multiple accept="image/*" onChange={(e) => handleAddImage(e, 'AFTER')} />
      <input type="file" ref={afterCameraRef} className="hidden" capture="environment" accept="image/*" onChange={(e) => handleAddImage(e, 'AFTER')} />
      <input type="file" ref={commentFileRef} className="hidden" multiple accept="image/*" onChange={(e) => handleAddImage(e, 'COMMENT')} />
      <input type="file" ref={commentCameraRef} className="hidden" capture="environment" accept="image/*" onChange={(e) => handleAddImage(e, 'COMMENT')} />
    </div>
  );
};
