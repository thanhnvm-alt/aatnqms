
import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, NCR, NCRComment, Workshop } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, MapPin, 
  Box, AlertTriangle, CheckCircle2, Clock, 
  MessageSquare, Camera, Paperclip, Send, Loader2,
  Trash2, Edit3, X, Maximize2, ShieldCheck,
  CheckCircle, Image as ImageIcon, LayoutList, AlertOctagon,
  Eraser, ChevronRight, Building2, UserCheck, Tag, MessageCircle, UserPlus, Signature as SignatureIcon
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

    const startDrawing = (e: any) => {
        if (readOnly) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000000';
        setIsDrawing(true);
    };

    const draw = (e: any) => {
        if (!isDrawing || readOnly) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (readOnly) return;
        setIsDrawing(false);
        if (canvasRef.current) onChange(canvasRef.current.toDataURL());
    };

    const clear = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            onChange('');
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center px-1">
                <label className="block text-slate-700 font-black uppercase text-[10px] tracking-widest">{label}</label>
                {!readOnly && <button onClick={clear} className="text-[10px] font-bold text-red-500 uppercase flex items-center gap-1 hover:underline" type="button"><Eraser className="w-3 h-3"/> Xóa ký lại</button>}
            </div>
            <div className="border border-slate-300 rounded-[2rem] bg-white overflow-hidden relative h-40 shadow-inner">
                <canvas ref={canvasRef} width={400} height={160} className={`w-full h-full ${readOnly ? 'cursor-default' : 'cursor-crosshair touch-none'}`} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                {!value && !readOnly && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] font-black uppercase tracking-widest">Ký tại đây</div>}
            </div>
        </div>
    );
};

