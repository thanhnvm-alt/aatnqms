import { getProxyImageUrl } from '../src/utils';
import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, Workshop, NCR, canUserModifyInspection } from '../types';
import { ArrowLeft, Calendar, User as UserIcon, Box, Edit3, Trash2, ShieldCheck, Palette, Layers, CheckCircle2, AlertOctagon, X, Loader2, Eraser } from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';
import { TwoTierApproval } from './TwoTierApproval';

interface InspectionDetailProps {
  inspection: Inspection;
  user: User;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove?: (id: string, signature: string) => Promise<void>;
  onPostComment?: (id: string, comment: NCRComment) => Promise<void>;
  workshops?: Workshop[];
}

import { SignaturePad } from './SignaturePad';
import { compressImage } from '../src/utils';
import { Send, Camera, MessageSquare, Image as ImageIcon } from 'lucide-react';

export const InspectionDetailStepVecni: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment }) => {
  const canModify = canUserModifyInspection(inspection, user);
  const isApproved = inspection.status === InspectionStatus.APPROVED;

  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number; context?: string } | null>(null);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);

  const handlePostComment = async () => {
    if (!newComment.trim() && commentAttachments.length === 0) return;
    if (!onPostComment) return;
    setIsSubmittingComment(true);
    try {
        await onPostComment(inspection.id, { 
            id: `cmt_${Date.now()}`, 
            userId: user.id, 
            userName: user.name, 
            userAvatar: user.avatar, 
            content: newComment, 
            createdAt: new Date().toISOString(),
            attachments: commentAttachments
        } as any);
        setNewComment('');
        setCommentAttachments([]);
    } catch (e: any) { alert("Lỗi gửi bình luận: " + e.message); } finally { setIsSubmittingComment(false); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      try {
          const { uploadQMSImage } = await import('../services/apiService');
          const processed = await Promise.all(Array.from(files).map(async (f: File) => {
              const compressed = await compressImage(f, 500);
              return await uploadQMSImage(compressed, { entityId: inspection.id || 'new', type: 'COMMENT', role: 'ATTACHMENT' });
          }));
          setCommentAttachments(prev => [...prev, ...processed]);
      } catch (err) {
          alert("Lỗi tải ảnh lên.");
      }
      e.target.value = '';
  };

  const updateCommentImage = (idx: number, newImg: string) => {
      setCommentAttachments(prev => {
          const next = [...prev];
          next[idx] = newImg;
          return next;
      });
  };

  const handleEditCommentImage = (idx: number) => {
      setLightboxState({ images: commentAttachments, index: idx, context: 'PENDING_COMMENT' });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-800/50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2"><button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700"><ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-400 dark:text-slate-500" /></button><span className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase">STEP VECNI REPORT</span></div>
          <div className="flex gap-2">
            {canModify && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-slate-800/80 rounded-lg"><Edit3 className="w-4 h-4"/></button>}
            {canModify && <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4"/></button>}
          </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-800/50 pb-24 no-scrollbar">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-purple-100 shadow-sm">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 uppercase mb-2 flex items-center gap-2"><Palette className="w-5 h-5 text-purple-600"/> {inspection.ten_hang_muc}</h1>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-600 dark:text-slate-400 dark:text-slate-500">
                <p>Dự án: {inspection.ma_ct}</p>
                <p>Xưởng: {inspection.workshop || 'N/A'}</p>
            </div>
        </div>
        <div className="space-y-3">
            {inspection.items.map((item, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-1"><span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">{item.category}</span>
                    {/* Fixed: Changed 'Pass' string to CheckStatus.PASS enum to fix unintentional comparison error */}
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase ${item.status === CheckStatus.PASS ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-500 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200'}`}>{item.status}</span></div>
                    <p className="font-bold text-[11px] text-slate-800 dark:text-slate-200">{item.label}</p>
                    {item.notes && <p className="text-[10px] italic text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">"{item.notes}"</p>}
                    {item.images && item.images.length > 0 && (
                        <div className="flex gap-2.5 mt-2.5 overflow-x-auto no-scrollbar py-1">
                            {item.images.map((img, imgIdx) => (
                                <div 
                                    key={imgIdx} 
                                    onClick={() => setLightboxState({ images: item.images!, index: imgIdx })} 
                                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800 shrink-0 cursor-zoom-in shadow-sm hover:shadow-md hover:scale-[1.03] active:scale-95 transition-all duration-200 bg-slate-50 dark:bg-slate-950"
                                >
                                    <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" alt="Hạng mục kiểm tra" referrerPolicy="no-referrer" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
        <TwoTierApproval inspection={inspection} user={user} onApprove={onApprove!} />

        {/* --- DISCUSSION SECTION --- */}
        <section className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col mb-10">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Thảo luận hồ sơ</h3>
            </div>
            <div className="p-6 space-y-6 max-h-[500px] overflow-y-auto no-scrollbar">
                {inspection.comments?.map((comment) => (
                    <div key={comment.id} className="flex gap-4 animate-in slide-in-from-left-2 duration-300">
                        <img src={getProxyImageUrl(comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`)} className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0 shadow-sm" alt="" referrerPolicy="no-referrer" />
                        <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <span className="font-black text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-tight">{comment.userName}</span>
                                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-[1.5rem] rounded-tl-none border border-slate-100 dark:border-slate-800 text-[12px] text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap leading-relaxed shadow-sm">{comment.content}</div>
                            {comment.attachments && comment.attachments.length > 0 && (
                                <div className="flex gap-3 flex-wrap pt-2">
                                    {comment.attachments.map((img, i) => (
                                        <div key={i} onClick={() => setLightboxState({ images: comment.attachments!, index: i })} className="w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm cursor-zoom-in transition-all hover:scale-105 shrink-0">
                                            <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 space-y-4">
                {commentAttachments.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
                        {commentAttachments.map((img, idx) => (
                            <div key={idx} className="relative w-20 h-20 shrink-0 group">
                                <img src={getProxyImageUrl(img)} className="w-full h-full object-cover rounded-2xl border-2 border-blue-200 dark:border-slate-700 shadow-lg cursor-pointer" onClick={() => handleEditCommentImage(idx)} referrerPolicy="no-referrer" />
                                <button onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1.5 -right-1.5 bg-red-600 text-white p-1 rounded-full shadow-xl active:scale-90 transition-all"><X className="w-4 h-4"/></button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex gap-3 items-end">
                    <div className="flex-1 relative">
                        <textarea 
                            value={newComment} 
                            onChange={(e) => setNewComment(e.target.value)} 
                            placeholder="Nhập ý kiến phản hồi về chất lượng sản phẩm..." 
                            className="w-full pl-5 pr-28 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2rem] text-[12px] font-bold focus:ring-4 focus:ring-blue-100 outline-none resize-none min-h-[70px] shadow-inner transition-all" 
                        />
                        <div className="absolute right-3 bottom-3 flex items-center gap-2">
                            <button onClick={() => commentCameraRef.current?.click()} className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-slate-800/80 rounded-xl transition-all" title="Chụp ảnh"><Camera className="w-5 h-5"/></button>
                            <button onClick={() => commentFileRef.current?.click()} className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-slate-800/80 rounded-xl transition-all" title="Chọn ảnh"><ImageIcon className="w-5 h-5"/></button>
                        </div>
                    </div>
                    <button onClick={handlePostComment} disabled={isSubmittingComment || (!newComment.trim() && commentAttachments.length === 0)} className="w-14 h-14 bg-blue-600 text-white rounded-[1.5rem] shadow-xl shadow-blue-500/30 flex items-center justify-center active:scale-95 disabled:opacity-30 transition-all shrink-0 hover:bg-blue-700"><Send className="w-6 h-6" /></button>
                </div>
            </div>
        </section>
      </div>

      <input type="file" ref={commentFileRef} className="hidden" multiple accept="image/*" onChange={handleImageUpload} />
      <input type="file" ref={commentCameraRef} className="hidden" capture="environment" accept="image/*" onChange={handleImageUpload} />

      {lightboxState && (
          <ImageEditorModal 
              images={lightboxState.images} 
              initialIndex={lightboxState.index} 
              onClose={() => setLightboxState(null)} 
              onSave={lightboxState.context === 'PENDING_COMMENT' ? (idx, updated) => updateCommentImage(idx, updated) : undefined}
              readOnly={lightboxState.context !== 'PENDING_COMMENT'} 
          />
      )}
    </div>
  );
};

export default InspectionDetailStepVecni;
