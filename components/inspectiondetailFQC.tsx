
import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, User, Workshop, CheckStatus } from '../types';
import { ArrowLeft, Box, Edit3, Trash2, ShieldCheck, ScanEye, CheckCircle2, AlertOctagon, X, Loader2, Eraser, Calendar, Image as ImageIcon, Maximize2 } from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';

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
    const draw = (e: any) => { if (!isDrawing || readOnly) return; const canvas = canvasRef.current; if (canvas) { const ctx = canvas.getContext('2d'); if (!ctx) return; const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; ctx.lineTo(clientX - rect.left, clientY - rect.top); ctx.stroke(); }; };
    const stopDrawing = () => { if (readOnly) return; setIsDrawing(false); if (canvasRef.current) onChange(canvasRef.current.toDataURL()); };
    const clear = () => { const canvas = canvasRef.current; if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, canvas.width, canvas.height); onChange(''); } };
    return (<div className="flex flex-col gap-1.5"><div className="flex justify-between items-center px-1"><label className="block text-slate-700 font-bold text-[9px] uppercase">{label}</label>{!readOnly && <button onClick={clear} className="text-[9px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1" type="button"><Eraser className="w-3 h-3"/> Xóa</button>}</div><div className="border border-slate-300 rounded-xl bg-white overflow-hidden relative h-24 shadow-inner"><canvas ref={canvasRef} width={400} height={96} className={`w-full h-full ${readOnly ? 'cursor-default' : 'cursor-crosshair touch-none'}`} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />{!value && !readOnly && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 text-[9px] font-bold uppercase">Ký tại đây</div>}</div></div>);
};

export const InspectionDetailFQC: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove }) => {
  const [managerSig, setManagerSig] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);

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
          <div className="flex items-center gap-2"><button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200"><ArrowLeft className="w-4 h-4 text-slate-600" /></button><span className="text-sm font-bold text-slate-900 uppercase">FQC REPORT REVIEW</span></div>
          <div className="flex gap-2">{!isApproved && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 bg-blue-50 rounded-lg"><Edit3 className="w-4 h-4"/></button>}<button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 bg-red-50 rounded-lg"><Trash2 className="w-4 h-4"/></button></div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 pb-24 no-scrollbar">
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm relative overflow-hidden">
            <h1 className="text-lg font-bold text-blue-900 uppercase mb-2 flex items-center gap-2"><ScanEye className="w-5 h-5 text-blue-600"/> {inspection.ten_hang_muc}</h1>
            <div className="flex justify-between items-end">
                <div className="text-[10px] font-bold text-slate-600 space-y-1"><p>Dự án: {inspection.ma_ct}</p><p>SL Kiểm: {inspection.inspectedQuantity}</p></div>
                <div className="text-3xl font-black text-blue-200 absolute right-4 bottom-2 opacity-20">FINAL</div>
            </div>
        </div>

        {/* Global Evidence */}
        {inspection.images && inspection.images.length > 0 && (
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><ImageIcon className="w-3 h-3"/> Ảnh hiện trường tổng quát</h3>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {inspection.images.map((img, idx) => (
                        <div key={idx} onClick={() => setLightboxState({ images: inspection.images!, index: idx })} className="w-16 h-16 rounded-lg overflow-hidden border border-slate-100 shrink-0 cursor-zoom-in">
                            <img src={img} className="w-full h-full object-cover" alt=""/>
                        </div>
                    ))}
                </div>
            </div>
        )}

        <div className="space-y-2">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Chi tiết hạng mục</h3>
            {inspection.items.map((item, i) => (
                <div key={i} className={`bg-white p-3 rounded-xl border shadow-sm ${item.status === CheckStatus.FAIL ? 'border-red-200 bg-red-50/10' : 'border-slate-200'}`}>
                    <div className="flex items-start gap-3">
                        <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${item.status === CheckStatus.PASS ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-2">
                                <p className="font-bold text-[11px] text-slate-800 leading-tight uppercase">{item.label}</p>
                                <span className={`shrink-0 px-2 py-0.5 rounded text-[8px] font-black uppercase border ${item.status === CheckStatus.PASS ? 'text-green-600 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>{item.status}</span>
                            </div>
                            {item.notes && <p className="text-[10px] italic text-slate-500 mt-1">"{item.notes}"</p>}
                            
                            {/* Item specific images */}
                            {item.images && item.images.length > 0 && (
                                <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar py-1">
                                    {item.images.map((img, imgIdx) => (
                                        <div key={imgIdx} onClick={() => setLightboxState({ images: item.images!, index: imgIdx })} className="w-12 h-12 rounded-lg overflow-hidden border border-slate-100 shrink-0 cursor-zoom-in shadow-sm">
                                            <img src={img} className="w-full h-full object-cover" alt=""/>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 mt-2">
            <h3 className="text-[10px] font-bold uppercase text-slate-500 border-l-4 border-blue-500 pl-2 mb-3">Hồ sơ phê duyệt</h3>
            <div className="grid grid-cols-2 gap-4">
                <div className="text-center space-y-1">
                    <div className="bg-slate-50 h-24 rounded-xl flex items-center justify-center border border-slate-100 shadow-inner overflow-hidden">
                        {inspection.signature ? <img src={inspection.signature} className="h-full object-contain"/> : <span className="text-[9px] text-slate-300">N/A</span>}
                    </div>
                    <span className="text-[9px] font-bold uppercase text-slate-800">{inspection.inspectorName}</span>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">QC Inspector</p>
                </div>
                <div className="text-center space-y-1">
                    <div className="bg-slate-50 h-24 rounded-xl flex items-center justify-center border border-slate-100 shadow-inner overflow-hidden">
                        {inspection.managerSignature ? <img src={inspection.managerSignature} className="h-full object-contain"/> : <span className="text-[9px] text-orange-400 font-black animate-pulse">CHỜ DUYỆT</span>}
                    </div>
                    <span className="text-[9px] font-bold uppercase text-slate-800">Manager Approval</span>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">QA/QC Manager</p>
                </div>
            </div>
        </div>
      </div>

      {!isApproved && isManager && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-slate-200 flex justify-end z-40 shadow-lg">
            <button onClick={() => setShowModal(true)} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase text-[10px] shadow-xl shadow-blue-200 active:scale-95 transition-all">DUYỆT BÁO CÁO FQC</button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-3xl w-full max-w-sm space-y-5 animate-in zoom-in duration-200 shadow-2xl">
                <div className="flex justify-between items-center">
                    <h3 className="font-black uppercase text-sm tracking-tight">Xác nhận phê duyệt</h3>
                    <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400"/></button>
                </div>
                <SignaturePad label="Chữ ký điện tử Manager" value={managerSig} onChange={setManagerSig}/>
                <div className="flex gap-3 pt-2">
                    <button onClick={() => setShowModal(false)} className="flex-1 py-3 border border-slate-200 rounded-xl text-[10px] font-bold uppercase text-slate-500">Hủy bỏ</button>
                    <button onClick={handleApprove} disabled={!managerSig || isProcessing} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-blue-100 disabled:opacity-50">
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : 'XÁC NHẬN PHÊ DUYỆT'}
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
              readOnly={true} 
          />
      )}
    </div>
  );
};
