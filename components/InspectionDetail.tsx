
import React, { useState, useRef, useEffect } from 'react';
import { Inspection, User, CheckStatus, NCR, NCRComment, InspectionStatus, CheckItem } from '../types';
import { 
  ArrowLeft, Calendar, User as UserIcon, CheckCircle2, AlertTriangle, 
  Clock, Hash, FileText, MessageCircle, Send, Paperclip, X, 
  File as FileIcon, Image as ImageIcon, ShieldCheck, PenTool, Eraser, 
  Trash2, Edit3, Download, Share2, Printer, Loader2
} from 'lucide-react';
import { saveInspectionToSheet } from '../services/apiService';
import { Button } from './Button';
import { ImageEditorModal } from './ImageEditorModal';

interface InspectionDetailProps {
  inspection: Inspection;
  user: User;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
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

export const InspectionDetail: React.FC<InspectionDetailProps> = ({ 
  inspection: initialInspection, 
  user, 
  onBack, 
  onEdit, 
  onDelete 
}) => {
  const [inspection, setInspection] = useState<Inspection>(initialInspection);
  const [selectedNCR, setSelectedNCR] = useState<{ label: string, data: NCR } | null>(null);
  const [newComment, setNewComment] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const commentFileRef = useRef<HTMLInputElement>(null);
  
  const [signType, setSignType] = useState<'MANAGER' | 'PRODUCTION' | null>(null);
  const [signingName, setSigningName] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [showGallery, setShowGallery] = useState(false);

  useEffect(() => {
    setInspection(initialInspection);
  }, [initialInspection]);

  const openGallery = (images: string[], index: number) => {
    setGalleryImages(images);
    setGalleryIndex(index);
    setShowGallery(true);
  };

  // Signature Logic
  const startDrawing = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
    
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: any) => {
    if (!isDrawing || !canvasRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleConfirmReport = async () => {
      if (!canvasRef.current) return;
      setIsSigning(true);
      try {
          const signatureData = canvasRef.current.toDataURL();
          const updates: Partial<Inspection> = {};
          
          if (signType === 'MANAGER') {
              updates.managerSignature = signatureData;
              updates.managerName = signingName;
              updates.confirmedDate = new Date().toISOString().split('T')[0];
              updates.status = InspectionStatus.APPROVED;
          } else {
              updates.productionSignature = signatureData;
              updates.productionName = signingName;
              updates.productionConfirmedDate = new Date().toISOString().split('T')[0];
          }

          const updatedInspection = { ...inspection, ...updates };
          await saveInspectionToSheet(updatedInspection);
          setInspection(updatedInspection);
          setSignType(null);
      } catch (e) {
          alert("Lỗi khi lưu chữ ký");
      } finally {
          setIsSigning(false);
      }
  };

  // --- COMMENT LOGIC ---
  const handleCommentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
        const processedFiles = await Promise.all(
            Array.from(files).map((file: File) => {
                return new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = async () => {
                        const result = reader.result as string;
                        // Resize if image, return raw if PDF or other
                        if (file.type.startsWith('image/')) {
                            const resized = await resizeImage(result);
                            resolve(resized);
                        } else {
                            resolve(result);
                        }
                    };
                    reader.readAsDataURL(file);
                });
            })
        );
        setCommentAttachments(prev => [...prev, ...processedFiles]);
    } catch (err) {
        console.error("Comment file upload error:", err);
        alert("Lỗi khi tải file đính kèm.");
    } finally {
        if (commentFileRef.current) commentFileRef.current.value = '';
    }
  };

  const handlePostComment = async () => {
    if (!newComment.trim() && commentAttachments.length === 0) return;
    if (!selectedNCR) return;

    setIsSubmittingComment(true);
    
    const commentObj: NCRComment = {
        id: `cmt_${Date.now()}`,
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        content: newComment.trim(),
        createdAt: new Date().toISOString(),
        attachments: commentAttachments
    };

    try {
        // Find the specific item containing this NCR and update it
        const updatedItems = inspection.items.map(item => {
            if (item.ncr && item.ncr.id === selectedNCR.data.id) {
                const updatedNCR = {
                    ...item.ncr,
                    comments: [...(item.ncr.comments || []), commentObj]
                };
                return { ...item, ncr: updatedNCR };
            }
            return item;
        });

        const updatedInspection = { ...inspection, items: updatedItems };
        await saveInspectionToSheet(updatedInspection);
        
        // Update local state
        setInspection(updatedInspection);
        const updatedSelectedNCR = updatedItems.find(i => i.ncr?.id === selectedNCR.data.id)?.ncr;
        if (updatedSelectedNCR) {
            setSelectedNCR({ ...selectedNCR, data: updatedSelectedNCR });
        }

        // Reset form
        setNewComment('');
        setCommentAttachments([]);
    } catch (err) {
        console.error("Failed to post comment:", err);
        alert("Lỗi khi gửi bình luận.");
    } finally {
        setIsSubmittingComment(false);
    }
  };

  const handleRemoveAttachment = (index: number) => {
      setCommentAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const isPdf = (data: string) => data.startsWith('data:application/pdf');

  return (
    <div className="space-y-0 h-full flex flex-col pb-20 md:pb-0 bg-slate-50 relative">
      {/* ... Header, Content ... */}
      <div className="bg-white border-b border-slate-200 p-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-3">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors active:scale-90"><ArrowLeft className="w-5 h-5 text-slate-600"/></button>
              <div className="overflow-hidden">
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight truncate max-w-[200px]">{inspection.ten_hang_muc}</h2>
                  <p className="text-xs text-slate-500">{inspection.ma_ct}</p>
              </div>
          </div>
          <div className="flex gap-2">
              <button onClick={() => onEdit(inspection.id)} className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg"><Edit3 className="w-4 h-4" /></button>
              <button onClick={() => { if(window.confirm('Xóa phiếu này?')) onDelete(inspection.id) }} className="p-2 hover:bg-red-50 text-red-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Summary Card */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-lg ${inspection.score >= 90 ? 'bg-green-500' : inspection.score >= 70 ? 'bg-blue-500' : 'bg-red-500'}`}>
                          {inspection.score}%
                      </div>
                      <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Điểm số</p>
                          <p className={`font-black text-sm uppercase ${inspection.status === InspectionStatus.FLAGGED ? 'text-red-600' : 'text-green-600'}`}>{inspection.status}</p>
                      </div>
                  </div>
                  <div className="text-right">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ngày kiểm tra</p>
                      <p className="font-bold text-slate-800">{inspection.date}</p>
                  </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                  <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Người kiểm tra</p>
                      <p className="text-sm font-bold text-slate-700">{inspection.inspectorName}</p>
                  </div>
                  <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Mã nhà máy</p>
                      <p className="text-sm font-bold text-slate-700">{inspection.ma_nha_may}</p>
                  </div>
              </div>
          </div>

          {/* Items List */}
          <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Chi tiết kiểm tra</h3>
              {inspection.items.map((item, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
                      <div className={`mt-1 w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0 ${item.status === CheckStatus.PASS ? 'bg-green-500' : item.status === CheckStatus.FAIL ? 'bg-red-500' : 'bg-slate-300'}`}>
                          {item.status === CheckStatus.PASS ? <CheckCircle2 className="w-3.5 h-3.5" /> : item.status === CheckStatus.FAIL ? <AlertTriangle className="w-3.5 h-3.5" /> : <div className="w-2 h-2 bg-white rounded-full"></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                              <p className="font-bold text-sm text-slate-800 line-clamp-2">{item.label}</p>
                              <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">{item.category}</span>
                          </div>
                          {item.notes && <p className="text-xs text-slate-500 mt-1 italic bg-slate-50 p-1.5 rounded">{item.notes}</p>}
                          
                          {/* Images */}
                          {item.images && item.images.length > 0 && (
                              <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                                  {item.images.map((img, i) => (
                                      <img key={i} src={img} className="w-12 h-12 rounded object-cover border border-slate-200" onClick={() => openGallery(item.images || [], i)} />
                                  ))}
                              </div>
                          )}

                          {/* NCR Button */}
                          {item.status === CheckStatus.FAIL && item.ncr && (
                              <button 
                                  onClick={() => setSelectedNCR({ label: item.label, data: item.ncr! })}
                                  className="mt-2 w-full py-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-100 flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
                              >
                                  <AlertTriangle className="w-3.5 h-3.5" /> Xem NCR & Bình luận
                              </button>
                          )}
                      </div>
                  </div>
              ))}
          </div>

          {/* Signatures */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Xác nhận</h3>
              
              {/* Production Sig */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-600">Đại diện SX</span>
                      {inspection.productionConfirmedDate && <span className="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full">{inspection.productionConfirmedDate}</span>}
                  </div>
                  {inspection.productionSignature ? (
                      <div className="text-center">
                          <img src={inspection.productionSignature} className="h-16 mx-auto" />
                          <p className="text-xs font-bold text-slate-800 mt-1">{inspection.productionName}</p>
                      </div>
                  ) : (
                      <button onClick={() => setSignType('PRODUCTION')} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 text-xs font-bold hover:border-blue-400 hover:text-blue-600 transition-colors">
                          Ký xác nhận
                      </button>
                  )}
              </div>

              {/* Manager Sig */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-600">Quản lý QC</span>
                      {inspection.confirmedDate && <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full">{inspection.confirmedDate}</span>}
                  </div>
                  {inspection.signature || inspection.managerSignature ? (
                      <div className="text-center">
                          <img src={inspection.managerSignature || inspection.signature} className="h-16 mx-auto" />
                          <p className="text-xs font-bold text-slate-800 mt-1">{inspection.managerName || 'Manager'}</p>
                      </div>
                  ) : (
                      <button onClick={() => setSignType('MANAGER')} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 text-xs font-bold hover:border-blue-400 hover:text-blue-600 transition-colors">
                          Ký xác nhận
                      </button>
                  )}
              </div>
          </div>
      </div>

      {/* Signature Modal */}
      {signType && (
          <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
                  <div className={`p-6 text-white flex justify-between items-center ${signType === 'MANAGER' ? 'bg-blue-600' : 'bg-slate-800'}`}>
                      <div className="flex items-center gap-2">
                        {signType === 'MANAGER' ? <ShieldCheck className="w-6 h-6" /> : <PenTool className="w-6 h-6" />}
                        <h3 className="font-black uppercase tracking-tighter">
                            {signType === 'MANAGER' ? 'Quản lý Xác nhận' : 'Đại diện Sản xuất ký tên'}
                        </h3>
                      </div>
                      <button onClick={() => setSignType(null)}><X className="w-6 h-6"/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Họ và tên người ký</label>
                          <input 
                            value={signingName} 
                            onChange={e => setSigningName(e.target.value)} 
                            className="w-full px-4 py-2 border rounded-xl font-bold bg-slate-50" 
                            placeholder="Nhập tên..." 
                          />
                      </div>
                      <div className="border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 relative overflow-hidden h-48">
                          <canvas 
                            ref={canvasRef} 
                            width={400} 
                            height={200} 
                            className="w-full h-full cursor-crosshair touch-none"
                            style={{ touchAction: 'none' }}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                          />
                          <div className="absolute bottom-2 right-2">
                             <button 
                                onClick={() => {
                                    const ctx = canvasRef.current?.getContext('2d');
                                    if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
                                }}
                                className="p-2 bg-white shadow-md rounded-full text-red-500 hover:bg-red-50 transition-colors"
                             >
                                <Eraser className="w-4 h-4" />
                             </button>
                          </div>
                      </div>
                      <div className="flex gap-3 pt-2">
                          <Button variant="secondary" className="flex-1" onClick={() => setSignType(null)}>Hủy</Button>
                          <Button className={`flex-1 ${signType === 'MANAGER' ? 'bg-blue-600' : 'bg-slate-900'}`} onClick={handleConfirmReport} disabled={isSigning || !signingName}>
                            {isSigning ? 'Đang lưu...' : 'Ký & Xác nhận'}
                          </Button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* NCR Details Modal (Read-Only) */}
      {selectedNCR && (
          <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh]">
                  <div className="px-6 py-4 bg-[#DC2626] text-white flex justify-between items-start shrink-0">
                      <div className="flex gap-3">
                          <div className="mt-1"><AlertTriangle className="w-6 h-6" /></div>
                          <div>
                              <h3 className="font-black text-lg leading-none uppercase tracking-tight">PHIẾU NCR - SỰ KHÔNG PHÙ HỢP</h3>
                              <p className="text-sm font-medium opacity-90 mt-1 truncate max-w-[200px]">{selectedNCR.label}</p>
                          </div>
                      </div>
                      <button onClick={() => setSelectedNCR(null)} className="text-white/80 hover:text-white transition-colors active:scale-90"><X className="w-6 h-6"/></button>
                  </div>
                  
                  <div className="p-6 space-y-6 overflow-y-auto no-scrollbar flex-1">
                      {/* Description Section */}
                      <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                          <label className="text-[10px] font-black text-red-500 uppercase block mb-1">Mô tả lỗi</label>
                          <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap">{selectedNCR.data.issueDescription}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Người chịu trách nhiệm</label>
                              <p className="text-sm font-bold text-slate-800">{selectedNCR.data.responsiblePerson || '---'}</p>
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Hạn xử lý</label>
                              <p className="text-sm font-bold text-slate-800">{selectedNCR.data.deadline || '---'}</p>
                          </div>
                      </div>

                      {/* Images */}
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-red-500 uppercase flex items-center gap-1"><FileText className="w-3 h-3"/> Trước xử lý</label>
                              <div className="flex flex-wrap gap-2">
                                  {selectedNCR.data.imagesBefore && selectedNCR.data.imagesBefore.length > 0 ? (
                                      selectedNCR.data.imagesBefore.map((img, idx) => (
                                          <img 
                                            key={idx} 
                                            src={img} 
                                            onClick={() => openGallery(selectedNCR.data.imagesBefore || [], idx)}
                                            className="w-16 h-16 rounded-lg object-cover border border-red-200 cursor-zoom-in" 
                                          />
                                      ))
                                  ) : <span className="text-xs text-slate-400 italic">Không có ảnh</span>}
                              </div>
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-green-600 uppercase flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Sau xử lý</label>
                              <div className="flex flex-wrap gap-2">
                                  {selectedNCR.data.imagesAfter && selectedNCR.data.imagesAfter.length > 0 ? (
                                      selectedNCR.data.imagesAfter.map((img, idx) => (
                                          <img 
                                            key={idx} 
                                            src={img} 
                                            onClick={() => openGallery(selectedNCR.data.imagesAfter || [], idx)}
                                            className="w-16 h-16 rounded-lg object-cover border border-green-200 cursor-zoom-in" 
                                          />
                                      ))
                                  ) : <span className="text-xs text-slate-400 italic">Không có ảnh</span>}
                              </div>
                          </div>
                      </div>

                      {/* Analysis */}
                      <div className="space-y-4 pt-4 border-t border-slate-100">
                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nguyên nhân gốc rễ</label>
                              <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">{selectedNCR.data.rootCause || 'Chưa cập nhật'}</p>
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Biện pháp khắc phục</label>
                              <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">{selectedNCR.data.solution || 'Chưa cập nhật'}</p>
                          </div>
                      </div>

                      {/* Comments Section */}
                      <div className="pt-4 border-t border-slate-100">
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-3 flex items-center gap-2">
                              <MessageCircle className="w-3 h-3" /> Trao đổi & Thảo luận ({selectedNCR.data.comments?.length || 0})
                          </label>
                          
                          <div className="space-y-3 mb-4">
                              {selectedNCR.data.comments?.map((comment) => (
                                  <div key={comment.id} className="flex gap-3 text-sm">
                                      <img src={comment.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="w-8 h-8 rounded-full border border-slate-200 bg-slate-100 shrink-0" alt="" />
                                      <div className="bg-slate-50 p-3 rounded-2xl rounded-tl-none border border-slate-100 flex-1 min-w-0">
                                          <div className="flex justify-between items-center mb-1">
                                              <span className="font-bold text-slate-800 text-xs">{comment.userName}</span>
                                              <span className="text-[10px] text-slate-400">{new Date(comment.createdAt).toLocaleDateString('vi-VN')} {new Date(comment.createdAt).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</span>
                                          </div>
                                          <p className="text-slate-700 whitespace-pre-wrap">{comment.content}</p>
                                          {comment.attachments && comment.attachments.length > 0 && (
                                              <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-200/50">
                                                  {comment.attachments.map((att, idx) => {
                                                      if (isPdf(att)) {
                                                          return (
                                                              <a key={idx} href={att} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors group">
                                                                  <div className="p-1.5 bg-red-100 text-red-600 rounded">
                                                                    <FileIcon className="w-4 h-4" />
                                                                  </div>
                                                                  <span className="text-xs font-bold text-slate-600 group-hover:text-blue-700">Tài liệu đính kèm (PDF)</span>
                                                              </a>
                                                          );
                                                      }
                                                      return (
                                                          <img 
                                                              key={idx} 
                                                              src={att} 
                                                              className="w-16 h-16 object-cover rounded-lg border border-slate-200 cursor-zoom-in hover:scale-105 transition-transform" 
                                                              onClick={() => openGallery(comment.attachments?.filter(a => !isPdf(a)) || [], idx)}
                                                          />
                                                      );
                                                  })}
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              ))}
                              {(!selectedNCR.data.comments || selectedNCR.data.comments.length === 0) && (
                                  <p className="text-center text-xs text-slate-400 italic py-2">Chưa có bình luận nào.</p>
                              )}
                          </div>
                      </div>
                  </div>
                  
                  {/* Comment Input */}
                  <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                      {commentAttachments.length > 0 && (
                          <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
                              {commentAttachments.map((att, idx) => (
                                  <div key={idx} className="relative w-12 h-12 shrink-0 group">
                                      {isPdf(att) ? (
                                          <div className="w-full h-full flex items-center justify-center bg-white border border-red-200 rounded-lg">
                                              <FileIcon className="w-6 h-6 text-red-500" />
                                          </div>
                                      ) : (
                                          <img src={att} className="w-full h-full object-cover rounded-lg border border-slate-200" />
                                      )}
                                      <button 
                                          onClick={() => handleRemoveAttachment(idx)}
                                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:scale-110 transition-transform"
                                      >
                                          <X className="w-2 h-2" />
                                      </button>
                                  </div>
                              ))}
                          </div>
                      )}
                      <div className="flex items-end gap-2">
                          <button 
                              onClick={() => commentFileRef.current?.click()}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                              title="Đính kèm ảnh hoặc PDF"
                          >
                              <Paperclip className="w-5 h-5" />
                          </button>
                          <input 
                              type="file" 
                              ref={commentFileRef} 
                              className="hidden" 
                              accept="image/*,.pdf" 
                              multiple 
                              onChange={handleCommentFileChange}
                          />
                          <div className="flex-1 relative">
                              <textarea 
                                  value={newComment}
                                  onChange={(e) => setNewComment(e.target.value)}
                                  placeholder="Viết bình luận..."
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none max-h-24 min-h-[40px]"
                                  rows={1}
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          handlePostComment();
                                      }
                                  }}
                              />
                          </div>
                          <button 
                              onClick={handlePostComment}
                              disabled={isSubmittingComment || (!newComment.trim() && commentAttachments.length === 0)}
                              className="p-2 bg-blue-600 text-white rounded-xl shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                          >
                              {isSubmittingComment ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5" />}
                          </button>
                      </div>
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
                      <button 
                        onClick={() => setSelectedNCR(null)}
                        className="px-6 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm"
                      >
                          Đóng
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showGallery && (
        <ImageEditorModal 
          images={galleryImages}
          initialIndex={galleryIndex}
          onClose={() => setShowGallery(false)}
          readOnly={true}
        />
      )}
    </div>
  );
};
