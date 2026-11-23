import { getProxyImageUrl } from '../src/utils';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import html2pdf from 'html2pdf.js';
import { format as formatDateFns, isValid } from 'date-fns';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, Workshop, NCR, canUserModifyInspection } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, Building2, Box, FileText, 
  CheckCircle2, Clock, Trash2, Edit3, X, Maximize2, ShieldCheck,
  LayoutList, MessageSquare, Loader2, Eraser, Send, 
  UserPlus, AlertOctagon, ChevronRight, Camera, Image as ImageIcon, PenTool,
  ClipboardList, ChevronUp, ChevronDown, Factory, Activity, Save, Check, Download, Link2
} from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { TwoTierApproval } from './TwoTierApproval';
import QRCode from 'qrcode';
import { uploadQMSImage } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';
import { NCRDetail } from './NCRDetail';
import { ProxyImage } from '../src/components/ProxyImage';
import { LinkedBookingsBadgeBar } from './LinkedBookingsBadgeBar';
import { BookingReferenceDocsCard } from './BookingReferenceDocsCard';

interface InspectionDetailProps {
  inspection: Inspection;
  user: User;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove?: (id: string, signature: string, extraInfo?: any) => Promise<void>;
  onPostComment?: (id: string, comment: NCRComment) => Promise<void>;
  onViewInspection?: (id: string) => void;
  workshops?: Workshop[];
}


