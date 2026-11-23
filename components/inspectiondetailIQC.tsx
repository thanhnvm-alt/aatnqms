
import React, { useState, useRef, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import { Inspection, InspectionStatus, CheckStatus, User, MaterialIQC, NCRComment, canUserModifyInspection } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, Building2, Box, FileText, 
  CheckCircle2, Clock, Trash2, Edit3, X, Maximize2, ShieldCheck,
  LayoutList, PenTool, ChevronDown, ChevronUp,
  Layers, MessageSquare, Loader2, Eraser, Info,
  ClipboardList, Send, Save, Check, Download,
  FileCheck, Camera, Image as ImageIcon, CheckCircle, AlertTriangle
} from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';

interface InspectionDetailProps {
  inspection: Inspection;
  user: User;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove?: (id: string, signature: string, extraInfo?: any) => Promise<void>;
  onPostComment?: (id: string, comment: NCRComment) => Promise<void>;
}

import { SignaturePad } from './SignaturePad';
import { getProxyImageUrl } from '../src/utils';
import { TwoTierApproval } from './TwoTierApproval';
import QRCode from 'qrcode';

export const InspectionDetailIQC: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment }) => {
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number; context?: any } | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [managerSig, setManagerSig] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  
  useEffect(() => {
    const generateQR = async () => {
      try {
        const url = `${window.location.origin}/?share=${inspection.id}`;
        const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 200 });
        setQrCodeUrl(dataUrl);
      } catch (err) { console.error(err); }
    };
    generateQR();
  }, [inspection.id]);

  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);

  const isApproved = ['APPROVED', 'VERIFIED', 'LOCKED', 'COMPLETED'].includes(String(inspection.status || '').toUpperCase());
  const isGuest = user.role === 'GUEST';
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const canModify = !isGuest && canUserModifyInspection(inspection, user);

  const handleManagerApprove = async () => {
    if (!managerSig) { alert("Vui lòng ký tên trước khi phê duyệt."); return; }
    if (!onApprove) return;
    setIsProcessing(true);
    try { 
        await onApprove(inspection.id, managerSig, { 
            managerName: user.name,
            managerSignature: managerSig,
            status: InspectionStatus.APPROVED
        }); 
        setShowManagerModal(false); 
        // Logic handled by App.tsx (setView(LIST))
    } 
    catch (e) { alert("Lỗi khi phê duyệt."); } finally { setIsProcessing(false); }
  };

  const handleManagerReject = async () => {
      const reason = window.prompt("Nhập lý do từ chối hồ sơ IQC này:");
      if (reason === null) return;
      if (!reason.trim()) return alert("Vui lòng nhập lý do từ chối.");

      if (!onApprove) return;
      setIsProcessing(true);
      try { 
          await onApprove(inspection.id, "", { 
              status: InspectionStatus.REJECTED,
              summary: (inspection.summary || "") + "\n\n[LÝ DO TỪ CHỐI]: " + reason 
          }); 
      } 
      catch (e: any) { 
          alert("Lỗi từ chối: " + (e.message || "Unknown Error")); 
      } finally { setIsProcessing(false); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      try {
          const { uploadQMSImage } = await import('../services/apiService');
          const processed = await Promise.all(Array.from(files).map(async (f: File) => {
              return await uploadQMSImage(f, { entityId: inspection.id || 'new', type: 'COMMENT', role: 'ATTACHMENT' });
          }));
          setCommentAttachments(prev => [...prev, ...processed]);
      } catch (err) {
          alert("Lỗi tải ảnh lên.");
      }
      e.target.value = '';
  };

  const updateCommentImage = (idx: number, newImg: string) => {
      setCommentAttachments(prev => {
          const next = [...prev];
          next[idx] = newImg;
          return next;
      });
  };

  const handleEditCommentImage = (idx: number) => {
      setLightboxState({ images: commentAttachments, index: idx, context: 'PENDING_COMMENT' });
  };

  const handlePostComment = async () => {
      if (!newComment.trim() && commentAttachments.length === 0) return;
      if (!onPostComment) return;
      setIsSubmittingComment(true);
      try {
          await onPostComment(inspection.id, { 
              id: Date.now().toString(), userId: user.id, userName: user.name, 
              userAvatar: user.avatar, content: newComment, createdAt: new Date().toISOString(),
              attachments: commentAttachments
          } as any);
          setNewComment(''); setCommentAttachments([]);
      } catch (e) { alert("Lỗi gửi bình luận."); } finally { setIsSubmittingComment(false); }
  };

  const handleExportPDF = async () => {
      if (!pdfRef.current) return;
      try {
          // Format date for filename: DDMMYYYY
          const dateParts = (inspection.date || '').split('/');
          const dateStr = dateParts.length === 3 ? `${dateParts[0]}${dateParts[1]}${dateParts[2]}` : (inspection.date || '').replace(/\//g, '');
          const filename = `IQC_report_${inspection.ma_ct || 'NA'}_${inspection.headcode || inspection.ma_nha_may || 'NA'}_${dateStr}.pdf`;

          const opt = {
            margin:       0.2,
            filename:     filename,
            image:        { type: 'jpeg' as const, quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' as const }
          };
          html2pdf().set(opt).from(pdfRef.current).save();
      } catch (err: any) {
          console.error(err);
          alert('Không thể xuất PDF: ' + err.message);
      }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-800/50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-3 py-2.5 sm:p-4 sticky top-0 z-30 shadow-sm flex justify-between items-center gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
              <button onClick={onBack} className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 bg-slate-50 dark:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700 shadow-sm shrink-0" type="button" aria-label="Quay lại"><ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" /></button>
              <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-none truncate">IQC REVIEW REPORT</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${isApproved ? 'bg-green-600 text-white border-green-600' : 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300 border-orange-200 dark:border-orange-800'}`}>{inspection.status}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono font-bold tracking-tight uppercase tabular-nums">#{inspection.id.split('-').pop()}</span>
                  </div>
              </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button onClick={handleExportPDF} className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl active:scale-95 transition-all shadow-sm" type="button" title="Xuất PDF" aria-label="Xuất PDF"><Download className="w-4 h-4"/></button>
              {canModify && <button onClick={() => onEdit(inspection.id)} className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-slate-700 border border-blue-200/70 dark:border-slate-700 rounded-xl active:scale-95 transition-all" type="button" title="Chỉnh sửa" aria-label="Chỉnh sửa"><Edit3 className="w-4 h-4" /></button>}
              {canModify && <button onClick={() => onDelete(inspection.id)} className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200/70 dark:border-red-800/50 rounded-xl active:scale-95 transition-all" type="button" title="Xóa" aria-label="Xóa"><Trash2 className="w-4 h-4" /></button>}
          </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-6 space-y-4 no-scrollbar bg-slate-50 dark:bg-slate-800/50 pb-40 md:pb-32">
        <div ref={pdfRef} className="max-w-4xl mx-auto space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-5 relative overflow-hidden">
                {/* QR Code for Public Verification */}
                {qrCodeUrl && (
                  <div className="absolute left-6 top-6 w-16 h-16 border border-slate-100 p-1 bg-white shadow-sm z-10">
                    <img src={qrCodeUrl} alt="QR Code" className="w-full h-full" />
                    <p className="text-[6px] font-black text-center text-slate-400 mt-1 uppercase tracking-tighter">Scan to verify</p>
                  </div>
                )}
                
                <div className="absolute right-0 top-0 p-12 opacity-5 pointer-events-none uppercase font-black text-8xl rotate-12 select-none tracking-widest">IQC</div>
                
                <div className="flex flex-col items-center mb-8 pt-16 sm:pt-4">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{inspection.ten_ct}</p>
                    <h1 className="text-[14px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight text-center">BÁO CÁO KIỂM TRA VẬT TƯ ĐẦU VÀO (IQC)</h1>
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                        {(inspection.po_number || inspection.poNumber || inspection.pr_number || inspection.prNumber) && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 shadow-sm">
                                <FileText className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-mono font-bold uppercase tracking-wide">
                                    Số PO / PR: {inspection.po_number || inspection.poNumber || inspection.pr_number || inspection.prNumber}
                                </span>
                            </div>
                        )}
                        {inspection.supplier && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 w-fit">
                                <Building2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{inspection.supplier}</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Số PO / PR</p>
                        <p className="text-[12px] font-mono font-bold text-blue-600 dark:text-blue-400 truncate tabular-nums">{inspection.po_number || inspection.poNumber || inspection.pr_number || inspection.prNumber || '---'}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Mã Dự Án</p>
                        <p className="text-[12px] font-mono font-bold text-slate-800 dark:text-slate-200 truncate tabular-nums">{inspection.ma_ct || '---'}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Ngày kiểm</p>
                        <p className="text-[12px] font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums">{(() => {
                            if (!inspection.date) return '---';
                            if (/^\d+$/.test(inspection.date)) return new Date(Number(inspection.date) * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            const parts = inspection.date.split('-');
                            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                            const d = new Date(inspection.date);
                            return isNaN(d.getTime()) ? inspection.date : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                        })()}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">QC/QA</p>
                        <p className="text-[12px] font-bold text-slate-800 dark:text-slate-200 uppercase truncate">{inspection.inspectorName}</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                {(inspection.images?.length || 0) > 0 && (
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2"><ImageIcon className="w-3.5 h-3.5" /> Bằng chứng hiện trường</p>
                        <div className="flex gap-2.5 overflow-x-auto pb-2 no-scrollbar">
                            {inspection.images?.map((img, idx) => (
                                <button type="button" key={idx} onClick={() => setLightboxState({ images: inspection.images!, index: idx })} className="w-24 h-24 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm cursor-zoom-in shrink-0 active:scale-95 transition-transform">
                                    <img src={getProxyImageUrl(img)} alt={`Ảnh hiện trường ${idx + 1}`} className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                
                <div className="space-y-2">
                    <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2"><FileCheck className="w-3 h-3 text-blue-500 dark:text-blue-400" /> Tài liệu hồ sơ đính kèm</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {(inspection.supportingDocs || []).map(doc => (
                            <div key={doc.id} className={`flex items-center gap-2 p-2 rounded-lg border text-[9px] font-bold uppercase tracking-tight ${doc.verified ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-slate-700 text-blue-700' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500'}`}>
                                {doc.verified ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <div className="w-3.5 h-3.5 rounded border border-slate-300 dark:border-slate-600 shrink-0" />}
                                <span className="truncate">{doc.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-2 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-blue-500 dark:text-blue-400" /> Danh mục vật tư</h3>
            {(inspection.materials || []).map((mat, idx) => {
                const isExp = expandedMaterial === mat.id;
                const hasFail = mat.items?.some(it => it.status === CheckStatus.FAIL);
                const hasCond = mat.items?.some(it => it.status === CheckStatus.CONDITIONAL);
                const allPass = (mat.items?.length || 0) > 0 && mat.items?.every(it => it.status === CheckStatus.PASS);

                return (
                    <div key={mat.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <button type="button" onClick={() => setExpandedMaterial(isExp ? null : mat.id)} className={`w-full text-left p-4 min-h-[56px] flex items-center justify-between gap-3 cursor-pointer transition-colors ${isExp ? 'bg-blue-50 dark:bg-slate-800/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
                            <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 tabular-nums ${isExp ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>{idx + 1}</div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm uppercase tracking-tight leading-snug">{mat.name}</h4>
                                        {allPass && <span className="bg-green-600 text-white px-2 py-0.5 rounded-full text-[9px] font-black uppercase shadow-sm">ĐẠT</span>}
                                        {hasFail && <span className="bg-red-600 text-white px-2 py-0.5 rounded-full text-[9px] font-black uppercase shadow-sm">NCR</span>}
                                        {hasCond && <span className="bg-amber-500 text-white px-2 py-0.5 rounded-full text-[9px] font-black uppercase shadow-sm">CĐK</span>}
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase mt-1 tabular-nums">Loại kiểm: {mat.inspectType || '100%'} • {mat.deliveryQty} {mat.unit}</p>
                                </div>
                            </div>
                            <span className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center shrink-0">
                                {isExp ? <ChevronUp className="w-5 h-5 text-blue-500 dark:text-blue-400"/> : <ChevronDown className="w-5 h-5 text-slate-400"/>}
                            </span>
                        </button>
                        {isExp && (
                            <div className="p-4 sm:p-5 space-y-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 tabular-nums">
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Phân loại</p>
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase mt-1">{mat.scope === 'COMMON' ? 'Dùng chung' : 'Công trình'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Mã dự án</p>
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase mt-1">{mat.projectCode || 'N/A'}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Tên công trình</p>
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase mt-1 truncate">{mat.projectName || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Chủng loại</p>
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase mt-1">{mat.category || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Loạt kiểm</p>
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase mt-1">{mat.inspectType || '100%'}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Giao (DN) / DVT</p>
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase mt-1">{mat.deliveryQty || 0} {mat.unit || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Kiểm tra</p>
                                        <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-1">{mat.inspectQty || 0}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-green-400 uppercase tracking-widest">Đạt</p>
                                        <p className="text-xs font-bold text-green-600 dark:text-green-500 mt-1">{mat.passQty || 0}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-red-400 uppercase tracking-widest">Hỏng</p>
                                        <p className="text-xs font-bold text-red-600 dark:text-red-400 mt-1">{mat.failQty || 0}</p>
                                    </div>
                                </div>

                                <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-widest pt-2">Chi tiết kiểm tra</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {mat.items?.map(item => (
                                        <div key={item.id} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800 shadow-sm">
                                            <div className="flex justify-between items-start">
                                                <p className="text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase">{item.label}</p>
                                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${item.status === CheckStatus.PASS ? 'text-green-600 dark:text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : item.status === CheckStatus.FAIL ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200' : 'text-amber-600 bg-amber-50 border-amber-200'}`}>{item.status}</span>
                                            </div>
                                            {item.notes && <p className="text-[9px] text-slate-500 dark:text-slate-400 dark:text-slate-500 italic mt-1">"{item.notes}"</p>}
                                            {item.images && item.images.length > 0 && (
                                                <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
                                                    {item.images.map((img, i) => (
                                                        <button type="button" key={i} onClick={() => setLightboxState({ images: item.images!, index: i })} className="w-16 h-16 rounded-lg border border-white dark:border-slate-700 shadow-sm overflow-hidden cursor-zoom-in shrink-0 active:scale-95 transition-transform">
                                                            <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt={`Ảnh kiểm tra ${i + 1}`} />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        <TwoTierApproval inspection={inspection} user={user} onApprove={onApprove!} />

        <section className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col mb-10">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Thảo luận hồ sơ</h3>
            </div>
            <div className="p-6 space-y-6 max-h-[500px] overflow-y-auto no-scrollbar">
                {inspection.comments?.map((comment) => (
                    <div key={comment.id} className="flex gap-4 animate-in slide-in-from-left-2 duration-300">
                        <img src={comment.userAvatar ? getProxyImageUrl(comment.userAvatar) : `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0 shadow-sm" alt="" referrerPolicy="no-referrer" />
                        <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <span className="font-black text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-tight">{comment.userName}</span>
                                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-[1.5rem] rounded-tl-none border border-slate-100 dark:border-slate-800 text-[12px] text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap leading-relaxed shadow-sm">{comment.content}</div>
                            {comment.attachments && comment.attachments.length > 0 && (
                                <div className="flex gap-3 flex-wrap pt-2">
                                    {comment.attachments.map((img, i) => (
                                        <button type="button" key={i} onClick={() => setLightboxState({ images: comment.attachments!, index: i })} className="w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm cursor-zoom-in transition-all hover:scale-105 shrink-0">
                                            <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 space-y-4">
                {commentAttachments.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pt-2 pb-1 pr-2">
                        {commentAttachments.map((img, idx) => (
                            <div key={idx} className="relative w-20 h-20 shrink-0 group">
                                <button type="button" onClick={() => handleEditCommentImage(idx)} className="w-full h-full rounded-2xl overflow-hidden border-2 border-blue-200 dark:border-slate-700 shadow-lg cursor-pointer block">
                                    <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt="Đính kèm" />
                                </button>
                                <button type="button" onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-red-600 text-white w-7 h-7 flex items-center justify-center rounded-full shadow-xl active:scale-90 transition-all border-2 border-white dark:border-slate-900" aria-label="Xóa ảnh đính kèm"><X className="w-3.5 h-3.5"/></button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex gap-2.5 sm:gap-3 items-end">
                    <div className="flex-1 relative">
                        <textarea 
                            value={newComment} 
                            onChange={(e) => setNewComment(e.target.value)} 
                            onPaste={(e) => {
                                const items = e.clipboardData.items;
                                for (let i = 0; i < items.length; i++) {
                                    if (items[i] && items[i].type && items[i].type.indexOf("image") !== -1) {
                                        const file = items[i].getAsFile();
                                        if (file) {
                                            e.preventDefault();
                                            const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
                                            handleImageUpload(event);
                                        }
                                    }
                                }
                            }}
                            placeholder="Nhập ý kiến phản hồi về chất lượng sản phẩm..." 
                            className="w-full pl-4 sm:pl-5 pr-28 py-3.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 outline-none resize-none min-h-[76px] shadow-inner transition-all" 
                        />
                        <div className="absolute right-2 bottom-2 flex items-center gap-1">
                            <button type="button" onClick={() => commentCameraRef.current?.click()} className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition-all active:scale-90" title="Chụp ảnh" aria-label="Chụp ảnh"><Camera className="w-5 h-5"/></button>
                            <button type="button" onClick={() => commentFileRef.current?.click()} className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition-all active:scale-90" title="Chọn ảnh" aria-label="Chọn ảnh"><ImageIcon className="w-5 h-5"/></button>
                        </div>
                    </div>
                    <button type="button" onClick={handlePostComment} disabled={isSubmittingComment || (!newComment.trim() && commentAttachments.length === 0)} className="min-w-[48px] min-h-[48px] w-14 h-14 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-500/30 flex items-center justify-center active:scale-95 disabled:opacity-30 transition-all shrink-0 hover:bg-blue-700" aria-label="Gửi bình luận"><Send className="w-6 h-6" /></button>
                </div>
            </div>
        </section>
      </div>

      <div className="sticky bottom-0 z-[110] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700 px-4 lg:pr-24 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-15px_30px_rgba(0,0,0,0.1)] shrink-0 flex gap-3">
          <button type="button" onClick={onBack} className="w-full min-h-[44px] lg:min-h-[40px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black uppercase text-xs tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" /> Quay lại</button>
      </div>

      {lightboxState && (
          <ImageEditorModal 
              images={lightboxState.images} 
              initialIndex={lightboxState.index} 
              onClose={() => setLightboxState(null)} 
              readOnly={true} 
          />
      )}
      <input type="file" ref={commentFileRef} className="hidden" multiple accept="image/*" onChange={handleImageUpload} />
      <input type="file" ref={commentCameraRef} className="hidden" capture="environment" accept="image/*" onChange={handleImageUpload} />
    </div>
  );
};
