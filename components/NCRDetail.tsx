
import React, { useState, useRef } from 'react';
import { NCR, User, NCRComment } from '../types';
import { 
    ArrowLeft, Calendar, User as UserIcon, Tag, 
    AlertTriangle, ShieldCheck, Hammer, Box, 
    FileText, CheckCircle2, Clock, Camera, 
    Maximize2, ExternalLink, MapPin, Hash,
    BrainCircuit, ClipboardList, Send, Paperclip, X, Loader2,
    FileWarning, MessageSquare, Plus
} from 'lucide-react';
import { saveInspectionToSheet, fetchInspectionById } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';

interface NCRDetailProps {
  ncr: NCR;
  user: User;
  onBack: () => void;
  onViewInspection: (id: string) => void;
  onUpdate?: () => void;
}

const resizeImage = (base64Str: string, maxWidth = 1200): Promise<string> => {
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
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  const [newComment, setNewComment] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const afterFileRef = useRef<HTMLInputElement>(null);

  const isLocked = ncr.status === 'CLOSED';

  const updateNCRInDb = async (updates: Partial<NCR>) => {
      if (!ncr.inspection_id) return;
      const fullInspection = await fetchInspectionById(ncr.inspection_id);
      if (!fullInspection) return;

      const updatedItems = fullInspection.items.map(item => {
          if (item.ncr && item.ncr.id === ncr.id) {
              return { ...item, ncr: { ...item.ncr, ...updates } };
          }
          return item;
      });

      const updatedInspection = { ...fullInspection, items: updatedItems };
      try {
          await saveInspectionToSheet(updatedInspection);
          const newNcr = { ...ncr, ...updates };
          setNcr(newNcr);
          if (onUpdate) onUpdate();
      } catch (e) {
          alert("Lỗi khi cập nhật NCR");
      }
  };

  const handlePostComment = async () => {
    if (!newComment.trim() && commentAttachments.length === 0) return;
    setIsSubmitting(true);
    const commentObj: NCRComment = {
        id: `cmt_${Date.now()}`,
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        content: newComment.trim(),
        createdAt: new Date().toISOString(),
        attachments: commentAttachments
    };
    try {
        await updateNCRInDb({ comments: [...(ncr.comments || []), commentObj] });
        setNewComment('');
        setCommentAttachments([]);
    } catch (err) { alert("Lỗi khi gửi bình luận."); } finally { setIsSubmitting(false); }
  };

  const handleAddAfterImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const processed = await Promise.all((Array.from(files) as File[]).map((file: File) => new Promise<string>((res) => {
          const r = new FileReader(); 
          r.onload = async () => res(await resizeImage(r.result as string)); 
          r.readAsDataURL(file);
      })));
      await updateNCRInDb({ imagesAfter: [...(ncr.imagesAfter || []), ...processed] });
  };

  const handleUpdateStatus = async (newStatus: string) => {
      if (window.confirm(`Xác nhận chuyển trạng thái sang ${newStatus}?`)) {
          await updateNCRInDb({ status: newStatus });
      }
  };

  const openGallery = (images: string[], index: number) => {
      setLightboxState({ images, index });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <input type="file" ref={afterFileRef} className="hidden" multiple accept="image/*" onChange={handleAddAfterImage} />
      <input type="file" ref={commentFileRef} className="hidden" multiple accept="image/*" onChange={async (e) => {
           const files = e.target.files; if(!files) return;
           const processed = await Promise.all(Array.from(files).map(async (f: File) => await resizeImage(await new Promise<string>(res => {const r=new FileReader(); r.onload=()=>res(r.result as string); r.readAsDataURL(f);}))));
           setCommentAttachments(prev => [...prev, ...processed]);
      }} />

      {/* Header Toolbar */}
      <div className="bg-white px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 z-40 shadow-sm shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-600 font-bold text-sm px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors active:scale-95">
            <ArrowLeft className="w-5 h-5"/> Quay lại danh sách
        </button>
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 mr-2">
                {ncr.status !== 'CLOSED' ? (
                    <button onClick={() => handleUpdateStatus('CLOSED')} className="bg-green-600 text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-green-100 active:scale-95">ĐÓNG NCR</button>
                ) : (
                    <div className="bg-green-100 text-green-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase">ĐÃ HOÀN TẤT</div>
                )}
            </div>
            <div className="h-6 w-px bg-slate-200 mx-1"></div>
            {ncr.inspection_id && (
                <button onClick={() => onViewInspection(ncr.inspection_id!)} className="bg-blue-600 text-white px-4 py-1.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-blue-200 active:scale-95">
                    <FileText className="w-4 h-4" /> Phiếu QC Gốc
                </button>
            )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar">
        <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Title Block */}
            <div className="bg-white rounded-[2.5rem] p-6 md:p-10 border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                    <AlertTriangle className="w-48 h-48" />
                </div>
                <div className="flex flex-col md:flex-row gap-6 items-start">
                    <div className="w-20 h-20 bg-red-600 text-white rounded-3xl flex items-center justify-center shadow-xl shadow-red-200 shrink-0">
                        <ShieldCheck className="w-10 h-10" />
                    </div>
                    <div className="flex-1 overflow-hidden space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-lg uppercase tracking-widest">NCR: {ncr.id}</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest ${ncr.severity === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'}`}>{ncr.severity || 'MINOR'}</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight uppercase tracking-tighter">{ncr.issueDescription}</h1>
                        <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                            <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-blue-500" /> {ncr.createdDate}</div>
                            <div className="flex items-center gap-1.5"><UserIcon className="w-4 h-4 text-indigo-500" /> {ncr.responsiblePerson || '---'}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Evidence & Analysis Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Images */}
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                        <Camera className="w-5 h-5 text-red-600" />
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Bằng chứng lỗi & Khắc phục</h3>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-red-500 uppercase flex items-center gap-2"><FileWarning className="w-4 h-4"/> TRƯỚC XỬ LÝ (EVIDENCE)</label>
                            <div className="grid grid-cols-2 gap-3">
                                {ncr.imagesBefore?.map((img, idx) => (
                                    <div key={idx} onClick={() => openGallery(ncr.imagesBefore, idx)} className="aspect-square rounded-2xl overflow-hidden border border-slate-100 cursor-zoom-in group relative">
                                        <img src={img} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Maximize2 className="text-white w-5 h-5" /></div>
                                    </div>
                                ))}
                                {(!ncr.imagesBefore || ncr.imagesBefore.length === 0) && <div className="col-span-2 py-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 text-[10px] font-black uppercase">Trống</div>}
                            </div>
                        </div>

                        <div className="h-px bg-slate-100"></div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-green-600 uppercase flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> SAU XỬ LÝ (RESOLUTION)</label>
                                {!isLocked && <button onClick={() => afterFileRef.current?.click()} className="text-blue-600 p-1 hover:bg-blue-50 rounded-full transition-colors"><Plus className="w-5 h-5"/></button>}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {ncr.imagesAfter?.map((img, idx) => (
                                    <div key={idx} onClick={() => openGallery(ncr.imagesAfter, idx)} className="aspect-square rounded-2xl overflow-hidden border border-slate-100 cursor-zoom-in group relative">
                                        <img src={img} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Maximize2 className="text-white w-5 h-5" /></div>
                                    </div>
                                ))}
                                {(!ncr.imagesAfter || ncr.imagesAfter.length === 0) && <div className="col-span-2 py-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 text-[10px] font-black uppercase">Chưa có ảnh khắc phục</div>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Analysis */}
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                        <BrainCircuit className="w-5 h-5 text-purple-600" />
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Phân tích Kỹ thuật</h3>
                    </div>
                    <div className="p-6 space-y-8">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nguyên nhân gốc rễ (Root Cause)</label>
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-sm font-bold text-slate-700 italic leading-relaxed">
                                "{ncr.rootCause || 'Đang chờ phân tích...'}"
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Biện pháp xử lý (Action Plan)</label>
                            <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 text-sm font-bold text-blue-900 leading-relaxed">
                                {ncr.solution || 'Chưa cập nhật biện pháp khắc phục.'}
                            </div>
                        </div>
                        <div className="pt-4 grid grid-cols-1 gap-4">
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                <Clock className="w-5 h-5 text-orange-500" />
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Thời hạn hoàn tất</p>
                                    <p className="text-sm font-black text-slate-800">{ncr.deadline || 'ASAP'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Discussions */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-blue-600" />
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Thảo luận & Theo dõi xử lý</h3>
                </div>
                <div className="p-6 space-y-6">
                    {ncr.comments?.map((comment) => (
                        <div key={comment.id} className="flex gap-4">
                            <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="w-10 h-10 rounded-2xl border border-slate-200 shrink-0" alt="" />
                            <div className="flex-1 space-y-1">
                                <div className="flex justify-between items-center">
                                    <span className="font-black text-slate-800 text-[11px] uppercase">{comment.userName}</span>
                                    <span className="text-[9px] font-bold text-slate-400">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm text-sm text-slate-700 font-medium whitespace-pre-wrap">{comment.content}</div>
                                {comment.attachments && comment.attachments.length > 0 && (
                                    <div className="flex gap-2 pt-2">
                                        {comment.attachments.map((att, idx) => (
                                            <img key={idx} src={att} onClick={() => openGallery(comment.attachments!, idx)} className="w-16 h-16 object-cover rounded-xl border border-slate-200 cursor-zoom-in" />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {(!ncr.comments || ncr.comments.length === 0) && <p className="text-center text-xs text-slate-400 py-6 italic font-medium">Chưa có bình luận trao đổi cho phiếu này.</p>}
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50">
                    <div className="flex items-start gap-4">
                        <div className="flex-1 relative">
                            <textarea 
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Nhập bình luận hoặc cập nhật tiến độ..."
                                className="w-full pl-4 pr-12 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none resize-none shadow-sm"
                                rows={2}
                            />
                            <div className="absolute right-3 bottom-3 flex items-center gap-1">
                                <button onClick={() => commentFileRef.current?.click()} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg"><Paperclip className="w-4 h-4" /></button>
                                <button 
                                    onClick={handlePostComment}
                                    disabled={isSubmitting || (!newComment.trim() && commentAttachments.length === 0)}
                                    className="p-2 bg-blue-600 text-white rounded-xl shadow-lg active:scale-95 disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
      </div>

      {lightboxState && <ImageEditorModal images={lightboxState.images} initialIndex={lightboxState.index} onClose={() => setLightboxState(null)} readOnly={true} />}
    </div>
  );
};
