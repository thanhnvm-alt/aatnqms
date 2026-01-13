
import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, MaterialIQC, NCRComment } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, Building2, Box, FileText, 
  CheckCircle2, Clock, Trash2, Edit3, X, Maximize2, ShieldCheck,
  CheckCircle, LayoutList, PenTool, ChevronDown, ChevronUp, Calculator,
  TrendingUp, Layers, MessageSquare, Loader2, Eraser, Info,
  ClipboardList, Send, ShieldAlert, Save, Check, UserCheck, 
  Signature, MessageCircle, UserPlus, Tag, FileCheck
} from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';

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
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center px-1">
                <label className="block text-slate-700 font-bold text-[9px] uppercase tracking-widest">{label}</label>
                {!readOnly && <button onClick={clear} className="text-[9px] font-bold text-red-500 uppercase flex items-center gap-1 hover:underline" type="button"><Eraser className="w-3 h-3"/> Xóa ký lại</button>}
            </div>
            <div className="border border-slate-300 rounded-xl bg-white overflow-hidden relative h-32 shadow-inner">
                <canvas ref={canvasRef} width={400} height={128} className={`w-full h-full ${readOnly ? 'cursor-default' : 'cursor-crosshair touch-none'}`} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                {!value && !readOnly && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[9px] font-bold uppercase tracking-widest">Ký tại đây</div>}
            </div>
        </div>
    );
};

