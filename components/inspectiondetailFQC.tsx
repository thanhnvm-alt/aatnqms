import { getProxyImageUrl } from '../src/utils';

import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, User, Workshop, CheckStatus } from '../types';
import { ArrowLeft, Box, Edit3, Trash2, ShieldCheck, ScanEye, CheckCircle2, AlertOctagon, X, Loader2, Eraser, Calendar, Image as ImageIcon, Maximize2, Download } from 'lucide-react';
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

import { SignaturePad } from './SignaturePad';

export const InspectionDetailFQC: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove }) => {
  const [managerSig, setManagerSig] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const isApproved = inspection.status === InspectionStatus.APPROVED;
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';

  const handleApprove = async () => {
      if (!managerSig) return alert("Vui lòng ký tên.");
      setIsProcessing(true);
      try { if (onApprove) await onApprove(inspection.id, managerSig); setShowModal(false); onBack(); } catch (e) { alert("Lỗi duyệt."); } finally { setIsProcessing(false); }
  };

  const handleExportPDF = async () => {
      if (!pdfContainerRef.current) return;
      try {
          const html2pdf = (await import('html2pdf.js')).default;
          const opt = {
            margin:       0.5,
            filename:     `FQC_Report_${inspection.ma_ct}_${inspection.date.replace(/\//g, '')}.pdf`,
            image:        { type: 'jpeg' as const, quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' as const }
          };
          html2pdf().set(opt).from(pdfContainerRef.current).save();
      } catch (err: any) {
          console.error(err);
          alert('Không thể xuất PDF: ' + err.message);
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2"><button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200"><ArrowLeft className="w-4 h-4 text-slate-600" /></button><span className="text-sm font-bold text-slate-900 uppercase">FQC REPORT REVIEW</span></div>
          <div className="flex gap-2">
            <button onClick={handleExportPDF} className="p-2 text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg"><Download className="w-4 h-4"/></button>
            {!isApproved && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 bg-blue-50 rounded-lg"><Edit3 className="w-4 h-4"/></button>}
            <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 bg-red-50 rounded-lg"><Trash2 className="w-4 h-4"/></button>
          </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 pb-24 no-scrollbar">
        <div ref={pdfContainerRef} className="space-y-4">
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
                            <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" alt=""/>
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
                                            <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" alt=""/>
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
                        {inspection.signature ? <img src={getProxyImageUrl(inspection.signature)} className="h-full object-contain"/> : <span className="text-[9px] text-slate-300">N/A</span>}
                    </div>
                    <span className="text-[9px] font-bold uppercase text-slate-800">{inspection.inspectorName}</span>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">QC Inspector</p>
                </div>
                <div className="text-center space-y-1">
                    <div className="bg-slate-50 h-24 rounded-xl flex items-center justify-center border border-slate-100 shadow-inner overflow-hidden">
                        {inspection.managerSignature ? <img src={getProxyImageUrl(inspection.managerSignature)} className="h-full object-contain"/> : <span className="text-[9px] text-orange-400 font-black animate-pulse">CHỜ DUYỆT</span>}
                    </div>
                    <span className="text-[9px] font-bold uppercase text-slate-800">Manager Approval</span>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">QA/QC Manager</p>
                </div>
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
