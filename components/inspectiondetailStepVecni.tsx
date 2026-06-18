import { getProxyImageUrl } from '../src/utils';
import React, { useState, useRef, useEffect } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, Workshop, NCR, canUserModifyInspection } from '../types';
import { ArrowLeft, Calendar, User as UserIcon, Box, Edit3, Trash2, ShieldCheck, Palette, Layers, CheckCircle2, AlertOctagon, X, Loader2, Eraser } from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';
import { TwoTierApproval } from './TwoTierApproval';

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

export const InspectionDetailStepVecni: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove }) => {
  const canModify = canUserModifyInspection(inspection, user);
  const isApproved = inspection.status === InspectionStatus.APPROVED;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-800/50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2"><button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700"><ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-400 dark:text-slate-500" /></button><span className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase">STEP VECNI REPORT</span></div>
          <div className="flex gap-2">
            {canModify && <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-slate-800/80 rounded-lg"><Edit3 className="w-4 h-4"/></button>}
            {canModify && <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4"/></button>}
          </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-800/50 pb-24">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-purple-100 shadow-sm">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 uppercase mb-2 flex items-center gap-2"><Palette className="w-5 h-5 text-purple-600"/> {inspection.ten_hang_muc}</h1>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-600 dark:text-slate-400 dark:text-slate-500">
                <p>Dự án: {inspection.ma_ct}</p>
                <p>Xưởng: {inspection.workshop || 'N/A'}</p>
            </div>
        </div>
        <div className="space-y-3">
            {inspection.items.map((item, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-1"><span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">{item.category}</span>
                    {/* Fixed: Changed 'Pass' string to CheckStatus.PASS enum to fix unintentional comparison error */}
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase ${item.status === CheckStatus.PASS ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-500 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200'}`}>{item.status}</span></div>
                    <p className="font-bold text-[11px] text-slate-800 dark:text-slate-200">{item.label}</p>
                    {item.notes && <p className="text-[10px] italic text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">"{item.notes}"</p>}
                </div>
            ))}
        </div>
        <TwoTierApproval inspection={inspection} user={user} onApprove={onApprove!} />
      </div>

    </div>
  );
};