export const InspectionDetailIQC: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment }) => {
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Modal states
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [showPmModal, setShowPmModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Form states
  const [managerSig, setManagerSig] = useState('');
  const [pmSig, setPmSig] = useState(inspection.pmSignature || '');
  const [pmName, setPmName] = useState(inspection.pmName || '');
  const [pmComment, setPmComment] = useState(inspection.pmComment || '');

  const isAdmin = user.role === 'ADMIN';
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isApproved = inspection.status === InspectionStatus.APPROVED || inspection.status === InspectionStatus.COMPLETED;

  // --- ISO PERMISSION LOGIC ---
  const isOwner = inspection.inspectorName === user.name;
  const canModify = isAdmin || (!isApproved && (isManager || isOwner));

  const handleManagerApprove = async () => {
    if (!managerSig) { alert("Vui lòng ký tên trước khi phê duyệt."); return; }
    if (!onApprove) return;
    setIsProcessing(true);
    try {
        await onApprove(inspection.id, managerSig, { managerName: user.name });
        setShowManagerModal(false);
        onBack();
    } catch (e) { alert("Lỗi khi phê duyệt."); } finally { setIsProcessing(false); }
  };

  const handlePmConfirm = async () => {
    if (!pmSig || !pmName.trim() || !pmComment.trim()) {
        alert("Vui lòng điền đầy đủ họ tên, nhận xét và ký xác nhận.");
        return;
    }
    if (!onApprove) return;
    setIsProcessing(true);
    try {
        await onApprove(inspection.id, "", { 
            pmSignature: pmSig, 
            pmName: pmName.toUpperCase(), 
            pmComment 
        });
        setShowPmModal(false);
        alert("Đã ghi nhận xác nhận của PM thành công.");
    } catch (e) { alert("Lỗi khi lưu xác nhận PM."); } finally { setIsProcessing(false); }
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

  const deliveryNoteImages = inspection.deliveryNoteImages || (inspection.deliveryNoteImage ? [inspection.deliveryNoteImage] : []);
  const reportImages = inspection.reportImages || (inspection.reportImage ? [inspection.reportImage] : []);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-30 shadow-sm flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors border border-slate-100 shadow-sm" type="button"><ArrowLeft className="w-4 h-4 text-slate-600" /></button>
              <div>
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight leading-none">IQC REVIEW REPORT</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border ${isApproved ? 'bg-green-600 text-white border-green-600' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>{inspection.status}</span>
                      <span className="text-[10px] text-slate-400 font-mono font-bold tracking-tight uppercase">#{inspection.id.split('-').pop()}</span>
                  </div>
              </div>
          </div>
          <div className="flex items-center gap-2">
              {canModify && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all" type="button"><Edit3 className="w-4 h-4" /></button>}
              {canModify && <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all" type="button"><Trash2 className="w-4 h-4" /></button>}
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 no-scrollbar bg-slate-50/50 pb-40 md:pb-32">
        {/* Header Block */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-5 relative overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                    <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest mb-1.5">Purchase Order</p>
                    <h1 className="text-xl font-bold text-slate-800 uppercase tracking-tight leading-tight">PO: {inspection.po_number || 'N/A'}</h1>
                    <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100 w-fit">
                        <Building2 className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Supplier: {inspection.supplier}</span>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ngày kiểm lô</p>
                        <p className="text-[11px] font-bold text-slate-800">{inspection.date}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">QC Thực hiện</p>
                        <p className="text-[11px] font-bold text-slate-800 uppercase">{inspection.inspectorName}</p>
                    </div>
                </div>
            </div>
            
            {/* Supporting Docs */}
            {inspection.referenceDocs && inspection.referenceDocs.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><FileCheck className="w-3 h-3"/> Tài liệu hỗ trợ</p>
                    <div className="flex flex-wrap gap-2">
                        {inspection.referenceDocs.map((doc, idx) => (
                            <span key={idx} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[9px] font-bold uppercase border border-blue-100">{doc}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Images */}
            {(deliveryNoteImages.length > 0 || reportImages.length > 0) && (
                <div className="flex flex-col gap-4 border-t border-slate-100 pt-3">
                    {deliveryNoteImages.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ảnh Phiếu Giao Hàng</p>
                            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                {deliveryNoteImages.map((img, idx) => (
                                    <div key={idx} className="relative group cursor-zoom-in flex-shrink-0" onClick={() => setLightboxState({ images: deliveryNoteImages, index: idx })}>
                                        <img src={img} className="w-24 h-24 rounded-lg object-cover border border-slate-200" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {reportImages.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ảnh Báo Cáo QC</p>
                            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                {reportImages.map((img, idx) => (
                                    <div key={idx} className="relative group cursor-zoom-in flex-shrink-0" onClick={() => setLightboxState({ images: reportImages, index: idx })}>
                                        <img src={img} className="w-24 h-24 rounded-lg object-cover border border-slate-200" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Materials List */}
        <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-blue-500" /> Chi tiết vật tư thẩm định
            </h3>
            {(inspection.materials || []).map((mat, idx) => {
                const isExp = expandedMaterial === mat.id;
                const passRate = mat.inspectQty > 0 ? ((mat.passQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                return (
                    <div key={mat.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <div onClick={() => setExpandedMaterial(isExp ? null : mat.id)} className={`p-4 flex items-center justify-between cursor-pointer ${isExp ? 'bg-blue-50/30' : ''}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs shadow-sm transition-all ${isExp ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{idx + 1}</div>
                                <div>
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-tight leading-none">{mat.name}</h4>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">DN: {mat.deliveryQty} {mat.unit}</span>
                                        <span className="px-1.5 py-0.5 bg-green-50 text-green-600 rounded text-[9px] font-bold uppercase border border-green-100">{passRate}% ĐẠT</span>
                                    </div>
                                </div>
                            </div>
                            {isExp ? <ChevronUp className="w-5 h-5 text-blue-500"/> : <ChevronDown className="w-5 h-5 text-slate-300"/>}
                        </div>
                        {isExp && (
                            <div className="p-5 space-y-5 animate-in slide-in-from-top-4 duration-300 border-t border-slate-50">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Chủng loại</p>
                                        <p className="text-[11px] font-bold">{mat.category || '---'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Phạm vi</p>
                                        <p className="text-[11px] font-bold">{mat.scope}</p>
                                    </div>
                                    {mat.scope === 'PROJECT' && (
                                        <>
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase">Mã Dự Án</p>
                                                <p className="text-[11px] font-bold">{mat.projectCode || '---'}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase">Công trình</p>
                                                <p className="text-[11px] font-bold truncate">{mat.projectName || '---'}</p>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3 shadow-inner">
                                        <div className="grid grid-cols-4 gap-2 text-center">
                                            <div><p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">SL ĐH</p><p className="text-lg font-bold text-slate-700">{mat.orderQty || 0}</p></div>
                                            <div><p className="text-[8px] font-bold text-blue-400 uppercase tracking-widest">Kiểm</p><p className="text-lg font-bold text-blue-700">{mat.inspectQty}</p></div>
                                            <div><p className="text-[8px] font-bold text-green-400 uppercase tracking-widest">Đạt</p><p className="text-lg font-bold text-green-700">{mat.passQty}</p></div>
                                            <div><p className="text-[8px] font-bold text-red-400 uppercase tracking-widest">Lỗi</p><p className="text-lg font-bold text-red-700">{mat.failQty}</p></div>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {mat.items?.map(item => (
                                            <div key={item.id} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex flex-col gap-2">
                                                <div className="flex items-start gap-3">
                                                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${item.status === CheckStatus.PASS ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                    <div className="flex-1 overflow-hidden"><p className="text-[10px] font-bold text-slate-800 uppercase leading-tight line-clamp-1">{item.label}</p><p className="text-[9px] text-slate-500 mt-0.5 italic leading-relaxed">{item.notes || '---'}</p></div>
                                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${item.status === CheckStatus.PASS ? 'text-green-600 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-100'} border`}>{item.status}</span>
                                                </div>
                                                {item.images && item.images.length > 0 && (
                                                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                                                        {item.images.map((img, i) => (
                                                            <img key={i} src={img} className="w-10 h-10 rounded border border-slate-200 object-cover cursor-zoom-in" onClick={() => setLightboxState({ images: item.images!, index: i })} />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        {/* LOGGED SIGNATURES */}
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-blue-700 border-b border-blue-50 pb-3 font-bold text-[10px] uppercase tracking-[0.2em] flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-500"/> NHẬT KÝ PHÊ DUYỆT (ISO)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest border-l-2 border-blue-500 pl-2">QC Thực Hiện</p>
                    <div className="bg-slate-50 p-3 rounded-xl h-28 flex items-center justify-center overflow-hidden border border-slate-100 shadow-inner">
                        {inspection.signature ? <img src={inspection.signature} className="h-full object-contain" /> : <div className="text-[9px] text-slate-300 font-bold uppercase">N/A</div>}
                    </div>
                    <div className="text-center font-bold uppercase text-xs text-slate-800">{inspection.inspectorName}</div>
                </div>

                <div className="space-y-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest border-l-2 border-emerald-500 pl-2">QA Manager</p>
                    <div className="bg-slate-50 p-3 rounded-xl h-28 flex items-center justify-center overflow-hidden border border-slate-100 shadow-inner">
                        {inspection.managerSignature ? <img src={inspection.managerSignature} className="h-full object-contain" /> : <div className="text-[9px] text-orange-400 font-bold uppercase tracking-widest animate-pulse">ĐANG CHỜ DUYỆT</div>}
                    </div>
                    <div className="text-center font-bold uppercase text-xs text-slate-800">{inspection.managerName || 'Manager Approval'}</div>
                </div>

                <div className="space-y-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest border-l-2 border-indigo-500 pl-2">Project Manager</p>
                    <div className="bg-slate-50 p-3 rounded-xl h-28 flex flex-col items-center justify-center overflow-hidden border border-slate-100 shadow-inner relative group">
                        {inspection.pmSignature ? (
                            <img src={inspection.pmSignature} className="h-full object-contain" />
                        ) : (
                            <div className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">CHƯA XÁC NHẬN</div>
                        )}
                    </div>
                    <div className="text-center font-bold uppercase text-xs text-slate-800">{inspection.pmName || '---'}</div>
                    {inspection.pmComment && (
                        <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100 mt-1">
                             <p className="text-[10px] font-bold text-indigo-700 italic leading-relaxed">"{inspection.pmComment}"</p>
                        </div>
                    )}
                </div>
            </div>
        </section>

        {/* Discussions */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col mb-10">
            <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <h3 className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Trao đổi & Ghi chú</h3>
            </div>
            <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto no-scrollbar">
                {inspection.comments?.map((comment) => (
                    <div key={comment.id} className="flex gap-4 animate-in slide-in-from-left-2 duration-300">
                        <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="w-10 h-10 rounded-full border border-slate-200 shrink-0 shadow-sm" alt="" />
                        <div className="flex-1 space-y-1.5">
                            <div className="flex justify-between items-center px-1">
                                <span className="font-bold text-slate-800 text-[10px] uppercase">{comment.userName}</span>
                                <span className="text-[9px] font-bold text-slate-400 font-mono">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl rounded-tl-none border border-slate-100 text-xs text-slate-700">{comment.content}</div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50/30">
                <div className="flex gap-3">
                    <textarea 
                        value={newComment} onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Nhập phản hồi..."
                        className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl text-[11px] focus:ring-2 focus:ring-blue-100 outline-none resize-none shadow-sm h-10 transition-all"
                    />
                    <button onClick={handlePostComment} disabled={isSubmittingComment || !newComment.trim()} className="w-12 h-12 bg-blue-600 text-white rounded-xl shadow-lg flex items-center justify-center active:scale-95 disabled:opacity-50 transition-all shrink-0"><Send className="w-4 h-4" /></button>
                </div>
            </div>
        </section>
      </div>

      {/* BOTTOM ACTIONS - FIXED FOR MOBILE */}
      {!isApproved && (
          <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-0 left-0 right-0 p-3 md:p-4 border-t border-slate-200 bg-white/95 backdrop-blur-xl flex items-center justify-between gap-2 z-40 shadow-lg">
              <button onClick={onBack} className="px-3 py-3 text-slate-500 font-bold uppercase text-[9px] tracking-widest hover:bg-slate-50 rounded-xl border border-transparent hover:border-slate-200 transition-all shrink-0">
                  Quay lại
              </button>
              
              <div className="flex gap-2 flex-1 justify-end">
                  <button 
                    onClick={() => setShowPmModal(true)} 
                    className="flex-1 py-3 bg-indigo-50 text-indigo-700 font-bold uppercase text-[9px] tracking-wide border border-indigo-200 rounded-xl hover:bg-indigo-100 active:scale-95 flex items-center justify-center gap-1.5"
                  >
                      <UserPlus className="w-3.5 h-3.5"/> PM Ký
                  </button>
                  
                  {isManager && (
                      <button 
                        onClick={() => setShowManagerModal(true)} 
                        className="flex-1 py-3 bg-emerald-600 text-white font-bold uppercase text-[9px] tracking-wide rounded-xl shadow-lg hover:bg-emerald-700 active:scale-95 flex items-center justify-center gap-1.5"
                      >
                          <ShieldCheck className="w-3.5 h-3.5"/> Duyệt
                      </button>
                  )}
              </div>
          </div>
      )}

      {/* MODALS */}
      {showManagerModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          <h3 className="font-bold text-slate-800 uppercase tracking-tighter text-sm">QA/QC Manager Phê Duyệt</h3>
                      </div>
                      <button onClick={() => setShowManagerModal(false)}><X className="w-5 h-5 text-slate-400"/></button>
                  </div>
                  <div className="p-6 space-y-5">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                          <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Người phê duyệt</p>
                          <p className="text-sm font-bold text-slate-800 uppercase">{user.name}</p>
                      </div>
                      <SignaturePad label="Chữ ký điện tử Manager" value={managerSig} onChange={setManagerSig} />
                  </div>
                  <div className="p-5 border-t bg-slate-50 flex gap-3">
                      <button onClick={() => setShowManagerModal(false)} className="flex-1 py-3 text-slate-500 font-bold uppercase text-[9px]">Hủy</button>
                      <button onClick={handleManagerApprove} disabled={isProcessing || !managerSig} className="flex-[2] py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase text-[10px] shadow-lg disabled:opacity-50">{isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : 'PHÊ DUYỆT'}</button>
                  </div>
              </div>
          </div>
      )}

      {showPmModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 uppercase text-sm">PM Dự Án Xác Nhận</h3>
                      <button onClick={() => setShowPmModal(false)}><X className="w-5 h-5 text-slate-400"/></button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh] no-scrollbar">
                      <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Họ tên PM *</label>
                          <input value={pmName} onChange={e => setPmName(e.target.value.toUpperCase())} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-[11px] uppercase h-10" placeholder="HỌ TÊN PM..." />
                      </div>
                      <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Nhận xét PM *</label>
                          <textarea value={pmComment} onChange={e => setPmComment(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold h-24" placeholder="Ý kiến PM..." />
                      </div>
                      <SignaturePad label="Chữ ký PM" value={pmSig} onChange={setPmSig} />
                  </div>
                  <div className="p-5 border-t bg-slate-50 flex gap-3">
                      <button onClick={() => setShowPmModal(false)} className="flex-1 py-3 text-slate-500 font-bold uppercase text-[9px]">Hủy</button>
                      <button onClick={handlePmConfirm} disabled={isProcessing || !pmSig || !pmName.trim() || !pmComment.trim()} className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase text-[10px] shadow-lg disabled:opacity-50">{isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : 'XÁC NHẬN PM'}</button>
                  </div>
              </div>
          </div>
      )}

      {lightboxState && <ImageEditorModal images={lightboxState.images} initialIndex={lightboxState.index} onClose={() => setLightboxState(null)} readOnly={true} />}
    </div>
  );
};
