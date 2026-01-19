
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, Workshop, NCR } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, Building2, Box, FileText, 
  CheckCircle2, Clock, Trash2, Edit3, X, Maximize2, ShieldCheck,
  LayoutList, MessageSquare, Loader2, Eraser, Send, 
  UserPlus, AlertOctagon, ChevronRight, Camera, Image as ImageIcon, PenTool,
  Factory, Activity, Save
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

export const InspectionDetailSQC_VT: React.FC<InspectionDetailProps> = ({ 
  inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment, workshops = [] 
}) => {
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);
  
  // Modals
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [viewingNcr, setViewingNcr] = useState<NCR | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number; context?: string } | null>(null);

  // Signatures
  const [managerSig, setManagerSig] = useState('');
  const [prodSig, setProdSig] = useState(inspection.productionSignature || '');
  const [prodName, setProdName] = useState(inspection.productionName || '');
  const [prodComment, setProdComment] = useState(inspection.productionComment || '');

  const isAdmin = user.role === 'ADMIN';
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isApproved = inspection.status === InspectionStatus.COMPLETED || inspection.status === InspectionStatus.APPROVED;
  const isProdSigned = !!inspection.productionSignature;

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

  // --- ISO PERMISSION LOGIC ---
  const isOwner = inspection.inspectorName === user.name;
  const canModify = isAdmin || (!isApproved && (isManager || isOwner));

  const handleManagerApprove = async () => {
      if (!managerSig) { alert("Vui lòng ký tên trước khi phê duyệt."); return; }
      if (!onApprove) return;
      setIsProcessing(true);
      try {
          await onApprove(inspection.id, managerSig, { managerName: user.name });
          alert("Phê duyệt thành công!");
          setShowManagerModal(false);
          onBack();
      } catch (e) { alert("Lỗi khi phê duyệt."); } finally { setIsProcessing(false); }
  };

  const handleProductionConfirm = async () => {
      if (!prodSig || !prodName.trim()) { alert("Vui lòng nhập họ tên và ký xác nhận."); return; }
      if (!onApprove) return;
      setIsProcessing(true);
      try {
          await onApprove(inspection.id, "", { 
              signature: prodSig, 
              name: prodName.toUpperCase(),
              comment: prodComment
          });
          alert("Đã xác nhận từ đại diện Nhà cung cấp.");
          setShowProductionModal(false);
      } catch (e) { alert("Lỗi xác nhận."); } finally { setIsProcessing(false); }
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

  const handlePostComment = async () => {
      if (!newComment.trim() && commentAttachments.length === 0) return;
      if (!onPostComment) return;
      setIsSubmittingComment(true);
      const comment: NCRComment = {
          id: Date.now().toString(),
          userId: user.id,
          userName: user.name,
          userAvatar: user.avatar,
          content: newComment,
          createdAt: new Date().toISOString(),
          attachments: commentAttachments
      };
      try { 
          await onPostComment(inspection.id, comment); 
          setNewComment(''); 
          setCommentAttachments([]);
      } 
      catch (e) { alert("Lỗi khi gửi phản hồi."); } finally { setIsSubmittingComment(false); }
  };

  const InfoRow = ({ icon: Icon, label, value, iconColor = "text-slate-400" }: any) => (
      <div>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-0.5 flex items-center gap-1.5">
              <Icon className={`w-3 h-3 ${iconColor}`}/> {label}
          </p>
          <p className="text-[11px] font-bold text-slate-800 tracking-tight">{value || '---'}</p>
      </div>
  );

  const deliveryNoteImages = inspection.deliveryNoteImages || (inspection.deliveryNoteImage ? [inspection.deliveryNoteImage] : []);
  const reportImages = inspection.reportImages || (inspection.reportImage ? [inspection.reportImage] : []);

  if (viewingNcr) {
      return (
          <NCRDetail 
            ncr={viewingNcr} 
            user={user} 
            onBack={() => setViewingNcr(null)} 
            onViewInspection={() => {}} 
          />
      );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors active:scale-90 border border-slate-200 shadow-sm"><ArrowLeft className="w-4 h-4 text-slate-600" /></button>
              <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Thẩm định SQC - Vật Tư</h2>
                  <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${isApproved ? 'bg-green-600 text-white border-green-600' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>{inspection.status}</span>
                      <span className="text-[10px] text-slate-400 font-mono font-medium uppercase tracking-tight">#{inspection.id.split('-').pop()}</span>
                  </div>
              </div>
          </div>
          <div className="flex items-center gap-2">
              {canModify && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Edit3 className="w-4 h-4" /></button>}
              {canModify && <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>}
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 no-scrollbar pb-40 md:pb-32 bg-slate-50">
        
        {/* --- TOP CARD SECTION --- */}
        <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute right-0 top-0 p-12 opacity-5 pointer-events-none uppercase font-black text-6xl rotate-12 select-none tracking-widest">SQC-VT</div>
            
            <h1 className="text-2xl font-black text-slate-900 uppercase mb-8 leading-tight tracking-tight">{inspection.ten_hang_muc}</h1>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-8">
                <InfoRow icon={Box} label="Mã dự án / PO" value={inspection.ma_ct} />
                <InfoRow icon={Building2} label="Nhà cung cấp" value={inspection.supplier} iconColor="text-blue-500" />
                <InfoRow icon={UserIcon} label="QC Inspector" value={inspection.inspectorName} />
                <InfoRow icon={Calendar} label="Ngày kiểm" value={inspection.date} />
            </div>

            {/* --- QUANTITY STATS SECTION --- */}
            <div className="bg-slate-50/80 p-5 rounded-[1.5rem] border border-slate-100 shadow-inner">
                <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                    <div className="text-center md:border-r border-slate-200 space-y-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Số IPO</p>
                        <p className="text-lg font-black text-slate-700">{stats.ipo}</p>
                    </div>
                    <div className="text-center md:border-r border-slate-200 space-y-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Kiểm tra</p>
                        <p className="text-lg font-black text-blue-600">{stats.ins}</p>
                    </div>
                    <div className="text-center md:border-r border-slate-200 space-y-1">
                        <p className="text-[9px] font-black text-green-600 uppercase tracking-widest">Đạt</p>
                        <p className="text-lg font-black text-green-600">{stats.pas}</p>
                    </div>
                    <div className="text-center md:border-r border-slate-200 space-y-1 bg-green-50/50 rounded-xl py-1">
                        <p className="text-[9px] font-black text-green-700 uppercase tracking-widest">Tỷ lệ đạt</p>
                        <p className="text-lg font-black text-green-700">{stats.passRate}%</p>
                    </div>
                    <div className="text-center md:border-r border-slate-200 space-y-1">
                        <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Hỏng</p>
                        <p className="text-lg font-black text-red-600">{stats.fai}</p>
                    </div>
                    <div className="text-center space-y-1 bg-red-50/50 rounded-xl py-1">
                        <p className="text-[9px] font-black text-red-700 uppercase tracking-widest">Tỷ lệ hỏng</p>
                        <p className="text-lg font-black text-red-700">{stats.failRate}%</p>
                    </div>
                </div>
            </div>
        </div>

        {/* Images Section */}
        <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-slate-800 font-black text-[11px] uppercase tracking-[0.2em] flex items-center gap-2 border-b border-slate-100 pb-3"><Box className="w-4 h-4 text-blue-500"/> III. Hình ảnh bằng chứng kỹ thuật</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="space-y-3">
                    <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest ml-1 flex justify-between items-center">
                        <span>Hiện trường / Hàng hóa</span>
                        <span className="text-[8px] bg-blue-50 px-1.5 py-0.5 rounded">{(inspection.images || []).length} ảnh</span>
                    </label>
                    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar bg-slate-50/50 p-2 rounded-2xl border border-slate-100 min-h-[60px]">
                        {inspection.images?.map((img, idx) => (
                            <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 shrink-0 group cursor-zoom-in shadow-sm transition-all hover:scale-105" onClick={() => setLightboxState({ images: inspection.images!, index: idx })}>
                                <img src={img} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Maximize2 className="text-white w-5 h-5" /></div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="space-y-3">
                    <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest ml-1 flex justify-between items-center">
                        <span>Phiếu Giao Nhận</span>
                        <span className="text-[8px] bg-indigo-50 px-1.5 py-0.5 rounded">{deliveryNoteImages.length} ảnh</span>
                    </label>
                    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar bg-slate-50/50 p-2 rounded-2xl border border-slate-100 min-h-[60px]">
                        {deliveryNoteImages.map((img, idx) => (
                            <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 shrink-0 group cursor-zoom-in shadow-sm transition-all hover:scale-105" onClick={() => setLightboxState({ images: deliveryNoteImages, index: idx })}>
                                <img src={img} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Maximize2 className="text-white w-5 h-5" /></div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="space-y-3">
                    <label className="text-[9px] font-black text-emerald-600 uppercase tracking-widest ml-1 flex justify-between items-center">
                        <span>Báo Cáo NCC / CO-CQ</span>
                        <span className="text-[8px] bg-emerald-50 px-1.5 py-0.5 rounded">{reportImages.length} ảnh</span>
                    </label>
                    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar bg-slate-50/50 p-2 rounded-2xl border border-slate-100 min-h-[60px]">
                        {reportImages.map((img, idx) => (
                            <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 shrink-0 group cursor-zoom-in shadow-sm transition-all hover:scale-105" onClick={() => setLightboxState({ images: reportImages, index: idx })}>
                                <img src={img} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Maximize2 className="text-white w-5 h-5" /></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>

        <div className="space-y-3">
            <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] px-2 flex items-center gap-2"><LayoutList className="w-4 h-4 text-indigo-500" /> IV. Nội dung thẩm định chi tiết</h3>
            {inspection.items.map((item, idx) => (
                <div key={idx} className={`bg-white p-5 rounded-[1.5rem] border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-200 ring-1 ring-red-50/50' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between gap-4 mb-3 border-b border-slate-50 pb-3">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`px-3 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm ${item.status === CheckStatus.PASS ? 'text-green-700 bg-green-50 border-green-200' : item.status === CheckStatus.FAIL ? 'text-red-700 bg-red-50 border-red-200' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>{item.status}</span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">{item.category}</span>
                            </div>
                            <p className="text-sm font-black text-slate-800 tracking-tight leading-snug uppercase">{item.label}</p>
                            {item.notes && <p className="text-[11px] text-slate-500 mt-2 italic leading-relaxed border-l-2 border-slate-100 pl-3">"{item.notes}"</p>}
                        </div>
                    </div>
                    {item.ncr && (
                        <div onClick={() => setViewingNcr(item.ncr || null)} className="mb-3 p-4 bg-red-50/50 rounded-2xl border border-red-100 space-y-2 hover:bg-red-50 transition-all cursor-pointer group shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-red-600 uppercase flex items-center gap-1.5"><AlertOctagon className="w-3.5 h-3.5"/> Phiếu không phù hợp liên quan</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-red-600 bg-white px-2 py-0.5 rounded-lg border border-red-100 shadow-sm">{item.ncr.severity}</span>
                                    <ChevronRight className="w-4 h-4 text-red-400 group-hover:translate-x-1 transition-transform" />
                                </div>
                            </div>
                            <p className="text-[11px] font-bold text-slate-700 italic">"{item.ncr.issueDescription}"</p>
                        </div>
                    )}
                    {item.images && item.images.length > 0 && (
                        <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
                            {item.images.map((img, i) => (
                                <div key={i} onClick={() => setLightboxState({ images: item.images!, index: i })} className="w-16 h-16 shrink-0 rounded-xl overflow-hidden border border-slate-200 relative group cursor-zoom-in hover:scale-110 transition-transform shadow-sm">
                                    <img src={img} className="w-full h-full object-cover" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>

        <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
            <h3 className="text-blue-700 border-b border-blue-50 pb-4 font-black text-[11px] uppercase tracking-[0.25em] flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-green-500"/> NHẬT KÝ PHÊ DUYỆT ĐIỆN TỬ (ISO 9001)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">QC Inspector</p>
                    <div className="bg-slate-50 p-4 rounded-[1.5rem] border border-slate-100 h-32 flex items-center justify-center overflow-hidden shadow-inner">
                        {inspection.signature ? <img src={inspection.signature} className="h-full object-contain" /> : <div className="text-[10px] font-black text-slate-300 uppercase italic">Chưa ký</div>}
                    </div>
                    <div className="text-center">
                        <p className="text-[12px] font-black text-slate-800 uppercase tracking-tight">{inspection.inspectorName}</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Đại diện NCC</p>
                    <div className="bg-slate-50 p-4 rounded-[1.5rem] border border-slate-100 h-32 flex items-center justify-center overflow-hidden shadow-inner">
                        {(inspection.productionSignature || prodSig) ? (
                            <img src={inspection.productionSignature || prodSig} className="h-full object-contain" />
                        ) : <div className="text-[10px] font-black text-slate-300 uppercase italic">Chờ xác nhận</div>}
                    </div>
                    <div className="text-center">
                        <p className="text-[12px] font-black text-slate-800 uppercase tracking-tight">{inspection.productionName || prodName || '---'}</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Quản lý phê duyệt</p>
                    <div className="bg-slate-50 p-4 rounded-[1.5rem] border border-slate-100 h-32 flex items-center justify-center overflow-hidden shadow-inner">
                        {inspection.managerSignature ? (
                            <img src={inspection.managerSignature} className="h-full object-contain" />
                        ) : <div className="text-[10px] text-orange-400 font-black uppercase tracking-[0.2em] animate-pulse">Waiting Approval</div>}
                    </div>
                    <div className="text-center">
                        <p className="text-[12px] font-black text-slate-800 uppercase tracking-tight">{inspection.managerName || 'Manager'}</p>
                    </div>
                </div>
            </div>
        </section>

        {/* --- DISCUSSION SECTION --- */}
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
                {(!inspection.comments || inspection.comments.length === 0) && <p className="text-center text-[10px] text-slate-300 py-10 font-black uppercase tracking-[0.3em]">Hệ thống chưa ghi nhận ý kiến</p>}
            </div>
            <div className="p-4 bg-slate-50/50 border-t border-slate-100 space-y-4">
                {commentAttachments.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
                        {commentAttachments.map((img, idx) => (
                            <div key={idx} className="relative w-20 h-20 shrink-0 group">
                                <img src={img} className="w-full h-full object-cover rounded-2xl border-2 border-blue-200 shadow-lg cursor-pointer" onClick={() => setLightboxState({ images: commentAttachments, index: idx, context: 'PENDING_COMMENT' })}/>
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

      {/* BOTTOM ACTIONS (FIXED) */}
      {!isApproved && (
          <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-0 left-0 right-0 p-4 md:p-6 border-t border-slate-200 bg-white/95 backdrop-blur-xl flex items-center justify-between gap-4 z-40 shadow-[0_-15px_30px_rgba(0,0,0,0.08)]">
              <button onClick={onBack} className="px-8 py-4 text-slate-500 font-black uppercase text-[11px] tracking-widest hover:bg-slate-50 rounded-2xl border border-slate-200 active:scale-95 transition-all shadow-sm">
                  QUAY LẠI
              </button>
              
              <div className="flex gap-4 flex-1 justify-end">
                  <button 
                    onClick={() => setShowProductionModal(true)} 
                    className={`flex-1 md:flex-none px-8 py-4 font-black uppercase text-[11px] tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md border ${
                        isProdSigned 
                        ? 'bg-indigo-50 text-indigo-400 border-indigo-100 cursor-default opacity-80' 
                        : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                    }`}
                    disabled={isProdSigned}
                  >
                      {isProdSigned ? <CheckCircle2 className="w-4 h-4"/> : <UserPlus className="w-4 h-4"/>} 
                      {isProdSigned ? 'ĐÃ XÁC NHẬN' : 'NCC XÁC NHẬN'}
                  </button>
                  
                  {isManager && (
                      <button 
                        onClick={() => setShowManagerModal(true)} 
                        className="flex-1 md:flex-none px-12 py-4 bg-emerald-600 text-white font-black uppercase text-[11px] tracking-[0.2em] rounded-2xl shadow-2xl shadow-emerald-500/30 flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all border border-transparent"
                      >
                          <ShieldCheck className="w-5 h-5"/> PHÊ DUYỆT
                      </button>
                  )}
              </div>
          </div>
      )}

      {/* MODALS */}
      {showManagerModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                      <div className="flex items-center gap-3">
                          <ShieldCheck className="w-6 h-6 text-emerald-600" />
                          <h3 className="font-black text-slate-800 uppercase tracking-tighter text-base">QA/QC Manager Approval</h3>
                      </div>
                      <button onClick={() => setShowManagerModal(false)}><X className="w-7 h-7 text-slate-400"/></button>
                  </div>
                  <div className="p-8 space-y-6 bg-slate-50/30">
                      <div className="bg-white p-5 rounded-[2rem] border border-slate-100 text-center shadow-sm">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Authorized System User</p>
                          <p className="text-base font-black text-slate-800 uppercase tracking-tight">{user.name}</p>
                      </div>
                      <SignaturePad label="Chữ ký điện tử Manager *" value={managerSig} onChange={setManagerSig} />
                  </div>
                  <div className="p-6 border-t bg-white flex gap-4">
                      <button onClick={() => setShowManagerModal(false)} className="flex-1 py-4 text-slate-500 font-black uppercase text-[11px] rounded-2xl hover:bg-slate-50 border border-slate-100 shadow-sm transition-all">Hủy</button>
                      <button 
                        onClick={handleManagerApprove} disabled={isProcessing || !managerSig}
                        className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl shadow-emerald-500/30 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                          {isProcessing ? <Loader2 className="w-5 h-5 animate-spin"/> : <ShieldCheck className="w-5 h-5"/>} 
                          XÁC NHẬN DUYỆT
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showProductionModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                      <div className="flex items-center gap-3">
                          <UserPlus className="w-6 h-6 text-indigo-600" />
                          <h3 className="font-black text-slate-800 uppercase tracking-tighter text-base">Xác nhận Đối Tác NCC</h3>
                      </div>
                      <button onClick={() => setShowProductionModal(false)}><X className="w-7 h-7 text-slate-400"/></button>
                  </div>
                  <div className="p-8 space-y-6 bg-slate-50/30">
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Họ và tên đại diện *</label>
                          <input 
                              value={prodName} onChange={e => setProdName(e.target.value.toUpperCase())}
                              className="w-full px-5 py-4 bg-white border border-slate-200 rounded-[1.5rem] font-black text-sm uppercase focus:ring-4 focus:ring-indigo-100 outline-none shadow-sm transition-all h-12"
                              placeholder="NHẬP HỌ TÊN..."
                          />
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Ghi chú / Ý kiến NCC</label>
                          <textarea
                              value={prodComment}
                              onChange={e => setProdComment(e.target.value)}
                              className="w-full px-5 py-4 bg-white border border-slate-200 rounded-[2rem] font-bold text-xs outline-none focus:ring-4 focus:ring-indigo-100 h-28 resize-none shadow-sm transition-all"
                              placeholder="Nhập ghi chú phản hồi..."
                          />
                      </div>
                      <SignaturePad label="Chữ ký xác nhận đại diện *" value={prodSig} onChange={setProdSig} />
                  </div>
                  <div className="p-6 border-t bg-white flex gap-4">
                      <button onClick={() => setShowProductionModal(false)} className="flex-1 py-4 text-slate-500 font-black uppercase text-[11px] rounded-2xl hover:bg-slate-50 border border-slate-100 shadow-sm transition-all">Hủy</button>
                      <button 
                        onClick={handleProductionConfirm} disabled={isProcessing || !prodSig || !prodName}
                        className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-2xl shadow-indigo-500/30 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                          {isProcessing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>} 
                          LƯU XÁC NHẬN
                      </button>
                  </div>
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
