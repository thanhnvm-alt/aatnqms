import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, Workshop, NCR } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, Building2, Box, FileText, 
  CheckCircle2, Clock, Trash2, Edit3, X, Maximize2, ShieldCheck,
  LayoutList, MessageSquare, Loader2, Eraser, Send, 
  UserPlus, AlertOctagon, ChevronRight, Hash, Layers, 
  CheckCircle, Image as ImageIcon, AlertTriangle
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
            img.onload = () => { ctx?.clearRect(0, 0, canvas.width, canvas.height); ctx?.drawImage(img, 0, 0, canvas.width, canvas.height); };
            img.src = value;
        }
    }, [value]);
    const startDrawing = (e: any) => { if (readOnly) return; const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; ctx.beginPath(); ctx.moveTo(clientX - rect.left, clientY - rect.top); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000000'; setIsDrawing(true); };
    const draw = (e: any) => { if (!isDrawing || readOnly) return; const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; ctx.lineTo(clientX - rect.left, clientY - rect.top); ctx.stroke(); };
    const stopDrawing = () => { if (readOnly) return; setIsDrawing(false); if (canvasRef.current) onChange(canvasRef.current.toDataURL()); };
    const clear = () => { const canvas = canvasRef.current; if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height); onChange(''); } };
    return (<div className="flex flex-col gap-1.5"><div className="flex justify-between items-center px-1"><label className="block text-slate-700 font-bold text-[9px] uppercase tracking-wide">{label}</label>{!readOnly && <button onClick={clear} className="text-[9px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1" type="button"><Eraser className="w-3 h-3"/> Xóa</button>}</div><div className="border border-slate-300 rounded-xl bg-white overflow-hidden relative h-32 shadow-inner"><canvas ref={canvasRef} width={400} height={128} className={`w-full h-full ${readOnly ? 'cursor-default' : 'cursor-crosshair touch-none'}`} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />{!value && !readOnly && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[9px] font-bold uppercase">Ký tại đây</div>}</div></div>);
};

export const InspectionDetailPQC: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment, workshops = [] }) => {
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [viewingNcr, setViewingNcr] = useState<NCR | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  const [managerSig, setManagerSig] = useState('');
  const [prodSig, setProdSig] = useState(inspection.productionSignature || '');
  const [prodName, setProdName] = useState(inspection.productionName || '');

  const isApproved = inspection.status === InspectionStatus.COMPLETED || inspection.status === InspectionStatus.APPROVED;
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isProdSigned = !!inspection.productionSignature;

  const handleManagerApprove = async () => {
      if (!managerSig) return alert("Vui lòng ký tên.");
      if (!onApprove) return;
      setIsProcessing(true);
      try { await onApprove(inspection.id, managerSig, { managerName: user.name }); onBack(); } 
      catch (e) { alert("Lỗi phê duyệt."); } finally { setIsProcessing(false); }
  };

  const handleProductionConfirm = async () => {
      if (!prodSig || !prodName) return alert("Vui lòng ký và nhập tên.");
      if (!onApprove) return;
      setIsProcessing(true);
      try { await onApprove(inspection.id, "", { signature: prodSig, name: prodName.toUpperCase() }); setShowProductionModal(false); } 
      catch (e) { alert("Lỗi xác nhận."); } finally { setIsProcessing(false); }
  };

  if (viewingNcr) return <NCRDetail ncr={viewingNcr} user={user} onBack={() => setViewingNcr(null)} onViewInspection={() => {}} />;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200"><ArrowLeft className="w-4 h-4 text-slate-600" /></button>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">PQC DETAIL</h2>
          </div>
          <div className="flex items-center gap-2">
              {!isApproved && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl"><Edit3 className="w-4 h-4" /></button>}
              <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl"><Trash2 className="w-4 h-4" /></button>
          </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-40">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <h1 className="text-xl font-bold text-slate-800 uppercase mb-2">{inspection.ten_hang_muc}</h1>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <div><p className="mb-1">Dự án</p><p className="text-slate-800">{inspection.ma_ct}</p></div>
                <div><p className="mb-1">Xưởng</p><p className="text-slate-800">{inspection.workshop || inspection.ma_nha_may}</p></div>
                <div><p className="mb-1">QC</p><p className="text-slate-800">{inspection.inspectorName}</p></div>
                <div><p className="mb-1">Ngày</p><p className="text-slate-800">{inspection.date}</p></div>
            </div>
        </div>
        <div className="space-y-2">
            {inspection.items.map((item, idx) => (
                <div key={idx} className={`bg-white p-4 rounded-xl border shadow-sm ${item.status === CheckStatus.FAIL ? 'border-red-200' : 'border-slate-200'}`}>
                    <div className="flex justify-between items-start mb-2">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border ${item.status === CheckStatus.PASS ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>{item.status}</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">{item.category}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-800">{item.label}</p>
                    {item.ncr && <button onClick={() => setViewingNcr(item.ncr!)} className="mt-2 text-[9px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded flex items-center gap-1 uppercase"><AlertOctagon className="w-3 h-3"/> Chi tiết lỗi NCR</button>}
                </div>
            ))}
        </div>
        <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-blue-700 border-b border-blue-50 pb-3 font-bold text-[10px] uppercase tracking-[0.2em] flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-500"/> NHẬT KÝ PHÊ DUYỆT</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center"><p className="text-[9px] font-bold text-slate-400 mb-1 uppercase">QC Inspector</p><div className="bg-slate-50 h-24 rounded-lg flex items-center justify-center border">{inspection.signature ? <img src={inspection.signature} className="h-full object-contain" /> : 'N/A'}</div></div>
                <div className="text-center"><p className="text-[9px] font-bold text-slate-400 mb-1 uppercase">Production Rep</p><div className="bg-slate-50 h-24 rounded-lg flex items-center justify-center border">{inspection.productionSignature ? <img src={inspection.productionSignature} className="h-full object-contain" /> : <button onClick={() => setShowProductionModal(true)} className="text-blue-600 text-[10px] font-bold uppercase">Ký xác nhận</button>}</div></div>
                <div className="text-center"><p className="text-[9px] font-bold text-slate-400 mb-1 uppercase">Manager</p><div className="bg-slate-50 h-24 rounded-lg flex items-center justify-center border">{inspection.managerSignature ? <img src={inspection.managerSignature} className="h-full object-contain" /> : <span className="text-orange-400 text-[10px]">Chờ duyệt</span>}</div></div>
            </div>
        </section>
      </div>
      {!isApproved && isManager && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t flex justify-end gap-3 z-40">
              <button onClick={() => setShowManagerModal(true)} className="px-8 py-3 bg-emerald-600 text-white font-bold uppercase text-[10px] rounded-xl shadow-lg">PHÊ DUYỆT HỒ SƠ</button>
          </div>
      )}
      {showManagerModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
                  <h3 className="font-bold text-slate-800 uppercase text-sm">Manager Approval</h3>
                  <SignaturePad label="Chữ ký điện tử Manager" value={managerSig} onChange={setManagerSig} />
                  <div className="flex gap-3 pt-2"><button onClick={() => setShowManagerModal(false)} className="flex-1 py-2 border rounded-lg text-xs font-bold">Hủy</button><button onClick={handleManagerApprove} disabled={isProcessing || !managerSig} className="flex-[2] py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">XÁC NHẬN</button></div>
              </div>
          </div>
      )}
      {showProductionModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
                  <h3 className="font-bold text-slate-800 uppercase text-sm">Xác nhận Sản xuất</h3>
                  <input value={prodName} onChange={e => setProdName(e.target.value.toUpperCase())} className="w-full p-2 border rounded-lg uppercase text-xs font-bold" placeholder="HỌ TÊN ĐẠI DIỆN..." />
                  <SignaturePad label="Chữ ký xác nhận" value={prodSig} onChange={setProdSig} />
                  <div className="flex gap-3 pt-2"><button onClick={() => setShowProductionModal(false)} className="flex-1 py-2 border rounded-lg text-xs font-bold">Hủy</button><button onClick={handleProductionConfirm} disabled={isProcessing || !prodSig || !prodName} className="flex-[2] py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold">XÁC NHẬN</button></div>
              </div>
          </div>
      )}
    </div>
  );
};