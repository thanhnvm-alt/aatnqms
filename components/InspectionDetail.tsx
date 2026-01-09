
import React, { useState, useRef } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, CheckItem } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, MapPin, 
  Box, AlertTriangle, CheckCircle2, Clock, 
  MessageSquare, Camera, Paperclip, Send, Loader2,
  Trash2, Edit3, X, Maximize2, Plus, Info
} from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';

interface InspectionDetailProps {
  inspection: Inspection;
  user: User;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
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

export const InspectionDetail: React.FC<InspectionDetailProps> = ({ 
  inspection, 
  user, 
  onBack, 
  onEdit, 
  onDelete 
}) => {
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);

  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);
  // Unused refs for now but kept for consistency if needed later or remove errors
  const ncrAfterFileRef = useRef<HTMLInputElement>(null); 
  const ncrAfterCameraRef = useRef<HTMLInputElement>(null);

  const handlePostComment = async () => {
      if (!newComment.trim() && commentAttachments.length === 0) return;
      setIsSubmittingComment(true);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // TODO: Implement actual comment saving logic to API/DB
      alert("Tính năng bình luận đang được phát triển.");
      
      setNewComment('');
      setCommentAttachments([]);
      setIsSubmittingComment(false);
  };

  const handleCommentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      
      const processed = await Promise.all(Array.from(files).map(async (f: File) => {
          return new Promise<string>(resolve => {
              const reader = new FileReader();
              reader.onloadend = () => {
                  resizeImage(reader.result as string).then(resolve);
              };
              reader.readAsDataURL(f);
          });
      }));
      
      setCommentAttachments(prev => [...prev, ...processed]);
      e.target.value = ''; // Reset input
  };

  const handleRemoveCommentAttachment = (index: number) => {
      setCommentAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddAfterImage = () => {
      // Placeholder for NCR resolution image logic if moved here
  };

  const getStatusColor = (status: CheckStatus) => {
      switch (status) {
          case CheckStatus.PASS: return 'text-green-600 bg-green-50 border-green-200';
          case CheckStatus.FAIL: return 'text-red-600 bg-red-50 border-red-200';
          case CheckStatus.CONDITIONAL: return 'text-orange-600 bg-orange-50 border-orange-200';
          default: return 'text-slate-500 bg-slate-100 border-slate-200';
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-3">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors active:scale-90">
                  <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Chi tiết phiếu kiểm tra</h2>
                  <p className="text-[10px] text-slate-400 font-mono font-bold">{inspection.id}</p>
              </div>
          </div>
          <div className="flex items-center gap-2">
              <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors active:scale-90 border border-transparent hover:border-blue-100">
                  <Edit3 className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors active:scale-90 border border-transparent hover:border-red-100">
                  <Trash2 className="w-4 h-4" />
              </button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar pb-24">
        
        {/* Overview Card */}
        <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                <Box className="w-32 h-32" />
            </div>
            
            <div className="relative z-10">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm ${
                                inspection.status === InspectionStatus.APPROVED ? 'bg-green-600 text-white border-green-600' :
                                inspection.status === InspectionStatus.FLAGGED ? 'bg-red-600 text-white border-red-600' :
                                'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                                {inspection.status}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{inspection.type}</span>
                        </div>
                        <h1 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tight leading-tight mt-2">
                            {inspection.ten_hang_muc}
                        </h1>
                        <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mt-1">{inspection.ten_ct}</p>
                    </div>
                    
                    <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <div className="text-center px-2">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Điểm số</p>
                            <p className={`text-2xl font-black leading-none mt-1 ${
                                inspection.score >= 90 ? 'text-green-600' : inspection.score >= 70 ? 'text-blue-600' : 'text-red-600'
                            }`}>{inspection.score}</p>
                        </div>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <div className="text-center px-2">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lỗi (NCR)</p>
                            <p className="text-2xl font-black text-slate-800 leading-none mt-1">
                                {inspection.items.filter(i => i.status === CheckStatus.FAIL).length}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Box className="w-3 h-3"/> Mã dự án</p>
                        <p className="text-xs font-bold text-slate-700 mt-1">{inspection.ma_ct}</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><MapPin className="w-3 h-3"/> Nhà máy</p>
                        <p className="text-xs font-bold text-slate-700 mt-1">{inspection.ma_nha_may || '---'}</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><UserIcon className="w-3 h-3"/> Người kiểm</p>
                        <p className="text-xs font-bold text-slate-700 mt-1">{inspection.inspectorName}</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Calendar className="w-3 h-3"/> Ngày kiểm</p>
                        <p className="text-xs font-bold text-slate-700 mt-1">{inspection.date}</p>
                    </div>
                </div>
            </div>
        </div>

        {/* Check Items List */}
        <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest px-2">Chi tiết hạng mục kiểm tra</h3>
            {inspection.items.map((item, idx) => (
                <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${getStatusColor(item.status)}`}>
                                    {item.status}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{item.category}</span>
                            </div>
                            <p className="text-sm font-bold text-slate-800 leading-snug">{item.label}</p>
                            
                            {item.notes && (
                                <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 font-medium italic flex gap-2">
                                    <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                    {item.notes}
                                </div>
                            )}

                            {/* NCR Link */}
                            {item.ncr && (
                                <div className="mt-2 p-3 bg-red-50 rounded-xl border border-red-100 flex items-center gap-3">
                                    <div className="p-2 bg-white rounded-lg shadow-sm text-red-500"><AlertTriangle className="w-4 h-4"/></div>
                                    <div>
                                        <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Phát hiện lỗi (NCR)</p>
                                        <p className="text-xs font-bold text-red-800 line-clamp-1">{item.ncr.issueDescription}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Images */}
                    {item.images && item.images.length > 0 && (
                        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 no-scrollbar">
                            {item.images.map((img, i) => (
                                <div key={i} onClick={() => setLightboxState({ images: item.images || [], index: i })} className="w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-slate-200 relative group cursor-zoom-in">
                                    <img src={img} className="w-full h-full object-cover" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>

        {/* Comments Section */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Thảo luận & Ghi chú</h3>
            </div>
            
            <div className="p-6">
                <div className="space-y-6 mb-6">
                    {inspection.comments?.map((comment) => (
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
                                            <img key={idx} src={att} onClick={() => setLightboxState({ images: comment.attachments!, index: idx })} className="w-16 h-16 object-cover rounded-xl border border-slate-200 cursor-zoom-in" />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {(!inspection.comments || inspection.comments.length === 0) && <p className="text-center text-xs text-slate-400 italic">Chưa có bình luận nào.</p>}
                </div>

                {/* Comment Input */}
                <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
                    {commentAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-3 pb-2">
                            {commentAttachments.map((att, idx) => (
                                <div key={idx} className="relative w-20 h-20 shrink-0 group">
                                    <img src={att} className="w-full h-full object-cover rounded-xl border-2 border-blue-100 shadow-md" />
                                    <button onClick={() => handleRemoveCommentAttachment(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-colors"><X className="w-3 h-3" /></button>
                                </div>
                            ))}
                            <button onClick={() => commentFileRef.current?.click()} className="w-20 h-20 rounded-xl border-2 border-dashed border-blue-200 flex items-center justify-center text-blue-500 bg-blue-50/50 hover:bg-blue-50 transition-colors"><Plus className="w-6 h-6" /></button>
                        </div>
                    )}
                    <div className="flex items-start gap-4">
                        <img src={user.avatar} className="w-10 h-10 rounded-2xl border border-slate-200 bg-slate-100 shrink-0 object-cover shadow-sm hidden sm:block" alt="" />
                        <div className="flex-1 relative">
                            <textarea 
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Viết ghi chú review hoặc thảo luận kỹ thuật..."
                                className="w-full pl-4 pr-24 py-4 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-medium focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-500 outline-none transition-all resize-none shadow-inner min-h-[60px]"
                                rows={2}
                            />
                            <div className="absolute right-3 bottom-2.5 flex items-center gap-1">
                                <button onClick={() => commentCameraRef.current?.click()} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="Chụp ảnh"><Camera className="w-5 h-5" /></button>
                                <button onClick={() => commentFileRef.current?.click()} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="Đính kèm tệp"><Paperclip className="w-5 h-5" /></button>
                                <button 
                                    onClick={handlePostComment}
                                    disabled={isSubmittingComment || (!newComment.trim() && commentAttachments.length === 0)}
                                    className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/30 hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95"
                                >
                                    {isSubmittingComment ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

      </div>

      {lightboxState && <ImageEditorModal images={lightboxState.images} initialIndex={lightboxState.index} onClose={() => setLightboxState(null)} readOnly={true} />}
      
      {/* Hidden Inputs */}
      <input type="file" ref={ncrAfterFileRef} className="hidden" multiple accept="image/*" onChange={handleAddAfterImage} />
      <input type="file" ref={ncrAfterCameraRef} className="hidden" capture="environment" accept="image/*" onChange={handleAddAfterImage} />
      <input type="file" ref={commentFileRef} className="hidden" multiple accept="image/*" onChange={handleCommentFileChange} />
      <input type="file" ref={commentCameraRef} className="hidden" capture="environment" accept="image/*" onChange={handleCommentFileChange} />
    </div>
  );
};
