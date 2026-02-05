
import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, MaterialIQC, NCRComment } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, Building2, Box, FileText, 
  CheckCircle2, Clock, Trash2, Edit3, X, Maximize2, ShieldCheck,
  LayoutList, PenTool, ChevronDown, ChevronUp,
  Layers, MessageSquare, Loader2, Eraser, Info,
  ClipboardList, Send, Save, Check, 
  FileCheck, Camera, Image as ImageIcon, CheckCircle, AlertTriangle
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
    const startDrawing = (e: any) => { if (readOnly) return; const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; ctx.beginPath(); ctx.moveTo(clientX - rect.left, clientY - rect.top); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000000'; setIsDrawing(true); };
    const draw = (e: any) => { if (!isDrawing || readOnly) return; const canvas = canvasRef.current; if (canvas) { const ctx = canvas.getContext('2d'); if (!ctx) return; const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; ctx.lineTo(clientX - rect.left, clientY - rect.top); ctx.stroke(); }; };
    const stopDrawing = () => { if (readOnly) return; setIsDrawing(false); if (canvasRef.current) onChange(canvasRef.current.toDataURL()); };
    const clear = () => { const canvas = canvasRef.current; if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height); onChange(''); } };
    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center px-1">
                <label className="block text-slate-700 font-bold text-[9px] uppercase tracking-widest">{label}</label>
                {!readOnly && <button onClick={clear} className="text-[9px] font-bold text-red-600 flex items-center gap-1 hover:underline" type="button"><Eraser className="w-3 h-3"/> Xóa</button>}
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
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number; context?: any } | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [managerSig, setManagerSig] = useState('');

  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);

  const isApproved = inspection.status === InspectionStatus.APPROVED;
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const canModify = user.role === 'ADMIN' || (!isApproved && (isManager || inspection.inspectorName === user.name));

  const handleManagerApprove = async () => {
    if (!managerSig) { alert("Vui lòng ký tên trước khi phê duyệt."); return; }
    if (!onApprove) return;
    setIsProcessing(true);
    try { 
        await onApprove(inspection.id, managerSig, { managerName: user.name }); 
        setShowManagerModal(false); 
        onBack(); 
    } 
    catch (e) { alert("Lỗi khi phê duyệt."); } finally { setIsProcessing(false); }
  };

  const handlePostComment = async () => {
      if (!newComment.trim() && commentAttachments.length === 0) return;
      if (!onPostComment) return;
      setIsSubmittingComment(true);
      try {
          await onPostComment(inspection.id, { 
              id: Date.now().toString(), userId: user.id, userName: user.name, 
              userAvatar: user.avatar, content: newComment, createdAt: new Date().toISOString(),
              attachments: commentAttachments
          } as any);
          setNewComment(''); setCommentAttachments([]);
      } catch (e) { alert("Lỗi gửi bình luận."); } finally { setIsSubmittingComment(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
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

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 no-scrollbar bg-slate-50 pb-40 md:pb-32">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest mb-1.5">Purchase Order</p>
                    <h1 className="text-xl font-bold text-slate-800 uppercase tracking-tight leading-tight">PO: {inspection.po_number || 'N/A'}</h1>
                    <div className="flex items-center gap-2 mt-3 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100 w-fit">
                        <Building2 className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">{inspection.supplier}</span>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center"><p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ngày kiểm</p><p className="text-[11px] font-bold text-slate-800">{inspection.date}</p></div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center"><p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">QC/QA</p><p className="text-[11px] font-bold text-slate-800 uppercase">{inspection.inspectorName}</p></div>
                </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
                {(inspection.images?.length || 0) > 0 && (
                    <div className="space-y-2">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><ImageIcon className="w-3 h-3" /> Bằng chứng hiện trường</p>
                        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                            {inspection.images?.map((img, idx) => (<img key={idx} src={img} onClick={() => setLightboxState({ images: inspection.images!, index: idx })} className="w-24 h-24 rounded-lg object-cover border border-slate-200 shadow-sm cursor-zoom-in" />))}
                        </div>
                    </div>
                )}
                
                <div className="space-y-2">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><FileCheck className="w-3 h-3 text-blue-500" /> Tài liệu hồ sơ đính kèm</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {(inspection.supportingDocs || []).map(doc => (
                            <div key={doc.id} className={`flex items-center gap-2 p-2 rounded-lg border text-[9px] font-bold uppercase tracking-tight ${doc.verified ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                {doc.verified ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <div className="w-3.5 h-3.5 rounded border border-slate-300 shrink-0" />}
                                <span className="truncate">{doc.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-2 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-blue-500" /> Danh mục vật tư</h3>
            {(inspection.materials || []).map((mat, idx) => {
                const isExp = expandedMaterial === mat.id;
                const hasFail = mat.items?.some(it => it.status === CheckStatus.FAIL);
                const hasCond = mat.items?.some(it => it.status === CheckStatus.CONDITIONAL);
                const allPass = (mat.items?.length || 0) > 0 && mat.items?.every(it => it.status === CheckStatus.PASS);

                return (
                    <div key={mat.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <div onClick={() => setExpandedMaterial(isExp ? null : mat.id)} className={`p-4 flex items-center justify-between cursor-pointer ${isExp ? 'bg-blue-50/30' : ''}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${isExp ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{idx + 1}</div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-slate-800 text-sm uppercase tracking-tight leading-none">{mat.name}</h4>
                                        {allPass && <span className="bg-green-600 text-white px-2 py-0.5 rounded-full text-[7px] font-black uppercase shadow-sm">ĐẠT</span>}
                                        {hasFail && <span className="bg-red-600 text-white px-2 py-0.5 rounded-full text-[7px] font-black uppercase shadow-sm">NCR</span>}
                                        {hasCond && <span className="bg-amber-500 text-white px-2 py-0.5 rounded-full text-[7px] font-black uppercase shadow-sm">CĐK</span>}
                                    </div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Loại kiểm: {mat.inspectType || '100%'} • {mat.deliveryQty} {mat.unit}</p>
                                </div>
                            </div>
                            {isExp ? <ChevronUp className="w-5 h-5 text-blue-500"/> : <ChevronDown className="w-5 h-5 text-slate-300"/>}
                        </div>
                        {isExp && (
                            <div className="p-5 space-y-4 border-t border-slate-50">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {mat.items?.map(item => (
                                        <div key={item.id} className="bg-slate-50 p-3 rounded-lg border border-slate-100 shadow-sm">
                                            <div className="flex justify-between items-start">
                                                <p className="text-[10px] font-bold text-slate-800 uppercase">{item.label}</p>
                                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${item.status === CheckStatus.PASS ? 'text-green-600 bg-green-50 border-green-200' : item.status === CheckStatus.FAIL ? 'text-red-600 bg-red-50 border-red-200' : 'text-amber-600 bg-amber-50 border-amber-200'}`}>{item.status}</span>
                                            </div>
                                            {item.notes && <p className="text-[9px] text-slate-500 italic mt-1">"{item.notes}"</p>}
                                            {item.images && item.images.length > 0 && (
                                                <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
                                                    {item.images.map((img, i) => (<img key={i} src={img} className="w-12 h-12 rounded border border-white shadow-sm object-cover cursor-zoom-in" onClick={() => setLightboxState({ images: item.images!, index: i })} />))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-blue-700 border-b border-blue-50 pb-3 font-bold text-[10px] uppercase tracking-[0.2em] flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-500"/> PHÊ DUYỆT ISO</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">QC Inspector</p>
                    <div className="bg-slate-50 p-3 rounded-xl h-24 flex items-center justify-center overflow-hidden border border-slate-100 shadow-inner">
                        {inspection.signature ? <img src={inspection.signature} className="h-full object-contain" /> : <div className="text-[9px] text-slate-300">N/A</div>}
                    </div>
                    <div className="text-center font-bold uppercase text-xs text-slate-800">{inspection.inspectorName}</div>
                </div>
                <div className="space-y-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Manager</p>
                    <div className="bg-slate-50 p-3 rounded-xl h-24 flex items-center justify-center border border-slate-100 shadow-inner">
                        {inspection.managerSignature ? <img src={inspection.managerSignature} className="h-full object-contain" /> : <div className="text-[9px] text-orange-400 animate-pulse font-black">CHỜ DUYỆT</div>}
                    </div>
                    <div className="text-center font-bold uppercase text-xs text-slate-800">{inspection.managerName || 'Manager Approval'}</div>
                </div>
            </div>
        </section>

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

      <div className="sticky bottom-0 z-[110] bg-white/95 backdrop-blur-xl border-t border-slate-200 px-4 py-4 shadow-[0_-15px_30px_rgba(0,0,0,0.1)] shrink-0 flex gap-3">
          <button onClick={onBack} className="flex-1 h-12 bg-slate-100 text-slate-500 font-black uppercase text-[10px] tracking-widest rounded-xl border border-slate-200 active:scale-95 transition-all">Quay lại</button>
          {isManager && !isApproved && (
              <button onClick={() => setShowManagerModal(true)} className="flex-[2] h-12 bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">Phê duyệt IQC</button>
          )}
      </div>

      {showManagerModal && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                      <div className="flex items-center gap-3"><ShieldCheck className="w-6 h-6 text-emerald-600" /><h3 className="font-black text-slate-800 uppercase tracking-tighter text-base">Manager Approval</h3></div>
                      <button onClick={() => setShowManagerModal(false)}><X className="w-7 h-7 text-slate-400"/></button>
                  </div>
                  <div className="p-8 space-y-6 bg-slate-50/30">
                      <div className="bg-white p-5 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Authorized System User</p><p className="text-base font-black text-slate-800 uppercase tracking-tight">{user.name}</p></div>
                      <SignaturePad label="Chữ ký điện tử Manager *" value={managerSig} onChange={setManagerSig} />
                  </div>
                  <div className="p-6 border-t bg-white flex gap-4">
                      <button onClick={() => setShowManagerModal(false)} className="flex-1 py-4 text-slate-500 font-black uppercase text-[10px] rounded-2xl hover:bg-slate-50 border border-slate-100 shadow-sm transition-all">Hủy</button>
                      <button onClick={handleManagerApprove} disabled={isProcessing || !managerSig} className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-emerald-500/30 disabled:opacity-50 active:scale-95 transition-all">{isProcessing ? <Loader2 className="w-5 h-5 animate-spin mx-auto"/> : 'XÁC NHẬN DUYỆT'}</button>
                  </div>
              </div>
          </div>
      )}

      {lightboxState && (
          <ImageEditorModal 
              images={lightboxState.images} 
              initialIndex={lightboxState.index} 
              onClose={() => setLightboxState(null)} 
              readOnly={true} 
          />
      )}
    </div>
  );
};
