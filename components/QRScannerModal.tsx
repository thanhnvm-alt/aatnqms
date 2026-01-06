
import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Image as ImageIcon, Loader2, Sparkles, AlertCircle } from 'lucide-react';
// @ts-ignore
import jsQR from 'jsqr';

interface QRScannerModalProps {
  onScan: (data: string) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({ 
  onScan, 
  onClose, 
  title = "Quét mã QR / Barcode",
  subtitle = "Di chuyển camera đến mã trên sản phẩm hoặc tải ảnh lên"
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<number>(0);

  // Camera Scanning Logic
  useEffect(() => {
    let stream: MediaStream | null = null;
    
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.play();
          requestRef.current = requestAnimationFrame(tick);
        }
      } catch (err) {
        setError("Không thể truy cập Camera. Vui lòng kiểm tra quyền ứng dụng.");
      }
    };

    const tick = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (canvas) {
          canvas.height = video.videoHeight;
          canvas.width = video.videoWidth;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });
            if (code && code.data) {
              onScan(code.data.trim());
              return; // Stop animation loop
            }
          }
        }
      }
      requestRef.current = requestAnimationFrame(tick);
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [onScan]);

  // File Scanning Logic
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code && code.data) {
          onScan(code.data.trim());
        } else {
          setError("Không tìm thấy mã QR trong hình ảnh này.");
        }
        setIsProcessingFile(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
      <button 
        onClick={onClose} 
        className="absolute top-6 right-6 text-white p-3 bg-white/10 rounded-full active:scale-90 transition-transform z-50"
      >
        <X className="w-8 h-8"/>
      </button>

      <div className="text-center mb-8 max-w-xs">
        <h3 className="text-white font-black text-xl uppercase tracking-widest mb-2">{title}</h3>
        <p className="text-slate-400 text-xs font-medium leading-relaxed">{subtitle}</p>
      </div>

      <div className="w-full max-w-sm aspect-square bg-slate-800 rounded-[3rem] overflow-hidden relative border-4 border-blue-500/50 shadow-[0_0_60px_rgba(37,99,235,0.3)]">
        {/* Scanning Animation */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_15px_red] animate-[bounce_2s_infinite]"></div>
          {/* Corner Decorations */}
          <div className="absolute top-8 left-8 w-12 h-12 border-t-4 border-l-4 border-blue-500 rounded-tl-xl opacity-60"></div>
          <div className="absolute top-8 right-8 w-12 h-12 border-t-4 border-r-4 border-blue-500 rounded-tr-xl opacity-60"></div>
          <div className="absolute bottom-8 left-8 w-12 h-12 border-b-4 border-l-4 border-blue-500 rounded-bl-xl opacity-60"></div>
          <div className="absolute bottom-8 right-8 w-12 h-12 border-b-4 border-r-4 border-blue-500 rounded-br-xl opacity-60"></div>
        </div>

        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />

        {isProcessingFile && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-20">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
            <span className="text-white text-[10px] font-black uppercase tracking-widest">Đang xử lý ảnh...</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-6 px-6 py-3 bg-red-500/20 border border-red-500/50 rounded-2xl flex items-center gap-3 text-red-400 text-xs font-bold animate-in slide-in-from-top-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-10 flex flex-col items-center gap-4 w-full max-w-xs">
        <p className="text-blue-400 font-black text-[10px] uppercase tracking-[0.3em] animate-pulse">Scanning Live...</p>
        
        <div className="h-px w-full bg-white/10 my-2"></div>
        
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-3 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl border border-white/10 transition-all active:scale-95 group"
        >
          <ImageIcon className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-black uppercase tracking-widest">Chọn ảnh từ thiết bị</span>
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleFileChange} 
        />
      </div>
    </div>
  );
};
