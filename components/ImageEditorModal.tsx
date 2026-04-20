
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProxyImageUrl } from '../src/utils';
import { 
  X, ChevronLeft, ChevronRight, PenTool, Undo2, 
  Check, ZoomIn, ZoomOut, Download, Loader2, 
  Move, AlertCircle, Maximize2, RotateCw, 
  RotateCcw, Sliders, Trash2, Type,
  MessageSquare, History, Palette, Layers
} from 'lucide-react';

interface ImageEditorModalProps {
  images: string[];
  initialIndex: number;
  onSave?: (index: number, updatedImage: string) => void;
  onClose: () => void;
  readOnly?: boolean;
}

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({ 
  images, 
  initialIndex, 
  onSave, 
  onClose, 
  readOnly = false 
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isEditing, setIsEditing] = useState(false);
  const [mode, setMode] = useState<'draw' | 'text' | 'pan'>('draw');
  
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [initialDistance, setInitialDistance] = useState<number | null>(null);
  const [initialZoom, setInitialZoom] = useState<number>(1);
  const startPan = useRef({ x: 0, y: 0 });
  
  // Edit Mode State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ef4444'); 
  const [brushSize, setBrushSize] = useState(5);
  const [history, setHistory] = useState<string[]>([]);
  const lastTap = useRef<number>(0);
  const [isDirty, setIsDirty] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeText, setActiveText] = useState<{ x: number, y: number, logicX: number, logicY: number, value: string } | null>(null);
  const [showQuickLibrary, setShowQuickLibrary] = useState(false);
  
  const quickTexts = [
      "LỖI BỀ MẶT - SURFACE DEFECT",
      "KÍCH THƯỚC SAI - WRONG DIMENSION",
      "THIẾU CHI TIẾT - MISSING PARTS",
      "MÓP MÉO - DEFORMATION",
      "SAI MÀU SẮC - COLOR MISMATCH",
      "CẦN SỬA CHỮA - REPAIR NEEDED",
      "ĐÃ KIỂM TRA - CHECKED",
      "KHÔNG ĐẠT - NG"
  ];
  
  // Loading & Error State
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- VIEW MODE LOGIC ---

  const getDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    return Math.sqrt(
      Math.pow(touches[0].clientX - touches[1].clientX, 2) +
      Math.pow(touches[0].clientY - touches[1].clientY, 2)
    );
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length === 2) {
        setIsPanning(false);
        setInitialDistance(getDistance(e.touches));
        setInitialZoom(zoom);
        return;
    }

    if (isEditing) {
        if (isLoadingImage || loadError) return;
        
        if (mode === 'pan') {
          setIsPanning(true);
          const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
          startPan.current = { x: clientX - pan.x, y: clientY - pan.y };
          return;
        }

        if (mode === 'text') {
            handleTextClick(e);
        } else {
            startDrawing(e);
        }
    } else if (zoom > 1) {
        setIsPanning(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        startPan.current = { x: clientX - pan.x, y: clientY - pan.y };
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length === 2 && initialDistance !== null) {
        const dist = getDistance(e.touches);
        if (dist > 0) {
            const scale = dist / initialDistance;
            const newZoom = Math.min(8, Math.max(1, initialZoom * scale));
            setZoom(newZoom);
            // If we zoom back to 1, reset pan
            if (newZoom <= 1.01) setPan({ x: 0, y: 0 });
        }
        return;
    }

    if (isEditing) {
        if (isLoadingImage || loadError) return;

        if (isPanning && zoom > 1) {
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
            setPan({
                x: clientX - startPan.current.x,
                y: clientY - startPan.current.y
            });
            return;
        }

        if (mode === 'text') return;
        draw(e);
    } else if (isPanning && zoom > 1) {
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        setPan({
            x: clientX - startPan.current.x,
            y: clientY - startPan.current.y
        });
    }
  };

  const handlePointerUp = () => {
    setInitialDistance(null);
    
    // Double tap to zoom
    const now = Date.now();
    if (now - lastTap.current < 300 && !isEditing) {
      if (zoom > 1) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      } else {
        setZoom(2.5);
      }
    }
    lastTap.current = now;

    if (isEditing) {
        if (isPanning) setIsPanning(false);
        else if (mode === 'draw') stopDrawing();
    } else {
        setIsPanning(false);
    }
  };

  const initCanvas = useCallback(() => {
    if (isEditing && canvasRef.current) {
      setLoadError(null);
      setIsLoadingImage(true);

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      if (!ctx) {
          setLoadError("Không thể khởi tạo bộ xử lý hình ảnh.");
          setIsLoadingImage(false);
          return;
      }

      const img = new Image();
      img.crossOrigin = "anonymous"; 
      
      img.onload = () => {
        try {
            const canvas = canvasRef.current;
            if (!canvas) return;
            
            const dpr = window.devicePixelRatio || 1;
            // Use original image dimensions
            canvas.width = img.width * dpr;
            canvas.height = img.height * dpr;
            canvas.style.width = `${img.width}px`;
            canvas.style.height = `${img.height}px`;
            
            ctx.scale(dpr, dpr);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.drawImage(img, 0, 0);
            
            setHistory([canvas.toDataURL('image/jpeg', 1.0)]); // Use 1.0 quality for no compression
            setIsDirty(false);
        } catch (err: any) {
            setLoadError("Lỗi xử lý HD: " + (err.message || "Unknown error"));
        } finally {
            setIsLoadingImage(false);
        }
      };

      img.onerror = (e) => {
          console.error("Lỗi tải ảnh:", e, "Source:", img.src);
          setLoadError("Lỗi tải ảnh: không thể truy cập tài nguyên.");
          setIsLoadingImage(false);
      };

      // Use proxy to bypass CORS and Authentication issues
      const imageUrl = images[currentIndex];
      img.src = getProxyImageUrl(imageUrl);
    }
  }, [isEditing, currentIndex, images]);

  useEffect(() => {
    initCanvas();
    if (isEditing) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }
  }, [initCanvas, isEditing]);

  const handleUndo = () => {
    if (history.length > 1 && canvasRef.current && !isLoadingImage) {
      const newHistory = [...history];
      newHistory.pop();
      const prevState = newHistory[newHistory.length - 1];
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        ctx?.save();
        ctx?.setTransform(1, 0, 0, 1, 0, 0);
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        ctx?.restore();
        ctx?.drawImage(img, 0, 0, canvas.width / dpr, canvas.height / dpr);
        setHistory(newHistory);
        if (newHistory.length === 1) setIsDirty(false);
      };
      img.src = prevState;
    }
  };

  const handleCommitEdit = async () => {
    if (canvasRef.current && onSave && isDirty && !loadError) {
      try {
          setIsProcessing(true);
          // Do not compress the image aggressively, keep high quality
          const updatedImage = canvasRef.current.toDataURL('image/jpeg', 0.95);
          await onSave(currentIndex, updatedImage);
          setIsEditing(false);
          setIsDirty(false);
          setHistory([]);
      } catch (error: any) {
          alert("Lỗi lưu ảnh: " + error.message);
      } finally {
          setIsProcessing(false);
      }
    } else {
        setIsEditing(false);
    }
  };

  const handleTextClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEditing || !canvasRef.current || isLoadingImage || loadError || activeText) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const dpr = window.devicePixelRatio || 1;
    const logicX = (clientX - rect.left) * ((canvas.width / dpr) / rect.width);
    const logicY = (clientY - rect.top) * ((canvas.height / dpr) / rect.height);

    setActiveText({
      x: clientX,
      y: clientY,
      logicX,
      logicY,
      value: ''
    });
  };

  const commitTextToCanvas = (textValue: string) => {
    if (!activeText || !textValue.trim() || !canvasRef.current) {
        setActiveText(null);
        return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    ctx.font = `bold ${brushSize * 4}px Inter, sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(textValue, activeText.logicX, activeText.logicY);
    saveToHistory();
    setActiveText(null);
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEditing || !canvasRef.current || isLoadingImage || loadError) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const dpr = window.devicePixelRatio || 1;
    const x = (clientX - rect.left) * ( (canvas.width / dpr) / rect.width);
    const y = (clientY - rect.top) * ( (canvas.height / dpr) / rect.height);
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const dpr = window.devicePixelRatio || 1;
    const x = (clientX - rect.left) * ( (canvas.width / dpr) / rect.width);
    const y = (clientY - rect.top) * ( (canvas.height / dpr) / rect.height);
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => { if (isDrawing) { setIsDrawing(false); saveToHistory(); } };

  const saveToHistory = () => {
    if (canvasRef.current && !isLoadingImage && !loadError) {
      const state = canvasRef.current.toDataURL('image/jpeg', 0.8);
      setHistory(prev => [...prev, state].slice(-10));
      setIsDirty(true);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.download = `AATN_HD_ISO_${Date.now()}.jpg`;
    link.href = images[currentIndex];
    link.click();
  };

  const handleNext = () => {
      setZoom(1); setPan({x:0,y:0});
      setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const handlePrev = () => {
      setZoom(1); setPan({x:0,y:0});
      setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
  };

  return (
    <div className="fixed inset-0 z-[120] bg-[#0c1421] flex flex-col animate-in fade-in duration-300 overflow-hidden touch-none" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* HEADER: Clean & Professional Dark Style */}
      <div className="h-14 pt-[env(safe-area-inset-top)] flex items-center justify-between px-4 text-white bg-[#0f172a]/80 backdrop-blur-md border-b border-white/5 shrink-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={() => { if (isDirty && window.confirm("Lưu thay đổi trước khi đóng?")) handleCommitEdit(); else onClose(); }} className="p-3 hover:bg-white/10 rounded-full transition-all active:scale-90"><X className="w-6 h-6" /></button>
          <div className="h-6 w-px bg-white/10 mx-1"></div>
          <div>
            <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-white/90 leading-none">
                {isEditing ? 'ISO EDITOR MODE' : 'REVIEW HD MODE'}
            </h3>
            <p className="text-[8px] text-blue-400 font-bold uppercase tracking-widest mt-1.5">{currentIndex + 1} / {images.length} • HD RESOLUTION</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          
          {!isEditing && <button onClick={handleDownload} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5" title="Tải xuống HD"><Download className="w-4 h-4 opacity-70" /></button>}
          
          {!readOnly && !isEditing && (
            <button onClick={() => setIsEditing(true)} disabled={!!loadError} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50 transition-all border border-blue-500">
              <PenTool className="w-3.5 h-3.5" /> <span className="hidden sm:inline">CHỈNH SỬA ISO</span>
            </button>
          )}
          
          {isEditing && (
            <div className="flex items-center gap-2 animate-in slide-in-from-right-4">
              <button onClick={handleUndo} disabled={history.length <= 1 || isLoadingImage} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl active:scale-90 transition-all border border-white/10"><Undo2 className="w-4 h-4" /></button>
              <button onClick={handleCommitEdit} disabled={isProcessing || isLoadingImage || !!loadError} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase shadow-lg shadow-emerald-500/20 active:scale-95 border border-emerald-500">
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Check className="w-4 h-4" />} <span className="hidden sm:inline">LƯU THAY ĐỔI</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* VIEWPORT: Integrated Centered Display */}
      <div 
        className="flex-1 relative flex items-center justify-center bg-[#0c1421] overflow-hidden select-none" 
        onMouseDown={handlePointerDown} 
        onMouseMove={handlePointerMove} 
        onMouseUp={handlePointerUp} 
        onMouseLeave={handlePointerUp} 
        onTouchStart={handlePointerDown} 
        onTouchMove={handlePointerMove} 
        onTouchEnd={handlePointerUp}
      >
        {!isEditing ? (
          <>
            <div 
                className="relative transition-transform duration-75 ease-out" 
                style={{ 
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, 
                    cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' 
                }}
            >
              <img 
                src={getProxyImageUrl(images[currentIndex])} 
                alt="HD Preview" 
                className="max-w-[98vw] max-h-[98%] object-contain shadow-[0_50px_100px_rgba(0,0,0,0.6)] rounded-sm" 
                style={{ imageRendering: 'auto' }} 
                onError={() => setLoadError("Lỗi tải tệp tin HD.")}
              />
              {loadError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 bg-slate-900/80 rounded-xl border border-red-500/20">
                      <AlertCircle className="w-12 h-12 mb-3 opacity-50" />
                      <p className="font-black uppercase text-[10px] tracking-widest">{loadError}</p>
                  </div>
              )}
            </div>

            {/* Floating Navigation Controls */}
            {images.length > 1 && (
              <>
                <button onClick={handlePrev} className="absolute left-6 w-14 h-14 bg-white/5 hover:bg-white/10 rounded-full backdrop-blur-xl z-40 transition-all border border-white/5 active:scale-90 flex items-center justify-center shadow-2xl group"><ChevronLeft className="w-8 h-8 text-white/40 group-hover:text-white transition-colors" /></button>
                <button onClick={handleNext} className="absolute right-6 w-14 h-14 bg-white/5 hover:bg-white/10 rounded-full backdrop-blur-xl z-40 transition-all border border-white/5 active:scale-90 flex items-center justify-center shadow-2xl group"><ChevronRight className="w-8 h-8 text-white/40 group-hover:text-white transition-colors" /></button>
              </>
            )}

            {/* Bottom Floating Stats / Zoom */}
            {!loadError && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-[#0f172a]/95 backdrop-blur-2xl px-6 py-3 rounded-full border border-white/10 z-40 shadow-2xl ring-1 ring-white/5 animate-in slide-in-from-bottom-4">
                    <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} className="p-2 text-white/40 hover:text-white transition-colors active:scale-90"><ZoomOut className="w-5 h-5"/></button>
                    <button 
                        onClick={() => { setZoom(1); setPan({x:0,y:0}); }}
                        className="flex flex-col items-center min-w-[60px] hover:bg-white/5 px-2 py-1 rounded-xl transition-colors"
                    >
                        <span className="text-[12px] font-black text-white leading-none">{Math.round(zoom * 100)}%</span>
                        <span className="text-[6px] font-black text-blue-400 uppercase tracking-widest mt-1">Reset</span>
                    </button>
                    <button onClick={() => setZoom(z => Math.min(8, z + 0.5))} className="p-2 text-white/40 hover:text-white transition-colors active:scale-90"><ZoomIn className="w-5 h-5"/></button>
                </div>
            )}
          </>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center p-6">
              {isLoadingImage && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0c1421]/90 backdrop-blur-md">
                      <div className="relative w-16 h-16 mb-6">
                          <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
                          <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                      <p className="text-white text-[10px] font-black uppercase tracking-[0.4em]">Initializing HD Canvas...</p>
                  </div>
              )}
              {loadError ? (
                  <div className="text-red-400 p-10 text-center bg-slate-900 rounded-[2.5rem] border border-red-900/40 shadow-2xl max-w-sm">
                      <AlertCircle className="w-14 h-14 mb-5 mx-auto" />
                      <p className="font-black uppercase text-xs tracking-widest">{loadError}</p>
                      <button onClick={onClose} className="mt-8 px-8 py-3 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest">THOÁT CHẾ ĐỘ EDITOR</button>
                  </div>
              ) : (
                  <div className="relative group/canvas overflow-hidden" ref={canvasContainerRef}>
                      <canvas 
                        ref={canvasRef} 
                        className="shadow-[0_60px_150px_rgba(0,0,0,0.8)] bg-white cursor-crosshair touch-none rounded-sm border-4 border-white/5 max-w-[95vw] max-h-[70vh] w-auto h-auto object-contain"
                        style={{
                            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                            transformOrigin: 'center',
                            transition: isPanning ? 'none' : 'transform 100ms ease-out',
                            cursor: mode === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair'
                        }}
                      />
                      <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover/canvas:opacity-100 transition-opacity bg-blue-600 text-white text-[8px] font-black px-4 py-1.5 rounded-full uppercase tracking-[0.2em] pointer-events-none shadow-xl border border-blue-400">
                          ISO HD EDIT LAYER ACTIVE
                      </div>

                      {/* Floating Text Input */}
                      <AnimatePresence>
                        {activeText && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                className="fixed z-[200] pointer-events-auto"
                                style={{ left: activeText.x, top: activeText.y }}
                            >
                                <div className="bg-[#0f172a] p-3 rounded-2xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl flex flex-col gap-2 min-w-[200px]">
                                    <div className="flex items-center justify-between text-[10px] font-black uppercase text-blue-400 tracking-widest px-1">
                                        <span>Typing Annotation</span>
                                        <button onClick={() => setActiveText(null)}><X className="w-4 p-0.5" /></button>
                                    </div>
                                    <input 
                                        autoFocus
                                        className="w-full bg-white/10 text-white px-3 py-2 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                                        value={activeText.value}
                                        onChange={e => setActiveText({ ...activeText, value: e.target.value })}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') commitTextToCanvas(activeText.value);
                                            if (e.key === 'Escape') setActiveText(null);
                                        }}
                                        placeholder="Nhập nội dung..."
                                    />
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => commitTextToCanvas(activeText.value)}
                                            className="flex-1 py-2 bg-blue-600 text-white text-[9px] font-black uppercase rounded-lg shadow-lg"
                                        >
                                            Chèn
                                        </button>
                                        <button 
                                            onClick={() => setShowQuickLibrary(!showQuickLibrary)}
                                            className="p-2 bg-white/5 text-white/50 hover:text-white rounded-lg"
                                            title="Thư viện chữ mẫu"
                                        >
                                            <MessageSquare className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {showQuickLibrary && (
                                        <div className="mt-2 flex flex-col gap-1 max-h-[150px] overflow-y-auto no-scrollbar border-t border-white/5 pt-2">
                                            {quickTexts.map(t => (
                                                <button 
                                                    key={t}
                                                    onClick={() => commitTextToCanvas(t)}
                                                    className="text-left px-2.5 py-2 text-[8px] font-bold text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors uppercase truncate"
                                                >
                                                    {t}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                      </AnimatePresence>
                  </div>
              )}
          </div>
        )}
      </div>

      {/* FOOTER: Professional Editing Tools - Optimized for Mobile Interaction */}
      {isEditing && !loadError && (
        <div className="p-4 md:p-8 bg-[#0f172a]/95 backdrop-blur-3xl border-t border-white/10 shrink-0 z-50 animate-in slide-in-from-bottom duration-300">
          <div className="max-w-5xl mx-auto flex flex-col gap-6">
            
            {/* Tool Groups Bar: Scrollable on Small Screens */}
            <div className="w-full overflow-x-auto no-scrollbar pb-1">
              <div className="flex items-center justify-start md:justify-between min-w-max md:min-w-0 gap-4 md:gap-8">
                
                {/* 1. Mode Selector */}
                <div className="group/tools">
                  <div className="flex gap-1.5 bg-white/5 p-1.5 rounded-[1.25rem] border border-white/5 shadow-inner">
                      <button onClick={() => setMode('draw')} className={`p-2.5 rounded-xl transition-all ${mode === 'draw' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-white/40 hover:bg-white/10 hover:text-white'}`} title="Vẽ tay"><PenTool className="w-4.5 h-4.5" /></button>
                      <button onClick={() => setMode('text')} className={`p-2.5 rounded-xl transition-all ${mode === 'text' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-white/40 hover:bg-white/10 hover:text-white'}`} title="Chèn chữ"><Type className="w-4.5 h-4.5" /></button>
                      <button onClick={() => setMode('pan')} className={`p-2.5 rounded-xl transition-all ${mode === 'pan' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-white/40 hover:bg-white/10 hover:text-white'}`} title="Di chuyển"><Move className="w-4.5 h-4.5" /></button>
                  </div>
                </div>

                <div className="w-px h-8 bg-white/10"></div>

                {/* 2. Color Palette */}
                <div className="group/colors">
                  <div className="flex gap-2.5 bg-white/5 p-1.5 rounded-[1.25rem] border border-white/5 shadow-inner">
                      {['#ef4444', '#22c55e', '#3b82f6', '#fcd34d', '#ffffff', '#000000'].map(c => (
                          <button 
                              key={c} 
                              onClick={() => setColor(c)} 
                              className={`w-7 h-7 rounded-lg border-2 transition-all active:scale-90 ${color === c ? 'scale-110 border-white shadow-lg' : 'border-transparent opacity-30 hover:opacity-100 hover:scale-105'}`} 
                              style={{ backgroundColor: c }} 
                          />
                      ))}
                  </div>
                </div>

                <div className="w-px h-8 bg-white/10"></div>

                {/* 3. Controls & Size */}
                <div className="flex items-center gap-6 flex-1 bg-white/5 p-2 rounded-[1.25rem] border border-white/5 min-w-[240px]">
                  <div className="flex items-center gap-2 px-1">
                      <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} className="p-2 text-white/30 hover:text-blue-400 transition-colors"><ZoomOut className="w-4 h-4"/></button>
                      <button onClick={() => { setZoom(1); setPan({x:0,y:0}); }} className="text-[10px] font-black text-white px-2 w-12 text-center bg-white/5 rounded-lg py-1">{Math.round(zoom * 100)}%</button>
                      <button onClick={() => setZoom(z => Math.min(8, z + 0.5))} className="p-2 text-white/30 hover:text-blue-400 transition-colors"><ZoomIn className="w-4 h-4"/></button>
                  </div>
                  
                  <div className="w-px h-6 bg-white/10"></div>

                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex flex-col gap-0.5 shrink-0">
                        <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em] leading-none">Size</span>
                        <span className="text-[10px] font-mono font-black text-blue-400">{brushSize}px</span>
                    </div>
                    <input 
                      type="range" min="2" max="40" 
                      value={brushSize} 
                      onChange={e => setBrushSize(parseInt(e.target.value))} 
                      className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none accent-blue-500 cursor-pointer overflow-hidden" 
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Status Info */}
            <div className="flex items-center justify-between text-white/30 text-[9px] font-black uppercase tracking-[0.3em] select-none border-t border-white/5 pt-4">
              <div className="flex gap-6">
                <span className="flex items-center gap-2"><History className="w-3 h-3 text-blue-500/50" /> {history.length - 1} States Saved</span>
                <span className="flex items-center gap-2"><Palette className="w-3 h-3 text-emerald-500/50" /> {color} Active</span>
              </div>
              <div className="flex gap-4">
                <span>{mode === 'draw' ? 'Touch to Draw' : mode === 'text' ? 'Click image to type' : 'Pinch to zoom / Drag to pan'}</span>
                <span className="text-white/60 text-blue-400">100% Quality Output</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
