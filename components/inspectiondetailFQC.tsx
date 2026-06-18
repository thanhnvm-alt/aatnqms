import { getProxyImageUrl, compressImage } from '../src/utils';

import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, User, Workshop, CheckStatus, canUserModifyInspection } from '../types';
import { ArrowLeft, Box, Edit3, Trash2, ShieldCheck, ScanEye, CheckCircle2, AlertOctagon, X, Loader2, Eraser, Calendar, Image as ImageIcon, Maximize2, Download } from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';

interface InspectionDetailProps {
  inspection: Inspection;
  user: User;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove?: (id: string, signature: string, extraInfo?: any) => Promise<void>;
  workshops?: Workshop[];
}

import { SignaturePad } from './SignaturePad';
import { TwoTierApproval } from './TwoTierApproval';

export const InspectionDetailFQC: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove }) => {
  const canModify = canUserModifyInspection(inspection, user);
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
      try { 
          if (onApprove) await onApprove(inspection.id, managerSig, {
              status: InspectionStatus.APPROVED,
              managerName: user.name,
              managerSignature: managerSig
          }); 
          setShowModal(false); 
      } catch (e) { alert("Lỗi duyệt."); } finally { setIsProcessing(false); }
  };

  const handleReject = async () => {
      const reason = window.prompt("Nhập lý do từ chối hồ sơ FQC này:");
      if (reason === null) return;
      if (!reason.trim()) return alert("Vui lòng nhập lý do từ chối.");

      setIsProcessing(true);
      try { 
          if (onApprove) await onApprove(inspection.id, "", { 
              status: InspectionStatus.REJECTED,
              summary: (inspection.summary || "") + "\n\n[LÝ DO TỪ CHỐI]: " + reason 
          }); 
      } 
      catch (e: any) { 
          alert("Lỗi từ chối: " + (e.message || "Unknown Error")); 
      } finally { setIsProcessing(false); }
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
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-800/50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2"><button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700"><ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-400 dark:text-slate-500" /></button><span className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase">FQC REPORT REVIEW</span></div>
          <div className="flex gap-2">
            <button onClick={handleExportPDF} className="p-2 text-slate-600 dark:text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"><Download className="w-4 h-4"/></button>
            {canModify && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-slate-800/80 rounded-lg"><Edit3 className="w-4 h-4"/></button>}
            {canModify && <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4"/></button>}
          </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-800/50 pb-24 no-scrollbar">
        <div ref={pdfContainerRef} className="space-y-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-blue-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
                <h1 className="text-lg font-bold text-blue-900 uppercase mb-2 flex items-center gap-2"><ScanEye className="w-5 h-5 text-blue-600 dark:text-blue-400"/> {inspection.ten_hang_muc}</h1>
                <div className="flex justify-between items-end">
                    <div className="text-[10px] font-bold text-slate-600 dark:text-slate-400 dark:text-slate-500 space-y-1"><p>Dự án: {inspection.ma_ct}</p><p>SL Kiểm: {inspection.inspectedQuantity}</p></div>
                    <div className="text-3xl font-black text-blue-200 absolute right-4 bottom-2 opacity-20">FINAL</div>
                </div>
            </div>

        {/* Global Evidence */}
        {inspection.images && inspection.images.length > 0 && (
            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <h3 className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><ImageIcon className="w-3 h-3"/> Ảnh hiện trường tổng quát</h3>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {inspection.images.map((img, idx) => (
                        <div key={idx} onClick={() => setLightboxState({ images: inspection.images!, index: idx })} className="w-16 h-16 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 shrink-0 cursor-zoom-in">
                            <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                        </div>
                    ))}
                </div>
            </div>
        )}

        <div className="space-y-2">
            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">Chi tiết hạng mục</h3>
            {inspection.items.map((item, i) => (
                <div key={i} className={`bg-white dark:bg-slate-900 p-3 rounded-xl border shadow-sm ${item.status === CheckStatus.FAIL ? 'border-red-200 bg-red-50 dark:bg-red-900/20/10' : 'border-slate-200 dark:border-slate-700'}`}>
                    <div className="flex items-start gap-3">
                        <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${item.status === CheckStatus.PASS ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-2">
                                <p className="font-bold text-[11px] text-slate-800 dark:text-slate-200 leading-tight uppercase">{item.label}</p>
                                <span className={`shrink-0 px-2 py-0.5 rounded text-[8px] font-black uppercase border ${item.status === CheckStatus.PASS ? 'text-green-600 dark:text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'text-red-700 bg-red-50 dark:bg-red-900/20 border-red-200'}`}>{item.status}</span>
                            </div>
                            {item.notes && <p className="text-[10px] italic text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">"{item.notes}"</p>}
                            
                            {/* Item specific images */}
                            {item.images && item.images.length > 0 && (
                                <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar py-1">
                                    {item.images.map((img, imgIdx) => (
                                        <div key={imgIdx} onClick={() => setLightboxState({ images: item.images!, index: imgIdx })} className="w-12 h-12 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 shrink-0 cursor-zoom-in shadow-sm">
                                            <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>

        <TwoTierApproval inspection={inspection} user={user} onApprove={onApprove!} />
      </div>
      </div>



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
