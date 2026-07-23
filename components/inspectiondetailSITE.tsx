import { getProxyImageUrl } from '../src/utils';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import html2pdf from 'html2pdf.js';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, NCR, canUserModifyInspection } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, Map, MapPin, 
  CheckCircle2, Clock, Trash2, Edit3, X, Maximize2, ShieldCheck,
  MessageSquare, Loader2, Eraser, Send, AlertOctagon, 
  ChevronRight, Camera, Image as ImageIcon, PenTool,
  Activity, Save, Check, Layers, AlertCircle, Box, ExternalLink
} from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';
import { NCRDetail } from './NCRDetail';

interface InspectionDetailProps {
  inspection: Inspection;
  user: User;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove?: (id: string, signature: string, extraInfo?: any) => Promise<void>;
  onPostComment?: (id: string, comment: NCRComment) => Promise<void>;
  onViewOnPlan?: (inspection: Inspection) => void;
}

import { SignaturePad } from './SignaturePad';
import { TwoTierApproval } from './TwoTierApproval';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';

export const InspectionDetailSITE: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment, onViewOnPlan }) => {
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

  const [showManagerModal, setShowManagerModal] = useState(false);
  const [managerSig, setManagerSig] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewingNcr, setViewingNcr] = useState<NCR | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<{ id: string; url: string; compressedUrl: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      
      try {
          const { uploadQMSImage } = await import('../services/apiService');
          const processed = await Promise.all(Array.from(files).map(async (f: File) => {
              const result = await uploadQMSImage(f, { entityId: inspection.id || 'new', type: 'COMMENT', role: 'ATTACHMENT' });
              return { id: Math.random().toString(36).substring(7), url: result, compressedUrl: result };
          }));
          setCommentAttachments(prev => [...prev, ...processed]);
      } catch (err) {
          alert('Failed to upload images');
      }
  };

  const isApproved = inspection.status === InspectionStatus.APPROVED;
  const isGuest = user.role === 'GUEST';
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isOwner = inspection.inspectorName === user.name;
  const canModify = !isGuest && canUserModifyInspection(inspection, user);

  const handleExportPDF = async () => {
      if (!pdfContainerRef.current) return;
      try {
          const dateParts = (inspection.date || '').split('/');
          const dateStr = dateParts.length === 3 ? `${dateParts[0]}${dateParts[1]}${dateParts[2]}` : (inspection.date || '').replace(/\//g, '');
          const filename = `SITE_report_${inspection.ma_ct || 'NA'}_${inspection.headcode || inspection.ma_nha_may || 'NA'}_${dateStr}.pdf`;

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

  const handleManagerApprove = async () => {
      if (!managerSig) return alert("Vui lòng ký tên xác nhận.");
      setIsProcessing(true);
      try {
          if (onApprove) await onApprove(inspection.id, managerSig, { 
              managerName: user.name,
              managerSignature: managerSig,
              status: InspectionStatus.APPROVED
          });
          setShowManagerModal(false);
      } catch (e) { alert("Lỗi phê duyệt."); } finally { setIsProcessing(false); }
  };

  const handleManagerReject = async () => {
      const reason = window.prompt("Nhập lý do từ chối hồ sơ SITE QC này:");
      if (reason === null) return;
      if (!reason.trim()) return alert("Vui lòng nhập lý do từ chối.");

      setIsProcessing(true);
      try { 
          if (onApprove) await onApprove(inspection.id, "", { 
              status: InspectionStatus.REJECTED,
              summary: (inspection.summary || "") + "\n\n[LÝ DO TỪ CHỐI]: " + reason 
          }); 
      } 
      catch (e: any) { 
          alert("Lỗi từ chối: " + (e.message || "Unknown Error")); 
      } finally { setIsProcessing(false); }
  };

  const handlePostComment = async () => {
    if ((!newComment.trim() && commentAttachments.length === 0) || !onPostComment) return;
    setIsSubmittingComment(true);
    try {
        await onPostComment(inspection.id, { 
            id: `cmt_${Date.now()}`, 
            userId: user.id, 
            userName: user.name, 
            userAvatar: user.avatar, 
            content: newComment, 
            createdAt: new Date().toISOString(),
            attachments: commentAttachments.map(a => a.url)
        } as NCRComment);
        setNewComment('');
        setCommentAttachments([]);
    } finally { setIsSubmittingComment(false); }
  };

  if (viewingNcr) return <NCRDetail ncr={viewingNcr} user={user} onBack={() => setViewingNcr(null)} onViewInspection={() => setViewingNcr(null)} />;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-800/50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-xl transition-colors active:scale-90 border border-slate-200 dark:border-slate-700 shadow-sm"><ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-400 dark:text-slate-500" /></button>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-none">SITE REVIEW REPORT</h2>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${isApproved ? 'bg-green-600 text-white border-green-600' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>{inspection.status}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono font-bold tracking-tight uppercase">#{inspection.id.split('-').pop()}</span>
                </div>
              </div>
          </div>
          <div className="flex items-center gap-2">
              <button onClick={handleExportPDF} className="p-2 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg active:scale-90 transition-all shadow-sm" type="button"><Download className="w-4 h-4"/></button>
              {canModify && (
                  <>
                    <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-slate-800/80 rounded-xl transition-all" type="button"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-900/20 rounded-xl transition-all" type="button"><Trash2 className="w-4 h-4" /></button>
                  </>
              )}
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-32">
        <div ref={pdfContainerRef} className="max-w-4xl mx-auto space-y-4">
            
            {/* Project Overview Card */}
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
                {/* QR Code for Public Verification */}
                {qrCodeUrl && (
                  <div className="absolute left-6 top-6 w-16 h-16 border border-slate-100 p-1 bg-white shadow-sm z-10">
                    <img src={qrCodeUrl} alt="QR Code" className="w-full h-full" />
                    <p className="text-[6px] font-black text-center text-slate-400 mt-1 uppercase tracking-tighter text-slate-400">Scan to verify</p>
                  </div>
                )}
                
                <div className="absolute right-0 top-0 p-12 opacity-5 pointer-events-none uppercase font-black text-6xl rotate-12 select-none tracking-widest">SITE-QC</div>
                
                <div className="flex flex-col items-center mb-8 pt-6 md:pt-4">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{inspection.ten_ct}</p>
                  <h1 className="text-[14px] font-black text-slate-900 dark:text-slate-100 uppercase leading-tight tracking-tight text-center">BÁO CÁO KIỂM TRA HIỆN TRƯỜNG (SITE-QC)</h1>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-4">
                    <div><p className="mb-1 flex items-center gap-1.5"><Box className="w-3 h-3"/> MÃ CÔNG TRÌNH</p><p className="text-sm text-slate-800 dark:text-slate-200 tracking-tight uppercase">{inspection.ma_ct}</p></div>
                    <div><p className="mb-1 flex items-center gap-1.5"><MapPin className="w-3 h-3"/> VỊ TRÍ LẮP ĐẶT</p><p className="text-sm text-slate-800 dark:text-slate-200 tracking-tight">{inspection.location || 'Hồ Chí Minh'}</p></div>
                    <div><p className="mb-1 flex items-center gap-1.5"><UserIcon className="w-3 h-3"/> QC HIỆN TRƯỜNG</p><p className="text-sm text-slate-800 dark:text-slate-200 tracking-tight">{inspection.inspectorName}</p></div>
                    <div><p className="mb-1 flex items-center gap-1.5"><Calendar className="w-3 h-3"/> NGÀY KIỂM TRA</p><p className="text-sm text-slate-800 dark:text-slate-200 tracking-tight font-mono">
{(() => {
    if (!inspection.date) return '---';
    const strVal = String(inspection.date);
    if (/^\d{10}$/.test(strVal)) return new Date(Number(strVal) * 1000).toLocaleDateString('vi-VN');
    if (/^\d{13}$/.test(strVal)) return new Date(Number(strVal)).toLocaleDateString('vi-VN');
    if (strVal.includes('-')) return strVal.split('-').reverse().join('/');
    return strVal;
})()}
</p></div>
                </div>

                {inspection.coord_x !== undefined && (
                    <div className="mt-4 p-4 bg-blue-50 dark:bg-slate-800/80/50 border border-blue-100 dark:border-slate-700 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Layers className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                            <div>
                                <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Spatial Sync Coordinate</p>
                                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500">X: {inspection.coord_x.toFixed(1)}% | Y: {inspection.coord_y?.toFixed(1)}%</p>
                            </div>
                        </div>
                        <button 
                            type="button"
                            onClick={() => onViewOnPlan?.(inspection)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-[10px] font-black text-white uppercase shadow-sm cursor-pointer rounded-xl flex items-center gap-1.5 transition-all"
                        >
                            <Map className="w-3.5 h-3.5" />
                            <span>Verified On Plan</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Visual Evidence Section */}
            {(inspection.images?.length || 0) > 0 && (
                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                    <h3 className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2 border-b border-slate-50 pb-3">
                        <ImageIcon className="w-4 h-4 text-amber-600" /> Nhật ký hình ảnh hiện trường
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {inspection.images?.map((img, i) => (
                            <div key={i} onClick={() => setLightboxState({ images: inspection.images!, index: i })} className="aspect-square rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm hover:border-amber-400 transition-all cursor-zoom-in relative group">
                                <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" alt="" />
                                <div className="absolute inset-0 bg-black/10 md:opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Maximize2 className="text-white w-6 h-6" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Checklist Content */}
            <div className="space-y-3">
                <h3 className="text-[11px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-amber-600" /> Chi tiết kết quả kiểm tra lắp đặt
                </h3>
                {inspection.items?.map((item, idx) => (
                    <div key={idx} className={`bg-white dark:bg-slate-900 p-6 rounded-[1.5rem] border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-200 ring-1 ring-red-50/50' : 'border-slate-200 dark:border-slate-700'}`}>
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase border shadow-sm ${item.status === CheckStatus.PASS ? 'text-green-700 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : item.status === CheckStatus.FAIL ? 'text-red-700 bg-red-50 dark:bg-red-900/20 border-red-200' : 'text-slate-600 dark:text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'}`}>{item.status}</span>
                                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 px-2 py-0.5 rounded-lg border border-slate-100 dark:border-slate-800">{item.category}</span>
                                </div>
                                <p className="text-[13px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight leading-tight">{item.label}</p>
                            </div>
                        </div>
                        
                        {item.notes && <p className="text-[11px] text-slate-600 dark:text-slate-400 dark:text-slate-500 italic leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">"{item.notes}"</p>}
                        
                        {item.images && item.images.length > 0 && (
                            <div className="flex gap-3 overflow-x-auto no-scrollbar py-1 mt-3">
                                {item.images.map((img, i) => (
                                    <div key={i} onClick={() => setLightboxState({ images: item.images!, index: i })} className="w-20 h-20 shrink-0 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 cursor-zoom-in relative group shadow-sm transition-transform hover:scale-105">
                                        <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" alt=""/>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <TwoTierApproval inspection={inspection} user={user} onApprove={onApprove!} />

            {/* Discussion section */}
            <section className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col mb-10">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50/50 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-amber-600" />
                    <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Thảo luận / Ghi chú hệ thống</h3>
                </div>
                <div className="p-6 space-y-4">
                    {inspection.comments?.map((comment) => (
                        <div key={comment.id} className="flex gap-4">
                            <img src={getProxyImageUrl(comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`)} className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0" alt="" />
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-black text-slate-800 dark:text-slate-200 text-[11px] uppercase">{comment.userName}</span>
                                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-800 text-[12px] text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap leading-relaxed shadow-sm">
                                    <p>{comment.content}</p>
                                    {comment.attachments && comment.attachments.length > 0 && (
                                        <div className="grid grid-cols-3 gap-2 mt-2">
                                            {comment.attachments.map((url, i) => (
                                                <img key={i} src={getProxyImageUrl(url)} className="rounded-lg w-full aspect-square object-cover" alt="attachment" />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {commentAttachments.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 py-2">
                            {commentAttachments.map((att, i) => (
                                <div key={att.id} className="relative aspect-square">
                                    <img 
                                        src={att.compressedUrl} 
                                        className="rounded-lg w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" 
                                        alt="attachment" 
                                        onClick={() => setLightboxState({ images: commentAttachments.map(a => a.compressedUrl), index: i })}
                                    />
                                    <button onClick={() => setCommentAttachments(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X className="w-3 h-3"/></button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-3 items-end pt-4">
                        <input type="file" multiple accept="image/*" onChange={handleImageChange} className="hidden" ref={fileInputRef} />
                        <button onClick={() => fileInputRef.current?.click()} className="p-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-[2rem] hover:bg-slate-200 dark:bg-slate-700 transition-all"><Camera className="w-6 h-6"/></button>
                        <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Phản hồi ý kiến về chất lượng lắp đặt..." className="flex-1 pl-5 pr-5 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2rem] text-[12px] font-bold focus:ring-4 focus:ring-amber-100 outline-none resize-none min-h-[60px] shadow-inner transition-all" />
                        <button onClick={handlePostComment} disabled={isSubmittingComment || (!newComment.trim() && commentAttachments.length === 0)} className="w-14 h-14 bg-amber-600 hover:bg-amber-700 text-white rounded-[1.5rem] shadow-xl shadow-amber-500/30 flex items-center justify-center active:scale-95 disabled:opacity-30 transition-all shrink-0"><Send className="w-6 h-6" /></button>
                    </div>
                </div>
            </section>
        </div>
      </div>

      {/* Action Bar */}
      <div className="sticky bottom-0 z-[110] bg-white dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700 px-4 py-4 shadow-[0_-15px_30px_rgba(0,0,0,0.1)] shrink-0 flex gap-3">
          <button onClick={onBack} className="w-full h-14 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl border border-slate-200 dark:border-slate-700 active:scale-95 transition-all">Quay lại</button>
      </div>

      {lightboxState && <ImageEditorModal images={lightboxState.images} initialIndex={lightboxState.index} onClose={() => setLightboxState(null)} readOnly={true} />}
    </div>
  );
};
