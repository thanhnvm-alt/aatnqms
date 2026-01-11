
import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, MaterialIQC, NCRComment } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, Building2, Box, FileText, 
  CheckCircle2, Clock, Trash2, Edit3, X, Maximize2, ShieldCheck,
  CheckCircle, LayoutList, PenTool, ChevronDown, ChevronUp, Calculator,
  TrendingUp, Layers, MessageSquare, Loader2, Eraser, Info,
  ClipboardList, Send, ShieldAlert, Save, Check, UserCheck, 
  Signature, MessageCircle, UserPlus, Tag
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

export const InspectionDetailIQC: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment }) => {
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Modal states
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [showPmModal, setShowPmModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Form states for modals
  const [managerSig, setManagerSig] = useState('');
  const [pmSig, setPmSig] = useState(inspection.pmSignature || '');
  const [pmName, setPmName] = useState(inspection.pmName || '');
  const [pmComment, setPmComment] = useState(inspection.pmComment || '');

  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isApproved = inspection.status === InspectionStatus.APPROVED || inspection.status === InspectionStatus.COMPLETED;

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

  const InfoRow = ({ icon: Icon, label, value }: any) => (
    <div>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-[12px] font-black text-slate-800 uppercase flex items-center gap-2">
            <Icon className="w-3.5 h-3.5 text-slate-400"/> {value || '---'}
        </p>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12px' }}>
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-30 shadow-sm flex justify-between items-center">
          <div className="flex items-center gap-3">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-2xl transition-colors border border-slate-100 shadow-sm" type="button"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
              <div>
                  <h2 className="text-[13px] font-black text-slate-900 uppercase tracking-tighter leading-none">IQC REPORT</h2>
                  <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${isApproved ? 'bg-green-600 text-white border-green-600' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>{inspection.status}</span>
                  </div>
              </div>
          </div>
          <div className="flex items-center gap-2">
              {!isApproved && <button onClick={() => onEdit(inspection.id)} className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl" type="button"><Edit3 className="w-4.5 h-4.5" /></button>}
              <button onClick={() => onDelete(inspection.id)} className="p-2.5 text-red-600 hover:bg-red-50 rounded-xl" type="button"><Trash2 className="w-4.5 h-4.5" /></button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-6 no-scrollbar bg-slate-50/50 pb-32">
        <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1.5">Purchase Order Info</p>
                    <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight">MÃ PO: {inspection.po_number || 'N/A'}</h1>
                    <p className="text-[12px] font-bold text-slate-500 mt-1 uppercase flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Supplier: {inspection.supplier}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <InfoRow icon={Calendar} label="Ngày kiểm" value={inspection.date} />
                    <InfoRow icon={UserIcon} label="QC Kiểm tra" value={inspection.inspectorName} />
                </div>
            </div>
        </div>

        {/* Materials List */}
        <div className="space-y-3">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-blue-500" /> VẬT TƯ THẨM ĐỊNH
            </h3>
            {(inspection.materials || []).map((mat, idx) => {
                const isExp = expandedMaterial === mat.id;
                const passRate = mat.inspectQty > 0 ? ((mat.passQty / mat.inspectQty) * 100).toFixed(1) : "0.0";
                return (
                    <div key={mat.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <div onClick={() => setExpandedMaterial(isExp ? null : mat.id)} className={`p-4 flex items-center justify-between cursor-pointer ${isExp ? 'bg-blue-50/20' : ''}`}>
                            <div className="flex items-center gap-4">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs ${isExp ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{idx + 1}</div>
                                <div>
                                    <h4 className="font-black text-[12px] text-slate-800 uppercase tracking-tight">{mat.name}</h4>
                                    <span className="text-[10px] font-black text-green-600 uppercase mt-0.5 inline-block">{passRate}% ĐẠT</span>
                                </div>
                            </div>
                            {isExp ? <ChevronUp className="w-5 h-5 text-blue-500"/> : <ChevronDown className="w-5 h-5 text-slate-300"/>}
                        </div>
                        {isExp && (
                            <div className="p-4 space-y-4 border-t border-slate-50">
                                <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-3 rounded-2xl">
                                    <div><p className="text-[8px] font-black text-slate-400 uppercase">Kiểm</p><p className="text-[14px] font-black text-blue-600">{mat.inspectQty}</p></div>
                                    <div><p className="text-[8px] font-black text-slate-400 uppercase">Đạt</p><p className="text-[14px] font-black text-green-600">{mat.passQty}</p></div>
                                    <div><p className="text-[8px] font-black text-slate-400 uppercase">Lỗi</p><p className="text-[14px] font-black text-red-600">{mat.failQty}</p></div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {mat.items?.map(item => (
                                        <div key={item.id} className="p-2 border border-slate-100 rounded-xl flex items-center justify-between gap-3">
                                            <p className="text-[11px] font-bold text-slate-700 uppercase flex-1 truncate">{item.label}</p>
                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${item.status === CheckStatus.PASS ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>{item.status}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        {/* Audit Trail Signatures */}
        <section className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8 mt-4">
            <h3 className="text-blue-700 border-b border-blue-50 pb-4 font-black text-[11px] uppercase tracking-widest flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-green-500"/> XÁC NHẬN PHÊ DUYỆT (ISO LOG)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">QC THỰC HIỆN</p>
                    <div className="bg-slate-50 p-2 rounded-2xl h-36 flex items-center justify-center overflow-hidden border border-slate-100 shadow-inner">
                        {inspection.signature ? <img src={inspection.signature} className="h-full object-contain" /> : <div className="text-[10px] text-slate-300 font-bold uppercase">N/A</div>}
                    </div>
                    <div className="text-center font-black uppercase text-[12px] text-slate-800">{inspection.inspectorName}</div>
                </div>
                <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">QA MANAGER</p>
                    <div className="bg-slate-50 p-2 rounded-2xl h-36 flex items-center justify-center overflow-hidden border border-slate-100 shadow-inner">
                        {inspection.managerSignature ? <img src={inspection.managerSignature} className="h-full object-contain" /> : <div className="text-[10px] text-orange-300 font-black uppercase tracking-widest animate-pulse">CHỜ DUYỆT...</div>}
                    </div>
                    <div className="text-center font-black uppercase text-[12px] text-slate-800">{inspection.managerName || '---'}</div>
                </div>
                <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">PM DỰ ÁN</p>
                    <div className="bg-slate-50 p-2 rounded-2xl h-36 flex items-center justify-center overflow-hidden border border-slate-100 shadow-inner">
                        {inspection.pmSignature ? <img src={inspection.pmSignature} className="h-full object-contain" /> : <div className="text-[10px] text-slate-300 font-black uppercase tracking-widest">CHƯA XÁC NHẬN</div>}
                    </div>
                    <div className="text-center font-black uppercase text-[12px] text-slate-800">{inspection.pmName || '---'}</div>
                </div>
            </div>
        </section>
      </div>

      {/* FOOTER ACTIONS (MATCH FORM) */}
      <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between gap-4 sticky bottom-0 z-40 shadow-[0_-10px_25px_rgba(0,0,0,0.05)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <button 
            onClick={onBack} 
            className="px-6 py-3 text-slate-500 font-black uppercase text-[12px] tracking-widest hover:bg-slate-50 rounded-xl transition-all active:scale-95" 
            type="button"
        >
            QUAY LẠI
        </button>
        {!isApproved && (
            <div className="flex-1 flex gap-2">
                <button 
                  onClick={() => setShowPmModal(true)} 
                  className="px-4 py-4 bg-indigo-50 text-indigo-700 font-black uppercase text-[10px] tracking-widest border border-indigo-200 rounded-2xl flex items-center justify-center gap-2 active:scale-95"
                >
                    <UserPlus className="w-4 h-4"/> PM XN
                </button>
                {isManager && (
                    <button 
                      onClick={() => setShowManagerModal(true)} 
                      className="flex-1 py-4 bg-blue-700 text-white font-black uppercase text-[12px] tracking-widest rounded-2xl shadow-xl shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <ShieldCheck className="w-5 h-5"/> PHÊ DUYỆT IQC
                    </button>
                )}
            </div>
        )}
      </div>

      {/* Lightbox / Modals */}
      {showManagerModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="font-black text-slate-800 uppercase tracking-tighter text-[14px]">QA/QC Manager Phê Duyệt</h3>
                      <button onClick={() => setShowManagerModal(false)}><X className="w-5 h-5 text-slate-400"/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <SignaturePad label="Ký tên phê duyệt chính thức" value={managerSig} onChange={setManagerSig} />
                  </div>
                  <div className="p-4 border-t bg-slate-50/50 flex gap-3">
                      <button onClick={() => setShowManagerModal(false)} className="flex-1 py-3 text-slate-500 font-bold uppercase text-[11px]">Hủy</button>
                      <button onClick={handleManagerApprove} disabled={isProcessing || !managerSig} className="flex-[2] py-4 bg-blue-700 text-white rounded-2xl font-black uppercase text-[12px] tracking-widest shadow-lg active:scale-95">DUYỆT & ĐÓNG PHIẾU</button>
                  </div>
              </div>
          </div>
      )}

      {showPmModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="font-black text-slate-800 uppercase tracking-tighter text-[14px]">Xác nhận của PM Dự Án</h3>
                      <button onClick={() => setShowPmModal(false)}><X className="w-5 h-5 text-slate-400"/></button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh] no-scrollbar">
                      <input value={pmName} onChange={e => setPmName(e.target.value.toUpperCase())} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-[12px] uppercase outline-none" placeholder="Họ tên PM..."/>
                      <textarea value={pmComment} onChange={e => setPmComment(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-bold italic h-24 outline-none resize-none" placeholder="Ý kiến PM..."/>
                      <SignaturePad label="Ký xác nhận PM" value={pmSig} onChange={setPmSig} />
                  </div>
                  <div className="p-4 border-t bg-slate-50/50 flex gap-3">
                      <button onClick={() => setShowPmModal(false)} className="flex-1 py-3 text-slate-500 font-bold uppercase text-[11px]">Hủy</button>
                      <button onClick={handlePmConfirm} disabled={isProcessing || !pmSig || !pmName.trim()} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[12px] tracking-widest shadow-lg active:scale-95">XÁC NHẬN PM</button>
                  </div>
              </div>
          </div>
      )}

      {lightboxState && <ImageEditorModal images={lightboxState.images} initialIndex={lightboxState.index} onClose={() => setLightboxState(null)} readOnly={true} />}
    </div>
  );
};
