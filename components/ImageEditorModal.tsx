
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, ChevronLeft, ChevronRight, PenTool, Undo2, 
  Check, ZoomIn, ZoomOut, Download, Loader2, 
  Move, AlertCircle, Maximize2, RotateCw, 
  RotateCcw, Sliders, Trash2
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
  
  // View Mode State
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const startPan = useRef({ x: 0, y: 0 });

  // Edit Mode State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ef4444'); 
  const [brushSize, setBrushSize] = useState(5);
  const [history, setHistory] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Loading & Error State
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- VIEW MODE LOGIC ---

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isEditing) {
        if (isLoadingImage || loadError) return;
        startDrawing(e);
    } else if (zoom > 1) {
        setIsPanning(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        startPan.current = { x: clientX - pan.x, y: clientY - pan.y };
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (isEditing) {
        if (isLoadingImage || loadError) return;
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
    if (isEditing) {
        stopDrawing();
    } else {
        setIsPanning(false);
    }
  };

  const handleRotate = (dir: 'cw' | 'ccw') => {
      setRotation(prev => prev + (dir === 'cw' ? 90 : -90));
  };

  // --- EDIT MODE LOGIC ---

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
            const container = canvas.parentElement;
            const maxWidth = (container?.clientWidth || window.innerWidth) - 40;
            const maxHeight = (container?.clientHeight || window.innerHeight) - 200; 
            
            let width = img.width;
            let height = img.height;

            const scaleFactor = Math.min(maxWidth / width, maxHeight / height);
            
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.max(width * scaleFactor, 100) * dpr;
            canvas.height = Math.max(height * scaleFactor, 100) * dpr;
            canvas.style.width = `${Math.max(width * scaleFactor, 100)}px`;
            canvas.style.height = `${Math.max(height * scaleFactor, 100)}px`;
            
            ctx.scale(dpr, dpr);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.drawImage(img, 0, 0, Math.max(width * scaleFactor, 100), Math.max(height * scaleFactor, 100));
            
            setHistory([canvas.toDataURL('image/jpeg', 0.8)]);
            setIsDirty(false);
        } catch (err: any) {
            setLoadError("Lỗi xử lý HD: " + (err.message || "Unknown error"));
        } finally {
            setIsLoadingImage(false);
        }
      };

      img.onerror = () => {
          setLoadError("Lỗi tải ảnh.");
          setIsLoadingImage(false);
      };

      img.src = images[currentIndex];
    }
  }, [isEditing, currentIndex, images]);

  useEffect(() => {
    initCanvas();
    if (isEditing) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setRotation(0);
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
          let quality = 0.8;
          let updatedImage = canvasRef.current.toDataURL('image/jpeg', quality);
          // ISO Limit: nén xuống dưới ~130KB nếu cần
          while (updatedImage.length > 150000 && quality > 0.1) {
            quality -= 0.1;
            updatedImage = canvasRef.current.toDataURL('image/jpeg', quality);
          }
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

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEditing || !canvasRef.current || isLoadingImage || loadError) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
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
    const x = clientX - rect.left;
    const y = clientY - rect.top;
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
      setZoom(1); setPan({x:0,y:0}); setRotation(0);
      setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const handlePrev = () => {
      setZoom(1); setPan({x:0,y:0}); setRotation(0);
      setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
  };

  return (
    <div className="absolute inset-0 z-[120] bg-[#0c1421] flex flex-col animate-in fade-in duration-300 overflow-hidden touch-none" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* HEADER: Clean & Professional Dark Style */}
      <div className="h-14 flex items-center justify-between px-4 text-white bg-[#0f172a]/80 backdrop-blur-md border-b border-white/5 shrink-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={() => { if (isDirty && window.confirm("Lưu thay đổi trước khi đóng?")) handleCommitEdit(); else onClose(); }} className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-90"><X className="w-5 h-5" /></button>
          <div className="h-6 w-px bg-white/10 mx-1"></div>
          <div>
            <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-white/90 leading-none">
                {isEditing ? 'ISO EDITOR MODE' : 'REVIEW HD MODE'}
            </h3>
            <p className="text-[8px] text-blue-400 font-bold uppercase tracking-widest mt-1.5">{currentIndex + 1} / {images.length} • HD RESOLUTION</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isEditing && (
              <div className="hidden sm:flex items-center bg-white/5 rounded-xl border border-white/10 mr-2 p-0.5">
                  <button onClick={() => handleRotate('ccw')} className="p-1.5 hover:bg-white/5 rounded-lg" title="Xoay trái"><RotateCcw className="w-4 h-4 opacity-60"/></button>
                  <button onClick={() => handleRotate('cw')} className="p-1.5 hover:bg-white/5 rounded-lg" title="Xoay phải"><RotateCw className="w-4 h-4 opacity-60"/></button>
              </div>
          )}
          
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
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px) rotate(${rotation}deg)`, 
                    cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' 
                }}
            >
              <img 
                src={images[currentIndex]} 
                alt="HD Preview" 
                className="max-w-[95vw] max-h-[85vh] object-contain shadow-[0_50px_100px_rgba(0,0,0,0.6)] rounded-sm" 
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
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-[#0f172a]/90 backdrop-blur-2xl px-8 py-3 rounded-full border border-white/10 z-40 shadow-2xl ring-1 ring-white/5">
                    <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} className="p-1.5 text-white/40 hover:text-white transition-colors active:scale-90"><ZoomOut className="w-5 h-5"/></button>
                    <div className="flex flex-col items-center min-w-[50px]">
                        <span className="text-[11px] font-black text-white leading-none">{Math.round(zoom * 100)}%</span>
                        <span className="text-[6px] font-black text-blue-400 uppercase tracking-widest mt-1">Scale</span>
                    </div>
                    <button onClick={() => setZoom(z => Math.min(8, z + 0.5))} className="p-1.5 text-white/40 hover:text-white transition-colors active:scale-90"><ZoomIn className="w-5 h-5"/></button>
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
                  <div className="relative group/canvas">
                      <canvas ref={canvasRef} className="shadow-[0_60px_150px_rgba(0,0,0,0.8)] bg-white cursor-crosshair touch-none rounded-sm border-4 border-white/5" />
                      <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover/canvas:opacity-100 transition-opacity bg-blue-600 text-white text-[8px] font-black px-4 py-1.5 rounded-full uppercase tracking-[0.2em] pointer-events-none shadow-xl border border-blue-400">
                          ISO HD EDIT LAYER ACTIVE
                      </div>
                  </div>
              )}
          </div>
        )}
      </div>

      {/* FOOTER: Professional Editing Tools */}
      {isEditing && !loadError && (
        <div className="p-8 bg-[#0f172a]/95 backdrop-blur-3xl border-t border-white/10 flex flex-col items-center gap-8 shrink-0 z-50 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center justify-between w-full max-w-2xl gap-10">
            <div className="flex gap-4 bg-white/5 p-2 rounded-[1.5rem] border border-white/5 shadow-inner">
                {['#ef4444', '#22c55e', '#3b82f6', '#fcd34d', '#ffffff', '#000000'].map(c => (
                    <button 
                        key={c} 
                        onClick={() => setColor(c)} 
                        className={`w-10 h-10 rounded-xl border-2 transition-all active:scale-90 ${color === c ? 'scale-110 border-white shadow-xl shadow-white/10' : 'border-transparent opacity-30 hover:opacity-100 hover:scale-105'}`} 
                        style={{ backgroundColor: c }} 
                    />
                ))}
            </div>
            
            <div className="w-px h-10 bg-white/10 hidden md:block"></div>
            
            <div className="flex items-center gap-6 flex-1">
              <div className="flex flex-col gap-1 shrink-0">
                  <span className="text-[9px] font-black text-white/30 uppercase tracking-widest leading-none">Brush Size</span>
                  <span className="text-[12px] font-mono font-black text-blue-400 text-center">{brushSize}px</span>
              </div>
              <input 
                type="range" min="2" max="40" 
                value={brushSize} 
                onChange={e => setBrushSize(parseInt(e.target.value))} 
                className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none accent-blue-500 cursor-pointer hover:bg-white/20 transition-all" 
              />
            </div>
          </div>
          
          <div className="flex gap-10 text-white/20 text-[9px] font-black uppercase tracking-[0.4em] select-none">
              <span className="flex items-center gap-2.5"><Move className="w-4 h-4 opacity-50"/> Touch to Draw</span>
              <span className="flex items-center gap-2.5"><Sliders className="w-4 h-4 opacity-50"/> Change size & color</span>
          </div>
        </div>
      )}
    </div>
  );
};
