
import React, { useState, useRef, useEffect, useCallback } from 'react';
// Fixed: Added Loader2 to the import list
import { X, ChevronLeft, ChevronRight, PenTool, Eraser, Save, Maximize2, Move, Undo2, Check, ZoomIn, ZoomOut, Download, Loader2 } from 'lucide-react';

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
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ef4444'); 
  const [brushSize, setBrushSize] = useState(5);
  const [history, setHistory] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Khởi tạo Canvas khi vào chế độ chỉnh sửa
  const initCanvas = useCallback(() => {
    if (isEditing && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = images[currentIndex];
      
      img.onload = () => {
        // Tối ưu kích thước hiển thị theo màn hình
        const padding = window.innerWidth < 768 ? 20 : 60;
        const maxWidth = window.innerWidth - padding;
        const maxHeight = window.innerHeight * 0.75;
        
        let width = img.width;
        let height = img.height;

        const ratio = Math.min(maxWidth / width, maxHeight / height);
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        
        if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        
        setHistory([canvas.toDataURL('image/jpeg', 0.9)]);
        setIsDirty(false);
      };
    }
  }, [isEditing, currentIndex, images]);

  useEffect(() => {
    initCanvas();
  }, [initCanvas]);

  const saveToHistory = () => {
    if (canvasRef.current) {
      const state = canvasRef.current.toDataURL('image/jpeg', 0.9);
      setHistory(prev => [...prev, state].slice(-20));
      setIsDirty(true);
    }
  };

  const handleUndo = () => {
    if (history.length > 1 && canvasRef.current) {
      const newHistory = [...history];
      newHistory.pop(); 
      const prevState = newHistory[newHistory.length - 1];
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = prevState;
      img.onload = () => {
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        ctx?.drawImage(img, 0, 0);
        setHistory(newHistory);
        if (newHistory.length === 1) setIsDirty(false);
      };
    }
  };

  const handleCommitEdit = async () => {
    if (canvasRef.current && onSave && isDirty) {
      setIsProcessing(true);
      // Xuất ảnh chất lượng cao
      const updatedImage = canvasRef.current.toDataURL('image/jpeg', 0.85);
      await onSave(currentIndex, updatedImage);
      setIsProcessing(false);
    }
    setIsEditing(false);
    setIsDirty(false);
    setHistory([]);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.download = `AATN_QC_IMG_${currentIndex + 1}.jpg`;
    link.href = isEditing && canvasRef.current ? canvasRef.current.toDataURL('image/jpeg', 0.9) : images[currentIndex];
    link.click();
  };

  const handlePrev = () => {
    if (isDirty && !window.confirm("Bạn có thay đổi chưa lưu. Tiếp tục chuyển ảnh?")) return;
    setIsEditing(false);
    setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
    setZoom(1);
  };

  const handleNext = () => {
    if (isDirty && !window.confirm("Bạn có thay đổi chưa lưu. Tiếp tục chuyển ảnh?")) return;
    setIsEditing(false);
    setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
    setZoom(1);
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEditing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    if ('touches' in e) {
      if (e.touches.length > 1) return; // Cho phép pinch-zoom nếu cần, không vẽ
    }
    
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
    if (isDrawing) {
      setIsDrawing(false);
      saveToHistory();
    }
  };

  return (
    <div className="fixed inset-0 z-[500] bg-black flex flex-col animate-in fade-in duration-200 overflow-hidden">
      {/* Header Top Bar */}
      <div className="p-4 flex items-center justify-between text-white bg-slate-950 border-b border-white/10 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              if (isDirty) {
                if (window.confirm("Bạn có thay đổi chưa lưu. Lưu lại trước khi đóng?")) {
                  handleCommitEdit();
                  return;
                }
              }
              onClose();
            }} 
            className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-90"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="hidden sm:block">
            <h3 className="font-black text-sm uppercase tracking-tighter">
              {isEditing ? 'Đang ghi chú ảnh' : 'Xem chi tiết hình ảnh'}
            </h3>
            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Image {currentIndex + 1} of {images.length}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isEditing && (
            <button 
              onClick={handleDownload}
              className="p-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all"
              title="Tải ảnh về máy"
            >
              <Download className="w-5 h-5" />
            </button>
          )}

          {!readOnly && !isEditing && (
            <button 
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all active:scale-95"
            >
              <PenTool className="w-4 h-4" /> Vẽ ghi chú
            </button>
          )}

          {isEditing && (
            <div className="flex items-center gap-2">
              <button 
                onClick={handleUndo}
                disabled={history.length <= 1}
                className="p-2.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-xl transition-all"
                title="Hoàn tác"
              >
                <Undo2 className="w-5 h-5" />
              </button>
              <button 
                onClick={handleCommitEdit}
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Check className="w-4 h-4" />} 
                Lưu ghi chú
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 relative flex items-center justify-center p-2 bg-slate-900 overflow-hidden">
        {!isEditing ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className="relative group max-w-full max-h-full">
              <img 
                src={images[currentIndex]} 
                alt="Preview" 
                className="max-w-full max-h-full object-contain shadow-2xl transition-transform duration-300 pointer-events-none"
                style={{ transform: `scale(${zoom})` }}
              />
              {/* Zoom Controls Overlay */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-xl px-6 py-2 rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} className="p-1 text-white/60 hover:text-white"><ZoomOut className="w-5 h-5"/></button>
                  <span className="text-[10px] font-black text-white/80 min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom(z => Math.min(4, z + 0.5))} className="p-1 text-white/60 hover:text-white"><ZoomIn className="w-5 h-5"/></button>
              </div>
            </div>
            
            {images.length > 1 && (
              <>
                <button 
                  onClick={handlePrev} 
                  className="absolute left-4 p-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl backdrop-blur-md transition-all active:scale-90 border border-white/5 z-20"
                >
                  <ChevronLeft className="w-8 h-8" />
                </button>
                <button 
                  onClick={handleNext} 
                  className="absolute right-4 p-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl backdrop-blur-md transition-all active:scale-90 border border-white/5 z-20"
                >
                  <ChevronRight className="w-8 h-8" />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4 cursor-crosshair touch-none overflow-auto">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="shadow-2xl bg-white max-w-none origin-center"
              style={{ touchAction: 'none' }}
            />
          </div>
        )}
      </div>

      {/* Editor Controls Bottom Bar */}
      {isEditing ? (
        <div className="p-6 bg-slate-950 border-t border-white/10 flex flex-col items-center gap-6 shrink-0 z-50">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-4">
              <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.25em]">Màu bút</span>
              <div className="flex gap-3">
                {['#ef4444', '#22c55e', '#3b82f6', '#fcd34d', '#ffffff'].map(c => (
                  <button 
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-9 h-9 rounded-full border-4 transition-all ${color === c ? 'scale-110 border-white ring-4 ring-white/10' : 'border-transparent opacity-50 hover:opacity-100'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="hidden sm:block h-8 w-px bg-white/10"></div>
            <div className="flex items-center gap-4">
              <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.25em]">Cỡ nét</span>
              <input 
                type="range" min="2" max="30" 
                value={brushSize} 
                onChange={e => setBrushSize(parseInt(e.target.value))}
                className="w-32 h-1.5 bg-white/10 rounded-full appearance-none accent-blue-500 cursor-pointer"
              />
              <span className="text-[11px] font-black text-white/60 w-5">{brushSize}</span>
            </div>
          </div>
          <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest">Click hoặc Chạm để vẽ trực tiếp lên ảnh</p>
        </div>
      ) : (
        <div className="p-4 bg-slate-950 border-t border-white/5 flex items-center justify-center shrink-0 z-50">
            <div className="flex gap-2">
                {images.map((_, i) => (
                    <div 
                        key={i} 
                        onClick={() => setCurrentIndex(i)}
                        className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${i === currentIndex ? 'w-10 bg-blue-500' : 'w-2.5 bg-white/10 hover:bg-white/30'}`} 
                    />
                ))}
            </div>
        </div>
      )}
    </div>
  );
};
