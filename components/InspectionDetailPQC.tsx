
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, Workshop, NCR } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, Building2, Box, FileText, 
  CheckCircle2, Clock, Trash2, Edit3, X, Maximize2, ShieldCheck,
  LayoutList, MessageSquare, Loader2, Eraser, Send, 
  UserPlus, AlertOctagon, ChevronRight, Hash, Layers,
  Camera, Image as ImageIcon, Paperclip
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

const resizeImage = (base64Str: string, maxWidth = 1000): Promise<string> => {
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
      if (!ctx) { resolve(base64Str); return; }
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height);
      
      let quality = 0.7;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      
      // Strict compression loop: Target < 100KB (approx 133,333 base64 chars)
      while (dataUrl.length > 133333 && quality > 0.1) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(dataUrl);
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

export const InspectionDetailPQC: React.FC<InspectionDetailProps> = ({ 
  inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment, workshops = [] 
}) => {
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [viewingNcr, setViewingNcr] = useState<NCR | null>(null);
  
  // Image handling
  const [commentImages, setCommentImages] = useState<string[]>([]);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);
  
  // Editor State: Replaces lightboxState to handle both View (ReadOnly) and Edit (Comment Draft)
  const [editorState, setEditorState] = useState<{ images: string[]; index: number; context: 'VIEW' | 'COMMENT_DRAFT' } | null>(null);

  const [managerSig, setManagerSig] = useState('');
  const [prodSig, setProdSig] = useState(inspection.productionSignature || '');
  const [prodName, setProdName] = useState(inspection.productionName || '');
  const [prodComment, setProdComment] = useState(inspection.productionComment || '');

  const isAdmin = user.role === 'ADMIN';
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isApproved = inspection.status === InspectionStatus.COMPLETED || inspection.status === InspectionStatus.APPROVED;
  const isProdSigned = !!inspection.productionSignature;

  const insQty = parseFloat(String(inspection.inspectedQuantity || 0));
  const passQty = parseFloat(String(inspection.passedQuantity || 0));
  const failQty = parseFloat(String(inspection.failedQuantity || 0));
  const passRate = insQty > 0 ? ((passQty / insQty) * 100).toFixed(1) : "0.0";
  const failRate = insQty > 0 ? ((failQty / insQty) * 100).toFixed(1) : "0.0";

  const isOwner = inspection.inspectorName === user.name;
  const canModify = isAdmin || (!isApproved && (isManager || isOwner));

  // Logic to display Workshop Name instead of Code
  const workshopCode = inspection.workshop || inspection.ma_nha_may;
  const workshopDisplay = useMemo(() => {
      const found = workshops.find(w => w.code === workshopCode);
      return found ? found.name : (workshopCode || '---');
  }, [workshopCode, workshops]);

  // Logic to display Date in DD/MM/YYYY format
  const formattedDate = useMemo(() => {
      if (!inspection.date) return '---';
      try {
          // Assuming format YYYY-MM-DD from database
          const dateParts = inspection.date.split('-');
          if (dateParts.length === 3) {
              return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
          }
          return new Date(inspection.date).toLocaleDateString('vi-VN');
      } catch (e) {
          return inspection.date;
      }
  }, [inspection.date]);

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
          alert("Đã xác nhận từ bộ phận sản xuất.");
          setShowProductionModal(false);
      } catch (e) { alert("Lỗi xác nhận."); } finally { setIsProcessing(false); }
  };

  const handleCommentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      
      const processed = await Promise.all(Array.from(files).map(async (f: File) => {
          const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(f);
          });
          return resizeImage(base64); // Strict <100kb compression
      }));
      
      setCommentImages(prev => [...prev, ...processed]);
      e.target.value = '';
  };

  const handlePostComment = async () => {
      if ((!newComment.trim() && commentImages.length === 0) || !onPostComment) return;
      setIsSubmittingComment(true);
      const comment: NCRComment = {
          id: Date.now().toString(),
          userId: user.id,
          userName: user.name,
          userAvatar: user.avatar,
          content: newComment,
          createdAt: new Date().toISOString(),
          attachments: commentImages
      };
      try { 
          await onPostComment(inspection.id, comment); 
          setNewComment(''); 
          setCommentImages([]);
      } 
      catch (e) { alert("Lỗi khi gửi phản hồi."); } finally { setIsSubmittingComment(false); }
  };

  const onImageSave = (index: number, updatedImg: string) => {
      if (editorState?.context === 'COMMENT_DRAFT') {
          setCommentImages(prev => prev.map((img, i) => i === index ? updatedImg : img));
      }
      // For VIEW context (inspection images), we don't save edits here typically, 
      // or we could implement update logic if requirement changes.
  };

  const InfoRow = ({ icon: Icon, label, value, iconColor = "text-slate-400" }: any) => (
      <div>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-0.5 flex items-center gap-1.5">
              <Icon className={`w-3 h-3 ${iconColor}`}/> {label}
          </p>
          <p className="text-[11px] font-bold text-slate-800">{value || '---'}</p>
      </div>
  );

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

  const items = inspection.items || [];

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors active:scale-90 border border-slate-200"><ArrowLeft className="w-4 h-4 text-slate-600" /></button>
              <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">PQC REPORT</h2>
                  <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${isApproved ? 'bg-green-600 text-white border-green-600' : 'bg-orange-500 text-white border-orange-500'}`}>{inspection.status}</span>
                      <span className="text-[10px] text-slate-400 font-mono font-medium uppercase">#{inspection.id.split('-').pop()}</span>
                  </div>
              </div>
          </div>
          <div className="flex items-center gap-2">
              {canModify && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Edit3 className="w-4 h-4" /></button>}
              {canModify && <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>}
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 no-scrollbar pb-40 md:pb-32 bg-slate-50">
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="lg:col-span-2">
                    <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wide mb-1">Thông tin dự án</p>
                    <h1 className="text-lg font-bold text-slate-900 uppercase leading-tight mb-1">{inspection.ten_ct}</h1>
                    <p className="text-[11px] font-medium text-slate-500 uppercase">{inspection.ten_hang_muc}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-2 flex flex-col items-center justify-center border border-green-100">
                    <p className="text-[9px] font-bold text-green-600 uppercase tracking-wide mb-0.5">TỶ LỆ ĐẠT</p>
                    <p className="text-xl font-bold text-green-700">{passRate}%</p>
                </div>
                <div className="bg-red-50 rounded-lg p-2 flex flex-col items-center justify-center border border-red-100">
                    <p className="text-[9px] font-bold text-red-600 uppercase tracking-wide mb-0.5">TỶ LỆ LỖI</p>
                    <p className="text-xl font-bold text-red-700">{failRate}%</p>
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100">
                <InfoRow icon={Box} label="Mã dự án" value={inspection.ma_ct} />
                <InfoRow icon={Hash} label="Mã nhà máy" value={inspection.ma_nha_may} />
                <InfoRow icon={Building2} label="Xưởng sản xuất" value={workshopDisplay} iconColor="text-blue-500" />
                <InfoRow icon={Layers} label="Công đoạn" value={inspection.inspectionStage} />
                <InfoRow icon={UserIcon} label="Inspector" value={inspection.inspectorName} />
                <InfoRow icon={Calendar} label="Ngày kiểm" value={formattedDate} />
            </div>
        </div>

        <section className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <h3 className="text-slate-800 font-bold text-[11px] uppercase tracking-wide flex items-center gap-2 border-b border-slate-100 pb-2"><Box className="w-3.5 h-3.5 text-blue-500"/> Hình ảnh tổng quan</h3>
            {inspection.images && inspection.images.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {inspection.images.map((img, idx) => (
                        <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 shrink-0 group cursor-zoom-in shadow-sm hover:shadow-md transition-all" onClick={() => setEditorState({ images: inspection.images!, index: idx, context: 'VIEW' })}>
                            <img src={img} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Maximize2 className="text-white w-5 h-5" /></div>
                        </div>
                    ))}
                </div>
            ) : <p className="text-[10px] text-slate-400 italic">Không có hình ảnh tổng quan.</p>}
        </section>

        <div className="space-y-2">
            <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-wide px-1 flex items-center gap-2"><LayoutList className="w-3.5 h-3.5 text-indigo-500" /> Nội dung PQC ({inspection.inspectionStage || 'N/A'})</h3>
            {items.map((item, idx) => (
                <div key={idx} className={`bg-white p-3 rounded-xl border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-200 ring-1 ring-red-50' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between gap-3 mb-2 border-b border-slate-50 pb-2">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${item.status === CheckStatus.PASS ? 'text-green-700 bg-green-50 border-green-200' : item.status === CheckStatus.FAIL ? 'text-red-700 bg-red-50 border-red-200' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>{item.status}</span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{item.category}</span>
                            </div>
                            <p className="text-[11px] font-bold text-slate-800">{item.label}</p>
                            {item.notes && <p className="text-[10px] text-slate-500 mt-0.5 italic">"{item.notes}"</p>}
                        </div>
                    </div>
                    {item.ncr && (
                        <div onClick={() => setViewingNcr(item.ncr || null)} className="mb-2 p-2 bg-red-50/50 rounded-lg border border-red-100 space-y-1 hover:bg-red-100/50 transition-all cursor-pointer group">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold text-red-600 uppercase flex items-center gap-1.5"><AlertOctagon className="w-3.5 h-3.5"/> NCR Details</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-bold text-red-600 bg-white px-1.5 py-0.5 rounded border border-red-100">{item.ncr.severity}</span>
                                    <ChevronRight className="w-3.5 h-3.5 text-red-400 group-hover:translate-x-1 transition-transform" />
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-700 italic">"{item.ncr.issueDescription}"</p>
                        </div>
                    )}
                    {item.images && item.images.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                            {item.images.map((img, i) => (
                                <div key={i} onClick={() => setEditorState({ images: item.images!, index: i, context: 'VIEW' })} className="w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-slate-200 relative group cursor-zoom-in">
                                    <img src={img} className="w-full h-full object-cover" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
        
        {/* III. Ghi chú tổng quát */}
        {inspection.summary && (
            <section className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-2">
                <h3 className="text-blue-800 font-bold uppercase tracking-widest flex items-center gap-2 text-xs"><MessageSquare className="w-3.5 h-3.5"/> III. GHI CHÚ / TỔNG KẾT</h3>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-[11px] text-slate-700 leading-relaxed font-medium italic">
                    "{inspection.summary}"
                </div>
            </section>
        )}

        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-blue-700 border-b border-blue-50 pb-2 font-bold text-[11px] uppercase tracking-wide flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-500"/> Xác nhận phê duyệt (ISO)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                    <p className="text-[9px] font-bold text-slate-500 uppercase border-l-4 border-blue-500 pl-2">Nhân viên QC</p>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 h-24 flex items-center justify-center overflow-hidden">
                        {inspection.signature ? <img src={inspection.signature} className="h-full object-contain" /> : <div className="text-[9px] text-slate-400 uppercase">Chưa ký</div>}
                    </div>
                    <div className="text-center px-2">
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Họ và Tên</p>
                        <p className="text-[11px] font-bold text-slate-800 uppercase">{inspection.inspectorName}</p>
                    </div>
                </div>
                <div className="space-y-2">
                    <p className="text-[9px] font-bold text-slate-500 uppercase border-l-4 border-orange-500 pl-2">Đại diện Sản xuất</p>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 h-24 flex items-center justify-center overflow-hidden">
                        {(inspection.productionSignature || prodSig) ? (
                            <img src={inspection.productionSignature || prodSig} className="h-full object-contain" />
                        ) : <div className="text-[9px] text-slate-400 uppercase">Chưa ký</div>}
                    </div>
                    <div className="text-center px-2 space-y-0.5">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Họ và Tên</p>
                        <p className="text-[11px] font-bold text-slate-800 uppercase">{inspection.productionName || prodName || '---'}</p>
                    </div>
                    {inspection.productionComment && (
                        <div className="bg-orange-50 p-2 rounded-lg border border-orange-100 mt-1">
                             <p className="text-[9px] font-bold text-orange-700 italic leading-tight">"{inspection.productionComment}"</p>
                        </div>
                    )}
                </div>
                <div className="space-y-2">
                    <p className="text-[9px] font-bold text-slate-500 uppercase border-l-4 border-green-500 pl-2">Quản lý phê duyệt</p>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 h-24 flex items-center justify-center overflow-hidden">
                        {inspection.managerSignature ? (
                            <img src={inspection.managerSignature} className="h-full object-contain" />
                        ) : <div className="text-[9px] text-orange-400 font-bold uppercase tracking-widest animate-pulse">Chưa duyệt</div>}
                    </div>
                    <div className="text-center px-2">
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Cấp phê duyệt</p>
                        <p className="text-[11px] font-bold text-slate-800 uppercase">{inspection.managerName || 'Manager Approval'}</p>
                    </div>
                </div>
            </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col mb-10">
            <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <h3 className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Trao đổi & Ghi chú</h3>
            </div>
            <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto no-scrollbar">
                {inspection.comments?.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                        <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="w-8 h-8 rounded-full border border-slate-200 shrink-0" alt="" />
                        <div className="flex-1 space-y-1.5">
                            <div className="flex justify-between items-center px-1">
                                <span className="font-bold text-slate-800 text-[10px] uppercase">{comment.userName}</span>
                                <span className="text-[9px] font-medium text-slate-400">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                            </div>
                            <div className="bg-slate-50 p-2.5 rounded-xl rounded-tl-none border border-slate-100 text-[11px] text-slate-600">{comment.content}</div>
                            {comment.attachments && comment.attachments.length > 0 && (
                                <div className="flex gap-2 pt-1">
                                    {comment.attachments.map((att, idx) => (
                                        <img 
                                            key={idx} 
                                            src={att} 
                                            onClick={() => setEditorState({ images: comment.attachments!, index: idx, context: 'VIEW' })} 
                                            className="w-12 h-12 object-cover rounded-lg border border-slate-200 cursor-zoom-in" 
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {(!inspection.comments || inspection.comments.length === 0) && <p className="text-center text-[10px] text-slate-400 py-4 italic font-medium">Chưa có bình luận trao đổi cho phiếu này.</p>}
            </div>
            <div className="p-3 border-t border-slate-100 bg-slate-50/30">
                {commentImages.length > 0 && (
                    <div className="flex gap-2 mb-2 overflow-x-auto pb-1 no-scrollbar">
                        {commentImages.map((img, idx) => (
                            <div key={idx} className="relative w-12 h-12 shrink-0 group">
                                <img 
                                    src={img} 
                                    className="w-full h-full object-cover rounded-lg border border-slate-200 cursor-pointer" 
                                    onClick={() => setEditorState({ images: commentImages, index: idx, context: 'COMMENT_DRAFT' })}
                                />
                                <button 
                                    onClick={() => setCommentImages(prev => prev.filter((_, i) => i !== idx))}
                                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm"
                                >
                                    <X className="w-2.5 h-2.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex gap-2">
                    <div className="flex-1 relative">
                        <textarea 
                            value={newComment} onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Nhập phản hồi..."
                            className="w-full pl-3 pr-20 py-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-medium focus:ring-1 focus:ring-blue-500 outline-none resize-none shadow-sm h-10 transition-all"
                        />
                        <div className="absolute right-2 bottom-2 flex items-center gap-1">
                            <button onClick={() => commentCameraRef.current?.click()} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg active:scale-90 transition-all"><Camera className="w-3.5 h-3.5"/></button>
                            <button onClick={() => commentFileRef.current?.click()} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg active:scale-90 transition-all"><Paperclip className="w-3.5 h-3.5"/></button>
                        </div>
                    </div>
                    <button 
                        onClick={handlePostComment} disabled={isSubmittingComment || (!newComment.trim() && commentImages.length === 0)}
                        className="w-10 h-10 bg-blue-600 text-white rounded-xl shadow-md flex items-center justify-center active:scale-95 disabled:opacity-50 transition-all shrink-0"
                        type="button"
                    >
                        {isSubmittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </section>
      </div>

      {/* BOTTOM ACTIONS */}
      {!isApproved && (
          <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-0 left-0 right-0 p-3 md:p-4 border-t border-slate-200 bg-white/95 backdrop-blur-xl flex items-center gap-2 z-40 shadow-lg">
              <button onClick={onBack} className="px-3 py-3 text-slate-500 font-bold uppercase text-[9px] tracking-widest hover:bg-slate-50 rounded-xl border border-transparent hover:border-slate-200 transition-all shrink-0">
                  Quay lại
              </button>
              
              <div className="flex gap-2 flex-1 justify-end">
                  <button 
                    onClick={() => setShowProductionModal(true)} 
                    className={`flex-1 py-3 font-bold uppercase text-[9px] tracking-wide rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm border ${
                        isProdSigned 
                        ? 'bg-indigo-50 text-indigo-400 border-indigo-100 cursor-default opacity-80' 
                        : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                    }`}
                    disabled={isProdSigned}
                  >
                      {isProdSigned ? <CheckCircle2 className="w-3.5 h-3.5"/> : <UserPlus className="w-3.5 h-3.5"/>} 
                      {isProdSigned ? 'Đã Xác Nhận' : 'NCC Ký'}
                  </button>
                  
                  {isManager && (
                      <button 
                        onClick={() => setShowManagerModal(true)} 
                        className="flex-1 py-3 bg-emerald-600 text-white font-bold uppercase text-[9px] tracking-wide rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-1.5 hover:bg-emerald-700 active:scale-95 transition-all border border-transparent"
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
                  <div className="p-5 border-t bg-slate-50/50 flex gap-3">
                      <button onClick={() => setShowManagerModal(false)} className="flex-1 py-3 text-slate-500 font-bold uppercase text-[9px] rounded-xl hover:bg-white border border-transparent hover:border-slate-200 transition-all">Hủy</button>
                      <button 
                        onClick={handleManagerApprove} disabled={isProcessing || !managerSig}
                        className="flex-[2] py-3.5 bg-emerald-600 text-white rounded-xl font-bold uppercase text-[10px] tracking-wide shadow-lg active:scale-95 disabled:opacity-50"
                      >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : 'PHÊ DUYỆT'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showProductionModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <UserPlus className="w-5 h-5 text-indigo-600" />
                          <h3 className="font-bold text-slate-800 uppercase tracking-tight text-sm">Xác nhận Đại diện Xưởng</h3>
                      </div>
                      <button onClick={() => setShowProductionModal(false)}><X className="w-5 h-5 text-slate-400"/></button>
                  </div>
                  <div className="p-6 space-y-5">
                      <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Họ và tên đại diện *</label>
                          <input 
                              value={prodName} onChange={e => setProdName(e.target.value.toUpperCase())}
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-[11px] uppercase focus:ring-2 focus:ring-indigo-500 outline-none h-10"
                              placeholder="NHẬP HỌ TÊN..."
                          />
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Ghi chú (Tùy chọn)</label>
                          <textarea
                              value={prodComment}
                              onChange={e => setProdComment(e.target.value)}
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-[11px] focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none"
                              placeholder="Nhập ghi chú hoặc ý kiến..."
                          />
                      </div>
                      <SignaturePad label="Chữ ký xác nhận" value={prodSig} onChange={setProdSig} />
                  </div>
                  <div className="p-5 border-t bg-slate-50/50 flex gap-3">
                      <button onClick={() => setShowProductionModal(false)} className="flex-1 py-3 text-slate-500 font-bold uppercase text-[9px] rounded-xl hover:bg-white border border-transparent hover:border-slate-200 transition-all">Hủy</button>
                      <button 
                        onClick={handleProductionConfirm} disabled={isProcessing || !prodSig || !prodName}
                        className="flex-[2] py-3.5 bg-indigo-600 text-white rounded-xl font-bold uppercase text-[10px] tracking-wide shadow-lg active:scale-95 disabled:opacity-50"
                      >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : 'XÁC NHẬN'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {editorState && (
          <ImageEditorModal 
              images={editorState.images} 
              initialIndex={editorState.index} 
              onSave={onImageSave}
              onClose={() => setEditorState(null)} 
              readOnly={editorState.context === 'VIEW'} 
          />
      )}
      <input type="file" ref={commentFileRef} className="hidden" accept="image/*" multiple onChange={handleCommentImageUpload} />
      <input type="file" ref={commentCameraRef} className="hidden" accept="image/*" capture="environment" onChange={handleCommentImageUpload} />
    </div>
  );
};