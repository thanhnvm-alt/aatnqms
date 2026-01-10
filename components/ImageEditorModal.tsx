import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, PenTool, Undo2, Check, ZoomIn, ZoomOut, Download, Loader2, Move, AlertCircle } from 'lucide-react';

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

  // --- EDIT MODE LOGIC ---

  // Initialize Canvas with "HD" quality feel using Device Pixel Ratio
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
            const maxWidth = window.innerWidth - 20;
            const maxHeight = window.innerHeight - 180; 
            
            let width = img.width;
            let height = img.height;

            const scale = Math.min(maxWidth / width, maxHeight / height);
            
            // ISO HD Enhancement: Sử dụng window.devicePixelRatio để ảnh nét hơn trên mobile
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.max(width * scale, 100) * dpr;
            canvas.height = Math.max(height * scale, 100) * dpr;
            canvas.style.width = `${Math.max(width * scale, 100)}px`;
            canvas.style.height = `${Math.max(height * scale, 100)}px`;
            
            ctx.scale(dpr, dpr);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.drawImage(img, 0, 0, Math.max(width * scale, 100), Math.max(height * scale, 100));
            
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
    }
  }, [initCanvas, isEditing]);

  useEffect(() => {
      const handleResize = () => { if (isEditing) initCanvas(); };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, [isEditing, initCanvas]);

  const saveToHistory = () => {
    if (canvasRef.current && !isLoadingImage && !loadError) {
      const state = canvasRef.current.toDataURL('image/jpeg', 0.8);
      setHistory(prev => [...prev, state].slice(-10));
      setIsDirty(true);
    }
  };

  const handleUndo = () => {
    if (history.length > 1 && canvasRef.current && !isLoadingImage) {
      const newHistory = [...history];
      newHistory.pop();
      const prevState = newHistory[newHistory.length - 1];
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        ctx?.save();
        ctx?.setTransform(1, 0, 0, 1, 0, 0);
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        ctx?.restore();
        ctx?.drawImage(img, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
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
          // Export ảnh mới với logic nén ISO < 100KB
          let quality = 0.7;
          let updatedImage = canvasRef.current.toDataURL('image/jpeg', quality);
          while (updatedImage.length > 133333 && quality > 0.1) {
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

  const handleDownload = () => {
    const link = document.createElement('a');
    link.download = `AATN_HD_${Date.now()}.jpg`;
    link.href = images[currentIndex];
    link.click();
  };

  return (
    <div className="fixed inset-0 z-[500] bg-black flex flex-col animate-in fade-in duration-200 overflow-hidden touch-none">
      <div className="p-4 flex items-center justify-between text-white bg-slate-950 border-b border-white/10 shrink-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={() => { if (isDirty && window.confirm("Lưu thay đổi?")) handleCommitEdit(); else onClose(); }} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-6 h-6" /></button>
          <div className="hidden sm:block">
            <h3 className="font-bold text-sm uppercase tracking-tighter">{isEditing ? 'HĐ Chỉnh sửa ISO' : 'Review HD Mode'}</h3>
            <p className="text-[10px] text-white/40 font-bold uppercase">{currentIndex + 1} / {images.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && <button onClick={handleDownload} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl"><Download className="w-5 h-5" /></button>}
          {!readOnly && !isEditing && (
            <button onClick={() => setIsEditing(true)} disabled={!!loadError} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase shadow-lg disabled:opacity-50">
              <PenTool className="w-4 h-4" /> <span className="hidden sm:inline">Sửa ảnh</span>
            </button>
          )}
          {isEditing && (
            <div className="flex items-center gap-2">
              <button onClick={handleUndo} disabled={history.length <= 1 || isLoadingImage} className="p-2.5 bg-white/10 rounded-xl"><Undo2 className="w-5 h-5" /></button>
              <button onClick={handleCommitEdit} disabled={isProcessing || isLoadingImage || !!loadError} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-black uppercase shadow-lg">
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Check className="w-4 h-4" />} <span className="hidden sm:inline">Lưu ISO</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 relative flex items-center justify-center bg-slate-900 overflow-hidden select-none" onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp} onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}>
        {!isEditing ? (
          <>
            <div className="relative transition-transform duration-75 ease-linear" style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}>
              <img src={images[currentIndex]} alt="HD Preview" className="max-w-full max-h-[80vh] object-contain shadow-2xl" style={{ imageRendering: 'high-quality' }} onError={() => setLoadError("Lỗi tải HD.")}/>
              {loadError && <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400"><AlertCircle className="w-12 h-12 mb-2" /><p className="font-bold bg-black/50 px-4 py-2 rounded-xl">{loadError}</p></div>}
            </div>
            {!loadError && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-black/60 backdrop-blur-xl px-6 py-2.5 rounded-full border border-white/10 z-20">
                    <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} className="p-1 text-white/70 active:scale-90"><ZoomOut className="w-6 h-6"/></button>
                    <span className="text-xs font-black text-white">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(z => Math.min(4, z + 0.5))} className="p-1 text-white/70 active:scale-90"><ZoomIn className="w-6 h-6"/></button>
                </div>
            )}
            {images.length > 1 && (
              <>
                <button onClick={() => { setZoom(1); setPan({x:0,y:0}); setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1)); }} className="absolute left-4 p-3 bg-white/5 rounded-full backdrop-blur-md z-20"><ChevronLeft className="w-8 h-8 text-white" /></button>
                <button onClick={() => { setZoom(1); setPan({x:0,y:0}); setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1)); }} className="absolute right-4 p-3 bg-white/5 rounded-full backdrop-blur-md z-20"><ChevronRight className="w-8 h-8 text-white" /></button>
              </>
            )}
          </>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
              {isLoadingImage && <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm"><Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-2" /><p className="text-white text-xs font-bold uppercase">Preparing HD Canvas...</p></div>}
              {loadError ? <div className="text-red-400 p-4 text-center"><AlertCircle className="w-12 h-12 mb-3" /><p className="font-bold text-sm">{loadError}</p></div> : <canvas ref={canvasRef} className="shadow-2xl bg-white cursor-crosshair touch-none" />}
          </div>
        )}
      </div>
      {isEditing && !loadError && (
        <div className="p-4 bg-slate-950 border-t border-white/10 flex flex-col items-center gap-4 shrink-0 z-50 pb-8 md:pb-4">
          <div className="flex items-center justify-between w-full max-w-md gap-4">
            <div className="flex gap-3">
                {['#ef4444', '#22c55e', '#3b82f6', '#fcd34d', '#ffffff', '#000000'].map(c => <button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'scale-110 border-white' : 'border-transparent opacity-60'}`} style={{ backgroundColor: c }} />)}
            </div>
            <div className="w-px h-8 bg-white/10"></div>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-[10px] font-black text-white/40 uppercase">Size</span>
              <input type="range" min="2" max="20" value={brushSize} onChange={e => setBrushSize(parseInt(e.target.value))} className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none accent-blue-500" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
