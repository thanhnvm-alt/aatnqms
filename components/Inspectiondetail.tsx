import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, CheckItem, NCRComment, Workshop, NCR } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, MapPin, 
  Box, AlertTriangle, CheckCircle2, Clock, 
  MessageSquare, Camera, Paperclip, Send, Loader2,
  Trash2, Edit3, X, Maximize2, ShieldCheck,
  CheckCircle, Image as ImageIcon, LayoutList, AlertOctagon,
  Eraser, ChevronRight, Building2, UserCheck
} from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';
import { NCRDetail } from './NCRDetail';

interface InspectionDetailProps {
  inspection: Inspection;
  user: User;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove?: (id: string, signature: string, productionInfo?: { signature: string, name: string }) => Promise<void>;
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
            img.onload = () => { ctx?.drawImage(img, 0, 0, canvas.width, canvas.height); };
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
                {!readOnly && <button onClick={clear} className="text-[10px] font-bold text-red-500 uppercase flex items-center gap-1 hover:underline"><Eraser className="w-3 h-3"/> Xóa ký lại</button>}
            </div>
            <div className="border border-slate-300 rounded-[2rem] bg-white overflow-hidden relative h-40 shadow-inner">
                <canvas ref={canvasRef} width={400} height={160} className={`w-full h-full ${readOnly ? 'cursor-default' : 'cursor-crosshair touch-none'}`} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                {!value && !readOnly && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[10px] font-black uppercase tracking-widest">Ký tại đây</div>}
            </div>
        </div>
    );
};

export const Inspectiondetail: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment, workshops = [] }) => {
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  
  const [managerSignature, setManagerSignature] = useState('');
  const [productionSignature, setProductionSignature] = useState(inspection.productionSignature || '');
  const [productionName, setProductionName] = useState(inspection.productionName || '');
  
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  const [viewingNcr, setViewingNcr] = useState<NCR | null>(null);

  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isApproved = inspection.status === InspectionStatus.COMPLETED || inspection.status === InspectionStatus.APPROVED;
  const isProductionSigned = !!inspection.productionSignature;

  const workshopName = workshops.find(w => w.code === inspection.ma_nha_may)?.name || inspection.ma_nha_may || 'SITE WORK';

  const handleApprove = async () => {
      if (!managerSignature) { alert("Bắt buộc phải ký tên Manager để phê duyệt."); return; }
      if (!isProductionSigned && (!productionSignature || !productionName.trim())) {
          alert("Yêu cầu đầy đủ chữ ký và họ tên của Đại diện Sản xuất.");
          return;
      }
      if (!onApprove) return;
      setIsApproving(true);
      try {
          const productionInfo = !isProductionSigned ? { signature: productionSignature, name: productionName } : undefined;
          await onApprove(inspection.id, managerSignature, productionInfo);
          onBack();
      } catch (e) { alert("Lỗi phê duyệt."); } finally { setIsApproving(false); }
  };

  const handlePostComment = async () => {
      if (!newComment.trim() || !onPostComment) return;
      setIsSubmittingComment(true);
      try { await onPostComment(inspection.id, { id: Date.now().toString(), userId: user.id, userName: user.name, userAvatar: user.avatar, content: newComment, createdAt: new Date().toISOString() }); setNewComment(''); } 
      catch (e) { alert("Lỗi gửi phản hồi."); } finally { setIsSubmittingComment(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
      <div className="bg-white border-b border-slate-200 p-5 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2.5 hover:bg-slate-100 rounded-2xl transition-colors border border-slate-100 shadow-sm"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
              <div>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-tighter">CHI TIẾT KIỂM TRA</h2>
                  <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${isApproved ? 'bg-green-600 text-white border-green-600' : 'bg-orange-50 text-white border-orange-500'}`}>{inspection.status}</span>
                  </div>
              </div>
          </div>
          <div className="flex items-center gap-2">
              {!isApproved && <button onClick={() => onEdit(inspection.id)} className="p-3 text-blue-600 hover:bg-blue-50 rounded-2xl"><Edit3 className="w-5 h-5" /></button>}
              <button onClick={() => onDelete(inspection.id)} className="p-3 text-red-600 hover:bg-red-50 rounded-2xl"><Trash2 className="w-5 h-5" /></button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-8 no-scrollbar pb-40 bg-slate-50/50">
        <div className="bg-white rounded-[3rem] p-8 border border-slate-200 shadow-sm">
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">{inspection.ten_hang_muc}</h1>
            <p className="text-sm font-bold text-slate-500 mt-2 uppercase">{inspection.ten_ct} (Mã: {inspection.ma_ct})</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-10 pt-10 border-t border-slate-100">
                <div><p className="text-[9px] font-black text-slate-400 uppercase mb-1.5">Xưởng</p><p className="text-xs font-black text-slate-800 uppercase">{workshopName}</p></div>
                <div><p className="text-[9px] font-black text-slate-400 uppercase mb-1.5">Inspector</p><p className="text-xs font-black text-slate-800 uppercase">{inspection.inspectorName}</p></div>
                <div><p className="text-[9px] font-black text-slate-400 uppercase mb-1.5">Ngày kiểm</p><p className="text-xs font-black text-slate-800 uppercase">{inspection.date}</p></div>
                <div><p className="text-[9px] font-black text-slate-400 uppercase mb-1.5">Điểm số</p><p className="text-xs font-black text-blue-600 uppercase">{inspection.score}/100</p></div>
            </div>
        </div>

        <div className="space-y-6">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] px-4">Nội dung thẩm định</h3>
            {inspection.items.map((item, idx) => (
                <div key={idx} className={`bg-white p-6 rounded-[3rem] border shadow-sm ${item.status === CheckStatus.FAIL ? 'border-red-200' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase border ${item.status === CheckStatus.PASS ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>{item.status}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.category}</span>
                    </div>
                    <p className="text-base font-black text-slate-800 uppercase tracking-tight">{item.label}</p>
                    {item.notes && <p className="text-sm text-slate-500 mt-2 italic">"{item.notes}"</p>}
                </div>
            ))}
        </div>
      </div>

      {isManager && !isApproved && (
          <div className="fixed bottom-0 left-0 right-0 p-8 border-t border-slate-200 bg-white/90 backdrop-blur-xl flex justify-between gap-3 z-40 shadow-lg">
              <button onClick={onBack} className="px-8 py-4 text-slate-500 font-black uppercase text-[10px] tracking-[0.2em] border border-slate-200 rounded-2xl">Quay lại</button>
              <button onClick={handleApprove} disabled={isApproving} className="px-16 py-4 bg-green-600 text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl shadow-xl hover:bg-green-700 transition-all flex items-center gap-3">
                  {isApproving ? <Loader2 className="w-5 h-5 animate-spin"/> : <CheckCircle className="w-5 h-5"/>}
                  <span>PHÊ DUYỆT</span>
              </button>
          </div>
      )}
    </div>
  );
};