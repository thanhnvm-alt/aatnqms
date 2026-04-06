
import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, Workshop, NCR } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, Building2, Box, FileText, 
  CheckCircle2, Clock, Trash2, Edit3, X, Maximize2, ShieldCheck,
  LayoutList, MessageSquare, Loader2, Eraser, Send, 
  UserPlus, AlertOctagon, ChevronRight, Hash, Layers
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

import { SignaturePad } from './SignaturePad';

export const InspectionDetailFRS: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment, workshops = [] }) => {
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [viewingNcr, setViewingNcr] = useState<NCR | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);
  const [managerSig, setManagerSig] = useState('');

  const isAdmin = user.role === 'ADMIN';
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isApproved = inspection.status === InspectionStatus.COMPLETED || inspection.status === InspectionStatus.APPROVED;
  const isOwner = inspection.inspectorName === user.name;
  const canModify = isAdmin || (!isApproved && (isManager || isOwner));
  const items = inspection.items || [];

  const handleManagerApprove = async () => {
      if (!managerSig) { alert("Vui lòng ký tên trước khi phê duyệt."); return; }
      if (!onApprove) return;
      setIsProcessing(true);
      try {
          await onApprove(inspection.id, managerSig, { managerName: user.name });
          alert("FSR Approved!");
          setShowManagerModal(false);
          onBack();
      } catch (e) { alert("Lỗi khi phê duyệt."); } finally { setIsProcessing(false); }
  };

  const handlePostComment = async () => {
      if (!newComment.trim() || !onPostComment) return;
      setIsSubmittingComment(true);
      const comment: NCRComment = { id: Date.now().toString(), userId: user.id, userName: user.name, userAvatar: user.avatar, content: newComment, createdAt: new Date().toISOString() };
      try { await onPostComment(inspection.id, comment); setNewComment(''); } 
      catch (e) { alert("Lỗi khi gửi phản hồi."); } finally { setIsSubmittingComment(false); }
  };

  if (viewingNcr) return <NCRDetail ncr={viewingNcr} user={user} onBack={() => setViewingNcr(null)} onViewInspection={() => {}} />;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors active:scale-90 border border-slate-200"><ArrowLeft className="w-4 h-4 text-slate-600" /></button>
              <div className="flex items-center gap-2"><h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">FSR REPORT</h2><span className="text-[10px] text-slate-400 font-mono font-medium uppercase">#{inspection.id.split('-').pop()}</span></div>
          </div>
          <div className="flex items-center gap-2">
              {canModify && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Edit3 className="w-4 h-4" /></button>}
              {canModify && <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>}
          </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 no-scrollbar pb-40 md:pb-32 bg-slate-50">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <h1 className="text-lg font-bold text-slate-900 uppercase mb-2">{inspection.ten_hang_muc}</h1>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-600">
                <p>Dự án: {inspection.ma_ct}</p>
                <p>Ngày kiểm: {inspection.date}</p>
                <p>QC: {inspection.inspectorName}</p>
            </div>
        </div>
        
        {/* Checklist Items */}
        <div className="space-y-2">
            {items.map((item, idx) => (
                <div key={idx} className={`bg-white p-3 rounded-xl border shadow-sm ${item.status === CheckStatus.FAIL ? 'border-red-200 ring-1 ring-red-50' : 'border-slate-200'}`}>
                    <div className="flex justify-between items-start mb-2"><span className="text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded uppercase">{item.category}</span><span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${item.status === CheckStatus.PASS ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{item.status}</span></div>
                    <p className="text-[11px] font-bold text-slate-800">{item.label}</p>
                    {item.notes && <p className="text-[10px] text-slate-500 italic mt-1">"{item.notes}"</p>}
                </div>
            ))}
        </div>

        {/* Approval */}
        <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-blue-700 border-b border-blue-50 pb-2 font-bold text-[11px] uppercase tracking-wide flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-500"/> Phê duyệt FSR</h3>
            <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="text-center"><p className="text-[9px] font-bold text-slate-500 uppercase mb-1">QC Thực hiện</p><div className="bg-slate-50 p-2 rounded-xl h-20 flex items-center justify-center">{inspection.signature ? <img src={inspection.signature} className="h-full object-contain" /> : <span className="text-[9px]">Chưa ký</span>}</div></div>
                <div className="text-center"><p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Manager Duyệt</p><div className="bg-slate-50 p-2 rounded-xl h-20 flex items-center justify-center">{inspection.managerSignature ? <img src={inspection.managerSignature} className="h-full object-contain" /> : <span className="text-[9px] text-orange-400">Chờ duyệt</span>}</div></div>
            </div>
        </section>
      </div>

      {!isApproved && isManager && (
          <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-0 left-0 right-0 p-3 border-t border-slate-200 bg-white/95 backdrop-blur-xl flex justify-end z-40">
              <button onClick={() => setShowManagerModal(true)} className="py-3 px-8 bg-emerald-600 text-white font-bold uppercase text-[9px] tracking-wide rounded-xl shadow-lg active:scale-95">DUYỆT FSR</button>
          </div>
      )}

      {showManagerModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
                  <h3 className="font-bold text-slate-800 uppercase text-sm">Manager Phê Duyệt FSR</h3>
                  <SignaturePad label="Chữ ký điện tử" value={managerSig} onChange={setManagerSig} />
                  <div className="flex gap-3 pt-2"><button onClick={() => setShowManagerModal(false)} className="flex-1 py-3 text-slate-500 font-bold uppercase text-[9px] rounded-xl border">Hủy</button><button onClick={handleManagerApprove} disabled={isProcessing || !managerSig} className="flex-[2] py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase text-[10px] shadow-lg">{isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : 'XÁC NHẬN'}</button></div>
              </div>
          </div>
      )}
      {lightboxState && <ImageEditorModal images={lightboxState.images} initialIndex={lightboxState.index} onClose={() => setLightboxState(null)} readOnly={true} />}
    </div>
  );
};
