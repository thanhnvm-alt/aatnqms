
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Inspection, CheckStatus, InspectionStatus, Priority, User, NCR, NCRComment } from '../types';
import { Button } from './Button';
import { 
  ArrowLeft, BrainCircuit, Trash2, Edit2, Flag, Calendar, MapPin, 
  User as UserIcon, ImageIcon, X, ChevronLeft, ChevronRight, 
  PenTool, Maximize2, ShieldCheck, Eraser, CheckCircle, Images,
  CheckCircle2, AlertCircle, HelpCircle, ClipboardList, Info,
  Loader2, MoreVertical, Factory, RefreshCw, FileDown, Lock, FileWarning, ArrowRight,
  Send, Paperclip, File as FileIcon, MessageCircle, MessageSquare, Camera, Plus
} from 'lucide-react';
import { generateInspectionAnalysis } from '../services/geminiService';
import { saveInspectionToSheet } from '../services/apiService';
import { ImageEditorModal } from './ImageEditorModal';

interface InspectionDetailProps {
  inspection: Inspection;
  user: User;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const resizeImage = (base64Str: string, maxWidth = 1200): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

export const InspectionDetail: React.FC<InspectionDetailProps> = ({ inspection: initialInspection, user, onBack, onEdit, onDelete }) => {
  const [inspection, setInspection] = useState<Inspection>(initialInspection);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiData, setAiData] = useState<{ summary: string, suggestions: string } | null>(
    inspection.summary ? { summary: inspection.summary, suggestions: inspection.aiSuggestions || '' } : null
  );
  
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null);

  const [signType, setSignType] = useState<'MANAGER' | 'PROD' | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [signingName, setSigningName] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // General Comments State
  const [newComment, setNewComment] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const commentFileRef = useRef<HTMLInputElement>(null);

  // NCR Modal State
  const [selectedNCR, setSelectedNCR] = useState<{ data: NCR, label: string } | null>(null);
  const [ncrComment, setNcrComment] = useState('');
  const [ncrAttachments, setNcrAttachments] = useState<string[]>([]);
  const ncrCommentFileRef = useRef<HTMLInputElement>(null);
  const ncrAfterFileRef = useRef<HTMLInputElement>(null);

  const handleAIAnalysis = async () => {
    setIsAnalyzing(true);
    const result = await generateInspectionAnalysis(inspection);
    setAiData(result);
    setIsAnalyzing(false);
  };

  const handleExportPDF = async () => {
    try {
      setShowMoreActions(false);
      setIsExporting(true);
      const input = document.getElementById('inspection-report-content');
      if (!input) { setIsExporting(false); return; }
      // @ts-ignore
      const { default: jsPDF } = await import('https://esm.sh/xlsx@0.18.5/dist/jspdf.min.js');
      // @ts-ignore
      const { default: html2canvas } = await import('https://esm.sh/html2canvas@1.4.1');
      const isMobile = window.innerWidth < 768;
      const scale = isMobile ? 1 : 2;
      const canvas = await html2canvas(input, { scale: scale, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const pdfImgHeight = (imgHeight * pdfWidth) / imgWidth;
      let heightLeft = pdfImgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfImgHeight);
      heightLeft -= pdfHeight;
      while (heightLeft > 0) {
         position -= pdfHeight;
         pdf.addPage();
         pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfImgHeight);
         heightLeft -= pdfHeight;
      }
      pdf.save(`Bao_cao_QC_${inspection.ma_ct}_${inspection.id}.pdf`);
    } catch (error) {
      console.error("Export PDF failed:", error);
      alert("Lỗi khi xuất file PDF. Vui lòng thử lại.");
    } finally {
      setIsExporting(false);
    }
  };

  const isApproved = inspection.status === InspectionStatus.APPROVED;
  const isOwner = inspection.inspectorName === user.name;
  
  // Logic khóa ISO: QC không thể sửa báo cáo nếu đã được APPROVED
  const canEdit = user.role === 'ADMIN' || user.role === 'MANAGER' || (isOwner && !isApproved);
  const canDelete = user.role === 'ADMIN' || user.role === 'MANAGER';
  const canConfirmManager = (user.role === 'ADMIN' || user.role === 'MANAGER') && !inspection.managerSignature;
  const canConfirmProd = !inspection.productionSignature;
  
  const isQC = user.role === 'QC';
  const isNCRLocked = isApproved && isQC;

  const handlePrevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (inspection.images && inspection.images.length > 0) {
        setActiveImageIndex(prev => (prev === 0 ? inspection.images!.length - 1 : prev - 1));
    }
  };

  const handleNextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (inspection.images && inspection.images.length > 0) {
        setActiveImageIndex(prev => (prev === inspection.images!.length - 1 ? 0 : prev + 1));
    }
  };

  const openGallery = (images: string[], index: number) => {
    setLightboxState({ images, index });
  };

  const handleSaveEditedImage = async (index: number, updatedImage: string) => {
      const currentImages = [...(inspection.images || [])];
      currentImages[index] = updatedImage;
      const updatedInspection = { ...inspection, images: currentImages };
      try {
          await saveInspectionToSheet(updatedInspection);
          setInspection(updatedInspection);
          // Sync with lightbox state to show updated version immediately
          if (lightboxState) {
              const newGalleryImgs = [...lightboxState.images];
              newGalleryImgs[index] = updatedImage;
              setLightboxState({ ...lightboxState, images: newGalleryImgs });
          }
      } catch (err) {
          alert("Lỗi khi lưu ảnh đã sửa.");
      }
  };
  
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 3; ctx.lineCap = 'round'; 
    ctx.strokeStyle = signType === 'MANAGER' ? '#1e40af' : '#000000'; 
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX) - rect.left;
    const y = ('touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX) - rect.left;
    const y = ('touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const handleOpenSignModal = (type: 'MANAGER' | 'PROD') => {
      setSignType(type);
      setSigningName(type === 'MANAGER' ? user.name : (inspection.productionName || ''));
  };

  const handleConfirmReport = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !signType) return;
    setIsSigning(true);
    const signatureBase64 = canvas.toDataURL();
    const now = new Date().toISOString().split('T')[0];
    let updatedInspection: Inspection;
    if (signType === 'MANAGER') {
        updatedInspection = { ...inspection, managerSignature: signatureBase64, managerName: signingName || user.name, confirmedDate: now, status: InspectionStatus.APPROVED };
    } else {
        updatedInspection = { ...inspection, productionSignature: signatureBase64, productionName: signingName, productionConfirmedDate: now };
    }
    try {
        await saveInspectionToSheet(updatedInspection);
        setInspection(updatedInspection);
        setSignType(null);
    } catch (err) { alert("Lỗi khi xác nhận báo cáo."); } finally { setIsSigning(false); }
  };

  // --- REPORT COMMENT LOGIC ---
  const handleCommentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
        const processedImages = await Promise.all((Array.from(files) as File[]).map((file: File) => new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = async () => resolve(await resizeImage(reader.result as string));
            reader.readAsDataURL(file);
        })));
        setCommentAttachments(prev => [...prev, ...processedImages]);
    } catch (err) { alert("Lỗi khi tải ảnh."); } finally { if (commentFileRef.current) commentFileRef.current.value = ''; }
  };

  const handlePostComment = async () => {
    if (!newComment.trim() && commentAttachments.length === 0) return;
    setIsSubmittingComment(true);
    const commentObj: NCRComment = {
        id: `insp_cmt_${Date.now()}`,
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        content: newComment.trim(),
        createdAt: new Date().toISOString(),
        attachments: commentAttachments
    };
    try {
        const updatedInspection = { ...inspection, comments: [...(inspection.comments || []), commentObj] };
        await saveInspectionToSheet(updatedInspection);
        setInspection(updatedInspection);
        setNewComment('');
        setCommentAttachments([]);
    } catch (err) { alert("Lỗi khi gửi bình luận."); } finally { setIsSubmittingComment(false); }
  };

  const handleRemoveCommentAttachment = (index: number) => {
      setCommentAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // --- NCR UPDATE LOGIC ---
  const updateNCRInInspection = async (ncrId: string, updates: Partial<NCR>) => {
      const updatedItems = inspection.items.map(item => {
          if (item.ncr && item.ncr.id === ncrId) {
              return { ...item, ncr: { ...item.ncr, ...updates } };
          }
          return item;
      });
      const updatedInspection = { ...inspection, items: updatedItems };
      try {
          await saveInspectionToSheet(updatedInspection);
          setInspection(updatedInspection);
          const newNCR = updatedItems.find(i => i.ncr?.id === ncrId)?.ncr;
          if (newNCR && selectedNCR) setSelectedNCR({ ...selectedNCR, data: newNCR });
      } catch (e) {
          alert("Lỗi khi cập nhật NCR");
      }
  };

  const handleAddAfterImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isNCRLocked) return;
      const files = e.target.files;
      if (!files || files.length === 0 || !selectedNCR) return;
      const processed = await Promise.all((Array.from(files) as File[]).map((file: File) => new Promise<string>((res) => {
          const r = new FileReader(); 
          r.onload = async () => res(await resizeImage(r.result as string)); 
          r.readAsDataURL(file);
      })));
      const currentImages = selectedNCR.data.imagesAfter || [];
      await updateNCRInInspection(selectedNCR.data.id, { imagesAfter: [...currentImages, ...processed] });
  };

  const handleRemoveAfterImage = async (idx: number) => {
      if (isNCRLocked || !selectedNCR) return;
      if (window.confirm("Xóa ảnh này?")) {
          const currentImages = selectedNCR.data.imagesAfter || [];
          await updateNCRInInspection(selectedNCR.data.id, { imagesAfter: currentImages.filter((_, i) => i !== idx) });
      }
  };

  const handleUpdateNCRField = async (field: 'rootCause' | 'solution', value: string) => {
      if (isNCRLocked || !selectedNCR) return;
      await updateNCRInInspection(selectedNCR.data.id, { [field]: value });
  };

  const handleNCRCommentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
        const processedImages = await Promise.all((Array.from(files) as File[]).map((file: File) => new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = async () => resolve(await resizeImage(reader.result as string));
            reader.readAsDataURL(file);
        })));
        setNcrAttachments(prev => [...prev, ...processedImages]);
    } catch (err) { alert("Lỗi khi tải ảnh."); } finally { if (ncrCommentFileRef.current) ncrCommentFileRef.current.value = ''; }
  };

  const handlePostNCRComment = async () => {
    if (!ncrComment.trim() && ncrAttachments.length === 0) return;
    if (!selectedNCR) return;
    const commentObj: NCRComment = {
        id: `cmt_${Date.now()}`,
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        content: ncrComment.trim(),
        createdAt: new Date().toISOString(),
        attachments: ncrAttachments
    };
    try {
        await updateNCRInInspection(selectedNCR.data.id, { comments: [...(selectedNCR.data.comments || []), commentObj] });
        setNcrComment('');
        setNcrAttachments([]);
    } catch (err) { alert("Lỗi khi gửi bình luận."); }
  };

  const handleSaveNCRImage = async (ncrId: string, type: 'BEFORE' | 'AFTER', index: number, updatedImage: string) => {
    if (!selectedNCR) return;
    const currentList = type === 'BEFORE' ? [...(selectedNCR.data.imagesBefore || [])] : [...(selectedNCR.data.imagesAfter || [])];
    currentList[index] = updatedImage;
    const updateObj = type === 'BEFORE' ? { imagesBefore: currentList } : { imagesAfter: currentList };
    await updateNCRInInspection(ncrId, updateObj);
  };

  return (
    <div className="space-y-0 h-full flex flex-col pb-20 md:pb-0 bg-slate-50 relative">
      <input type="file" ref={ncrAfterFileRef} className="hidden" multiple accept="image/*" onChange={handleAddAfterImage} />
      <input type="file" ref={commentFileRef} className="hidden" multiple accept="image/*" onChange={handleCommentFileChange} />
      
      {/* Signature Modal */}
      {signType && (
          <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
                  <div className={`p-6 text-white flex justify-between items-center ${signType === 'MANAGER' ? 'bg-blue-600' : 'bg-slate-800'}`}>
                      <div className="flex items-center gap-2">
                        {signType === 'MANAGER' ? <ShieldCheck className="w-6 h-6" /> : <PenTool className="w-6 h-6" />}
                        <h3 className="font-black uppercase tracking-tighter">{signType === 'MANAGER' ? 'Quản lý Xác nhận' : 'Đại diện Sản xuất ký tên'}</h3>
                      </div>
                      <button onClick={() => setSignType(null)}><X className="w-6 h-6"/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Họ và tên người ký</label>
                          <input value={signingName} onChange={e => setSigningName(e.target.value)} className="w-full px-4 py-2 border rounded-xl font-bold bg-slate-50" placeholder="Nhập tên..." />
                      </div>
                      <div className="border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 relative overflow-hidden h-48">
                          <canvas ref={canvasRef} width={400} height={200} className="w-full h-full cursor-crosshair touch-none" style={{ touchAction: 'none' }} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                          <div className="absolute bottom-2 right-2">
                             <button onClick={() => { const ctx = canvasRef.current?.getContext('2d'); if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height); }} className="p-2 bg-white shadow-md rounded-full text-red-500 hover:bg-red-50 transition-colors"><Eraser className="w-4 h-4" /></button>
                          </div>
                      </div>
                      <div className="flex gap-3 pt-2">
                          <Button variant="secondary" className="flex-1" onClick={() => setSignType(null)}>Hủy</Button>
                          <Button className={`flex-1 ${signType === 'MANAGER' ? 'bg-blue-600' : 'bg-slate-900'}`} onClick={handleConfirmReport} disabled={isSigning || !signingName}>{isSigning ? 'Đang lưu...' : 'Ký & Xác nhận'}</Button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* NCR Details Modal */}
      {selectedNCR && (
          <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh] relative">
                  <div className="px-6 py-4 bg-[#DC2626] text-white flex justify-between items-start shrink-0">
                      <div className="flex gap-3">
                          <div className="mt-1"><AlertCircle className="w-6 h-6" /></div>
                          <div>
                              <h3 className="font-black text-lg leading-none uppercase tracking-tight">PHIẾU NCR - SỰ KHÔNG PHÙ HỢP</h3>
                              <p className="text-sm font-medium opacity-90 mt-1 truncate max-w-[200px]">{selectedNCR.label}</p>
                          </div>
                      </div>
                      <button onClick={() => setSelectedNCR(null)} className="text-white/80 hover:text-white transition-colors active:scale-90"><X className="w-6 h-6"/></button>
                  </div>
                  
                  <div className="p-6 space-y-6 overflow-y-auto no-scrollbar flex-1">
                      <div className="bg-red-50/50 p-4 rounded-xl border border-red-100">
                          <label className="text-[10px] font-black text-red-500 uppercase block mb-1">Mô tả lỗi</label>
                          <p className="text-sm font-bold text-slate-800 whitespace-pre-wrap">{selectedNCR.data.issueDescription}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 px-1">
                          <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Người chịu trách nhiệm</label>
                              <p className="text-sm font-black text-slate-800 uppercase">{selectedNCR.data.responsiblePerson || '---'}</p>
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Hạn xử lý</label>
                              <p className="text-sm font-black text-slate-800">{selectedNCR.data.deadline || '---'}</p>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 px-1">
                          <div className="space-y-3">
                              <label className="text-[10px] font-black text-red-500 uppercase flex items-center gap-1.5"><FileWarning className="w-3.5 h-3.5"/> Trước xử lý</label>
                              <div className="flex flex-wrap gap-2">
                                  {selectedNCR.data.imagesBefore && selectedNCR.data.imagesBefore.length > 0 ? (
                                      selectedNCR.data.imagesBefore.map((img, idx) => (
                                          <div key={idx} className="relative group/img cursor-zoom-in" onClick={() => openGallery(selectedNCR.data.imagesBefore || [], idx)}>
                                              <img src={img} className="w-16 h-16 rounded-xl object-cover border border-red-100 shadow-sm transition-transform hover:scale-105" />
                                              <div className="absolute inset-0 bg-black/10 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-xl flex items-center justify-center"><PenTool className="text-white w-4 h-4" /></div>
                                          </div>
                                      ))
                                  ) : <span className="text-xs text-slate-400 italic">Trống</span>}
                              </div>
                          </div>
                          <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-black text-green-600 uppercase flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5"/> Sau xử lý</label>
                                  {!isNCRLocked && (
                                      <button onClick={() => ncrAfterFileRef.current?.click()} className="text-blue-600 hover:bg-blue-50 p-1 rounded-full"><Plus className="w-4 h-4"/></button>
                                  )}
                              </div>
                              <div className="flex flex-wrap gap-2 min-h-[64px]">
                                  {selectedNCR.data.imagesAfter && selectedNCR.data.imagesAfter.length > 0 ? (
                                      selectedNCR.data.imagesAfter.map((img, idx) => (
                                          <div key={idx} className="relative group/img">
                                              <img src={img} onClick={() => openGallery(selectedNCR.data.imagesAfter || [], idx)} className="w-16 h-16 rounded-xl object-cover border border-green-100 cursor-zoom-in shadow-sm transition-transform hover:scale-105" />
                                              <div className="absolute inset-0 bg-black/10 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-xl pointer-events-none flex items-center justify-center"><PenTool className="text-white w-4 h-4" /></div>
                                              {!isNCRLocked && (
                                                  <button onClick={() => handleRemoveAfterImage(idx)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity shadow-sm"><X className="w-2 h-2"/></button>
                                              )}
                                          </div>
                                      ))
                                  ) : <span className="text-xs text-slate-400 italic">Không có ảnh</span>}
                              </div>
                          </div>
                      </div>

                      <div className="space-y-5 pt-2">
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nguyên nhân gốc rễ</label>
                              <textarea 
                                value={selectedNCR.data.rootCause || ''}
                                onChange={e => handleUpdateNCRField('rootCause', e.target.value)}
                                disabled={isNCRLocked}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none resize-none disabled:opacity-70 shadow-inner"
                                rows={2}
                                placeholder="..."
                              />
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Biện pháp khắc phục</label>
                              <textarea 
                                value={selectedNCR.data.solution || ''}
                                onChange={e => handleUpdateNCRField('solution', e.target.value)}
                                disabled={isNCRLocked}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none resize-none disabled:opacity-70 shadow-inner"
                                rows={2}
                                placeholder="..."
                              />
                          </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100">
                          <label className="text-[10px] font-black text-slate-400 uppercase block mb-4 flex items-center gap-2">
                              <MessageCircle className="w-3.5 h-3.5" /> Trao đổi & Thảo luận ({selectedNCR.data.comments?.length || 0})
                          </label>
                          <div className="space-y-4 mb-4">
                              {selectedNCR.data.comments?.map((comment) => (
                                  <div key={comment.id} className="flex gap-3 text-sm">
                                      <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="w-8 h-8 rounded-xl border border-slate-200 bg-slate-100 shrink-0 object-cover" alt="" />
                                      <div className="bg-slate-50 p-3 rounded-2xl rounded-tl-none border border-slate-100 flex-1">
                                          <div className="flex justify-between items-center mb-1">
                                              <span className="font-black text-slate-800 text-[11px] uppercase tracking-tighter">{comment.userName}</span>
                                              <span className="text-[9px] font-bold text-slate-400">{new Date(comment.createdAt).toLocaleDateString('vi-VN')}</span>
                                          </div>
                                          <p className="text-slate-700 text-xs font-medium whitespace-pre-wrap">{comment.content}</p>
                                          {comment.attachments && comment.attachments.length > 0 && (
                                              <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-200/30">
                                                  {comment.attachments.map((att, idx) => (
                                                      <img key={idx} src={att} className="w-12 h-12 object-cover rounded-lg border border-slate-200 cursor-zoom-in" onClick={() => openGallery(comment.attachments || [], idx)} />
                                                  ))}
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              ))}
                              {(!selectedNCR.data.comments || selectedNCR.data.comments.length === 0) && (
                                  <p className="text-center text-xs text-slate-300 font-bold uppercase tracking-widest py-4 italic">Chưa có thảo luận nào.</p>
                              )}
                          </div>
                      </div>
                  </div>
                  
                  <div className="p-3 border-t border-slate-100 bg-white shrink-0">
                      {ncrAttachments.length > 0 && (
                          <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar pb-2">
                              {ncrAttachments.map((att, idx) => (
                                  <div key={idx} className="relative w-12 h-12 shrink-0 group">
                                      <img src={att} className="w-full h-full object-cover rounded-lg border border-slate-200" />
                                      <button onClick={() => setNcrAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm"><X className="w-2 h-2" /></button>
                                  </div>
                              ))}
                          </div>
                      )}
                      <div className="flex items-center gap-2">
                          <button onClick={() => ncrCommentFileRef.current?.click()} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"><Paperclip className="w-5 h-5" /></button>
                          <input type="file" ref={ncrCommentFileRef} className="hidden" accept="image/*" multiple onChange={async (e) => {
                             const files = e.target.files; if(!files) return;
                             const processed = await Promise.all(Array.from(files).map(async (f: File) => await resizeImage(await new Promise<string>(res => {const r=new FileReader(); r.onload=()=>res(r.result as string); r.readAsDataURL(f);}))));
                             setNcrAttachments(prev => [...prev, ...processed]);
                          }} />
                          <div className="flex-1">
                              <input 
                                  value={ncrComment}
                                  onChange={(e) => setNcrComment(e.target.value)}
                                  placeholder="Viết bình luận..."
                                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostNCRComment(); } }}
                              />
                          </div>
                          <button onClick={handlePostNCRComment} disabled={!ncrComment.trim() && ncrAttachments.length === 0} className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg active:scale-95 transition-all"><Send className="w-5 h-5" /></button>
                      </div>
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
                      <button onClick={() => setSelectedNCR(null)} className="px-8 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-colors shadow-sm active:scale-95">Đóng</button>
                  </div>
              </div>
          </div>
      )}

      {/* Advanced Gallery / Editor Modal */}
      {lightboxState && (
        <ImageEditorModal 
            images={lightboxState.images} 
            initialIndex={lightboxState.index} 
            onClose={() => setLightboxState(null)} 
            readOnly={isApproved && isQC}
            onSave={(idx, updatedImage) => {
                if (selectedNCR) {
                    // Xử lý lưu ảnh cho NCR
                    // Fixed: Replaced 'initialNcr' with 'selectedNCR.data'
                    const type = selectedNCR.data.imagesBefore?.includes(lightboxState.images[idx]) ? 'BEFORE' : 'AFTER';
                    handleSaveNCRImage(selectedNCR.data.id, type, idx, updatedImage);
                } else {
                    // Xử lý lưu ảnh cho Báo cáo hiện trường (Main images)
                    handleSaveEditedImage(idx, updatedImage);
                }
            }}
        />
      )}

      {/* Toolbar / Header */}
      <div className="bg-white px-3 py-2.5 border-b border-slate-200 flex items-center justify-between sticky top-0 z-40 shadow-sm md:px-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-600 font-bold text-sm px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors active:scale-95">
            <ArrowLeft className="w-5 h-5"/><span className="hidden sm:inline">Quay lại</span><span className="sm:hidden">Lùi</span>
        </button>
        <div className="flex items-center gap-1.5">
            {!canEdit && user.role === 'QC' && <div className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold uppercase mr-2 border border-slate-200"><Lock className="w-3 h-3" /> Chỉ xem</div>}
            <div className="flex items-center gap-1.5 sm:gap-2">
                {canConfirmProd && <button onClick={() => handleOpenSignModal('PROD')} className="bg-slate-900 text-white px-3 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-tight shadow-md active:scale-95 transition-all flex items-center gap-1.5"><PenTool className="w-3.5 h-3.5"/><span className="hidden xs:inline">Sản xuất ký</span></button>}
                {canConfirmManager && <button onClick={() => handleOpenSignModal('MANAGER')} className="bg-green-600 text-white px-3 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-tight shadow-md active:scale-95 transition-all flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5"/><span className="hidden xs:inline">Xác nhận</span></button>}
                <div className="h-6 w-px bg-slate-200 mx-0.5 sm:mx-1"></div>
                <div className="relative">
                    <button onClick={() => setShowMoreActions(!showMoreActions)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl active:scale-95 transition-all"><MoreVertical className="w-5 h-5" /></button>
                    {showMoreActions && (
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in duration-200">
                             <button onClick={handleExportPDF} disabled={isExporting} className="w-full flex items-center gap-3 px-4 py-2.5 text-blue-600 hover:bg-blue-50 font-bold text-sm text-left disabled:opacity-50">{isExporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileDown className="w-4 h-4" />}{isExporting ? 'Đang xuất PDF...' : 'Xuất file PDF'}</button>
                             <div className="h-px bg-slate-100 my-1 mx-2"></div>
                             {canEdit && <button onClick={() => { onEdit(inspection.id); setShowMoreActions(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-700 hover:bg-slate-50 font-bold text-sm text-left"><Edit2 className="w-4 h-4 text-blue-500" /> Sửa báo cáo</button>}
                             {canDelete && <button onClick={() => { onDelete(inspection.id); setShowMoreActions(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-red-600 hover:bg-red-50 font-bold text-sm text-left"><Trash2 className="w-4 h-4" /> Xóa báo cáo</button>}
                             <button onClick={() => { handleAIAnalysis(); setShowMoreActions(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-purple-600 hover:bg-purple-50 font-bold text-sm text-left"><BrainCircuit className="w-4 h-4" /> Phân tích AI</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-10 no-scrollbar">
        <div id="inspection-report-content" className="max-w-5xl mx-auto md:p-6 p-4 space-y-6 bg-slate-50">
            <div className="text-center sm:text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h1 className="text-xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter">Biên Bản Kiểm Tra</h1>
                    <div className="flex items-center gap-2 self-center sm:self-auto">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${inspection.status === InspectionStatus.APPROVED ? 'bg-green-100 text-green-700' : inspection.status === InspectionStatus.FLAGGED ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{inspection.status}</span>
                        <div className="bg-slate-200 h-4 w-px"></div>
                        <span className="text-[10px] font-bold text-slate-400 font-mono">{inspection.id}</span>
                    </div>
                </div>
                <div className="mt-2 flex flex-wrap justify-center sm:justify-start items-center gap-3 text-slate-500">
                    <div className="flex items-center gap-1.5 text-xs font-medium"><Calendar className="w-3.5 h-3.5" />{inspection.date}</div>
                    <div className="flex items-center gap-1.5 text-xs font-medium"><UserIcon className="w-3.5 h-3.5" />{inspection.inspectorName}</div>
                </div>
            </div>

            {/* Gallery Preview Row */}
            <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2"><ImageIcon className="w-4 h-4 text-slate-400"/><h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Hình ảnh hiện trường ({inspection.images?.length || 0})</h3></div>
                    <span className="text-[9px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-tighter italic">Tap để xem & vẽ ghi chú</span>
                </div>
                <div className="bg-white p-4 rounded-[2rem] border border-slate-200 shadow-sm overflow-x-auto no-scrollbar">
                    <div className="flex gap-4">
                        {inspection.images?.map((img, idx) => (
                            <div key={idx} onClick={() => openGallery(inspection.images || [], idx)} className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl border border-slate-100 overflow-hidden shrink-0 relative group/img cursor-zoom-in shadow-sm hover:shadow-md transition-all">
                                <img src={img} className="w-full h-full object-cover transition-transform group-hover/img:scale-105" alt={`QC_${idx}`} />
                                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center"><Maximize2 className="text-white w-5 h-5" /></div>
                            </div>
                        ))}
                        {(!inspection.images || inspection.images.length === 0) && <div className="w-full py-10 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest border-2 border-dashed border-slate-100 rounded-2xl">Không có ảnh đính kèm</div>}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
                <div className="grid grid-cols-1 md:grid-cols-2">
                    <div className="p-5 space-y-4">
                        <div className="flex items-start gap-3"><div className="p-2 bg-blue-50 rounded-xl text-blue-600"><Factory className="w-5 h-5" /></div><div className="overflow-hidden"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Xưởng sản xuất</p><p className="text-sm font-bold text-slate-800">{inspection.workshop || '---'}</p></div></div>
                        <div className="flex items-start gap-3"><div className="p-2 bg-slate-50 rounded-xl text-slate-600"><ClipboardList className="w-5 h-5" /></div><div className="overflow-hidden"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Tên sản phẩm</p><p className="text-sm font-bold text-slate-800 leading-tight">{inspection.ten_hang_muc || '---'}</p></div></div>
                        <div className="flex items-start gap-3"><div className="p-2 bg-indigo-50 rounded-xl text-indigo-600"><Info className="w-5 h-5" /></div><div className="overflow-hidden"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Mã nhà máy (NM)</p><p className="text-sm font-bold font-mono text-indigo-700 tracking-wider">{inspection.ma_nha_may || '---'}</p></div></div>
                    </div>
                    <div className="p-5 space-y-4 md:border-l border-slate-100">
                        <div className="flex items-start gap-3"><div className="p-2 bg-orange-50 rounded-xl text-orange-600"><MapPin className="w-5 h-5" /></div><div className="overflow-hidden"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Công đoạn / Vị trí</p><p className="text-sm font-bold text-slate-800">{inspection.inspectionStage || '---'}</p></div></div>
                        <div className="flex items-start gap-3"><div className="p-2 bg-blue-50 rounded-xl text-blue-600"><Flag className="w-5 h-5" /></div><div className="overflow-hidden"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Dự án</p><p className="text-sm font-bold text-slate-800 uppercase">{inspection.ma_ct}</p></div></div>
                        <div className="flex items-center gap-4">
                            <div className="flex-1 p-3 bg-slate-50 rounded-2xl border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Điểm số</p><div className="flex items-baseline gap-1"><span className={`text-xl font-black ${inspection.score >= 90 ? 'text-green-600' : inspection.score >= 70 ? 'text-blue-600' : 'text-red-600'}`}>{inspection.score}</span><span className="text-[10px] text-slate-400 font-bold">%</span></div></div>
                            <div className="flex-1 p-3 bg-slate-50 rounded-2xl border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Số lượng</p><div className="flex items-baseline gap-1"><span className="text-xl font-black text-slate-800">{inspection.inspectedQuantity || 0}</span><span className="text-[10px] text-slate-400 font-bold uppercase">{inspection.dvt || 'PCS'}</span></div></div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1"><ClipboardList className="w-5 h-5 text-blue-600" /><h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Kết quả kiểm tra chi tiết</h3></div>
                <div className="space-y-3">
                    {inspection.items.map((item) => (
                        <div key={item.id} className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                            <div className="flex justify-between items-start gap-3">
                                <div className="flex-1 overflow-hidden">
                                    <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1">[{item.category}]</div>
                                    <h4 className="text-sm font-bold text-slate-800 leading-tight">{item.label}</h4>
                                </div>
                                {item.status === CheckStatus.PASS ? (
                                    <div className="flex flex-col items-center text-green-600 bg-green-50 px-3 py-1.5 rounded-2xl border border-green-100 shrink-0"><CheckCircle2 className="w-5 h-5" /><span className="text-[8px] font-black uppercase mt-0.5">ĐẠT</span></div>
                                ) : item.status === CheckStatus.FAIL ? (
                                    <div className="flex flex-col items-center text-red-600 bg-red-50 px-3 py-1.5 rounded-2xl border border-red-100 shrink-0"><AlertCircle className="w-5 h-5" /><span className="text-[8px] font-black uppercase mt-0.5">LỖI</span></div>
                                ) : (
                                    <div className="text-[10px] text-slate-300 font-black uppercase shrink-0">N/A</div>
                                )}
                            </div>
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100"><p className="text-xs text-slate-600 italic">{item.notes || 'Không có ghi chú QC.'}</p></div>
                            {item.ncr && (
                                <div className="pt-2">
                                    <button onClick={() => setSelectedNCR({ data: item.ncr!, label: item.label })} className="w-full flex items-center justify-between p-3 bg-red-50/50 rounded-2xl border border-red-100 group active:scale-[0.98] transition-all">
                                        <div className="flex items-center gap-2">
                                            <div className="bg-white p-1.5 rounded-lg border border-red-100 shadow-sm text-red-500"><AlertCircle className="w-4 h-4" /></div>
                                            <div className="text-left"><p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Phiếu NCR</p><p className="text-xs font-bold text-red-800">Xem chi tiết lỗi & khắc phục</p></div>
                                        </div>
                                        <div className="bg-white p-1.5 rounded-full text-red-400 group-hover:text-red-600 transition-colors"><ArrowRight className="w-4 h-4" /></div>
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {aiData && (
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden mt-6 animate-in slide-in-from-bottom duration-500">
                    <div className="p-5 border-b border-slate-100 bg-purple-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-purple-600 text-white rounded-xl shadow-lg shadow-purple-100"><BrainCircuit className="w-5 h-5" /></div>
                            <div>
                                <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">AI Insights & Suggestions</h3>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Phân tích kỹ thuật từ Gemini 3 Pro</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 text-[8px] font-black text-purple-600 bg-white px-2 py-1 rounded-full border border-purple-100 uppercase tracking-widest"><RefreshCw className="w-2.5 h-2.5" /> Live Data</div>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 bg-white">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2"><div className="w-1.5 h-6 bg-purple-600 rounded-full"></div><h4 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Tóm tắt báo cáo</h4></div>
                            <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-inner"><p className="text-sm text-slate-600 leading-relaxed font-medium italic">"{aiData.summary}"</p></div>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center gap-2"><div className="w-1.5 h-6 bg-blue-600 rounded-full"></div><h4 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Đề xuất kỹ thuật</h4></div>
                            <div className="space-y-3">
                                {aiData.suggestions.split('\n').filter(s => s.trim()).map((s, idx) => (
                                    <div key={idx} className="flex gap-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 shadow-sm group hover:bg-blue-50 transition-all">
                                        <div className="mt-1 flex items-center justify-center w-5 h-5 bg-white rounded-full text-blue-600 text-[10px] font-black shadow-sm shrink-0 border border-blue-100">{idx + 1}</div>
                                        <p className="text-sm text-slate-700 font-bold leading-relaxed">{s.replace(/^\d+\.\s*/, '').replace(/^-\s*/, '')}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-4">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50 pb-3 flex items-center gap-2"><UserIcon className="w-3.5 h-3.5" /> Xác nhận Kiểm tra (QC)</h3>
                    {inspection.signature ? (
                        <div className="space-y-4">
                            <div className="bg-slate-50 rounded-[1.5rem] h-40 border border-slate-100 flex items-center justify-center p-4 relative"><img src={inspection.signature} className="max-h-full max-w-full object-contain mix-blend-multiply" alt="QC Sign" /><div className="absolute top-3 right-3 flex items-center gap-1.5 bg-green-500 text-white px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest"><CheckCircle className="w-2.5 h-2.5" /> Verified</div></div>
                            <div className="text-center"><p className="font-black text-slate-800 uppercase text-sm tracking-tight">{inspection.inspectorName}</p><p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">QC Inspector • {inspection.date}</p></div>
                        </div>
                    ) : (<div className="h-52 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 space-y-2"><PenTool className="w-8 h-8 opacity-20" /><p className="text-[10px] font-black uppercase tracking-widest">Chờ QC ký tên</p></div>)}
                </div>
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-4">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50 pb-3 flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" /> Phê duyệt Quản lý (QA/QC Manager)</h3>
                    {inspection.managerSignature ? (
                        <div className="space-y-4">
                            <div className="bg-blue-50/30 rounded-[1.5rem] h-40 border border-blue-100 flex items-center justify-center p-4 relative"><img src={inspection.managerSignature} className="max-h-full max-w-full object-contain mix-blend-multiply" alt="Mgr Sign" /><div className="absolute top-3 right-3 flex items-center gap-1.5 bg-blue-600 text-white px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest"><ShieldCheck className="w-2.5 h-2.5" /> Approved</div></div>
                            <div className="text-center"><p className="font-black text-blue-900 uppercase text-sm tracking-tight">{inspection.managerName}</p><p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Project Quality Manager • {inspection.confirmedDate}</p></div>
                        </div>
                    ) : (<div className="h-52 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 space-y-2"><ShieldCheck className="w-8 h-8 opacity-20" /><p className="text-[10px] font-black uppercase tracking-widest">Chờ Quản lý phê duyệt</p></div>)}
                </div>
            </div>

            {/* General Report Comments Section */}
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden mt-6">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                    <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100"><MessageSquare className="w-5 h-5" /></div>
                    <div>
                        <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">Thảo luận & Ghi chú Review</h3>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Trao đổi nội bộ giữa QC & Quản lý</p>
                    </div>
                </div>
                
                <div className="p-5 space-y-5 bg-white">
                    {/* Comment History */}
                    <div className="space-y-6">
                        {inspection.comments?.map((comment) => (
                            <div key={comment.id} className="flex gap-4 group">
                                <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="w-10 h-10 rounded-2xl border border-slate-200 bg-slate-100 shrink-0 object-cover shadow-sm" alt="" />
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-slate-800 text-[12px] uppercase tracking-tight">{comment.userName}</span>
                                            <span className="text-[10px] font-bold text-slate-400">•</span>
                                            <span className="text-[10px] font-bold text-slate-400">{new Date(comment.createdAt).toLocaleDateString('vi-VN')} {new Date(comment.createdAt).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</span>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-4 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm">
                                        <p className="text-slate-700 text-sm font-medium whitespace-pre-wrap leading-relaxed">{comment.content}</p>
                                        {comment.attachments && comment.attachments.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-200/50">
                                                {comment.attachments.map((att, idx) => (
                                                    <div key={idx} className="relative group/img cursor-zoom-in" onClick={() => openGallery(comment.attachments || [], idx)}>
                                                        <img src={att} className="w-20 h-20 object-cover rounded-xl border border-slate-200 shadow-sm transition-transform group-hover/img:scale-105" />
                                                        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-xl flex items-center justify-center"><PenTool className="text-white w-4 h-4" /></div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {(!inspection.comments || inspection.comments.length === 0) && (
                            <div className="py-12 text-center">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-dashed border-slate-200">
                                    <MessageSquare className="w-8 h-8 text-slate-200" />
                                </div>
                                <p className="text-xs font-black text-slate-300 uppercase tracking-widest italic">Chưa có thảo luận nào cho báo cáo này.</p>
                            </div>
                        )}
                    </div>

                    {/* New Comment Input */}
                    <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
                        {commentAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-3 pb-2">
                                {commentAttachments.map((att, idx) => (
                                    <div key={idx} className="relative w-20 h-20 shrink-0 group">
                                        <img src={att} className="w-full h-full object-cover rounded-xl border-2 border-blue-100 shadow-md" />
                                        <button onClick={() => handleRemoveCommentAttachment(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-colors"><X className="w-3 h-3" /></button>
                                    </div>
                                ))}
                                <button onClick={() => commentFileRef.current?.click()} className="w-20 h-20 rounded-xl border-2 border-dashed border-blue-200 flex items-center justify-center text-blue-500 bg-blue-50/50 hover:bg-blue-50 transition-colors"><Plus className="w-6 h-6" /></button>
                            </div>
                        )}
                        <div className="flex items-start gap-4">
                            <img src={user.avatar} className="w-10 h-10 rounded-2xl border border-slate-200 bg-slate-100 shrink-0 object-cover shadow-sm hidden sm:block" alt="" />
                            <div className="flex-1 relative">
                                <textarea 
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Viết ghi chú review hoặc thảo luận kỹ thuật..."
                                    className="w-full pl-4 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-medium focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-500 outline-none transition-all resize-none shadow-inner min-h-[60px]"
                                    rows={2}
                                />
                                <div className="absolute right-3 bottom-3 flex items-center gap-1">
                                    <button onClick={() => commentFileRef.current?.click()} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="Đính kèm hình ảnh"><Paperclip className="w-5 h-5" /></button>
                                    <button 
                                        onClick={handlePostComment}
                                        disabled={isSubmittingComment || (!newComment.trim() && commentAttachments.length === 0)}
                                        className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/30 hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95"
                                    >
                                        {isSubmittingComment ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
