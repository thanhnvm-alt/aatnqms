
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Inspection, CheckStatus, InspectionStatus, Priority, User } from '../types';
import { Button } from './Button';
import { 
  ArrowLeft, BrainCircuit, Trash2, Edit2, Flag, Calendar, MapPin, 
  User as UserIcon, ImageIcon, X, ChevronLeft, ChevronRight, 
  PenTool, Maximize2, ShieldCheck, Eraser, CheckCircle, Images,
  CheckCircle2, AlertCircle, HelpCircle, ClipboardList, Info,
  Loader2, MoreVertical, Factory, RefreshCw, FileDown
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
      if (!input) {
        setIsExporting(false);
        return;
      }

      // Dynamic imports to prevent static analysis errors
      // @ts-ignore
      const { default: jsPDF } = await import('https://esm.sh/jspdf@2.5.1');
      // @ts-ignore
      const { default: html2canvas } = await import('https://esm.sh/html2canvas@1.4.1');

      // Detect mobile device to reduce scale (prevent crash)
      const isMobile = window.innerWidth < 768;
      const scale = isMobile ? 1 : 2;

      // Use html2canvas to capture the report
      const canvas = await html2canvas(input, { 
        scale: scale, 
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      // Calculate image height in PDF units to fit width
      const pdfImgHeight = (imgHeight * pdfWidth) / imgWidth;
      
      let heightLeft = pdfImgHeight;
      let position = 0;
      
      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfImgHeight);
      heightLeft -= pdfHeight;
      
      // Add subsequent pages if content is long
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

  // ... (Rest of the component logic remains identical)
  const canDelete = user.role === 'ADMIN' || user.role === 'MANAGER';
  const canEdit = user.role === 'ADMIN' || user.role === 'MANAGER' || (user.role === 'QC' && inspection.status === InspectionStatus.DRAFT);
  
  const canConfirmManager = (user.role === 'ADMIN' || user.role === 'MANAGER') && !inspection.managerSignature;
  const canConfirmProd = !inspection.productionSignature;

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
  
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 3; ctx.lineCap = 'round'; 
    ctx.strokeStyle = signType === 'MANAGER' ? '#1e40af' : '#000000'; 
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
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
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
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
        updatedInspection = {
            ...inspection,
            managerSignature: signatureBase64,
            managerName: signingName || user.name,
            confirmedDate: now,
            status: InspectionStatus.APPROVED
        };
    } else {
        updatedInspection = {
            ...inspection,
            productionSignature: signatureBase64,
            productionName: signingName,
            productionConfirmedDate: now
        };
    }

    try {
        await saveInspectionToSheet(updatedInspection);
        setInspection(updatedInspection);
        setSignType(null);
    } catch (err) {
        alert("Lỗi khi xác nhận báo cáo.");
    } finally {
        setIsSigning(false);
    }
  };

  return (
    <div className="space-y-0 h-full flex flex-col pb-20 md:pb-0 bg-slate-50 relative">
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

      {/* Advanced Gallery / Editor Modal */}
      {lightboxState && (
        <ImageEditorModal 
          images={lightboxState.images}
          initialIndex={lightboxState.index}
          onClose={() => setLightboxState(null)}
          readOnly={true} // Detail view is read only gallery
        />
      )}

      {/* Toolbar / Header */}
      <div className="bg-white px-3 py-2.5 border-b border-slate-200 flex items-center justify-between sticky top-0 z-40 shadow-sm md:px-4">
        <button 
            onClick={onBack} 
            className="flex items-center gap-1.5 text-slate-600 font-bold text-sm px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors active:scale-95"
        >
            <ArrowLeft className="w-5 h-5"/>
            <span className="hidden sm:inline">Quay lại</span>
            <span className="sm:hidden">Lùi</span>
        </button>

        <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 sm:gap-2">
                {canConfirmProd && (
                    <button 
                        onClick={() => handleOpenSignModal('PROD')}
                        className="bg-slate-900 text-white px-3 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-tight shadow-md active:scale-95 transition-all flex items-center gap-1.5"
                    >
                        <PenTool className="w-3.5 h-3.5"/>
                        <span className="hidden xs:inline">Sản xuất ký</span>
                    </button>
                )}
                {canConfirmManager && (
                    <button 
                        onClick={() => handleOpenSignModal('MANAGER')}
                        className="bg-green-600 text-white px-3 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-tight shadow-md active:scale-95 transition-all flex items-center gap-1.5"
                    >
                        <ShieldCheck className="w-3.5 h-3.5"/>
                        <span className="hidden xs:inline">Xác nhận</span>
                    </button>
                )}
                
                <div className="h-6 w-px bg-slate-200 mx-0.5 sm:mx-1"></div>

                <div className="relative">
                    <button 
                        onClick={() => setShowMoreActions(!showMoreActions)}
                        className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl active:scale-95 transition-all"
                    >
                        <MoreVertical className="w-5 h-5" />
                    </button>
                    
                    {showMoreActions && (
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in duration-200">
                             <button 
                                onClick={handleExportPDF}
                                disabled={isExporting}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-blue-600 hover:bg-blue-50 font-bold text-sm text-left disabled:opacity-50"
                             >
                                {isExporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileDown className="w-4 h-4" />}
                                {isExporting ? 'Đang xuất PDF...' : 'Xuất file PDF'}
                             </button>
                             <div className="h-px bg-slate-100 my-1 mx-2"></div>
                             {canEdit && (
                                <button 
                                    onClick={() => { onEdit(inspection.id); setShowMoreActions(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-700 hover:bg-slate-50 font-bold text-sm text-left"
                                >
                                    <Edit2 className="w-4 h-4 text-blue-500" /> Sửa báo cáo
                                </button>
                             )}
                             {canDelete && (
                                <button 
                                    onClick={() => { onDelete(inspection.id); setShowMoreActions(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-red-600 hover:bg-red-50 font-bold text-sm text-left"
                                >
                                    <Trash2 className="w-4 h-4" /> Xóa báo cáo
                                </button>
                             )}
                             <button 
                                onClick={() => { handleAIAnalysis(); setShowMoreActions(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-purple-600 hover:bg-purple-50 font-bold text-sm text-left"
                             >
                                <BrainCircuit className="w-4 h-4" /> Phân tích AI
                             </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-10">
        <div id="inspection-report-content" className="max-w-5xl mx-auto md:p-6 p-4 space-y-6 bg-slate-50">
            {/* Same report layout */}
            <div className="text-center sm:text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h1 className="text-xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter">Biên Bản Kiểm Tra</h1>
                    <div className="flex items-center gap-2 self-center sm:self-auto">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            inspection.status === InspectionStatus.APPROVED ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                            {inspection.status}
                        </span>
                        <div className="bg-slate-200 h-4 w-px"></div>
                        <span className="text-[10px] font-bold text-slate-400 font-mono">{inspection.id}</span>
                    </div>
                </div>
                <div className="mt-2 flex flex-wrap justify-center sm:justify-start items-center gap-3 text-slate-500">
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Calendar className="w-3.5 h-3.5" />
                        {inspection.date}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                        <UserIcon className="w-3.5 h-3.5" />
                        {inspection.inspectorName}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
                <div className="grid grid-cols-1 md:grid-cols-2">
                    <div className="p-5 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><Factory className="w-5 h-5" /></div>
                            <div className="overflow-hidden">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Xưởng sản xuất</p>
                                <p className="text-sm font-bold text-slate-800">{inspection.workshop || '---'}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-slate-50 rounded-xl text-slate-600"><ClipboardList className="w-5 h-5" /></div>
                            <div className="overflow-hidden">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Tên sản phẩm</p>
                                <p className="text-sm font-bold text-slate-800 leading-tight">{inspection.ten_hang_muc || '---'}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600"><Info className="w-5 h-5" /></div>
                            <div className="overflow-hidden">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Mã nhà máy (NM)</p>
                                <p className="text-sm font-bold font-mono text-indigo-700 tracking-wider">{inspection.ma_nha_may || '---'}</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-5 space-y-4 md:border-l border-slate-100">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-orange-50 rounded-xl text-orange-600"><MapPin className="w-5 h-5" /></div>
                            <div className="overflow-hidden">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Công đoạn / Vị trí</p>
                                <p className="text-sm font-bold text-slate-800">{inspection.inspectionStage || inspection.ten_ct || '---'}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><Flag className="w-5 h-5" /></div>
                            <div className="overflow-hidden">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Dự án</p>
                                <p className="text-sm font-bold text-slate-800">{inspection.ma_ct}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex-1 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Điểm số</p>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-xl font-black ${inspection.score >= 90 ? 'text-green-600' : inspection.score >= 70 ? 'text-blue-600' : 'text-red-600'}`}>
                                        {inspection.score}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-bold">%</span>
                                </div>
                            </div>
                            <div className="flex-1 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Số lượng</p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-xl font-black text-slate-800">{inspection.inspectedQuantity || 0}</span>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase">{inspection.dvt || 'SET'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Images section */}
            <div className="space-y-3">
                 <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-blue-500" /> Hình ảnh hiện trường
                    </h3>
                    <span className="text-[10px] font-bold text-slate-400">{inspection.images?.length || 0} Ảnh</span>
                 </div>
                 {inspection.images && inspection.images.length > 0 ? (
                    <div className="relative group">
                        <div 
                            className="aspect-[4/3] w-full bg-slate-900 rounded-[2rem] overflow-hidden flex items-center justify-center cursor-zoom-in border border-slate-200 shadow-md"
                            onClick={() => openGallery(inspection.images || [], activeImageIndex)}
                        >
                            <img src={inspection.images[activeImageIndex]} alt="" className="w-full h-full object-contain" />
                            
                            {inspection.images.length > 1 && (
                                <>
                                    <button 
                                        onClick={handlePrevImage} 
                                        className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 p-2.5 rounded-2xl shadow-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-white active:scale-90"
                                    >
                                        <ChevronLeft className="w-6 h-6 text-slate-800" />
                                    </button>
                                    <button 
                                        onClick={handleNextImage} 
                                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 p-2.5 rounded-2xl shadow-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-white active:scale-90"
                                    >
                                        <ChevronRight className="w-6 h-6 text-slate-800" />
                                    </button>
                                </>
                            )}
                            
                            <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] text-white font-black uppercase tracking-widest flex items-center gap-2">
                                <Maximize2 className="w-3 h-3" /> Phóng lớn
                            </div>
                        </div>
                        
                        {inspection.images.length > 1 && (
                            <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 px-1">
                                {inspection.images.map((img, idx) => (
                                    <button 
                                        key={idx} 
                                        onClick={() => setActiveImageIndex(idx)}
                                        className={`relative w-16 h-16 md:w-20 md:h-20 flex-shrink-0 rounded-2xl overflow-hidden border-4 transition-all ${
                                            activeImageIndex === idx ? 'border-blue-500 scale-105 shadow-lg' : 'border-white opacity-60 hover:opacity-100'
                                        }`}
                                    >
                                        <img src={img} className="w-full h-full object-cover" alt="" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                 ) : (
                    <div className="h-40 flex flex-col items-center justify-center bg-white rounded-[2rem] border border-dashed border-slate-200 text-slate-400">
                        <ImageIcon className="w-10 h-10 mb-2 opacity-20" />
                        <span className="text-xs font-medium">Chưa có hình ảnh được tải lên</span>
                    </div>
                 )}
            </div>

            {/* Checklist details */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <ClipboardList className="w-5 h-5 text-blue-600" />
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Kết quả kiểm tra chi tiết</h3>
                </div>
                
                <div className="space-y-3">
                    {inspection.items.map((item) => (
                        <div key={item.id} className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                            <div className="flex justify-between items-start gap-3">
                                <div className="flex-1 overflow-hidden">
                                    <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1">[{item.category}]</div>
                                    <h4 className="text-sm font-bold text-slate-800 leading-tight">{item.label}</h4>
                                </div>
                                {item.status === CheckStatus.PASS ? (
                                    <div className="flex flex-col items-center text-green-600 bg-green-50 px-3 py-1.5 rounded-2xl border border-green-100 shrink-0">
                                        <CheckCircle2 className="w-5 h-5" />
                                        <span className="text-[8px] font-black uppercase mt-0.5">ĐẠT</span>
                                    </div>
                                ) : item.status === CheckStatus.FAIL ? (
                                    <div className="flex flex-col items-center text-red-600 bg-red-50 px-3 py-1.5 rounded-2xl border border-red-100 shrink-0">
                                        <AlertCircle className="w-5 h-5" />
                                        <span className="text-[8px] font-black uppercase mt-0.5">LỖI</span>
                                    </div>
                                ) : (
                                    <div className="text-[10px] text-slate-300 font-black uppercase shrink-0">N/A</div>
                                )}
                            </div>
                            
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-xs text-slate-600 italic">
                                    {item.notes || 'Không có ghi chú QC.'}
                                </p>
                            </div>
                            
                            {item.images && item.images.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto no-scrollbar pt-1">
                                    {item.images.map((img, idx) => (
                                        <div 
                                            key={idx} 
                                            className="w-14 h-14 rounded-xl border border-slate-200 overflow-hidden flex-shrink-0 cursor-zoom-in active:scale-95 transition-transform"
                                            onClick={() => openGallery(item.images || [], idx)}
                                        >
                                            <img src={img} className="w-full h-full object-cover" alt="" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-[2.5rem] border border-indigo-100 shadow-inner relative overflow-hidden group">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 blur-3xl rounded-full"></div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 relative">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-200 group-hover:scale-110 transition-transform">
                            <BrainCircuit className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-black text-indigo-900 uppercase tracking-tighter">AI Insights & Suggestions</h3>
                            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Phân tích chuyên sâu bởi Gemini AI</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleAIAnalysis} 
                        disabled={isAnalyzing}
                        className="w-full sm:w-auto px-5 py-2.5 bg-white text-indigo-600 rounded-2xl text-xs font-black uppercase tracking-widest shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Cập nhật phân tích
                    </button>
                </div>
                
                {aiData ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="bg-white/80 backdrop-blur-sm p-4 rounded-3xl border border-white shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <Info className="w-4 h-4 text-indigo-500" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tóm tắt tình trạng</span>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed font-medium italic">"{aiData.summary}"</p>
                        </div>
                        <div className="bg-indigo-600 p-5 rounded-3xl shadow-xl shadow-indigo-200">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertCircle className="w-4 h-4 text-indigo-200" />
                                <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Đề xuất khắc phục</span>
                            </div>
                            <p className="text-sm text-white font-bold leading-relaxed">{aiData.suggestions}</p>
                        </div>
                    </div>
                ) : (
                    <div className="py-10 text-center space-y-3">
                        <HelpCircle className="w-10 h-10 text-indigo-200 mx-auto" />
                        <p className="text-xs font-bold text-indigo-400 uppercase">Nhấn nút bên trên để bắt đầu phân tích dữ liệu bằng AI</p>
                    </div>
                )}
            </div>
            
            {/* Signatures Display */}
            {(inspection.managerSignature || inspection.productionSignature) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                 {inspection.productionSignature && (
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Đại diện Sản xuất</h4>
                        <img src={inspection.productionSignature} alt="Prod Sign" className="h-24 mx-auto object-contain" />
                        <p className="text-sm font-bold text-slate-800 mt-2">{inspection.productionName}</p>
                        <p className="text-[10px] font-mono text-slate-400">{inspection.productionConfirmedDate}</p>
                    </div>
                 )}
                 {inspection.managerSignature && (
                    <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-sm text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-blue-600 text-white text-[9px] font-black px-2 py-1 rounded-bl-xl uppercase tracking-widest">Approved</div>
                        <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Quản lý xác nhận</h4>
                        <img src={inspection.managerSignature} alt="Manager Sign" className="h-24 mx-auto object-contain" />
                        <p className="text-sm font-bold text-blue-900 mt-2">{inspection.managerName}</p>
                        <p className="text-[10px] font-mono text-blue-400">{inspection.confirmedDate}</p>
                    </div>
                 )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