export const InspectionDetailSQC_TP: React.FC<InspectionDetailProps> = ({ 
  inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment, onViewInspection, workshops = [] 
}) => {
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number; context?: string } | null>(null);
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [showProductionModal, setShowProductionModal] = useState(false);
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
  
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const isApproved = ['APPROVED', 'VERIFIED', 'LOCKED', 'COMPLETED'].includes(String(inspection.status || '').toUpperCase());
  const isGuest = user.role === 'GUEST';
  const isManager = user.role === 'ADMIN' || user.role === 'MANAGER';
  const canModify = !isGuest && canUserModifyInspection(inspection, user);

  const handleExportPDF = async () => {
      if (!pdfContainerRef.current) return;
      try {
          const dateParts = inspection.date.split('/');
          const dateStr = dateParts.length === 3 ? `${dateParts[0]}${dateParts[1]}${dateParts[2]}` : inspection.date.replace(/\//g, '');
          const filename = `SQC_TP_report_${inspection.ma_ct || 'NA'}_${inspection.headcode || inspection.ma_nha_may || 'NA'}_${dateStr}.pdf`;

          const opt = {
            margin:       0.2,
            filename:     filename,
            image:        { type: 'jpeg' as const, quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' as const }
          };
          html2pdf().set(opt).from(pdfContainerRef.current).save();
      } catch (err: any) {
          console.error(err);
          alert('Không thể xuất PDF: ' + err.message);
      }
  };

  // --- STATISTICS CALCULATIONS ---
  const stats = useMemo(() => {
    let ins = Number(inspection.inspectedQuantity || 0);
    let pas = Number(inspection.passedQuantity || 0);
    let fai = Number(inspection.failedQuantity || 0);
    let ipo = Number(inspection.so_luong_ipo || 0);
    
    if (ins === 0 && inspection.materials && inspection.materials.length > 0) {
        ins = inspection.materials.reduce((acc, mat) => acc + (Number(mat.inspectQty) || 0), 0);
        pas = inspection.materials.reduce((acc, mat) => acc + (Number(mat.passQty) || 0), 0);
        fai = inspection.materials.reduce((acc, mat) => acc + (Number(mat.failQty) || 0), 0);
    }

    if (ipo === 0) {
        // try to get from materials if possible
        ipo = inspection.materials ? inspection.materials.reduce((acc, mat) => acc + (Number(mat.orderQty) || Number(mat.deliveryQty) || 0), 0) : 0;
    }
    
    return {
      ipo,
      ins,
      pas,
      fai,
      passRate: ins > 0 ? ((pas / ins) * 100).toFixed(1) : "0.0",
      failRate: ins > 0 ? ((fai / ins) * 100).toFixed(1) : "0.0"
    };
  }, [inspection]);

  const displayDate = useMemo(() => {
    if (!inspection.date) return 'N/A';
    // Check if it's a timestamp
    if (!isNaN(Number(inspection.date))) {
      const ts = Number(inspection.date);
      const d = new Date(ts > 9999999999 ? ts : ts * 1000);
      if (isValid(d)) return formatDateFns(d, 'dd/MM/yyyy');
    }
    // Try parsing ISO or other string
    const d = new Date(inspection.date);
    if (isValid(d)) return formatDateFns(d, 'dd/MM/yyyy');
    return inspection.date;
  }, [inspection.date]);

  const handleManagerApprove = async () => {
      if (!managerSig) { alert("Vui lòng ký tên trước khi phê duyệt."); return; }
      if (!onApprove) return;
      setIsProcessing(true);
      try {
          await onApprove(inspection.id, managerSig, { managerName: user.name });
          setShowManagerModal(false);
          onBack();
      } catch (e) { alert("Lỗi khi phê duyệt."); } finally { setIsProcessing(false); }
  };

  const handlePostComment = async () => {
      if (!newComment.trim() && commentAttachments.length === 0) return;
      if (!onPostComment) return;
      setIsSubmittingComment(true);
      const comment: NCRComment = {
          id: Date.now().toString(),
          userId: user.id,
          userName: user.name,
          userAvatar: user.avatar,
          content: newComment,
          createdAt: new Date().toISOString(),
          attachments: commentAttachments
      };
      try { 
          await onPostComment(inspection.id, comment); 
          setNewComment(''); 
          setCommentAttachments([]);
      } 
      catch (e) { alert("Lỗi khi gửi phản hồi."); } finally { setIsSubmittingComment(false); }
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

  const deliveryNoteImages = inspection.deliveryNoteImages || (inspection.deliveryNoteImage ? [inspection.deliveryNoteImage] : []);
  const reportImages = inspection.reportImages || (inspection.reportImage ? [inspection.reportImage] : []);

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-800/50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-3 py-2.5 sm:px-4 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
              <button onClick={onBack} className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 bg-slate-50 dark:bg-slate-800 rounded-xl transition-colors active:scale-90 border border-slate-200 dark:border-slate-700 shadow-sm shrink-0" type="button" aria-label="Quay lại"><ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" /></button>
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight truncate">Review: SQC - Thành phẩm</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border tracking-widest ${isApproved ? 'bg-green-600 text-white border-green-600' : 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300 border-orange-200 dark:border-orange-800'}`}>{inspection.status}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono font-medium uppercase tracking-tight tabular-nums">#{inspection.id.split('-').pop()}</span>
                      {inspection.booking_code && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-mono font-bold tabular-nums">
                          <Link2 className="w-3 h-3 shrink-0" />
                          {inspection.booking_code}
                        </span>
                      )}
                  </div>
              </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button onClick={handleExportPDF} className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl active:scale-90 transition-all shadow-sm" type="button" title="Xuất PDF" aria-label="Xuất PDF"><Download className="w-4 h-4"/></button>
              {canModify && <button onClick={() => onEdit(inspection.id)} className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-slate-700 border border-blue-200/70 dark:border-slate-700 rounded-xl transition-all" type="button" title="Chỉnh sửa" aria-label="Chỉnh sửa"><Edit3 className="w-4 h-4" /></button>}
              {canModify && <button onClick={() => onDelete(inspection.id)} className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200/70 dark:border-red-800/50 rounded-xl transition-all" type="button" title="Xóa" aria-label="Xóa"><Trash2 className="w-4 h-4" /></button>}
          </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-6 space-y-4 no-scrollbar pb-32 bg-slate-50 dark:bg-slate-800/50">
        
        {/* --- HEADER INFO SECTION --- */}
        <div ref={pdfContainerRef} className="max-w-4xl mx-auto space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-5 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
                {/* QR Code for Public Verification */}
                {qrCodeUrl && (
                  <div className="absolute left-6 top-6 w-16 h-16 border border-slate-100 p-1 bg-white shadow-sm z-10">
                    <img src={qrCodeUrl} alt="QR Code" className="w-full h-full" />
                    <p className="text-[6px] font-black text-center text-slate-400 mt-1 uppercase tracking-tighter">Scan to verify</p>
                  </div>
                )}
                
                <div className="absolute right-0 top-0 p-12 opacity-5 pointer-events-none uppercase font-black text-6xl rotate-12 select-none tracking-widest">SQC-TP</div>
                
                <div className="flex flex-col items-center mb-8 pt-16 sm:pt-4">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{inspection.ten_ct}</p>
                    <h1 className="text-[14px] font-black text-slate-900 dark:text-slate-100 uppercase leading-tight tracking-tight text-center">BÁO CÁO KIỂM TRA THÀNH PHẨM (SQC-TP)</h1>
                </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-y-6 gap-x-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-8">
                <div>
                    <p className="mb-1 flex items-center gap-1.5"><Link2 className="w-3 h-3 text-blue-500"/> Mã Book QC</p>
                    <p className={`text-sm tracking-tight font-mono ${inspection.booking_code ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>{inspection.booking_code || 'Chưa gắn'}</p>
                </div>
                <div>
                    <p className="mb-1 flex items-center gap-1.5"><Box className="w-3 h-3"/> Mã PO / LSX</p>
                    <p className="text-sm text-slate-800 dark:text-slate-200 tracking-tight font-mono">{inspection.po_number || 'N/A'}</p>
                </div>
                <div>
                    <p className="mb-1 flex items-center gap-1.5"><Building2 className="w-3 h-3"/> Nhà cung cấp</p>
                    <p className="text-sm text-slate-800 dark:text-slate-200 tracking-tight">{inspection.supplier || '-'}</p>
                </div>
                <div>
                    <p className="mb-1 flex items-center gap-1.5"><UserIcon className="w-3 h-3"/> QC Thẩm định</p>
                    <p className="text-sm text-slate-800 dark:text-slate-200 tracking-tight">{inspection.inspectorName}</p>
                </div>
                <div>
                    <p className="mb-1 flex items-center gap-1.5"><Calendar className="w-3 h-3"/> Ngày thực hiện</p>
                    <p className="text-sm text-slate-800 dark:text-slate-200 tracking-tight font-mono">{displayDate}</p>
                </div>
            </div>

            <LinkedBookingsBadgeBar inspection={inspection} currentUser={user} onViewInspection={onViewInspection} />
            <div className="mt-4 empty:hidden">
              <BookingReferenceDocsCard
                bookingCode={inspection.booking_code}
                supportingDocs={inspection.supportingDocs}
                referenceDocs={inspection.referenceDocs}
              />
            </div>
          </div>

            {/* --- QUANTITY STATS SECTION --- */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 sm:p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 shadow-inner tabular-nums">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                    <div className="text-center md:border-r border-slate-200 dark:border-slate-700 space-y-1">
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Số IPO</p>
                        <p className="text-lg font-black text-slate-700 dark:text-slate-300">{stats.ipo} <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">{inspection.dvt}</span></p>
                    </div>
                    <div className="text-center md:border-r border-slate-200 dark:border-slate-700 space-y-1">
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Kiểm tra</p>
                        <p className="text-lg font-black text-blue-600 dark:text-blue-400">{stats.ins}</p>
                    </div>
                    <div className="text-center md:border-r border-slate-200 dark:border-slate-700 space-y-1">
                        <p className="text-[10px] font-black text-green-600 dark:text-green-500 uppercase tracking-widest">Đạt</p>
                        <p className="text-lg font-black text-green-600 dark:text-green-500">{stats.pas}</p>
                    </div>
                    <div className="text-center md:border-r border-slate-200 dark:border-slate-700 space-y-1 bg-green-50 dark:bg-green-900/20 rounded-xl py-1.5">
                        <p className="text-[10px] font-black text-green-700 dark:text-green-400 uppercase tracking-widest">Tỷ lệ đạt</p>
                        <p className="text-lg font-black text-green-700 dark:text-green-400">{stats.passRate}%</p>
                    </div>
                    <div className="text-center md:border-r border-slate-200 dark:border-slate-700 space-y-1">
                        <p className="text-[10px] font-black text-red-500 dark:text-red-400 uppercase tracking-widest">Hỏng</p>
                        <p className="text-lg font-black text-red-600 dark:text-red-400">{stats.fai}</p>
                    </div>
                    <div className="text-center space-y-1 bg-red-50 dark:bg-red-900/20 rounded-xl py-1.5">
                        <p className="text-[10px] font-black text-red-700 dark:text-red-400 uppercase tracking-widest">Tỷ lệ hỏng</p>
                        <p className="text-lg font-black text-red-700 dark:text-red-400">{stats.failRate}%</p>
                    </div>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {deliveryNoteImages.length > 0 && (
                <div className="bg-white dark:bg-slate-900 p-4 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400"/> Ảnh Giao Nhận ({deliveryNoteImages.length})</p>
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {deliveryNoteImages.map((img, idx) => (
                            <button type="button" key={idx} onClick={() => setLightboxState({ images: deliveryNoteImages, index: idx })} className="shrink-0 rounded-xl cursor-zoom-in transition-transform hover:scale-105">
                                <ProxyImage src={img} alt="Ảnh giao nhận" className="w-20 h-20 rounded-xl" />
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {reportImages.length > 0 && (
                <div className="bg-white dark:bg-slate-900 p-4 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-emerald-500"/> Báo cáo NCC ({reportImages.length})</p>
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {reportImages.map((img, idx) => (
                            <button type="button" key={idx} onClick={() => setLightboxState({ images: reportImages, index: idx })} className="shrink-0 rounded-xl cursor-zoom-in transition-transform hover:scale-105">
                                <ProxyImage src={img} alt="Ảnh báo cáo" className="w-20 h-20 rounded-xl" />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>

        <div className="space-y-3">
            <h3 className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-teal-600" /> V. Chi tiết Thành phẩm</h3>
            {(inspection.materials || []).map((mat, idx) => {
                const isExp = expandedMaterial === mat.id;
                const matIns = Number(mat.inspectQty || 0);
                const matPas = Number(mat.passQty || 0);
                const matPassRate = matIns > 0 ? ((matPas / matIns) * 100).toFixed(1) : "0.0";

                return (
                    <div key={mat.id} className="bg-white dark:bg-slate-900 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <button type="button" onClick={() => setExpandedMaterial(isExp ? null : mat.id)} className={`w-full text-left p-4 min-h-[56px] flex items-center justify-between gap-3 cursor-pointer transition-colors ${isExp ? 'bg-teal-50/30 dark:bg-teal-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                            <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-xs shrink-0 tabular-nums ${isExp ? 'bg-teal-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>{idx + 1}</div>
                                <div className="min-w-0">
                                    <h4 className="font-black text-slate-800 dark:text-slate-200 text-sm uppercase tracking-tight leading-snug mb-1.5">{mat.name}</h4>
                                    <div className="flex items-center gap-2 flex-wrap tabular-nums">
                                        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/50 px-2 py-0.5 rounded-lg border border-slate-100 dark:border-slate-800">Quy cách: {mat.deliveryQty} {mat.unit}</span>
                                        <span className="text-[10px] font-black text-green-600 dark:text-green-400 uppercase border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-lg shadow-sm">{matPassRate}% ĐẠT</span>
                                    </div>
                                </div>
                            </div>
                            <span className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center shrink-0">
                                {isExp ? <ChevronUp className="w-5 h-5 text-teal-500"/> : <ChevronDown className="w-5 h-5 text-slate-400"/>}
                            </span>
                        </button>
                        {isExp && (
                            <div className="p-4 sm:p-5 space-y-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {mat.items?.map(item => (
                                        <div key={item.id} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3 transition-all hover:bg-white dark:hover:bg-slate-800 hover:shadow-md">
                                            <div className="flex justify-between items-start gap-2">
                                                <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase leading-snug tracking-tight">{item.label}</p>
                                                <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm shrink-0 ${item.status === CheckStatus.PASS ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'} border`}>{item.status}</span>
                                            </div>
                                            {item.notes && <p className="text-xs text-slate-500 dark:text-slate-400 italic leading-relaxed border-l-2 border-slate-200 dark:border-slate-700 pl-3">"{item.notes}"</p>}
                                            
                                            {item.images && item.images.length > 0 && (
                                                <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
                                                    {item.images.map((img, i) => (
                                                        <button type="button" key={i} className="cursor-zoom-in shrink-0 rounded-xl" onClick={() => setLightboxState({ images: item.images!, index: i })}>
                                                            <ProxyImage src={img} alt={`Ảnh item ${item.label}`} className="w-16 h-16 rounded-xl shadow-sm" />
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

        {/* --- NOTES & CONCLUSIONS SECTION (BEFORE SIGNATURES) --- */}
        {(inspection.summary || (inspection.materials?.some(m => m.items?.some(i => i.notes)))) && (
            <section className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
                <h3 className="text-amber-800 border-b border-amber-50 pb-4 font-black text-[11px] uppercase tracking-[0.25em] flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-amber-500"/> GHI CHÚ & KẾT LUẬN CHI TIẾT
                </h3>
                
                <div className="space-y-6">
                    {inspection.summary && (
                        <div className="relative p-6 bg-amber-50/30 rounded-[2rem] border border-amber-100 flex gap-4 items-start">
                            <div className="shrink-0 w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center">
                                <AlertOctagon className="w-5 h-5 text-amber-600" />
                            </div>
                            <div className="flex-1">
                                <p className="text-[10px] font-black text-amber-800/40 uppercase tracking-widest mb-1.5">Ghi chú tổng hợp:</p>
                                <p className="text-sm text-slate-700 dark:text-slate-300 italic font-medium leading-relaxed leading-3">"{inspection.summary}"</p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-3 px-2">
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></span> Ghi chú chi tiết theo hạng mục
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {inspection.materials?.map(mat => 
                                mat.items?.filter(item => item.notes).map(item => (
                                    <div key={item.id} className="group bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-white dark:bg-slate-900 hover:shadow-md transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight leading-none truncate flex-1">{mat.name}</p>
                                            <span className="text-[8px] font-black bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded leading-none shrink-0 ml-2">{item.label}</span>
                                        </div>
                                        <p className="text-[11px] text-slate-600 dark:text-slate-400 dark:text-slate-500 font-medium italic border-l-2 border-slate-200 dark:border-slate-700 pl-3">"{item.notes}"</p>
                                    </div>
                                ))
                            )}
                            {(!inspection.materials?.some(m => m.items?.some(i => i.notes))) && (
                                <p className="col-span-full text-center py-6 text-[9px] font-black text-slate-300 uppercase tracking-widest">Không có ghi chú hạng mục lẻ</p>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        )}

        <TwoTierApproval inspection={inspection} user={user} onApprove={onApprove!} />

        {/* --- DISCUSSION SECTION --- */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col mb-10">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Thảo luận hồ sơ</h3>
            </div>
            <div className="p-6 space-y-6 max-h-[500px] overflow-y-auto no-scrollbar">
                {inspection.comments?.map((comment) => (
                    <div key={comment.id} className="flex gap-4 animate-in slide-in-from-left-2 duration-300">
                        <img src={getProxyImageUrl(comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`)} className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0 shadow-sm" alt="" />
                        <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <span className="font-black text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-tight">{comment.userName}</span>
                                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-[1.5rem] rounded-tl-none border border-slate-100 dark:border-slate-800 text-[12px] text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap leading-relaxed shadow-sm">{comment.content}</div>
                            {comment.attachments && comment.attachments.length > 0 && (
                                <div className="flex gap-3 flex-wrap pt-2">
                                    {comment.attachments.map((img, i) => (
                                        <button type="button" key={i} className="cursor-zoom-in rounded-2xl" onClick={() => setLightboxState({ images: comment.attachments!, index: i })}>
                                            <ProxyImage src={img} alt="Ảnh đính kèm comment" className="w-20 h-20 rounded-2xl shadow-sm" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {(!inspection.comments || inspection.comments.length === 0) && <p className="text-center text-[10px] text-slate-400 py-10 font-black uppercase tracking-[0.3em]">Hệ thống chưa ghi nhận ý kiến</p>}
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 space-y-4">
                {commentAttachments.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pt-2 pb-1 pr-2">
                        {commentAttachments.map((img, idx) => (
                            <div key={idx} className="relative w-20 h-20 shrink-0 group">
                                <button type="button" className="cursor-pointer rounded-2xl block" onClick={() => setLightboxState({ images: commentAttachments, index: idx, context: 'PENDING_COMMENT' })}>
                                    <ProxyImage src={img} alt="Ảnh đính kèm" className="w-20 h-20 rounded-2xl shadow-lg border-2 border-blue-200 dark:border-slate-700" />
                                </button>
                                <button type="button" onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-red-600 text-white w-7 h-7 flex items-center justify-center rounded-full shadow-xl active:scale-90 transition-all border-2 border-white dark:border-slate-900" aria-label="Xóa ảnh"><X className="w-3.5 h-3.5"/></button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex gap-2.5 sm:gap-3 items-end">
                    <div className="flex-1 relative">
                        <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Nhập ý kiến phản hồi về chất lượng sản phẩm..." className="w-full pl-4 sm:pl-5 pr-28 py-3.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 outline-none resize-none min-h-[76px] shadow-inner transition-all" />
                        <div className="absolute right-2 bottom-2 flex items-center gap-1">
                            <button type="button" onClick={() => commentCameraRef.current?.click()} className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition-all active:scale-90" title="Chụp ảnh" aria-label="Chụp ảnh"><Camera className="w-5 h-5"/></button>
                            <button type="button" onClick={() => commentFileRef.current?.click()} className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition-all active:scale-90" title="Chọn ảnh" aria-label="Chọn ảnh"><ImageIcon className="w-5 h-5"/></button>
                        </div>
                    </div>
                    <button type="button" onClick={handlePostComment} disabled={isSubmittingComment || (!newComment.trim() && commentAttachments.length === 0)} className="min-w-[48px] min-h-[48px] w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-xl shadow-blue-500/30 flex items-center justify-center active:scale-95 disabled:opacity-30 transition-all shrink-0" aria-label="Gửi bình luận"><Send className="w-6 h-6" /></button>
                </div>
            </div>
        </section>
      </div>

      {/* --- MOBILE-OPTIMIZED BOTTOM ACTION BAR --- */}
      <div className="sticky bottom-0 z-[110] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700 px-3 lg:pr-24 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-15px_30px_rgba(0,0,0,0.1)] shrink-0">
          <div className="max-w-4xl mx-auto flex flex-row items-center justify-center gap-2 min-h-[44px]">
              <button 
                type="button"
                onClick={onBack} 
                className="w-full min-h-[44px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black uppercase text-xs tracking-wider rounded-xl border border-slate-200 dark:border-slate-700 active:scale-95 transition-all flex flex-row items-center justify-center gap-1.5 whitespace-nowrap px-3"
              >
                  <ArrowLeft className="w-4 h-4 shrink-0" />
                  <span>QUAY LẠI</span>
              </button>
          </div>
      </div>

      {lightboxState && (
          <ImageEditorModal 
              images={lightboxState.images} 
              initialIndex={lightboxState.index} 
              onClose={() => setLightboxState(null)} 
              onSave={lightboxState.context === 'PENDING_COMMENT' ? (idx, updated) => updateCommentImage(idx, updated) : undefined}
              readOnly={lightboxState.context !== 'PENDING_COMMENT'} 
          />
      )}
      <input type="file" ref={commentFileRef} className="hidden" multiple accept="image/*" onChange={handleImageUpload} />
      <input type="file" ref={commentCameraRef} className="hidden" capture="environment" accept="image/*" onChange={handleImageUpload} />
    </div>
  );
};
