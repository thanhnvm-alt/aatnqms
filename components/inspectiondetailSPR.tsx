import { getProxyImageUrl } from '../src/utils';
import React, { useState, useRef, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import { Inspection, InspectionStatus, CheckStatus, User, Workshop, canUserModifyInspection, NCRComment } from '../types';
import { ArrowLeft, Box, Edit3, Trash2, ClipboardList, CheckCircle2, AlertOctagon, X, Loader2, Eraser, PenTool } from 'lucide-react';

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
import { TwoTierApproval } from './TwoTierApproval';
import QRCode from 'qrcode';
import { Download, Camera, MessageSquare, Send, ImageIcon as ImageIconLucide } from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';

export const InspectionDetailSPR: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  
  useEffect(() => {
    const generateQR = async () => {
      try {
        const url = `${window.location.origin}/?share=${inspection.id}`;
        const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 200 });
        setQrCodeUrl(dataUrl);
      } catch (err) { console.error(err); }
    };
    generateQR();
  }, [inspection.id]);

  const canModify = !user.role?.includes('GUEST') && canUserModifyInspection(inspection, user);
  const isGuest = user.role === 'GUEST';
  const [managerSig, setManagerSig] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number; context?: string } | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);

  const isApproved = ['APPROVED', 'LOCKED', 'COMPLETED'].includes(String(inspection.status || '').toUpperCase());
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';

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
              return await uploadQMSImage(f, { entityId: inspection.id || 'new', type: 'COMMENT', role: 'ATTACHMENT' });
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

  const handleApprove = async () => {
      if (!managerSig) return alert("Vui lòng ký tên.");
      setIsProcessing(true);
      try { if (onApprove) await onApprove(inspection.id, managerSig); setShowModal(false); onBack(); } catch (e) { alert("Lỗi duyệt."); } finally { setIsProcessing(false); }
  };

  const handleExportPDF = async () => {
      if (!pdfContainerRef.current) return;
      try {
          const dateParts = (inspection.date || '').split('/');
          const dateStr = dateParts.length === 3 ? `${dateParts[0]}${dateParts[1]}${dateParts[2]}` : (inspection.date || '').replace(/\//g, '');
          const filename = `SPR_report_${inspection.ma_ct || 'NA'}_${inspection.headcode || inspection.ma_nha_may || 'NA'}_${dateStr}.pdf`;

          const opt = {
            margin:       0.2,
            filename:     filename,
            image:        { type: 'jpeg' as const, quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' as const }
          };
          html2pdf().set(opt).from(pdfContainerRef.current).save();
      } catch (err: any) {
          console.error(err);
          alert('Không thể xuất PDF: ' + err.message);
      }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-800/50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center gap-2 px-4 md:px-8">
          <div className="flex items-center gap-2.5 min-w-0">
            <button type="button" onClick={onBack} aria-label="Quay lại" className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700 shrink-0"><ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" /></button>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight truncate">Chi tiết hồ sơ SPR</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={handleExportPDF} aria-label="Xuất PDF" className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors"><Download className="w-4 h-4"/></button>
            {canModify && <button type="button" onClick={() => onEdit(inspection.id)} aria-label="Chỉnh sửa" className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-slate-800/80 hover:bg-blue-100 dark:hover:bg-slate-700 rounded-xl transition-colors"><Edit3 className="w-4 h-4"/></button>}
            {canModify && <button type="button" onClick={() => onDelete(inspection.id)} aria-label="Xóa" className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl transition-colors"><Trash2 className="w-4 h-4"/></button>}
          </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-800/50 pb-[calc(env(safe-area-inset-bottom)+5rem)] no-scrollbar">
        <div ref={pdfContainerRef} className="max-w-4xl mx-auto space-y-4">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
                {/* QR Code for Public Verification */}
                {qrCodeUrl && (
                  <div className="absolute left-6 top-6 w-16 h-16 border border-slate-100 p-1 bg-white shadow-sm z-10">
                    <img src={qrCodeUrl} alt="QR Code" className="w-full h-full" />
                    <p className="text-[6px] font-black text-center text-slate-400 mt-1 uppercase tracking-tighter">Scan to verify</p>
                  </div>
                )}
                
                <div className="flex flex-col items-center mb-6 pt-16 sm:pt-4">
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1 text-center">{inspection.ten_ct}</p>
                    <h1 className="text-[14px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight text-center">{inspection.ten_hang_muc}</h1>
                </div>
                <div className="flex flex-wrap justify-between items-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4 mt-4">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">Dự án: {inspection.ma_ct}</p>
                    <div className="text-3xl font-black text-slate-800 dark:text-slate-200 opacity-10">SAMPLE</div>
                </div>
            </div>
            
            <div className="space-y-3">
                {inspection.items.map((item, i) => (
                    <div key={i} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="flex justify-between items-center gap-2 mb-2">
                            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{item.category}</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase shrink-0 ${item.status === CheckStatus.PASS ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800'}`}>{item.status}</span>
                        </div>
                        <p className="font-bold text-[12px] text-slate-800 dark:text-slate-200 tracking-tight">{item.label}</p>
                        {item.notes && <p className="text-[11px] italic text-slate-600 dark:text-slate-300 mt-2 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg leading-relaxed">"{item.notes}"</p>}
                        {item.images && item.images.length > 0 && (
                            <div className="flex gap-2.5 mt-2.5 overflow-x-auto no-scrollbar py-1">
                                {item.images.map((img, imgIdx) => (
                                    <button 
                                        type="button"
                                        key={imgIdx} 
                                        onClick={() => setLightboxState({ images: item.images!, index: imgIdx })} 
                                        aria-label={`Xem ảnh kiểm tra ${imgIdx + 1}`}
                                        className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 cursor-zoom-in shadow-sm hover:shadow-md hover:scale-[1.03] active:scale-95 transition-all duration-200 bg-slate-50 dark:bg-slate-950"
                                    >
                                        <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" alt="Hạng mục kiểm tra" referrerPolicy="no-referrer" />
                                    </button>
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
                                <div className="flex justify-between items-center gap-2 px-1">
                                    <span className="font-black text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-tight">{comment.userName}</span>
                                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest tabular-nums">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-[1.5rem] rounded-tl-none border border-slate-100 dark:border-slate-800 text-[12px] text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap leading-relaxed shadow-sm">{comment.content}</div>
                                {comment.attachments && comment.attachments.length > 0 && (
                                    <div className="flex gap-3 flex-wrap pt-2">
                                        {comment.attachments.map((img, i) => (
                                            <button type="button" key={i} onClick={() => setLightboxState({ images: comment.attachments!, index: i })} aria-label={`Xem ảnh bình luận ${i + 1}`} className="w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm cursor-zoom-in transition-all hover:scale-105 shrink-0">
                                                <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 space-y-4">
                    {commentAttachments.length > 0 && (
                        <div className="flex gap-3 overflow-x-auto no-scrollbar pt-2 pr-2 pb-1">
                            {commentAttachments.map((img, idx) => (
                                <div key={idx} className="relative w-20 h-20 shrink-0 group">
                                    <button type="button" onClick={() => handleEditCommentImage(idx)} aria-label={`Chỉnh sửa ảnh đính kèm ${idx + 1}`} className="w-full h-full rounded-2xl overflow-hidden border-2 border-blue-200 dark:border-slate-700 shadow-lg block">
                                        <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                    </button>
                                    <button type="button" onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))} aria-label="Xóa ảnh đính kèm" className="absolute -top-2 -right-2 w-7 h-7 bg-red-600 text-white rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-all z-10"><X className="w-4 h-4"/></button>
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
                                className="w-full pl-5 pr-28 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2rem] text-[12px] font-bold text-slate-900 dark:text-slate-100 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 outline-none resize-none min-h-[70px] shadow-inner transition-all" 
                            />
                            <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5">
                                <button type="button" onClick={() => commentCameraRef.current?.click()} aria-label="Chụp ảnh" className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition-all" title="Chụp ảnh"><Camera className="w-5 h-5"/></button>
                                <button type="button" onClick={() => commentFileRef.current?.click()} aria-label="Chọn ảnh" className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition-all" title="Chọn ảnh"><ImageIconLucide className="w-5 h-5"/></button>
                            </div>
                        </div>
                        <button type="button" onClick={handlePostComment} disabled={isSubmittingComment || (!newComment.trim() && commentAttachments.length === 0)} aria-label="Gửi bình luận" className="min-w-[52px] min-h-[52px] lg:w-14 lg:h-14 bg-blue-600 text-white rounded-[1.5rem] shadow-xl shadow-blue-500/30 flex items-center justify-center active:scale-95 disabled:opacity-30 transition-all shrink-0 hover:bg-blue-700"><Send className="w-6 h-6" /></button>
                    </div>
                </div>
            </section>
        </div>
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

export default InspectionDetailSPR;
