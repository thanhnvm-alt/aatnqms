
import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, Workshop, NCR } from '../types';
import { 
  ArrowLeft, User as UserIcon, Building2, Box, Edit3, Trash2, X, Maximize2, ShieldCheck,
  MessageSquare, Loader2, Eraser, Send, UserPlus, AlertOctagon, Check, Save,
  Camera, Image as ImageIcon, Paperclip, PenTool
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
  workshops?: Workshop[];
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

const SignaturePad = ({ label, value, onChange, readOnly = false }: { label: string; value?: string; onChange: (base64: string) => void; readOnly?: boolean; }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas && value) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => { ctx?.clearRect(0, 0, canvas.width, canvas.height); ctx?.drawImage(img, 0, 0, canvas.width, canvas.height); };
            img.src = value;
        }
    }, [value]);
    const startDrawing = (e: any) => { if (readOnly) return; const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; ctx.beginPath(); ctx.moveTo(clientX - rect.left, clientY - rect.top); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000000'; setIsDrawing(true); };
    const draw = (e: any) => { if (!isDrawing || readOnly) return; const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; ctx.lineTo(clientX - rect.left, clientY - rect.top); ctx.stroke(); };
    const stopDrawing = () => { if (readOnly) return; setIsDrawing(false); if (canvasRef.current) onChange(canvasRef.current.toDataURL()); };
    const clear = () => { const canvas = canvasRef.current; if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height); onChange(''); } };
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center px-1">
                <label className="block text-slate-700 font-bold text-[9px] uppercase tracking-wide">{label}</label>
                {!readOnly && <button onClick={clear} className="text-[9px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1 hover:underline" type="button"><Eraser className="w-3 h-3"/> Xóa ký lại</button>}
            </div>
            <div className="border border-slate-300 rounded-xl bg-white overflow-hidden relative h-32 shadow-inner">
                <canvas ref={canvasRef} width={400} height={128} className={`w-full h-full ${readOnly ? 'cursor-default' : 'cursor-crosshair touch-none'}`} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                {!value && !readOnly && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[9px] font-bold uppercase tracking-widest">Ký tại đây</div>}
            </div>
        </div>
    );
};

