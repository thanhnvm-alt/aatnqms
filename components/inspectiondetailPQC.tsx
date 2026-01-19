
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, Workshop, NCR } from '../types';
import { 
  ArrowLeft, User as UserIcon, Building2, Box, Edit3, Trash2, X, Maximize2, ShieldCheck,
  MessageSquare, Loader2, Eraser, Send, UserPlus, AlertOctagon, Check, Save,
  Camera, Image as ImageIcon, Paperclip, PenTool, LayoutList, History, FileText, ChevronRight,
  Factory, Calendar, Activity
} from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';
import { NCRDetail } from './NCRDetail';
import { saveComment, fetchComments } from '../services/apiService';

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

  const [activeComments, setActiveComments] = useState<NCRComment[]>(inspection.comments || []);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);

  const isApproved = inspection.status === InspectionStatus.APPROVED || inspection.status === InspectionStatus.COMPLETED;
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isProdSigned = !!inspection.productionSignature;

  // Sync comments on load
  useEffect(() => {
      fetchComments(inspection.id).then(setActiveComments);
  }, [inspection.id]);

  // --- STATISTICS CALCULATIONS ---
  const stats = useMemo(() => {
    const ins = Number(inspection.inspectedQuantity || 0);
    const pas = Number(inspection.passedQuantity || 0);
    const fai = Number(inspection.failedQuantity || 0);
    const ipo = Number(inspection.so_luong_ipo || 0);
    
    return {
      ipo,
      ins,
      pas,
      fai,
      passRate: ins > 0 ? ((pas / ins) * 100).toFixed(1) : "0.0",
      failRate: ins > 0 ? ((fai / ins) * 100).toFixed(1) : "0.0"
    };
  }, [inspection]);

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
    setIsSubmittingComment(true);
    try {
        const commentToSave: NCRComment = { 
            id: `cmt_${Date.now()}`, 
            userId: user.id, 
            userName: user.name, 
            userAvatar: user.avatar, 
            content: newComment, 
            createdAt: new Date().toISOString(),
            attachments: commentAttachments
        };
        await saveComment(inspection.id, commentToSave);
        
        // Refresh local UI state
        const refreshed = await fetchComments(inspection.id);
        setActiveComments(refreshed);
        
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
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 shadow-sm" type="button"><ArrowLeft className="w-4 h-4 text-slate-600" /></button>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Chi tiết hồ sơ PQC</h2>
          </div>
          <div className="flex items-center gap-2">
              {!isApproved && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all" type="button"><Edit3 className="w-4 h-4" /></button>}
              <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all" type="button"><Trash2 className="w-4 h-4" /></button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-slate-50">
        <div className="max-w-4xl mx-auto space-y-4 pb-32">
            
            {/* --- HEADER INFO SECTION --- */}
            <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 p-12 opacity-5 pointer-events-none uppercase font-black text-7xl rotate-12 select-none">PQC</div>
                <h1 className="text-2xl font-black text-slate-900 uppercase mb-6 leading-tight tracking-tight">{inspection.ten_hang_muc}</h1>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-8">
                    <div><p className="mb-1 flex items-center gap-1.5"><Box className="w-3 h-3"/> Mã dự án</p><p className="text-sm text-slate-800 tracking-tight">{inspection.ma_ct || '---'}</p></div>
                    <div><p className="mb-1 flex items-center gap-1.5"><Factory className="w-3 h-3"/> Xưởng/Công đoạn</p><p className="text-sm text-slate-800 tracking-tight">{inspection.workshop || '-'} / {inspection.inspectionStage || '-'}</p></div>
                    <div><p className="mb-1 flex items-center gap-1.5"><UserIcon className="w-3 h-3"/> QC Thẩm định</p><p className="text-sm text-slate-800 tracking-tight">{inspection.inspectorName || '---'}</p></div>
                    <div><p className="mb-1 flex items-center gap-1.5"><Calendar className="w-3 h-3"/> Ngày thực hiện</p><p className="text-sm text-slate-800 tracking-tight font-mono">{inspection.date}</p></div>
                </div>
                <div className="bg-slate-50/80 p-5 rounded-[1.5rem] border border-slate-100 shadow-inner">
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                        <div className="text-center md:border-r border-slate-200 space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Số IPO</p><p className="text-lg font-black text-slate-700">{stats.ipo}</p></div>
                        <div className="text-center md:border-r border-slate-200 space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Kiểm tra</p><p className="text-lg font-black text-blue-600">{stats.ins}</p></div>
                        <div className="text-center md:border-r border-slate-200 space-y-1"><p className="text-[9px] font-black text-green-600 uppercase tracking-widest">Đạt</p><p className="text-lg font-black text-green-600">{stats.pas}</p></div>
                        <div className="text-center md:border-r border-slate-200 space-y-1 bg-green-50/50 rounded-xl py-1"><p className="text-[9px] font-black text-green-700 uppercase tracking-widest">Tỷ lệ đạt</p><p className="text-lg font-black text-green-700">{stats.passRate}%</p></div>
                        <div className="text-center md:border-r border-slate-200 space-y-1"><p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Hỏng</p><p className="text-lg font-black text-red-600">{stats.fai}</p></div>
                        <div className="text-center space-y-1 bg-red-50/50 rounded-xl py-1"><p className="text-[9px] font-black text-red-700 uppercase tracking-widest">Tỷ lệ hỏng</p><p className="text-lg font-black text-red-700">{stats.failRate}%</p></div>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4 flex items-center gap-2"><Activity className="w-4 h-4" /> Chi tiết tiêu chí kiểm tra</h3>
                {inspection.items.map((item, idx) => (
                    <div key={idx} className={`bg-white p-5 rounded-[1.5rem] border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-200 bg-red-50/10' : 'border-slate-200'}`}>
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex flex-wrap gap-2">
                                <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border tracking-widest shadow-sm ${item.status === CheckStatus.PASS ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>{item.status}</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">{item.category}</span>
                            </div>
                        </div>
                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight leading-tight">{item.label}</p>
                        {item.notes && <p className="text-[11px] text-slate-500 mt-2 italic leading-relaxed border-l-2 border-slate-100 pl-3">"{item.notes}"</p>}
                        {item.images && item.images.length > 0 && (
                            <div className="flex gap-2 mt-4 overflow-x-auto no-scrollbar py-1">
                                {item.images.map((img, i) => (
                                    <div key={i} onClick={() => setLightboxState({ images: item.images!, index: i })} className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 shrink-0 cursor-zoom-in shadow-sm hover:border-blue-300 transition-all"><img src={img} className="w-full h-full object-cover" alt="" /></div>
                                ))}
                            </div>
                        )}
                        {item.ncr && (
                            <div className="mt-4 p-4 bg-red-50/50 rounded-2xl border border-red-100 space-y-3 hover:bg-red-50 transition-colors">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-black text-red-600 uppercase flex items-center gap-1.5"><FileText className="w-4 h-4"/> Hồ sơ không phù hợp (NCR)</span>
                                    <button onClick={() => setViewingNcr(item.ncr!)} className="px-3 py-1 bg-white border border-red-200 text-[9px] font-black text-red-600 uppercase rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm flex items-center gap-1">Xem chi tiết <ChevronRight className="w-3 h-3"/></button>
                                </div>
                                <p className="text-[11px] font-bold text-slate-600 italic leading-relaxed line-clamp-2">"{item.ncr.issueDescription}"</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Electronic Approval */}
            <section className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-8">
                <h3 className="text-blue-700 border-b border-blue-50 pb-4 font-black text-[11px] uppercase tracking-[0.25em] flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-green-500"/> XÁC NHẬN PHÊ DUYỆT ĐIỆN TỬ (ISO 9001)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="text-center space-y-3"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">QC Inspector</p><div className="bg-slate-50 h-32 rounded-2xl flex items-center justify-center overflow-hidden border border-slate-100 shadow-inner">{inspection.signature ? <img src={inspection.signature} className="h-full object-contain" alt="" /> : <span className="text-[10px] text-slate-300 font-bold uppercase italic">Chưa ký</span>}</div><p className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{inspection.inspectorName}</p></div>
                    <div className="text-center space-y-3"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Production / Workshop</p><div className="bg-slate-50 h-32 rounded-2xl flex items-center justify-center border border-slate-100 shadow-inner overflow-hidden">{inspection.productionSignature ? <img src={inspection.productionSignature} className="h-full object-contain" alt="" /> : <div className="text-[10px] text-slate-300 font-bold uppercase italic">N/A</div>}</div><p className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{inspection.productionName || '---'}</p></div>
                    <div className="text-center space-y-3"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">QA Manager Approval</p><div className="bg-slate-50 h-32 rounded-2xl flex items-center justify-center border border-slate-100 shadow-inner overflow-hidden">{inspection.managerSignature ? <img src={inspection.managerSignature} className="h-full object-contain" alt="" /> : <span className="text-orange-400 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">Đang chờ duyệt</span>}</div><p className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{inspection.managerName || '---'}</p></div>
                </div>
            </section>

            {/* Internal Feedback Section - ISO Independent Comment Table Flow */}
            <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col mb-10">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-blue-600" />
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Thảo luận hồ sơ (Independent Audit Log)</h3>
                </div>
                <div className="p-6 space-y-6 max-h-[500px] overflow-y-auto no-scrollbar">
                    {activeComments.map((comment) => (
                        <div key={comment.id} className="flex gap-4 animate-in slide-in-from-left-2 duration-300">
                            <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="w-10 h-10 rounded-xl border border-slate-200 shrink-0 shadow-sm" alt="" />
                            <div className="flex-1 space-y-2">
                                <div className="flex justify-between items-center px-1"><span className="font-black text-slate-800 text-[11px] uppercase tracking-tight">{comment.userName}</span><span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span></div>
                                <div className="bg-slate-50 p-4 rounded-[1.5rem] rounded-tl-none border border-slate-100 text-[12px] text-slate-700 font-medium whitespace-pre-wrap leading-relaxed shadow-sm">{comment.content}</div>
                                {comment.attachments && comment.attachments.length > 0 && (
                                    <div className="flex gap-3 flex-wrap pt-2">
                                        {comment.attachments.map((img, i) => (
                                            <div key={i} onClick={() => setLightboxState({ images: comment.attachments!, index: i })} className="w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 shadow-sm cursor-zoom-in transition-all hover:scale-105 shrink-0"><img src={img} className="w-full h-full object-cover" alt=""/></div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {activeComments.length === 0 && <p className="text-center text-[10px] text-slate-300 py-10 font-black uppercase tracking-[0.3em]">Hệ thống chưa ghi nhận ý kiến</p>}
                </div>
                <div className="p-4 bg-slate-50/50 border-t border-slate-100 space-y-4">
                    {commentAttachments.length > 0 && (
                        <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
                            {commentAttachments.map((img, idx) => (
                                <div key={idx} className="relative w-20 h-20 shrink-0 group"><img src={img} className="w-full h-full object-cover rounded-2xl border-2 border-blue-200 shadow-lg cursor-pointer" onClick={() => handleEditCommentImage(idx)}/><button onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1.5 -right-1.5 bg-red-600 text-white p-1 rounded-full shadow-xl active:scale-90 transition-all"><X className="w-4 h-4"/></button></div>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-3 items-end">
                        <div className="flex-1 relative">
                            <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Nhập ý kiến phản hồi về chất lượng sản phẩm..." className="w-full pl-5 pr-28 py-4 bg-white border border-slate-200 rounded-[2rem] text-[12px] font-bold focus:ring-4 focus:ring-blue-100 outline-none resize-none min-h-[70px] shadow-inner transition-all" />
                            <div className="absolute right-3 bottom-3 flex items-center gap-2">
                                <button onClick={() => commentCameraRef.current?.click()} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-transparent hover:border-blue-100 active:scale-90" title="Chụp ảnh"><Camera className="w-5 h-5"/></button>
                                <button onClick={() => commentFileRef.current?.click()} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-transparent hover:border-blue-100 active:scale-90" title="Chọn ảnh"><ImageIcon className="w-5 h-5"/></button>
                            </div>
                        </div>
                        <button onClick={handlePostComment} disabled={isSubmittingComment || (!newComment.trim() && commentAttachments.length === 0)} className="w-14 h-14 bg-blue-600 text-white rounded-[1.5rem] shadow-xl shadow-blue-500/30 flex items-center justify-center active:scale-95 disabled:opacity-30 transition-all shrink-0 hover:bg-blue-700"><Send className="w-6 h-6" /></button>
                    </div>
                </div>
            </section>
        </div>
      </div>

      <div className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200 px-4 py-5 md:px-8 shadow-[0_-15px_30px_rgba(0,0,0,0.08)] shrink-0">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-6">
              <button onClick={onBack} className="px-8 py-4 text-slate-500 font-black uppercase text-[11px] tracking-widest hover:bg-slate-50 rounded-2xl transition-all border border-slate-200 active:scale-95 shadow-sm">QUAY LẠI</button>
              <div className="flex gap-4 flex-1 justify-end">
                  {!isProdSigned && !isApproved && <button onClick={() => setShowProductionModal(true)} className="px-6 py-4 bg-indigo-50 text-indigo-600 font-black uppercase text-[11px] tracking-[0.15em] rounded-2xl border border-indigo-200 hover:bg-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2 flex-1 md:flex-none shadow-sm"><UserPlus className="w-4 h-4" /> SẢN XUẤT XÁC NHẬN</button>}
                  {!isApproved && isManager && <button onClick={() => setShowManagerModal(true)} className="px-12 py-4 bg-emerald-600 text-white font-black uppercase text-[11px] tracking-[0.2em] rounded-2xl shadow-2xl shadow-emerald-500/30 hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2 flex-1 md:flex-none"><Check className="w-5 h-5" /> PHÊ DUYỆT HỒ SƠ</button>}
              </div>
          </div>
      </div>

      {/* Lightbox / Modals */}
      {showManagerModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white"><div className="flex items-center gap-3"><div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl shadow-inner"><ShieldCheck className="w-6 h-6" /></div><h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">QA Manager Approval</h3></div><button onClick={() => setShowManagerModal(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors"><X className="w-7 h-7"/></button></div>
                  <div className="p-8 space-y-6 bg-slate-50/30"><div className="bg-white p-5 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Authorized System User</p><p className="text-base font-black text-slate-800 uppercase tracking-tight">{user.name}</p></div><SignaturePad label="Chữ ký điện tử phê duyệt *" value={managerSig} onChange={setManagerSig} /></div>
                  <div className="p-6 border-t border-slate-100 bg-white flex gap-4"><button onClick={() => setShowManagerModal(false)} className="flex-1 py-4 text-slate-500 font-black uppercase text-[11px] tracking-widest hover:bg-slate-50 rounded-2xl transition-all">Hủy</button><button onClick={handleManagerApprove} disabled={isProcessing || !managerSig} className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-xl shadow-emerald-500/30 disabled:opacity-50 active:scale-95 transition-all">{isProcessing ? <Loader2 className="w-5 h-5 animate-spin mx-auto"/> : 'XÁC NHẬN PHÊ DUYỆT'}</button></div>
              </div>
          </div>
      )}

      {showProductionModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0"><div className="flex items-center gap-3"><div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl shadow-inner"><UserPlus className="w-6 h-6" /></div><h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">Sản xuất / Xưởng xác nhận</h3></div><button onClick={() => setShowProductionModal(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors"><X className="w-7 h-7"/></button></div>
                  <div className="p-8 space-y-6 overflow-y-auto no-scrollbar bg-slate-50/30 flex-1">
                      <div className="space-y-5">
                          <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-1.5"><UserIcon className="w-4 h-4 text-indigo-500" /> Họ tên người đại diện *</label><input value={prodName} onChange={e => setProdName(e.target.value.toUpperCase())} className="w-full px-5 py-4 bg-white border border-slate-200 rounded-[1.5rem] font-black text-sm uppercase outline-none focus:ring-4 ring-indigo-50 shadow-sm transition-all" placeholder="NHẬP HỌ TÊN ĐẠI DIỆN XƯỞNG..." /></div>
                          <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-1.5"><MessageSquare className="w-4 h-4 text-indigo-500" /> Ý kiến phản hồi / Ghi chú</label><textarea value={prodComment} onChange={e => setProdComment(e.target.value)} className="w-full px-5 py-4 bg-white border border-slate-200 rounded-[2rem] font-bold text-xs outline-none focus:ring-4 ring-indigo-50 h-32 resize-none shadow-sm transition-all" placeholder="Ghi chú phản hồi từ sản xuất (nếu có)..." /></div>
                          <SignaturePad label="Chữ ký xác nhận đại diện *" value={prodSig} onChange={setProdSig} />
                      </div>
                  </div>
                  <div className="p-8 border-t border-slate-100 bg-white flex gap-4 shrink-0"><button onClick={() => setShowProductionModal(false)} className="flex-1 py-4 text-slate-500 font-black uppercase text-[11px] tracking-widest hover:bg-slate-50 rounded-2xl transition-all">Hủy</button><button onClick={handleProductionConfirm} disabled={isProcessing || !prodSig || !prodName.trim()} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-xl shadow-indigo-500/30 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-3">{isProcessing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>} LƯU XÁC NHẬN</button></div>
              </div>
          </div>
      )}

      {lightboxState && (
          <ImageEditorModal 
              images={lightboxState.images} 
              initialIndex={lightboxState.index} 
              onClose={() => setLightboxState(null)} 
              onSave={lightboxState.context === 'PENDING_COMMENT' ? (idx, updated) => updateCommentImage(idx, updated) : undefined}
              readOnly={lightboxState.context !== 'PENDING_COMMENT'} 
          />
      )}
      <input type="file" ref={commentFileRef} className="hidden" multiple accept="image/*" onChange={handleImageUpload} />
      <input type="file" ref={commentCameraRef} className="hidden" capture="environment" accept="image/*" onChange={handleImageUpload} />
    </div>
  );
};
