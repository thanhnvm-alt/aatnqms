

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, NCR } from '../types';
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
}

const SignaturePad = ({ label, value, onChange, readOnly = false }: { label: string; value?: string; onChange: (base64: string) => void; readOnly?: boolean; }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas && value) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => { 
                ctx?.clearRect(0, 0, canvas.width, canvas.height);
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height); 
            };
            img.src = value;
        }
    }, [value]);
    const startDrawing = (e: any) => { if (readOnly) return; const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; ctx.beginPath(); ctx.moveTo(clientX - rect.left, clientY - rect.top); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000000'; setIsDrawing(true); };
    const draw = (e: any) => { if (!isDrawing || readOnly) return; const canvas = canvasRef.current; if (canvas) { const ctx = canvas.getContext('2d'); if (!ctx) return; const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; ctx.lineTo(clientX - rect.left, clientY - rect.top); ctx.stroke(); } };
    const stopDrawing = () => { if (readOnly) return; setIsDrawing(false); if (canvasRef.current) onChange(canvasRef.current.toDataURL()); };
    return (
        <div className="flex flex-col gap-1.5">
            <label className="block text-slate-700 font-bold text-[9px] uppercase tracking-wide">{label}</label>
            <div className="border border-slate-300 rounded-xl bg-white overflow-hidden relative h-32 shadow-inner">
                <canvas ref={canvasRef} width={400} height={128} className={`w-full h-full ${readOnly ? 'cursor-default' : 'cursor-crosshair touch-none'}`} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                {!value && !readOnly && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[9px] font-bold uppercase tracking-widest italic">Ký tại đây</div>}
            </div>
        </div>
    );
};

export const InspectionDetailSITE: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment }) => {
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [managerSig, setManagerSig] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewingNcr, setViewingNcr] = useState<NCR | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const isApproved = inspection.status === InspectionStatus.APPROVED;
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isOwner = inspection.inspectorName === user.name;
  const canModify = user.role === 'ADMIN' || (!isApproved && (isManager || isOwner));

  const handleManagerApprove = async () => {
      if (!managerSig) return alert("Vui lòng ký tên xác nhận.");
      setIsProcessing(true);
      try {
          if (onApprove) await onApprove(inspection.id, managerSig, { managerName: user.name });
          setShowManagerModal(false);
          onBack();
      } catch (e) { alert("Lỗi phê duyệt."); } finally { setIsProcessing(false); }
  };

  const handlePostComment = async () => {
    if (!newComment.trim() || !onPostComment) return;
    setIsSubmittingComment(true);
    try {
        await onPostComment(inspection.id, { 
            id: `cmt_${Date.now()}`, 
            userId: user.id, 
            userName: user.name, 
            userAvatar: user.avatar, 
            content: newComment, 
            createdAt: new Date().toISOString()
        } as NCRComment);
        setNewComment('');
    } finally { setIsSubmittingComment(false); }
  };

  if (viewingNcr) return <NCRDetail ncr={viewingNcr} user={user} onBack={() => setViewingNcr(null)} onViewInspection={() => {}} />;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors active:scale-90 border border-slate-200 shadow-sm"><ArrowLeft className="w-4 h-4 text-slate-600" /></button>
              <div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight leading-none">SITE REVIEW REPORT</h2>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${isApproved ? 'bg-green-600 text-white border-green-600' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>{inspection.status}</span>
                    <span className="text-[10px] text-slate-400 font-mono font-bold tracking-tight uppercase">#{inspection.id.split('-').pop()}</span>
                </div>
              </div>
          </div>
          <div className="flex items-center gap-2">
              {canModify && (
                  <>
                    <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all" type="button"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all" type="button"><Trash2 className="w-4 h-4" /></button>
                  </>
              )}
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-32">
        <div className="max-w-4xl mx-auto space-y-4">
            
            {/* Project Overview Card */}
            <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 p-12 opacity-5 pointer-events-none uppercase font-black text-6xl rotate-12 select-none tracking-widest">SITE-QC</div>
                
                <h1 className="text-2xl font-black text-slate-900 uppercase mb-8 leading-tight tracking-tight">{inspection.ten_ct}</h1>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-4">
                    <div><p className="mb-1 flex items-center gap-1.5"><Box className="w-3 h-3"/> MÃ CÔNG TRÌNH</p><p className="text-sm text-slate-800 tracking-tight uppercase">{inspection.ma_ct}</p></div>
                    <div><p className="mb-1 flex items-center gap-1.5"><MapPin className="w-3 h-3"/> VỊ TRÍ LẮP ĐẶT</p><p className="text-sm text-slate-800 tracking-tight">{inspection.location || 'Hồ Chí Minh'}</p></div>
                    <div><p className="mb-1 flex items-center gap-1.5"><UserIcon className="w-3 h-3"/> QC HIỆN TRƯỜNG</p><p className="text-sm text-slate-800 tracking-tight">{inspection.inspectorName}</p></div>
                    <div><p className="mb-1 flex items-center gap-1.5"><Calendar className="w-3 h-3"/> NGÀY KIỂM TRA</p><p className="text-sm text-slate-800 tracking-tight font-mono">{inspection.date}</p></div>
                </div>

                {inspection.coord_x !== undefined && (
                    <div className="mt-4 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Layers className="w-5 h-5 text-blue-500" />
                            <div>
                                <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Spatial Sync Coordinate</p>
                                <p className="text-[11px] font-bold text-slate-500">X: {inspection.coord_x.toFixed(1)}% | Y: {inspection.coord_y?.toFixed(1)}%</p>
                            </div>
                        </div>
                        <div className="px-3 py-1 bg-white rounded-lg border border-blue-200 text-[10px] font-black text-blue-600 uppercase shadow-sm">Verified On Plan</div>
                    </div>
                )}
            </div>

            {/* Visual Evidence Section */}
            {(inspection.images?.length || 0) > 0 && (
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                    <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-50 pb-3">
                        <ImageIcon className="w-4 h-4 text-amber-600" /> Nhật ký hình ảnh hiện trường
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {inspection.images?.map((img, i) => (
                            <div key={i} onClick={() => setLightboxState({ images: inspection.images!, index: i })} className="aspect-square rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:border-amber-400 transition-all cursor-zoom-in relative group">
                                <img src={img} className="w-full h-full object-cover" alt="" />
                                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Maximize2 className="text-white w-6 h-6" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Checklist Content */}
            <div className="space-y-3">
                <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] px-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-amber-600" /> Chi tiết kết quả kiểm tra lắp đặt
                </h3>
                {inspection.items?.map((item, idx) => (
                    <div key={idx} className={`bg-white p-6 rounded-[1.5rem] border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-200 ring-1 ring-red-50/50' : 'border-slate-200'}`}>
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase border shadow-sm ${item.status === CheckStatus.PASS ? 'text-green-700 bg-green-50 border-green-200' : item.status === CheckStatus.FAIL ? 'text-red-700 bg-red-50 border-red-200' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>{item.status}</span>
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">{item.category}</span>
                                </div>
                                <p className="text-[13px] font-black text-slate-800 uppercase tracking-tight leading-tight">{item.label}</p>
                            </div>
                        </div>
                        
                        {item.notes && <p className="text-[11px] text-slate-600 italic leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">"{item.notes}"</p>}
                        
                        {item.images && item.images.length > 0 && (
                            <div className="flex gap-3 overflow-x-auto no-scrollbar py-1 mt-3">
                                {item.images.map((img, i) => (
                                    <div key={i} onClick={() => setLightboxState({ images: item.images!, index: i })} className="w-20 h-20 shrink-0 rounded-2xl overflow-hidden border border-slate-200 cursor-zoom-in relative group shadow-sm transition-transform hover:scale-105">
                                        <img src={img} className="w-full h-full object-cover" alt=""/>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Approval Log */}
            <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
                <h3 className="text-amber-800 border-b border-amber-50 pb-4 font-black text-[11px] uppercase tracking-[0.25em] flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-green-500"/> XÁC NHẬN HỒ SƠ ĐIỆN TỬ (SITE)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="text-center space-y-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">QC Hiện Trường</p>
                        <div className="bg-slate-50 p-4 rounded-[2rem] border border-slate-100 h-32 flex items-center justify-center overflow-hidden shadow-inner">
                            {inspection.signature ? <img src={inspection.signature} className="h-full object-contain" /> : <div className="text-[10px] font-black text-slate-300 uppercase italic">Chưa ký</div>}
                        </div>
                        <p className="text-[12px] font-black text-slate-800 uppercase tracking-tight">{inspection.inspectorName}</p>
                    </div>

                    <div className="text-center space-y-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Quản lý phê duyệt</p>
                        <div className="bg-slate-50 p-4 rounded-[2rem] border border-slate-100 h-32 flex items-center justify-center overflow-hidden shadow-inner">
                            {inspection.managerSignature ? (
                                <img src={inspection.managerSignature} className="h-full object-contain" />
                            ) : <div className="text-[10px] text-orange-400 font-black uppercase tracking-[0.2em] animate-pulse">Waiting for Approval</div>}
                        </div>
                        <p className="text-[12px] font-black text-slate-800 uppercase tracking-tight">{inspection.managerName || 'QA Manager'}</p>
                    </div>
                </div>
            </section>

            {/* Discussion section (Simplified for brevity) */}
            <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col mb-10">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-amber-600" />
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Thảo luận / Ghi chú hệ thống</h3>
                </div>
                <div className="p-6 space-y-4">
                    {inspection.comments?.map((comment) => (
                        <div key={comment.id} className="flex gap-4">
                            <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="w-10 h-10 rounded-xl border border-slate-200 shrink-0" alt="" />
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-black text-slate-800 text-[11px] uppercase">{comment.userName}</span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-2xl rounded-tl-none border border-slate-100 text-[12px] text-slate-700 font-medium whitespace-pre-wrap leading-relaxed shadow-sm">{comment.content}</div>
                            </div>
                        </div>
                    ))}
                    <div className="flex gap-3 items-end pt-4">
                        <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Phản hồi ý kiến về chất lượng lắp đặt..." className="flex-1 pl-5 pr-5 py-4 bg-white border border-slate-200 rounded-[2rem] text-[12px] font-bold focus:ring-4 focus:ring-amber-100 outline-none resize-none min-h-[60px] shadow-inner transition-all" />
                        <button onClick={handlePostComment} disabled={isSubmittingComment || !newComment.trim()} className="w-14 h-14 bg-amber-600 text-white rounded-[1.5rem] shadow-xl shadow-amber-500/30 flex items-center justify-center active:scale-95 disabled:opacity-30 transition-all shrink-0 hover:bg-amber-700"><Send className="w-6 h-6" /></button>
                    </div>
                </div>
            </section>
        </div>
      </div>

      {/* Action Bar */}
      <div className="sticky bottom-0 z-[110] bg-white/95 backdrop-blur-xl border-t border-slate-200 px-4 py-4 shadow-[0_-15px_30px_rgba(0,0,0,0.1)] shrink-0 flex gap-3">
          <button onClick={onBack} className="flex-1 h-14 bg-slate-100 text-slate-500 font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl border border-slate-200 active:scale-95 transition-all">Quay lại</button>
          {isManager && !isApproved && (
              <button onClick={() => setShowManagerModal(true)} className="flex-[2] h-14 bg-amber-600 text-white font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all">PHÊ DUYỆT SITE QC</button>
          )}
      </div>

      {showManagerModal && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                      <div className="flex items-center gap-3"><ShieldCheck className="w-6 h-6 text-amber-600" /><h3 className="font-black text-slate-800 uppercase tracking-tighter text-base">Manager Phê Duyệt</h3></div>
                      <button onClick={() => setShowManagerModal(false)}><X className="w-7 h-7 text-slate-400"/></button>
                  </div>
                  <div className="p-8 space-y-6 bg-slate-50/30">
                      <SignaturePad label="Chữ ký điện tử QA/QC Manager *" value={managerSig} onChange={setManagerSig} />
                  </div>
                  <div className="p-6 border-t bg-white flex gap-4">
                      <button onClick={() => setShowManagerModal(false)} className="flex-1 py-4 text-slate-500 font-black uppercase text-[10px] rounded-2xl hover:bg-slate-50 border border-slate-100 shadow-sm transition-all">Hủy</button>
                      <button onClick={handleManagerApprove} disabled={isProcessing || !managerSig} className="flex-[2] py-4 bg-amber-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-amber-500/30 active:scale-95 transition-all">
                          {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mx-auto"/> : 'XÁC NHẬN DUYỆT'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {lightboxState && <ImageEditorModal images={lightboxState.images} initialIndex={lightboxState.index} onClose={() => setLightboxState(null)} readOnly={true} />}
    </div>
  );
};