export const InspectionDetailPQC: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment, workshops = [] }) => {
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  
  // Modal states
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Form states for modals
  const [managerSig, setManagerSig] = useState('');
  const [prodSig, setProdSig] = useState(inspection.productionSignature || '');
  const [prodName, setProdName] = useState(inspection.productionName || '');
  const [prodComment, setProdComment] = useState('');

  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  const [viewingNcr, setViewingNcr] = useState<NCR | null>(null);

  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isApproved = inspection.status === InspectionStatus.APPROVED || inspection.status === InspectionStatus.COMPLETED;
  const workshopDisplay = workshops.find(w => w.code === inspection.workshop)?.name || inspection.workshop || 'N/A';

  const handleManagerApprove = async () => {
    if (!managerSig) { alert("Vui lòng ký tên phê duyệt."); return; }
    if (!onApprove) return;
    setIsProcessing(true);
    try {
        await onApprove(inspection.id, managerSig, { managerName: user.name });
        setShowManagerModal(false);
        onBack();
    } catch (e) { alert("Lỗi phê duyệt."); } finally { setIsProcessing(false); }
  };

  const handleProductionConfirm = async () => {
    if (!prodSig || !prodName.trim() || !prodComment.trim()) {
        alert("Vui lòng điền đầy đủ họ tên, nhận xét và ký tên.");
        return;
    }
    if (!onApprove) return;
    setIsProcessing(true);
    try {
        // Lưu thông tin sản xuất qua metadata
        await onApprove(inspection.id, "", { 
            signature: prodSig, 
            name: prodName.toUpperCase(), 
            pmComment: prodComment // Dùng chung field comment để hiển thị dưới chữ ký
        });
        setShowProductionModal(false);
        alert("Đã ghi nhận xác nhận sản xuất.");
    } catch (e) { alert("Lỗi xác nhận."); } finally { setIsProcessing(false); }
  };

  const handlePostComment = async () => {
      if (!newComment.trim() || !onPostComment) return;
      setIsSubmittingComment(true);
      try {
          await onPostComment(inspection.id, { 
              id: Date.now().toString(), 
              userId: user.id, 
              userName: user.name, 
              userAvatar: user.avatar, 
              content: newComment, 
              createdAt: new Date().toISOString() 
          });
          setNewComment('');
      } catch (e) { alert("Lỗi gửi phản hồi."); } finally { setIsSubmittingComment(false); }
  };

  const InfoRow = ({ icon: Icon, label, value, iconColor = "text-slate-400" }: any) => (
      <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
              <Icon className={`w-3.5 h-3.5 ${iconColor}`}/> {label}
          </p>
          <p className="text-xs font-black text-slate-800 uppercase">{value || '---'}</p>
      </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt' }}>
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 p-5 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2.5 hover:bg-slate-100 rounded-2xl transition-colors border border-slate-100 shadow-sm" type="button"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
              <div>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none">PQC DETAIL</h2>
                  <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${isApproved ? 'bg-green-600 text-white border-green-600' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>{inspection.status}</span>
                      <span className="text-[10px] text-slate-400 font-mono font-bold tracking-tighter uppercase">{inspection.id}</span>
                  </div>
              </div>
          </div>
          <div className="flex items-center gap-2">
              {!isApproved && <button onClick={() => onEdit(inspection.id)} className="p-3 text-blue-600 hover:bg-blue-50 rounded-2xl transition-all" type="button"><Edit3 className="w-5 h-5" /></button>}
              <button onClick={() => onDelete(inspection.id)} className="p-3 text-red-600 hover:bg-red-50 rounded-2xl transition-all" type="button"><Trash2 className="w-5 h-5" /></button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-8 no-scrollbar bg-slate-50/50 pb-32">
        <div className="bg-white rounded-[3rem] p-8 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-2">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-3">PQC Overview</p>
                    <h1 className="text-2xl md:text-3xl font-black text-slate-800 uppercase tracking-tighter leading-tight">{inspection.ten_hang_muc}</h1>
                    <p className="text-sm font-bold text-slate-500 mt-2 uppercase">{inspection.ten_ct}</p>
                </div>
                <div className="bg-slate-50 rounded-[2rem] p-5 flex flex-col items-center justify-center border border-slate-100 shadow-inner text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">SCORE</p>
                    <p className={`text-4xl font-black ${inspection.score >= 90 ? 'text-green-600' : 'text-red-600'}`}>{inspection.score}</p>
                </div>
                <div className="bg-slate-50 rounded-[2rem] p-5 flex flex-col items-center justify-center border border-slate-100 shadow-inner text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">NCR RECORDED</p>
                    <p className="text-4xl font-black text-red-600">{(inspection.items || []).filter(i => i.status === CheckStatus.FAIL).length}</p>
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-10 pt-10 border-t border-slate-100">
                <InfoRow icon={Box} label="Mã Dự Án / PO" value={inspection.ma_ct} />
                <InfoRow icon={Tag} label="Mã Định Danh (HC)" value={inspection.ma_nha_may} />
                <InfoRow icon={Building2} label="Xưởng sản xuất" value={workshopDisplay} iconColor="text-blue-500" />
                <InfoRow icon={Calendar} label="Kiểm ngày" value={inspection.date} />
            </div>
        </div>

        <section className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm space-y-5">
            <h3 className="text-slate-800 font-black text-xs uppercase tracking-[0.2em] flex items-center gap-3 border-b border-slate-50 pb-4"><ImageIcon className="w-5 h-5 text-blue-500"/> Hình ảnh hiện trường</h3>
            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                {inspection.images?.map((img, idx) => (
                    <div key={idx} className="relative w-40 h-40 rounded-[2.5rem] overflow-hidden border border-slate-200 shrink-0 group cursor-zoom-in shadow-sm hover:shadow-md transition-all" onClick={() => setLightboxState({ images: inspection.images!, index: idx })}>
                        <img src={img} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Maximize2 className="text-white w-8 h-8" /></div>
                    </div>
                ))}
            </div>
        </section>

        <div className="space-y-6">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] px-4 flex items-center gap-3"><LayoutList className="w-5 h-5 text-indigo-500" /> Nội dung thẩm định (Công đoạn: {inspection.inspectionStage || 'N/A'})</h3>
            {(inspection.items || []).map((item, idx) => (
                <div key={idx} className={`bg-white p-6 md:p-8 rounded-[3rem] border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-200 ring-4 ring-red-50' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between gap-4 mb-6 pb-6 border-b border-slate-50">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-3">
                                <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase border shadow-sm ${
                                    item.status === CheckStatus.PASS ? 'text-green-700 bg-green-50 border-green-200' : 
                                    item.status === CheckStatus.FAIL ? 'text-red-700 bg-red-50 border-red-200' : 'text-slate-500 bg-slate-50 border-slate-100'
                                }`}>{item.status}</span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.category}</span>
                            </div>
                            <p className="text-base font-black text-slate-800 uppercase tracking-tight leading-snug">{item.label}</p>
                        </div>
                    </div>
                    
                    {item.ncr && (
                        <div 
                            onClick={() => setViewingNcr(item.ncr || null)}
                            className="mb-8 p-6 bg-red-50/50 rounded-[2rem] border border-red-100 space-y-4 shadow-inner hover:bg-red-100/50 transition-all cursor-pointer group"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-red-600 uppercase flex items-center gap-2 tracking-widest"><AlertOctagon className="w-5 h-5"/> Phiếu sai lỗi NCR chi tiết</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-red-500 bg-white px-3 py-1 rounded-full border border-red-100">{item.ncr.severity}</span>
                                    <ChevronRight className="w-4 h-4 text-red-400 group-hover:translate-x-1 transition-transform" />
                                </div>
                            </div>
                            <p className="text-sm font-bold text-slate-700 leading-relaxed italic bg-white p-4 rounded-2xl border border-red-50">"{item.ncr.issueDescription}"</p>
                        </div>
                    )}

                    {item.images && item.images.length > 0 && (
                        <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
                            {item.images.map((img, i) => (
                                <div key={i} onClick={() => setLightboxState({ images: item.images!, index: i })} className="w-24 h-24 shrink-0 rounded-[1.5rem] overflow-hidden border border-slate-200 relative group cursor-zoom-in shadow-sm">
                                    <img src={img} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Maximize2 className="text-white w-6 h-6" /></div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>

        {/* LOGGED SIGNATURES (ISO LOG) */}
        <section className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm space-y-10">
            <h3 className="text-blue-700 border-b border-blue-50 pb-5 font-black text-xs uppercase tracking-[0.2em] flex items-center gap-3"><ShieldCheck className="w-6 h-6 text-green-500"/> NHẬT KÝ PHÊ DUYỆT (ISO)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                {/* QC Block */}
                <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-500 pl-3">QC Thực Hiện</p>
                    <div className="bg-slate-50 p-4 rounded-3xl h-44 flex items-center justify-center overflow-hidden border border-slate-100 shadow-inner">
                        {inspection.signature ? <img src={inspection.signature} className="h-full object-contain" /> : <div className="text-[10px] text-slate-300 font-bold uppercase">N/A</div>}
                    </div>
                    <div className="text-center font-black uppercase text-[10px] text-slate-400 mb-1 tracking-widest">Họ và tên QC</div>
                    <div className="text-center font-black uppercase text-sm text-slate-800">{inspection.inspectorName}</div>
                </div>

                {/* Manager Block */}
                <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-emerald-500 pl-3">QA Manager</p>
                    <div className="bg-slate-50 p-4 rounded-3xl h-44 flex items-center justify-center overflow-hidden border border-slate-100 shadow-inner">
                        {inspection.managerSignature ? <img src={inspection.managerSignature} className="h-full object-contain" /> : <div className="text-[10px] text-orange-400 font-black uppercase tracking-widest animate-pulse">ĐANG CHỜ DUYỆT</div>}
                    </div>
                    <div className="text-center font-black uppercase text-[10px] text-slate-400 mb-1 tracking-widest">Cấp phê duyệt</div>
                    <div className="text-center font-black uppercase text-sm text-slate-800">{inspection.managerName || 'Manager Approval'}</div>
                </div>

                {/* Production Block */}
                <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-indigo-500 pl-3">Xưởng Sản Xuất</p>
                    <div className="bg-slate-50 p-4 rounded-3xl h-44 flex flex-col items-center justify-center overflow-hidden border border-slate-100 shadow-inner relative group">
                        {inspection.productionSignature ? (
                            <img src={inspection.productionSignature} className="h-full object-contain" />
                        ) : (
                            <div className="text-[10px] text-slate-300 font-black uppercase tracking-widest">CHƯA XÁC NHẬN</div>
                        )}
                    </div>
                    <div className="text-center font-black uppercase text-[10px] text-slate-400 mb-1 tracking-widest">Xác nhận xưởng</div>
                    <div className="text-center font-black uppercase text-sm text-slate-800">{inspection.productionName || '---'}</div>
                    
                    {inspection.pmComment && (
                        <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 mt-2">
                             <div className="flex items-center gap-2 mb-1">
                                <MessageCircle className="w-3 h-3 text-indigo-400" />
                                <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Ghi chú xưởng</span>
                             </div>
                             <p className="text-xs font-bold text-indigo-700 italic leading-relaxed">
                                "{inspection.pmComment}"
                             </p>
                        </div>
                    )}
                </div>
            </div>
        </section>

        {/* Discussions Area */}
        <section className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col mt-8">
            <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                <MessageSquare className="w-6 h-6 text-blue-600" />
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">Trao đổi nội bộ & Audit Trail</h3>
            </div>
            <div className="p-8 space-y-8 max-h-[500px] overflow-y-auto no-scrollbar">
                {inspection.comments?.map((comment) => (
                    <div key={comment.id} className="flex gap-5 animate-in slide-in-from-left-2 duration-300">
                        <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}&background=random`} className="w-12 h-12 rounded-2xl border border-slate-200 shrink-0 shadow-sm" alt="" />
                        <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <span className="font-black text-slate-800 text-[11px] uppercase tracking-tight">{comment.userName}</span>
                                <span className="text-[9px] font-bold text-slate-400 font-mono">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                            </div>
                            <div className="bg-slate-50 p-5 rounded-[2rem] rounded-tl-none border border-slate-100 shadow-sm text-sm text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">
                                {comment.content}
                            </div>
                        </div>
                    </div>
                ))}
                {(!inspection.comments || inspection.comments.length === 0) && (
                    <div className="py-10 text-center text-slate-400 italic text-sm">Chưa có thảo luận nào cho báo cáo này.</div>
                )}
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50/30">
                <div className="flex gap-3">
                    <textarea 
                        value={newComment} onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Nhập nội dung thảo luận hoặc chỉ thị phê duyệt..."
                        className="flex-1 p-4 bg-white border border-slate-200 rounded-[1.5rem] text-sm font-medium focus:ring-4 ring-blue-100 outline-none resize-none shadow-inner h-24 transition-all"
                    />
                    <button 
                        onClick={handlePostComment} disabled={isSubmittingComment || !newComment.trim()}
                        className="w-14 h-14 bg-blue-600 text-white rounded-[1.5rem] shadow-xl shadow-blue-500/30 flex items-center justify-center active:scale-90 disabled:opacity-50 transition-all shrink-0 mt-auto"
                        type="button"
                    >
                        {isSubmittingComment ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                </div>
            </div>
        </section>
      </div>

      {/* BOTTOM ACTIONS */}
      {!isApproved && (
          <div className="fixed bottom-0 left-0 right-0 p-6 md:p-8 border-t border-slate-200 bg-white/90 backdrop-blur-xl flex flex-wrap justify-center gap-4 z-40 shadow-[0_-15px_40px_rgba(0,0,0,0.1)]">
              <button 
                onClick={() => setShowProductionModal(true)} 
                className="px-6 py-4 bg-indigo-50 text-indigo-700 font-black uppercase text-[10px] tracking-widest border border-indigo-200 rounded-2xl flex items-center gap-2 hover:bg-indigo-100 transition-all active:scale-95 shadow-sm"
              >
                  <UserPlus className="w-4 h-4"/> Xưởng Xác Nhận
              </button>
              
              {isManager && (
                  <button 
                    onClick={() => setShowManagerModal(true)} 
                    className="px-10 py-4 bg-emerald-600 text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all"
                  >
                      <ShieldCheck className="w-5 h-5"/> Manager Phê Duyệt
                  </button>
              )}
              
              <button onClick={onBack} className="px-6 py-4 text-slate-500 font-black uppercase text-[10px] tracking-[0.2em] hover:bg-slate-50 rounded-2xl transition-all">Quay lại</button>
          </div>
      )}

      {/* MODAL: QA/QC MANAGER APPROVE */}
      {showManagerModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <ShieldCheck className="w-5 h-5 text-emerald-600" />
                          <h3 className="font-black text-slate-800 uppercase tracking-tighter">QA/QC Manager Phê Duyệt</h3>
                      </div>
                      <button onClick={() => setShowManagerModal(false)}><X className="w-5 h-5 text-slate-400"/></button>
                  </div>
                  <div className="p-8 space-y-6">
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cấp Phê Duyệt</p>
                          <p className="text-base font-black text-slate-800 uppercase">{user.name}</p>
                      </div>
                      <SignaturePad label="Chữ ký điện tử Manager" value={managerSig} onChange={setManagerSig} />
                  </div>
                  <div className="p-6 border-t bg-slate-50/50 flex gap-3">
                      <button onClick={() => setShowManagerModal(false)} className="flex-1 py-3 text-slate-500 font-bold uppercase text-[10px]">Hủy bỏ</button>
                      <button 
                        onClick={handleManagerApprove} disabled={isProcessing || !managerSig}
                        className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
                      >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : 'DUYỆT & HOÀN TẤT'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL: PRODUCTION CONFIRM */}
      {showProductionModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <UserPlus className="w-5 h-5 text-indigo-600" />
                          <h3 className="font-black text-slate-800 uppercase tracking-tighter">Xác Nhận Xưởng Sản Xuất</h3>
                      </div>
                      <button onClick={() => setShowProductionModal(false)}><X className="w-5 h-5 text-slate-400"/></button>
                  </div>
                  <div className="p-6 md:p-8 space-y-5 overflow-y-auto max-h-[70vh] no-scrollbar">
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Họ và tên người xác nhận *</label>
                          <div className="relative">
                            <input 
                                value={prodName} onChange={e => setProdName(e.target.value.toUpperCase())}
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm uppercase focus:ring-4 ring-blue-50 outline-none"
                                placeholder="NHẬP HỌ TÊN..."
                            />
                            <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          </div>
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nhận xét (Comment) *</label>
                          <textarea 
                              value={prodComment} onChange={e => setProdComment(e.target.value)}
                              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 italic focus:ring-4 ring-blue-50 outline-none resize-none h-28"
                              placeholder="Nhập ý kiến xác nhận từ xưởng..."
                          />
                      </div>
                      <SignaturePad label="Chữ ký xác nhận" value={prodSig} onChange={setProdSig} />
                  </div>
                  <div className="p-6 border-t bg-slate-50/50 flex gap-3">
                      <button onClick={() => setShowProductionModal(false)} className="flex-1 py-3 text-slate-500 font-bold uppercase text-[10px]">Hủy bỏ</button>
                      <button 
                        onClick={handleProductionConfirm} disabled={isProcessing || !prodSig || !prodName.trim() || !prodComment.trim()}
                        className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-indigo-500/20 active:scale-95 disabled:opacity-50"
                      >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : 'XÁC NHẬN SẢN XUẤT'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {viewingNcr && (
          <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2 md:p-6 overflow-hidden">
              <div className="bg-white w-full max-w-4xl h-full md:h-auto md:max-h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in duration-300">
                  <button 
                    onClick={() => setViewingNcr(null)}
                    className="absolute top-6 right-6 z-[210] p-3 bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-500 rounded-full transition-all active:scale-90"
                  >
                      <X className="w-6 h-6" />
                  </button>
                  <div className="flex-1 overflow-y-auto no-scrollbar">
                      <NCRDetail 
                        ncr={viewingNcr} 
                        user={user} 
                        onBack={() => setViewingNcr(null)} 
                        onViewInspection={() => {}} 
                      />
                  </div>
              </div>
          </div>
      )}

      {lightboxState && <ImageEditorModal images={lightboxState.images} initialIndex={lightboxState.index} onClose={() => setLightboxState(null)} readOnly={true} />}
    </div>
  );
};
