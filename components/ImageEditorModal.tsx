
import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, PenTool, Eraser, RotateCcw, Save, Maximize2, Move, Undo2, Check } from 'lucide-react';

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

  // Initialize canvas when entering edit mode
  useEffect(() => {
    if (isEditing && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = images[currentIndex];
      img.onload = () => {
        const containerWidth = window.innerWidth * 0.95;
        const containerHeight = window.innerHeight * 0.7;
        
        let width = img.width;
        let height = img.height;

        const ratio = Math.min(containerWidth / width, containerHeight / height);
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Save initial state to history
        setHistory([canvas.toDataURL()]);
        setIsDirty(false);
      };
    }
  }, [isEditing, currentIndex, images]);

  const saveToHistory = () => {
    if (canvasRef.current) {
      const state = canvasRef.current.toDataURL();
      setHistory(prev => [...prev, state].slice(-20)); // Keep last 20 steps
      setIsDirty(true);
    }
  };

  const handleUndo = () => {
    if (history.length > 1 && canvasRef.current) {
      const newHistory = [...history];
      newHistory.pop(); // Remove current state
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

  const handleCommitEdit = () => {
    if (canvasRef.current && onSave && isDirty) {
      const updatedImage = canvasRef.current.toDataURL('image/jpeg', 0.8);
      onSave(currentIndex, updatedImage);
    }
    setIsEditing(false);
    setIsDirty(false);
    setHistory([]);
  };

  const handlePrev = () => {
    if (isDirty) handleCommitEdit();
    setIsEditing(false);
    setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    if (isDirty) handleCommitEdit();
    setIsEditing(false);
    setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
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
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    if ('touches' in e) e.preventDefault();
    
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
    <div className="fixed inset-0 z-[300] bg-black flex flex-col animate-in fade-in duration-200 overflow-hidden">
      {/* Dynamic Header */}
      <div className="p-4 flex items-center justify-between text-white bg-slate-900/80 backdrop-blur-md border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              if (isDirty) {
                if (window.confirm("Bạn có thay đổi chưa lưu. Lưu lại trước khi đóng?")) {
                  handleCommitEdit();
                }
              }
              onClose();
            }} 
            className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-90"
          >
            <X className="w-6 h-6" />
          </button>
          <div>
            <h3 className="font-black text-sm uppercase tracking-tighter">
              {isEditing ? 'Đang ghi chú ảnh' : 'Xem chi tiết hình ảnh'}
            </h3>
            <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest">Ảnh {currentIndex + 1} / {images.length}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!readOnly && !isEditing && (
            <button 
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all active:scale-95"
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
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-500/20 transition-all active:scale-95"
              >
                <Check className="w-4 h-4" /> Hoàn tất
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 relative flex items-center justify-center p-2 bg-slate-950">
        {!isEditing ? (
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
            <img 
              src={images[currentIndex]} 
              alt="Preview" 
              className="max-w-full max-h-full object-contain shadow-2xl transition-transform duration-300 pointer-events-none"
              style={{ transform: `scale(${zoom})` }}
            />
            
            {images.length > 1 && (
              <>
                <button onClick={handlePrev} className="absolute left-4 p-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl backdrop-blur-md transition-all active:scale-90 border border-white/5 z-20 shadow-xl">
                  <ChevronLeft className="w-8 h-8" />
                </button>
                <button onClick={handleNext} className="absolute right-4 p-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl backdrop-blur-md transition-all active:scale-90 border border-white/5 z-20 shadow-xl">
                  <ChevronRight className="w-8 h-8" />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center overflow-auto p-4 cursor-crosshair touch-none">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="shadow-2xl bg-white max-w-full max-h-full"
            />
          </div>
        )}
      </div>

      {/* Toolbar / Footer */}
      <div className="p-6 bg-slate-900 border-t border-white/5 flex flex-col items-center gap-4 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        {isEditing ? (
          <div className="flex items-center gap-8 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Màu bút</span>
              <div className="flex gap-3">
                {['#ef4444', '#22c55e', '#3b82f6', '#fcd34d', '#ffffff'].map(c => (
                  <button 
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-10 h-10 rounded-full border-4 transition-all ${color === c ? 'scale-110 border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'border-transparent opacity-60'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="h-10 w-px bg-white/10"></div>
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Cỡ nét</span>
              <input 
                type="range" min="2" max="25" 
                value={brushSize} 
                onChange={e => setBrushSize(parseInt(e.target.value))}
                className="w-32 h-1.5 bg-white/20 rounded-full appearance-none accent-blue-500 cursor-pointer"
              />
              <span className="text-xs font-mono text-white/60 w-4">{brushSize}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-6 text-white/40">
            <div className="flex gap-2">
              {images.map((_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === currentIndex ? 'w-8 bg-blue-500' : 'w-3 bg-white/10'}`} />
              ))}
            </div>
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] ml-4 bg-white/5 px-4 py-2 rounded-full border border-white/5">
              <Move className="w-3.5 h-3.5 text-blue-500" />
              <span>Vuốt hoặc dùng mũi tên để chuyển</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
