
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, Workshop, NCR } from '../types';
import { 
  ArrowLeft, User as UserIcon, Building2, Box, Edit3, Trash2, X, Maximize2, ShieldCheck,
  MessageSquare, Loader2, Eraser, Send, UserPlus, AlertOctagon, Check, Save,
  Camera, Image as ImageIcon, Paperclip, PenTool, LayoutList, History, FileText, ChevronRight,
  Factory, Calendar, Activity, Hash, MapPin, Lock, ImagePlus, AlertCircle, Eye, ClipboardList
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
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number; context?: string } | null>(null);
  
  const [managerSig, setManagerSig] = useState('');
  const [prodSig, setProdSig] = useState(inspection.productionSignature || '');
  const [prodName, setProdName] = useState(inspection.productionName || '');
  const [prodComment, setProdComment] = useState(inspection.productionComment || '');

  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);

  // --- ISO RBAC LOGIC (CRITICAL) ---
  const isApproved = inspection.status === InspectionStatus.APPROVED;
  const isManagerOrAdmin = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isOwner = inspection.inspectorName === user.name;
  
  const canModify = isManagerOrAdmin || (isOwner && !isApproved);
  const isLockedForUser = isApproved && !isManagerOrAdmin;

  const stats = useMemo(() => {
    const ins = Number(inspection.inspectedQuantity || 0);
    const pas = Number(inspection.passedQuantity || 0);
    const fai = Number(inspection.failedQuantity || 0);
    const ipo = Number(inspection.so_luong_ipo || 0);
    
    return {
      ipo, ins, pas, fai,
      passRate: ins > 0 ? ((pas / ins) * 100).toFixed(1) : "0.0",
      failRate: ins > 0 ? ((fai / ins) * 100).toFixed(1) : "0.0"
    };
  }, [inspection]);

  const handleManagerApprove = async () => {
      // Logic 1: Kiểm tra trạng thái NCR liên quan
      const pendingNcrs = inspection.items.filter(it => it.ncr && it.ncr.status !== 'CLOSED');
      if (pendingNcrs.length > 0) {
          alert(`CẢNH BÁO: Còn ${pendingNcrs.length} hồ sơ NCR chưa được phê duyệt đóng (CLOSED). Vui lòng xử lý và phê duyệt tất cả NCR trước khi duyệt phiếu PQC này.`);
          return;
      }

      if (!managerSig) return alert("Vui lòng ký tên xác nhận phê duyệt.");
      if (!onApprove) return;
      setIsProcessing(true);
      try { 
          await onApprove(inspection.id, managerSig, { 
              managerName: user.name,
              managerSignature: managerSig 
          }); 
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
              productionSignature: prodSig, 
              productionName: prodName.toUpperCase(),
              productionComment: prodComment,
              productionConfirmedDate: new Date().toISOString()
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

  if (viewingNcr) return <NCRDetail ncr={viewingNcr} user={user} onBack={() => setViewingNcr(null)} onViewInspection={() => {}} />;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 shadow-sm" type="button"><ArrowLeft className="w-4 h-4 text-slate-600" /></button>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Chi tiết hồ sơ PQC</h2>
          </div>
          <div className="flex items-center gap-2">
              {isLockedForUser && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-400 rounded-xl border border-slate-200">
                      <Lock className="w-3.5 h-3.5" />
                      <span className="text-[9px] font-black uppercase tracking-widest">Hồ sơ đã khóa</span>
                  </div>
              )}
              {canModify && (
                  <>
                    <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all" type="button"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all" type="button"><Trash2 className="w-4 h-4" /></button>
                  </>
              )}
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-slate-50">
        <div className="max-w-4xl mx-auto space-y-4 pb-32">
            {/* --- HEADER INFO --- */}
            <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 p-12 opacity-5 pointer-events-none uppercase font-black text-7xl rotate-12 select-none">PQC</div>
                
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em] mb-1">{inspection.ten_ct}</p>
                <h1 className="text-[11px] font-black text-slate-900 uppercase mb-8 leading-tight tracking-tight">{inspection.ten_hang_muc}</h1>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8">
                    <div>
                        <p className="mb-1 flex items-center gap-1.5"><Box className="w-3 h-3"/> MÃ DỰ ÁN</p>
                        <p className="text-[11px] font-bold text-slate-800 tracking-tight uppercase">
                            {inspection.ma_ct || '---'} {inspection.ma_nha_may && `• ${inspection.ma_nha_may}`}
                        </p>
                    </div>
                    <div>
                        <p className="mb-1 flex items-center gap-1.5"><Factory className="w-3 h-3"/> XƯỞNG/CÔNG ĐOẠN</p>
                        <p className="text-[11px] font-bold text-slate-800 tracking-tight">
                            {inspection.workshop || '-'} / {inspection.inspectionStage || '-'}
                        </p>
                    </div>
                    <div>
                        <p className="mb-1 flex items-center gap-1.5"><UserIcon className="w-3 h-3"/> QC THẨM ĐỊNH</p>
                        <p className="text-[11px] font-bold text-slate-800 tracking-tight">
                            {inspection.inspectorName || '---'}
                        </p>
                    </div>
                    <div>
                        <p className="mb-1 flex items-center gap-1.5"><Calendar className="w-3 h-3"/> NGÀY THỰC HIỆN</p>
                        <p className="text-[11px] font-bold text-slate-800 tracking-tight font-mono">
                            {inspection.date}
                        </p>
                    </div>
                </div>

                <div className="bg-slate-50/80 p-5 rounded-[1.5rem] border border-slate-100 shadow-inner">
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                        <div className="text-center md:border-r border-slate-200 space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SỐ IPO</p>
                            <p className="text-lg font-black text-slate-700">{stats.ipo}</p>
                        </div>
                        <div className="text-center md:border-r border-slate-200 space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">KIỂM TRA</p>
                            <p className="text-lg font-black text-blue-600">{stats.ins}</p>
                        </div>
                        <div className="text-center md:border-r border-slate-200 space-y-1">
                            <p className="text-[9px] font-black text-green-600 uppercase tracking-widest">ĐẠT</p>
                            <p className="text-lg font-black text-green-600">{stats.pas}</p>
                        </div>
                        <div className="text-center md:border-r border-slate-200 space-y-1 bg-green-50/50 rounded-xl py-1">
                            <p className="text-[9px] font-black text-green-700 uppercase tracking-widest">TỶ LỆ ĐẠT</p>
                            <p className="text-lg font-black text-green-700">{stats.passRate}%</p>
                        </div>
                        <div className="text-center md:border-r border-slate-200 space-y-1">
                            <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">HỎNG</p>
                            <p className="text-lg font-black text-red-600">{stats.fai}</p>
                        </div>
                        <div className="text-center space-y-1 bg-red-50/50 rounded-xl py-1">
                            <p className="text-[9px] font-black text-red-700 uppercase tracking-widest">TỶ LỆ HỎNG</p>
                            <p className="text-lg font-black text-red-700">{stats.failRate}%</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- HÌNH ÁNH HIỆN TRƯỜNG TỔNG QUÁT --- */}
            <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm space-y-3">
                <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-50 pb-2">
                    <ImageIcon className="w-4 h-4 text-blue-600" /> Hình ảnh hiện trường tổng quát
                </h3>
                {inspection.images && inspection.images.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
                        {inspection.images.map((img, i) => (
                            <div key={i} onClick={() => setLightboxState({ images: inspection.images!, index: i })} className="w-24 h-24 rounded-2xl overflow-hidden border border-slate-100 shrink-0 cursor-zoom-in shadow-sm hover:border-blue-400 transition-all">
                                <img src={img} className="w-full h-full object-cover" alt="" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Không có ảnh hiện trường tổng quát</p>
                    </div>
                )}
            </div>

            {/* --- DANH MỤC TIÊU CHÍ --- */}
            <div className="space-y-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4 flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Chi tiết kết quả kiểm tra
                </h3>
                {inspection.items.map((item, idx) => (
                    <div key={idx} className={`bg-white p-5 rounded-[1.5rem] border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-200 bg-red-50/10' : 'border-slate-200'}`}>
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex flex-wrap gap-2">
                                <span className={`px-3 py-0.5 rounded-lg text-[9px] font-black uppercase border tracking-widest shadow-sm ${item.status === CheckStatus.PASS ? 'text-green-700 bg-green-50 border-green-200' : item.status === CheckStatus.FAIL ? 'text-red-700 bg-red-50 border-red-200' : 'text-amber-600 bg-amber-50 border-amber-200'}`}>{item.status}</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">{item.category}</span>
                            </div>
                        </div>
                        
                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight leading-tight mb-2">{item.label}</p>
                        
                        {item.notes && (
                            <div className="mb-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <p className="text-[11px] text-slate-600 italic leading-relaxed">"{item.notes}"</p>
                            </div>
                        )}
                        
                        {/* Hình ảnh theo tiêu chí */}
                        {item.images && item.images.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 mt-2">
                                {item.images.map((img, i) => (
                                    <div key={i} onClick={() => setLightboxState({ images: item.images!, index: i })} className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 shrink-0 cursor-zoom-in shadow-sm hover:border-blue-400 transition-all">
                                        <img src={img} className="w-full h-full object-cover" alt="" />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* --- SMART NCR LINK CARD --- */}
                        {item.status === CheckStatus.FAIL && (
                            item.ncr ? (
                                <div className="mt-4 p-4 bg-white border-2 border-red-100 rounded-2xl shadow-xl shadow-red-900/5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex justify-between items-center border-b border-red-50 pb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${item.ncr.status === 'CLOSED' ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
                                            <span className={`text-[10px] font-black ${item.ncr.status === 'CLOSED' ? 'text-green-600' : 'text-red-600'} uppercase tracking-widest`}>Hồ sơ không phù hợp (NCR)</span>
                                        </div>
                                        <span className={`text-[8px] font-black px-2 py-0.5 ${item.ncr.status === 'CLOSED' ? 'bg-green-600' : 'bg-red-600'} text-white rounded-full uppercase shadow-sm`}>#{item.ncr.id.split('-').pop()}</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Trạng thái</p>
                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${item.ncr.status === 'CLOSED' ? 'text-green-600 border-green-200 bg-green-50' : 'text-orange-600 border-orange-200 bg-orange-50'}`}>{item.ncr.status}</span>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Mức độ</p>
                                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded border border-red-200 text-red-700 bg-red-50">{item.ncr.severity}</span>
                                        </div>
                                    </div>

                                    <p className="text-[10px] font-bold text-slate-700 line-clamp-2 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100 italic">"{item.ncr.issueDescription}"</p>
                                    
                                    <button 
                                        onClick={() => setViewingNcr(item.ncr || null)} 
                                        className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-black active:scale-95 transition-all shadow-lg shadow-slate-200"
                                    >
                                        <AlertOctagon className="w-4 h-4" />
                                        XEM CHI TIẾT NCR
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-4 p-4 bg-red-50 border border-red-200 border-dashed rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <AlertCircle className="w-5 h-5 text-red-400" />
                                        <div>
                                            <p className="text-[10px] font-black text-red-800 uppercase">Lỗi chưa gán NCR</p>
                                            <p className="text-[9px] text-red-500 font-bold uppercase tracking-tighter">Hệ thống yêu cầu bóc tách NCR cho hạng mục sai lỗi.</p>
                                        </div>
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                ))}
            </div>

            {/* --- APPROVAL LOGS --- */}
            <section className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-8">
                <h3 className="text-blue-700 border-b border-blue-50 pb-4 font-black text-[11px] uppercase tracking-[0.25em] flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-green-500"/> PHÊ DUYỆT ĐIỆN TỬ ISO 9001</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="text-center space-y-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">QC Inspector</p>
                        <div className="bg-slate-50 h-32 rounded-2xl flex items-center justify-center overflow-hidden border border-slate-100 shadow-inner">
                            {inspection.signature ? <img src={inspection.signature} className="h-full object-contain" alt="" /> : <span className="text-[10px] text-slate-300 font-bold uppercase italic">Chưa ký</span>}
                        </div>
                        <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{inspection.inspectorName}</p>
                    </div>
                    <div className="text-center space-y-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Production / Workshop</p>
                        <div className="bg-slate-50 h-32 rounded-2xl flex items-center justify-center border border-slate-100 shadow-inner overflow-hidden">
                            {inspection.productionSignature ? <img src={inspection.productionSignature} className="h-full object-contain" alt="" /> : <div className="text-[10px] text-slate-300 font-bold uppercase italic">N/A</div>}
                        </div>
                        <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{inspection.productionName || '---'}</p>
                    </div>
                    <div className="text-center space-y-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">QA Manager Approval</p>
                        <div className="bg-slate-50 h-32 rounded-2xl flex items-center justify-center border border-slate-100 shadow-inner overflow-hidden">
                            {inspection.managerSignature ? <img src={inspection.managerSignature} className="h-full object-contain" alt="" /> : <span className="text-orange-400 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">Đang chờ duyệt</span>}
                        </div>
                        <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{inspection.managerName || '---'}</p>
                    </div>
                </div>
            </section>

            {/* --- DISCUSSION --- */}
            <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col mb-10">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-blue-600" />
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Thảo luận hồ sơ</h3>
                </div>
                <div className="p-6 space-y-6 max-h-[500px] overflow-y-auto no-scrollbar">
                    {inspection.comments?.map((comment) => (
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
                                        {comment.attachments.map((img, i) => (
                                            <div key={i} onClick={() => setLightboxState({ images: comment.attachments!, index: i })} className="w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 shadow-sm cursor-zoom-in transition-all hover:scale-105 shrink-0">
                                                <img src={img} className="w-full h-full object-cover" alt=""/>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
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

      {/* --- MOBILE-OPTIMIZED BOTTOM ACTION BAR --- */}
      <div className="sticky bottom-0 z-[110] bg-white/95 backdrop-blur-xl border-t border-slate-200 px-2 py-3 shadow-[0_-15px_30px_rgba(0,0,0,0.1)] shrink-0">
          <div className="max-w-4xl mx-auto flex flex-row items-center justify-between gap-2 h-12">
              <button 
                onClick={onBack} 
                className="flex-1 h-full bg-slate-100 text-slate-500 font-black uppercase text-[8px] tracking-tight rounded-xl border border-slate-200 active:scale-95 transition-all flex flex-row items-center justify-center gap-1.5 whitespace-nowrap overflow-hidden px-2"
              >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="whitespace-nowrap">QUAY LẠI</span>
              </button>
              
              {!isApproved && (
                  <button 
                    onClick={() => setShowProductionModal(true)} 
                    className="flex-1 h-full bg-indigo-50 text-indigo-600 font-black uppercase text-[8px] tracking-tight rounded-xl border border-indigo-200 hover:bg-indigo-100 active:scale-95 transition-all flex flex-row items-center justify-center gap-1.5 whitespace-nowrap overflow-hidden px-2 shadow-sm"
                  >
                      <UserPlus className="w-4 h-4" />
                      <span className="whitespace-nowrap">XÁC NHẬN SX</span>
                  </button>
              )}

              {isManagerOrAdmin && !isApproved && (
                  <button 
                    onClick={() => setShowManagerModal(true)} 
                    className="flex-1 h-full bg-emerald-600 text-white font-black uppercase text-[8px] tracking-tight rounded-xl shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 active:scale-95 transition-all flex flex-row items-center justify-center gap-1.5 whitespace-nowrap overflow-hidden px-2 border border-emerald-500"
                  >
                      <Check className="w-4 h-4" />
                      <span className="whitespace-nowrap">PHÊ DUYỆT</span>
                  </button>
              )}
          </div>
      </div>

      {showManagerModal && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                      <div className="flex items-center gap-3"><div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl shadow-inner"><ShieldCheck className="w-6 h-6" /></div><h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">QA Manager Approval</h3></div>
                      <button onClick={() => setShowManagerModal(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors"><X className="w-7 h-7 text-slate-400"/></button>
                  </div>
                  <div className="p-8 space-y-6 bg-slate-50/30">
                      <div className="bg-white p-5 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Authorized System User</p><p className="text-base font-black text-slate-800 uppercase tracking-tight">{user.name}</p></div>
                      <SignaturePad label="Chữ ký điện tử Manager *" value={managerSig} onChange={setManagerSig} />
                  </div>
                  <div className="p-6 border-t bg-white flex gap-4"><button onClick={() => setShowManagerModal(false)} className="flex-1 py-4 text-slate-500 font-black uppercase text-[11px] rounded-2xl hover:bg-slate-50 border border-slate-100 shadow-sm transition-all">Hủy</button><button onClick={handleManagerApprove} disabled={isProcessing || !managerSig} className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-xl shadow-emerald-500/30 disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2">{isProcessing ? <Loader2 className="w-5 h-5 animate-spin"/> : <ShieldCheck className="w-5 h-5"/>} XÁC NHẬN DUYỆT</button></div>
              </div>
          </div>
      )}

      {showProductionModal && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white"><div className="flex items-center gap-3"><UserPlus className="w-6 h-6 text-indigo-600" /><h3 className="font-black text-slate-800 uppercase tracking-tighter text-base">Xác nhận Đại diện Sản xuất</h3></div><button onClick={() => setShowProductionModal(false)}><X className="w-7 h-7 text-slate-400"/></button></div>
                  <div className="p-8 space-y-6 bg-slate-50/30"><div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Họ và tên đại diện *</label><input value={prodName} onChange={e => setProdName(e.target.value.toUpperCase())} className="w-full px-5 py-4 bg-white border border-slate-200 rounded-[1.5rem] font-black text-sm uppercase focus:ring-4 focus:ring-indigo-100 outline-none shadow-sm transition-all h-12" placeholder="NHẬP HỌ TÊN..." /></div><div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Ghi chú / Ý kiến sản xuất</label><textarea value={prodComment} onChange={e => setProdComment(e.target.value)} className="w-full px-5 py-4 bg-white border border-slate-200 rounded-[2rem] font-bold text-xs outline-none focus:ring-4 focus:ring-indigo-100 h-32 resize-none shadow-sm transition-all" placeholder="Nhập ghi chú phản hồi..." /></div><SignaturePad label="Chữ ký xác nhận đại diện *" value={prodSig} onChange={setProdSig} /></div>
                  <div className="p-8 border-t bg-white flex gap-4"><button onClick={() => setShowProductionModal(false)} className="flex-1 py-4 text-slate-500 font-black uppercase text-[11px] rounded-2xl hover:bg-slate-50 border border-slate-100 shadow-sm transition-all">Hủy</button><button onClick={() => setShowProductionModal(false)} disabled={isProcessing || !prodSig || !prodName} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-xl shadow-indigo-500/30 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2">{isProcessing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>} LƯU XÁC NHẬN</button></div>
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