export const InspectionDetailPQC: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [viewingNcr, setViewingNcr] = useState<NCR | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number; context?: any } | null>(null);
  
  const [managerSig, setManagerSig] = useState('');
  const [prodSig, setProdSig] = useState(inspection.productionSignature || '');
  const [prodName, setProdName] = useState(inspection.productionName || '');
  const [prodComment, setProdComment] = useState(inspection.productionComment || '');

  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);

  const isApproved = inspection.status === InspectionStatus.APPROVED || inspection.status === InspectionStatus.COMPLETED;
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isProdSigned = !!inspection.productionSignature;

  const handleManagerApprove = async () => {
      if (!managerSig) return alert("Vui lòng ký tên xác nhận phê duyệt.");
      if (!onApprove) return;
      setIsProcessing(true);
      try { 
          await onApprove(inspection.id, managerSig, { managerName: user.name }); 
          setShowManagerModal(false); 
          onBack(); 
      } 
      catch (e: any) { 
          alert("Lỗi phê duyệt: " + (e.message || "Unknown Error")); 
      } finally { setIsProcessing(false); }
  };

  const handleProductionConfirm = async () => {
      if (!prodSig || !prodName.trim()) return alert("Vui lòng ký và nhập họ tên người xác nhận.");
      if (!onApprove) return;
      setIsProcessing(true);
      try { 
          await onApprove(inspection.id, "", { 
              signature: prodSig, 
              name: prodName.toUpperCase(),
              comment: prodComment
          }); 
          setShowProductionModal(false); 
      } 
      catch (e: any) { 
          alert("Lỗi xác nhận: " + (e.message || "Unknown Error")); 
      } finally { setIsProcessing(false); }
  };

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
      const processed = await Promise.all(Array.from(files).map(async (f: File) => {
          const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(f);
          });
          return resizeImage(base64);
      }));
      setCommentAttachments(prev => [...prev, ...processed]);
      e.target.value = '';
  };

  const handleEditCommentImage = (idx: number) => {
      setLightboxState({ images: commentAttachments, index: idx, context: 'PENDING_COMMENT' });
  };

  const updateCommentImage = (idx: number, newImg: string) => {
      setCommentAttachments(prev => {
          const next = [...prev];
          next[idx] = newImg;
          return next;
      });
  };

  if (viewingNcr) return <NCRDetail ncr={viewingNcr} user={user} onBack={() => setViewingNcr(null)} onViewInspection={() => {}} />;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200"><ArrowLeft className="w-4 h-4 text-slate-600" /></button>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">CHI TIẾT HỒ SƠ PQC</h2>
          </div>
          <div className="flex items-center gap-2">
              {!isApproved && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all" type="button"><Edit3 className="w-4 h-4" /></button>}
              <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all" type="button"><Trash2 className="w-4 h-4" /></button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        <div className="max-w-4xl mx-auto space-y-4 pb-32">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <h1 className="text-xl font-bold text-slate-800 uppercase mb-3 leading-tight">{inspection.ten_hang_muc}</h1>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-50 pb-4">
                    <div><p className="text-slate-400 mb-0.5">Mã Dự án</p><p className="text-slate-800">{inspection.ma_ct}</p></div>
                    <div><p className="text-slate-400 mb-0.5">Xưởng/Công đoạn</p><p className="text-slate-800">{inspection.workshop} - {inspection.inspectionStage}</p></div>
                    <div><p className="text-slate-400 mb-0.5">QC Thẩm định</p><p className="text-slate-800">{inspection.inspectorName}</p></div>
                    <div><p className="text-slate-400 mb-0.5">Ngày thực hiện</p><p className="text-slate-800">{inspection.date}</p></div>
                </div>

                <div className="grid grid-cols-4 gap-2 bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-inner">
                    <div className="text-center border-r border-slate-200"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Số IPO</p><p className="text-sm font-black text-slate-700">{inspection.so_luong_ipo}</p></div>
                    <div className="text-center border-r border-slate-200"><p className="text-[8px] font-black text-blue-500 uppercase mb-1">Kiểm tra</p><p className="text-sm font-black text-blue-600">{inspection.inspectedQuantity}</p></div>
                    <div className="text-center border-r border-slate-200"><p className="text-[8px] font-black text-green-500 uppercase mb-1">Đạt</p><p className="text-sm font-black text-green-600">{inspection.passedQuantity}</p></div>
                    <div className="text-center"><p className="text-[8px] font-black text-red-500 uppercase mb-1">Hỏng</p><p className="text-sm font-black text-red-600">{inspection.failedQuantity}</p></div>
                </div>
            </div>

            <div className="space-y-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Chi tiết tiêu chí kiểm tra</h3>
                {inspection.items.map((item, idx) => (
                    <div key={idx} className={`bg-white p-4 rounded-xl border shadow-sm ${item.status === CheckStatus.FAIL ? 'border-red-200 bg-red-50/5' : 'border-slate-200'}`}>
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex gap-2">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border ${item.status === CheckStatus.PASS ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>{item.status}</span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.category}</span>
                            </div>
                        </div>
                        <p className="text-xs font-bold text-slate-800 uppercase tracking-tight">{item.label}</p>
                        {item.notes && <p className="text-[10px] text-slate-500 mt-1 italic leading-relaxed">"{item.notes}"</p>}
                        {item.images && item.images.length > 0 && (
                            <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar py-1">
                                {item.images.map((img, i) => (
                                    <div key={i} onClick={() => setLightboxState({ images: item.images!, index: i })} className="w-14 h-14 rounded-lg overflow-hidden border border-slate-100 shrink-0 cursor-zoom-in shadow-sm">
                                        <img src={img} className="w-full h-full object-cover" alt="" />
                                    </div>
                                ))}
                            </div>
                        )}
                        {item.ncr && <button onClick={() => setViewingNcr(item.ncr!)} className="mt-2 text-[9px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded flex items-center gap-1 uppercase border border-red-100 hover:bg-red-100"><AlertOctagon className="w-3 h-3"/> Xem hồ sơ NCR</button>}
                    </div>
                ))}
            </div>

            <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-blue-700 border-b border-blue-50 pb-3 font-bold text-[10px] uppercase tracking-[0.2em] flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-500"/> NHẬT KÝ PHÊ DUYỆT ĐIỆN TỬ (ISO)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center space-y-2">
                        <p className="text-[9px] font-bold text-slate-400 mb-1 uppercase tracking-widest">QC Inspector</p>
                        <div className="bg-slate-50 h-28 rounded-xl flex items-center justify-center border border-slate-100 shadow-inner overflow-hidden">
                            {inspection.signature ? <img src={inspection.signature} className="h-full object-contain" alt="" /> : <span className="text-[9px] text-slate-300">N/A</span>}
                        </div>
                        <p className="text-[10px] font-bold text-slate-800 uppercase">{inspection.inspectorName}</p>
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-[9px] font-bold text-slate-400 mb-1 uppercase tracking-widest">Production / Workshop</p>
                        <div className="bg-slate-50 h-28 rounded-xl flex items-center justify-center border border-slate-100 shadow-inner overflow-hidden">
                            {inspection.productionSignature ? <img src={inspection.productionSignature} className="h-full object-contain" alt="" /> : <div className="text-[9px] text-slate-300">Chưa xác nhận</div>}
                        </div>
                        <p className="text-[10px] font-bold text-slate-800 uppercase">{inspection.productionName || '---'}</p>
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-[9px] font-bold text-slate-400 mb-1 uppercase tracking-widest">QA Manager Approval</p>
                        <div className="bg-slate-50 h-28 rounded-xl flex items-center justify-center border border-slate-100 shadow-inner overflow-hidden">
                            {inspection.managerSignature ? <img src={inspection.managerSignature} className="h-full object-contain" alt="" /> : <span className="text-orange-400 text-[10px] font-black uppercase tracking-widest animate-pulse">Đang chờ duyệt</span>}
                        </div>
                        <p className="text-[10px] font-bold text-slate-800 uppercase">{inspection.managerName || '---'}</p>
                    </div>
                </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    <h3 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">Thảo luận nội bộ</h3>
                </div>
                <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto no-scrollbar">
                    {inspection.comments?.map((comment) => (
                        <div key={comment.id} className="flex gap-3 animate-in slide-in-from-left-2 duration-300">
                            <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="w-8 h-8 rounded-lg border border-slate-200 shrink-0 shadow-sm" alt="" />
                            <div className="flex-1 space-y-1.5">
                                <div className="flex justify-between items-center px-1">
                                    <span className="font-bold text-slate-800 text-[10px] uppercase">{comment.userName}</span>
                                    <span className="text-[9px] font-bold text-slate-400">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                                </div>
                                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[11px] text-slate-700 whitespace-pre-wrap">{comment.content}</div>
                                {comment.attachments && comment.attachments.length > 0 && (
                                    <div className="flex gap-2 flex-wrap pt-1">
                                        {comment.attachments.map((img, i) => (
                                            <div key={i} onClick={() => setLightboxState({ images: comment.attachments!, index: i })} className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 shadow-sm cursor-zoom-in transition-transform hover:scale-105 shrink-0">
                                                <img src={img} className="w-full h-full object-cover" alt=""/>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {(!inspection.comments || inspection.comments.length === 0) && <p className="text-center text-[10px] text-slate-400 py-6 italic uppercase tracking-widest">Chưa có ý kiến thảo luận</p>}
                </div>
                <div className="p-3 border-t border-slate-100 bg-slate-50/30 space-y-3">
                    {commentAttachments.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                            {commentAttachments.map((img, idx) => (
                                <div key={idx} className="relative w-16 h-16 shrink-0 group">
                                    <img src={img} className="w-full h-full object-cover rounded-xl border-2 border-blue-200 shadow-md cursor-pointer" onClick={() => handleEditCommentImage(idx)}/>
                                    <button onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 bg-red-500 text-white p-0.5 rounded-full shadow-lg"><X className="w-3 h-3"/></button>
                                    <div className="absolute inset-0 bg-black/10 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none"><PenTool className="w-4 h-4 text-white drop-shadow-md"/></div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-2 items-end">
                        <div className="flex-1 relative">
                            <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Nhập nội dung bình luận..." className="w-full pl-3 pr-24 py-3 bg-white border border-slate-200 rounded-2xl text-[11px] font-medium focus:ring-2 focus:ring-blue-500 outline-none resize-none min-h-[60px] shadow-sm transition-all" />
                            <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
                                <button onClick={() => commentCameraRef.current?.click()} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-xl active:scale-90 transition-all border border-slate-100" title="Chụp ảnh"><Camera className="w-4 h-4"/></button>
                                <button onClick={() => commentFileRef.current?.click()} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-xl active:scale-90 transition-all border border-slate-100" title="Chọn ảnh"><ImageIcon className="w-4 h-4"/></button>
                            </div>
                        </div>
                        <button onClick={handlePostComment} disabled={isSubmittingComment || (!newComment.trim() && commentAttachments.length === 0)} className="w-12 h-12 bg-blue-600 text-white rounded-2xl shadow-xl flex items-center justify-center active:scale-95 disabled:opacity-30 transition-all shrink-0"><Send className="w-5 h-5" /></button>
                    </div>
                </div>
            </section>
        </div>
      </div>

      <div className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200 px-4 py-4 md:px-6 shadow-[0_-10px_25px_rgba(0,0,0,0.05)]">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
              <button onClick={onBack} className="px-6 py-3.5 text-slate-500 font-bold uppercase text-[10px] tracking-widest hover:bg-slate-50 rounded-xl transition-all border border-slate-200 active:scale-95">QUAY LẠI</button>
              <div className="flex gap-3 flex-1 justify-end">
                  {!isProdSigned && !isApproved && <button onClick={() => setShowProductionModal(true)} className="px-5 py-3.5 bg-indigo-50 text-indigo-600 font-black uppercase text-[10px] tracking-widest rounded-xl border border-indigo-200 hover:bg-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2 flex-1 md:flex-none"><UserPlus className="w-3.5 h-3.5" /> SẢN XUẤT XÁC NHẬN</button>}
                  {!isApproved && isManager && <button onClick={() => setShowManagerModal(true)} className="px-10 py-3.5 bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest rounded-xl shadow-xl shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2 flex-1 md:flex-none"><Check className="w-4 h-4" /> PHÊ DUYỆT HỒ SƠ</button>}
              </div>
          </div>
      </div>

      {showManagerModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
                      <div className="flex items-center gap-3"><div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl"><ShieldCheck className="w-5 h-5" /></div><h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">QA Manager Phê Duyệt</h3></div>
                      <button onClick={() => setShowManagerModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6"/></button>
                  </div>
                  <div className="p-6 space-y-5 bg-slate-50/30">
                      <div className="bg-white p-4 rounded-2xl border border-slate-100 text-center shadow-sm"><p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Người phê duyệt hệ thống</p><p className="text-sm font-black text-slate-800 uppercase tracking-tight">{user.name}</p></div>
                      <SignaturePad label="Chữ ký điện tử QA Manager *" value={managerSig} onChange={setManagerSig} />
                  </div>
                  <div className="p-5 border-t border-slate-100 bg-white flex gap-3"><button onClick={() => setShowManagerModal(false)} className="flex-1 py-3.5 text-slate-500 font-bold uppercase text-[10px] hover:bg-slate-50 rounded-2xl transition-all">Đóng lại</button><button onClick={handleManagerApprove} disabled={isProcessing || !managerSig} className="flex-[2] py-3.5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-emerald-200 disabled:opacity-50 active:scale-95 transition-all">{isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : 'XÁC NHẬN PHÊ DUYỆT'}</button></div>
              </div>
          </div>
      )}

      {showProductionModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0"><div className="flex items-center gap-3"><div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl"><UserPlus className="w-5 h-5" /></div><h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">Sản xuất / Xưởng xác nhận</h3></div><button onClick={() => setShowProductionModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6"/></button></div>
                  <div className="p-6 space-y-5 overflow-y-auto no-scrollbar bg-slate-50/30 flex-1">
                      <div className="space-y-4">
                          <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><UserIcon className="w-3 h-3" /> Họ tên người đại diện *</label><input value={prodName} onChange={e => setProdName(e.target.value.toUpperCase())} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl font-black text-sm uppercase outline-none focus:ring-4 ring-indigo-50 shadow-sm" placeholder="NHẬP HỌ TÊN ĐẠI DIỆN XƯỞNG..." /></div>
                          <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><MessageSquare className="w-3 h-3" /> Ghi chú / Ý kiến sản xuất</label><textarea value={prodComment} onChange={e => setProdComment(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl font-medium text-xs outline-none focus:ring-4 ring-indigo-50 h-24 resize-none shadow-sm" placeholder="Ghi chú ý kiến phản hồi từ sản xuất (nếu có)..." /></div>
                          <SignaturePad label="Chữ ký xác nhận đại diện *" value={prodSig} onChange={setProdSig} />
                      </div>
                  </div>
                  <div className="p-6 border-t border-slate-100 bg-white flex gap-4 shrink-0"><button onClick={() => setShowProductionModal(false)} className="flex-1 py-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest hover:bg-slate-50 rounded-2xl">Quay lại</button><button onClick={handleProductionConfirm} disabled={isProcessing || !prodSig || !prodName.trim()} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-indigo-200 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2">{isProcessing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} LƯU XÁC NHẬN</button></div>
              </div>
          </div>
      )}

      {lightboxState && (
          <ImageEditorModal 
              images={lightboxState.images} 
              initialIndex={lightboxState.index} 
              onClose={() => setLightboxState(null)} 
              onSave={lightboxState.context === 'PENDING_COMMENT' ? (idx, newImg) => updateCommentImage(idx, newImg) : undefined}
              readOnly={lightboxState.context !== 'PENDING_COMMENT'} 
          />
      )}
      <input type="file" ref={commentFileRef} className="hidden" multiple accept="image/*" onChange={handleImageUpload} />
      <input type="file" ref={commentCameraRef} className="hidden" capture="environment" accept="image/*" onChange={handleImageUpload} />
    </div>
  );
};
