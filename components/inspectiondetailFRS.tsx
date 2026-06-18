import { getProxyImageUrl } from '../src/utils';

import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, Workshop, NCR, canUserModifyInspection } from '../types';
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
import { TwoTierApproval } from './TwoTierApproval';

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
  const canModify = canUserModifyInspection(inspection, user);
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

  if (viewingNcr) return <NCRDetail ncr={viewingNcr} user={user} onBack={() => setViewingNcr(null)} onViewInspection={() => setViewingNcr(null)} />;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-800/50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-xl transition-colors active:scale-90 border border-slate-200 dark:border-slate-700"><ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-400 dark:text-slate-500" /></button>
              <div className="flex items-center gap-2"><h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">FSR REPORT</h2><span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono font-medium uppercase">#{inspection.id.split('-').pop()}</span></div>
          </div>
          <div className="flex items-center gap-2">
              {canModify && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-slate-800/80 rounded-xl transition-all"><Edit3 className="w-4 h-4" /></button>}
              {canModify && <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-900/20 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>}
          </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 no-scrollbar pb-40 md:pb-32 bg-slate-50 dark:bg-slate-800/50">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 uppercase mb-2">{inspection.ten_hang_muc}</h1>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-400 dark:text-slate-500">
                <p>Dự án: {inspection.ma_ct}</p>
                <p>Ngày kiểm: {inspection.date}</p>
                <p>QC: {inspection.inspectorName}</p>
            </div>
        </div>
        
        {/* Checklist Items */}
        <div className="space-y-2">
            {items.map((item, idx) => (
                <div key={idx} className={`bg-white dark:bg-slate-900 p-3 rounded-xl border shadow-sm ${item.status === CheckStatus.FAIL ? 'border-red-200 ring-1 ring-red-50' : 'border-slate-200 dark:border-slate-700'}`}>
                    <div className="flex justify-between items-start mb-2"><span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded uppercase">{item.category}</span><span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${item.status === CheckStatus.PASS ? 'bg-green-50 dark:bg-green-900/20 text-green-700 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 border-red-200'}`}>{item.status}</span></div>
                    <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{item.label}</p>
                    {item.notes && <p className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500 italic mt-1">"{item.notes}"</p>}
                </div>
            ))}
        </div>

        <TwoTierApproval inspection={inspection} user={user} onApprove={onApprove!} />
      </div>


      {lightboxState && <ImageEditorModal images={lightboxState.images} initialIndex={lightboxState.index} onClose={() => setLightboxState(null)} readOnly={true} />}
    </div>
  );
};
