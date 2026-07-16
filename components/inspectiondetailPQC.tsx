import { getProxyImageUrl } from '../src/utils';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Inspection, InspectionStatus, CheckStatus, User, NCRComment, Workshop, NCR, canUserModifyInspection } from '../types';
import { 
  ArrowLeft, User as UserIcon, Building2, Box, Edit3, Trash2, X, Maximize2, ShieldCheck,
  MessageSquare, Loader2, Eraser, Send, UserPlus, AlertOctagon, Check, Save,
  Camera, Image as ImageIcon, Paperclip, PenTool, LayoutList, History, FileText, ChevronRight,
  Factory, Calendar, Activity, Hash, MapPin, Lock, ImagePlus, AlertCircle, Eye, ClipboardList, Download
} from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { uploadQMSImage } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';
import { NCRDetail } from './NCRDetail';
import { formatDisplayDate } from '../lib/utils';
import { ProxyImage } from '../src/components/ProxyImage';

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


import { TwoTierApproval } from './TwoTierApproval';

import QRCode from 'qrcode';

export const InspectionDetailPQC: React.FC<InspectionDetailProps> = ({ inspection, user, onBack, onEdit, onDelete, onApprove, onPostComment }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  
  useEffect(() => {
    const generateQR = async () => {
      try {
        const url = `${window.location.origin}/?share=${inspection.id}`;
        const dataUrl = await QRCode.toDataURL(url, { 
          margin: 1,
          width: 200,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        });
        setQrCodeUrl(dataUrl);
      } catch (err) {
        console.error("QR Generation failed", err);
      }
    };
    generateQR();
  }, [inspection.id]);

  const [showManagerModal, setShowManagerModal] = useState(false);
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [viewingNcr, setViewingNcr] = useState<NCR | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number; context?: string } | null>(null);
  
  const [managerSig, setManagerSig] = useState('');
  const [prodSig, setProdSig] = useState(inspection.productionSignature || '');
  const [prodName, setProdName] = useState(inspection.productionName || '');
  const [prodComment, setProdComment] = useState(inspection.productionComment || '');

  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const commentCameraRef = useRef<HTMLInputElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // --- ISO RBAC LOGIC (CRITICAL) ---
  const isApproved = inspection.status === InspectionStatus.APPROVED;
  const isGuest = user.role === 'GUEST';
  const isManagerOrAdmin = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isOwner = inspection.inspectorName === user.name;
  
  const canModify = !isGuest && canUserModifyInspection(inspection, user);
  const isLockedForUser = isApproved && !isManagerOrAdmin && !isGuest;

  const handleExportPDF = async () => {
      if (!pdfContainerRef.current) return;
      try {
          const html2pdf = (await import('html2pdf.js')).default;
          
          // Format date for filename: DDMMYYYY
          const dateParts = inspection.date.split('/');
          const dateStr = dateParts.length === 3 ? `${dateParts[0]}${dateParts[1]}${dateParts[2]}` : inspection.date.replace(/\//g, '');
          
          const filename = `PQC_report_${inspection.ma_ct || 'NA'}_${inspection.headcode || inspection.ma_nha_may || 'NA'}_${dateStr}.pdf`;

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

  const stats = useMemo(() => {
    const ins = Number(inspection.inspectedQuantity || 0);
    const pas = Number(inspection.passedQuantity || 0);
    const fai = Number(inspection.failedQuantity || 0);
    const ipo = Number(inspection.so_luong_ipo || 0);
    
    return {
      ipo, ins, pas, fai,
      passRate: ins > 0 ? ((pas / ins) * 100).toFixed(1) : "0.0",
      failRate: ins > 0 ? ((fai / ins) * 100).toFixed(1) : "0.0"
    };
  }, [inspection]);

  const handleManagerApprove = async () => {
      // Logic 1: Kiểm tra trạng thái NCR liên quan
      const pendingNcrs = inspection.items.filter(it => it.ncr && it.ncr.status !== 'CLOSED');
      if (pendingNcrs.length > 0) {
          alert(`CẢNH BÁO: Còn ${pendingNcrs.length} hồ sơ NCR chưa được phê duyệt đóng (CLOSED). Vui lòng xử lý và phê duyệt tất cả NCR trước khi duyệt phiếu PQC này.`);
          return;
      }

      if (!managerSig) return alert("Vui lòng ký tên xác nhận phê duyệt.");
      if (!onApprove) return;
      setIsProcessing(true);
      try { 
          await onApprove(inspection.id, managerSig, { 
              managerName: user.name,
              managerSignature: managerSig,
              status: InspectionStatus.APPROVED
          }); 
          setShowManagerModal(false); 
          // onBack() is handled by App.tsx (setView(LIST))
      } 
      catch (e: any) { 
          alert("Lỗi phê duyệt: " + (e.message || "Unknown Error")); 
      } finally { setIsProcessing(false); }
  };

  const handleManagerReject = async () => {
      const reason = window.prompt("Nhập lý do từ chối hồ sơ này:");
      if (reason === null) return;
      if (!reason.trim()) return alert("Vui lòng nhập lý do từ chối.");

      if (!onApprove) return;
      setIsProcessing(true);
      try { 
          await onApprove(inspection.id, "", { 
              status: InspectionStatus.REJECTED,
              summary: (inspection.summary || "") + "\n\n[LÝ DO TỪ CHỐI]: " + reason 
          }); 
          // onBack() is handled by App.tsx
      } 
      catch (e: any) { 
          alert("Lỗi từ chối: " + (e.message || "Unknown Error")); 
      } finally { setIsProcessing(false); }
  };

  const handleProductionConfirm = async () => {
      if (!prodSig || !prodName.trim()) return alert("Vui lòng ký và nhập họ tên người xác nhận.");
      if (!onApprove) return;
      setIsProcessing(true);
      try { 
          await onApprove(inspection.id, "", { 
              productionSignature: prodSig, 
              productionName: prodName.toUpperCase(),
              productionComment: prodComment,
              productionConfirmedDate: new Date().toISOString()
          }); 
          setShowProductionModal(false); 
      } 
      catch (e: any) { 
          alert("Lỗi xác nhận: " + (e.message || "Unknown Error")); 
      } finally { setIsProcessing(false); }
  };

  const handlePostComment = async () => {
    if (!newComment.trim() && commentAttachments.length === 0) return;
    if (!onPostComment) return;
    setIsSubmittingComment(true);
    try {
        await onPostComment(inspection.id, { 
            id: `cmt_${Date.now()}`, 
            userId: user.id, 
            userName: user.name, 
            userAvatar: user.avatar, 
            content: newComment, 
            createdAt: new Date().toISOString(),
            attachments: commentAttachments
        } as any);
        setNewComment('');
        setCommentAttachments([]);
    } catch (e: any) { alert("Lỗi gửi bình luận: " + e.message); } finally { setIsSubmittingComment(false); }
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

  if (viewingNcr) return <NCRDetail ncr={viewingNcr} user={user} onBack={() => setViewingNcr(null)} onViewInspection={() => setViewingNcr(null)} />;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-800/50 overflow-hidden relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3 sticky top-0 z-30 shadow-sm shrink-0 flex justify-between items-center px-4 md:px-8">
          <div className="flex items-center gap-2">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-700 shadow-sm" type="button"><ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-400 dark:text-slate-500" /></button>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">Chi tiết hồ sơ PQC</h2>
          </div>
          <div className="flex items-center gap-2">
              <button onClick={handleExportPDF} className="p-2 text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-xl transition-all border border-slate-200 dark:border-slate-700 shadow-sm" type="button"><Download className="w-4 h-4" /></button>
              {isLockedForUser && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-xl border border-slate-200 dark:border-slate-700">
                      <Lock className="w-3.5 h-3.5" />
                      <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Hồ sơ đã khóa</span>
                  </div>
              )}
              {canModify && (
                  <>
                    <button onClick={() => onEdit(inspection.id)} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-slate-800/80 rounded-xl transition-all" type="button"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => onDelete(inspection.id)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-900/20 rounded-xl transition-all" type="button"><Trash2 className="w-4 h-4" /></button>
                  </>
              )}
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 no-scrollbar">
        <div ref={pdfContainerRef} className="max-w-4xl mx-auto space-y-4">
            {/* --- HEADER INFO --- */}
            <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
                {/* QR Code for Public Verification */}
                {qrCodeUrl && (
                  <div className="absolute left-6 top-6 w-16 h-16 border border-slate-100 p-1 bg-white shadow-sm z-10">
                    <img src={qrCodeUrl} alt="QR Code" className="w-full h-full" />
                    <p className="text-[6px] font-black text-center text-slate-400 mt-1 uppercase tracking-tighter">Scan to verify</p>
                  </div>
                )}
                
                <div className="absolute right-0 top-0 p-12 opacity-5 pointer-events-none uppercase font-black text-7xl rotate-12 select-none">PQC</div>
                
                <div className="flex flex-col items-center mb-6 pt-8 md:pt-4">
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em] mb-1">{inspection.ten_ct}</p>
                    <h1 className="text-[14px] font-black text-slate-900 dark:text-slate-100 uppercase leading-tight tracking-tight text-center">{inspection.ten_hang_muc}</h1>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-8">
                    <div>
                        <p className="mb-1 flex items-center gap-1.5"><Hash className="w-3 h-3"/> MÃ ĐỊNH DANH (MÃ NM)</p>
                        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 tracking-tight uppercase">
                            {inspection.headcode || inspection.ma_nha_may || '---'}
                        </p>
                    </div>
                    <div>
                        <p className="mb-1 flex items-center gap-1.5"><Box className="w-3 h-3"/> MÃ DỰ ÁN</p>
                        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 tracking-tight uppercase">
                            {inspection.ma_ct || '---'}
                        </p>
                    </div>
                    <div>
                        <p className="mb-1 flex items-center gap-1.5"><Factory className="w-3 h-3"/> XƯỞNG/CÔNG ĐOẠN</p>
                        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 tracking-tight">
                            {inspection.workshop || '-'} / {inspection.inspectionStage || '-'}
                        </p>
                    </div>
                    <div>
                        <p className="mb-1 flex items-center gap-1.5"><UserIcon className="w-3 h-3"/> QC THẨM ĐỊNH</p>
                        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 tracking-tight">
                            {inspection.inspectorName || '---'}
                        </p>
                    </div>
                    <div>
                        <p className="mb-1 flex items-center gap-1.5"><Calendar className="w-3 h-3"/> NGÀY THỰC HIỆN</p>
                        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 tracking-tight font-mono">
                            {formatDisplayDate(inspection.date)}
                        </p>
                    </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50/80 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 shadow-inner">
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                        <div className="text-center md:border-r border-slate-200 dark:border-slate-700 space-y-1">
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">SỐ IPO</p>
                            <p className="text-lg font-black text-slate-700 dark:text-slate-300">{stats.ipo} <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">{inspection.dvt}</span></p>
                        </div>
                        <div className="text-center md:border-r border-slate-200 dark:border-slate-700 space-y-1">
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">KIỂM TRA</p>
                            <p className="text-lg font-black text-blue-600 dark:text-blue-400">{stats.ins}</p>
                        </div>
                        <div className="text-center md:border-r border-slate-200 dark:border-slate-700 space-y-1">
                            <p className="text-[9px] font-black text-green-600 dark:text-green-500 uppercase tracking-widest">ĐẠT</p>
                            <p className="text-lg font-black text-green-600 dark:text-green-500">{stats.pas}</p>
                        </div>
                        <div className="text-center md:border-r border-slate-200 dark:border-slate-700 space-y-1 bg-green-50 dark:bg-green-900/20/50 rounded-xl py-1">
                            <p className="text-[9px] font-black text-green-700 uppercase tracking-widest">TỶ LỆ ĐẠT</p>
                            <p className="text-lg font-black text-green-700">{stats.passRate}%</p>
                        </div>
                        <div className="text-center md:border-r border-slate-200 dark:border-slate-700 space-y-1">
                            <p className="text-[9px] font-black text-red-500 dark:text-red-400 uppercase tracking-widest">HỎNG</p>
                            <p className="text-lg font-black text-red-600 dark:text-red-400">{stats.fai}</p>
                        </div>
                        <div className="text-center space-y-1 bg-red-50 dark:bg-red-900/20/50 rounded-xl py-1">
                            <p className="text-[9px] font-black text-red-700 uppercase tracking-widest">TỶ LỆ HỎNG</p>
                            <p className="text-lg font-black text-red-700">{stats.failRate}%</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- HÌNH ÁNH HIỆN TRƯỜNG TỔNG QUÁT --- */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
                <h3 className="text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2 border-b border-slate-50 pb-2">
                    <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Hình ảnh hiện trường tổng quát
                </h3>
                {inspection.images && inspection.images.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
                        {inspection.images.map((img, i) => (
                            <div key={i} onClick={() => setLightboxState({ images: inspection.images!, index: i })} className="shrink-0 cursor-zoom-in hover:scale-105 transition-all">
                                <ProxyImage 
                                    src={typeof img === 'string' ? img : (img as any).url_hd} 
                                    alt="Ảnh hiện trường" 
                                    className="w-24 h-24 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm" 
                                    showTimestamp={true}
                                    timestamp={typeof img === 'object' ? ((img as any).created_at || inspection.date) : inspection.date}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Không có ảnh hiện trường tổng quát</p>
                    </div>
                )}
            </div>

            {/* --- DANH MỤC TIÊU CHÍ --- */}
            <div className="space-y-3">
                <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-4 flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Chi tiết kết quả kiểm tra
                </h3>
                {inspection.items.map((item, idx) => (
                    <div key={idx} className={`bg-white dark:bg-slate-900 p-5 rounded-[1.5rem] border shadow-sm transition-all ${item.status === CheckStatus.FAIL ? 'border-red-200 bg-red-50 dark:bg-red-900/20/10' : 'border-slate-200 dark:border-slate-700'}`}>
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex flex-wrap gap-2">
                                <span className={`px-3 py-0.5 rounded-lg text-[9px] font-black uppercase border tracking-widest shadow-sm ${item.status === CheckStatus.PASS ? 'text-green-700 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : item.status === CheckStatus.FAIL ? 'text-red-700 bg-red-50 dark:bg-red-900/20 border-red-200' : 'text-amber-600 bg-amber-50 border-amber-200'}`}>{item.status}</span>
                                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-800">{item.category}</span>
                            </div>
                        </div>
                        
                        <p className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight leading-tight mb-2">{item.label}</p>
                        
                        {item.notes && (
                            <div className="mb-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 dark:text-slate-500 italic leading-relaxed">"{item.notes}"</p>
                            </div>
                        )}
                        
                        {/* Hình ảnh theo tiêu chí */}
                        {item.images && item.images.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 mt-2">
                                {item.images.map((img, i) => (
                                    <div key={i} onClick={() => setLightboxState({ images: item.images!, index: i })} className="shrink-0 cursor-zoom-in hover:scale-105 transition-all">
                                        <ProxyImage 
                                            src={typeof img === 'string' ? img : (img as any).url_hd} 
                                            alt="Ảnh hạng mục" 
                                            className="w-20 h-20 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm"
                                            showTimestamp={true}
                                            timestamp={typeof img === 'object' ? ((img as any).created_at || inspection.date) : inspection.date}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* --- SMART NCR LINK CARD --- */}
                        {item.status === CheckStatus.FAIL && (
                            item.ncr ? (
                                <div className="mt-4 p-4 bg-white dark:bg-slate-900 border-2 border-red-100 rounded-2xl shadow-xl shadow-red-900/5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex justify-between items-center border-b border-red-50 pb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${item.ncr.status === 'CLOSED' ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
                                            <span className={`text-[10px] font-black ${item.ncr.status === 'CLOSED' ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-400'} uppercase tracking-widest`}>Hồ sơ không phù hợp (NCR)</span>
                                        </div>
                                        <span className={`text-[8px] font-black px-2 py-0.5 ${item.ncr.status === 'CLOSED' ? 'bg-green-600' : 'bg-red-600'} text-white rounded-full uppercase shadow-sm`}>#{item.ncr.id.split('-').pop()}</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Trạng thái</p>
                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${item.ncr.status === 'CLOSED' ? 'text-green-600 dark:text-green-500 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20' : 'text-orange-600 border-orange-200 bg-orange-50'}`}>{item.ncr.status}</span>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Mức độ</p>
                                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded border border-red-200 text-red-700 bg-red-50 dark:bg-red-900/20">{item.ncr.severity}</span>
                                        </div>
                                    </div>

                                    <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800 italic">"{item.ncr.issueDescription}"</p>
                                    
                                    <button 
                                        onClick={() => setViewingNcr(item.ncr || null)} 
                                        className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-black active:scale-95 transition-all shadow-lg shadow-slate-200"
                                    >
                                        <AlertOctagon className="w-4 h-4 text-red-500 dark:text-red-400" />
                                        XEM CHI TIẾT NCR
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 border-dashed rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <AlertCircle className="w-5 h-5 text-red-400" />
                                        <div>
                                            <p className="text-[10px] font-black text-red-800 uppercase">Lỗi chưa gán NCR</p>
                                            <p className="text-[9px] text-red-500 dark:text-red-400 font-bold uppercase tracking-tighter">Hệ thống yêu cầu bóc tách NCR cho hạng mục sai lỗi.</p>
                                        </div>
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                ))}
            </div>

            {/* --- NOTES & CONCLUSIONS SECTION (ISO 9001 REQUIRED) --- */}
            {(inspection.summary || inspection.productionComment || (inspection.items?.some(i => i.notes))) && (
                <section className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
                    <h3 className="text-amber-800 border-b border-amber-50 pb-4 font-black text-[11px] uppercase tracking-[0.25em] flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-amber-500"/> GHI CHÚ & KẾT LUẬN CHI TIẾT
                    </h3>
                    
                    <div className="space-y-6">
                        {inspection.summary && (
                            <div className="relative p-6 bg-amber-50/30 rounded-[2rem] border border-amber-100 flex gap-4 items-start">
                                <div className="shrink-0 w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shadow-inner">
                                    <AlertOctagon className="w-5 h-5 text-amber-600" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[10px] font-black text-amber-800/40 uppercase tracking-widest mb-1.5">Ghi chú tổng hợp từ QC:</p>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 italic font-medium leading-relaxed font-serif">"{inspection.summary}"</p>
                                </div>
                            </div>
                        )}

                        {inspection.productionComment && (
                            <div className="relative p-6 bg-blue-50 dark:bg-slate-800/80/30 rounded-[2rem] border border-blue-100 dark:border-slate-700 flex gap-4 items-start">
                                <div className="shrink-0 w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shadow-inner">
                                    <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[10px] font-black text-blue-800/40 uppercase tracking-widest mb-1.5">Phản hồi từ Sản xuất:</p>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 italic font-medium leading-relaxed font-serif">"{inspection.productionComment}"</p>
                                </div>
                            </div>
                        )}

                        {inspection.items?.some(i => i.notes) && (
                            <div className="space-y-3 px-2">
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></span> Ghi chú chi tiết theo từng hạng mục lỗi
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {inspection.items.filter(i => i.notes).map((item, iIdx) => (
                                        <div key={iIdx} className="group bg-slate-50 dark:bg-slate-800/50/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-white dark:bg-slate-900 hover:shadow-md transition-all">
                                            <div className="flex justify-between items-start mb-2">
                                                <p className="text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight leading-none truncate flex-1">{item.label}</p>
                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded leading-none shrink-0 ml-2 ${item.status === CheckStatus.PASS ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.status}</span>
                                            </div>
                                            <p className="text-[11px] text-slate-600 dark:text-slate-400 dark:text-slate-500 font-medium italic border-l-2 border-slate-200 dark:border-slate-700 pl-3">"{item.notes}"</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* --- APPROVAL LOGS --- */}
            <TwoTierApproval inspection={inspection} user={user} onApprove={onApprove!} />

            {/* --- DISCUSSION --- */}
            <section className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col mb-10">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50/50 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Thảo luận hồ sơ</h3>
                </div>
                <div className="p-6 space-y-6 max-h-[500px] overflow-y-auto no-scrollbar">
                    {inspection.comments?.map((comment) => (
                        <div key={comment.id} className="flex gap-4 animate-in slide-in-from-left-2 duration-300">
                            <img src={getProxyImageUrl(comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`)} className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0 shadow-sm" alt="" referrerPolicy="no-referrer" />
                            <div className="flex-1 space-y-2">
                                <div className="flex justify-between items-center px-1">
                                    <span className="font-black text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-tight">{comment.userName}</span>
                                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{new Date(comment.createdAt).toLocaleString('vi-VN')}</span>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-[1.5rem] rounded-tl-none border border-slate-100 dark:border-slate-800 text-[12px] text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap leading-relaxed shadow-sm">{comment.content}</div>
                                {comment.attachments && comment.attachments.length > 0 && (
                                    <div className="flex gap-3 flex-wrap pt-2">
                                        {comment.attachments.map((img, i) => (
                                            <div key={i} onClick={() => setLightboxState({ images: comment.attachments!, index: i })} className="w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm cursor-zoom-in transition-all hover:scale-105 shrink-0">
                                                <img src={getProxyImageUrl(img)} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50/50 border-t border-slate-100 dark:border-slate-800 space-y-4">
                    {commentAttachments.length > 0 && (
                        <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
                            {commentAttachments.map((img, idx) => (
                                <div key={idx} className="relative w-20 h-20 shrink-0 group">
                                    <img src={getProxyImageUrl(img)} className="w-full h-full object-cover rounded-2xl border-2 border-blue-200 dark:border-slate-700 shadow-lg cursor-pointer" onClick={() => handleEditCommentImage(idx)} referrerPolicy="no-referrer" />
                                    <button onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1.5 -right-1.5 bg-red-600 text-white p-1 rounded-full shadow-xl active:scale-90 transition-all"><X className="w-4 h-4"/></button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-3 items-end">
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
                                className="w-full pl-5 pr-28 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2rem] text-[12px] font-bold focus:ring-4 focus:ring-blue-100 outline-none resize-none min-h-[70px] shadow-inner transition-all" 
                            />
                            <div className="absolute right-3 bottom-3 flex items-center gap-2">
                                <button onClick={() => commentCameraRef.current?.click()} className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-slate-800/80 rounded-xl transition-all border border-transparent hover:border-blue-100 dark:border-slate-700 active:scale-90" title="Chụp ảnh"><Camera className="w-5 h-5"/></button>
                                <button onClick={() => commentFileRef.current?.click()} className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-slate-800/80 rounded-xl transition-all border border-transparent hover:border-blue-100 dark:border-slate-700 active:scale-90" title="Chọn ảnh"><ImageIcon className="w-5 h-5"/></button>
                            </div>
                        </div>
                        <button onClick={handlePostComment} disabled={isSubmittingComment || (!newComment.trim() && commentAttachments.length === 0)} className="w-14 h-14 bg-blue-600 text-white rounded-[1.5rem] shadow-xl shadow-blue-500/30 flex items-center justify-center active:scale-95 disabled:opacity-30 transition-all shrink-0 hover:bg-blue-700"><Send className="w-6 h-6" /></button>
                    </div>
                </div>
            </section>
        </div>
      </div>

      {/* --- MOBILE-OPTIMIZED BOTTOM ACTION BAR --- */}
      <div className="sticky bottom-0 z-[110] bg-white dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700 px-2 py-3 shadow-[0_-15px_30px_rgba(0,0,0,0.1)] shrink-0">
          <div className="max-w-4xl mx-auto flex flex-row items-center justify-between gap-2 h-12">
              <button 
                onClick={onBack} 
                className="flex-1 h-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500 font-black uppercase text-[8px] tracking-tight rounded-xl border border-slate-200 dark:border-slate-700 active:scale-95 transition-all flex flex-row items-center justify-center gap-1.5 whitespace-nowrap overflow-hidden px-2"
              >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="whitespace-nowrap">QUAY LẠI</span>
              </button>
              
              {!isApproved && (
                  <button 
                    onClick={() => setShowProductionModal(true)} 
                    className="flex-1 h-full bg-indigo-50 text-indigo-600 font-black uppercase text-[8px] tracking-tight rounded-xl border border-indigo-200 hover:bg-indigo-100 active:scale-95 transition-all flex flex-row items-center justify-center gap-1.5 whitespace-nowrap overflow-hidden px-2 shadow-sm"
                  >
                      <UserPlus className="w-4 h-4" />
                      <span className="whitespace-nowrap">XÁC NHẬN SX</span>
                  </button>
              )}
          </div>
      </div>



      {showProductionModal && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0"><div className="flex items-center gap-3"><div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl shadow-inner"><UserPlus className="w-6 h-6" /></div><h3 className="font-black text-slate-800 dark:text-slate-200 uppercase text-sm tracking-tight">Sản xuất / Xưởng xác nhận</h3></div><button onClick={() => setShowProductionModal(false)} className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:text-slate-500 transition-colors"><X className="w-7 h-7 text-slate-400 dark:text-slate-500"/></button></div>
                  <div className="p-8 space-y-6 overflow-y-auto no-scrollbar bg-slate-50 dark:bg-slate-800/50/30 flex-1">
                      <div className="space-y-5">
                          <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-1.5"><UserIcon className="w-4 h-4 text-indigo-500" /> Họ tên người đại diện *</label><input value={prodName} onChange={e => setProdName(e.target.value.toUpperCase())} className="w-full px-5 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] font-black text-sm uppercase outline-none focus:ring-4 focus:ring-indigo-100 shadow-sm transition-all" placeholder="NHẬP HỌ TÊN ĐẠI DIỆN XƯỞNG..." /></div>
                          <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-1.5"><MessageSquare className="w-4 h-4 text-indigo-500" /> Ý kiến phản hồi / Ghi chú</label><textarea value={prodComment} onChange={e => setProdComment(e.target.value)} className="w-full px-5 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2rem] font-bold text-xs outline-none focus:ring-4 focus:ring-indigo-100 h-32 resize-none shadow-sm transition-all" placeholder="Ghi chú phản hồi từ sản xuất (nếu có)..." /></div>
                          <SignaturePad 
                            label="Chữ ký xác nhận đại diện *" 
                            value={prodSig} 
                            onChange={setProdSig} 
                            uploadContext={{ entityId: inspection.id || 'new', type: 'INSPECTION', role: 'SIGNATURE_PRODUCTION' }}
                          />
                      </div>
                  </div>
                  <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-4 shrink-0"><button onClick={() => setShowProductionModal(false)} className="flex-1 py-4 text-slate-500 dark:text-slate-400 dark:text-slate-500 font-black uppercase text-[11px] tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 rounded-2xl transition-all">Hủy</button><button onClick={handleProductionConfirm} disabled={isProcessing || !prodSig || !prodName.trim()} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-xl shadow-indigo-500/30 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-3">{isProcessing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>} LƯU XÁC NHẬN</button></div>
              </div>
          </div>
      )}

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
