import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, Workshop } from '../types';
import { ArrowLeft, Box, Edit3, Trash2, ClipboardList, CheckCircle2, AlertOctagon, X, Loader2, Eraser, PenTool } from 'lucide-react';

interface InspectionDetailProps {
  inspection: Inspection;
  user: User;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove?: (id: string, signature: string) => Promise<void>;
  workshops?: Workshop[];
}

const SignaturePad = ({ label, value, onChange, readOnly = false }: { label: string; value?: string; onChange: (base64: string) => void; readOnly?: boolean; }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    useEffect(() => { const canvas = canvasRef.current; if (canvas && value) { const ctx = canvas.getContext('2d'); const img = new Image(); img.onload = () => { ctx?.clearRect(0, 0, canvas.width, canvas.height); ctx?.drawImage(img, 0, 0, canvas.width, canvas.height); }; img.src = value; } }, [value]);
    const startDrawing = (e: any) => { if (readOnly) return; const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; ctx.beginPath(); ctx.moveTo(clientX - rect.left, clientY - rect.top); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000000'; setIsDrawing(true); };
    const draw = (e: any) => { if (!isDrawing || readOnly) return; const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; ctx.lineTo(clientX - rect.left, clientY - rect.top); ctx.stroke(); };
    const stopDrawing = () => { if (readOnly) return; setIsDrawing(false); if (canvasRef.current) onChange(canvasRef.current.toDataURL()); };
    const clear = () => { const canvas = canvasRef.current; if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height); onChange(''); } };
    return (<div className="flex flex-col gap-1.5"><div className="flex justify-between items-center px-1"><label className="block text-slate-700 font-bold text-[9px] uppercase">{label}</label>{!readOnly && <button onClick={clear} className="text-[9px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1" type="button"><Eraser className="w-3 h-3"/> Xóa</button>}</div><div className="border border-slate-300 rounded-xl bg-white overflow-hidden relative h-24 shadow-inner"><canvas ref={canvasRef} width={400} height={96} className={`w-full h-full ${readOnly ? 'cursor-default' : 'cursor-crosshair touch-none'}`} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />{!value && !readOnly && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[9px] font-bold uppercase">Ký tại đây</div>}</div></div>);
};

export const InspectionDetailSPR: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove }) => {
  const [managerSig, setManagerSig] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const isApproved = inspection.status === InspectionStatus.APPROVED;
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';

  const handleApprove = async () => {
      if (!managerSig) return alert("Vui lòng ký tên.");
      setIsProcessing(true);
      try { if (onApprove) await onApprove(inspection.id, managerSig); setShowModal(false); onBack(); } catch (e) { alert("Lỗi duyệt."); } finally { setIsProcessing(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2"><button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200"><ArrowLeft className="w-4 h-4 text-slate-600" /></button><span className="text-sm font-bold text-slate-900 uppercase">SPR REPORT</span></div>
          <div className="flex gap-2">{!isApproved && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 bg-blue-50 rounded-lg"><Edit3 className="w-4 h-4"/></button>}<button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 bg-red-50 rounded-lg"><Trash2 className="w-4 h-4"/></button></div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 pb-24">
        <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-sm relative">
            <h1 className="text-lg font-bold text-slate-900 uppercase mb-2 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-slate-700"/> {inspection.ten_hang_muc}</h1>
            <p className="text-[11px] font-bold text-slate-600">Dự án: {inspection.ma_ct}</p>
            <div className="absolute right-4 top-4 opacity-10 font-black text-4xl text-slate-800">SAMPLE</div>
        </div>
        <div className="space-y-3">
            {inspection.items.map((item, i) => (
                <div key={i} className="bg-white p-3 rounded-xl border border-slate-200">
                    <div className="flex justify-between items-center mb-1"><span className="text-[10px] font-bold text-slate-500 uppercase">{item.category}</span>
                    {/* Fixed: Changed 'Pass' string to CheckStatus.PASS enum to fix unintentional comparison error */}
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase ${item.status === CheckStatus.PASS ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>{item.status}</span></div>
                    <p className="font-bold text-[11px] text-slate-800">{item.label}</p>
                    {item.notes && <p className="text-[10px] italic text-slate-500 mt-1">"{item.notes}"</p>}
                </div>
            ))}
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 mt-2">
            <h3 className="text-[10px] font-bold uppercase text-slate-500 border-l-4 border-slate-500 pl-2 mb-2">Phê duyệt Mẫu</h3>
            <div className="grid grid-cols-2 gap-4">
                <div className="text-center"><div className="bg-slate-50 h-20 rounded-lg flex items-center justify-center border">{inspection.signature ? <img src={inspection.signature} className="h-full object-contain"/> : 'N/A'}</div><span className="text-[9px] font-bold uppercase mt-1 block">{inspection.inspectorName}</span></div>
                <div className="text-center"><div className="bg-slate-50 h-20 rounded-lg flex items-center justify-center border">{inspection.managerSignature ? <img src={inspection.managerSignature} className="h-full object-contain"/> : <span className="text-[9px] text-orange-400">Chờ duyệt</span>}</div><span className="text-[9px] font-bold uppercase mt-1 block">Manager</span></div>
            </div>
        </div>
      </div>
      {!isApproved && isManager && <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 flex justify-end z-40"><button onClick={() => setShowModal(true)} className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold uppercase text-[10px] shadow-lg">DUYỆT MẪU</button></div>}
      {showModal && <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"><div className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4"><h3 className="font-bold uppercase text-sm">Duyệt Mẫu Chuẩn</h3><SignaturePad label="Chữ ký Manager" value={managerSig} onChange={setManagerSig}/><div className="flex gap-2"><button onClick={() => setShowModal(false)} className="flex-1 py-2 border rounded-lg text-xs font-bold uppercase">Hủy</button><button onClick={handleApprove} disabled={!managerSig || isProcessing} className="flex-1 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold uppercase">{isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : 'XÁC NHẬN'}</button></div></div></div>}
    </div>
  );
};
